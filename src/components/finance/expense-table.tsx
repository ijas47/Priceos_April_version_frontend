"use client";

import { useState, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import type { Expense } from "@/types/operations";
import type { Listing } from "@/types/hostaway";

interface ExpenseTableProps {
  initialExpenses: Expense[];
  properties: Listing[];
}

const CATEGORY_COLORS: Record<Expense["category"], string> = {
  cleaning: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  maintenance: "bg-primary/100 text-primary/800 dark:bg-primary/900/40 dark:text-primary/80",
  supplies: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  utilities: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  commission: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-800/40 dark:text-gray-300",
};

const CATEGORIES: Expense["category"][] = [
  "cleaning",
  "maintenance",
  "supplies",
  "utilities",
  "commission",
  "other",
];

function formatAmount(amount: number, currency: string = "AED"): string {
  return `${amount.toLocaleString()} ${currency}`;
}

export function ExpenseTable({ initialExpenses, properties }: ExpenseTableProps) {
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [filterProperty, setFilterProperty] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formListingId, setFormListingId] = useState<string>("");
  const [formCategory, setFormCategory] = useState<string>("");
  const [formDescription, setFormDescription] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState("");

  const propertyMap = useMemo(
    () => new Map(properties.map((p) => [p.id, p.name])),
    [properties]
  );

  const filteredExpenses = useMemo(() => {
    let result = [...expenses];

    if (filterProperty !== "all") {
      result = result.filter(
        (e) => e.listingMapId === Number(filterProperty)
      );
    }

    if (filterCategory !== "all") {
      result = result.filter((e) => e.category === filterCategory);
    }

    // Sort by date descending
    result.sort((a, b) => b.date.localeCompare(a.date));

    return result;
  }, [expenses, filterProperty, filterCategory]);

  const totalAmount = useMemo(
    () => filteredExpenses.reduce((sum, e) => sum + e.amount, 0),
    [filteredExpenses]
  );

  const canSubmit = formListingId && formCategory && formDescription && formAmount && formDate;

  const resetForm = () => {
    setFormListingId("");
    setFormCategory("");
    setFormDescription("");
    setFormAmount("");
    setFormDate("");
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingMapId: Number(formListingId),
          category: formCategory,
          description: formDescription,
          amount: Number(formAmount),
          currencyCode: "AED",
          date: formDate,
        }),
      });
      if (res.ok) {
        const newExpense: Expense = await res.json();
        setExpenses((prev) => [...prev, newExpense]);
        setSheetOpen(false);
        resetForm();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters and Add button */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterProperty} onValueChange={setFilterProperty}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Properties" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Properties</SelectItem>
            {properties.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Add Expense
              </Button>
            </SheetTrigger>
            <SheetContent className="overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Add Expense</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                {/* Property */}
                <div className="space-y-2">
                  <Label>Property</Label>
                  <Select value={formListingId} onValueChange={setFormListingId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select property" />
                    </SelectTrigger>
                    <SelectContent>
                      {properties.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Category */}
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={formCategory} onValueChange={setFormCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat.charAt(0).toUpperCase() + cat.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="expenseDescription">Description</Label>
                  <Input
                    id="expenseDescription"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="What was this expense for?"
                  />
                </div>

                {/* Amount */}
                <div className="space-y-2">
                  <Label htmlFor="expenseAmount">Amount (AED)</Label>
                  <Input
                    id="expenseAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>

                {/* Date */}
                <div className="space-y-2">
                  <Label htmlFor="expenseDate">Date</Label>
                  <Input
                    id="expenseDate"
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                  />
                </div>

                {/* Submit */}
                <Button
                  onClick={handleSubmit}
                  disabled={saving || !canSubmit}
                  className="w-full"
                >
                  {saving ? "Saving..." : "Add Expense"}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Property</th>
                <th className="text-left px-4 py-3 font-medium">Category</th>
                <th className="text-left px-4 py-3 font-medium">Description</th>
                <th className="text-right px-4 py-3 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-muted-foreground">
                    No expenses found
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((expense) => (
                  <tr key={expense.id} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="px-4 py-3 whitespace-nowrap">{expense.date}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {propertyMap.get(expense.listingMapId) ?? "Unknown"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="secondary"
                        className={CATEGORY_COLORS[expense.category]}
                      >
                        {expense.category}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">{expense.description}</td>
                    <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                      {formatAmount(expense.amount, expense.currencyCode)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filteredExpenses.length > 0 && (
              <tfoot>
                <tr className="bg-muted/50 font-medium">
                  <td colSpan={4} className="px-4 py-3 text-right">
                    Total
                  </td>
                  <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                    {formatAmount(totalAmount, "AED")}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {filteredExpenses.length} of {expenses.length} expenses
      </p>
    </div>
  );
}
