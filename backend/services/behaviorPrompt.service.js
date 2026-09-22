/**
 * Behavior Prompt Service
 * ───────────────────────
 * Agent davranış bloklarına göre otomatik prompt üretir.
 * Müşteri prompt yazmaz — toggle'ları açıp kapar, bu servis
 * arka planda uygun talimat metnini oluşturur.
 *
 * Kullanım:
 *   import { buildBehaviorPrompt } from './behaviorPrompt.service.js';
 *   const behaviorText = buildBehaviorPrompt(bot, workspace);
 *   // → systemPrompt'a ekle
 */

// ── Varsayılan blok ayarları (yeni bot oluşturulduğunda) ──────────
export const DEFAULT_BLOCKS = {
    greeting: true,
    collectName: true,
    collectPhone: true,
    classifyNeeds: true,
    stageGoals: true,
    suggestProducts: false,
    shareLocation: true,
    admitUncertainty: true,
};

// ── Üslup prompt'ları ─────────────────────────────────────────────
const TONE_PROMPTS = {
    FRIENDLY_PRO: 'Sıcak, samimi ama profesyonel bir üslupla konuş. Müşteriye "siz" diye hitap et.',
    FORMAL: 'Resmi ve kurumsal bir dil kullan. Kısa, net cümleler kur. Müşteriye "siz" diye hitap et.',
    CASUAL: 'Samimi ve arkadaşça konuş. Müşteriye "sen" diyebilirsin. Rahat bir üslup kullan.',
    CONCISE: 'Minimum kelimeyle yanıt ver. Gereksiz sohbet yapma. Sadece bilgi ver, net ol.',
};

// ── Mesaj uzunluğu prompt'ları ─────────────────────────────────────
const LENGTH_PROMPTS = {
    SHORT: 'Yanıtların KISA olsun: 1-2 cümle, doğrudan bilgi ver.',
    NORMAL: 'Yanıtların orta uzunlukta olsun: 2-4 cümle, açıklayıcı ama öz.',
    DETAILED: 'Yanıtların detaylı olsun: konuyu açıkla, örnekler ver, bilgilendirici ol.',
};

// ── Sabit blok metinleri ───────────────────────────────────────────

const COLLECT_NAME_BLOCK = `📋 KİŞİSEL BİLGİ TOPLAMA:
Konuşma sırasında müşterinin adını ve soyadını öğren.
Doğrudan "Adınız nedir?" diye sorma; doğal akış içinde yakala.
Örneğin: "Görüşmemizde size nasıl hitap edebilirim?" veya "Adınızı öğrenebilir miyim?"
Müşteri adını zaten söylediyse tekrar sorma.`;

const COLLECT_PHONE_BLOCK = `📞 İLETİŞİM BİLGİSİ TOPLAMA:
Müşterinin telefon numarasını al.
"Sizi bilgilendirebilmemiz için bir telefon numarası paylaşır mısınız?" gibi doğal sor.
Numara geldiğinde 05XX formatını doğrula.
Müşteri numarasını zaten paylaştıysa tekrar isteme.
E-posta adresi de sorabilirsin ama zorunlu değil.`;

const STAGE_GOALS_BLOCK = `📈 AŞAMA BAZLI HEDEFLER:
Müşterinin bulunduğu huni aşamasına göre davran.
Her aşamadaki hedefi gerçekleştir ve müşteriyi bir sonraki aşamaya taşımaya çalış.
Aşama geçiş kriterleri sağlandığında aşamayı ilerlet.`;

const SUGGEST_PRODUCTS_BLOCK = `🛍️ AKTİF ÜRÜN/HİZMET ÖNERİSİ:
Müşterinin ihtiyacına göre proaktif olarak ürün veya hizmet öner.
Cross-sell ve upsell fırsatlarını değerlendir.
Örneğin: "Saç bakımı yanında cilt bakımı paketimiz de ilginizi çekebilir."
Ama baskıcı olma, doğal bir şekilde öner.`;

const ADMIT_UNCERTAINTY_BLOCK = `🤝 BİLMEDİĞİNDE İTİRAF ET:
Bilgi bankasında veya tanımlarında cevabı OLMAYAN bir soru geldiğinde:
- KESİNLİKLE bilgi uydurup cevap verme
- "Bu konuda size en doğru bilgiyi verebilmem için sizi hemen bir çalışma arkadaşımla buluşturmak istiyorum" de
- Yanıtının başına [HANDOFF] ekle`;

const APPOINTMENT_AUTO_BLOCK = `📅 RANDEVU YÖNETİMİ (OTOMATİK):
Müşteri randevu istediğinde:
1. Branş/hizmet türünü belirle
2. Uygun doktor/uzman listesini göster
3. Tarih ve saat seçtir
4. API üzerinden randevuyu otomatik oluştur
5. Onay mesajı gönder`;

const APPOINTMENT_REQUEST_BLOCK = `📅 RANDEVU TALEBİ TOPLAMA:
Müşteri randevu istediğinde:
1. Branş/hizmet türünü öğren
2. Tercih ettiği tarih ve saati sor
3. İletişim bilgilerini al
4. "Randevu talebinizi aldık, en kısa sürede size dönüş yapılacaktır" de
5. Talebi yetkiliye ilet`;

// ── Dinamik blok üreticileri (workspace verisine bağlı) ────────────

