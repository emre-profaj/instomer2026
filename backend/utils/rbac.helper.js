import prisma from '../lib/prisma.js';

/**
 * RBAC Helper — Agent rol kısıtlamalarını merkezi olarak yönetir.
 * 
 * Agent rolü kuralı: Kendi + Havuz (takımına atanmış ama kimseye assign edilmemiş)
 * OWNER/ADMIN/SUPER_ADMIN: Tüm workspace verisini görür.
 */

/**
 * Kullanıcının üyesi olduğu takım ID'lerini döndürür
 */
export const getAgentTeamIds = async (userId) => {
    const teamMembers = await prisma.teamMember.findMany({
        where: { userId },
        select: { teamId: true }
    });
    return teamMembers.map(t => t.teamId);
};

/**
 * Kullanıcının AGENT rolünde olup olmadığını kontrol eder.
 * SUPER_ADMIN, OWNER, ADMIN → false döner (tam yetki)
 */
export const isAgentRole = (req) => {
    const role = req.workspaceMember?.role;
    // SUPER_ADMIN, OWNER, ADMIN tam yetkililer
    if (['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(role)) return false;
    // AGENT veya başka herhangi bir rol → kısıtlı
    return true;
};

/**
 * Activities için AGENT erişim filtresi oluşturur.
 * 
 * Kural: Kendisine atanan + Kendisinin oluşturduğu + Takımındaki tüm aktiviteler
 * 
 * @param {string} userId - Mevcut kullanıcı ID
 * @param {string[]} myTeamIds - Kullanıcının takım ID'leri
 * @returns {object} Prisma OR condition
 */
export const buildAgentActivityFilter = (userId, myTeamIds) => {
    const conditions = [
        { assignedToId: userId }, // Kendisine atanan
        { createdBy: userId }     // Kendisinin oluşturduğu
    ];

    // Takımdaki tüm aktiviteler (hem havuz hem atanmış)
    if (myTeamIds.length > 0) {
        conditions.push(
            { teamId: { in: myTeamIds } }
        );
    }

    return { OR: conditions };
};

/**
 * Appointment modeli için AGENT erişim filtresi oluşturur.
 * Randevularda takım kavramı yoktur, sadece assignedToId + createdById filtresi.
 * 
 * Kural: assignedToId = userId OR createdById = userId
 */
export const buildAgentAppointmentFilter = (userId) => {
    return {
        OR: [
            { assignedToId: userId },
            { createdById: userId }
        ]
    };
};

/**
 * Deal modeli için AGENT erişim filtresi oluşturur.
 * Deal'larda takım kavramı yoktur.
 * 
 * Kural: Kendisine atanan + Kendisinin oluşturduğu/atadığı + Havuz
 */
export const buildAgentDealFilter = (userId) => {
    return {
        OR: [
            { assignedToId: userId },   // Kendisine atanan
            { assignedById: userId },   // Kendisinin oluşturduğu / atadığı
            { assignedToId: null }      // Havuz (kimseye atanmamış)
        ]
    };
};
