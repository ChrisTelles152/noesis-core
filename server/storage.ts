import bcrypt from "bcrypt";
import { users, type User, type InsertUser, learningEvents, type LearningEvent, type InsertLearningEvent } from "@shared/schema";

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

export const storage = new MemStorage();
