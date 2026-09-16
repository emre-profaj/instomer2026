import prisma from '../lib/prisma.js';
import { seedDefaultTeams } from '../utils/teamSeeder.js';
import bcrypt from 'bcryptjs';
import { getAiUsageStats, updateAiLimit, SUBSCRIPTION_PLANS } from '../services/aiUsage.service.js';
import { logAdminActivity } from '../services/activityLog.service.js';
import axios from 'axios';


// Helper function to create slug from name
const createSlug = (name) => {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
};

// Create a new user (Partner/Customer)
export const createUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Check if user exists
        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user with default workspace
        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: 'OWNER', // Set global role to OWNER for new accounts by default
                workspaceMembers: {
                    create: {
                        role: 'OWNER',
                        workspace: {
                            create: {
                                name: `${name}'s Workspace`,
                                slug: `${createSlug(name)}-${Date.now()}`,
                                description: 'Created by Admin'
                            }
                        }
                    }
                }
            },
            include: {
                workspaceMembers: {
                    include: {
                        workspace: true
                    }
                }
            }
        });

        await logAdminActivity(req, 'CREATE_USER', 'USER', user.id, user.name, { email: user.email });

        const newWorkspace = user.workspaceMembers[0]?.workspace;
        if (newWorkspace) {
            await prisma.aIBot.create({
                data: {
                    workspaceId: newWorkspace.id,
                    name: 'Insta',
                    role: 'AI Asistan',
                    isActive: true,
                    whatsappEnabled: true,
                    instagramEnabled: true,
                    facebookEnabled: true,
                    widgetEnabled: true,
                    botType: 'CHATS',
                    prompt: `Sen Insta, profesyonel bir AI müşteri asistanısın.

Görevlerin:
- Müşteri sorularını yanıtla
- Ürün ve hizmetler hakkında bilgi ver
- Randevu ve görüşme planla
- Şikayetleri kayıt altına al
- Satış fırsatlarını takip et

Kuralların:
- Her zaman nazik ve profesyonel ol
- Bilmediğin konularda bir temsilciye yönlendir
- Müşterinin ihtiyacını anlamaya çalış
- Kısa ve net yanıtlar ver
- Türkçe konuş`
                }
            });
        }

        res.status(201).json({
            message: 'User created successfully',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                workspace: user.workspaceMembers[0]?.workspace
            }
        });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
};

// Get system-wide statistics
export const getSystemStats = async (req, res) => {
    try {
        const [userCount, workspaceCount, messageCount, conversationCount] = await Promise.all([
            prisma.user.count(),
            prisma.workspace.count(),
            prisma.message.count(),
            prisma.conversation.count()
        ]);

        res.json({
            stats: {
                totalUsers: userCount,
                totalWorkspaces: workspaceCount,
                totalMessages: messageCount,
                totalConversations: conversationCount
            }
        });
    } catch (error) {
        console.error('Get admin stats error:', error);
        res.status(500).json({ error: 'Failed to fetch system stats' });
    }
};

// Get all users with their workspace details
export const getAllUsers = async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                avatar: true,
                createdAt: true,
                workspaceMembers: {
                    select: {
                        workspace: {
                            select: {
                                name: true
                            }
                        }
                    }
                },
                _count: {
                    select: {
                        sentMessages: true
                    }
                }
            }
        });

        res.json({ users });
    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
};

// Delete a user system-wide
export const deleteUser = async (req, res) => {
    try {
        const { userId } = req.params;

        // Prevent deleting self
        if (userId === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete yourself' });
        }

        const userToDelete = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });

        await prisma.user.delete({
            where: { id: userId }
        });

        await logAdminActivity(req, 'DELETE_USER', 'USER', userId, userToDelete?.name, { email: userToDelete?.email });

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
};

// Get all workspaces with detailed stats
export const getAllWorkspaces = async (req, res) => {
    try {
        const workspaces = await prisma.workspace.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                slug: true,
                companyId: true,
                createdAt: true,
                members: {
                    where: { role: 'OWNER' },
                    include: {
                        user: {
                            select: {
                                name: true,
                                email: true
                            }
                        }
                    }
                },
                _count: {
                    select: {
                        members: true,
                        conversations: true,
                        facebookPages: true
                    }
                },
                company: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });

        res.json({ workspaces });
    } catch (error) {
        console.error('Get all workspaces error:', error);
        res.status(500).json({ error: 'Failed to fetch workspaces' });
    }
};

