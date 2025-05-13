import { pgTable, text, serial, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
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
  userId: integer("user_id").notNull(),
  type: text("type").notNull(), // 'attention', 'mastery', 'recommendation', 'engagement', etc.
  data: jsonb("data").notNull(), // JSON data specific to the event type
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertLearningEventSchema = createInsertSchema(learningEvents).pick({
  userId: true,
  type: true,
  data: true,
  timestamp: true,
});

export type InsertLearningEvent = {
  userId: number;
  type: string;
  data: Record<string, any>;
  timestamp?: Date;
};

export type LearningEvent = typeof learningEvents.$inferSelect;

// Learning objectives for tracking mastery
export const learningObjectives = pgTable("learning_objectives", {
  id: serial("id").primaryKey(),
  objectiveId: text("objective_id").notNull().unique(), // External ID used by SDK
  name: text("name").notNull(),
  description: text("description"),
});

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
  userId: integer("user_id").notNull(),
  objectiveId: text("objective_id").notNull(), // References learningObjectives.objectiveId
  progress: jsonb("progress").notNull(), // Stores progress data including score, attempts, dates
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
});

export const insertMasteryProgressSchema = createInsertSchema(masteryProgress).pick({
  userId: true,
  objectiveId: true,
  progress: true,
  lastUpdated: true,
});

export type InsertMasteryProgress = z.infer<typeof insertMasteryProgressSchema>;
export type MasteryProgress = typeof masteryProgress.$inferSelect;