function greetingBlock(workspace) {
    const name = workspace?.companyName || workspace?.name || 'firmamız';
    return `👋 KARŞILAMA VE SELAMLAMA:
Müşteriyi ilk mesajda sıcak karşıla.
"Merhaba! ${name}'e hoş geldiniz. Size nasıl yardımcı olabilirim?" gibi samimi bir giriş yap.
Her konuşmada aynı kalıbı kullanma, doğal varyasyonlar üret.`;
}

function classifyBlock(categories) {
    if (!categories || categories.length === 0) {
        return `🏷️ İHTİYACI ANLA VE SINIFLANDIR:
Müşterinin ne istediğini anla ve uygun kategoriye eşle.
Eşleştirme yaptığında konuşmayı otomatik o kategoriye ata.`;
    }
    const catNames = categories.map(c => c.name).join(', ');
    return `🏷️ İHTİYACI ANLA VE SINIFLANDIR:
Müşterinin ne istediğini anla ve aşağıdaki kategorilerden birine eşle:
${catNames}
Eşleştirme yaptığında konuşmayı otomatik o kategoriye ata.
Müşterinin ihtiyacı net değilse soru sorarak anlamaya çalış.`;
}

function shareLocationBlock(branches) {
    if (!branches || branches.length === 0) {
        return `📍 KONUM VE ADRES PAYLAŞIMI:
Müşteri konum, adres veya nasıl geleceğini sorarsa şube bilgilerini paylaş.`;
    }
    const branchInfo = branches.map(b => {
        let info = `- ${b.name}`;
        if (b.address) info += `: ${b.address}`;
        if (b.phone) info += ` | Tel: ${b.phone}`;
        return info;
    }).join('\n');
    return `📍 KONUM VE ADRES PAYLAŞIMI:
Müşteri konum, adres veya nasıl geleceğini sorarsa aşağıdaki şube bilgilerini paylaş:
${branchInfo}`;
}

// ── Ana fonksiyon ──────────────────────────────────────────────────

/**
 * Bot'un davranış bloklarına göre prompt metni üretir.
 *
 * @param {Object} bot - AIBot kaydı (behaviorBlocks, tone, messageLength, emojiEnabled, multilingualEnabled, appointmentMode)
 * @param {Object} workspace - Workspace kaydı (companyName, name, defaultLanguage)
 * @param {Object} [context] - Ek bağlam: { categories: [], branches: [] }
 * @returns {string} Prompt metni
 */
export function buildBehaviorPrompt(bot, workspace, context = {}) {
    const blocks = bot?.behaviorBlocks || DEFAULT_BLOCKS;
    // JSON string'se parse et
    const b = typeof blocks === 'string' ? JSON.parse(blocks) : blocks;

    const parts = [];

    // ── Üslup ──
    parts.push(`🎯 ÜSLUP: ${TONE_PROMPTS[bot?.tone] || TONE_PROMPTS.FRIENDLY_PRO}`);

    // ── Mesaj uzunluğu ──
    parts.push(`📏 MESAJ UZUNLUĞU: ${LENGTH_PROMPTS[bot?.messageLength] || LENGTH_PROMPTS.NORMAL}`);

    // ── Emoji ──
    if (bot?.emojiEnabled === false) {
        parts.push('🚫 Emoji, sembol ve özel karakter KULLANMA. Düz metin yaz.');
    }

    // ── Dil ──
    const defaultLang = workspace?.defaultLanguage || 'tr-TR';
    const langName = defaultLang.startsWith('tr') ? 'Türkçe' :
                     defaultLang.startsWith('en') ? 'İngilizce' :
                     defaultLang.startsWith('de') ? 'Almanca' :
                     defaultLang.startsWith('fr') ? 'Fransızca' :
                     defaultLang.startsWith('ar') ? 'Arapça' : 'Türkçe';

    if (bot?.multilingualEnabled) {
        parts.push(`🌍 DİL: Varsayılan dilin ${langName}. Müşteri farklı bir dilde yazarsa o dilde yanıt ver. Dil geçişlerinde doğal ol.`);
    } else {
        parts.push(`🌍 DİL: Her zaman ${langName} yanıt ver.`);
    }

    // ── Davranış blokları ──
    if (b.greeting !== false) parts.push(greetingBlock(workspace));
    if (b.collectName !== false) parts.push(COLLECT_NAME_BLOCK);
    if (b.collectPhone !== false) parts.push(COLLECT_PHONE_BLOCK);
    if (b.classifyNeeds !== false) parts.push(classifyBlock(context.categories));
    if (b.stageGoals !== false) parts.push(STAGE_GOALS_BLOCK);
    if (b.suggestProducts === true) parts.push(SUGGEST_PRODUCTS_BLOCK);
    if (b.shareLocation !== false) parts.push(shareLocationBlock(context.branches));
    if (b.admitUncertainty !== false) parts.push(ADMIT_UNCERTAINTY_BLOCK);

    // ── Randevu modu ──
    if (bot?.appointmentMode === 'AUTO') parts.push(APPOINTMENT_AUTO_BLOCK);
    else if (bot?.appointmentMode === 'REQUEST') parts.push(APPOINTMENT_REQUEST_BLOCK);

    return parts.join('\n\n');
}

export default { buildBehaviorPrompt, DEFAULT_BLOCKS };
