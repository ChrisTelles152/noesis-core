import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer, Server } from 'http';
import { WebSocket } from 'ws';
import express from 'express';

// Mock the auth module
vi.mock('../auth', () => ({
  parseSessionIdFromCookie: vi.fn((cookie: string | undefined) => {
    if (!cookie) return null;
    const match = cookie.match(/connect\.sid=([^;]+)/);
    return match ? match[1] : null;
  }),
  verifySessionAndGetUserId: vi.fn(async (sessionId: string) => {
    if (sessionId === 'valid-session') return 1;
    if (sessionId === 'admin-session') return 2;
    return null;
  }),
}));

// Mock logger
vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { wsService, initializeWebSocket } from '../websocket';
import { verifySessionAndGetUserId } from '../auth';

describe('WebSocket Service', () => {
  let server: Server;
  let wsUrl: string;
  const originalEnv = process.env.NODE_ENV;

  beforeEach((context) => {
    return new Promise<void>((resolve) => {
      const app = express();
      server = createServer(app);

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          wsUrl = `ws://127.0.0.1:${addr.port}/ws`;
        }
        initializeWebSocket(server);
        resolve();
      });
    });
  });

  afterEach(() => {
    return new Promise<void>((resolve) => {
      process.env.NODE_ENV = originalEnv;
      wsService.shutdown();
      server.close(() => resolve());
    });
  });

  describe('Connection', () => {
    it('should accept WebSocket connections', async () => {
      const ws = new WebSocket(wsUrl);

      await new Promise<void>((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
      });

      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });

    it('should send welcome message on connection', async () => {
      const ws = new WebSocket(wsUrl);

      const message = await new Promise<any>((resolve, reject) => {
        ws.on('message', (data) => {
          resolve(JSON.parse(data.toString()));
        });
        ws.on('error', reject);
      });

      expect(message.type).toBe('connected');
      expect(message.payload).toHaveProperty('message');
      expect(message.payload).toHaveProperty('subscriptions');
      expect(message.payload).toHaveProperty('authenticated', false);

      ws.close();
    });

    it('should auto-authenticate with valid session cookie', async () => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          Cookie: 'connect.sid=valid-session',
        },
      });

      const message = await new Promise<any>((resolve, reject) => {
        ws.on('message', (data) => {
          resolve(JSON.parse(data.toString()));
        });
        ws.on('error', reject);
      });

      expect(message.type).toBe('connected');
      expect(message.payload.authenticated).toBe(true);
      expect(message.payload.userId).toBe(1);

      ws.close();
    });

    it('should not auto-authenticate with invalid session cookie', async () => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          Cookie: 'connect.sid=invalid-session',
        },
      });

      const message = await new Promise<any>((resolve, reject) => {
        ws.on('message', (data) => {
          resolve(JSON.parse(data.toString()));
        });
        ws.on('error', reject);
      });

      expect(message.type).toBe('connected');
      expect(message.payload.authenticated).toBe(false);

      ws.close();
    });
  });

  describe('Authentication', () => {
    it('should authenticate via session ID', async () => {
      const ws = new WebSocket(wsUrl);

      // Wait for connection
      await new Promise<void>((resolve) => {
        ws.on('message', () => resolve());
      });

      // Send auth message
      ws.send(
        JSON.stringify({
          type: 'authenticate',
          payload: { sessionId: 'valid-session' },
          timestamp: Date.now(),
        })
      );

      const authMessage = await new Promise<any>((resolve) => {
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'authenticated' || msg.type === 'auth-error') {
            resolve(msg);
          }
        });
      });

      expect(authMessage.type).toBe('authenticated');
      expect(authMessage.payload.userId).toBe(1);
      expect(authMessage.payload.method).toBe('session');

      ws.close();
    });

    it('should reject invalid session ID', async () => {
      const ws = new WebSocket(wsUrl);

      // Wait for connection
      await new Promise<void>((resolve) => {
        ws.on('message', () => resolve());
      });

      // Send auth message with invalid session
      ws.send(
        JSON.stringify({
          type: 'authenticate',
          payload: { sessionId: 'invalid-session' },
          timestamp: Date.now(),
        })
      );

      const authMessage = await new Promise<any>((resolve) => {
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'auth-error') {
            resolve(msg);
          }
        });
      });

      expect(authMessage.type).toBe('auth-error');
      expect(authMessage.payload.error).toContain('Invalid or expired');

      ws.close();
    });

    it('should allow userId auth in development', async () => {
      process.env.NODE_ENV = 'development';

      const ws = new WebSocket(wsUrl);

      // Wait for connection
      await new Promise<void>((resolve) => {
        ws.on('message', () => resolve());
      });

      // Send auth message with userId
      ws.send(
        JSON.stringify({
          type: 'authenticate',
          payload: { userId: 42 },
          timestamp: Date.now(),
        })
      );

      const authMessage = await new Promise<any>((resolve) => {
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'authenticated' || msg.type === 'auth-error') {
            resolve(msg);
          }
        });
      });

      expect(authMessage.type).toBe('authenticated');
      expect(authMessage.payload.userId).toBe(42);
      expect(authMessage.payload.method).toBe('dev-userId');
      expect(authMessage.payload.warning).toContain('Development');

      ws.close();
    });

    it('should reject userId auth in production', async () => {
      process.env.NODE_ENV = 'production';

      const ws = new WebSocket(wsUrl);

      // Wait for connection
      await new Promise<void>((resolve) => {
        ws.on('message', () => resolve());
      });

      // Send auth message with userId only
      ws.send(
        JSON.stringify({
          type: 'authenticate',
          payload: { userId: 42 },
          timestamp: Date.now(),
        })
      );

      const authMessage = await new Promise<any>((resolve) => {
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'auth-error') {
            resolve(msg);
          }
        });
      });

      expect(authMessage.type).toBe('auth-error');
      expect(authMessage.payload.error).toContain('Session authentication required');

      ws.close();
    });

    it('should require sessionId or userId for auth', async () => {
      const ws = new WebSocket(wsUrl);

      // Wait for connection
      await new Promise<void>((resolve) => {
        ws.on('message', () => resolve());
      });

      // Send auth message with no credentials
      ws.send(
        JSON.stringify({
          type: 'authenticate',
          payload: {},
          timestamp: Date.now(),
        })
      );

      const authMessage = await new Promise<any>((resolve) => {
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'auth-error') {
            resolve(msg);
          }
        });
      });

      expect(authMessage.type).toBe('auth-error');
      expect(authMessage.payload.error).toContain('required');

      ws.close();
    });
  });

  describe('Subscriptions', () => {
    it('should handle subscribe messages', async () => {
      const ws = new WebSocket(wsUrl);

      // Wait for connection
      await new Promise<void>((resolve) => {
        ws.on('message', () => resolve());
      });

      // Subscribe to channels
      ws.send(
        JSON.stringify({
          type: 'subscribe',
          payload: ['recommendations', 'alerts'],
          timestamp: Date.now(),
        })
      );

      const subMessage = await new Promise<any>((resolve) => {
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'subscribed') {
            resolve(msg);
          }
        });
      });

      expect(subMessage.type).toBe('subscribed');
      expect(subMessage.payload.channels).toContain('recommendations');
      expect(subMessage.payload.channels).toContain('alerts');

      ws.close();
    });

    it('should handle unsubscribe messages', async () => {
      const ws = new WebSocket(wsUrl);

      // Wait for connection
      await new Promise<void>((resolve) => {
        ws.on('message', () => resolve());
      });

      // Unsubscribe from default channels
      ws.send(
        JSON.stringify({
          type: 'unsubscribe',
          payload: ['attention'],
          timestamp: Date.now(),
        })
      );

      const unsubMessage = await new Promise<any>((resolve) => {
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'unsubscribed') {
            resolve(msg);
          }
        });
      });

      expect(unsubMessage.type).toBe('unsubscribed');
      expect(unsubMessage.payload.channels).toContain('attention');
      expect(unsubMessage.payload.current).not.toContain('attention');

      ws.close();
    });
  });

  describe('Ping/Pong', () => {
    it('should respond to ping messages', async () => {
      const ws = new WebSocket(wsUrl);

      // Wait for connection
      await new Promise<void>((resolve) => {
        ws.on('message', () => resolve());
      });

      // Send ping
      ws.send(
        JSON.stringify({
          type: 'ping',
          payload: null,
          timestamp: Date.now(),
        })
      );

      const pongMessage = await new Promise<any>((resolve) => {
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'pong') {
            resolve(msg);
          }
        });
      });

      expect(pongMessage.type).toBe('pong');

      ws.close();
    });
  });

  describe('Service Methods', () => {
    it('should track client count', async () => {
      expect(wsService.getClientCount()).toBe(0);

      const ws1 = new WebSocket(wsUrl);
      await new Promise<void>((resolve) => {
        ws1.on('open', resolve);
      });

      expect(wsService.getClientCount()).toBe(1);

      const ws2 = new WebSocket(wsUrl);
      await new Promise<void>((resolve) => {
        ws2.on('open', resolve);
      });

      expect(wsService.getClientCount()).toBe(2);

      ws1.close();
      ws2.close();

      // Wait for close to propagate
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(wsService.getClientCount()).toBe(0);
    });

    it('should track authenticated users', async () => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          Cookie: 'connect.sid=valid-session',
        },
      });

      // Wait for connection and auto-auth
      await new Promise<void>((resolve) => {
        ws.on('message', () => resolve());
      });

      // Small delay for auth processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      const users = wsService.getAuthenticatedUsers();
      expect(users).toContain(1);

      ws.close();
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON gracefully', async () => {
      const ws = new WebSocket(wsUrl);

      await new Promise<void>((resolve) => {
        ws.on('open', resolve);
      });

      // Send malformed JSON - should not crash
      ws.send('not valid json {{{');

      // Wait a bit and verify connection still works
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(ws.readyState).toBe(WebSocket.OPEN);

      ws.close();
    });
  });
});
