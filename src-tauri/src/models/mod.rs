pub mod agent;
pub mod error;
pub mod events;
pub mod fs;
pub mod git;
pub mod project;
pub mod session;
pub mod terminal;
pub mod workspace;

pub use agent::{AgentEvent, AgentInfo, TokenUsage};
pub use error::AppError;
pub use session::ClaudeSession;
pub use events::{
    AgentExitEvent, AgentOutputEvent, AgentStatusEvent, FsChangeEvent, GitRefChangedEvent,
    TerminalDataEvent, TerminalExitEvent,
};
pub use fs::DirectoryEntry;
// Re-exported for crate-level API surface (used by commands/git.rs via crate::models::git::*)
#[allow(unused_imports)]
pub use git::{
    BranchInfo, CheckpointInfo, CommitDetail, CommitInfo, DiffFile, DiffInfo, FileStatusEntry,
    GitGraphData, GraphCommit, GraphEdge, RefLabel, WorktreeInfo,
};
pub use project::Project;
pub use terminal::TerminalInfo;
pub use workspace::WorkspaceState;
