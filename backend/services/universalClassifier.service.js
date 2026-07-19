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

        // Konu kategorilerini yükle
        let topicCategories = [];
        try {
            topicCategories = await prisma.topicCategory.findMany({
                where: { workspaceId, isActive: true },
                select: { id: true, name: true, keywords: true }
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
                        const criteria = JSON.parse(f.classificationCriteria);
                        if (criteria.keywords) customFunnelContext += `\n  Anahtar kelimeler: ${criteria.keywords}`;
                        if (criteria.aiDescription) customFunnelContext += `\n  Açıklama: ${criteria.aiDescription}`;
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
${topicCategories.length > 0 ? `\n### KONU KATEGORİLERİ ###\nAşağıdaki kategorilerden en uygun olanını seç:\n${topicCategories.map(c => {
    let kws = '';
    try { kws = c.keywords ? JSON.parse(c.keywords).join(', ') : ''; } catch {}
    return `- "${c.name}" (ID: ${c.id})${kws ? ' → ' + kws : ''}`;
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
   - requestedAction: CALL (aranmak istiyor), VISIT (ziyaret istiyor), MEETING (görüşme istiyor), null
   - requestedDate: Talep edilen tarih (ISO format: "2026-06-05", null ise bugün)
   - branchInfo: Şube veya branş bilgisi (varsa)
   - budget: Bütçe/fiyat aralığı (konuşmada belirtildiyse, null yoksa)
   - city: Şehir/ilçe bilgisi (konuşmada geçtiyse)
   - company: Firma/şirket adı (konuşmada söylendiyse)
   - source: Nereden geldiği (örn: "Instagram reklamı", "arkadaş tavsiyesi" — konuşmada geçtiyse)

3. matchedFunnelId: ⚠️ ÖNEMLİ — Yukarıdaki MEVCUT AKIŞLAR bölümünden konuşmaya en uygun akışın ID'sini MUTLAKA yaz. Hiçbirine uymuyorsa null yaz ama emin değilsen en yakın olanı seç.

4. topicCategoryId: Yukarıdaki KONU KATEGORİLERİ bölümünden konuşmaya en uygun kategorinin ID'sini yaz. Yoksa null.
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
  "reasoning": "Müşteri konut tipini belirterek bilgi talep ediyor, aranma zamanı vermiş - satış fırsatı"
}`;

        const genAI = new GoogleGenerativeAI(aiApiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: { responseMimeType: 'application/json' }
        });

        const result = await model.generateContent(prompt);
        let responseText = result.response.text();
        responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

        const parsed = JSON.parse(responseText);

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
                    break;
                }
            }
        }

        return parsed;
    } catch (error) {
        console.error('❌ [Classifier] Sınıflandırma hatası:', error.message);
        return defaultResult;
    }
};

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
Kişi tekrar aranmak, ziyaret edilmek veya görüşme planlamak istiyor mu?

Örnek cümleler:
- "Beni yarın arayın" → CALL, yarının tarihi
- "2 hafta sonra tekrar arayın" → CALL, 14 gün sonra
- "Ofise gelin göstereyim" → VISIT
- "Cumartesi müsaitim" → MEETING, bu cumartesi
- "Tekrar aramayın" → null (aksiyon yok)

