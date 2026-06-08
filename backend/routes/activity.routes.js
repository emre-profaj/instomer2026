import express from 'express';
import { createActivity, getContactTimeline, updateActivity, deleteActivity, completeActivity, claimActivity, getWorkspaceCallQueue, getWorkspaceActivities, getActivityById } from '../controllers/activity.controller.js';
import { authenticateJWT } from '../middleware/auth.middleware.js';

const router = express.Router();

// Tüm route'lar için auth kontrolü
router.use(authenticateJWT);

// Workspace call queue (CALL + MEETING activities)
router.get('/workspace/:workspaceId/call-queue', getWorkspaceCallQueue);
router.get('/workspace/:workspaceId/list', getWorkspaceActivities);

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

export default router;
