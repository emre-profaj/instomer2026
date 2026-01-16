import express from 'express';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';
import {
    getKnowledgeBase,
    addTextEntry,
    uploadFile,
    updateEntry,
    deleteEntry,
    upload
} from '../controllers/knowledgebase.controller.js';

const router = express.Router();

router.use(authenticateJWT);

// Get all entries
router.get('/:workspaceId', requireWorkspaceAccess, getKnowledgeBase);

// Add text entry
router.post('/:workspaceId/text', requireWorkspaceAccess, addTextEntry);

// Upload file
router.post('/:workspaceId/upload', requireWorkspaceAccess, upload.single('file'), uploadFile);

// Update entry
router.put('/:workspaceId/:id', requireWorkspaceAccess, updateEntry);

// Delete entry
router.delete('/:workspaceId/:id', requireWorkspaceAccess, deleteEntry);

export default router;

