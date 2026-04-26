import express from 'express';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import {
    getBranches, createBranch, updateBranch, deleteBranch,
    createDoctor, updateDoctor, deleteDoctor
} from '../controllers/appointmentConfig.controller.js';

const router = express.Router();

// Branch routes
router.get('/:workspaceId/branches', authenticateJWT, getBranches);
router.post('/:workspaceId/branches', authenticateJWT, createBranch);
router.put('/:workspaceId/branches/:id', authenticateJWT, updateBranch);
router.delete('/:workspaceId/branches/:id', authenticateJWT, deleteBranch);

// Doctor routes
router.post('/:workspaceId/doctors', authenticateJWT, createDoctor);
router.put('/:workspaceId/doctors/:id', authenticateJWT, updateDoctor);
router.delete('/:workspaceId/doctors/:id', authenticateJWT, deleteDoctor);

export default router;
