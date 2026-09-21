import { validationResult } from 'express-validator';
import prisma from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getAiUsageStats } from '../services/aiUsage.service.js';
import { logAdminActivity } from '../services/activityLog.service.js';
import { seedDefaultTeams } from '../utils/teamSeeder.js';
import { applyUniversalDefaults } from '../services/onboardingEngine.service.js';
import { disaoService } from '../services/disao.service.js';


// Configure multer for logo upload
const logoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/logos';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'logo-' + uniqueSuffix + path.extname(file.originalname));
    }
});

export const logoUpload = multer({
    storage: logoStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype) || file.mimetype === 'image/svg+xml';
        if (extname && mimetype) {
            cb(null, true);
        } else {
            cb(new Error('Sadece resim dosyaları yüklenebilir (JPEG, PNG, GIF, WebP, SVG)'));
        }
    }
});

export const createWorkspace = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { name, slug, description } = req.body;

        // Check if slug is already taken
        const existingWorkspace = await prisma.workspace.findUnique({
            where: { slug }
        });

        if (existingWorkspace) {
            return res.status(400).json({ error: 'Workspace slug already exists' });
        }

        // Create workspace and add creator as owner
        const workspace = await prisma.workspace.create({
            data: {
                name,
                slug,
                description,
                members: {
                    create: {
                        userId: req.user.id,
                        role: 'OWNER'
                    }
                }
            },
            include: {
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                avatar: true
                            }
                        }
                    }
                }
            }
        });

        // Seed default teams for the new workspace
        await seedDefaultTeams(workspace.id);

        // Create default 'Insta' AI bot
        const { DEFAULT_BOT_PROMPT } = await import('../utils/universalDefaults.js');
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
                prompt: DEFAULT_BOT_PROMPT
            }
        });

        // 🌱 Evrensel taban: akışlar, kategoriler, otomasyon kuralları
        applyUniversalDefaults(workspace.id)
            .catch(err => console.error('⚠️ [Onboarding] Non-fatal error:', err.message));

        res.status(201).json({ workspace });
        
        // Log activity
        await logAdminActivity(req, 'CREATE_WORKSPACE', 'WORKSPACE', workspace.id, workspace.name);
    } catch (error) {
        console.error('Create workspace error:', error);
        res.status(500).json({ error: 'Failed to create workspace' });
    }
};

export const getWorkspaces = async (req, res) => {
    try {
        const isSuperAdmin = req.user.role === 'SUPER_ADMIN';

        const workspaces = await prisma.workspace.findMany({
            where: isSuperAdmin ? {} : {
                members: {
                    some: {
                        userId: req.user.id
                    }
                }
            },
            include: {
                members: isSuperAdmin ? {
                    take: 1, // Just to get something if needed, but Super Admin doesn't rely on Member record
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true
                            }
                        }
                    }
                } : {
                    where: {
                        userId: req.user.id
                    },
                    select: {
                        userId: true,
                        role: true
                    }
                },
                // Company info
                company: {
                    select: {
                        id: true,
                        name: true
                    }
                },
                _count: {
                    select: {
                        members: true,
                        conversations: true,
                        facebookPages: true
                    }
                }
            }
        });

        // Sort workspaces by "activity score" (pages + conversations)
        workspaces.sort((a, b) => {
            const scoreA = (a._count?.facebookPages || 0) * 10 + (a._count?.conversations || 0);
            const scoreB = (b._count?.facebookPages || 0) * 10 + (b._count?.conversations || 0);

            if (scoreB !== scoreA) {
                return scoreB - scoreA; // Descending by score
            }

            // If scores are equal, prefer the OLDEST one
            // This avoids selecting newly created empty workspaces over existing ones
            return new Date(a.createdAt) - new Date(b.createdAt);
        });

        res.json({ workspaces });
    } catch (error) {
        console.error('Get workspaces error:', error);
        res.status(500).json({ error: 'Failed to fetch workspaces' });
    }
};

export const getWorkspace = async (req, res) => {
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
                                avatar: true
                            }
                        }
                    }
                },
                facebookPages: true,
                _count: {
                    select: {
                        conversations: true
                    }
                }
            }
        });

        if (!workspace) {
            return res.status(404).json({ error: 'Workspace not found' });
        }

        res.json({ workspace });
    } catch (error) {
        console.error('Get workspace error:', error);
        res.status(500).json({ error: 'Failed to fetch workspace' });
    }
};

