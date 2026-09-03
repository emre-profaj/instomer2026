import prisma from '../lib/prisma.js';
import passport from 'passport';
import jwt from 'jsonwebtoken';


// In-memory cache for authenticated users (TTL: 30s) to eliminate DB query storms on parallel requests
const userCache = new Map();
const USER_CACHE_TTL = 30 * 1000;

export const invalidateUserCache = (userId) => {
    if (userId) userCache.delete(userId);
    else userCache.clear();
};

export const authenticateJWT = (req, res, next) => {
    passport.authenticate('jwt', { session: false }, async (err, user, info) => {
        if (err) {
            return next(err);
        }

        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        try {
            // Check cache first
            const cached = userCache.get(user.id);
            if (cached && Date.now() - cached.timestamp < USER_CACHE_TTL) {
                req.user = cached.user;
                return next();
            }

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

            userCache.set(user.id, { user: freshUser, timestamp: Date.now() });
            req.user = freshUser;
            next();
        } catch (dbError) {
            console.error('Middleware database error:', dbError);
            return res.status(500).json({ error: 'Internal server error' });
        }
    })(req, res, next);
};
export const authenticate = authenticateJWT;

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

// In-memory cache for workspace memberships (TTL: 60s) to eliminate DB query storms on parallel requests
const memberCache = new Map();
const MEMBER_CACHE_TTL = 60 * 1000;

export const invalidateMemberCache = (userId, workspaceId) => {
    if (userId && workspaceId) memberCache.delete(`${userId}:${workspaceId}`);
    else if (userId) {
        for (const k of memberCache.keys()) {
            if (k.startsWith(`${userId}:`)) memberCache.delete(k);
        }
    } else memberCache.clear();
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

        // Check in-memory cache first
        const cacheKey = `${req.user.id}:${workspaceId}`;
        const cached = memberCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < MEMBER_CACHE_TTL) {
            req.workspaceMember = cached.member;
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
                const companyOwnerMember = {
                    userId: req.user.id,
                    workspaceId: workspaceId,
                    role: 'OWNER',
                    isCompanyOwner: true,
                    companyId: workspace.companyId
                };
                memberCache.set(cacheKey, { member: companyOwnerMember, timestamp: Date.now() });
                req.workspaceMember = companyOwnerMember;
                return next();
            }

            console.log(`🚫 [Auth] Access Denied: User ${req.user.id} has no access to Workspace ${workspaceId}`);
            return res.status(403).json({ error: 'Access denied to this workspace' });
        }

        memberCache.set(cacheKey, { member, timestamp: Date.now() });
        if (memberCache.size > 1000) {
            const now = Date.now();
            for (const [k, v] of memberCache.entries()) {
                if (now - v.timestamp > MEMBER_CACHE_TTL) memberCache.delete(k);
            }
        }

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
