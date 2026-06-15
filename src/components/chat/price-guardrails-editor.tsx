"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ShieldCheck, Pencil, Check, X, AlertTriangle, Loader2, Info, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface PriceGuardrailsEditorProps {
    listingId: string;
    initialFloor: number;
    initialCeiling: number;
    guardrailsSource?: string;
    floorReasoning?: string | null;
    ceilingReasoning?: string | null;
    currencyCode?: string;
    /** Called after successful save with the new values */
    onSaved?: (floor: number, ceiling: number) => void;
    /** If true, shows a warning badge that values need to be set */
    highlightIfZero?: boolean;
    className?: string;
}

export function PriceGuardrailsEditor({
    listingId,
    initialFloor,
    initialCeiling,
    guardrailsSource = "manual",
    floorReasoning,
    ceilingReasoning,
    currencyCode = "AED",
    onSaved,
    highlightIfZero = true,
    className,
}: PriceGuardrailsEditorProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showReasoning, setShowReasoning] = useState(false);
    const [floor, setFloor] = useState(String(initialFloor || ""));
    const [ceiling, setCeiling] = useState(String(initialCeiling || ""));

    // Keep in sync if props change (e.g. property switch)
    useEffect(() => {
        setFloor(String(initialFloor || ""));
        setCeiling(String(initialCeiling || ""));
        setIsEditing(false);
    }, [listingId, initialFloor, initialCeiling]);

    const isAiSet = guardrailsSource === "ai";

    const isZero = !initialFloor && !initialCeiling;
    const needsAttention = highlightIfZero && isZero;

    const handleSave = async () => {
        const floorNum = parseFloat(floor);
        const ceilingNum = parseFloat(ceiling);

        if (isNaN(floorNum) || floorNum < 0) {
            toast.error("Invalid floor price", { description: "Enter a valid number (e.g. 600)" });
            return;
        }
        if (isNaN(ceilingNum) || ceilingNum < 0) {
            toast.error("Invalid ceiling price", { description: "Enter a valid number (e.g. 1800)" });
            return;
        }
        if (ceilingNum > 0 && ceilingNum < floorNum) {
            toast.error("Invalid range", { description: "Ceiling must be greater than floor price" });
            return;
        }

        setIsSaving(true);
        try {
            const res = await fetch(`/api/listings/${listingId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ priceFloor: floorNum, priceCeiling: ceilingNum }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Save failed");

            toast.success("Price Guardrails Saved", {
                description: `Floor: ${currencyCode} ${floorNum.toLocaleString()} · Ceiling: ${currencyCode} ${ceilingNum.toLocaleString()}`,
            });

            setIsEditing(false);
            onSaved?.(floorNum, ceilingNum);
        } catch (err) {
            toast.error("Failed to save", {
                description: err instanceof Error ? err.message : "Please try again",
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setFloor(String(initialFloor || ""));
        setCeiling(String(initialCeiling || ""));
        setIsEditing(false);
    };

    if (!isEditing) {
        const hasReasoning = isAiSet && (floorReasoning || ceilingReasoning);

        return (
            <div className={cn("flex flex-col gap-1", className)}>
                <button
                    onClick={() => setIsEditing(true)}
                    className={cn(
                        "group flex items-center gap-2 rounded-lg px-3 py-1.5 transition-all border",
                        needsAttention
                            ? "border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary"
                            : "border-border/50 bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground",
                    )}
                    title="Click to edit price guardrails"
                >
                    {needsAttention ? (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                        <ShieldCheck className={cn("h-3.5 w-3.5 shrink-0", isAiSet ? "text-primary" : "text-emerald-500")} />
                    )}
                    <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest">
                        {needsAttention ? "Set Guardrails" : "Guardrails"}
                        {isAiSet && !needsAttention && (
                            <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-[8px] flex items-center gap-1 shadow-sm">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                AI SET
                            </span>
                        )}
                    </span>
                    <span className="text-[11px] font-mono">
                        {needsAttention
                            ? "Not set"
                            : `${currencyCode} ${Number(initialFloor).toLocaleString()} – ${Number(initialCeiling).toLocaleString()}`}
                    </span>
                    {hasReasoning && (
                        <TooltipProvider delayDuration={200}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span
                                        className="ml-1 shrink-0"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowReasoning(!showReasoning);
                                        }}
                                    >
                                        <Info className="h-3.5 w-3.5 text-primary/70 hover:text-primary transition-colors" />
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-xs text-xs">
                                    <p className="font-semibold mb-1">AI Reasoning</p>
                                    {floorReasoning && <p>📉 Floor: {floorReasoning}</p>}
                                    {ceilingReasoning && <p className="mt-1">📈 Ceiling: {ceilingReasoning}</p>}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                    <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>

                {/* Expanded reasoning panel */}
                {hasReasoning && showReasoning && (
                    <div className="flex flex-col gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="flex items-center gap-1.5 text-primary font-semibold text-[10px] uppercase tracking-wider">
                            <Sparkles className="h-3 w-3" />
                            Aria&apos;s Reasoning
                        </div>
                        {floorReasoning && (
                            <div className="flex gap-2">
                                <span className="text-muted-foreground font-bold shrink-0">Floor:</span>
                                <span className="text-foreground/80">{floorReasoning}</span>
                            </div>
                        )}
                        {ceilingReasoning && (
                            <div className="flex gap-2">
                                <span className="text-muted-foreground font-bold shrink-0">Ceiling:</span>
                                <span className="text-foreground/80">{ceilingReasoning}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }


    return (
        <div className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-1.5 border border-primary/30 bg-primary/5 shadow-sm",
            className
        )}>
            <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
            <span className="text-[11px] font-black uppercase tracking-widest text-primary whitespace-nowrap">
                Guardrails
            </span>
            <div className="flex items-center gap-1.5">
                <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5 leading-none">Floor</span>
                    <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-muted-foreground">{currencyCode}</span>
                        <Input
                            value={floor}
                            onChange={e => setFloor(e.target.value)}
                            className="h-7 w-24 pl-9 pr-2 text-[12px] font-mono font-bold"
                            placeholder="600"
                            type="number"
                            min={0}
                            autoFocus
                        />
                    </div>
                </div>

                <span className="text-muted-foreground text-sm mt-4">–</span>

                <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5 leading-none">Ceiling</span>
                    <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-muted-foreground">{currencyCode}</span>
                        <Input
                            value={ceiling}
                            onChange={e => setCeiling(e.target.value)}
                            className="h-7 w-24 pl-9 pr-2 text-[12px] font-mono font-bold"
                            placeholder="1800"
                            type="number"
                            min={0}
                            onKeyDown={e => {
                                if (e.key === "Enter") handleSave();
                                if (e.key === "Escape") handleCancel();
                            }}
                        />
                    </div>
                </div>
            </div>

            <div className="flex gap-1 mt-auto">
                <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="h-7 w-7 p-0 rounded-md bg-primary hover:bg-primary/90"
                    title="Save guardrails"
                >
                    {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCancel}
                    disabled={isSaving}
                    className="h-7 w-7 p-0 rounded-md text-muted-foreground hover:text-foreground"
                    title="Cancel"
                >
                    <X className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    );
}
