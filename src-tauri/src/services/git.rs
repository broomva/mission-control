use std::collections::HashMap;
use std::sync::Mutex;

use git2::{Oid, Repository, Sort, StatusOptions, WorktreeAddOptions, WorktreePruneOptions};

use crate::models::git::{
    BranchInfo, CommitInfo, DiffHunk, DiffInfo, DiffLine, DiffStats, FileDiff, FileStatusEntry,
    WorktreeInfo,
};
use crate::models::AppError;

pub struct GitService {
    repos: Mutex<HashMap<String, Repository>>,
}

impl GitService {
    pub fn new() -> Self {
        Self {
            repos: Mutex::new(HashMap::new()),
        }
    }

    fn open_or_get_repo(&self, project_id: &str, path: &str) -> Result<(), AppError> {
        let mut repos = self.repos.lock().unwrap();
        if !repos.contains_key(project_id) {
            let repo = Repository::discover(path)?;
            repos.insert(project_id.to_string(), repo);
        }
        Ok(())
    }

    pub fn get_status(
        &self,
        project_id: &str,
        path: &str,
    ) -> Result<Vec<FileStatusEntry>, AppError> {
        self.open_or_get_repo(project_id, path)?;
        let repos = self.repos.lock().unwrap();
        let repo = repos
            .get(project_id)
            .ok_or_else(|| AppError::GitError("Repository not found in cache".into()))?;

        let mut opts = StatusOptions::new();
        opts.include_untracked(true)
            .recurse_untracked_dirs(true)
            .include_unmodified(false);

        let statuses = repo.statuses(Some(&mut opts))?;
        let mut entries = Vec::new();

        for entry in statuses.iter() {
            let path = entry.path().unwrap_or("").to_string();
            let s = entry.status();

            let status_str = if s.is_conflicted() {
                "conflicted"
            } else if s.is_index_new() || s.is_index_modified() || s.is_index_deleted() {
                "staged"
            } else if s.is_wt_deleted() || s.is_index_deleted() {
                "deleted"
            } else if s.is_wt_renamed() || s.is_index_renamed() {
                "renamed"
            } else if s.is_wt_modified() {
                "modified"
            } else if s.is_wt_new() {
                "untracked"
            } else {
                continue;
            };

            entries.push(FileStatusEntry {
                path,
                status: status_str.to_string(),
            });
        }

        Ok(entries)
    }

    pub fn get_log(
        &self,
        project_id: &str,
        path: &str,
        offset: u32,
        limit: u32,
    ) -> Result<Vec<CommitInfo>, AppError> {
        self.open_or_get_repo(project_id, path)?;
        let repos = self.repos.lock().unwrap();
        let repo = repos
            .get(project_id)
            .ok_or_else(|| AppError::GitError("Repository not found in cache".into()))?;

        // Build branch ref map: oid -> [branch names]
        let mut ref_map: HashMap<Oid, Vec<String>> = HashMap::new();
        if let Ok(refs) = repo.references() {
            for reference in refs.flatten() {
                if let Some(name) = reference.shorthand() {
                    if let Some(target) = reference.target() {
                        ref_map
                            .entry(target)
                            .or_default()
                            .push(name.to_string());
                    }
                }
            }
        }

        let mut revwalk = repo.revwalk()?;
        revwalk.push_head()?;
        revwalk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)?;

        let mut commits = Vec::new();
        let mut count = 0u32;

        for oid_result in revwalk {
            let oid = oid_result?;
            if count < offset {
                count += 1;
                continue;
            }
            if commits.len() as u32 >= limit {
                break;
            }

            let commit = repo.find_commit(oid)?;
            let short_oid = oid.to_string()[..7].to_string();
            let message = commit
                .message()
                .unwrap_or("")
                .to_string();
            let author = commit.author();
            let author_name = author.name().unwrap_or("Unknown").to_string();
            let author_email = author.email().unwrap_or("").to_string();
            let timestamp = commit.time().seconds();
            let parents: Vec<String> = commit
                .parent_ids()
                .map(|p| p.to_string())
                .collect();
            let branch_refs = ref_map
                .get(&oid)
                .cloned()
                .unwrap_or_default();

            commits.push(CommitInfo {
                oid: oid.to_string(),
                short_oid,
                message,
                author: author_name,
                author_email,
                timestamp,
                parents,
                branch_refs,
            });

            count += 1;
        }

