//! Maps import specifiers to workspace files the way TypeScript, bundlers and Sass do.

use serde_json::Value;
use spatial_code_core::{SourceFile, is_style_path};
use std::collections::{HashMap, HashSet};

/// Probed, in order, for extensionless script imports (`./App` -> `App.tsx`).
const SCRIPT_EXTENSIONS: &[&str] = &["ts", "tsx", "d.ts", "js", "jsx", "mts", "cts", "mjs", "cjs"];
const STYLE_EXTENSIONS: &[&str] = &["scss", "sass", "css", "less"];

/// Folders conventionally behind the `@/` and `~/` aliases, which can't be package names.
const CONVENTIONAL_ALIAS_ROOTS: &[&str] = &["src", "app", ""];

/// Bounds `extends` / `references` chains, which may be cyclic in broken configs.
const MAX_CONFIG_DEPTH: usize = 16;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Resolution {
    /// A file in the analysed set.
    File(String),
    /// Points into the workspace, but at a file that isn't analysed (an image, JSON, or a
    /// missing file).
    Asset(String),
    /// A package or builtin.
    External,
}

/// Import aliases for one project: a tsconfig/jsconfig plus everything it extends and
/// references.
#[derive(Clone, Debug, Default)]
struct Project {
    /// Workspace-relative folder holding the config ("" for the root).
    directory: String,
    base_urls: Vec<String>,
    /// Longest prefix first, which is the order TypeScript tries them in.
    aliases: Vec<PathAlias>,
}

#[derive(Clone, Debug)]
struct PathAlias {
    /// `@components/*` or an exact specifier.
    pattern: String,
    /// Workspace-relative substitutions, which may contain one `*`.
    targets: Vec<String>,
}

/// A tsconfig `paths` map as written: pattern -> targets.
type RawPaths = Vec<(String, Vec<String>)>;

/// `compilerOptions` that matter for resolution, after applying `extends`.
#[derive(Default)]
struct EffectiveOptions {
    base_url: Option<String>,
    /// The raw `paths` map and the folder of the config that declared it.
    paths: Option<(RawPaths, String)>,
}

#[derive(Default)]
pub struct ModuleResolver {
    /// Deepest folder first, so each file picks its nearest project.
    projects: Vec<Project>,
}

impl ModuleResolver {
    /// Builds aliases from the workspace's `tsconfig*.json` / `jsconfig*.json` files.
    pub fn from_configs(configs: &[SourceFile]) -> Self {
        let parsed = configs
            .iter()
            .filter_map(|file| {
                parse_jsonc(&file.content).map(|value| (file.relative_path.as_str(), value))
            })
            .collect::<HashMap<_, _>>();
        let mut projects = Vec::new();
        for &path in parsed.keys() {
            let (directory, name) = split_directory(path);
            // Other names (`tsconfig.app.json`) are only reached through `references` or
            // `extends`; a jsconfig only counts where there's no tsconfig.
            let is_root = name == "tsconfig.json"
                || (name == "jsconfig.json"
                    && !parsed.contains_key(join_path(directory, "tsconfig.json").as_str()));
            if !is_root {
                continue;
            }
            let mut project = Project {
                directory: directory.to_owned(),
                ..Project::default()
            };
            collect_project(path, &parsed, &mut project, &mut HashSet::new(), 0);
            project
                .aliases
                .sort_by_key(|alias| std::cmp::Reverse(alias_prefix(&alias.pattern).len()));
            projects.push(project);
        }
        projects.sort_by(|left, right| {
            depth(&right.directory)
                .cmp(&depth(&left.directory))
                .then_with(|| left.directory.cmp(&right.directory))
        });
        Self { projects }
    }

