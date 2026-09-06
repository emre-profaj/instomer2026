import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as appNotesController from '../controllers/appNotes.controller.js';

const router = express.Router();
router.use(requireAuth);

router.get('/:workspaceId/notes', appNotesController.getNotes);
router.post('/:workspaceId/notes', appNotesController.createNote);
router.put('/:workspaceId/notes/:id', appNotesController.updateNote);
router.delete('/:workspaceId/notes/:id', appNotesController.deleteNote);

export default router;
