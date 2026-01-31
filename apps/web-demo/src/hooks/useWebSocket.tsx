/**
 * WebSocket Hook
 * Manages WebSocket connection for real-time updates
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface WSMessage {
  type: string;
  payload: unknown;
  timestamp: number;
}

interface UseWebSocketOptions {
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectInterval?: number;
  onMessage?: (message: WSMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

interface UseWebSocketReturn {
  status: ConnectionStatus;
  connect: () => void;
  disconnect: () => void;
  send: (type: string, payload: unknown) => void;
  subscribe: (channels: string[]) => void;
  unsubscribe: (channels: string[]) => void;
  lastMessage: WSMessage | null;
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    autoConnect = true,
    reconnectAttempts = 5,
    reconnectInterval = 3000,
    onMessage,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const getWebSocketUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }, []);

  const connect = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setStatus('connecting');

    try {
      const socket = new WebSocket(getWebSocketUrl());

      socket.onopen = () => {
        setStatus('connected');
        reconnectCountRef.current = 0;
        onConnect?.();
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WSMessage;
          setLastMessage(message);
          onMessage?.(message);
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
        }
      };

      socket.onclose = () => {
        setStatus('disconnected');
        socketRef.current = null;
        onDisconnect?.();

        // Attempt reconnection
        if (reconnectCountRef.current < reconnectAttempts) {
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectCountRef.current++;
            // eslint-disable-next-line no-console
            console.log(`[WebSocket] Reconnecting... (attempt ${reconnectCountRef.current})`);
            connect();
          }, reconnectInterval);
        }
      };

      socket.onerror = (error) => {
        setStatus('error');
        onError?.(error);
      };

      socketRef.current = socket;
    } catch (error) {
      setStatus('error');
      console.error('[WebSocket] Connection error:', error);
    }
  }, [getWebSocketUrl, reconnectAttempts, reconnectInterval, onConnect, onDisconnect, onError, onMessage]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    reconnectCountRef.current = reconnectAttempts; // Prevent auto-reconnect

    if (socketRef.current) {
      socketRef.current.close(1000, 'Client disconnect');
      socketRef.current = null;
    }

    setStatus('disconnected');
  }, [reconnectAttempts]);

  const send = useCallback((type: string, payload: unknown) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      const message: WSMessage = {
        type,
        payload,
        timestamp: Date.now(),
      };
      socketRef.current.send(JSON.stringify(message));
    } else {
      console.warn('[WebSocket] Cannot send message: not connected');
    }
  }, []);

  const subscribe = useCallback((channels: string[]) => {
    send('subscribe', channels);
  }, [send]);

  const unsubscribe = useCallback((channels: string[]) => {
    send('unsubscribe', channels);
  }, [send]);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    status,
    connect,
    disconnect,
    send,
    subscribe,
    unsubscribe,
    lastMessage,
  };
}

/**
 * Hook for real-time attention updates
 */
export function useRealtimeAttention() {
  const [attentionData, setAttentionData] = useState<{
    score: number;
    focusStability: number;
    cognitiveLoad: number;
    timestamp: number;
  } | null>(null);

  const handleMessage = useCallback((message: WSMessage) => {
    if (message.type === 'attention-update') {
      setAttentionData({
        ...(message.payload as { score: number; focusStability: number; cognitiveLoad: number }),
        timestamp: message.timestamp,
      });
    }
  }, []);

  const { status, send, subscribe } = useWebSocket({
    onMessage: handleMessage,
    onConnect: () => {
      subscribe(['attention']);
    },
  });

  const sendAttentionUpdate = useCallback(
    (data: { score: number; focusStability: number; cognitiveLoad: number }) => {
      send('attention-update', data);
    },
    [send]
  );

  return {
    attentionData,
    sendAttentionUpdate,
    isConnected: status === 'connected',
  };
}

/**
 * Hook for real-time learning events
 */
export function useRealtimeLearningEvents() {
  const [events, setEvents] = useState<WSMessage[]>([]);

  const handleMessage = useCallback((message: WSMessage) => {
    if (message.type === 'learning-event' || message.type === 'recommendation') {
      setEvents((prev) => [...prev.slice(-99), message]); // Keep last 100 events
    }
  }, []);

  const { status, subscribe } = useWebSocket({
    onMessage: handleMessage,
    onConnect: () => {
      subscribe(['learning-events', 'recommendations']);
    },
  });

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return {
    events,
    clearEvents,
    isConnected: status === 'connected',
    latestEvent: events[events.length - 1] || null,
  };
}

export default useWebSocket;
