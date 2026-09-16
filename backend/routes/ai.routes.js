import express from 'express';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';
import * as aiController from '../controllers/ai.controller.js';
import * as widgetController from '../controllers/widget.controller.js';
import * as instoBotController from '../controllers/instoBot.controller.js';
import * as instaController from '../controllers/insta.controller.js';
import { upload } from '../controllers/knowledgebase.controller.js';

const router = express.Router();

// Insta (AI Workspace Architect & Configurator)
router.post('/:workspaceId/insta/chat', authenticateJWT, requireWorkspaceAccess, instaController.chat);
router.post('/:workspaceId/insta/analyze-source', authenticateJWT, requireWorkspaceAccess, upload.single('file'), instaController.analyzeSource);
router.post('/:workspaceId/insta/apply-setup', authenticateJWT, requireWorkspaceAccess, instaController.applySetup);
router.post('/:workspaceId/insta/apply-action', authenticateJWT, requireWorkspaceAccess, instaController.applyAction);
router.get('/:workspaceId/insta/health', authenticateJWT, requireWorkspaceAccess, instaController.getHealth);

// İnsto Bot (Legacy compatibility)
router.post('/:workspaceId/insto-bot/chat', authenticateJWT, requireWorkspaceAccess, instoBotController.chat);
router.post('/:workspaceId/insto-bot/translate', authenticateJWT, requireWorkspaceAccess, instoBotController.translate);

// Settings
router.put('/:workspaceId/settings', authenticateJWT, requireWorkspaceAccess, aiController.updateSettings);
router.get('/:workspaceId/settings', authenticateJWT, requireWorkspaceAccess, aiController.getSettings);

// Bots
router.post('/:workspaceId/bots', authenticateJWT, requireWorkspaceAccess, aiController.createBot);
router.get('/:workspaceId/bots', authenticateJWT, requireWorkspaceAccess, aiController.getBots);
router.delete('/:workspaceId/bots/:botId', authenticateJWT, requireWorkspaceAccess, aiController.deleteBot);
router.put('/:workspaceId/bots/:botId', authenticateJWT, requireWorkspaceAccess, aiController.updateBot);
router.patch('/:workspaceId/bots/:botId/status', authenticateJWT, requireWorkspaceAccess, aiController.toggleBotStatus);
router.get('/:workspaceId/channels', authenticateJWT, requireWorkspaceAccess, aiController.getWorkspaceChannels);
router.post('/:workspaceId/bots/:botId/channels', authenticateJWT, requireWorkspaceAccess, aiController.updateBotChannels);

// Documents
router.post('/:workspaceId/bots/:botId/documents', authenticateJWT, requireWorkspaceAccess, aiController.uploadBotDocument);
router.get('/:workspaceId/bots/:botId/documents', authenticateJWT, requireWorkspaceAccess, aiController.getBotDocuments);
router.delete('/:workspaceId/bots/:botId/documents/:docId', authenticateJWT, requireWorkspaceAccess, aiController.deleteBotDocument);

// Generation
router.post('/:workspaceId/generate', authenticateJWT, requireWorkspaceAccess, aiController.generateResponse);
router.post('/:workspaceId/summarize', authenticateJWT, requireWorkspaceAccess, aiController.summarizeConversation);
router.post('/:workspaceId/translate', authenticateJWT, requireWorkspaceAccess, aiController.translateText);
router.put('/:workspaceId/analysis/:conversationId', authenticateJWT, requireWorkspaceAccess, aiController.updateConversationAnalysis);
router.post('/:workspaceId/extract-info', authenticateJWT, requireWorkspaceAccess, aiController.extractContactInfo);
router.post('/:workspaceId/suggest-replies', authenticateJWT, requireWorkspaceAccess, aiController.getSuggestedReplies);
router.post('/:workspaceId/detect-import-columns', authenticateJWT, requireWorkspaceAccess, aiController.detectImportColumns);

// Widget Settings (Admin)
router.get('/:workspaceId/widget', authenticateJWT, requireWorkspaceAccess, widgetController.getWidgetSettings);
router.put('/:workspaceId/widget', authenticateJWT, requireWorkspaceAccess, widgetController.updateWidgetSettings);

// Serve widget script via API to ensure it's reachable through proxies
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

router.get('/public/widget/script', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(__dirname, '../public/widget/widget.js'));
});

// Public Widget Data (No Auth)
router.get('/public/:workspaceId/widget', widgetController.getWidgetSettings);
router.get('/public/widget/:widgetId', widgetController.getWidgetByWidgetId);
router.post('/public/chat', widgetController.handleWidgetChat);
router.post('/public/prechat', widgetController.handlePrechat);
router.get('/public/messages/:conversationId', widgetController.getWidgetMessages);
router.post('/public/messages/:conversationId/read', widgetController.markWidgetMessagesRead);

export default router;
