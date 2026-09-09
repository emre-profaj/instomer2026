import prisma from '../lib/prisma.js';

/**
 * Workspace'in Satış akışına varsayılan aşama aksiyonlarını ekler.
 * Yeni workspace oluşturulduğunda veya migration sırasında çağrılır.
 */
export async function applyDefaultStageActions(workspaceId) {
    // Satış akışını bul
    const salesFunnel = await prisma.funnel.findFirst({
        where: {
            workspaceId,
            name: { contains: 'Satış', mode: 'insensitive' }
        },
        include: {
            stages: { orderBy: { order: 'asc' } }
        }
    });

    if (!salesFunnel) {
        console.log(`[DefaultActions] Satış akışı bulunamadı (workspace: ${workspaceId})`);
        return;
    }

    for (const stage of salesFunnel.stages) {
        const stageName = stage.name.toLowerCase();
        let entryActions = null;
        let entryRules = null;
        const updateData = {};

        // Fırsat aşaması — telefon varsa otomatik gir + arama planla
        if (stageName.includes('fırsat') || stageName.includes('firsat')) {
            entryRules = JSON.stringify({
                matchType: 'ANY',
                rules: [
                    { type: 'FIELD_EXISTS', field: 'phone' }
                ]
            });

            entryActions = JSON.stringify({
                actions: [
                    {
                        type: 'CREATE_CALL_TASK',
                        title: '📞 Müşteri Aranacak',
                        description: 'Fırsat tespit edildi — müşteri aranacak'
                    },
                    {
                        type: 'NOTIFY_TEAM',
                        message: '🎯 Yeni fırsat! Arama planlandı.'
                    }
                ]
            });
        }

        // Sıcak Fırsat aşaması — arama görevi oluştur
        if (stageName.includes('sıcak') || stageName.includes('sicak')) {
            entryRules = JSON.stringify({
                matchType: 'ANY',
                rules: [
                    { type: 'TOPIC_CONTAINS', field: 'topic', values: ['arayın', 'ara', 'telefon', 'aranmak'] }
                ]
            });

            entryActions = JSON.stringify({
                actions: [
                    {
                        type: 'CREATE_CALL_TASK',
                        title: '📞 Müşteri Aranacak',
                        description: 'Müşteri aranmak istedi'
                    },
                    {
                        type: 'NOTIFY_TEAM',
                        message: '🔥 Sıcak fırsat! Müşteri aranmak istiyor.'
                    }
                ]
            });
        }

        // Görüşme Planlandı aşaması — bildirim
        if (stageName.includes('görüşme') || stageName.includes('gorusme') || stageName.includes('planlandi')) {
            if (!entryActions) {
                entryActions = JSON.stringify({
                    actions: [
                        {
                            type: 'NOTIFY_TEAM',
                            message: '📅 Yeni görüşme planlandı'
                        }
                    ]
                });
            }
        }

        // Teklif aşaması — bildirim + 3 gün sonra takip hatırlatması
        if (stageName.includes('teklif')) {
            if (!entryActions) {
                entryActions = JSON.stringify({
                    actions: [
                        {
                            type: 'NOTIFY_TEAM',
                            message: '📋 Teklif aşamasına geçildi'
                        }
                    ]
                });
            }
            if (!stage.timedActions) {
                updateData.timedActions = JSON.stringify({
                    actions: [
                        {
                            type: 'CREATE_TASK',
                            title: '⏰ Teklif Takibi',
                            description: 'Teklif verildikten 3 gün geçti — müşteriyi takip et',
                            delayDays: 3,
                            delayHours: 0
                        }
                    ]
                });
            }
        }

        // Randevu aşaması — WA şablon hatırlatma + bildirim
        if (stageName.includes('randevu') || stageName.includes('appointment')) {
            if (!entryActions) {
                entryActions = JSON.stringify({
                    actions: [
                        {
                            type: 'NOTIFY_TEAM',
                            message: '📅 Randevu planlandı'
                        }
                    ]
                });
            }
            if (!stage.timedActions) {
                updateData.timedActions = JSON.stringify({
                    actions: [
                        {
                            type: 'CREATE_TASK',
                            title: '📅 Randevu Hatırlatması',
                            description: 'Randevu yaklaşıyor — müşteriyi hatırlat',
                            delayDays: 0,
                            delayHours: 24
                        }
                    ]
                });
            }
        }

        // Kazanıldı aşaması — kutlama bildirimi
        if (stageName.includes('kazanıldı') || stageName.includes('kazanildi') || stageName.includes('won')) {
            if (!entryActions) {
                entryActions = JSON.stringify({
                    actions: [
                        {
                            type: 'NOTIFY_TEAM',
                            message: '🎉 Satış kazanıldı! Tebrikler!'
                        },
                        {
                            type: 'ADD_TAG',
                            tagName: 'müşteri'
                        }
                    ]
                });
            }
        }

        // Kaybedildi aşaması — bildirim + 30 gün sonra yeniden arama
        if (stageName.includes('kaybedildi') || stageName.includes('kayip') || stageName.includes('lost')) {
            if (!entryActions) {
                entryActions = JSON.stringify({
                    actions: [
                        {
                            type: 'NOTIFY_TEAM',
                            message: '😔 Fırsat kaybedildi'
                        },
                        {
                            type: 'ADD_TAG',
                            tagName: 'kayıp-fırsat'
                        }
                    ]
                });
            }
            if (!stage.timedActions) {
                updateData.timedActions = JSON.stringify({
                    actions: [
                        {
                            type: 'CREATE_TASK',
                            title: '🔄 Kayıp Fırsat Geri Kazanım',
                            description: '30 gün geçti — müşteriyi tekrar arayıp durumu sor',
                            delayDays: 30,
                            delayHours: 0
                        }
                    ]
                });
            }
        }

        // Sadece boş olan alanları güncelle (mevcut yapılandırmayı ezmez)
        if (entryActions && !stage.entryActions) updateData.entryActions = entryActions;
        if (entryRules && !stage.entryRules) updateData.entryRules = entryRules;

        if (Object.keys(updateData).length > 0) {
            await prisma.funnelStage.update({
                where: { id: stage.id },
                data: updateData
            });
            console.log(`[DefaultActions] ${stage.name}: ${Object.keys(updateData).join(', ')} eklendi`);
        }
    }

    console.log(`[DefaultActions] Workspace ${workspaceId} — varsayılan aksiyonlar uygulandı`);
}

