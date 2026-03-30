# Backend (Django) API Documentation

## Setup Local

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp ../.env.example .env
# Edit .env with your values

# Run migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Run development server
python manage.py runserver
```

## API Endpoints

### Agents
- `GET /api/v1/agents/` - List all agents
- `POST /api/v1/agents/` - Create new agent
- `GET /api/v1/agents/{id}/` - Get agent details
- `PATCH /api/v1/agents/{id}/` - Update agent
- `DELETE /api/v1/agents/{id}/` - Delete agent
- `POST /api/v1/agents/{id}/update_state/` - Update agent state
- `GET /api/v1/agents/active/` - List active agents

### Tasks
- `GET /api/v1/tasks/` - List all tasks
- `POST /api/v1/tasks/` - Create new task
- `GET /api/v1/tasks/{id}/` - Get task details
- `PATCH /api/v1/tasks/{id}/` - Update task
- `DELETE /api/v1/tasks/{id}/` - Delete task
- `POST /api/v1/tasks/{id}/execute/` - Execute task
- `POST /api/v1/tasks/{id}/complete/` - Mark as completed
- `POST /api/v1/tasks/{id}/fail/` - Mark as failed
- `GET /api/v1/tasks/by_status/` - Group tasks by status

### Epics
- `GET /api/v1/epics/` - List all epics
- `POST /api/v1/epics/` - Create new epic
- `GET /api/v1/epics/{id}/` - Get epic details
- `PATCH /api/v1/epics/{id}/` - Update epic
- `DELETE /api/v1/epics/{id}/` - Delete epic
- `GET /api/v1/epics/{id}/tasks/` - Get tasks in epic
- `GET /api/v1/epics/by_status/` - Group epics by status

### Health & Chat
- `GET /api/v1/health/` - Health check
- `POST /api/v1/chat/` - Send message to agent

## WebSocket Endpoints

### Real-time Updates
- `/ws/tasks/` - Task updates stream
- `/ws/agents/` - Agent status updates
- `/ws/logs/` - Thought logs stream

## Admin Interface

Access Django admin at: `http://localhost:8000/admin/`
- Default credentials: admin / admin

## Models

### Agent
- id: UUID
- name: String
- type: coordinator | executor | analyst
- state: idle | thinking | executing | blocked
- model: LLM model name (claude-3-opus, gpt-4, etc)
- capabilities: JSON list
- current_task: FK to Task
- timestamps

### Task
- id: UUID
- title: String
- description: Text
- epic: FK to Epic
- assigned_to: FK to Agent
- status: queue | processing | review | completed | failed
- priority: low | medium | high
- attempt_count: Integer
- result: JSON
- error: Text
- timestamps

### Epic
- id: UUID
- goal: String
- description: Text
- status: backlog | refinement | approved | completed | failed
- priority: low | medium | high
- created_by: FK to User
- timestamps

### ThoughtLog
- id: UUID
- agent: FK to Agent
- task: FK to Task (optional)
- message: Text
- level: debug | info | warning | error
- context: JSON
- timestamp

## Tests

```bash
# Run all tests
python manage.py test

# Run specific app tests
python manage.py test api

# With coverage
pip install coverage
coverage run --source='.' manage.py test
coverage report
```

## Deployment

### Using Docker

```bash
# Build and run
docker-compose up -d

# Create superuser in container
docker-compose exec backend python manage.py createsuperuser

# View logs
docker-compose logs -f backend
```

### Environment Variables

Required:
- `DJANGO_SECRET_KEY` - Django secret key
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `ANTHROPIC_API_KEY` - Anthropic API key (optional)
- `OPENAI_API_KEY` - OpenAI API key (optional)

Optional:
- `DEBUG` - Debug mode (default: True in dev)
- `ALLOWED_HOSTS` - Comma-separated list of allowed hosts
- `CORS_ALLOWED_ORIGINS` - Comma-separated CORS origins
