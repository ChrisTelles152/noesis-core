import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import session from 'express-session';
import passport from 'passport';

// Mock the storage module
vi.mock('../storage', () => {
  const users = new Map<number, { id: number; username: string; password: string }>();
  let currentId = 1;

  return {
    storage: {
      getUserByUsername: vi.fn(async (username: string) => {
        return Array.from(users.values()).find(u => u.username === username);
      }),
      getUser: vi.fn(async (id: number) => {
        return users.get(id);
      }),
      createUser: vi.fn(async (user: { username: string; password: string }) => {
        const bcrypt = await import('bcrypt');
        const hashedPassword = await bcrypt.hash(user.password, 10);
        const newUser = { id: currentId++, username: user.username, password: hashedPassword };
        users.set(newUser.id, newUser);
        return newUser;
      }),
      verifyPassword: vi.fn(async (username: string, password: string) => {
        const bcrypt = await import('bcrypt');
        const user = Array.from(users.values()).find(u => u.username === username);
        if (!user) return null;
        const isValid = await bcrypt.compare(password, user.password);
        return isValid ? user : null;
      }),
      // Reset for tests
      _reset: () => {
        users.clear();
        currentId = 1;
      },
      _getUsers: () => users
    }
  };
});

import { setupAuth, requireAuth, getCurrentUserId } from '../auth';
import { storage } from '../storage';

function createTestApp() {
  const app = express();
  app.use(express.json());

  // Setup session for testing
  app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: false,
  }));

  // Setup auth
  setupAuth(app);

  // Add a protected test route
  app.get('/api/protected', requireAuth, (req, res) => {
    res.json({ message: 'protected content', userId: getCurrentUserId(req) });
  });

  return app;
}

describe('Auth System', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    (storage as any)._reset?.();
    app = createTestApp();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ username: 'testuser', password: 'Password123!' });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('username', 'testuser');
      expect(response.body).not.toHaveProperty('password');
    });

    it('should return 400 for username less than 3 characters', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ username: 'ab', password: 'Password123!' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Username');
    });

    it('should return 400 for password less than 8 characters', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ username: 'testuser', password: 'short' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Password');
    });

    it('should return 400 for missing username', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ password: 'Password123!' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 for missing password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ username: 'testuser' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 409 for duplicate username', async () => {
      // First registration
      await request(app)
        .post('/api/auth/register')
        .send({ username: 'existinguser', password: 'Password123!' });

      // Duplicate registration
      const response = await request(app)
        .post('/api/auth/register')
        .send({ username: 'existinguser', password: 'Password456!' });

      // 409 Conflict is the correct status code for duplicate resource
      expect(response.status).toBe(409);
      expect(response.body.error).toContain('already exists');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Create a test user first
      await request(app)
        .post('/api/auth/register')
        .send({ username: 'loginuser', password: 'Password123!' });
    });

    it('should login successfully with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'loginuser', password: 'Password123!' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('username', 'loginuser');
    });

    it('should return 401 for invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'loginuser', password: 'wrongpassword' });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 401 for non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nonexistent', password: 'Password123!' });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      const agent = request.agent(app);

      // Register and login first
      await agent
        .post('/api/auth/register')
        .send({ username: 'logoutuser', password: 'Password123!' });

      const logoutResponse = await agent.post('/api/auth/logout');

      expect(logoutResponse.status).toBe(200);
      expect(logoutResponse.body).toHaveProperty('message');
      expect(logoutResponse.body.message).toContain('Logged out');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user when authenticated', async () => {
      const agent = request.agent(app);

      // Register (auto-login)
      await agent
        .post('/api/auth/register')
        .send({ username: 'meuser', password: 'Password123!' });

      const response = await agent.get('/api/auth/me');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('username', 'meuser');
    });

    it('should return 401 when not authenticated', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/auth/check-username/:username', () => {
    it('should return available: true for unused username', async () => {
      const response = await request(app)
        .get('/api/auth/check-username/newuser');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('available', true);
    });

    it('should return available: false for taken username', async () => {
      // Create a user first
      await request(app)
        .post('/api/auth/register')
        .send({ username: 'takenuser', password: 'Password123!' });

      const response = await request(app)
        .get('/api/auth/check-username/takenuser');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('available', false);
    });
  });

  describe('Protected Routes', () => {
    it('should allow access to protected route when authenticated', async () => {
      const agent = request.agent(app);

      // Register (auto-login)
      await agent
        .post('/api/auth/register')
        .send({ username: 'protecteduser', password: 'Password123!' });

      const response = await agent.get('/api/protected');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'protected content');
      expect(response.body).toHaveProperty('userId');
    });

    it('should deny access to protected route when not authenticated', async () => {
      const response = await request(app).get('/api/protected');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });
  });

  describe('getCurrentUserId', () => {
    it('should return null for unauthenticated request', () => {
      const mockReq = {
        isAuthenticated: () => false,
        user: undefined
      } as any;

      expect(getCurrentUserId(mockReq)).toBeNull();
    });

    it('should return null when isAuthenticated is not a function', () => {
      const mockReq = {
        isAuthenticated: 'not a function',
        user: { id: 1 }
      } as any;

      expect(getCurrentUserId(mockReq)).toBeNull();
    });
  });
});
