use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WorktreeInfo {
    pub name: String,
    pub path: String,
    pub branch: Option<String>,
    pub is_main: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CommitInfo {
    pub oid: String,
    pub short_oid: String,
    pub message: String,
    pub author: String,
    pub author_email: String,
    pub timestamp: i64,
    pub parents: Vec<String>,
    pub branch_refs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FileStatusEntry {
    pub path: String,
    /// "modified" | "staged" | "untracked" | "conflicted" | "deleted" | "renamed"
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BranchInfo {
    pub name: String,
    pub is_head: bool,
    pub upstream: Option<String>,
    pub oid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DiffInfo {
    pub commit_oid: String,
    pub files: Vec<FileDiff>,
    pub stats: DiffStats,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DiffStats {
    pub files_changed: u32,
    pub insertions: u32,
    pub deletions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FileDiff {
    pub path: String,
    /// "added" | "modified" | "deleted" | "renamed"
    pub status: String,
    pub old_path: Option<String>,
    pub hunks: Vec<DiffHunk>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DiffHunk {
    pub header: String,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DiffLine {
    /// "+" | "-" | " "
    pub origin: String,
    pub content: String,
    pub old_lineno: Option<u32>,
    pub new_lineno: Option<u32>,
}
