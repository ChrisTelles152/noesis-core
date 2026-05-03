/**
 * Storage Layer
 * Provides data persistence abstraction with support for both
 * in-memory (development) and PostgreSQL (production) backends.
 *
 * Uses dependency injection pattern:
 * - Configure with configureStorage() before first use
 * - Access via getStorage() for DI-friendly code
 * - Direct import of `storage` still works for convenience
 */

import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import {
  users,
  learningEvents,
  engineStates,
  skillGraphs,
  type User,
  type InsertUser,
  type LearningEvent,
  type InsertLearningEvent,
} from '@shared/schema';
import { db, isDatabaseConfigured } from './db';
import { getLogger, type Logger } from './logger';
import { SqliteStorage } from './sqlite-storage';
import type { Skill, ItemSkillMapping, TransferTest } from '@noesis-edu/core';

const SALT_ROUNDS = 12;

export interface GoogleUserProfile {
  googleId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

/**
 * Per-user curriculum payload — stored as JSON in skill_graphs.
 *
 * Same shape as `Curriculum` from engine-manager.ts. Duplicated here to
 * avoid pulling the engine-manager module into the storage layer (keeps
 * the dependency direction one-way: engine-manager → storage).
 */
export interface StoredCurriculum {
  skills: Skill[];
  itemMappings?: ItemSkillMapping[];
  transferTests?: TransferTest[];
}

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  verifyPassword(username: string, password: string): Promise<User | null>;

  // Google OAuth methods
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  createGoogleUser(profile: GoogleUserProfile): Promise<User>;

  // Learning events methods
  createLearningEvent(event: InsertLearningEvent): Promise<LearningEvent>;
  getLearningEvent(id: number): Promise<LearningEvent | undefined>;
  getLearningEventsByUserId(userId: number): Promise<LearningEvent[]>;
  getLearningEventsByType(type: string): Promise<LearningEvent[]>;

  // Core engine state persistence
  saveEngineState(userId: number, state: string): Promise<void>;
  loadEngineState(userId: number): Promise<string | null>;

  // Per-user curriculum (Phase E2). Used by the EngineManager to hydrate
  // an engine on first access for a user.
  saveCurriculum(userId: number, curriculum: StoredCurriculum): Promise<void>;
  loadCurriculum(userId: number): Promise<StoredCurriculum | null>;

  // Admin / mentor methods (Phase H6). listUsers powers the mentor dashboard
  // and CSV export. setUserAdmin is the single seam for promoting a learner
  // to admin — kept narrow so admin-grant can be audited if the seam is
  // touched in code review.
  listUsers(): Promise<User[]>;
  setUserAdmin(userId: number, isAdmin: boolean): Promise<void>;
}

