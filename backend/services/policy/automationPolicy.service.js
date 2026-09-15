/**
 * ═══════════════════════════════════════════════════════════════
 * AUTOMATION POLICY — TEK İZİN KAPISI
 * ═══════════════════════════════════════════════════════════════
 *
 * Frontend'deki "Sistem Otomasyonları" panelindeki anahtarların
 * TEK okuma noktası. Bir özelliğin otomatik çalışıp çalışmayacağına
 * karar veren başka hiçbir yer olmamalı.
 *
 * Panel anahtarı → WorkspaceRule.ruleType → burası → domain servisleri
 *
 * Kullanım:
 *   import { isRuleEnabled } from '../policy/automationPolicy.service.js';
 *   if (!await isRuleEnabled(workspaceId, RULES.APPOINTMENT_AUTO_PLAN)) return;
 */

import prisma from '../../lib/prisma.js';

/** Panelde gösterilen kural anahtarları (frontend SYSTEM_ITEMS ile birebir) */
export const RULES = {
    APPOINTMENT_AUTO_PLAN: 'APPOINTMENT_AUTO_PLAN', // 📅 Randevu Talebi Algılama
    SALES_PHONE_CALL: 'SALES_PHONE_CALL',           // 📞 Arama Talebi Algılama
    PHONE_CAPTURE: 'PHONE_CAPTURE',                 // 📱 Telefon Numarası Yakalama
    HOT_KEYWORD: 'HOT_KEYWORD',                     // 🔥 Sıcak Anahtar Kelime Algılama
};

/**
 * Kural bulunamazsa ne olacak?
 * Kapalı olması gereken (yani açıkça açılmadıkça çalışmayan) kurallar burada.
 * Bunun dışındakiler geriye dönük uyumluluk için "yok = açık" kabul edilir.
 */
const DEFAULT_WHEN_MISSING = {
    [RULES.APPOINTMENT_AUTO_PLAN]: false,
    [RULES.SALES_PHONE_CALL]: false,
    [RULES.PHONE_CAPTURE]: true,
    [RULES.HOT_KEYWORD]: true,
};

// ─── Kısa ömürlü cache ────────────────────────────────────────────
// Tek bir mesaj işlenirken aynı kural 5-10 kez sorgulanabiliyor.
// 15 sn cache hem DB yükünü düşürür hem de panelden yapılan değişikliğin
// neredeyse anında yansımasını sağlar.
const TTL_MS = 15_000;
const cache = new Map(); // `${workspaceId}:${ruleType}` -> { value, config, expiresAt }

/** Panelden bir kural değiştiğinde çağrılır — beklemeden yansısın. */
export function invalidatePolicyCache(workspaceId, ruleType = null) {
    if (!workspaceId) { cache.clear(); return; }
    if (ruleType) { cache.delete(`${workspaceId}:${ruleType}`); return; }
    for (const key of cache.keys()) {
        if (key.startsWith(`${workspaceId}:`)) cache.delete(key);
    }
}

async function loadRule(workspaceId, ruleType) {
    const key = `${workspaceId}:${ruleType}`;
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit;

    let record = null;
    try {
        record = await prisma.workspaceRule.findFirst({
            where: { workspaceId, ruleType },
            select: { isActive: true, config: true },
        });
    } catch (err) {
        console.error(`❌ [Policy] ${ruleType} okunamadı (${workspaceId}):`, err.message);
        // DB hatasında güvenli taraf: otomatik aksiyonu ÇALIŞTIRMA.
        return { value: false, config: {}, expiresAt: 0 };
    }

    const value = record
        ? !!record.isActive
        : (DEFAULT_WHEN_MISSING[ruleType] ?? true);

    let config = {};
    if (record?.config) {
        try {
            config = typeof record.config === 'string' ? JSON.parse(record.config) : record.config;
        } catch { config = {}; }
    }

    const entry = { value, config, expiresAt: Date.now() + TTL_MS };
    cache.set(key, entry);
    return entry;
}

/** Kural açık mı? Panelde toggle kapalıysa false döner. */
export async function isRuleEnabled(workspaceId, ruleType) {
    if (!workspaceId || !ruleType) return false;
    const { value } = await loadRule(workspaceId, ruleType);
    return value;
}

/** Kuralın config JSON'u (kapalıysa da döner — çağıran isEnabled'ı ayrıca sormalı). */
export async function getRuleConfig(workspaceId, ruleType) {
    if (!workspaceId || !ruleType) return {};
    const { config } = await loadRule(workspaceId, ruleType);
    return config;
}

/** "AI Arama İzni" ANA VANASI — workspace.retellAutoCallEnabled */
export async function isAiCallingEnabled(workspaceId) {
    if (!workspaceId) return false;
    const key = `${workspaceId}:__AI_AUTO_CALL__`;
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;

    let value = false;
    try {
        const ws = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellAutoCallEnabled: true },
        });
        value = !!ws?.retellAutoCallEnabled;
    } catch (err) {
        console.error(`❌ [Policy] AI_AUTO_CALL okunamadı (${workspaceId}):`, err.message);
        return false;
    }

    cache.set(key, { value, config: {}, expiresAt: Date.now() + TTL_MS });
    return value;
}
