# RantaiClaw Task Engine Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a task management engine to RantaiClaw so agents can create, execute, review, and coordinate tasks — making RantaiClaw the runtime engine for the ClickUp-inspired task system.

**Architecture:** New `src/tasks/` module following the existing cron pattern: typed structs in `types.rs`, SQLite WAL storage in `store.rs`, validated state machine in `state.rs`, gateway API in `gateway/mod.rs`, and 8 agent tools implementing the `Tool` trait. No new dependencies — reuses existing `rusqlite`, `chrono`, `uuid`, `serde`, `axum`.

**Tech Stack:** Rust, rusqlite (bundled), axum, serde_json, chrono, uuid

**Spec:** `docs/superpowers/specs/2026-03-12-clickup-task-system-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/tasks/mod.rs` | Create | Module root, re-exports, CLI command handler |
| `src/tasks/types.rs` | Create | `Task`, `TaskComment`, `TaskEvent`, status/priority enums, `TaskPatch` |
| `src/tasks/state.rs` | Create | State machine: valid transitions, review flow logic |
| `src/tasks/store.rs` | Create | SQLite CRUD: create, list, get, update, delete, comments, events |
| `src/lib.rs` | Modify | Add `pub mod tasks;` and `TaskCommands` enum |
| `src/main.rs` | Modify | Wire `TaskCommands` to `tasks::handle_command()` |
| `src/config/schema.rs` | Modify | Add `TasksConfig` section to `Config` |
| `src/gateway/mod.rs` | Modify | Add `/tasks/*` routes, extend `AppState` |
| `src/gateway/tasks.rs` | Create | Axum handlers for task CRUD, review, comments, events |
| `src/tools/task_list.rs` | Create | `TaskListTool` — list assigned tasks |
| `src/tools/task_get.rs` | Create | `TaskGetTool` — get task detail |
| `src/tools/task_create.rs` | Create | `TaskCreateTool` — create task |
| `src/tools/task_update_status.rs` | Create | `TaskUpdateStatusTool` — move task status |
| `src/tools/task_create_subtask.rs` | Create | `TaskCreateSubtaskTool` — add subtask |
| `src/tools/task_complete_subtask.rs` | Create | `TaskCompleteSubtaskTool` — complete subtask |
| `src/tools/task_comment.rs` | Create | `TaskCommentTool` — add comment |
| `src/tools/task_read_comments.rs` | Create | `TaskReadCommentsTool` — read comments |
| `src/tools/mod.rs` | Modify | Register task tools in `all_tools_with_runtime()` |

---

## Chunk 1: Task Data Model, State Machine, and Storage

### Task 1: Define task types

**Files:**
- Create: `src/tasks/types.rs`

- [ ] **Step 1: Write the types file with all task structs and enums**

```rust
// src/tasks/types.rs
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// ── Status enum ──────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TaskStatus {
    #[default]
    Todo,
    InProgress,
    InReview,
    Done,
    Cancelled,
}

impl TaskStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Todo => "TODO",
            Self::InProgress => "IN_PROGRESS",
            Self::InReview => "IN_REVIEW",
            Self::Done => "DONE",
            Self::Cancelled => "CANCELLED",
        }
    }
}

impl TryFrom<&str> for TaskStatus {
    type Error = String;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value.to_uppercase().as_str() {
            "TODO" => Ok(Self::Todo),
            "IN_PROGRESS" => Ok(Self::InProgress),
            "IN_REVIEW" => Ok(Self::InReview),
            "DONE" => Ok(Self::Done),
            "CANCELLED" => Ok(Self::Cancelled),
            _ => Err(format!(
                "Invalid task status '{}'. Expected: TODO, IN_PROGRESS, IN_REVIEW, DONE, CANCELLED",
                value
            )),
        }
    }
}

// ── Priority enum ────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TaskPriority {
    Low,
    #[default]
    Medium,
    High,
}

impl TaskPriority {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Low => "LOW",
            Self::Medium => "MEDIUM",
            Self::High => "HIGH",
        }
    }
}

impl TryFrom<&str> for TaskPriority {
    type Error = String;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value.to_uppercase().as_str() {
            "LOW" => Ok(Self::Low),
            "MEDIUM" => Ok(Self::Medium),
            "HIGH" => Ok(Self::High),
            _ => Err(format!(
                "Invalid priority '{}'. Expected: LOW, MEDIUM, HIGH",
                value
            )),
        }
    }
}

// ── Review status ────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReviewStatus {
    Pending,
    Approved,
    ChangesRequested,
    Rejected,
}

impl ReviewStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "PENDING",
            Self::Approved => "APPROVED",
            Self::ChangesRequested => "CHANGES_REQUESTED",
            Self::Rejected => "REJECTED",
        }
    }
}

impl TryFrom<&str> for ReviewStatus {
    type Error = String;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value.to_uppercase().as_str() {
            "PENDING" => Ok(Self::Pending),
            "APPROVED" => Ok(Self::Approved),
            "CHANGES_REQUESTED" => Ok(Self::ChangesRequested),
            "REJECTED" => Ok(Self::Rejected),
            _ => Err(format!(
                "Invalid review status '{}'. Expected: PENDING, APPROVED, CHANGES_REQUESTED, REJECTED",
                value
            )),
        }
    }
}

// ── Actor type ───────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ActorType {
    Human,
    Employee,
}

impl ActorType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Human => "HUMAN",
            Self::Employee => "EMPLOYEE",
        }
    }
}

impl TryFrom<&str> for ActorType {
    type Error = String;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value.to_uppercase().as_str() {
            "HUMAN" => Ok(Self::Human),
            "EMPLOYEE" => Ok(Self::Employee),
            _ => Err(format!(
                "Invalid actor type '{}'. Expected: HUMAN, EMPLOYEE",
                value
            )),
        }
    }
}

// ── Event type ───────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TaskEventType {
    Created,
    StatusChanged,
    Assigned,
    ReviewSubmitted,
    ReviewResponded,
    Comment,
    SubtaskCompleted,
}

impl TaskEventType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Created => "CREATED",
            Self::StatusChanged => "STATUS_CHANGED",
            Self::Assigned => "ASSIGNED",
            Self::ReviewSubmitted => "REVIEW_SUBMITTED",
            Self::ReviewResponded => "REVIEW_RESPONDED",
            Self::Comment => "COMMENT",
            Self::SubtaskCompleted => "SUBTASK_COMPLETED",
        }
    }
}

impl TryFrom<&str> for TaskEventType {
    type Error = String;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value.to_uppercase().as_str() {
            "CREATED" => Ok(Self::Created),
            "STATUS_CHANGED" => Ok(Self::StatusChanged),
            "ASSIGNED" => Ok(Self::Assigned),
            "REVIEW_SUBMITTED" => Ok(Self::ReviewSubmitted),
            "REVIEW_RESPONDED" => Ok(Self::ReviewResponded),
            "COMMENT" => Ok(Self::Comment),
            "SUBTASK_COMPLETED" => Ok(Self::SubtaskCompleted),
            _ => Err(format!("Invalid event type '{}'", value)),
        }
    }
}

// ── Core structs ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub organization_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub priority: TaskPriority,
    pub assignee_id: Option<String>,
    pub group_id: Option<String>,
    pub reviewer_id: Option<String>,
    pub human_review: bool,
    pub review_status: Option<ReviewStatus>,
    pub review_comment: Option<String>,
    pub parent_task_id: Option<String>,
    pub created_by_employee_id: Option<String>,
    pub created_by_user_id: Option<String>,
    pub due_date: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub order_in_status: i32,
    pub order_in_parent: i32,
    pub metadata: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskComment {
    pub id: String,
    pub task_id: String,
    pub content: String,
    pub author_type: ActorType,
    pub author_employee_id: Option<String>,
    pub author_user_id: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskEvent {
    pub id: String,
    pub task_id: String,
    pub event_type: TaskEventType,
    pub actor_type: ActorType,
    pub actor_employee_id: Option<String>,
    pub actor_user_id: Option<String>,
    pub data: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

/// Full task detail including subtasks, comments, and events.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskDetail {
    pub task: Task,
    pub subtasks: Vec<Task>,
    pub comments: Vec<TaskComment>,
    pub events: Vec<TaskEvent>,
}

// ── Create / Update DTOs ─────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTask {
    pub title: String,
    pub description: Option<String>,
    pub priority: Option<TaskPriority>,
    pub assignee_id: Option<String>,
    pub group_id: Option<String>,
    pub reviewer_id: Option<String>,
    pub human_review: Option<bool>,
    pub parent_task_id: Option<String>,
    pub due_date: Option<DateTime<Utc>>,
    pub organization_id: Option<String>,
    pub created_by_employee_id: Option<String>,
    pub created_by_user_id: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TaskPatch {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<TaskStatus>,
    pub priority: Option<TaskPriority>,
    pub assignee_id: Option<Option<String>>,
    pub group_id: Option<Option<String>>,
    pub reviewer_id: Option<Option<String>>,
    pub human_review: Option<bool>,
    pub review_status: Option<Option<ReviewStatus>>,
    pub review_comment: Option<Option<String>>,
    pub due_date: Option<Option<DateTime<Utc>>>,
    pub order_in_status: Option<i32>,
    pub order_in_parent: Option<i32>,
    pub metadata: Option<serde_json::Value>,
}

// ── Review action ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReviewAction {
    Approve,
    Changes,
    Reject,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewRequest {
    pub action: ReviewAction,
    pub comment: Option<String>,
    pub actor_type: Option<ActorType>,
    pub actor_employee_id: Option<String>,
    pub actor_user_id: Option<String>,
}

// ── List filters ─────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TaskFilter {
    pub status: Option<TaskStatus>,
    pub assignee_id: Option<String>,
    pub group_id: Option<String>,
    pub priority: Option<TaskPriority>,
    pub parent_task_id: Option<String>,
    /// If true, only return top-level tasks (parent_task_id IS NULL)
    pub top_level_only: Option<bool>,
    pub organization_id: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}
```

- [ ] **Step 2: Write unit tests for enum conversions**