        Ok(commits)
    }

    pub fn get_diff(
        &self,
        project_id: &str,
        path: &str,
        oid_str: &str,
    ) -> Result<DiffInfo, AppError> {
        self.open_or_get_repo(project_id, path)?;
        let repos = self.repos.lock().unwrap();
        let repo = repos
            .get(project_id)
            .ok_or_else(|| AppError::GitError("Repository not found in cache".into()))?;

        let oid = Oid::from_str(oid_str)
            .map_err(|e| AppError::GitError(format!("Invalid OID: {}", e)))?;
        let commit = repo.find_commit(oid)?;
        let tree = commit.tree()?;

        let parent_tree = if commit.parent_count() > 0 {
            Some(commit.parent(0)?.tree()?)
        } else {
            None
        };

        let diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None)?;

        let mut files: Vec<FileDiff> = Vec::new();
        let mut total_insertions: u32 = 0;
        let mut total_deletions: u32 = 0;
        let mut current_file_path = String::new();

        diff.print(git2::DiffFormat::Patch, |delta, hunk, line| {
            let file_path = delta
                .new_file()
                .path()
                .unwrap_or(std::path::Path::new(""))
                .to_string_lossy()
                .to_string();

            // New file delta — push a new FileDiff if path changed
            if file_path != current_file_path {
                let status = match delta.status() {
                    git2::Delta::Added => "added",
                    git2::Delta::Deleted => "deleted",
                    git2::Delta::Modified => "modified",
                    git2::Delta::Renamed => "renamed",
                    _ => "modified",
                };

                let old_path = if delta.status() == git2::Delta::Renamed {
                    delta
                        .old_file()
                        .path()
                        .map(|p| p.to_string_lossy().to_string())
                } else {
                    None
                };

                files.push(FileDiff {
                    path: file_path.clone(),
                    status: status.to_string(),
                    old_path,
                    hunks: Vec::new(),
                });
                current_file_path = file_path;
            }

            match line.origin() {
                'H' => {
                    // Hunk header
                    if let Some(hunk_header) = hunk {
                        let header = std::str::from_utf8(hunk_header.header())
                            .unwrap_or("")
                            .trim_end()
                            .to_string();
                        if let Some(file) = files.last_mut() {
                            file.hunks.push(DiffHunk {
                                header,
                                lines: Vec::new(),
                            });
                        }
                    }
                }
                '+' => {
                    total_insertions += 1;
                    let content = std::str::from_utf8(line.content())
                        .unwrap_or("")
                        .to_string();
                    if let Some(file) = files.last_mut() {
                        if let Some(h) = file.hunks.last_mut() {
                            h.lines.push(DiffLine {
                                origin: "+".to_string(),
                                content,
                                old_lineno: line.old_lineno(),
                                new_lineno: line.new_lineno(),
                            });
                        }
                    }
                }
                '-' => {
                    total_deletions += 1;
                    let content = std::str::from_utf8(line.content())
                        .unwrap_or("")
                        .to_string();
                    if let Some(file) = files.last_mut() {
                        if let Some(h) = file.hunks.last_mut() {
                            h.lines.push(DiffLine {
                                origin: "-".to_string(),
                                content,
                                old_lineno: line.old_lineno(),
                                new_lineno: line.new_lineno(),
                            });
                        }
                    }
                }
                ' ' => {
                    let content = std::str::from_utf8(line.content())
                        .unwrap_or("")
                        .to_string();
                    if let Some(file) = files.last_mut() {
                        if let Some(h) = file.hunks.last_mut() {
                            h.lines.push(DiffLine {
                                origin: " ".to_string(),
                                content,
                                old_lineno: line.old_lineno(),
                                new_lineno: line.new_lineno(),
                            });
                        }
                    }
                }
                _ => {}
            }
            true
        })?;

        Ok(DiffInfo {
            commit_oid: oid_str.to_string(),
            stats: DiffStats {
                files_changed: files.len() as u32,
                insertions: total_insertions,
                deletions: total_deletions,
            },
            files,
        })
    }

    pub fn get_branches(
        &self,
        project_id: &str,
        path: &str,
    ) -> Result<Vec<BranchInfo>, AppError> {
        self.open_or_get_repo(project_id, path)?;
        let repos = self.repos.lock().unwrap();
        let repo = repos
            .get(project_id)
            .ok_or_else(|| AppError::GitError("Repository not found in cache".into()))?;

        let mut branches = Vec::new();
        let head = repo.head().ok();
        let head_target = head.as_ref().and_then(|h| h.target());

        for branch_result in repo.branches(Some(git2::BranchType::Local))? {
            let (branch, _branch_type) = branch_result?;
            let name = branch
                .name()?
                .unwrap_or("unknown")
                .to_string();
            let oid = branch
                .get()
                .target()
                .map(|o| o.to_string())
                .unwrap_or_default();
            let is_head = head_target
                .map(|h| h.to_string() == oid)
                .unwrap_or(false);
            let upstream = branch
                .upstream()
                .ok()
                .and_then(|u| u.name().ok().flatten().map(|n| n.to_string()));

            branches.push(BranchInfo {
                name,
                is_head,
                upstream,
                oid,
            });
        }

        Ok(branches)
    }

    pub fn list_worktrees(
        &self,
        project_id: &str,
        path: &str,
    ) -> Result<Vec<WorktreeInfo>, AppError> {
        self.open_or_get_repo(project_id, path)?;
        let repos = self.repos.lock().unwrap();
        let repo = repos
            .get(project_id)
            .ok_or_else(|| AppError::GitError("Repository not found in cache".into()))?;

        let mut worktrees = Vec::new();

        // Add the main worktree
        let main_path = repo
            .workdir()
            .unwrap_or_else(|| repo.path())
            .to_string_lossy()
            .to_string();

        // Trim trailing slash for consistency
        let main_path = main_path.trim_end_matches('/').to_string();

        let main_branch = repo
            .head()
            .ok()
            .and_then(|h| h.shorthand().map(|s| s.to_string()));

        worktrees.push(WorktreeInfo {
            name: "main".to_string(),
            path: main_path,
            branch: main_branch,
            is_main: true,
        });

        // List linked worktrees
        let wt_names = repo.worktrees()?;
        for i in 0..wt_names.len() {
            if let Some(name) = wt_names.get(i) {
                if let Ok(wt) = repo.find_worktree(name) {
                    let wt_path = wt.path().to_string_lossy().trim_end_matches('/').to_string();

                    // Open the worktree repo to get HEAD branch
                    let branch = Repository::open(&wt_path)
                        .ok()
                        .and_then(|wt_repo| {
                            wt_repo.head().ok().and_then(|h| {
                                h.shorthand().map(|s| s.to_string())
                            })
                        });

                    worktrees.push(WorktreeInfo {
                        name: name.to_string(),
                        path: wt_path,
                        branch,
                        is_main: false,
                    });
                }
            }
        }

        Ok(worktrees)
    }

    pub fn create_worktree(
        &self,
        project_id: &str,
        path: &str,
        name: &str,
        branch: &str,
    ) -> Result<WorktreeInfo, AppError> {
        self.open_or_get_repo(project_id, path)?;
        let repos = self.repos.lock().unwrap();
        let repo = repos
            .get(project_id)
            .ok_or_else(|| AppError::GitError("Repository not found in cache".into()))?;

        // Resolve target directory: sibling .worktrees/{name}
        let work_dir = repo
            .workdir()
            .ok_or_else(|| AppError::GitError("Bare repository, no workdir".into()))?;
        let worktree_base = work_dir.join(".worktrees");
        std::fs::create_dir_all(&worktree_base).map_err(|e| {
            AppError::GitError(format!("Failed to create .worktrees dir: {}", e))
        })?;
        let wt_path = worktree_base.join(name);

        // Create the branch from HEAD if it doesn't exist
        let head_commit = repo
            .head()?
            .peel_to_commit()
            .map_err(|e| AppError::GitError(format!("Cannot resolve HEAD: {}", e)))?;

        let branch_ref = match repo.find_branch(branch, git2::BranchType::Local) {
            Ok(b) => b.into_reference(),
            Err(_) => {
                // Create new branch at HEAD
                repo.branch(branch, &head_commit, false)?
                    .into_reference()
            }
        };

        let mut opts = WorktreeAddOptions::new();
        opts.reference(Some(&branch_ref));

        let wt = repo
            .worktree(name, &wt_path, Some(&opts))
            .map_err(|e| AppError::GitError(format!("Failed to create worktree: {}", e)))?;

        let wt_path_str = wt.path().to_string_lossy().trim_end_matches('/').to_string();

        Ok(WorktreeInfo {
            name: name.to_string(),
            path: wt_path_str,
            branch: Some(branch.to_string()),
            is_main: false,
        })
    }

    pub fn remove_worktree(
        &self,
        project_id: &str,
        path: &str,
        name: &str,
    ) -> Result<(), AppError> {
        self.open_or_get_repo(project_id, path)?;
        let repos = self.repos.lock().unwrap();
        let repo = repos
            .get(project_id)
            .ok_or_else(|| AppError::GitError("Repository not found in cache".into()))?;

        let wt = repo
            .find_worktree(name)
            .map_err(|e| AppError::GitError(format!("Worktree '{}' not found: {}", name, e)))?;

        // Remove the working directory on disk
        let wt_path = wt.path().to_path_buf();
        if wt_path.exists() {
            std::fs::remove_dir_all(&wt_path).map_err(|e| {
                AppError::GitError(format!(
                    "Failed to remove worktree directory {}: {}",
                    wt_path.display(),
                    e
                ))
            })?;
        }

        // Prune the worktree metadata
        let mut prune_opts = WorktreePruneOptions::new();
        prune_opts.valid(true).working_tree(true);
        wt.prune(Some(&mut prune_opts))
            .map_err(|e| AppError::GitError(format!("Failed to prune worktree: {}", e)))?;

        Ok(())
    }

    #[allow(dead_code)]
    pub fn refresh_repo(&self, project_id: &str, path: &str) -> Result<(), AppError> {
        let mut repos = self.repos.lock().unwrap();
        repos.remove(project_id);
        let repo = Repository::discover(path)?;
        repos.insert(project_id.to_string(), repo);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;

    fn init_test_repo(dir: &Path) -> Repository {
        let repo = Repository::init(dir).unwrap();
        // Configure user for test commits
        let mut config = repo.config().unwrap();
        config.set_str("user.name", "Test User").unwrap();
        config.set_str("user.email", "test@example.com").unwrap();
        repo
    }

    fn create_commit(repo: &Repository, path: &Path, filename: &str, content: &str, message: &str) {
        let file_path = path.join(filename);
        fs::write(&file_path, content).unwrap();

        let mut index = repo.index().unwrap();
        index.add_path(Path::new(filename)).unwrap();
        index.write().unwrap();
        let tree_oid = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_oid).unwrap();

        let sig = repo.signature().unwrap();
        let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());

        let parents: Vec<&git2::Commit> = parent.iter().collect();
        repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &parents)
            .unwrap();
    }

    #[test]
    fn test_get_status_empty_repo() {
        let tmp = tempfile::tempdir().unwrap();
        let _repo = init_test_repo(tmp.path());
        let service = GitService::new();

        let statuses = service
            .get_status("test", tmp.path().to_str().unwrap())
            .unwrap();
        assert!(statuses.is_empty());
    }

    #[test]
    fn test_get_status_with_changes() {
        let tmp = tempfile::tempdir().unwrap();
        let repo = init_test_repo(tmp.path());

        // Create initial commit
        create_commit(&repo, tmp.path(), "existing.txt", "hello", "initial");

        // Add untracked file
        fs::write(tmp.path().join("untracked.txt"), "new").unwrap();

        // Modify tracked file
        fs::write(tmp.path().join("existing.txt"), "modified").unwrap();

        let service = GitService::new();
        let statuses = service
            .get_status("test", tmp.path().to_str().unwrap())
            .unwrap();

        assert!(statuses.len() >= 2);
        let untracked = statuses.iter().find(|s| s.path == "untracked.txt");
        assert!(untracked.is_some());
        assert_eq!(untracked.unwrap().status, "untracked");

        let modified = statuses.iter().find(|s| s.path == "existing.txt");
        assert!(modified.is_some());
        assert_eq!(modified.unwrap().status, "modified");
    }

    #[test]
    fn test_get_log() {
        let tmp = tempfile::tempdir().unwrap();
        let repo = init_test_repo(tmp.path());

        create_commit(&repo, tmp.path(), "file1.txt", "hello", "first commit");
        create_commit(&repo, tmp.path(), "file2.txt", "world", "second commit");

        let service = GitService::new();
        let log = service
            .get_log("test", tmp.path().to_str().unwrap(), 0, 10)
            .unwrap();

        assert_eq!(log.len(), 2);
        assert!(log[0].message.contains("second commit"));
        assert!(log[1].message.contains("first commit"));
        assert_eq!(log[0].author, "Test User");
        assert_eq!(log[0].short_oid.len(), 7);
    }

    #[test]
    fn test_get_diff() {
        let tmp = tempfile::tempdir().unwrap();
        let repo = init_test_repo(tmp.path());

        create_commit(&repo, tmp.path(), "file1.txt", "line1\nline2\n", "initial");
        create_commit(
            &repo,
            tmp.path(),
            "file1.txt",
            "line1\nmodified\nline3\n",
            "modify file",
        );

        let head = repo.head().unwrap().target().unwrap();

        let service = GitService::new();
        let diff = service
            .get_diff("test", tmp.path().to_str().unwrap(), &head.to_string())
            .unwrap();

        assert_eq!(diff.stats.files_changed, 1);
        assert!(diff.stats.insertions > 0 || diff.stats.deletions > 0);
        assert_eq!(diff.files[0].path, "file1.txt");
    }

    #[test]
    fn test_get_branches() {
        let tmp = tempfile::tempdir().unwrap();
        let repo = init_test_repo(tmp.path());

        create_commit(&repo, tmp.path(), "file.txt", "hello", "initial");

        // Create a second branch
        let head = repo.head().unwrap().peel_to_commit().unwrap();
        repo.branch("feature", &head, false).unwrap();

        let service = GitService::new();
        let branches = service
            .get_branches("test", tmp.path().to_str().unwrap())
            .unwrap();

        assert!(branches.len() >= 2);
        let main_branch = branches.iter().find(|b| b.is_head);
        assert!(main_branch.is_some());
        let feature = branches.iter().find(|b| b.name == "feature");
        assert!(feature.is_some());
    }

    #[test]
    fn test_list_worktrees_main_only() {
        let tmp = tempfile::tempdir().unwrap();
        let repo = init_test_repo(tmp.path());
        create_commit(&repo, tmp.path(), "file.txt", "hello", "initial");

        let service = GitService::new();
        let worktrees = service
            .list_worktrees("test", tmp.path().to_str().unwrap())
            .unwrap();

        assert_eq!(worktrees.len(), 1);
        assert!(worktrees[0].is_main);
        assert_eq!(worktrees[0].name, "main");
        assert!(worktrees[0].branch.is_some());
    }

    #[test]
    fn test_create_and_list_worktree() {
        let tmp = tempfile::tempdir().unwrap();
        let repo = init_test_repo(tmp.path());
        create_commit(&repo, tmp.path(), "file.txt", "hello", "initial");

        let service = GitService::new();
        let path_str = tmp.path().to_str().unwrap();

        // Create a worktree
        let wt = service
            .create_worktree("test", path_str, "my-wt", "feature/wt")
            .unwrap();
        assert_eq!(wt.name, "my-wt");
        assert_eq!(wt.branch, Some("feature/wt".to_string()));
        assert!(!wt.is_main);

        // List should show 2 worktrees
        // Need a fresh service to avoid stale cached repo
        let service2 = GitService::new();
        let worktrees = service2
            .list_worktrees("test2", path_str)
            .unwrap();
        assert_eq!(worktrees.len(), 2);

        let linked = worktrees.iter().find(|w| w.name == "my-wt");
        assert!(linked.is_some());
        assert!(!linked.unwrap().is_main);
    }

    #[test]
    fn test_create_and_remove_worktree() {
        let tmp = tempfile::tempdir().unwrap();
        let repo = init_test_repo(tmp.path());
        create_commit(&repo, tmp.path(), "file.txt", "hello", "initial");

        let service = GitService::new();
        let path_str = tmp.path().to_str().unwrap();

        // Create
        service
            .create_worktree("test", path_str, "to-remove", "feature/remove")
            .unwrap();

        // Remove
        service
            .remove_worktree("test", path_str, "to-remove")
            .unwrap();

        // List should show only main
        let service2 = GitService::new();
        let worktrees = service2
            .list_worktrees("test2", path_str)
            .unwrap();
        assert_eq!(worktrees.len(), 1);
        assert!(worktrees[0].is_main);
    }
}
