# 🤖 Heuriskein IA - Multi-Agentic Web System

Um sistema de orquestração inteligente que gerencia múltiplos agentes de IA para executar tarefas complexas de forma coordenada e eficiente.

**Status**: 🚀 Em Desenvolvimento (v0.1.0)  
**Data**: Março 2026

---

## 📊 Overview

Heuriskein é uma plataforma completa para:
- 🎯 **Orquestração de Agentes**: Gerenciar múltiplos agentes de IA (Coordinator, Executor, Analyst)
- 📋 **Kanban Duplo**: Planejamento estratégico (Épicos) + Execução operacional (Tarefas)
- 💬 **Chat em Tempo Real**: Comunicação bidirecional com agentes via WebSocket
- 👥 **Monitoramento**: Painel de agentes com status em tempo real
- 📝 **Logs Inteligentes**: Console de pensamento dos agentes com filtros

---

## 🛠️ Stack Tecnológico

### Backend
- **Django 4.2** + Django REST Framework
- **PostgreSQL** - Banco de dados
- **Redis** - Cache e message broker
- **Channels** - WebSocket real-time
- **Celery** - Tarefas assíncronas
- **LangGraph** - Orquestração de agentes
- **Anthropic Claude** + **OpenAI GPT** - LLMs
- **Daphne + Gunicorn** - Servidores ASGI/WSGI

### Frontend
- **Next.js 14** - React framework
- **TypeScript** - Type-safe code
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **Axios** - HTTP client
- **WebSocket API** - Real-time updates

### DevOps
- **Docker** + **Docker Compose** - Containerização
- **PostgreSQL 15** - Database container
- **Redis 7** - Cache container

---

## 🚀 Quick Start

### Pré-requisitos
- Docker & Docker Compose
- Git

### Setup (5 minutos)

```bash
# Clone o repositório
git clone <repo-url>
cd heuriskein-ia-agentic-plataform

# Copy .env
cp .env.example .env
# Edit .env with your API keys

# Inicie os serviços
docker-compose up -d

# Criar superuser
docker-compose exec backend python manage.py createsuperuser

# ✅ Frontend: http://localhost:8000
# ✅ Backend API: http://localhost:8001/api/v1/
# ✅ Admin: http://localhost:8001/admin/
```

---

## 📁 Estrutura do Projeto

```
heuriskein-ia-agentic-plataform/
├── backend/                 # Django API
│   ├── heuriskein/         # Project config
│   ├── api/                # Main app
│   │   ├── models.py       # Agent, Task, Epic, ThoughtLog
│   │   ├── views.py        # API endpoints
│   │   ├── consumers.py    # WebSocket handlers
│   │   └── admin.py        # Django admin
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/               # Next.js app
│   ├── src/
│   │   ├── app/            # Pages & layout
│   │   ├── components/     # React components
│   │   ├── lib/            # API & WebSocket clients
│   │   └── store/          # Zustand store
│   ├── package.json
│   └── Dockerfile
│
├── docker-compose.yml      # Orchestration
├── .env.example           # Configuration template
├── PROJECT_SUMMARY.md     # Full requirements
└── DEVELOPMENT.md         # Development guide
```

---

## 🎯 Funcionalidades Principais

### 1️⃣ Kanban Board Duplo
- **Planejamento Estratégico** (Épicos)
  - Estados: Backlog → Refinement → Approved → Completed/Failed
  - Drag-and-drop entre colunas
  - Rastreamento de tarefas por épico

- **Execução Operacional** (Tarefas)
  - Estados: Queue → Processing → Review → Completed/Failed
  - Alocação automática de agentes
  - Histórico de tentativas e erros

### 2️⃣ Orquestração de Agentes
- Criação e configuração de agentes
- Suporte para tipos: Coordinator, Executor, Analyst
- Modelo LLM selecionável (Claude, GPT-4, etc)
- Capacidades customizáveis
- Status em tempo real: idle, thinking, executing, blocked

### 3️⃣ Chat em Tempo Real
- Mensagens com agentes selecionados
- Histórico completo de conversas
- Contexto automático (tarefas, épicos)
- Respostas en tempo real via WebSocket

### 4️⃣ Painel de Agentes
- Lista de agentes ativos
- Indicadores visuais de estado
- Capacidades listadas
- Click para selecionar para chat

### 5️⃣ Console de Logs
- Logs de pensamento em tempo real
- Filtros por nível (info, debug, warning, error)
- Filtros por agente
- Últimos 500 logs em memória
- Timestamps precisos

---

## 🔌 API Endpoints