Add to the bottom of `src/tasks/types.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn task_status_roundtrip() {
        for status in [
            TaskStatus::Todo,
            TaskStatus::InProgress,
            TaskStatus::InReview,
            TaskStatus::Done,
            TaskStatus::Cancelled,
        ] {
            let s = status.as_str();
            let parsed = TaskStatus::try_from(s).unwrap();
            assert_eq!(parsed, status);
        }
    }

    #[test]
    fn task_status_case_insensitive() {
        assert_eq!(TaskStatus::try_from("todo").unwrap(), TaskStatus::Todo);
        assert_eq!(
            TaskStatus::try_from("in_progress").unwrap(),
            TaskStatus::InProgress
        );
    }

    #[test]
    fn task_status_rejects_invalid() {
        assert!(TaskStatus::try_from("INVALID").is_err());
        assert!(TaskStatus::try_from("").is_err());
    }

    #[test]
    fn task_priority_roundtrip() {
        for priority in [TaskPriority::Low, TaskPriority::Medium, TaskPriority::High] {
            let s = priority.as_str();
            let parsed = TaskPriority::try_from(s).unwrap();
            assert_eq!(parsed, priority);
        }
    }

    #[test]
    fn review_status_roundtrip() {
        for status in [
            ReviewStatus::Pending,
            ReviewStatus::Approved,
            ReviewStatus::ChangesRequested,
            ReviewStatus::Rejected,
        ] {
            let s = status.as_str();
            let parsed = ReviewStatus::try_from(s).unwrap();
            assert_eq!(parsed, status);
        }
    }

    #[test]
    fn actor_type_roundtrip() {
        assert_eq!(
            ActorType::try_from("HUMAN").unwrap(),
            ActorType::Human
        );
        assert_eq!(
            ActorType::try_from("EMPLOYEE").unwrap(),
            ActorType::Employee
        );
    }

    #[test]
    fn task_serialization_roundtrip() {
        let task = Task {
            id: "test-id".into(),
            organization_id: None,
            title: "Test task".into(),
            description: Some("A test".into()),
            status: TaskStatus::Todo,
            priority: TaskPriority::High,
            assignee_id: None,
            group_id: None,
            reviewer_id: None,
            human_review: false,
            review_status: None,
            review_comment: None,
            parent_task_id: None,
            created_by_employee_id: Some("emp-1".into()),
            created_by_user_id: None,
            due_date: None,
            completed_at: None,
            order_in_status: 0,
            order_in_parent: 0,
            metadata: serde_json::json!({}),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        let json = serde_json::to_string(&task).unwrap();
        let parsed: Task = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.id, "test-id");
        assert_eq!(parsed.status, TaskStatus::Todo);
        assert_eq!(parsed.priority, TaskPriority::High);
    }

    #[test]
    fn create_task_minimal() {
        let ct: CreateTask = serde_json::from_str(r#"{"title":"Do thing"}"#).unwrap();
        assert_eq!(ct.title, "Do thing");
        assert!(ct.description.is_none());
        assert!(ct.priority.is_none());
    }
}
```

- [ ] **Step 3: Run tests to verify types compile and pass**

Run: `cd packages/rantaiclaw && cargo test --lib tasks::types`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/tasks/types.rs
git commit -m "feat(tasks): add task type definitions and enums"
```

---

### Task 2: Implement task state machine

**Files:**
- Create: `src/tasks/state.rs`

- [ ] **Step 1: Write the state machine with valid transitions and review flow**

```rust
// src/tasks/state.rs
use crate::tasks::types::{ReviewAction, ReviewStatus, TaskStatus};
use anyhow::{bail, Result};

/// Validate a status transition and return the new status.
///
/// Valid transitions:
///   TODO → IN_PROGRESS
///   IN_PROGRESS → IN_REVIEW | DONE | CANCELLED
///   IN_REVIEW → IN_PROGRESS (changes requested) | DONE (approved) | CANCELLED (rejected)
///   DONE → (terminal)
///   CANCELLED → TODO (reopen)
pub fn validate_transition(from: TaskStatus, to: TaskStatus) -> Result<()> {
    let valid = matches!(
        (from, to),
        (TaskStatus::Todo, TaskStatus::InProgress)
            | (TaskStatus::InProgress, TaskStatus::InReview)
            | (TaskStatus::InProgress, TaskStatus::Done)
            | (TaskStatus::InProgress, TaskStatus::Cancelled)
            | (TaskStatus::InReview, TaskStatus::InProgress)
            | (TaskStatus::InReview, TaskStatus::Done)
            | (TaskStatus::InReview, TaskStatus::Cancelled)
            | (TaskStatus::Cancelled, TaskStatus::Todo)
    );

    if !valid {
        bail!(
            "Invalid status transition: {} → {}",
            from.as_str(),
            to.as_str()
        );
    }
    Ok(())
}

/// Apply a review action to a task that is IN_REVIEW.
/// Returns (new_status, review_status).
pub fn apply_review(
    current_status: TaskStatus,
    action: &ReviewAction,
) -> Result<(TaskStatus, ReviewStatus)> {
    if current_status != TaskStatus::InReview {
        bail!(
            "Cannot review a task in status '{}', must be IN_REVIEW",
            current_status.as_str()
        );
    }

    match action {
        ReviewAction::Approve => Ok((TaskStatus::Done, ReviewStatus::Approved)),
        ReviewAction::Changes => Ok((TaskStatus::InProgress, ReviewStatus::ChangesRequested)),
        ReviewAction::Reject => Ok((TaskStatus::Cancelled, ReviewStatus::Rejected)),
    }
}

