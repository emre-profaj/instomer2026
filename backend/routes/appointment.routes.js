import express from 'express';
import { body } from 'express-validator';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';
import {
    getAppointments,
    getAppointment,
    createAppointment,
    updateAppointment,
    deleteAppointment,
    getAgentAvailability,
    getWorkspaceAgents
} from '../controllers/appointment.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateJWT);

// Get all appointments for workspace
router.get(
    '/:workspaceId',
    requireWorkspaceAccess,
    getAppointments
);

// Get agent availability
router.get(
    '/:workspaceId/availability',
    requireWorkspaceAccess,
    getAgentAvailability
);

// Get workspace agents
router.get(
    '/:workspaceId/agents',
    requireWorkspaceAccess,
    getWorkspaceAgents
);

// Get single appointment
router.get(
    '/:workspaceId/:id',
    requireWorkspaceAccess,
    getAppointment
);

// Create appointment
router.post(
    '/:workspaceId',
    requireWorkspaceAccess,
    [
        body('title').notEmpty().withMessage('Başlık gereklidir'),
        body('startTime').notEmpty().withMessage('Başlangıç zamanı gereklidir'),
        body('endTime').notEmpty().withMessage('Bitiş zamanı gereklidir')
    ],
    createAppointment
);

// Update appointment
router.put(
    '/:workspaceId/:id',
    requireWorkspaceAccess,
    updateAppointment
);

// Delete appointment
router.delete(
    '/:workspaceId/:id',
    requireWorkspaceAccess,
    deleteAppointment
);

// ─── Bot/AI Function Endpoints ───────────────────────────────────────────────
// Bu endpoint'ler AI botlar ve Retell tarafından function calling ile kullanılır

import { executeAppointmentFunction, checkAndSendReminders } from '../services/appointmentFunctions.service.js';

// Generic dispatcher: POST /:workspaceId/functions/:functionName
router.post(
    '/:workspaceId/functions/:functionName',
    requireWorkspaceAccess,
    async (req, res) => {
        try {
            const { workspaceId, functionName } = req.params;
            const result = await executeAppointmentFunction(functionName, workspaceId, req.body);
            res.json(result);
        } catch (error) {
            console.error(`❌ [AppointmentFn] ${req.params.functionName} error:`, error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

// Manual reminder trigger
router.post(
    '/:workspaceId/send-reminders',
    requireWorkspaceAccess,
    async (req, res) => {
        try {
            const result = await checkAndSendReminders(req.params.workspaceId);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);

export default router;









