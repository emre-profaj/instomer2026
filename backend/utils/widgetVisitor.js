/**
 * Web widget ziyaretçi kimliği yardımcıları.
 *
 * Kimlik eskiden Contact.tags içinde saklanıyordu. İki sorun çıkardı:
 *   · Etiket süzgeci çöplendi — Metropol'de 163 gerçek etikete karşı 2.812
 *     tek kullanımlık ziyaretçi kimliği birikti.
 *   · Her widget mesajı `tags: { contains: visitorId }` ile indekssiz metin
 *     taraması yapıyordu; kişi sayısı büyüdükçe yavaşlıyor, üstelik alt dize
 *     eşleşmesi olduğu için yanlış kişiye bağlanma ihtimali taşıyordu.
 *
 * Artık kimlik Contact.widgetVisitorId kolonunda ve indeksli.
 * Eski kayıtlar için geriye dönük yol korunuyor: tags içinde bulunan kayıt
 * aynı anda yeni kolona taşınıyor (tembel göç), etiketten de temizleniyor.
 */
import prisma from '../lib/prisma.js';

/**
 * tags'ten YALNIZCA verilen ziyaretçi kimliğini çıkarır, diğer etiketlere dokunmaz.
 *
 * Ayrıştırılamayan bir değer gelirse ORİJİNALİ olduğu gibi döndürür. Boş dizi
 * döndürmek gerçek etiketleri silerdi: tags sütununda geçersiz JSON tutan
 * kayıtlar var ve kod tabanının geri kalanı bu durumda virgülle ayırmaya
 * düşüyor. Silmektense dokunmamak doğrusu.
 */
export function etiketlerdenCikar(raw, visitorId) {
    if (raw === null || raw === undefined) return raw;

    let liste = null;
    if (Array.isArray(raw)) {
        liste = raw;
    } else if (typeof raw === 'string') {
        try {
            const p = JSON.parse(raw || '[]');
            if (Array.isArray(p)) liste = p;
        } catch {
            liste = null;
        }
    }
    if (liste === null) return raw;   // anlayamadık → dokunma

    return JSON.stringify(liste.filter(t => !(typeof t === 'string' && t.trim() === visitorId)));
}

/**
 * Kolon veritabanında açıldı mı? Bir kez yoklanır, sonuç saklanır.
 *
 * Dağıtım sırası bağımsız olsun diye var: kod sunucuya `prisma db push`
 * çalıştırılmadan gitse bile widget çökmez, eski tags yoluna düşer.
 * Geri dönüş de bu sayede yalnızca dosyaları eski haline almaktan ibaret.
 */
let kolonVar = null;
export async function kolonDestekleniyorMu() {
    if (kolonVar !== null) return kolonVar;
    try {
        await prisma.contact.findFirst({
            where: { widgetVisitorId: '__yoklama__' },
            select: { id: true }
        });
        kolonVar = true;
    } catch {
        kolonVar = false;
        console.warn('⚠️ [WidgetVisitor] widgetVisitorId kolonu yok — eski tags yoluna düşülüyor. `npx prisma db push` çalıştırın.');
    }
    return kolonVar;
}

/** Kişi oluşturma/güncelleme verisine eklenecek alanlar (kolon yoksa boş). */
export async function ziyaretciAlanlari(visitorId) {
    if (!visitorId) return {};
    return (await kolonDestekleniyorMu()) ? { widgetVisitorId: visitorId } : {};
}

/**
 * Ziyaretçiyi kişi kaydıyla eşleştirir.
 * @param {object} temelWhere ek kısıtlar (workspaceId, isDeleted vb.)
 */
export async function ziyaretciKisiBul(temelWhere, visitorId) {
    if (!visitorId) return null;

    if (await kolonDestekleniyorMu()) {
        const yeni = await prisma.contact.findFirst({
            where: { ...temelWhere, widgetVisitorId: visitorId }
        });
        if (yeni) return yeni;
    }

    // Henüz taşınmamış eski kayıt
    const eski = await prisma.contact.findFirst({
        where: { ...temelWhere, tags: { contains: visitorId } }
    });
    if (!eski) return null;

    if (!(await kolonDestekleniyorMu())) return eski;

    try {
        return await prisma.contact.update({
            where: { id: eski.id },
            data: {
                widgetVisitorId: visitorId,
                tags: etiketlerdenCikar(eski.tags, visitorId)
            }
        });
    } catch (err) {
        console.warn('⚠️ [WidgetVisitor] Taşıma başarısız, eski kayıt kullanılıyor:', err.message);
        return eski;
    }
}
