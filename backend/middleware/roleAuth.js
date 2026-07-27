import prisma from '../lib/prisma.js';

/**
 * Workspace üyeliği rol kontrolü
 * Kullanım: router.get('/route', authenticateJWT, requireRole('ADMIN', 'OWNER'), handler)
 * 
 * @param {...string} allowedRoles - İzin verilen roller (OWNER, ADMIN, MANAGER, AGENT)
 */
export function requireRole(...allowedRoles) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const workspaceId = req.params.workspaceId || req.body.workspaceId;
      
      if (!userId || !workspaceId) {
        return res.status(401).json({ error: 'Yetkilendirme bilgisi eksik' });
      }
      
      // SUPER_ADMIN her şeye erişir
      if (req.user.role === 'SUPER_ADMIN') return next();
      
      const member = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { workspaceId, userId } },
        select: { role: true }
      });
      
      if (!member) {
        return res.status(403).json({ error: 'Bu workspace\'a erişiminiz yok' });
      }
      
      if (!allowedRoles.includes(member.role)) {
        return res.status(403).json({ 
          error: 'Bu işlemi yapmak için yetkiniz yok',
          requiredRole: allowedRoles,
          currentRole: member.role
        });
      }
      
      // Rol bilgisini request'e ekle
      req.workspaceRole = member.role;
      next();
    } catch (error) {
      console.error('Role auth error:', error);
      res.status(500).json({ error: 'Yetkilendirme hatası' });
    }
  };
}

/**
 * Veri görünürlük filtresi
 * AGENT'ların göreceği veriyi workspace ayarına göre kısıtlar
 * 
 * Kullanım: router.get('/contacts', authenticateJWT, applyDataVisibility, handler)
 * req.dataFilter = { assignedToId: userId } veya {} (tümü)
 */
export const applyDataVisibility = async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const workspaceId = req.params.workspaceId || req.body.workspaceId;
      
      // SUPER_ADMIN, OWNER, ADMIN her şeyi görür
      if (['SUPER_ADMIN', 'ADMIN'].includes(req.user?.role)) {
        req.dataFilter = {};
        return next();
      }
      
      const member = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { workspaceId, userId } },
        select: { role: true, teamId: true }
      });
      
      if (!member) {
        req.dataFilter = { id: 'NONE' }; // Hiçbir şey gösterme
        return next();
      }
      
      // OWNER ve ADMIN: tüm veri
      if (['OWNER', 'ADMIN'].includes(member.role)) {
        req.dataFilter = {};
        return next();
      }
      
      // MANAGER: takım + kendi
      if (member.role === 'MANAGER') {
        const teamMembers = member.teamId 
          ? await prisma.teamMember.findMany({
              where: { teamId: member.teamId },
              select: { userId: true }
            })
          : [];
        const memberIds = teamMembers.map(m => m.userId).filter(Boolean);
        if (!memberIds.includes(userId)) memberIds.push(userId);
        req.dataFilter = { assignedToId: { in: memberIds } };
        return next();
      }
      
      // AGENT: workspace ayarına göre
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { agentDataVisibility: true }
      });
      
      const visibility = workspace?.agentDataVisibility || 'ALL';
      
      if (visibility === 'SELF') {
        req.dataFilter = { assignedToId: userId };
      } else if (visibility === 'TEAM') {
        const teamMembers = member.teamId 
          ? await prisma.teamMember.findMany({
              where: { teamId: member.teamId },
              select: { userId: true }
            })
          : [];
        const memberIds = teamMembers.map(m => m.userId).filter(Boolean);
        if (!memberIds.includes(userId)) memberIds.push(userId);
        req.dataFilter = { assignedToId: { in: memberIds } };
      } else {
        req.dataFilter = {}; // ALL
      }
      
      next();
    } catch (error) {
      console.error('Data visibility error:', error);
      req.dataFilter = {};
      next();
    }
  };

/**
 * Rol hiyerarşisi: Bir rolün diğerinden büyük olup olmadığını kontrol eder
 */
const ROLE_HIERARCHY = { 'OWNER': 4, 'ADMIN': 3, 'MANAGER': 2, 'AGENT': 1, 'VIEWER': 0 };

export function isRoleHigherOrEqual(role1, role2) {
  return (ROLE_HIERARCHY[role1] || 0) >= (ROLE_HIERARCHY[role2] || 0);
}
