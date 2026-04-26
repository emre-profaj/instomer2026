import prisma from '../lib/prisma.js';
import passport from 'passport';
import jwt from 'jsonwebtoken';


export const authenticateJWT = (req, res, next) => {
    passport.authenticate('jwt', { session: false }, async (err, user, info) => {
        if (err) {
            return next(err);
        }

        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        try {
            // Fetch fresh user data from DB to ensure role is up-to-date
            const freshUser = await prisma.user.findUnique({
                where: { id: user.id },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    role: true,
                    facebookAccessToken: true,
                    facebookId: true
                }
            });

            if (!freshUser) {
                return res.status(401).json({ error: 'User no longer exists' });
            }

            req.user = freshUser;
            next();
        } catch (dbError) {
            console.error('Middleware database error:', dbError);
            return res.status(500).json({ error: 'Internal server error' });
        }
    })(req, res, next);
};

export const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
        }

        next();
    };
};

export const requireWorkspaceAccess = async (req, res, next) => {
    try {
        const workspaceId = req.params.workspaceId || req.body.workspaceId;

        if (!workspaceId) {
            return res.status(400).json({ error: 'Workspace ID is required' });
        }

        // SUPER_ADMIN Bypass: They can access any workspace
        if (req.user.role === 'SUPER_ADMIN') {
            req.workspaceMember = {
                userId: req.user.id,
                workspaceId: workspaceId,
                role: 'SUPER_ADMIN'
            };
            return next();
        }

        // First, check direct membership
        let member = await prisma.workspaceMember.findUnique({
            where: {
                userId_workspaceId: {
                    userId: req.user.id,
                    workspaceId: workspaceId
                }
            }
        });

        // If no direct membership, check if user is OWNER of company that owns this workspace
        if (!member) {
            // Get the workspace to check if it belongs to a company
            const workspace = await prisma.workspace.findUnique({
                where: { id: workspaceId },
                select: { companyId: true, company: { select: { ownerId: true } } }
            });

            if (workspace?.companyId && workspace?.company?.ownerId === req.user.id) {
                // Company owner can access all workspaces within their company
                console.log(`✅ [Auth] Company Owner Access: User ${req.user.id} accessing workspace ${workspaceId} via company ${workspace.companyId}`);
                req.workspaceMember = {
                    userId: req.user.id,
                    workspaceId: workspaceId,
                    role: 'OWNER',
                    isCompanyOwner: true,
                    companyId: workspace.companyId
                };
                return next();
            }

            console.log(`🚫 [Auth] Access Denied: User ${req.user.id} has no access to Workspace ${workspaceId}`);
            return res.status(403).json({ error: 'Access denied to this workspace' });
        }

        // Use workspace-specific role for access control
        // SUPER_ADMIN and OWNER have full access, others use their workspace role
        if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'OWNER') {
            member.role = req.user.role;
        }
        // Otherwise keep the workspace member's role (ADMIN, AGENT, etc.)

        req.workspaceMember = member;
        next();
    } catch (error) {
        console.error('Workspace access check error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const generateToken = (user) => {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );
};
