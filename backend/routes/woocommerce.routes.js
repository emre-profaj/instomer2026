import express from 'express';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';
import {
    getWooCommerceConfig,
    saveWooCommerceConfig,
    testWooCommerceConnection,
    pushProductsToWooCommerce,
    pullProductsFromWooCommerce
} from '../controllers/woocommerce.controller.js';

const router = express.Router();

router.use(authenticateJWT);

router.get('/:workspaceId/woocommerce/config', requireWorkspaceAccess, getWooCommerceConfig);
router.post('/:workspaceId/woocommerce/config', requireWorkspaceAccess, saveWooCommerceConfig);
router.post('/:workspaceId/woocommerce/test', requireWorkspaceAccess, testWooCommerceConnection);
router.post('/:workspaceId/woocommerce/sync/push', requireWorkspaceAccess, pushProductsToWooCommerce);
router.post('/:workspaceId/woocommerce/sync/pull', requireWorkspaceAccess, pullProductsFromWooCommerce);

export default router;