/// Check if an employee can submit their own task for review.
/// An employee cannot review their own work (unless no reviewer is set).
pub fn can_self_review(
    assignee_id: Option<&str>,
    reviewer_id: Option<&str>,
    acting_employee_id: &str,
) -> bool {
    // If reviewer is the same as the actor, deny self-review
    if let Some(rev) = reviewer_id {
        if rev == acting_employee_id {
            // Self-review is not allowed when explicitly assigned as reviewer
            return false;
        }
    }
    // If the actor is the assignee and no reviewer is set, they can self-complete
    // (no review required)
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_forward_transitions() {
        assert!(validate_transition(TaskStatus::Todo, TaskStatus::InProgress).is_ok());
        assert!(validate_transition(TaskStatus::InProgress, TaskStatus::InReview).is_ok());
        assert!(validate_transition(TaskStatus::InProgress, TaskStatus::Done).is_ok());
        assert!(validate_transition(TaskStatus::InReview, TaskStatus::Done).is_ok());
        assert!(validate_transition(TaskStatus::InReview, TaskStatus::InProgress).is_ok());
    }

    #[test]
    fn valid_cancellation() {
        assert!(validate_transition(TaskStatus::InProgress, TaskStatus::Cancelled).is_ok());
        assert!(validate_transition(TaskStatus::InReview, TaskStatus::Cancelled).is_ok());
    }

    #[test]
    fn reopen_from_cancelled() {
        assert!(validate_transition(TaskStatus::Cancelled, TaskStatus::Todo).is_ok());
    }

    #[test]
    fn invalid_transitions_rejected() {
        assert!(validate_transition(TaskStatus::Todo, TaskStatus::Done).is_err());
        assert!(validate_transition(TaskStatus::Todo, TaskStatus::InReview).is_err());
        assert!(validate_transition(TaskStatus::Done, TaskStatus::InProgress).is_err());
        assert!(validate_transition(TaskStatus::Done, TaskStatus::Todo).is_err());
        assert!(validate_transition(TaskStatus::Todo, TaskStatus::Todo).is_err());
    }

    #[test]
    fn review_approve_moves_to_done() {
        let (status, review) =
            apply_review(TaskStatus::InReview, &ReviewAction::Approve).unwrap();
        assert_eq!(status, TaskStatus::Done);
        assert_eq!(review, ReviewStatus::Approved);
    }

    #[test]
    fn review_changes_moves_to_in_progress() {
        let (status, review) =
            apply_review(TaskStatus::InReview, &ReviewAction::Changes).unwrap();
        assert_eq!(status, TaskStatus::InProgress);
        assert_eq!(review, ReviewStatus::ChangesRequested);
    }

    #[test]
    fn review_reject_moves_to_cancelled() {
        let (status, review) =
            apply_review(TaskStatus::InReview, &ReviewAction::Reject).unwrap();
        assert_eq!(status, TaskStatus::Cancelled);
        assert_eq!(review, ReviewStatus::Rejected);
    }

    #[test]
    fn review_requires_in_review_status() {
        assert!(apply_review(TaskStatus::Todo, &ReviewAction::Approve).is_err());
        assert!(apply_review(TaskStatus::InProgress, &ReviewAction::Approve).is_err());
        assert!(apply_review(TaskStatus::Done, &ReviewAction::Approve).is_err());
    }

    #[test]
    fn self_review_denied_when_assigned_as_reviewer() {
        assert!(!can_self_review(
            Some("emp-1"),
            Some("emp-1"),
            "emp-1"
        ));
    }

    #[test]
    fn self_review_allowed_when_different_reviewer() {
        assert!(can_self_review(
            Some("emp-1"),
            Some("emp-2"),
            "emp-1"
        ));
    }

    #[test]
    fn self_complete_allowed_when_no_reviewer() {
        assert!(can_self_review(Some("emp-1"), None, "emp-1"));
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cd packages/rantaiclaw && cargo test --lib tasks::state`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/tasks/state.rs
git commit -m "feat(tasks): add task state machine with transition validation"
```

---

### Task 3: Implement SQLite storage

**Files:**
- Create: `src/tasks/store.rs`

- [ ] **Step 1: Write the SQLite store following the cron/store.rs pattern**

```rust
// src/tasks/store.rs
use crate::config::Config;
use crate::tasks::types::*;
use anyhow::{Context, Result};
use chrono::Utc;
use rusqlite::{params, Connection};
use uuid::Uuid;

/// Open (or create) the tasks SQLite database.
/// Uses WAL mode for concurrent read performance.
fn open_db(config: &Config) -> Result<Connection> {
    let db_path = config.workspace_dir.join("tasks.db");
    std::fs::create_dir_all(&config.workspace_dir)?;
    let conn = Connection::open(&db_path)
        .with_context(|| format!("Failed to open tasks DB at {}", db_path.display()))?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    init_tables(&conn)?;
    Ok(conn)
}

fn init_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            organization_id TEXT,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'TODO',
            priority TEXT NOT NULL DEFAULT 'MEDIUM',
            assignee_id TEXT,
            group_id TEXT,
            reviewer_id TEXT,
            human_review INTEGER NOT NULL DEFAULT 0,
            review_status TEXT,
            review_comment TEXT,
            parent_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
            created_by_employee_id TEXT,
            created_by_user_id TEXT,
            due_date TEXT,
            completed_at TEXT,
            order_in_status INTEGER NOT NULL DEFAULT 0,
            order_in_parent INTEGER NOT NULL DEFAULT 0,
            metadata TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_org_status ON tasks(organization_id, status);
        CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status ON tasks(assignee_id, status);
        CREATE INDEX IF NOT EXISTS idx_tasks_group ON tasks(group_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);

        CREATE TABLE IF NOT EXISTS task_comments (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            author_type TEXT NOT NULL,
            author_employee_id TEXT,
            author_user_id TEXT,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id, created_at);

        CREATE TABLE IF NOT EXISTS task_events (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            event_type TEXT NOT NULL,
            actor_type TEXT NOT NULL,
            actor_employee_id TEXT,
            actor_user_id TEXT,
            data TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id, created_at);",
    )
    .context("Failed to initialize tasks tables")?;
    Ok(())
}

fn with_connection<F, T>(config: &Config, f: F) -> Result<T>
where
    F: FnOnce(&Connection) -> Result<T>,
{
    let conn = open_db(config)?;
    f(&conn)
}

// ── Task CRUD ────────────────────────────────────────────────

pub fn create_task(config: &Config, input: &CreateTask) -> Result<Task> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now();
    let priority = input.priority.unwrap_or_default();
    let human_review = input.human_review.unwrap_or(false);
    let metadata = input
        .metadata
        .as_ref()
        .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "{}".into()))
        .unwrap_or_else(|| "{}".into());

    with_connection(config, |conn| {
        conn.execute(
            "INSERT INTO tasks (
                id, organization_id, title, description, status, priority,
                assignee_id, group_id, reviewer_id, human_review,
                parent_task_id, created_by_employee_id, created_by_user_id,
                due_date, order_in_status, order_in_parent, metadata,
                created_at, updated_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6,
                ?7, ?8, ?9, ?10,
                ?11, ?12, ?13,
                ?14, 0, 0, ?15,
                ?16, ?17
            )",
            params![
                id,
                input.organization_id,
                input.title,
                input.description,
                TaskStatus::Todo.as_str(),
                priority.as_str(),
                input.assignee_id,
                input.group_id,
                input.reviewer_id,
                human_review,
                input.parent_task_id,
                input.created_by_employee_id,
                input.created_by_user_id,
                input.due_date.map(|d| d.to_rfc3339()),
                metadata,
                now.to_rfc3339(),
                now.to_rfc3339(),
            ],
        )
        .context("Failed to insert task")?;

        // Record creation event
        let event_id = Uuid::new_v4().to_string();
        let actor_type = if input.created_by_employee_id.is_some() {
            "EMPLOYEE"
        } else {
            "HUMAN"
        };
        conn.execute(
            "INSERT INTO task_events (id, task_id, event_type, actor_type, actor_employee_id, actor_user_id, data, created_at)
             VALUES (?1, ?2, 'CREATED', ?3, ?4, ?5, '{}', ?6)",
            params![
                event_id,
                id,
                actor_type,
                input.created_by_employee_id,
                input.created_by_user_id,
                now.to_rfc3339(),
            ],
        )?;

        Ok(())
    })?;

    get_task(config, &id)
}

pub fn get_task(config: &Config, id: &str) -> Result<Task> {
    with_connection(config, |conn| {
        let mut stmt = conn.prepare(
            "SELECT id, organization_id, title, description, status, priority,
                    assignee_id, group_id, reviewer_id, human_review,
                    review_status, review_comment, parent_task_id,
                    created_by_employee_id, created_by_user_id,
                    due_date, completed_at, order_in_status, order_in_parent,
                    metadata, created_at, updated_at
             FROM tasks WHERE id = ?1",
        )?;
        stmt.query_row(params![id], row_to_task)
            .with_context(|| format!("Task not found: {id}"))
    })
}

pub fn list_tasks(config: &Config, filter: &TaskFilter) -> Result<Vec<Task>> {
    with_connection(config, |conn| {
        let mut sql = String::from(
            "SELECT id, organization_id, title, description, status, priority,
                    assignee_id, group_id, reviewer_id, human_review,
                    review_status, review_comment, parent_task_id,
                    created_by_employee_id, created_by_user_id,
                    due_date, completed_at, order_in_status, order_in_parent,
                    metadata, created_at, updated_at
             FROM tasks WHERE 1=1",
        );
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(ref status) = filter.status {
            param_values.push(Box::new(status.as_str().to_string()));
            sql.push_str(&format!(" AND status = ?{}", param_values.len()));
        }
        if let Some(ref assignee) = filter.assignee_id {
            param_values.push(Box::new(assignee.clone()));
            sql.push_str(&format!(" AND assignee_id = ?{}", param_values.len()));
        }
        if let Some(ref group) = filter.group_id {
            param_values.push(Box::new(group.clone()));
            sql.push_str(&format!(" AND group_id = ?{}", param_values.len()));
        }
        if let Some(ref priority) = filter.priority {
            param_values.push(Box::new(priority.as_str().to_string()));
            sql.push_str(&format!(" AND priority = ?{}", param_values.len()));
        }
        if let Some(ref parent) = filter.parent_task_id {
            param_values.push(Box::new(parent.clone()));
            sql.push_str(&format!(" AND parent_task_id = ?{}", param_values.len()));
        }
        if filter.top_level_only == Some(true) {
            sql.push_str(" AND parent_task_id IS NULL");
        }
        if let Some(ref org) = filter.organization_id {
            param_values.push(Box::new(org.clone()));
            sql.push_str(&format!(" AND organization_id = ?{}", param_values.len()));
        }

        sql.push_str(" ORDER BY order_in_status ASC, created_at DESC");

        if let Some(limit) = filter.limit {
            sql.push_str(&format!(" LIMIT {limit}"));
        }
        if let Some(offset) = filter.offset {
            sql.push_str(&format!(" OFFSET {offset}"));
        }

        let params_ref: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|p| p.as_ref()).collect();
        let mut stmt = conn.prepare(&sql)?;
        let tasks = stmt
            .query_map(params_ref.as_slice(), row_to_task)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(tasks)
    })
}

pub fn update_task(config: &Config, id: &str, patch: &TaskPatch) -> Result<Task> {
    let now = Utc::now();

    with_connection(config, |conn| {
        // Build dynamic UPDATE
        let mut sets = vec!["updated_at = ?1".to_string()];
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> =
            vec![Box::new(now.to_rfc3339())];

        macro_rules! maybe_set {
            ($field:ident, $col:literal) => {
                if let Some(ref val) = patch.$field {
                    param_values.push(Box::new(val.clone()));
                    sets.push(format!("{} = ?{}", $col, param_values.len()));
                }
            };
        }

        macro_rules! maybe_set_option {
            ($field:ident, $col:literal, $map:expr) => {
                if let Some(ref opt) = patch.$field {
                    match opt {
                        Some(val) => {
                            param_values.push(Box::new($map(val)));
                            sets.push(format!("{} = ?{}", $col, param_values.len()));
                        }
                        None => {
                            sets.push(format!("{} = NULL", $col));
                        }
                    }
                }
            };
        }

        maybe_set!(title, "title");
        maybe_set!(description, "description");
        maybe_set!(order_in_status, "order_in_status");
        maybe_set!(order_in_parent, "order_in_parent");

        if let Some(ref status) = patch.status {
            param_values.push(Box::new(status.as_str().to_string()));
            sets.push(format!("status = ?{}", param_values.len()));
            if *status == TaskStatus::Done {
                param_values.push(Box::new(now.to_rfc3339()));
                sets.push(format!("completed_at = ?{}", param_values.len()));
            } else {
                // Clear completed_at when transitioning away from Done
                sets.push("completed_at = NULL".to_string());
            }
        }
        if let Some(ref priority) = patch.priority {
            param_values.push(Box::new(priority.as_str().to_string()));
            sets.push(format!("priority = ?{}", param_values.len()));
        }
        if let Some(ref human_review) = patch.human_review {
            param_values.push(Box::new(*human_review));
            sets.push(format!("human_review = ?{}", param_values.len()));
        }
        if let Some(ref metadata) = patch.metadata {
            param_values.push(Box::new(serde_json::to_string(metadata)?));
            sets.push(format!("metadata = ?{}", param_values.len()));
        }

        maybe_set_option!(assignee_id, "assignee_id", |v: &String| v.clone());
        maybe_set_option!(group_id, "group_id", |v: &String| v.clone());
        maybe_set_option!(reviewer_id, "reviewer_id", |v: &String| v.clone());
        maybe_set_option!(review_status, "review_status", |v: &ReviewStatus| v
            .as_str()
            .to_string());
        maybe_set_option!(review_comment, "review_comment", |v: &String| v.clone());
        maybe_set_option!(due_date, "due_date", |v: &chrono::DateTime<chrono::Utc>| v
            .to_rfc3339());

        param_values.push(Box::new(id.to_string()));
        let id_pos = param_values.len();
        let sql = format!(
            "UPDATE tasks SET {} WHERE id = ?{}",
            sets.join(", "),
            id_pos
        );

        let params_ref: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|p| p.as_ref()).collect();
        let rows = conn.execute(&sql, params_ref.as_slice())?;
        if rows == 0 {
            anyhow::bail!("Task not found: {id}");
        }
        Ok(())
    })?;

    get_task(config, id)
}

pub fn delete_task(config: &Config, id: &str) -> Result<()> {
    with_connection(config, |conn| {
        let rows = conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
        if rows == 0 {
            anyhow::bail!("Task not found: {id}");
        }
        Ok(())
    })
}

// ── Comments ─────────────────────────────────────────────────

pub fn add_comment(
    config: &Config,
    task_id: &str,
    content: &str,
    author_type: ActorType,
    author_employee_id: Option<&str>,
    author_user_id: Option<&str>,
) -> Result<TaskComment> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now();

    with_connection(config, |conn| {
        conn.execute(
            "INSERT INTO task_comments (id, task_id, content, author_type, author_employee_id, author_user_id, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                task_id,
                content,
                author_type.as_str(),
                author_employee_id,
                author_user_id,
                now.to_rfc3339(),
            ],
        )?;

        // Record comment event
        let event_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO task_events (id, task_id, event_type, actor_type, actor_employee_id, actor_user_id, data, created_at)
             VALUES (?1, ?2, 'COMMENT', ?3, ?4, ?5, ?6, ?7)",
            params![
                event_id,
                task_id,
                author_type.as_str(),
                author_employee_id,
                author_user_id,
                serde_json::json!({"comment_id": id}).to_string(),
                now.to_rfc3339(),
            ],
        )?;

        Ok(())
    })?;

    get_comment(config, &id)
}

pub fn get_comment(config: &Config, id: &str) -> Result<TaskComment> {
    with_connection(config, |conn| {
        conn.prepare(
            "SELECT id, task_id, content, author_type, author_employee_id, author_user_id, created_at
             FROM task_comments WHERE id = ?1",
        )?
        .query_row(params![id], row_to_comment)
        .with_context(|| format!("Comment not found: {id}"))
    })
}

pub fn list_comments(config: &Config, task_id: &str) -> Result<Vec<TaskComment>> {
    with_connection(config, |conn| {
        let mut stmt = conn.prepare(
            "SELECT id, task_id, content, author_type, author_employee_id, author_user_id, created_at
             FROM task_comments WHERE task_id = ?1 ORDER BY created_at ASC",
        )?;
        let comments = stmt
            .query_map(params![task_id], row_to_comment)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(comments)
    })
}

// ── Events ───────────────────────────────────────────────────

pub fn record_event(
    config: &Config,
    task_id: &str,
    event_type: TaskEventType,
    actor_type: ActorType,
    actor_employee_id: Option<&str>,
    actor_user_id: Option<&str>,
    data: serde_json::Value,
) -> Result<()> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now();

    with_connection(config, |conn| {
        conn.execute(
            "INSERT INTO task_events (id, task_id, event_type, actor_type, actor_employee_id, actor_user_id, data, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                id,
                task_id,
                event_type.as_str(),
                actor_type.as_str(),
                actor_employee_id,
                actor_user_id,
                serde_json::to_string(&data)?,
                now.to_rfc3339(),
            ],
        )?;
        Ok(())
    })
}

pub fn list_events(config: &Config, task_id: &str) -> Result<Vec<TaskEvent>> {
    with_connection(config, |conn| {
        let mut stmt = conn.prepare(
            "SELECT id, task_id, event_type, actor_type, actor_employee_id, actor_user_id, data, created_at
             FROM task_events WHERE task_id = ?1 ORDER BY created_at ASC",
        )?;
        let events = stmt
            .query_map(params![task_id], row_to_event)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(events)
    })
}

// ── Task detail (composite) ──────────────────────────────────

pub fn get_task_detail(config: &Config, id: &str) -> Result<TaskDetail> {
    let task = get_task(config, id)?;
    let subtasks = list_tasks(
        config,
        &TaskFilter {
            parent_task_id: Some(id.to_string()),
            ..TaskFilter::default()
        },
    )?;
    let comments = list_comments(config, id)?;
    let events = list_events(config, id)?;

    Ok(TaskDetail {
        task,
        subtasks,
        comments,
        events,
    })
}

// ── Row mappers ──────────────────────────────────────────────

fn parse_rfc3339(s: &str) -> rusqlite::Result<chrono::DateTime<Utc>> {
    chrono::DateTime::parse_from_rfc3339(s)
        .map(|d| d.with_timezone(&Utc))
        .map_err(|e| rusqlite::Error::FromSqlConversionFailure(
            0,
            rusqlite::types::Type::Text,
            Box::new(e),
        ))
}

fn row_to_task(row: &rusqlite::Row<'_>) -> rusqlite::Result<Task> {
    let status_str: String = row.get(4)?;
    let priority_str: String = row.get(5)?;
    let review_status_str: Option<String> = row.get(10)?;
    let created_at_str: String = row.get(20)?;
    let updated_at_str: String = row.get(21)?;
    let due_date_str: Option<String> = row.get(15)?;
    let completed_at_str: Option<String> = row.get(16)?;
    let metadata_str: String = row.get(19)?;

    Ok(Task {
        id: row.get(0)?,
        organization_id: row.get(1)?,
        title: row.get(2)?,
        description: row.get(3)?,
        status: TaskStatus::try_from(status_str.as_str()).unwrap_or_default(),
        priority: TaskPriority::try_from(priority_str.as_str()).unwrap_or_default(),
        assignee_id: row.get(6)?,
        group_id: row.get(7)?,
        reviewer_id: row.get(8)?,
        human_review: row.get(9)?,
        review_status: review_status_str
            .and_then(|s| ReviewStatus::try_from(s.as_str()).ok()),
        review_comment: row.get(11)?,
        parent_task_id: row.get(12)?,
        created_by_employee_id: row.get(13)?,
        created_by_user_id: row.get(14)?,
        due_date: due_date_str.map(|s| parse_rfc3339(&s)).transpose()?,
        completed_at: completed_at_str.map(|s| parse_rfc3339(&s)).transpose()?,
        order_in_status: row.get(17)?,
        order_in_parent: row.get(18)?,
        metadata: serde_json::from_str(&metadata_str).unwrap_or(serde_json::json!({})),
        created_at: parse_rfc3339(&created_at_str)?,
        updated_at: parse_rfc3339(&updated_at_str)?,
    })
}

fn row_to_comment(row: &rusqlite::Row<'_>) -> rusqlite::Result<TaskComment> {
    let author_type_str: String = row.get(3)?;
    let created_at_str: String = row.get(6)?;
    Ok(TaskComment {
        id: row.get(0)?,
        task_id: row.get(1)?,
        content: row.get(2)?,
        author_type: ActorType::try_from(author_type_str.as_str()).unwrap_or(ActorType::Human),
        author_employee_id: row.get(4)?,
        author_user_id: row.get(5)?,
        created_at: parse_rfc3339(&created_at_str)?,
    })
}

fn row_to_event(row: &rusqlite::Row<'_>) -> rusqlite::Result<TaskEvent> {
    let event_type_str: String = row.get(2)?;
    let actor_type_str: String = row.get(3)?;
    let data_str: String = row.get(6)?;
    let created_at_str: String = row.get(7)?;
    Ok(TaskEvent {
        id: row.get(0)?,
        task_id: row.get(1)?,
        event_type: TaskEventType::try_from(event_type_str.as_str())
            .unwrap_or(TaskEventType::Created),
        actor_type: ActorType::try_from(actor_type_str.as_str()).unwrap_or(ActorType::Human),
        actor_employee_id: row.get(4)?,
        actor_user_id: row.get(5)?,
        data: serde_json::from_str(&data_str).unwrap_or(serde_json::json!({})),
        created_at: parse_rfc3339(&created_at_str)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn test_config(tmp: &TempDir) -> Config {
        let config = Config {
            workspace_dir: tmp.path().join("workspace"),
            config_path: tmp.path().join("config.toml"),
            ..Config::default()
        };
        std::fs::create_dir_all(&config.workspace_dir).unwrap();
        config
    }

    #[test]
    fn create_and_get_task() {
        let tmp = TempDir::new().unwrap();
        let config = test_config(&tmp);

        let task = create_task(
            &config,
            &CreateTask {
                title: "Test task".into(),
                description: Some("A test".into()),
                priority: Some(TaskPriority::High),
                assignee_id: Some("emp-1".into()),
                group_id: None,
                reviewer_id: None,
                human_review: None,
                parent_task_id: None,
                due_date: None,
                organization_id: Some("org-1".into()),
                created_by_employee_id: Some("emp-2".into()),
                created_by_user_id: None,
                metadata: None,
            },
        )
        .unwrap();

        assert_eq!(task.title, "Test task");
        assert_eq!(task.status, TaskStatus::Todo);
        assert_eq!(task.priority, TaskPriority::High);
        assert_eq!(task.assignee_id.as_deref(), Some("emp-1"));

        let fetched = get_task(&config, &task.id).unwrap();
        assert_eq!(fetched.id, task.id);
    }

    #[test]
    fn list_tasks_with_filters() {
        let tmp = TempDir::new().unwrap();
        let config = test_config(&tmp);

        create_task(
            &config,
            &CreateTask {
                title: "Task A".into(),
                assignee_id: Some("emp-1".into()),
                ..default_create()
            },
        )
        .unwrap();
        create_task(
            &config,
            &CreateTask {
                title: "Task B".into(),
                assignee_id: Some("emp-2".into()),
                ..default_create()
            },
        )
        .unwrap();

        let all = list_tasks(&config, &TaskFilter::default()).unwrap();
        assert_eq!(all.len(), 2);

        let filtered = list_tasks(
            &config,
            &TaskFilter {
                assignee_id: Some("emp-1".into()),
                ..TaskFilter::default()
            },
        )
        .unwrap();
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].title, "Task A");
    }

    #[test]
    fn update_task_fields() {
        let tmp = TempDir::new().unwrap();
        let config = test_config(&tmp);

        let task = create_task(
            &config,
            &CreateTask {
                title: "Original".into(),
                ..default_create()
            },
        )
        .unwrap();

        let updated = update_task(
            &config,
            &task.id,
            &TaskPatch {
                title: Some("Updated".into()),
                priority: Some(TaskPriority::Low),
                ..TaskPatch::default()
            },
        )
        .unwrap();

        assert_eq!(updated.title, "Updated");
        assert_eq!(updated.priority, TaskPriority::Low);
    }

    #[test]
    fn delete_task_removes_it() {
        let tmp = TempDir::new().unwrap();
        let config = test_config(&tmp);

        let task = create_task(
            &config,
            &CreateTask {
                title: "To delete".into(),
                ..default_create()
            },
        )
        .unwrap();

        delete_task(&config, &task.id).unwrap();
        assert!(get_task(&config, &task.id).is_err());
    }

    #[test]
    fn subtasks_linked_to_parent() {
        let tmp = TempDir::new().unwrap();
        let config = test_config(&tmp);

        let parent = create_task(
            &config,
            &CreateTask {
                title: "Parent".into(),
                ..default_create()
            },
        )
        .unwrap();
        create_task(
            &config,
            &CreateTask {
                title: "Subtask 1".into(),
                parent_task_id: Some(parent.id.clone()),
                ..default_create()
            },
        )
        .unwrap();
        create_task(
            &config,
            &CreateTask {
                title: "Subtask 2".into(),
                parent_task_id: Some(parent.id.clone()),
                ..default_create()
            },
        )
        .unwrap();

        let detail = get_task_detail(&config, &parent.id).unwrap();
        assert_eq!(detail.subtasks.len(), 2);
    }

    #[test]
    fn comments_and_events() {
        let tmp = TempDir::new().unwrap();
        let config = test_config(&tmp);

        let task = create_task(
            &config,
            &CreateTask {
                title: "Commentable".into(),
                ..default_create()
            },
        )
        .unwrap();

        add_comment(
            &config,
            &task.id,
            "First comment",
            ActorType::Human,
            None,
            Some("user-1"),
        )
        .unwrap();
        add_comment(
            &config,
            &task.id,
            "Agent reply",
            ActorType::Employee,
            Some("emp-1"),
            None,
        )
        .unwrap();

        let comments = list_comments(&config, &task.id).unwrap();
        assert_eq!(comments.len(), 2);
        assert_eq!(comments[0].content, "First comment");

        // Events: 1 creation + 2 comment events
        let events = list_events(&config, &task.id).unwrap();
        assert_eq!(events.len(), 3);
    }

    #[test]
    fn delete_nonexistent_task_fails() {
        let tmp = TempDir::new().unwrap();
        let config = test_config(&tmp);
        assert!(delete_task(&config, "nonexistent").is_err());
    }

    fn default_create() -> CreateTask {
        CreateTask {
            title: String::new(),
            description: None,
            priority: None,
            assignee_id: None,
            group_id: None,
            reviewer_id: None,
            human_review: None,
            parent_task_id: None,
            due_date: None,
            organization_id: None,
            created_by_employee_id: None,
            created_by_user_id: None,
            metadata: None,
        }
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cd packages/rantaiclaw && cargo test --lib tasks::store`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/tasks/store.rs
git commit -m "feat(tasks): add SQLite storage with CRUD, comments, events"
```

---

### Task 4: Wire module into lib.rs and config

**Files:**
- Create: `src/tasks/mod.rs`
- Modify: `src/lib.rs`
- Modify: `src/config/schema.rs`

- [ ] **Step 1: Create the tasks module root**

```rust
// src/tasks/mod.rs
pub mod state;
pub mod store;
pub mod types;

pub use store::{
    add_comment, create_task, delete_task, get_task, get_task_detail, list_comments, list_events,
    list_tasks, record_event, update_task,
};
pub use types::*;
```

- [ ] **Step 2: Add `pub mod tasks;` to `src/lib.rs`**

Add after `pub(crate) mod skills;`:

```rust
pub mod tasks;
```

- [ ] **Step 3: Add `TasksConfig` to `src/config/schema.rs`**

Add the config struct (after `CronConfig`):

```rust
/// Task engine configuration (`[tasks]`).
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TasksConfig {
    /// Enable the task engine. Default: true.
    #[serde(default = "default_true")]
    pub enabled: bool,
}

impl Default for TasksConfig {
    fn default() -> Self {
        Self { enabled: true }
    }
}
```

Add the field to the `Config` struct:

```rust
    /// Task engine configuration (`[tasks]`).
    #[serde(default)]
    pub tasks: TasksConfig,
```

- [ ] **Step 4: Run full test suite to verify wiring**

Run: `cd packages/rantaiclaw && cargo test --lib tasks`
Expected: All task tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/tasks/mod.rs src/lib.rs src/config/schema.rs
git commit -m "feat(tasks): wire tasks module into lib and config"
```

---

## Chunk 2: Gateway API Endpoints

### Task 5: Create gateway task handlers

**Files:**
- Create: `src/gateway/tasks.rs`
- Modify: `src/gateway/mod.rs`

- [ ] **Step 1: Create the gateway tasks handler file**

```rust
// src/gateway/tasks.rs
//! Axum handlers for the task engine gateway API.
//!
//! Routes:
//!   GET    /tasks           — list tasks (query params for filtering)
//!   POST   /tasks           — create task
//!   GET    /tasks/:id       — get task detail
//!   PUT    /tasks/:id       — update task
//!   DELETE /tasks/:id       — delete task
//!   POST   /tasks/:id/review — submit review
//!   GET    /tasks/:id/comments — list comments
//!   POST   /tasks/:id/comments — add comment
//!   GET    /tasks/:id/events   — list events

use super::AppState;
use crate::tasks::{self, state, ActorType, CreateTask, ReviewRequest, TaskEventType, TaskFilter, TaskPatch};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json},
};
use serde::Deserialize;

// ── Query params ─────────────────────────────────────────────

#[derive(Debug, Deserialize, Default)]
pub struct TaskListQuery {
    pub status: Option<String>,
    pub assignee_id: Option<String>,
    pub group_id: Option<String>,
    pub priority: Option<String>,
    pub parent_task_id: Option<String>,
    pub top_level_only: Option<bool>,
    pub organization_id: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

impl TaskListQuery {
    fn to_filter(&self) -> Result<TaskFilter, String> {
        Ok(TaskFilter {
            status: self
                .status
                .as_deref()
                .map(tasks::TaskStatus::try_from)
                .transpose()?,
            assignee_id: self.assignee_id.clone(),
            group_id: self.group_id.clone(),
            priority: self
                .priority
                .as_deref()
                .map(tasks::TaskPriority::try_from)
                .transpose()?,
            parent_task_id: self.parent_task_id.clone(),
            top_level_only: self.top_level_only,
            organization_id: self.organization_id.clone(),
            limit: self.limit,
            offset: self.offset,
        })
    }
}

// ── Handlers ─────────────────────────────────────────────────

pub async fn handle_list_tasks(
    State(state): State<AppState>,
    Query(query): Query<TaskListQuery>,
) -> impl IntoResponse {
    let config = state.config.lock();
    if !config.tasks.enabled {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Task engine is disabled"})),
        );
    }

    let filter = match query.to_filter() {
        Ok(f) => f,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": e})),
            );
        }
    };

    match tasks::list_tasks(&config, &filter) {
        Ok(tasks) => (StatusCode::OK, Json(serde_json::json!(tasks))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        ),
    }
}

pub async fn handle_create_task(
    State(state): State<AppState>,
    Json(body): Json<CreateTask>,
) -> impl IntoResponse {
    let config = state.config.lock();
    if !config.tasks.enabled {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Task engine is disabled"})),
        );
    }

    if body.title.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Title is required"})),
        );
    }

    match tasks::create_task(&config, &body) {
        Ok(task) => (StatusCode::CREATED, Json(serde_json::json!(task))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        ),
    }
}

pub async fn handle_get_task(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let config = state.config.lock();
    match tasks::get_task_detail(&config, &id) {
        Ok(detail) => (StatusCode::OK, Json(serde_json::json!(detail))),
        Err(e) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": e.to_string()})),
        ),
    }
}

pub async fn handle_update_task(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(patch): Json<TaskPatch>,
) -> impl IntoResponse {
    let config = state.config.lock();

    // Validate status transition if status is being changed
    if let Some(ref new_status) = patch.status {
        match tasks::get_task(&config, &id) {
            Ok(existing) => {
                if let Err(e) = state::validate_transition(existing.status, *new_status) {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(serde_json::json!({"error": e.to_string()})),
                    );
                }
            }
            Err(e) => {
                return (
                    StatusCode::NOT_FOUND,
                    Json(serde_json::json!({"error": e.to_string()})),
                );
            }
        }
    }

    match tasks::update_task(&config, &id, &patch) {
        Ok(task) => (StatusCode::OK, Json(serde_json::json!(task))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        ),
    }
}

pub async fn handle_delete_task(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let config = state.config.lock();
    match tasks::delete_task(&config, &id) {
        Ok(()) => (StatusCode::OK, Json(serde_json::json!({"deleted": id}))),
        Err(e) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": e.to_string()})),
        ),
    }
}

pub async fn handle_review_task(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(review): Json<ReviewRequest>,
) -> impl IntoResponse {
    let config = state.config.lock();

    let task = match tasks::get_task(&config, &id) {
        Ok(t) => t,
        Err(e) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": e.to_string()})),
            );
        }
    };

    let (new_status, review_status) = match state::apply_review(task.status, &review.action) {
        Ok(result) => result,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": e.to_string()})),
            );
        }
    };

    let patch = TaskPatch {
        status: Some(new_status),
        review_status: Some(Some(review_status)),
        review_comment: review.comment.as_ref().map(|c| Some(c.clone())),
        ..TaskPatch::default()
    };

    match tasks::update_task(&config, &id, &patch) {
        Ok(updated) => {
            // Record review event (best-effort)
            let actor_type = review.actor_type.unwrap_or(ActorType::Human);
            let _ = tasks::record_event(
                &config,
                &id,
                TaskEventType::ReviewResponded,
                actor_type,
                review.actor_employee_id.as_deref(),
                review.actor_user_id.as_deref(),
                serde_json::json!({
                    "action": format!("{:?}", review.action),
                    "new_status": new_status.as_str(),
                    "comment": review.comment,
                }),
            );
            (StatusCode::OK, Json(serde_json::json!(updated)))
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        ),
    }
}

#[derive(Debug, Deserialize)]
pub struct AddCommentBody {
    pub content: String,
    pub author_type: Option<String>,
    pub author_employee_id: Option<String>,
    pub author_user_id: Option<String>,
}

pub async fn handle_list_comments(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let config = state.config.lock();
    match tasks::list_comments(&config, &id) {
        Ok(comments) => (StatusCode::OK, Json(serde_json::json!(comments))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        ),
    }
}

pub async fn handle_add_comment(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<AddCommentBody>,
) -> impl IntoResponse {
    let config = state.config.lock();

    if body.content.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Content is required"})),
        );
    }

    let author_type = body
        .author_type
        .as_deref()
        .and_then(|s| ActorType::try_from(s).ok())
        .unwrap_or(ActorType::Human);

    match tasks::add_comment(
        &config,
        &id,
        &body.content,
        author_type,
        body.author_employee_id.as_deref(),
        body.author_user_id.as_deref(),
    ) {
        Ok(comment) => (StatusCode::CREATED, Json(serde_json::json!(comment))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        ),
    }
}

pub async fn handle_list_events(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let config = state.config.lock();
    match tasks::list_events(&config, &id) {
        Ok(events) => (StatusCode::OK, Json(serde_json::json!(events))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        ),
    }
}
```

- [ ] **Step 2: Add `pub mod tasks;` to `src/gateway/mod.rs`**

Near the top of the file, after existing module declarations (or just before the imports), add:

```rust
pub mod tasks;
```

- [ ] **Step 3: Register task routes in the gateway router**

In `run_gateway()`, add the task routes to `standard_routes` (after the `.route("/agents", get(handle_list_agents))` line):

```rust
        .route("/tasks", get(tasks::handle_list_tasks).post(tasks::handle_create_task))
        .route("/tasks/{id}", get(tasks::handle_get_task).put(tasks::handle_update_task).delete(tasks::handle_delete_task))
        .route("/tasks/{id}/review", post(tasks::handle_review_task))
        .route("/tasks/{id}/comments", get(tasks::handle_list_comments).post(tasks::handle_add_comment))
        .route("/tasks/{id}/events", get(tasks::handle_list_events))
```

- [ ] **Step 4: Verify it compiles**

Run: `cd packages/rantaiclaw && cargo check`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/gateway/tasks.rs src/gateway/mod.rs
git commit -m "feat(tasks): add gateway API routes for task CRUD, review, comments, events"
```

---

## Chunk 3: Agent Tools

### Task 6: Implement task tools for agents

**Files:**
- Create: `src/tools/task_list.rs`
- Create: `src/tools/task_get.rs`
- Create: `src/tools/task_create.rs`
- Create: `src/tools/task_update_status.rs`
- Create: `src/tools/task_create_subtask.rs`
- Create: `src/tools/task_complete_subtask.rs`
- Create: `src/tools/task_comment.rs`
- Create: `src/tools/task_read_comments.rs`
- Modify: `src/tools/mod.rs`

- [ ] **Step 1: Create `task_list.rs`**

```rust
// src/tools/task_list.rs
use super::traits::{Tool, ToolResult};
use crate::config::Config;
use crate::tasks::{self, TaskFilter, TaskStatus};
use async_trait::async_trait;
use serde_json::json;
use std::sync::Arc;

pub struct TaskListTool {
    config: Arc<Config>,
    /// The employee ID of the agent using this tool
    agent_id: Option<String>,
}

impl TaskListTool {
    pub fn new(config: Arc<Config>, agent_id: Option<String>) -> Self {
        Self { config, agent_id }
    }
}

#[async_trait]
impl Tool for TaskListTool {
    fn name(&self) -> &str {
        "list_tasks"
    }

    fn description(&self) -> &str {
        "List tasks. By default returns tasks assigned to you. Use status filter to narrow results. Includes review comments and recent activity."
    }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"],
                    "description": "Filter by status"
                },
                "all": {
                    "type": "boolean",
                    "description": "If true, list all tasks (not just assigned to you)",
                    "default": false
                }
            }
        })
    }

    async fn execute(&self, args: serde_json::Value) -> anyhow::Result<ToolResult> {
        if !self.config.tasks.enabled {
            return Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some("Task engine is disabled".into()),
            });
        }

        let status = args
            .get("status")
            .and_then(serde_json::Value::as_str)
            .map(TaskStatus::try_from)
            .transpose()
            .map_err(|e| anyhow::anyhow!(e))?;

        let all = args
            .get("all")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false);

        let filter = TaskFilter {
            status,
            assignee_id: if all { None } else { self.agent_id.clone() },
            top_level_only: Some(true),
            ..TaskFilter::default()
        };

        match tasks::list_tasks(&self.config, &filter) {
            Ok(tasks) => Ok(ToolResult {
                success: true,
                output: serde_json::to_string_pretty(&tasks)?,
                error: None,
            }),
            Err(e) => Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some(e.to_string()),
            }),
        }
    }
}
```

- [ ] **Step 2: Create `task_get.rs`**

```rust
// src/tools/task_get.rs
use super::traits::{Tool, ToolResult};
use crate::config::Config;
use crate::tasks;
use async_trait::async_trait;
use serde_json::json;
use std::sync::Arc;

