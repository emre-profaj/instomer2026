import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import prisma from '../lib/prisma.js';
import { DEFAULT_CASE_TYPES, findMatchingFunnel } from '../controllers/caseType.controller.js';

async function syncAllWorkspaces() {
    console.log('🚀 [SyncCaseTypes] Starting CaseType & Funnel synchronization across all workspaces...');

    try {
        const workspaces = await prisma.workspace.findMany({
            select: { id: true, name: true }
        });

        console.log(`🏢 Bulunan toplam workspace sayısı: ${workspaces.length}`);

        for (const ws of workspaces) {
            console.log(`\n─────────────────────────────────────────────────────────`);
            console.log(`🔍 İşleniyor: Workspace "${ws.name}" (${ws.id})`);

            // 1. Workspace'in funnel'larını çek
            const funnels = await prisma.funnel.findMany({
                where: { workspaceId: ws.id },
                select: { id: true, name: true, isDefault: true }
            });

            console.log(`   ├─ Mevcut Akışlar (${funnels.length}): ${funnels.map(f => f.name).join(', ') || 'Yok'}`);

            // 2. Mevcut CaseType'ları çek
            const existingCaseTypes = await prisma.caseType.findMany({
                where: { workspaceId: ws.id }
            });

            console.log(`   ├─ Mevcut Vaka Tipleri (${existingCaseTypes.length}): ${existingCaseTypes.map(c => c.name).join(', ') || 'Yok'}`);

            // 3. Eksik olan default CaseType'ları oluştur
            for (const def of DEFAULT_CASE_TYPES) {
                const existing = existingCaseTypes.find(
                    c => (c.systemCode && c.systemCode === def.systemCode) || c.name.toLocaleLowerCase('tr-TR') === def.name.toLocaleLowerCase('tr-TR')
                );

                if (!existing) {
                    const matchedFunnel = findMatchingFunnel(funnels, def.targetFunnelKeywords);
                    const created = await prisma.caseType.create({
                        data: {
                            workspaceId: ws.id,
                            name: def.name,
                            systemCode: def.systemCode,
                            color: def.color,
                            icon: def.icon,
                            order: def.order,
                            funnelId: matchedFunnel ? matchedFunnel.id : null
                        }
                    });
                    console.log(`   ✨ [YENİ] Vaka Tipi eklendi: "${created.name}" ➔ Akış: "${matchedFunnel?.name || 'Bağlanmadı'}"`);
                } else {
                    // Mevcutsa ama funnelId boşsa eşleştir
                    if (!existing.funnelId) {
                        const matchedFunnel = findMatchingFunnel(funnels, def.targetFunnelKeywords);
                        if (matchedFunnel) {
                            await prisma.caseType.update({
                                where: { id: existing.id },
                                data: { funnelId: matchedFunnel.id }
                            });
                            console.log(`   🔗 [GÜNCELLENDİ] Mevcut Vaka Tipi "${existing.name}" ➔ Akışa bağlandı: "${matchedFunnel.name}"`);
                        }
                    } else {
                        const boundFunnel = funnels.find(f => f.id === existing.funnelId);
                        console.log(`   ✓ [OK] "${existing.name}" zaten bağlı: "${boundFunnel?.name || existing.funnelId}"`);
                    }
                }
            }
        }

        console.log(`\n✅ [SyncCaseTypes] Tüm workspace'ler başarıyla senkronize edildi!`);
    } catch (err) {
        console.error('❌ [SyncCaseTypes] Hata:', err);
    } finally {
        await prisma.$disconnect();
    }
}

syncAllWorkspaces();