/**
 * Tüm workspace'lere varsayılan aksiyonları uygular (migration).
 * Sadece boş olan aşamalara ekler.
 */
export async function migrateAllWorkspacesDefaultActions() {
    const workspaces = await prisma.workspace.findMany({ select: { id: true } });
    
    for (const ws of workspaces) {
        try {
            await applyDefaultStageActions(ws.id);
        } catch (err) {
            console.error(`[DefaultActions] Workspace ${ws.id} hatası:`, err.message);
        }
    }

    console.log(`[DefaultActions] Migration tamamlandı — ${workspaces.length} workspace işlendi`);
}

/**
 * Kanal routing'teki bot atamalarını akış seviyesine taşır (migration).
 * ChannelRouting'de botEnabled=true olan funnelId'leri bulur,
 * workspace'in ilk aktif botunu o akışa atar.
 * Sadece akışta henüz bot ataması yapılmamış olanlara uygular.
 */
export async function migrateBotFromChannelRouting() {
    // botEnabled=true olan routing'leri funnelId bazında grupla
    const routings = await prisma.channelRouting.findMany({
        where: { botEnabled: true, funnelId: { not: null } },
        select: {
            funnelId: true,
            workspaceId: true
        }
    });

    let migrated = 0;
    // funnelId → workspaceId map (unique)
    const funnelWorkspaceMap = new Map();

    for (const r of routings) {
        if (r.funnelId && !funnelWorkspaceMap.has(r.funnelId)) {
            funnelWorkspaceMap.set(r.funnelId, r.workspaceId);
        }
    }

    // Workspace başına ilk aktif botu cache'le
    const workspaceBotCache = new Map();

    for (const [funnelId, workspaceId] of funnelWorkspaceMap) {
        try {
            const funnel = await prisma.funnel.findUnique({
                where: { id: funnelId },
                select: { assignedBotId: true }
            });
            
            // Zaten bot ataması varsa atla
            if (funnel?.assignedBotId) continue;

            // Workspace'in ilk aktif botunu bul (cache)
            if (!workspaceBotCache.has(workspaceId)) {
                const bot = await prisma.aIBot.findFirst({
                    where: { workspaceId, isActive: true },
                    select: { id: true },
                    orderBy: { createdAt: 'asc' }
                });
                workspaceBotCache.set(workspaceId, bot?.id || null);
            }

            const botId = workspaceBotCache.get(workspaceId);
            if (!botId) continue;

            await prisma.funnel.update({
                where: { id: funnelId },
                data: { assignedBotId: botId }
            });
            migrated++;
            console.log(`[MigrateBots] Funnel ${funnelId} → Bot ${botId}`);
        } catch (err) {
            console.error(`[MigrateBots] Funnel ${funnelId} hatası:`, err.message);
        }
    }

    console.log(`[MigrateBots] ${migrated} akışa bot atandı (${funnelWorkspaceMap.size} eşleşme bulundu)`);
}

/**
 * Tam migration: varsayılan aksiyonlar + bot taşıma
 */
export async function runFullMigration() {
    console.log('═══════════════════════════════════════');
    console.log('🔄 Tam migration başlıyor...');
    console.log('═══════════════════════════════════════');
    
    await migrateAllWorkspacesDefaultActions();
    await migrateBotFromChannelRouting();
    
    console.log('═══════════════════════════════════════');
    console.log('✅ Tam migration tamamlandı!');
    console.log('═══════════════════════════════════════');
}
