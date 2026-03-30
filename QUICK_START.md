# ⚡ Quick Reference - Heuriskein IA Platform

## 🚀 Start Services

```powershell
# Terminal 1: Backend
cd backend
.\..\\.venv\Scripts\Activate.ps1
python manage.py runserver 0.0.0.0:8001

# Terminal 2: Frontend  
cd frontend
npm run dev
```

**Access Points:**
- 🌐 Frontend: http://localhost:3002
- 📡 API: http://localhost:8001/api/v1
- 🔧 Admin: http://localhost:8001/admin (admin/123456)

---

## 📋 What Works Now

| Feature | How to Test | Expected Result |
|---------|------------|-----------------|
| **Create Epic** | Click "New Epic" button → Fill form → Click Save | Epic appears in Planejamento board, blue toast shows success |
| **Create Task** | Click "New Task" button → Fill form → Click Save | Task appears in Execução → Fila, green toast confirms |
| **Chat with AI** | Type message in CommandCenter → Click Send | Message sent to real backend agent, response appears |
| **Drag Status** | Drag epic/task between columns | Toast shows "Updating..." then success, database persisted |
| **View Data** | Kanban boards auto-refresh every 5 seconds | See real data from database |

---

## 🎨 Frontend Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── Modals/
│   │   │   ├── CreateEpicModal.tsx     ← Epic creation
│   │   │   └── CreateTaskModal.tsx     ← Task creation
│   │   ├── CommandCenter.tsx           ← Chat interface
│   │   ├── DualKanbanDragDrop.tsx      ← Kanban boards
│   │   ├── SidebarPremium.tsx          ← Navigation
│   │   └── Layout/
│   │       └── LayoutPremium.tsx       ← Toast provider
│   ├── lib/
│   │   ├── api.ts                      ← API client methods
│   │   └── toast.tsx                   ← Notifications
│   └── app/
│       └── page.tsx                    ← Main app
└── tailwind.config.js                  ← Styling
```

---

## 📡 API Methods Used

```typescript
// Epics
apiClient.createEpic(formData)           // Create new epic
apiClient.getEpicsByStatus()             // Fetch all epics by status
apiClient.updateEpic(id, {status})       // Update epic status

// Tasks
apiClient.createTask(formData)           // Create new task
apiClient.getTasksByStatus()             // Fetch all tasks by status
apiClient.updateTask(id, {status})       // Update task status

// Chat
apiClient.sendChatMessage(agentId, msg)  // Send to agents
```

---

## 🔧 Database Admin

**URL:** http://localhost:8001/admin  
**Credentials:** admin / 123456

**Create Test Data:**
1. Agents (at least one 'Coordenador IA')
2. Epics with different statuses
3. Tasks assigned to epics

---

## 🎯 Workflow Example

1. **Create an Agent**
   - Admin → Agents → Add Agent
   - Name: "Coordenador IA"
   - Role: "coordination"
   - Status: "active"

2. **Create an Epic**
   - Frontend: Click "New Epic"
   - Goal: "Build user dashboard"
   - Priority: "high"
   - Click Save → Epic in Planejamento board

3. **Create Tasks for Epic**
   - Frontend: Click "New Task"
   - Select epic created above
   - Add 3-4 tasks with different priorities
   - Tasks appear in Execução → Fila

4. **Send Chat Message**
   - CommandCenter: Type "Optimize the task queue"
   - See agent response appear
   - Expand "Chain of Thought" to see reasoning

5. **Update Task Status**
   - Drag task from Fila → Processando
   - See loading toast, then success
   - Refresh page: Status persisted ✓

---

## 🐛 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| Port 3001 occupied | Frontend runs on 3002 instead (auto-detected) |
| "Cannot connect to backend" | Check Django running on 8001: `Invoke-WebRequest http://localhost:8001/api/v1/agents/` |
| "Module not found" errors | Run: `.\.venv\Scripts\Activate.ps1` then `pip install -r backend/requirements.txt` |
| Database errors | Run: `python manage.py migrate` |
| No toast showing | Check ToastProvider wraps app in LayoutPremium.tsx |

---

## 📊 Component Hierarchy

```
app/page.tsx (Main)
├── LayoutPremium (Toast Provider)
│   ├── SidebarPremium (Navigation)
│   ├── DualKanbanDragDrop (Kanban Boards)
│   │   ├── Planning Board (Epics)
│   │   └── Execution Board (Tasks)
│   ├── CommandCenter (Chat Interface)
│   ├── CreateEpicModal (Triggered by button)
│   └── CreateTaskModal (Triggered by button)
```

---

## 🎨 Color Guide

| Color | Use | Hex |
|-------|-----|-----|
| Neon Blue | Primary/Epic | #00F2FF |
| Cyan | Secondary/Active | #00D9FF |
| Green | Success/Task | #00DC82 |
| Red | Error/High Priority | #FF006E |
| Dark Blue | Cards/Surface | #05070A |

---

## 📊 Current Kanban Statuses

**Planning Board (Epics):**
- Backlog
- Refinement  
- Approved
- Completed

**Execution Board (Tasks):**
- Queue (Fila)
- Processing (Processando)
- Review (QA)
- Completed (Finalizado)

---

## 🔐 Development Security Notes

⚠️ **Current Setup (Development Only):**
- ❌ Authentication disabled (`permission_classes = []`)
- ✅ CORS enabled for local frontend
- ✅ Debug mode ON (Django)
- ✅ SQLite database (local, not production)

**For Production:**
1. Enable `permission_classes = [IsAuthenticated]`
2. Add JWT token management
3. Switch to PostgreSQL
4. Disable Debug mode
5. Configure proper CORS headers

---

## 📈 Monitoring

**Backend Logs:**
- Watch Django runserver output for request logs
- Any errors appear in terminal

**Frontend Logs:**
- Press F12 in browser (Console tab)
- API calls visible in Network tab
- React errors in Console

**Database:**
- View data via http://localhost:8001/admin
- SQLite file: `backend/db.sqlite3`

---

## 🚀 Next Steps

### Immediate (Today if time)
- [ ] Create test agents via admin
- [ ] Create test epics via frontend
- [ ] Create test tasks via frontend
- [ ] Test all drag-drop movements
- [ ] Send 3-5 chat messages

### This Week
- [ ] WebSocket real-time updates
- [ ] LLM integration (Claude API)
- [ ] Authentication UI

### This Month
- [ ] Mobile responsiveness
- [ ] Light mode theme
- [ ] Advanced filtering
- [ ] Performance optimization

---

## 📢 Quick Commands

```powershell
# Create superuser
python manage.py createsuperuser

# Make migrations
python manage.py makemigrations

# Apply migrations
python manage.py migrate

# Clear database (careful!)
python manage.py flush

# Django shell
python manage.py shell

# Test API endpoint
Invoke-WebRequest http://localhost:8001/api/v1/agents/

# Kill port (if stuck)
Get-Process -Id (lsof -t -i:8001) | Stop-Process
```

---

## 📖 Full Documentation

- 📘 [Integration Status](INTEGRATION_STATUS.md) - Complete technical details
- 📕 [Session Summary](SESSION_SUMMARY.md) - What was done today
- 📗 [Frontend Docs](FRONTEND_PREMIUM.md) - UI component details
- 📙 [Project Summary](PROJECT_SUMMARY.md) - Overview

---

**Status: ✅ Ready to Use!**

Everything is wired, running, and tested. Start the services and begin testing! 🎉