// In-memory storage implementation (used when DATABASE_URL is not set)
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private learningEvents: Map<number, LearningEvent>;
  private engineStates: Map<number, string>;
  private curricula: Map<number, StoredCurriculum>;
  currentUserId: number;
  currentEventId: number;
  private initialized: Promise<void>;

  constructor() {
    this.users = new Map();
    this.learningEvents = new Map();
    this.engineStates = new Map();
    this.curricula = new Map();
    this.currentUserId = 1;
    this.currentEventId = 1;

    // Initialize asynchronously (demo user creation is optional and deferred)
    this.initialized = this.init();
  }

  private async init(): Promise<void> {
    // No default demo user - users should be created via proper registration
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    await this.initialized;
    const id = this.currentUserId++;
    // Hash the password before storing (null for OAuth-only users)
    const hashedPassword = insertUser.password
      ? await bcrypt.hash(insertUser.password, SALT_ROUNDS)
      : null;
    const user: User = {
      ...insertUser,
      id,
      password: hashedPassword,
      email: null,
      googleId: null,
      displayName: null,
      avatarUrl: null,
      isAdmin: false,
    };
    this.users.set(id, user);
    return user;
  }

  async verifyPassword(username: string, password: string): Promise<User | null> {
    await this.initialized;
    const user = await this.getUserByUsername(username);
    if (!user || !user.password) {
      return null;
    }
    const isValid = await bcrypt.compare(password, user.password);
    return isValid ? user : null;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.googleId === googleId);
  }

  async createGoogleUser(profile: GoogleUserProfile): Promise<User> {
    await this.initialized;
    const id = this.currentUserId++;
    const username = profile.email.split('@')[0] + '_' + profile.googleId.slice(-6);
    const user: User = {
      id,
      username,
      password: null,
      email: profile.email,
      googleId: profile.googleId,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl || null,
      isAdmin: false,
    };
    this.users.set(id, user);
    return user;
  }

  // Learning events methods
  async createLearningEvent(insertEvent: InsertLearningEvent): Promise<LearningEvent> {
    const id = this.currentEventId++;
    const event: LearningEvent = {
      ...insertEvent,
      id,
      timestamp: insertEvent.timestamp || new Date(),
    };
    this.learningEvents.set(id, event);
    return event;
  }

  async getLearningEvent(id: number): Promise<LearningEvent | undefined> {
    return this.learningEvents.get(id);
  }

  async getLearningEventsByUserId(userId: number): Promise<LearningEvent[]> {
    return Array.from(this.learningEvents.values()).filter((event) => event.userId === userId);
  }

  async getLearningEventsByType(type: string): Promise<LearningEvent[]> {
    return Array.from(this.learningEvents.values()).filter((event) => event.type === type);
  }

  // Core engine state persistence
  async saveEngineState(userId: number, state: string): Promise<void> {
    this.engineStates.set(userId, state);
  }

  async loadEngineState(userId: number): Promise<string | null> {
    return this.engineStates.get(userId) ?? null;
  }

  // Curriculum (Phase E2)
  async saveCurriculum(userId: number, curriculum: StoredCurriculum): Promise<void> {
    // Defensive deep clone — callers retain their original objects.
    this.curricula.set(userId, JSON.parse(JSON.stringify(curriculum)) as StoredCurriculum);
  }

  async loadCurriculum(userId: number): Promise<StoredCurriculum | null> {
    const stored = this.curricula.get(userId);
    if (!stored) return null;
    return JSON.parse(JSON.stringify(stored)) as StoredCurriculum;
  }

  // Admin / mentor methods (Phase H6)
  async listUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async setUserAdmin(userId: number, isAdmin: boolean): Promise<void> {
    const user = this.users.get(userId);
    if (!user) return;
    this.users.set(userId, { ...user, isAdmin });
  }
}

