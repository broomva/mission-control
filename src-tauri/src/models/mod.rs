pub mod error;
pub mod events;
pub mod fs;
pub mod git;
pub mod project;
pub mod terminal;
pub mod workspace;

pub use error::AppError;
pub use events::{FsChangeEvent, GitRefChangedEvent, TerminalDataEvent, TerminalExitEvent};
pub use fs::DirectoryEntry;
// Re-exported for crate-level API surface (used by commands/git.rs via crate::models::git::*)
#[allow(unused_imports)]
pub use git::{BranchInfo, CommitInfo, DiffInfo, FileStatusEntry};
pub use project::Project;
pub use terminal::TerminalInfo;
pub use workspace::WorkspaceState;
