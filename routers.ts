import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  getTaskStatistics,
  getAllUsers,
  createAuditLog,
} from "./db";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  task: router({
    list: publicProcedure
      .input(
        z.object({
          status: z.enum(["todo", "in-progress", "completed"]).optional(),
          assignedTo: z.number().optional(),
          priority: z.enum(["low", "medium", "high"]).optional(),
          createdBy: z.number().optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        const taskList = await getTasks({
          status: input.status,
          assignedTo: input.assignedTo,
          priority: input.priority,
          createdBy: input.createdBy,
        });

        if (!ctx.user || ctx.user.role !== "admin") {
          return taskList.filter(
            (t) => t.createdBy === ctx.user?.id || t.assignedTo === ctx.user?.id
          );
        }

        return taskList;
      }),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const task = await getTaskById(input.id);
        if (!task) throw new TRPCError({ code: "NOT_FOUND" });

        if (
          ctx.user?.role !== "admin" &&
          task.createdBy !== ctx.user?.id &&
          task.assignedTo !== ctx.user?.id
        ) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        return task;
      }),

    create: protectedProcedure
      .input(
        z.object({
          title: z.string().min(1).max(255),
          description: z.string().optional(),
          priority: z.enum(["low", "medium", "high"]).default("medium"),
          dueDate: z.date().optional(),
          assignedTo: z.number().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await createTask({
          title: input.title,
          description: input.description,
          priority: input.priority,
          dueDate: input.dueDate,
          assignedTo: input.assignedTo,
          createdBy: ctx.user.id,
          status: "todo",
        });

        const taskId = (result as any).insertId;
        if (taskId) {
          await createAuditLog({
            taskId: taskId as number,
            userId: ctx.user.id,
            action: "created",
            newValue: JSON.stringify(input),
          });
        }

        return result;
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          title: z.string().min(1).max(255).optional(),
          description: z.string().optional(),
          status: z.enum(["todo", "in-progress", "completed"]).optional(),
          priority: z.enum(["low", "medium", "high"]).optional(),
          dueDate: z.date().optional(),
          assignedTo: z.number().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const task = await getTaskById(input.id);
        if (!task) throw new TRPCError({ code: "NOT_FOUND" });

        if (ctx.user.role !== "admin" && task.createdBy !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const { id, ...updates } = input;
        const result = await updateTask(id, updates);

        await createAuditLog({
          taskId: id,
          userId: ctx.user.id,
          action: "updated",
          oldValue: JSON.stringify(task),
          newValue: JSON.stringify(updates),
        });

        return result;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const task = await getTaskById(input.id);
        if (!task) throw new TRPCError({ code: "NOT_FOUND" });

        if (ctx.user.role !== "admin" && task.createdBy !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        await createAuditLog({
          taskId: input.id,
          userId: ctx.user.id,
          action: "deleted",
          oldValue: JSON.stringify(task),
        });

        return deleteTask(input.id);
      }),

    stats: publicProcedure.query(async ({ ctx }) => {
      return getTaskStatistics(ctx.user?.id);
    }),

    users: publicProcedure.query(async () => {
      return getAllUsers();
    }),
  }),
});

export type AppRouter = typeof appRouter;
