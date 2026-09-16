import prisma from '../lib/prisma.js';
import { seedDefaultTeams } from '../utils/teamSeeder.js';
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

        const { name, description, ownerId, maxWorkspaces, dailyAiChatLimit, aiSubscriptionType, aiModel } = req.body;

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
                aiSubscriptionType: aiSubscriptionType || 'FREE',
                aiModel: aiModel || 'gemini-2.5-flash'
            },
            include: {
                owner: {
                    select: { id: true, name: true, email: true }
                }
            }
        });

        // Owner'ın firmaya atanmamış workspace'lerini bu firmaya bağla
        // (maxWorkspaces sınırına kadar)
        const ownerWorkspaces = await prisma.workspace.findMany({
            where: {
                companyId: null,
                members: {
                    some: {
                        userId: ownerId,
                        role: 'OWNER'
                    }
                }
            },
            take: maxWorkspaces || 3
        });

        if (ownerWorkspaces.length > 0) {
            await prisma.workspace.updateMany({
                where: {
                    id: { in: ownerWorkspaces.map(w => w.id) }
                },
                data: { companyId: company.id }
            });
        }

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
        const { name, description, ownerId, maxWorkspaces, dailyAiChatLimit, aiSubscriptionType, aiSubscriptionEndsAt, aiModel, aiApiKey } = req.body;

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
        if (aiModel !== undefined) updateData.aiModel = aiModel;
        if (aiApiKey !== undefined) updateData.aiApiKey = aiApiKey || null;

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

        // Varsayılan takımlar ve kurallar — workspace.controller.js'teki
        // createWorkspace bunu çağırıyordu ama buradaki ikinci yol (Ayarlar →
        // İşletmelerim → Yeni Workspace) çağırmıyordu. Bu yoldan açılan
        // workspace'lerde hiç takım ve SALES_PHONE_CALL / PHONE_CAPTURE /
        // APPOINTMENT_AUTO_PLAN kuralları oluşmuyordu.
        // Idempotent: takım varsa atlar, kuralları upsert eder.
        await seedDefaultTeams(workspace.id);

        // Create default 'Insta' AI bot
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

// Company bazlı AI kullanım raporu
export const getCompanyAiUsage = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { month } = req.query; // "2026-09" formatı

        // Ay aralığı
        const now = new Date();
        let startDate, endDate;
        if (month) {
            const [y, m] = month.split('-').map(Number);
            startDate = new Date(y, m - 1, 1);
            endDate = new Date(y, m, 1);
        } else {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        }

        // Workspace kırılımı
        const byWorkspace = await prisma.aIUsageLog.groupBy({
            by: ['workspaceId'],
            where: { companyId, createdAt: { gte: startDate, lt: endDate } },
            _sum: { inputTokens: true, outputTokens: true, totalTokens: true, costUsd: true },
            _count: true,
        });

        // Service kırılımı
        const byService = await prisma.aIUsageLog.groupBy({
            by: ['service'],
            where: { companyId, createdAt: { gte: startDate, lt: endDate } },
            _sum: { inputTokens: true, outputTokens: true, totalTokens: true, costUsd: true },
            _count: true,
        });

        // Toplam
        const totals = await prisma.aIUsageLog.aggregate({
            where: { companyId, createdAt: { gte: startDate, lt: endDate } },
            _sum: { inputTokens: true, outputTokens: true, totalTokens: true, costUsd: true },
            _count: true,
        });

        // Workspace isimleri
        const workspaces = await prisma.workspace.findMany({
            where: { companyId },
            select: { id: true, name: true, aiModel: true }
        });
        const wsMap = Object.fromEntries(workspaces.map(w => [w.id, w]));

        res.json({
            companyId,
            month: month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
            totals: {
                calls: totals._count || 0,
                inputTokens: totals._sum.inputTokens || 0,
                outputTokens: totals._sum.outputTokens || 0,
                totalTokens: totals._sum.totalTokens || 0,
                costUsd: Math.round((totals._sum.costUsd || 0) * 10000) / 10000,
            },
            byWorkspace: byWorkspace.map(bw => ({
                workspaceId: bw.workspaceId,
                workspaceName: wsMap[bw.workspaceId]?.name || 'Bilinmiyor',
                aiModel: wsMap[bw.workspaceId]?.aiModel || null,
                calls: bw._count,
                totalTokens: bw._sum.totalTokens || 0,
                costUsd: Math.round((bw._sum.costUsd || 0) * 10000) / 10000,
            })),
            byService: byService.map(bs => ({
                service: bs.service,
                calls: bs._count,
                totalTokens: bs._sum.totalTokens || 0,
                costUsd: Math.round((bs._sum.costUsd || 0) * 10000) / 10000,
            })),
        });
    } catch (error) {
        console.error('AI usage report error:', error);
        res.status(500).json({ error: 'Failed to get AI usage report' });
    }
};

// Admin: Tüm hesapların AI kullanım özeti
export const getAllCompaniesAiUsage = async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { month } = req.query;
        const now = new Date();
        let startDate, endDate;
        if (month) {
            const [y, m] = month.split('-').map(Number);
            startDate = new Date(y, m - 1, 1);
            endDate = new Date(y, m, 1);
        } else {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        }

        const byCompany = await prisma.aIUsageLog.groupBy({
            by: ['companyId'],
            where: { createdAt: { gte: startDate, lt: endDate }, companyId: { not: null } },
            _sum: { totalTokens: true, costUsd: true },
            _count: true,
        });

        const companies = await prisma.company.findMany({
            select: { id: true, name: true, aiModel: true, aiSubscriptionType: true, _count: { select: { workspaces: true } } }
        });
        const compMap = Object.fromEntries(companies.map(c => [c.id, c]));

        // Toplam (company'siz dahil)
        const globalTotal = await prisma.aIUsageLog.aggregate({
            where: { createdAt: { gte: startDate, lt: endDate } },
            _sum: { totalTokens: true, costUsd: true },
            _count: true,
        });

        res.json({
            month: month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
            globalTotal: {
                calls: globalTotal._count || 0,
                totalTokens: globalTotal._sum.totalTokens || 0,
                costUsd: Math.round((globalTotal._sum.costUsd || 0) * 10000) / 10000,
            },
            companies: byCompany.map(bc => ({
                companyId: bc.companyId,
                companyName: compMap[bc.companyId]?.name || 'Bilinmiyor',
                aiModel: compMap[bc.companyId]?.aiModel || 'gemini-2.5-flash',
                plan: compMap[bc.companyId]?.aiSubscriptionType || 'FREE',
                workspaceCount: compMap[bc.companyId]?._count?.workspaces || 0,
                calls: bc._count,
                totalTokens: bc._sum.totalTokens || 0,
                costUsd: Math.round((bc._sum.costUsd || 0) * 10000) / 10000,
            })).sort((a, b) => b.costUsd - a.costUsd),
        });
    } catch (error) {
        console.error('Admin AI usage report error:', error);
        res.status(500).json({ error: 'Failed to get admin AI usage report' });
    }
};
