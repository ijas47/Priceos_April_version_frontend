import { z } from "zod";

/**
 * ═══════════════════════════════════════════════════════════
 * PriceOS API - Zod Validation Schemas
 * 
 * Every request body is validated BEFORE any DB or AI calls.
 * If validation fails, a 400 error with field-level details is returned.
 * ═══════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────
// Shared Primitives
// ─────────────────────────────────────────────────────────

/** Matches YYYY-MM-DD format */
const isoDateString = z.string().regex(
    /^\d{4}-\d{2}-\d{2}$/,
    "Must be in YYYY-MM-DD format"
);

/** Positive integer (for IDs) */
const positiveInt = z.number().int().positive();

// ─────────────────────────────────────────────────────────
// Guest Inbox Schemas
// ─────────────────────────────────────────────────────────

/** GET /v1/guests/conversations - query params */
export const getConversationsSchema = z.object({
    listingId: z.string().min(1, "listingId is required"),
    from: isoDateString,
    to: isoDateString,
});

/** POST /v1/guests/reply - save shadow reply */
export const guestReplySchema = z.object({
    conversationId: z.string().min(1, "conversationId is required"),
    text: z.string()
        .min(1, "Reply text cannot be empty")
        .max(5000, "Reply text cannot exceed 5000 characters"),
});

/** POST /v1/guests/suggest - AI-generated draft reply */
export const suggestReplySchema = z.object({
    message: z.string()
        .min(1, "Guest message is required")
        .max(5000, "Message cannot exceed 5000 characters"),
    guestName: z.string().optional().default("Guest"),
    propertyName: z.string().optional().default("Our Property"),
    listingId: z.string().optional(), // MongoDB ObjectId string - used to fetch property policies
});

/** GET /v1/guests/summary - query params */
export const getSummarySchema = z.object({
    listingId: z.string().min(1, "listingId is required"),
    from: isoDateString,
    to: isoDateString,
});

/** POST /v1/guests/summary - generate AI summary */
export const generateSummarySchema = z.object({
    listingId: z.number().int().positive("listingId must be a positive integer"),
    dateFrom: isoDateString,
    dateTo: isoDateString,
});

// ─────────────────────────────────────────────────────────
// Auth Schemas
// ─────────────────────────────────────────────────────────

/** POST /v1/auth/login */
export const loginSchema = z.object({
    username: z.string().min(1, "Username is required").max(100),
    password: z.string().min(6, "Password must be at least 6 characters").max(128),
});

/** POST /v1/auth/refresh */
export const refreshSchema = z.object({
    refreshToken: z.string().min(1, "Refresh token is required"),
});

// ─────────────────────────────────────────────────────────
// Property Schemas
// ─────────────────────────────────────────────────────────

/** GET /v1/properties */
export const getPropertiesSchema = z.object({
    search: z.string().optional(),
    status: z.enum(["active", "inactive", "all"]).optional().default("active"),
});

/** GET /v1/properties/{id} */
export const getPropertySchema = z.object({
    id: z.string().min(1, "Id is required"),
});

// ─────────────────────────────────────────────────────────
// AI Chat Schemas
// ─────────────────────────────────────────────────────────

/** POST /v1/ai/chat */
export const chatRequestSchema = z.object({
    message: z.string().min(1, "Message is required"),
    sessionId: z.string().optional(),
    context: z.object({
        type: z.enum(["portfolio", "property"]),
        propertyId: z.number().optional(),
        propertyName: z.string().optional(),
        metrics: z.object({
            occupancy: z.number(),
            bookedDays: z.number(),
            availableDays: z.number(),
            blockedDays: z.number(),
            totalDays: z.number(),
            bookableDays: z.number(),
            avgPrice: z.number(),
        }).optional(),
    }),
    dateRange: z.object({
        from: isoDateString,
        to: isoDateString,
    }).optional(),
});

// ─────────────────────────────────────────────────────────
// System Sync Schemas
// ─────────────────────────────────────────────────────────

/** POST /v1/system/sync */
export const triggerSyncSchema = z.object({
    entity: z.enum(["all", "listings", "reservations", "calendar", "messages"]).default("all"),
    listingId: z.number().optional(),
});

/** GET /v1/system/sync/status */
export const syncStatusSchema = z.object({
    jobId: z.string().min(1, "Job ID is required"),
});

// ─────────────────────────────────────────────────────────
// Revenue & Proposals Schemas
// ─────────────────────────────────────────────────────────

/** GET /v1/revenue/proposals */
export const getProposalsSchema = z.object({
    listingId: z.string().optional(),
    status: z.enum(["pending", "approved", "rejected", "applied", "all"]).default("all"),
});

/** POST /v1/revenue/proposals/bulk */
export const bulkProposalActionSchema = z.object({
    ids: z.array(z.number()).min(1, "At least one ID is required"),
    action: z.enum(["approve", "reject", "apply", "push", "save"]),
});

// ─────────────────────────────────────────────────────────
// Helper: Extract Zod errors into { field: message } map
// ─────────────────────────────────────────────────────────

export function formatZodErrors(error: z.ZodError): Record<string, string> {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
        const path = issue.path.join(".");
        fieldErrors[path || "_root"] = issue.message;
    }
    return fieldErrors;
}
