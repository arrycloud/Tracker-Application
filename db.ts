import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, tasks, InsertTask, taskAuditLogs, InsertTaskAuditLog } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Get user by ID.
 */
export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Get all tasks with optional filtering and sorting.
 */
export async function getTasks({
  status,
  assignedTo,
  priority,
  createdBy,
  sortBy = "createdAt",
  sortOrder = "DESC",
}: {
  status?: string;
  assignedTo?: number;
  priority?: string;
  createdBy?: number;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
} = {}) {
  const db = await getDb();
  if (!db) return [];

  const conditions: any[] = [];

  if (status) conditions.push(eq(tasks.status, status as any));
  if (assignedTo !== undefined) conditions.push(eq(tasks.assignedTo, assignedTo));
  if (priority) conditions.push(eq(tasks.priority, priority as any));
  if (createdBy !== undefined) conditions.push(eq(tasks.createdBy, createdBy));

  if (conditions.length > 0) {
    return db.select().from(tasks).where(and(...conditions));
  }

  return db.select().from(tasks);
}

/**
 * Get a single task by ID.
 */
export async function getTaskById(taskId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Create a new task.
 */
export async function createTask(task: InsertTask) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(tasks).values(task);
  return result;
}

/**
 * Update an existing task.
 */
export async function updateTask(taskId: number, updates: Partial<InsertTask>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.update(tasks).set(updates).where(eq(tasks.id, taskId));
  return result;
}

/**
 * Delete a task.
 */
export async function deleteTask(taskId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.delete(tasks).where(eq(tasks.id, taskId));
  return result;
}

/**
 * Get task statistics for dashboard.
 */
export async function getTaskStatistics(userId?: number) {
  const db = await getDb();
  if (!db) return { total: 0, todo: 0, inProgress: 0, completed: 0 };

  const allTasks = await db.select().from(tasks);
  const userTasks = userId ? allTasks.filter((t) => t.createdBy === userId || t.assignedTo === userId) : allTasks;

  return {
    total: userTasks.length,
    todo: userTasks.filter((t) => t.status === "todo").length,
    inProgress: userTasks.filter((t) => t.status === "in-progress").length,
    completed: userTasks.filter((t) => t.status === "completed").length,
  };
}

/**
 * Get all users for assignment.
 */
export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(users);
}

/**
 * Create audit log entry.
 */
export async function createAuditLog(log: InsertTaskAuditLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.insert(taskAuditLogs).values(log);
}

// TODO: add more feature queries as needed
