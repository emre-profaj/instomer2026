import prisma from '../lib/prisma.js';

// ─── LOCATIONS (ŞUBELER / KLİNİK MERKEZLERİ) ─────────────────────────────────

const getLocationsConfig = async (workspaceId) => {
    const locRule = await prisma.workspaceRule.findUnique({
        where: { workspaceId_ruleType: { workspaceId, ruleType: 'CLINIC_LOCATIONS' } }
    });

    if (locRule?.config) {
        try {
            const parsed = JSON.parse(locRule.config);
            return {
                locations: parsed.locations || [],
                doctorLocations: parsed.doctorLocations || {},
                doctorTeams: parsed.doctorTeams || {},
                doctorCalendars: parsed.doctorCalendars || {}
            };
        } catch (_) {}
    }

    // Default initial location if none exists
    return {
        locations: [
            {
                id: 'loc-default',
                name: 'Merkez Şube / Poliklinik',
                address: '',
                phone: '',
                isActive: true,
                createdAt: new Date().toISOString()
            }
        ],
        doctorLocations: {},
        doctorTeams: {},
        doctorCalendars: {}
    };
};

const saveLocationsConfig = async (workspaceId, config) => {
    return prisma.workspaceRule.upsert({
        where: { workspaceId_ruleType: { workspaceId, ruleType: 'CLINIC_LOCATIONS' } },
        create: {
            workspaceId,
            ruleType: 'CLINIC_LOCATIONS',
            isActive: true,
            config: JSON.stringify(config)
        },
        update: {
            config: JSON.stringify(config)
        }
    });
};

export const getLocations = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const config = await getLocationsConfig(workspaceId);
        res.json({ locations: config.locations });
    } catch (error) {
        console.error('Get locations error:', error);
        res.status(500).json({ error: 'Şubeler yüklenirken hata oluştu' });
    }
};

export const createLocation = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { name, address, phone } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Şube adı gereklidir' });
        }

        const config = await getLocationsConfig(workspaceId);
        const newLocation = {
            id: 'loc_' + Date.now(),
            name: name.trim(),
            address: address?.trim() || '',
            phone: phone?.trim() || '',
            isActive: true,
            createdAt: new Date().toISOString()
        };

        config.locations.push(newLocation);
        await saveLocationsConfig(workspaceId, config);

        res.status(201).json({ location: newLocation });
    } catch (error) {
        console.error('Create location error:', error);
        res.status(500).json({ error: 'Şube eklenirken hata oluştu' });
    }
};

export const updateLocation = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const { name, address, phone, isActive } = req.body;

        const config = await getLocationsConfig(workspaceId);
        const index = config.locations.findIndex(l => l.id === id);

        if (index === -1) {
            return res.status(404).json({ error: 'Şube bulunamadı' });
        }

        if (name !== undefined) config.locations[index].name = name.trim();
        if (address !== undefined) config.locations[index].address = address.trim();
        if (phone !== undefined) config.locations[index].phone = phone.trim();
        if (isActive !== undefined) config.locations[index].isActive = isActive;

        await saveLocationsConfig(workspaceId, config);
        res.json({ location: config.locations[index] });
    } catch (error) {
        console.error('Update location error:', error);
        res.status(500).json({ error: 'Şube güncellenirken hata oluştu' });
    }
};

export const deleteLocation = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const config = await getLocationsConfig(workspaceId);

        config.locations = config.locations.filter(l => l.id !== id);

        // Remove references in doctorLocations
        if (config.doctorLocations) {
            for (const docId of Object.keys(config.doctorLocations)) {
                if (config.doctorLocations[docId] === id) {
                    delete config.doctorLocations[docId];
                }
            }
        }

        await saveLocationsConfig(workspaceId, config);
        res.json({ success: true, message: 'Şube silindi' });
    } catch (error) {
        console.error('Delete location error:', error);
        res.status(500).json({ error: 'Şube silinirken hata oluştu' });
    }
};

// ─── BRANCH CRUD (TIBBİ BRANŞLAR) ────────────────────────────────────────────

export const getBranches = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const branches = await prisma.appointmentBranch.findMany({
            where: { workspaceId },
            include: { doctors: { orderBy: { name: 'asc' } } },
            orderBy: { order: 'asc' }
        });

        // Attach location information to doctors
        const locConfig = await getLocationsConfig(workspaceId);
        const locMap = {};
        (locConfig.locations || []).forEach(l => { locMap[l.id] = l.name; });

        const enrichedBranches = branches.map(b => ({
            ...b,
            doctors: (b.doctors || []).map(d => {
                const locId = locConfig.doctorLocations?.[d.id] || (locConfig.locations[0]?.id || null);
                return {
                    ...d,
                    locationId: locId,
                    locationName: locMap[locId] || locConfig.locations[0]?.name || 'Merkez Şube'
                };
            })
        }));

        res.json({ branches: enrichedBranches });
    } catch (error) {
        console.error('Get branches error:', error);
        res.status(500).json({ error: 'Branşlar yüklenirken hata oluştu' });
    }
};