pub struct TaskGetTool {
    config: Arc<Config>,
}

impl TaskGetTool {
    pub fn new(config: Arc<Config>) -> Self {
        Self { config }
    }
}

#[async_trait]
impl Tool for TaskGetTool {
    fn name(&self) -> &str {
        "get_task"
    }

    fn description(&self) -> &str {
        "Get full task detail including subtasks, comments, review status, and activity timeline"
    }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "task_id": { "type": "string", "description": "Task ID to fetch" }
            },
            "required": ["task_id"]
        })
    }

    async fn execute(&self, args: serde_json::Value) -> anyhow::Result<ToolResult> {
        if !self.config.tasks.enabled {
            return Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some("Task engine is disabled".into()),
            });
        }

        let task_id = match args.get("task_id").and_then(serde_json::Value::as_str) {
            Some(id) => id,
            None => {
                return Ok(ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some("Missing 'task_id' parameter".into()),
                });
            }
        };

        match tasks::get_task_detail(&self.config, task_id) {
            Ok(detail) => Ok(ToolResult {
                success: true,
                output: serde_json::to_string_pretty(&detail)?,
                error: None,
            }),
            Err(e) => Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some(e.to_string()),
            }),
        }
    }
}
```

- [ ] **Step 3: Create `task_create.rs`**

```rust
// src/tools/task_create.rs
use super::traits::{Tool, ToolResult};
use crate::config::Config;
use crate::security::SecurityPolicy;
use crate::tasks::{self, CreateTask, TaskPriority};
use async_trait::async_trait;
use serde_json::json;
use std::sync::Arc;

