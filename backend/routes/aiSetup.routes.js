import express from 'express';
import passport from 'passport';
import multer from 'multer';
import {
    parseDocumentAndExtractSetup,
    parseUrlAndExtractSetup,
    applyParsedSetupToWorkspace,
    updateKnowledgeBaseViaPrompt
} from '../controllers/aiSetup.controller.js';

const router = express.Router();
const auth = passport.authenticate('jwt', { session: false });

// Memory storage for uploaded documents
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 } // 25 MB max
});

// Routes
router.post('/workspaces/:workspaceId/ai-setup/parse-file', auth, upload.single('file'), parseDocumentAndExtractSetup);
router.post('/workspaces/:workspaceId/ai-setup/parse-url', auth, parseUrlAndExtractSetup);
router.post('/workspaces/:workspaceId/ai-setup/apply', auth, applyParsedSetupToWorkspace);
router.post('/workspaces/:workspaceId/ai-setup/instruct', auth, updateKnowledgeBaseViaPrompt);

export default router;