/**
 * Temsilcinin şube listesini doğrula ve JSON string'e çevir.
 * - undefined → alan gönderilmedi, dokunma (undefined döner)
 * - null / [] → tüm şubeler (null döner)
 * - ["id", ...] → yalnızca bu çalışma alanındaki gerçek şube id'leri kalır
 */
const normalizeMemberBranchIds = async (workspaceId, branchIds) => {
    if (branchIds === undefined) return undefined;
    if (!Array.isArray(branchIds) || branchIds.length === 0) return null;
    const requested = [...new Set(branchIds.filter(id => typeof id === 'string' && id.trim()))];
    if (requested.length === 0) return null;
    const valid = await prisma.appointmentBranch.findMany({
        where: { workspaceId, id: { in: requested } },
        select: { id: true }
    });
    const validIds = valid.map(b => b.id);
    return validIds.length > 0 ? JSON.stringify(validIds) : null;
};

export const getWorkspaceMembers = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const [membersResult, workspace] = await Promise.all([
            prisma.workspaceMember.findMany({
                where: { workspaceId },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            avatar: true,
                            isOnline: true,
                            lastSeenAt: true,
                            workingHours: true
                        }
                    }
                }
            }),
            prisma.workspace.findUnique({
                where: { id: workspaceId },
                select: { retellAutoCallTriggers: true }
            })
        ]);

        // Retell agent'ları "sanal bot üye" olarak ekle
        const agentConfigs = workspace?.retellAutoCallTriggers?.agentConfigs || {};
        const botMembers = Object.entries(agentConfigs)
            .filter(([_, cfg]) => cfg.active !== false)
            .map(([agentId, cfg]) => ({
                id: `bot:${agentId}`,
                userId: `bot:${agentId}`,
                role: 'BOT',
                isBot: true,
                user: {
                    id: `bot:${agentId}`,
                    name: cfg.name || `🤖 AI Asistan`,
                    email: null,
                    avatar: null,
                    isOnline: true,
                    isBot: true
                }
            }));

        const members = [...membersResult, ...botMembers];

        res.json({ members });
    } catch (error) {
        console.error('Get workspace members error:', error);
        res.status(500).json({ error: 'Failed to fetch members' });
    }
};

export const addMember = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { workspaceId } = req.params;
        const { email, role, name, password, branchIds } = req.body;

        // Check if requester has permission (must be OWNER or ADMIN)
        if (!['OWNER', 'ADMIN', 'SUPER_ADMIN'].includes(req.workspaceMember.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        const memberBranchIds = await normalizeMemberBranchIds(workspaceId, branchIds);

        // Find user by email
        let user = await prisma.user.findUnique({
            where: { email }
        });

        // If user doesn't exist AND name/password are provided, create a new user
        if (!user) {
            if (!name || !password) {
                return res.status(404).json({ error: 'User not found. Please provide name and password to create an account.' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const { workingHours } = req.body;
            user = await prisma.user.create({
                data: {
                    email,
                    name,
                    password: hashedPassword,
                    role: 'USER',
                    workingHours: workingHours || null
                }
            });
            console.log(`🆕 Created new user: ${email}`);
        }

        // Check if already a member
        const existingMember = await prisma.workspaceMember.findUnique({
            where: {
                userId_workspaceId: {
                    userId: user.id,
                    workspaceId
                }
            }
        });

        if (existingMember) {
            return res.status(400).json({ error: 'User is already a member' });
        }

        // Add member
        const member = await prisma.workspaceMember.create({
            data: {
                userId: user.id,
                workspaceId,
                role,
                branchIds: memberBranchIds ?? null
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        avatar: true
                    }
                }
            }
        });

        res.status(201).json({ member });

        // Log activity
        await logAdminActivity(req, 'ADD_MEMBER', 'MEMBER', member.id, member.user?.name, { workspaceId, role });
    } catch (error) {
        console.error('Add member error:', error);
        res.status(500).json({ error: 'Failed to add member' });
    }
};

export const updateMemberRole = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { workspaceId, userId } = req.params;
        const { role } = req.body;

        // Check if requester has permission (must be OWNER)
        if (!['OWNER', 'SUPER_ADMIN'].includes(req.workspaceMember.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        const member = await prisma.workspaceMember.update({
            where: {
                userId_workspaceId: {
                    userId,
                    workspaceId
                }
            },
            data: { role },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        avatar: true
                    }
                }
            }
        });

        // Sync to global user role
        await prisma.user.update({
            where: { id: userId },
            data: { role }
        });
        console.log(`🔄 Syncing global role for user ${userId} to ${role} from workspace update`);

        res.json({ member });
    } catch (error) {
        console.error('Update member role error:', error);
        res.status(500).json({ error: 'Failed to update member role' });
    }
};

