import prisma from '../lib/prisma.js';

// Date Helpers
const getStartOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const getEndOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
};

const getStartOfWeek = (date = new Date()) => {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Monday as start of week
  d.setUTCDate(diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const getStartOfMonth = (date = new Date()) => {
  const d = new Date(date);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const getStartOfLastMonth = () => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 1);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const getEndOfLastMonth = () => {
  const d = new Date();
  d.setUTCDate(0); // Last day of previous month
  d.setUTCHours(23, 59, 59, 999);
  return d;
};

const getDaysAgo = (days) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

const baseWhere = (workspaceId) => ({
  workspaceId,
  isDeleted: false,
  isBlocked: false,
});

const segments = [
  // 📅 Zaman Bazlı (TIME)
  {
    id: 'THIS_WEEK',
    label: 'Bu Hafta Gelenler',
    icon: '📅',
    group: 'TIME',
    requiresSubquery: false,
    buildWhere: () => ({ createdAt: { gte: getStartOfWeek() } }),
  },
  {
    id: 'THIS_MONTH',
    label: 'Bu Ay Gelenler',
    icon: '📅',
    group: 'TIME',
    requiresSubquery: false,
    buildWhere: () => ({ createdAt: { gte: getStartOfMonth() } }),
  },
  {
    id: 'LAST_MONTH',
    label: 'Geçen Ay Gelenler',
    icon: '📅',
    group: 'TIME',
    requiresSubquery: false,
    buildWhere: () => ({ createdAt: { gte: getStartOfLastMonth(), lte: getEndOfLastMonth() } }),
  },
  {
    id: 'LAST_7_DAYS',
    label: 'Son 7 Günde Gelenler',
    icon: '📅',
    group: 'TIME',
    requiresSubquery: false,
    buildWhere: () => ({ createdAt: { gte: getDaysAgo(7) } }),
  },
  {
    id: 'LAST_30_DAYS',
    label: 'Son 30 Günde Gelenler',
    icon: '📅',
    group: 'TIME',
    requiresSubquery: false,
    buildWhere: () => ({ createdAt: { gte: getDaysAgo(30) } }),
  },

  // 🔥 Lead Durumu (LEAD_STATUS)
  {
    id: 'HOT_LEADS',
    label: 'Sıcak Leadler',
    icon: '🔥',
    group: 'LEAD_STATUS',
    requiresSubquery: false,
    buildWhere: () => ({ leadTemperature: { in: ['HOT', 'FIRE'] } }),
  },
  {
    id: 'COLD_LEADS',
    label: 'Soğuk Leadler',
    icon: '❄️',
    group: 'LEAD_STATUS',
    requiresSubquery: false,
    buildWhere: () => ({ leadTemperature: { in: ['COLD', 'COOL'] } }),
  },
  {
    id: 'WARM_LEADS',
    label: 'Ilık Leadler',
    icon: '☀️',
    group: 'LEAD_STATUS',
    requiresSubquery: false,
    buildWhere: () => ({ leadTemperature: 'WARM' }),
  },
  {
    id: 'HIGH_SCORE',
    label: 'Yüksek Skorlu',
    icon: '📈',
    group: 'LEAD_STATUS',
    requiresSubquery: false,
    buildWhere: () => ({ leadScore: { gte: 70 } }),
  },
  {
    id: 'NEW_CONTACTS',
    label: 'Yeni Kişiler',
    icon: '✨',
    group: 'LEAD_STATUS',
    requiresSubquery: false,
    buildWhere: () => ({ category: 'NEW' }),
  },
  {
    id: 'VIP_CONTACTS',
    label: 'VIP Müşteriler',
    icon: '🌟',
    group: 'LEAD_STATUS',
    requiresSubquery: false,
    buildWhere: () => ({ category: 'VIP' }),
  },
  {
    id: 'CUSTOMERS',
    label: 'Müşteriler',
    icon: '🤝',
    group: 'LEAD_STATUS',
    requiresSubquery: false,
    buildWhere: () => ({ category: 'CUSTOMER' }),
  },
  {
    id: 'OPPORTUNITIES',
    label: 'Fırsatlar',
    icon: '🎯',
    group: 'LEAD_STATUS',
    requiresSubquery: false,
    buildWhere: () => ({ category: 'OPPORTUNITY' }),
  },

  // 📞 Arama Durumu (CALL_STATUS)
  {
    id: 'NOT_CALLED',
    label: 'Hiç Aranmamış',
    icon: '📵',
    group: 'CALL_STATUS',
    requiresSubquery: true,
    buildContactIds: async (workspaceId) => {
      const calledContacts = await prisma.contactActivity.findMany({
        where: { contact: { workspaceId }, type: 'CALL' },
        select: { contactId: true },
        distinct: ['contactId']
      });
      const calledIds = calledContacts.map(c => c.contactId);
      const notCalledContacts = await prisma.contact.findMany({
        where: { workspaceId, id: { notIn: calledIds } },
        select: { id: true }
      });
      return notCalledContacts.map(c => c.id);
    },
  },
  {
    id: 'CALLED_REACHED',
    label: 'Aranmış & Ulaşılmış',
    icon: '📞',
    group: 'CALL_STATUS',
    requiresSubquery: true,
    buildContactIds: async (workspaceId) => {
      const activities = await prisma.contactActivity.findMany({
        where: { contact: { workspaceId }, type: 'CALL', status: 'COMPLETED', callSuccessful: true },
        select: { contactId: true },
        distinct: ['contactId']
      });
      return activities.map(a => a.contactId);
    },
  },
  {
    id: 'CALLED_NOT_REACHED',
    label: 'Aranmış & Ulaşılamamış',
    icon: '❌',
    group: 'CALL_STATUS',
    requiresSubquery: true,
    buildContactIds: async (workspaceId) => {
      // Has unsuccessful calls, but NO successful calls
      const successfulActivities = await prisma.contactActivity.findMany({
        where: { contact: { workspaceId }, type: 'CALL', status: 'COMPLETED', callSuccessful: true },
        select: { contactId: true },
        distinct: ['contactId']
      });
      const successfulIds = successfulActivities.map(a => a.contactId);
      
      const unsuccessfulActivities = await prisma.contactActivity.findMany({
        where: { 
          contact: { workspaceId }, 
          type: 'CALL', 
          status: 'COMPLETED', 
          callSuccessful: false,
          contactId: { notIn: successfulIds }
        },
        select: { contactId: true },
        distinct: ['contactId']
      });
      return unsuccessfulActivities.map(a => a.contactId);
    },
  },
  {
    id: 'CALLED_POSITIVE',
    label: 'Aranmış & Olumlu',
    icon: '👍',
    group: 'CALL_STATUS',
    requiresSubquery: true,
    buildContactIds: async (workspaceId) => {
      const activities = await prisma.contactActivity.findMany({
        where: { contact: { workspaceId }, type: 'CALL', status: 'COMPLETED', callSentiment: 'Positive' },
        select: { contactId: true },
        distinct: ['contactId']
      });
      return activities.map(a => a.contactId);
    },
  },
  {
    id: 'CALLED_NEGATIVE',
    label: 'Aranmış & Olumsuz',
    icon: '👎',
    group: 'CALL_STATUS',
    requiresSubquery: true,
    buildContactIds: async (workspaceId) => {
      const activities = await prisma.contactActivity.findMany({
        where: { contact: { workspaceId }, type: 'CALL', status: 'COMPLETED', callSentiment: 'Negative' },
        select: { contactId: true },
        distinct: ['contactId']
      });
      return activities.map(a => a.contactId);
    },
  },

  // 📋 İş Durumu (BUSINESS)
  {
    id: 'HAS_PROPOSAL',
    label: 'Teklif Alanlar',
    icon: '📝',
    group: 'BUSINESS',
    requiresSubquery: true,
    buildContactIds: async (workspaceId) => {
      const activities = await prisma.contactActivity.findMany({
        where: { contact: { workspaceId }, type: 'PROPOSAL' },
        select: { contactId: true },
        distinct: ['contactId']
      });
      return activities.map(a => a.contactId);
    },
  },
  {
    id: 'HAS_APPOINTMENT_TODAY',
    label: 'Bugün Randevusu Var',
    icon: '⏰',
    group: 'BUSINESS',
    requiresSubquery: true,
    buildContactIds: async (workspaceId) => {
      const appointments = await prisma.appointment.findMany({
        where: { 
          workspaceId,
          contactId: { not: null },
          status: 'SCHEDULED', 
          startTime: { gte: getStartOfDay(), lte: getEndOfDay() } 
        },
        select: { contactId: true },
        distinct: ['contactId']
      });
      return appointments.filter(a => a.contactId).map(a => a.contactId);
    },
  },
  {
    id: 'HAS_APPOINTMENT_TOMORROW',
    label: 'Yarın Randevusu Var',
    icon: '🔜',
    group: 'BUSINESS',
    requiresSubquery: true,
    buildContactIds: async (workspaceId) => {
      const tomorrow = addDays(new Date(), 1);
      const appointments = await prisma.appointment.findMany({
        where: { 
          workspaceId,
          contactId: { not: null },
          status: 'SCHEDULED', 
          startTime: { gte: getStartOfDay(tomorrow), lte: getEndOfDay(tomorrow) } 
        },
        select: { contactId: true },
        distinct: ['contactId']
      });
      return appointments.filter(a => a.contactId).map(a => a.contactId);
    },
  },
  {
    id: 'HAS_APPOINTMENT_THIS_WEEK',
    label: 'Bu Hafta Randevusu Var',
    icon: '📆',
    group: 'BUSINESS',
    requiresSubquery: true,
    buildContactIds: async (workspaceId) => {
      const start = getStartOfWeek();
      const end = addDays(start, 6); // End of Sunday
      const appointments = await prisma.appointment.findMany({
        where: { 
          workspaceId,
          contactId: { not: null },
          status: 'SCHEDULED', 
          startTime: { gte: start, lte: getEndOfDay(end) } 
        },
        select: { contactId: true },
        distinct: ['contactId']
      });
      return appointments.filter(a => a.contactId).map(a => a.contactId);
    },
  },
  {
    id: 'ACTIVE_CASE',
    label: "Aktif Case'i Var",
    icon: '📂',
    group: 'BUSINESS',
    requiresSubquery: true,
    buildContactIds: async (workspaceId) => {
      const cases = await prisma.case.findMany({
        where: { workspaceId, status: 'ACTIVE' },
        select: { contactId: true },
        distinct: ['contactId']
      });
      return cases.filter(c => c.contactId).map(c => c.contactId);
    },
  },
  {
    id: 'NO_CASE',
    label: "Case'siz Kişiler",
    icon: '📭',
    group: 'BUSINESS',
    requiresSubquery: true,
    buildContactIds: async (workspaceId) => {
      const cases = await prisma.case.findMany({
        where: { workspaceId },
        select: { contactId: true },
        distinct: ['contactId']
      });
      const caseIds = cases.filter(c => c.contactId).map(c => c.contactId);
      const noCaseContacts = await prisma.contact.findMany({
        where: { workspaceId, id: { notIn: caseIds } },
        select: { id: true }
      });
      return noCaseContacts.map(c => c.id);
    },
  },

  // 🌐 Kaynak (SOURCE)
  {
    id: 'FROM_FACEBOOK',
    label: "Facebook'tan",
    icon: '📘',
    group: 'SOURCE',
    requiresSubquery: false,
    buildWhere: () => ({ source: 'FACEBOOK' }),
  },
  {
    id: 'FROM_INSTAGRAM',
    label: "Instagram'dan",
    icon: '📸',
    group: 'SOURCE',
    requiresSubquery: false,
    buildWhere: () => ({ source: 'INSTAGRAM' }),
  },
  {
    id: 'FROM_WHATSAPP',
    label: "WhatsApp'tan",
    icon: '💬',
    group: 'SOURCE',
    requiresSubquery: false,
    buildWhere: () => ({ source: 'WHATSAPP' }),
  },
  {
    id: 'FROM_FORM',
    label: 'Formdan',
    icon: '📋',
    group: 'SOURCE',
    requiresSubquery: false,
    buildWhere: () => ({
      OR: [
        { source: { in: ['FORM', 'WEB'] } },
        { source: { contains: 'FORM' } }
      ]
    }),
  },
  {
    id: 'FROM_RETELL',
    label: 'AI Aramadan',
    icon: '🤖',
    group: 'SOURCE',
    requiresSubquery: false,
    buildWhere: () => ({ source: 'RETELL' }),
  },

  // 💤 Etkileşim (ENGAGEMENT)
  {
    id: 'INACTIVE_30D',
    label: '30 Gündür Sessiz',
    icon: '💤',
    group: 'ENGAGEMENT',
    requiresSubquery: false,
    buildWhere: () => ({
      OR: [
        { lastContactedAt: { lt: getDaysAgo(30) } },
        { lastContactedAt: null }
      ]
    }),
  },
  {
    id: 'INACTIVE_7D',
    label: '7 Gündür Sessiz',
    icon: '🛌',
    group: 'ENGAGEMENT',
    requiresSubquery: false,
    buildWhere: () => ({
      AND: [
        {
          OR: [
            { lastContactedAt: { lt: getDaysAgo(7) } },
            { lastContactedAt: null }
          ]
        },
        { createdAt: { lt: getDaysAgo(7) } }
      ]
    }),
  },
  {
    id: 'HAS_PHONE',
    label: 'Telefonu Var',
    icon: '📱',
    group: 'ENGAGEMENT',
    requiresSubquery: false,
    buildWhere: () => ({ phone: { not: null } }),
  },
  {
    id: 'HAS_EMAIL',
    label: 'E-postası Var',
    icon: '✉️',
    group: 'ENGAGEMENT',
    requiresSubquery: false,
    buildWhere: () => ({ email: { not: null } }),
  },
  {
    id: 'MARKETING_OPTED_OUT',
    label: 'Pazarlama Reddetmiş',
    icon: '🚫',
    group: 'ENGAGEMENT',
    requiresSubquery: false,
    buildWhere: () => ({ marketingOptOut: true }),
  },
];

const segmentMap = new Map(segments.map(s => [s.id, s]));

export const getSegmentList = () => {
  return segments.map(({ id, label, icon, group }) => ({ id, label, icon, group }));
};

export const getSegmentGroups = () => {
  return segments.reduce((acc, segment) => {
    if (!acc[segment.group]) {
      acc[segment.group] = [];
    }
    acc[segment.group].push({
      id: segment.id,
      label: segment.label,
      icon: segment.icon,
      group: segment.group
    });
    return acc;
  }, {});
};

export const buildSegmentWhere = async (segmentId, workspaceId) => {
  const segment = segmentMap.get(segmentId);
  if (!segment) {
    throw new Error(`Segment not found: ${segmentId}`);
  }

  if (segment.requiresSubquery) {
    const contactIds = await segment.buildContactIds(workspaceId);
    return { contactIds };
  } else {
    return { where: segment.buildWhere() };
  }
};

export const getSegmentCount = async (segmentId, workspaceId) => {
  const segmentResult = await buildSegmentWhere(segmentId, workspaceId);
  let whereClause = { ...baseWhere(workspaceId) };

  if (segmentResult.contactIds) {
    whereClause.id = { in: segmentResult.contactIds };
  } else if (segmentResult.where) {
    whereClause = { ...whereClause, ...segmentResult.where };
  }

  return await prisma.contact.count({
    where: whereClause
  });
};

export const evaluateContactSegment = async (contactId, segmentId, workspaceId) => {
  const segmentResult = await buildSegmentWhere(segmentId, workspaceId);
  let whereClause = { ...baseWhere(workspaceId), id: contactId };

  if (segmentResult.contactIds) {
    return segmentResult.contactIds.includes(contactId);
  } else if (segmentResult.where) {
    whereClause = { ...whereClause, ...segmentResult.where };
  }

  const count = await prisma.contact.count({
    where: whereClause
  });

  return count > 0;
};
