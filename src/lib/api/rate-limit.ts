/**
 * ═══════════════════════════════════════════════════════════
 * PriceOS API - In-Memory Rate Limiter (Token Bucket)
 * 
 * Algorithm: Token Bucket
 * - Each IP starts with `maxTokens` tokens
 * - Each request consumes 1 token
 * - Tokens refill at `refillRate` per `refillIntervalMs`
 * - If no tokens left → 429 Too Many Requests
 * 
 * This is an in-memory implementation suitable for single-instance
 * deployments (Vercel serverless). For multi-instance, use Redis.
 * ═══════════════════════════════════════════════════════════
 */

interface TokenBucket {
    tokens: number;
    lastRefill: number;
}

interface RateLimitConfig {
    /** Maximum tokens (requests) allowed per window */
    maxTokens: number;
    /** Tokens added per refill */
    refillRate: number;
    /** Time between refills in ms */
    refillIntervalMs: number;
}

// ── Default: 60 requests per minute ──
const DEFAULT_CONFIG: RateLimitConfig = {
    maxTokens: 60,
    refillRate: 60,
    refillIntervalMs: 60_000, // 1 minute
};

// ── In-memory store (resets on cold start) ──
const buckets = new Map<string, TokenBucket>();

// ── Cleanup: remove stale entries every 5 minutes ──
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL) return;

    lastCleanup = now;
    const staleThreshold = now - DEFAULT_CONFIG.refillIntervalMs * 5;
    for (const [key, bucket] of buckets) {
        if (bucket.lastRefill < staleThreshold) {
            buckets.delete(key);
        }
    }
}

/**
 * Check if a request from the given identifier should be allowed.
 * 
 * @param identifier - Usually the client IP address
 * @param config - Optional custom rate limit config
 * @returns Object with `allowed`, `remaining`, `resetMs`
 * 
 * @example
 * const result = checkRateLimit(clientIp);
 * if (!result.allowed) {
 *   return apiError("RATE_LIMITED", "Too many requests", 429);
 * }
 */
export function checkRateLimit(
    identifier: string,
    config: RateLimitConfig = DEFAULT_CONFIG
): { allowed: boolean; remaining: number; limit: number; resetMs: number } {
    cleanup();

    const now = Date.now();
    let bucket = buckets.get(identifier);

    if (!bucket) {
        // First request from this identifier
        bucket = { tokens: config.maxTokens, lastRefill: now };
        buckets.set(identifier, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    if (elapsed >= config.refillIntervalMs) {
        bucket.tokens = config.maxTokens;
        bucket.lastRefill = now;
    } else {
        // Partial refill
        const tokensToAdd = Math.floor((elapsed / config.refillIntervalMs) * config.refillRate);
        bucket.tokens = Math.min(config.maxTokens, bucket.tokens + tokensToAdd);
        if (tokensToAdd > 0) bucket.lastRefill = now;
    }

    // Consume a token
    if (bucket.tokens > 0) {
        bucket.tokens -= 1;
        return {
            allowed: true,
            remaining: bucket.tokens,
            limit: config.maxTokens,
            resetMs: config.refillIntervalMs - (now - bucket.lastRefill),
        };
    }

    // No tokens left
    return {
        allowed: false,
        remaining: 0,
        limit: config.maxTokens,
        resetMs: config.refillIntervalMs - (now - bucket.lastRefill),
    };
}

/**
 * Extract client IP from request headers.
 * Works with Vercel, Cloudflare, and standard proxies.
 */
export function getClientIp(request: Request): string {
    const headers = new Headers(request.headers);
    return (
        headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        headers.get("x-real-ip") ||
        headers.get("cf-connecting-ip") ||
        "unknown"
    );
}

/**
 * Pre-built rate limit configs for different API tiers.
 */
export const RATE_LIMITS = {
    /** Standard API endpoints: 60 req/min */
    standard: DEFAULT_CONFIG,
    /** AI-heavy endpoints (chat, suggest, summary): 20 req/min */
    ai: { maxTokens: 20, refillRate: 20, refillIntervalMs: 60_000 },
    /** Auth endpoints (login, refresh): 10 req/min */
    auth: { maxTokens: 10, refillRate: 10, refillIntervalMs: 60_000 },
    /** Sync/heavy compute: 5 req/min */
    heavy: { maxTokens: 5, refillRate: 5, refillIntervalMs: 60_000 },
} as const;