export const removeMember = async (req, res) => {
    try {
        const { workspaceId, userId } = req.params;

        // Check if requester has permission (must be OWNER)
        if (!['OWNER', 'SUPER_ADMIN'].includes(req.workspaceMember.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        // Cannot remove yourself
        if (userId === req.user.id) {
            return res.status(400).json({ error: 'Cannot remove yourself' });
        }

        // Fetch member name before deletion
        const memberToLog = await prisma.workspaceMember.findUnique({
            where: { userId_workspaceId: { userId, workspaceId } },
            include: { user: { select: { name: true } } }
        });

        await prisma.workspaceMember.delete({
            where: {
                userId_workspaceId: {
                    userId,
                    workspaceId
                }
            }
        });

        const memberName = memberToLog?.user?.name || 'unknown';
        await logAdminActivity(req, 'REMOVE_MEMBER', 'MEMBER', userId, memberName, { workspaceId });

        res.json({ message: 'Member removed successfully' });
    } catch (error) {
        console.error('Remove member error:', error);
        res.status(500).json({ error: 'Failed to remove member' });
    }
};

// Change member password (Owner/Admin only)
export const changeMemberPassword = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { workspaceId, userId } = req.params;
        const { newPassword } = req.body;

        // Check if requester has permission (must be OWNER or SUPER_ADMIN)
        if (!['OWNER', 'SUPER_ADMIN'].includes(req.workspaceMember.role)) {
            return res.status(403).json({ error: 'Yetkiniz yok' });
        }

        // Verify the target user is a member of this workspace
        const member = await prisma.workspaceMember.findUnique({
            where: {
                userId_workspaceId: {
                    userId,
                    workspaceId
                }
            },
            include: {
                user: {
                    select: { id: true, name: true, email: true }
                }
            }
        });

        if (!member) {
            return res.status(404).json({ error: 'Kullanıcı bu workspace\'te bulunamadı' });
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update the user's password
        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword }
        });

        console.log(`🔐 Password changed for user ${member.user.email} by ${req.user.email}`);

        res.json({
            success: true,
            message: `${member.user.name} kullanıcısının şifresi başarıyla değiştirildi`
        });
    } catch (error) {
        console.error('Change member password error:', error);
        res.status(500).json({ error: 'Şifre değiştirilemedi' });
    }
};

// Update member info (name, email) — Owner/Admin only
export const updateMemberInfo = async (req, res) => {
    try {
        const { workspaceId, userId } = req.params;
        const { name, email, workingHours, branchIds } = req.body;

        if (!['OWNER', 'SUPER_ADMIN'].includes(req.workspaceMember.role)) {
            return res.status(403).json({ error: 'Yetkiniz yok' });
        }

        // Verify member belongs to this workspace
        const member = await prisma.workspaceMember.findUnique({
            where: { userId_workspaceId: { userId, workspaceId } }
        });
        if (!member) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        // If email is changing, check uniqueness
        if (email) {
            const existing = await prisma.user.findFirst({
                where: { email, NOT: { id: userId } }
            });
            if (existing) {
                return res.status(400).json({ error: 'Bu e-posta başka bir hesapta kullanılıyor' });
            }
        }

        const updateData = {};
        if (name) updateData.name = name;
        if (email) updateData.email = email;
        if (workingHours !== undefined) updateData.workingHours = workingHours;

        const updatedUser = Object.keys(updateData).length > 0
            ? await prisma.user.update({
                where: { id: userId },
                data: updateData,
                select: { id: true, name: true, email: true, avatar: true, isOnline: true, workingHours: true }
            })
            : await prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, name: true, email: true, avatar: true, isOnline: true, workingHours: true }
            });

        // Şube yetkisi üyeliğe yazılır (kullanıcı birden fazla çalışma alanında olabilir)
        let updatedMember = member;
        const memberBranchIds = await normalizeMemberBranchIds(workspaceId, branchIds);
        if (memberBranchIds !== undefined) {
            updatedMember = await prisma.workspaceMember.update({
                where: { id: member.id },
                data: { branchIds: memberBranchIds }
            });
        }

        console.log(`✏️ Member info updated for ${updatedUser.email} by ${req.user.email}`);
        res.json({ user: updatedUser, member: { id: updatedMember.id, role: updatedMember.role, branchIds: updatedMember.branchIds } });
    } catch (error) {
        console.error('Update member info error:', error);
        res.status(500).json({ error: 'Kullanıcı güncellenemedi' });
    }
};

