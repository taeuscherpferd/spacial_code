use anyhow::{Context, Result};
use spatial_code_core::SourceFile;
use spatial_code_graph::{GraphEdge, GraphEdgeKind, GraphNode, GraphNodeKind, ProgramGraph};
use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};
use tree_sitter::{InputEdit, Node, Parser, Point, Tree};

pub trait LanguageAdapter {
    fn language_id(&self) -> &'static str;
    fn extensions(&self) -> &'static [&'static str];
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
    documents: HashMap<String, CachedDocument>,
}

impl TypeScriptAdapter {
    pub fn new() -> Result<Self> {
        let mut parser = Parser::new();
        let language = tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into();
        parser
            .set_language(&language)
            .context("could not initialize the TypeScript parser")?;
        Ok(Self {
            parser,
            documents: HashMap::new(),
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
        let tree = self
            .parser
            .parse(&file.content, old_tree.as_ref())
            .with_context(|| format!("could not parse {}", file.relative_path))?;
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
        &["ts"]
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
            let tree = self.parse(file)?;
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

        connect_imports(&mut graph, &imports, &active_paths);
        connect_calls(&mut graph, &calls, &imports, &active_paths);
        graph.sort();
        Ok(graph)
    }
}

fn visit_node(node: Node<'_>, parent_id: &str, context: &mut ParseContext<'_>) {
    let mut child_parent = parent_id.to_owned();
    match node.kind() {
        "function_declaration" | "method_definition" => {
            if let Some(name_node) = node.child_by_field_name("name") {
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
            if let Some(source_node) = node.child_by_field_name("source") {
                // Nodes and edges for imports are created in `connect_imports`, once every
                // file is known and the specifier can be resolved.
                let specifier = strip_quotes(&node_text(source_node, context.source));
                context.imports.push(ParsedImport {
                    source_path: context.path.to_owned(),
                    specifier,
                    names: import_names(node, context.source),
                });
                return;
            }
        }
        "export_statement" => {
            // `export { a, b }` names local symbols declared elsewhere in the file.
            if node.child_by_field_name("source").is_none() {
                collect_export_specifiers(node, context);
            }
        }
        "call_expression" => {
            if let Some(function) = node.child_by_field_name("function") {
                let raw_name = node_text(function, context.source);
                let name = raw_name.rsplit('.').next().unwrap_or(&raw_name).to_owned();
                context.calls.push(PendingCall {
                    source_id: parent_id.to_owned(),
                    source_path: context.path.to_owned(),
                    name,
                });
            }
        }
        _ => {}
    }

    let mut cursor = node.walk();
    for child in node.named_children(&mut cursor) {
        visit_node(child, &child_parent, context);
    }
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
        exported: node
            .parent()
            .is_some_and(|parent| parent.kind() == "export_statement"),
    });
    context.edges.push(GraphEdge {
        id: edge_id(GraphEdgeKind::Contains, parent_id, id),
        source: parent_id.to_owned(),
        target: id.to_owned(),
        kind: GraphEdgeKind::Contains,
    });
}

/// Project-file imports become file -> file edges. Anything else (packages, node builtins)
/// becomes one shared module node per specifier, with an import edge from each importer.
fn connect_imports(
    graph: &mut ProgramGraph,
    imports: &[ParsedImport],
    active_paths: &HashSet<&str>,
) {
    let mut modules = HashSet::new();
    for import in imports {
        let source = file_node_id(&import.source_path);
        let target = match resolve_import(&import.source_path, &import.specifier, active_paths) {
            Some(target_path) => file_node_id(&target_path),
            None => {
                let id = module_node_id(&import.specifier);
                if modules.insert(id.clone()) {
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
        // Duplicate edges (a file importing the same module twice) are removed by `sort`.
        graph.edges.push(GraphEdge {
            id: edge_id(GraphEdgeKind::Imports, &source, &target),
            source,
            target,
            kind: GraphEdgeKind::Imports,
        });
    }
}

fn connect_calls(
    graph: &mut ProgramGraph,
    calls: &[PendingCall],
    imports: &[ParsedImport],
    active_paths: &HashSet<&str>,
) {
    let functions = graph
        .nodes
        .iter()
        .filter(|node| node.kind == GraphNodeKind::Function)
        .fold(
            HashMap::<String, Vec<&GraphNode>>::new(),
            |mut by_name, node| {
                by_name.entry(node.name.clone()).or_default().push(node);
                by_name
            },
        );

    for call in calls {
        let local = functions
            .get(&call.name)
            .and_then(|nodes| nodes.iter().find(|node| node.path == call.source_path));
        let imported_path = imports
            .iter()
            .find(|item| item.source_path == call.source_path && item.names.contains(&call.name))
            .and_then(|item| resolve_import(&item.source_path, &item.specifier, active_paths));
        let imported = imported_path.as_ref().and_then(|path| {
            functions
                .get(&call.name)
                .and_then(|nodes| nodes.iter().find(|node| node.path == *path))
        });
        let unique = functions
            .get(&call.name)
            .filter(|nodes| nodes.len() == 1)
            .and_then(|nodes| nodes.first());
        if let Some(target) = local.or(imported).or(unique)
            && call.source_id != target.id
        {
            graph.edges.push(GraphEdge {
                id: edge_id(GraphEdgeKind::Calls, &call.source_id, &target.id),
                source: call.source_id.clone(),
                target: target.id.clone(),
                kind: GraphEdgeKind::Calls,
            });
        }
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

fn resolve_import(
    source_path: &str,
    specifier: &str,
    active_paths: &HashSet<&str>,
) -> Option<String> {
    if !specifier.starts_with('.') {
        return None;
    }
    let parent = Path::new(source_path)
        .parent()
        .unwrap_or_else(|| Path::new(""));
    let joined = normalize_path(parent.join(specifier));
    let base = joined.to_string_lossy().replace('\\', "/");
    let typescript_module = matches!(
        joined.extension().and_then(|extension| extension.to_str()),
        Some("js" | "mjs" | "cjs")
    )
    .then(|| {
        joined
            .with_extension("ts")
            .to_string_lossy()
            .replace('\\', "/")
    });
    let candidates = [
        typescript_module,
        Some(format!("{base}.ts")),
        Some(format!("{base}/index.ts")),
        Some(base),
    ];
    candidates
        .into_iter()
        .flatten()
        .find(|candidate| active_paths.contains(candidate.as_str()))
}

fn normalize_path(path: PathBuf) -> PathBuf {
    let mut result = PathBuf::new();
    for component in path.components() {
        match component {
            Component::ParentDir => {
                result.pop();
            }
            Component::CurDir => {}
            value => result.push(value.as_os_str()),
        }
    }
    result
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
    value.trim_matches(['\'', '"']).to_owned()
}

fn file_node_id(path: &str) -> String {
    format!("file:{path}")
}

fn module_node_id(specifier: &str) -> String {
    format!("module:{specifier}")
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
}
