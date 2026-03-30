# Frontend Configuration

## Setup Local

```bash
cd frontend

# Install dependencies
npm install

# Create .env.local
cp .env.local.example .env.local
# Edit with your API URLs

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Architecture

### Directory Structure

```
src/
├── app/                 # Next.js 14 app directory
├── components/          # React components
│   ├── Kanban/         # Kanban board components
│   ├── Chat/           # Chat interface components
│   ├── AgentPanel/     # Agent monitoring panel
│   ├── Logs/           # Console logs viewer
│   └── Layout/         # Layout components
├── hooks/              # Custom React hooks
├── lib/                # Utility functions
│   ├── api.ts          # API client
│   └── websocket.ts    # WebSocket client
└── store/              # Zustand stores
```

### Key Features

1. **Kanban Board Dual**
   - Strategic planning (Epics) with drag-and-drop
   - Operational execution (Tasks) with status tracking
   - Real-time updates via WebSocket

2. **Chat Interface**
   - Send messages to selected agent
   - Real-time responses
   - Conversation history

3. **Agent Panel**
   - List active agents with status
   - Visual indicators (color-coded by state)
   - Click to select for chat

4. **Logs Console**
   - Real-time thought logs from agents
   - Filterable by level and agent
   - Latest 500 logs in memory

### State Management (Zustand)

- `useAppStore` - Global app state (selected agent, UI state)
- `useTaskStore` - Task and epic state
- `useAgentStore` - Agent state

### WebSocket Integration

Real-time features:
- Task updates
- Agent status changes
- Thought logs
- Chat messages

Events handled:
- `task_updated` - Task status changed
- `agent_status_changed` - Agent state changed
- `thought_log` - New log from agent

## Styling

Using Tailwind CSS with custom dark theme.

Color scheme:
- `dark` (#1a1a2e) - Main background
- `darker` (#0f3460) - Secondary areas
- `accent` (#e94560) - Primary accent
- `success` (#2ec4b6) - Success state
- `warning` (#ff9f43) - Warning state

## API Integration

All API calls through `lib/api.ts`:
- Agent endpoints
- Task endpoints
- Epic endpoints
- Chat endpoint

Authentication tokens stored in local storage.

## Build & Deploy

```bash
# Build for production
npm run build

# Start production server
npm start
```

## Environment Variables

- `NEXT_PUBLIC_API_URL` - Backend API URL
- `NEXT_PUBLIC_WS_URL` - WebSocket URL

## Testing

```bash
# Run tests (setup TBD)
npm run test
```

## Performance

- Code splitting at page/component level
- Image optimization
- CSS-in-JS (Tailwind) for minimal CSS
- WebSocket for real-time without polling