export const deleteWorkspace = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        // Fetch workspace name before deletion for logging
        const workspaceToLog = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { name: true }
        });

        // Check if requester has permission (must be OWNER)
        if (req.workspaceMember.role !== 'OWNER') {
            return res.status(403).json({ error: 'Only workspace owner can delete the workspace' });
        }

        await prisma.workspace.delete({
            where: { id: workspaceId }
        });

        const workspaceName = workspaceToLog?.name || 'deleted';
        await logAdminActivity(req, 'DELETE_WORKSPACE', 'WORKSPACE', workspaceId, workspaceName);

        res.json({ message: 'Workspace deleted successfully' });
    } catch (error) {
        console.error('Delete workspace error:', error);
        res.status(500).json({ error: 'Failed to delete workspace' });
    }
};

// Get company info
export const getCompanyInfo = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                companyName: true,
                companyDescription: true,
                companyAddress: true,
                companyPhone: true,
                companyEmail: true,
                companyWebsite: true,
                companyWorkingHours: true,
                companyLogo: true,
                invoiceTaxOffice: true,
                invoiceTaxNumber: true,
                invoiceIban: true,
                industry: true,
                founder: true,
                businessAreas: true,
                serviceRegions: true,
                googleMapsUrl: true,
                companyWeeklySchedule: true,
                companyScheduleEnabled: true
            }
        });

        if (!workspace) {
            return res.status(404).json({ error: 'Workspace not found' });
        }

        res.json({ companyInfo: workspace });
    } catch (error) {
        console.error('Get company info error:', error);
        res.status(500).json({ error: 'Failed to fetch company info' });
    }
};

// Update company info
export const updateCompanyInfo = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const {
            companyName,
            companyDescription,
            companyAddress,
            companyPhone,
            companyEmail,
            companyWebsite,
            companyWorkingHours,
            invoiceTaxOffice,
            invoiceTaxNumber,
            invoiceIban,
            industry,
            // Yeni alanlar
            founder,
            businessAreas,
            serviceRegions,
            googleMapsUrl,
            companyWeeklySchedule,
            companyScheduleEnabled
        } = req.body;

        const updateData = {};
        // Mevcut alanlar
        if (companyName !== undefined) updateData.companyName = companyName;
        if (companyDescription !== undefined) updateData.companyDescription = companyDescription;
        if (companyAddress !== undefined) updateData.companyAddress = companyAddress;
        if (companyPhone !== undefined) updateData.companyPhone = companyPhone;
        if (companyEmail !== undefined) updateData.companyEmail = companyEmail;
        if (companyWebsite !== undefined) updateData.companyWebsite = companyWebsite;
        if (companyWorkingHours !== undefined) updateData.companyWorkingHours = companyWorkingHours;
        if (invoiceTaxOffice !== undefined) updateData.invoiceTaxOffice = invoiceTaxOffice;
        if (invoiceTaxNumber !== undefined) updateData.invoiceTaxNumber = invoiceTaxNumber;
        if (invoiceIban !== undefined) updateData.invoiceIban = invoiceIban;
        if (industry !== undefined) updateData.industry = industry;
        // Yeni alanlar
        if (founder !== undefined) updateData.founder = founder;
        if (businessAreas !== undefined) updateData.businessAreas = typeof businessAreas === 'string' ? businessAreas : JSON.stringify(businessAreas);
        if (serviceRegions !== undefined) updateData.serviceRegions = typeof serviceRegions === 'string' ? serviceRegions : JSON.stringify(serviceRegions);
        if (googleMapsUrl !== undefined) updateData.googleMapsUrl = googleMapsUrl;
        if (companyWeeklySchedule !== undefined) updateData.companyWeeklySchedule = companyWeeklySchedule;
        if (companyScheduleEnabled !== undefined) updateData.companyScheduleEnabled = !!companyScheduleEnabled;

        const workspace = await prisma.workspace.update({
            where: { id: workspaceId },
            data: updateData,
            select: {
                companyName: true,
                companyDescription: true,
                companyAddress: true,
                companyPhone: true,
                companyEmail: true,
                companyWebsite: true,
                companyWorkingHours: true,
                companyLogo: true,
                invoiceTaxOffice: true,
                invoiceTaxNumber: true,
                invoiceIban: true,
                industry: true,
                founder: true,
                businessAreas: true,
                serviceRegions: true,
                googleMapsUrl: true,
                companyWeeklySchedule: true,
                companyScheduleEnabled: true
            }
        });

        res.json({ companyInfo: workspace });
    } catch (error) {
        console.error('Update company info error:', error);
        res.status(500).json({ error: 'Failed to update company info' });
    }
};