### Agents
```
GET    /api/v1/agents/                - List agents
POST   /api/v1/agents/                - Create agent
GET    /api/v1/agents/{id}/           - Get agent details
PATCH  /api/v1/agents/{id}/           - Update agent
DELETE /api/v1/agents/{id}/           - Delete agent
POST   /api/v1/agents/{id}/update_state/ - Update state
GET    /api/v1/agents/active/         - Active agents only
```

### Tasks
```
GET    /api/v1/tasks/                 - List tasks
POST   /api/v1/tasks/                 - Create task
GET    /api/v1/tasks/{id}/            - Get task details
PATCH  /api/v1/tasks/{id}/            - Update task
DELETE /api/v1/tasks/{id}/            - Delete task
POST   /api/v1/tasks/{id}/execute/    - Execute task
POST   /api/v1/tasks/{id}/complete/   - Mark complete
POST   /api/v1/tasks/{id}/fail/       - Mark failed
GET    /api/v1/tasks/by_status/       - Grouped by status
```

### Epics
```
GET    /api/v1/epics/                 - List epics
POST   /api/v1/epics/                 - Create epic
GET    /api/v1/epics/{id}/            - Get epic details
PATCH  /api/v1/epics/{id}/            - Update epic
DELETE /api/v1/epics/{id}/            - Delete epic
GET    /api/v1/epics/{id}/tasks/      - Get epic's tasks
GET    /api/v1/epics/by_status/       - Grouped by status
```

### Other
```
POST   /api/v1/chat/                  - Send message to agent
GET    /api/v1/health/                - Health check
```

---

## 🔄 Data Models

### Agent
```json
{
  "id": "uuid",
  "name": "string",
  "type": "coordinator|executor|analyst",
  "state": "idle|thinking|executing|blocked",
  "model": "claude-3-opus|gpt-4",
  "capabilities": ["string"],
  "current_task": "uuid|null"
}
```

### Task
```json
{
  "id": "uuid",
  "title": "string",
  "description": "string",
  "epic": "uuid|null",
  "status": "queue|processing|review|completed|failed",
  "priority": "low|medium|high",
  "assigned_to": "uuid|null",
  "attempt_count": "integer",
  "result": "object|null",
  "error": "string|empty"
}
```

### Epic
```json
{
  "id": "uuid",
  "goal": "string",
  "description": "string",
  "status": "backlog|refinement|approved|completed|failed",
  "priority": "low|medium|high",
  "created_by": "uuid"
}
```

---

## 🧠 How It Works

```
User (Browser)
    ↓
Frontend (Next.js)
    ├→ REST API  →  Backend (Django)  →  Database (PostgreSQL)
    ├→ WebSocket →  Backend (Channels) → Redis
    └→ Chat UI        ↓
                  LangGraph Agents Orchestration
                        ↓
                  LLM (Claude/GPT-4)
                        ↓
                  Tool Execution
```

---

## 🏃 Running Locally (sem Docker)

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Setup database (PostgreSQL required)
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver

# In another terminal: Celery
celery -A heuriskein worker -l info
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# Open http://localhost:3000
```

---

## 📚 Documentation

- [Backend Setup & API Reference](./backend/README.md)
- [Frontend Components Guide](./frontend/README.md)
- [Development Guide](./DEVELOPMENT.md)
- [Full Project Requirements](./PROJECT_SUMMARY.md)

---

## 🗺️ Roadmap

### ✅ Done (v0.1.0)
- [x] Project structure
- [x] Backend models & API
- [x] Frontend UI components
- [x] Docker setup
- [x] WebSocket foundation

### 📌 In Progress
- [ ] LLM integration (LangGraph + Claude/OpenAI)
- [ ] Real-time WebSocket updates
- [ ] Agent execution engine
- [ ] Authentication & authorization

### 🔜 Planned
- [ ] Kanban drag-and-drop
- [ ] UI for creating epics/tasks
- [ ] Advanced filtering & search
- [ ] Dashboard with metrics
- [ ] Execution history & analytics
- [ ] Multi-tenancy support
- [ ] Tool marketplace
- [ ] Custom agent fine-tuning

---

## 🤝 Contributing

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Commit changes: `git commit -am 'Add my feature'`
3. Push to branch: `git push origin feature/my-feature`
4. Open a Pull Request

---

## 📄 License

MIT License - See LICENSE file

---

## 👤 Author

**Marco Baldassari**
- 📧 Email: marco.baldassari@example.com
- 🐙 GitHub: [@marco-dev](https://github.com/marco-dev)

---

## 🆘 Support

For issues and questions:
1. Check [DEVELOPMENT.md](./DEVELOPMENT.md) for troubleshooting
2. Review [PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md) for detailed specs
3. Check existing issues on GitHub
4. Create a new issue with detailed description

---

**Last Updated**: March 29, 2026  
**Version**: 0.1.0  
**Status**: 🚀 Active Development
