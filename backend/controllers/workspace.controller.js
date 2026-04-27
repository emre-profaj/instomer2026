import { validationResult } from 'express-validator';
import prisma from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getAiUsageStats } from '../services/aiUsage.service.js';
import { logAdminActivity } from '../services/activityLog.service.js';
import { seedDefaultTeams } from '../utils/teamSeeder.js';


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

export const getWorkspaceMembers = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const members = await prisma.workspaceMember.findMany({
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
        });

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
        const { email, role, name, password } = req.body;

        // Check if requester has permission (must be OWNER)
        if (!['OWNER', 'SUPER_ADMIN'].includes(req.workspaceMember.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

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
                role
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
        const { name, email, workingHours } = req.body;

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

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: { id: true, name: true, email: true, avatar: true, isOnline: true, workingHours: true }
        });

        console.log(`✏️ Member info updated for ${updatedUser.email} by ${req.user.email}`);
        res.json({ user: updatedUser });
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
                invoiceIban: true
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
            invoiceIban
        } = req.body;

        const workspace = await prisma.workspace.update({
            where: { id: workspaceId },
            data: {
                companyName,
                companyDescription,
                companyAddress,
                companyPhone,
                companyEmail,
                companyWebsite,
                companyWorkingHours,
                invoiceTaxOffice,
                invoiceTaxNumber,
                invoiceIban
            },
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
                invoiceIban: true
            }
        });

        res.json({ companyInfo: workspace });
    } catch (error) {
        console.error('Update company info error:', error);
        res.status(500).json({ error: 'Failed to update company info' });
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