// Generic PATCH for workspace settings (agentDataVisibility, timezone, leadScoringTemplate, etc.)
export const patchWorkspaceSettings = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const allowedFields = [
            'agentDataVisibility', 'leadScoringTemplate', 'timezone', 'channelPricing',
            'defaultLanguage', 'industry', 'defaultFunnelId'
        ];
        const updateData = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
        }
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: 'Güncellenecek alan bulunamadı' });
        }
        const workspace = await prisma.workspace.update({
            where: { id: workspaceId },
            data: updateData
        });
        res.json({ success: true, workspace });
    } catch (error) {
        console.error('Patch workspace settings error:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
};

// Upload company logo
export const uploadCompanyLogo = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        if (!req.file) {
            return res.status(400).json({ error: 'Logo dosyası gerekli' });
        }

        // Get current workspace to delete old logo if exists
        const currentWorkspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { companyLogo: true }
        });

        // Delete old logo file if exists
        if (currentWorkspace?.companyLogo) {
            const oldLogoPath = currentWorkspace.companyLogo.replace(/^\//, '');
            if (fs.existsSync(oldLogoPath)) {
                fs.unlinkSync(oldLogoPath);
            }
        }

        const logoPath = '/' + req.file.path.replace(/\\/g, '/');

        const workspace = await prisma.workspace.update({
            where: { id: workspaceId },
            data: { companyLogo: logoPath },
            select: {
                companyName: true,
                companyDescription: true,
                companyAddress: true,
                companyPhone: true,
                companyEmail: true,
                companyWebsite: true,
                companyWorkingHours: true,
                companyLogo: true
            }
        });

        res.json({ companyInfo: workspace });
    } catch (error) {
        console.error('Upload company logo error:', error);
        res.status(500).json({ error: 'Failed to upload logo' });
    }
};

// Delete company logo
export const deleteCompanyLogo = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const currentWorkspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { companyLogo: true }
        });

        // Delete logo file if exists
        if (currentWorkspace?.companyLogo) {
            const logoPath = currentWorkspace.companyLogo.replace(/^\//, '');
            if (fs.existsSync(logoPath)) {
                fs.unlinkSync(logoPath);
            }
        }

        const workspace = await prisma.workspace.update({
            where: { id: workspaceId },
            data: { companyLogo: null },
            select: {
                companyName: true,
                companyDescription: true,
                companyAddress: true,
                companyPhone: true,
                companyEmail: true,
                companyWebsite: true,
                companyWorkingHours: true,
                companyLogo: true
            }
        });

        res.json({ companyInfo: workspace });
    } catch (error) {
        console.error('Delete company logo error:', error);
        res.status(500).json({ error: 'Failed to delete logo' });
    }
};

// ==================== ALT WORKSPACE FONKSİYONLARI KALDIRILDI ====================
// Not: Alt workspace sistemi kaldırıldı. Artık Company (Firma) sistemi kullanılıyor.
// Firma yönetimi için company.controller.js dosyasına bakınız.

// Eski fonksiyonlar geriye uyumluluk için boş response döner
export const getSubWorkspaces = async (req, res) => {
    res.json({
        subWorkspaces: [],
        parentWorkspace: null,
        message: 'Alt workspace sistemi kaldırıldı. Firma sistemi kullanılmaktadır.'
    });
};

export const createSubWorkspace = async (req, res) => {
    res.status(410).json({
        error: 'Alt workspace sistemi kaldırıldı. Firma altında workspace oluşturmak için /api/companies/:companyId/workspaces endpoint\'ini kullanın.'
    });
};

export const updateSubWorkspace = async (req, res) => {
    res.status(410).json({ error: 'Alt workspace sistemi kaldırıldı.' });
};

