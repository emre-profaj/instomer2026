import express from 'express';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';
import {
    getDeals,
    getDeal,
    createDeal,
    updateDeal,
    deleteDeal,
    convertDeal,
    getDealStats,
    getContactDeals
} from '../controllers/deal.controller.js';

const router = express.Router();

// Tüm route'lar auth gerektiriyor
router.use(authenticateJWT);

// Workspace bazlı deal route'ları
router.get('/:workspaceId/deals', requireWorkspaceAccess, getDeals);
router.get('/:workspaceId/deals/stats', requireWorkspaceAccess, getDealStats);
router.get('/:workspaceId/deals/:dealId', requireWorkspaceAccess, getDeal);
router.post('/:workspaceId/deals', requireWorkspaceAccess, createDeal);
router.put('/:workspaceId/deals/:dealId', requireWorkspaceAccess, updateDeal);
router.delete('/:workspaceId/deals/:dealId', requireWorkspaceAccess, deleteDeal);
router.post('/:workspaceId/deals/:dealId/convert', requireWorkspaceAccess, convertDeal);

// Kişiye ait deal'lar
router.get('/:workspaceId/contacts/:contactId/deals', requireWorkspaceAccess, getContactDeals);

export default router;
