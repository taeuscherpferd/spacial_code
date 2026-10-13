use std::path::{Path, PathBuf};

/// Script files the language adapter parses for symbols, imports and calls.
pub const CODE_EXTENSIONS: &[&str] = &["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"];

/// Stylesheets components import. They show in the graph so they can be reviewed with the
/// code that uses them.
pub const STYLE_EXTENSIONS: &[&str] = &["css", "scss", "sass", "less"];

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SourceFile {
    pub absolute_path: PathBuf,
    pub relative_path: String,
    pub content: String,
}

pub fn is_code_path(path: impl AsRef<Path>) -> bool {
    has_extension(path.as_ref(), CODE_EXTENSIONS)
}

pub fn is_style_path(path: impl AsRef<Path>) -> bool {
    has_extension(path.as_ref(), STYLE_EXTENSIONS)
}

/// Dependencies, build output and VCS data, which are never shown or watched.
pub const SKIPPED_DIRECTORIES: &[&str] = &["node_modules", "dist", "target", ".git"];

/// Whether any folder on `path` is one of [`SKIPPED_DIRECTORIES`].
pub fn is_in_skipped_directory(path: impl AsRef<Path>) -> bool {
    path.as_ref().components().any(|component| {
        component
            .as_os_str()
            .to_str()
            .is_some_and(|name| SKIPPED_DIRECTORIES.contains(&name))
    })
}

/// Files shown in the workspace and graph.
pub fn is_source_path(path: impl AsRef<Path>) -> bool {
    let path = path.as_ref();
    (is_code_path(path) || is_style_path(path)) && !is_minified(path)
}

/// `tsconfig.json`, `tsconfig.app.json`, `jsconfig.json`, ... which hold import aliases.
pub fn is_project_config_path(path: impl AsRef<Path>) -> bool {
    path.as_ref()
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| {
            (name.starts_with("tsconfig") || name.starts_with("jsconfig"))
                && name.ends_with(".json")
        })
}

fn has_extension(path: &Path, extensions: &[&str]) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extensions.contains(&extension))
}

fn is_minified(path: &Path) -> bool {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .is_some_and(|stem| stem.ends_with(".min"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_source_and_config_paths() {
        for path in [
            "src/App.tsx",
            "src/index.js",
            "src/App.module.scss",
            "a.css",
        ] {
            assert!(is_source_path(path), "{path}");
        }
        for path in ["logo.svg", "vendor/jquery.min.js", "package.json"] {
            assert!(!is_source_path(path), "{path}");
        }
        assert!(is_project_config_path("tsconfig.app.json"));
        assert!(is_project_config_path("web/jsconfig.json"));
        assert!(!is_project_config_path("package.json"));
        assert!(is_in_skipped_directory("web/node_modules/react/index.js"));
        assert!(!is_in_skipped_directory("src/components/dist.ts"));
    }
}
