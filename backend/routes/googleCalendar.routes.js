import express from 'express';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import {
    getGoogleAuthUrl,
    handleGoogleCallback,
    getGoogleCalendarStatus,
    disconnectGoogleCalendar,
    getWorkspaceConfig,
    saveWorkspaceConfig,
    deleteWorkspaceConfig,
    getGoogleEvents,
    diagnoseGoogleCalendar
} from '../controllers/googleCalendar.controller.js';

const router = express.Router();

// Google OAuth callback (Google bu adrese yönlendirir, tarayıcıdan doğrudan gelir)
router.get('/callback', handleGoogleCallback);

router.get('/auth-url', authenticateJWT, getGoogleAuthUrl);
router.get('/status', authenticateJWT, getGoogleCalendarStatus);
router.get('/events', authenticateJWT, getGoogleEvents);
router.get('/diagnose', diagnoseGoogleCalendar);
router.post('/disconnect', authenticateJWT, disconnectGoogleCalendar);

// Workspace Google Takvim yapılandırma endpoint'leri (Kanallar / Entegrasyonlar)
router.get('/workspace-config/:workspaceId', authenticateJWT, getWorkspaceConfig);
router.post('/workspace-config/:workspaceId', authenticateJWT, saveWorkspaceConfig);
router.delete('/workspace-config/:workspaceId', authenticateJWT, deleteWorkspaceConfig);

export default router;