export const deleteSubWorkspace = async (req, res) => {
    res.status(410).json({ error: 'Alt workspace sistemi kaldırıldı.' });
};

export const checkIsParentWorkspace = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                id: true,
                name: true,
                companyId: true,
                company: {
                    select: {
                        id: true,
                        name: true,
                        maxWorkspaces: true,
                        _count: {
                            select: { workspaces: true }
                        }
                    }
                }
            }
        });

        if (!workspace) {
            return res.status(404).json({ error: 'Workspace not found' });
        }

        res.json({
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            companyId: workspace.companyId,
            company: workspace.company,
            // Geriye uyumluluk için
            isParentWorkspace: true,
            parentId: null,
            parent: null,
            subWorkspaceCount: 0,
            maxSubWorkspaces: 0,
            canCreateMore: false,
            remainingSlots: 0
        });
    } catch (error) {
        console.error('Check workspace status error:', error);
        res.status(500).json({ error: 'Failed to check workspace status' });
    }
};

// Get AI usage stats for current workspace
export const getWorkspaceAiUsageStats = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const stats = await getAiUsageStats(workspaceId);
        if (!stats) {
            return res.status(404).json({ error: 'Workspace not found' });
        }

        res.json(stats);
    } catch (error) {
        console.error('Get workspace AI usage error:', error);
        res.status(500).json({ error: 'Failed to get AI usage stats' });
    }
};

// Workspace kendi rezervasyon modülünü aç/kapat
export const toggleWorkspaceAppointmentModule = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { enabled } = req.body;

        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: 'enabled alanı boolean olmalıdır.' });
        }

        const workspace = await prisma.workspace.update({
            where: { id: workspaceId },
            data: { appointmentEnabled: enabled },
            select: { id: true, name: true, appointmentEnabled: true, appointmentSchedule: true }
        });

        res.json({
            success: true,
            message: enabled
                ? `"${workspace.name}" için Rezervasyon Modülü aktif edildi.`
                : `"${workspace.name}" için Rezervasyon Modülü devre dışı bırakıldı.`,
            workspace
        });
    } catch (error) {
        console.error('toggleWorkspaceAppointmentModule error:', error);
        res.status(500).json({ error: 'Modül durumu güncellenemedi.' });
    }
};

// Rezervasyon çalışma günleri/saatleri güncelle
export const updateAppointmentSchedule = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { schedule } = req.body; // [{ day: 0-6, enabled: bool, start: "09:00", end: "18:00" }]

        if (!Array.isArray(schedule)) {
            return res.status(400).json({ error: 'schedule bir dizi olmalıdır.' });
        }

        const workspace = await prisma.workspace.update({
            where: { id: workspaceId },
            data: { appointmentSchedule: schedule },
             select: { id: true, name: true, appointmentSchedule: true }
        });

        res.json({ success: true, workspace });
    } catch (error) {
        console.error('updateAppointmentSchedule error:', error);
        res.status(500).json({ error: 'Çalışma takvimi güncellenemedi.' });
    }
};

// Gayrimenkul modülü aç/kapat (workspace tarafından)
export const toggleRealEstateModuleWS = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { enabled } = req.body;
        if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled boolean olmalıdır.' });

        const workspace = await prisma.workspace.update({
            where: { id: workspaceId },
            data: { realEstateEnabled: enabled },
            select: { id: true, name: true, realEstateEnabled: true }
        });

        res.json({ success: true, workspace });
    } catch (error) {
        console.error('toggleRealEstateModuleWS error:', error);
        res.status(500).json({ error: 'Gayrimenkul modülü güncellenemedi.' });
    }
};

// Satış modülü aç/kapat (workspace tarafından)
export const toggleSalesModuleWS = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { enabled } = req.body;
        if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled boolean olmalıdır.' });

        const workspace = await prisma.workspace.update({
            where: { id: workspaceId },
            data: { salesEnabled: enabled },
            select: { id: true, name: true, salesEnabled: true }
        });

        res.json({ success: true, workspace });
    } catch (error) {
        console.error('toggleSalesModuleWS error:', error);
        res.status(500).json({ error: 'Satış modülü güncellenemedi.' });
    }
};

/**
 * Sıralı katalog akışı ayarları + yetenek durumu.
 * UI, akışın neden açık/kapalı olduğunu buradan gösterir.
 */
