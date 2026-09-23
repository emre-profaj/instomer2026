import prisma from '../lib/prisma.js';


// Create a new team
// Create a new team
export const createTeam = async (req, res) => {
    try {
        const { name, description, color, parentId } = req.body;
        const { workspaceId } = req.params;

        console.log(`[Team] Creating team in workspace ${workspaceId} by user ${req.user?.id}`, req.body);

        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'User authentication failed' });
        }

        const teamData = {
            name,
            description,
            workspaceId,
            assignedBotId: req.body.assignedBotId || null,
            parentId: parentId || null,
            assignmentRule: req.body.assignmentRule || 'POOL',
            distributionMode: req.body.distributionMode || 'POOL',
            distributionMethod: req.body.distributionMethod || 'ROUND_ROBIN',
            triggerOnPhone: req.body.triggerOnPhone || false,
            triggerOnEmail: req.body.triggerOnEmail || false,
            triggerOnAppointment: req.body.triggerOnAppointment || false,
            triggerTimeoutMinutes: req.body.triggerTimeoutMinutes || null,
            maxOpenConversations: req.body.maxOpenConversations ? parseInt(req.body.maxOpenConversations, 10) : null,
            branchIds: req.body.branchIds ? JSON.stringify(req.body.branchIds) : null,
            members: {
                create: {
                    userId: req.user.id,
                    role: 'LEADER'
                }
            }
        };

        if (color) {
            teamData.color = color;
        }

        const team = await prisma.team.create({
            data: teamData,
            include: {
                assignedBot: true,
                members: {
                    include: {
                        user: { select: { id: true, name: true, avatar: true } },
                        bot: { select: { id: true, name: true, isActive: true } }
                    }
                }
            }
        });

        res.status(201).json({ team });
    } catch (error) {
        console.error('Create team error:', error);
        res.status(500).json({ error: 'Failed to create team: ' + error.message });
    }
};

// Get workspace teams
export const getTeams = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const teams = await prisma.team.findMany({
            where: { workspaceId, parentId: null },
            include: {
                _count: { select: { members: true } },
                assignedBot: true,
                members: {
                    include: {
                        user: { select: { id: true, name: true, avatar: true } },
                        bot: { select: { id: true, name: true, isActive: true } }
                    }
                },
                children: {
                    include: {
                        _count: { select: { members: true } },
                        assignedBot: true,
                        members: {
                            include: {
                                user: { select: { id: true, name: true, avatar: true } },
                                bot: { select: { id: true, name: true, isActive: true } }
                            }
                        },
                        children: {
                            include: {
                                _count: { select: { members: true } },
                                assignedBot: true,
                                members: {
                                    include: {
                                        user: { select: { id: true, name: true, avatar: true } },
                                        bot: { select: { id: true, name: true, isActive: true } }
                                    }
                                },
                                children: {
                                    include: {
                                        _count: { select: { members: true } },
                                        assignedBot: true,
                                        members: {
                                            include: {
                                                user: { select: { id: true, name: true, avatar: true } },
                                                bot: { select: { id: true, name: true, isActive: true } }
                                            }
                                        }
                                    },
                                    orderBy: { createdAt: 'asc' }
                                }
                            },
                            orderBy: { createdAt: 'asc' }
                        }
                    },
                    orderBy: { createdAt: 'asc' }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ teams });
    } catch (error) {
        console.error('Get teams error:', error);
        res.status(500).json({ error: 'Failed to fetch teams: ' + error.message });
    }
};

// Add member to team (user, bot, or retellAgent)
export const addTeamMember = async (req, res) => {
    try {
        const { workspaceId, teamId } = req.params;
        const { userId, botId, retellAgentId, role } = req.body;

        // Verify team belongs to this workspace
        const team = await prisma.team.findFirst({ where: { id: teamId, workspaceId } });
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }

        // Count how many of userId, botId, retellAgentId are provided
        const providedCount = [userId, botId, retellAgentId].filter(Boolean).length;
        if (providedCount !== 1) {
            return res.status(400).json({ error: 'Provide exactly one of userId, botId, or retellAgentId' });
        }

        const memberData = {
            teamId,
            role: role || 'MEMBER'
        };

        if (userId) {
            memberData.userId = userId;
        } else if (botId) {
            // Verify bot belongs to this workspace
            const bot = await prisma.aIBot.findFirst({ where: { id: botId, workspaceId } });
            if (!bot) {
                return res.status(404).json({ error: 'Bot not found in this workspace' });
            }
            memberData.botId = botId;
        } else if (retellAgentId) {
            memberData.retellAgentId = retellAgentId;
        }

        const teamMember = await prisma.teamMember.create({
            data: memberData,
            include: {
                user: { select: { id: true, name: true, avatar: true } },
                bot: { select: { id: true, name: true, isActive: true } }
            }
        });

        res.status(201).json({ teamMember });
    } catch (error) {
        console.error('Add team member error:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'This member is already in the team' });
        }
        res.status(500).json({ error: 'Failed to add member' });
    }
};

