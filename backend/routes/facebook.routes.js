import express from 'express';
import { body } from 'express-validator';
import {
    connectPage,
    getPages,
    getPageForms,
    getAvailablePages,
    webhookVerify,
    webhookHandler,
    disconnectPage,
    getAdminFacebookPages,
    connectAdminPage,
    getContactProfile,
    addContactTag,
    removeContactTag,
    updatePageBot,
    updatePageComments,
    checkPageHealth,
    resubscribeWebhook,
    syncHistoricalConversations
} from '../controllers/facebook.controller.js';
import { authenticateJWT, requireWorkspaceAccess, requireRole } from '../middleware/auth.middleware.js';

const router = express.Router();

// Webhook verification (GET) - no auth required
router.get('/webhook', webhookVerify);

// Webhook handler (POST) - no auth required
router.post('/webhook', webhookHandler);

// All other routes require authentication
router.use(authenticateJWT);

// ADMIN ONLY: Get all pages from Facebook Developer account
router.get('/admin/pages', requireRole('ADMIN'), getAdminFacebookPages);

// ADMIN ONLY: Connect a page from Facebook Developer account
router.post(
    '/admin/connect-page',
    requireRole('ADMIN'),
    [
        body('pageId').notEmpty().withMessage('Page ID is required'),
        body('pageAccessToken').notEmpty().withMessage('Page access token is required'),
        body('pageName').notEmpty().withMessage('Page name is required'),
        body('workspaceId').notEmpty().withMessage('Workspace ID is required')
    ],
    connectAdminPage
);

// Connect Facebook page (regular users)
router.post(
    '/pages/connect',
    [
        body('pageId').notEmpty().withMessage('Page ID is required'),
        body('pageAccessToken').notEmpty().withMessage('Page access token is required'),
        body('pageName').notEmpty().withMessage('Page name is required'),
        body('workspaceId').notEmpty().withMessage('Workspace ID is required')
    ],
    requireWorkspaceAccess,
    connectPage
);

// Get available pages from user's Facebook account (for selection modal)
router.get('/pages/available', getAvailablePages);

// Get connected pages for workspace
router.get('/pages/:workspaceId', requireWorkspaceAccess, getPages);

// Get lead forms for workspace (from DB)
router.get('/pages/:workspaceId/forms', requireWorkspaceAccess, getPageForms);

// Disconnect page
router.delete('/pages/:pageId', disconnectPage);

// Check page health (diagnostic)
router.get('/pages/:pageId/health', checkPageHealth);

// Re-subscribe page to webhooks
router.post('/pages/:pageId/resubscribe', resubscribeWebhook);

// Update assigned bot
router.patch('/pages/:id/bot', updatePageBot);
router.patch('/pages/:id/comments', updatePageComments);

// Contact Profile
router.get('/contact-profile/:conversationId', getContactProfile);

// Tag management
router.post('/contact-profile/:conversationId/tags', addContactTag);
router.delete('/contact-profile/:conversationId/tags', removeContactTag);

// Post and Comment Management
import {
    getPosts,
    getInstagramMedia,
    getPostComments,
    createPostComment,
    updateComment,
    deleteComment
} from '../controllers/facebook.controller.js';

router.get('/posts/:pageId', getPosts);
router.get('/instagram/:instagramBusinessId/media', getInstagramMedia);
router.get('/posts/:postId/comments', getPostComments);
router.post('/posts/:postId/comments', createPostComment);
router.patch('/comments/:commentId', updateComment);
router.delete('/comments/:commentId', deleteComment);

// Sync historical conversations
router.post('/sync-history/:workspaceId', requireWorkspaceAccess, syncHistoricalConversations);

export default router;
