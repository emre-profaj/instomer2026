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
    askBranch: true,         // Şube tercihi sor
    classifyNeeds: true,
    stageGoals: true,
    suggestProducts: false,
    shareLocation: true,
    admitUncertainty: true,
};

// Varsayılan blok sıralaması
export const DEFAULT_BLOCK_ORDER = [
    'greeting', 'collectName', 'collectPhone', 'askBranch',
    'classifyNeeds', 'stageGoals', 'suggestProducts',
    'shareLocation', 'admitUncertainty'
];

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

function askBranchBlock(branches) {
    if (!branches || branches.length === 0) {
        return `🏢 ŞUBE TERCİHİ SOR:
Müşteriye hangi şubeye gelmek istediğini sor.
"Hangi şubemize gelmek istersiniz?" gibi doğal bir şekilde sor.`;
    }
    const branchNames = branches.map(b => `- ${b.name}`).join('\n');
    return `🏢 ŞUBE TERCİHİ SOR:
Müşteriye hangi şubeye gelmek istediğini sor. Şubelerimiz:
${branchNames}
Müşteri bir şube seçtiğinde konuşmayı o şubeyle ilişkilendir.`;
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

    // ── Davranış blokları (sıralama destekli) ──
    const blockOrder = bot?.blockOrder || DEFAULT_BLOCK_ORDER;
    // JSON string'se parse et
    const order = typeof blockOrder === 'string' ? JSON.parse(blockOrder) : blockOrder;

    const BLOCK_GENERATORS = {
        greeting:          () => b.greeting !== false ? greetingBlock(workspace) : null,
        collectName:       () => b.collectName !== false ? COLLECT_NAME_BLOCK : null,
        collectPhone:      () => b.collectPhone !== false ? COLLECT_PHONE_BLOCK : null,
        askBranch:         () => b.askBranch !== false ? askBranchBlock(context.branches) : null,
        classifyNeeds:     () => b.classifyNeeds !== false ? classifyBlock(context.categories) : null,
        stageGoals:        () => b.stageGoals !== false ? STAGE_GOALS_BLOCK : null,
        suggestProducts:   () => b.suggestProducts === true ? SUGGEST_PRODUCTS_BLOCK : null,
        shareLocation:     () => b.shareLocation !== false ? shareLocationBlock(context.branches) : null,
        admitUncertainty:  () => b.admitUncertainty !== false ? ADMIT_UNCERTAINTY_BLOCK : null,
    };

    for (const key of order) {
        const gen = BLOCK_GENERATORS[key];
        if (gen) {
            const text = gen();
            if (text) parts.push(text);
        }
    }

    // ── Randevu modu ──
    if (bot?.appointmentMode === 'AUTO') parts.push(APPOINTMENT_AUTO_BLOCK);
    else if (bot?.appointmentMode === 'REQUEST') parts.push(APPOINTMENT_REQUEST_BLOCK);

    // ── Sınıflandırma pipeline ──
    if (context.classificationPipeline) {
        parts.push(context.classificationPipeline);
    }

    // ── Aşama bazlı veri toplama ──
    if (context.stageCollectPrompt) {
        parts.push(context.stageCollectPrompt);
    }

    return parts.join('\n\n');
}

// ── Katman 1: Sınıflandırma Pipeline Bloğu ──────────────────────────

/**
 * Sınıflandırma pipeline'ı için prompt bloğu üretir.
 * Bot, workspace'te tanımlı olan bilgileri (şube, kategori, ürün)
 * seçilen sırada toplar. Yoksa atlar, tekse otomatik atar.
 *
 * @param {Object} params
 * @param {Array} params.branches - Aktif şubeler [{ id, name }]
 * @param {Array} params.categories - Aktif kategoriler [{ id, name }]
 * @param {Array} params.products - Aktif ürün grupları [{ id, name }]
 * @param {Array|null} params.classificationOrder - Sıra: ["branch","category","product"], null = varsayılan
 * @param {Object} params.conversation - Mevcut konuşma bilgisi { branchId, topicCategoryId }
 * @returns {string|null} Prompt metni, pipeline aktif değilse null
 */
