/**
 * ═══════════════════════════════════════════════════════════════
 * KAYNAK (LEAD SOURCE) — ARAYÜZ TARAFI TEK LİSTE
 * ═══════════════════════════════════════════════════════════════
 *
 * Aynı kaynak listesi bugün ContactSidebar, CeoReport, MeetingAnalytics
 * gibi yerlerde ayrı ayrı yazılı. Her yeni kaynak eklendiğinde biri
 * unutuluyor. Bundan sonrası için tek yer burası.
 *
 * İki grup var:
 *
 *   PICKABLE  → Temsilcinin elle seçebildiği kaynaklar. Sistem bunları
 *               kendi başına bilemez; "bu satış nereden geldi" sorusunun
 *               cevabı insanın kafasında.
 *
 *   AUTO      → Sohbet kanalından otomatik düşen kodlar. Seçim listesinde
 *               görünmez ama kayıtta duruyorsa doğru etiketle gösterilir;
 *               yoksa select boş görünür ve ilk dokunuşta veri silinir.
 *
 * Backend karşılığı: backend/utils/leadSource.js
 */

// Elle seçilebilen kaynaklar — select'te bu sırayla çıkar
export const PICKABLE_SOURCES = [
    { value: 'INBOUND', label: 'Telefon', icon: '📞' },
    { value: 'WALK_IN', label: 'Yüz Yüze', icon: '🚶' },
    { value: 'REFERRAL', label: 'Referans', icon: '🤝' }
];

// Otomatik düşen kodlar — seçilemez, sadece gösterilir
const AUTO_SOURCES = {
    WHATSAPP: { label: 'WhatsApp', icon: '📱' },
    EMAIL: { label: 'E-posta', icon: '📧' },
    WIDGET: { label: 'Web Sohbeti', icon: '🌐' },
    WEB_WIDGET: { label: 'Web Sohbeti', icon: '🌐' },
    FORM: { label: 'Web Formu', icon: '📝' },
    WEB_FORM: { label: 'Web Formu', icon: '📝' },
    LEAD: { label: 'Facebook Lead Formu', icon: '📘' },
    FACEBOOK_LEAD: { label: 'Facebook Lead Formu', icon: '📘' },
    AI_CALL: { label: 'AI Arama', icon: '🤖' },
    SMS: { label: 'SMS', icon: '✉️' },
    PHONE: { label: 'Telefon', icon: '📞' },
    // Kişi kartından gelebilen, satışta seçilemeyen kaynaklar
    SOCIAL_MEDIA: { label: 'Sosyal Medya', icon: '📱' },
    GOOGLE: { label: 'Google', icon: '🔍' },
    FACEBOOK: { label: 'Facebook', icon: '📘' },
    INSTAGRAM: { label: 'Instagram', icon: '📸' },
    WEBSITE: { label: 'Web Sitesi', icon: '🌐' },
    EVENT: { label: 'Etkinlik / Fuar', icon: '🎪' },
    OTHER: { label: 'Diğer', icon: '📍' }
};

const PICKABLE_MAP = Object.fromEntries(
    PICKABLE_SOURCES.map(s => [s.value, { label: s.label, icon: s.icon }])
);

/** Kaynak kodunun okunabilir karşılığı. Bilinmeyen kod olduğu gibi döner. */
export function sourceLabel(code) {
    if (!code) return '';
    const key = String(code).toUpperCase();
    return (PICKABLE_MAP[key] || AUTO_SOURCES[key])?.label || code;
}

/** Kaynak kodunun ikonu. Bilinmeyen kod için nötr işaret. */
export function sourceIcon(code) {
    if (!code) return '📋';
    const key = String(code).toUpperCase();
    return (PICKABLE_MAP[key] || AUTO_SOURCES[key])?.icon || '📋';
}

/** Kayıttaki değer elle seçilemeyen (otomatik) bir kod mu? */
export function isAutoSource(code) {
    if (!code) return false;
    const key = String(code).toUpperCase();
    return !PICKABLE_MAP[key];
}

export default { PICKABLE_SOURCES, sourceLabel, sourceIcon, isAutoSource };
