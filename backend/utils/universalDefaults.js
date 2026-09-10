/**
 * Universal Defaults — Tüm sektörler için temel akış, kategori ve bot tanımları
 * 
 * Workspace oluşturulduğunda onboardingEngine tarafından çağrılır.
 * Sektör bağımsız evrensel taban kurar.
 */

// ─── 4 Temel Akış (Funnel) ─────────────────────────────────────
export const DEFAULT_FUNNELS = [
    {
        name: 'Satış',
        funnelType: 'SALES',
        color: '#3b82f6',
        stages: [
            { name: 'Yeni Başvuru', order: 0, color: '#60a5fa' },
            { name: 'İlk İletişim', order: 1, color: '#38bdf8' },
            { name: 'İhtiyaç Analizi', order: 2, color: '#2dd4bf' },
            { name: 'Teklif Verildi', order: 3, color: '#fbbf24' },
            { name: 'Pazarlık', order: 4, color: '#f97316' },
            { name: 'Kazanıldı', order: 5, color: '#22c55e', isClosing: true },
            { name: 'Kaybedildi', order: 6, color: '#ef4444', isClosing: true },
        ]
    },
    {
        name: 'Randevu',
        funnelType: 'APPOINTMENT',
        color: '#8b5cf6',
        stages: [
            { name: 'Randevu Talebi', order: 0, color: '#a78bfa' },
            { name: 'Randevu Verildi', order: 1, color: '#7c3aed' },
            { name: 'Hatırlatma Gönderildi', order: 2, color: '#6d28d9' },
            { name: 'Tamamlandı', order: 3, color: '#22c55e', isClosing: true },
            { name: 'İptal', order: 4, color: '#ef4444', isClosing: true },
        ]
    },
    {
        name: 'Destek',
        funnelType: 'SUPPORT',
        color: '#f59e0b',
        stages: [
            { name: 'Yeni Talep', order: 0, color: '#fbbf24' },
            { name: 'İnceleniyor', order: 1, color: '#f97316' },
            { name: 'Yanıt Bekliyor', order: 2, color: '#fb923c' },
            { name: 'Çözüldü', order: 3, color: '#22c55e', isClosing: true },
        ]
    },
    {
        name: 'Genel',
        funnelType: 'GENERAL',
        color: '#6b7280',
        stages: [
            { name: 'Gelen', order: 0, color: '#9ca3af' },
            { name: 'İşleniyor', order: 1, color: '#6b7280' },
            { name: 'Tamamlandı', order: 2, color: '#22c55e', isClosing: true },
        ]
    }
];

// ─── 6 Temel Kategori ──────────────────────────────────────────
export const DEFAULT_CATEGORIES = [
    { name: 'Satış / Fiyat Bilgisi', keywords: ['fiyat', 'ücret', 'ne kadar', 'teklif', 'indirim', 'kampanya', 'satın al'] },
    { name: 'Randevu / Görüşme', keywords: ['randevu', 'görüşme', 'müsait', 'zaman', 'tarih', 'saat', 'ne zaman'] },
    { name: 'Destek / Şikayet', keywords: ['sorun', 'problem', 'şikayet', 'arıza', 'bozuk', 'iade', 'çalışmıyor'] },
    { name: 'Bilgi Talebi', keywords: ['bilgi', 'nasıl', 'nedir', 'merak', 'soru', 'öğrenmek'] },
    { name: 'Konum / Adres', keywords: ['nerede', 'adres', 'konum', 'yol tarifi', 'harita', 'nasıl gelinir'] },
    { name: 'İK / Başvuru', keywords: ['iş başvurusu', 'cv', 'özgeçmiş', 'kariyer', 'personel', 'çalışmak'] },
];

// ─── Default Bot Kişiliği ───────────────────────────────────────
export const DEFAULT_BOT_PROMPT = `Sen profesyonel, samimi ve çözüm odaklı bir müşteri asistanısın.

KİŞİLİĞİN:
- Samimi ama profesyonel
- Kısa ve net yanıtlar ver (max 2-3 cümle)
- Emoji kullanabilirsin ama abartma
- Her zaman Türkçe konuş

KURALLAR:
- Bilmediğin konularda "Bu konuda size en doğru bilgiyi verebilmem için ekibimize yönlendirmemi ister misiniz?" de
- Fiyat sorusu gelirse mevcut bilginden yanıtla, yoksa ekibe yönlendir
- Müşterinin ihtiyacını anlamaya çalış, soru sor
- Kişisel veri (TC, kredi kartı vb.) asla isteme
- Rakip firma hakkında yorum yapma`;