// Create a new workspace (Admin)
export const createWorkspace = async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Workspace name is required' });
        }

        // Create workspace without members - add users later
        const workspace = await prisma.workspace.create({
            data: {
                name,
                slug: `${createSlug(name)}-${Date.now()}`,
                description: 'Created by Super Admin'
            }
        });

        await logAdminActivity(req, 'CREATE_WORKSPACE', 'WORKSPACE', workspace.id, workspace.name);

        // Varsayılan takımlar ve kurallar (idempotent)
        await seedDefaultTeams(workspace.id);

        await prisma.aIBot.create({
            data: {
                workspaceId: workspace.id,
                name: 'Insta',
                role: 'AI Asistan',
                isActive: true,
                whatsappEnabled: true,
                instagramEnabled: true,
                facebookEnabled: true,
                widgetEnabled: true,
                botType: 'CHATS',
                prompt: `Sen Insta, profesyonel bir AI müşteri asistanısın.

Görevlerin:
- Müşteri sorularını yanıtla
- Ürün ve hizmetler hakkında bilgi ver
- Randevu ve görüşme planla
- Şikayetleri kayıt altına al
- Satış fırsatlarını takip et

Kuralların:
- Her zaman nazik ve profesyonel ol
- Bilmediğin konularda bir temsilciye yönlendir
- Müşterinin ihtiyacını anlamaya çalış
- Kısa ve net yanıtlar ver
- Türkçe konuş`
            }
        });

        res.status(201).json({ message: 'Workspace created successfully', workspace });
    } catch (error) {
        console.error('Create workspace error:', error);
        res.status(500).json({ error: 'Failed to create workspace' });
    }
};

// Update workspace (Rename, Change Owner)
export const updateWorkspace = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { name, ownerId, industry } = req.body;

        const updateData = {};
        if (name) {
            updateData.name = name;
            updateData.slug = `${createSlug(name)}-${Date.now()}`;
        }
        if (industry !== undefined) {
            updateData.industry = industry;
        }

        // Transaction to handle owner change if requested
        await prisma.$transaction(async (prisma) => {
            // Update basic details
            if (Object.keys(updateData).length > 0) {
                await prisma.workspace.update({
                    where: { id: workspaceId },
                    data: updateData
                });
            }

            // Change Owner Logic
            if (ownerId) {
                // 1. Demote old owner to AGENT (optional, or just remove? typically in systems there is one owner. let's just make the new user OWNER. logic is tricky if old owner remains. Let's keep it simple: Make new user OWNER. Old owner stays as OWNER? or downgrade? Let's check existing members.)

                // For simplicity in this iteration: Add the new user as OWNER. If they are already member, update role.
                const existingMember = await prisma.workspaceMember.findUnique({
                    where: {
                        userId_workspaceId: {
                            userId: ownerId,
                            workspaceId
                        }
                    }
                });

                if (existingMember) {
                    await prisma.workspaceMember.update({
                        where: { id: existingMember.id },
                        data: { role: 'OWNER' }
                    });
                } else {
                    await prisma.workspaceMember.create({
                        data: {
                            workspaceId,
                            userId: ownerId,
                            role: 'OWNER'
                        }
                    });
                }
            }
        });

        await logAdminActivity(req, 'UPDATE_WORKSPACE', 'WORKSPACE', workspaceId, name || 'unknown');

        res.json({ message: 'Workspace updated successfully' });
    } catch (error) {
        console.error('Update workspace error:', error);
        res.status(500).json({ error: 'Failed to update workspace' });
    }
};

