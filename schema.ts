import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, datetime, boolean } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Tasks table for task management system.
 * Stores all tasks with status, priority, and assignment information.
 */
export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["todo", "in-progress", "completed"]).default("todo").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high"]).default("medium").notNull(),
  createdBy: int("createdBy").notNull(),
  assignedTo: int("assignedTo"),
  dueDate: datetime("dueDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

/**
 * Task assignments table for tracking task assignments to users.
 * Supports multiple assignees per task if needed.
 */
export const taskAssignments = mysqlTable("taskAssignments", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  userId: int("userId").notNull(),
  assignedAt: timestamp("assignedAt").defaultNow().notNull(),
  assignedBy: int("assignedBy").notNull(),
});

export type TaskAssignment = typeof taskAssignments.$inferSelect;
export type InsertTaskAssignment = typeof taskAssignments.$inferInsert;

/**
 * Task audit log table for tracking changes to tasks.
 * Useful for compliance, debugging, and understanding task history.
 */
export const taskAuditLogs = mysqlTable("taskAuditLogs", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  userId: int("userId").notNull(),
  action: varchar("action", { length: 50 }).notNull(), // 'created', 'updated', 'status_changed', 'assigned'
  oldValue: text("oldValue"),
  newValue: text("newValue"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TaskAuditLog = typeof taskAuditLogs.$inferSelect;
export type InsertTaskAuditLog = typeof taskAuditLogs.$inferInsert;

/**
 * Relations for better type safety and querying.
 */
export const usersRelations = relations(users, ({ many }) => ({
  createdTasks: many(tasks, { relationName: "createdBy" }),
  assignedTasks: many(tasks, { relationName: "assignedTo" }),
  assignments: many(taskAssignments),
  auditLogs: many(taskAuditLogs),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  creator: one(users, {
    fields: [tasks.createdBy],
    references: [users.id],
    relationName: "createdBy",
  }),
  assignee: one(users, {
    fields: [tasks.assignedTo],
    references: [users.id],
    relationName: "assignedTo",
  }),
  assignments: many(taskAssignments),
  auditLogs: many(taskAuditLogs),
}));

export const taskAssignmentsRelations = relations(taskAssignments, ({ one }) => ({
  task: one(tasks, {
    fields: [taskAssignments.taskId],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [taskAssignments.userId],
    references: [users.id],
  }),
  assignedByUser: one(users, {
    fields: [taskAssignments.assignedBy],
    references: [users.id],
  }),
}));

export const taskAuditLogsRelations = relations(taskAuditLogs, ({ one }) => ({
  task: one(tasks, {
    fields: [taskAuditLogs.taskId],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [taskAuditLogs.userId],
    references: [users.id],
  }),
}));