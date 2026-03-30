# 🧪 Guia Prático de Testes - Heuriskein IA

## ✅ Status Atual
- **Backend:** ✅ Rodando em http://localhost:8001
- **Tests:** ✅ 3/4 passando (Health, Auth, Tasks)
- **Próximos:** LLM Chat (aguarda API key) + WebSocket (aguarda biblioteca)

---

## 📋 Teste 1: Health Check ✅ COMPLETO

**O que testa:** Verificar se backend está respondendo

```bash
curl http://localhost:8001/api/v1/health/
```

**Resposta esperada:**
```json
{
  "status": "healthy",
  "agents": 0,
  "tasks": 0,
  "epics": 0
}
```

---

## 📋 Teste 2: Autenticação ✅ COMPLETO

### Passo 1: Registrar novo usuário
```bash
curl -X POST http://localhost:8001/api/v1/auth/register/ \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "SecurePass123!",
    "password2": "SecurePass123!"
  }'
```

**Resposta esperada:**
```json
{
  "user": {
    "id": 1,
    "username": "testuser",
    "email": "test@example.com"
  }
}
```

### Passo 2: Fazer login
```bash
curl -X POST http://localhost:8001/api/v1/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "SecurePass123!"
  }'
```

**Resposta esperada:**
```json
{
  "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## 📋 Teste 3: Tasks CRUD ✅ COMPLETO

**Salvar o token do passo anterior:**
```bash
export TOKEN="seu_token_aqui"
```

### 3.1: Criar tarefa
```bash
curl -X POST http://localhost:8001/api/v1/tasks/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Implementar Dashboard",
    "description": "Criar dashboard com gráficos em tempo real",
    "status": "queue",
    "priority": "high"
  }'
```

**Resposta esperada:**
```json
{
  "id": "65182833-348d-4852-92c0-33666add9e25",
  "title": "Implementar Dashboard",
  "status": "queue",
  "priority": "high",
  "created_at": "2026-03-30T09:17:58Z"
}
```

### 3.2: Listar tarefas
```bash
curl http://localhost:8001/api/v1/tasks/ \
  -H "Authorization: Bearer $TOKEN"
```

### 3.3: Obter tarefa específica
```bash
curl http://localhost:8001/api/v1/tasks/65182833-348d-4852-92c0-33666add9e25/ \
  -H "Authorization: Bearer $TOKEN"
```

### 3.4: Atualizar tarefa
```bash
curl -X PATCH http://localhost:8001/api/v1/tasks/65182833-348d-4852-92c0-33666add9e25/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "processing"
  }'
```

### 3.5: Deletar tarefa
```bash
curl -X DELETE http://localhost:8001/api/v1/tasks/65182833-348d-4852-92c0-33666add9e25/ \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📋 Teste 4: LLM Chat ⏳ AGUARDANDO CONFIG

**Status:** Não testado (precisa de API key)

### Passo 1: Configurar API Key

**Opção A: Usar Anthropic (Claude)**
1. Ir em https://console.anthropic.com/
2. Criar API key
3. Adicionar ao `.env`:
```
ANTHROPIC_API_KEY=sk-ant-XXXXXXXXXXXXXXX
LLM_PROVIDER=anthropic
CLAUDE_MODEL=claude-3-5-sonnet-20241022
```

**Opção B: Usar OpenAI**
1. Ir em https://platform.openai.com/api-keys
2. Criar API key
3. Adicionar ao `.env`:
```
OPENAI_API_KEY=sk-XXXXXXXXXXXXXXX
LLM_PROVIDER=openai
OPENAI_MODEL=gpt-4o-mini
```

### Passo 2: Testar LLM Chat
```bash
curl -X POST http://localhost:8001/api/v1/chat/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Como você poderia me ajudar a organizar um projeto?",
    "context": "Planejamento de projeto",
    "stream": false
  }'
```

**Resposta esperada:**
```json
{
  "response": "Posso ajudar você de varias formas...",
  "tokens_used": 145,
  "metadata": {
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-20241022"
  }
}
```

