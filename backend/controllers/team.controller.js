import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Create a new team
// Create a new team
export const createTeam = async (req, res) => {
    try {
        const { name, description, color } = req.body;
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
            where: { workspaceId },
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
            orderBy: { createdAt: 'desc' }
        });

        res.json({ teams });
    } catch (error) {
        console.error('Get teams error:', error);
        res.status(500).json({ error: 'Failed to fetch teams: ' + error.message });
    }
};

// Add member to team (user or bot)
export const addTeamMember = async (req, res) => {
    try {
        const { workspaceId, teamId } = req.params;
        const { userId, botId, role } = req.body;

        // Verify team belongs to this workspace
        const team = await prisma.team.findFirst({ where: { id: teamId, workspaceId } });
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }

        // Either userId or botId should be provided, not both
        if (!userId && !botId) {
            return res.status(400).json({ error: 'userId or botId is required' });
        }

        if (userId && botId) {
            return res.status(400).json({ error: 'Provide either userId or botId, not both' });
        }

        const memberData = {
            teamId,
            role: role || 'MEMBER'
        };

        if (userId) {
            memberData.userId = userId;
        } else {
            memberData.botId = botId;
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

// Remove member from team (user or bot)
export const removeTeamMember = async (req, res) => {
    try {
        const { workspaceId, teamId, memberId } = req.params;
        const { type } = req.query; // 'user' or 'bot'

        // Verify team belongs to this workspace
        const team = await prisma.team.findFirst({ where: { id: teamId, workspaceId } });
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }

        // Find the member first
        const findWhere = { teamId };
        
        if (type === 'bot') {
            findWhere.botId = memberId;
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
                ...(req.body.hasOwnProperty('assignedBotId') && { assignedBotId: req.body.assignedBotId })
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