SADECE JSON döndür:
{
  "requestedAction": "CALL | VISIT | MEETING | null",
  "requestedDate": "ISO tarih string veya null",
  "rawRequest": "kişinin ilgili cümlesi veya null"
}`;

        const genAI = new GoogleGenerativeAI(aiApiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: { responseMimeType: 'application/json' }
        });

        const result = await model.generateContent(prompt);
        let responseText = result.response.text();
        responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

        const parsed = JSON.parse(responseText);
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
        const { classification, extractedData, matchedFunnelId, isQualifiedLead } = classificationResult;

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

        // --- GUARD: Zaten atanmış konuşmaların akışını/takımını DEĞİŞTİRME ---
        let skipFunnelAssignment = false;
        // Eğer konuşma zaten bir akışta (Genel hariç) VE birine atanmışsa,
        // sadece contact data güncellendi, akış/takım ataması yapma.
        const existingConv = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { funnelType: true, assignedToId: true, assignedTeamId: true }
        });
        if (existingConv?.funnelType && (existingConv?.assignedToId || existingConv?.assignedTeamId)) {
            // "Genel" akışı mı kontrol et — Genel'deyse yeniden yönlendirilebilir
            let isGenel = false;
            try {
                const currentFunnel = await prisma.funnel.findUnique({
                    where: { id: existingConv.funnelType },
                    select: { name: true }
                });
                isGenel = currentFunnel && /^genel/i.test(currentFunnel.name);
            } catch (_) {}

            if (!isGenel) {
                console.log(`🛡️ [Classifier] Konuşma zaten akışta ve atanmış — akış/takım değişikliği yapılmıyor, aktivite kontrolü devam edecek`);
                skipFunnelAssignment = true;
            }
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
            if (funnel?.stages?.length > 0) {
                // isQualifiedLead + qualifiedLeadStageId varsa → oraya at
                if (isQualifiedLead && funnel.qualifiedLeadStageId) {
                    const qualifiedStage = funnel.stages.find(s => s.id === funnel.qualifiedLeadStageId);
                    if (qualifiedStage) {
                        targetStageId = qualifiedStage.id;
                        console.log(`🎯 [Classifier] Nitelikli Lead → "${funnel.name}" / "${qualifiedStage.name}" (qualifiedLeadStageId)`);
                    } else {
                        // qualifiedLeadStageId artık geçersiz (silinmiş olabilir) → ilk stage'e fallback
                        targetStageId = funnel.stages[0].id;
                        console.log(`⚠️ [Classifier] qualifiedLeadStageId geçersiz → "${funnel.name}" / "${funnel.stages[0].name}" (fallback)`);
                    }
                } else {
                    // Lead değil veya qualifiedLeadStageId yok → ilk stage
                    targetStageId = funnel.stages[0].id;
                    console.log(`📊 [Classifier] AI matchedFunnelId → "${funnel.name}" / "${funnel.stages[0].name}"`);
                }
            } else {
                console.log(`⚠️ [Classifier] matchedFunnelId=${targetFunnelId} ama stage yok — akış ataması yapılmıyor`);
                targetFunnelId = null;
            }
        }

        // --- FALLBACK: AI akışı eşleştiremedi ama isQualifiedLead → qualifiedLeadStageId olan akışı bul ---
        if (!targetFunnelId && !skipFunnelAssignment && isQualifiedLead) {
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

            // "Genel" akışındaysa → yeni akışa taşı
            if (currentFunnelId && currentFunnelId !== targetFunnelId) {
                try {
                    const currentFunnel = await prisma.funnel.findUnique({
                        where: { id: currentFunnelId },
                        select: { name: true }
                    });
                    if (currentFunnel && currentFunnel.name.toLowerCase().includes('genel')) {
                        shouldAssign = true;
                    }
                } catch (_) {}
            }

            if (shouldAssign && targetStageId) {
                await prisma.conversation.update({
                    where: { id: conversationId },
                    data: { funnelType: targetFunnelId, funnelStageId: targetStageId }
                });
                await prisma.contact.update({
                    where: { id: contactId },
                    data: { funnelType: targetFunnelId, funnelStageId: targetStageId }
                });
                
                // ── AUTO-SYNC: Update active cases associated with this contact/conversation ──
                try {
                    await prisma.case.updateMany({
                        where: {
                            contactId: contactId,
                            status: 'ACTIVE'
                        },
                        data: {
                            funnelType: targetFunnelId,
                            funnelStageId: targetStageId
                        }
                    });
                } catch (caseErr) {
                    console.error('⚠️ [Classifier] Active case funnel update hatası:', caseErr.message);
                }
                
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

                // Stage atamalarını uygula — ancak zaten birine atanmışsa kişi atamasını EZME
                if (targetStageId) {
                    const stage = await prisma.funnelStage.findUnique({
                        where: { id: targetStageId },
                        select: { assignedTeamId: true, assignedUserId: true, assignedBotId: true }
                    });

                    // Konuşma zaten birine atanmış mı kontrol et
                    const currentConv = await prisma.conversation.findUnique({
                        where: { id: conversationId },
                        select: { assignedToId: true, botEnabled: true }
                    });
                    const alreadyAssigned = !!currentConv?.assignedToId;

                    if (stage) {
                        const assignUpdate = {};
                        if (stage.assignedTeamId) {
                            assignUpdate.assignedTeamId = stage.assignedTeamId;
                            assignUpdate.teamIds = JSON.stringify([stage.assignedTeamId]);
                        }
                        // ⚠️ Kişi ataması: Konuşma zaten birine atanmışsa EZME!
                        if (stage.assignedUserId && !alreadyAssigned) {
                            assignUpdate.assignedToId = stage.assignedUserId;
                        }
                        if (stage.assignedBotId && !alreadyAssigned) {
                            assignUpdate.assignedBotId = stage.assignedBotId;
                            assignUpdate.botEnabled = true;
                        }
                        if (Object.keys(assignUpdate).length > 0) {
                            await prisma.conversation.update({ where: { id: conversationId }, data: assignUpdate });
                            console.log(`👥 [Classifier] Stage ekip/kişi atandı:`, assignUpdate, alreadyAssigned ? '(kişi atama korundu)' : '');
                        }
                        // 🛡️ DB'den güncel atama durumunu tekrar oku (yukardaki update assignedToId yazmış olabilir)
                        const freshConv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { assignedToId: true } });
                        const stillAssignedAfterUpdate = !!freshConv?.assignedToId;
                        if (stage.assignedTeamId && !stage.assignedUserId && !stillAssignedAfterUpdate) {
                            await assignToTeamMember(stage.assignedTeamId, conversationId);
                        }
                    }
                }

                // Funnel seviyesinde takım ataması (stage'de yoksa ve konuşma henüz atanmamışsa)
                if (!targetStageId || !(await prisma.funnelStage.findUnique({ where: { id: targetStageId }, select: { assignedTeamId: true } }))?.assignedTeamId) {
                    // alreadyAssigned yukarıda tanımlı — konuşma zaten birine atanmışsa kişi atamasını ezme
                    const convCheck2 = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { assignedToId: true } });
                    const stillAssigned = !!convCheck2?.assignedToId;

                    const funnel = await prisma.funnel.findUnique({
                        where: { id: targetFunnelId },
                        select: { assignedTeamId: true, assignedUserId: true }
                    });
                    if (funnel?.assignedTeamId) {
                        const funnelAssign = {
                            assignedTeamId: funnel.assignedTeamId,
                            teamIds: JSON.stringify([funnel.assignedTeamId])
                        };
                        // ⚠️ Kişi atamasını EZME
                        if (funnel.assignedUserId && !stillAssigned) {
                            funnelAssign.assignedToId = funnel.assignedUserId;
                        }
                        await prisma.conversation.update({ where: { id: conversationId }, data: funnelAssign });
                        console.log(`📂 [Classifier] Funnel takım atandı: ${funnel.assignedTeamId}`, stillAssigned ? '(kişi atama korundu)' : '');

                        if (!funnel.assignedUserId && !stillAssigned) {
                            await assignToTeamMember(funnel.assignedTeamId, conversationId);
                        }
                    } else if (funnel?.assignedUserId && !stillAssigned) {
                        await prisma.conversation.update({
                            where: { id: conversationId },
                            data: { assignedToId: funnel.assignedUserId }
                        });
                    }
                }

                // Socket ile ekip atamasını bildir
                try {
                    const updatedConv = await prisma.conversation.findUnique({
                        where: { id: conversationId },
                        select: { assignedToId: true, assignedTeamId: true, teamIds: true, botEnabled: true }
                    });
                    const { emitToWorkspace } = await import('../socket.js');
                    emitToWorkspace(workspaceId, 'conversation_assigned', {
                        conversationId,
                        assignedToId: updatedConv?.assignedToId || null,
                        teamIds: updatedConv?.teamIds || '[]',
                        botEnabled: updatedConv?.botEnabled || false
                    });
                } catch (_) {}
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

        // --- Telefon numarası varsa → Otomatik arama aktivitesi oluştur ---
        const contactPhone = extractedData?.phone || (await prisma.contact.findUnique({ where: { id: contactId }, select: { phone: true } }))?.phone;
        const hasPhoneForActivity = !!contactPhone;

        if (isQualifiedLead) {
            // Kalifiye Lead → Contact'ı OPPORTUNITY olarak işaretle (sadece category, status entry rules ile yönetilir)
            await prisma.contact.update({
                where: { id: contactId },
                data: {
                    category: 'OPPORTUNITY'
                }
            });

            // Aksiyon türüne göre aktivite oluştur
            const activityType = extractedData.requestedAction === 'VISIT' ? 'VISIT'
                : extractedData.requestedAction === 'MEETING' ? 'MEETING'
                : 'CALL';

            const dueDate = extractedData.requestedDate
                ? new Date(extractedData.requestedDate)
                : extractedData.preferredCallTime
                    ? parsePreferredTime(extractedData.preferredCallTime)
                    : smartScheduleCall();

            const title = `${extractedData.name || 'İsimsiz'} - ${extractedData.topic || 'Yeni Talep'}`;

            // Takımın round-robin ile atanacak kişisini bul
            let assignedToId = null;
            let teamId = null;

            if (targetStageId) {
                const stage = await prisma.funnelStage.findUnique({
                    where: { id: targetStageId },
                    select: { assignedTeamId: true, assignedUserId: true }
                });
                teamId = stage?.assignedTeamId;
                assignedToId = stage?.assignedUserId;

                // Round-robin: takım varsa sırayla ata
                if (teamId && !assignedToId) {
                    const team = await prisma.team.findUnique({
                        where: { id: teamId },
                        include: { members: { where: { userId: { not: null } }, select: { userId: true } } }
                    });
                    if (team && team.members.length > 0) {
                        const idx = team.roundRobinIndex % team.members.length;
                        assignedToId = team.members[idx].userId;
                        await prisma.team.update({
                            where: { id: teamId },
                            data: { roundRobinIndex: { increment: 1 } }
                        });
                    }
                }
            }

            // Duplicate check: aynı kişi + aynı tip + aynı gün
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);

            const existingActivity = await prisma.contactActivity.findFirst({
                where: {
                    workspaceId,
                    contactId,
                    type: activityType,
                    status: 'PLANNED',
                    dueDate: { gte: todayStart, lte: todayEnd }
                }
            });

            if (!existingActivity) {
                const activity = await prisma.contactActivity.create({
                    data: {
                        type: activityType,
                        status: 'PLANNED',
                        priority: 'NORMAL',
                        title,
                        description: [
                            extractedData.topic ? `📌 Konu: ${extractedData.topic}` : null,
                            extractedData.phone ? `📱 Numara: ${extractedData.phone}` : null,
                            extractedData.preferredCallTime ? `🕐 Tercih edilen zaman: ${extractedData.preferredCallTime}` : null,
                            `Kaynak: ${channel || 'UNKNOWN'}`,
                        ].filter(Boolean).join('\n'),
                        dueDate,
                        contactId,
                        workspaceId,
                        assignedToId,
                        teamId,
                        source: 'AUTOMATION'
                    }
                });
                console.log(`✅ [Classifier] Otomatik ${activityType} aktivitesi oluşturuldu: ${activity.id} | ${title}`);
            }
        }

        // --- Telefon varsa ama Lead değilse de arama planla ---
        if (!isQualifiedLead && hasPhoneForActivity) {
            const todayStart2 = new Date();
            todayStart2.setHours(0, 0, 0, 0);
            const todayEnd2 = new Date();
            todayEnd2.setHours(23, 59, 59, 999);

            const existingCall = await prisma.contactActivity.findFirst({
                where: {
                    workspaceId,
                    contactId,
                    type: 'CALL',
                    status: 'PLANNED',
                    dueDate: { gte: todayStart2, lte: todayEnd2 }
                }
            });

            if (!existingCall) {
                const callTitle = `${extractedData?.name || 'Müşteri'} - ${extractedData?.topic || classification || 'Geri Arama'}`;
                const callDueDate = smartScheduleCall();

                // Konuşmanın atandığı takım/kişiyi kullan
                let callAssignedToId = null;
                let callTeamId = null;
                try {
                    const convInfo = await prisma.conversation.findUnique({
                        where: { id: conversationId },
                        select: { assignedToId: true, assignedTeamId: true }
                    });
                    callAssignedToId = convInfo?.assignedToId || null;
                    callTeamId = convInfo?.assignedTeamId || null;
                } catch (_) {}

                await prisma.contactActivity.create({
                    data: {
                        type: 'CALL',
                        status: 'PLANNED',
                        priority: 'NORMAL',
                        title: callTitle,
                        description: [
                            extractedData?.topic ? `📌 Konu: ${extractedData.topic}` : null,
                            `📱 Numara: ${contactPhone}`,
                            `Kaynak: ${channel || 'UNKNOWN'}`,
                        ].filter(Boolean).join('\n'),
                        dueDate: callDueDate,
                        contactId,
                        workspaceId,
                        assignedToId: callAssignedToId,
                        teamId: callTeamId,
                        source: 'AUTOMATION'
                    }
                });
                console.log(`✅ [Classifier] Telefon mevcut → Otomatik CALL aktivitesi oluşturuldu: ${callTitle}`);
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

        // --- 📋 YAPILANDIRILMIŞ ONAY MESAJI ---
        // Bot aktifse onay mesajı gönderme (bot kendi yanıtını veriyor, duplicate olur)
        const convCheck = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { assignedBotId: true, botEnabled: true }
        });
        const botIsHandling = convCheck?.assignedBotId && convCheck?.botEnabled !== false;

        if (extractedData && !botIsHandling) {
            try {
                const ed = extractedData;

                // Sınıflandırmaya göre başlık ve emoji
                const templates = {
                    'FIRSAT': { emoji: '📋', header: 'Bilgilerinizi aldım, şu şekilde not ettim:', footer: 'Ekibimiz en kısa sürede sizinle iletişime geçecektir. 😊' },
                    'RANDEVU': { emoji: '📅', header: 'Randevu talebinizi aldım, şu şekilde not ettim:', footer: 'Randevu ekibimiz sizinle iletişime geçerek uygun zamanı belirleyecektir. 😊' },
                    'DESTEK': { emoji: '🛠️', header: 'Destek talebinizi aldım, şu şekilde kaydettim:', footer: 'Destek ekibimiz en kısa sürede sizinle ilgilenecektir. 🙏' },
                    'SIKAYET': { emoji: '📝', header: 'Şikayet kaydınızı aldım, şu şekilde not ettim:', footer: 'İlgili birim en kısa sürede konuyu değerlendirecektir. Anlayışınız için teşekkürler. 🙏' },
                    'IS_BASVURUSU': { emoji: '💼', header: 'İş başvurunuzu aldık, şu şekilde kaydettik:', footer: 'İnsan kaynakları ekibimiz başvurunuzu değerlendirecektir. Teşekkürler! 🤝' },
                    'GENEL': { emoji: '💬', header: 'Bilgilerinizi aldım:', footer: 'Talebinizi daha detaylı anlamak için ilgili ekibimiz sizi arayacaktır. 😊' }
                };

                const tpl = templates[classification];
                if (!tpl) return;

                const lines = [`${tpl.emoji} *${tpl.header}*`, ''];
                if (ed.name) lines.push(`👤 *İsim:* ${ed.name}`);
                if (ed.phone) lines.push(`📱 *Telefon:* ${ed.phone}`);
                if (ed.topic) lines.push(`📌 *Konu:* ${ed.topic}`);
                if (classification === 'FIRSAT' || classification === 'DESTEK' || classification === 'RANDEVU') {
                    lines.push(`🕐 *Geri Aranma:* ${ed.preferredCallTime || 'En kısa sürede'}`);
                }
                if (classification === 'RANDEVU' && ed.requestedDate) {
                    lines.push(`📆 *Tercih Edilen Tarih:* ${ed.requestedDate}`);
                }
                if (ed.branchInfo) lines.push(`🏢 *Şube:* ${ed.branchInfo}`);
                lines.push('');
                lines.push(tpl.footer);

                const confirmationText = lines.join('\n');

                const confirmMsg = await prisma.message.create({
                    data: {
                        content: confirmationText,
                        conversationId,
                        isFromContact: false
                    }
                });

                // Conversation lastMessageAt güncelle
                const updatedConv = await prisma.conversation.update({
                    where: { id: conversationId },
                    data: { lastMessageAt: new Date() },
                    include: { contact: true }
                });

                // Socket ile gönder (real-time görünsün)
                emitToWorkspace(workspaceId, 'new_message', {
                    workspaceId,
                    conversationId,
                    message: confirmMsg,
                    conversation: updatedConv,
                    contact: updatedConv.contact,
                    channel: updatedConv.channel
                });

                console.log(`📋 [Classifier] ${classification} onay mesajı gönderildi: ${conversationId}`);
            } catch (msgErr) {
                console.error('⚠️ [Classifier] Onay mesajı hatası:', msgErr.message);
            }
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

