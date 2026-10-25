# NearNest — Backup, Restore & Disaster Recovery (DR) Runbook

**Target Architecture:** Zero-Cost ($0.00/mo) Multi-Tier Local & Atlas Hybrid  
**Cluster:** MongoDB Atlas Free Tier (M0) — `bhupeshsinghsamant.ecjukae.mongodb.net`  
**Target RPO (Recovery Point Objective):** 24 Hours (Daily Snapshot)  
**Target RTO (Recovery Time Objective):** < 15 Seconds (Programmatic Restore Execution)

---

## 1. Disaster Recovery Philosophy & Free-Tier Constraints

MongoDB Atlas M0 (Free Tier) does **not** provide automated cloud snapshots or continuous point-in-time recovery (PITR). To maintain a strict **zero-cost ($0.00/month)** infrastructure without violating deployment budgets, NearNest implements a deterministic programmatic snapshot engine using Node.js and the native MongoDB driver.

---

## 2. Backup Architecture & Engine (`scripts/backup.mjs`)

The backup engine extracts full BSON/JSON serialized collection datasets along with disk-stored multipart media uploads:

### 2.1 Backup Payload Structure
```
server/backups/snapshot_YYYY-MM-DDTHH-MM-SS-sssZ/
├── manifest.json            # Snapshot metadata, timestamp, collection counts, total bytes
├── collections/
│   ├── users.json           # All registered user documents (passwords already bcrypt hashed)
│   ├── listings.json        # Rooms, vehicles, listings metadata & geo-coordinates
│   ├── alerts.json          # Lost & found emergency alerts
│   ├── rentalrequests.json  # Peer request records
│   ├── messages.json        # Peer chat transcripts
│   └── reports.json         # Abuse & moderation reports
└── uploads/                 # Binary copy of server/uploads/ media attachments
```

### 2.2 Execution Command
To create an instantaneous local/off-site disaster snapshot:
```powershell
cd server
npm run backup
```
*Output:*
```
[BACKUP] Connecting to MongoDB Atlas...
[BACKUP] Connected successfully.
[BACKUP] Exporting 6 collections...
  -> Exported users: 25 documents (18240 bytes)
  -> Exported listings: 6 documents (8410 bytes)
  -> Exported alerts: 1 documents (1250 bytes)
  -> Exported rentalrequests: 14 documents (6200 bytes)
  -> Exported messages: 0 documents (2 bytes)
  -> Exported reports: 3 documents (1890 bytes)
[BACKUP] Copying media uploads...
  -> Copied 12 media files (24.1 MB)
[BACKUP] Snapshot completed successfully: server/backups/snapshot_2026-04-16T13-40-22-120Z
```

---

## 3. Disaster Recovery Verification & Sandbox Test (`scripts/restore-test.mjs`)

To comply with audit requirements, disaster recovery cannot be theoretical. The backup system features an automated, non-destructive restore verification test.

### 3.1 Verification Runbook
```powershell
cd server
npm run restore:test
```

### 3.2 Automated Test Pipeline:
1. Locates latest snapshot in `server/backups/`.
2. Verifies integrity of `manifest.json` and collection files.
3. Connects to an **isolated sandbox database**: `NearNest_Restore_Test` on MongoDB Atlas.
4. Restores all collections into the sandbox with exact index mappings.
5. Performs document count assertion: `snapshot.count === sandbox.count`.
6. Simulates media restoration to a temporary sandbox directory.
7. Drops the `NearNest_Restore_Test` sandbox completely to leave zero residual data.
8. Exits with code 0 on 100% verification success.

---

## 4. Emergency Production Recovery Runbook (Catastrophic Loss)

In the event of accidental database deletion, cluster compromise, or ransomware corruption:

### Step 1: Provision Clean Database Cluster
If Atlas M0 cluster was compromised, create a new free M0 cluster in Atlas web console, whitelist your production server IP (`0.0.0.0/0` with strict VPC or static host IP), and copy the new `MONGO_URI`.

### Step 2: Prepare Target Environment
Set the environment variable in `server/.env`:
```env
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/NearNest?retryWrites=true&w=majority
```

### Step 3: Run Full Restoration Script
Execute the programmatic restore into the production target database:
```powershell
node -e "
import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';

async function restore() {
  const snapshotDir = 'server/backups/<TARGET_SNAPSHOT_FOLDER>';
  const manifest = JSON.parse(fs.readFileSync(path.join(snapshotDir, 'manifest.json')));
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db('NearNest');
  
  for (const colName of Object.keys(manifest.collections)) {
    const data = JSON.parse(fs.readFileSync(path.join(snapshotDir, 'collections', colName + '.json')));
    if (data.length > 0) {
      await db.collection(colName).deleteMany({});
      await db.collection(colName).insertMany(data);
      console.log('Restored ' + colName + ': ' + data.length + ' documents');
    }
  }
  await client.close();
  console.log('Production Restore Complete!');
}
restore();
"
```

### Step 4: Restore Binary Media
Copy all files from `server/backups/<TARGET_SNAPSHOT>/uploads/*` into `server/uploads/`.

### Step 5: Smoke Verification
Run the automated system health check:
```powershell
curl http://localhost:5000/api/v1/health
```
Verify `"database": "connected"` and valid entity counts.
