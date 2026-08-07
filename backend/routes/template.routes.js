import express from 'express';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from '../controllers/template.controller.js';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/:workspaceId', authenticateJWT, requireWorkspaceAccess, getTemplates);
router.post('/:workspaceId', authenticateJWT, requireWorkspaceAccess, createTemplate);
router.put('/:workspaceId/:id', authenticateJWT, requireWorkspaceAccess, updateTemplate);
router.delete('/:workspaceId/:id', authenticateJWT, requireWorkspaceAccess, deleteTemplate);

export default router;
