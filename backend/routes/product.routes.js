import express from 'express';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';
import {
    getProducts,
    getProduct,
    createProduct,
    updateProduct,
    deleteProduct,
    getProductGroups
} from '../controllers/product.controller.js';

const router = express.Router();

// Tüm route'lar auth gerektiriyor
router.use(authenticateJWT);

// Workspace bazlı ürün route'ları
router.get('/:workspaceId/products', requireWorkspaceAccess, getProducts);
router.get('/:workspaceId/products/groups', requireWorkspaceAccess, getProductGroups);
router.get('/:workspaceId/products/:productId', requireWorkspaceAccess, getProduct);
router.post('/:workspaceId/products', requireWorkspaceAccess, createProduct);
router.put('/:workspaceId/products/:productId', requireWorkspaceAccess, updateProduct);
router.delete('/:workspaceId/products/:productId', requireWorkspaceAccess, deleteProduct);

export default router;
