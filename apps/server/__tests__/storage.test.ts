/**
 * Storage Layer Tests
 *
 * Tests for the in-memory storage implementation.
 * These tests verify user and learning event operations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemStorage } from '../storage';

describe('MemStorage', () => {
  let storage: MemStorage;

  beforeEach(() => {
    storage = new MemStorage();
  });

  describe('User operations', () => {
    describe('createUser', () => {
      it('should create a user with hashed password', async () => {
        const user = await storage.createUser({
          username: 'testuser',
          password: 'password123',
        });

        expect(user.id).toBe(1);
        expect(user.username).toBe('testuser');
        // Password should be hashed, not plaintext
        expect(user.password).not.toBe('password123');
        expect(user.password.startsWith('$2b$')).toBe(true); // bcrypt hash format
      });

      it('should assign incrementing IDs', async () => {
        const user1 = await storage.createUser({
          username: 'user1',
          password: 'pass1',
        });
        const user2 = await storage.createUser({
          username: 'user2',
          password: 'pass2',
        });

        expect(user1.id).toBe(1);
        expect(user2.id).toBe(2);
      });
    });

    describe('getUser', () => {
      it('should return user by id', async () => {
        const created = await storage.createUser({
          username: 'testuser',
          password: 'password123',
        });

        const user = await storage.getUser(created.id);

        expect(user).toBeDefined();
        expect(user?.id).toBe(created.id);
        expect(user?.username).toBe('testuser');
      });

      it('should return undefined for non-existent id', async () => {
        const user = await storage.getUser(999);
        expect(user).toBeUndefined();
      });
    });

    describe('getUserByUsername', () => {
      it('should return user by username', async () => {
        await storage.createUser({
          username: 'testuser',
          password: 'password123',
        });

        const user = await storage.getUserByUsername('testuser');

        expect(user).toBeDefined();
        expect(user?.username).toBe('testuser');
      });

      it('should return undefined for non-existent username', async () => {
        const user = await storage.getUserByUsername('nonexistent');
        expect(user).toBeUndefined();
      });
    });

    describe('verifyPassword', () => {
      it('should return user for correct password', async () => {
        await storage.createUser({
          username: 'testuser',
          password: 'correctpassword',
        });

        const user = await storage.verifyPassword('testuser', 'correctpassword');

        expect(user).not.toBeNull();
        expect(user?.username).toBe('testuser');
      });

      it('should return null for incorrect password', async () => {
        await storage.createUser({
          username: 'testuser',
          password: 'correctpassword',
        });

        const user = await storage.verifyPassword('testuser', 'wrongpassword');

        expect(user).toBeNull();
      });

      it('should return null for non-existent user', async () => {
        const user = await storage.verifyPassword('nonexistent', 'password');
        expect(user).toBeNull();
      });

      it('should work with complex passwords', async () => {
        const complexPassword = 'C0mpl3x!P@ssw0rd$123';
        await storage.createUser({
          username: 'testuser',
          password: complexPassword,
        });

        const user = await storage.verifyPassword('testuser', complexPassword);
        expect(user).not.toBeNull();
      });
    });
  });

  describe('Learning event operations', () => {
    describe('createLearningEvent', () => {
      it('should create a learning event', async () => {
        const user = await storage.createUser({
          username: 'testuser',
          password: 'password',
        });

        const event = await storage.createLearningEvent({
          userId: user.id,
          type: 'practice',
          data: { skillId: 'math-addition', correct: true },
        });

        expect(event.id).toBe(1);
        expect(event.userId).toBe(user.id);
        expect(event.type).toBe('practice');
        expect(event.data).toEqual({ skillId: 'math-addition', correct: true });
        expect(event.timestamp).toBeInstanceOf(Date);
      });

      it('should use provided timestamp if given', async () => {
        const customTimestamp = new Date('2024-01-15T10:30:00Z');

        const event = await storage.createLearningEvent({
          userId: 1,
          type: 'assessment',
          data: {},
          timestamp: customTimestamp,
        });

        expect(event.timestamp).toEqual(customTimestamp);
      });

      it('should assign incrementing IDs', async () => {
        const event1 = await storage.createLearningEvent({
          userId: 1,
          type: 'practice',
          data: {},
        });
        const event2 = await storage.createLearningEvent({
          userId: 1,
          type: 'practice',
          data: {},
        });

        expect(event1.id).toBe(1);
        expect(event2.id).toBe(2);
      });
    });

    describe('getLearningEvent', () => {
      it('should return event by id', async () => {
        const created = await storage.createLearningEvent({
          userId: 1,
          type: 'practice',
          data: { test: 'value' },
        });

        const event = await storage.getLearningEvent(created.id);

        expect(event).toBeDefined();
        expect(event?.id).toBe(created.id);
        expect(event?.type).toBe('practice');
      });

      it('should return undefined for non-existent id', async () => {
        const event = await storage.getLearningEvent(999);
        expect(event).toBeUndefined();
      });
    });

    describe('getLearningEventsByUserId', () => {
      it('should return all events for a user', async () => {
        await storage.createLearningEvent({
          userId: 1,
          type: 'practice',
          data: {},
        });
        await storage.createLearningEvent({
          userId: 1,
          type: 'assessment',
          data: {},
        });
        await storage.createLearningEvent({
          userId: 2,
          type: 'practice',
          data: {},
        });

        const events = await storage.getLearningEventsByUserId(1);

        expect(events).toHaveLength(2);
        expect(events.every(e => e.userId === 1)).toBe(true);
      });

      it('should return empty array for user with no events', async () => {
        const events = await storage.getLearningEventsByUserId(999);
        expect(events).toEqual([]);
      });
    });

    describe('getLearningEventsByType', () => {
      it('should return all events of a type', async () => {
        await storage.createLearningEvent({
          userId: 1,
          type: 'practice',
          data: {},
        });
        await storage.createLearningEvent({
          userId: 2,
          type: 'practice',
          data: {},
        });
        await storage.createLearningEvent({
          userId: 1,
          type: 'assessment',
          data: {},
        });

        const events = await storage.getLearningEventsByType('practice');

        expect(events).toHaveLength(2);
        expect(events.every(e => e.type === 'practice')).toBe(true);
      });

      it('should return empty array for non-existent type', async () => {
        await storage.createLearningEvent({
          userId: 1,
          type: 'practice',
          data: {},
        });

        const events = await storage.getLearningEventsByType('nonexistent');
        expect(events).toEqual([]);
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle empty data objects', async () => {
      const event = await storage.createLearningEvent({
        userId: 1,
        type: 'test',
        data: {},
      });

      expect(event.data).toEqual({});
    });

    it('should handle complex nested data', async () => {
      const complexData = {
        skills: ['math', 'science'],
        scores: { math: 0.8, science: 0.6 },
        nested: { deep: { value: 42 } },
      };

      const event = await storage.createLearningEvent({
        userId: 1,
        type: 'complex',
        data: complexData,
      });

      expect(event.data).toEqual(complexData);
    });

    it('should handle special characters in username', async () => {
      const user = await storage.createUser({
        username: 'user_with-special.chars',
        password: 'password',
      });

      expect(user.username).toBe('user_with-special.chars');

      const retrieved = await storage.getUserByUsername('user_with-special.chars');
      expect(retrieved).toBeDefined();
    });

    it('should handle unicode in data', async () => {
      const event = await storage.createLearningEvent({
        userId: 1,
        type: 'unicode-test',
        data: { message: '你好世界 🌍 مرحبا' },
      });

      expect((event.data as { message: string }).message).toBe('你好世界 🌍 مرحبا');
    });
  });
});
