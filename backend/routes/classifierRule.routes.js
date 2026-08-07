import express from 'express';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import {
    getClassifierRules,
    createClassifierRule,
    updateClassifierRule,
    deleteClassifierRule,
    reorderClassifierRules,
    toggleClassifierRule
} from '../controllers/classifierRule.controller.js';

const router = express.Router();

router.use(authenticateJWT);

router.get('/:workspaceId/classifier-rules', getClassifierRules);
router.post('/:workspaceId/classifier-rules', createClassifierRule);
router.patch('/:workspaceId/classifier-rules/reorder', reorderClassifierRules);
router.put('/:workspaceId/classifier-rules/:ruleId', updateClassifierRule);
router.delete('/:workspaceId/classifier-rules/:ruleId', deleteClassifierRule);
router.patch('/:workspaceId/classifier-rules/:ruleId/toggle', toggleClassifierRule);

export default router;
