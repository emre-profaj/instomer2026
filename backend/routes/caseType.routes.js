import express from 'express';
import { getCaseTypes, createCaseType, updateCaseType, deleteCaseType } from '../controllers/caseType.controller.js';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/:workspaceId', authenticateJWT, requireWorkspaceAccess, getCaseTypes);
router.post('/:workspaceId', authenticateJWT, requireWorkspaceAccess, createCaseType);
router.put('/:workspaceId/:id', authenticateJWT, requireWorkspaceAccess, updateCaseType);
router.delete('/:workspaceId/:id', authenticateJWT, requireWorkspaceAccess, deleteCaseType);

export default router;
