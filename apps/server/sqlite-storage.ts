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
import type { IStorage, StoredCurriculum } from './storage';
import type { Skill, ItemSkillMapping, TransferTest } from '@noesis-edu/core';

const SALT_ROUNDS = 12;

/** Raw row shape from SQLite learning_events table */
interface SqliteLearningEventRow {
  id: number;
  user_id: number;
  type: string;
  data: string;
  timestamp: string;
}

export class SqliteStorage implements IStorage {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath =
      dbPath || process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'noesis.sqlite');

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
        password TEXT,
        email TEXT,
        google_id TEXT UNIQUE,
        display_name TEXT,
        avatar_url TEXT,
        is_admin INTEGER NOT NULL DEFAULT 0
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

      CREATE TABLE IF NOT EXISTS engine_states (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        state TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_engine_states_user_id ON engine_states(user_id);

      CREATE TABLE IF NOT EXISTS skill_graphs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        skills TEXT NOT NULL,
        item_mappings TEXT,
        transfer_tests TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_skill_graphs_user_id ON skill_graphs(user_id);
    `);

    // Idempotent migration for `is_admin` (Phase H6). Older databases
    // created before this column existed need it added without losing data.
    // SQLite's ALTER TABLE ADD COLUMN throws if the column already exists,
    // so we probe via PRAGMA first.
    const userColumns = this.db.prepare("PRAGMA table_info(users)").all() as Array<{
      name: string;
    }>;
    if (!userColumns.some((c) => c.name === 'is_admin')) {
      this.db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
    }
  }

  /**
   * Map a raw SQLite row (snake_case columns) into the camelCase User type.
   * Older read paths in this file return rows without remapping — callers of
   * those methods only touch fields whose names happen to be snake_case-safe
   * (id, username, password). New methods + any path that needs is_admin
   * MUST go through this helper.
   */
  private mapUserRow(row: Record<string, unknown>): User {
    return {
      id: row.id as number,
      username: row.username as string,
      password: (row.password as string | null) ?? null,
      email: (row.email as string | null) ?? null,
      googleId: (row.google_id as string | null) ?? null,
      displayName: (row.display_name as string | null) ?? null,
      avatarUrl: (row.avatar_url as string | null) ?? null,
      isAdmin: row.is_admin === 1 || row.is_admin === true,
    };
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.mapUserRow(row) : undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const row = this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as
      | Record<string, unknown>
      | undefined;
    return row ? this.mapUserRow(row) : undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const hashedPassword = insertUser.password
      ? await bcrypt.hash(insertUser.password, SALT_ROUNDS)
      : null;
    const result = this.db
      .prepare('INSERT INTO users (username, password) VALUES (?, ?)')
      .run(insertUser.username, hashedPassword);

    return {
      id: result.lastInsertRowid as number,
      username: insertUser.username,
      password: hashedPassword,
      email: null,
      googleId: null,
      displayName: null,
      avatarUrl: null,
      isAdmin: false,
    };
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const row = this.db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId) as
      | Record<string, unknown>
      | undefined;
    return row ? this.mapUserRow(row) : undefined;
  }

  async createGoogleUser(profile: {
    googleId: string;
    email: string;
    displayName: string;
    avatarUrl?: string;
  }): Promise<User> {
    const username = profile.email.split('@')[0] + '_' + profile.googleId.slice(-6);
    const result = this.db
      .prepare(
        'INSERT INTO users (username, password, email, google_id, display_name, avatar_url) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        username,
        null,
        profile.email,
        profile.googleId,
        profile.displayName,
        profile.avatarUrl || null
      );

    return {
      id: result.lastInsertRowid as number,
      username,
      password: null,
      email: profile.email,
      googleId: profile.googleId,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl || null,
      isAdmin: false,
    };
  }

  async linkGoogleAccount(userId: number, googleId: string, email: string): Promise<void> {
    this.db
      .prepare('UPDATE users SET google_id = ?, email = ? WHERE id = ?')
      .run(googleId, email, userId);
  }

  async verifyPassword(username: string, password: string): Promise<User | null> {
    const user = await this.getUserByUsername(username);
    if (!user || !user.password) return null;
    const isValid = await bcrypt.compare(password, user.password);
    return isValid ? user : null;
  }

  // Learning events methods
  async createLearningEvent(insertEvent: InsertLearningEvent): Promise<LearningEvent> {
    const timestamp = insertEvent.timestamp || new Date();
    const dataJson = JSON.stringify(insertEvent.data);

    const result = this.db
      .prepare('INSERT INTO learning_events (user_id, type, data, timestamp) VALUES (?, ?, ?, ?)')
      .run(insertEvent.userId, insertEvent.type, dataJson, timestamp.toISOString());

    return {
      id: result.lastInsertRowid as number,
      userId: insertEvent.userId,
      type: insertEvent.type,
      data: insertEvent.data as LearningEventData,
      timestamp,
    };
  }

  async getLearningEvent(id: number): Promise<LearningEvent | undefined> {
    const row = this.db.prepare('SELECT * FROM learning_events WHERE id = ?').get(id) as
      | SqliteLearningEventRow
      | undefined;
    if (!row) return undefined;
    return this.mapEvent(row);
  }

  async getLearningEventsByUserId(userId: number): Promise<LearningEvent[]> {
    const rows = this.db
      .prepare('SELECT * FROM learning_events WHERE user_id = ?')
      .all(userId) as SqliteLearningEventRow[];
    return rows.map(this.mapEvent);
  }

  async getLearningEventsByType(type: string): Promise<LearningEvent[]> {
    const rows = this.db
      .prepare('SELECT * FROM learning_events WHERE type = ?')
      .all(type) as SqliteLearningEventRow[];
    return rows.map(this.mapEvent);
  }

  private mapEvent(row: SqliteLearningEventRow): LearningEvent {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
      timestamp: new Date(row.timestamp),
    };
  }

  // Core engine state persistence
  async saveEngineState(userId: number, state: string): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO engine_states (user_id, state, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET state = excluded.state, updated_at = datetime('now')`
      )
      .run(userId, state);
  }

  async loadEngineState(userId: number): Promise<string | null> {
    const row = this.db.prepare('SELECT state FROM engine_states WHERE user_id = ?').get(userId) as
      | { state: string }
      | undefined;
    return row?.state ?? null;
  }

  // Curriculum (Phase E2)
  async saveCurriculum(userId: number, curriculum: StoredCurriculum): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO skill_graphs (user_id, skills, item_mappings, transfer_tests, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET
           skills = excluded.skills,
           item_mappings = excluded.item_mappings,
           transfer_tests = excluded.transfer_tests,
           updated_at = datetime('now')`
      )
      .run(
        userId,
        JSON.stringify(curriculum.skills),
        curriculum.itemMappings ? JSON.stringify(curriculum.itemMappings) : null,
        curriculum.transferTests ? JSON.stringify(curriculum.transferTests) : null
      );
  }

  async loadCurriculum(userId: number): Promise<StoredCurriculum | null> {
    const row = this.db
      .prepare('SELECT skills, item_mappings, transfer_tests FROM skill_graphs WHERE user_id = ?')
      .get(userId) as { skills: string; item_mappings: string | null; transfer_tests: string | null } | undefined;
    if (!row) return null;
    return {
      skills: JSON.parse(row.skills) as Skill[],
      itemMappings: row.item_mappings ? (JSON.parse(row.item_mappings) as ItemSkillMapping[]) : undefined,
      transferTests: row.transfer_tests ? (JSON.parse(row.transfer_tests) as TransferTest[]) : undefined,
    };
  }

  // Admin / mentor methods (Phase H6)
  async listUsers(): Promise<User[]> {
    const rows = this.db
      .prepare('SELECT * FROM users ORDER BY id')
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapUserRow(r));
  }

  async setUserAdmin(userId: number, isAdmin: boolean): Promise<void> {
    this.db
      .prepare('UPDATE users SET is_admin = ? WHERE id = ?')
      .run(isAdmin ? 1 : 0, userId);
  }

  close(): void {
    this.db.close();
  }
}
