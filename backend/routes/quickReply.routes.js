import express from 'express';
import passport from 'passport';
import {
    getQuickReplies,
    createQuickReply,
    updateQuickReply,
    deleteQuickReply,
    seedDefaultTemplates,
    pushToMetaTemplate
} from '../controllers/quickReply.controller.js';

const router = express.Router();
const auth = passport.authenticate('jwt', { session: false });

// All routes require authentication
router.get('/workspaces/:workspaceId/quick-replies', auth, getQuickReplies);
router.post('/workspaces/:workspaceId/quick-replies', auth, createQuickReply);
router.put('/workspaces/:workspaceId/quick-replies/:id', auth, updateQuickReply);
router.delete('/workspaces/:workspaceId/quick-replies/:id', auth, deleteQuickReply);

// Standard templates & Meta push routes
router.post('/workspaces/:workspaceId/quick-replies/seed-defaults', auth, seedDefaultTemplates);
router.post('/workspaces/:workspaceId/quick-replies/:id/push-to-meta', auth, pushToMetaTemplate);

export default router;