// Admin delete workspace (bypasses owner check and handles missing cascades)
export const deleteWorkspaceAdmin = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const BATCH_SIZE = 500;

        await prisma.$transaction(async (tx) => {
            // 1. Clean up AIBots and their Documents
            const bots = await tx.aIBot.findMany({
                where: { workspaceId },
                select: { id: true }
            });
            if (bots.length > 0) {
                const botIds = bots.map(b => b.id);
                await tx.aIBotDocument.deleteMany({
                    where: { botId: { in: botIds } }
                });
                await tx.aIBot.deleteMany({
                    where: { id: { in: botIds } }
                });
            }

            // 2. Clean up Conversations and Messages (batch to avoid timeout)
            const conversations = await tx.conversation.findMany({
                where: { workspaceId },
                select: { id: true }
            });
            if (conversations.length > 0) {
                const conversationIds = conversations.map(c => c.id);
                // Delete messages in batches
                for (let i = 0; i < conversationIds.length; i += BATCH_SIZE) {
                    const batch = conversationIds.slice(i, i + BATCH_SIZE);
                    await tx.message.deleteMany({
                        where: { conversationId: { in: batch } }
                    });
                }
                // Delete conversations in batches
                for (let i = 0; i < conversationIds.length; i += BATCH_SIZE) {
                    const batch = conversationIds.slice(i, i + BATCH_SIZE);
                    await tx.conversation.deleteMany({
                        where: { id: { in: batch } }
                    });
                }
            }

            // 3. Delete Facebook Pages
            await tx.facebookPage.deleteMany({ where: { workspaceId } });

            // 4. Delete Whatsapp Numbers
            await tx.whatsappPhoneNumber.deleteMany({ where: { workspaceId } });

            // 5. Delete Contacts
            await tx.contact.deleteMany({ where: { workspaceId } });

            // 6. Delete Workspace Members
            await tx.workspaceMember.deleteMany({ where: { workspaceId } });

            // 7. Finally delete the workspace
            await tx.workspace.delete({
                where: { id: workspaceId }
            });
        }, {
            maxWait: 10000,  // max wait to acquire connection (10s)
            timeout: 120000  // transaction timeout (120s / 2 minutes)
        });

        await logAdminActivity(req, 'DELETE_WORKSPACE', 'WORKSPACE', workspaceId, 'deleted');

        res.json({ message: 'Workspace deleted successfully by admin' });
    } catch (error) {
        console.error('Admin delete workspace error:', error);
        res.status(500).json({ error: 'Failed to delete workspace: ' + error.message });
    }
};

// Update user details (Name, Email, Password)
export const updateUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const { name, email, password } = req.body;

        // Prevent updating self through this route for security/consistency
        if (userId === req.user.id) {
            return res.status(400).json({ error: 'Bu panelden kendi Bilgilerinizi değiştiremezsiniz.' });
        }

        const data = {};
        if (name) data.name = name;
        if (email) data.email = email;
        if (password) {
            data.password = await bcrypt.hash(password, 10);
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data,
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                avatar: true,
                createdAt: true
            }
        });

        await logAdminActivity(req, 'UPDATE_USER', 'USER', userId, user.name, { email: user.email });

        res.json({ message: 'Kullanıcı bilgileri başarıyla güncellendi', user });
    } catch (error) {
        console.error('Update user error:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Bu e-posta adresi zaten kullanımda' });
        }
        res.status(500).json({ error: 'Kullanıcı güncellenemedi' });
    }
};

export const updateUserRole = async (req, res) => {
    try {
        const { userId } = req.params;
        const { role } = req.body;

        // Validate role
        const validRoles = ['USER', 'SUPER_ADMIN', 'AGENT', 'OWNER'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        // Prevent changing own role
        if (userId === req.user.id) {
            return res.status(400).json({ error: 'Cannot change your own role' });
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: { role },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
                workspaceMembers: {
                    select: {
                        workspace: {
                            select: {
                                name: true
                            }
                        }
                    }
                }
            }
        });

        // Synchronize with WorkspaceMember roles if it's a standard workspace role
        if (['OWNER', 'AGENT'].includes(role)) {
            await prisma.workspaceMember.updateMany({
                where: { userId },
                data: { role }
            });
            console.log(`🔄 Syncing all workspace roles for user ${userId} to ${role}`);
        }

        await logAdminActivity(req, 'UPDATE_USER', 'USER', userId, user.name, { role, email: user.email });

        res.json({ message: 'User role updated successfully', user });
    } catch (error) {
        console.error('Update user role error:', error);
        res.status(500).json({ error: 'Failed to update user role' });
    }
};

// Get workspace detail with all members
export const getWorkspaceDetail = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            include: {
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                avatar: true,
                                role: true
                            }
                        }
                    },
                    orderBy: { createdAt: 'asc' }
                },
                company: {
                    select: {
                        id: true,
                        name: true,
                        maxWorkspaces: true,
                        _count: { select: { workspaces: true } }
                    }
                },
                _count: {
                    select: {
                        conversations: true,
                        contacts: true,
                        facebookPages: true
                    }
                }
            }
        });

        if (!workspace) {
            return res.status(404).json({ error: 'Workspace not found' });
        }

        res.json({
            workspace: {
                ...workspace,
                companyId: workspace.companyId,
                company: workspace.company
            }
        });
    } catch (error) {
        console.error('Get workspace detail error:', error);
        res.status(500).json({ error: 'Failed to fetch workspace detail' });
    }
};

