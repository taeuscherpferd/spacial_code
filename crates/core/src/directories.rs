use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Directory {
    pub name: String,
    pub path: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DirectoryListing {
    pub path: String,
    pub parent: Option<String>,
    pub directories: Vec<Directory>,
}

impl DirectoryListing {
    pub fn read(path: impl AsRef<Path>) -> Result<Self> {
        let root = path
            .as_ref()
            .canonicalize()
            .context("folder does not exist")?;
        let mut directories = Vec::new();
        for entry in fs::read_dir(&root).context("could not browse folder")? {
            let entry = entry?;
            if entry.path().is_dir() {
                directories.push(Directory {
                    name: entry.file_name().to_string_lossy().into_owned(),
                    path: entry.path().to_string_lossy().into_owned(),
                });
            }
        }
        directories.sort_by(|left, right| left.name.cmp(&right.name));
        Ok(Self {
            path: root.to_string_lossy().into_owned(),
            parent: root
                .parent()
                .map(|parent| parent.to_string_lossy().into_owned()),
            directories,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_only_sorted_directories_and_resolves_parent() {
        let root = std::env::temp_dir().join(format!("spatial-directories-{}", std::process::id()));
        fs::create_dir_all(root.join("z")).unwrap();
        fs::create_dir_all(root.join("a")).unwrap();
        fs::write(root.join("file.ts"), "").unwrap();
        let listing = DirectoryListing::read(&root).unwrap();
        assert_eq!(
            listing
                .directories
                .iter()
                .map(|entry| entry.name.as_str())
                .collect::<Vec<_>>(),
            ["a", "z"]
        );
        assert_eq!(
            listing.parent,
            root.canonicalize()
                .unwrap()
                .parent()
                .map(|path| path.to_string_lossy().into_owned())
        );
        assert!(DirectoryListing::read(root.join("file.ts")).is_err());
        assert!(DirectoryListing::read(root.join("missing")).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
