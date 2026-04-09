import { z } from 'zod';

// Task validation
export const TaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1, 'Título é obrigatório'),
  description: z.string().optional().nullable(),
  epic: z.string().uuid().optional().nullable(),
  status: z.enum(['queue', 'processing', 'blocked', 'review', 'completed', 'failed']),
  priority: z.enum(['low', 'medium', 'high']).catch('medium'),
  assigned_to: z.string().uuid().optional().nullable(),
  assigned_to_name: z.string().optional().nullable(),
  attempt_count: z.number().int().min(0).catch(0),
  result: z.record(z.string(), z.any()).optional().nullable(),
  error: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
  next_action: z.string().optional().nullable(),
  artifact_count: z.number().int().min(0).optional().catch(0),
  event_count: z.number().int().min(0).optional().catch(0),
  subtask_count: z.number().int().min(0).optional().catch(0),
  latest_question: z.string().optional().nullable(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type Task = z.infer<typeof TaskSchema>;
export const TasksListSchema = z.array(TaskSchema);

// Epic validation
export const EpicSchema = z.object({
  id: z.string().uuid(),
  goal: z.string().min(1, 'Objetivo é obrigatório'),
  description: z.string().optional().nullable(),
  status: z.enum(['backlog', 'refinement', 'approved', 'completed', 'failed']),
  priority: z.enum(['low', 'medium', 'high']).catch('medium'),
  created_by: z.string().uuid().optional().nullable(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type Epic = z.infer<typeof EpicSchema>;
export const EpicsListSchema = z.array(EpicSchema);

// Agent validation
export const AgentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, 'Nome é obrigatório'),
  type: z.enum(['coordinator', 'executor', 'analyst']).catch('executor'),
  state: z.enum(['idle', 'thinking', 'executing', 'blocked']).catch('idle'),
  model: z.string().optional().nullable(),
  capabilities: z.array(z.string()).optional().catch([]),
  current_task: z.string().uuid().optional().nullable(),
});

export type Agent = z.infer<typeof AgentSchema>;
export const AgentsListSchema = z.array(AgentSchema);

// Metrics validation
export const MetricsSchema = z.object({
  total_tasks: z.number().int().min(0).catch(0),
  completed_tasks: z.number().int().min(0).catch(0),
  failed_tasks: z.number().int().min(0).catch(0),
  active_agents: z.number().int().min(0).catch(0),
  queue_size: z.number().int().min(0).catch(0),
  success_rate: z.number().min(0).max(100).catch(0),
});

export type Metrics = z.infer<typeof MetricsSchema>;

// Grouped by status response
export const TasksByStatusSchema = z.record(z.enum(['queue', 'processing', 'blocked', 'review', 'completed', 'failed']), TasksListSchema);
export const EpicsByStatusSchema = z.record(z.enum(['backlog', 'refinement', 'approved', 'completed', 'failed']), EpicsListSchema);

// Chat validation
export const ChatMessageSchema = z.object({
  message: z.string().min(1, 'Mensagem não pode estar vazia'),
  stream: z.boolean().optional().default(false),
});

export const ChatResponseSchema = z.object({
  agent_response: z.string().optional().nullable(),
  action: z.string().optional().nullable(),
  created: z.boolean().optional().default(false),
});

// Safe validation function
export function validateData<T>(schema: z.ZodSchema<T>, data: unknown): { success: boolean; data?: T; error?: string } {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      return { success: false, error: messages };
    }
    return { success: false, error: 'Erro de validação desconhecido' };
  }
}
