/**
 * Mesaj/not içinde "arama" niyeti ve zaman ipucu tespiti
 * @param {string} text
 * @returns {{ hasIntent: boolean, suggestedDueDate: string, title: string }}
 */
export function detectCallIntent(text) {
    if (!text || text.length < 3) return { hasIntent: false, suggestedDueDate: '', title: '' };

    const CALL_PATTERNS = [
        /\baran\b/i, /\bara\b/i, /\baray/i, /\bbeni ara/i, /\bgeri ara/i,
        /\baradığ/i, /\barayacak/i, /\baramak/i, /\baranmak/i,
        /\bgörüş/i, /\bhatırlat/i, /\bulaş/i, /\btekrar ara/i,
        /\brandevu/i, /\barama/i, /\bcall/i,
    ];

    const hasIntent = CALL_PATTERNS.some(p => p.test(text));
    if (!hasIntent) return { hasIntent: false, suggestedDueDate: '', title: '' };

    // Zaman çıkarımı
    const now = new Date();
    let suggestedDueDate = '';

    const timePatterns = [
        // saat 14:30 veya 14.30
        { re: /saat\s*(\d{1,2})[:.:](\d{2})/i, fn: (m) => setTime(now, parseInt(m[1]), parseInt(m[2])) },
        // 14:30 veya 14.30 tek başına
        { re: /\b(\d{1,2})[:.:](\d{2})\b/, fn: (m) => setTime(now, parseInt(m[1]), parseInt(m[2])) },
        // yarın
        { re: /\byarın\b/i, fn: () => { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; } },
        // öğleden sonra
        { re: /\böğleden sonra\b|\böğle sonras/i, fn: () => setTime(now, 14, 0) },
        // öğle
        { re: /\böğle\b/i, fn: () => setTime(now, 12, 0) },
        // sabah
        { re: /\bsabah\b/i, fn: () => setTime(now, 9, 0) },
        // akşam
        { re: /\bakşam\b/i, fn: () => setTime(now, 18, 0) },
        // bu hafta
        { re: /\bbu hafta\b/i, fn: () => { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; } },
    ];

    for (const { re, fn } of timePatterns) {
        const m = text.match(re);
        if (m) {
            const dt = fn(m);
            if (dt) {
                suggestedDueDate = toLocalDateTimeInputValue(dt);
                break;
            }
        }
    }

    return {
        hasIntent: true,
        suggestedDueDate,
        title: text.substring(0, 80),
    };
}

function setTime(base, hours, minutes) {
    const d = new Date(base);
    d.setHours(hours, minutes, 0, 0);
    // Eğer geçmişte kaldıysa yarına at
    if (d < new Date()) d.setDate(d.getDate() + 1);
    return d;
}

function toLocalDateTimeInputValue(date) {
    // datetime-local input format: YYYY-MM-DDTHH:mm
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
