# 🏗️ Architecture Document

## System Overview

Heuriskein é uma arquitetura modular com três camadas principais:

```
┌─────────────────────────────────────────────────────────────┐
│                   PRESENTATION LAYER                         │
│            (Next.js Frontend - http://localhost:8000)        │
├─────────────────────────────────────────────────────────────┤
│  - Components: Kanban Board, Chat, Agent Panel, Logs Console │
│  - State: Zustand (global state management)                  │
│  - Communication: HTTP REST + WebSocket                      │
├─────────────────────────────────────────────────────────────┤
│                    API LAYER                                 │
│    (Django REST Framework - http://localhost:8001/api/v1)    │
├─────────────────────────────────────────────────────────────┤
│  - Endpoints: Agents, Tasks, Epics, Chat                     │
│  - Authentication: Token-based JWT                           │
│  - WebSocket: Channels (real-time updates)                   │
├─────────────────────────────────────────────────────────────┤
│                    BUSINESS LOGIC                            │
│  - Agent Orchestration: LangGraph                            │
│  - Task Execution: Celery workers                            │
│  - LLM Integration: Claude + OpenAI APIs                     │
├─────────────────────────────────────────────────────────────┤
│                 DATA & STORAGE LAYER                         │
│  - Database: PostgreSQL (agents, tasks, epics, logs)         │
│  - Cache: Redis (real-time messaging, sessions)              │
│  - Message Broker: Redis (Celery tasks)                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

### Frontend Components

```
src/app/
├── page.tsx (Main Dashboard)
│   ├── <Layout>
│   │   ├── <Sidebar>          # Navigation
│   │   └── <MainContent>
│   │       ├── <KanbanBoard>
│   │       │   ├── <EpicColumn> x 5
│   │       │   │   └── <EpicCard> x N
│   │       │   └── <TaskColumn> x 5
│   │       │       └── <TaskCard> x N
│   │       ├── <ChatPanel>
│   │       │   ├── <MessageList>
│   │       │   └── <MessageInput>
│   │       ├── <AgentPanel>
│   │       │   └── <AgentCard> x N
│   │       └── <LogsConsole>
│   │           └── <LogEntry> x 500

src/lib/
├── api.ts               # API Client (Axios)
├── websocket.ts         # WebSocket Client

src/store/
└── appStore.ts          # Zustand Store

src/hooks/
└── [custom hooks TBD]
```

### Backend Structure

```
backend/
├── heuriskein/          # Project config
│   ├── settings.py      # Django settings
│   ├── urls.py          # URL routing
│   ├── asgi.py          # WebSocket config (Channels)
│   └── wsgi.py          # WSGI config

├── api/                 # Main API app
│   ├── models.py        # Data models
│   │   ├── Agent        # AI agent representation
│   │   ├── Task         # Executable task
│   │   ├── Epic         # Strategic goal
│   │   ├── ThoughtLog   # Agent thoughts
│   │   └── ChatMessage  # Chat history
│   │
│   ├── views.py         # API ViewSets
│   │   ├── AgentViewSet
│   │   ├── TaskViewSet
│   │   ├── EpicViewSet
│   │   ├── HealthCheckAPIView
│   │   └── ChatAPIView
│   │
│   ├── serializers.py   # JSON serializers
│   ├── admin.py         # Django Admin
│   ├── consumers.py     # WebSocket consumers
│   │   ├── TaskConsumer
│   │   ├── AgentConsumer
│   │   └── ThoughtLogConsumer
│   │
│   └── tests.py         # Unit tests
```

---

## Data Model Relationships

```
        Epic (1) ←──── (N) Task
        ├─ goal
        ├─ description
        ├─ status
        ├─ priority
        └─ created_by (FK User)
                       │
                       └─── assigned_to (FK Agent)
                                    │
                                    ├── Agent (1) ←──── (N) ThoughtLog
                                    ├─ name
                                    ├─ type
                                    ├─ state
                                    ├─ model
                                    ├─ capabilities
                                    └─ current_task (FK Task)
                                                    │
                                                    └─── ThoughtLog
                                                        ├─ agent_id (FK)
                                                        ├─ task_id (FK)
                                                        ├─ message
                                                        ├─ level
                                                        └─ context

User
├─ username
├─ email
└─ (1) ←──── (N) ChatMessage
                 ├─ user_message
                 ├─ agent_response
                 ├─ agent_id (FK Agent)
                 └─ timestamp
```

---

## API Request/Response Flow

### Example: Execute Task

```
Client Browser Request:
────────────────────
POST /api/v1/tasks/{id}/execute/

