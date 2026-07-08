import prisma from '../lib/prisma.js';

// ─── BRANCH CRUD ────────────────────────────────────────────────────────────

export const getBranches = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const branches = await prisma.appointmentBranch.findMany({
            where: { workspaceId },
            include: { doctors: { orderBy: { name: 'asc' } } },
            orderBy: { order: 'asc' }
        });
        res.json({ branches });
    } catch (error) {
        console.error('Get branches error:', error);
        res.status(500).json({ error: 'Branşlar yüklenirken hata oluştu' });
    }
};

export const createBranch = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Branş adı gereklidir' });
        }

        // Get max order
        const maxOrder = await prisma.appointmentBranch.aggregate({
            where: { workspaceId },
            _max: { order: true }
        });

        const branch = await prisma.appointmentBranch.create({
            data: {
                workspaceId,
                name,
                order: (maxOrder._max.order || 0) + 1
            },
            include: { doctors: true }
        });

        res.status(201).json({ branch });
    } catch (error) {
        console.error('Create branch error:', error);
        res.status(500).json({ error: 'Branş oluşturulurken hata oluştu' });
    }
};

export const updateBranch = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const { name, isActive, order } = req.body;

        const existing = await prisma.appointmentBranch.findFirst({ where: { id, workspaceId } });
        if (!existing) return res.status(404).json({ error: 'Branş bulunamadı' });

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (order !== undefined) updateData.order = order;

        const branch = await prisma.appointmentBranch.update({
            where: { id },
            data: updateData,
            include: { doctors: true }
        });

        res.json({ branch });
    } catch (error) {
        console.error('Update branch error:', error);
        res.status(500).json({ error: 'Branş güncellenirken hata oluştu' });
    }
};

export const deleteBranch = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;

        const existing = await prisma.appointmentBranch.findFirst({ where: { id, workspaceId } });
        if (!existing) return res.status(404).json({ error: 'Branş bulunamadı' });

        await prisma.appointmentBranch.delete({ where: { id } });
        res.json({ success: true, message: 'Branş silindi' });
    } catch (error) {
        console.error('Delete branch error:', error);
        res.status(500).json({ error: 'Branş silinirken hata oluştu' });
    }
};

// ─── DOCTOR CRUD ────────────────────────────────────────────────────────────

export const createDoctor = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { branchId, name, title, userId, workingDays, workStart, workEnd, slotMinutes } = req.body;

        if (!branchId || !name) {
            return res.status(400).json({ error: 'Branş ve doktor adı gereklidir' });
        }

        // Verify branch belongs to workspace
        const branch = await prisma.appointmentBranch.findFirst({ where: { id: branchId, workspaceId } });
        if (!branch) return res.status(404).json({ error: 'Branş bulunamadı' });

        const doctor = await prisma.appointmentDoctor.create({
            data: {
                branchId,
                name,
                title: title || null,
                userId: userId || null,
                workingDays: workingDays ? JSON.stringify(workingDays) : JSON.stringify(["monday", "tuesday", "wednesday", "thursday", "friday"]),
                workStart: workStart || '09:00',
                workEnd: workEnd || '17:00',
                slotMinutes: slotMinutes || 30
            }
        });

        res.status(201).json({ doctor });
    } catch (error) {
        console.error('Create doctor error:', error);
        res.status(500).json({ error: 'Doktor oluşturulurken hata oluştu' });
    }
};

export const updateDoctor = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const { name, title, userId, workingDays, workStart, workEnd, slotMinutes, isActive } = req.body;

        // Verify doctor's branch belongs to workspace
        const doctor = await prisma.appointmentDoctor.findFirst({
            where: { id },
            include: { branch: true }
        });
        if (!doctor || doctor.branch.workspaceId !== workspaceId) {
            return res.status(404).json({ error: 'Doktor bulunamadı' });
        }

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (title !== undefined) updateData.title = title;
        if (userId !== undefined) updateData.userId = userId;
        if (workingDays !== undefined) updateData.workingDays = JSON.stringify(workingDays);
        if (workStart !== undefined) updateData.workStart = workStart;
        if (workEnd !== undefined) updateData.workEnd = workEnd;
        if (slotMinutes !== undefined) updateData.slotMinutes = slotMinutes;
        if (isActive !== undefined) updateData.isActive = isActive;

        const updated = await prisma.appointmentDoctor.update({
            where: { id },
            data: updateData
        });

        res.json({ doctor: updated });
    } catch (error) {
        console.error('Update doctor error:', error);
        res.status(500).json({ error: 'Doktor güncellenirken hata oluştu' });
    }
};

export const deleteDoctor = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;

        const doctor = await prisma.appointmentDoctor.findFirst({
            where: { id },
            include: { branch: true }
        });
        if (!doctor || doctor.branch.workspaceId !== workspaceId) {
            return res.status(404).json({ error: 'Doktor bulunamadı' });
        }

        await prisma.appointmentDoctor.delete({ where: { id } });
        res.json({ success: true, message: 'Doktor silindi' });
    } catch (error) {
        console.error('Delete doctor error:', error);
        res.status(500).json({ error: 'Doktor silinirken hata oluştu' });
    }
};
