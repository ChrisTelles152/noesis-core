/**
 * SQLite Storage Implementation
 * Drop-in replacement for DatabaseStorage using better-sqlite3.
 * Implements the same IStorage interface.
 */

import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import path from 'path';
import fs from 'fs';
import type {
  User,
  InsertUser,
  LearningEvent,
  InsertLearningEvent,
  LearningEventData,
} from '@shared/schema';
import type { IStorage } from './storage';

const SALT_ROUNDS = 12;

export class SqliteStorage implements IStorage {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'noesis.sqlite');

    // Ensure data directory exists
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(resolvedPath);

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.initTables();
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS learning_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_learning_events_user_id ON learning_events(user_id);
      CREATE INDEX IF NOT EXISTS idx_learning_events_type ON learning_events(type);
      CREATE INDEX IF NOT EXISTS idx_learning_events_timestamp ON learning_events(timestamp);

      CREATE TABLE IF NOT EXISTS learning_objectives (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        objective_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_learning_objectives_name ON learning_objectives(name);

      CREATE TABLE IF NOT EXISTS mastery_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        objective_id TEXT NOT NULL REFERENCES learning_objectives(objective_id) ON DELETE CASCADE,
        progress TEXT NOT NULL,
        last_updated TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_mastery_progress_user_id ON mastery_progress(user_id);
      CREATE INDEX IF NOT EXISTS idx_mastery_progress_objective_id ON mastery_progress(objective_id);
      CREATE INDEX IF NOT EXISTS idx_mastery_progress_user_objective ON mastery_progress(user_id, objective_id);
    `);
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
    return row;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const row = this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
    return row;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const hashedPassword = await bcrypt.hash(insertUser.password, SALT_ROUNDS);
    const result = this.db.prepare(
      'INSERT INTO users (username, password) VALUES (?, ?)'
    ).run(insertUser.username, hashedPassword);

    return {
      id: result.lastInsertRowid as number,
      username: insertUser.username,
      password: hashedPassword,
    };
  }

  async verifyPassword(username: string, password: string): Promise<User | null> {
    const user = await this.getUserByUsername(username);
    if (!user) return null;
    const isValid = await bcrypt.compare(password, user.password);
    return isValid ? user : null;
  }

  // Learning events methods
  async createLearningEvent(insertEvent: InsertLearningEvent): Promise<LearningEvent> {
    const timestamp = insertEvent.timestamp || new Date();
    const dataJson = JSON.stringify(insertEvent.data);

    const result = this.db.prepare(
      'INSERT INTO learning_events (user_id, type, data, timestamp) VALUES (?, ?, ?, ?)'
    ).run(insertEvent.userId, insertEvent.type, dataJson, timestamp.toISOString());

    return {
      id: result.lastInsertRowid as number,
      userId: insertEvent.userId,
      type: insertEvent.type,
      data: insertEvent.data as LearningEventData,
      timestamp,
    };
  }

  async getLearningEvent(id: number): Promise<LearningEvent | undefined> {
    const row = this.db.prepare('SELECT * FROM learning_events WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return this.mapEvent(row);
  }

  async getLearningEventsByUserId(userId: number): Promise<LearningEvent[]> {
    const rows = this.db.prepare('SELECT * FROM learning_events WHERE user_id = ?').all(userId) as any[];
    return rows.map(this.mapEvent);
  }

  async getLearningEventsByType(type: string): Promise<LearningEvent[]> {
    const rows = this.db.prepare('SELECT * FROM learning_events WHERE type = ?').all(type) as any[];
    return rows.map(this.mapEvent);
  }

  private mapEvent(row: any): LearningEvent {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
      timestamp: new Date(row.timestamp),
    };
  }

  close(): void {
    this.db.close();
  }
}
