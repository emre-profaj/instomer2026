import express from 'express';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware.js';
import {
    getLocations, createLocation, updateLocation, deleteLocation,
    getBranches, createBranch, updateBranch, deleteBranch,
    createDoctor, updateDoctor, deleteDoctor,
    getFirmSettings, updateFirmSettings, seedHealthDemo, getAllDoctors
} from '../controllers/appointmentConfig.controller.js';

const router = express.Router();

// Firm / Sector Settings (SUPER_ADMIN only)
router.get('/:workspaceId/firm-settings', authenticateJWT, requireRole('SUPER_ADMIN'), getFirmSettings);
router.put('/:workspaceId/firm-settings', authenticateJWT, requireRole('SUPER_ADMIN'), updateFirmSettings);
router.post('/:workspaceId/seed-health-demo', authenticateJWT, requireRole('SUPER_ADMIN'), seedHealthDemo);

// Location (Şube / Lokasyon) routes
router.get('/:workspaceId/locations', authenticateJWT, getLocations);
router.post('/:workspaceId/locations', authenticateJWT, requireRole('SUPER_ADMIN'), createLocation);
router.put('/:workspaceId/locations/:id', authenticateJWT, requireRole('SUPER_ADMIN'), updateLocation);
router.delete('/:workspaceId/locations/:id', authenticateJWT, requireRole('SUPER_ADMIN'), deleteLocation);

// Branch (Tıbbi Branş) routes
router.get('/:workspaceId/branches', authenticateJWT, getBranches);
router.post('/:workspaceId/branches', authenticateJWT, requireRole('SUPER_ADMIN'), createBranch);
router.put('/:workspaceId/branches/:id', authenticateJWT, requireRole('SUPER_ADMIN'), updateBranch);
router.delete('/:workspaceId/branches/:id', authenticateJWT, requireRole('SUPER_ADMIN'), deleteBranch);

// Doctor (Hekim) routes
router.get('/:workspaceId/doctors', authenticateJWT, getAllDoctors);
router.post('/:workspaceId/doctors', authenticateJWT, requireRole('SUPER_ADMIN'), createDoctor);
router.put('/:workspaceId/doctors/:id', authenticateJWT, requireRole('SUPER_ADMIN'), updateDoctor);
router.delete('/:workspaceId/doctors/:id', authenticateJWT, requireRole('SUPER_ADMIN'), deleteDoctor);

export default router;
