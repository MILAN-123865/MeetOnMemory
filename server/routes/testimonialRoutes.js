import express from "express";
import userAuth from "../middleware/userAuth.js";
import { requireAdminOrOwner } from "../middleware/rbac.js";
import { testimonialSubmitLimiter } from "../middleware/rateLimiter.js";
import {
  listApprovedTestimonials,
  getTestimonialStats,
  getMyTestimonial,
  createTestimonial,
  updateTestimonial,
  deleteOwnTestimonial,
  listAdminTestimonials,
  updateTestimonialStatus,
  adminDeleteTestimonial,
  bulkUpdateTestimonialsStatus,
  updateTestimonialSpotlight,
  getHomepageSpotlightTestimonials,
} from "../controllers/testimonialController.js";

const router = express.Router();

// Public
router.get("/", listApprovedTestimonials);
router.get("/stats", getTestimonialStats);
router.get("/spotlight", getHomepageSpotlightTestimonials);

// Authenticated user
router.get("/me", userAuth, getMyTestimonial);
router.post("/", userAuth, testimonialSubmitLimiter, createTestimonial);
router.put("/:id", userAuth, testimonialSubmitLimiter, updateTestimonial);
router.delete("/:id", userAuth, deleteOwnTestimonial);

export default router;

export const adminTestimonialRouter = express.Router();

adminTestimonialRouter.use(userAuth, requireAdminOrOwner);
adminTestimonialRouter.get("/", listAdminTestimonials);
adminTestimonialRouter.post("/bulk-status", bulkUpdateTestimonialsStatus);
adminTestimonialRouter.patch("/:id/status", updateTestimonialStatus);
adminTestimonialRouter.put("/:id/spotlight", updateTestimonialSpotlight);
adminTestimonialRouter.delete("/:id", adminDeleteTestimonial);
