import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a monetary amount with its currency code.
 * Uses the currency code as a prefix label (e.g. "AED 1,250" or "USD 1,250").
 * Falls back to "AED" if no currency code is provided.
 */
export function formatCurrency(amount: number | string, currencyCode?: string | null): string {
  const code = currencyCode || "AED";
  const num = Number(amount);
  if (isNaN(num)) return `${code} -`;
  return `${code} ${num.toLocaleString("en-US")}`;
}
