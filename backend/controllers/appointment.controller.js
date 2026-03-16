import { PrismaClient } from '@prisma/client';
import { normalizePhone } from '../utils/phoneNormalizer.js';

const prisma = new PrismaClient();

// Get all appointments for a workspace
export const getAppointments = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { startDate, endDate, assignedToId, status } = req.query;

        let where = { workspaceId };

        // Date range filter
        if (startDate || endDate) {
            where.startTime = {};
            if (startDate) {
                where.startTime.gte = new Date(startDate);
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                where.startTime.lte = end;
            }
        }

        // Filter by assigned agent
        if (assignedToId) {
            where.assignedToId = assignedToId;
        }

        // Filter by status
        if (status) {
            where.status = status;
        }

        const appointments = await prisma.appointment.findMany({
            where,
            orderBy: { startTime: 'asc' }
        });

        // Get agent details for each appointment
        const agentIds = [...new Set(appointments.map(a => a.assignedToId))];
        const agents = await prisma.user.findMany({
            where: { id: { in: agentIds } },
            select: { id: true, name: true, avatar: true }
        });
        const agentMap = Object.fromEntries(agents.map(a => [a.id, a]));

        const enrichedAppointments = appointments.map(appointment => ({
            ...appointment,
            assignedTo: agentMap[appointment.assignedToId] || null
        }));

        res.json({ appointments: enrichedAppointments });
    } catch (error) {
        console.error('Get appointments error:', error);
        res.status(500).json({ error: 'Randevular yüklenirken hata oluştu' });
    }
};

// Get single appointment
export const getAppointment = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;

        const appointment = await prisma.appointment.findFirst({
            where: { id, workspaceId }
        });

        if (!appointment) {
            return res.status(404).json({ error: 'Randevu bulunamadı' });
        }

        // Get agent details
        const agent = await prisma.user.findUnique({
            where: { id: appointment.assignedToId },
            select: { id: true, name: true, avatar: true }
        });

        res.json({ appointment: { ...appointment, assignedTo: agent } });
    } catch (error) {
        console.error('Get appointment error:', error);
        res.status(500).json({ error: 'Randevu yüklenirken hata oluştu' });
    }
};

// Create appointment
export const createAppointment = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const {
            title, description, startTime, endTime, assignedToId,
            contactId, contactName, contactPhone, contactEmail,
            color, notes
        } = req.body;

        if (!title || !startTime || !endTime || !assignedToId) {
            return res.status(400).json({
                error: 'Başlık, başlangıç/bitiş zamanı ve atanan kişi gereklidir'
            });
        }

        const start = new Date(startTime);
        const end = new Date(endTime);

        if (start >= end) {
            return res.status(400).json({
                error: 'Bitiş zamanı başlangıç zamanından sonra olmalıdır'
            });
        }

        // Check for conflicts
        const conflict = await checkAppointmentConflict(assignedToId, start, end);
        if (conflict) {
            // Suggest next available slot
            const suggestion = await suggestNextAvailableSlot(assignedToId, start, end);
            return res.status(409).json({
                error: 'Bu zaman diliminde agent meşgul',
                conflict: true,
                conflictingAppointment: conflict,
                suggestion
            });
        }

        const appointment = await prisma.appointment.create({
            data: {
                workspaceId,
                title,
                description,
                startTime: start,
                endTime: end,
                assignedToId,
                contactId,
                contactName,
                contactPhone: normalizePhone(contactPhone),
                contactEmail,
                color: color || '#3b82f6',
                notes,
                createdById: req.user.id
            }
        });

        // Get agent details
        const agent = await prisma.user.findUnique({
            where: { id: assignedToId },
            select: { id: true, name: true, avatar: true }
        });

        res.status(201).json({
            appointment: { ...appointment, assignedTo: agent }
        });
    } catch (error) {
        console.error('Create appointment error:', error);
        res.status(500).json({ error: 'Randevu oluşturulurken hata oluştu' });
    }
};

