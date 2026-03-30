import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppStore } from '@/store/appStore';

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

type MessageHandler = (data: WebSocketMessage) => void;

interface UseWebRealtimeOptions {
  url: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
  autoReconnect?: boolean;
  reconnectInterval?: number;
}

export function useWebRealtime(
  options: UseWebRealtimeOptions
): {
  isConnected: boolean;
  send: (message: WebSocketMessage) => void;
  subscribe: (type: string, handler: MessageHandler) => () => void;
} {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const handlersRef = useRef<Map<string, Set<MessageHandler>>>(new Map());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const accessToken = useAppStore((state) => state.accessToken);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(options.url);

      ws.onopen = () => {
        setIsConnected(true);
        options.onConnect?.();
        console.log(`✅ Connected to ${options.url}`);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          const type = message.type;

          // Dispatch to all handlers for this type
          const handlers = handlersRef.current.get(type);
          if (handlers) {
            handlers.forEach((handler) => {
              try {
                handler(message);
              } catch (error) {
                console.error(`Error in handler for ${type}:`, error);
              }
            });
          }

          // Also dispatch to wildcard handlers
          const wildcardHandlers = handlersRef.current.get('*');
          if (wildcardHandlers) {
            wildcardHandlers.forEach((handler) => {
              try {
                handler(message);
              } catch (error) {
                console.error('Error in wildcard handler:', error);
              }
            });
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        options.onError?.(`WebSocket error at ${options.url}`);
      };

      ws.onclose = () => {
        setIsConnected(false);
        options.onDisconnect?.();
        console.log(`❌ Disconnected from ${options.url}`);

        // Auto-reconnect
        if (options.autoReconnect !== false) {
          const interval = options.reconnectInterval || 5000;
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('🔄 Attempting to reconnect...');
            connect();
          }, interval);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      options.onError?.(`Failed to connect to ${options.url}`);
    }
  }, [options]);

  const send = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending message:', error);
      }
    } else {
      console.warn('WebSocket not connected');
    }
  }, []);

  const subscribe = useCallback(
    (type: string, handler: MessageHandler) => {
      if (!handlersRef.current.has(type)) {
        handlersRef.current.set(type, new Set());
      }

      const handlers = handlersRef.current.get(type)!;
      handlers.add(handler);

      // Return unsubscribe function
      return () => {
        handlers.delete(handler);
        if (handlers.size === 0) {
          handlersRef.current.delete(type);
        }
      };
    },
    []
  );

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      handlersRef.current.clear();
    };
  }, [connect]);

  return {
    isConnected,
    send,
    subscribe,
  };
}

/**
 * Hook for real-time task updates
 */
export function useTaskRealtime() {
  const wsUrl = `${typeof window !== 'undefined' ? window.location.protocol === 'https:' ? 'wss' : 'ws' : 'ws'}://${typeof window !== 'undefined' ? window.location.host : 'localhost:8001'}/ws/tasks/`;

  return useWebRealtime({
    url: wsUrl,
    onConnect: () => console.log('Connected to task updates'),
    onError: (error) => console.error('Task WS error:', error),
    autoReconnect: true,
  });
}

/**
 * Hook for real-time agent updates
 */
export function useAgentRealtime() {
  const wsUrl = `${typeof window !== 'undefined' ? window.location.protocol === 'https:' ? 'wss' : 'ws' : 'ws'}://${typeof window !== 'undefined' ? window.location.host : 'localhost:8001'}/ws/agents/`;

  return useWebRealtime({
    url: wsUrl,
    onConnect: () => console.log('Connected to agent updates'),
    onError: (error) => console.error('Agent WS error:', error),
    autoReconnect: true,
  });
}

/**
 * Hook for real-time epic updates
 */
export function useEpicRealtime() {
  const wsUrl = `${typeof window !== 'undefined' ? window.location.protocol === 'https:' ? 'wss' : 'ws' : 'ws'}://${typeof window !== 'undefined' ? window.location.host : 'localhost:8001'}/ws/epics/`;

  return useWebRealtime({
    url: wsUrl,
    onConnect: () => console.log('Connected to epic updates'),
    onError: (error) => console.error('Epic WS error:', error),
    autoReconnect: true,
  });
}

/**
 * Hook for real-time thought logs
 */
export function useThoughtLogsRealtime() {
  const wsUrl = `${typeof window !== 'undefined' ? window.location.protocol === 'https:' ? 'wss' : 'ws' : 'ws'}://${typeof window !== 'undefined' ? window.location.host : 'localhost:8001'}/ws/logs/`;

  return useWebRealtime({
    url: wsUrl,
    onConnect: () => console.log('Connected to thought logs'),
    onError: (error) => console.error('Logs WS error:', error),
    autoReconnect: true,
  });
}