// Remove member from team (user, bot, or retellAgent)
export const removeTeamMember = async (req, res) => {
    try {
        const { workspaceId, teamId, memberId } = req.params;
        const { type } = req.query; // 'user', 'bot', or 'retellAgent'

        // Verify team belongs to this workspace
        const team = await prisma.team.findFirst({ where: { id: teamId, workspaceId } });
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }

        // Find the member first
        const findWhere = { teamId };

        if (type === 'bot') {
            findWhere.botId = memberId;
        } else if (type === 'retellAgent') {
            findWhere.retellAgentId = memberId;
        } else {
            findWhere.userId = memberId;
        }

        const member = await prisma.teamMember.findFirst({
            where: findWhere
        });

        if (!member) {
            return res.status(404).json({ error: 'Member not found' });
        }

        await prisma.teamMember.delete({
            where: { id: member.id }
        });

        res.json({ message: 'Member removed' });
    } catch (error) {
        console.error('Remove team member error:', error);
        res.status(500).json({ error: 'Failed to remove member: ' + error.message });
    }
};

// Update team
export const updateTeam = async (req, res) => {
    try {
        const { workspaceId, teamId } = req.params;
        const { name, description, color } = req.body;

        // Verify team belongs to this workspace
        const existing = await prisma.team.findFirst({ where: { id: teamId, workspaceId } });
        if (!existing) {
            return res.status(404).json({ error: 'Team not found' });
        }

        const team = await prisma.team.update({
            where: { id: teamId },
            data: {
                ...(name && { name }),
                ...(description !== undefined && { description }),
                ...(color && { color }),
                ...(req.body.hasOwnProperty('assignedBotId') && { assignedBotId: req.body.assignedBotId }),
                ...(req.body.hasOwnProperty('parentId') && { parentId: req.body.parentId || null }),
                ...(req.body.assignmentRule && { assignmentRule: req.body.assignmentRule }),
                ...(req.body.distributionMode && { distributionMode: req.body.distributionMode }),
                ...(req.body.distributionMethod && { distributionMethod: req.body.distributionMethod }),
                ...(req.body.hasOwnProperty('triggerOnPhone') && { triggerOnPhone: req.body.triggerOnPhone }),
                ...(req.body.hasOwnProperty('triggerOnEmail') && { triggerOnEmail: req.body.triggerOnEmail }),
                ...(req.body.hasOwnProperty('triggerOnAppointment') && { triggerOnAppointment: req.body.triggerOnAppointment }),
                ...(req.body.hasOwnProperty('triggerTimeoutMinutes') && { triggerTimeoutMinutes: req.body.triggerTimeoutMinutes }),
                ...(req.body.hasOwnProperty('branchIds') && { branchIds: req.body.branchIds ? JSON.stringify(req.body.branchIds) : null }),
            },
            include: {
                _count: { select: { members: true } },
                assignedBot: true,
                members: {
                    include: {
                        user: { select: { id: true, name: true, avatar: true } },
                        bot: { select: { id: true, name: true, isActive: true } }
                    }
                }
            }
        });

        res.json({ team });
    } catch (error) {
        console.error('Update team error:', error);
        res.status(500).json({ error: 'Failed to update team' });
    }
};

// Get team members (users and bots)
export const getTeamMembers = async (req, res) => {
    try {
        const { workspaceId, teamId } = req.params;

        // Verify team belongs to this workspace
        const team = await prisma.team.findFirst({ where: { id: teamId, workspaceId } });
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }

        const members = await prisma.teamMember.findMany({
            where: { teamId },
            include: {
                user: { select: { id: true, name: true, avatar: true } },
                bot: { select: { id: true, name: true, isActive: true } }
            }
        });

        res.json({ members });
    } catch (error) {
        console.error('Get team members error:', error);
        res.status(500).json({ error: 'Failed to fetch members: ' + error.message });
    }
};

// Delete team
export const deleteTeam = async (req, res) => {
    try {
        const { workspaceId, teamId } = req.params;

        // Verify team belongs to this workspace
        const existing = await prisma.team.findFirst({ where: { id: teamId, workspaceId } });
        if (!existing) {
            return res.status(404).json({ error: 'Team not found' });
        }

        await prisma.team.delete({
            where: { id: teamId }
        });

        res.json({ message: 'Team deleted' });
    } catch (error) {
        console.error('Delete team error:', error);
        res.status(500).json({ error: 'Failed to delete team' });
    }
};

