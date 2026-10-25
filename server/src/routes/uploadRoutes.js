import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { requireAuth } from "../middleware/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = path.resolve(__dirname, "../../uploads/listings");

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer disk storage engine
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueId = crypto.randomUUID();
    cb(null, `${uniqueId}${ext}`);
  },
});

// File filter for photo and video validation
const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_VIDEO_MIMES = ["video/mp4", "video/webm", "video/quicktime"];

function fileFilter(_req, file, cb) {
  if (
    ALLOWED_IMAGE_MIMES.includes(file.mimetype) ||
    ALLOWED_VIDEO_MIMES.includes(file.mimetype)
  ) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Unsupported file type '${file.mimetype}'. Allowed: JPG, PNG, WEBP, GIF, MP4, WEBM, MOV.`
      ),
      false
    );
  }
}

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max per file
    files: 12, // max 10 photos + 2 videos
  },
});

import { uploadLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// Reusable Authenticated Media Upload Handler
const handleUpload = (req, res) => {
  upload.array("files", 12)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          error: "File size exceeds the allowed limit (10MB for photos, 50MB for videos).",
        });
      }
      if (err.code === "LIMIT_FILE_COUNT") {
        return res.status(400).json({
          success: false,
          error: "Too many files uploaded at once. Maximum 10 photos and 2 videos allowed.",
        });
      }
      return res.status(400).json({ success: false, error: err.message });
    } else if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: "No media files were provided." });
    }

    // Validate individual image vs video limits
    let photoCount = 0;
    let videoCount = 0;
    const uploadedMedia = [];

    for (const file of req.files) {
      const isVideo = ALLOWED_VIDEO_MIMES.includes(file.mimetype);
      const isImage = ALLOWED_IMAGE_MIMES.includes(file.mimetype);

      if (isImage) {
        photoCount++;
        if (file.size > 10 * 1024 * 1024) {
          // Clean up written file
          fs.unlinkSync(file.path);
          return res.status(400).json({
            success: false,
            error: `Photo '${file.originalname}' exceeds 10MB limit.`,
          });
        }
      } else if (isVideo) {
        videoCount++;
        if (file.size > 50 * 1024 * 1024) {
          fs.unlinkSync(file.path);
          return res.status(400).json({
            success: false,
            error: `Video '${file.originalname}' exceeds 50MB limit.`,
          });
        }
      }

      uploadedMedia.push({
        url: `/uploads/listings/${file.filename}`,
        name: file.originalname,
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        type: isVideo ? "video" : "image",
        isCover: false,
      });
    }

    // Default first image as cover photo
    const firstImage = uploadedMedia.find((m) => m.type === "image");
    if (firstImage) {
      firstImage.isCover = true;
    }

    return res.status(201).json({
      success: true,
      count: uploadedMedia.length,
      files: uploadedMedia,
    });
  });
};

// Mount upload handler at both /media and / for 100% web and mobile client compatibility
router.post("/media", uploadLimiter, requireAuth, handleUpload);
router.post("/", uploadLimiter, requireAuth, handleUpload);

/**
 * Utility to safely remove media files from disk when a listing is deleted.
 */
export function cleanupMediaFiles(photos = [], videos = []) {
  const allMedia = [...photos, ...videos];
  for (const item of allMedia) {
    const url = typeof item === "string" ? item : item?.url;
    if (url && url.startsWith("/uploads/listings/")) {
      const filename = path.basename(url);
      const filePath = path.join(UPLOAD_DIR, filename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log(`🧹 Cleaned up file from disk: ${filename}`);
        } catch (e) {
          console.warn(`Failed to unlink file ${filename}:`, e.message);
        }
      }
    }
  }
}

export default router;
