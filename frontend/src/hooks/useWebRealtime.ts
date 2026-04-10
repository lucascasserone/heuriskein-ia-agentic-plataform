import { useEffect, useRef, useCallback, useState, useMemo } from 'react';

function wsBaseFromApiUrl(apiUrl?: string) {
  if (!apiUrl) return '';
  try {
    const parsed = new URL(apiUrl);
    const wsScheme = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsPath = parsed.pathname.startsWith('/api') ? '/ws' : parsed.pathname;
    return `${wsScheme}//${parsed.host}${wsPath}`.replace(/\/$/, '');
  } catch {
    return '';
  }
}

function resolveWsBaseUrls() {
  const candidates: string[] = [];

  const pushUnique = (value?: string) => {
    if (!value) return;
    if (!candidates.includes(value)) {
      candidates.push(value);
    }
  };

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const wsScheme = window.location.protocol === 'https:' ? 'wss' : 'ws';

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      // Prefer :8001, then fallback to :8000 for local dev setups.
      pushUnique(`${wsScheme}://${hostname}:8001/ws`);
      pushUnique(`${wsScheme}://${hostname}:8000/ws`);
    } else {
      // Allow same-host websocket in reverse proxy setups.
      pushUnique(`${wsScheme}://${window.location.host}/ws`);
    }
  }

  pushUnique(process.env.NEXT_PUBLIC_WS_URL);
  pushUnique(wsBaseFromApiUrl(process.env.NEXT_PUBLIC_API_URL));

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      pushUnique('ws://localhost:8001/ws');
    }
  }

  return candidates;
}

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

type MessageHandler = (data: WebSocketMessage) => void;

interface UseWebRealtimeOptions {
  url: string | string[];
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
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(true);
  const reconnectAttemptsRef = useRef(0);
  const candidateIndexRef = useRef(0);
  const activeUrlRef = useRef('');
  const {
    url,
    onConnect,
    onDisconnect,
    onError,
    autoReconnect = true,
    reconnectInterval = 5000,
  } = options;

  const urlKey = Array.isArray(url) ? url.join('|') : url;
  const urlCandidates = useMemo(() => {
    const entries = Array.isArray(url) ? url : [url];
    return entries.filter(Boolean).map((item) => item.trim()).filter((item) => item.length > 0);
  }, [urlKey]);

  const getCurrentUrl = useCallback(() => {
    if (urlCandidates.length === 0) {
      return '';
    }
    return urlCandidates[candidateIndexRef.current % urlCandidates.length];
  }, [urlCandidates]);

  const connect = useCallback(() => {
    if (!shouldReconnectRef.current) {
      return;
    }

    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    const targetUrl = getCurrentUrl();
    if (!targetUrl) {
      onError?.('WebSocket URL ausente');
      return;
    }

    try {
      const ws = new WebSocket(targetUrl);
      activeUrlRef.current = targetUrl;

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        onConnect?.();
        console.log(`✅ Connected to ${targetUrl}`);
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
        if (!shouldReconnectRef.current) {
          return;
        }
        if (ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) {
          return;
        }
        console.error('WebSocket error:', error);
        onError?.(`WebSocket error at ${targetUrl}`);
      };

      ws.onclose = (event) => {
        wsRef.current = null;
        setIsConnected(false);
        onDisconnect?.();
        if (shouldReconnectRef.current) {
          console.log(`❌ Disconnected from ${targetUrl} (code=${event.code})`);
        }

        // Auto-reconnect
        const intentionalClose = event.code === 1000 && !shouldReconnectRef.current;
        if (autoReconnect && shouldReconnectRef.current && !intentionalClose) {
          const nextAttempt = reconnectAttemptsRef.current + 1;
          reconnectAttemptsRef.current = nextAttempt;
          if (urlCandidates.length > 1 && nextAttempt % 2 === 0) {
            candidateIndexRef.current = (candidateIndexRef.current + 1) % urlCandidates.length;
          }
          const interval = Math.min(reconnectInterval * nextAttempt, 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            if (!shouldReconnectRef.current) {
              return;
            }
            const nextUrl = getCurrentUrl();
            console.log(`🔄 Attempting to reconnect (${nextAttempt}) at ${nextUrl || activeUrlRef.current}...`);
            connect();
          }, interval);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      onError?.(`Failed to connect to ${targetUrl}`);
    }
  }, [autoReconnect, getCurrentUrl, onConnect, onDisconnect, onError, reconnectInterval, urlCandidates.length]);

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
    shouldReconnectRef.current = true;
    connect();

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmount');
        wsRef.current = null;
      }
      handlersRef.current.clear();
    };
  }, [connect]);

  return useMemo(
    () => ({
      isConnected,
      send,
      subscribe,
    }),
    [isConnected, send, subscribe]
  );
}

/**
 * Hook for real-time task updates
 */
export function useTaskRealtime() {
  const wsUrls = resolveWsBaseUrls().map((base) => `${base.replace(/\/$/, '')}/tasks/`);

  return useWebRealtime({
    url: wsUrls,
    autoReconnect: true,
  });
}

/**
 * Hook for real-time agent updates
 */
export function useAgentRealtime() {
  const wsUrls = resolveWsBaseUrls().map((base) => `${base.replace(/\/$/, '')}/agents/`);

  return useWebRealtime({
    url: wsUrls,
    autoReconnect: true,
  });
}

/**
 * Hook for real-time epic updates
 */
export function useEpicRealtime() {
  const wsUrls = resolveWsBaseUrls().map((base) => `${base.replace(/\/$/, '')}/epics/`);

  return useWebRealtime({
    url: wsUrls,
    autoReconnect: true,
  });
}

/**
 * Hook for real-time thought logs
 */
export function useThoughtLogsRealtime() {
  const wsUrls = resolveWsBaseUrls().map((base) => `${base.replace(/\/$/, '')}/logs/`);

  return useWebRealtime({
    url: wsUrls,
    autoReconnect: true,
  });
}