// ─── Default Otomasyon Kuralları ────────────────────────────────
// linkedStageName: Onboarding sırasında gerçek stage ID ile eşleştirilir
export const DEFAULT_AUTOMATION_RULES = [
    {
        ruleType: 'APPOINTMENT_REMINDER',
        isActive: true,
        config: { reminderHours: 24 },
        linkedStageName: 'Randevu Verildi',
        linkedFunnelType: 'APPOINTMENT',
        needsTemplate: true,
        label: 'Randevu Hatırlatma (24 saat önce)'
    },
    {
        ruleType: 'QUOTE_REMINDER',
        isActive: false,   // Şablon seçilmeli
        config: { daysAfter: 7 },
        linkedStageName: 'Teklif Verildi',
        linkedFunnelType: 'SALES',
        needsTemplate: true,
        label: 'Teklif Hatırlatma (7 gün)'
    },
    {
        ruleType: 'DRIP_DAY_1',
        isActive: false,   // Şablon seçilmeli
        config: {},
        linkedStageName: null,
        linkedFunnelType: null,
        needsTemplate: true,
        label: 'Hoşgeldin Mesajı (1. gün)'
    },
    {
        ruleType: 'DRIP_DAY_7',
        isActive: false,   // Şablon seçilmeli
        config: {},
        linkedStageName: null,
        linkedFunnelType: null,
        needsTemplate: true,
        label: 'Takip Mesajı (7. gün)'
    },
    {
        ruleType: 'INACTIVE_REACTIVATION',
        isActive: false,   // Şablon seçilmeli
        config: { daysInactive: 30 },
        linkedStageName: 'Kaybedildi',
        linkedFunnelType: 'SALES',
        needsTemplate: true,
        label: 'Kayıp Geri Kazanım (30 gün)'
    },
    {
        ruleType: 'NEW_LEAD_NOTIFY',
        isActive: true,
        config: {},
        linkedStageName: 'Yeni Başvuru',
        linkedFunnelType: 'SALES',
        needsTemplate: false,
        label: 'Yeni Lead Ekip Bildirimi'
    },
    {
        ruleType: 'STAGE_CHANGE_NOTIFY',
        isActive: true,
        config: {},
        linkedStageName: null,
        linkedFunnelType: null,
        needsTemplate: false,
        label: 'Aşama Değişim Bildirimi'
    },
    {
        ruleType: 'SATISFACTION_SURVEY',
        isActive: false,   // Şablon seçilmeli
        config: { daysAfterClose: 1 },
        linkedStageName: 'Kazanıldı',
        linkedFunnelType: 'SALES',
        needsTemplate: true,
        label: 'Memnuniyet Anketi (kapanış sonrası)'
    },
    {
        ruleType: 'APPOINTMENT_CONFIRM',
        isActive: false,
        config: { reminderHours: 24 },
        linkedStageName: 'Randevu Verildi',
        linkedFunnelType: 'APPOINTMENT',
        needsTemplate: true,
        label: 'Randevu Teyidi (24 saat önce)'
    },
    {
        ruleType: 'APPOINTMENT_PLANNED_NOTIFY',
        isActive: true,
        config: {},
        linkedStageName: 'Görüşme Planlandı',
        linkedFunnelType: 'APPOINTMENT',
        needsTemplate: true,
        label: 'Randevu Planlandı Mesajı'
    },
    {
        ruleType: 'NO_SHOW_FOLLOWUP',
        isActive: false,
        config: { delayMinutes: 120 },
        linkedStageName: null,
        linkedFunnelType: 'APPOINTMENT',
        needsTemplate: true,
        label: 'Gelmedi Takibi (2 saat sonra)'
    },
    {
        ruleType: 'QUOTE_EXPIRY_NOTIFY',
        isActive: false,
        config: { daysAfter: 14 },
        linkedStageName: 'Teklif Verildi',
        linkedFunnelType: 'SALES',
        needsTemplate: true,
        label: 'Teklif Süresi Dolmak Üzere (14 gün)'
    },
    {
        ruleType: 'POST_SALE_FOLLOWUP',
        isActive: false,
        config: { delayMinutes: 1440 },
        linkedStageName: 'Kazanıldı',
        linkedFunnelType: 'SALES',
        needsTemplate: true,
        label: 'Satış Sonrası Takip (1 gün)'
    },
    {
        ruleType: 'BIRTHDAY_GREETING',
        isActive: false,
        config: {},
        linkedStageName: null,
        linkedFunnelType: null,
        needsTemplate: true,
        label: 'Doğum Günü Kutlama'
    },
    {
        ruleType: 'DRIP_DAY_0',
        isActive: false,
        config: {},
        linkedStageName: 'Yeni Başvuru',
        linkedFunnelType: 'SALES',
        needsTemplate: true,
        label: 'Başvuru Günü Mesajı'
    },
    {
        ruleType: 'DRIP_DAY_3',
        isActive: false,
        config: {},
        linkedStageName: null,
        linkedFunnelType: null,
        needsTemplate: true,
        label: '3. Gün Takip Mesajı'
    },
    {
        ruleType: 'DRIP_DAY_14',
        isActive: false,
        config: {},
        linkedStageName: null,
        linkedFunnelType: null,
        needsTemplate: true,
        label: '14. Gün Kampanya Mesajı'
    },
    {
        ruleType: 'DRIP_DAY_30',
        isActive: false,
        config: {},
        linkedStageName: null,
        linkedFunnelType: null,
        needsTemplate: true,
        label: '30. Gün Son Şans Mesajı'
    },
    {
        ruleType: 'REFERRAL_REQUEST',
        isActive: false,
        config: {},
        linkedStageName: 'Kazanıldı',
        linkedFunnelType: 'SALES',
        needsTemplate: true,
        label: 'Referans İsteği'
    },
    {
        ruleType: 'CUSTOMER_1ST_YEAR',
        isActive: false,
        config: {},
        linkedStageName: null,
        linkedFunnelType: null,
        needsTemplate: true,
        label: 'Müşteri 1. Yıl Kutlama'
    },
    {
        ruleType: 'POSITIVE_LEAD_CAMPAIGN',
        isActive: false,
        config: {},
        linkedStageName: null,
        linkedFunnelType: null,
        needsTemplate: true,
        label: 'Olumlu Lead Kampanyası'
    },
];

