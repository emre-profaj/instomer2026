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

// Robust JSON parsing with multi-stage fallback
function safeParseJson(text, fallback = null) {
    if (!text || typeof text !== 'string') return fallback;
    let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
        return JSON.parse(clean);
    } catch (_) {}

    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        const slice = clean.substring(firstBrace, lastBrace + 1);
        try {
            return JSON.parse(slice);
        } catch (_) {}
    }

    return fallback;
}

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
        matchedBranchId: null,
        topicCategoryId: null,
        matchedProductIds: [],
        matchedProductGroupId: null,
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

        // Şubeleri yükle (AI prompt'a verilecek)
        let branches = [];
        try {
            branches = await prisma.appointmentBranch.findMany({
                where: { workspaceId, isActive: true },
                select: { id: true, name: true, address: true }
            });
        } catch { /* Tablo yoksa atla */ }

        // Konu kategorilerini ve ürünlerini yükle (hiyerarşik: grup → ürün)
        let topicCategories = [];
        try {
            topicCategories = await prisma.topicCategory.findMany({
                where: { workspaceId, isActive: true },
                select: {
                    id: true, name: true, keywords: true, branchIds: true,
                    products: {
                        where: { isActive: true, parentId: null },
                        select: {
                            id: true, name: true, price: true, isGroup: true,
                            children: {
                                where: { isActive: true },
                                select: { id: true, name: true, price: true }
                            }
                        }
                    }
                }
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

        // Temsilci notları ve aktiviteleri — conversation'ın kişisinden al
        let activityLog = '';
        try {
            const conv = await prisma.conversation.findUnique({
                where: { id: conversationId },
                select: { contactId: true }
            });
            if (conv?.contactId) {
                const recentActivities = await prisma.contactActivity.findMany({
                    where: { 
                        contactId: conv.contactId, 
                        workspaceId
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 8,
                    select: { 
                        type: true, title: true, description: true, result: true,
                        status: true, dueDate: true, createdAt: true,
                        callSuccessful: true, callSentiment: true
                    }
                });
                if (recentActivities.length > 0) {
                    const typeLabels = { 
                        NOTE: '📝 Not', CALL: '📞 Arama', MEETING: '🤝 Toplantı', 
                        TASK: '✅ Görev', REMINDER: '🔔 Hatırlatıcı',
                        PROPOSAL: '📄 Teklif', ORDER: '🛒 Sipariş', 
                        INVOICE: '🧾 Fatura', PAYMENT: '💰 Ödeme'
                    };
                    activityLog = '\n\n### TEMSİLCİ NOTLARI VE AKTİVİTELER ###\n' +
                        recentActivities.reverse().map(a => {
                            let line = `${typeLabels[a.type] || a.type}: ${a.title || a.description || ''}`;
                            if (a.description && a.title) line += ` — ${a.description}`;
                            if (a.result) line += ` [Sonuç: ${a.result}]`;
                            if (a.status && a.status !== 'PLANNED') line += ` (${a.status})`;
                            if (a.dueDate) line += ` [Tarih: ${new Date(a.dueDate).toLocaleDateString('tr-TR')}]`;
                            if (a.callSuccessful !== null) line += a.callSuccessful ? ' ✅ Ulaşıldı' : ' ❌ Ulaşılamadı';
                            if (a.callSentiment) line += ` (${a.callSentiment})`;
                            return line;
                        }).join('\n');
                }

                // Randevular
                const appointments = await prisma.appointment.findMany({
                    where: { contactId: conv.contactId, workspaceId },
                    orderBy: { startTime: 'desc' },
                    take: 5,
                    select: { title: true, startTime: true, status: true, branch: true, procedure: true, doctorName: true, notes: true }
                });
                if (appointments.length > 0) {
                    const statusLabels = { SCHEDULED: '🟡 Planlandı', COMPLETED: '✅ Tamamlandı', CANCELLED: '❌ İptal', NO_SHOW: '⚠️ Gelmedi' };
                    activityLog += '\n\n### RANDEVULAR ###\n' +
                        appointments.reverse().map(a => {
                            let line = `📅 ${a.title} — ${new Date(a.startTime).toLocaleDateString('tr-TR')} ${new Date(a.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
                            line += ` ${statusLabels[a.status] || a.status}`;
                            if (a.branch) line += ` | Branş: ${a.branch}`;
                            if (a.procedure) line += ` | İşlem: ${a.procedure}`;
                            if (a.doctorName) line += ` | Dr. ${a.doctorName}`;
                            if (a.notes) line += ` | Not: ${a.notes}`;
                            return line;
                        }).join('\n');
                }
            }
        } catch (e) { console.warn('⚠️ [Classifier] Aktivite yükleme hatası:', e.message); }

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
${activityLog}
${customFunnelContext}
${branches.length > 0 ? `\n### ŞUBELER ###\nAşağıdaki şubelerden müşterinin ilgilendiği veya bahsettiği şubeyi eşleştir. Eğer müşteri şube belirtmemişse null yaz:\n${branches.map(b => `- "${b.name}" (ID: ${b.id})${b.address ? ' — ' + b.address : ''}`).join('\n')}\n` : ''}
${topicCategories.length > 0 ? `\n### KONU KATEGORİLERİ VE ÜRÜNLER ###\nAşağıdaki kategorilerden en uygun olanını seç. Kategori altındaki ürün grupları ve ürünlerden müşterinin ilgilendiği ürünleri de eşleştir:\n${topicCategories.map(c => {
    let kws = '';
    try { kws = c.keywords ? JSON.parse(c.keywords).join(', ') : ''; } catch {}
    let productList = '';
    if (c.products && c.products.length > 0) {
        productList = '\n' + c.products.map(p => {
            if (p.isGroup && p.children && p.children.length > 0) {
                const childList = p.children.map(ch => `      • "${ch.name}" (ID: ${ch.id}${ch.price > 0 ? ', ' + ch.price + ' TL' : ''})`).join('\n');
                return `    📁 Ürün Grubu: "${p.name}" (ID: ${p.id})\n${childList}`;
            }
            return `    • "${p.name}" (ID: ${p.id}${p.price > 0 ? ', ' + p.price + ' TL' : ''})`;
        }).join('\n');
    }
    let branchInfo = '';
    if (c.branchIds) {
        try {
            const bIds = JSON.parse(c.branchIds);
            const bNames = bIds.map(bid => branches.find(b => b.id === bid)?.name).filter(Boolean);
            if (bNames.length > 0) branchInfo = ` [Şubeler: ${bNames.join(', ')}]`;
        } catch {}
    }
    return `- "${c.name}" (ID: ${c.id})${branchInfo}${kws ? ' → ' + kws : ''}${productList}`;
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
   ⚠️ HİZMET ŞUBEYİ YENER: Müşteri bir hizmet/ürün soruyorsa, o hizmetin anahtar kelimesi hangi akışta tanımlıysa O AKIŞI seç — mesajda şube adı geçiyor olması bunu değiştirmez. Örnek: "bornova pilates fiyatı" → şube akışı DEĞİL, "pilates" anahtar kelimesinin tanımlı olduğu akış.
   ⚠️ ŞUBE AKIŞI İKİ BİLGİ İSTER: Adı hem şube hem cinsiyet içeren akışları (örn. "Bornova Kadın") ancak müşteri İKİSİNİ DE belli ettiyse seç. Sadece şube adı geçiyor ama cinsiyet belli değilse hiçbir şube akışını seçme → null yaz.

4. matchedBranchId: Yukarıdaki ŞUBELER bölümünden müşterinin açıkça bahsettiği veya ilgilendiği şubenin ID'sini yaz. Müşteri şube belirtmemişse null. Tek şube varsa ve müşteri konuyla ilgileniyorsa o şubeyi yaz.
5. topicCategoryId: Yukarıdaki KONU KATEGORİLERİ bölümünden konuşmaya en uygun kategorinin ID'sini yaz. Yoksa null.
6. matchedProductIds: Yukarıdaki ürünler bölümünden müşterinin ilgilendiği ürünlerin ID'lerini dizi olarak yaz. Ürün grubu DEĞİL, ürün ID'lerini yaz. Konuşmada belirli bir ürün/hizmet geçiyorsa eşleştir. Yoksa boş dizi [].
7. matchedProductGroupId: Müşterinin ilgilendiği ürün grubunun ID'si (📁 ile işaretli olanlar). Yoksa null.
8. marketingOptOut: Müşteri açıkça pazarlama/tanıtım mesajı almak istemediğini belirtiyorsa true. Örnekler: "bana yazmayın", "mesaj atmayın", "rahatsız etmeyin", "aranmak istemiyorum", "listeden çıkarın", "üyelikten çıkmak istiyorum". Normal konuşmalarda false.
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
   "matchedBranchId": null,
   "topicCategoryId": null,
   "matchedProductIds": [],
   "matchedProductGroupId": null,
   "marketingOptOut": false,
   "reasoning": "Müşteri konut tipini belirterek bilgi talep ediyor, aranma zamanı vermiş - satış fırsatı"
}`;

        const genAI = new GoogleGenerativeAI(aiApiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-3.5-flash',
            generationConfig: { responseMimeType: 'application/json' }
        });

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        
        let parsed = safeParseJson(responseText);
        if (!parsed) {
            console.warn('⚠️ [Classifier] JSON parse failed, using fallback empty result');
            parsed = { classification: 'DIGER', confidence: 0, extractedData: {} };
        }

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
// Kelimenin sonuna ek gelebilir ("bornovadan"), ama başına gelemez:
// düz includes() kullanılırsa "female" metni "male" kelimesini de eşleştirir.
function containsWord(text, word) {
    let i = text.indexOf(word);
    while (i !== -1) {
        const prev = i === 0 ? '' : text[i - 1];
        if (!prev || !/[\p{L}\p{N}]/u.test(prev)) return true;
        i = text.indexOf(word, i + 1);
    }
    return false;
}

export function findBestMatchingFunnel(funnels, searchText) {
    if (!funnels || funnels.length === 0 || !searchText) return null;
    const lower = searchText.toLowerCase();

    const candidates = [];
    for (const f of funnels) {
        if (f.name === 'Genel' || f.name === 'Genel CRM') continue;

        const nameWords = f.name.toLowerCase().split(/[\s\-_/]+/).filter(w => w.length >= 2);
        const matchedNameWords = nameWords.filter(w => containsWord(lower, w));

        let keywords = [];
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
                keywords = critText.toLowerCase().replace(/[.,;:]/g, ' ').split(/\s+/).filter(w => w.length >= 2 && !['içeriyorsa', 'içeren', 'olan', 'veya', 'varsa', 'kelimelerini', 'kelimesini', 'için', 'hakkında'].includes(w));
            }
        }
        const matchedKeywords = keywords.filter(kw => containsWord(lower, kw));

        candidates.push({
            id: f.id,
            fullNameMatch: nameWords.length > 1 && matchedNameWords.length === nameWords.length,
            signals: new Set([...matchedNameWords, ...matchedKeywords])
        });
    }

    // Birden fazla akışa uyan kelime o akışı seçtirmeye yetmez: "bornova" hem
    // "Bornova Erkek" hem "Bornova Kadın" demektir, tek başına ayırt etmez.
    const funnelsPerSignal = new Map();
    for (const c of candidates) {
        for (const s of c.signals) funnelsPerSignal.set(s, (funnelsPerSignal.get(s) || 0) + 1);
    }

    let bestFunnelId = null;
    let bestScore = 0;
    for (const c of candidates) {
        // Tek bir akışa özgü kelime ("pilates") akış adından gelen eşleşmeyi yener:
        // ad eşleşmesi sadece kimliktir, anahtar kelime kullanıcının yazdığı kuraldır.
        let score = c.fullNameMatch ? 15 : 0;
        let specificHits = 0;
        for (const s of c.signals) {
            if (funnelsPerSignal.get(s) === 1) {
                score += 20;
                specificHits++;
            } else {
                score += 1;
            }
        }
        if (!specificHits && !c.fullNameMatch && c.signals.size < 2) continue;

        if (score > bestScore) {
            bestScore = score;
            bestFunnelId = c.id;
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
        const responseText = result.response.text();
        const parsed = safeParseJson(responseText, defaultResult);

        if (parsed?.requestedAction && parsed.requestedAction !== 'null') {
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
        const { classification, extractedData, matchedFunnelId, isQualifiedLead, matchedProductIds, topicCategoryId, matchedBranchId, matchedProductGroupId } = classificationResult;

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

        // --- GUARD: Sahiplik kontrolü ---
        // Kimseye atanmamış → AI HEMEN müdahale (süre yok)
        // Birine atanmış + yazmış → AI GERİ ÇEKİLİR
        // Birine atanmış + yazmamış + süre dolmamış → AI BEKLİYOR
        // Birine atanmış + yazmamış + süre dolmuş → AI DEVRALIR
        let skipFunnelAssignment = false;
        
        const [contactRecord, conversationRecord] = await Promise.all([
            prisma.contact.findUnique({
                where: { id: contactId },
                select: { stageManuallySet: true }
            }),
            prisma.conversation.findUnique({
                where: { id: conversationId },
                // topicCategoryId de okunuyor: kategori genelde ilk mesajda
                // belirleniyor, sonraki turlarda AI kategori döndürmüyor.
                // Eskiden o turlarda kategori kuralı hiç çalışmıyordu.
                select: { assignedToId: true, assignedTeamId: true, assignedAt: true, updatedAt: true, topicCategoryId: true }
            })
        ]);
        
        // Manuel kilit her zaman geçerli
        if (contactRecord?.stageManuallySet) {
            console.log(`🛡️ [Classifier] Contact aşaması manuel kilitli — akış değiştirilmiyor`);
            skipFunnelAssignment = true;
        }
        
        if (!skipFunnelAssignment && conversationRecord?.assignedToId) {
            // Birine atanmış — yazdı mı?
            const agentMessageCount = await prisma.message.count({
                where: {
                    conversationId,
                    isFromContact: false,
                    senderId: conversationRecord.assignedToId
                }
            });
            
            if (agentMessageCount > 0) {
                // Agent aktif olarak ilgileniyor
                console.log(`🛡️ [Classifier] Agent ilgileniyor (${agentMessageCount} mesaj) — AI karışmıyor`);
                skipFunnelAssignment = true;
            } else {
                // Agent atanmış ama yazmamış — süre kontrolü
                const ws = await prisma.workspace.findUnique({
                    where: { id: workspaceId },
                    select: { aiFallbackDelayMinutes: true }
                });
                const fallbackMinutes = ws?.aiFallbackDelayMinutes || 5;
                const assignedAt = conversationRecord.assignedAt || conversationRecord.updatedAt;
                const minutesSinceAssign = assignedAt ? (Date.now() - new Date(assignedAt).getTime()) / 60000 : 999;
                
                if (minutesSinceAssign < fallbackMinutes) {
                    console.log(`⏳ [Classifier] Agent ${Math.round(minutesSinceAssign)}dk önce atandı, bekleniyor (limit: ${fallbackMinutes}dk)`);
                    skipFunnelAssignment = true;
                } else {
                    console.log(`⚠️ [Classifier] Agent ${Math.round(minutesSinceAssign)}dk'dır sessiz — AI devralıyor`);
                }
            }
        }
        // assignedToId yok → AI hemen müdahale, süre beklemiyor ✅

        // --- Konuşmanın etkin kategorisi ---
        // Bu turda AI kategori döndürmediyse konuşmada kayıtlı olan geçerli.
        const etkinKategoriId = topicCategoryId || conversationRecord?.topicCategoryId || null;

        /** Kategoriye bakan akış: önce kategori ekranındaki seçim, yoksa
         *  akış ekranındaki "Sorumlu Kategoriler" eşleşmesi. */
        const kategorininAkisi = async (kategoriId) => {
            if (!kategoriId) return null;
            const kat = await prisma.topicCategory.findUnique({
                where: { id: kategoriId },
                select: { defaultFunnelId: true }
            });
            if (kat?.defaultFunnelId) return kat.defaultFunnelId;

            const akislar = await prisma.funnel.findMany({
                where: { workspaceId },
                select: { id: true, classificationCriteria: true }
            });
            for (const f of akislar) {
                if (!f.classificationCriteria) continue;
                try {
                    const kriter = typeof f.classificationCriteria === 'string'
                        ? JSON.parse(f.classificationCriteria)
                        : f.classificationCriteria;
                    if (Array.isArray(kriter?.categoryIds) && kriter.categoryIds.includes(kategoriId)) return f.id;
                } catch (_) {}
            }
            return null;
        };

        // --- Akış atama (skipFunnelAssignment false ise) ---
        // Kategori bir akış söylüyorsa o geçerli; AI'ın eşleştirmesi ikinci
        // sırada. Müşteri "Bornova erkek" yazınca AI aynı isimli akışı
        // eşleştirip sohbeti oraya taşıyordu, kategorinin sorumlu akışı
        // yok sayılıyordu.
        const kategoriAkisiErken = skipFunnelAssignment ? null : await kategorininAkisi(etkinKategoriId);
        if (kategoriAkisiErken && kategoriAkisiErken !== matchedFunnelId) {
            console.log(`📊 [Classifier] Kategori akışı AI eşleşmesinin önüne geçti: ${kategoriAkisiErken}`);
        }
        let targetFunnelId = skipFunnelAssignment ? null : (kategoriAkisiErken || matchedFunnelId);
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

        /**
         * Kategori ya da şube netleştikten SONRA akışa taşır.
         *
         * Yukarıdaki akış ataması, kategori daha belli olmadan çalışıp
         * bitiyordu; aşağıdaki kategori/şube blokları yalnızca targetFunnelId
         * değişkenini değiştiriyor, o değişkeni sonrasında kimse okumuyordu.
         * Sonuç: "Fitness → Satış Akışı" ayarı hiç işlemiyor, sohbet AI'ın
         * ya da şubenin seçtiği akışta kalıyordu.
         */
        const akisaTasi = async (funnelId, etiket) => {
            if (!funnelId || skipFunnelAssignment) return false;
            if (contactRecord?.stageManuallySet) return false;

            const funnel = await prisma.funnel.findUnique({
                where: { id: funnelId },
                include: { stages: { orderBy: { order: 'asc' } } }
            });
            if (!funnel?.stages?.length) {
                console.log(`⚠️ [Classifier] ${etiket} akışında aşama yok — taşınmadı`);
                return false;
            }

            const simdiki = await prisma.conversation.findUnique({
                where: { id: conversationId },
                select: { funnelType: true }
            });
            if (simdiki?.funnelType === funnelId) return false;

            const firsatAsamasi = ((isQualifiedLead || channel === 'FORM') && funnel.qualifiedLeadStageId)
                ? funnel.stages.find(st => st.id === funnel.qualifiedLeadStageId)
                : null;
            const hedefAsama = firsatAsamasi || funnel.stages[0];

            const { changeFunnelStage } = await import('./funnelStageManager.service.js');
            await changeFunnelStage(contactId, workspaceId, funnelId, hedefAsama.id, {
                source: 'ai_classifier',
                conversationId,
                skipGuards: false
            });

            targetFunnelId = funnelId;
            targetStageId = hedefAsama.id;
            console.log(`📊 [Classifier] ${etiket} → akış "${funnel.name}" / "${hedefAsama.name}"`);

            try {
                emitToWorkspace(workspaceId, 'funnel_stage_updated', {
                    conversationId,
                    contactId,
                    funnelType: funnelId,
                    funnelStageId: hedefAsama.id
                });
            } catch (_) {}
            return true;
        };

        // --- Case'İ tip, şube, ürün ve kategori ile güncelle ---
        if (classification || matchedProductIds?.length > 0 || topicCategoryId || matchedBranchId) {
            try {
                let conv = await prisma.conversation.findUnique({
                    where: { id: conversationId },
                    select: { caseId: true, topicCategoryId: true, branchId: true }
                });

                // Case henüz yoksa oluştur (race condition fix)
                if (!conv?.caseId) {
                    const { ensureCaseForConversation } = await import('../controllers/case.controller.js');
                    const newCase = await ensureCaseForConversation(workspaceId, conversationId);
                    if (newCase) {
                        conv = { ...conv, caseId: newCase.id };
                        console.log(`📦 [Classifier] Case otomatik oluşturuldu: ${newCase.caseNumber}`);
                    }
                }

                // --- Conversation bilgilerini güncelle (topicCategoryId, branchId) ---
                const convUpdateData = {};
                // Müşteri önce şubeyi, sonra kategoriyi seçiyor; sohbet
                // ilerledikçe başka bir kategoriye de geçebiliyor. Eskiden ilk
                // yazılan kategori kilitleniyor, sonraki seçim yok sayılıyordu.
                const kategoriDegisti = !!topicCategoryId && topicCategoryId !== conv?.topicCategoryId;
                if (kategoriDegisti) {
                    convUpdateData.topicCategoryId = topicCategoryId;
                }
                let kategoriAkisiUygulandi = false;
                let kategoriTakimiAtandi = false;

                // --- ŞUBE EŞLEŞTİRME (bağımsız, kategori gerektirmez) ---
                let resolvedBranchId = null;
                try {
                    // 1. AI'ın matchedBranchId'si varsa doğrudan kullan
                    if (matchedBranchId) {
                        // Şubenin var olduğunu doğrula
                        const branchExists = await prisma.appointmentBranch.findFirst({
                            where: { id: matchedBranchId, workspaceId, isActive: true },
                            select: { id: true, name: true }
                        });
                        if (branchExists) {
                            resolvedBranchId = branchExists.id;
                            console.log(`📍 [Classifier] AI şube eşleştirdi: ${branchExists.name}`);
                        }
                    }

                    // 2. AI eşleştiremedi → fallback: metin eşleştirme
                    if (!resolvedBranchId) {
                        const allBranches = await prisma.appointmentBranch.findMany({
                            where: { workspaceId, isActive: true },
                            select: { id: true, name: true }
                        });

                        if (allBranches.length === 1) {
                            resolvedBranchId = allBranches[0].id;
                            console.log(`📍 [Classifier] Tek şube, otomatik atandı: ${allBranches[0].name}`);
                        } else if (allBranches.length > 1) {
                            // Metin eşleştirme: müşteri mesajları + AI'ın branchInfo çıktısı
                            const branchInfoText = (extractedData?.branchInfo || '').toLowerCase();
                            if (branchInfoText) {
                                for (const branch of allBranches) {
                                    if (branch.name && branchInfoText.includes(branch.name.toLowerCase())) {
                                        resolvedBranchId = branch.id;
                                        console.log(`📍 [Classifier] Şube metin eşleşti: ${branch.name}`);
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    if (resolvedBranchId && !conv?.branchId) {
                        convUpdateData.branchId = resolvedBranchId;
                    }
                } catch (branchErr) {
                    console.error('⚠️ [Classifier] Şube eşleştirme hatası:', branchErr.message);
                }

                // Conversation'ı güncelle
                if (Object.keys(convUpdateData).length > 0) {
                    await prisma.conversation.update({
                        where: { id: conversationId },
                        data: convUpdateData
                    });
                    console.log(`📝 [Classifier] Conversation güncellendi: ${JSON.stringify(convUpdateData)}`);
                }

                // --- Kategori'nin varsayılan takım/akış bilgisini kullan ---
                if (etkinKategoriId && !skipFunnelAssignment) {
                    try {
                        const category = await prisma.topicCategory.findUnique({
                            where: { id: etkinKategoriId },
                            select: { defaultTeamId: true, defaultFunnelId: true, name: true }
                        });

                        if (category) {
                            // Kategorinin akışı: önce kategori ekranındaki seçim,
                            // yoksa akış ekranındaki "Sorumlu Kategoriler" eşleşmesi.
                            // İkincisi eskiden yalnızca AI'a metin olarak veriliyordu,
                            // yani kesin değildi: Fitness sohbeti şube akışına düşüyordu.
                            const kategoriAkisi = kategoriAkisiErken || await kategorininAkisi(etkinKategoriId);

                            // Kategori bir akış söylüyorsa şube onu ezemez —
                            // taşıma gerekmese bile (zaten o akıştaysa) bayrak kalkıyor.
                            let akisTasindi = false;
                            if (kategoriAkisi) {
                                kategoriAkisiUygulandi = true;
                                akisTasindi = await akisaTasi(kategoriAkisi, `Kategori "${category.name}"`);
                            }

                            // Kategori sorumlu takımı → konuşmayı o takıma ver.
                            // Eskiden yalnızca assignedTeamId yazılıyordu: konuşma
                            // takıma düşüyor ama kimseye dağıtılmıyor, vakaya da
                            // yansımıyordu. assignToTeamMember takımın "Havuzdakilere
                            // ne yapılsın?" ayarını uyguluyor (havuzda beklet / sırayla
                            // dağıt / en az meşgul), mesai dışı üyeyi atlıyor ve
                            // atamayı vakaya da işliyor.
                            // Takım ataması kategoriden ÖNCE yapılmış olabilir (kanal
                            // kuralı ya da şube adımı). Kategori netleştiğinde doğru
                            // takıma geçmeli; yalnızca sohbetle bizzat ilgilenen bir
                            // temsilci varsa elinden alınmıyor.
                            const kisiyeAtanmis = !!conversationRecord?.assignedToId;
                            const takimGerekli = category.defaultTeamId
                                && !kisiyeAtanmis
                                && conversationRecord?.assignedTeamId !== category.defaultTeamId
                                && (kategoriDegisti || !conversationRecord?.assignedTeamId || akisTasindi);

                            if (takimGerekli) {
                                try {
                                    const { assignToTeamMember } = await import('./teamAssignment.service.js');
                                    const kime = await assignToTeamMember(category.defaultTeamId, conversationId);
                                    kategoriTakimiAtandi = true;
                                    console.log(`👥 [Classifier] Kategori "${category.name}" → takım atandı${kime ? ` (kişi: ${kime})` : ' (havuzda)'}`);
                                } catch (teamErr) {
                                    console.error('⚠️ [Classifier] Kategori takım ataması hatası:', teamErr.message);
                                }
                            }
                        }
                    } catch (catErr) {
                        console.error('⚠️ [Classifier] Kategori varsayılan değer hatası:', catErr.message);
                    }
                }

                // --- Şubenin varsayılan akış/takım bilgisini kullan ---
                if (resolvedBranchId && !skipFunnelAssignment) {
                    try {
                        const branch = await prisma.appointmentBranch.findUnique({
                            where: { id: resolvedBranchId },
                            select: { defaultFunnelId: true, defaultTeamId: true, name: true }
                        });

                        if (branch) {
                            // Şubenin akışı yalnızca kategori bir akış söylemediyse
                            // geçerli: kategori daha özgül bir bilgi.
                            if (branch.defaultFunnelId && !kategoriAkisiUygulandi && !targetFunnelId) {
                                await akisaTasi(branch.defaultFunnelId, `Şube "${branch.name}"`);
                            }

                            // Şube varsayılan takımı → conversation'a ata (atanmamışsa)
                            if (branch.defaultTeamId && !kategoriTakimiAtandi && !conversationRecord?.assignedTeamId) {
                                try {
                                    await prisma.conversation.update({
                                        where: { id: conversationId },
                                        data: { assignedTeamId: branch.defaultTeamId }
                                    });
                                    console.log(`👥 [Classifier] Şube "${branch.name}" varsayılan takım atandı`);
                                } catch (_) {}
                            }
                        }
                    } catch (branchErr) {
                        console.error('⚠️ [Classifier] Şube varsayılan değer hatası:', branchErr.message);
                    }
                }

                if (conv?.caseId) {
                    const caseUpdateData = {};

                    // Case başlığını konuşma konusundan güncelle (otomatik oluşturulan "Konu #xxx" ise)
                    if (extractedData?.topic && extractedData.topic !== 'null') {
                        const existingCase = await prisma.case.findUnique({
                            where: { id: conv.caseId },
                            select: { title: true }
                        });
                        if (existingCase?.title?.startsWith('Konu #') || existingCase?.title?.startsWith('Talep #')) {
                            caseUpdateData.title = extractedData.topic;
                        }
                    }

                    // Vaka tipini güncelle (FIRSAT, SIKAYET, RANDEVU, DESTEK, IS_BASVURUSU, GENEL)
                    if (classification) {
                        caseUpdateData.type = classification;
                    }

                    // Kategori eşleştirmesi
                    if (topicCategoryId) {
                        caseUpdateData.categoryId = topicCategoryId;
                    }

                    // Şube eşleştirmesi
                    if (resolvedBranchId) {
                        caseUpdateData.branchId = resolvedBranchId;
                    }

                    // Ürün eşleştirmesi — mevcut ürünlerle birleştir (duplicate olmasın)
                    // Günlükte GERÇEKTEN yazılan sayıyı raporluyoruz: eşleşen
                    // kimlik veritabanında bulunamazsa (ör. AI uydurduysa)
                    // ürün eklenmiyor, eski log yine "ürün=2" yazıp yanıltıyordu.
                    let yazilanUrun = 0;
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
                                    select: { name: true, price: true, parentId: true, parent: { select: { name: true } } }
                                });
                                if (product) {
                                    existingProducts.push({
                                        productId,
                                        name: product.name,
                                        groupName: product.parent?.name || null,
                                        quantity: 1,
                                        unitPrice: product.price || 0
                                    });
                                }
                            }
                        }
                        caseUpdateData.products = JSON.stringify(existingProducts);
                        yazilanUrun = existingProducts.length;
                    }

                    if (Object.keys(caseUpdateData).length > 0) {
                        await prisma.case.update({
                            where: { id: conv.caseId },
                            data: caseUpdateData
                        });
                        console.log(`📦 [Classifier] Case güncellendi: şube=${resolvedBranchId || '-'}, kategori=${topicCategoryId || '-'}, ürün=${yazilanUrun}/${matchedProductIds?.length || 0}${matchedProductGroupId ? ', grup=' + matchedProductGroupId : ''}`);
                    }
                }
            } catch (caseErr) {
                console.error('⚠️ [Classifier] Case güncelleme hatası:', caseErr.message);
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

