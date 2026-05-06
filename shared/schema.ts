import {
  pgTable,
  text,
  serial,
  integer,
  jsonb,
  timestamp,
  index,
  boolean,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Users table — columns match SQLite schema in sqlite-storage.ts
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  password: text('password'), // nullable: Google OAuth users have no password
  email: text('email'),
  googleId: text('google_id').unique(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  // Admin flag (Phase H6) — false by default. Promoted via storage.setUserAdmin.
  // Used by requireAdmin middleware to gate /api/mentor and /api/admin routes.
  isAdmin: boolean('is_admin').notNull().default(false),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Learning events table for tracking learning history
export const learningEvents = pgTable(
  'learning_events',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // 'attention', 'mastery', 'recommendation', 'engagement', etc.
    data: jsonb('data').notNull(), // JSON data specific to the event type
    timestamp: timestamp('timestamp').notNull().defaultNow(),
  },
  (table) => [
    index('learning_events_user_id_idx').on(table.userId),
    index('learning_events_type_idx').on(table.type),
    index('learning_events_timestamp_idx').on(table.timestamp),
  ]
);

export const insertLearningEventSchema = createInsertSchema(learningEvents).pick({
  userId: true,
  type: true,
  data: true,
  timestamp: true,
});

// Learning event data types for type safety
export interface LearningEventData {
  context?: string;
  attentionScore?: number;
  recommendation?: string;
  intervention?: string;
  objectiveId?: string;
  progress?: number;
  result?: number;
  [key: string]: string | number | boolean | undefined;
}

export type InsertLearningEvent = {
  userId: number;
  type: string;
  data: LearningEventData;
  timestamp?: Date;
};

export type LearningEvent = typeof learningEvents.$inferSelect;

// Learning objectives for tracking mastery
export const learningObjectives = pgTable(
  'learning_objectives',
  {
    id: serial('id').primaryKey(),
    objectiveId: text('objective_id').notNull().unique(), // External ID used by SDK
    name: text('name').notNull(),
    description: text('description'),
  },
  (table) => [index('learning_objectives_name_idx').on(table.name)]
);

export const insertLearningObjectiveSchema = createInsertSchema(learningObjectives).pick({
  objectiveId: true,
  name: true,
  description: true,
});

export type InsertLearningObjective = z.infer<typeof insertLearningObjectiveSchema>;
export type LearningObjective = typeof learningObjectives.$inferSelect;

// Mastery tracking by user and objective
export const masteryProgress = pgTable(
  'mastery_progress',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    objectiveId: text('objective_id')
      .notNull()
      .references(() => learningObjectives.objectiveId, { onDelete: 'cascade' }),
    progress: jsonb('progress').notNull(), // Stores progress data including score, attempts, dates
    lastUpdated: timestamp('last_updated').notNull().defaultNow(),
  },
  (table) => [
    index('mastery_progress_user_id_idx').on(table.userId),
    index('mastery_progress_objective_id_idx').on(table.objectiveId),
    index('mastery_progress_user_objective_idx').on(table.userId, table.objectiveId),
  ]
);

export const insertMasteryProgressSchema = createInsertSchema(masteryProgress).pick({
  userId: true,
  objectiveId: true,
  progress: true,
  lastUpdated: true,
});

export type InsertMasteryProgress = z.infer<typeof insertMasteryProgressSchema>;
export type MasteryProgress = typeof masteryProgress.$inferSelect;

// Core engine state persistence (one row per user, upserted on save)
export const engineStates = pgTable(
  'engine_states',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    state: text('state').notNull(), // JSON string from engine.exportState()
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [index('engine_states_user_id_idx').on(table.userId)]
);

export type EngineState = typeof engineStates.$inferSelect;

// Per-user skill graph + item mappings + transfer tests (one row per user,
// upserted on save). Used by the server-side EngineManager (Phase E2) so the
// engine can be hydrated and the planner can reason about a real curriculum.
export const skillGraphs = pgTable(
  'skill_graphs',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    skills: jsonb('skills').notNull(), // Skill[]
    itemMappings: jsonb('item_mappings'), // ItemSkillMapping[] | null
    transferTests: jsonb('transfer_tests'), // TransferTest[] | null
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [index('skill_graphs_user_id_idx').on(table.userId)]
);

export type SkillGraphRow = typeof skillGraphs.$inferSelect;

// System-wide curriculum (Phase H7) — a single row keyed by id=1 holding the
// admin-authored skills/items/transferTests. Distinct from per-user
// skill_graphs so an admin can edit the template without touching any
// learner's actual graph. Engines today still pull per-user; promoting the
// system curriculum to seed new learners is a follow-up.
export const systemCurriculum = pgTable('system_curriculum', {
  id: serial('id').primaryKey(),
  skills: jsonb('skills').notNull(),
  itemMappings: jsonb('item_mappings'),
  transferTests: jsonb('transfer_tests'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type SystemCurriculumRow = typeof systemCurriculum.$inferSelect;
