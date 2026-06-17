#!/usr/bin/env node
/** Replace Unicode em dash (U+2014) with ASCII hyphen across app sources. */
import { execSync } from "node:child_process";
import fs from "node:fs";

const EM = "\u2014";
const roots = ["src", "scripts", "next.config.ts"];

const files = new Set();
for (const root of roots) {
  try {
    const out = execSync(
      `rg -l '${EM}' ${root} --glob '*.{ts,tsx,js,jsx,mjs,css,md}' 2>/dev/null || true`,
      { encoding: "utf8" }
    );
    out
      .trim()
      .split("\n")
      .filter(Boolean)
      .forEach((f) => files.add(f));
  } catch {
    /* ignore */
  }
}

let changed = 0;
for (const file of files) {
  const original = fs.readFileSync(file, "utf8");
  if (!original.includes(EM)) continue;
  const next = original.replaceAll(EM, "-");
  if (next !== original) {
    fs.writeFileSync(file, next);
    changed++;
  }
}

console.log(`Replaced em dashes in ${changed} files.`);