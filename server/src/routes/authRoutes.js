import { Router } from "express";
import { signup, login, getMe, updateMe, deleteMe, exportMe } from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";
import { validate, signupSchema, loginSchema, updateProfileSchema } from "../middleware/validate.js";
import { authLimiter } from "../middleware/rateLimiter.js";

const router = Router();

router.post("/signup", authLimiter, validate(signupSchema), signup);
router.post("/login", authLimiter, validate(loginSchema), login);
router.get("/me", requireAuth, getMe);
router.patch("/me", requireAuth, validate(updateProfileSchema), updateMe);
router.delete("/me", requireAuth, deleteMe);
router.get("/me/export", requireAuth, exportMe);

export default router;
