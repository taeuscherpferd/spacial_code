use std::path::PathBuf;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SourceFile {
    pub absolute_path: PathBuf,
    pub relative_path: String,
    pub content: String,
}
