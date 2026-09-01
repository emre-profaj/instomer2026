import prisma from '../lib/prisma.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { emitToWorkspace } from '../socket.js';
import { assignToTeamMember } from './teamAssignment.service.js';
import { evaluateAndApplyRules } from './stageRuleEngine.service.js';

// =============================================
// EVRENSEL SINIFLANDIRICI SERVİSİ
// Her konuşmayı otomatik sınıflandırır ve
// yapılandırılmış veri çıkarır
// =============================================

// AI API key alma (workspace key > global key)
const getEffectiveAiApiKey = async (workspaceId) => {
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { aiApiKey: true }
    });
    if (workspace?.aiApiKey) return workspace.aiApiKey;

    const globalSettings = await prisma.globalSettings.findUnique({
        where: { id: 'singleton' }
    });
    return globalSettings?.globalAiApiKey || null;
};

// =============================================
// 1. SINIFLANDIR + VERİ ÇIKAR
// =============================================
export const classifyAndExtract = async (conversationId, messages, contact, channel, workspaceId) => {
    const defaultResult = {
        classification: 'GENEL',
        confidence: 0,
        extractedData: { name: null, phone: null, email: null, topic: null, preferredCallTime: null, requestedAction: null, requestedDate: null, branchInfo: null, budget: null, city: null, company: null, source: null },
        isQualifiedLead: false,
        marketingOptOut: false,
        matchedFunnelId: null,
        reasoning: 'Sınıflandırma yapılamadı'
    };

    try {
        const aiApiKey = await getEffectiveAiApiKey(workspaceId);
        if (!aiApiKey) {
            console.log('⚠️ [Classifier] API key bulunamadı, sınıflandırma atlanıyor');
            return defaultResult;
        }

        // Workspace akışlarını, stage'lerini ve giriş kriterlerini yükle
        const funnels = await prisma.funnel.findMany({
            where: { workspaceId },
            select: {
                id: true, name: true, icon: true, classificationCriteria: true,
                stages: { orderBy: { order: 'asc' }, select: { id: true, name: true } }
            }
        });

        // Konu kategorilerini ve ürünlerini yükle
        let topicCategories = [];
        try {
            topicCategories = await prisma.topicCategory.findMany({
                where: { workspaceId, isActive: true },
                select: { id: true, name: true, keywords: true, products: { where: { isActive: true }, select: { id: true, name: true, price: true, groupName: true } } }
            });
        } catch { /* Tablo yoksa veya hata varsa atla */ }
        const categoryMap = new Map(topicCategories.map(c => [c.id, c]));

        // Özel akış kriterlerini hazırla
        let customFunnelContext = '';
        if (funnels.length > 0) {
            customFunnelContext = '\n\n### MEVCUT AKIŞLAR ###\nAşağıdaki akışlar tanımlı. Konuşma en uygun akışın ID\'sini matchedFunnelId olarak MUTLAKA döndür.\n⚠️ "Genel" isimli akışı SADECE hiçbir kritere uymuyorsa döndür. Spesifik akışları tercih et.\n';
            for (const f of funnels) {
                const stageNames = f.stages?.map(s => s.name).join(', ') || '-';
                customFunnelContext += `\nAkış: "${f.name}" (ID: ${f.id}) | Aşamalar: [${stageNames}]`;
                if (f.classificationCriteria) {
                    try {
                        const criteria = typeof f.classificationCriteria === 'string'
                            ? JSON.parse(f.classificationCriteria)
                            : f.classificationCriteria;
                        if (typeof criteria === 'string') {
                            customFunnelContext += `\n  Giriş kriterleri: ${criteria}`;
                        } else if (criteria && typeof criteria === 'object') {
                            if (criteria.aiDescription) customFunnelContext += `\n  Giriş kriterleri: ${criteria.aiDescription}`;
                            else if (criteria.description) customFunnelContext += `\n  Giriş kriterleri: ${criteria.description}`;
                            if (criteria.keywords) customFunnelContext += `\n  Anahtar kelimeler: ${criteria.keywords}`;
                            // Sorumlu kategoriler — kategori isimlerini ve keywordlerini ekle
                            if (criteria.categoryIds && criteria.categoryIds.length > 0) {
                                const catNames = [];
                                const catKeywords = [];
                                for (const catId of criteria.categoryIds) {
                                    const cat = categoryMap.get(catId);
                                    if (cat) {
                                        catNames.push(cat.name);
                                        if (cat.keywords) {
                                            try {
                                                const kws = JSON.parse(cat.keywords);
                                                catKeywords.push(...kws);
                                            } catch {}
                                        }
                                    }
                                }
                                if (catNames.length > 0) {
                                    customFunnelContext += `\n  Sorumlu kategoriler: ${catNames.join(', ')}`;
                                }
                                if (catKeywords.length > 0) {
                                    customFunnelContext += `\n  Kategori anahtar kelimeleri: ${catKeywords.slice(0, 30).join(', ')}`;
                                }
                            }
                        }
                    } catch (e) {
                        customFunnelContext += `\n  Giriş kriterleri: ${f.classificationCriteria}`;
                    }
                }
                customFunnelContext += '\n';
            }
        }


        // Son 10 mesajı hazırla
        const recentMessages = (messages || []).slice(-10);
        const chatLog = recentMessages
            .filter(m => m.content?.trim())
            .map(m => `${m.isFromContact ? 'Müşteri' : 'Temsilci'}: ${m.content.trim()}`)
            .join('\n');

        if (!chatLog) return defaultResult;

        // Kişi bilgileri
        const contactInfo = contact
            ? `İsim: ${contact.name || 'Bilinmiyor'}, Telefon: ${contact.phone || 'Yok'}, E-posta: ${contact.email || 'Yok'}`
            : 'Kişi bilgisi yok';

        // Bugünün tarihi (Türkçe)
        const now = new Date();
        const turkishMonths = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
        const currentDate = `${now.getDate()} ${turkishMonths[now.getMonth()]} ${now.getFullYear()}`;

        const prompt = `Sen bir CRM sınıflandırma asistanısın. Aşağıdaki konuşmayı analiz et ve yapılandırılmış veri çıkar.

### BUGÜNÜN TARİHİ ###
${currentDate}

### KANAL ###
${channel || 'UNKNOWN'}

### KİŞİ BİLGİLERİ ###
${contactInfo}

### KONUŞMA ###
${chatLog}
${customFunnelContext}
${topicCategories.length > 0 ? `\n### KONU KATEGORİLERİ VE ÜRÜNLER ###\nAşağıdaki kategorilerden en uygun olanını seç. Kategori altındaki ürünlerden müşterinin ilgilendiği ürünleri de eşleştir:\n${topicCategories.map(c => {
    let kws = '';
    try { kws = c.keywords ? JSON.parse(c.keywords).join(', ') : ''; } catch {}
    let productList = '';
    if (c.products && c.products.length > 0) {
        productList = '\n  Ürünler: ' + c.products.map(p => `"${p.name}" (ID: ${p.id}, ${p.price > 0 ? p.price + ' TL' : 'Fiyat belirtilmemiş'}${p.groupName ? ', Grup: ' + p.groupName : ''})`).join(', ');
    }
    return `- "${c.name}" (ID: ${c.id})${kws ? ' → ' + kws : ''}${productList}`;
}).join('\n')}\n` : ''}

### GÖREV ###
1. Konuşmayı sınıflandır:
   - FIRSAT: Kişi BELİRLİ bir ürün/hizmete ilgi gösteriyor. Telefon paylaşması ŞART DEĞİL — belirli bir hizmet/ürün sorması yeterli. Örnekler: "doğum paketi hakkında bilgi", "implant fiyatı ne kadar", "2+1 daire bakıyorum", "check-up yaptırmak istiyorum", "fiyat ne kadar", bir form doldurmuş, lead gelmiş
   - RANDEVU: Kişi açıkça randevu/görüşme/muayene zamanı istiyor. Örnekler: "randevu almak istiyorum", "doktora ne zaman gelebilirim"
   - DESTEK: Mevcut müşteri sorunu, arıza, teknik destek talebi
   - IS_BASVURUSU: CV gönderen, iş arayan, pozisyon soran, staj başvurusu
   - SIKAYET: Şikayet, olumsuz geri bildirim, memnuniyetsizlik
   - GENEL: SADECE çok genel sorular — "merhaba", "sunduğunuz hizmetler neler?", "ne yapıyorsunuz?". Eğer kişi herhangi belirli bir hizmet/ürün soruyorsa FIRSAT yap!

   ⚠️ DİKKAT: "Hizmetleriniz neler?" gibi ÇOK GENEL sorular GENEL'dir. Ama "doğum paketi bilgisi", "implant fiyatı", "3+1 daire" gibi BELİRLİ hizmet soruları FIRSAT'tır — telefon paylaşması şart değil!

2. Yapılandırılmış veri çıkar:
   - name: Kişinin adı soyadı (konuşmada açıkça söylediyse. Platform adını KULLANMA, null yaz)
   - phone: Telefon numarası (konuşmada paylaştıysa. Yoksa null)
   - email: E-posta adresi (konuşmada paylaştıysa. Yoksa null)
   - topic: Konuşmanın ana konusu / ilgilenilen hizmet (kısa, 3-5 kelime)
   - preferredCallTime: Aranmak istediği zaman (örn: "12:00-15:00", "yarın öğleden sonra")
   - requestedAction: Kişi AÇIKÇA bir aksiyon talep ediyorsa set et, yoksa null.
     • CALL: "beni arayın", "aranmak istiyorum", "telefon numaramı bırakıyorum, beni arar mısınız" gibi NET aranma talebi
     • VISIT: "yerinize gelmek istiyorum", "ofise gelip bakabilir miyim", "showroom nerede" gibi NET ziyaret talebi
     • MEETING: "randevu almak istiyorum", "ne zaman görüşebiliriz", "müsait bir gün ayarlayalım" gibi NET görüşme/randevu talebi
     • null: Bilgi sorma ("fiyat ne?", "bilgi alabilir miyim?"), genel sorular, sadece ilgi gösterme
     ⚠️ DİKKAT: "Bilgi alabilir miyim?", "Detay verir misiniz?" gibi bilgi talepleri requestedAction DEĞİLDİR → null yaz! Sadece kişi açıkça aranmak, ziyaret etmek veya randevu almak istediğinde set et.
   - requestedDate: Talep edilen tarih (ISO format: "2026-06-05", null ise bugün)
   - branchInfo: Şube veya branş bilgisi (varsa)
   - budget: Bütçe/fiyat aralığı (konuşmada belirtildiyse, null yoksa)
   - city: Şehir/ilçe bilgisi (konuşmada geçtiyse)
   - company: Firma/şirket adı (konuşmada söylendiyse)
   - source: Nereden geldiği (örn: "Instagram reklamı", "arkadaş tavsiyesi" — konuşmada geçtiyse)

3. matchedFunnelId: ⚠️ ÖNEMLİ — Yukarıdaki MEVCUT AKIŞLAR bölümünden konuşmaya en uygun akışın ID'sini MUTLAKA yaz.
   ⚠️ KRİTİK ŞUBE KURALI: Şube bazlı akışları (örn: "Bornova Kadın", "Gaziemir Erkek") SADECE MÜŞTERİ o şubeyi açıkça belirtmişse veya sormuşsa eşleştir! Eğer müşteri henüz şube adı ("Bornova", "Gaziemir") söylememişse, botun/temsilcinin tek taraflı fiyat yazmış olması müşterinin tercihi sayılmaz → matchedFunnelId için null yaz (Genel kalsın).

4. topicCategoryId: Yukarıdaki KONU KATEGORİLERİ bölümünden konuşmaya en uygun kategorinin ID'sini yaz. Yoksa null.
5. matchedProductIds: Yukarıdaki ürünler bölümünden müşterinin ilgilendiği ürünlerin ID'lerini dizi olarak yaz. Konuşmada belirli bir ürün/hizmet geçiyorsa eşleştir. Yoksa boş dizi [].
6. marketingOptOut: Müşteri açıkça pazarlama/tanıtım mesajı almak istemediğini belirtiyorsa true. Örnekler: "bana yazmayın", "mesaj atmayın", "rahatsız etmeyin", "aranmak istemiyorum", "listeden çıkarın", "üyelikten çıkmak istiyorum". Normal konuşmalarda false.
SADECE JSON döndür, başka bir şey yazma:
{
  "classification": "FIRSAT",
  "confidence": 0.85,
  "extractedData": {
    "name": "Arzu Yılmaz",
    "phone": "+905324715163",
    "email": null,
    "topic": "2+1 Konut İlgisi",
    "preferredCallTime": "12:00-15:00",
    "requestedAction": "CALL",
    "requestedDate": null,
    "branchInfo": null,
    "budget": null,
    "city": null,
    "company": null,
    "source": null
  },
   "matchedFunnelId": null,
   "topicCategoryId": null,
   "matchedProductIds": [],
   "marketingOptOut": false,
   "reasoning": "Müşteri konut tipini belirterek bilgi talep ediyor, aranma zamanı vermiş - satış fırsatı"
}`;

        const genAI = new GoogleGenerativeAI(aiApiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-3.5-flash',
            generationConfig: { responseMimeType: 'application/json' }
        });

        const result = await model.generateContent(prompt);
        let responseText = result.response.text();
        responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

        // Safely extract JSON between first { and last }
        let jsonStr = responseText;
        const firstBrace = jsonStr.indexOf('{');
        const lastBrace = jsonStr.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
            jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
        }

        const parsed = JSON.parse(jsonStr);

        // Kategori ID doğrulaması (LLM halüsinasyonlarını engellemek için)
        if (parsed.topicCategoryId && !categoryMap.has(parsed.topicCategoryId)) {
            console.log(`⚠️ [Classifier] Geçersiz/Halüsinasyon topicCategoryId: ${parsed.topicCategoryId}, null yapıldı`);
            parsed.topicCategoryId = null;
        }

        // Lead kalifikasyonu: İsim + Telefon + Konu
        const ed = parsed.extractedData || {};
        const hasName = ed.name && ed.name !== 'null';
        const hasPhone = (ed.phone && ed.phone !== 'null') || !!(contact?.phone);
        const hasTopic = ed.topic && ed.topic !== 'null';
        parsed.isQualifiedLead = !!(hasName && hasPhone && hasTopic && (parsed.classification === 'FIRSAT' || parsed.classification === 'RANDEVU'));

        // Contact'tan telefon varsa extractedData'ya ekle
        if (!ed.phone && contact?.phone) {
            ed.phone = contact.phone;
        }
        if (!ed.name && contact?.name && contact.name !== 'Instagram Kullanıcısı') {
            ed.name = contact.name;
        }

        console.log(`🎯 [Classifier] ${conversationId}: ${parsed.classification} (${(parsed.confidence * 100).toFixed(0)}%) | Lead: ${parsed.isQualifiedLead} | Konu: ${ed.topic || '-'} | Kategori: ${parsed.topicCategoryId || '-'}`);

        // topicCategoryId yoksa ama topic varsa, keyword eşleştirme ile bul
        if (!parsed.topicCategoryId && ed.topic && topicCategories.length > 0) {
            const topicLower = (ed.topic || '').toLowerCase();
            for (const cat of topicCategories) {
                let kws = [];
                try { kws = cat.keywords ? JSON.parse(cat.keywords) : []; } catch {}
                const nameMatch = topicLower.includes(cat.name.toLowerCase());
                const kwMatch = kws.some(kw => topicLower.includes(kw.toLowerCase()));
                if (nameMatch || kwMatch) {
                    parsed.topicCategoryId = cat.id;

                    // AI ürün eşleştiremediyse, keyword ile bulunan kategorinin ürünleriyle dene
                    if ((!parsed.matchedProductIds || parsed.matchedProductIds.length === 0) && cat.products?.length > 0) {
                        const matchedByName = cat.products.filter(p =>
                            topicLower.includes(p.name.toLowerCase()) ||
                            p.name.toLowerCase().includes(topicLower)
                        );
                        if (matchedByName.length > 0) {
                            parsed.matchedProductIds = matchedByName.map(p => p.id);
                        }
                    }
                    break;
                }
            }
        }

        // matchedProductIds yoksa boş dizi yap
        if (!parsed.matchedProductIds) parsed.matchedProductIds = [];

        // 🎯 Deterministic Funnel Matcher: AI matchedFunnelId bulamadıysa veya emin olamadıysa
        if (!parsed.matchedFunnelId && funnels.length > 0) {
            // SADECE müşteriden gelen mesajları ve kişi adını baz al (Botun tek taraflı fiyat metinlerini değil!)
            const customerOnlyText = (messages || []).filter(m => m.isFromContact).map(m => m.content || '').join(' ') + ' ' + (contact?.name || '');
            const fallbackFunnelId = findBestMatchingFunnel(funnels, customerOnlyText);
            if (fallbackFunnelId) {
                parsed.matchedFunnelId = fallbackFunnelId;
                console.log(`🎯 [Classifier] Keyword/Criteria ile Akış Eşleşti: ${fallbackFunnelId}`);
            }
        }

        return parsed;
    } catch (error) {
        console.error('❌ [Classifier] Sınıflandırma hatası:', error.message);
        try {
            const customerOnlyText = (messages || []).filter(m => m.isFromContact).map(m => m.content || '').join(' ') + ' ' + (contact?.name || '');
            const fallbackFunnelId = findBestMatchingFunnel(funnels, customerOnlyText);
            if (fallbackFunnelId) {
                defaultResult.matchedFunnelId = fallbackFunnelId;
                defaultResult.classification = 'FIRSAT';
                defaultResult.isQualifiedLead = true;
                console.log(`🎯 [Classifier Catch Fallback] Akış Eşleşti: ${fallbackFunnelId}`);
            }
        } catch (_) {}
        return defaultResult;
    }
};

