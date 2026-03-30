# Heuriskein IA - Desenvolvimento Local

## Status do Projeto

✅ **Backend (Django)**
- Models (Agent, Task, Epic, ThoughtLog)
- API Endpoints completos
- WebSocket Consumers
- Configuração Django
- Docker setup

✅ **Frontend (Next.js)**
- Layout de 3 colunas
- Componentes principais (Kanban, Chat, Agent Panel, Logs)
- State management (Zustand)
- API client (axios)
- WebSocket client
- Tailwind CSS styling

✅ **DevOps**
- Docker Compose para orquestração
- Dockerfile para backend e frontend
- Configuração de variáveis de ambiente

## 🚀 Quick Start (Docker)

```bash
# Navigate to project root
cd heuriskein-ia-agentic-plataform

# Copy .env
cp .env.example .env

# Start services
docker-compose up -d

# Create superuser
docker-compose exec backend python manage.py createsuperuser

# Access services
# Frontend: http://localhost:8000
# Backend API: http://localhost:8001/api/v1/
# Admin: http://localhost:8001/admin/
```

## 🛠️ Development Local (sem Docker)

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure database (PostgreSQL required)
# Edit .env with database URL

# Run migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Start server
python manage.py runserver

# Run Celery (in another terminal)
celery -A heuriskein worker -l info
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev

# Open http://localhost:3000
```

## 📊 Project Structure

```
heuriskein-ia-agentic-plataform/
├── backend/                    # Django API
│   ├── heuriskein/            # Project config
│   ├── api/                   # Main app
│   │   ├── models.py          # Data models
│   │   ├── views.py           # API endpoints
│   │   ├── serializers.py     # JSON serializers
│   │   ├── consumers.py       # WebSocket consumers
│   │   └── admin.py           # Admin interface
│   ├── manage.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/                   # Next.js app
│   ├── src/
│   │   ├── app/               # Next.js 14 app directory
│   │   ├── components/        # React components
│   │   ├── lib/               # Utilities (API, WebSocket)
│   │   ├── store/             # Zustand store
│   │   └── hooks/             # Custom hooks
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── docker/                     # Docker configs
├── docker-compose.yml          # Orchestration
├── .env.example               # Environment template
├── README.md                  # This file
└── PROJECT_SUMMARY.md         # Full requirements
```

## 🔌 API Endpoints

### Agents
- `GET /api/v1/agents/` - List agents
- `GET /api/v1/agents/active/` - Active agents only
- `POST /api/v1/agents/` - Create agent
- `POST /api/v1/agents/{id}/update_state/` - Update state

### Tasks
- `GET /api/v1/tasks/` - List tasks
- `GET /api/v1/tasks/by_status/` - Grouped by status
- `POST /api/v1/tasks/` - Create task
- `POST /api/v1/tasks/{id}/execute/` - Execute task
- `POST /api/v1/tasks/{id}/complete/` - Mark complete
- `POST /api/v1/tasks/{id}/fail/` - Mark failed

### Epics
- `GET /api/v1/epics/` - List epics
- `GET /api/v1/epics/by_status/` - Grouped by status
- `POST /api/v1/epics/` - Create epic

### Chat & Monitoring
- `POST /api/v1/chat/` - Send message to agent
- `GET /api/v1/health/` - Health check

## 🔄 Próximos Passos

### Curto Prazo (1-2 semanas)
- [ ] Integração com LLM (Anthropic Claude/OpenAI) via LangGraph
- [ ] Implementar WebSocket real-time completo
- [ ] Drag-and-drop no Kanban Board
- [ ] UI para criar épicos/tarefas
- [ ] Autenticação JWT

### Médio Prazo (1 mês)
- [ ] Executar agentes de verdade com LLMs
- [ ] Dashboard com métricas
- [ ] Histórico completo de execuções
- [ ] Filtros avançados
- [ ] Export/import de dados

### Longo Prazo
- [ ] Multi-tenancy
- [ ] Tool marketplace
- [ ] Fine-tuning de modelos
- [ ] Integração com APIs externas
- [ ] A/B testing de agentes

## 🐛 Troubleshooting

### PostgreSQL Connection Error
- Ensure PostgreSQL is running
- Check `DATABASE_URL` in `.env`
- Run: `python manage.py migrate`

### WebSocket Connection Failed
- Check Redis is running
- Verify `REDIS_URL` in `.env`
- Check CORS settings in `settings.py`

### Frontend Build Issues
- Delete `node_modules` and `.next`
- Run `npm install` and `npm run build`

## 📚 Documentation

- [Backend Docs](./backend/README.md)
- [Frontend Docs](./frontend/README.md)
- [API Schema](./backend/README.md#api-endpoints)
- [Architecture](./docs/ARCHITECTURE.md) (TBD)

## 🔐 Security Notes

- Change `DJANGO_SECRET_KEY` in production
- Use strong database passwords
- Enable HTTPS in production
- Implement rate limiting
- Add authentication/authorization

## 📝 License

MIT

---

**Developed by**: Marco Baldassari  
**Date**: March 2026  
**Status**: Active Development (v0.1.0)
