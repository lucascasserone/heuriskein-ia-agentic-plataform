# Implementation Backlog

## Purpose

This document is the living control file for evolving the product from a chat-plus-kanban MVP into a hierarchical, corporate, multi-agent operating system with artifacts, approvals, and traceable execution.

Use this file to:

- track product pains and the backlog items that solve them
- prioritize implementation waves
- record scope, dependencies, and acceptance criteria
- keep the next execution slice explicit

## Product Pains Covered

| Pain | Covered By |
| --- | --- |
| Agent responses are poorly formatted and hard to operate | BL-01, BL-02, BL-04, BL-18 |
| Cards do not show outputs or attachments | BL-06, BL-07, BL-09, BL-19 |
| Board usability is below Trello or Planner expectations | BL-08, BL-09, BL-10, BL-17 |
| Product lacks hierarchical and corporate behavior | BL-03, BL-13, BL-14, BL-15, BL-16, BL-18, BL-19, BL-20 |
| Agents do not feel coordinated or traceable | BL-05, BL-11, BL-12, BL-13, BL-14 |
| Product is still far from n8n + ChatGPT + business-in-a-box | BL-04, BL-11, BL-15, BL-18, BL-21, BL-22 |

## Status Model

- `planned`: defined but not started
- `ready`: scoped and available to implement
- `in-progress`: currently being implemented
- `blocked`: depends on another backlog item or unresolved decision
- `done`: implemented and validated

## Priority Rules

1. Prefer items that change product perception, not just internal structure.
2. Prefer items that make agent output operational and reviewable.
3. Prefer items that improve traceability across chat, kanban, and org chart.
4. Do not optimize visual polish before artifacts, events, and subtasks exist.

## Backlog

| ID | Item | Status | Priority | Depends On | Acceptance Criteria |
| --- | --- | --- | --- | --- | --- |
| BL-01 | Structured agent output contract | in-progress | P0 | - | Agent execution persists `summary`, `plan`, `subtasks`, `artifacts`, `risks`, `next_action`, `approval_needed` as structured data instead of text-only output. |
| BL-02 | Task event timeline | in-progress | P0 | BL-01 | Every task shows a chronological history of creation, decomposition, assignment, execution, review, approval, rollback, and completion. |
| BL-03 | Subtasks and dependencies | in-progress | P0 | BL-01 | Complex work can be decomposed into child subtasks with owners, dependencies, and aggregated progress. |
| BL-04 | Chat as structured command surface | in-progress | P1 | BL-01, BL-03 | Chat messages create and update goals, plans, tasks, subtasks, and approvals instead of producing isolated conversational output. |
| BL-05 | Automatic decomposition in execution engine | in-progress | P0 | BL-01, BL-03 | The engine generates subtasks by default for complex tasks and records handoffs. |
| BL-06 | Artifact model and persistent attachments | in-progress | P0 | BL-01 | Tasks and epics can store documents, diffs, reports, specs, decisions, and test results as first-class artifacts. |
| BL-07 | Sandbox to artifact integration | in-progress | P0 | BL-06 | File previews, snapshots, applies, and rollbacks appear as attached artifacts and timeline events. |
| BL-08 | High-usability operational cards | done | P1 | BL-02, BL-03, BL-06 | Cards show owner, priority, progress, blockers, attachments, last action, next action, and subtask counts. |
| BL-09 | Task detail drawer | done | P1 | BL-02, BL-03, BL-06 | Clicking a card opens a detail workspace with timeline, subtasks, artifacts, approvals, and quick actions. |
| BL-10 | Quick management actions | done | P1 | BL-09 | Users can approve, request review, reassign, split, attach, move, block, and set due dates without leaving the board. |
| BL-11 | Multi-agent role workflow | in-progress | P1 | BL-01, BL-03 | Director, Planner, Coordinator, Executor, Reviewer, and Analyst handoffs are explicit and visible. |
| BL-12 | Agent queue and capacity view | in-progress | P1 | BL-11 | Users can see WIP, queue, throughput, and overload by agent. |
| BL-13 | Org chart linked to real work | in-progress | P1 | BL-03, BL-11 | Org nodes reflect tasks, subtasks, handoffs, and active workload by area and agent. |
| BL-14 | Org chart to kanban synchronization | in-progress | P1 | BL-13 | Selecting org nodes filters and highlights related work in kanban, and vice versa. |
| BL-15 | Approval workflow | in-progress | P1 | BL-06, BL-09 | Sensitive deliverables can pause for approval with approver, rationale, and outcome recorded. |
| BL-16 | Decision center | in-progress | P2 | BL-15 | Strategic decisions are stored with supporting artifacts, rationale, impact, and scope. |
| BL-17 | Advanced filters and search | done | P2 | BL-08 | Board and task detail support filters by team, agent, risk, due date, blocker, priority, and artifact type. |
| BL-18 | Corporate documents and live records | in-progress | P2 | BL-06, BL-15 | Briefs, specs, reports, SOPs, retrospectives, and decision memos can be attached and versioned. |
| BL-19 | Executive dashboard | in-progress | P2 | BL-12, BL-15, BL-16 | Leaders can view initiative health, bottlenecks, approvals pending, risk, and agent capacity. |
| BL-20 | Corporate memory by area and initiative | in-progress | P2 | BL-18 | Agents reuse department, initiative, and workflow context consistently over time. |
| BL-21 | Workflow graph and automation chains | in-progress | P2 | BL-04, BL-11 | The product supports chained execution steps, conditions, approvals, and tool actions similar to n8n-style flows. |
| BL-22 | Business playbook library | in-progress | P3 | BL-18, BL-21 | Reusable operational playbooks exist for common business workflows such as hiring, launches, incidents, and support. |

