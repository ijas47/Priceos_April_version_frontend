import type { NextConfig } from "next";

const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
const backendOrigin = backendUrl.replace(/\/api\/?$/, "") || backendUrl;

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `connect-src 'self' wss://metrics.studio.lyzr.ai https://agent-prod.studio.lyzr.ai ${backendOrigin} http://localhost:8000 http://localhost:3000`,
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // ── Security headers on all routes ──────────────────────────────────────────
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },

  // ── Image optimisation ───────────────────────────────────────────────────────
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" }, // tighten to specific hostnames before launch
    ],
    formats: ["image/avif", "image/webp"],
  },

  // ── Production hardening ─────────────────────────────────────────────────────
  compress: true,

  // Strip React source maps in production to avoid leaking component names
  productionBrowserSourceMaps: false,

  // Fail build on TypeScript errors — never ship broken code
  typescript: { ignoreBuildErrors: false },

  // Server-side packages that must not be bundled into client chunks
  // (mongoose removed - no longer used in frontend)
  serverExternalPackages: [],

  // Anchor webpack's file tracing to this directory, preventing it from
  // crawling to /Original_priceos and failing to resolve tailwindcss
  outputFileTracingRoot: __dirname,

  // ── API Rewrites ────────────────────────────────────────────────────────────
  // Proxies unmatched /api/* to the FastAPI backend.
  // Next.js API routes (src/app/api/*) take precedence; only unmatched paths proxy.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },

  // ── Docker optimization ────────────────────────────────────────────────────
  output: 'standalone',
};

export default nextConfig;
