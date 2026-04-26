import prisma from '../lib/prisma.js';

/**
 * Log administrative activity to database
 * @param {Object} req - Express request object
 * @param {string} action - Action code (e.g., 'CREATE_USER', 'DELETE_WORKSPACE')
 * @param {string} targetType - Type of target (e.g., 'USER', 'WORKSPACE')
 * @param {string} targetId - ID of the target object
 * @param {string} targetName - Human-readable name of the target
 * @param {Object} details - Additional structured details
 */
export const logAdminActivity = async (req, action, targetType, targetId, targetName, details = null) => {
    try {
        if (!req.user) return;

        await prisma.adminActivityLog.create({
            data: {
                userId: req.user.id,
                userName: req.user.name || req.user.email,
                action,
                targetType,
                targetId,
                targetName,
                details: details ? JSON.stringify(details) : null,
                ipAddress: req.headers['x-forwarded-for'] || req.connection?.remoteAddress || null
            }
        });
    } catch (err) {
        console.error('⚠️ Activity log error:', err.message);
    }
};