// Update appointment
export const updateAppointment = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const {
            title, description, startTime, endTime, assignedToId,
            contactId, contactName, contactPhone, contactEmail,
            status, color, notes
        } = req.body;

        const existing = await prisma.appointment.findFirst({ where: { id, workspaceId } });
        if (!existing) {
            return res.status(404).json({ error: 'Randevu bulunamadı' });
        }

        const updateData = {};
        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (startTime !== undefined) updateData.startTime = new Date(startTime);
        if (endTime !== undefined) updateData.endTime = new Date(endTime);
        if (assignedToId !== undefined) updateData.assignedToId = assignedToId;
        if (contactId !== undefined) updateData.contactId = contactId;
        if (contactName !== undefined) updateData.contactName = contactName;
        if (contactPhone !== undefined) updateData.contactPhone = normalizePhone(contactPhone);
        if (contactEmail !== undefined) updateData.contactEmail = contactEmail;
        if (status !== undefined) updateData.status = status;
        if (color !== undefined) updateData.color = color;
        if (notes !== undefined) updateData.notes = notes;

        // Check for time conflicts if time/agent is changing
        if (startTime || endTime || assignedToId) {
            const newStart = startTime ? new Date(startTime) : existing.startTime;
            const newEnd = endTime ? new Date(endTime) : existing.endTime;
            const newAgent = assignedToId || existing.assignedToId;

            const conflict = await checkAppointmentConflict(newAgent, newStart, newEnd, id);
            if (conflict) {
                const suggestion = await suggestNextAvailableSlot(newAgent, newStart, newEnd);
                return res.status(409).json({
                    error: 'Bu zaman diliminde agent meşgul',
                    conflict: true,
                    conflictingAppointment: conflict,
                    suggestion
                });
            }
        }

        const appointment = await prisma.appointment.update({
            where: { id },
            data: updateData
        });

        const agent = await prisma.user.findUnique({
            where: { id: appointment.assignedToId },
            select: { id: true, name: true, avatar: true }
        });

        res.json({ appointment: { ...appointment, assignedTo: agent } });
    } catch (error) {
        console.error('Update appointment error:', error);
        res.status(500).json({ error: 'Randevu güncellenirken hata oluştu' });
    }
};

// Delete appointment
export const deleteAppointment = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;

        // First verify the appointment belongs to this workspace
        const existing = await prisma.appointment.findFirst({ where: { id, workspaceId } });
        if (!existing) {
            return res.status(404).json({ error: 'Randevu bulunamadı' });
        }

        await prisma.appointment.delete({ where: { id } });

        res.json({ success: true, message: 'Randevu silindi' });
    } catch (error) {
        console.error('Delete appointment error:', error);
        res.status(500).json({ error: 'Randevu silinirken hata oluştu' });
    }
};

// Get agent availability for a date
export const getAgentAvailability = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { date, assignedToId } = req.query;

        if (!date) {
            return res.status(400).json({ error: 'Tarih gereklidir' });
        }

        const targetDate = new Date(date);
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        let where = {
            workspaceId,
            startTime: { gte: startOfDay, lte: endOfDay },
            status: { notIn: ['CANCELLED', 'COMPLETED'] } // Exclude cancelled and completed
        };

        if (assignedToId) {
            where.assignedToId = assignedToId;
        }

        const appointments = await prisma.appointment.findMany({
            where,
            orderBy: { startTime: 'asc' }
        });

        // Calculate busy slots
        const busySlots = appointments.map(a => ({
            start: a.startTime,
            end: a.endTime,
            title: a.title,
            assignedToId: a.assignedToId
        }));

        // Generate available slots (9 AM - 6 PM, 30 min intervals)
        const availableSlots = [];
        const workStart = 9; // 9 AM
        const workEnd = 18; // 6 PM
        const slotDuration = 30; // 30 minutes

        for (let hour = workStart; hour < workEnd; hour++) {
            for (let minute = 0; minute < 60; minute += slotDuration) {
                const slotStart = new Date(targetDate);
                slotStart.setHours(hour, minute, 0, 0);
                const slotEnd = new Date(slotStart);
                slotEnd.setMinutes(slotEnd.getMinutes() + slotDuration);

                // Check if slot is available
                const isAvailable = !busySlots.some(busy => {
                    if (assignedToId && busy.assignedToId !== assignedToId) return false;
                    return (slotStart < busy.end && slotEnd > busy.start);
                });

                if (isAvailable) {
                    availableSlots.push({
                        start: slotStart,
                        end: slotEnd
                    });
                }
            }
        }

        res.json({ busySlots, availableSlots });
    } catch (error) {
        console.error('Get availability error:', error);
        res.status(500).json({ error: 'Uygunluk kontrol edilirken hata oluştu' });
    }
};

