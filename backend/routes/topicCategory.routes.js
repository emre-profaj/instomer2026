import express from 'express';
import multer from 'multer';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  autoGenerateCategories,
  backfillConversations,
  importFromExcel
} from '../controllers/topicCategory.controller.js';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit
router.use(authenticateJWT);

// CRUD
router.get('/:workspaceId', requireWorkspaceAccess, getCategories);
router.post('/:workspaceId', requireWorkspaceAccess, createCategory);
router.put('/:workspaceId/:categoryId', requireWorkspaceAccess, updateCategory);
router.delete('/:workspaceId/:categoryId', requireWorkspaceAccess, deleteCategory);
router.put('/:workspaceId/reorder', requireWorkspaceAccess, reorderCategories);

// AI-powered auto-generation
router.post('/:workspaceId/auto-generate', requireWorkspaceAccess, autoGenerateCategories);

// Excel import
router.post('/:workspaceId/import-excel', requireWorkspaceAccess, upload.single('file'), importFromExcel);

// Backfill existing conversations
router.post('/:workspaceId/backfill', requireWorkspaceAccess, backfillConversations);

export default router;
