import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, Plus, Edit2, Trash2 } from "lucide-react";
import { useLocation } from "wouter";

export default function Tasks() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"todo" | "in-progress" | "completed" | undefined>();
  const [priority, setPriority] = useState<"low" | "medium" | "high" | undefined>();

  const { data: tasks, isLoading } = trpc.task.list.useQuery({
    status,
    priority,
  });

  const deleteTaskMutation = trpc.task.delete.useMutation({
    onSuccess: () => {
      trpc.useUtils().task.list.invalidate();
    },
  });

  const getPriorityColor = (p: string) => {
    switch (p) {
      case "high":
        return "bg-red-100 text-red-800";
      case "medium":
        return "bg-yellow-100 text-yellow-800";
      case "low":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusColor = (s: string) => {
    switch (s) {
      case "todo":
        return "bg-blue-100 text-blue-800";
      case "in-progress":
        return "bg-orange-100 text-orange-800";
      case "completed":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
            <p className="text-muted-foreground mt-2">Manage and track your tasks</p>
          </div>
          <Button onClick={() => setLocation("/tasks/new")}>
            <Plus className="mr-2 h-4 w-4" />
            New Task
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="text-sm font-medium">Status</label>
                <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">To Do</SelectItem>
                    <SelectItem value="in-progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Priority</label>
                <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All priorities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">&nbsp;</label>
                <Button
                  variant="outline"
                  onClick={() => {
                    setStatus(undefined);
                    setPriority(undefined);
                  }}
                  className="w-full"
                >
                  Clear Filters
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Task List</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="animate-spin w-6 h-6" />
              </div>
            ) : tasks && tasks.length > 0 ? (
              <div className="space-y-3">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex-1">
                      <h3 className="font-semibold">{task.title}</h3>
                      {task.description && (
                        <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                      )}
                      <div className="flex gap-2 mt-2">
                        <Badge className={getStatusColor(task.status)}>
                          {task.status === "in-progress"
                            ? "In Progress"
                            : task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                        </Badge>
                        <Badge className={getPriorityColor(task.priority)}>
                          {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setLocation(`/tasks/${task.id}`)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteTaskMutation.mutate({ id: task.id })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No tasks found. Create your first task!</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
