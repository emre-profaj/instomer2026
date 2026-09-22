import express from 'express';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';
import {
    createTeam,
    getTeams,
    addTeamMember,
    removeTeamMember,
    getTeamMembers,
    getTeamOverview,
    updateTeam,
    deleteTeam
} from '../controllers/team.controller.js';

const router = express.Router();

router.use(authenticateJWT);

// Get all teams in workspace
router.get('/:workspaceId', requireWorkspaceAccess, getTeams);
router.get('/:workspaceId/overview', requireWorkspaceAccess, getTeamOverview);

// Create team
router.post('/:workspaceId', requireWorkspaceAccess, createTeam);

// Update team
router.put('/:workspaceId/:teamId', requireWorkspaceAccess, updateTeam);

// Delete team
router.delete('/:workspaceId/:teamId', requireWorkspaceAccess, deleteTeam);

// Membership
router.get('/:workspaceId/:teamId/members', requireWorkspaceAccess, getTeamMembers);
router.post('/:workspaceId/:teamId/members', requireWorkspaceAccess, addTeamMember);
router.delete('/:workspaceId/:teamId/members/:memberId', requireWorkspaceAccess, removeTeamMember);

export default router;