Django Backend Processing:
───────────────────────
1. Authenticate user (Token)
2. Get Task object
3. Validate task status (must be 'queue')
4. Find available Agent
5. Update Task status → 'processing'
6. Update Agent state → 'executing'
7. Create ThoughtLog entry
8. Trigger WebSocket event

Response to Client:
──────────────────
{
  "id": "task-uuid",
  "title": "Task Name",
  "status": "processing",
  "assigned_to": "agent-uuid",
  "attempt_count": 1,
  ...
}

WebSocket Broadcast:
───────────────────
{
  "type": "task_updated",
  "task_id": "task-uuid",
  "data": {
    "status": "processing",
    "assigned_to": "agent-uuid"
  }
}

Frontend Update:
────────────────
1. Receive WebSocket event
2. Update Zustand store
3. Re-render affected components
4. Task moved to 'Processing' column
5. Agent shows as 'executing' in panel
```

---

## WebSocket Real-Time Updates

### Connection Flows

```
Frontend connects:
──────────────────
WS ws://localhost:8001/ws
├─ /ws/tasks/        → Real-time task updates
├─ /ws/agents/       → Agent status changes
└─ /ws/logs/         → Thought logs stream

Messages Sent by Backend:
──────────────────────
{
  "type": "task_updated",
  "task_id": "uuid",
  "data": {...}
}

{
  "type": "agent_status_changed",
  "agent_id": "uuid",
  "state": "executing"
}

{
  "type": "thought_log",
  "agent_id": "uuid",
  "agent_name": "AgentName",
  "message": "Thinking about task...",
  "level": "info",
  "timestamp": "2026-03-29T10:00:00Z"
}
```

---

## Agent Orchestration Flow

```
Task Created
    ↓
Task Queue
    ↓ (Execute API called)
Find Available Agent
    ↓
Allocate Task to Agent
    ↓
Agent Processes Task
├─ LangGraph workflow
├─ LLM (Claude/GPT-4)
├─ Tool execution
└─ Generate logs
    ↓
Task Completion/Failure
    ↓
Agent Returns to Idle
    ↓
Update Status in DB
    ↓
Notify clients via WebSocket
```

---

## State Management (Zustand)

### Global Store Structure

```typescript
useAppStore {
  // UI State
  selectedAgent: string | null
  sidebarOpen: boolean
  rightPanelOpen: boolean
  theme: 'dark' | 'light'
  
  // Data State
  agents: Agent[]
  tasks: Task[]
  epics: Epic[]
  logs: ThoughtLog[]
  
  // WebSocket State
  wsConnected: boolean
  
  // Actions
  setSelectedAgent()
  addTask()
  updateTask()
  addLog()
  clearLogs()
  ...
}
```

---

## Database Schema

### Tables

#### agents
```sql
id (UUID) PRIMARY KEY
name VARCHAR(255)
type ENUM(coordinator, executor, analyst)
state ENUM(idle, thinking, executing, blocked)
model VARCHAR(100)
capabilities JSON
current_task FK(tasks)
created_at TIMESTAMP
updated_at TIMESTAMP
last_activity TIMESTAMP
```

#### tasks
```sql
id (UUID) PRIMARY KEY
title VARCHAR(255)
description TEXT
epic_id FK(epics)
assigned_to FK(agents)
status ENUM(queue, processing, review, completed, failed)
priority ENUM(low, medium, high)
attempt_count INTEGER
result JSON
error TEXT
created_at TIMESTAMP
updated_at TIMESTAMP
started_at TIMESTAMP
completed_at TIMESTAMP
```

#### epics
```sql
id (UUID) PRIMARY KEY
goal VARCHAR(255)
description TEXT
status ENUM(backlog, refinement, approved, completed, failed)
priority ENUM(low, medium, high)
created_by FK(auth_user)
created_at TIMESTAMP
updated_at TIMESTAMP
```

#### thought_logs
```sql
id (UUID) PRIMARY KEY
agent_id FK(agents)
task_id FK(tasks)
message TEXT
level ENUM(debug, info, warning, error)
context JSON
timestamp TIMESTAMP
```

#### chat_messages
```sql
id (UUID) PRIMARY KEY
agent_id FK(agents)
user_id FK(auth_user)
user_message TEXT
agent_response TEXT
context JSON
created_at TIMESTAMP
```

---

## Security Architecture

### Authentication & Authorization

```
Token-Based Authentication:
───────────────────────
1. User logs in
2. Server returns auth token
3. Client stores in localStorage
4. All API requests include token in header:
   Authorization: Token <token>
