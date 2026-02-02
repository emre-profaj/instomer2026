import { validationResult } from 'express-validator';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getAiUsageStats } from '../services/aiUsage.service.js';

const prisma = new PrismaClient();

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

        res.status(201).json({ workspace });
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
                        avatar: true
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
            user = await prisma.user.create({
                data: {
                    email,
                    name,
                    password: hashedPassword,
                    role: 'USER' // Default role for new users
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

        await prisma.workspaceMember.delete({
            where: {
                userId_workspaceId: {
                    userId,
                    workspaceId
                }
            }
        });

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

export const deleteWorkspace = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        // Check if requester has permission (must be OWNER)
        if (req.workspaceMember.role !== 'OWNER') {
            return res.status(403).json({ error: 'Only workspace owner can delete the workspace' });
        }

        // Delete workspace (cascade will handle related data if configured in schema, 
        // otherwise we might need manual cleanup but usually Prisma handles this)
        await prisma.workspace.delete({
            where: { id: workspaceId }
        });

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
                companyLogo: true
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
            companyWorkingHours
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
                companyWorkingHours
            },
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
