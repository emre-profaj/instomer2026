import express from 'express';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';
import * as aiController from '../controllers/ai.controller.js';
import * as widgetController from '../controllers/widget.controller.js';
import * as instoBotController from '../controllers/instoBot.controller.js';

const router = express.Router();

// İnsto Bot
router.post('/:workspaceId/insto-bot/chat', authenticateJWT, requireWorkspaceAccess, instoBotController.chat);

// Settings
router.put('/:workspaceId/settings', authenticateJWT, requireWorkspaceAccess, aiController.updateSettings);
router.get('/:workspaceId/settings', authenticateJWT, requireWorkspaceAccess, aiController.getSettings);

// Bots
router.post('/:workspaceId/bots', authenticateJWT, requireWorkspaceAccess, aiController.createBot);
router.get('/:workspaceId/bots', authenticateJWT, requireWorkspaceAccess, aiController.getBots);
router.delete('/:workspaceId/bots/:botId', authenticateJWT, requireWorkspaceAccess, aiController.deleteBot);
router.put('/:workspaceId/bots/:botId', authenticateJWT, requireWorkspaceAccess, aiController.updateBot);
router.patch('/:workspaceId/bots/:botId/status', authenticateJWT, requireWorkspaceAccess, aiController.toggleBotStatus);

// Documents
router.post('/:workspaceId/bots/:botId/documents', authenticateJWT, requireWorkspaceAccess, aiController.uploadBotDocument);
router.get('/:workspaceId/bots/:botId/documents', authenticateJWT, requireWorkspaceAccess, aiController.getBotDocuments);
router.delete('/:workspaceId/bots/:botId/documents/:docId', authenticateJWT, requireWorkspaceAccess, aiController.deleteBotDocument);

// Generation
router.post('/:workspaceId/generate', authenticateJWT, requireWorkspaceAccess, aiController.generateResponse);
router.post('/:workspaceId/summarize', authenticateJWT, requireWorkspaceAccess, aiController.summarizeConversation);
router.put('/:workspaceId/analysis/:conversationId', authenticateJWT, requireWorkspaceAccess, aiController.updateConversationAnalysis);
router.post('/:workspaceId/extract-info', authenticateJWT, requireWorkspaceAccess, aiController.extractContactInfo);
router.post('/:workspaceId/suggest-replies', authenticateJWT, requireWorkspaceAccess, aiController.getSuggestedReplies);

// Widget Settings (Admin)
router.get('/:workspaceId/widget', authenticateJWT, requireWorkspaceAccess, widgetController.getWidgetSettings);
router.put('/:workspaceId/widget', authenticateJWT, requireWorkspaceAccess, widgetController.updateWidgetSettings);

// Serve widget script via API to ensure it's reachable through proxies
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

router.get('/public/widget/script', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/widget/widget.js'));
});

// Public Widget Data (No Auth)
router.get('/public/:workspaceId/widget', widgetController.getWidgetSettings);
router.get('/public/widget/:widgetId', widgetController.getWidgetByWidgetId);
router.post('/public/chat', widgetController.handleWidgetChat);
router.post('/public/prechat', widgetController.handlePrechat);

export default router;
