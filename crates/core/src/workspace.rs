use crate::SourceFile;
use anyhow::{Context, Result, bail};
use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceEntry {
    pub name: String,
    pub path: String,
    pub kind: WorkspaceEntryKind,
    pub children: Vec<WorkspaceEntry>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WorkspaceEntryKind {
    Directory,
    File,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub name: String,
    pub root: String,
    pub entries: Vec<WorkspaceEntry>,
}

#[derive(Clone, Debug)]
pub struct WorkspaceService {
    root: PathBuf,
}

impl WorkspaceService {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let root = path
            .as_ref()
            .canonicalize()
            .with_context(|| format!("workspace does not exist: {}", path.as_ref().display()))?;
        if !root.is_dir() {
            bail!("workspace must be a directory: {}", root.display());
        }
        Ok(Self { root })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn snapshot(&self) -> Result<WorkspaceSnapshot> {
        let files = self.source_files()?;
        let paths = files
            .iter()
            .map(|file| file.relative_path.as_str())
            .collect::<Vec<_>>();
        Ok(WorkspaceSnapshot {
            name: self
                .root
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("workspace")
                .to_owned(),
            root: self.root.to_string_lossy().to_string(),
            entries: build_tree(&paths),
        })
    }

    pub fn source_files(&self) -> Result<Vec<SourceFile>> {
        let mut files = WalkBuilder::new(&self.root)
            .hidden(false)
            .git_ignore(true)
            .filter_entry(|entry| {
                !matches!(
                    entry.file_name().to_str(),
                    Some("node_modules" | "dist" | "target")
                )
            })
            .build()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().is_some_and(|kind| kind.is_file()))
            .filter(|entry| {
                entry
                    .path()
                    .extension()
                    .is_some_and(|extension| extension == "ts")
            })
            .map(|entry| {
                let absolute_path = entry.path().to_path_buf();
                let relative_path = self.relative_string(&absolute_path)?;
                let content = fs::read_to_string(&absolute_path)
                    .with_context(|| format!("could not read {}", absolute_path.display()))?;
                Ok(SourceFile {
                    absolute_path,
                    relative_path,
                    content,
                })
            })
            .collect::<Result<Vec<_>>>()?;
        files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
        Ok(files)
    }

    pub fn read_file(&self, relative_path: &str) -> Result<String> {
        let path = self.resolve_safe_path(relative_path)?;
        fs::read_to_string(&path).with_context(|| format!("could not read {}", path.display()))
    }

    pub fn write_file(&self, relative_path: &str, content: &str) -> Result<()> {
        let path = self.resolve_safe_path(relative_path)?;
        if path.extension().is_none_or(|extension| extension != "ts") {
            bail!("V1 only edits TypeScript files");
        }
        fs::write(&path, content).with_context(|| format!("could not write {}", path.display()))
    }

    fn relative_string(&self, path: &Path) -> Result<String> {
        Ok(path
            .strip_prefix(&self.root)?
            .to_string_lossy()
            .replace('\\', "/"))
    }

    fn resolve_safe_path(&self, relative_path: &str) -> Result<PathBuf> {
        let requested = Path::new(relative_path);
        if requested.is_absolute()
            || requested
                .components()
                .any(|component| matches!(component, Component::ParentDir | Component::Prefix(_)))
        {
            bail!("path escapes the workspace");
        }
        let resolved = self.root.join(requested);
        if !resolved.starts_with(&self.root) {
            bail!("path escapes the workspace");
        }
        Ok(resolved)
    }
}

fn build_tree(paths: &[&str]) -> Vec<WorkspaceEntry> {
    let mut roots = Vec::<WorkspaceEntry>::new();
    for path in paths {
        insert_path(&mut roots, path, "");
    }
    roots
}

fn insert_path(entries: &mut Vec<WorkspaceEntry>, remaining: &str, parent: &str) {
    let Some((head, tail)) = remaining.split_once('/') else {
        entries.push(WorkspaceEntry {
            name: remaining.to_owned(),
            path: join_path(parent, remaining),
            kind: WorkspaceEntryKind::File,
            children: Vec::new(),
        });
        entries.sort_by(entry_order);
        return;
    };

    let current_path = join_path(parent, head);
    let directory = if let Some(index) = entries.iter().position(|entry| entry.name == head) {
        &mut entries[index]
    } else {
        entries.push(WorkspaceEntry {
            name: head.to_owned(),
            path: current_path.clone(),
            kind: WorkspaceEntryKind::Directory,
            children: Vec::new(),
        });
        entries.last_mut().expect("entry was inserted")
    };
    insert_path(&mut directory.children, tail, &current_path);
    entries.sort_by(entry_order);
}

fn join_path(parent: &str, child: &str) -> String {
    if parent.is_empty() {
        child.to_owned()
    } else {
        format!("{parent}/{child}")
    }
}

fn entry_order(left: &WorkspaceEntry, right: &WorkspaceEntry) -> std::cmp::Ordering {
    let left_rank = matches!(left.kind, WorkspaceEntryKind::File);
    let right_rank = matches!(right.kind, WorkspaceEntryKind::File);
    left_rank.cmp(&right_rank).then(left.name.cmp(&right.name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_sorted_directory_tree() {
        let tree = build_tree(&["src/z.ts", "src/a.ts", "root.ts"]);
        assert_eq!(tree[0].name, "src");
        assert_eq!(tree[0].children[0].path, "src/a.ts");
        assert_eq!(tree[1].name, "root.ts");
    }

    #[test]
    fn rejects_parent_paths() {
        let service = WorkspaceService {
            root: PathBuf::from("C:/workspace"),
        };
        assert!(service.resolve_safe_path("../secret.ts").is_err());
    }
}