pub struct TaskCreateTool {
    config: Arc<Config>,
    security: Arc<SecurityPolicy>,
    agent_id: Option<String>,
}

impl TaskCreateTool {
    pub fn new(
        config: Arc<Config>,
        security: Arc<SecurityPolicy>,
        agent_id: Option<String>,
    ) -> Self {
        Self {
            config,
            security,
            agent_id,
        }
    }
}

#[async_trait]
impl Tool for TaskCreateTool {
    fn name(&self) -> &str {
        "create_task"
    }

    fn description(&self) -> &str {
        "Create a new task. Assign to yourself, another employee, or leave unassigned."
    }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "title": { "type": "string", "description": "Task title (required)" },
                "description": { "type": "string", "description": "Task description" },
                "priority": { "type": "string", "enum": ["LOW", "MEDIUM", "HIGH"] },
                "assignee_id": { "type": "string", "description": "Employee ID to assign to" },
                "group_id": { "type": "string", "description": "Team/group ID" },
                "reviewer_id": { "type": "string", "description": "Employee ID for review" },
                "human_review": { "type": "boolean", "description": "Requires human review" },
                "due_date": { "type": "string", "description": "Due date in RFC3339 format" }
            },
            "required": ["title"]
        })
    }

    async fn execute(&self, args: serde_json::Value) -> anyhow::Result<ToolResult> {
        if !self.config.tasks.enabled {
            return Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some("Task engine is disabled".into()),
            });
        }

        if !self.security.can_act() {
            return Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some("Security policy: read-only mode".into()),
            });
        }

        if !self.security.record_action() {
            return Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some("Rate limit exceeded".into()),
            });
        }

        let title = match args.get("title").and_then(serde_json::Value::as_str) {
            Some(t) if !t.trim().is_empty() => t.to_string(),
            _ => {
                return Ok(ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some("Missing 'title' parameter".into()),
                });
            }
        };

        let priority = args
            .get("priority")
            .and_then(serde_json::Value::as_str)
            .and_then(|s| TaskPriority::try_from(s).ok());

        let due_date = args
            .get("due_date")
            .and_then(serde_json::Value::as_str)
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .map(|d| d.with_timezone(&chrono::Utc));

        let input = CreateTask {
            title,
            description: args
                .get("description")
                .and_then(serde_json::Value::as_str)
                .map(String::from),
            priority,
            assignee_id: args
                .get("assignee_id")
                .and_then(serde_json::Value::as_str)
                .map(String::from),
            group_id: args
                .get("group_id")
                .and_then(serde_json::Value::as_str)
                .map(String::from),
            reviewer_id: args
                .get("reviewer_id")
                .and_then(serde_json::Value::as_str)
                .map(String::from),
            human_review: args
                .get("human_review")
                .and_then(serde_json::Value::as_bool),
            parent_task_id: None,
            due_date,
            organization_id: None,
            created_by_employee_id: self.agent_id.clone(),
            created_by_user_id: None,
            metadata: None,
        };

        match tasks::create_task(&self.config, &input) {
            Ok(task) => Ok(ToolResult {
                success: true,
                output: serde_json::to_string_pretty(&json!({
                    "id": task.id,
                    "title": task.title,
                    "status": task.status,
                    "assignee_id": task.assignee_id,
                }))?,
                error: None,
            }),
            Err(e) => Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some(e.to_string()),
            }),
        }
    }
}
```

- [ ] **Step 4: Create `task_update_status.rs`**

```rust
// src/tools/task_update_status.rs
use super::traits::{Tool, ToolResult};
use crate::config::Config;
use crate::security::SecurityPolicy;
use crate::tasks::{self, state, ActorType, TaskEventType, TaskPatch, TaskStatus};
use async_trait::async_trait;
use serde_json::json;
use std::sync::Arc;