/**
 * Akış kriterleri ve isimlerine göre en uygun akış ID'sini bulur (Deterministic Matcher)
 */
export function findBestMatchingFunnel(funnels, searchText) {
    if (!funnels || funnels.length === 0 || !searchText) return null;
    const lower = searchText.toLowerCase();
    let bestFunnelId = null;
    let bestScore = 0;

    for (const f of funnels) {
        if (f.name === 'Genel' || f.name === 'Genel CRM') continue;
        let score = 0;

        // 1. Akış ismindeki her bir kelimeyi kontrol et (örn: "Bornova", "Erkek")
        const nameWords = f.name.toLowerCase().split(/[\s\-_/]+/).filter(w => w.length >= 2);
        let nameMatchCount = 0;
        for (const nw of nameWords) {
            if (lower.includes(nw)) {
                score += 4;
                nameMatchCount++;
            }
        }
        if (nameMatchCount === nameWords.length && nameWords.length > 1) {
            score += 15;
        }

        // 2. classificationCriteria kontrolü
        if (f.classificationCriteria) {
            let critText = '';
            try {
                const parsedCrit = typeof f.classificationCriteria === 'string' ? JSON.parse(f.classificationCriteria) : f.classificationCriteria;
                if (typeof parsedCrit === 'string') critText = parsedCrit;
                else if (parsedCrit && typeof parsedCrit === 'object') {
                    critText = [parsedCrit.aiDescription, parsedCrit.description, parsedCrit.keywords].filter(Boolean).join(' ');
                }
            } catch {
                critText = String(f.classificationCriteria);
            }

            if (critText) {
                const keywords = critText.toLowerCase().replace(/[.,;:]/g, ' ').split(/\s+/).filter(w => w.length >= 2 && !['içeriyorsa', 'içeren', 'olan', 'veya', 'varsa', 'kelimelerini', 'kelimesini', 'için', 'hakkında'].includes(w));
                let kwMatchCount = 0;
                for (const kw of keywords) {
                    if (lower.includes(kw)) {
                        score += 3;
                        kwMatchCount++;
                    }
                }
                if (kwMatchCount >= 2) {
                    score += 10;
                }
            }
        }

        if (score > bestScore && score >= 4) {
            bestScore = score;
            bestFunnelId = f.id;
        }
    }

    return bestFunnelId;
}

