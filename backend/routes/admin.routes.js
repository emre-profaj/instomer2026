import express from 'express';
import {
    getSystemStats,
    getAllUsers,
    createUser,
    deleteUser,
    getAllWorkspaces,
    deleteWorkspaceAdmin,
    createWorkspace,
    updateWorkspace,
    updateUser,
    updateUserRole,
    getWorkspaceDetail,
    addMemberToWorkspace,
    removeMemberFromWorkspace,
    updateWorkspaceMemberRole,
    createUserForWorkspace,
    getWorkspaceAiUsage,
    updateWorkspaceAiLimit,
    getSubscriptionPlans,
    resetWorkspaceAiCounter,
    checkSystemEmail,
    sendEmail,
    sendBulkEmail,
    syncPhoneNumbersFromConversations,
    getGlobalSettings,
    updateGlobalSettings,
    checkFacebookPagesHealth,
    getActivityLogs,
    fixDatabaseFunnelStages,
    toggleRealEstateModule
} from '../controllers/admin.controller.js';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware.js';

const router = express.Router();

// All admin routes require authentication and SUPER_ADMIN role
router.use(authenticateJWT, requireRole('SUPER_ADMIN'));

// Dashboard Stats
router.get('/stats', getSystemStats);

// Global Settings (AI API Key, etc.)
router.get('/global-settings', getGlobalSettings);
router.put('/global-settings', updateGlobalSettings);

// User Management
router.get('/users', getAllUsers);
router.post('/users', createUser);
router.put('/users/:userId/role', updateUserRole);
router.patch('/users/:userId', updateUser);
router.delete('/users/:userId', deleteUser);

// Workspace Management
router.get('/workspaces', getAllWorkspaces);
router.post('/workspaces', createWorkspace);
router.get('/workspaces/:workspaceId', getWorkspaceDetail);
router.put('/workspaces/:workspaceId', updateWorkspace);
router.delete('/workspaces/:workspaceId', deleteWorkspaceAdmin);

// Workspace Members (Admin)
router.post('/workspaces/:workspaceId/members', addMemberToWorkspace);
router.put('/workspaces/:workspaceId/members/:memberId', updateWorkspaceMemberRole);
router.delete('/workspaces/:workspaceId/members/:memberId', removeMemberFromWorkspace);

// Create user directly for a workspace (handles existing users)
router.post('/workspaces/:workspaceId/users', createUserForWorkspace);

// AI Usage Limit Management
router.get('/subscription-plans', getSubscriptionPlans);
router.get('/workspaces/:workspaceId/ai-usage', getWorkspaceAiUsage);
router.put('/workspaces/:workspaceId/ai-limit', updateWorkspaceAiLimit);
router.post('/workspaces/:workspaceId/ai-reset', resetWorkspaceAiCounter);

// Modül Erişim Kontrolleri
router.patch('/workspaces/:workspaceId/modules/realestate', toggleRealEstateModule);

// System Email Management
router.get('/email/check', checkSystemEmail);
router.post('/email/send', sendEmail);
router.post('/email/bulk', sendBulkEmail);

// Data Sync Utilities
router.post('/sync/phone-numbers', syncPhoneNumbersFromConversations);
router.post('/sync/fix-funnel-stages', fixDatabaseFunnelStages);

// Facebook/Instagram Health Check
router.get('/facebook/health-check', checkFacebookPagesHealth);

// Activity Logs
router.get('/activity-logs', getActivityLogs);

export default router;
