import express from 'express';
import { createActivity, getContactTimeline, updateActivity, deleteActivity, completeActivity, claimActivity, getWorkspaceCallQueue, getWorkspaceActivities, getActivityById, getContactRetellCall, translateText } from '../controllers/activity.controller.js';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';

const router = express.Router();

// Tüm route'lar için auth kontrolü
router.use(authenticateJWT);

// Workspace call queue (CALL + MEETING activities)
// requireWorkspaceAccess ŞART: req.workspaceMember'ı dolduran ara katman bu.
// Yokken isAgentRole() rolü undefined görüp HERKESİ (OWNER/ADMIN/SUPER_ADMIN
// dahil) kısıtlı sayıyordu; raporlar yalnızca kullanıcının kendi kayıtlarını
// gösteriyordu. Gerçek vaka: 232 randevu varken Randevu Analizi 0 gösterdi.
router.get('/workspace/:workspaceId/call-queue', requireWorkspaceAccess, getWorkspaceCallQueue);
router.get('/workspace/:workspaceId/list', requireWorkspaceAccess, getWorkspaceActivities);

// Tüm route'lar için auth kontrolü
router.use(authenticateJWT);

// Kişi kartı aktivite geçmişi ve aktivite oluşturma
router.get('/contacts/:contactId', getContactTimeline);
router.post('/contacts/:contactId', createActivity);

// Aktivite güncelleme ve silme
router.put('/:activityId', updateActivity);
router.delete('/:activityId', deleteActivity);

// Aktivite tamamlama ve üstlenme
router.put('/:activityId/complete', completeActivity);
router.put('/:activityId/claim', claimActivity);
router.get('/:activityId/detail', getActivityById);
router.get('/contacts/:contactId/retell-call', getContactRetellCall);
router.post('/workspace/:workspaceId/translate', requireWorkspaceAccess, translateText);

export default router;