export function buildClassificationPipelineBlock({ branches = [], categories = [], products = [], classificationOrder = null, conversation = {} } = {}) {
    const order = classificationOrder || ['branch', 'category', 'product'];
    const steps = [];
    let stepNum = 0;

    for (const key of order) {
        switch (key) {
            case 'branch': {
                if (branches.length === 0) continue; // 0 → atla
                if (branches.length === 1) {
                    // 1 → otomatik, sorma
                    continue;
                }
                if (conversation?.branchId) {
                    const found = branches.find(b => b.id === conversation.branchId);
                    if (found) {
                        steps.push(`${++stepNum}. ŞUBE: ✅ Zaten belirlendi → ${found.name}. Tekrar sorma.`);
                        continue;
                    }
                }
                const branchList = branches.map(b => `   - ${b.name}`).join('\n');
                steps.push(`${++stepNum}. ŞUBE (${branches.length} şube, henüz bilinmiyor):\n${branchList}\n   → Müşterinin hangi şubeyle ilgilendiğini doğal şekilde sor.`);
                break;
            }
            case 'category': {
                if (categories.length === 0) continue;
                if (categories.length === 1) continue;
                if (conversation?.topicCategoryId) {
                    const found = categories.find(c => c.id === conversation.topicCategoryId);
                    if (found) {
                        steps.push(`${++stepNum}. KATEGORİ: ✅ Zaten belirlendi → ${found.name}. Tekrar sorma.`);
                        continue;
                    }
                }
                const catList = categories.map(c => `   - ${c.name}`).join('\n');
                steps.push(`${++stepNum}. KATEGORİ (${categories.length} kategori, henüz bilinmiyor):\n${catList}\n   → Müşterinin hangi hizmet/konu alanıyla ilgilendiğini anla veya sor.`);
                break;
            }
            case 'product': {
                if (products.length === 0) continue;
                if (products.length === 1) continue;
                // Ürün grubu genellikle kategori belirlenince daraltılır
                steps.push(`${++stepNum}. ÜRÜN/HİZMET (${products.length} ürün grubu):\n   → Kategori belirlendikten sonra müşterinin ilgilendiği hizmeti/ürünü anla.`);
                break;
            }
        }
    }

    if (steps.length === 0) return null;

    return `📋 SINIFLANDIRMA TALİMATI:
Müşterinin ihtiyacını anlamak için sırasıyla şu bilgileri topla:

${steps.join('\n\n')}

⚠️ Zaten bilinen bilgileri TEKRAR SORMA.
⚠️ Doğal akışta sor, robot gibi sıralama yapma. Müşteri konuyu açıyorsa akışa uy.
⚠️ Müşteri doğrudan bir hizmet/ürün soruyorsa şube/kategori sorusunu atla, direkt yardımcı ol.`;
}

// ── Katman 2: Aşama Bazlı Veri Toplama Bloğu ────────────────────────

// Hazır alan soru şablonları
export const FIELD_PROMPTS = {
    phone: 'Sizi bilgilendirebilmemiz için bir telefon numarası paylaşır mısınız?',
    name: 'Görüşmemizde size nasıl hitap edebilirim?',
    email: 'E-posta adresinizi alabilir miyim?',
    company: 'Hangi firma adına görüşüyoruz?',
    budget: 'Bütçe aralığınız hakkında bilgi verebilir misiniz?',
    preferredCallTime: 'Sizi ne zaman aramamızı istersiniz?',
    appointmentDate: 'Hangi tarih ve saati tercih edersiniz?',
    orderNumber: 'Sipariş veya takip numaranızı paylaşır mısınız?',
};

/**
 * Aşama bazlı veri toplama prompt bloğu üretir.
 * Bot, mevcut aşamanın collectFields'ına göre eksik bilgileri sorar.
 *
 * @param {Object} collectFieldsConfig - JSON: { fields: [...], onComplete: "..." }
 * @param {Object} collectedData - Zaten toplanan veriler { phone: "0532...", name: "Ali", ... }
 * @returns {string|null} Prompt metni, collectFields yoksa null
 */
export function buildStageCollectPrompt(collectFieldsConfig, collectedData = {}) {
    if (!collectFieldsConfig) return null;

    const config = typeof collectFieldsConfig === 'string'
        ? (() => { try { return JSON.parse(collectFieldsConfig); } catch { return null; } })()
        : collectFieldsConfig;

    if (!config?.fields || config.fields.length === 0) return null;

    const lines = [];
    let missingRequired = 0;
    let missingOptional = 0;

    for (const field of config.fields) {
        const value = collectedData[field.key];
        const prompt = field.prompt || FIELD_PROMPTS[field.key] || `${field.label} bilgisini sor`;

        if (value) {
            lines.push(` ✅ ${field.label}: "${value}" — zaten biliniyor, TEKRAR SORMA.`);
        } else if (field.required) {
            missingRequired++;
            lines.push(` ❌ ${field.label} (zorunlu) — '${prompt}'`);
        } else {
            missingOptional++;
            lines.push(` ⬜ ${field.label} (opsiyonel) — '${prompt}'`);
        }
    }

    // Tüm alanlar doluysa prompt gerekmez
    if (missingRequired === 0 && missingOptional === 0) return null;

    const completionAction = config.onComplete === 'advance_stage'
        ? 'Tüm zorunlu alanlar dolduğunda müşteriyi bir sonraki aşamaya taşı.'
        : config.onComplete === 'notify_team'
            ? 'Tüm zorunlu alanlar dolduğunda takıma bildirim gönderilecek.'
            : config.onComplete === 'mark_qualified'
                ? 'Tüm zorunlu alanlar dolduğunda müşteri sıcak lead olarak işaretlenecek.'
                : '';

    return `📋 BU AŞAMADA TOPLANACAK BİLGİLER:
${lines.join('\n')}

Kurallar:
- Önce zorunlu (❌) alanları topla, sonra opsiyonel (⬜) olanları sor.
- Doğal akışta sor, hepsini tek mesajda isteme.
- Müşteri farklı bir konu açarsa yardımcı ol, ama bilgi toplamaya devam et.
${completionAction ? `\n${completionAction}` : ''}`;
}

export default { buildBehaviorPrompt, buildClassificationPipelineBlock, buildStageCollectPrompt, DEFAULT_BLOCKS, FIELD_PROMPTS };
