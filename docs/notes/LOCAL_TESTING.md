# Local Testing Guide - Lyzr ADK Migration

## Prerequisites

- Python 3.11+
- Node.js 18+
- Neon Postgres database (existing)
- Lyzr API key

---

## Part 1: Python Backend Setup

### 1.1 Navigate to API directory

```bash
cd ~/.config/superpowers/worktrees/priceos/lyzr-adk-migration/api
```

### 1.2 Create Python virtual environment

```bash
python3 -m venv venv
source venv/bin/activate  # On macOS/Linux
# OR
venv\Scripts\activate  # On Windows
```

### 1.3 Install dependencies

```bash
pip install -r requirements.txt
```

Expected output:
```
Successfully installed fastapi-0.109.0 uvicorn-0.27.0 lyzr-adk-0.1.5 ...
```

### 1.4 Create .env file

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```bash
# Database (copy from app/.env.local if you have it)
DATABASE_URL=postgresql://user:pass@host/neondb?sslmode=require

# Lyzr ADK (optional - will be fetched from user_settings table)
LYZR_API_KEY=sk_your_lyzr_key  # For testing only
LYZR_ENV=prod

# Hostaway (optional)
HOSTAWAY_API_KEY=
HOSTAWAY_MODE=db

# CORS
ALLOWED_ORIGINS=["http://localhost:3000"]

# Debug mode (set to true for testing)
DEBUG=true
LOG_LEVEL=info
```

### 1.5 Test Python backend startup

```bash
uvicorn api.main:app --reload --port 8000
```

Expected output:
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

### 1.6 Test health endpoint

Open another terminal:

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "priceos-agent-backend"
}
```

### 1.7 Test detailed health check

```bash
curl http://localhost:8000/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "priceos-agent-backend",
  "database": "connected",
  "lyzr_adk": "available"
}
```

✅ **If all checks pass, Python backend is ready!**

---

## Part 2: Next.js Frontend Setup

### 2.1 Navigate to app directory

```bash
cd ~/.config/superpowers/worktrees/priceos/lyzr-adk-migration/app
```

### 2.2 Install dependencies (if not already done)

```bash
npm install
```

### 2.3 Update .env.local

Add the Python backend URL:

```bash
# Add to existing .env.local
PYTHON_BACKEND_URL=http://localhost:8000
```

### 2.4 Start Next.js dev server

```bash
npm run dev
```

Expected output:
```
▲ Next.js 16.1.6 (Turbopack)
- Local:        http://localhost:3000
✓ Ready in 794ms
```

✅ **Both servers should now be running!**

---

## Part 3: End-to-End Testing

### 3.1 Test Agent Endpoint (Python Backend)

**Test CRO Agent directly:**

```bash
curl -X POST http://localhost:8000/api/agent \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Tell me about the pricing system",
    "agent_id": "cro",
    "user_id": "test_user_123"
  }'
```

**Expected behavior:**
- ❌ Should fail with "Lyzr API key not configured" (expected - user doesn't exist in DB)

**To test successfully, you need to:**
1. Add your user to the `user_settings` table with a Lyzr API key
2. OR use the Settings page in the UI

### 3.2 Add Test User to Database

Connect to your Neon database and run:

```sql
INSERT INTO user_settings (user_id, lyzr_api_key, created_at, updated_at)
VALUES ('test_user_123', 'sk_your_actual_lyzr_key', NOW(), NOW());
```

Then retry the curl command above.

**Expected success response:**
```json
{
  "success": true,
  "response": {
    "success": true,
    "response": "The pricing system uses AI agents to...",
    "session_id": "session-test_user_123",
    "status": "completed"
  },
  "agent_id": "cro",
  "session_id": "session-test_user_123",
  "user_id": "test_user_123"
}
```

### 3.3 Test via Next.js Frontend

1. **Open browser:** http://localhost:3000
2. **Sign in** with your Neon Auth credentials
3. **Go to Settings:** http://localhost:3000/settings
4. **Add your Lyzr API key** in the "Lyzr AI Configuration" section
5. **Click "Save"**
6. **Go to Dashboard:** http://localhost:3000/dashboard
7. **Try the chat interface:**
   - Type: "What should I price Marina Heights for next weekend?"
   - Press Enter

**Expected behavior:**
1. Request goes to Next.js `/api/agent`
2. Next.js proxies to Python `http://localhost:8000/api/agent`
3. Python fetches your Lyzr API key from database
4. Python initializes CRO Agent
5. CRO Agent processes your message
6. Response flows back to UI