pub struct TaskUpdateStatusTool {
    config: Arc<Config>,
    security: Arc<SecurityPolicy>,
    agent_id: Option<String>,
}

impl TaskUpdateStatusTool {
    pub fn new(
        config: Arc<Config>,
        security: Arc<SecurityPolicy>,
        agent_id: Option<String>,
    ) -> Self {
        Self { config, security, agent_id }
    }
}

#[async_trait]
impl Tool for TaskUpdateStatusTool {
    fn name(&self) -> &str {
        "update_task_status"
    }

    fn description(&self) -> &str {
        "Move a task to the next status: TODO → IN_PROGRESS → IN_REVIEW → DONE"
    }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "task_id": { "type": "string" },
                "status": {
                    "type": "string",
                    "enum": ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]
                }
            },
            "required": ["task_id", "status"]
        })
    }

    async fn execute(&self, args: serde_json::Value) -> anyhow::Result<ToolResult> {
        if !self.config.tasks.enabled {
            return Ok(ToolResult { success: false, output: String::new(), error: Some("Task engine is disabled".into()) });
        }
        if !self.security.can_act() {
            return Ok(ToolResult { success: false, output: String::new(), error: Some("Security policy: read-only mode".into()) });
        }
        if !self.security.record_action() {
            return Ok(ToolResult { success: false, output: String::new(), error: Some("Rate limit exceeded".into()) });
        }

        let task_id = match args.get("task_id").and_then(serde_json::Value::as_str) {
            Some(id) => id,
            None => return Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some("Missing 'task_id'".into()),
            }),
        };
        let new_status_str = match args.get("status").and_then(serde_json::Value::as_str) {
            Some(s) => s,
            None => return Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some("Missing 'status'".into()),
            }),
        };
        let new_status = match TaskStatus::try_from(new_status_str) {
            Ok(s) => s,
            Err(e) => return Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some(e),
            }),
        };

        let existing = match tasks::get_task(&self.config, task_id) {
            Ok(t) => t,
            Err(e) => return Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some(e.to_string()),
            }),
        };

        if let Err(e) = state::validate_transition(existing.status, new_status) {
            return Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some(e.to_string()),
            });
        }

        let patch = TaskPatch {
            status: Some(new_status),
            review_status: if new_status == TaskStatus::InReview {
                Some(Some(tasks::ReviewStatus::Pending))
            } else {
                None
            },
            ..TaskPatch::default()
        };

        match tasks::update_task(&self.config, task_id, &patch) {
            Ok(task) => {
                let _ = tasks::record_event(
                    &self.config,
                    task_id,
                    TaskEventType::StatusChanged,
                    ActorType::Employee,
                    self.agent_id.as_deref(),
                    None,
                    json!({
                        "from": existing.status.as_str(),
                        "to": new_status.as_str(),
                    }),
                );
                Ok(ToolResult {
                    success: true,
                    output: serde_json::to_string_pretty(&json!({
                        "id": task.id,
                        "status": task.status,
                        "review_status": task.review_status,
                    }))?,
                    error: None,
                })
            }
            Err(e) => Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some(e.to_string()),
            }),
        }
    }
}
```

- [ ] **Step 5: Create `task_create_subtask.rs`**

```rust
// src/tools/task_create_subtask.rs
use super::traits::{Tool, ToolResult};
use crate::config::Config;
use crate::security::SecurityPolicy;
use crate::tasks::{self, CreateTask, TaskPriority};
use async_trait::async_trait;
use serde_json::json;
use std::sync::Arc;

