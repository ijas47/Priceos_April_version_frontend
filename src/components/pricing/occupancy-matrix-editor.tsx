"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import type { OccupancyMatrix, OccupancyMatrixRow, DayRange } from "@/lib/pricing/types";
import { cn } from "@/lib/utils";

interface Props {
  matrix: OccupancyMatrix;
  onChange: (matrix: OccupancyMatrix) => void;
  readOnly?: boolean;
  className?: string;
}

function defaultMatrix(): OccupancyMatrix {
  return {
    dayRanges: [
      { startDay: 0, endDay: 15, label: "0–15 days" },
      { startDay: 16, endDay: 30, label: "16–30 days" },
      { startDay: 31, endDay: 60, label: "31–60 days" },
    ],
    rows: [
      { maxOccupancyPct: 50, adjustmentsPct: [-20, -10, 0] },
      { maxOccupancyPct: 100, adjustmentsPct: [0, 0, 0] },
    ],
  };
}

export function createEmptyOccupancyMatrix(): OccupancyMatrix {
  return defaultMatrix();
}

export function OccupancyMatrixEditor({ matrix, onChange, readOnly, className }: Props) {
  const ranges = matrix.dayRanges ?? [];
  const rows = matrix.rows ?? [];

  const syncRowWidths = (nextRanges: DayRange[], nextRows: OccupancyMatrixRow[]) =>
    nextRows.map((row) => ({
      ...row,
      adjustmentsPct: nextRanges.map((_, i) => row.adjustmentsPct[i] ?? 0),
    }));

  const updateRange = (idx: number, patch: Partial<DayRange>) => {
    const nextRanges = ranges.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange({ dayRanges: nextRanges, rows: syncRowWidths(nextRanges, rows) });
  };

  const addRange = () => {
    const last = ranges[ranges.length - 1];
    const start = last ? last.endDay + 1 : 0;
    const nextRanges = [
      ...ranges,
      { startDay: start, endDay: start + 14, label: `${start}–${start + 14} days` },
    ];
    onChange({ dayRanges: nextRanges, rows: syncRowWidths(nextRanges, rows) });
  };

  const removeRange = (idx: number) => {
    if (ranges.length <= 1) return;
    const nextRanges = ranges.filter((_, i) => i !== idx);
    const nextRows = rows.map((row) => ({
      ...row,
      adjustmentsPct: row.adjustmentsPct.filter((_, i) => i !== idx),
    }));
    onChange({ dayRanges: nextRanges, rows: nextRows });
  };

  const updateRow = (idx: number, patch: Partial<OccupancyMatrixRow>) => {
    onChange({
      dayRanges: ranges,
      rows: rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    });
  };

  const updateCell = (rowIdx: number, colIdx: number, value: number) => {
    const nextRows = rows.map((row, i) => {
      if (i !== rowIdx) return row;
      const adj = [...row.adjustmentsPct];
      adj[colIdx] = value;
      return { ...row, adjustmentsPct: adj };
    });
    onChange({ dayRanges: ranges, rows: nextRows });
  };

  const addRow = () => {
    onChange({
      dayRanges: ranges,
      rows: [
        ...rows,
        {
          maxOccupancyPct: 100,
          adjustmentsPct: ranges.map(() => 0),
        },
      ],
    });
  };

  const removeRow = (idx: number) => {
    if (rows.length <= 1) return;
    onChange({ dayRanges: ranges, rows: rows.filter((_, i) => i !== idx) });
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Occupancy (%) × lead-time discounts & premiums
        </Label>
        {!readOnly && (
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" onClick={addRange}>
              <Plus className="h-3 w-3 mr-1" /> Column
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" onClick={addRow}>
              <Plus className="h-3 w-3 mr-1" /> Row
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/70 dark:border-white/10">
        <table className="w-full text-xs min-w-[480px]">
          <thead>
            <tr className="bg-muted/40 border-b border-border/50">
              <th className="text-left p-2 font-medium text-muted-foreground w-28">Occupancy</th>
              {ranges.map((r, i) => (
                <th key={`range-${i}`} className="p-2 text-center font-medium min-w-[100px]">
                  {readOnly ? (
                    <span>{r.label ?? `${r.startDay}–${r.endDay}d`}</span>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-center justify-center gap-1">
                        <Input
                          type="number"
                          className="h-7 w-12 text-center text-[10px] px-1"
                          value={r.startDay}
                          onChange={(e) => updateRange(i, { startDay: Number(e.target.value) })}
                        />
                        <span className="text-muted-foreground">–</span>
                        <Input
                          type="number"
                          className="h-7 w-12 text-center text-[10px] px-1"
                          value={r.endDay}
                          onChange={(e) => updateRange(i, { endDay: Number(e.target.value) })}
                        />
                      </div>
                      {!readOnly && ranges.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRange(i)}
                          className="text-[10px] text-red-400 hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )}
                </th>
              ))}
              {!readOnly && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {[...rows]
              .sort((a, b) => a.maxOccupancyPct - b.maxOccupancyPct)
              .map((row, rowIdx) => (
                <tr key={`row-${rowIdx}`} className="border-b border-border/30 even:bg-muted/20">
                  <td className="p-2">
                    {readOnly ? (
                      <span>≤{row.maxOccupancyPct}%</span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">≤</span>
                        <Input
                          type="number"
                          className="h-7 w-14 text-xs"
                          value={row.maxOccupancyPct}
                          onChange={(e) =>
                            updateRow(
                              rows.indexOf(row),
                              { maxOccupancyPct: Number(e.target.value) }
                            )
                          }
                        />
                        <span>%</span>
                      </div>
                    )}
                  </td>
                  {row.adjustmentsPct.map((val, colIdx) => (
                    <td key={`cell-${rowIdx}-${colIdx}`} className="p-2 text-center">
                      {readOnly ? (
                        <span
                          className={cn(
                            "font-mono",
                            val < 0 ? "text-green-400" : val > 0 ? "text-amber" : "text-muted-foreground"
                          )}
                        >
                          {val > 0 ? "+" : ""}
                          {val}%
                        </span>
                      ) : (
                        <Input
                          type="number"
                          className="h-7 w-16 text-center text-xs mx-auto"
                          value={val}
                          onChange={(e) =>
                            updateCell(rows.indexOf(row), colIdx, Number(e.target.value))
                          }
                        />
                      )}
                    </td>
                  ))}
                  {!readOnly && (
                    <td className="p-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => removeRow(rows.indexOf(row))}
                        disabled={rows.length <= 1}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Negative values discount; positive values premium. Engine matches the lowest occupancy row
        threshold that is still ≥ current occupancy.
      </p>
    </div>
  );
}