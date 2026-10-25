import { Router } from "express";
import {
  createRequest,
  getInbox,
  getSentRequests,
  updateRequestStatus,
  getMessages,
  sendMessage,
  getConversations,
  getUnreadCount,
  markConversationAsRead,
} from "../controllers/requestController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/", requireAuth, createRequest);
router.get("/inbox", requireAuth, getInbox);
router.get("/sent", requireAuth, getSentRequests);
router.get("/conversations", requireAuth, getConversations);
router.get("/unread-count", requireAuth, getUnreadCount);
router.patch("/:id/read", requireAuth, markConversationAsRead);
router.patch("/:id", requireAuth, updateRequestStatus);
router.get("/:id/messages", requireAuth, getMessages);
router.post("/:id/messages", requireAuth, sendMessage);

export default router;