    pub fn resolve(&self, importer: &str, specifier: &str, files: &HashSet<&str>) -> Resolution {
        // Bundler queries (`./icon.svg?react`, `./worker?worker`) aren't part of the path.
        let specifier = specifier.split('?').next().unwrap_or(specifier);
        let style = is_style_path(importer);
        let find = |base: &str| find_file(base, style, files);
        let project = self.project_for(importer);
        let project_directory = project.map_or("", |project| project.directory.as_str());
        let (importer_directory, _) = split_directory(importer);

        let local = if is_relative(specifier) {
            join_relative(importer_directory, specifier)
        } else if specifier.starts_with('/') {
            // Vite serves `/src/main.tsx` from the project root.
            join_relative(project_directory, specifier)
        } else {
            None
        };
        if let Some(base) = local {
            return find(&base).map_or(Resolution::Asset(base), Resolution::File);
        }
        if specifier.starts_with("..") || specifier.starts_with('/') {
            // Escapes the workspace.
            return Resolution::External;
        }

        if style {
            // Sass and CSS try a bare `@use 'variables'` next to the stylesheet first;
            // `~` and anything not found is a package (or a `sass:` builtin).
            return join_relative(importer_directory, specifier)
                .filter(|_| !specifier.starts_with('~') && !specifier.contains(':'))
                .and_then(|base| find(&base))
                .map_or(Resolution::External, Resolution::File);
        }

        let mut first_alias_target = None;
        if let Some(project) = project {
            for alias in &project.aliases {
                let Some(matched) = match_alias(&alias.pattern, specifier) else {
                    continue;
                };
                for target in &alias.targets {
                    let base = target.replacen('*', matched, 1);
                    if let Some(file) = find(&base) {
                        return Resolution::File(file);
                    }
                    if first_alias_target.is_none() {
                        first_alias_target = Some(base);
                    }
                }
            }
            for base_url in &project.base_urls {
                if let Some(file) = join_relative(base_url, specifier).and_then(|base| find(&base))
                {
                    return Resolution::File(file);
                }
            }
        }
        if let Some(rest) = specifier
            .strip_prefix("@/")
            .or_else(|| specifier.strip_prefix("~/"))
        {
            for root in CONVENTIONAL_ALIAS_ROOTS {
                let directory = join_path(project_directory, root);
                if let Some(file) = join_relative(&directory, rest).and_then(|base| find(&base)) {
                    return Resolution::File(file);
                }
            }
            if first_alias_target.is_none() {
                first_alias_target = join_relative(&join_path(project_directory, "src"), rest);
            }
        }
        first_alias_target.map_or(Resolution::External, Resolution::Asset)
    }

    fn project_for(&self, importer: &str) -> Option<&Project> {
        self.projects.iter().find(|project| {
            project.directory.is_empty()
                || importer
                    .strip_prefix(project.directory.as_str())
                    .is_some_and(|rest| rest.starts_with('/'))
        })
    }
}

fn collect_project(
    path: &str,
    parsed: &HashMap<&str, Value>,
    project: &mut Project,
    visited: &mut HashSet<String>,
    level: usize,
) {
    if level > MAX_CONFIG_DEPTH || !visited.insert(path.to_owned()) {
        return;
    }
    let Some(config) = parsed.get(path) else {
        return;
    };
    let options = effective_options(path, parsed, 0);
    if let Some(base_url) = &options.base_url
        && !project.base_urls.contains(base_url)
    {
        project.base_urls.push(base_url.clone());
    }
    if let Some((paths, declared_in)) = options.paths {
        // Targets are relative to `baseUrl` when there is one, else to the declaring config.
        let root = options.base_url.as_deref().unwrap_or(&declared_in);
        for (pattern, targets) in paths {
            let targets = targets
                .iter()
                .filter_map(|target| join_relative(root, target))
                .collect::<Vec<_>>();
            if !targets.is_empty() {
                project.aliases.push(PathAlias { pattern, targets });
            }
        }
    }
    // Solution-style roots (Vite's template) keep their aliases in referenced configs.
    let (directory, _) = split_directory(path);
    let references = config
        .get("references")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|reference| reference.get("path")?.as_str());
    for reference in references {
        let Some(target) = join_relative(directory, reference) else {
            continue;
        };
        let file = if target.ends_with(".json") {
            target
        } else {
            join_path(&target, "tsconfig.json")
        };
        collect_project(&file, parsed, project, visited, level + 1);
    }
}

