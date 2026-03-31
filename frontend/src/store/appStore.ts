import { create } from 'zustand';

interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
}

interface AuthState {
  // Auth State
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoginModalOpen: boolean;

  setUser: (user: User | null) => void;
  setTokens: (access: string, refresh: string) => void;
  setAuthenticated: (auth: boolean) => void;
  setLoginModalOpen: (open: boolean) => void;
  logout: () => void;
}

interface TaskState {
  id: string;
  title: string;
  description: string;
  epic: string | null;
  status: 'queue' | 'processing' | 'review' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high';
  assigned_to: string | null;
}

interface EpicState {
  id: string;
  goal: string;
  description: string;
  status: 'backlog' | 'refinement' | 'approved' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high';
}

interface AppState extends AuthState {
  // UI State
  selectedAgent: string | null;
  setSelectedAgent: (agentId: string | null) => void;

  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  rightPanelOpen: boolean;
  setRightPanelOpen: (open: boolean) => void;

  // Data State
  tasks: TaskState[];
  setTasks: (tasks: TaskState[]) => void;
  addTask: (task: TaskState) => void;
  updateTask: (id: string, task: Partial<TaskState>) => void;

  epics: EpicState[];
  setEpics: (epics: EpicState[]) => void;
  addEpic: (epic: EpicState) => void;
  updateEpic: (id: string, epic: Partial<EpicState>) => void;

  agents: any[];
  setAgents: (agents: any[]) => void;

  logs: any[];
  addLog: (log: any) => void;
  clearLogs: () => void;

  // UI preferences
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;

  // WebSocket state
  wsConnected: boolean;
  setWsConnected: (connected: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Auth State
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoginModalOpen: false,

  setUser: (user) => set({ user }),
  setTokens: (access, refresh) =>
    set({
      accessToken: access,
      refreshToken: refresh,
      isAuthenticated: true,
    }),
  setAuthenticated: (auth) => set({ isAuthenticated: auth }),
  setLoginModalOpen: (open) => set({ isLoginModalOpen: open }),
  logout: () =>
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoginModalOpen: false,
    }),

  // UI State
  selectedAgent: null,
  setSelectedAgent: (agentId) => set({ selectedAgent: agentId }),

  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  rightPanelOpen: true,
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),

  // Data State
  tasks: [],
  setTasks: (tasks) => set({ tasks }),
  addTask: (task) =>
    set((state) => ({
      tasks: [...state.tasks, task],
    })),
  updateTask: (id, taskUpdate) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        (t as any).id === id ? { ...t, ...taskUpdate } : t
      ),
    })),

  epics: [],
  setEpics: (epics) => set({ epics }),
  addEpic: (epic) =>
    set((state) => ({
      epics: [...state.epics, epic],
    })),
  updateEpic: (id, epicUpdate) =>
    set((state) => ({
      epics: state.epics.map((e) =>
        (e as any).id === id ? { ...e, ...epicUpdate } : e
      ),
    })),

  agents: [],
  setAgents: (agents) => set({ agents }),

  logs: [],
  addLog: (log) =>
    set((state) => ({
      logs: [log, ...state.logs].slice(0, 500), // Keep only last 500 logs
    })),
  clearLogs: () => set({ logs: [] }),

  // UI preferences
  theme: 'dark',
  setTheme: (theme) => set({ theme }),

  // WebSocket state
  wsConnected: false,
  setWsConnected: (connected) => set({ wsConnected: connected }),
}));
