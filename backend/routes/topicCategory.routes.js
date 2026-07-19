import express from 'express';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  autoGenerateCategories,
  backfillConversations,
  importFromExcel,
  mergeCategories,
  simplifyCategories
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

// Excel import
router.post('/:workspaceId/import-excel', requireWorkspaceAccess, importFromExcel);

// Backfill existing conversations
router.post('/:workspaceId/backfill', requireWorkspaceAccess, backfillConversations);

// Merge categories
router.post('/:workspaceId/merge', requireWorkspaceAccess, mergeCategories);

// AI simplify (merge similar categories)
router.post('/:workspaceId/simplify', requireWorkspaceAccess, simplifyCategories);

export default router;
