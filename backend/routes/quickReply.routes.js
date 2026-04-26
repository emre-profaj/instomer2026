import express from 'express';
import passport from 'passport';
import {
    getQuickReplies,
    createQuickReply,
    updateQuickReply,
    deleteQuickReply
} from '../controllers/quickReply.controller.js';

const router = express.Router();
const auth = passport.authenticate('jwt', { session: false });

// All routes require authentication
router.get('/workspaces/:workspaceId/quick-replies', auth, getQuickReplies);
router.post('/workspaces/:workspaceId/quick-replies', auth, createQuickReply);
router.put('/workspaces/:workspaceId/quick-replies/:id', auth, updateQuickReply);
router.delete('/workspaces/:workspaceId/quick-replies/:id', auth, deleteQuickReply);

export default router;
