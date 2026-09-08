import express from 'express';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';
import {
    getResources,
    createResource,
    updateResource,
    deleteResource,
    syncHealthDoctors,
    addResourceProduct,
    removeResourceProduct
} from '../controllers/resource.controller.js';

const router = express.Router();

router.use(authenticateJWT);

// Sync health system doctors to resources
router.post('/:workspaceId/sync-health-doctors', requireWorkspaceAccess, syncHealthDoctors);

// Get all resources
router.get('/:workspaceId', requireWorkspaceAccess, getResources);

// Create resource
router.post('/:workspaceId', requireWorkspaceAccess, createResource);

// Update resource
router.put('/:workspaceId/:resourceId', requireWorkspaceAccess, updateResource);

// Delete resource
router.delete('/:workspaceId/:resourceId', requireWorkspaceAccess, deleteResource);

// Add product to resource
router.post('/:workspaceId/:resourceId/products', requireWorkspaceAccess, addResourceProduct);

// Remove product from resource
router.delete('/:workspaceId/:resourceId/products/:rpId', requireWorkspaceAccess, removeResourceProduct);

export default router;