fn effective_options(path: &str, parsed: &HashMap<&str, Value>, level: usize) -> EffectiveOptions {
    let mut options = EffectiveOptions::default();
    let Some(config) = parsed.get(path).filter(|_| level <= MAX_CONFIG_DEPTH) else {
        return options;
    };
    let (directory, _) = split_directory(path);
    // Parents first, so this config's own settings override theirs.
    let extends = match config.get("extends") {
        Some(Value::String(parent)) => vec![parent.as_str()],
        Some(Value::Array(parents)) => parents.iter().filter_map(Value::as_str).collect(),
        _ => Vec::new(),
    };
    for parent in extends {
        // Package configs (`@tsconfig/vite-react`) live in node_modules, which isn't scanned.
        let Some(parent) = is_relative(parent)
            .then(|| join_relative(directory, parent))
            .flatten()
            .and_then(|base| {
                [format!("{base}.json"), base]
                    .into_iter()
                    .find(|candidate| parsed.contains_key(candidate.as_str()))
            })
        else {
            continue;
        };
        let inherited = effective_options(&parent, parsed, level + 1);
        options.base_url = inherited.base_url.or(options.base_url);
        options.paths = inherited.paths.or(options.paths);
    }
    let compiler_options = config.get("compilerOptions");
    if let Some(base_url) = compiler_options
        .and_then(|options| options.get("baseUrl"))
        .and_then(Value::as_str)
        .and_then(|base_url| join_relative(directory, base_url))
    {
        options.base_url = Some(base_url);
    }
    if let Some(paths) = compiler_options
        .and_then(|options| options.get("paths"))
        .and_then(Value::as_object)
    {
        let paths = paths
            .iter()
            .map(|(pattern, targets)| {
                let targets = targets
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect();
                (pattern.clone(), targets)
            })
            .collect();
        options.paths = Some((paths, directory.to_owned()));
    }
    options
}

/// The first analysed file a specifier's base path can mean.
fn find_file(base: &str, style: bool, files: &HashSet<&str>) -> Option<String> {
    let mut candidates = vec![base.to_owned()];
    if style {
        let (directory, name) = split_directory(base);
        for extension in STYLE_EXTENSIONS {
            candidates.push(format!("{base}.{extension}"));
            // Sass partials: `@use 'variables'` -> `_variables.scss`.
            candidates.push(join_path(directory, &format!("_{name}.{extension}")));
        }
        for extension in STYLE_EXTENSIONS {
            candidates.push(format!("{base}/_index.{extension}"));
            candidates.push(format!("{base}/index.{extension}"));
        }
    } else {
        // TypeScript's ESM convention: `./game.js` is written for the compiled output of
        // `game.ts`.
        if let Some((stem, extension)) = base.rsplit_once('.') {
            let sources: &[&str] = match extension {
                "js" => &["ts", "tsx", "d.ts"],
                "jsx" => &["tsx"],
                "mjs" => &["mts"],
                "cjs" => &["cts"],
                _ => &[],
            };
            candidates.extend(sources.iter().map(|source| format!("{stem}.{source}")));
        }
        candidates.extend(
            SCRIPT_EXTENSIONS
                .iter()
                .map(|extension| format!("{base}.{extension}")),
        );
        candidates.extend(
            SCRIPT_EXTENSIONS
                .iter()
                .map(|extension| format!("{base}/index.{extension}")),
        );
    }
    candidates
        .into_iter()
        .find(|candidate| files.contains(candidate.as_str()))
}

/// What `*` matched, or "" for an exact pattern.
fn match_alias<'a>(pattern: &str, specifier: &'a str) -> Option<&'a str> {
    match pattern.split_once('*') {
        Some((prefix, suffix)) => specifier.strip_prefix(prefix)?.strip_suffix(suffix),
        None => (pattern == specifier).then_some(""),
    }
}

fn alias_prefix(pattern: &str) -> &str {
    pattern.split('*').next().unwrap_or(pattern)
}

fn is_relative(specifier: &str) -> bool {
    matches!(specifier, "." | "..") || specifier.starts_with("./") || specifier.starts_with("../")
}

