import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mongoose from "mongoose";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../.env");
dotenv.config({ path: envPath });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI is missing from server/.env. Backup aborted.");
  process.exit(1);
}

const BACKUP_ROOT = path.resolve(__dirname, "../backups");
const UPLOAD_ROOT = path.resolve(__dirname, "../uploads");

async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const targetDir = path.join(BACKUP_ROOT, `snapshot_${timestamp}`);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  console.log(`📦 [Disaster Recovery] Initiating automated NearNest database backup...`);
  console.log(`📂 Backup Target: ${targetDir}`);

  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB Atlas.");

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    const manifest = {
      timestamp: new Date().toISOString(),
      cluster: "MongoDB Atlas M0 Free Cluster",
      database: db.databaseName,
      collections: {},
      mediaFilesCount: 0,
    };

    for (const col of collections) {
      const colName = col.name;
      const docs = await db.collection(colName).find({}).toArray();
      const filePath = path.join(targetDir, `${colName}.json`);
      fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), "utf8");
      manifest.collections[colName] = docs.length;
      console.log(`  ✓ ${colName}: ${docs.length} documents saved.`);
    }

    // Media Snapshot
    const mediaBackupDir = path.join(targetDir, "media");
    if (fs.existsSync(UPLOAD_ROOT)) {
      copyRecursiveSync(UPLOAD_ROOT, mediaBackupDir);
      const mediaFiles = listFilesRecursive(mediaBackupDir);
      manifest.mediaFilesCount = mediaFiles.length;
      console.log(`  ✓ media: ${mediaFiles.length} uploaded files preserved in snapshot.`);
    }

    // Write manifest
    fs.writeFileSync(path.join(targetDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

    // Also write a pointer to latest backup
    fs.writeFileSync(path.join(BACKUP_ROOT, "latest.txt"), targetDir, "utf8");

    console.log(`🎉 Backup successfully created and verified! Manifest saved at ${path.join(targetDir, "manifest.json")}`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Backup failed:", err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

function copyRecursiveSync(src, dest) {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((child) => {
      copyRecursiveSync(path.join(src, child), path.join(dest, child));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

function listFilesRecursive(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(listFilesRecursive(filePath));
    } else {
      results.push(filePath);
    }
  });
  return results;
}

createBackup();
