#!/usr/bin/env node
/**
 * Create (or update) the PriceOS Listing Optimizer agent in Lyzr Studio.
 *
 * Usage:
 *   node scripts/create-listing-optimizer-agent.mjs
 *   node scripts/create-listing-optimizer-agent.mjs --agent-id=<existing_id>  # update prompt only
 *
 * Requires LYZR_API_KEY in .env.local
 *
 * After success, set in Vercel + .env.local:
 *   LYZR_LISTING_OPTIMIZER_AGENT_ID=<printed _id>
 */

import { config } from "dotenv";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

config({ path: join(root, ".env.local") });
config({ path: join(root, ".env") });

const API_KEY = process.env.LYZR_API_KEY;
const BASE_URL = process.env.LYZR_BASE_URL || "https://agent-prod.studio.lyzr.ai/v3";
const EXISTING_ID = process.argv.find((a) => a.startsWith("--agent-id="))?.split("=")[1];

const PROMPT_PATH = join(root, "src/lib/agents/prompts/listing-optimizer-agent.md");
const INSTRUCTIONS = readFileSync(PROMPT_PATH, "utf8");

const AGENT_NAME = "PriceOS Listing Optimizer";
const MODEL = "gemini/gemini-3.1-flash-lite";
const PROVIDER_ID = "Google";
const LLM_CREDENTIAL_ID = "lyzr_google";

async function createAgent() {
  const body = {
    name: AGENT_NAME,
    description:
      "Optimizes Airbnb/Booking.com/VRBO listing titles and descriptions for search visibility. JSON in, JSON out.",
    agent_role: "Listing content SEO specialist for short-term rentals",
    agent_instructions: INSTRUCTIONS,
    model: MODEL,
    provider_id: PROVIDER_ID,
    llm_credential_id: LLM_CREDENTIAL_ID,
    temperature: 0.2,
    top_p: 1,
    max_tokens: 3000,
  };

  const res = await fetch(`${BASE_URL}/agents/`, {
    method: "POST",
    headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST agents failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function updateAgent(id) {
  const getRes = await fetch(`${BASE_URL}/agents/${id}`, {
    headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
  });
  if (!getRes.ok) throw new Error(`GET agent failed: ${getRes.status}`);
  const current = await getRes.json();

  const patch = {
    ...current,
    name: AGENT_NAME,
    agent_instructions: INSTRUCTIONS,
    model: MODEL,
    provider_id: PROVIDER_ID,
    llm_credential_id: LLM_CREDENTIAL_ID,
    temperature: 0.2,
    max_tokens: 3000,
  };

  const res = await fetch(`${BASE_URL}/agents/${id}`, {
    method: "PUT",
    headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`PUT agent failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  if (!API_KEY) {
    console.error("❌ LYZR_API_KEY not set. Add it to .env.local");
    process.exit(1);
  }

  try {
    const agent = EXISTING_ID ? await updateAgent(EXISTING_ID) : await createAgent();
    const id = agent.agent_id || agent._id || agent.id || EXISTING_ID;
    console.log("\n✅ Listing Optimizer agent ready\n");
    console.log(`   Agent ID: ${id}`);
    console.log(`   Model:    ${MODEL}`);
    console.log("\nAdd to .env.local and Vercel:\n");
    console.log(`   LYZR_LISTING_OPTIMIZER_AGENT_ID=${id}\n`);
    console.log("Then run: node scripts/sync-lyzr-agent-models.mjs (after adding entry to lyzr-models.ts)\n");
  } catch (err) {
    console.error("❌", err.message);
    console.error("\nIf POST failed, create manually in Lyzr Studio:");
    console.error(`  1. New agent → paste prompt from ${PROMPT_PATH}`);
    console.error("  2. Model: gemini-3.1-flash-lite, temperature 0.2");
    console.error("  3. Copy agent _id → LYZR_LISTING_OPTIMIZER_AGENT_ID\n");
    process.exit(1);
  }
}

main();