// Helper: Check appointment conflict
async function checkAppointmentConflict(assignedToId, startTime, endTime, excludeId = null) {
    const where = {
        assignedToId,
        status: { notIn: ['CANCELLED', 'COMPLETED'] }, // Exclude cancelled and completed
        OR: [
            // New appointment starts during existing
            { startTime: { lte: startTime }, endTime: { gt: startTime } },
            // New appointment ends during existing
            { startTime: { lt: endTime }, endTime: { gte: endTime } },
            // New appointment contains existing
            { startTime: { gte: startTime }, endTime: { lte: endTime } }
        ]
    };

    if (excludeId) {
        where.id = { not: excludeId };
    }

    const conflict = await prisma.appointment.findFirst({ where });
    return conflict;
}

// Helper: Suggest next available slot
async function suggestNextAvailableSlot(assignedToId, preferredStart, preferredEnd) {
    const duration = preferredEnd.getTime() - preferredStart.getTime();
    const slotMinutes = Math.ceil(duration / (1000 * 60));

    // Search for next 7 days
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const searchDate = new Date(preferredStart);
        searchDate.setDate(searchDate.getDate() + dayOffset);

        const startOfDay = new Date(searchDate);
        startOfDay.setHours(9, 0, 0, 0); // Work starts at 9 AM

        const endOfDay = new Date(searchDate);
        endOfDay.setHours(18, 0, 0, 0); // Work ends at 6 PM

        // Get all appointments for this day
        const dayAppointments = await prisma.appointment.findMany({
            where: {
                assignedToId,
                startTime: { gte: startOfDay, lt: endOfDay },
                status: { notIn: ['CANCELLED', 'COMPLETED'] } // Exclude cancelled and completed
            },
            orderBy: { startTime: 'asc' }
        });

        // Find gaps
        let checkTime = dayOffset === 0
            ? new Date(Math.max(startOfDay.getTime(), preferredStart.getTime()))
            : startOfDay;

        // Round up to next 30 min slot
        const minutes = checkTime.getMinutes();
        if (minutes % 30 !== 0) {
            checkTime.setMinutes(Math.ceil(minutes / 30) * 30, 0, 0);
        }

        for (const appointment of dayAppointments) {
            const gapEnd = appointment.startTime;
            const gapDuration = gapEnd.getTime() - checkTime.getTime();

            if (gapDuration >= duration && checkTime.getTime() + duration <= endOfDay.getTime()) {
                return {
                    startTime: checkTime,
                    endTime: new Date(checkTime.getTime() + duration),
                    dayOffset,
                    message: dayOffset === 0
                        ? 'Bugün için öneri'
                        : `${dayOffset} gün sonrası için öneri`
                };
            }

            checkTime = new Date(appointment.endTime);
        }

        // Check time after last appointment
        if (checkTime.getTime() + duration <= endOfDay.getTime()) {
            return {
                startTime: checkTime,
                endTime: new Date(checkTime.getTime() + duration),
                dayOffset,
                message: dayOffset === 0
                    ? 'Bugün için öneri'
                    : `${dayOffset} gün sonrası için öneri`
            };
        }
    }

    return null;
}

// Get workspace agents
export const getWorkspaceAgents = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const members = await prisma.workspaceMember.findMany({
            where: { workspaceId },
            include: {
                user: {
                    select: { id: true, name: true, avatar: true, email: true }
                }
            }
        });

        const agents = members.map(m => ({
            id: m.user.id,
            name: m.user.name,
            avatar: m.user.avatar,
            email: m.user.email,
            role: m.role
        }));

        res.json({ agents });
    } catch (error) {
        console.error('Get agents error:', error);
        res.status(500).json({ error: 'Agent listesi yüklenirken hata oluştu' });
    }
};





