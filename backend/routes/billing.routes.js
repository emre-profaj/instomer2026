import express from 'express';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware.js';
import {
    getBillingOverview,
    getPlans, createPlan, updatePlan, deletePlan,
    getBillingCompanies, getCompanyBillingDetail, updateCompanyBilling,
    addCredit, createInvoice, updateInvoice, createPayment,
    getMyBilling, getMyUsage, getMyInvoices, getMyPayments
} from '../controllers/billing.controller.js';

const router = express.Router();

// ===== ADMIN ROUTES (SUPER_ADMIN only) =====
router.get('/admin/overview', authenticateJWT, requireRole('SUPER_ADMIN'), getBillingOverview);
router.get('/admin/plans', authenticateJWT, requireRole('SUPER_ADMIN'), getPlans);
router.post('/admin/plans', authenticateJWT, requireRole('SUPER_ADMIN'), createPlan);
router.put('/admin/plans/:id', authenticateJWT, requireRole('SUPER_ADMIN'), updatePlan);
router.delete('/admin/plans/:id', authenticateJWT, requireRole('SUPER_ADMIN'), deletePlan);
router.get('/admin/companies', authenticateJWT, requireRole('SUPER_ADMIN'), getBillingCompanies);
router.get('/admin/companies/:companyId', authenticateJWT, requireRole('SUPER_ADMIN'), getCompanyBillingDetail);
router.put('/admin/companies/:companyId', authenticateJWT, requireRole('SUPER_ADMIN'), updateCompanyBilling);
router.post('/admin/companies/:companyId/credit', authenticateJWT, requireRole('SUPER_ADMIN'), addCredit);
router.post('/admin/companies/:companyId/invoice', authenticateJWT, requireRole('SUPER_ADMIN'), createInvoice);
router.put('/admin/invoices/:id', authenticateJWT, requireRole('SUPER_ADMIN'), updateInvoice);
router.post('/admin/payments', authenticateJWT, requireRole('SUPER_ADMIN'), createPayment);

// ===== MÜŞTERİ ROUTES (authenticated) =====
router.get('/my', authenticateJWT, getMyBilling);
router.get('/my/usage', authenticateJWT, getMyUsage);
router.get('/my/invoices', authenticateJWT, getMyInvoices);
router.get('/my/payments', authenticateJWT, getMyPayments);

export default router;
