import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// ── List groups ──────────────────────────────────
export const getGroups = async (req, res) => {
    const { workspaceId } = req.params;
    try {
        const groups = await prisma.contactGroup.findMany({
            where: { workspaceId },
            include: { _count: { select: { members: true } } },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ groups });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Gruplar yüklenemedi' });
    }
};

// ── Create group ─────────────────────────────────
export const createGroup = async (req, res) => {
    const { workspaceId } = req.params;
    const { name, description, icon, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Grup adı zorunlu' });
    try {
        const group = await prisma.contactGroup.create({
            data: { workspaceId, name, description, icon: icon || '👥', color: color || '#2563eb' },
            include: { _count: { select: { members: true } } }
        });
        res.status(201).json(group);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Grup oluşturulamadı' });
    }
};

// ── Update group ─────────────────────────────────
export const updateGroup = async (req, res) => {
    const { groupId } = req.params;
    const { name, description, icon, color } = req.body;
    try {
        const group = await prisma.contactGroup.update({
            where: { id: groupId },
            data: { name, description, icon, color },
            include: { _count: { select: { members: true } } }
        });
        res.json(group);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Grup güncellenemedi' });
    }
};

// ── Delete group ─────────────────────────────────
export const deleteGroup = async (req, res) => {
    const { groupId } = req.params;
    try {
        await prisma.contactGroup.delete({ where: { id: groupId } });
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Grup silinemedi' });
    }
};

// ── Get group members (with contact info) ────────
export const getGroupMembers = async (req, res) => {
    const { groupId } = req.params;
    const { page = 1, limit = 50, search = '' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    try {
        const allMembers = await prisma.contactGroupMember.findMany({
            where: { groupId },
            select: { contactId: true, addedAt: true }
        });
        const contactIds = allMembers.map(m => m.contactId);

        if (contactIds.length === 0) return res.json({ members: [], total: 0 });

        const where = {
            id: { in: contactIds },
            ...(search ? {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { phone: { contains: search } },
                    { email: { contains: search, mode: 'insensitive' } }
                ]
            } : {})
        };

        const [contacts, total] = await Promise.all([
            prisma.contact.findMany({
                where,
                select: { id: true, name: true, phone: true, email: true, status: true, source: true },
                skip,
                take: parseInt(limit),
                orderBy: { name: 'asc' }
            }),
            prisma.contact.count({ where })
        ]);

        const addedAtMap = Object.fromEntries(allMembers.map(m => [m.contactId, m.addedAt]));
        const members = contacts.map(c => ({ ...c, addedAt: addedAtMap[c.id] }));

        res.json({ members, total });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Üyeler yüklenemedi' });
    }
};

// ── Add members to group ─────────────────────────
export const addMembers = async (req, res) => {
    const { groupId } = req.params;
    const { contactIds } = req.body;
    if (!Array.isArray(contactIds) || contactIds.length === 0)
        return res.status(400).json({ error: 'contactIds dizisi gerekli' });

    try {
        await prisma.contactGroupMember.createMany({
            data: contactIds.map(contactId => ({ groupId, contactId })),
            skipDuplicates: true
        });
        const count = await prisma.contactGroupMember.count({ where: { groupId } });
        res.json({ added: contactIds.length, total: count });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Üye eklenemedi' });
    }
};

// ── Remove single member ─────────────────────────
export const removeMember = async (req, res) => {
    const { groupId, contactId } = req.params;
    try {
        await prisma.contactGroupMember.deleteMany({ where: { groupId, contactId } });
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Üye çıkarılamadı' });
    }
};

// ── Remove multiple members ──────────────────────
export const removeMembers = async (req, res) => {
    const { groupId } = req.params;
    const { contactIds } = req.body;
    if (!Array.isArray(contactIds)) return res.status(400).json({ error: 'contactIds gerekli' });
    try {
        await prisma.contactGroupMember.deleteMany({
            where: { groupId, contactId: { in: contactIds } }
        });
        res.json({ ok: true, removed: contactIds.length });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Üyeler çıkarılamadı' });
    }
};

// ── Get contacts NOT in group (for picker) ───────
export const getAvailableContacts = async (req, res) => {
    const { workspaceId, groupId } = req.params;
    const { search = '', page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    try {
        const existing = await prisma.contactGroupMember.findMany({
            where: { groupId },
            select: { contactId: true }
        });
        const excludeIds = existing.map(m => m.contactId);

        const where = {
            workspaceId,
            isDeleted: false,
            isArchived: false,
            ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
            ...(search ? {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { phone: { contains: search } },
                    { email: { contains: search, mode: 'insensitive' } }
                ]
            } : {})
        };

        const [contacts, total] = await Promise.all([
            prisma.contact.findMany({
                where,
                select: { id: true, name: true, phone: true, email: true, source: true },
                skip,
                take: parseInt(limit),
                orderBy: { name: 'asc' }
            }),
            prisma.contact.count({ where })
        ]);

        res.json({ contacts, total });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Kişiler yüklenemedi' });
    }
};