// PostgreSQL storage implementation (used when DATABASE_URL is set)
export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    if (!db) throw new Error('Database not configured');
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    if (!db) throw new Error('Database not configured');
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    if (!db) throw new Error('Database not configured');
    // Hash the password before storing (null for OAuth-only users)
    const hashedPassword = insertUser.password
      ? await bcrypt.hash(insertUser.password, SALT_ROUNDS)
      : null;
    const [user] = await db
      .insert(users)
      .values({ ...insertUser, password: hashedPassword })
      .returning();
    return user;
  }

  async verifyPassword(username: string, password: string): Promise<User | null> {
    const user = await this.getUserByUsername(username);
    if (!user || !user.password) {
      return null;
    }
    const isValid = await bcrypt.compare(password, user.password);
    return isValid ? user : null;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    if (!db) throw new Error('Database not configured');
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
    return user;
  }

  async createGoogleUser(profile: GoogleUserProfile): Promise<User> {
    if (!db) throw new Error('Database not configured');
    const username = profile.email.split('@')[0] + '_' + profile.googleId.slice(-6);
    const [user] = await db
      .insert(users)
      .values({
        username,
        password: null,
        email: profile.email,
        googleId: profile.googleId,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl || null,
      })
      .returning();
    return user;
  }

  // Learning events methods
  async createLearningEvent(insertEvent: InsertLearningEvent): Promise<LearningEvent> {
    if (!db) throw new Error('Database not configured');
    const [event] = await db
      .insert(learningEvents)
      .values({
        userId: insertEvent.userId,
        type: insertEvent.type,
        data: insertEvent.data,
        timestamp: insertEvent.timestamp || new Date(),
      })
      .returning();
    return event;
  }

  async getLearningEvent(id: number): Promise<LearningEvent | undefined> {
    if (!db) throw new Error('Database not configured');
    const [event] = await db.select().from(learningEvents).where(eq(learningEvents.id, id));
    return event;
  }

  async getLearningEventsByUserId(userId: number): Promise<LearningEvent[]> {
    if (!db) throw new Error('Database not configured');
    return db.select().from(learningEvents).where(eq(learningEvents.userId, userId));
  }

  async getLearningEventsByType(type: string): Promise<LearningEvent[]> {
    if (!db) throw new Error('Database not configured');
    return db.select().from(learningEvents).where(eq(learningEvents.type, type));
  }

  // Core engine state persistence
  async saveEngineState(userId: number, state: string): Promise<void> {
    if (!db) throw new Error('Database not configured');
    // Upsert: insert or update on conflict
    await db
      .insert(engineStates)
      .values({ userId, state, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: engineStates.userId,
        set: { state, updatedAt: new Date() },
      });
  }

  async loadEngineState(userId: number): Promise<string | null> {
    if (!db) throw new Error('Database not configured');
    const [row] = await db.select().from(engineStates).where(eq(engineStates.userId, userId));
    return row?.state ?? null;
  }

  // Curriculum (Phase E2)
  async saveCurriculum(userId: number, curriculum: StoredCurriculum): Promise<void> {
    if (!db) throw new Error('Database not configured');
    await db
      .insert(skillGraphs)
      .values({
        userId,
        skills: curriculum.skills,
        itemMappings: curriculum.itemMappings ?? null,
        transferTests: curriculum.transferTests ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: skillGraphs.userId,
        set: {
          skills: curriculum.skills,
          itemMappings: curriculum.itemMappings ?? null,
          transferTests: curriculum.transferTests ?? null,
          updatedAt: new Date(),
        },
      });
  }

  async loadCurriculum(userId: number): Promise<StoredCurriculum | null> {
    if (!db) throw new Error('Database not configured');
    const [row] = await db.select().from(skillGraphs).where(eq(skillGraphs.userId, userId));
    if (!row) return null;
    return {
      skills: row.skills as Skill[],
      itemMappings: (row.itemMappings as ItemSkillMapping[] | null) ?? undefined,
      transferTests: (row.transferTests as TransferTest[] | null) ?? undefined,
    };
  }

  // Admin / mentor methods (Phase H6)
  async listUsers(): Promise<User[]> {
    if (!db) throw new Error('Database not configured');
    return db.select().from(users);
  }

  async setUserAdmin(userId: number, isAdmin: boolean): Promise<void> {
    if (!db) throw new Error('Database not configured');
    await db.update(users).set({ isAdmin }).where(eq(users.id, userId));
  }
}

/**
 * Storage configuration options
 */
export interface StorageOptions {
  /** Logger instance (default: uses getLogger()) */
  logger?: Logger;
  /** Force in-memory storage even if database is configured (for testing) */
  forceMemory?: boolean;
}

// Storage factory with options
function createStorage(options: StorageOptions = {}): IStorage {
  const log = options.logger ?? getLogger();

  // Priority: SQLite > PostgreSQL > Memory
  const useSqlite = !!process.env.SQLITE_PATH && !options.forceMemory;
  const useDatabase = isDatabaseConfigured && !options.forceMemory && !useSqlite;

  if (useSqlite) {
    log.info(`Using SQLite storage at ${process.env.SQLITE_PATH}`, { module: 'storage' });
    return new SqliteStorage(process.env.SQLITE_PATH);
  } else if (useDatabase) {
    log.info('Using PostgreSQL database storage', { module: 'storage' });
    return new DatabaseStorage();
  } else {
    log.info('Using in-memory storage (data will not persist across restarts)', {
      module: 'storage',
    });
    return new MemStorage();
  }
}

// Singleton management
let storageInstance: IStorage | null = null;
let storageOptions: StorageOptions = {};

/**
 * Configure storage before first access.
 */
export function configureStorage(options: StorageOptions): void {
  storageOptions = options;
  storageInstance = null;
}

/**
 * Get the storage instance (creates on first access).
 */
export function getStorage(): IStorage {
  if (!storageInstance) {
    storageInstance = createStorage(storageOptions);
  }
  return storageInstance;
}

/**
 * Reset the storage singleton (for testing)
 */
export function resetStorage(): void {
  storageInstance = null;
  storageOptions = {};
}

// Default instance for convenience (uses getter internally)
export const storage = new Proxy({} as IStorage, {
  get(_target, prop) {
    const instance = getStorage();
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    // Bind methods to preserve 'this' context
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
});
