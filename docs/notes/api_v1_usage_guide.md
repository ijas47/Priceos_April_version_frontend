# PriceOS API v1: Complete Developer Documentation

This document provides a highly detailed, endpoint-by-endpoint breakdown of the PriceOS v1 API. 

It closely follows the **API Design Best Practices** (as defined by `@api-design`), ensuring concepts like RESTful Resource Naming, Idiomatic HTTP Methods, Standardized Enveloping, Zod Schema Validation, and JWT Authentication are consistently applied across all domains.

---

## 🏛️ General API Concepts

Before documenting each endpoint, here are the global rules that apply to the entire `v1` backend:

1. **Base URL**: `http://localhost:3000/api/v1`
   > 🎯 **Best Practice Applied**: **API Versioning**. By prefixing routing with `/v1/`, we ensure backwards compatibility. If the payload format changes later, we can introduce `/v2/` without breaking existing mobile or web clients.
2. **Authentication**: All protected requests require the `Authorization` header:
   * `Authorization: Bearer <ACCESS_TOKEN>`
   > 🎯 **Best Practice Applied**: **Stateless JWT Security**. Eliminates the need for database session lookups on every request, improving horizontal scalability.
3. **Content-Type**: All requests with a body must include:
   * `Content-Type: application/json`
4. **Standard Enveloping**: Every response (success or failure) follows an exact JSON structure natively.
   > 🎯 **Best Practice Applied**: **Consistent Response Schema**. Front-end engineers never have to guess where the data or error messages live.

**Success Response Envelope:**
```json
{
  "status": "success",
  "data": { ... resource specific payload ... },
  "metadata": {
    "requestId": "req_88f9a2b",
    "timestamp": "2026-03-09T10:05:00.000Z"
  }
}
```

**Error Response Envelope:**
```json
{
  "status": "error",
  "error": {
    "code": "VALIDATION_ERROR | UNAUTHORIZED | RATE_LIMITED | INTERNAL_ERROR",
    "message": "Human readable error message",
    "details": { "optional_field": "Optional specific validation errors" }
  },
  "metadata": {
    "requestId": "req_99g0b3c",
    "timestamp": "2026-03-09T10:05:01.000Z"
  }
}
```

---

## 🔐 1. Authentication Domain

### 1.1 Login (Create Session)
> **`POST` `/api/v1/auth/login`**

* **Concept Application**: `POST` is used to submit credentials. Even though it acts as a "Read" to verify the user, it technically *Creates* a new session in our PostgreSQL database (Refresh Token) and *Generates* new JWTs.
* **Rate Limit Tier**: Auth Tier (10 requests per minute)
* **Zod Validation**: Requires string `username` and minimum 6-character `password`.
* 🎯 **Best Practices Applied at this stage**: 
  - **Rate Limiting**: Protects against brute-force password guessing.
  - **Bcrypt Hashing**: Passwords are mathematically hashed, so the server never stores plain text.
  - **Fail Fast (Zod)**: Stops requests with `< 6` character passwords before they even touch the database.

**Request Example:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "ram@gmail.com",
    "password": "Password@123"
  }'
```

---

### 1.2 Refresh Access Token
> **`POST` `/api/v1/auth/refresh`**

* **Concept Application**: `POST` is used to create a *brand new* access token. It modifies the authentication state of the client.
* 🎯 **Best Practices Applied at this stage**: **Token Rotation**. Keeps Access Tokens short-lived (15 mins) for extreme security, while the Refresh Token creates user convenience.

**Request Example:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }'
```

---

## 🏢 2. Properties Domain

### 2.1 List Properties
> **`GET` `/api/v1/properties`**

* **Concept Application**: `GET` is used because this is an idempotent retrieval of a list of resources. 
* 🎯 **Best Practices Applied at this stage**: 
  - **Resource Naming**: We use the noun `/properties`, not the action verb `/getProperties`.
  - **Query Filtering**: We manage search parameters gracefully in the URL Query String (`?search=`), keeping the `GET` body empty according to the HTTP standard.

**Request Example:**
```bash
curl -X GET "http://localhost:3000/api/v1/properties?search=Dubai&status=active" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

---

## 👤 3. Guest Inbox Domain

### 3.1 Fetch Guest Conversations
> **`GET` `/api/v1/guests/conversations`**

* **Concept Application**: `GET` is used for retrieving a list of conversations related to a specific property and date range.
* 🎯 **Best Practices Applied at this stage**:
  - **Strict Input Typing**: Zod forces `listingId` to be parsed as an integer. Strings are rejected early, preventing `NaN` backend errors.

**Request Example:**
```bash
curl -X GET "http://localhost:3000/api/v1/guests/conversations?listingId=1&from=2026-02-01&to=2026-03-31" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

---

### 3.2 Generate AI Suggestion
> **`POST` `/api/v1/guests/suggest`**

