mod resolve;
mod styles;

use anyhow::{Context, Result};
use resolve::{ModuleResolver, Resolution};
use spatial_code_core::{CODE_EXTENSIONS, SourceFile, is_code_path, is_style_path};
use spatial_code_graph::{GraphEdge, GraphEdgeKind, GraphNode, GraphNodeKind, ProgramGraph};
use std::collections::{HashMap, HashSet};
#[cfg(test)]
use std::path::PathBuf;
use tree_sitter::{InputEdit, Node, Parser, Point, Tree};

/// Calls that wrap a component or callback without changing what it is:
/// `const Button = memo(forwardRef((props, ref) => ...))`.
const FUNCTION_WRAPPERS: &[&str] = &["memo", "forwardRef", "observer", "useCallback"];

/// How far up from `import()` / `require()` to look for the variable that receives it.
const MAX_IMPORT_BINDING_DEPTH: usize = 6;

/// How many barrel files (`export * from`) a call may be traced through.
const MAX_REEXPORT_DEPTH: usize = 8;

pub trait LanguageAdapter {
    fn language_id(&self) -> &'static str;
    fn extensions(&self) -> &'static [&'static str];
    /// Project configuration (tsconfig/jsconfig) that affects how imports resolve.
    fn configure(&mut self, _configs: &[SourceFile]) {}
    fn analyze(&mut self, files: &[SourceFile]) -> Result<ProgramGraph>;
}

struct CachedDocument {
    source: String,
    tree: Tree,
}

#[derive(Clone)]
struct PendingCall {
    source_id: String,
    source_path: String,
    name: String,
}

#[derive(Clone)]
struct ParsedImport {
    source_path: String,
    specifier: String,
    names: Vec<String>,
    /// `export ... from`, which passes the target's exports through.
    reexport: bool,
}

struct ParseContext<'a> {
    path: &'a str,
    source: &'a str,
    nodes: Vec<GraphNode>,
    edges: Vec<GraphEdge>,
    calls: Vec<PendingCall>,
    imports: Vec<ParsedImport>,
    exported_names: HashSet<String>,
}

pub struct TypeScriptAdapter {
    parser: Parser,
    tsx_parser: Parser,
    documents: HashMap<String, CachedDocument>,
    resolver: ModuleResolver,
}

impl TypeScriptAdapter {
    pub fn new() -> Result<Self> {
        let mut parser = Parser::new();
        let language = tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into();
        let mut tsx_parser = Parser::new();
        parser
            .set_language(&language)
            .context("could not initialize the TypeScript parser")?;
        tsx_parser
            .set_language(&tree_sitter_typescript::LANGUAGE_TSX.into())
            .context("could not initialize the TSX parser")?;
        Ok(Self {
            parser,
            tsx_parser,
            documents: HashMap::new(),
            resolver: ModuleResolver::default(),
        })
    }

    fn parse(&mut self, file: &SourceFile) -> Result<Tree> {
        if let Some(cached) = self.documents.get(&file.relative_path)
            && cached.source == file.content
        {
            return Ok(cached.tree.clone());
        }

        let old_document = self.documents.remove(&file.relative_path);
        let mut old_tree = old_document.as_ref().map(|document| document.tree.clone());
        if let (Some(document), Some(tree)) = (old_document.as_ref(), old_tree.as_mut()) {
            tree.edit(&calculate_edit(&document.source, &file.content));
        }
        let tree = if uses_jsx(&file.relative_path) {
            self.tsx_parser
                .parse(&file.content, old_tree.as_ref())
                .with_context(|| format!("could not parse {}", file.relative_path))?
        } else {
            self.parser
                .parse(&file.content, old_tree.as_ref())
                .with_context(|| format!("could not parse {}", file.relative_path))?
        };
        self.documents.insert(
            file.relative_path.clone(),
            CachedDocument {
                source: file.content.clone(),
                tree: tree.clone(),
            },
        );
        Ok(tree)
    }
}

