import express from 'express';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  autoGenerateCategories,
  backfillConversations
} from '../controllers/topicCategory.controller.js';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(authenticateJWT);

// CRUD
router.get('/:workspaceId', requireWorkspaceAccess, getCategories);
router.post('/:workspaceId', requireWorkspaceAccess, createCategory);
router.put('/:workspaceId/:categoryId', requireWorkspaceAccess, updateCategory);
router.delete('/:workspaceId/:categoryId', requireWorkspaceAccess, deleteCategory);
router.put('/:workspaceId/reorder', requireWorkspaceAccess, reorderCategories);

// AI-powered auto-generation
router.post('/:workspaceId/auto-generate', requireWorkspaceAccess, autoGenerateCategories);

// Backfill existing conversations
router.post('/:workspaceId/backfill', requireWorkspaceAccess, backfillConversations);

export default router;
