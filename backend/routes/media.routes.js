import express from 'express';
import { mediaUpload, uploadMedia } from '../controllers/media.controller.js';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(authenticateJWT);

router.post('/:workspaceId/upload', requireWorkspaceAccess, mediaUpload.single('file'), uploadMedia);

export default router;
