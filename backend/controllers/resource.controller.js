import prisma from '../lib/prisma.js';


// Get all resources for a workspace
export const getResources = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { type, isActive } = req.query;

        // 🏥 Probel / HBYS bağlantısı varsa doktorları senkronize et
        try {
            const hasHealth = await prisma.apiIntegration.findFirst({
                where: { workspaceId, authType: 'OAUTH_PASSWORD', isActive: true }
            });
            if (hasHealth) {
                const { syncProbelDoctorsToResources } = await import('../services/probel_appointment.service.js');
                const personCount = await prisma.calendarResource.count({
                    where: { workspaceId, type: 'PERSON' }
                });
                if (personCount === 0) {
                    // İlk yüklemede senkronize etmeyi bekle
                    await syncProbelDoctorsToResources(workspaceId, true).catch(e => console.warn('Probel auto sync:', e.message));
                } else {
                    // Zaten varsa throttle kontrollü arkada senkronize et
                    syncProbelDoctorsToResources(workspaceId).catch(e => console.warn('Probel bg sync:', e.message));
                }
            } else {
                // Probel yoksa ama AppointmentDoctor kayıtları varsa onları da kontrol et
                const apptDoctors = await prisma.appointmentDoctor.findMany({
                    where: { branch: { workspaceId }, isActive: true },
                    include: { branch: true }
                });
                if (apptDoctors.length > 0) {
                    for (const d of apptDoctors) {
                        const exists = await prisma.calendarResource.findFirst({
                            where: { workspaceId, name: { equals: d.name, mode: 'insensitive' } }
                        });
                        if (!exists) {
                            await prisma.calendarResource.create({
                                data: {
                                    workspaceId,
                                    name: d.name,
                                    description: d.branch?.name || null,
                                    type: 'PERSON',
                                    color: '#3b82f6',
                                    isActive: true
                                }
                            }).catch(() => {});
                        }
                    }
                }
            }
        } catch (syncErr) {
            console.warn('⚠️ [Resources] Doctor auto-sync error (non-critical):', syncErr.message);
        }

        let where = { workspaceId };
        if (type) where.type = type;
        if (isActive !== undefined) where.isActive = isActive === 'true';

        let resources = await prisma.calendarResource.findMany({
            where,
            include: { resourceBranches: { include: { branch: true } }, resourceProducts: { include: { product: true } } },
            orderBy: [{ description: 'asc' }, { name: 'asc' }]
        });

        // 👨‍⚕️ Probel doktor isimlerinde doktor adını her zaman başa al
        try {
            const { formatDoctorNameFirst } = await import('../services/probel_appointment.service.js');
            resources = resources.map(r => {
                if (r.type === 'PERSON') {
                    const formatted = formatDoctorNameFirst(r.name);
                    if (formatted && formatted !== r.name) {
                        prisma.calendarResource.update({
                            where: { id: r.id },
                            data: { name: formatted }
                        }).catch(() => {});
                        return { ...r, name: formatted };
                    }
                }
                return r;
            });

            // Branş içinde doktor isimlerine göre alfabetik sırala
            resources.sort((a, b) => {
                const descA = a.description || '';
                const descB = b.description || '';
                if (descA !== descB) return descA.localeCompare(descB, 'tr');
                return (a.name || '').localeCompare(b.name || '', 'tr');
            });
        } catch (_) {}

        res.json({ resources });
    } catch (error) {
        console.error('Get resources error:', error);
        res.status(500).json({ error: 'Kaynaklar yüklenirken hata oluştu' });
    }
};

// Manuel doktor senkronizasyonu tetikleme
export const syncHealthDoctors = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { syncProbelDoctorsToResources } = await import('../services/probel_appointment.service.js');
        const result = await syncProbelDoctorsToResources(workspaceId, true);
        res.json(result);
    } catch (error) {
        console.error('syncHealthDoctors error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Create resource
export const createResource = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { name, description, type, color, availableStart, availableEnd, availableDays, title, userId, slotMinutes, branchIds } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Kaynak adı gereklidir' });
        }

        const resource = await prisma.calendarResource.create({
            data: {
                workspaceId,
                name,
                title: title || null,
                userId: userId || null,
                slotMinutes: slotMinutes !== undefined ? slotMinutes : 30,
                description: description || null,
                type: type || 'ROOM',
                color: color || '#8b5cf6',
                availableStart: availableStart || null,
                availableEnd: availableEnd || null,
                availableDays: availableDays || null,
                resourceBranches: branchIds && branchIds.length > 0 ? {
                    create: branchIds.map(branchId => ({ branchId }))
                } : undefined
            },
            include: { resourceBranches: { include: { branch: true } }, resourceProducts: { include: { product: true } } }
        });

        res.status(201).json({ resource });
    } catch (error) {
        console.error('Create resource error:', error);
        res.status(500).json({ error: 'Kaynak oluşturulurken hata oluştu' });
    }
};

