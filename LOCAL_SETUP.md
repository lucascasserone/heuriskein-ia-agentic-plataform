# 🚀 Local Setup (Sem Docker)

Guide para rodar Heuriskein localmente em Windows/Mac/Linux.

## ⚙️ Pré-requisitos

- Python 3.11+
- Node.js 18+
- PostgreSQL 14+
- Redis (opcional, pode usar modo desenvolvimento)

### Verificar instalações

```powershell
python --version
node --version
npm --version
```

---

## 📦 Backend Setup (Django)

### 1. Criar Ambiente Virtual

```powershell
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# Mac/Linux
source venv/bin/activate
```

### 2. Instalar Dependências

```powershell
pip install -r requirements.txt
```

### 3. Configurar Banco de Dados

Você tem duas opções:

#### Opção A: SQLite (Desenvolvimento Rápido - Recomendado)

Edite `backend/heuriskein/settings.py`:

```python
# Procure por DATABASES e substitua por:
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}
```

#### Opção B: PostgreSQL (Produção)

Instale PostgreSQL e crie um banco:

```powershell
# PostgreSQL CLI
createdb heuriskein_db
```

Edite `backend/heuriskein/settings.py`:

```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'heuriskein_db',
        'USER': 'postgres',
        'PASSWORD': 'sua_senha',
        'HOST': 'localhost',
        'PORT': '5432',
    }
}
```

Instale driver PostgreSQL:
```powershell
pip install psycopg2-binary
```

### 4. Migrations

```powershell
python manage.py migrate
```

### 5. Criar Superusuário

```powershell
python manage.py createsuperuser
# Username: admin
# Email: admin@localhost
# Password: senha123
```

### 6. Rodar Backend

```powershell
python manage.py runserver 0.0.0.0:8001
```

✅ Backend rodando em: **http://localhost:8001**

Acesse Admin em: **http://localhost:8001/admin**

---

## 💻 Frontend Setup (Next.js)

### 1. Instalar Dependências

```powershell
cd frontend
npm install
```

### 2. Configurar Variáveis de Ambiente

Crie `.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8001/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8001/ws
```

### 3. Rodar Frontend

```powershell
npm run dev
```

✅ Frontend rodando em: **http://localhost:3000**

---

## 🎯 Acessar a Aplicação

### URLs Principais:

| Serviço | URL | Credenciais |
|---------|-----|-------------|
| **Frontend** | http://localhost:3000 | - |
| **API Backend** | http://localhost:8001/api/v1 | Token auth |
| **Admin Django** | http://localhost:8001/admin | admin / senha123 |
| **Health Check** | http://localhost:8001/api/v1/health | - |

---

## 📝 Workflow de Desenvolvimento

### Terminal 1 - Backend

```powershell
cd backend
venv\Scripts\activate
python manage.py runserver 0.0.0.0:8001
```

### Terminal 2 - Frontend

```powershell
cd frontend
npm run dev
```

### Terminal 3 - (Opcional) Celery Worker

Se precisar de tarefas assíncronas:

```powershell
cd backend
venv\Scripts\activate
pip install celery redis
celery -A heuriskein worker -l info
```

---

## 🔧 Troubleshooting

### Erro: "ModuleNotFoundError: No module named 'django'"

```powershell
pip install -r requirements.txt
```

### Erro: "postgresql connection failed"

Certifique-se de que PostgreSQL está rodando ou use SQLite.

### Erro: "CORS policy error"

Frontend/Backend rodando em portas diferentes é normal. CORS está configurado em `settings.py`.

### Erro: "Port 3000 already in use"

```powershell
# Matar processo na porta 3000
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process

# Ou rodar em porta diferente
npm run dev -- -p 3001
```

### Erro: "Port 8001 already in use"

```powershell
# Matar processo na porta 8001
Get-Process -Id (Get-NetTCPConnection -LocalPort 8001).OwningProcess | Stop-Process

# Ou rodar em porta diferente
python manage.py runserver 0.0.0.0:8002
```

---

## 🧪 Testar API

### Health Check

```powershell
curl http://localhost:8001/api/v1/health/
```

### Listar Agentes (requer token)

```powershell
$token = "your_auth_token"
curl -H "Authorization: Token $token" http://localhost:8001/api/v1/agents/
```

### Via Postman/Insomnia

1. Acesse http://localhost:8001/admin
2. Login com credentials
3. Crie um token em: http://localhost:8001/admin/authtoken/token/
4. Use o token em headers: `Authorization: Token <seu_token>`

---

## 📊 Estrutura de Dados Inicial

### Criar Agente via Admin

1. Acesse http://localhost:8001/admin
2. Clique em "Agents"
3. "Add Agent"
4. Preencha:
   - Name: "Test Agent"
   - Type: "executor"
   - Model: "claude-3-opus"
   - State: "idle"
   - Capabilities: ["code", "analysis"]

### Criar Épico via API

```powershell
$headers = @{
    "Authorization" = "Token sua_token"
    "Content-Type" = "application/json"
}

$body = @{
    goal = "Build new feature"
    description = "Implement user authentication"
    status = "backlog"
    priority = "high"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:8001/api/v1/epics/" `
    -Method POST `
    -Headers $headers `
    -Body $body
```

---

## 📚 Endpoints Rápidos

### Agents
- `GET /api/v1/agents/` - Listar
- `POST /api/v1/agents/` - Criar

### Tasks
- `GET /api/v1/tasks/` - Listar
- `POST /api/v1/tasks/` - Criar
- `GET /api/v1/tasks/by_status/` - Agrupar

### Epics
- `GET /api/v1/epics/` - Listar
- `POST /api/v1/epics/` - Criar
- `GET /api/v1/epics/by_status/` - Agrupar

---

## 🎨 Frontend Features Disponíveis

✅ Kanban Board (Épicos e Tarefas)
✅ Agent Panel (Lista de agentes)
✅ Chat Panel (Enviar mensagens)
✅ Logs Console (Ver logs em tempo real)
✅ Dark Theme

---

## 🚀 Próximas Steps

1. **Criar dados de teste**:
   - Ir ao Admin Django
   - Criar 2-3 agentes
   - Criar 2-3 épicos
   - Criar algumas tarefas

2. **Testar Frontend**:
   - Acessar http://localhost:3000
   - Ver os épicos/tarefas no Kanban
   - Selecionar um agente e enviar mensagem no Chat

3. **Implementar LLM** (próxima etapa):
   - Integrar Claude/OpenAI
   - Implementar execução real de tarefas

---

## 💡 Tips

- Use Admin Django para gerenciar dados facilmente
- Frontend faz requisições diretas à API
- Sem WebSocket real-time por enquanto (apenas polling)
- Próxima etapa: Redis + Celery para async jobs

---

**Desenvolvido por**: Marco Baldassari  
**Data**: Março 2026  
**Versão**: 0.1.0
