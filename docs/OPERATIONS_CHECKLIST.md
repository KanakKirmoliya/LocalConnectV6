# NearNest — Production Operations & Zero-Cost Architecture Runbook

**Hosting Budget:** $0.00 / Month (Strictly Free Tiers)  
**Target Architecture:**
- **Client (Web SPA):** Vercel / Netlify Free Hobby Tier
- **Backend (Node.js API):** Render / Railway / Fly.io Free Web Service or Self-Hosted VPS
- **Database:** MongoDB Atlas M0 (512MB Free Tier)

---

## 1. Zero-Cost Infrastructure Architecture

```
┌─────────────────────────────────┐
│     User Browser / Mobile       │
└──────────────┬──────────────────┘
               │ HTTPS (TLS 1.3)
               ▼
┌─────────────────────────────────┐
│     Client Web SPA (Vercel)     │  Free Tier: 100GB Bandwidth/mo
└──────────────┬──────────────────┘
               │ REST API / WebSockets
               ▼
┌─────────────────────────────────┐
│   Backend Node.js (Render/VPS)  │  Free Tier: 512MB RAM, Auto-sleep / Free dyno
└──────────────┬──────────────────┘
               │ Encrypted Connection String
               ▼
┌─────────────────────────────────┐
│   MongoDB Atlas M0 Free Cluster │  Free Tier: 512MB Storage, Shared RAM
└─────────────────────────────────┘
```

---

## 2. Pre-Flight Production Checklist

Before executing a public deployment or release:

- [ ] **Environment Variables Audit:**
  - `NODE_ENV=production`
  - `PORT=5000`
  - `JWT_SECRET` set to a high-entropy 64-character random string (never default test secret).
  - `MONGO_URI` configured with secure user credentials and restricted network access.
  - `CLIENT_ORIGIN` locked to production domain (e.g., `https://nearnest.vercel.app`).
- [ ] **Data Sanitization & Privacy:**
  - PII-sanitized logging middleware active in `server/src/middleware/logger.js`.
  - Account deletion cascade tested (`DELETE /api/auth/me`).
  - Privacy policy accessible at `/privacy`.
- [ ] **Storage Quotas & Media Safeguards:**
  - Upload file size capped at 5MB per image in Multer middleware.
  - File types restricted to `image/jpeg`, `image/png`, `image/webp`.
  - Media directories configured with backup snapshots.
- [ ] **Health & Liveness Probes:**
  - Probe URL: `GET /api/v1/health`
  - Expected Response: `HTTP 200 OK` with `"database": "connected"`.

---

## 3. Production Incident Response Protocols

### Incident 1: MongoDB Connection Drop / Cluster Sleep
- **Symptom:** API returns 500 errors with `MongooseError: connection timed out`.
- **Diagnostic:** Probe `/api/v1/health` -> `"database": "disconnected"`.
- **Action:**
  1. Check MongoDB Atlas status page (`status.mongodb.com`).
  2. Verify Atlas Network Access IP allowlist includes current server outbound IP.
  3. Mongoose automatic reconnect pool will reconnect automatically once network recovers.

### Incident 2: Malicious / Scam Listing Spike
- **Symptom:** Community users submit multiple reports for fraudulent token money demands.
- **Action:**
  1. Admin navigates to `/admin` -> **Abuse & Reports** tab.
  2. Inspect report details, reporter ID, and target evidence.
  3. Click **Hide Listing** immediately to remove listing from public discovery.
  4. If user is a repeat offender, click **Ban User** to revoke access and drop all active listings.

### Incident 3: Data Restoration Requirement
- **Action:** Follow `docs/DISASTER_RECOVERY.md` runbook to execute instant sandbox verification and production restore.
