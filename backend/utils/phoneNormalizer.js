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
    if (!phone) return phone;

    // Boşluk, tire, parantez, nokta temizle
    let cleaned = phone.replace(/[\s\-\(\)\.]/g, '').trim();

    // Zaten + ile başlıyorsa → uluslararası, dokunma
    if (cleaned.startsWith('+')) {
        return cleaned;
    }

    // 00 ile başlıyorsa → uluslararası (00 → +)
    if (cleaned.startsWith('00')) {
        return '+' + cleaned.slice(2);
    }

    // 0 ile başlayan 11 haneli → Türk numarası (05XX → +905XX)
    if (cleaned.startsWith('0') && cleaned.length === 11) {
        return '+9' + cleaned;
    }

    // 5 ile başlayan 10 haneli → Türk GSM (5XX → +905XX)
    if (cleaned.startsWith('5') && cleaned.length === 10) {
        return '+90' + cleaned;
    }

    // 90 ile başlayan 12 haneli → +90 ekle
    if (cleaned.startsWith('90') && cleaned.length === 12) {
        return '+' + cleaned;
    }

    // Diğerleri → aynen bırak
    return cleaned;
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
        const normalized = arr.map(p => normalizePhone(p));
        return JSON.stringify(normalized);
    } catch {
        return phonesJson;
    }
}
