import express from 'express';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import { getWidgets, getWidget, createWidget, updateWidget, deleteWidget } from '../controllers/webwidget.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateJWT);

// Get all widgets for workspace
router.get('/', getWidgets);

// Get single widget
router.get('/:id', getWidget);

// Create new widget
router.post('/', createWidget);

// Update widget
router.put('/:id', updateWidget);

// Delete widget
router.delete('/:id', deleteWidget);

export default router;
