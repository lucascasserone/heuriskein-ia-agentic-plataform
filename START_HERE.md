# 🚀 COMEÇAR AGORA - Setup Local

## Windows 🪟

### Opção 1: Automático (Recomendado)

```powershell
# 1. Abra PowerShell no diretório do projeto
cd heuriskein-ia-agentic-plataform

# 2. Execute o script de setup
powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1
```

**O que este script faz:**
- ✅ Cria ambiente virtual Python
- ✅ Instala dependências Django
- ✅ Configura banco de dados SQLite
- ✅ Cria superusuário (admin / 123456)
- ✅ Instala dependências Node.js
- ✅ Configura Next.js

### Opção 2: Manual (Referência)

**Terminal 1 - Backend:**
```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements-dev.txt
python manage.py migrate
python manage.py runserver 0.0.0.0:8001
```

**Terminal 2 - Frontend:**
```powershell
cd frontend
npm install
npm run dev
```

---

## Mac/Linux 🍎🐧

### Opção 1: Automático (Recomendado)

```bash
# 1. Navegue para o diretório do projeto
cd heuriskein-ia-agentic-plataform

# 2. Execute o script de setup
bash ./setup-linux.sh
```

### Opção 2: Manual (Referência)

**Terminal 1 - Backend:**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements-dev.txt
python manage.py migrate
python manage.py runserver 0.0.0.0:8001
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm install
npm run dev
```

---

## ✅ Verificar se está tudo funcionando

Após executar o setup automático:

1. **Abra outro PowerShell/Terminal** para o Backend:
```powershell
cd backend
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Mac/Linux
python manage.py runserver 0.0.0.0:8001
```

Você deve ver:
```
Starting development server at http://0.0.0.0:8001/
```

2. **Abra outro PowerShell/Terminal** para o Frontend:
```powershell
cd frontend
npm run dev
```

Você deve ver:
```
▲ Next.js 14.0.4
- Local:        http://localhost:3000
```

3. **Acesse no browser:**
   - http://localhost:3000 → Frontend
   - http://localhost:8001/api/v1/health → API Health
   - http://localhost:8001/admin → Admin (admin / 123456)

---

## 🎯 Use Imediatamente

### Admin Django (Criar dados)

1. Acesse: http://localhost:8001/admin
2. Login: `admin` / `123456`
3. Clique em "Agents" → "Add Agent"
4. Preencha:
   - Name: "Test Agent"
   - Type: "executor"
   - Model: "claude-3-opus"
   - Capabilities: ["code", "analysis"]
5. Save

Pronto! Seus agentes aparecerão no Frontend.

---

## 🏗️ Arquitetura Local

```
Seu Computador
├── Backend (Django)
│   ├── Porta: 8001
│   ├── Banco: SQLite (db.sqlite3)
│   └── Admin: http://localhost:8001/admin
│
└── Frontend (Next.js)
    ├── Porta: 3000
    └── URL: http://localhost:3000
```

---

## ❓ Problemas?

### "Porta 8001 já em uso"
```powershell
python manage.py runserver 8002
```

### "Porta 3000 já em uso"
```powershell
npm run dev -- -p 3001
```

### "ModuleNotFoundError: No module named 'django'"
```powershell
pip install -r requirements-dev.txt
```

### "npm: command not found"
- Instale Node.js: https://nodejs.org
- Reinicie o terminal

---

## 📚 Próximas Etapas

Após o setup inicial:

1. **[QUICKSTART.md](./QUICKSTART.md)** - Guia rápido (3 passos)
2. **[LOCAL_SETUP.md](./LOCAL_SETUP.md)** - Setup detalhado
3. **[README.md](./README.md)** - Documentação completa
4. **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - Arquitetura técnica

---

## 💡 Estrutura de Arquivos

```
heuriskein-ia-agentic-plataform/
├── backend/                    ← Django API
│   ├── requirements-dev.txt    ← Deps leves
│   ├── db.sqlite3              ← Banco (após migrate)
│   └── venv/                   ← Virtual environment
├── frontend/                   ← Next.js
│   ├── package.json
│   ├── node_modules/           ← NPM deps
│   └── .env.local              ← Config
├── setup-windows.ps1           ← Script automático (Windows)
├── setup-linux.sh              ← Script automático (Linux/Mac)
├── QUICKSTART.md               ← Início rápido
└── LOCAL_SETUP.md              ← Setup detalhado
```

---

## 🚀 Kickoff

**Agora execute um dos scripts acima e você está pronto!**

```powershell
# Windows:
powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1

# Linux/Mac:
bash ./setup-linux.sh
```

Dúvidas? Veja [LOCAL_SETUP.md](./LOCAL_SETUP.md) para mais detalhes.

**Data**: Março 2026  
**Versão**: 0.1.0
