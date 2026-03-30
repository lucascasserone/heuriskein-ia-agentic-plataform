# ⚡ Quick Start - Local (Sem Docker)

## 3 Passos para Rodar

### Terminal 1 - Backend ✅

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements-dev.txt
python manage.py migrate
python manage.py runserver 0.0.0.0:8001
```

Acesse: **http://localhost:8001/api/v1/health/**

### Terminal 2 - Frontend ✅

```powershell
cd frontend
npm install
npm run dev
```

Acesse: **http://localhost:3000**

---

## 🔐 Fazer Login

### Admin Django
- URL: http://localhost:8001/admin
- Username: `admin`
- Password: `123456` (criado automaticamente)

### Frontend
- Acesse http://localhost:3000
- Ainda sem autenticação UI (próxima etapa)

---

## 🧪 Testar API

```powershell
# Health check (sem autenticação)
curl http://localhost:8001/api/v1/health/

# Listar agentes
curl -H "Authorization: Token seu_token" http://localhost:8001/api/v1/agents/
```

---

## 🎯 Próximas Ações

1. ✅ Criar agentes no Admin (http://localhost:8001/admin)
2. ✅ Criar épicos e tarefas
3. ✅ Ver no Kanban em http://localhost:3000
4. 🔜 Integrar LLM (Claude/OpenAI)
5. 🔜 Implementar chat real

---

## 📁 Estrutura

```
backend/          ← Python Django API (porta 8001)
frontend/         ← React Next.js (porta 3000)
requirements-dev.txt  ← Deps mais leve para dev
LOCAL_SETUP.md    ← Setup completo
```

---

## ❓ Problemas?

### Porta em uso?
```powershell
# Rodar em porta diferente
python manage.py runserver 0.0.0.0:8002
npm run dev -- -p 3001
```

### Erro de dependências?
```powershell
pip install --upgrade pip
pip install -r requirements-dev.txt
```

### Reset do banco?
```powershell
rm db.sqlite3  # ou delete no Windows Explorer
python manage.py migrate
```

---

**Pronto para começar?** 🚀
