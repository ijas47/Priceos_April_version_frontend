const TAG = "[AgentTools]";

type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

function ts(): string {
  return new Date().toISOString();
}

function fmt(level: LogLevel, endpoint: string, msg: string, meta?: Record<string, unknown>): string {
  const base = `${ts()} ${TAG} [${level}] ${endpoint} - ${msg}`;
  if (meta && Object.keys(meta).length > 0) {
    return `${base} | ${JSON.stringify(meta)}`;
  }
  return base;
}

function sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const clean = { ...params };
  if (clean.apiKey) clean.apiKey = "***";
  if (clean.token) clean.token = "***";
  return clean;
}

export const toolLogger = {
  reqStart(endpoint: string, method: string, params: Record<string, unknown>) {
    console.log(fmt("INFO", endpoint, `⟶  ${method} request received`, sanitizeParams(params)));
  },

  authSuccess(endpoint: string, orgId: string, source: "api_key" | "session_cookie") {
    console.log(fmt("INFO", endpoint, `✓ Auth OK (${source})`, { orgId }));
  },

  authFail(endpoint: string, reason: string) {
    console.warn(fmt("WARN", endpoint, `✗ Auth FAILED`, { reason }));
  },

  validationOk(endpoint: string, parsed: Record<string, unknown>) {
    console.log(fmt("DEBUG", endpoint, `✓ Params validated`, sanitizeParams(parsed)));
  },

  validationFail(endpoint: string, errors: unknown) {
    console.warn(fmt("WARN", endpoint, `✗ Validation failed`, { errors }));
  },

  dbConnect(endpoint: string) {
    console.log(fmt("DEBUG", endpoint, `⟶  Connecting to MongoDB`));
  },

  dbQuery(endpoint: string, collection: string, operation: string, filter: Record<string, unknown>) {
    console.log(fmt("DEBUG", endpoint, `⟶  DB ${operation}`, { collection, filter: sanitizeParams(filter) }));
  },

  dbResult(endpoint: string, collection: string, operation: string, meta: Record<string, unknown>) {
    console.log(fmt("INFO", endpoint, `⟵  DB ${operation} done`, { collection, ...meta }));
  },

  dbSave(endpoint: string, collection: string, operation: string, meta: Record<string, unknown>) {
    console.log(fmt("INFO", endpoint, `✓ DB ${operation}`, { collection, ...meta }));
  },

  serviceCall(endpoint: string, serviceFn: string) {
    console.log(fmt("DEBUG", endpoint, `⟶  Calling ${serviceFn}()`));
  },

  serviceResult(endpoint: string, serviceFn: string, meta: Record<string, unknown>) {
    console.log(fmt("INFO", endpoint, `⟵  ${serviceFn}() returned`, meta));
  },

  resSuccess(endpoint: string, statusCode: number, durationMs: number, meta?: Record<string, unknown>) {
    console.log(fmt("INFO", endpoint, `✓ ${statusCode} OK (${durationMs}ms)`, meta));
  },

  resError(endpoint: string, statusCode: number, code: string, message: string, durationMs: number) {
    console.error(fmt("ERROR", endpoint, `✗ ${statusCode} ${code} (${durationMs}ms)`, { message }));
  },

  externalCall(endpoint: string, service: string, url: string) {
    console.log(fmt("INFO", endpoint, `⟶  External call to ${service}`, { url }));
  },

  externalResult(endpoint: string, service: string, statusCode: number, durationMs: number) {
    console.log(fmt("INFO", endpoint, `⟵  ${service} responded ${statusCode} (${durationMs}ms)`));
  },
};