// Add member to workspace
export const addMemberToWorkspace = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { userId, role } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        // Check if user already a member
        const existingMember = await prisma.workspaceMember.findUnique({
            where: {
                userId_workspaceId: {
                    userId,
                    workspaceId
                }
            }
        });

        if (existingMember) {
            return res.status(400).json({ error: 'User is already a member of this workspace' });
        }

        const member = await prisma.workspaceMember.create({
            data: {
                userId,
                workspaceId,
                role: role || 'AGENT'
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            }
        });

        await logAdminActivity(req, 'ADD_MEMBER', 'MEMBER', member.id, member.user?.name, { workspaceId, role: role || 'AGENT' });

        res.status(201).json({ message: 'Member added successfully', member });
    } catch (error) {
        console.error('Add member to workspace error:', error);
        res.status(500).json({ error: 'Failed to add member' });
    }
};

// Remove member from workspace
export const removeMemberFromWorkspace = async (req, res) => {
    try {
        const { workspaceId, memberId } = req.params;

        const memberToRemove = await prisma.workspaceMember.findUnique({
            where: { id: memberId },
            include: { user: { select: { name: true } } }
        });

        await prisma.workspaceMember.delete({
            where: { id: memberId }
        });

        await logAdminActivity(req, 'REMOVE_MEMBER', 'MEMBER', memberId, memberToRemove?.user?.name, { workspaceId });

        res.json({ message: 'Member removed successfully' });
    } catch (error) {
        console.error('Remove member from workspace error:', error);
        res.status(500).json({ error: 'Failed to remove member' });
    }
};

// Update member role in workspace
export const updateWorkspaceMemberRole = async (req, res) => {
    try {
        const { workspaceId, memberId } = req.params;
        const { role } = req.body;

        const validRoles = ['OWNER', 'AGENT'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        const member = await prisma.workspaceMember.update({
            where: { id: memberId },
            data: { role }
        });

        res.json({ message: 'Member role updated successfully', member });
    } catch (error) {
        console.error('Update member role error:', error);
        res.status(500).json({ error: 'Failed to update member role' });
    }
};

// Create user directly for a workspace (handles existing users)
export const createUserForWorkspace = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { name, email, password, role } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Check if user exists
        let user = await prisma.user.findUnique({
            where: { email }
        });

        if (user) {
            // User exists - check if already a member of this workspace
            const existingMember = await prisma.workspaceMember.findUnique({
                where: {
                    userId_workspaceId: {
                        userId: user.id,
                        workspaceId
                    }
                }
            });

            if (existingMember) {
                return res.status(400).json({ error: 'Bu kullanıcı zaten bu işletmeye üye' });
            }

            // Add existing user to workspace
            const member = await prisma.workspaceMember.create({
                data: {
                    userId: user.id,
                    workspaceId,
                    role: role || 'AGENT'
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true
                        }
                    }
                }
            });

            return res.status(201).json({
                message: 'Mevcut kullanıcı işletmeye eklendi',
                user,
                member
            });
        }

        // Create new user
        const hashedPassword = await bcrypt.hash(password, 10);

        user = await prisma.user.create({
            data: {
                name: name || email.split('@')[0],
                email,
                password: hashedPassword,
                role: 'USER'
            }
        });

        // Add to workspace
        const member = await prisma.workspaceMember.create({
            data: {
                userId: user.id,
                workspaceId,
                role: role || 'AGENT'
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            }
        });

        res.status(201).json({
            message: 'Kullanıcı oluşturuldu ve işletmeye eklendi',
            user,
            member
        });
    } catch (error) {
        console.error('Create user for workspace error:', error);
        res.status(500).json({ error: 'Kullanıcı oluşturulamadı' });
    }
};

// ============================================
// AI USAGE LIMIT MANAGEMENT
// ============================================

// Get AI usage stats for a workspace
export const getWorkspaceAiUsage = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const stats = await getAiUsageStats(workspaceId);
        if (!stats) {
            return res.status(404).json({ error: 'Workspace not found' });
        }

        res.json(stats);
    } catch (error) {
        console.error('Get AI usage error:', error);
        res.status(500).json({ error: 'Failed to get AI usage stats' });
    }
};

