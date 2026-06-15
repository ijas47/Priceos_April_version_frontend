"use client";

import { Badge } from "@/components/ui/badge";
import { Sparkles, Ticket, Newspaper, Globe, Calendar, Bot, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getEventTrust, normalizeEventSource } from "@/lib/research/source-trust";

const SOURCE_STYLES: Record<string, string> = {
  ticketmaster: "bg-violet-500/10 text-violet-600 border-violet-500/30",
  eventbrite: "bg-violet-500/10 text-violet-600 border-violet-500/30",
  dtcm: "bg-teal-500/10 text-teal-700 border-teal-500/30 dark:text-teal-400",
  dcul: "bg-cyan-500/10 text-cyan-700 border-cyan-500/30 dark:text-cyan-400",
  serpapi: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400",
  newsapi: "bg-sky-500/10 text-sky-700 border-sky-600/30 dark:text-sky-400",
  manual: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400",
  market_template: "bg-indigo-500/10 text-indigo-700 border-indigo-500/30 dark:text-indigo-400",
  ai_detected: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  perplexity: "bg-primary/10 text-primary border-primary/30",
};

function SourceIcon({ source }: { source: string }) {
  switch (source) {
    case "ticketmaster":
    case "eventbrite":
    case "dtcm":
    case "dcul":
      return <Ticket className="h-2.5 w-2.5" />;
    case "serpapi":
      return <Globe className="h-2.5 w-2.5" />;
    case "newsapi":
      return <Newspaper className="h-2.5 w-2.5" />;
    case "manual":
      return <Calendar className="h-2.5 w-2.5" />;
    case "market_template":
      return <Calendar className="h-2.5 w-2.5" />;
    case "perplexity":
      return <Sparkles className="h-2.5 w-2.5" />;
    case "ai_detected":
      return <Bot className="h-2.5 w-2.5" />;
    default:
      return <AlertTriangle className="h-2.5 w-2.5" />;
  }
}

interface Props {
  source?: string | null;
  className?: string;
  showUnverifiedWarning?: boolean;
}

export function SourceProvenanceBadge({ source, className, showUnverifiedWarning = true }: Props) {
  if (!source) return null;

  const key = normalizeEventSource(source);
  const meta = getEventTrust(source);
  const style = SOURCE_STYLES[key] ?? SOURCE_STYLES.ai_detected;

  if (source.startsWith("http")) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "text-[9px] font-semibold tracking-wide gap-1 border",
          SOURCE_STYLES.serpapi,
          className
        )}
      >
        <Globe className="h-2.5 w-2.5" />
        Live Web Source
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn("text-[9px] font-semibold tracking-wide gap-1 border", style, className)}
      title={meta.verified ? "Verified feed" : "Unverified — use with caution"}
    >
      <SourceIcon source={key} />
      {meta.label}
      {showUnverifiedWarning && !meta.verified && (
        <span className="opacity-70">· unverified</span>
      )}
    </Badge>
  );
}