impl LanguageAdapter for TypeScriptAdapter {
    fn language_id(&self) -> &'static str {
        "typescript"
    }

    fn extensions(&self) -> &'static [&'static str] {
        CODE_EXTENSIONS
    }

    fn configure(&mut self, configs: &[SourceFile]) {
        self.resolver = ModuleResolver::from_configs(configs);
    }

    fn analyze(&mut self, files: &[SourceFile]) -> Result<ProgramGraph> {
        let active_paths = files
            .iter()
            .map(|file| file.relative_path.as_str())
            .collect::<HashSet<_>>();
        self.documents
            .retain(|path, _| active_paths.contains(path.as_str()));

        let mut graph = ProgramGraph::default();
        let mut calls = Vec::new();
        let mut imports = Vec::new();
        for file in files {
            let file_id = file_node_id(&file.relative_path);
            graph.nodes.push(GraphNode {
                id: file_id.clone(),
                kind: GraphNodeKind::File,
                name: file
                    .relative_path
                    .rsplit('/')
                    .next()
                    .unwrap_or(&file.relative_path)
                    .to_owned(),
                path: file.relative_path.clone(),
                start_line: 1,
                end_line: file.content.lines().count().max(1),
                detail: Some(file.relative_path.clone()),
                exported: false,
            });
            if is_style_path(&file.relative_path) {
                imports.extend(
                    styles::style_imports(&file.content)
                        .into_iter()
                        .map(|specifier| ParsedImport {
                            source_path: file.relative_path.clone(),
                            specifier,
                            names: Vec::new(),
                            reexport: false,
                        }),
                );
                continue;
            }
            if !is_code_path(&file.relative_path) {
                continue;
            }
            let tree = self.parse(file)?;
            let mut context = ParseContext {
                path: &file.relative_path,
                source: &file.content,
                nodes: Vec::new(),
                edges: Vec::new(),
                calls: Vec::new(),
                imports: Vec::new(),
                exported_names: HashSet::new(),
            };
            visit_node(tree.root_node(), &file_id, &mut context);
            for node in &mut context.nodes {
                if context.exported_names.contains(&node.name)
                    && is_top_level(node, &context.edges, &file_id)
                {
                    node.exported = true;
                }
            }
            graph.nodes.extend(context.nodes);
            graph.edges.extend(context.edges);
            calls.extend(context.calls);
            imports.extend(context.imports);
        }

        let resolutions = imports
            .iter()
            .map(|import| {
                self.resolver
                    .resolve(&import.source_path, &import.specifier, &active_paths)
            })
            .collect::<Vec<_>>();
        connect_imports(&mut graph, &imports, &resolutions);
        connect_calls(&mut graph, &calls, &imports, &resolutions);
        graph.sort();
        Ok(graph)
    }
}

fn visit_node(node: Node<'_>, parent_id: &str, context: &mut ParseContext<'_>) {
    let mut child_parent = parent_id.to_owned();
    match node.kind() {
        "variable_declarator"
        | "function_declaration"
        | "generator_function_declaration"
        | "method_definition" => {
            if let Some(name_node) = function_name(node, context.source) {
                let name = node_text(name_node, context.source);
                let id = symbol_node_id(context.path, "function", &name, node.start_byte());
                add_symbol(
                    context,
                    node,
                    parent_id,
                    &id,
                    GraphNodeKind::Function,
                    name,
                    None,
                );
                child_parent = id;
            }
        }
        "class_declaration" => {
            if let Some(name_node) = node.child_by_field_name("name") {
                let name = node_text(name_node, context.source);
                let id = symbol_node_id(context.path, "class", &name, node.start_byte());
                add_symbol(
                    context,
                    node,
                    parent_id,
                    &id,
                    GraphNodeKind::Class,
                    name,
                    None,
                );
                child_parent = id;
            }
        }
        "import_statement" => {
            // `import x = require('./x')` keeps its source on the require clause.
            let source_node = node.child_by_field_name("source").or_else(|| {
                let mut cursor = node.walk();
                node.named_children(&mut cursor)
                    .find(|child| child.kind() == "import_require_clause")
                    .and_then(|clause| clause.child_by_field_name("source"))
            });
            if let Some(source_node) = source_node {
                // Nodes and edges for imports are created in `connect_imports`, once every
                // file is known and the specifier can be resolved.
                let specifier = strip_quotes(&node_text(source_node, context.source));
                context.imports.push(ParsedImport {
                    source_path: context.path.to_owned(),
                    specifier,
                    names: import_names(node, context.source),
                    reexport: false,
                });
                return;
            }
        }
        "export_statement" => {
            if let Some(source_node) = node.child_by_field_name("source") {
                // `export { a } from './a'` and `export * from './hooks'`, as in barrel files.
                context.imports.push(ParsedImport {
                    source_path: context.path.to_owned(),
                    specifier: strip_quotes(&node_text(source_node, context.source)),
                    names: import_names(node, context.source),
                    reexport: true,
                });
                return;
            }
            // `export { a, b }` names local symbols declared elsewhere in the file.
            collect_export_specifiers(node, context);
            // `export default App` / `export default memo(App)`.
            if let Some(value) = node.child_by_field_name("value") {
                collect_default_export(value, context);
            }
        }
        "call_expression" => {
            if let Some(function) = node.child_by_field_name("function") {
                if let Some(specifier) = dynamic_import_specifier(node, function, context.source) {
                    // `import('./Page')` (as in `React.lazy`) and CommonJS `require('./x')`.
                    context.imports.push(ParsedImport {
                        source_path: context.path.to_owned(),
                        specifier,
                        names: import_binding_names(node, context.source),
                        reexport: false,
                    });
                } else {
                    let raw_name = node_text(function, context.source);
                    let name = raw_name.rsplit('.').next().unwrap_or(&raw_name).to_owned();
                    context.calls.push(PendingCall {
                        source_id: parent_id.to_owned(),
                        source_path: context.path.to_owned(),
                        name,
                    });
                }
            }
        }
        "jsx_opening_element" | "jsx_self_closing_element" => {
            // Rendering `<Button />` uses the `Button` component the way a call would.
            // Lowercase names are DOM elements.
            if let Some(name_node) = node.child_by_field_name("name") {
                let raw_name = node_text(name_node, context.source);
                let name = raw_name.rsplit('.').next().unwrap_or(&raw_name);
                if name.starts_with(|first: char| first.is_ascii_uppercase()) {
                    context.calls.push(PendingCall {
                        source_id: parent_id.to_owned(),
                        source_path: context.path.to_owned(),
                        name: name.to_owned(),
                    });
                }
            }
        }
        _ => {}
    }

    let mut cursor = node.walk();
    for child in node.named_children(&mut cursor) {
        visit_node(child, &child_parent, context);
    }
}

