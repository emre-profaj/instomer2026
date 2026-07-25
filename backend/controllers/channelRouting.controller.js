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
                        assignedBot: {
                            select: {
                                id: true,
                                name: true
                            }
                        }
                    }
                },
                funnel: true,
                stage: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            },
            orderBy: { channel: 'asc' }
        });

        // Tüm kanalları listele (yönlendirme olmasa bile)
        const allChannels = ['INSTAGRAM', 'FACEBOOK', 'WHATSAPP', 'EMAIL', 'WEB_WIDGET', 'FORM'];
        
        const channelRoutingsMap = routings.reduce((acc, r) => {
            acc[r.channel] = r;
            return acc;
        }, {});

        const fullRoutings = allChannels.map(channel => ({
            channel,
            routing: channelRoutingsMap[channel] || null
        }));

        res.json({ 
            routings,
            channels: fullRoutings
        });
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

        if (!channel) {
            return res.status(400).json({ error: 'Kanal gereklidir' });
        }

        // Ekibin var olduğunu kontrol et
        let team = null;
        if (teamId) {
            team = await prisma.team.findFirst({
                where: { id: teamId, workspaceId }
            });

            if (!team) {
                return res.status(404).json({ error: 'Ekip bulunamadı' });
            }
        }

        const routing = await prisma.channelRouting.upsert({
            where: {
                workspaceId_channel: {
                    workspaceId,
                    channel
                }
            },
            create: {
                workspaceId,
                channel,
                teamId: teamId || null,
                botDelay: botDelay ?? 30,
                botEnabled: botEnabled ?? true,
                isActive: isActive ?? true,
                funnelId: funnelId || null,
                stageId: stageId || null,
                pageId: pageId || null,
                accountName: accountName || null
            },
            update: {
                teamId: teamId || null,
                botDelay: botDelay ?? 30,
                botEnabled: botEnabled ?? true,
                isActive: isActive ?? true,
                funnelId: funnelId || null,
                stageId: stageId || null,
                pageId: pageId || null,
                accountName: accountName || null
            },
            include: {
                team: {
                    select: {
                        id: true,
                        name: true,
                        color: true
                    }
                }
            }
        });

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

        await prisma.channelRouting.delete({
            where: {
                workspaceId_channel: {
                    workspaceId,
                    channel
                }
            }
        });

        console.log(`🗑️ [ChannelRouting] Deleted routing for ${channel}`);

        res.json({ message: 'Kanal yönlendirmesi silindi' });
    } catch (error) {
        console.error('Delete channel routing error:', error);
        res.status(500).json({ error: 'Kanal yönlendirmesi silinemedi' });
    }
};

// Belirli bir kanal için yönlendirme bilgisini getir (webhook'lar için)
export const getRoutingForChannel = async (workspaceId, channel) => {
    try {
        const routing = await prisma.channelRouting.findUnique({
            where: {
                workspaceId_channel: {
                    workspaceId,
                    channel
                }
            },
            include: {
                team: {
                    include: {
                        assignedBot: true,
                        members: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        name: true
                                    }
                                }
                            }
                        }
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