export const createBranch = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { name, defaultTeamId, defaultFunnelId } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Branş adı gereklidir' });
        }

        const maxOrder = await prisma.appointmentBranch.aggregate({
            where: { workspaceId },
            _max: { order: true }
        });

        const branch = await prisma.appointmentBranch.create({
            data: {
                workspaceId,
                name,
                order: (maxOrder._max.order || 0) + 1,
                defaultTeamId: defaultTeamId || null,
                defaultFunnelId: defaultFunnelId || null
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
        const { name, isActive, order, defaultTeamId, defaultFunnelId } = req.body;

        const existing = await prisma.appointmentBranch.findFirst({ where: { id, workspaceId } });
        if (!existing) return res.status(404).json({ error: 'Branş bulunamadı' });

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (order !== undefined) updateData.order = order;
        if (defaultTeamId !== undefined) updateData.defaultTeamId = defaultTeamId || null;
        if (defaultFunnelId !== undefined) updateData.defaultFunnelId = defaultFunnelId || null;

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

// ─── DOCTOR CRUD (HEKİM KADROSU) ─────────────────────────────────────────────

export const createDoctor = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { branchId, locationId, name, title, userId, teamId, calendarEmail, workingDays, workStart, workEnd, slotMinutes } = req.body;

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

        // Save locationId, teamId & calendarEmail in CLINIC_LOCATIONS config
        const locConfig = await getLocationsConfig(workspaceId);
        let configChanged = false;

        if (locationId) {
            locConfig.doctorLocations = locConfig.doctorLocations || {};
            locConfig.doctorLocations[doctor.id] = locationId;
            configChanged = true;
        }

        if (teamId !== undefined) {
            locConfig.doctorTeams = locConfig.doctorTeams || {};
            if (teamId) {
                locConfig.doctorTeams[doctor.id] = teamId;
            } else {
                delete locConfig.doctorTeams[doctor.id];
            }
            configChanged = true;
        }

        if (calendarEmail !== undefined) {
            locConfig.doctorCalendars = locConfig.doctorCalendars || {};
            if (calendarEmail) {
                locConfig.doctorCalendars[doctor.id] = calendarEmail;
            } else {
                delete locConfig.doctorCalendars[doctor.id];
            }
            configChanged = true;
        }

        if (configChanged) {
            await saveLocationsConfig(workspaceId, locConfig);
        }

        res.status(201).json({ doctor: { ...doctor, locationId, teamId: teamId || null, calendarEmail: calendarEmail || null } });
    } catch (error) {
        console.error('Create doctor error:', error);
        res.status(500).json({ error: 'Doktor oluşturulurken hata oluştu' });
    }
};

export const updateDoctor = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const { branchId, locationId, name, title, userId, teamId, calendarEmail, workingDays, workStart, workEnd, slotMinutes, isActive } = req.body;

        // Verify doctor's branch belongs to workspace
        const doctor = await prisma.appointmentDoctor.findFirst({
            where: { id },
            include: { branch: true }
        });
        if (!doctor || doctor.branch.workspaceId !== workspaceId) {
            return res.status(404).json({ error: 'Doktor bulunamadı' });
        }

        const updateData = {};
        if (branchId !== undefined) updateData.branchId = branchId;
        if (name !== undefined) updateData.name = name;
        if (title !== undefined) updateData.title = title;
        if (userId !== undefined) updateData.userId = userId || null;
        if (workingDays !== undefined) updateData.workingDays = JSON.stringify(workingDays);
        if (workStart !== undefined) updateData.workStart = workStart;
        if (workEnd !== undefined) updateData.workEnd = workEnd;
        if (slotMinutes !== undefined) updateData.slotMinutes = slotMinutes;
        if (isActive !== undefined) updateData.isActive = isActive;

        const updated = await prisma.appointmentDoctor.update({
            where: { id },
            data: updateData
        });

        // Update location, team & calendar mapping
        const locConfig = await getLocationsConfig(workspaceId);
        let configChanged = false;

        if (locationId !== undefined) {
            locConfig.doctorLocations = locConfig.doctorLocations || {};
            if (locationId) {
                locConfig.doctorLocations[id] = locationId;
            } else {
                delete locConfig.doctorLocations[id];
            }
            configChanged = true;
        }

        if (teamId !== undefined) {
            locConfig.doctorTeams = locConfig.doctorTeams || {};
            if (teamId) {
                locConfig.doctorTeams[id] = teamId;
            } else {
                delete locConfig.doctorTeams[id];
            }
            configChanged = true;
        }

        if (calendarEmail !== undefined) {
            locConfig.doctorCalendars = locConfig.doctorCalendars || {};
            if (calendarEmail) {
                locConfig.doctorCalendars[id] = calendarEmail;
            } else {
                delete locConfig.doctorCalendars[id];
            }
            configChanged = true;
        }

        if (configChanged) {
            await saveLocationsConfig(workspaceId, locConfig);
        }

        res.json({ doctor: { ...updated, locationId, teamId: teamId || null, calendarEmail: calendarEmail || null } });
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

        // Clean from doctorLocations, doctorTeams & doctorCalendars
        const locConfig = await getLocationsConfig(workspaceId);
        let configChanged = false;

        if (locConfig.doctorLocations?.[id]) {
            delete locConfig.doctorLocations[id];
            configChanged = true;
        }

        if (locConfig.doctorTeams?.[id]) {
            delete locConfig.doctorTeams[id];
            configChanged = true;
        }

        if (locConfig.doctorCalendars?.[id]) {
            delete locConfig.doctorCalendars[id];
            configChanged = true;
        }

        if (configChanged) {
            await saveLocationsConfig(workspaceId, locConfig);
        }

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

        // Sector config
        const sectorRule = await prisma.workspaceRule.findUnique({
            where: { workspaceId_ruleType: { workspaceId, ruleType: 'WORKSPACE_SECTOR' } }
        });

        let sectorConfig = { sector: 'HEALTH' };
        if (sectorRule?.config) {
            try {
                sectorConfig = JSON.parse(sectorRule.config);
            } catch (_) {}
        }

        // Get Locations (Şubeler)
        const locConfig = await getLocationsConfig(workspaceId);
        const locMap = {};
        (locConfig.locations || []).forEach(l => { locMap[l.id] = l.name; });

        // Get Branches with Doctors
        const branches = await prisma.appointmentBranch.findMany({
            where: { workspaceId },
            include: { doctors: { orderBy: { name: 'asc' } } },
            orderBy: { order: 'asc' }
        });

        // Get Teams in Workspace
        const teams = await prisma.team.findMany({
            where: { workspaceId },
            include: {
                _count: { select: { members: true } },
                members: {
                    include: {
                        user: { select: { id: true, name: true, email: true, avatar: true } }
                    }
                }
            },
            orderBy: { name: 'asc' }
        });

        const teamMap = {};
        teams.forEach(t => {
            teamMap[t.id] = {
                id: t.id,
                name: t.name,
                color: t.color,
                membersCount: t._count?.members || (t.members || []).length,
                members: (t.members || []).map(m => m.user).filter(Boolean)
            };
        });

        // Enrich doctors with location, team, and calendar
        const enrichedBranches = branches.map(b => ({
            ...b,
            doctors: (b.doctors || []).map(d => {
                const locId = locConfig.doctorLocations?.[d.id] || (locConfig.locations[0]?.id || null);
                const teamId = locConfig.doctorTeams?.[d.id] || null;
                const calEmail = locConfig.doctorCalendars?.[d.id] || null;
                return {
                    ...d,
                    locationId: locId,
                    locationName: locMap[locId] || locConfig.locations[0]?.name || 'Merkez Şube',
                    teamId,
                    team: teamId ? teamMap[teamId] || null : null,
                    calendarEmail: calEmail
                };
            })
        }));

        // Get workspace members / users
        const members = await prisma.workspaceMember.findMany({
            where: { workspaceId },
            include: {
                user: {
                    select: { id: true, name: true, email: true, role: true, avatar: true }
                }
            }
        });
        const users = members.map(m => ({ ...m.user, workspaceRole: m.role }));

        // Get connected Google Calendars in workspace
        const googleCalendars = await prisma.userGoogleCalendar.findMany({
            where: { workspaceId, isActive: true },
            select: {
                id: true,
                userId: true,
                googleEmail: true,
                calendarId: true,
                isActive: true,
                user: { select: { id: true, name: true, email: true } }
            },
            orderBy: { createdAt: 'asc' }
        });

        res.json({
            workspace,
            sector: sectorConfig.sector || 'HEALTH',
            sectorConfig,
            locations: locConfig.locations,
            branches: enrichedBranches,
            users,
            teams: Object.values(teamMap),
            googleCalendars
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

// ─── HEALTH DEMO SEEDER (ŞUBELER + BRANŞLAR + DOKTORLAR) ────────────────────

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

        // 1. Seed Locations (Şubeler)
        const demoLocations = [
            {
                id: 'loc_merkez',
                name: 'Merkez Poliklinik (Kadıköy)',
                address: 'Bağdat Cad. No: 124 Kadıköy / İstanbul',
                phone: '+90 216 444 0 100',
                isActive: true,
                createdAt: new Date().toISOString()
            },
            {
                id: 'loc_avrupa',
                name: 'Avrupa Yakası Şubesi (Nişantaşı)',
                address: 'Valikonağı Cad. No: 58 Şişli / İstanbul',
                phone: '+90 212 444 0 200',
                isActive: true,
                createdAt: new Date().toISOString()
            }
        ];

        const locConfig = await getLocationsConfig(workspaceId);
        locConfig.locations = demoLocations;
        locConfig.doctorLocations = locConfig.doctorLocations || {};

        // 2. Seed Medical Branches (Tıbbi Branşlar)
        const demoData = [
            {
                name: 'Ağız ve Diş Sağlığı',
                doctors: [
                    { name: 'Emre Can', title: 'Dt.', locationId: 'loc_merkez', workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], workStart: '09:30', workEnd: '17:30', slotMinutes: 45 },
                    { name: 'Ayşe Kaya', title: 'Uzm. Dt.', locationId: 'loc_avrupa', workingDays: ['monday', 'wednesday', 'friday', 'saturday'], workStart: '10:00', workEnd: '18:00', slotMinutes: 30 }
                ]
            },
            {
                name: 'Kardiyoloji & Dahiliye',
                doctors: [
                    { name: 'Kemal Demir', title: 'Prof. Dr.', locationId: 'loc_merkez', workingDays: ['monday', 'tuesday', 'wednesday', 'thursday'], workStart: '09:00', workEnd: '16:00', slotMinutes: 30 },
                    { name: 'Zeynep Öztürk', title: 'Uzm. Dr.', locationId: 'loc_merkez', workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], workStart: '09:00', workEnd: '17:00', slotMinutes: 30 }
                ]
            },
            {
                name: 'Dermatoloji & Medikal Estetik',
                doctors: [
                    { name: 'Selin Yıldız', title: 'Uzm. Dr.', locationId: 'loc_avrupa', workingDays: ['tuesday', 'wednesday', 'thursday', 'friday', 'saturday'], workStart: '10:00', workEnd: '18:30', slotMinutes: 40 }
                ]
            },
            {
                name: 'Göz Hastalıkları',
                doctors: [
                    { name: 'Burak Şahin', title: 'Op. Dr.', locationId: 'loc_avrupa', workingDays: ['monday', 'tuesday', 'thursday', 'friday'], workStart: '09:00', workEnd: '17:00', slotMinutes: 20 }
                ]
            }
        ];

        let createdBranchesCount = 0;
        let createdDoctorsCount = 0;

        for (let i = 0; i < demoData.length; i++) {
            const item = demoData[i];
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

            for (const doc of item.doctors) {
                let existingDoc = await prisma.appointmentDoctor.findFirst({
                    where: { branchId: branch.id, name: doc.name }
                });

                if (!existingDoc) {
                    existingDoc = await prisma.appointmentDoctor.create({
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

                if (doc.locationId) {
                    locConfig.doctorLocations[existingDoc.id] = doc.locationId;
                }
            }
        }

        await saveLocationsConfig(workspaceId, locConfig);

        res.json({
            success: true,
            message: `Örnek sağlık verisi başarıyla yüklendi (${demoLocations.length} şube, ${createdBranchesCount} branş, ${createdDoctorsCount} hekim eklendi).`
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

        const locConfig = await getLocationsConfig(workspaceId);
        const locMap = {};
        (locConfig.locations || []).forEach(l => { locMap[l.id] = l.name; });

        // Get Teams in Workspace
        const teams = await prisma.team.findMany({
            where: { workspaceId },
            include: {
                _count: { select: { members: true } },
                members: {
                    include: {
                        user: { select: { id: true, name: true, email: true, avatar: true } }
                    }
                }
            },
            orderBy: { name: 'asc' }
        });

        const teamMap = {};
        teams.forEach(t => {
            teamMap[t.id] = {
                id: t.id,
                name: t.name,
                color: t.color,
                membersCount: t._count?.members || (t.members || []).length,
                members: (t.members || []).map(m => m.user).filter(Boolean)
            };
        });

        const enrichedDoctors = doctors.map(d => {
            const locId = locConfig.doctorLocations?.[d.id] || (locConfig.locations[0]?.id || null);
            const teamId = locConfig.doctorTeams?.[d.id] || null;
            const calEmail = locConfig.doctorCalendars?.[d.id] || null;
            return {
                ...d,
                locationId: locId,
                locationName: locMap[locId] || locConfig.locations[0]?.name || 'Merkez Şube',
                teamId,
                team: teamId ? teamMap[teamId] || null : null,
                calendarEmail: calEmail
            };
        });

        res.json({ doctors: enrichedDoctors });
    } catch (error) {
        console.error('getAllDoctors error:', error);
        res.status(500).json({ error: 'Doktorlar yüklenirken hata oluştu' });
    }
};
