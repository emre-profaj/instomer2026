import prisma from '../lib/prisma.js';
import slugify from 'slugify';


// Tüm firmaları listele (SUPER_ADMIN only)
export const getAllCompanies = async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const companies = await prisma.company.findMany({
            include: {
                owner: {
                    select: { id: true, name: true, email: true }
                },
                workspaces: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        _count: {
                            select: {
                                members: true,
                                conversations: true,
                                facebookPages: true
                            }
                        }
                    }
                },
                _count: {
                    select: { workspaces: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ companies });
    } catch (error) {
        console.error('Get all companies error:', error);
        res.status(500).json({ error: 'Failed to fetch companies' });
    }
};

// Firma oluştur (SUPER_ADMIN only)
export const createCompany = async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { name, description, ownerId, maxWorkspaces, dailyAiChatLimit, aiSubscriptionType } = req.body;

        if (!name || !ownerId) {
            return res.status(400).json({ error: 'Name and ownerId are required' });
        }

        // Check if owner exists
        const owner = await prisma.user.findUnique({ where: { id: ownerId } });
        if (!owner) {
            return res.status(404).json({ error: 'Owner not found' });
        }

        // Generate unique slug
        let slug = slugify(name, { lower: true, strict: true });
        let slugExists = await prisma.company.findUnique({ where: { slug } });
        let counter = 1;
        while (slugExists) {
            slug = `${slugify(name, { lower: true, strict: true })}-${counter}`;
            slugExists = await prisma.company.findUnique({ where: { slug } });
            counter++;
        }

        const company = await prisma.company.create({
            data: {
                name,
                slug,
                description,
                ownerId,
                maxWorkspaces: maxWorkspaces || 3,
                dailyAiChatLimit: dailyAiChatLimit || 50,
                aiSubscriptionType: aiSubscriptionType || 'FREE'
            },
            include: {
                owner: {
                    select: { id: true, name: true, email: true }
                }
            }
        });

        res.status(201).json({ company });
    } catch (error) {
        console.error('Create company error:', error);
        res.status(500).json({ error: 'Failed to create company' });
    }
};

// Firma güncelle (SUPER_ADMIN only)
export const updateCompany = async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { companyId } = req.params;
        const { name, description, ownerId, maxWorkspaces, dailyAiChatLimit, aiSubscriptionType, aiSubscriptionEndsAt } = req.body;

        const existingCompany = await prisma.company.findUnique({ where: { id: companyId } });
        if (!existingCompany) {
            return res.status(404).json({ error: 'Company not found' });
        }

        const updateData = {};
        if (name) {
            updateData.name = name;
            // Update slug if name changes
            let slug = slugify(name, { lower: true, strict: true });
            let slugExists = await prisma.company.findFirst({ 
                where: { slug, id: { not: companyId } } 
            });
            let counter = 1;
            while (slugExists) {
                slug = `${slugify(name, { lower: true, strict: true })}-${counter}`;
                slugExists = await prisma.company.findFirst({ 
                    where: { slug, id: { not: companyId } } 
                });
                counter++;
            }
            updateData.slug = slug;
        }
        if (description !== undefined) updateData.description = description;
        if (ownerId) updateData.ownerId = ownerId;
        if (maxWorkspaces !== undefined) updateData.maxWorkspaces = maxWorkspaces;
        if (dailyAiChatLimit !== undefined) updateData.dailyAiChatLimit = dailyAiChatLimit;
        if (aiSubscriptionType) updateData.aiSubscriptionType = aiSubscriptionType;
        if (aiSubscriptionEndsAt !== undefined) {
            updateData.aiSubscriptionEndsAt = aiSubscriptionEndsAt ? new Date(aiSubscriptionEndsAt) : null;
        }

        const company = await prisma.company.update({
            where: { id: companyId },
            data: updateData,
            include: {
                owner: {
                    select: { id: true, name: true, email: true }
                },
                workspaces: {
                    select: { id: true, name: true }
                },
                _count: {
                    select: { workspaces: true }
                }
            }
        });

        res.json({ company });
    } catch (error) {
        console.error('Update company error:', error);
        res.status(500).json({ error: 'Failed to update company' });
    }
};

// Firma sil (SUPER_ADMIN only)
export const deleteCompany = async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { companyId } = req.params;

        const company = await prisma.company.findUnique({
            where: { id: companyId },
            include: { workspaces: true }
        });

        if (!company) {
            return res.status(404).json({ error: 'Company not found' });
        }

        // Workspaces'lerin companyId'sini null yap (firma silinse bile workspace'ler kalsın)
        await prisma.workspace.updateMany({
            where: { companyId },
            data: { companyId: null }
        });

        await prisma.company.delete({ where: { id: companyId } });

        res.json({ message: 'Company deleted successfully' });
    } catch (error) {
        console.error('Delete company error:', error);
        res.status(500).json({ error: 'Failed to delete company' });
    }
};