* **Concept Application**: `POST` is used because this strictly triggers an AI agent to *compute and create* a new block of text that did not previously exist.
* 🎯 **Best Practices Applied at this stage**:
  - **Tiered Rate Limiting (AI Tier)**: LLMs are expensive. This endpoint is limited to 20/min to stop abuse while allowing normal traffic to flow through the rest of the API.
  - **Graceful Fallback**: If the Lyzr API goes down, the endpoint doesn't break; it catches the error and returns a pre-formatted template string so the client UI never crashes.

**Request Example:**
```bash
curl -X POST http://localhost:3000/api/v1/guests/suggest \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Can we get an early check-in at 10 AM?",
    "listingId": "1"
  }'
```

---

### 3.3 Generate Guest Summary
> **`POST` `/api/v1/guests/summary`**

* 🎯 **Best Practices Applied at this stage**: **Map-Reduce Orchestration**. Big data requires complex handling. Instead of stuffing 10,000 messages into one AI prompt (which would crash or time out), the backend splits the data, runs parallel maps, and reduces them into one executive summary.

---

## 🤖 4. AI Chat & Revenue Domain

### 4.1 Orchestrator Agent Chat
> **`POST` `/api/v1/ai/chat`**

* **Concept Application**: `POST` creates a new chat turn in the session history and returns a generated response from the Orchestrator engine.
* 🎯 **Best Practices Applied at this stage**:
  - **Stateless Server Architecture**: By requiring the client to send the `context` payload in the generic shape of the API, the backend does not need to store expensive "in-memory" state for thousands of users concurrently.

**Request Example:**
```bash
curl -X POST http://localhost:3000/api/v1/ai/chat \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is my occupancy rate?",
    "sessionId": "property-1-session",
    "context": {
      "type": "property",
      "propertyId": 1
    }
  }'
```

---

### 4.2 Bulk Proposal Actions
> **`POST` `/api/v1/revenue/proposals/bulk`**

* **Concept Application**: Using `POST` for bulk actions. Why not `PUT` or `PATCH`? `PATCH` is usually for updating a single resource. When applying the **Batch Operations** design pattern from the `@api-design` skill, we use `POST /endpoint/bulk` to submit a large array of IDs and the `action` intended to modify them all at once.
* 🎯 **Best Practices Applied at this stage**: **Batch processing**. A single HTTP request handles 50 updates at once, reducing network bloat and lowering server CPU load dramatically.

**Request Example:**
```bash
curl -X POST http://localhost:3000/api/v1/revenue/proposals/bulk \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "ids": [45, 46, 47],
    "action": "approve"
  }'
```

---

## 🔁 5. System Domain

### 5.1 Trigger Background Sync
> **`POST` `/api/v1/system/sync`**

* **Concept Application**: `POST` creates a new background job on the external Python server. It acts as an RPC (Remote Procedure Call) proxy.
* 🎯 **Best Practices Applied at this stage**: **Secure Proxying**. The frontend never talks to the Python backend directly. Our Next.js server acts as an intermediary, injecting the JWT Auth and preventing the client from bypassing the severe Rate Limiting rules protecting the Python script.

**Request Example:**
```bash
curl -X POST http://localhost:3000/api/v1/system/sync \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "entity": "reservations",
    "listingId": 1
  }'
```

---
---

## 🏆 Summary of All API Concepts & Best Practices Used

Here is the master list of all industrial-grade concepts used across the backend implementation:

1. **API Versioning (`/v1`)**: Future-proofs the software so mobile clients don't break when a v2 schema is launched.
2. **Resource-Oriented REST Naming**: Resources are Plural Nouns (`/properties`, `/guests/conversations`). We avoid Verbs in URLs.
3. **Idiomatic HTTP Methods**: 
    - `GET` for idempotent, repeatable reads without side effects.
    - `POST` for creating resources, AI generative tasks, and batch operations.
4. **Standardized JSON Enveloping**: Every response carries `status`, `data` or `error`, and `metadata` (with a strict `requestId`).
5. **Schema-First Validation (Zod)**: Known as the "Fail Fast" rule. Bad data never hits the database or the AI cost-center. It's blocked at the very first layer.
6. **Stateless JWT Authorization**: Uses `Authorization: Bearer <Token>`. Fast, cryptographically secure, and horizontally scalable.
7. **Token Rotation Security**: Hardened security using short-lived 15-minute Access Tokens with a 7-day Stateful Refresh Token stored in the DB for manual revocation.
8. **Bcrypt Algorithms**: Used to "salt and pepper" user passwords before insertion to the database.
9. **In-Memory Token Bucket Rate Limiting**: An engineering pattern that tracks IPs and blocks abusers. 
10. **Tiered Throttling Limits**: Giving standard DB lookups 60req/min, while strictly capping expensive AI tasks to 20req/min and Auth checks to 10req/min.
11. **Map-Reduce Orchestration**: A Big Data processing paradigm to split large data contexts (conversations/messages) into parallel jobs and "reducing" them back into a single summary.
12. **Defensive API Proxying**: Funneling heavy requests intended for Python workers through the secure Next.js validation layer first.
13. **Graceful Fallbacks**: Enforcing that the AI endpoints return reliable templates rather than breaking exceptions during upstream provider failures.
