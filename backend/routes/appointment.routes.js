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
        body('endTime').notEmpty().withMessage('Bitiş zamanı gereklidir'),
        body('assignedToId').notEmpty().withMessage('Atanan kişi gereklidir')
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

export default router;