/// Joins a `/`-separated path onto a workspace-relative folder; `None` if it escapes the
/// workspace.
pub(crate) fn join_relative(directory: &str, path: &str) -> Option<String> {
    let mut parts = if path.starts_with('/') {
        Vec::new()
    } else {
        directory
            .split('/')
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
    };
    for part in path.split(['/', '\\']) {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            part => parts.push(part),
        }
    }
    Some(parts.join("/"))
}

fn join_path(directory: &str, name: &str) -> String {
    match (directory.is_empty(), name.is_empty()) {
        (true, _) => name.to_owned(),
        (_, true) => directory.to_owned(),
        _ => format!("{directory}/{name}"),
    }
}

fn split_directory(path: &str) -> (&str, &str) {
    path.rsplit_once('/').unwrap_or(("", path))
}

fn depth(directory: &str) -> usize {
    if directory.is_empty() {
        0
    } else {
        directory.matches('/').count() + 1
    }
}

/// tsconfig files are JSON with comments and trailing commas.
fn parse_jsonc(text: &str) -> Option<Value> {
    let text = text.trim_start_matches('\u{feff}');
    let mut without_comments = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    let mut in_string = false;
    while let Some(char) = chars.next() {
        if in_string {
            without_comments.push(char);
            match char {
                '\\' => without_comments.extend(chars.next()),
                '"' => in_string = false,
                _ => {}
            }
            continue;
        }
        match (char, chars.peek().copied()) {
            ('/', Some('/')) => {
                for next in chars.by_ref() {
                    if next == '\n' {
                        without_comments.push('\n');
                        break;
                    }
                }
            }
            ('/', Some('*')) => {
                chars.next();
                let mut previous = ' ';
                for next in chars.by_ref() {
                    if previous == '*' && next == '/' {
                        break;
                    }
                    previous = next;
                }
                without_comments.push(' ');
            }
            _ => {
                in_string = char == '"';
                without_comments.push(char);
            }
        }
    }

    let mut cleaned = String::with_capacity(without_comments.len());
    let mut in_string = false;
    let mut escaped = false;
    for (index, char) in without_comments.char_indices() {
        if in_string {
            in_string = escaped || char != '"';
            escaped = !escaped && char == '\\';
        } else if char == '"' {
            in_string = true;
        } else if char == ','
            && without_comments[index + 1..]
                .trim_start()
                .starts_with(['}', ']'])
        {
            continue;
        }
        cleaned.push(char);
    }
    serde_json::from_str(&cleaned).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn config(path: &str, content: &str) -> SourceFile {
        SourceFile {
            absolute_path: PathBuf::from(path),
            relative_path: path.to_owned(),
            content: content.to_owned(),
        }
    }

    fn files<'a>(paths: &[&'a str]) -> HashSet<&'a str> {
        paths.iter().copied().collect()
    }

    #[test]
    fn resolves_relative_scripts_in_any_extension() {
        let resolver = ModuleResolver::default();
        let files = files(&[
            "src/App.tsx",
            "src/components/Button.jsx",
            "src/hooks/index.ts",
            "src/game.ts",
            "src/App.module.scss",
        ]);
        for (specifier, expected) in [
            ("./App", "src/App.tsx"),
            ("./App.tsx", "src/App.tsx"),
            ("./App.js", "src/App.tsx"),
            ("./components/Button", "src/components/Button.jsx"),
            ("./hooks", "src/hooks/index.ts"),
            ("./game.js", "src/game.ts"),
            ("./App.module.scss", "src/App.module.scss"),
            ("/src/App", "src/App.tsx"),
        ] {
            assert_eq!(
                resolver.resolve("src/main.tsx", specifier, &files),
                Resolution::File(expected.to_owned()),
                "{specifier}"
            );
        }
        assert_eq!(
            resolver.resolve("src/main.tsx", "./logo.svg?react", &files),
            Resolution::Asset("src/logo.svg".to_owned())
        );
        assert_eq!(
            resolver.resolve("src/main.tsx", "react", &files),
            Resolution::External
        );
        assert_eq!(
            resolver.resolve("main.tsx", "../outside", &files),
            Resolution::External
        );
    }

    #[test]
    fn resolves_tsconfig_paths_through_references_and_extends() {
        let resolver = ModuleResolver::from_configs(&[
            config(
                "tsconfig.json",
                r#"{ "files": [], "references": [{ "path": "./tsconfig.app.json" }] }"#,
            ),
            config(
                "tsconfig.app.json",
                r#"{
                    // Vite's template keeps aliases here.
                    "extends": "./tsconfig.base",
                    "compilerOptions": { "baseUrl": "." },
                }"#,
            ),
            config(
                "tsconfig.base.json",
                r#"{ "compilerOptions": { "paths": {
                    "@/*": ["./src/*"],
                    "@ui/*": ["./src/components/ui/*", "./src/legacy/*"], /* trailing */
                } } }"#,
            ),
        ]);
        let files = files(&[
            "src/components/Button.tsx",
            "src/components/ui/Card.tsx",
            "src/legacy/Old.tsx",
            "src/utils.ts",
        ]);
        for (specifier, expected) in [
            ("@/components/Button", "src/components/Button.tsx"),
            ("@ui/Card", "src/components/ui/Card.tsx"),
            ("@ui/Old", "src/legacy/Old.tsx"),
            ("src/utils", "src/utils.ts"),
        ] {
            assert_eq!(
                resolver.resolve("src/App.tsx", specifier, &files),
                Resolution::File(expected.to_owned()),
                "{specifier}"
            );
        }
        assert_eq!(
            resolver.resolve("src/App.tsx", "@/assets/logo.png", &files),
            Resolution::Asset("src/assets/logo.png".to_owned())
        );
        assert_eq!(
            resolver.resolve("src/App.tsx", "@tanstack/react-query", &files),
            Resolution::External
        );
    }

    #[test]
    fn uses_the_nearest_project_config() {
        let resolver = ModuleResolver::from_configs(&[
            config(
                "tsconfig.json",
                r#"{ "compilerOptions": { "paths": { "@/*": ["shared/*"] } } }"#,
            ),
            config(
                "apps/web/jsconfig.json",
                r#"{ "compilerOptions": { "baseUrl": "src" } }"#,
            ),
        ]);
        let files = files(&["apps/web/src/pages/Home.jsx", "apps/web/src/Api.js"]);
        assert_eq!(
            resolver.resolve("apps/web/src/index.jsx", "pages/Home", &files),
            Resolution::File("apps/web/src/pages/Home.jsx".to_owned())
        );
        // No `paths` in the nearest config, so `@/` falls back to its `src` folder.
        assert_eq!(
            resolver.resolve("apps/web/src/index.jsx", "@/Api", &files),
            Resolution::File("apps/web/src/Api.js".to_owned())
        );
    }

    #[test]
    fn resolves_sass_partials_and_packages() {
        let resolver = ModuleResolver::default();
        let files = files(&[
            "src/styles/_variables.scss",
            "src/styles/mixins/_index.scss",
            "src/styles/base.css",
        ]);
        for (specifier, expected) in [
            ("variables", "src/styles/_variables.scss"),
            ("./mixins", "src/styles/mixins/_index.scss"),
            ("base.css", "src/styles/base.css"),
        ] {
            assert_eq!(
                resolver.resolve("src/styles/app.scss", specifier, &files),
                Resolution::File(expected.to_owned()),
                "{specifier}"
            );
        }
        for specifier in [
            "sass:math",
            "~bootstrap/scss/bootstrap",
            "bootstrap/scss/grid",
        ] {
            assert_eq!(
                resolver.resolve("src/styles/app.scss", specifier, &files),
                Resolution::External,
                "{specifier}"
            );
        }
    }

    #[test]
    fn parses_json_with_comments_and_trailing_commas() {
        let value = parse_jsonc(
            "\u{feff}{ // line\n \"a\": \"http://x/*y*/\", /* block */ \"b\": [1, 2,], }",
        )
        .expect("json");
        assert_eq!(value["a"], "http://x/*y*/");
        assert_eq!(value["b"], serde_json::json!([1, 2]));
    }
}
