import express from 'express';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import {
    getRouterRules,
    createRouterRule,
    updateRouterRule,
    deleteRouterRule,
    toggleRouterRule
} from '../controllers/routerRule.controller.js';

const router = express.Router();

router.use(authenticateJWT);

router.get('/:workspaceId/router-rules', getRouterRules);
router.post('/:workspaceId/router-rules', createRouterRule);
router.put('/:workspaceId/router-rules/:ruleId', updateRouterRule);
router.delete('/:workspaceId/router-rules/:ruleId', deleteRouterRule);
router.patch('/:workspaceId/router-rules/:ruleId/toggle', toggleRouterRule);

export default router;
