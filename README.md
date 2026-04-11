# Heuriskein IA Agentic Platform

[![Python](https://img.shields.io/badge/python-3.12%2B-blue)](https://www.python.org/)
[![Django](https://img.shields.io/badge/django-4.2.11-darkgreen)](https://www.djangoproject.com/)
[![Next.js](https://img.shields.io/badge/next.js-14-black)](https://nextjs.org/)
[![Vercel](https://img.shields.io/badge/frontend-vercel-black)](https://heuriskein-ia-agentic-plataform.vercel.app)
[![GitHub](https://img.shields.io/badge/github-main-brightgreen)](https://github.com/lucascasserone/heuriskein-ia-agentic-plataform)

Plataforma de operação agentic com frontend executivo em Next.js e backend Django para orquestração de agentes, execução de tarefas, memória corporativa, workflows e colaboração em tempo real.

## Visão Geral

O projeto organiza trabalho operacional e estratégico em uma interface única com:

- Mission Control para hierarquia organizacional e delegação entre agentes.
- Kanban de execução com tarefas, épicos e status em tempo real.
- Chat contextual com injeção de contexto de task, epic, playbook e registros corporativos.
- Playbooks executáveis para operações recorrentes.
- Corporate Records com documentos, memória corporativa e contexto semântico para LLM.
- Analytics operacionais com métricas e acompanhamento diário.
- Configuração de agentes, modelos e credenciais de provedores LLM.

## Módulos da Interface

### Dashboard

Painel executivo com indicadores principais da operação:

- Taxa de sucesso, fila atual, idade da fila e agentes ativos.
- Aprovações pendentes, documentos ativos e runs de workflow.
- Tarefas e épicos por status.
- Atalhos operacionais para execução, analytics, records, playbooks e chat.

### Execução

Workspace operacional com:

- Dual Kanban para épicos e tarefas.
- Drag-and-drop de status.
- Chat lateral recolhível.
- Sinais de indisponibilidade do backend.
- Recuperação de chunks/assets em falhas de dev server.

### Organização

Mission Control da estrutura organizacional:

- Visualização hierárquica de CEO, diretores, heads e analistas.
- Execução de missões com análise de viabilidade.
- Contratação e edição de agentes.
- Tráfego node-to-node e feed de execução.
- Micro-chat por tarefa e cadeia de delegação.

### Chat

Interface de conversa com contexto injetável via query string:

- `q`, `area`, `initiative`, `task_id`, `epic_id`, `playbook_id`, `playbook`.
- Uso como hub para continuidade operacional a partir de outras telas.

### Playbooks

Laboratório de chains para workflows recorrentes:

- Biblioteca de playbooks.
- Editor com preview visual em grafo.
- Execução de playbooks por escopo.
- Deploy de contexto para abrir sessão no chat com resumo do payload.
- Histórico de runs recentes.

### Records

Cérebro corporativo da plataforma:

- Grafo visual de contexto em React Flow.
- Documentos corporativos e memória reutilizável.
- Prompt preparation drawer com seleção semântica.
- Upload e indexação de anexos.
- Geração de bloco Markdown otimizado para LLM.

### Analytics

Painel analítico com:

- KPIs operacionais.
- Distribuição por status.
- Qualidade operacional.
- Série diária de execução por período.

### Configurações

Centro de administração de interface e agentes:

- Preferências persistidas da UI.
- Gestão de chaves de API.
- Edição de agentes e seleção de provedor/modelo.

## Arquitetura

### Frontend

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- Zustand
- Axios
- React Flow
- Lucide React

### Backend Setup

- Django 4.2.11
- Django REST Framework
- Django Channels + Daphne
- Simple JWT
- LangGraph / LangChain
- Anthropic e OpenAI
- Redis / Celery preparados para expansão
- PostgreSQL ou SQLite

## Estrutura do Repositório

```text
heuriskein-ia-agentic-plataform/
├── backend/
│   ├── api/
│   ├── heuriskein/
│   ├── manage.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── store/
│   └── package.json
├── docs/
├── docker-compose.yml
├── render.yaml
└── README.md
```

## Setup Local

### Pré-requisitos

- Python 3.12+
- Node.js 18+
- npm

### Backend

```powershell
cd backend
..\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 127.0.0.1:8001
```

### Frontend Setup

```powershell
cd frontend
npm install
npm run dev -- -p 3000
```

### Acessos locais

- Frontend: [http://127.0.0.1:3000](http://127.0.0.1:3000)
- API: [http://127.0.0.1:8001/api/v1](http://127.0.0.1:8001/api/v1)
- Admin Django: [http://127.0.0.1:8001/admin](http://127.0.0.1:8001/admin)

## Variáveis Importantes

### Frontend Variables

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_WS_URL`

Em ambiente local, a resolução padrão já usa `127.0.0.1:8001` quando o frontend roda em `localhost` ou `127.0.0.1`.

### Backend Variables

- `DJANGO_SECRET_KEY`
- `DEBUG`
- `ALLOWED_HOSTS`
- `CORS_ALLOWED_ORIGINS`
- `DATABASE_URL`
- `REDIS_URL`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`

## Principais Capacidades de Backend

- CRUD de agentes, tasks e épicos.
- Execução de tasks com engine de prompt e contexto corporativo.
- Chat com auto-contexto e acionamento de playbooks.
- Workflow playbooks e workflow runs.
- Documentos corporativos e memória corporativa.
- WebSockets para tasks, agentes, épicos e logs.
- Servir arquivos em `MEDIA` durante desenvolvimento.

## Build e Validação

### Frontend Build

```powershell
npm --prefix frontend run build
```

### Backend Check

```powershell
cd backend
..\.venv\Scripts\Activate.ps1
python manage.py check
```

## Deploy

### Frontend Deploy

- Hospedado no Vercel.
- Alias de produção atual: [https://heuriskein-ia-agentic-plataform.vercel.app](https://heuriskein-ia-agentic-plataform.vercel.app)

Deploy manual via CLI:

```powershell
& "C:\Users\Marco Lucas\AppData\Roaming\npm\vercel.cmd" --prod --yes
```

### Backend Deploy

- Preparado para Render.
- `render.yaml` presente no repositório.
- Sempre que houver mudança de backend ou migrations, o backend deve ser redeployado e as migrations aplicadas no ambiente remoto.

## Fluxo de Publicação

```powershell
git add <arquivos>
git commit -m "docs: update readme"
git push origin main
& "C:\Users\Marco Lucas\AppData\Roaming\npm\vercel.cmd" --prod --yes
```

Depois disso, se houve alteração no backend, force o redeploy no Render.

## Estado Atual do Produto

Hoje o projeto já contempla:

- Frontend multiaba cobrindo dashboard, execução, organização, chat, playbooks, records, analytics e configurações.
- Recuperação de falhas de assets em ambiente de desenvolvimento.
- Headers `Cache-Control: no-store` no frontend em dev para evitar chunks antigos.
- Injeção de contexto corporativo no execution engine.
- Media serving em desenvolvimento para anexos dos Records.
- Links profundos entre Organização, Chat, Playbooks e Records.
- Suporte a credenciais por provedor LLM e edição de agentes.

## Observações

- O repositório pode conter arquivos locais não versionados como ambientes virtuais, mídia e artefatos temporários; eles não fazem parte do deploy.
- Para mudanças de esquema, confira as migrations em `backend/api/migrations/` antes do redeploy do backend.
