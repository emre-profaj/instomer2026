/**
 * Telefon numarası normalizasyonu
 * 
 * Kurallar:
 * - Boşluk, tire, parantez gibi karakterleri temizle
 * - +XX ile başlıyorsa → zaten uluslararası, dokunma
 * - 0 ile başlayan 11 haneli → Türk numarası, 0'ı +90 ile değiştir
 * - 5 ile başlayan 10 haneli → Türk GSM, başına +90 ekle
 * - 90 ile başlayan 12 haneli → Başına + ekle
 * - Diğerleri → aynen bırak
 */
export function normalizePhone(phone) {
    if (!phone) return '';
    if (typeof phone !== 'string') phone = String(phone);

    // Boşluk, tire, parantez, nokta ve geçersiz parantez karakterlerini temizle
    const hasPlus = phone.trim().startsWith('+');
    let cleaned = phone.replace(/[\s\-\(\)\.\[\]\"\'\{\}]/g, '').trim();
    if (!cleaned) return '';

    const digits = cleaned.replace(/\D/g, '');
    if (digits.length < 7) {
        return '';
    }

    // Zaten + ile başlıyorsa → uluslararası (+ ve rakamlar)
    if (hasPlus || cleaned.startsWith('+')) {
        return '+' + digits;
    }

    // 00 ile başlıyorsa → uluslararası (00 → +)
    if (cleaned.startsWith('00')) {
        return '+' + digits.slice(2);
    }

    // 0 ile başlayan 11 haneli → Türk numarası (05XX → +905XX)
    if (cleaned.startsWith('0') && digits.length === 11) {
        return '+9' + digits;
    }

    // 5 ile başlayan 10 haneli → Türk GSM (5XX → +905XX)
    if (cleaned.startsWith('5') && digits.length === 10) {
        return '+90' + digits;
    }

    // 90 ile başlayan 12 haneli → +90 ekle
    if (cleaned.startsWith('90') && digits.length === 12) {
        return '+' + digits;
    }

    // Diğerleri → uluslararası format için başına + ekle
    return '+' + digits;
}

/**
 * JSON phones dizisini normalize et
 * phones alanı string olarak "[\"05xx\",\"05yy\"]" şeklinde saklanıyor
 */
export function normalizePhonesArray(phonesJson) {
    if (!phonesJson) return phonesJson;
    try {
        const arr = JSON.parse(phonesJson);
        if (!Array.isArray(arr)) return phonesJson;
        const normalized = arr.map(p => normalizePhone(p)).filter(Boolean);
        return JSON.stringify(normalized);
    } catch {
        return phonesJson;
    }
}
