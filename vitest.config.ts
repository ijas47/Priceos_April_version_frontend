import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Playwright e2e (if any) is not run by vitest.
    exclude: ["node_modules/**", ".next/**"],
  },
});
