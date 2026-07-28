import prisma from '../lib/prisma.js';

// Tüm kanal yönlendirmelerini getir
export const getChannelRoutings = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const routings = await prisma.channelRouting.findMany({
            where: { workspaceId },
            include: {
                team: {
                    select: {
                        id: true,
                        name: true,
                        color: true,
                        assignedBot: { select: { id: true, name: true } }
                    }
                },
                funnel: true,
                stage: { select: { id: true, name: true } }
            },
            orderBy: { channel: 'asc' }
        });

        const allChannels = ['INSTAGRAM', 'FACEBOOK', 'WHATSAPP', 'EMAIL', 'WEB_WIDGET', 'FORM'];
        const channelRoutingsMap = routings.reduce((acc, r) => { acc[r.channel] = r; return acc; }, {});

        const fullRoutings = allChannels.map(channel => ({
            channel,
            routing: channelRoutingsMap[channel] || null
        }));

        res.json({ routings, channels: fullRoutings });
    } catch (error) {
        console.error('Get channel routings error:', error);
        res.status(500).json({ error: 'Kanal yönlendirmeleri alınamadı' });
    }
};

// Kanal yönlendirmesi oluştur veya güncelle
export const upsertChannelRouting = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { channel, teamId, botDelay, botEnabled, isActive, funnelId, pageId, accountName, stageId } = req.body;

        if (!channel) return res.status(400).json({ error: 'Kanal gereklidir' });

        let team = null;
        if (teamId) {
            team = await prisma.team.findFirst({ where: { id: teamId, workspaceId } });
            if (!team) return res.status(404).json({ error: 'Ekip bulunamadı' });
        }

        let routing = await prisma.channelRouting.findFirst({
            where: {
                workspaceId,
                channel,
                pageId: pageId || null
            }
        });

        const data = {
            teamId: teamId || null,
            botDelay: botDelay ?? 30,
            botEnabled: botEnabled ?? true,
            isActive: isActive ?? true,
            funnelId: funnelId || null,
            stageId: stageId || null,
            accountName: accountName || null
        };

        if (routing) {
            routing = await prisma.channelRouting.update({
                where: { id: routing.id },
                data,
                include: {
                    team: { select: { id: true, name: true, color: true } },
                    funnel: { select: { id: true, name: true, icon: true, color: true } },
                    stage: { select: { id: true, name: true, color: true } }
                }
            });
        } else {
            routing = await prisma.channelRouting.create({
                data: {
                    workspaceId,
                    channel,
                    pageId: pageId || null,
                    ...data
                },
                include: {
                    team: { select: { id: true, name: true, color: true } },
                    funnel: { select: { id: true, name: true, icon: true, color: true } },
                    stage: { select: { id: true, name: true, color: true } }
                }
            });
        }

        console.log(`📡 [ChannelRouting] ${channel} → ${team ? team.name : 'No Team'} (delay: ${routing.botDelay}s)`);
        res.json({ routing });
    } catch (error) {
        console.error('Upsert channel routing error:', error);
        res.status(500).json({ error: 'Kanal yönlendirmesi kaydedilemedi' });
    }
};

// Kanal yönlendirmesini sil
export const deleteChannelRouting = async (req, res) => {
    try {
        const { workspaceId, channel } = req.params;
        const pageId = req.query.pageId || null;

        const routing = await prisma.channelRouting.findFirst({
            where: { workspaceId, channel, pageId }
        });

        if (routing) {
            await prisma.channelRouting.delete({ where: { id: routing.id } });
            console.log(`🗑️ [ChannelRouting] Deleted routing for ${channel}`);
        }

        res.json({ message: 'Kanal yönlendirmesi silindi' });
    } catch (error) {
        console.error('Delete channel routing error:', error);
        res.status(500).json({ error: 'Kanal yönlendirmesi silinemedi' });
    }
};

// Belirli bir kanal için yönlendirme bilgisini getir (webhook'lar için)
export const getRoutingForChannel = async (workspaceId, channel) => {
    try {
        const routing = await prisma.channelRouting.findFirst({
            where: { workspaceId, channel, pageId: null },
            include: {
                team: {
                    include: {
                        assignedBot: true,
                        members: { include: { user: { select: { id: true, name: true } } } }
                    }
                }
            }
        });
        return routing;
    } catch (error) {
        console.error('Get routing for channel error:', error);
        return null;
    }
};

// Belirli bir funnel için tüm kanal yönlendirmelerini getir
export const getRoutingsByFunnel = async (req, res) => {
    try {
        const { workspaceId, funnelId } = req.params;
        const routings = await prisma.channelRouting.findMany({
            where: { workspaceId, funnelId },
            include: { team: true, stage: true },
            orderBy: { priority: 'desc' }
        });
        res.json({ routings });
    } catch (error) {
        console.error('getRoutingsByFunnel error:', error);
        res.status(500).json({ error: error.message });
    }
};