// ============================================
// MODÜL ERİŞİM KONTROLÜ — Gayrimenkul
// ============================================

// Gayrimenkul modülünü workspace bazında aç/kapat
export const toggleRealEstateModule = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { enabled } = req.body;

        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: 'enabled alanı boolean olmalıdır.' });
        }

        const workspace = await prisma.workspace.update({
            where: { id: workspaceId },
            data: { realEstateEnabled: enabled },
            select: { id: true, name: true, realEstateEnabled: true },
        });

        await logAdminActivity(
            req,
            enabled ? 'ENABLE_REALESTATE' : 'DISABLE_REALESTATE',
            'WORKSPACE',
            workspaceId,
            workspace.name,
            { realEstateEnabled: enabled }
        );

        res.json({
            success: true,
            message: enabled
                ? `"${workspace.name}" için Gayrimenkul Modülü aktif edildi.`
                : `"${workspace.name}" için Gayrimenkul Modülü devre dışı bırakıldı.`,
            workspace,
        });
    } catch (error) {
        console.error('toggleRealEstateModule error:', error);
        res.status(500).json({ error: 'Modül durumu güncellenemedi.' });
    }
};

// Randevu modülünü workspace bazında aç/kapat
export const toggleAppointmentModule = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { enabled } = req.body;

        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: 'enabled alanı boolean olmalıdır.' });
        }

        const workspace = await prisma.workspace.update({
            where: { id: workspaceId },
            data: { appointmentEnabled: enabled },
            select: { id: true, name: true, appointmentEnabled: true },
        });

        await logAdminActivity(
            req,
            enabled ? 'ENABLE_APPOINTMENT' : 'DISABLE_APPOINTMENT',
            'WORKSPACE',
            workspaceId,
            workspace.name,
            { appointmentEnabled: enabled }
        );

        res.json({
            success: true,
            message: enabled
                ? `"${workspace.name}" için Randevu Modülü aktif edildi.`
                : `"${workspace.name}" için Randevu Modülü devre dışı bırakıldı.`,
            workspace,
        });
    } catch (error) {
        console.error('toggleAppointmentModule error:', error);
        res.status(500).json({ error: 'Modül durumu güncellenemedi.' });
    }
};

// Update AI limits for a workspace
export const updateWorkspaceAiLimit = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { dailyLimit, subscriptionType, durationDays } = req.body;

        // Validate subscription type
        if (subscriptionType && !SUBSCRIPTION_PLANS[subscriptionType]) {
            return res.status(400).json({
                error: 'Invalid subscription type',
                validTypes: Object.keys(SUBSCRIPTION_PLANS)
            });
        }

        const workspace = await updateAiLimit(workspaceId, {
            dailyLimit,
            subscriptionType,
            durationDays
        });

        // Log activity
        await logAdminActivity(req, 'UPDATE_AI_LIMIT', 'WORKSPACE', workspaceId, workspace.name, { dailyLimit, subscriptionType, durationDays });

        res.json({
            message: 'AI limits updated successfully',
            workspace,
            plans: SUBSCRIPTION_PLANS
        });
    } catch (error) {
        console.error('Update AI limit error:', error);
        res.status(500).json({ error: 'Failed to update AI limits' });
    }
};

// Get all subscription plans
export const getSubscriptionPlans = async (req, res) => {
    try {
        res.json({ plans: SUBSCRIPTION_PLANS });
    } catch (error) {
        console.error('Get plans error:', error);
        res.status(500).json({ error: 'Failed to get plans' });
    }
};

// Reset AI usage counter for a workspace (manual reset by admin)
export const resetWorkspaceAiCounter = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const workspace = await prisma.workspace.update({
            where: { id: workspaceId },
            data: {
                dailyAiChatCount: 0,
                lastAiCountResetAt: new Date()
            },
            select: {
                id: true,
                name: true,
                dailyAiChatCount: true,
                dailyAiChatLimit: true
            }
        });

        res.json({
            message: 'AI usage counter reset successfully',
            workspace
        });
    } catch (error) {
        console.error('Reset AI counter error:', error);
        res.status(500).json({ error: 'Failed to reset counter' });
    }
};

// ============================================
// SYSTEM EMAIL MANAGEMENT
// ============================================

