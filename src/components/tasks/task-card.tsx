"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar, User } from "lucide-react";
import type { OperationalTask } from "@/types/operations";

interface TaskCardProps {
  task: OperationalTask;
  propertyName: string;
  onStatusChange: (taskId: number, status: OperationalTask["status"]) => void;
}

const categoryStyles: Record<OperationalTask["category"], string> = {
  cleaning: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  maintenance: "bg-primary/100 text-primary/800 dark:bg-primary/900 dark:text-primary/200",
  inspection: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

const categoryLabels: Record<OperationalTask["category"], string> = {
  cleaning: "Cleaning",
  maintenance: "Maintenance",
  inspection: "Inspection",
  other: "Other",
};

const priorityConfig: Record<
  OperationalTask["priority"],
  { color: string; label: string }
> = {
  high: { color: "bg-red-500", label: "High" },
  medium: { color: "bg-primary", label: "Medium" },
  low: { color: "bg-gray-400", label: "Low" },
};

function formatDueDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function isOverdue(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(dateStr);
  dueDate.setHours(0, 0, 0, 0);
  return dueDate < today;
}

const statusOrder: OperationalTask["status"][] = ["todo", "in_progress", "done"];

export function TaskCard({ task, propertyName, onStatusChange }: TaskCardProps) {
  const currentIndex = statusOrder.indexOf(task.status);
  const canMoveLeft = currentIndex > 0;
  const canMoveRight = currentIndex < statusOrder.length - 1;
  const priority = priorityConfig[task.priority];
  const overdue = task.dueDate ? isOverdue(task.dueDate) : false;

  return (
    <Card className="shadow-sm">
      <CardContent className="p-3 space-y-2">
        {/* Title */}
        <p className="font-semibold text-sm leading-snug">{task.title}</p>

        {/* Property name */}
        <p className="text-xs text-muted-foreground">{propertyName}</p>

        {/* Category badge and priority */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="secondary"
            className={categoryStyles[task.category]}
          >
            {categoryLabels[task.category]}
          </Badge>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <span
              className={`inline-block h-2 w-2 rounded-full ${priority.color}`}
            />
            {priority.label}
          </span>
        </div>

        {/* Due date and assignee */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {task.dueDate && (
            <span
              className={`inline-flex items-center gap-1 ${
                overdue && task.status !== "done"
                  ? "text-red-600 dark:text-red-400 font-medium"
                  : ""
              }`}
            >
              <Calendar className="h-3 w-3" />
              {formatDueDate(task.dueDate)}
              {overdue && task.status !== "done" && (
                <span className="text-[10px]">(overdue)</span>
              )}
            </span>
          )}
          {task.assignee && (
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3" />
              {task.assignee}
            </span>
          )}
        </div>

        {/* Status change buttons */}
        <div className="flex items-center justify-end gap-1 pt-1">
          {canMoveLeft && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onStatusChange(task.id, statusOrder[currentIndex - 1])}
              title={`Move to ${statusOrder[currentIndex - 1].replace("_", " ")}`}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
          )}
          {canMoveRight && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onStatusChange(task.id, statusOrder[currentIndex + 1])}
              title={`Move to ${statusOrder[currentIndex + 1].replace("_", " ")}`}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
