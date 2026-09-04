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

// ─── FIRM / SECTOR SETTINGS ──────────────────────────────────────────────────

export const getFirmSettings = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                id: true,
                name: true,
                companyName: true,
                companyPhone: true,
                companyEmail: true,
                companyAddress: true,
                companyWebsite: true,
                companyWorkingHours: true,
                realEstateEnabled: true,
                salesEnabled: true
            }
        });

        if (!workspace) {
            return res.status(404).json({ error: 'Workspace bulunamadı' });
        }

        // Get sector from WorkspaceRule
        const sectorRule = await prisma.workspaceRule.findUnique({
            where: { workspaceId_ruleType: { workspaceId, ruleType: 'WORKSPACE_SECTOR' } }
        });

        let sectorConfig = { sector: 'HEALTH' }; // Default example is HEALTH
        if (sectorRule?.config) {
            try {
                sectorConfig = JSON.parse(sectorRule.config);
            } catch (_) {}
        }

        // Get branches with doctors
        const branches = await prisma.appointmentBranch.findMany({
            where: { workspaceId },
            include: { doctors: { orderBy: { name: 'asc' } } },
            orderBy: { order: 'asc' }
        });

        // Get workspace members / users (to assign doctors to actual agent accounts)
        const members = await prisma.workspaceMember.findMany({
            where: { workspaceId },
            include: {
                user: {
                    select: { id: true, name: true, email: true, role: true, avatar: true }
                }
            }
        });
        const users = members.map(m => ({ ...m.user, workspaceRole: m.role }));

        res.json({
            workspace,
            sector: sectorConfig.sector || 'HEALTH',
            sectorConfig,
            branches,
            users
        });
    } catch (error) {
        console.error('getFirmSettings error:', error);
        res.status(500).json({ error: 'Firma ayarları yüklenirken hata oluştu' });
    }
};

export const updateFirmSettings = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { sector, companyName, companyPhone, companyAddress, companyEmail, companyWorkingHours } = req.body;

        // Update Workspace Rule for sector
        if (sector) {
            await prisma.workspaceRule.upsert({
                where: { workspaceId_ruleType: { workspaceId, ruleType: 'WORKSPACE_SECTOR' } },
                create: {
                    workspaceId,
                    ruleType: 'WORKSPACE_SECTOR',
                    isActive: true,
                    config: JSON.stringify({ sector, updatedAt: new Date().toISOString() })
                },
                update: {
                    config: JSON.stringify({ sector, updatedAt: new Date().toISOString() })
                }
            });
        }

        // Update workspace company info
        const wsUpdate = {};
        if (companyName !== undefined) wsUpdate.companyName = companyName;
        if (companyPhone !== undefined) wsUpdate.companyPhone = companyPhone;
        if (companyAddress !== undefined) wsUpdate.companyAddress = companyAddress;
        if (companyEmail !== undefined) wsUpdate.companyEmail = companyEmail;
        if (companyWorkingHours !== undefined) wsUpdate.companyWorkingHours = companyWorkingHours;

        if (Object.keys(wsUpdate).length > 0) {
            await prisma.workspace.update({
                where: { id: workspaceId },
                data: wsUpdate
            });
        }

        res.json({ success: true, message: 'Firma ayarları başarıyla güncellendi' });
    } catch (error) {
        console.error('updateFirmSettings error:', error);
        res.status(500).json({ error: 'Firma ayarları güncellenirken hata oluştu' });
    }
};

// ─── HEALTH DEMO SEEDER ─────────────────────────────────────────────────────