import { sendSystemEmail, sendToAllWorkspaces, verifySystemEmail } from '../services/systemEmail.service.js';

// Verify system email configuration
export const checkSystemEmail = async (req, res) => {
    try {
        const result = await verifySystemEmail();
        res.json(result);
    } catch (error) {
        console.error('Check system email error:', error);
        res.status(500).json({ error: 'Failed to verify email configuration' });
    }
};

// Send email to specific addresses
export const sendEmail = async (req, res) => {
    try {
        const { to, subject, body } = req.body;

        if (!to || !subject || !body) {
            return res.status(400).json({ error: 'to, subject, and body are required' });
        }

        await sendSystemEmail(to, subject, body);
        res.json({ success: true, message: 'E-posta gönderildi' });
    } catch (error) {
        console.error('Send email error:', error);
        res.status(500).json({ error: 'E-posta gönderilemedi: ' + error.message });
    }
};

// Send email to all workspace owners
export const sendBulkEmail = async (req, res) => {
    try {
        const { subject, body, workspaceIds } = req.body;

        if (!subject || !body) {
            return res.status(400).json({ error: 'subject and body are required' });
        }

        const results = await sendToAllWorkspaces(prisma, subject, body, { workspaceIds });

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        res.json({
            success: true,
            message: `${successCount} e-posta gönderildi${failCount > 0 ? `, ${failCount} başarısız` : ''}`,
            results
        });
    } catch (error) {
        console.error('Send bulk email error:', error);
        res.status(500).json({ error: 'Toplu e-posta gönderilemedi: ' + error.message });
    }
};

// Sync phone numbers from conversations to contacts
export const syncPhoneNumbersFromConversations = async (req, res) => {
    try {
        const { workspaceId, dryRun = true } = req.body;

        console.log(`📱 [SYNC] Starting phone number sync for workspace: ${workspaceId || 'ALL'}, dryRun: ${dryRun}`);

        // Build where clause
        const whereClause = workspaceId ? { workspaceId } : {};

        // Get all contacts without phone numbers
        const contactsWithoutPhone = await prisma.contact.findMany({
            where: {
                ...whereClause,
                OR: [
                    { phone: null },
                    { phone: '' }
                ]
            },
            include: {
                conversations: {
                    select: {
                        id: true,
                        channel: true,
                        whatsappPhoneNumberId: true
                    }
                }
            }
        });

        console.log(`📱 [SYNC] Found ${contactsWithoutPhone.length} contacts without phone numbers`);

        const updates = [];
        const skipped = [];

        for (const contact of contactsWithoutPhone) {
            let extractedPhone = null;
            let source = '';

            // 1. Try to get phone from whatsappId (most reliable)
            if (contact.whatsappId) {
                // WhatsApp ID is usually in format: number@s.whatsapp.net
                const match = contact.whatsappId.match(/^(\d+)@/);
                if (match) {
                    extractedPhone = '+' + match[1];
                    source = 'whatsappId';
                }
            }

            // 2. If no whatsappId, check if contact has WhatsApp conversations
            if (!extractedPhone && contact.conversations?.length > 0) {
                const whatsappConvo = contact.conversations.find(c => c.channel === 'WHATSAPP');
                if (whatsappConvo) {
                    // Get messages from this conversation to extract phone
                    const messages = await prisma.message.findMany({
                        where: { conversationId: whatsappConvo.id },
                        take: 5,
                        orderBy: { createdAt: 'asc' }
                    });

                    // Look for phone number patterns in messages
                    for (const msg of messages) {
                        if (msg.content) {
                            // Turkish phone number patterns
                            const phoneMatch = msg.content.match(/(?:\+90|0)?[\s]?5[0-9]{2}[\s]?[0-9]{3}[\s]?[0-9]{2}[\s]?[0-9]{2}/);
                            if (phoneMatch) {
                                extractedPhone = phoneMatch[0].replace(/\s/g, '');
                                if (!extractedPhone.startsWith('+')) {
                                    extractedPhone = '+90' + extractedPhone.replace(/^0/, '');
                                }
                                source = 'message_content';
                                break;
                            }
                        }
                    }
                }
            }

            // 3. Check phones JSON field
            if (!extractedPhone && contact.phones) {
                try {
                    const phones = JSON.parse(contact.phones);
                    if (Array.isArray(phones) && phones.length > 0) {
                        extractedPhone = phones[0];
                        source = 'phones_json';
                    }
                } catch (e) {
                    // Invalid JSON
                }
            }

            if (extractedPhone) {
                updates.push({
                    contactId: contact.id,
                    contactName: contact.name || 'Unnamed',
                    extractedPhone,
                    source,
                    workspaceId: contact.workspaceId
                });

                if (!dryRun) {
                    await prisma.contact.update({
                        where: { id: contact.id },
                        data: { phone: extractedPhone }
                    });
                }
            } else {
                skipped.push({
                    contactId: contact.id,
                    contactName: contact.name || 'Unnamed',
                    reason: 'No phone number found'
                });
            }
        }

        console.log(`📱 [SYNC] Complete - Updated: ${updates.length}, Skipped: ${skipped.length}`);

        res.json({
            success: true,
            dryRun,
            summary: {
                totalContactsWithoutPhone: contactsWithoutPhone.length,
                updated: updates.length,
                skipped: skipped.length
            },
            updates: updates.slice(0, 50), // Limit response
            skipped: skipped.slice(0, 20)
        });
    } catch (error) {
        console.error('Sync phone numbers error:', error);
        res.status(500).json({ error: 'Senkronizasyon hatası: ' + error.message });
    }
};

