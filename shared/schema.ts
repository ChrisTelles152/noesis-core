import { pgTable, text, serial, integer, boolean, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Learning events table for tracking learning history
export const learningEvents = pgTable("learning_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'attention', 'mastery', 'recommendation', 'engagement', etc.
  data: jsonb("data").notNull(), // JSON data specific to the event type
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (table) => [
  index("learning_events_user_id_idx").on(table.userId),
  index("learning_events_type_idx").on(table.type),
  index("learning_events_timestamp_idx").on(table.timestamp),
]);

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
export const learningObjectives = pgTable("learning_objectives", {
  id: serial("id").primaryKey(),
  objectiveId: text("objective_id").notNull().unique(), // External ID used by SDK
  name: text("name").notNull(),
  description: text("description"),
}, (table) => [
  index("learning_objectives_name_idx").on(table.name),
]);

export const insertLearningObjectiveSchema = createInsertSchema(learningObjectives).pick({
  objectiveId: true,
  name: true,
  description: true,
});

export type InsertLearningObjective = z.infer<typeof insertLearningObjectiveSchema>;
export type LearningObjective = typeof learningObjectives.$inferSelect;

// Mastery tracking by user and objective
export const masteryProgress = pgTable("mastery_progress", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  objectiveId: text("objective_id").notNull().references(() => learningObjectives.objectiveId, { onDelete: "cascade" }),
  progress: jsonb("progress").notNull(), // Stores progress data including score, attempts, dates
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
}, (table) => [
  index("mastery_progress_user_id_idx").on(table.userId),
  index("mastery_progress_objective_id_idx").on(table.objectiveId),
  index("mastery_progress_user_objective_idx").on(table.userId, table.objectiveId),
]);

export const insertMasteryProgressSchema = createInsertSchema(masteryProgress).pick({
  userId: true,
  objectiveId: true,
  progress: true,
  lastUpdated: true,
});

export type InsertMasteryProgress = z.infer<typeof insertMasteryProgressSchema>;
export type MasteryProgress = typeof masteryProgress.$inferSelect;