### Passo 3: Testar LLM Chat com Streaming (opcional)
```bash
curl -X POST http://localhost:8001/api/v1/chat/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Qual é a melhor forma de estruturar um projeto ágil?",
    "stream": true
  }' \
  --no-buffer
```

---

## 📋 Teste 5: WebSocket Real-time ⏳ AGUARDANDO PYTHON LIB

**Status:** Código pronto, teste manual pendente

### Passo 1: Instalar websockets
```bash
pip install websockets
```

### Passo 2: Testar conexão WebSocket (manualmente com script)

```python
import asyncio
import websockets
import json

async def test_websocket():
    token = "seu_token_aqui"
    uri = f"ws://localhost:8001/ws/tasks/?token={token}"
    
    async with websockets.connect(uri) as websocket:
        print("✓ Conectado ao WebSocket")
        
        # Aguardar mensagem
        message = await asyncio.wait_for(websocket.recv(), timeout=5)
        print(f"✓ Mensagem recebida: {message}")

asyncio.run(test_websocket())
```

### Passo 3: Testar broadcast (2 navegadores/clientes)

1. **Cliente 1:** Conectar ao WebSocket
```python
await websocket.recv()  # Aguardando atualizações
```

2. **Cliente 2:** Criar nova tarefa
```bash
curl -X POST http://localhost:8001/api/v1/tasks/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Nova tarefa", "status": "queue"}'
```

3. **Esperado:** Cliente 1 recebe notificação em tempo real!

---

## 🔄 Teste de Fluxo Completo

Executar todos os testes em sequência:

```bash
# 1. Backend deve estar rodando
# 2. Executar todos os testes automaticamente
python test_features.py

# 3. Resultado final
# ✓ HEALTH_CHECK
# ✓ AUTH
# ✓ TASKS
# ⧗ LLM_CHAT (aguardando API key)
# ⧗ WEBSOCKET (aguardando biblioteca)
```

---

## 📊 Comandos Úteis

### Ver logs do backend
```bash
# Terminal 1: Backend
cd backend
..\.venv\Scripts\python manage.py runserver 0.0.0.0:8001
```

### Reiniciar banco de dados (SQLite)
```bash
cd backend
..\.venv\Scripts\python manage.py flush  # Limpa dados
..\.venv\Scripts\python manage.py migrate  # Recria tabelas
```

### Adicionar dados de teste
```bash
cd backend
..\.venv\Scripts\python manage.py shell

# Dentro do shell Python:
from api.models import Task
Task.objects.create(
    title="Task de teste",
    description="Descrição",
    status="queue",
    priority="high"
)
```

---

## 🎯 Checklist de Testes

- [ ] Health Check (GET /api/v1/health/)
- [ ] User Register
- [ ] User Login
- [ ] Create Task
- [ ] List Tasks
- [ ] Get Task by ID
- [ ] Update Task Status
- [ ] Delete Task
- [ ] LLM Chat (com API key)
- [ ] WebSocket Connection
- [ ] WebSocket Broadcast
- [ ] Frontend Login
- [ ] Frontend Task Creation
- [ ] Frontend Real-time Update

---

## 🆘 Troubleshooting

### Backend não responde
```bash
# Verificar se está rodando
curl http://localhost:8001/api/v1/health/

# Se falhar, (re)iniciar
cd backend
..\.venv\Scripts\python manage.py migrate
..\.venv\Scripts\python manage.py runserver 0.0.0.0:8001
```

### Erro 401 Unauthorized
- Certifique que o token está sendo passado
- Certifique que o token não expirou
- Fazer novo login se necessário

### Erro 500 LLM Chat
- Verificar se API key está configurada no `.env`
- Verificar se `LLM_PROVIDER` é válido (anthropic ou openai)
- Reiniciar backend após alterar `.env`

### WebSocket não conecta
- Instalar: `pip install websockets`
- Verificar porta 8001 não está bloqueada
- Verificar token é válido

---

## 📞 Próximos Passos

1. **Hoje:** ✅ Testes básicos (Health, Auth, Tasks)
2. **Próximas 30min:** Configurar API key e testar LLM
3. **1 hora:** Testar Frontend (http://localhost:3000)
4. **2 horas:** Testes de carga e WebSocket
5. **EOD:** Deploy no Docker Compose

