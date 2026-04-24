import express from 'express';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import {
    // Modül
    getModule, updateModule,
    // Projeler
    getProjects, createProject, updateProject, deleteProject,
    // Daire tipleri
    getApartmentTypes, uploadRealEstateImage, createApartmentType, updateApartmentType, deleteApartmentType,
    // Bağımsız bölümler
    getUnits, createUnit, updateUnit, deleteUnit,
    // Kampanyalar
    getCampaigns, createCampaign, updateCampaign, deleteCampaign,
    // Hesaplama
    calculate,
    // Teklifler
    getOffers, createOffer, updateOfferStatus, getOfferById, sendOfferEmail, deleteOffer,
    reUpload
} from '../controllers/realestate.controller.js';

const router = express.Router();

// Tüm route'lar için auth gerekli
router.use(authenticateJWT);

// ─── Modül Ayarları ────────────────────────────────────────────────────────
router.get('/:workspaceId/module', getModule);
router.put('/:workspaceId/module', updateModule);

// ─── Projeler ──────────────────────────────────────────────────────────────
router.get('/:workspaceId/projects', getProjects);
router.post('/:workspaceId/projects', createProject);
router.put('/:workspaceId/projects/:projectId', updateProject);
router.delete('/:workspaceId/projects/:projectId', deleteProject);

// ─── Daire Tipleri (Basit Sürüm) ──────────────────────────────────────────
router.get('/:workspaceId/projects/:projectId/apartment-types', getApartmentTypes);
router.post('/:workspaceId/upload-image', reUpload.single('image'), uploadRealEstateImage);
router.post('/:workspaceId/projects/:projectId/apartment-types', createApartmentType);
router.put('/:workspaceId/projects/:projectId/apartment-types/:typeId', updateApartmentType);
router.delete('/:workspaceId/projects/:projectId/apartment-types/:typeId', deleteApartmentType);

// ─── Bağımsız Bölümler (Gelişmiş Sürüm) ──────────────────────────────────
router.get('/:workspaceId/projects/:projectId/units', getUnits);
router.post('/:workspaceId/projects/:projectId/units', createUnit);
router.put('/:workspaceId/projects/:projectId/units/:unitId', updateUnit);
router.delete('/:workspaceId/projects/:projectId/units/:unitId', deleteUnit);

// ─── Kampanyalar ───────────────────────────────────────────────────────────
router.get('/:workspaceId/projects/:projectId/campaigns', getCampaigns);
router.post('/:workspaceId/projects/:projectId/campaigns', createCampaign);
router.put('/:workspaceId/projects/:projectId/campaigns/:campaignId', updateCampaign);
router.delete('/:workspaceId/projects/:projectId/campaigns/:campaignId', deleteCampaign);

// ─── Hesaplama Motoru ──────────────────────────────────────────────────────
router.post('/:workspaceId/calculate', calculate);

// ─── Teklifler ─────────────────────────────────────────────────────────────
router.get('/:workspaceId/offers', getOffers);
router.post('/:workspaceId/offers', createOffer);
router.get('/:workspaceId/offers/:offerId', getOfferById);
router.patch('/:workspaceId/offers/:offerId/status', updateOfferStatus);
router.post('/:workspaceId/offers/:offerId/send-email', sendOfferEmail);
router.delete('/:workspaceId/offers/:offerId', deleteOffer);

export default router;