// Fix database funnel stage mismatches
export const fixDatabaseFunnelStages = async (req, res) => {
    try {
        const conversations = await prisma.conversation.findMany({
            where: {
                NOT: { funnelStageId: null }
            },
            select: { id: true, funnelStageId: true }
        });

        let updated = 0;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        for (const conv of conversations) {
            if (!uuidRegex.test(conv.funnelStageId)) {
                await prisma.conversation.update({
                    where: { id: conv.id },
                    data: { funnelStageId: null }
                });
                updated++;
            }
        }

        res.json({ success: true, message: `Veritabanında hatalı olan ${updated} adet huni aşaması düzeltildi.` });
    } catch (error) {
        console.error('Fix DB error:', error);
        res.status(500).json({ error: 'Veritabanı onarımı başarısız' });
    }
};

// Check Facebook/Instagram pages health
export const checkFacebookPagesHealth = async (req, res) => {
    try {
        // Get all Facebook pages from all workspaces
        const pages = await prisma.facebookPage.findMany({
            include: {
                workspace: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });

        console.log(`🔍 [Admin] Checking health of ${pages.length} Facebook/Instagram pages...`);

        const results = [];

        for (const page of pages) {
            try {
                // Test the token by making a simple API call
                const response = await axios.get(`https://graph.facebook.com/v21.0/me`, {
                    params: {
                        access_token: page.pageAccessToken
                    },
                    timeout: 5000
                });

                results.push({
                    pageId: page.pageId,
                    pageName: page.pageName,
                    channelType: page.channelType,
                    workspaceId: page.workspace.id,
                    workspaceName: page.workspace.name,
                    status: 'healthy',
                    tokenValid: true
                });
            } catch (error) {
                const errorCode = error.response?.data?.error?.code;
                const errorMessage = error.response?.data?.error?.message || error.message;

                results.push({
                    pageId: page.pageId,
                    pageName: page.pageName,
                    channelType: page.channelType,
                    workspaceId: page.workspace.id,
                    workspaceName: page.workspace.name,
                    status: 'unhealthy',
                    tokenValid: false,
                    errorCode,
                    errorMessage
                });
            }
        }

        const unhealthyPages = results.filter(r => !r.tokenValid);
        const healthyPages = results.filter(r => r.tokenValid);

        console.log(`✅ [Admin] Health check complete: ${healthyPages.length} healthy, ${unhealthyPages.length} unhealthy`);

        res.json({
            total: results.length,
            healthy: healthyPages.length,
            unhealthy: unhealthyPages.length,
            pages: results,
            unhealthyPages: unhealthyPages
        });
    } catch (error) {
        console.error('Check Facebook pages health error:', error);
        res.status(500).json({ error: 'Failed to check pages health' });
    }
};

// Get global settings
export const getGlobalSettings = async (req, res) => {
    try {
        const settings = await prisma.globalSettings.findUnique({
            where: { id: 'singleton' }
        });
        const result = settings || {};
        res.json({
            settings: {
                ...result,
                hasGlobalAiApiKey: !!(result.globalAiApiKey && result.globalAiApiKey.length > 0)
            }
        });
    } catch (error) {
        console.error('Get global settings error:', error);
        res.status(500).json({ error: 'Failed to get global settings' });
    }
};

// Update global settings
export const updateGlobalSettings = async (req, res) => {
    try {
        const { globalAiApiKey } = req.body;

        // Always use 'singleton' as the ID to match getAiApiKey lookups
        const settings = await prisma.globalSettings.upsert({
            where: { id: 'singleton' },
            update: { globalAiApiKey },
            create: { id: 'singleton', globalAiApiKey }
        });

        await logAdminActivity(req, 'UPDATE_SETTINGS', 'SETTINGS', 'global', 'Global Ayarlar');

        res.json({ settings });
    } catch (error) {
        console.error('Update global settings error:', error);
        res.status(500).json({ error: 'Failed to update global settings' });
    }
};

// Get admin activity logs
export const getActivityLogs = async (req, res) => {
    try {
        const { page = 1, limit = 50, action, startDate, endDate } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const where = {};
        if (action) where.action = action;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59.999Z');
        }

        const [logs, total] = await Promise.all([
            prisma.adminActivityLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: parseInt(limit)
            }),
            prisma.adminActivityLog.count({ where })
        ]);

        res.json({
            logs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get activity logs error:', error);
        res.status(500).json({ error: 'İşlem geçmişi yüklenemedi' });
    }
};

