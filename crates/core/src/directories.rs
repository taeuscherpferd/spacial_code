use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

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
    /// Filesystem roots (drives on Windows), so browsing can leave the current drive.
    pub roots: Vec<Directory>,
}

impl DirectoryListing {
    pub fn read(path: impl AsRef<Path>) -> Result<Self> {
        let root = canonical_path(path.as_ref()).context("folder does not exist")?;
        let mut directories = Vec::new();
        // Entries that can't be read (permissions, broken links) are skipped, not fatal.
        for entry in fs::read_dir(&root)
            .context("could not browse folder")?
            .flatten()
        {
            if entry.path().is_dir() {
                directories.push(Directory {
                    name: entry.file_name().to_string_lossy().into_owned(),
                    path: entry.path().to_string_lossy().into_owned(),
                });
            }
        }
        directories.sort_by_cached_key(|directory| directory.name.to_lowercase());
        Ok(Self {
            path: root.to_string_lossy().into_owned(),
            parent: root
                .parent()
                .map(|parent| parent.to_string_lossy().into_owned()),
            directories,
            roots: filesystem_roots(),
        })
    }
}

/// `Path::canonicalize` without the `\\?\` prefix Windows adds to local drive paths, which
/// is noise when shown and breaks comparisons with paths people type.
pub fn canonical_path(path: &Path) -> std::io::Result<PathBuf> {
    let canonical = path.canonicalize()?;
    Ok(without_verbatim_prefix(&canonical).unwrap_or(canonical))
}

fn without_verbatim_prefix(path: &Path) -> Option<PathBuf> {
    let rest = path.to_str()?.strip_prefix(r"\\?\")?;
    // Only `\\?\C:\...`; `\\?\UNC\...` and device paths need the prefix to stay valid.
    let drive = rest.as_bytes();
    (drive.len() >= 2 && drive[0].is_ascii_alphabetic() && drive[1] == b':')
        .then(|| PathBuf::from(rest))
}

#[cfg(windows)]
fn filesystem_roots() -> Vec<Directory> {
    (b'A'..=b'Z')
        .map(|letter| format!("{}:\\", letter as char))
        .filter(|root| Path::new(root).is_dir())
        .map(|root| Directory {
            name: root.clone(),
            path: root,
        })
        .collect()
}

#[cfg(not(windows))]
fn filesystem_roots() -> Vec<Directory> {
    vec![Directory {
        name: "/".to_owned(),
        path: "/".to_owned(),
    }]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_only_sorted_directories_and_resolves_parent() {
        let root = std::env::temp_dir().join(format!("spatial-directories-{}", std::process::id()));
        fs::create_dir_all(root.join("Zeta")).unwrap();
        fs::create_dir_all(root.join("b")).unwrap();
        fs::create_dir_all(root.join("a")).unwrap();
        fs::write(root.join("file.ts"), "").unwrap();
        let listing = DirectoryListing::read(&root).unwrap();
        assert_eq!(
            listing
                .directories
                .iter()
                .map(|entry| entry.name.as_str())
                .collect::<Vec<_>>(),
            ["a", "b", "Zeta"]
        );
        assert_eq!(
            listing.parent,
            canonical_path(&root)
                .unwrap()
                .parent()
                .map(|path| path.to_string_lossy().into_owned())
        );
        assert!(!listing.path.starts_with(r"\\?\"));
        assert!(!listing.roots.is_empty());
        assert!(DirectoryListing::read(root.join("file.ts")).is_err());
        assert!(DirectoryListing::read(root.join("missing")).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn strips_only_local_drive_verbatim_prefixes() {
        assert_eq!(
            without_verbatim_prefix(Path::new(r"\\?\D:\projects")),
            Some(PathBuf::from(r"D:\projects"))
        );
        assert_eq!(
            without_verbatim_prefix(Path::new(r"\\?\UNC\server\share")),
            None
        );
        assert_eq!(without_verbatim_prefix(Path::new("/home/me")), None);
    }
}
