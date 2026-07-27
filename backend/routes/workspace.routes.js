import express from 'express';
import { body } from 'express-validator';
import {
    createWorkspace,
    getWorkspaces,
    getWorkspace,
    addMember,
    updateMemberRole,
    removeMember,
    changeMemberPassword,
    updateMemberInfo,
    getWorkspaceMembers,
    deleteWorkspace,
    getCompanyInfo,
    updateCompanyInfo,
    uploadCompanyLogo,
    deleteCompanyLogo,
    logoUpload,
    // Alt Workspace fonksiyonları
    getSubWorkspaces,
    createSubWorkspace,
    updateSubWorkspace,
    deleteSubWorkspace,
    checkIsParentWorkspace,
    // AI Usage
    getWorkspaceAiUsageStats,
    toggleWorkspaceAppointmentModule,
    updateAppointmentSchedule,
    toggleRealEstateModuleWS,
    toggleSalesModuleWS
} from '../controllers/workspace.controller.js';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/roleAuth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateJWT);

// Create workspace
router.post(
    '/',
    [
        body('name').notEmpty().withMessage('Workspace name is required'),
        body('slug').notEmpty().withMessage('Workspace slug is required')
    ],
    createWorkspace
);

// Get user's workspaces
router.get('/', getWorkspaces);

// Get workspace details
router.get('/:workspaceId', requireWorkspaceAccess, getWorkspace);

// Delete workspace (OWNER only)
router.delete('/:workspaceId', requireWorkspaceAccess, requireRole('OWNER'), deleteWorkspace);

// Get workspace members
router.get('/:workspaceId/members', requireWorkspaceAccess, getWorkspaceMembers);

// Add member to workspace (OWNER, ADMIN only)
router.post(
    '/:workspaceId/members',
    requireWorkspaceAccess,
    requireRole('OWNER', 'ADMIN'),
    [
        body('email').isEmail().withMessage('Valid email is required'),
        body('role').isIn(['OWNER', 'ADMIN', 'AGENT']).withMessage('Valid role is required'),
        body('name').optional().notEmpty().withMessage('Name is required for new accounts'),
        body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
    ],
    addMember
);

// Update member role
router.put(
    '/:workspaceId/members/:userId',
    requireWorkspaceAccess,
    [
        body('role').isIn(['OWNER', 'ADMIN', 'AGENT']).withMessage('Valid role is required')
    ],
    updateMemberRole
);

// Remove member (OWNER, ADMIN only)
router.delete('/:workspaceId/members/:userId', requireWorkspaceAccess, requireRole('OWNER', 'ADMIN'), removeMember);

// Change member password
router.put(
    '/:workspaceId/members/:userId/password',
    requireWorkspaceAccess,
    [
        body('newPassword').isLength({ min: 6 }).withMessage('Şifre en az 6 karakter olmalıdır')
    ],
    changeMemberPassword
);

// Update member info (name, email)
router.patch(
    '/:workspaceId/members/:userId/info',
    requireWorkspaceAccess,
    updateMemberInfo
);

// Company info routes
router.get('/:workspaceId/company', requireWorkspaceAccess, getCompanyInfo);
router.put('/:workspaceId/company', requireWorkspaceAccess, updateCompanyInfo);
router.post('/:workspaceId/company/logo', requireWorkspaceAccess, logoUpload.single('logo'), uploadCompanyLogo);
router.delete('/:workspaceId/company/logo', requireWorkspaceAccess, deleteCompanyLogo);

// ==================== ALT WORKSPACE (SUB-WORKSPACE) ROUTES ====================

// Alt workspace durumunu kontrol et
router.get('/:workspaceId/parent-status', requireWorkspaceAccess, checkIsParentWorkspace);

// Alt workspace'leri listele
router.get('/:workspaceId/sub-workspaces', requireWorkspaceAccess, getSubWorkspaces);

// Alt workspace oluştur
router.post(
    '/:workspaceId/sub-workspaces',
    requireWorkspaceAccess,
    [
        body('name').notEmpty().withMessage('Alt işletme adı gereklidir'),
        body('description').optional()
    ],
    createSubWorkspace
);

// Alt workspace güncelle
router.put(
    '/:workspaceId/sub-workspaces/:subWorkspaceId',
    requireWorkspaceAccess,
    [
        body('name').optional().notEmpty().withMessage('Alt işletme adı boş olamaz'),
        body('description').optional()
    ],
    updateSubWorkspace
);

// Alt workspace sil
router.delete('/:workspaceId/sub-workspaces/:subWorkspaceId', requireWorkspaceAccess, deleteSubWorkspace);

// ==================== AI USAGE ROUTES ====================

// Get AI usage stats for workspace
router.get('/:workspaceId/ai-usage', requireWorkspaceAccess, getWorkspaceAiUsageStats);

// Workspace rezervasyon modülü toggle (workspace admin/owner)
router.patch('/:workspaceId/appointment-module', requireWorkspaceAccess, toggleWorkspaceAppointmentModule);

// Rezervasyon çalışma günleri/saatleri
router.patch('/:workspaceId/appointment-schedule', requireWorkspaceAccess, updateAppointmentSchedule);

// Gayrimenkul modülü (workspace tarafından)
router.patch('/:workspaceId/realestate-module', requireWorkspaceAccess, toggleRealEstateModuleWS);

// Satış modülü (workspace tarafından)
router.patch('/:workspaceId/sales-module', requireWorkspaceAccess, toggleSalesModuleWS);

export default router;