// Firmaya workspace ekle (SUPER_ADMIN veya firma sahibi)
export const addWorkspaceToCompany = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { workspaceId } = req.body;

        const company = await prisma.company.findUnique({ 
            where: { id: companyId },
            include: { _count: { select: { workspaces: true } } }
        });

        if (!company) {
            return res.status(404).json({ error: 'Company not found' });
        }

        // Yetki kontrolü: SUPER_ADMIN veya firma sahibi
        if (req.user.role !== 'SUPER_ADMIN' && company.ownerId !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Limit kontrolü
        if (company._count.workspaces >= company.maxWorkspaces) {
            return res.status(400).json({ 
                error: `Workspace limit reached. Maximum ${company.maxWorkspaces} workspaces allowed.` 
            });
        }

        const workspace = await prisma.workspace.update({
            where: { id: workspaceId },
            data: { companyId }
        });

        res.json({ workspace });
    } catch (error) {
        console.error('Add workspace to company error:', error);
        res.status(500).json({ error: 'Failed to add workspace to company' });
    }
};

// Firmadan workspace çıkar (SUPER_ADMIN only)
export const removeWorkspaceFromCompany = async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { companyId, workspaceId } = req.params;

        const workspace = await prisma.workspace.update({
            where: { id: workspaceId },
            data: { companyId: null }
        });

        res.json({ workspace });
    } catch (error) {
        console.error('Remove workspace from company error:', error);
        res.status(500).json({ error: 'Failed to remove workspace from company' });
    }
};

// Firma detayı getir
export const getCompany = async (req, res) => {
    try {
        const { companyId } = req.params;

        const company = await prisma.company.findUnique({
            where: { id: companyId },
            include: {
                owner: {
                    select: { id: true, name: true, email: true }
                },
                workspaces: {
                    include: {
                        _count: {
                            select: {
                                members: true,
                                conversations: true,
                                facebookPages: true,
                                contacts: true
                            }
                        }
                    }
                },
                _count: {
                    select: { workspaces: true }
                }
            }
        });

        if (!company) {
            return res.status(404).json({ error: 'Company not found' });
        }

        // Yetki kontrolü
        if (req.user.role !== 'SUPER_ADMIN' && company.ownerId !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        res.json({ company });
    } catch (error) {
        console.error('Get company error:', error);
        res.status(500).json({ error: 'Failed to fetch company' });
    }
};

// Firma sahibinin firmalarını getir
export const getMyCompanies = async (req, res) => {
    try {
        const companies = await prisma.company.findMany({
            where: { ownerId: req.user.id },
            include: {
                workspaces: {
                    select: {
                        id: true,
                        name: true,
                        slug: true
                    }
                },
                _count: {
                    select: { workspaces: true }
                }
            }
        });

        res.json({ companies });
    } catch (error) {
        console.error('Get my companies error:', error);
        res.status(500).json({ error: 'Failed to fetch companies' });
    }
};

// Firma altında yeni workspace oluştur (Firma sahibi)
export const createWorkspaceInCompany = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { name, description } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Workspace name is required' });
        }

        const company = await prisma.company.findUnique({
            where: { id: companyId },
            include: { _count: { select: { workspaces: true } } }
        });

        if (!company) {
            return res.status(404).json({ error: 'Company not found' });
        }

        // Yetki kontrolü: SUPER_ADMIN veya firma sahibi
        if (req.user.role !== 'SUPER_ADMIN' && company.ownerId !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Limit kontrolü
        if (company._count.workspaces >= company.maxWorkspaces) {
            return res.status(400).json({ 
                error: `Workspace limit reached. Maximum ${company.maxWorkspaces} workspaces allowed.`,
                limit: company.maxWorkspaces,
                current: company._count.workspaces
            });
        }

        // Generate unique slug
        let slug = slugify(name, { lower: true, strict: true });
        let slugExists = await prisma.workspace.findUnique({ where: { slug } });
        let counter = 1;
        while (slugExists) {
            slug = `${slugify(name, { lower: true, strict: true })}-${counter}`;
            slugExists = await prisma.workspace.findUnique({ where: { slug } });
            counter++;
        }

        // Workspace oluştur
        const workspace = await prisma.workspace.create({
            data: {
                name,
                slug,
                description,
                companyId,
                // Firmadan AI limitlerini miras al
                dailyAiChatLimit: company.dailyAiChatLimit,
                aiSubscriptionType: company.aiSubscriptionType,
                aiSubscriptionEndsAt: company.aiSubscriptionEndsAt
            }
        });

        // Firma sahibini workspace'e OWNER olarak ekle
        await prisma.workspaceMember.create({
            data: {
                userId: company.ownerId,
                workspaceId: workspace.id,
                role: 'OWNER'
            }
        });

        res.status(201).json({ workspace });
    } catch (error) {
        console.error('Create workspace in company error:', error);
        res.status(500).json({ error: 'Failed to create workspace' });
    }
};

// Tüm kullanıcıları listele (Firma sahibi seçimi için - SUPER_ADMIN only)
export const getAllUsers = async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const users = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true
            },
            orderBy: { name: 'asc' }
        });

        res.json({ users });
    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
};


