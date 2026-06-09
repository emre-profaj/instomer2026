import express from 'express';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';
import {
    getContactCases,
    getCase,
    createCase,
    updateCase,
    assignCase,
    linkConversation,
    unlinkConversation,
    deleteCase
} from '../controllers/case.controller.js';

const router = express.Router();
router.use(authenticateJWT);

// Kişinin tüm case'leri
router.get('/:workspaceId/contact/:contactId', requireWorkspaceAccess, getContactCases);

// Tek case detayı
router.get('/:workspaceId/cases/:caseId', requireWorkspaceAccess, getCase);

// Yeni case oluştur
router.post('/:workspaceId/contact/:contactId', requireWorkspaceAccess, createCase);

// Case güncelle (title, stage, status)
router.patch('/:workspaceId/cases/:caseId', requireWorkspaceAccess, updateCase);

// Case atama (cascade)
router.patch('/:workspaceId/cases/:caseId/assign', requireWorkspaceAccess, assignCase);

// Conversation'ı case'e bağla
router.post('/:workspaceId/cases/:caseId/link', requireWorkspaceAccess, linkConversation);

// Conversation'ı case'den çıkar
router.delete('/:workspaceId/cases/:caseId/unlink/:conversationId', requireWorkspaceAccess, unlinkConversation);

// Case sil
router.delete('/:workspaceId/cases/:caseId', requireWorkspaceAccess, deleteCase);

export default router;