fn function_name<'a>(node: Node<'a>, source: &str) -> Option<Node<'a>> {
    let name = node.child_by_field_name("name")?;
    if node.kind() == "variable_declarator" {
        let value = node.child_by_field_name("value")?;
        if name.kind() != "identifier" || !is_function_value(value, source) {
            return None;
        }
    }
    Some(name)
}

/// A function, possibly wrapped: `memo(() => ...)`, `forwardRef(function Input() {})`.
fn is_function_value(value: Node<'_>, source: &str) -> bool {
    match value.kind() {
        "arrow_function" | "function_expression" | "function" | "generator_function" => true,
        "parenthesized_expression" | "as_expression" | "satisfies_expression" => value
            .named_child(0)
            .is_some_and(|inner| is_function_value(inner, source)),
        "call_expression" => {
            let wraps = value.child_by_field_name("function").is_some_and(|callee| {
                let callee = node_text(callee, source);
                FUNCTION_WRAPPERS.contains(&callee.rsplit('.').next().unwrap_or(&callee))
            });
            wraps
                && value
                    .child_by_field_name("arguments")
                    .and_then(|arguments| arguments.named_child(0))
                    .is_some_and(|first| is_function_value(first, source))
        }
        _ => false,
    }
}

/// The literal module of `import('./x')` or `require('./x')`.
fn dynamic_import_specifier(call: Node<'_>, function: Node<'_>, source: &str) -> Option<String> {
    let is_import = function.kind() == "import"
        || (function.kind() == "identifier" && node_text(function, source) == "require");
    if !is_import {
        return None;
    }
    let argument = call.child_by_field_name("arguments")?.named_child(0)?;
    let literal = match argument.kind() {
        "string" => true,
        // A template without `${}` is still a fixed path.
        "template_string" => {
            let mut cursor = argument.walk();
            !argument
                .named_children(&mut cursor)
                .any(|child| child.kind() == "template_substitution")
        }
        _ => false,
    };
    literal.then(|| strip_quotes(&node_text(argument, source)))
}

/// Names bound from a dynamic import: `const Page = lazy(() => import('./Page'))`,
/// `const { a } = require('./a')`.
fn import_binding_names(call: Node<'_>, source: &str) -> Vec<String> {
    let mut current = call;
    for _ in 0..MAX_IMPORT_BINDING_DEPTH {
        let Some(parent) = current.parent() else {
            break;
        };
        match parent.kind() {
            "variable_declarator" => {
                let mut names = Vec::new();
                if let Some(name) = parent.child_by_field_name("name") {
                    collect_import_identifiers(name, source, &mut names);
                }
                names.sort();
                names.dedup();
                return names;
            }
            "arguments"
            | "arrow_function"
            | "call_expression"
            | "await_expression"
            | "parenthesized_expression"
            | "member_expression" => current = parent,
            _ => break,
        }
    }
    Vec::new()
}