// Firma içindeki tüm kullanıcıları listele (Firma sahibi veya SUPER_ADMIN)
export const getCompanyUsers = async (req, res) => {
    try {
        const { companyId } = req.params;

        const company = await prisma.company.findUnique({
            where: { id: companyId },
            include: { workspaces: { select: { id: true, name: true } } }
        });

        if (!company) {
            return res.status(404).json({ error: 'Company not found' });
        }

        // Yetki kontrolü
        if (req.user.role !== 'SUPER_ADMIN' && company.ownerId !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const workspaceIds = company.workspaces.map(ws => ws.id);

        // Firma içindeki tüm workspace'lerdeki kullanıcıları getir
        console.log(`📊 [getCompanyUsers] Company: ${company.name}, Workspaces: ${workspaceIds.length}`);

        const members = await prisma.workspaceMember.findMany({
            where: { workspaceId: { in: workspaceIds } },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        avatar: true,
                        role: true
                    }
                },
                workspace: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });

        console.log(`📊 [getCompanyUsers] Found ${members.length} workspace memberships`);

        // Kullanıcıları grupla (her kullanıcı için workspace listesi)
        const usersMap = new Map();
        members.forEach(member => {
            const userId = member.user.id;
            if (!usersMap.has(userId)) {
                usersMap.set(userId, {
                    ...member.user,
                    workspaces: []
                });
            }
            usersMap.get(userId).workspaces.push({
                id: member.workspace.id,
                name: member.workspace.name,
                role: member.role
            });
        });

        const users = Array.from(usersMap.values());
        console.log(`📊 [getCompanyUsers] Returning ${users.length} unique users`);


        res.json({ users, companyWorkspaces: company.workspaces });
    } catch (error) {
        console.error('Get company users error:', error);
        res.status(500).json({ error: 'Failed to fetch company users' });
    }
};

// Kullanıcıyı birden fazla workspace'e ata (Firma sahibi veya SUPER_ADMIN)
export const assignUserToWorkspaces = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { userId, workspaceIds, role } = req.body;

        if (!userId || !workspaceIds || !Array.isArray(workspaceIds)) {
            return res.status(400).json({ error: 'userId and workspaceIds (array) are required' });
        }

        const company = await prisma.company.findUnique({
            where: { id: companyId },
            include: { workspaces: { select: { id: true } } }
        });

        if (!company) {
            return res.status(404).json({ error: 'Company not found' });
        }

        // Yetki kontrolü
        if (req.user.role !== 'SUPER_ADMIN' && company.ownerId !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Kullanıcı var mı kontrol et
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Workspace'lerin firmaya ait olduğunu kontrol et
        const companyWorkspaceIds = company.workspaces.map(ws => ws.id);
        const invalidWorkspaces = workspaceIds.filter(wsId => !companyWorkspaceIds.includes(wsId));
        if (invalidWorkspaces.length > 0) {
            return res.status(400).json({ 
                error: 'Some workspaces do not belong to this company',
                invalidWorkspaces 
            });
        }

        // Mevcut üyelikleri getir
        const existingMemberships = await prisma.workspaceMember.findMany({
            where: {
                userId,
                workspaceId: { in: workspaceIds }
            }
        });

        const existingWorkspaceIds = existingMemberships.map(m => m.workspaceId);
        const newWorkspaceIds = workspaceIds.filter(wsId => !existingWorkspaceIds.includes(wsId));

        // Yeni üyelikler oluştur
        const createPromises = newWorkspaceIds.map(workspaceId =>
            prisma.workspaceMember.create({
                data: {
                    userId,
                    workspaceId,
                    role: role || 'AGENT'
                }
            })
        );

        await Promise.all(createPromises);

        res.json({ 
            message: 'User assigned to workspaces successfully',
            addedToWorkspaces: newWorkspaceIds.length,
            alreadyMember: existingWorkspaceIds.length
        });
    } catch (error) {
        console.error('Assign user to workspaces error:', error);
        res.status(500).json({ error: 'Failed to assign user to workspaces' });
    }
};

// Kullanıcıyı workspace'ten çıkar (Firma sahibi veya SUPER_ADMIN)
export const removeUserFromWorkspace = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { userId, workspaceId } = req.body;

        if (!userId || !workspaceId) {
            return res.status(400).json({ error: 'userId and workspaceId are required' });
        }

        const company = await prisma.company.findUnique({
            where: { id: companyId },
            include: { workspaces: { select: { id: true } } }
        });

        if (!company) {
            return res.status(404).json({ error: 'Company not found' });
        }

        // Yetki kontrolü
        if (req.user.role !== 'SUPER_ADMIN' && company.ownerId !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Workspace'in firmaya ait olduğunu kontrol et
        const companyWorkspaceIds = company.workspaces.map(ws => ws.id);
        if (!companyWorkspaceIds.includes(workspaceId)) {
            return res.status(400).json({ error: 'Workspace does not belong to this company' });
        }

        await prisma.workspaceMember.deleteMany({
            where: {
                userId,
                workspaceId
            }
        });

        res.json({ message: 'User removed from workspace successfully' });
    } catch (error) {
        console.error('Remove user from workspace error:', error);
        res.status(500).json({ error: 'Failed to remove user from workspace' });
    }
};
