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

import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import {
  users,
  learningEvents,
  type User,
  type InsertUser,
  type LearningEvent,
  type InsertLearningEvent
} from "@shared/schema";
import { db, isDatabaseConfigured } from "./db";
import { getLogger, type Logger } from "./logger";

const SALT_ROUNDS = 12;

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  verifyPassword(username: string, password: string): Promise<User | null>;

  // Learning events methods
  createLearningEvent(event: InsertLearningEvent): Promise<LearningEvent>;
  getLearningEvent(id: number): Promise<LearningEvent | undefined>;
  getLearningEventsByUserId(userId: number): Promise<LearningEvent[]>;
  getLearningEventsByType(type: string): Promise<LearningEvent[]>;
}

// In-memory storage implementation (used when DATABASE_URL is not set)
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private learningEvents: Map<number, LearningEvent>;
  currentUserId: number;
  currentEventId: number;
  private initialized: Promise<void>;

  constructor() {
    this.users = new Map();
    this.learningEvents = new Map();
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
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    await this.initialized;
    const id = this.currentUserId++;
    // Hash the password before storing
    const hashedPassword = await bcrypt.hash(insertUser.password, SALT_ROUNDS);
    const user: User = { ...insertUser, id, password: hashedPassword };
    this.users.set(id, user);
    // Return user without exposing the hashed password in logs
    return user;
  }

  async verifyPassword(username: string, password: string): Promise<User | null> {
    await this.initialized;
    const user = await this.getUserByUsername(username);
    if (!user) {
      return null;
    }
    const isValid = await bcrypt.compare(password, user.password);
    return isValid ? user : null;
  }

  // Learning events methods
  async createLearningEvent(insertEvent: InsertLearningEvent): Promise<LearningEvent> {
    const id = this.currentEventId++;
    const event: LearningEvent = {
      ...insertEvent,
      id,
      timestamp: insertEvent.timestamp || new Date()
    };
    this.learningEvents.set(id, event);
    return event;
  }

  async getLearningEvent(id: number): Promise<LearningEvent | undefined> {
    return this.learningEvents.get(id);
  }

  async getLearningEventsByUserId(userId: number): Promise<LearningEvent[]> {
    return Array.from(this.learningEvents.values()).filter(
      (event) => event.userId === userId
    );
  }

  async getLearningEventsByType(type: string): Promise<LearningEvent[]> {
    return Array.from(this.learningEvents.values()).filter(
      (event) => event.type === type
    );
  }
}

// PostgreSQL storage implementation (used when DATABASE_URL is set)
export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    if (!db) throw new Error("Database not configured");
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    if (!db) throw new Error("Database not configured");
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    if (!db) throw new Error("Database not configured");
    // Hash the password before storing
    const hashedPassword = await bcrypt.hash(insertUser.password, SALT_ROUNDS);
    const [user] = await db
      .insert(users)
      .values({ ...insertUser, password: hashedPassword })
      .returning();
    return user;
  }

  async verifyPassword(username: string, password: string): Promise<User | null> {
    const user = await this.getUserByUsername(username);
    if (!user) {
      return null;
    }
    const isValid = await bcrypt.compare(password, user.password);
    return isValid ? user : null;
  }

  // Learning events methods
  async createLearningEvent(insertEvent: InsertLearningEvent): Promise<LearningEvent> {
    if (!db) throw new Error("Database not configured");
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
    if (!db) throw new Error("Database not configured");
    const [event] = await db
      .select()
      .from(learningEvents)
      .where(eq(learningEvents.id, id));
    return event;
  }

  async getLearningEventsByUserId(userId: number): Promise<LearningEvent[]> {
    if (!db) throw new Error("Database not configured");
    return db
      .select()
      .from(learningEvents)
      .where(eq(learningEvents.userId, userId));
  }

  async getLearningEventsByType(type: string): Promise<LearningEvent[]> {
    if (!db) throw new Error("Database not configured");
    return db
      .select()
      .from(learningEvents)
      .where(eq(learningEvents.type, type));
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
  const useDatabase = isDatabaseConfigured && !options.forceMemory;

  if (useDatabase) {
    log.info("Using PostgreSQL database storage", { module: "storage" });
    return new DatabaseStorage();
  } else {
    log.info("Using in-memory storage (data will not persist across restarts)", { module: "storage" });
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