pub struct TaskCreateSubtaskTool {
    config: Arc<Config>,
    security: Arc<SecurityPolicy>,
    agent_id: Option<String>,
}

impl TaskCreateSubtaskTool {
    pub fn new(config: Arc<Config>, security: Arc<SecurityPolicy>, agent_id: Option<String>) -> Self {
        Self { config, security, agent_id }
    }
}

#[async_trait]
impl Tool for TaskCreateSubtaskTool {
    fn name(&self) -> &str { "create_subtask" }
    fn description(&self) -> &str { "Add a subtask to an existing task" }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "parent_task_id": { "type": "string", "description": "Parent task ID" },
                "title": { "type": "string", "description": "Subtask title" },
                "description": { "type": "string" },
                "assignee_id": { "type": "string" },
                "priority": { "type": "string", "enum": ["LOW", "MEDIUM", "HIGH"] },
                "human_review": { "type": "boolean", "description": "Requires review when done" }
            },
            "required": ["parent_task_id", "title"]
        })
    }

    async fn execute(&self, args: serde_json::Value) -> anyhow::Result<ToolResult> {
        if !self.config.tasks.enabled {
            return Ok(ToolResult { success: false, output: String::new(), error: Some("Task engine is disabled".into()) });
        }
        if !self.security.can_act() {
            return Ok(ToolResult { success: false, output: String::new(), error: Some("Read-only mode".into()) });
        }
        if !self.security.record_action() {
            return Ok(ToolResult { success: false, output: String::new(), error: Some("Rate limit exceeded".into()) });
        }

        let parent_id = match args.get("parent_task_id").and_then(serde_json::Value::as_str) {
            Some(id) => id,
            None => return Ok(ToolResult { success: false, output: String::new(), error: Some("Missing 'parent_task_id'".into()) }),
        };
        let title = match args.get("title").and_then(serde_json::Value::as_str) {
            Some(t) if !t.trim().is_empty() => t,
            _ => return Ok(ToolResult { success: false, output: String::new(), error: Some("Missing 'title'".into()) }),
        };

        // Verify parent exists and is not itself a subtask (one level deep)
        let parent = match tasks::get_task(&self.config, parent_id) {
            Ok(t) => t,
            Err(e) => return Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
        };
        if parent.parent_task_id.is_some() {
            return Ok(ToolResult { success: false, output: String::new(), error: Some("Cannot nest subtasks more than one level deep".into()) });
        }

        let input = CreateTask {
            title: title.into(),
            description: args.get("description").and_then(serde_json::Value::as_str).map(String::from),
            priority: args.get("priority").and_then(serde_json::Value::as_str).and_then(|s| TaskPriority::try_from(s).ok()),
            assignee_id: args.get("assignee_id").and_then(serde_json::Value::as_str).map(String::from),
            group_id: parent.group_id.clone(),
            reviewer_id: None,
            human_review: args.get("human_review").and_then(serde_json::Value::as_bool),
            parent_task_id: Some(parent_id.into()),
            due_date: None,
            organization_id: parent.organization_id.clone(),
            created_by_employee_id: self.agent_id.clone(),
            created_by_user_id: None,
            metadata: None,
        };

        match tasks::create_task(&self.config, &input) {
            Ok(task) => Ok(ToolResult {
                success: true,
                output: serde_json::to_string_pretty(&json!({"id": task.id, "title": task.title, "parent_task_id": parent_id}))?,
                error: None,
            }),
            Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
        }
    }
}
```

- [ ] **Step 6: Create `task_complete_subtask.rs`**

```rust
// src/tools/task_complete_subtask.rs
use super::traits::{Tool, ToolResult};
use crate::config::Config;
use crate::security::SecurityPolicy;
use crate::tasks::{self, state, ActorType, ReviewStatus, TaskEventType, TaskPatch, TaskStatus};
use async_trait::async_trait;
use serde_json::json;
use std::sync::Arc;

pub struct TaskCompleteSubtaskTool {
    config: Arc<Config>,
    security: Arc<SecurityPolicy>,
    agent_id: Option<String>,
}

impl TaskCompleteSubtaskTool {
    pub fn new(config: Arc<Config>, security: Arc<SecurityPolicy>, agent_id: Option<String>) -> Self {
        Self { config, security, agent_id }
    }
}

#[async_trait]
impl Tool for TaskCompleteSubtaskTool {
    fn name(&self) -> &str { "complete_subtask" }
    fn description(&self) -> &str { "Mark a subtask as done. If review is required, it enters IN_REVIEW instead." }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "subtask_id": { "type": "string", "description": "Subtask ID to complete" }
            },
            "required": ["subtask_id"]
        })
    }

    async fn execute(&self, args: serde_json::Value) -> anyhow::Result<ToolResult> {
        if !self.config.tasks.enabled {
            return Ok(ToolResult { success: false, output: String::new(), error: Some("Task engine is disabled".into()) });
        }
        if !self.security.can_act() {
            return Ok(ToolResult { success: false, output: String::new(), error: Some("Read-only mode".into()) });
        }
        if !self.security.record_action() {
            return Ok(ToolResult { success: false, output: String::new(), error: Some("Rate limit exceeded".into()) });
        }

        let subtask_id = match args.get("subtask_id").and_then(serde_json::Value::as_str) {
            Some(id) => id,
            None => return Ok(ToolResult { success: false, output: String::new(), error: Some("Missing 'subtask_id'".into()) }),
        };

        let subtask = match tasks::get_task(&self.config, subtask_id) {
            Ok(t) => t,
            Err(e) => return Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
        };

        // Determine target status based on review requirement
        let new_status = if subtask.human_review || subtask.reviewer_id.is_some() {
            TaskStatus::InReview
        } else {
            TaskStatus::Done
        };

        if let Err(e) = state::validate_transition(subtask.status, new_status) {
            return Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) });
        }

        let patch = TaskPatch {
            status: Some(new_status),
            review_status: if new_status == TaskStatus::InReview {
                Some(Some(ReviewStatus::Pending))
            } else {
                None
            },
            ..TaskPatch::default()
        };

        match tasks::update_task(&self.config, subtask_id, &patch) {
            Ok(updated) => {
                let _ = tasks::record_event(
                    &self.config,
                    subtask_id,
                    TaskEventType::SubtaskCompleted,
                    ActorType::Employee,
                    self.agent_id.as_deref(),
                    None,
                    json!({"status": new_status.as_str()}),
                );
                Ok(ToolResult {
                    success: true,
                    output: serde_json::to_string_pretty(&json!({
                        "id": updated.id,
                        "status": updated.status,
                        "needs_review": new_status == TaskStatus::InReview,
                    }))?,
                    error: None,
                })
            }
            Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
        }
    }
}
```

- [ ] **Step 7: Create `task_comment.rs`**

```rust
// src/tools/task_comment.rs
use super::traits::{Tool, ToolResult};
use crate::config::Config;
use crate::security::SecurityPolicy;
use crate::tasks::{self, ActorType};
use async_trait::async_trait;
use serde_json::json;
use std::sync::Arc;