**Check browser console** for any errors.

**Check Python backend logs** for:
```
INFO:     Initializing CRO agent for user <your_user_id>
INFO:     Running agent with message: What should I price Marina Heights...
INFO:     CRO processing message for session <session_id>
```

### 3.4 Test Data Sync Endpoint

**Via Python backend:**

```bash
curl -X POST http://localhost:8000/api/sync \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test_user_123",
    "listing_id": 1,
    "context": "property"
  }'
```

**Expected response:**
```json
{
  "success": true,
  "synced": {
    "listings": 1,
    "calendar_days": 0,
    "reservations": 0
  },
  "timestamp": "2026-02-17T...",
  "message": "Synced listing 1"
}
```

---

## Part 4: Troubleshooting

### Issue: "lyzr_api_key not configured"

**Solution:**
1. Go to http://localhost:3000/settings
2. Add your Lyzr API key
3. Click "Save"
4. Verify in database:
   ```sql
   SELECT user_id, lyzr_api_key FROM user_settings;
   ```

### Issue: "Database connection error"

**Check:**
1. `DATABASE_URL` is correct in `api/.env`
2. Neon database is accessible
3. Test connection:
   ```bash
   psql "$DATABASE_URL" -c "SELECT 1"
   ```

### Issue: "Module 'lyzr' not found"

**Solution:**
```bash
cd api
source venv/bin/activate  # Activate virtual environment
pip install lyzr-adk==0.1.5
```

### Issue: Next.js can't reach Python backend

**Check:**
1. Python backend is running on port 8000
2. `PYTHON_BACKEND_URL=http://localhost:8000` in `app/.env.local`
3. CORS is configured correctly (should allow localhost:3000)

### Issue: Agent timeout or slow response

**This is normal:**
- First request may take 3-5 seconds (agent initialization)
- Subsequent requests should be faster (1-2 seconds)
- Check Python logs for agent activity

---

## Part 5: Verification Checklist

Test each item and check off when working:

### Python Backend
- [ ] Health check returns "healthy"
- [ ] Database connection successful
- [ ] lyzr-adk import successful
- [ ] Agent endpoint accepts requests
- [ ] Sync endpoint accepts requests

### Next.js Frontend
- [ ] Dev server starts without errors
- [ ] Settings page loads
- [ ] Can save Lyzr API key
- [ ] Dashboard page loads
- [ ] Chat interface renders

### Integration
- [ ] Chat message reaches Python backend
- [ ] Python backend fetches API key from database
- [ ] CRO Agent initializes successfully
- [ ] Agent response returns to frontend
- [ ] Response displays in chat UI

### Agents
- [ ] CRO Agent responds to messages
- [ ] Data Sync Agent can check cache staleness
- [ ] Event Intelligence Agent can analyze events
- [ ] Pricing Analyst Agent can access listings

---

## Part 6: Performance Monitoring

### Check Python Backend Logs

Watch for these patterns:

**Good:**
```
INFO: Initializing CRO agent for user <user_id>
INFO: Running agent with message: <message>
INFO: CRO processing message for session <session_id>
```

**Errors to watch for:**
```
ERROR: Failed to initialize Lyzr Studio: <error>
ERROR: Error running agent: <error>
ERROR: Database session error: <error>
```

### Check Next.js Logs

**Good:**
```
POST /api/agent 200 in 1.5s
```

**Errors:**
```
POST /api/agent 500 in 100ms
```

---

## Success Criteria

✅ **Migration is successful when:**

1. Python backend starts without errors
2. Health checks all pass
3. Agent endpoint returns responses
4. Next.js successfully proxies to Python
5. Chat messages get agent responses
6. No console errors in browser
7. Database queries work from Python
8. User API keys are fetched correctly

---

## Next Steps After Successful Testing

Once local testing passes:

1. **Commit your changes** to the feature branch
2. **Merge to dev branch** for staging deployment
3. **Deploy to Vercel** for production testing
4. **Monitor performance** in production
5. **Gather user feedback**

---

## Support

If you encounter issues:

1. Check Python backend logs
2. Check Next.js console
3. Check browser DevTools Network tab
4. Review this guide's troubleshooting section
5. Verify environment variables
6. Ensure all dependencies are installed