fn add_symbol(
    context: &mut ParseContext<'_>,
    node: Node<'_>,
    parent_id: &str,
    id: &str,
    kind: GraphNodeKind,
    name: String,
    detail: Option<String>,
) {
    context.nodes.push(GraphNode {
        id: id.to_owned(),
        kind,
        name,
        path: context.path.to_owned(),
        start_line: node.start_position().row + 1,
        end_line: node.end_position().row + 1,
        detail,
        exported: node.parent().is_some_and(|parent| {
            parent.kind() == "export_statement"
                || (matches!(
                    parent.kind(),
                    "lexical_declaration" | "variable_declaration"
                ) && parent
                    .parent()
                    .is_some_and(|ancestor| ancestor.kind() == "export_statement"))
        }),
    });
    context.edges.push(GraphEdge {
        id: edge_id(GraphEdgeKind::Contains, parent_id, id),
        source: parent_id.to_owned(),
        target: id.to_owned(),
        kind: GraphEdgeKind::Contains,
    });
}

/// Project-file imports become file -> file edges. Packages and builtins become one shared
/// module node per specifier, and workspace files that aren't analysed (images, JSON) one
/// asset node per path, each with an import edge from every importer.
fn connect_imports(graph: &mut ProgramGraph, imports: &[ParsedImport], resolutions: &[Resolution]) {
    let mut outside_nodes = HashSet::new();
    for (import, resolution) in imports.iter().zip(resolutions) {
        let source = file_node_id(&import.source_path);
        let target = match resolution {
            Resolution::File(target_path) => file_node_id(target_path),
            Resolution::Asset(asset_path) => {
                let id = asset_node_id(asset_path);
                if outside_nodes.insert(id.clone()) {
                    graph.nodes.push(GraphNode {
                        id: id.clone(),
                        kind: GraphNodeKind::Asset,
                        name: asset_path
                            .rsplit('/')
                            .next()
                            .unwrap_or(asset_path)
                            .to_owned(),
                        // Not a source file, so there is nothing for the editor to open.
                        path: String::new(),
                        start_line: 1,
                        end_line: 1,
                        detail: Some(asset_path.clone()),
                        exported: false,
                    });
                }
                id
            }
            Resolution::External => {
                let id = module_node_id(&import.specifier);
                if outside_nodes.insert(id.clone()) {
                    graph.nodes.push(GraphNode {
                        id: id.clone(),
                        kind: GraphNodeKind::Import,
                        name: format!("import {}", import.specifier),
                        // Modules live outside the workspace, so there is no file to open.
                        path: String::new(),
                        start_line: 1,
                        end_line: 1,
                        detail: Some(import.specifier.clone()),
                        exported: false,
                    });
                }
                id
            }
        };
        if source == target {
            continue;
        }
        // Duplicate edges (a file importing the same module twice) are removed by `sort`.
        graph.edges.push(GraphEdge {
            id: edge_id(GraphEdgeKind::Imports, &source, &target),
            source,
            target,
            kind: GraphEdgeKind::Imports,
        });
    }
}

type FunctionsByName<'a> = HashMap<&'a str, Vec<&'a GraphNode>>;
/// Each file's imports that resolved to another analysed file, with that file's path.
type ImportsByFile<'a> = HashMap<&'a str, Vec<(&'a ParsedImport, &'a str)>>;

