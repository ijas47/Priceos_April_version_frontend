/**
 * seed-admin.mjs
 * Seeds an admin user into the MongoDB "users" collection.
 *
 * Usage:
 *   node scripts/seed-admin.mjs
 *
 * Login credentials:
 *   Email:    admin@priceos.com
 *   Password: Admin@1234
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);

const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

// ── Load .env manually ────────────────────────────────────────────────────────
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath   = resolve(__dirname, "../.env");

try {
  const envFile = readFileSync(envPath, "utf8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^"|"$/g, "");
    process.env[key] = process.env[key] ?? val;
  }
} catch {
  console.warn("⚠ Could not read .env - using existing environment variables.");
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI is not set. Check your .env file.");
  process.exit(1);
}

// ── Admin credentials ─────────────────────────────────────────────────────────
const ADMIN_EMAIL    = "admin@priceos.com";
const ADMIN_PASSWORD = "Admin@1234";
const ADMIN_NAME     = "PriceOS Admin";

// ── User schema - must match src/lib/db/models/User.ts ───────────────────────
const UserSchema = new mongoose.Schema(
  {
    name:         { type: String, required: true },
    email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    refreshToken: { type: String },
    role:         { type: String, enum: ["owner", "admin", "viewer"], default: "owner" },
    isApproved:   { type: Boolean, default: true },
    fullName:     { type: String },
    plan:         { type: String, enum: ["starter", "growth", "scale"], default: "starter" },
  },
  { timestamps: true, collection: "users" }
);

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🔌 Connecting to MongoDB…");
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  console.log("✅ Connected to:", mongoose.connection.db.databaseName);

  const User = mongoose.models.User ?? mongoose.model("User", UserSchema);

  // Check if admin already exists
  const existing = await User.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    console.log(`ℹ️  Admin already exists in 'users' collection: ${ADMIN_EMAIL}`);
    console.log("   isApproved:", existing.isApproved);
    console.log("   role:      ", existing.role);

    // Ensure isApproved is true just in case
    if (!existing.isApproved) {
      existing.isApproved = true;
      await existing.save();
      console.log("   ✅ Updated isApproved → true");
    }

    console.log("\n🔑 Login credentials:");
    console.log("   Email:    ", ADMIN_EMAIL);
    console.log("   Password:  Admin@1234");
    await mongoose.disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const admin = await User.create({
    name:       ADMIN_NAME,
    fullName:   ADMIN_NAME,
    email:      ADMIN_EMAIL,
    passwordHash,
    role:       "owner",
    isApproved: true,
    plan:       "scale",
  });

  console.log("\n🎉 Admin user created in 'users' collection!");
  console.log("   ID:       ", admin._id.toString());
  console.log("   Email:    ", admin.email);
  console.log("   Role:     ", admin.role);
  console.log("   Approved: ", admin.isApproved);
  console.log("\n🔑 Login credentials:");
  console.log("   Email:    ", ADMIN_EMAIL);
  console.log("   Password: ", ADMIN_PASSWORD);

  await mongoose.disconnect();
  console.log("\n🔌 Disconnected. Done.");
}

main().catch((err) => {
  console.error("❌ Seed failed:", err.message || err);
  process.exit(1);
});
