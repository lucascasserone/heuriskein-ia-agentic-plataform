import axios, { AxiosInstance, AxiosResponse } from 'axios';

function resolveApiBaseUrl() {
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      const apiProtocol = protocol === 'https:' ? 'https:' : 'http:';
      return `${apiProtocol}//${hostname}:8001/api/v1`;
    }
  }

  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';
}

const API_BASE_URL = resolveApiBaseUrl();

export function getResolvedApiBaseUrl() {
  return API_BASE_URL;
}

export function getResolvedWsBaseUrl() {
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//${hostname}:8001/ws`;
    }
  }

  const configured = process.env.NEXT_PUBLIC_WS_URL;
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  try {
    const parsed = new URL(API_BASE_URL);
    const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${parsed.host}/ws`;
  } catch {
    return '';
  }
}

export function isBackendUnavailableError(error: unknown) {
  if (!error || typeof error !== 'object') return false;

  const maybeAxios = error as {
    code?: string;
    message?: string;
    response?: { status?: number };
    request?: unknown;
  };

  if (maybeAxios.response?.status) {
    return false;
  }

  if (maybeAxios.code === 'ERR_NETWORK' || maybeAxios.code === 'ECONNABORTED') {
    return true;
  }

  const message = String(maybeAxios.message || '').toLowerCase();
  return message.includes('network error') || message.includes('timeout') || message.includes('failed to fetch');
}

export interface EpicPayload {
  goal: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  status?: 'backlog' | 'refinement' | 'approved' | 'completed' | 'failed';
  checklist_items?: Array<{
    text: string;
    agent_ready?: boolean;
    critical?: boolean;
    requires_validation?: boolean;
  }>;
  complexity?: number | null;
  lead_time?: string | null;
  due_date?: string | null;
  context_files?: Array<{
    name: string;
    size?: number;
    type?: string;
  }>;
  feedback?: Array<{
    text: string;
    time?: string;
  }>;
}

export interface TaskPayload {
  title: string;
  description?: string;
  epic?: string | null;
  assigned_to?: string | null;
  priority?: 'low' | 'medium' | 'high';
  status?: 'queue' | 'processing' | 'blocked' | 'review' | 'completed' | 'failed';
  error?: string;
  due_at?: string | null;
}

export interface AgentSummary {
  id: string;
  name: string;
  type: 'coordinator' | 'executor' | 'analyst';
  state: 'idle' | 'thinking' | 'executing' | 'blocked' | 'error';
}

export interface AgentItem extends AgentSummary {
  organization?: string;
  model: string;
  llm_provider?: 'anthropic' | 'openai' | 'xai' | 'google';
  llm_model?: string;
  llm_version?: string;
  role_prompt?: string;
  context?: string;
  capabilities: string[];
  api_key_configured?: boolean;
}

export interface AgentProviderOption {
  id: 'anthropic' | 'openai' | 'xai' | 'google';
  label: string;
  models: string[];
}

export interface ProviderCredentialStatus {
  provider: 'anthropic' | 'openai' | 'xai' | 'google';
  configured: boolean;
  key_hint: string;
  updated_at: string | null;
}

export interface AgentMessageItem {
  id: string;
  from_agent: string;
  from_agent_name?: string;
  to_agent: string;
  to_agent_name?: string;
  task?: string | null;
  parent_message?: string | null;
  message_type: 'delegate' | 'review' | 'escalate' | 'context_sync' | 'result';
  status: 'pending' | 'delivered' | 'acknowledged' | 'failed';
  subject: string;
  body: string;
  payload?: Record<string, unknown>;
  trace_id?: string;
  correlation_id?: string;
  created_at: string;
  delivered_at?: string | null;
  acknowledged_at?: string | null;
}

export interface CorporateDocumentItem {
  id: string;
  title: string;
  doc_type: 'brief' | 'spec' | 'report' | 'sop' | 'retro' | 'memo' | 'playbook';
  status: 'draft' | 'active' | 'archived';
  scope: 'task' | 'epic' | 'org' | 'global';
  area?: string;
  initiative?: string;
  version: number;
  tags: string[];
  summary?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  task?: string | null;
  epic?: string | null;
  created_by_agent_name?: string;
  created_by_user_name?: string;
  created_at: string;
  updated_at: string;
}

export interface CorporatePromptContextResponse {
  query: string;
  area?: string;
  initiative?: string;
  prompt_markdown: string;
  documents: CorporateDocumentItem[];
  memory_entries: CorporateMemoryEntryItem[];
}

export interface ContextGraphNode {
  id: string;
  label: string;
  type: 'document' | 'memory' | 'area' | 'initiative' | 'tag';
  doc_type?: string;
  source_type?: string;
  area?: string;
  initiative?: string;
}

export interface ContextGraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface ContextGraphResponse {
  nodes: ContextGraphNode[];
  edges: ContextGraphEdge[];
}

export interface CorporateMemoryEntryItem {
  id: string;
  title: string;
  area?: string;
  initiative?: string;
  source_type: 'document' | 'decision' | 'workflow_run' | 'task' | 'manual';
  source_id?: string;
  summary?: string;
  content?: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  times_reused: number;
  last_used_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowPlaybookItem {
  id: string;
  name: string;
  slug: string;
  description?: string;
  category?: string;
  scope: 'task' | 'epic' | 'org' | 'global';
  status: 'draft' | 'active' | 'archived';
  is_template: boolean;
  trigger_phrases: string[];
  graph: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
  created_by_user_name?: string;
  run_count: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRunItem {
  id: string;
  playbook: string;
  playbook_name?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  scope: string;
  input_payload?: Record<string, unknown>;
  execution_log: string[];
  result_payload?: Record<string, unknown>;
  task?: string | null;
  epic?: string | null;
  created_by_user_name?: string;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExecutiveDashboardData {
  generated_at: string;
  approvals_pending: number;
  decisions_open: number;
  active_documents: number;
  memory_entries: number;
  workflow_runs_today: number;
  overloaded_agents: Array<Record<string, unknown>>;
  pending_approvals: ApprovalRequestItem[];
  recent_decisions: DecisionRecordItem[];
  recent_documents: CorporateDocumentItem[];
  recent_runs: WorkflowRunItem[];
}

export interface AgentCapacityItem {
  id: string;
  name: string;
  type: 'coordinator' | 'executor' | 'analyst';
  state: 'idle' | 'thinking' | 'executing' | 'blocked' | 'error';
  current_task_id?: string | null;
  counts: {
    queue: number;
    processing: number;
    blocked: number;
    review: number;
    completed: number;
    failed: number;
  };
  load: {
    active: number;
    queued: number;
    open_total: number;
  };
}

export interface CreateSubtaskPayload {
  task: string;
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  status?: 'queue' | 'processing' | 'blocked' | 'review' | 'completed' | 'failed';
  assigned_to?: string | null;
  source?: 'agent' | 'manual' | 'system';
  order?: number;
  depends_on_ids?: string[];
}

export interface TaskArtifact {
  id: string;
  title: string;
  artifact_type: 'document' | 'diff' | 'report' | 'decision' | 'spec' | 'test_result' | 'file_bundle' | 'snapshot' | 'log';
  status: 'proposed' | 'available' | 'approved' | 'applied' | 'archived';
  relative_path?: string;
  preview?: string;
  content?: string;
  payload?: Record<string, unknown>;
  agent_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface TaskEvent {
  id: string;
  event_type: 'created' | 'assigned' | 'started' | 'decomposed' | 'artifact_added' | 'blocked' | 'approval_requested' | 'approved' | 'completed' | 'failed' | 'rolled_back' | 'updated';
  message: string;
  metadata?: Record<string, unknown>;
  agent_name?: string;
  created_at?: string;
}

export interface ApprovalRequestItem {
  id: string;
  task: string;
  artifact?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rationale?: string;
  decision_notes?: string;
  requested_by_agent?: string | null;
  requested_by_agent_name?: string;
  requested_by_user?: number | null;
  requested_by_user_name?: string;
  decided_by?: number | null;
  decided_by_name?: string;
  requested_at?: string;
  decided_at?: string | null;
  updated_at?: string;
}

export interface DecisionRecordItem {
  id: string;
  task: string;
  artifact?: string | null;
  approval_request?: string | null;
  supersedes?: string | null;
  supersedes_title?: string;
  title: string;
  summary?: string;
  rationale?: string;
  scope: 'task' | 'epic' | 'org';
  status: 'proposed' | 'accepted' | 'rejected' | 'superseded';
  impact: 'low' | 'medium' | 'high';
  created_by_agent?: string | null;
  created_by_agent_name?: string;
  created_by_user?: number | null;
  created_by_user_name?: string;
  decided_by?: number | null;
  decided_by_name?: string;
  created_at?: string;
  decided_at?: string | null;
  updated_at?: string;
}

export interface SubtaskItem {
  id: string;
  title: string;
  description?: string;
  status: 'queue' | 'processing' | 'blocked' | 'review' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high';
  assigned_to?: string | null;
  assigned_to_name?: string;
  source?: 'agent' | 'manual' | 'system';
  order?: number;
  metadata?: Record<string, unknown>;
  depends_on?: string[];
  completed_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface TaskWorkspaceResponse {
  id: string;
  title: string;
  description?: string;
  epic?: string | null;
  epic_goal?: string;
  status: 'queue' | 'processing' | 'blocked' | 'review' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high';
  assigned_to?: string | null;
  assigned_to_name?: string;
  attempt_count?: number;
  result?: Record<string, unknown> | null;
  error?: string;
  summary?: string;
  next_action?: string;
  artifact_count?: number;
  event_count?: number;
  subtask_count?: number;
  pending_clarification?: boolean;
  latest_question?: string;
  created_at?: string;
  updated_at?: string;
  started_at?: string;
  completed_at?: string;
  due_at?: string | null;
  artifacts: TaskArtifact[];
  events: TaskEvent[];
  subtasks: SubtaskItem[];
  approval_requests: ApprovalRequestItem[];
  decision_records: DecisionRecordItem[];
}

export interface MetricsOverview {
  task_counts: Record<string, number>;
  success_rate_percent: number;
  avg_execution_minutes: number;
  avg_approval_to_queue_minutes: number;
  queue_age_minutes: number;
  approved_epics_waiting_breakdown: number;
  generated_at: string;
}

export interface MetricsTimeseriesPoint {
  date: string;
  created: number;
  completed: number;
  failed: number;
}

export interface MetricsTimeseriesResponse {
  days: number;
  start_date: string;
  end_date: string;
  points: MetricsTimeseriesPoint[];
  generated_at: string;
}

export interface OrgTaskNode {
  id: string;
  parent_id: string | null;
  title: string;
  objective: string;
  level: 'ceo' | 'director' | 'head' | 'analyst';
  agent_id: string;
  status: 'queued' | 'in_progress' | 'awaiting_approval' | 'approved' | 'rejected' | 'done';
  complexity: number;
  dependencies: string[];
  children: string[];
  approval_notes: string;
  execution_logs: string[];
}

export interface CompanyStateResponse {
  mission_id: string;
  mission_brief: string;
  mission_constraints: string[];
  corporate_memory_hits: Array<Record<string, unknown>>;
  task_tree: Record<string, OrgTaskNode>;
  root_task_id: string;
  active_task_id: string;
  active_agent_id: string;
  pending_queue: string[];
  awaiting_approval_queue: string[];
  rejected_queue: string[];
  completed_tasks: string[];
  final_report: string;
  execution_trace: string[];
  estimated_tokens: number;
  avg_resolution_minutes: number;
  delegation_events: number;
  agent_profiles: Record<string, {
    id: string;
    name: string;
    state: string;
    model: string;
    type: string;
    capabilities: string[];
    level: 'ceo' | 'director' | 'head' | 'analyst';
  }>;
}

export interface OrgMissionStatsResponse {
  status: 'active' | 'idle';
  successRate: number;
  queueAge: number;
  activeAgents: number;
  approvingPending: number;
  clarificationsNeeded: number;
  delegationEvents: number;
  estimatedTokens: number;
}

export interface OrgCapabilitySummaryItem {
  id: 'agents' | 'approvals' | 'knowledge' | 'automation';
  name: string;
  status: 'active' | 'alpha';
  metrics: Record<string, number>;
}

export interface OrgCapabilitiesSummaryResponse {
  capabilities: OrgCapabilitySummaryItem[];
}

export interface FileChangePlanItem {
  allowed: boolean;
  reason: string;
  relative_path: string;
  workspace_path?: string;
  is_new_file?: boolean;
  old_size?: number;
  new_size?: number;
  diff?: string;
  new_content?: string;
}

export interface FileChangePreviewResponse {
  allowed: boolean;
  reason: string;
  relative_path: string;
  workspace_path?: string;
  is_new_file?: boolean;
  old_size?: number;
  new_size?: number;
  diff?: string;
}

export interface ApplyFileChangeResponse {
  applied: boolean;
  reason: string;
  relative_path: string;
  diff?: string;
  task_status?: 'queue' | 'processing' | 'blocked' | 'review' | 'completed' | 'failed';
  snapshot?: {
    snapshot_id: string;
    snapshot_path: string;
    files: number;
  };
  approval_request_id?: string;
}

export interface RollbackSnapshotResponse {
  rolled_back: boolean;
  reason?: string;
  snapshot_id: string;
  removed_files?: number;
  restored_files?: number;
}

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 90000, // 90s timeout for LLM operations (can take 30-60s)
  headers: {
    'Content-Type': 'application/json',
  },
});

client.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error)
);

export const apiClient: AxiosInstance & {
  setAuthToken: (accessToken?: string | null, refreshToken?: string | null) => void;
  login: (username: string, password: string) => Promise<AxiosResponse<unknown>>;
  register: (username: string, email: string, password: string) => Promise<AxiosResponse<unknown>>;
  getActiveAgents: () => Promise<AxiosResponse<unknown>>;
  getAgents: () => Promise<AxiosResponse<AgentItem[]>>;
  updateAgent: (id: string, payload: Partial<AgentItem>) => Promise<AxiosResponse<AgentItem>>;
  deleteAgent: (id: string) => Promise<AxiosResponse<unknown>>;
  getAgentCapacity: () => Promise<AxiosResponse<AgentCapacityItem[]>>;
  getAgentProviders: () => Promise<AxiosResponse<{ providers: AgentProviderOption[] }>>;
  getProviderCredentialStatus: () => Promise<AxiosResponse<ProviderCredentialStatus[]>>;
  saveProviderCredential: (payload: { provider: ProviderCredentialStatus['provider']; api_key: string }) => Promise<AxiosResponse<ProviderCredentialStatus>>;
  getAgentInbox: (agentId: string) => Promise<AxiosResponse<AgentMessageItem[]>>;
  getAgentOutbox: (agentId: string) => Promise<AxiosResponse<AgentMessageItem[]>>;
  getExecutiveDashboard: () => Promise<AxiosResponse<ExecutiveDashboardData>>;
  getCorporateDocuments: () => Promise<AxiosResponse<CorporateDocumentItem[]>>;
  createCorporateDocument: (payload: Partial<CorporateDocumentItem>) => Promise<AxiosResponse<CorporateDocumentItem>>;
  updateCorporateDocument: (id: string, payload: Partial<CorporateDocumentItem>) => Promise<AxiosResponse<CorporateDocumentItem>>;
  uploadCorporateDocument: (payload: {
    file: File;
    title?: string;
    doc_type?: CorporateDocumentItem['doc_type'];
    scope?: CorporateDocumentItem['scope'];
    area?: string;
    initiative?: string;
    summary?: string;
    tags?: string[];
  }) => Promise<AxiosResponse<CorporateDocumentItem>>;
  getCorporatePromptContext: (params: { q: string; area?: string; initiative?: string }) => Promise<AxiosResponse<CorporatePromptContextResponse>>;
  getCorporateContextGraph: () => Promise<AxiosResponse<ContextGraphResponse>>;
  getCorporateMemory: () => Promise<AxiosResponse<CorporateMemoryEntryItem[]>>;
  markCorporateMemoryReused: (id: string) => Promise<AxiosResponse<CorporateMemoryEntryItem>>;
  getWorkflowPlaybooks: () => Promise<AxiosResponse<WorkflowPlaybookItem[]>>;
  createWorkflowPlaybook: (payload: Partial<WorkflowPlaybookItem>) => Promise<AxiosResponse<WorkflowPlaybookItem>>;
  seedWorkflowPlaybooks: () => Promise<AxiosResponse<{ created_count: number; items: WorkflowPlaybookItem[] }>>;
  runWorkflowPlaybook: (id: string, payload: { scope?: string; input_payload?: Record<string, unknown>; task_id?: string; epic_id?: string }) => Promise<AxiosResponse<WorkflowRunItem>>;
  getWorkflowRuns: () => Promise<AxiosResponse<WorkflowRunItem[]>>;
  getEpics: () => Promise<AxiosResponse<unknown>>;
  getEpicsByStatus: () => Promise<AxiosResponse<unknown>>;
  getEpic: (id: string) => Promise<AxiosResponse<unknown>>;
  createEpic: (payload: EpicPayload) => Promise<AxiosResponse<unknown>>;
  updateEpic: (id: string, payload: Partial<EpicPayload>) => Promise<AxiosResponse<unknown>>;
  deleteEpic: (id: string) => Promise<AxiosResponse<unknown>>;
  getTasksByStatus: () => Promise<AxiosResponse<unknown>>;
  getMetricsOverview: () => Promise<AxiosResponse<MetricsOverview>>;
  getMetricsTimeseries: (days?: number) => Promise<AxiosResponse<MetricsTimeseriesResponse>>;
  hireOrgAgent: (payload: {
    name?: string;
    department?: string;
    level: 'ceo' | 'director' | 'head' | 'analyst';
    capabilities?: string[];
    model_hint?: string;
  }) => Promise<AxiosResponse<{ agent: Record<string, unknown> }>>;
  getOrgAgentTemplate: (payload: {
    department: string;
    level: 'ceo' | 'director' | 'head' | 'analyst';
  }) => Promise<AxiosResponse<{ template: { capabilities: string[]; bio: string } }>>;
  analyzeOrgFeasibility: (payload: {
    mission_brief: string;
    constraints?: string[];
  }) => Promise<AxiosResponse<{ viability: { score_percent: number; verdict: string; reasons: string[]; complexity: number } }>>;
  runOrgMission: (payload: {
    mission_brief: string;
    constraints?: string[];
  }) => Promise<AxiosResponse<{ state: CompanyStateResponse }>>;
  getOrgState: () => Promise<AxiosResponse<{ state: CompanyStateResponse }>>;
  getOrgMissionStats: () => Promise<AxiosResponse<OrgMissionStatsResponse>>;
  getOrgCapabilitiesSummary: () => Promise<AxiosResponse<OrgCapabilitiesSummaryResponse>>;
  createTask: (payload: TaskPayload) => Promise<AxiosResponse<unknown>>;
  updateTask: (id: string, payload: Partial<TaskPayload>) => Promise<AxiosResponse<unknown>>;
  deleteTask: (id: string) => Promise<AxiosResponse<unknown>>;
  executeTask: (id: string, capability?: string) => Promise<AxiosResponse<unknown>>;
  retryTask: (id: string) => Promise<AxiosResponse<unknown>>;
  getTaskLogs: (id: string) => Promise<AxiosResponse<unknown>>;
  getTaskWorkspace: (id: string) => Promise<AxiosResponse<TaskWorkspaceResponse>>;
  createSubtask: (payload: CreateSubtaskPayload) => Promise<AxiosResponse<unknown>>;
  updateSubtask: (id: string, payload: Partial<CreateSubtaskPayload>) => Promise<AxiosResponse<unknown>>;
  previewTaskFileChange: (
    id: string,
    payload: { relative_path: string; new_content: string }
  ) => Promise<AxiosResponse<FileChangePreviewResponse>>;
  applyTaskFileChange: (
    id: string,
    payload: { relative_path: string; new_content: string; approved: boolean; artifact_id?: string; approval_request_id?: string }
  ) => Promise<AxiosResponse<ApplyFileChangeResponse>>;
  requestTaskApproval: (
    id: string,
    payload: { artifact_id: string; rationale?: string }
  ) => Promise<AxiosResponse<ApprovalRequestItem>>;
  decideTaskApproval: (
    id: string,
    payload: { approval_id: string; decision: 'approved' | 'rejected'; notes?: string }
  ) => Promise<AxiosResponse<ApprovalRequestItem>>;
  createTaskDecision: (
    id: string,
    payload: { title: string; summary?: string; rationale?: string; scope?: 'task' | 'epic' | 'org'; impact?: 'low' | 'medium' | 'high'; artifact_id?: string }
  ) => Promise<AxiosResponse<DecisionRecordItem>>;
  supersedeTaskDecision: (
    id: string,
    payload: { decision_id: string; replacement_title: string; replacement_summary?: string; replacement_rationale?: string }
  ) => Promise<AxiosResponse<DecisionRecordItem>>;
  rollbackTaskSnapshot: (
    id: string,
    payload: { snapshot_id: string }
  ) => Promise<AxiosResponse<RollbackSnapshotResponse>>;
  requestTaskClarification: (id: string, question: string) => Promise<AxiosResponse<unknown>>;
  getTaskClarifications: (id: string) => Promise<AxiosResponse<unknown>>;
  answerClarification: (id: string, answer: string) => Promise<AxiosResponse<unknown>>;
  completeTask: (id: string, result?: Record<string, unknown>) => Promise<AxiosResponse<unknown>>;
  failTask: (id: string, error?: string) => Promise<AxiosResponse<unknown>>;
  sendChatMessage: (agentId: string, message: string, context?: Record<string, unknown>) => Promise<AxiosResponse<unknown>>;
  streamChatMessage: (
    message: string,
    onChunk: (chunk: string) => void,
    onError?: (errorMessage: string) => void,
    context?: Record<string, unknown>,
    signal?: AbortSignal
  ) => Promise<void>;
} = Object.assign(client, {
  setAuthToken: (accessToken?: string | null, refreshToken?: string | null) => {
    if (accessToken) {
      client.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
      if (typeof window !== 'undefined') {
        localStorage.setItem('accessToken', accessToken);
      }
    } else {
      delete client.defaults.headers.common.Authorization;
      if (typeof window !== 'undefined') {
        localStorage.removeItem('accessToken');
      }
    }

    if (typeof window !== 'undefined' && refreshToken !== undefined) {
      if (refreshToken) {
        localStorage.setItem('refreshToken', refreshToken);
      } else {
        localStorage.removeItem('refreshToken');
      }
    }
  },

  login: (username: string, password: string) =>
    client.post('/auth/login/', { username, password }),

  register: (username: string, email: string, password: string) =>
    client.post('/auth/register/', {
      username,
      email,
      password,
      password2: password,
    }),

  getActiveAgents: () => client.get('/agents/active/'),

  getAgents: () => client.get('/agents/'),

  updateAgent: (id, payload) => client.patch(`/agents/${id}/`, payload),

  deleteAgent: (id) => client.delete(`/agents/${id}/`),

  getAgentCapacity: () => client.get('/agents/capacity/'),

  getAgentProviders: () => client.get('/agents/providers/'),

  getProviderCredentialStatus: () => client.get('/agents/credentials/status/'),

  saveProviderCredential: (payload) => client.post('/agents/credentials/', payload),

  getAgentInbox: (agentId: string) => client.get(`/agent-messages/inbox/?to_agent=${agentId}`),

  getAgentOutbox: (agentId: string) => client.get(`/agent-messages/outbox/?from_agent=${agentId}`),

  getExecutiveDashboard: () => client.get('/metrics/executive/'),

  getCorporateDocuments: () => client.get('/corporate-documents/'),

  createCorporateDocument: (payload) => client.post('/corporate-documents/', payload),

  updateCorporateDocument: (id, payload) => client.patch(`/corporate-documents/${id}/`, payload),

  uploadCorporateDocument: (payload) => {
    const formData = new FormData();
    formData.append('file', payload.file);
    if (payload.title) formData.append('title', payload.title);
    if (payload.doc_type) formData.append('doc_type', payload.doc_type);
    if (payload.scope) formData.append('scope', payload.scope);
    if (payload.area) formData.append('area', payload.area);
    if (payload.initiative) formData.append('initiative', payload.initiative);
    if (payload.summary) formData.append('summary', payload.summary);
    if (payload.tags?.length) formData.append('tags', payload.tags.join(','));
    return client.post('/corporate-documents/upload/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  getCorporatePromptContext: (params) => client.get('/corporate-documents/prompt_context/', { params }),

  getCorporateContextGraph: () => client.get('/corporate-documents/context_graph/'),

  getCorporateMemory: () => client.get('/corporate-memory/'),

  markCorporateMemoryReused: (id) => client.post(`/corporate-memory/${id}/mark_reused/`),

  getWorkflowPlaybooks: () => client.get('/workflow-playbooks/'),

  createWorkflowPlaybook: (payload) => client.post('/workflow-playbooks/', payload),

  seedWorkflowPlaybooks: () => client.post('/workflow-playbooks/seed_templates/'),

  runWorkflowPlaybook: (id, payload) => client.post(`/workflow-playbooks/${id}/run/`, payload),

  getWorkflowRuns: () => client.get('/workflow-runs/'),

  getEpics: () => client.get('/epics/'),

  getEpicsByStatus: () => client.get('/epics/by_status/'),

  getEpic: (id: string) => client.get(`/epics/${id}/`),

  createEpic: (payload: EpicPayload) => client.post('/epics/', payload),

  updateEpic: (id: string, payload: Partial<EpicPayload>) =>
    client.patch(`/epics/${id}/`, payload),

  deleteEpic: (id: string) => client.delete(`/epics/${id}/`),

  getTasksByStatus: () => client.get('/tasks/by_status/'),

  getMetricsOverview: () => client.get('/metrics/overview/'),

  getMetricsTimeseries: (days = 14) => client.get(`/metrics/timeseries/?days=${days}`),

  hireOrgAgent: (payload) => client.post('/org/agents/hire/', payload),

  getOrgAgentTemplate: (payload) =>
    client.get(`/org/agents/template/?department=${encodeURIComponent(payload.department)}&level=${encodeURIComponent(payload.level)}`),

  analyzeOrgFeasibility: (payload) => client.post('/org/mission/feasibility/', payload),

  runOrgMission: (payload) => client.post('/org/mission/execute/', payload),

  getOrgState: () => client.get('/org/state/'),

  getOrgMissionStats: () => client.get('/org/mission/stats/'),

  getOrgCapabilitiesSummary: () => client.get('/org/capabilities/summary/'),

  createTask: (payload: TaskPayload) => client.post('/tasks/', payload),

  updateTask: (id: string, payload: Partial<TaskPayload>) =>
    client.patch(`/tasks/${id}/`, payload),

  deleteTask: (id: string) => client.delete(`/tasks/${id}/`),

  executeTask: (id: string, capability = '') =>
    client.post(`/tasks/${id}/execute/`, { capability }),

  retryTask: (id: string) => client.post(`/tasks/${id}/retry/`),

  getTaskLogs: (id: string) => client.get(`/tasks/${id}/logs/`),

  getTaskWorkspace: (id: string) => client.get(`/tasks/${id}/workspace/`),

  createSubtask: (payload) => client.post('/subtasks/', payload),

  updateSubtask: (id, payload) => client.patch(`/subtasks/${id}/`, payload),

  previewTaskFileChange: (id, payload) =>
    client.post(`/tasks/${id}/file_change_preview/`, payload),

  applyTaskFileChange: (id, payload) =>
    client.post(`/tasks/${id}/apply_file_change/`, payload),

  requestTaskApproval: (id, payload) =>
    client.post(`/tasks/${id}/request_approval/`, payload),

  decideTaskApproval: (id, payload) =>
    client.post(`/tasks/${id}/decide_approval/`, payload),

  createTaskDecision: (id, payload) =>
    client.post(`/tasks/${id}/create_decision/`, payload),

  supersedeTaskDecision: (id, payload) =>
    client.post(`/tasks/${id}/supersede_decision/`, payload),

  rollbackTaskSnapshot: (id, payload) =>
    client.post(`/tasks/${id}/rollback_file_snapshot/`, payload),

  requestTaskClarification: (id: string, question: string) =>
    client.post(`/tasks/${id}/request_clarification/`, { question }),

  getTaskClarifications: (id: string) => client.get(`/tasks/${id}/clarifications/`),

  answerClarification: (id: string, answer: string) =>
    client.post(`/clarifications/${id}/answer/`, { answer }),

  completeTask: (id: string, result: Record<string, unknown> = {}) =>
    client.post(`/tasks/${id}/complete/`, { result }),

  failTask: (id: string, error = 'Falha manual') =>
    client.post(`/tasks/${id}/fail/`, { error }),

  sendChatMessage: (
    agentId: string,
    message: string,
    context: Record<string, unknown> = {}
  ) =>
    client.post('/chat/', {
      agent_id: agentId || undefined,
      message,
      context,
      stream: false,
    }),

  streamChatMessage: async (
    message: string,
    onChunk: (chunk: string) => void,
    onError?: (errorMessage: string) => void,
    context: Record<string, unknown> = {},
    signal?: AbortSignal
  ) => {
    try {
      const response = await fetch(`${API_BASE_URL}/chat/`, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          ...(client.defaults.headers.common.Authorization
            ? { Authorization: String(client.defaults.headers.common.Authorization) }
            : {}),
        },
        body: JSON.stringify({
          message,
          context,
          stream: true,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.startsWith('data:'));

        // Keep trailing partial line for the next chunk.
        const lastNewline = buffer.lastIndexOf('\n');
        buffer = lastNewline >= 0 ? buffer.slice(lastNewline + 1) : buffer;

        lines.forEach((line) => {
          const data = line.replace(/^data:\s?/, '');
          if (!data || data === '[DONE]') {
            return;
          }

          // Support either raw token streams or JSON envelopes.
          try {
            const parsed = JSON.parse(data);
            if (typeof parsed === 'string') {
              onChunk(parsed);
              return;
            }

            if (typeof parsed?.chunk === 'string') {
              onChunk(parsed.chunk);
              return;
            }

            if (typeof parsed?.delta === 'string') {
              onChunk(parsed.delta);
              return;
            }

            if (typeof parsed?.token === 'string') {
              onChunk(parsed.token);
            }
          } catch {
            onChunk(data);
          }
        });
      }
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') {
        return;
      }
      const message = typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : 'Erro no stream de chat';
      onError?.(message);
      throw error;
    }
  },
});
