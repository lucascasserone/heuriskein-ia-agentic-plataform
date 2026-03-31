import { useEffect, useRef, useCallback, useState } from 'react';

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
  const {
    url,
    onConnect,
    onDisconnect,
    onError,
    autoReconnect = true,
    reconnectInterval = 5000,
  } = options;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        setIsConnected(true);
        onConnect?.();
        console.log(`✅ Connected to ${url}`);
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
        onError?.(`WebSocket error at ${url}`);
      };

      ws.onclose = () => {
        setIsConnected(false);
        onDisconnect?.();
        console.log(`❌ Disconnected from ${url}`);

        // Auto-reconnect
        if (autoReconnect) {
          const interval = reconnectInterval;
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('🔄 Attempting to reconnect...');
            connect();
          }, interval);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      onError?.(`Failed to connect to ${url}`);
    }
  }, [autoReconnect, onConnect, onDisconnect, onError, reconnectInterval, url]);

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
  const wsBase =
    process.env.NEXT_PUBLIC_WS_URL ||
    `${typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws'}://127.0.0.1:8001/ws`;
  const wsUrl = `${wsBase.replace(/\/$/, '')}/tasks/`;

  return useWebRealtime({
    url: wsUrl,
    autoReconnect: false,
  });
}

/**
 * Hook for real-time agent updates
 */
export function useAgentRealtime() {
  const wsBase =
    process.env.NEXT_PUBLIC_WS_URL ||
    `${typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws'}://127.0.0.1:8001/ws`;
  const wsUrl = `${wsBase.replace(/\/$/, '')}/agents/`;

  return useWebRealtime({
    url: wsUrl,
    autoReconnect: false,
  });
}

/**
 * Hook for real-time epic updates
 */
export function useEpicRealtime() {
  const wsBase =
    process.env.NEXT_PUBLIC_WS_URL ||
    `${typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws'}://127.0.0.1:8001/ws`;
  const wsUrl = `${wsBase.replace(/\/$/, '')}/epics/`;

  return useWebRealtime({
    url: wsUrl,
    autoReconnect: false,
  });
}

/**
 * Hook for real-time thought logs
 */
export function useThoughtLogsRealtime() {
  const wsBase =
    process.env.NEXT_PUBLIC_WS_URL ||
    `${typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws'}://127.0.0.1:8001/ws`;
  const wsUrl = `${wsBase.replace(/\/$/, '')}/logs/`;

  return useWebRealtime({
    url: wsUrl,
    autoReconnect: false,
  });
}
