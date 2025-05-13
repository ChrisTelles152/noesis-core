import { users, type User, type InsertUser, learningEvents, type LearningEvent, type InsertLearningEvent } from "@shared/schema";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
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

  constructor() {
    this.users = new Map();
    this.learningEvents = new Map();
    this.currentUserId = 1;
    this.currentEventId = 1;
    
    // Create a default user for the demo
    this.createUser({
      username: "demo_user",
      password: "password123"
    });
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
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
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