export const seedHealthDemo = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        // Set sector rule to HEALTH
        await prisma.workspaceRule.upsert({
            where: { workspaceId_ruleType: { workspaceId, ruleType: 'WORKSPACE_SECTOR' } },
            create: {
                workspaceId,
                ruleType: 'WORKSPACE_SECTOR',
                isActive: true,
                config: JSON.stringify({ sector: 'HEALTH', updatedAt: new Date().toISOString() })
            },
            update: {
                config: JSON.stringify({ sector: 'HEALTH', updatedAt: new Date().toISOString() })
            }
        });

        // Demo branches & doctors definition
        const demoData = [
            {
                name: 'Ağız ve Diş Sağlığı',
                doctors: [
                    { name: 'Emre Can', title: 'Dt.', workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], workStart: '09:30', workEnd: '17:30', slotMinutes: 45 },
                    { name: 'Ayşe Kaya', title: 'Uzm. Dt.', workingDays: ['monday', 'wednesday', 'friday', 'saturday'], workStart: '10:00', workEnd: '18:00', slotMinutes: 30 }
                ]
            },
            {
                name: 'Kardiyoloji & Dahiliye',
                doctors: [
                    { name: 'Kemal Demir', title: 'Prof. Dr.', workingDays: ['monday', 'tuesday', 'wednesday', 'thursday'], workStart: '09:00', workEnd: '16:00', slotMinutes: 30 },
                    { name: 'Zeynep Öztürk', title: 'Uzm. Dr.', workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], workStart: '09:00', workEnd: '17:00', slotMinutes: 30 }
                ]
            },
            {
                name: 'Dermatoloji & Medikal Estetik',
                doctors: [
                    { name: 'Selin Yıldız', title: 'Uzm. Dr.', workingDays: ['tuesday', 'wednesday', 'thursday', 'friday', 'saturday'], workStart: '10:00', workEnd: '18:30', slotMinutes: 40 }
                ]
            },
            {
                name: 'Göz Hastalıkları',
                doctors: [
                    { name: 'Burak Şahin', title: 'Op. Dr.', workingDays: ['monday', 'tuesday', 'thursday', 'friday'], workStart: '09:00', workEnd: '17:00', slotMinutes: 20 }
                ]
            }
        ];

        let createdBranchesCount = 0;
        let createdDoctorsCount = 0;

        for (let i = 0; i < demoData.length; i++) {
            const item = demoData[i];
            // Check if branch already exists
            let branch = await prisma.appointmentBranch.findFirst({
                where: { workspaceId, name: item.name }
            });

            if (!branch) {
                branch = await prisma.appointmentBranch.create({
                    data: {
                        workspaceId,
                        name: item.name,
                        order: i + 1,
                        isActive: true
                    }
                });
                createdBranchesCount++;
            }

            // Create doctors for this branch
            for (const doc of item.doctors) {
                const existingDoc = await prisma.appointmentDoctor.findFirst({
                    where: { branchId: branch.id, name: doc.name }
                });

                if (!existingDoc) {
                    await prisma.appointmentDoctor.create({
                        data: {
                            branchId: branch.id,
                            name: doc.name,
                            title: doc.title,
                            workingDays: JSON.stringify(doc.workingDays),
                            workStart: doc.workStart,
                            workEnd: doc.workEnd,
                            slotMinutes: doc.slotMinutes,
                            isActive: true
                        }
                    });
                    createdDoctorsCount++;
                }
            }
        }

        // Fetch refreshed branches
        const refreshedBranches = await prisma.appointmentBranch.findMany({
            where: { workspaceId },
            include: { doctors: { orderBy: { name: 'asc' } } },
            orderBy: { order: 'asc' }
        });

        res.json({
            success: true,
            message: `Örnek sağlık verisi başarıyla yüklendi (${createdBranchesCount} branş, ${createdDoctorsCount} doktor oluşturuldu).`,
            branches: refreshedBranches
        });
    } catch (error) {
        console.error('seedHealthDemo error:', error);
        res.status(500).json({ error: 'Örnek sağlık verisi oluşturulurken hata oluştu: ' + error.message });
    }
};

export const getAllDoctors = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const doctors = await prisma.appointmentDoctor.findMany({
            where: { branch: { workspaceId } },
            include: { branch: { select: { id: true, name: true } } },
            orderBy: { name: 'asc' }
        });

        res.json({ doctors });
    } catch (error) {
        console.error('getAllDoctors error:', error);
        res.status(500).json({ error: 'Doktorlar yüklenirken hata oluştu' });
    }
};