pub struct TaskCommentTool {
    config: Arc<Config>,
    security: Arc<SecurityPolicy>,
    agent_id: Option<String>,
}

impl TaskCommentTool {
    pub fn new(config: Arc<Config>, security: Arc<SecurityPolicy>, agent_id: Option<String>) -> Self {
        Self { config, security, agent_id }
    }
}

#[async_trait]
impl Tool for TaskCommentTool {
    fn name(&self) -> &str { "add_comment" }
    fn description(&self) -> &str { "Add a comment to a task" }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "task_id": { "type": "string" },
                "content": { "type": "string", "description": "Comment text" }
            },
            "required": ["task_id", "content"]
        })
    }

    async fn execute(&self, args: serde_json::Value) -> anyhow::Result<ToolResult> {
        if !self.config.tasks.enabled {
            return Ok(ToolResult { success: false, output: String::new(), error: Some("Task engine is disabled".into()) });
        }
        if !self.security.can_act() {
            return Ok(ToolResult { success: false, output: String::new(), error: Some("Read-only mode".into()) });
        }
        if !self.security.record_action() {
            return Ok(ToolResult { success: false, output: String::new(), error: Some("Rate limit exceeded".into()) });
        }

        let task_id = match args.get("task_id").and_then(serde_json::Value::as_str) {
            Some(id) => id,
            None => return Ok(ToolResult { success: false, output: String::new(), error: Some("Missing 'task_id'".into()) }),
        };
        let content = match args.get("content").and_then(serde_json::Value::as_str) {
            Some(c) if !c.trim().is_empty() => c,
            _ => return Ok(ToolResult { success: false, output: String::new(), error: Some("Missing 'content'".into()) }),
        };

        match tasks::add_comment(
            &self.config,
            task_id,
            content,
            ActorType::Employee,
            self.agent_id.as_deref(),
            None,
        ) {
            Ok(comment) => Ok(ToolResult {
                success: true,
                output: serde_json::to_string_pretty(&comment)?,
                error: None,
            }),
            Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
        }
    }
}
```

- [ ] **Step 8: Create `task_read_comments.rs`**

```rust
// src/tools/task_read_comments.rs
use super::traits::{Tool, ToolResult};
use crate::config::Config;
use crate::tasks;
use async_trait::async_trait;
use serde_json::json;
use std::sync::Arc;

pub struct TaskReadCommentsTool {
    config: Arc<Config>,
}

impl TaskReadCommentsTool {
    pub fn new(config: Arc<Config>) -> Self {
        Self { config }
    }
}

#[async_trait]
impl Tool for TaskReadCommentsTool {
    fn name(&self) -> &str { "read_comments" }
    fn description(&self) -> &str { "Read comments on a task. Critical for reading review feedback and human instructions." }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "task_id": { "type": "string", "description": "Task ID to read comments for" }
            },
            "required": ["task_id"]
        })
    }

    async fn execute(&self, args: serde_json::Value) -> anyhow::Result<ToolResult> {
        if !self.config.tasks.enabled {
            return Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some("Task engine is disabled".into()),
            });
        }

        let task_id = match args.get("task_id").and_then(serde_json::Value::as_str) {
            Some(id) => id,
            None => return Ok(ToolResult { success: false, output: String::new(), error: Some("Missing 'task_id'".into()) }),
        };

        match tasks::list_comments(&self.config, task_id) {
            Ok(comments) => Ok(ToolResult {
                success: true,
                output: serde_json::to_string_pretty(&comments)?,
                error: None,
            }),
            Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
        }
    }
}
```

- [ ] **Step 9: Register all task tools in `src/tools/mod.rs`**

Add module declarations (after `pub mod web_search_tool;`):

```rust
pub mod task_list;
pub mod task_get;
pub mod task_create;
pub mod task_update_status;
pub mod task_create_subtask;
pub mod task_complete_subtask;
pub mod task_comment;
pub mod task_read_comments;
```

Add pub use statements:

```rust
pub use task_list::TaskListTool;
pub use task_get::TaskGetTool;
pub use task_create::TaskCreateTool;
pub use task_update_status::TaskUpdateStatusTool;
pub use task_create_subtask::TaskCreateSubtaskTool;
pub use task_complete_subtask::TaskCompleteSubtaskTool;
pub use task_comment::TaskCommentTool;
pub use task_read_comments::TaskReadCommentsTool;
```

In `all_tools_with_runtime()`, add after the `ShowToUserTool` push (before the composio check):

```rust
    // Task management tools (always available when tasks enabled)
    if root_config.tasks.enabled {
        // Agent ID comes from gateway agent routing; for single-agent mode it's None.
        // The platform (agent-runner) sets RANTAICLAW_AGENT_ID env var.
        let agent_id = std::env::var("RANTAICLAW_AGENT_ID").ok().filter(|s| !s.is_empty());
        tool_arcs.push(Arc::new(TaskListTool::new(config.clone(), agent_id.clone())));
        tool_arcs.push(Arc::new(TaskGetTool::new(config.clone())));
        tool_arcs.push(Arc::new(TaskCreateTool::new(config.clone(), security.clone(), agent_id.clone())));
        tool_arcs.push(Arc::new(TaskUpdateStatusTool::new(config.clone(), security.clone(), agent_id.clone())));
        tool_arcs.push(Arc::new(TaskCreateSubtaskTool::new(config.clone(), security.clone(), agent_id.clone())));
        tool_arcs.push(Arc::new(TaskCompleteSubtaskTool::new(config.clone(), security.clone(), agent_id.clone())));
        tool_arcs.push(Arc::new(TaskCommentTool::new(config.clone(), security.clone(), agent_id.clone())));
        tool_arcs.push(Arc::new(TaskReadCommentsTool::new(config.clone())));
    }
```

- [ ] **Step 10: Verify everything compiles**

Run: `cd packages/rantaiclaw && cargo check`
Expected: No errors

- [ ] **Step 11: Run all task tests**

Run: `cd packages/rantaiclaw && cargo test --lib tasks`
Expected: All tests PASS

- [ ] **Step 12: Run full test suite to check for regressions**

Run: `cd packages/rantaiclaw && cargo test`
Expected: All tests PASS

- [ ] **Step 13: Commit tools**

```bash
git add src/tools/task_list.rs src/tools/task_get.rs src/tools/task_create.rs \
        src/tools/task_update_status.rs src/tools/task_create_subtask.rs \
        src/tools/task_complete_subtask.rs src/tools/task_comment.rs \
        src/tools/task_read_comments.rs src/tools/mod.rs
git commit -m "feat(tasks): add 8 agent tools for task management"
```

---

## Chunk 4: Integration, Validation, and Polish

### Task 7: Run full validation

**Files:** None (validation only)

- [ ] **Step 1: Run cargo fmt**

Run: `cd packages/rantaiclaw && cargo fmt --all -- --check`
Expected: No formatting issues (fix if any)

- [ ] **Step 2: Run clippy**

Run: `cd packages/rantaiclaw && cargo clippy --all-targets -- -D warnings`
Expected: No warnings (fix if any)

- [ ] **Step 3: Run all tests**

Run: `cd packages/rantaiclaw && cargo test`
Expected: All tests PASS

- [ ] **Step 4: Verify binary size is reasonable**

Run: `cd packages/rantaiclaw && cargo build --release 2>&1 | tail -5 && ls -lh target/release/rantaiclaw`
Expected: No significant binary size regression (tasks add ~zero new deps)

- [ ] **Step 5: Final commit with any fixes**

```bash
git add -A
git commit -m "chore(tasks): formatting and clippy fixes"
```

---

### Task 8: Smoke test the gateway

- [ ] **Step 1: Build and run gateway locally**

```bash
cd packages/rantaiclaw
cargo run -- gateway --host 127.0.0.1 --port 8099
```

- [ ] **Step 2: Test task CRUD via curl**

```bash
# Create task
curl -s -X POST http://127.0.0.1:8099/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test task","priority":"HIGH"}' | jq .

# List tasks
curl -s http://127.0.0.1:8099/tasks | jq .

# Get task detail (use ID from create response)
curl -s http://127.0.0.1:8099/tasks/<ID> | jq .

# Add comment
curl -s -X POST http://127.0.0.1:8099/tasks/<ID>/comments \
  -H 'Content-Type: application/json' \
  -d '{"content":"Test comment"}' | jq .

# Update status
curl -s -X PUT http://127.0.0.1:8099/tasks/<ID> \
  -H 'Content-Type: application/json' \
  -d '{"status":"IN_PROGRESS"}' | jq .
```

Expected: All return valid JSON with correct data

- [ ] **Step 3: Test review flow**

```bash
# Move to IN_REVIEW
curl -s -X PUT http://127.0.0.1:8099/tasks/<ID> \
  -H 'Content-Type: application/json' \
  -d '{"status":"IN_REVIEW"}' | jq .

# Approve
curl -s -X POST http://127.0.0.1:8099/tasks/<ID>/review \
  -H 'Content-Type: application/json' \
  -d '{"action":"approve","comment":"Looks good"}' | jq .
```

Expected: Task moves to DONE with review_status APPROVED

- [ ] **Step 4: Test invalid transitions are rejected**

```bash
# Try to move DONE → IN_PROGRESS (should fail)
curl -s -X PUT http://127.0.0.1:8099/tasks/<ID> \
  -H 'Content-Type: application/json' \
  -d '{"status":"IN_PROGRESS"}' | jq .
```

Expected: 400 Bad Request with error message about invalid transition
