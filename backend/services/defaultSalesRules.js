/**
 * Satış Akışı — Varsayılan Giriş Kuralları
 * 
 * Her yeni "Satış" tipi funnel oluşturulduğunda veya mevcut funnel'lara
 * migration ile bu kurallar otomatik atanır.
 * Kullanıcı EntryRulesModal ile istediği gibi düzenleyebilir.
 */

export const DEFAULT_SALES_RULES = {
    'Yeni Başvuru': {
        matchType: 'ALL',
        rules: [
            { type: 'FIELD_EXISTS', field: 'name' }
        ]
    },
    'Fırsat': {
        matchType: 'ALL',
        rules: [
            { type: 'FIELD_EXISTS', field: 'name' },
            { type: 'FIELD_EXISTS', field: 'phone' },
            { type: 'FIELD_EXISTS', field: 'topic' }
        ]
    },
    // 'Bilgi Verildi' — kural yok, manuel aşama
    'Sıcak Fırsat': {
        matchType: 'ANY',
        rules: [
            { type: 'TOPIC_CONTAINS', values: ['fiyat', 'ücret', 'maliyet', 'teklif', 'bütçe'] },
            { type: 'TOPIC_CONTAINS', values: ['görüşme', 'randevu', 'toplantı'] }
        ]
    },
    'Görüşme Planlandı': {
        matchType: 'ANY',
        rules: [
            { type: 'ACTIVITY_EXISTS', activityType: 'MEETING' },
            { type: 'HAS_APPOINTMENT', value: true }
        ]
    },
    'Teklif Aşaması': {
        matchType: 'ALL',
        rules: []
    },
    'Satış': {
        matchType: 'ALL',
        rules: [
            { type: 'DEAL_STATUS', status: 'WON' }
        ]
    },
    // 'Ulaşılamadı' — kural yok, manuel aşama
    'Kayıp': {
        matchType: 'ALL',
        rules: [
            { type: 'DEAL_STATUS', status: 'LOST' }
        ]
    }
};

/**
 * Aşama adına göre varsayılan kuralları döndürür.
 * Eşleşme yoksa null döner (kural yok = manuel aşama).
 */
export function getDefaultRulesForStage(stageName) {
    return DEFAULT_SALES_RULES[stageName] || null;
}

/**
 * Bir funnel'ın tüm stage'lerine varsayılan kuralları atar.
 * Stage adı DEFAULT_SALES_RULES'da varsa kuralını atar,
 * yoksa null bırakır (manuel aşama).
 */
export function applyDefaultRulesToStages(stages) {
    return stages.map((stage, index) => {
        const rules = getDefaultRulesForStage(stage.name);
        return {
            ...stage,
            entryRules: rules ? JSON.stringify(rules) : null,
            entryPriority: index // order'a göre öncelik
        };
    });
}
