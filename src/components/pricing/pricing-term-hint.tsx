"use client";

import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PRICING_GLOSSARY, type PricingGlossaryKey } from "@/lib/pricing/glossary";
import { cn } from "@/lib/utils";

interface PricingTermHintProps {
  term: PricingGlossaryKey;
  /** Show abbreviated label next to the icon (e.g. "LM") */
  showShort?: boolean;
  className?: string;
  iconClassName?: string;
}

export function PricingTermHint({
  term,
  showShort = false,
  className,
  iconClassName,
}: PricingTermHintProps) {
  const entry = PRICING_GLOSSARY[term];

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors",
              className
            )}
            aria-label={`About ${entry.label}`}
          >
            {showShort && (
              <span className="text-[10px] font-medium uppercase tracking-wide">{entry.short}</span>
            )}
            <Info className={cn("h-3 w-3 shrink-0", iconClassName)} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-left leading-relaxed">
          <p className="font-semibold">{entry.label}</p>
          <p className="text-primary-foreground/90 mt-0.5">{entry.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface InlinePricingTermProps {
  term: PricingGlossaryKey;
  children: React.ReactNode;
  className?: string;
}

/** Label text with an (i) hint inline, e.g. "Last minute (LM)" */
export function InlinePricingTerm({ term, children, className }: InlinePricingTermProps) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {children}
      <PricingTermHint term={term} />
    </span>
  );
}