import express from 'express';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import healthController from '../controllers/health.controller.js';

const router = express.Router();
router.use(authenticateJWT);

// ─── Ayarlar ───────────────────────────────────────────────────────────────
router.get('/:workspaceId/settings', healthController.getSettings);
router.put('/:workspaceId/settings', healthController.updateSettings);
router.post('/:workspaceId/test-connection', healthController.testConnection);

// ─── Probel API Proxy ──────────────────────────────────────────────────────
router.post('/:workspaceId/patient-token', healthController.getPatientToken);
router.get('/:workspaceId/branches', healthController.getBranches);
router.post('/:workspaceId/departments', healthController.getDepartments);
router.post('/:workspaceId/polyclinics', healthController.getPolyclinics);
router.post('/:workspaceId/available-days', healthController.getAvailableDays);
router.post('/:workspaceId/available-hours', healthController.getAvailableHours);
router.post('/:workspaceId/appointments/create', healthController.createAppointment);
router.post('/:workspaceId/appointments/cancel', healthController.cancelAppointment);
router.post('/:workspaceId/appointments/list', healthController.listAppointments);

export default router;