## Implementation Waves

### Wave 1 - Make work structured and reviewable

Goal: remove text-only execution and introduce artifacts, events, and subtasks.

- BL-01 Structured agent output contract
- BL-02 Task event timeline
- BL-03 Subtasks and dependencies
- BL-05 Automatic decomposition in execution engine
- BL-06 Artifact model and persistent attachments
- BL-07 Sandbox to artifact integration

Exit criteria:

- agent output is persisted as structured data
- every complex task can create subtasks
- every file-related output appears as an artifact
- task history is visible and auditable

### Wave 2 - Make the board operational

Goal: make cards and task detail behave like a real project management tool.

- BL-08 High-usability operational cards
- BL-09 Task detail drawer
- BL-10 Quick management actions
- BL-17 Advanced filters and search

Exit criteria:

- cards show operational context, not only labels
- a user can inspect and operate a task without leaving the board flow
- artifacts and subtasks are visible from the card and drawer

### Wave 3 - Make agents feel like a coordinated team

Goal: expose roles, handoffs, and capacity.

- BL-11 Multi-agent role workflow
- BL-12 Agent queue and capacity view
- BL-13 Org chart linked to real work
- BL-14 Org chart to kanban synchronization

Exit criteria:

- the org chart reflects execution, not only structure
- handoffs and ownership are visible
- work decomposition is traceable across roles and boards

### Wave 4 - Add corporate governance

Goal: support approvals, decisions, and enterprise records.

- BL-15 Approval workflow
- BL-16 Decision center
- BL-18 Corporate documents and live records
- BL-19 Executive dashboard
- BL-20 Corporate memory by area and initiative

Exit criteria:

- decisions and approvals are first-class objects
- documents and records are linked to work items
- leadership can monitor operational health

### Wave 5 - Reach the target product shape

Goal: combine structured chat, automation chains, and reusable business operations.

- BL-04 Chat as structured command surface
- BL-21 Workflow graph and automation chains
- BL-22 Business playbook library

Exit criteria:

- chat acts as strategic control, not the only workspace
- workflows can chain multiple steps and approvals
- recurring business processes can run as playbooks

## Current Execution Slice

Status: `ready`

Start with the smallest slice that changes product perception:

