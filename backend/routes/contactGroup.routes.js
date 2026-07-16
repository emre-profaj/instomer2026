import express from 'express';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.middleware.js';
import {
    getGroups, createGroup, updateGroup, deleteGroup,
    getGroupMembers, addMembers, removeMember, removeMembers,
    getAvailableContacts, getContactGroups
} from '../controllers/contactGroup.controller.js';

const router = express.Router();

router.use(authenticateJWT);

// Group CRUD
router.get('/:workspaceId/groups',              requireWorkspaceAccess, getGroups);
router.post('/:workspaceId/groups',             requireWorkspaceAccess, createGroup);
router.put('/:workspaceId/groups/:groupId',     requireWorkspaceAccess, updateGroup);
router.delete('/:workspaceId/groups/:groupId',  requireWorkspaceAccess, deleteGroup);

// Member management
router.get('/:workspaceId/groups/:groupId/members',               requireWorkspaceAccess, getGroupMembers);
router.post('/:workspaceId/groups/:groupId/members',              requireWorkspaceAccess, addMembers);
router.delete('/:workspaceId/groups/:groupId/members',            requireWorkspaceAccess, removeMembers);
router.delete('/:workspaceId/groups/:groupId/members/:contactId', requireWorkspaceAccess, removeMember);

// Available contacts picker (not in group)
router.get('/:workspaceId/groups/:groupId/available-contacts',    requireWorkspaceAccess, getAvailableContacts);

// Bir kişinin dahil olduğu gruplar
router.get('/:workspaceId/contacts/:contactId/groups', requireWorkspaceAccess, getContactGroups);

export default router;
