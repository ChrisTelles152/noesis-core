/**
 * WebSocket Service
 * Provides real-time communication for learning events and attention updates
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { IncomingMessage } from 'http';
import { parseSessionIdFromCookie, verifySessionAndGetUserId } from './auth';

// Message types
export interface WSMessage {
  type: string;
  payload: unknown;
  timestamp: number;
}

export interface AttentionUpdate {
  score: number;
  focusStability: number;
  cognitiveLoad: number;
  userId?: number;
}

export interface LearningEventNotification {
  eventType: string;
  data: Record<string, unknown>;
  userId: number;
}

// Client tracking
interface WSClient {
  socket: WebSocket;
  userId?: number;
  subscriptions: Set<string>;
  lastPing: number;
}

class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, WSClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize WebSocket server
   */
  initialize(server: Server): void {
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
    });

    this.wss.on('connection', (socket: WebSocket, request: IncomingMessage) => {
      this.handleConnection(socket, request);
    });

    // Start heartbeat checker
    this.heartbeatInterval = setInterval(() => {
      this.checkHeartbeats();
    }, 30000);

    console.log('[WebSocket] Server initialized on /ws');
  }

  /**
   * Handle new WebSocket connection
   */
  private async handleConnection(socket: WebSocket, request: IncomingMessage): Promise<void> {
    const client: WSClient = {
      socket,
      subscriptions: new Set(['attention', 'learning-events']),
      lastPing: Date.now(),
    };

    this.clients.set(socket, client);
    console.log(`[WebSocket] Client connected. Total clients: ${this.clients.size}`);

    // Try to authenticate from HTTP upgrade request cookies
    const cookieHeader = request.headers.cookie;
    const sessionId = parseSessionIdFromCookie(cookieHeader);

    if (sessionId) {
      const userId = await verifySessionAndGetUserId(sessionId);
      if (userId) {
        client.userId = userId;
        console.log(`[WebSocket] Client auto-authenticated from session: userId=${userId}`);
      }
    }

    // Send welcome message
    this.sendToClient(socket, {
      type: 'connected',
      payload: {
        message: 'Connected to Noesis WebSocket server',
        subscriptions: Array.from(client.subscriptions),
        authenticated: client.userId !== undefined,
        userId: client.userId,
      },
      timestamp: Date.now(),
    });

    // Handle messages from client
    socket.on('message', (data: Buffer) => {
      this.handleMessage(socket, data);
    });

    // Handle client disconnect
    socket.on('close', () => {
      this.clients.delete(socket);
      console.log(`[WebSocket] Client disconnected. Total clients: ${this.clients.size}`);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error('[WebSocket] Client error:', error);
      this.clients.delete(socket);
    });

    // Handle pong for heartbeat
    socket.on('pong', () => {
      const client = this.clients.get(socket);
      if (client) {
        client.lastPing = Date.now();
      }
    });
  }

  /**
   * Handle incoming message from client
   */
  private async handleMessage(socket: WebSocket, data: Buffer): Promise<void> {
    try {
      const message = JSON.parse(data.toString()) as WSMessage;
      const client = this.clients.get(socket);

      if (!client) return;

      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(client, message.payload as string[]);
          break;

        case 'unsubscribe':
          this.handleUnsubscribe(client, message.payload as string[]);
          break;

        case 'ping':
          this.sendToClient(socket, {
            type: 'pong',
            payload: null,
            timestamp: Date.now(),
          });
          break;

        case 'attention-update':
          // Client is reporting attention data
          this.broadcastAttentionUpdate(message.payload as AttentionUpdate, client.userId);
          break;

        case 'authenticate':
          // SECURITY: Client authentication via WebSocket
          // Supports session ID verification (secure) or userId (dev only)
          const payload = message.payload as { userId?: number; sessionId?: string };
          const providedSessionId = payload.sessionId;
          const providedUserId = payload.userId;

          // Try session-based authentication first (secure)
          if (providedSessionId) {
            const verifiedUserId = await verifySessionAndGetUserId(providedSessionId);
            if (verifiedUserId) {
              client.userId = verifiedUserId;
              this.sendToClient(socket, {
                type: 'authenticated',
                payload: { userId: verifiedUserId, method: 'session' },
                timestamp: Date.now(),
              });
              console.log(`[WebSocket] Client authenticated via session: userId=${verifiedUserId}`);
              break;
            } else {
              this.sendToClient(socket, {
                type: 'auth-error',
                payload: { error: 'Invalid or expired session' },
                timestamp: Date.now(),
              });
              break;
            }
          }

          // Fall back to userId (development only)
          if (providedUserId) {
            if (process.env.NODE_ENV === 'production') {
              console.error('[WebSocket] SECURITY: Client-provided userId rejected in production');
              this.sendToClient(socket, {
                type: 'auth-error',
                payload: { error: 'Session authentication required in production' },
                timestamp: Date.now(),
              });
              break;
            }

            console.warn('[WebSocket] DEV: Accepting client-provided userId without verification');
            client.userId = providedUserId;
            this.sendToClient(socket, {
              type: 'authenticated',
              payload: { userId: providedUserId, method: 'dev-userId', warning: 'Development mode only' },
              timestamp: Date.now(),
            });
          } else {
            this.sendToClient(socket, {
              type: 'auth-error',
              payload: { error: 'sessionId or userId (dev only) required' },
              timestamp: Date.now(),
            });
          }
          break;

        default:
          console.log(`[WebSocket] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('[WebSocket] Error parsing message:', error);
    }
  }

  /**
   * Handle subscription request
   */
  private handleSubscribe(client: WSClient, channels: string[]): void {
    for (const channel of channels) {
      client.subscriptions.add(channel);
    }

    this.sendToClient(client.socket, {
      type: 'subscribed',
      payload: { channels, current: Array.from(client.subscriptions) },
      timestamp: Date.now(),
    });
  }

  /**
   * Handle unsubscribe request
   */
  private handleUnsubscribe(client: WSClient, channels: string[]): void {
    for (const channel of channels) {
      client.subscriptions.delete(channel);
    }

    this.sendToClient(client.socket, {
      type: 'unsubscribed',
      payload: { channels, current: Array.from(client.subscriptions) },
      timestamp: Date.now(),
    });
  }

  /**
   * Send message to a specific client
   */
  private sendToClient(socket: WebSocket, message: WSMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast attention update to subscribed clients
   */
  broadcastAttentionUpdate(update: AttentionUpdate, sourceUserId?: number): void {
    const message: WSMessage = {
      type: 'attention-update',
      payload: update,
      timestamp: Date.now(),
    };

    this.broadcast('attention', message, sourceUserId);
  }

  /**
   * Broadcast learning event notification
   */
  broadcastLearningEvent(event: LearningEventNotification): void {
    const message: WSMessage = {
      type: 'learning-event',
      payload: event,
      timestamp: Date.now(),
    };

    this.broadcast('learning-events', message, event.userId);
  }

  /**
   * Broadcast recommendation notification
   */
  broadcastRecommendation(userId: number, recommendation: { suggestion: string; type: string }): void {
    const message: WSMessage = {
      type: 'recommendation',
      payload: recommendation,
      timestamp: Date.now(),
    };

    // Send only to the specific user
    Array.from(this.clients.entries()).forEach(([socket, client]) => {
      if (client.userId === userId && client.subscriptions.has('recommendations')) {
        this.sendToClient(socket, message);
      }
    });
  }

  /**
   * Broadcast message to all clients subscribed to a channel
   */
  private broadcast(channel: string, message: WSMessage, excludeUserId?: number): void {
    Array.from(this.clients.entries()).forEach(([socket, client]) => {
      if (client.subscriptions.has(channel)) {
        // Optionally exclude sender
        if (excludeUserId && client.userId === excludeUserId) {
          return;
        }
        this.sendToClient(socket, message);
      }
    });
  }

  /**
   * Send message to a specific user
   */
  sendToUser(userId: number, message: WSMessage): void {
    Array.from(this.clients.entries()).forEach(([socket, client]) => {
      if (client.userId === userId) {
        this.sendToClient(socket, message);
      }
    });
  }

  /**
   * Check heartbeats and disconnect stale clients
   */
  private checkHeartbeats(): void {
    const now = Date.now();
    const timeout = 60000; // 60 seconds

    Array.from(this.clients.entries()).forEach(([socket, client]) => {
      if (now - client.lastPing > timeout) {
        console.log('[WebSocket] Client timed out, disconnecting');
        socket.terminate();
        this.clients.delete(socket);
      } else {
        // Send ping to check if client is still alive
        if (socket.readyState === WebSocket.OPEN) {
          socket.ping();
        }
      }
    });
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get connected authenticated users
   */
  getAuthenticatedUsers(): number[] {
    const users: number[] = [];
    Array.from(this.clients.values()).forEach((client) => {
      if (client.userId !== undefined) {
        users.push(client.userId);
      }
    });
    return Array.from(new Set(users));
  }

  /**
   * Shutdown WebSocket server
   */
  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.wss) {
      // Close all client connections
      Array.from(this.clients.keys()).forEach((socket) => {
        socket.close(1000, 'Server shutting down');
      });

      this.wss.close();
      this.wss = null;
    }

    this.clients.clear();
    console.log('[WebSocket] Server shutdown complete');
  }
}

// Singleton instance
export const wsService = new WebSocketService();

export function initializeWebSocket(server: Server): void {
  wsService.initialize(server);
}
