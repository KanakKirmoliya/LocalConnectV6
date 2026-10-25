# NearNest — Zero-Budget Deployment Guide

**Target Budget**: $0.00 / month (100% Free-Tier Architecture)  
**Target Platform Tier**: Community / Student Developer Pilot  
**Security Standard**: HTTPS-Only, Environment Secrets, Production Fail-Closed  

---

## 1. Architectural Architecture & Free-Tier Selection

```
+-------------------------------------------------------------+
|                      Client Layer                           |
|  [Vercel / Netlify Free]       [Expo Go / Android APK]      |
|  React 18 + Vite SPA           React Native (TypeScript)    |
+------------------------------+------------------------------+
                               | HTTPS / WSS
                               v
+-------------------------------------------------------------+
|                   Backend API Layer                         |
|  [Render / Railway Free Web Service]                        |
|  Node.js + Express 4                                        |
|  - CORS restricted to Vercel domain                         |
|  - JWT Auth + express-rate-limit                            |
|  - Ephemeral Disk: Uploads served or proxied                |
+------------------------------+------------------------------+
                               | TLS (SRV)
                               v
+-------------------------------------------------------------+
|                   Data & Persistence Layer                  |
|  [MongoDB Atlas M0 Free Tier]                               |
|  - 512 MB Storage                                           |
|  - Automated replica set with TLS 1.2+                      |
|  - GeoJSON 2dsphere indexing                                |
+-------------------------------------------------------------+
```

---

## 2. Platform Comparison & Trade-Offs

| Component | Recommended Free Provider | Free Tier Quota | Cold-Start / Sleep Behavior | Limitations & Mitigations |
|---|---|---|---|---|
| **Web Client** | **Vercel** / **Netlify** | 100GB bandwidth/month, unlimited builds | 0s (Instant Edge CDN) | Single-page application router requires `vercel.json` rewrite (`/*` -> `/index.html`). |
| **Backend API** | **Render Free Web Service** | 750 free instance hours/month, 512MB RAM | Sleeps after 15 mins of inactivity (~40s cold start on first request) | Free tier includes ephemeral filesystem (disk resets on restart/redeploy). For persistent media, see Section 3. |
| **Database** | **MongoDB Atlas M0** | 512MB storage, shared RAM | 24/7 always on; zero sleep | Max 500 connections; whitelist IP `0.0.0.0/0` with strong password credentials. |
| **Mobile App** | **Expo Application Services (EAS)** | Free tier includes 30 Android cloud builds/month | N/A (runs natively on device) | Distributed via Expo Go QR code or direct APK build download for Android users. |

---

## 3. Persistent Media Storage Strategy

### Ephemeral Disk Warning
On Render and Railway free tiers, the local `/uploads` directory is **ephemeral**. When the backend restarts, redeploys, or wakes up from sleep, any files uploaded to local disk are wiped unless configured on a persistent volume.

The repository currently uses local disk only; Cloudinary and Supabase are options described below, not integrated providers. Do not rely on hosted uploads for production until persistent storage has been implemented and verified.

### Zero-Budget Solutions:
1. **Option A (Initial Pilot / Zero Setup)**:
   - Continue serving from `server/uploads/` for local and staging evaluation.
   - For demo presentations, ensure media is re-uploaded or bundled.
2. **Option B (Recommended for Production Pilot: Cloudinary Free Tier)**:
   - 25 GB monthly storage & bandwidth.
   - Built-in automatic image optimization and CDN delivery.
   - Zero cost with no credit card required.
3. **Option C (Supabase Storage Free Tier)**:
   - 1 GB free persistent S3-compatible object storage.

---

## 4. Step-by-Step Production Deployment

### Step 1: Deploy Web Frontend to Vercel
1. Push latest approved commits to GitHub repository.
2. Log into [vercel.com](https://vercel.com) using your GitHub account.
3. Click **Add New Project** and select `Bhupeshsinghsamant/NearNest`.
4. Configure Project Settings:
   - **Root Directory**: `client`
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Add Environment Variables:
   - `VITE_API_URL`: `https://your-backend.onrender.com`
6. Click **Deploy**. Vercel will assign an HTTPS URL (e.g. `https://nearnest.vercel.app`).

### Step 2: Deploy Backend API to Render
1. Log into [render.com](https://render.com).
2. Click **New +** -> **Web Service**.
3. Connect your GitHub repository.
4. Configure Settings:
   - **Name**: `nearnest-api`
   - **Root Directory**: `server`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
   - **Plan Type**: `Free`
5. Configure Environment Variables:
   - `NODE_ENV`: `production`
   - `PORT`: `10000` (Render binds to this automatically)
   - `MONGODB_URI`: *Your existing Atlas connection string*
   - `JWT_SECRET`: *Generate a 64-character random string via `openssl rand -hex 32`*
   - `CORS_ORIGIN`: `https://nearnest.vercel.app` (comma-separated allowlist for every trusted web origin)
6. Click **Create Web Service**.

### Step 3: MongoDB Atlas Network Whitelist
1. Log into [cloud.mongodb.com](https://cloud.mongodb.com).
2. Navigate to **Network Access**.
3. Ensure IP Whitelist includes `0.0.0.0/0` (Allow Access from Anywhere) so Render dynamic IP addresses can establish database connections securely over TLS.

---

## 5. Production Verification & Smoke Test Checklist

The server allows requests without an `Origin` header (native clients and command-line tools), but browser cross-origin access is restricted to `CORS_ORIGIN`. Set this variable to the exact production web origin(s); an empty production allowlist blocks browser cross-origin access.

Once deployed, verify:
- [ ] `GET https://nearnest-api.onrender.com/api/v1/health` returns `HTTP 200` with `database: "connected"`.
- [ ] Sign up a new user via the Vercel frontend.
- [ ] Post a room listing with photos and verify it appears on the live map and feed.
- [ ] Test that opening chat marks messages as read without polling errors.
- [ ] Test that Admin console redirects non-admin users with `403 Forbidden`.
