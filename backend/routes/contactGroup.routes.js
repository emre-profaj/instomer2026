import express from 'express';
import auth from '../middleware/auth.js';
import {
    getGroups, createGroup, updateGroup, deleteGroup,
    getGroupMembers, addMembers, removeMember, removeMembers,
    getAvailableContacts
} from '../controllers/contactGroup.controller.js';

const router = express.Router({ mergeParams: true });

// Group CRUD
router.get('/:workspaceId/groups',              auth, getGroups);
router.post('/:workspaceId/groups',             auth, createGroup);
router.put('/:workspaceId/groups/:groupId',     auth, updateGroup);
router.delete('/:workspaceId/groups/:groupId',  auth, deleteGroup);

// Member management
router.get('/:workspaceId/groups/:groupId/members',               auth, getGroupMembers);
router.post('/:workspaceId/groups/:groupId/members',              auth, addMembers);
router.delete('/:workspaceId/groups/:groupId/members',            auth, removeMembers);
router.delete('/:workspaceId/groups/:groupId/members/:contactId', auth, removeMember);

// Available contacts picker (not in group)
router.get('/:workspaceId/groups/:groupId/available-contacts',    auth, getAvailableContacts);

export default router;
