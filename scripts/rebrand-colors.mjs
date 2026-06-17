#!/usr/bin/env node
/**
 * Sweep hardcoded amber/orange/yellow brand classes → semantic primary/brand tokens.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
const SKIP = new Set(["node_modules", ".next", "rebrand-colors.mjs"]);

const REPLACEMENTS = [
  // Gradients (longest first)
  [/from-amber-500 to-orange-600/g, "from-primary to-primary/85"],
  [/from-amber-400 to-orange-500/g, "from-primary to-primary/85"],
  [/from-amber-500 via-orange-500/g, "from-primary via-primary/80"],
  [/from-amber-400 via-orange-500 to-emerald-500/g, "from-primary via-sky-500 to-emerald-500"],
  [/from-amber-100 to-orange-100/g, "from-primary/10 to-primary/5"],
  [/from-amber-900\/40 dark:to-orange-900\/40/g, "from-primary/20 dark:to-primary/15"],
  [/from-amber-50 via-orange-50 to-red-50/g, "from-sky-50 via-blue-50 to-slate-50"],
  [/dark:from-amber-950\/20 dark:via-orange-950\/20 dark:to-red-950\/20/g, "dark:from-primary/10 dark:via-primary/5 dark:to-slate-900/20"],
  [/to-orange-600/g, "to-primary/85"],
  [/via-orange-500/g, "via-primary/80"],
  [/via-amber-500/g, "via-primary/70"],

  // Amber with opacity
  [/amber-500\/80/g, "primary/80"],
  [/amber-500\/60/g, "primary/60"],
  [/amber-500\/50/g, "primary/50"],
  [/amber-500\/40/g, "primary/40"],
  [/amber-500\/30/g, "primary/30"],
  [/amber-500\/20/g, "primary/20"],
  [/amber-500\/15/g, "primary/15"],
  [/amber-500\/10/g, "primary/10"],
  [/amber-500\/8/g, "primary/8"],
  [/amber-500\/5/g, "primary/5"],
  [/amber-400\/60/g, "primary/60"],
  [/amber-400\/40/g, "primary/40"],
  [/amber-300/g, "primary/80"],

  // Orange with opacity
  [/orange-600\/10/g, "primary/10"],
  [/orange-200\/30/g, "primary/15"],
  [/dark:orange-600\/10/g, "dark:primary/10"],
  [/dark:bg-orange-600\/10/g, "dark:bg-primary/10"],

  // Standard amber/orange shades → primary
  [/text-amber-900/g, "text-primary"],
  [/text-amber-700/g, "text-primary"],
  [/text-amber-600/g, "text-primary"],
  [/text-amber-500/g, "text-primary"],
  [/text-amber-400/g, "text-primary"],
  [/bg-amber-600/g, "bg-primary"],
  [/bg-amber-500/g, "bg-primary"],
  [/bg-amber-400/g, "bg-primary"],
  [/bg-amber-200/g, "bg-primary/20"],
  [/border-amber-800/g, "border-primary/30"],
  [/border-amber-500/g, "border-primary"],
  [/border-amber-200/g, "border-primary/20"],
  [/from-amber-600/g, "from-primary"],
  [/from-amber-500/g, "from-primary"],
  [/from-amber-400/g, "from-primary"],
  [/from-amber-200/g, "from-primary/20"],
  [/to-amber-500/g, "to-primary"],
  [/to-orange-500/g, "to-primary/85"],
  [/to-red-600/g, "to-sky-600"],
  [/hover:bg-amber-500/g, "hover:bg-primary"],
  [/hover:bg-amber-400/g, "hover:bg-primary/90"],
  [/hover:text-amber-500/g, "hover:text-primary"],
  [/hover:text-amber-400/g, "hover:text-primary"],
  [/hover:text-amber-300/g, "hover:text-primary/80"],
  [/focus:border-amber-500/g, "focus:border-primary"],
  [/focus:ring-amber-500/g, "focus:ring-primary"],
  [/shadow-amber-500/g, "shadow-primary"],
  [/ring-amber-500/g, "ring-primary"],
  [/ring-amber-400/g, "ring-primary"],

  // Hex brand colors
  [/#f59e0b/gi, "#2d7ff9"],
  [/#d97706/gi, "#2563eb"],
  [/#ea580c/gi, "#1d6fe8"],
  [/#fcb400/gi, "#2d7ff9"],

  // Named color keys in objects
  [/amber: "#f59e0b"/g, 'brand: "#2d7ff9"'],
  [/amber: "text-amber-400"/g, 'brand: "text-primary"'],
  [/from-amber-500\/20 to-orange-500\/5 border-amber-500\/20/g, "from-primary/20 to-primary/5 border-primary/20"],

  // Calendar blocked days (semantic, not brand)
  [/bg-amber-200 dark:bg-amber-900/g, "bg-sky-100 dark:bg-sky-950"],
  [/border-amber-200 bg-amber-50 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950 dark:hover:bg-amber-900/g, "border-sky-200 bg-sky-50 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950 dark:hover:bg-sky-900"],
  [/text-amber-600 dark:text-amber-400/g, "text-sky-700 dark:text-sky-400"],

  // Warning semantics (occupancy mid-range) - use sky instead of amber
  [/text-amber-500' : 'text-rose-500/g, "text-sky-500' : 'text-rose-500"],

  // Error states using orange
  [/border-orange-500/g, "border-destructive"],
  [/text-orange-500/g, "text-destructive"],

  // Legacy token references
  [/text-amber-/g, "text-primary/"],
  [/bg-amber-/g, "bg-primary/"],
  [/border-amber-/g, "border-primary/"],
];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if ([".tsx", ".ts", ".css"].includes(extname(p))) files.push(p);
  }
  return files;
}

let changed = 0;
for (const file of walk(SRC)) {
  if (file.endsWith("globals.css")) continue;
  let content = readFileSync(file, "utf8");
  const original = content;
  for (const [pattern, replacement] of REPLACEMENTS) {
    content = content.replace(pattern, replacement);
  }
  if (content !== original) {
    writeFileSync(file, content);
    changed++;
    console.log("updated:", file.replace(ROOT, ""));
  }
}
console.log(`\nDone. ${changed} files updated.`);