/**
 * TAKIM VE TEMSİLCİ CANLI DURUMU
 *
 * Ekran şimdiye kadar yalnızca "kim hangi takımda" gösteriyordu. Asıl
 * merak edilen — iş kime gidiyor, şu an kim müsait, havuzda ne birikti —
 * hiçbir yerde yoktu. Mesai saatleri veritabanında duruyordu ama arayüze
 * çıkmıyordu; bu yüzden mesai dışı birine elle atama yapılıp hata alınıyordu.
 */
export const getTeamOverview = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { isWorkingAt, unavailabilityReason } = await import('../utils/workingHours.js');
        const simdi = new Date();

        const [uyeler, takimlar, acikSayilari, havuzSayilari] = await Promise.all([
            prisma.workspaceMember.findMany({
                where: { workspaceId },
                select: {
                    id: true, userId: true, role: true, branchIds: true,
                    maxOpenConversations: true,
                    // workingHours User üzerinde tutuluyor, üyelikte değil.
                    user: { select: { id: true, name: true, email: true, avatar: true, isOnline: true, workingHours: true } }
                }
            }),
            prisma.team.findMany({
                where: { workspaceId },
                select: {
                    id: true, name: true, parentId: true,
                    distributionMode: true, distributionMethod: true,
                    members: { select: { userId: true } }
                }
            }),
            // Kişi başına açık sohbet
            prisma.conversation.groupBy({
                by: ['assignedToId'],
                where: { workspaceId, status: 'OPEN', assignedToId: { not: null } },
                _count: { _all: true }
            }),
            // Takım havuzunda bekleyen: takıma atanmış ama kimseye verilmemiş
            prisma.conversation.groupBy({
                by: ['assignedTeamId'],
                where: { workspaceId, status: 'OPEN', assignedToId: null, assignedTeamId: { not: null } },
                _count: { _all: true }
            })
        ]);

        const acik = new Map(acikSayilari.map(r => [r.assignedToId, r._count._all]));
        const havuz = new Map(havuzSayilari.map(r => [r.assignedTeamId, r._count._all]));

        const uyeDurumu = uyeler.map(m => {
            const mesaide = isWorkingAt(m.user?.workingHours, simdi);
            const neden = mesaide ? null : unavailabilityReason(m.user?.workingHours, simdi);
            const yuk = acik.get(m.userId) || 0;
            const limit = m.maxOpenConversations || null;
            return {
                memberId: m.id,
                userId: m.userId,
                name: m.user?.name || '—',
                email: m.user?.email || null,
                avatar: m.user?.avatar || null,
                role: m.role,
                branchIds: m.branchIds,
                isOnline: !!m.user?.isOnline,
                isWorkingNow: mesaide,
                offHoursReason: neden,
                openCount: yuk,
                maxOpen: limit,
                // "Müsait" = mesaide ve kapasitesi dolmamış. Çevrimiçi olmak
                // şart değil: dağıtım yalnızca ONLINE_ONLY modunda buna bakıyor.
                isAvailable: mesaide && (!limit || yuk < limit)
            };
        });

        const uyeHaritasi = new Map(uyeDurumu.map(u => [u.userId, u]));

        const takimDurumu = takimlar.map(t => {
            const durumlar = t.members.map(tm => uyeHaritasi.get(tm.userId)).filter(Boolean);
            return {
                teamId: t.id,
                name: t.name,
                parentId: t.parentId,
                distributionMode: t.distributionMode,
                distributionMethod: t.distributionMethod,
                memberCount: t.members.length,
                availableNow: durumlar.filter(u => u.isAvailable).length,
                offHours: durumlar.filter(u => !u.isWorkingNow).length,
                offline: durumlar.filter(u => u.isWorkingNow && !u.isOnline).length,
                pooledCount: havuz.get(t.id) || 0
            };
        });

        res.json({
            now: simdi.toISOString(),
            members: uyeDurumu,
            teams: takimDurumu,
            totals: {
                memberCount: uyeDurumu.length,
                availableNow: uyeDurumu.filter(u => u.isAvailable).length,
                teamCount: takimDurumu.length,
                pooledTotal: takimDurumu.reduce((t, x) => t + x.pooledCount, 0),
                poolOnlyTeams: takimDurumu.filter(x => (x.distributionMode || 'POOL') === 'POOL').length
            }
        });
    } catch (error) {
        console.error('getTeamOverview error:', error);
        res.status(500).json({ error: 'Takım durumu alınamadı' });
    }
};