export const getCatalogFlowSettings = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { getCatalogCapability } = await import('../services/catalogFlow.service.js');
        const capability = await getCatalogCapability(workspaceId);
        res.json({ success: true, capability });
    } catch (error) {
        console.error('getCatalogFlowSettings error:', error);
        res.status(500).json({ error: 'Katalog akışı ayarları alınamadı.' });
    }
};

export const updateCatalogFlowSettings = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { catalogFlowEnabled, catalogPriceDisclosure } = req.body;

        const data = {};
        if (catalogFlowEnabled !== undefined) {
            if (catalogFlowEnabled !== null && typeof catalogFlowEnabled !== 'boolean') {
                return res.status(400).json({ error: 'catalogFlowEnabled true, false veya null olmalıdır.' });
            }
            data.catalogFlowEnabled = catalogFlowEnabled;
        }
        if (catalogPriceDisclosure !== undefined) {
            if (typeof catalogPriceDisclosure !== 'boolean') {
                return res.status(400).json({ error: 'catalogPriceDisclosure boolean olmalıdır.' });
            }
            data.catalogPriceDisclosure = catalogPriceDisclosure;
        }
        if (Object.keys(data).length === 0) {
            return res.status(400).json({ error: 'Güncellenecek alan bulunamadı.' });
        }

        await prisma.workspace.update({ where: { id: workspaceId }, data });

        const { getCatalogCapability } = await import('../services/catalogFlow.service.js');
        const capability = await getCatalogCapability(workspaceId);
        res.json({ success: true, capability });
    } catch (error) {
        console.error('updateCatalogFlowSettings error:', error);
        res.status(500).json({ error: 'Katalog akışı ayarları güncellenemedi.' });
    }
};

export const updateDisaoCrmSettings = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { enabled, settings } = req.body;

        const workspace = await prisma.workspace.update({
            where: { id: workspaceId },
            data: {
                disaoCrmEnabled: Boolean(enabled),
                disaoCrmSettings: settings ? JSON.stringify(settings) : null
            },
            select: { id: true, name: true, disaoCrmEnabled: true, disaoCrmSettings: true }
        });

        res.json({ success: true, workspace });
    } catch (error) {
        console.error('updateDisaoCrmSettings error:', error);
        res.status(500).json({ error: 'Disao CRM ayarları güncellenemedi.', details: error.message || String(error) });
    }
};

export const testDisaoCrmConnection = async (req, res) => {
    try {
        const { settings } = req.body;
        const { default: disaoCrmService } = await import('../services/disaoCrm.service.js');
        const loginEmail = settings?.username || settings?.email;
        
        if (!loginEmail || !settings?.password) {
             return res.json({ success: false, error: 'Eksik kullanıcı adı veya şifre' });
        }
        
        const loginResult = await disaoCrmService.login(loginEmail, settings.password);
        
        if (loginResult && loginResult.accessToken) {
            res.json({ success: true, message: 'Bağlantı başarılı!' });
        } else {
            res.json({ success: false, error: 'Bilinmeyen hata (Token alınamadı)' });
        }
    } catch (error) {
        console.error('testDisaoCrmConnection error:', error);
        res.status(500).json({ error: 'Bağlantı test edilemedi.', details: error.message });
    }
};

// ─── Admin: Mevcut workspace'lere evrensel taban uygula (migration) ───
export const seedAllWorkspaces = async (req, res) => {
    try {
        const { seedExistingWorkspaces } = await import('../services/onboardingEngine.service.js');
        const result = await seedExistingWorkspaces();
        res.json({ message: 'Migration tamamlandı', ...result });
    } catch (error) {
        console.error('seedAllWorkspaces error:', error);
        res.status(500).json({ error: 'Migration hatası', details: error.message });
    }
};

// ─── Admin: Tek workspace'e evrensel taban uygula ─────────────────
export const seedSingleWorkspace = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const result = await applyUniversalDefaults(workspaceId);
        res.json({ message: 'Seed tamamlandı', ...result });
    } catch (error) {
        console.error('seedSingleWorkspace error:', error);
        res.status(500).json({ error: 'Seed hatası', details: error.message });
    }
};

// ─── Kanal Fiyatlandırma ────────────────────────────────────
const DEFAULT_CHANNEL_PRICING = {
    WHATSAPP: { baseCost: 0.0415, multiplier: 1, label: 'WhatsApp' },
    SMS:      { baseCost: 0.01,   multiplier: 1, label: 'SMS' },
    EMAIL:    { baseCost: 0.003,  multiplier: 1, label: 'E-posta' },
    AI_CALL:  { baseCost: 0.25,   multiplier: 1, label: 'AI Sesli Arama' },
};

