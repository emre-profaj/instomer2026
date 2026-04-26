import express from 'express';
import {
    getChannelRoutings,
    upsertChannelRouting,
    deleteChannelRouting
} from '../controllers/channelRouting.controller.js';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';

const router = express.Router();

// Tüm kanal yönlendirmelerini getir
router.get(
    '/:workspaceId',
    authenticateJWT,
    requireWorkspaceAccess,
    getChannelRoutings
);

// Kanal yönlendirmesi oluştur veya güncelle
router.post(
    '/:workspaceId',
    authenticateJWT,
    requireWorkspaceAccess,
    upsertChannelRouting
);

// Kanal yönlendirmesini sil
router.delete(
    '/:workspaceId/:channel',
    authenticateJWT,
    requireWorkspaceAccess,
    deleteChannelRouting
);

export default router;