5. Channels WebSocket validates token

Permissions:
────────
- IsAuthenticated: All API endpoints require auth
- User can only access own tasks/epics
- Agents are system-shared
```

### Data Protection

```
- Passwords: Django's PBKDF2 hashing
- Tokens: Random token generation
- API: HTTPS only in production
- CORS: Whitelist frontend origins
- SQL Injection: Django ORM parameterization
- XSS: React auto-escaping + CSP headers
```

---

## Performance Considerations

### Frontend Optimization

```
- Code splitting: Per-route lazy loading
- Image optimization: Next.js Image component
- CSS: Tailwind JIT + tree-shaking
- State: Zustand (minimal re-renders)
- WebSocket: Efficient JSON messaging
```

### Backend Optimization

```
- Database: PostgreSQL with indexes on:
  - tasks.status (frequently queried)
  - agents.state (status checks)
  - thought_logs.timestamp (recent logs)
  
- Caching: Redis for:
  - Authentication tokens
  - Frequently accessed agents list
  
- Async Tasks: Celery for:
  - Long-running LLM calls
  - Email notifications
  - Log processing
  
- Query Optimization:
  - select_related() for ForeignKeys
  - prefetch_related() for reverse relations
  - Pagination: 100 items per page
```

---

## Deployment Architecture

### Docker Containers

```
frontend:3000
    ↓ (HTTP/WS)
    
backend:8001 (Daphne ASGI)
    ├─ API endpoints
    ├─ WebSocket handler
    └─ 

celery:worker
    ├─ Task queue processing
    └─ Async jobs

db:5432 (PostgreSQL)

redis:6379
    ├─ Channels layer
    ├─ Celery broker
    └─ Cache
```

### Scaling Strategy

```
Horizontal Scaling:
─────────────────
- Multiple frontend instances (nginx load balancer)
- Multiple backend instances (gunicorn + nginx)
- Multiple celery workers
- PostgreSQL read replicas
- Redis cluster for cache/messaging

Vertical Scaling:
───────────────
- Increase container resources
- Database indexes & optimization
- Caching strategies
```

---

## Integration Points

### LLM Integration (Future)

```
Task Execution Flow:
────────────────
1. Task arrives at Agent via LangGraph
2. LangGraph calls LLM with:
   - Task description
   - Agent capabilities
   - Previous context
3. LLM returns:
   - Thought process (logged)
   - Action plan
   - Tool calls
4. Tools executed:
   - API calls
   - File operations
   - Database queries
5. Results fed back to LLM
6. Final output returned
7. Task status updated
```

### External API Integrations

```
Planned:
- Slack notifications
- GitHub integration
- Jira sync
- Email alerts
- External webhooks
```

---

## Monitoring & Logging

### Application Logs

```
- Django logging: DEBUG, INFO, WARNING, ERROR
- WebSocket logs: Connection/disconnect events
- Celery logs: Task execution status
- Thought logs: Agent decision logs
```

### Metrics to Track

```
- API response times
- WebSocket message latency
- Task execution success rate
- Agent utilization
- Database query performance
- Cache hit/miss ratio
```

---

## Error Handling

### Strategy

```
Client Side:
───────────
- Network error: Retry with exponential backoff
- API error: Display user-friendly message
- WebSocket disconnect: Auto-reconnect
- Form validation: Real-time feedback

Server Side:
───────────
- 400: Bad request (validation failed)
- 401: Unauthorized
- 403: Forbidden
- 404: Not found
- 500: Server error (log and notify admin)
- 503: Service unavailable
```

---

## Testing Strategy

### Unit Tests

```
Backend:
- Model tests: Create, update, delete
- Serializer tests: JSON conversion
- View tests: API endpoints
- Consumer tests: WebSocket events

Frontend:
- Component tests: Rendering, interaction
- Hook tests: Custom hooks
- Store tests: State management
```

### Integration Tests

```
- API workflows: Create epic → Create task → Execute
- WebSocket flows: Real-time updates
- Authentication: Login → API access
```

### E2E Tests

```
- Full user workflows
- Real browser testing
- Performance testing
```

---

## Version History

- **v0.1.0** (March 2026) - Initial setup, core models & API
- **v0.2.0** (Planned) - LLM integration, real-time features
- **v1.0.0** (Planned) - Production-ready, full feature set

---

**Last Updated**: March 29, 2026  
**Architecture Version**: 1.0