// ============================================
// FLOW TEMPLATES MANAGEMENT
// ============================================

export const getFlowTemplates = async (req, res) => {
    try {
        const templates = await prisma.flowTemplate.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json({ templates });
    } catch (error) {
        console.error('getFlowTemplates error:', error);
        res.status(500).json({ error: 'Şablonlar getirilemedi' });
    }
};

export const createFlowTemplate = async (req, res) => {
    try {
        const { name, description, trigger } = req.body;
        const template = await prisma.flowTemplate.create({
            data: {
                name,
                description,
                trigger,
                steps: []
            }
        });
        await logAdminActivity(req, 'CREATE_FLOW_TEMPLATE', 'TEMPLATE', template.id, template.name);
        res.status(201).json({ message: 'Şablon oluşturuldu', template });
    } catch (error) {
        console.error('createFlowTemplate error:', error);
        res.status(500).json({ error: 'Şablon oluşturulamadı' });
    }
};

export const updateFlowTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, trigger, steps } = req.body;
        
        const data = {};
        if (name !== undefined) data.name = name;
        if (description !== undefined) data.description = description;
        if (trigger !== undefined) data.trigger = trigger;
        if (steps !== undefined) data.steps = typeof steps === 'string' ? JSON.parse(steps) : steps;

        const template = await prisma.flowTemplate.update({
            where: { id },
            data
        });
        
        res.json({ message: 'Şablon güncellendi', template });
    } catch (error) {
        console.error('updateFlowTemplate error:', error);
        res.status(500).json({ error: 'Şablon güncellenemedi' });
    }
};

export const deleteFlowTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.flowTemplate.delete({
            where: { id }
        });
        await logAdminActivity(req, 'DELETE_FLOW_TEMPLATE', 'TEMPLATE', id, 'deleted');
        res.json({ message: 'Şablon silindi' });
    } catch (error) {
        console.error('deleteFlowTemplate error:', error);
        res.status(500).json({ error: 'Şablon silinemedi' });
    }
};

export const importFlowTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const { workspaceId } = req.body;

        if (!workspaceId) {
            return res.status(400).json({ error: 'Workspace ID gereklidir' });
        }

        const template = await prisma.flowTemplate.findUnique({
            where: { id }
        });

        if (!template) {
            return res.status(404).json({ error: 'Şablon bulunamadı' });
        }

        const flow = await prisma.flow.create({
            data: {
                workspaceId,
                name: template.name + ' (Kopya)',
                trigger: template.trigger,
                steps: template.steps,
                isActive: false // Aktarmada pasif başlatılır
            }
        });

        await logAdminActivity(req, 'IMPORT_FLOW_TEMPLATE', 'FLOW', flow.id, flow.name, { workspaceId, templateId: id });
        
        res.status(201).json({ message: 'Şablon başarıyla aktarıldı', flow });
    } catch (error) {
        console.error('importFlowTemplate error:', error);
        res.status(500).json({ error: 'Şablon aktarılamadı' });
    }
};
