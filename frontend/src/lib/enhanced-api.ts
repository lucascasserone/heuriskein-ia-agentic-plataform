import { apiClient } from '@/lib/api';
import { withRetry } from '@/lib/api-utils';
import {
  validateData,
  TasksByStatusSchema,
  EpicsByStatusSchema,
  MetricsSchema,
  AgentsListSchema,
} from '@/lib/validation';

/**
 * Enhanced API client with retry logic and validation
 */
export const enhancedApiClient = {
  // Tasks
  async getTasksByStatus() {
    return withRetry(
      async () => {
        const response = await apiClient.getTasksByStatus();
        const validation = validateData(TasksByStatusSchema, response.data);
        if (!validation.success) {
          console.warn('TasksByStatus validation warning:', validation.error);
        }
        return response;
      },
      { maxRetries: 2, delayMs: 500 }
    );
  },

  async createTask(payload: Parameters<typeof apiClient.createTask>[0]) {
    return withRetry(() => apiClient.createTask(payload), {
      maxRetries: 2,
      delayMs: 500,
    });
  },

  async updateTask(id: string, payload: Parameters<typeof apiClient.updateTask>[1]) {
    return withRetry(() => apiClient.updateTask(id, payload), {
      maxRetries: 2,
      delayMs: 500,
    });
  },

  async deleteTask(id: string) {
    return withRetry(() => apiClient.deleteTask(id), {
      maxRetries: 1,
      delayMs: 500,
    });
  },

  async executeTask(id: string, capability?: string) {
    return withRetry(() => apiClient.executeTask(id, capability), {
      maxRetries: 2,
      delayMs: 500,
    });
  },

  // Epics
  async getEpicsByStatus() {
    return withRetry(
      async () => {
        const response = await apiClient.getEpicsByStatus();
        const validation = validateData(EpicsByStatusSchema, response.data);
        if (!validation.success) {
          console.warn('EpicsByStatus validation warning:', validation.error);
        }
        return response;
      },
      { maxRetries: 2, delayMs: 500 }
    );
  },

  async createEpic(payload: Parameters<typeof apiClient.createEpic>[0]) {
    return withRetry(() => apiClient.createEpic(payload), {
      maxRetries: 2,
      delayMs: 500,
    });
  },

  async updateEpic(id: string, payload: Parameters<typeof apiClient.updateEpic>[1]) {
    return withRetry(() => apiClient.updateEpic(id, payload), {
      maxRetries: 2,
      delayMs: 500,
    });
  },

  async deleteEpic(id: string) {
    return withRetry(() => apiClient.deleteEpic(id), {
      maxRetries: 1,
      delayMs: 500,
    });
  },

  // Metrics
  async getMetricsOverview() {
    return withRetry(
      async () => {
        const response = await apiClient.getMetricsOverview();
        const validation = validateData(MetricsSchema, response.data);
        if (!validation.success) {
          console.warn('Metrics validation warning:', validation.error);
        }
        return response;
      },
      { maxRetries: 2, delayMs: 500 }
    );
  },

  async getMetricsTimeseries(days?: number) {
    return withRetry(() => apiClient.getMetricsTimeseries(days), {
      maxRetries: 2,
      delayMs: 500,
    });
  },

  // Agents
  async getActiveAgents() {
    return withRetry(
      async () => {
        const response = await apiClient.getActiveAgents();
        const validation = validateData(AgentsListSchema, response.data);
        if (!validation.success) {
          console.warn('Agents validation warning:', validation.error);
        }
        return response;
      },
      { maxRetries: 2, delayMs: 500 }
    );
  },

  // Chat
  async sendChatMessage(
    agentId: string,
    message: string,
    context?: Record<string, unknown>
  ) {
    return withRetry(() => apiClient.sendChatMessage(agentId, message, context), {
      maxRetries: 2,
      delayMs: 500,
    });
  },

  streamChatMessage: apiClient.streamChatMessage, // Don't retry streaming
};

export default enhancedApiClient;
