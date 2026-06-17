#!/usr/bin/env node
/**
 * Push canonical model assignments from src/lib/agents/lyzr-models.ts to Lyzr Studio.
 *
 * Usage:
 *   node scripts/sync-lyzr-agent-models.mjs          # apply changes
 *   node scripts/sync-lyzr-agent-models.mjs --dry-run # preview only
 *
 * Requires LYZR_API_KEY in .env.local or environment.
 */

import { config } from "dotenv";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

config({ path: join(root, ".env.local") });
config({ path: join(root, ".env") });

const API_KEY = process.env.LYZR_API_KEY;
const BASE_URL = process.env.LYZR_BASE_URL || "https://agent-prod.studio.lyzr.ai/v3";
const DRY_RUN = process.argv.includes("--dry-run");

function loadSpecs() {
  const modelsPath = join(root, "src/lib/agents/lyzr-models.ts");
  const runner = `import { LYZR_AGENT_MODELS, getProviderBinding } from ${JSON.stringify(modelsPath)}; console.log(JSON.stringify({ specs: LYZR_AGENT_MODELS, getProviderBinding: Object.fromEntries(LYZR_AGENT_MODELS.map(s => [s.model, getProviderBinding(s.model)]).filter(([,b]) => b)) }));`;
  const result = spawnSync("npx", ["tsx", "-e", runner], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    throw new Error("Failed to load lyzr-models.ts");
  }
  const parsed = JSON.parse(result.stdout.trim());
  return { specs: parsed.specs, bindings: parsed.getProviderBinding };
}

async function fetchAgent(id) {
  const res = await fetch(`${BASE_URL}/agents/${id}`, {
    headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`GET ${id} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function updateAgent(current, spec, binding) {
  const patch = {
    ...current,
    model: binding?.model ?? spec.model,
    provider_id: binding?.provider_id ?? current.provider_id,
    llm_credential_id: binding?.llm_credential_id ?? current.llm_credential_id,
    temperature: spec.temperature,
    top_p: current.top_p ?? 1,
  };
  if (spec.maxTokens) patch.max_tokens = spec.maxTokens;

  if (DRY_RUN) return { dryRun: true, patch: { model: patch.model, temperature: patch.temperature } };

  const res = await fetch(`${BASE_URL}/agents/${current._id}`, {
    method: "PUT",
    headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`PUT ${current._id} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  if (!API_KEY) {
    console.error("❌ LYZR_API_KEY not set. Add it to .env.local");
    process.exit(1);
  }

  const { specs, bindings } = loadSpecs();
  console.log(`${DRY_RUN ? "🔍 DRY RUN" : "🚀 SYNC"} - ${specs.length} agents\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const spec of specs) {
    const id = spec.lyzrAgentId;
    if (!id) {
      console.log(`⏭  ${spec.name}: no agent ID configured`);
      skipped++;
      continue;
    }

    try {
      const current = await fetchAgent(id);
      const curModel = current.model;
      const curTemp = current.temperature;

      const binding = bindings[spec.model];
      const targetModel = binding?.model ?? spec.model;
      const needsUpdate =
        curModel !== targetModel ||
        Math.abs((curTemp ?? 0) - spec.temperature) > 0.001 ||
        (binding && current.provider_id !== binding.provider_id);

      if (!needsUpdate) {
        console.log(`✅ ${spec.name} (${id.slice(-6)}) - already ${targetModel} @ ${spec.temperature}`);
        skipped++;
        continue;
      }

      console.log(
        `📝 ${spec.name} (${id.slice(-6)})\n` +
          `   ${curModel} @ ${curTemp}  →  ${targetModel} @ ${spec.temperature}\n` +
          `   ${spec.rationale}`
      );

      await updateAgent(current, spec, binding);
      updated++;
      console.log(`   ✓ updated\n`);
    } catch (err) {
      console.error(`❌ ${spec.name}: ${err.message}\n`);
      failed++;
    }
  }

  console.log("─".repeat(50));
  console.log(`Done: ${updated} updated, ${skipped} unchanged, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();