fn connect_calls(
    graph: &mut ProgramGraph,
    calls: &[PendingCall],
    imports: &[ParsedImport],
    resolutions: &[Resolution],
) {
    let functions = graph
        .nodes
        .iter()
        .filter(|node| node.kind == GraphNodeKind::Function)
        .fold(FunctionsByName::new(), |mut by_name, node| {
            by_name.entry(node.name.as_str()).or_default().push(node);
            by_name
        });
    let mut imports_by_file = ImportsByFile::new();
    for (import, resolution) in imports.iter().zip(resolutions) {
        if let Resolution::File(path) = resolution {
            imports_by_file
                .entry(import.source_path.as_str())
                .or_default()
                .push((import, path.as_str()));
        }
    }

    let mut edges = Vec::new();
    for call in calls {
        let name = call.name.as_str();
        let local = functions
            .get(name)
            .and_then(|nodes| nodes.iter().find(|node| node.path == call.source_path));
        let imported = || {
            imports_by_file
                .get(call.source_path.as_str())?
                .iter()
                .filter(|(import, _)| import.names.iter().any(|imported| imported == name))
                .find_map(|(_, path)| {
                    exported_function(&functions, &imports_by_file, name, path, 0)
                })
        };
        let unique = || {
            functions
                .get(name)
                .filter(|nodes| nodes.len() == 1)
                .and_then(|nodes| nodes.first())
                .copied()
        };
        if let Some(target) = local.copied().or_else(imported).or_else(unique)
            && call.source_id != target.id
        {
            edges.push(GraphEdge {
                id: edge_id(GraphEdgeKind::Calls, &call.source_id, &target.id),
                source: call.source_id.clone(),
                target: target.id.clone(),
                kind: GraphEdgeKind::Calls,
            });
        }
    }
    graph.edges.extend(edges);
}

/// `name` as defined in `path`, or passed through its re-exports (barrel `index.ts` files).
fn exported_function<'a>(
    functions: &FunctionsByName<'a>,
    imports_by_file: &ImportsByFile<'_>,
    name: &str,
    path: &str,
    depth: usize,
) -> Option<&'a GraphNode> {
    if let Some(node) = functions
        .get(name)
        .and_then(|nodes| nodes.iter().find(|node| node.path == path))
    {
        return Some(node);
    }
    if depth >= MAX_REEXPORT_DEPTH {
        return None;
    }
    imports_by_file
        .get(path)?
        .iter()
        .filter(|(import, _)| {
            // `export * from` has no names and passes everything through.
            import.reexport
                && (import.names.is_empty() || import.names.iter().any(|item| item == name))
        })
        .find_map(|(_, target)| {
            exported_function(functions, imports_by_file, name, target, depth + 1)
        })
}

/// Marks what `export default` names: `App`, `memo(App)`, `withRouter(connect(m)(App))`.
fn collect_default_export(value: Node<'_>, context: &mut ParseContext<'_>) {
    match value.kind() {
        "identifier" => {
            context
                .exported_names
                .insert(node_text(value, context.source));
        }
        "parenthesized_expression" | "as_expression" | "satisfies_expression" => {
            if let Some(inner) = value.named_child(0) {
                collect_default_export(inner, context);
            }
        }
        // Only the arguments: in `connect(mapState)(App)` the callee's arguments are
        // configuration, not the exported component.
        "call_expression" => {
            if let Some(arguments) = value.child_by_field_name("arguments") {
                let mut cursor = arguments.walk();
                for argument in arguments.named_children(&mut cursor) {
                    collect_default_export(argument, context);
                }
            }
        }
        _ => {}
    }
}

fn collect_export_specifiers(node: Node<'_>, context: &mut ParseContext<'_>) {
    if node.kind() == "export_specifier" {
        if let Some(name) = node.child_by_field_name("name") {
            context
                .exported_names
                .insert(node_text(name, context.source));
        }
        return;
    }
    let mut cursor = node.walk();
    for child in node.named_children(&mut cursor) {
        collect_export_specifiers(child, context);
    }
}

fn is_top_level(node: &GraphNode, edges: &[GraphEdge], file_id: &str) -> bool {
    edges.iter().any(|edge| {
        edge.kind == GraphEdgeKind::Contains && edge.source == file_id && edge.target == node.id
    })
}

fn import_names(node: Node<'_>, source: &str) -> Vec<String> {
    let mut names = Vec::new();
    collect_import_identifiers(node, source, &mut names);
    names.sort();
    names.dedup();
    names
}

fn collect_import_identifiers(node: Node<'_>, source: &str, names: &mut Vec<String>) {
    if matches!(
        node.kind(),
        "identifier" | "shorthand_property_identifier_pattern"
    ) {
        names.push(node_text(node, source));
    }
    if node.kind() == "string" {
        return;
    }
    let mut cursor = node.walk();
    for child in node.named_children(&mut cursor) {
        collect_import_identifiers(child, source, names);
    }
}

