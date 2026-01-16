import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { getAiUsageStats, updateAiLimit, SUBSCRIPTION_PLANS } from '../services/aiUsage.service.js';

const prisma = new PrismaClient();

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

        await prisma.user.delete({
            where: { id: userId }
        });

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
        const { name, ownerId } = req.body;

        const updateData = {};
        if (name) {
            updateData.name = name;
            updateData.slug = `${createSlug(name)}-${Date.now()}`;
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

        await prisma.$transaction(async (prisma) => {
            // 1. Clean up AIBots and their Documents
            const bots = await prisma.aIBot.findMany({
                where: { workspaceId },
                select: { id: true }
            });
            if (bots.length > 0) {
                const botIds = bots.map(b => b.id);
                // Delete documents first
                await prisma.aIBotDocument.deleteMany({
                    where: { botId: { in: botIds } }
                });
                // Then delete bots
                await prisma.aIBot.deleteMany({
                    where: { id: { in: botIds } }
                });
            }

            // 2. Clean up Conversations and Messages
            const conversations = await prisma.conversation.findMany({
                where: { workspaceId },
                select: { id: true }
            });
            if (conversations.length > 0) {
                const conversationIds = conversations.map(c => c.id);
                // Delete messages first
                await prisma.message.deleteMany({
                    where: { conversationId: { in: conversationIds } }
                });
                // Then delete conversations
                await prisma.conversation.deleteMany({
                    where: { id: { in: conversationIds } }
                });
            }

            // 3. Delete Facebook Pages
            await prisma.facebookPage.deleteMany({ where: { workspaceId } });

            // 4. Delete Whatsapp Numbers
            await prisma.whatsappPhoneNumber.deleteMany({ where: { workspaceId } });

            // 5. Delete Workspace Members
            await prisma.workspaceMember.deleteMany({ where: { workspaceId } });

            // 6. Finally delete the workspace
            await prisma.workspace.delete({
                where: { id: workspaceId }
            });
        });

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

        await prisma.workspaceMember.delete({
            where: { id: memberId }
        });

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