// Update resource
export const updateResource = async (req, res) => {
    try {
        const { workspaceId, resourceId } = req.params;
        const { name, description, type, color, isActive, availableStart, availableEnd, availableDays, title, userId, slotMinutes, branchIds } = req.body;

        const existing = await prisma.calendarResource.findFirst({
            where: { id: resourceId, workspaceId }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Kaynak bulunamadı' });
        }

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (title !== undefined) updateData.title = title;
        if (userId !== undefined) updateData.userId = userId;
        if (slotMinutes !== undefined) updateData.slotMinutes = slotMinutes;
        if (description !== undefined) updateData.description = description;
        if (type !== undefined) updateData.type = type;
        if (color !== undefined) updateData.color = color;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (availableStart !== undefined) updateData.availableStart = availableStart;
        if (availableEnd !== undefined) updateData.availableEnd = availableEnd;
        if (availableDays !== undefined) updateData.availableDays = availableDays;

        if (branchIds !== undefined) {
            updateData.resourceBranches = {
                deleteMany: {},
                ...(branchIds.length > 0 && { create: branchIds.map(branchId => ({ branchId })) })
            };
        }

        const resource = await prisma.calendarResource.update({
            where: { id: resourceId },
            data: updateData,
            include: { resourceBranches: { include: { branch: true } }, resourceProducts: { include: { product: true } } }
        });

        res.json({ resource });
    } catch (error) {
        console.error('Update resource error:', error);
        res.status(500).json({ error: 'Kaynak güncellenirken hata oluştu' });
    }
};

// Delete resource
export const deleteResource = async (req, res) => {
    try {
        const { workspaceId, resourceId } = req.params;

        const existing = await prisma.calendarResource.findFirst({
            where: { id: resourceId, workspaceId }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Kaynak bulunamadı' });
        }

        // Clear resourceId from appointments that reference this resource
        await prisma.appointment.updateMany({
            where: { resourceId },
            data: { resourceId: null }
        });

        await prisma.calendarResource.delete({ where: { id: resourceId } });

        res.json({ success: true, message: 'Kaynak silindi' });
    } catch (error) {
        console.error('Delete resource error:', error);
        res.status(500).json({ error: 'Kaynak silinirken hata oluştu' });
    }
};

// Add product/service to a resource
export const addResourceProduct = async (req, res) => {
    try {
        const { workspaceId, resourceId } = req.params;
        const { productId, branchId, price, duration } = req.body;

        const existingResource = await prisma.calendarResource.findFirst({
            where: { id: resourceId, workspaceId }
        });

        if (!existingResource) {
            return res.status(404).json({ error: 'Kaynak bulunamadı' });
        }

        const resourceProduct = await prisma.resourceProduct.create({
            data: {
                resourceId,
                productId,
                branchId: branchId || null,
                price: price !== undefined ? price : null,
                duration: duration !== undefined ? duration : null
            },
            include: { product: true }
        });

        res.status(201).json({ resourceProduct });
    } catch (error) {
        console.error('Add resource product error:', error);
        res.status(500).json({ error: 'Ürün/hizmet eklenirken hata oluştu' });
    }
};

// Remove product/service from a resource
export const removeResourceProduct = async (req, res) => {
    try {
        const { workspaceId, resourceId, rpId } = req.params;

        const existingResource = await prisma.calendarResource.findFirst({
            where: { id: resourceId, workspaceId }
        });

        if (!existingResource) {
            return res.status(404).json({ error: 'Kaynak bulunamadı' });
        }

        await prisma.resourceProduct.delete({
            where: { id: rpId, resourceId }
        });

        res.json({ success: true, message: 'Ürün/hizmet kaldırıldı' });
    } catch (error) {
        console.error('Remove resource product error:', error);
        res.status(500).json({ error: 'Ürün/hizmet kaldırılırken hata oluştu' });
    }
};
