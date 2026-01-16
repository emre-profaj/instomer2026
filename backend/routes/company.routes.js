import express from 'express';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware.js';
import {
    getAllCompanies,
    createCompany,
    updateCompany,
    deleteCompany,
    getCompany,
    getMyCompanies,
    addWorkspaceToCompany,
    removeWorkspaceFromCompany,
    createWorkspaceInCompany,
    getAllUsers,
    getCompanyUsers,
    assignUserToWorkspaces,
    removeUserFromWorkspace
} from '../controllers/company.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateJWT);

// SUPER_ADMIN routes
router.get('/', getAllCompanies);
router.post('/', createCompany);
router.get('/users', getAllUsers);
router.get('/:companyId', getCompany);
router.put('/:companyId', updateCompany);
router.delete('/:companyId', deleteCompany);

// Workspace management within company
router.post('/:companyId/workspaces', createWorkspaceInCompany);
router.post('/:companyId/add-workspace', addWorkspaceToCompany);
router.delete('/:companyId/workspaces/:workspaceId', removeWorkspaceFromCompany);

// User's own companies
router.get('/my/companies', getMyCompanies);

// Company user management
router.get('/:companyId/users', getCompanyUsers);
router.post('/:companyId/users/assign', assignUserToWorkspaces);
router.post('/:companyId/users/remove', removeUserFromWorkspace);

export default router;