fn calculate_edit(old_source: &str, new_source: &str) -> InputEdit {
    let mut prefix = old_source
        .bytes()
        .zip(new_source.bytes())
        .take_while(|(left, right)| left == right)
        .count();
    while !old_source.is_char_boundary(prefix) || !new_source.is_char_boundary(prefix) {
        prefix -= 1;
    }

    let max_suffix = old_source.len().min(new_source.len()) - prefix;
    let mut suffix = old_source
        .as_bytes()
        .iter()
        .rev()
        .zip(new_source.as_bytes().iter().rev())
        .take(max_suffix)
        .take_while(|(left, right)| left == right)
        .count();
    while !old_source.is_char_boundary(old_source.len() - suffix)
        || !new_source.is_char_boundary(new_source.len() - suffix)
    {
        suffix -= 1;
    }
    let old_end_byte = old_source.len() - suffix;
    let new_end_byte = new_source.len() - suffix;
    InputEdit {
        start_byte: prefix,
        old_end_byte,
        new_end_byte,
        start_position: point_at(old_source, prefix),
        old_end_position: point_at(old_source, old_end_byte),
        new_end_position: point_at(new_source, new_end_byte),
    }
}

fn point_at(source: &str, byte: usize) -> Point {
    let before = &source[..byte];
    let row = before.bytes().filter(|value| *value == b'\n').count();
    let column = before
        .rsplit_once('\n')
        .map_or(before.len(), |(_, tail)| tail.len());
    Point::new(row, column)
}

fn node_text(node: Node<'_>, source: &str) -> String {
    node.utf8_text(source.as_bytes())
        .unwrap_or_default()
        .to_owned()
}

fn strip_quotes(value: &str) -> String {
    value.trim_matches(['\'', '"', '`']).to_owned()
}

/// TypeScript's own grammar rejects JSX, and the TSX grammar rejects `<T>value` casts, so
/// only `.ts`-family files use the plain grammar. Plain JavaScript often contains JSX.
fn uses_jsx(path: &str) -> bool {
    !(path.ends_with(".ts") || path.ends_with(".mts") || path.ends_with(".cts"))
}

fn file_node_id(path: &str) -> String {
    format!("file:{path}")
}

fn module_node_id(specifier: &str) -> String {
    format!("module:{specifier}")
}

fn asset_node_id(path: &str) -> String {
    format!("asset:{path}")
}

fn symbol_node_id(path: &str, kind: &str, name: &str, byte: usize) -> String {
    format!("{kind}:{path}:{name}:{byte}")
}