// =============================================
// 2. TRANSKRİPT ANALİZİ (Retell aramaları için)
// =============================================
export const analyzeTranscript = async (transcript, summary, workspaceId) => {
    const defaultResult = { requestedAction: null, requestedDate: null, rawRequest: null };

    try {
        if (!transcript) return defaultResult;

        const aiApiKey = await getEffectiveAiApiKey(workspaceId);
        if (!aiApiKey) return defaultResult;

        const now = new Date();
        const turkishMonths = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
        const currentDate = `${now.getDate()} ${turkishMonths[now.getMonth()]} ${now.getFullYear()}`;

        const prompt = `Bugün: ${currentDate}

Bu bir telefon görüşmesi transkriptidir. Analiz et:

### TRANSKRİPT ###
${typeof transcript === 'string' ? transcript.substring(0, 3000) : JSON.stringify(transcript).substring(0, 3000)}

### ÖZET ###
${summary || 'Yok'}

### GÖREV ###
Kişi aşağıdakilerden birini istiyor mu?

1. Tekrar aranmak (CALL) — "Beni yarın arayın", "Akşam tekrar arayın", "Sonra arar mısınız?"
2. Ziyaret edilmek (VISIT) — "Ofise gelin", "Yerinde görelim"
3. Görüşme planlamak (MEETING) — "Cumartesi görüşelim"
4. Yönetici/gerçek kişiyle konuşmak (HUMAN_TRANSFER) — "Yöneticinizle konuşmak istiyorum", "Gerçek birini bağlayın", "Müdürünüzü bağlar mısınız?", "Robot değil insanla konuşmak istiyorum"
5. Tekrar aramayın (null) — "İstemiyorum", "Tekrar aramayın"

SADECE JSON döndür:
{
  "requestedAction": "CALL | VISIT | MEETING | HUMAN_TRANSFER | null",
  "requestedDate": "ISO tarih string veya null",
  "rawRequest": "kişinin ilgili cümlesi veya null",
  "wantsHumanTransfer": true/false
}`;

        const genAI = new GoogleGenerativeAI(aiApiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-3.5-flash',
            generationConfig: { responseMimeType: 'application/json' }
        });

        const result = await model.generateContent(prompt);
        let responseText = result.response.text();
        responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

        // Safely extract JSON between first { and last }
        let jsonStr = responseText;
        const firstBrace = jsonStr.indexOf('{');
        const lastBrace = jsonStr.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
            jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
        }

        const parsed = JSON.parse(jsonStr);
        if (parsed.requestedAction && parsed.requestedAction !== 'null') {
            console.log(`🎯 [Transcript Analysis] Action: ${parsed.requestedAction}, Date: ${parsed.requestedDate}, Raw: "${parsed.rawRequest}"`);
        }

        return parsed;
    } catch (error) {
        console.error('❌ [Transcript Analysis] Hata:', error.message);
        return defaultResult;
    }
};

