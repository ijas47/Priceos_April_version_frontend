"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { FileCheck, AlertTriangle, Mail, CalendarCheck } from "lucide-react";

interface ActionCardsProps {
  pendingProposals: number;
  overdueTasks: number;
  unreadMessages: number;
  checkInsToday: number;
}

const actions = [
  {
    key: "proposals",
    label: "proposals to review",
    icon: FileCheck,
    href: "/pricing",
    gradient: "from-blue-500 to-cyan-600",
    bg: "from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20",
  },
  {
    key: "tasks",
    label: "tasks overdue",
    icon: AlertTriangle,
    href: "/tasks",
    gradient: "from-primary to-primary/85",
    bg: "from-sky-50 to-blue-50 dark:from-primary/10 dark:to-primary/5",
  },
  {
    key: "messages",
    label: "unread messages",
    icon: Mail,
    href: "/inbox",
    gradient: "from-purple-500 to-pink-600",
    bg: "from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20",
  },
  {
    key: "checkins",
    label: "check-ins today",
    icon: CalendarCheck,
    href: "/bookings",
    gradient: "from-emerald-500 to-teal-600",
    bg: "from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20",
  },
];

export function ActionCards({
  pendingProposals,
  overdueTasks,
  unreadMessages,
  checkInsToday,
}: ActionCardsProps) {
  const counts: Record<string, number> = {
    proposals: pendingProposals,
    tasks: overdueTasks,
    messages: unreadMessages,
    checkins: checkInsToday,
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {actions.map((action) => {
        const count = counts[action.key];
        const hasItems = count > 0;

        return (
          <Link key={action.key} href={action.href}>
            <Card className={`group relative overflow-hidden transition-all duration-300 hover:shadow-xl ${hasItems ? 'hover:scale-[1.02]' : 'opacity-60'}`}>
              {/* Gradient background on hover */}
              <div className={`absolute inset-0 bg-gradient-to-br ${action.bg} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />

              <CardContent className="relative flex items-center gap-4 p-5">
                {/* Gradient icon */}
                <div className={`rounded-xl bg-gradient-to-br ${action.gradient} p-3 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300`}>
                  <action.icon className="h-6 w-6 text-white" />
                </div>

                <div className="flex-1">
                  <p className={`text-3xl font-black bg-gradient-to-br ${action.gradient} bg-clip-text text-transparent`}>
                    {count}
                  </p>
                  <p className="text-sm font-medium text-muted-foreground">
                    {action.label}
                  </p>
                </div>

                {/* Pulse indicator for items */}
                {hasItems && (
                  <div className={`absolute top-2 right-2 h-2 w-2 rounded-full bg-gradient-to-br ${action.gradient} animate-pulse`} />
                )}
              </CardContent>

              {/* Bottom accent */}
              <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${action.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
