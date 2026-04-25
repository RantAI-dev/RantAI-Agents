//! Git update helper: stash any uncommitted changes, fast-forward the working
//! tree, restore the stash. Used by Phase::Update and the `rantai-agents update`
//! CLI subcommand.

use tokio::sync::mpsc::Sender;

use super::executor::InstallMessage;
use super::run_command;

pub struct UpdateResult {
    pub old_sha: String,
    pub new_sha: String,
    pub stash_used: bool,
}

pub async fn git_update(
    install_dir: &str,
    branch: &str,
    tx: &Sender<InstallMessage>,
) -> Result<UpdateResult, String> {
    let old_sha = sha_at(install_dir);

    let dirty = !run_command("git", &["-C", install_dir, "status", "--porcelain"])?
        .trim()
        .is_empty();

    let stash_name = format!(
        "rantai-agents-installer-autostash-{}",
        chrono::Utc::now().format("%Y%m%d-%H%M%S")
    );
    let mut stash_used = false;
    if dirty {
        tx.send(InstallMessage::Progress(
            "Local changes detected — stashing...".into(),
        ))
        .await
        .ok();
        run_command(
            "git",
            &[
                "-C",
                install_dir,
                "stash",
                "push",
                "--include-untracked",
                "-m",
                &stash_name,
            ],
        )?;
        stash_used = true;
    }

    tx.send(InstallMessage::Progress(format!("Fetching {branch}...")))
        .await
        .ok();
    run_command("git", &["-C", install_dir, "fetch", "origin", branch])?;
    run_command("git", &["-C", install_dir, "checkout", branch])?;
    run_command(
        "git",
        &["-C", install_dir, "pull", "--ff-only", "origin", branch],
    )?;

    if stash_used {
        tx.send(InstallMessage::Progress(
            "Restoring stashed local changes...".into(),
        ))
        .await
        .ok();
        if run_command("git", &["-C", install_dir, "stash", "pop"]).is_err() {
            tx.send(InstallMessage::Log(
                crate::app::LogLevel::Warning,
                format!(
                    "Stash {stash_name} could not be auto-popped (likely conflicts). \
                     Resolve manually: `git -C {install_dir} stash list`",
                ),
            ))
            .await
            .ok();
        }
    }

    Ok(UpdateResult {
        old_sha,
        new_sha: sha_at(install_dir),
        stash_used,
    })
}

fn sha_at(install_dir: &str) -> String {
    super::current_git_sha(install_dir)
}