// =============================================
// 3. SINIFLANDIRMA AKSİYONLARI
// =============================================
export const executeClassificationActions = async (workspaceId, conversationId, contactId, classificationResult) => {
    try {
        const { classification, extractedData, matchedFunnelId, isQualifiedLead, matchedProductIds, topicCategoryId } = classificationResult;

        // Conversation'dan channel bilgisini al
        const convForChannel = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { channel: true } });
        const channel = convForChannel?.channel || 'UNKNOWN';

        // --- Kişi bilgilerini güncelle (SADECE kişisel bilgiler) ---
        // NOT: budget, source, city, company gibi talep bazlı veriler Contact'a yazılmaz!
        // Bunlar classificationData JSON'ında Conversation üzerinde kalır.
        // Çünkü bir kişi birden fazla taleple ilgilenebilir (her biri farklı bütçe/konu).
        if (extractedData) {
            const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { name: true, phone: true, email: true } });
            const updateData = {};
            if (extractedData.name && (!contact?.name || contact.name === 'Instagram Kullanıcısı' || contact.name === 'Web Kullanıcısı')) {
                updateData.name = extractedData.name;
                updateData.fullName = extractedData.name;
            }
            if (extractedData.phone && !contact?.phone) {
                updateData.phone = extractedData.phone;
            }
            if (extractedData.email && !contact?.email) {
                updateData.email = extractedData.email;
            }
            if (Object.keys(updateData).length > 0) {
                await prisma.contact.update({ where: { id: contactId }, data: updateData });
                console.log(`📝 [Classifier] Kişi bilgileri güncellendi: ${JSON.stringify(updateData)}`);
            }
        }

        // --- Marketing Opt-Out algılama ---
        if (classificationResult.marketingOptOut) {
            try {
                await prisma.contact.update({
                    where: { id: contactId },
                    data: { marketingOptOut: true, marketingOptOutAt: new Date() }
                });
                console.log(`🚫 [Classifier] Kişi pazarlama opt-out olarak işaretlendi (AI algıladı)`);
            } catch (optErr) {
                console.error('⚠️ [Classifier] Opt-out güncelleme hatası:', optErr.message);
            }
        }

        // --- GUARD: Manuel kilit kontrolü ---
        let skipFunnelAssignment = false;
        const contactRecord = await prisma.contact.findUnique({
            where: { id: contactId },
            select: { stageManuallySet: true }
        });
        if (contactRecord?.stageManuallySet) {
            console.log(`🛡️ [Classifier] Contact aşaması manuel olarak kilitlenmiş — akış/takım değişikliği yapılmıyor`);
            skipFunnelAssignment = true;
        }

        // --- Akış atama (skipFunnelAssignment false ise) ---
        // AI'ın matchedFunnelId'sini kullan (akışlardaki classificationCriteria'ya göre eşleşir)
        let targetFunnelId = skipFunnelAssignment ? null : matchedFunnelId;
        let targetStageId = null;

        // matchedFunnelId varsa → stage belirle
        if (targetFunnelId) {
            const funnel = await prisma.funnel.findUnique({
                where: { id: targetFunnelId },
                include: { stages: { orderBy: { order: 'asc' } } }
            });
            const isFormChannel = channel === 'FORM';
            const shouldGoToFirsat = isQualifiedLead || isFormChannel;

            if (funnel?.stages?.length > 0) {
                // Lead veya Form → qualifiedLeadStageId (Fırsat aşaması) varsa oraya at
                if (shouldGoToFirsat && funnel.qualifiedLeadStageId) {
                    const qualifiedStage = funnel.stages.find(s => s.id === funnel.qualifiedLeadStageId);
                    if (qualifiedStage) {
                        targetStageId = qualifiedStage.id;
                        console.log(`🎯 [Classifier] ${isFormChannel ? 'Form' : 'Lead'} → "${funnel.name}" / "${qualifiedStage.name}" (Fırsat aşaması)`);
                    } else {
                        // qualifiedLeadStageId artık geçersiz (silinmiş olabilir) → ilk stage'e fallback
                        targetStageId = funnel.stages[0].id;
                        console.log(`⚠️ [Classifier] qualifiedLeadStageId geçersiz → "${funnel.name}" / "${funnel.stages[0].name}" (fallback)`);
                    }
                } else {
                    // Normal mesaj → ilk stage
                    targetStageId = funnel.stages[0].id;
                    console.log(`📊 [Classifier] AI matchedFunnelId → "${funnel.name}" / "${funnel.stages[0].name}"`);
                }
            } else {
                console.log(`⚠️ [Classifier] matchedFunnelId=${targetFunnelId} ama stage yok — akış ataması yapılmıyor`);
                targetFunnelId = null;
            }
        }

        // --- FALLBACK: AI akışı eşleştiremedi ama Lead/Form → qualifiedLeadStageId olan akışı bul ---
        if (!targetFunnelId && !skipFunnelAssignment && (isQualifiedLead || channel === 'FORM')) {
            const qualifiedFunnel = await prisma.funnel.findFirst({
                where: { workspaceId, qualifiedLeadStageId: { not: null } },
                include: { stages: { orderBy: { order: 'asc' } } }
            });
            if (qualifiedFunnel?.stages?.length > 0) {
                targetFunnelId = qualifiedFunnel.id;
                const qualifiedStage = qualifiedFunnel.stages.find(s => s.id === qualifiedFunnel.qualifiedLeadStageId);
                if (qualifiedStage) {
                    targetStageId = qualifiedStage.id;
                    console.log(`🎯 [Classifier] Lead Fallback → "${qualifiedFunnel.name}" / "${qualifiedStage.name}" (qualifiedLeadStageId)`);
                } else {
                    targetStageId = qualifiedFunnel.stages[0].id;
                    console.log(`🎯 [Classifier] Lead Fallback → "${qualifiedFunnel.name}" / "${qualifiedFunnel.stages[0].name}" (ilk stage)`);
                }
            }
        }

        // Conversation'ı akışa ata
        if (targetFunnelId) {
            const conversation = await prisma.conversation.findUnique({
                where: { id: conversationId },
                select: { funnelType: true, funnelStageId: true }
            });

            const currentFunnelId = conversation?.funnelType;
            let shouldAssign = !currentFunnelId; // Henüz akışı yoksa ata

            // Farklı bir akış eşleştiyse ve manuel kilit yoksa → yeni akışa taşı
            if (currentFunnelId && currentFunnelId !== targetFunnelId) {
                if (!contactRecord?.stageManuallySet) {
                    shouldAssign = true;
                }
            }

            if (shouldAssign && targetStageId) {
                const { changeFunnelStage } = await import('./funnelStageManager.service.js');
                await changeFunnelStage(contactId, workspaceId, targetFunnelId, targetStageId, {
                    source: 'ai_classifier',
                    conversationId,
                    skipGuards: false
                });
                
                console.log(`📊 [Classifier] Akış atandı: ${targetFunnelId} / Stage: ${targetStageId}`);

                // Entry Rules ile en uygun aşamayı bul (classifier'ın seçtiği stage'den daha yüksek olabilir)
                try {
                    const ruleResult = await evaluateAndApplyRules(contactId, workspaceId, { funnelId: targetFunnelId });
                    if (ruleResult) {
                        console.log(`🎯 [Classifier+Rules] Entry rules ile aşama yükseltildi: ${ruleResult.stageName}`);
                    }
                } catch (ruleErr) {
                    console.error('⚠️ [Classifier] Entry rules hatası:', ruleErr.message);
                }

                // Socket ile UI güncelle
                try {
                    const { emitToWorkspace } = await import('../socket.js');
                    emitToWorkspace(workspaceId, 'funnel_stage_updated', {
                        conversationId,
                        contactId,
                        funnelType: targetFunnelId,
                        funnelStageId: targetStageId
                    });
                } catch (_) {}

                // Takım ve kişi atamaları changeFunnelStage içinde yapılıyor.
            } else {
                console.log(`ℹ️ [Classifier] Konuşma zaten "${currentFunnelId}" akışında`);
                
                // Konuşma zaten bir akışta → entry rules ile aşama yükseltmeyi dene
                if (currentFunnelId) {
                    try {
                        const ruleResult = await evaluateAndApplyRules(contactId, workspaceId, { funnelId: currentFunnelId });
                        if (ruleResult) {
                            console.log(`🎯 [Classifier+Rules] Mevcut akışta aşama yükseltildi: ${ruleResult.stageName}`);
                        }
                    } catch (ruleErr) {
                        console.error('⚠️ [Classifier] Entry rules stage yükseltme hatası:', ruleErr.message);
                    }
                }
            }
        }

        // --- Lead / Form → OPPORTUNITY olarak işaretle ---
        if (isQualifiedLead || channel === 'FORM') {
            try {
                await prisma.contact.update({
                    where: { id: contactId },
                    data: { category: 'OPPORTUNITY' }
                });
                console.log(`🏷️ [Classifier] Kişi OPPORTUNITY olarak işaretlendi`);
            } catch (_) {}

            // Telefonu olan lead/form → CALL aksiyonu enjekte et (createIntentActivity halledecek)
            if (!classificationResult.extractedData.requestedAction) {
                const contact = await prisma.contact.findUnique({
                    where: { id: contactId },
                    select: { phone: true }
                });
                if (contact?.phone) {
                    classificationResult.extractedData.requestedAction = 'CALL';
                    console.log(`📞 [Classifier] Telefonu olan lead → CALL aksiyonu enjekte edildi`);
                }
            }
        }

        // --- Case'İ tip, ürün ve kategori ile güncelle ---
        if (classification || matchedProductIds?.length > 0 || topicCategoryId) {
            try {
                let conv = await prisma.conversation.findUnique({
                    where: { id: conversationId },
                    select: { caseId: true }
                });

                // Case henüz yoksa oluştur (race condition fix)
                if (!conv?.caseId) {
                    const { ensureCaseForConversation } = await import('../controllers/case.controller.js');
                    const newCase = await ensureCaseForConversation(workspaceId, conversationId);
                    if (newCase) {
                        conv = { caseId: newCase.id };
                        console.log(`📦 [Classifier] Case otomatik oluşturuldu: ${newCase.caseNumber}`);
                    }
                }

                if (conv?.caseId) {
                    const caseUpdateData = {};

                    // Vaka tipini güncelle (FIRSAT, SIKAYET, RANDEVU, DESTEK, IS_BASVURUSU, GENEL)
                    if (classification) {
                        caseUpdateData.type = classification;
                    }

                    // Kategori eşleştirmesi
                    if (topicCategoryId) {
                        caseUpdateData.categoryId = topicCategoryId;
                    }

                    // Ürün eşleştirmesi — mevcut ürünlerle birleştir (duplicate olmasın)
                    if (matchedProductIds?.length > 0) {
                        const existingCase = await prisma.case.findUnique({
                            where: { id: conv.caseId },
                            select: { products: true }
                        });
                        let existingProducts = [];
                        try { existingProducts = JSON.parse(existingCase?.products || '[]'); } catch {}
                        const existingIds = new Set(existingProducts.map(p => p.productId));

                        // Yeni ürünleri ekle
                        for (const productId of matchedProductIds) {
                            if (!existingIds.has(productId)) {
                                const product = await prisma.product.findUnique({
                                    where: { id: productId },
                                    select: { name: true, price: true }
                                });
                                if (product) {
                                    existingProducts.push({
                                        productId,
                                        name: product.name,
                                        quantity: 1,
                                        unitPrice: product.price || 0
                                    });
                                }
                            }
                        }
                        caseUpdateData.products = JSON.stringify(existingProducts);
                    }

                    if (Object.keys(caseUpdateData).length > 0) {
                        await prisma.case.update({
                            where: { id: conv.caseId },
                            data: caseUpdateData
                        });
                        console.log(`📦 [Classifier] Case güncellendi: ${matchedProductIds?.length || 0} ürün, kategori: ${topicCategoryId || '-'}`);
                    }
                }
            } catch (caseErr) {
                console.error('⚠️ [Classifier] Case ürün güncelleme hatası:', caseErr.message);
            }
        }

        // WebSocket ile UI'ı güncelle
        try {
            emitToWorkspace(workspaceId, 'conversation_classified', {
                conversationId,
                classification,
                isQualifiedLead,
                extractedData
            });
        } catch (wsErr) { /* WebSocket hatası kritik değil */ }

        // --- Niyet algılama → Görev oluşturma (TEK MERKEZ) ---
        // createIntentActivity: CALL niyeti → triggerAutoCall, VISIT/MEETING → aktivite oluşturma
        try {
            const { createIntentActivity } = await import('./intentStage.service.js');
            await createIntentActivity(workspaceId, contactId, classificationResult, conversationId);
        } catch (intentErr) {
            console.warn(`⚠️ [Classifier] createIntentActivity hatası:`, intentErr.message);
        }

        console.log(`✅ [Classifier] Aksiyon tamamlandı: ${classification} | Lead: ${isQualifiedLead} | Funnel: ${targetFunnelId || 'N/A'}`);
    } catch (error) {
        console.error('❌ [Classifier] Aksiyon hatası:', error.message);
    }
};