fn edge_id(kind: GraphEdgeKind, source: &str, target: &str) -> String {
    format!("{kind:?}:{source}:{target}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn source(path: &str, content: &str) -> SourceFile {
        SourceFile {
            absolute_path: PathBuf::from(path),
            relative_path: path.to_owned(),
            content: content.to_owned(),
        }
    }

    #[test]
    fn extracts_file_symbols_imports_and_calls() {
        let mut adapter = TypeScriptAdapter::new().expect("adapter");
        let files = vec![
            source(
                "src/index.ts",
                "import { checkGuess } from './game.js'\nfunction main() { checkGuess(4) }\nmain()",
            ),
            source(
                "src/game.ts",
                "export function checkGuess(value: number) { return value === 4 }",
            ),
        ];
        let graph = adapter.analyze(&files).expect("graph");
        assert!(graph.nodes.iter().any(|node| node.name == "checkGuess"));
        assert!(
            graph
                .edges
                .iter()
                .any(|edge| edge.kind == GraphEdgeKind::Imports)
        );
        assert!(
            graph
                .edges
                .iter()
                .any(|edge| edge.kind == GraphEdgeKind::Calls)
        );
    }

    #[test]
    fn shares_one_node_per_external_module() {
        let mut adapter = TypeScriptAdapter::new().expect("adapter");
        let files = vec![
            source(
                "src/index.ts",
                "import { checkGuess } from './game.js'
import * as readline from 'node:readline/promises'",
            ),
            source(
                "src/input.ts",
                "import * as readline from 'node:readline/promises'
import { stdin } from 'node:readline/promises'",
            ),
            source("src/game.ts", "export function checkGuess() {}"),
        ];
        let graph = adapter.analyze(&files).expect("graph");
        let modules = graph
            .nodes
            .iter()
            .filter(|node| node.kind == GraphNodeKind::Import)
            .map(|node| node.id.as_str())
            .collect::<Vec<_>>();
        assert_eq!(modules, vec!["module:node:readline/promises"]);
        let importers = graph
            .edges
            .iter()
            .filter(|edge| edge.target == "module:node:readline/promises")
            .map(|edge| (edge.kind, edge.source.as_str()))
            .collect::<Vec<_>>();
        assert_eq!(
            importers,
            vec![
                (GraphEdgeKind::Imports, "file:src/index.ts"),
                (GraphEdgeKind::Imports, "file:src/input.ts"),
            ]
        );
        assert!(
            graph
                .edges
                .iter()
                .any(|edge| edge.kind == GraphEdgeKind::Imports
                    && edge.source == "file:src/index.ts"
                    && edge.target == "file:src/game.ts")
        );
    }

    #[test]
    fn marks_exported_symbols_without_export_nodes() {
        let mut adapter = TypeScriptAdapter::new().expect("adapter");
        let graph = adapter
            .analyze(&[source(
                "game.ts",
                "export function direct() {}
function listed() {}
function local() {}
export { listed }",
            )])
            .expect("graph");
        let exported = |name: &str| {
            graph
                .nodes
                .iter()
                .find(|node| node.name == name)
                .map(|node| node.exported)
        };
        assert_eq!(exported("direct"), Some(true));
        assert_eq!(exported("listed"), Some(true));
        assert_eq!(exported("local"), Some(false));
        let file_id = file_node_id("game.ts");
        let direct = graph
            .nodes
            .iter()
            .find(|node| node.name == "direct")
            .expect("direct");
        assert!(is_top_level(direct, &graph.edges, &file_id));
    }

    #[test]
    fn discovers_function_values_and_preserves_exports_and_call_owners() {
        let mut adapter = TypeScriptAdapter::new().expect("adapter");
        let graph = adapter
            .analyze(&[source(
                "functions.ts",
                r#"
export const arrow = () => target();
export let expression = function named() { target(); };
const listed = async () => target();
export { listed };
const local = () => { const nested = () => target(); nested(); };
var generator = function* () { yield target(); };
export function* declaredGenerator() { yield target(); }
function target() {}
const count = 42;
let uninitialized;
const { destructured } = { destructured: 1 };
"#,
            )])
            .expect("graph");
        for (name, exported) in [
            ("arrow", true),
            ("expression", true),
            ("listed", true),
            ("local", false),
            ("nested", false),
            ("generator", false),
            ("declaredGenerator", true),
            ("target", false),
        ] {
            let symbol = graph
                .nodes
                .iter()
                .find(|node| node.name == name)
                .expect(name);
            assert_eq!(symbol.kind, GraphNodeKind::Function);
            assert_eq!(symbol.exported, exported, "{name}");
            assert!(
                graph
                    .edges
                    .iter()
                    .any(|edge| edge.kind == GraphEdgeKind::Contains && edge.target == symbol.id)
            );
            if !matches!(name, "local" | "target") {
                assert!(
                    graph
                        .edges
                        .iter()
                        .any(|edge| edge.kind == GraphEdgeKind::Calls && edge.source == symbol.id),
                    "{name} owns its calls"
                );
            }
        }
        assert_eq!(
            graph
                .nodes
                .iter()
                .filter(|node| node.kind == GraphNodeKind::Function)
                .count(),
            8
        );
        let nested = graph
            .nodes
            .iter()
            .find(|node| node.name == "nested")
            .expect("nested");
        let local = graph
            .nodes
            .iter()
            .find(|node| node.name == "local")
            .expect("local");
        assert!(
            graph
                .edges
                .iter()
                .any(|edge| edge.kind == GraphEdgeKind::Contains
                    && edge.source == local.id
                    && edge.target == nested.id)
        );
    }

    #[test]
    fn incrementally_reparses_changed_source() {
        let mut adapter = TypeScriptAdapter::new().expect("adapter");
        adapter
            .analyze(&[source("index.ts", "function first() {}")])
            .expect("first graph");
        let graph = adapter
            .analyze(&[source("index.ts", "function second() {}")])
            .expect("updated graph");
        assert!(graph.nodes.iter().any(|node| node.name == "second"));
        assert!(!graph.nodes.iter().any(|node| node.name == "first"));
    }

    #[test]
    fn calculates_multiline_edit_points() {
        let edit = calculate_edit("one\ntwo", "one\nthree");
        assert_eq!(edit.start_position.row, 1);
        assert_eq!(edit.new_end_position, Point::new(1, 5));
    }

    #[test]
    fn parses_tsx_components_with_jsx() {
        let mut adapter = TypeScriptAdapter::new().expect("adapter");
        let graph = adapter
            .analyze(&[source(
                "App.tsx",
                "export function App() { return <div>{greet()}</div> }\nfunction greet() { return 'hi' }",
            )])
            .expect("graph");
        assert!(
            graph
                .nodes
                .iter()
                .any(|node| node.name == "App" && node.exported)
        );
        assert!(
            graph
                .edges
                .iter()
                .any(|edge| edge.kind == GraphEdgeKind::Calls)
        );
    }

    fn has_edge(graph: &ProgramGraph, kind: GraphEdgeKind, source: &str, target: &str) -> bool {
        graph
            .edges
            .iter()
            .any(|edge| edge.kind == kind && edge.source == source && edge.target == target)
    }

    fn function_id<'a>(graph: &'a ProgramGraph, path: &str, name: &str) -> &'a str {
        graph
            .nodes
            .iter()
            .find(|node| node.path == path && node.name == name)
            .map(|node| node.id.as_str())
            .unwrap_or_else(|| panic!("{path}: {name}"))
    }

    #[test]
    fn links_a_react_project() {
        let mut adapter = TypeScriptAdapter::new().expect("adapter");
        adapter.configure(&[source(
            "tsconfig.json",
            r#"{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }"#,
        )]);
        let graph = adapter
            .analyze(&[
                source(
                    "src/main.jsx",
                    "import App from './App'\nimport './index.css'\ncreateRoot(root).render(<App />)",
                ),
                source(
                    "src/App.tsx",
                    r#"import { Button, Card } from '@/components'
import styles from './App.module.scss'
import logo from './assets/logo.svg'
import { useQuery } from '@tanstack/react-query'
const Settings = lazy(() => import('./pages/Settings'))
function App() { return <Card><Button /><Settings /></Card> }
export default memo(App)"#,
                ),
                source(
                    "src/components/index.ts",
                    "export { Button } from './Button'\nexport * from './Card'",
                ),
                source(
                    "src/components/Button.tsx",
                    "export const Button = memo(forwardRef((props, ref) => <button ref={ref} />))",
                ),
                source(
                    "src/components/Card.jsx",
                    "export function Card({ children }) { return <div>{children}</div> }",
                ),
                source(
                    "src/pages/Settings.tsx",
                    "const { format } = require('../utils')\nexport default function Settings() { return format() }",
                ),
                source("src/utils.js", "exports.format = function format() {}"),
                source("src/index.css", "@import './theme.css';"),
                source("src/theme.css", ":root { --blue: #2862ff; }"),
                source("src/App.module.scss", "@use 'variables';"),
                source("src/_variables.scss", "$gap: 4px;"),
            ])
            .expect("graph");

        for (source, target) in [
            ("src/main.jsx", "src/App.tsx"),
            ("src/main.jsx", "src/index.css"),
            ("src/App.tsx", "src/components/index.ts"),
            ("src/App.tsx", "src/App.module.scss"),
            ("src/App.tsx", "src/pages/Settings.tsx"),
            ("src/components/index.ts", "src/components/Button.tsx"),
            ("src/components/index.ts", "src/components/Card.jsx"),
            ("src/pages/Settings.tsx", "src/utils.js"),
            ("src/index.css", "src/theme.css"),
            ("src/App.module.scss", "src/_variables.scss"),
        ] {
            assert!(
                has_edge(
                    &graph,
                    GraphEdgeKind::Imports,
                    &file_node_id(source),
                    &file_node_id(target)
                ),
                "{source} -> {target}"
            );
        }
        let outside = graph
            .nodes
            .iter()
            .filter(|node| matches!(node.kind, GraphNodeKind::Import | GraphNodeKind::Asset))
            .map(|node| (node.kind, node.id.as_str()))
            .collect::<Vec<_>>();
        assert_eq!(
            outside,
            vec![
                (GraphNodeKind::Asset, "asset:src/assets/logo.svg"),
                (GraphNodeKind::Import, "module:@tanstack/react-query"),
            ]
        );

        let app = function_id(&graph, "src/App.tsx", "App");
        for (path, name) in [
            ("src/components/Button.tsx", "Button"),
            ("src/components/Card.jsx", "Card"),
            ("src/pages/Settings.tsx", "Settings"),
        ] {
            assert!(
                has_edge(
                    &graph,
                    GraphEdgeKind::Calls,
                    app,
                    function_id(&graph, path, name)
                ),
                "App renders {name}"
            );
        }
        assert!(
            graph
                .nodes
                .iter()
                .any(|node| node.id == app && node.exported),
            "`export default memo(App)` exports App"
        );
    }
}
