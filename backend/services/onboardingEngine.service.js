/**
 * Onboarding Engine — Yeni workspace için evrensel taban kurar
 * 
 * createWorkspace() sonrası çağrılır.
 * Idempotent: Zaten akışı/kategorisi olan workspace'lerde skip eder.
 */

import prisma from '../lib/prisma.js';
import {
    DEFAULT_FUNNELS,
    DEFAULT_CATEGORIES,
    DEFAULT_BOT_PROMPT,
    DEFAULT_AUTOMATION_RULES
} from '../utils/universalDefaults.js';

/**
 * Tüm default verileri tek seferde oluşturur.
 * @param {string} workspaceId
 * @returns {Promise<{funnels: number, categories: number, rules: number}>}
 */
export async function applyUniversalDefaults(workspaceId) {
    const result = { funnels: 0, categories: 0, rules: 0 };

    try {
        // ── 1. Default Akışlar (Funnel + Stages) ──
        const existingFunnels = await prisma.funnel.count({ where: { workspaceId } });
        if (existingFunnels === 0) {
            // Stage ID'lerini topla → otomasyon bağlantısı için lazım
            const stageMap = {}; // { "SALES:Teklif Verildi": stageId }

            for (const fDef of DEFAULT_FUNNELS) {
                const funnel = await prisma.funnel.create({
                    data: {
                        workspaceId,
                        name: fDef.name,
                        funnelType: fDef.funnelType,
                        color: fDef.color,
                        isDefault: true,
                        stages: {
                            create: fDef.stages.map(s => ({
                                name: s.name,
                                order: s.order,
                                color: s.color,
                                isClosing: s.isClosing || false,
                            }))
                        }
                    },
                    include: { stages: true }
                });

                result.funnels++;
                // Stage'leri map'e ekle
                for (const stage of funnel.stages) {
                    stageMap[`${fDef.funnelType}:${stage.name}`] = stage.id;
                }
            }

            console.log(`🌱 [Onboarding] ${result.funnels} default akış oluşturuldu (workspace: ${workspaceId})`);

            // ── 3. Default Otomasyon Kuralları (linkedStageId ile) ──
            for (const ruleDef of DEFAULT_AUTOMATION_RULES) {
                let linkedStageId = null;
                if (ruleDef.linkedStageName && ruleDef.linkedFunnelType) {
                    linkedStageId = stageMap[`${ruleDef.linkedFunnelType}:${ruleDef.linkedStageName}`] || null;
                }

                await prisma.workspaceRule.upsert({
                    where: {
                        workspaceId_ruleType_linkedStageId: { workspaceId, ruleType: ruleDef.ruleType, linkedStageId: null }
                    },
                    create: {
                        workspaceId,
                        ruleType: ruleDef.ruleType,
                        isActive: ruleDef.isActive,
                        config: JSON.stringify({
                            ...ruleDef.config,
                            label: ruleDef.label,
                            needsTemplate: ruleDef.needsTemplate,
                        }),
                        ...(linkedStageId && { linkedStageId }),
                    },
                    update: {} // Var olan kuralı değiştirme
                });
                result.rules++;
            }

            console.log(`🌱 [Onboarding] ${result.rules} default otomasyon kuralı oluşturuldu`);
        } else {
            console.log(`⏭️ [Onboarding] Workspace ${workspaceId} zaten ${existingFunnels} akışa sahip, akış+kural seeding atlanıyor`);
        }

        // ── 2. Default Kategoriler ──
        const existingCats = await prisma.topicCategory.count({ where: { workspaceId } });
        if (existingCats === 0) {
            for (const catDef of DEFAULT_CATEGORIES) {
                await prisma.topicCategory.create({
                    data: {
                        workspaceId,
                        name: catDef.name,
                        keywords: JSON.stringify(catDef.keywords),
                        isActive: true,
                    }
                });
                result.categories++;
            }
            console.log(`🌱 [Onboarding] ${result.categories} default kategori oluşturuldu`);
        } else {
            console.log(`⏭️ [Onboarding] Workspace ${workspaceId} zaten ${existingCats} kategoriye sahip, atlanıyor`);
        }

        console.log(`✅ [Onboarding] Evrensel taban kurulumu tamamlandı:`, result);
        return result;
    } catch (error) {
        console.error(`❌ [Onboarding] Evrensel taban kurulumu hatası:`, error.message);
        return result;
    }
}

/**
 * Mevcut workspace'lere default kuralları + akışları seed eder (migration).
 * Admin panelinden çağrılabilir.
 */
export async function seedExistingWorkspaces() {
    const workspaces = await prisma.workspace.findMany({ select: { id: true, name: true } });
    console.log(`🌱 [Migration] ${workspaces.length} workspace'e evrensel taban uygulanacak...`);

    let success = 0;
    for (const ws of workspaces) {
        try {
            await applyUniversalDefaults(ws.id);
            success++;
        } catch (e) {
            console.error(`❌ [Migration] Workspace ${ws.name} (${ws.id}) hatası:`, e.message);
        }
    }

    console.log(`✅ [Migration] ${success}/${workspaces.length} workspace başarılı`);
    return { total: workspaces.length, success };
}
