import express from 'express';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';
import {
    getResources,
    createResource,
    updateResource,
    deleteResource
} from '../controllers/resource.controller.js';

const router = express.Router();

router.use(authenticateJWT);

// Get all resources
router.get('/:workspaceId', requireWorkspaceAccess, getResources);

// Create resource
router.post('/:workspaceId', requireWorkspaceAccess, createResource);

// Update resource
router.put('/:workspaceId/:resourceId', requireWorkspaceAccess, updateResource);

// Delete resource
router.delete('/:workspaceId/:resourceId', requireWorkspaceAccess, deleteResource);

export default router;
