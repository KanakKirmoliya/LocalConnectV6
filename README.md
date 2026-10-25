# NearNest (LocalConnect) — Hyperlocal Community Marketplace

[![CI Quality Gates](https://github.com/Bhupeshsinghsamant/NearNest/actions/workflows/ci.yml/badge.svg)](https://github.com/Bhupeshsinghsamant/NearNest/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node Version](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)
[![Database](https://img.shields.io/badge/Database-MongoDB%20Atlas-emerald.svg)](https://www.mongodb.com/atlas)

NearNest is an open-source, full-stack hyperlocal marketplace application designed to connect campus students, young working professionals, and local residents with verified rooms, rentals, civil services, and community alerts within walking distance.

---

## 🌟 Key Architecture & Capabilities

### 1. Web Application (`client/`)
- **Framework**: React 18 SPA bundled with Vite 5.
- **Interactive Mapping**: Real Leaflet + OpenStreetMap integration with interactive radar pins and geographic boundaries.
- **Direct Messaging Hub**: Instagram-style direct chat with real-time polling, instant read status (`✓ Sent` and `✓✓ Seen`), and automated unread badge zeroing.
- **Verified Caller Flow**: One-touch voice calling (`tel:...`) and direct WhatsApp messaging unlocked exclusively after request acceptance.
- **Master Admin Portal**: Specialized operations console for platform owners with user moderation (ban/unban/delete), listing verification badges (`🛡️ Verified by Admin`), and system health telemetry.

### 2. Backend API (`server/`)
- **Runtime**: Node.js + Express 4.
- **Database Engine**: MongoDB Atlas via Mongoose 9 with GeoJSON `2dsphere` spherical indexing.
- **Authentication**: JWT token authorization with slow bcrypt password hashing (10 salt rounds).
- **Protection**: In-memory sliding-window rate limiting on auth and media upload routes; production fail-closed configuration; fail-safe seed protection (`ALLOW_DESTRUCTIVE_SEED`).
- **Media Engine**: Multer multipart upload engine with MIME-type validation for photos (max 10MB) and video tours (max 50MB).

### 3. Mobile Application (`mobile/`)
- **Framework**: React Native 0.86 + Expo 57 with TypeScript.
- **Navigation**: Expo Router file-based navigation.
- **Security**: Hardware-backed token persistence using `expo-secure-store`.
- **Media Capture**: Mobile camera and gallery picker (`expo-image-picker`) with unified `/api/v1/upload/media` integration.
- **Room Inquiries**: Mobile users can send requests, review received inquiries, and accept or decline requests.

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js 20+ installed
- MongoDB Atlas cluster URI (or local MongoDB 6+)

### Installation
```bash
# Clone the repository
git clone https://github.com/Bhupeshsinghsamant/NearNest.git
cd NearNest

# Install all dependencies (root, server, client, mobile)
npm run install:all
```

### Environment Setup
Create `server/.env` based on `server/.env.example`:
```env
PORT=5000
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/NearNest?retryWrites=true&w=majority
JWT_SECRET=your_secure_development_jwt_secret_min_32_characters
NODE_ENV=development
```
For production, set `CORS_ORIGIN` to a comma-separated list of trusted frontend origins and use a random `JWT_SECRET` with at least 32 characters.

### Starting Servers

#### 1. Backend API (Port 5000)
```powershell
cd server
npm run dev
```

#### 2. Web Frontend with Local Network Host (Port 5173)
```powershell
cd client
npm run dev -- --host
```
*Access on laptop: `http://localhost:5173`*  
*Access on mobile browser (same Wi-Fi): `http://<your-laptop-ip>:5173`*

#### 3. Mobile Application (Expo)
```powershell
cd mobile
npm run start
```

---

## 🧪 Testing & Quality Gates

NearNest uses an isolated in-memory test runner (`mongodb-memory-server`) to guarantee that automated tests **NEVER mutate or delete production Atlas data**:

```bash
# Run backend automated test suite (31/31 tests)
npm test --prefix server

# Verify web client production build
npm run build --prefix client

# Type-check the mobile app
npm run typecheck --prefix mobile
```

---

## 📚 Project Documentation

Comprehensive architectural and engineering documentation is maintained in the `docs/` directory:
- [Project Audit & Baseline](docs/PROJECT_AUDIT.md)
- [Product Requirements Document (PRD)](docs/REQUIREMENTS.md)
- [Master Implementation Plan](docs/IMPLEMENTATION_PLAN.md)
- [QA & Test Plan](docs/TEST_PLAN.md)
- [Zero-Budget Deployment Guide](docs/DEPLOYMENT_GUIDE.md)
- [Known Limitations & Architecture Boundaries](docs/KNOWN_LIMITATIONS.md)

---

## 🔒 Security & Data Safety Principles

1. **Zero Secret Leakage**: Database credentials, passwords, and private tokens are never printed or committed.
2. **Safe Seeding**: Database seed scripts require explicit opt-in (`ALLOW_DESTRUCTIVE_SEED=true`) and strictly fail closed in production.
3. **Impartial Platform Governance**: Master Admin accounts are isolated from marketplace consumer transactions to ensure unbiased community moderation.

---

## GPS room location rule & overall ratings (V3.1)

**One room listing per physical spot.** A room's location identity is a deterministic `locationKey` derived only from its validated
GPS coordinates (spatial grid cell, see `server/src/utils/roomLocation.js`). Photos, filenames and hashes are never used. The room's
MongoDB `_id` / `roomCode` stay its permanent record identity.

- Duplicate radius: `ROOM_DUPLICATE_RADIUS_M` (default 10 m, `0` disables). Haversine distance decides; all neighbouring grid cells are checked.
- Concurrency: per-cell locks (`RoomLocationLock`) + a unique partial index on `locationClaimKey` as the database-level backstop.
- Rooms **require** coordinates. `locationSource` is `gps` (needs `locationAccuracyM` <= `ROOM_MAX_GPS_ACCURACY_M`, default 100) or `manual` (map pin / typed).
- Existing data: `npm run backfill:room-locations --prefix server -- --dry-run`, then without `--dry-run`. Never edits/deletes anything; reports conflicts.

**Ratings.** One calculation (`server/src/utils/ratingSummary.js`, used via `UserRating.js`): person-to-person ratings plus star reviews on the
user's own listings; `overall` = total points / total ratings (weighted), one decimal; provider and customer breakdowns kept separately.
Tests: `npm run test:room-location:unit`, `npm run test:ratings`, `npm run test:room-location` (in-memory MongoDB).