export const getChannelPricing = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { channelPricing: true }
        });
        const pricing = workspace?.channelPricing || DEFAULT_CHANNEL_PRICING;
        // Merge defaults for any missing channels
        const merged = { ...DEFAULT_CHANNEL_PRICING };
        Object.keys(pricing).forEach(ch => {
            merged[ch] = { ...(merged[ch] || {}), ...pricing[ch] };
        });
        res.json({ pricing: merged });
    } catch (error) {
        res.status(500).json({ error: 'Fiyatlandırma alınamadı', details: error.message });
    }
};

export const updateChannelPricing = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { pricing } = req.body;

        if (!pricing || typeof pricing !== 'object') {
            return res.status(400).json({ error: 'pricing objesi gerekli' });
        }

        // Validate & sanitize
        const sanitized = {};
        const validChannels = ['WHATSAPP', 'SMS', 'EMAIL', 'AI_CALL'];
        for (const ch of validChannels) {
            if (pricing[ch]) {
                sanitized[ch] = {
                    baseCost: Math.max(0, parseFloat(pricing[ch].baseCost) || DEFAULT_CHANNEL_PRICING[ch].baseCost),
                    multiplier: Math.max(0, parseFloat(pricing[ch].multiplier) || 1),
                    label: pricing[ch].label || DEFAULT_CHANNEL_PRICING[ch].label,
                };
            } else {
                sanitized[ch] = { ...DEFAULT_CHANNEL_PRICING[ch] };
            }
        }

        await prisma.workspace.update({
            where: { id: workspaceId },
            data: { channelPricing: sanitized }
        });

        res.json({ pricing: sanitized, message: 'Fiyatlandırma güncellendi' });
    } catch (error) {
        res.status(500).json({ error: 'Fiyatlandırma güncellenemedi', details: error.message });
    }
};

// ─── NetGSM SMS Config ────────────────────────────────────
export const getNetgsmConfig = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { netgsmConfig: true }
        });
        // Şifreyi maskelenerek döndür
        const config = workspace?.netgsmConfig || {};
        if (config.password) {
            config.password = '••••••••';
        }
        res.json({ config });
    } catch (error) {
        res.status(500).json({ error: 'Config alınamadı', details: error.message });
    }
};

export const updateNetgsmConfig = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { username, password, msgHeader, enabled } = req.body;

        // Mevcut config'i al (şifre güncellenmeyebilir)
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { netgsmConfig: true }
        });
        const existing = workspace?.netgsmConfig || {};

        const config = {
            username: username || existing.username || '',
            password: password === '••••••••' ? existing.password : (password || existing.password || ''),
            msgHeader: msgHeader || existing.msgHeader || 'INSTOMER',
            enabled: enabled !== undefined ? enabled : (existing.enabled || false),
        };

        await prisma.workspace.update({
            where: { id: workspaceId },
            data: { netgsmConfig: config }
        });

        // Şifreyi maskelenmiş döndür
        res.json({ config: { ...config, password: '••••••••' }, message: 'NetGSM ayarları güncellendi' });
    } catch (error) {
        res.status(500).json({ error: 'Config güncellenemedi', details: error.message });
    }
};

export const testNetgsmSms = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { phone } = req.body;

        if (!phone) return res.status(400).json({ error: 'Telefon numarası gerekli' });

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { netgsmConfig: true }
        });
        const config = workspace?.netgsmConfig;
        if (!config?.enabled || !config?.username) {
            return res.status(400).json({ error: 'NetGSM yapılandırılmamış veya kapalı' });
        }

        const { sendSms } = await import('../services/netgsm.service.js');
        const result = await sendSms(config, phone, 'Instomer test SMS ✅ Entegrasyon başarılı!');

        res.json({ result });
    } catch (error) {
        res.status(500).json({ error: 'SMS gönderilemedi', details: error.message });
    }
};

export const getNetgsmBalance = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { netgsmConfig: true }
        });
        const config = workspace?.netgsmConfig;
        if (!config?.username) {
            return res.status(400).json({ error: 'NetGSM yapılandırılmamış' });
        }

        const { checkBalance } = await import('../services/netgsm.service.js');
        const result = await checkBalance(config);

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Bakiye sorgulanamadı', details: error.message });
    }
};
