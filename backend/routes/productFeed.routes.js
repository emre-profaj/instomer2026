import express from 'express';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';
import {
    getFeedConfig,
    saveFeedConfig,
    testFeed,
    syncFeed
} from '../controllers/productFeed.controller.js';

const router = express.Router();

router.use(authenticateJWT);

router.get('/:workspaceId/product-feed/config', requireWorkspaceAccess, getFeedConfig);
router.post('/:workspaceId/product-feed/config', requireWorkspaceAccess, saveFeedConfig);
router.post('/:workspaceId/product-feed/test', requireWorkspaceAccess, testFeed);
router.post('/:workspaceId/product-feed/sync', requireWorkspaceAccess, syncFeed);

export default router;