1. BL-11 Multi-agent role workflow
2. BL-12 Agent queue and capacity view
3. BL-13 Org chart linked to real work
4. BL-14 Org chart to kanban synchronization

Why this slice next:

- it turns structured execution into explicit team handoffs
- it exposes operational capacity and queue pressure per agent
- it connects org representation to live delivery state
- it prepares governance and dashboard layers with role-aware data

## Technical Starting Map

### Backend likely entry points

- `backend/api/models.py`
- `backend/api/serializers.py`
- `backend/api/views.py`
- `backend/api/execution_engine.py`
- `backend/api/file_sandbox.py`
- `backend/api/tests.py`

### Frontend likely entry points

- `frontend/src/lib/api.ts`
- `frontend/src/lib/enhanced-api.ts`
- `frontend/src/components/DualKanbanDragDrop.tsx`
- `frontend/src/components/CommandCenter.tsx`
- `frontend/src/app/organizacao/page.tsx`
- `frontend/src/store/appStore.ts`

## Execution Notes

- Do not start Wave 2 card polish before Wave 1 data structures exist.
- Artifacts, events, and subtasks are the product backbone.
- Every new workflow should be visible in both kanban and org chart.
- Every major agent action should create either a task event, an artifact, or both.

## Update Log

- 2026-04-07: Created living backlog document and defined implementation waves.
- 2026-04-07: Marked Wave 1 as the starting execution slice.
- 2026-04-07: Implemented backend foundations for artifacts, task events, subtasks, workspace detail endpoint, and execution-engine persistence.
- 2026-04-07: Started frontend integration for enriched operational cards and task workspace drawer.
- 2026-04-07: Added artifact approval/apply and snapshot rollback actions to the task workspace flow.
- 2026-04-08: Added manual subtask endpoint support plus task reassignment, status control, and manual subtask creation in the task workspace drawer.
- 2026-04-07: Added inline update controls for subtask status/owner in the workspace drawer and fixed clarification answer flow boundaries in backend views.
- 2026-04-08: Added editable subtask priority and dependency mapping in drawer, with backend serializer support for persisting depends_on relationships.
- 2026-04-08: Added backend cycle detection for subtask dependencies and regression tests to reject circular dependency chains.
- 2026-04-08: Updated drawer dependency selector to disable options that would create dependency cycles, reducing user trial-and-error.
- 2026-04-08: Completed Wave 2 by adding task due dates and advanced board filters (owner, blocker, artifacts, subtasks, due-state), with backend migration and tests.
- 2026-04-08: Started Wave 3 with explicit task handoff event tracking on reassignment and a new agent capacity endpoint + board capacity panel.
- 2026-04-08: Added kanban-org sync events for agent focus, including task-card shortcut to open organization view and reverse filtering from selected org task.
- 2026-04-08: Connected bidirectional wave-3 navigation flow between Kanban and Organization (task card -> org focus by agent, org selection -> kanban owner filter).
- 2026-04-08: Improved Kanban-to-Organization focus with payload-based matching (agent + task title) to highlight the most relevant org node.
- 2026-04-08: Added Wave-3 operational visibility layer: role-handoff swimlane and overload alerts in Kanban, plus workload badges (WIP/fila/bloqueio) in org nodes.
- 2026-04-08: Implemented BL-15 foundation: formal approval requests for sensitive artifacts, decision records (approved/rejected), and mandatory approved request before file apply.
- 2026-04-08: Started BL-16 Decision Center with persisted decision records, auto-generated approval decisions, manual decision registration, and a dedicated decisions tab in the task workspace.
- 2026-04-08: Expanded BL-16 with decision supersession chains (supersedes link), task action to replace prior decisions, UI action in Decisions tab, and backend regression tests.
- 2026-04-10: Added Wave 4/5 foundations: corporate documents, corporate memory entries, executive dashboard endpoint, workflow playbooks/runs, seeded playbook templates, chat commands for document creation and playbook execution, and frontend pages for records/playbooks.
