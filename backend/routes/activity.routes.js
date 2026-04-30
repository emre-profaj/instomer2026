import express from 'express';
import { createActivity, getContactTimeline, updateActivity, deleteActivity } from '../controllers/activity.controller.js';
import { authenticateJWT } from '../middleware/auth.middleware.js';

const router = express.Router();

// Tüm route'lar için auth kontrolü
router.use(authenticateJWT);

// Kişi kartı aktivite geçmişi ve aktivite oluşturma
router.get('/contacts/:contactId', getContactTimeline);
router.post('/contacts/:contactId', createActivity);

// Aktivite güncelleme ve silme
router.put('/:activityId', updateActivity);
router.delete('/:activityId', deleteActivity);

export default router;