// =============================================
// YARDIMCI FONKSİYONLAR (Türkiye saati UTC+3)
// =============================================

/**
 * Türkiye saatini döndürür (UTC+3)
 */
function getTurkeyNow() {
    const now = new Date();
    return new Date(now.getTime() + 3 * 60 * 60 * 1000);
}

/**
 * Türkiye saatine göre Date oluşturur (UTC olarak saklar)
 */
function createTurkeyDate(year, month, day, hour = 10, minute = 0) {
    return new Date(Date.UTC(year, month, day, hour - 3, minute, 0, 0));
}

/**
 * "12:00-15:00" veya "yarın" veya "2 hafta sonra" → Date
 */
function parsePreferredTime(timeStr) {
    const trNow = getTurkeyNow();
    if (!timeStr) return smartScheduleCall();

    const lower = timeStr.toLowerCase().trim();

    if (lower.includes('yarın') || lower.includes('yarin')) {
        return createTurkeyDate(trNow.getUTCFullYear(), trNow.getUTCMonth(), trNow.getUTCDate() + 1, 10, 0);
    }

    const dayMatch = lower.match(/(\d+)\s*(gün|gun)\s*sonra/);
    if (dayMatch) {
        return createTurkeyDate(trNow.getUTCFullYear(), trNow.getUTCMonth(), trNow.getUTCDate() + parseInt(dayMatch[1]), 10, 0);
    }

    const weekMatch = lower.match(/(\d+)\s*(hafta)\s*sonra/);
    if (weekMatch) {
        return createTurkeyDate(trNow.getUTCFullYear(), trNow.getUTCMonth(), trNow.getUTCDate() + parseInt(weekMatch[1]) * 7, 10, 0);
    }

    const timeMatch = lower.match(/(\d{1,2})[.:_-](\d{2})/);
    if (timeMatch) {
        const hour = parseInt(timeMatch[1]);
        const minute = parseInt(timeMatch[2]);
        let d = createTurkeyDate(trNow.getUTCFullYear(), trNow.getUTCMonth(), trNow.getUTCDate(), hour, minute);
        if (d <= new Date()) {
            d = createTurkeyDate(trNow.getUTCFullYear(), trNow.getUTCMonth(), trNow.getUTCDate() + 1, hour, minute);
        }
        return d;
    }

    const dayNames = { 'pazartesi': 1, 'salı': 2, 'sali': 2, 'çarşamba': 3, 'carsamba': 3, 'perşembe': 4, 'persembe': 4, 'cuma': 5, 'cumartesi': 6, 'pazar': 0 };
    for (const [dayName, dayNum] of Object.entries(dayNames)) {
        if (lower.includes(dayName)) {
            const currentDay = trNow.getUTCDay();
            let daysUntil = dayNum - currentDay;
            if (daysUntil <= 0) daysUntil += 7;
            return createTurkeyDate(trNow.getUTCFullYear(), trNow.getUTCMonth(), trNow.getUTCDate() + daysUntil, 10, 0);
        }
    }

    return smartScheduleCall();
}

/**
 * Akıllı arama planlaması (Türkiye saati):
 * İş saatleri içi (09-17) → 15 dk sonra
 * İş saatleri dışı → ertesi iş günü 09:15
 */
function smartScheduleCall() {
    const trNow = getTurkeyNow();
    const trHour = trNow.getUTCHours();

    if (trHour >= 9 && trHour < 17) {
        const d = new Date();
        d.setMinutes(d.getMinutes() + 15);
        return d;
    } else {
        return nextBusinessDay();
    }
}

/**
 * Sonraki iş günü 09:15 Türkiye saati
 */
function nextBusinessDay() {
    const trNow = getTurkeyNow();
    let dayOffset = 1;
    let d;
    do {
        d = createTurkeyDate(trNow.getUTCFullYear(), trNow.getUTCMonth(), trNow.getUTCDate() + dayOffset, 9, 15);
        dayOffset++;
    } while (d.getDay() === 0 || d.getDay() === 6);
    return d;
}

