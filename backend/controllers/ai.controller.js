import prisma from '../lib/prisma.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import multer from 'multer';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
import mammoth from 'mammoth';
import { getIO, emitToWorkspace } from '../socket.js';
import { checkAiUsageLimit, incrementAiUsage } from '../services/aiUsage.service.js';
import { isEmojiOrIconOnly } from '../utils/messageClassifier.js';
import { hasProfanity } from '../utils/profanityFilter.js';
import { normalizePhone } from '../utils/phoneNormalizer.js';
import { mergeContacts } from '../services/contactMerge.service.js';
import { generateCaseNumber } from './case.controller.js';
import { getSectorPrompt } from '../utils/sectorPrompt.js';
import { getBaseKnowledgeContext } from '../services/baseKnowledge.service.js';


// Lock to prevent duplicate AI replies for same conversation
const aiReplyLocks = new Set();
const aiReplyLockTimeout = 15000; // 15 seconds

const acquireAiReplyLock = (conversationId) => {
    if (aiReplyLocks.has(conversationId)) {
        return false;
    }
    aiReplyLocks.add(conversationId);
    setTimeout(() => aiReplyLocks.delete(conversationId), aiReplyLockTimeout);
    return true;
};

const releaseAiReplyLock = (conversationId) => {
    aiReplyLocks.delete(conversationId);
};

/**
 * Strips internal thinking, thought process, and CoT tokens from AI model output.
 * Prevents reasoning deliberations like "thought Now, write the final message..." or "<thought>...</thought>" from leaking to users.
 */
export function stripAiThinking(text) {
    if (!text || typeof text !== 'string') return '';
    let cleaned = text.trim();

    // 1. Remove XML/HTML thought tags: <thought>...</thought>, <think>...</think>, <reasoning>...</reasoning>, etc.
    cleaned = cleaned.replace(/<(thought|think|reasoning|internal_monologue|cot)[^>]*>[\s\S]*?<\/\1>/gi, '');

    // 2. Remove unclosed tags at the beginning: <thought>...
    cleaned = cleaned.replace(/^<(thought|think|reasoning|internal_monologue|cot)[^>]*>[\s\S]*?(?=\n\n|\n[A-ZÇĞİÖŞÜ]|$)/gi, '');

    // 3. Remove markdown fenced blocks: ```thought ... ``` or ```think ... ```
    cleaned = cleaned.replace(/```(?:thought|think|reasoning)[\s\S]*?```/gi, '');

    // 4. Remove bracketed blocks: [Thought: ...], [Thinking: ...]
    cleaned = cleaned.replace(/\[(?:thought|thinking|reasoning):?[\s\S]*?\]/gi, '');

    // 5. Remove prefix labels: "Thinking Process: ...", "Düşünce: ..."
    cleaned = cleaned.replace(/^(?:\*{0,2}(?:Thinking Process|Düşünce Süreci|İç Düşünce|Internal Monologue|Reasoning)\*{0,2}:?[\s\S]*?)(?=\n\n|\n(?=[A-ZÇĞİÖŞÜ])|$)/gi, '');

    // 6. Remove plain "thought ..." stream (Gemini/DeepSeek CoT output leaking into text)
    // E.g. "thought Now, write the final message. Wait, Rule 10 says... Tabii ki, ..."
    if (/^thought\b/i.test(cleaned)) {
        // If there is a double newline after the thought block, take what comes after
        const parts = cleaned.split(/\n\s*\n/);
        if (parts.length > 1) {
            const validPart = parts.find(p => !/^thought\b/i.test(p.trim()));
            if (validPart) {
                cleaned = parts.slice(parts.indexOf(validPart)).join('\n\n');
            }
        }
        
        // If still starts with "thought", look for common Turkish greeting/response starters or quotes
        if (/^thought\b/i.test(cleaned)) {
            const match = cleaned.match(/(?:Tabii|Merhaba|Selam|Değerli|Sayın|İyi günler|İyi akşamlar|Günaydın|Size|Evet|Hayır|Anladım|Bilgi|Randevu|Görüşmek|Talebiniz|İletişim|Harika|Memnuniyetle|Rica ederim|Öncelikle|Şu an|Bizimle|Hoş geldiniz)[^]*$/i);
            if (match) {
                cleaned = match[0];
            } else {
                cleaned = cleaned.replace(/^thought\s+/i, '');
            }
        }
    }

    return cleaned.trim();
}

// ─── DYNAMIC HEALTH CONTEXT CACHE (Probel branş + doktor listesi) ───────────
// Workspace başına 1 saat cache'lenir. Sadece Probel bağlantısı olan workspace'ler için çalışır.
const healthContextCache = new Map(); // key: workspaceId, value: { data, expiry }
const HEALTH_CACHE_TTL = 60 * 60 * 1000; // 1 saat

async function getDynamicHealthContext(workspaceId) {
    // Cache kontrolü
    const cached = healthContextCache.get(workspaceId);
    if (cached && cached.expiry > Date.now()) {
        console.log(`🏥 [HealthContext] Cache hit for workspace ${workspaceId} (${cached.data.length} chars)`);
        return cached.data;
    }

    try {
        const { getBranches, getDoctors } = await import('../services/probel_appointment.service.js');

        // 1) Tüm branşları çek
        const branchResult = await getBranches(workspaceId);
        if (!branchResult.success || !branchResult.branches?.length) {
            console.warn(`⚠️ [HealthContext] No branches found for workspace ${workspaceId}`);
            return null;
        }

        // 2) Her branş için doktorları çek (parallel)
        const branchDoctorPairs = await Promise.all(
            branchResult.branches.map(async (branch) => {
                try {
                    const docResult = await getDoctors(workspaceId, branch.brans_kodu);
                    const doctors = docResult.success && docResult.doctors?.length
                        ? docResult.doctors.map(d => d.doktor_adi).join(', ')
                        : 'Doktor bilgisi yok';
                    return `📋 ${branch.brans_adi}: ${doctors}`;
                } catch (e) {
                    return `📋 ${branch.brans_adi}: (doktor bilgisi alınamadı)`;
                }
            })
        );

        const contextText = `\n=== 🏥 HASTANE BRANŞ VE DOKTOR LİSTESİ ===\nAşağıda hastanenin tüm branşları ve her branştaki doktorlar listelenmiştir.\nMüşteri bir doktor adı sorduğunda bu listeden bulup hangi branşta olduğunu söyle.\nEğer müşteri randevu almak isterse, randevu sürecine yönlendir.\n\n${branchDoctorPairs.join('\n')}\n=== HASTANE LİSTESİ SONU ===`;

        // Cache'e yaz
        healthContextCache.set(workspaceId, { data: contextText, expiry: Date.now() + HEALTH_CACHE_TTL });
        console.log(`🏥 [HealthContext] Fetched & cached for workspace ${workspaceId}: ${branchResult.branches.length} branches, ${contextText.length} chars`);

        return contextText;
    } catch (error) {
        console.error(`❌ [HealthContext] Error fetching health context for workspace ${workspaceId}:`, error.message);
        return null;
    }
}

// Helper to get effective AI API key (workspace key > global key)
const getEffectiveAiApiKey = async (workspaceId) => {
    // 1. Check workspace's own key first
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { aiApiKey: true }
    });

    if (workspace?.aiApiKey) {
        console.log(`🔑 [AI] Using workspace-specific API key for workspace ${workspaceId}`);
        return workspace.aiApiKey;
    }

    // 2. Fallback to global settings
    const globalSettings = await prisma.globalSettings.findUnique({
        where: { id: 'singleton' }
    });

    if (globalSettings?.globalAiApiKey) {
        console.log(`🌐 [AI] Using global API key for workspace ${workspaceId}`);
        return globalSettings.globalAiApiKey;
    }

    console.log(`❌ [AI] No API key configured for workspace ${workspaceId}`);
    return null;
};

// Helper to get effective AI model (workspace model > company model > default)
const getEffectiveAiModel = async (workspaceId) => {
    try {
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { aiModel: true, company: { select: { aiModel: true } } }
        });
        const model = workspace?.aiModel || workspace?.company?.aiModel || 'gemini-2.5-flash';
        return model;
    } catch {
        return 'gemini-2.5-flash';
    }
};

// Configure Multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
}).single('file');

export const uploadBotDocument = (req, res) => {
    upload(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });

        try {
            const { botId } = req.params;
            const file = req.file;

            if (!file) return res.status(400).json({ error: 'No file uploaded' });

            let textContent = '';

            if (file.mimetype === 'application/pdf') {
                const data = await pdf(file.buffer);
                textContent = data.text;
            } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                const result = await mammoth.extractRawText({ buffer: file.buffer });
                textContent = result.value;
            } else {
                return res.status(400).json({ error: 'Unsupported file type. Only PDF and DOCX are allowed.' });
            }

            // Cleanup text (optional)
            textContent = textContent.replace(/\s+/g, ' ').trim();

            const doc = await prisma.aIBotDocument.create({
                data: {
                    botId,
                    filename: file.originalname,
                    content: textContent,
                    fileType: file.mimetype.split('/')[1]
                }
            });

            res.status(201).json({ document: doc });
        } catch (error) {
            console.error('Upload document error:', error);
            res.status(500).json({ error: 'Failed to process document' });
        }
    });
};

export const getBotDocuments = async (req, res) => {
    try {
        const { workspaceId, botId } = req.params;

        // Verify bot belongs to this workspace
        const bot = await prisma.aIBot.findFirst({ where: { id: botId, workspaceId } });
        if (!bot) {
            return res.status(404).json({ error: 'Bot not found' });
        }

        const documents = await prisma.aIBotDocument.findMany({
            where: { botId },
            select: { id: true, filename: true, createdAt: true, fileType: true } // Don't return full content
        });
        res.json({ documents });
    } catch (error) {
        console.error('Get documents error:', error);
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
};

export const deleteBotDocument = async (req, res) => {
    try {
        const { workspaceId, docId } = req.params;

        // Verify document's bot belongs to this workspace
        const doc = await prisma.aIBotDocument.findUnique({
            where: { id: docId },
            include: { bot: { select: { workspaceId: true } } }
        });

        if (!doc || doc.bot.workspaceId !== workspaceId) {
            return res.status(404).json({ error: 'Document not found' });
        }

        await prisma.aIBotDocument.delete({ where: { id: docId } });
        res.json({ message: 'Document deleted' });
    } catch (error) {
        console.error('Delete document error:', error);
        res.status(500).json({ error: 'Failed to delete document' });
    }
};

// Helper function to get workspace knowledge base context
const getWorkspaceKnowledgeContext = async (workspaceId) => {
    try {
        const baseContext = await getBaseKnowledgeContext(workspaceId);
        return baseContext?.text || "";
    } catch (error) {
        console.error('Error getting workspace knowledge context:', error);
        return "";
    }
};

export const generateResponse = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { conversationId, botId } = req.body;

        // 1. Get API Key (workspace key > global key)
        const aiApiKey = await getEffectiveAiApiKey(workspaceId);
        if (!aiApiKey) {
            return res.status(400).json({ error: 'AI API Key not configured' });
        }

        // 2. Get Context (Messages + Contact Info)
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: {
                messages: {
                    take: 40,
                    orderBy: { createdAt: 'desc' },
                    select: { content: true, isFromContact: true }
                },
                contact: {
                    select: { name: true, email: true, phone: true }
                }
            }
        });

        if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

        // 3. Get Bot + Documents + Workspace Knowledge Base
        let systemPrompt = "You are a helpful customer support assistant. Reply in Turkish.";
        let documentContext = "";

        // Get workspace-level knowledge base (company info + knowledge entries) and workspace metadata
        const [workspaceKnowledge, currentWorkspace] = await Promise.all([
            getWorkspaceKnowledgeContext(workspaceId),
            prisma.workspace.findUnique({
                where: { id: workspaceId },
                select: { industry: true, companyName: true, companyDescription: true }
            })
        ]);
        if (workspaceKnowledge) {
            documentContext += workspaceKnowledge;
        }

        // Determine effective Bot ID: Explicit params > Assigned Bot > Default
        const effectiveBotId = botId || conversation.assignedBotId;

        if (effectiveBotId) {
            const bot = await prisma.aIBot.findUnique({
                where: { id: effectiveBotId },
                include: { documents: true }
            });

            if (bot) {
                console.log(`🤖 Using Bot: ${bot.name} (${bot.role})`);
                if (bot.prompt) systemPrompt = bot.prompt;
                if (bot.documents && bot.documents.length > 0) {
                    documentContext += "\n=== BOT DÖKÜMALARI ===\n" + bot.documents.map(d => `--- ${d.filename} ---\n${d.content}\n`).join("\n");
                }
            }
        }

        // 4. Gemini History
        // Filter out empty messages to prevent API errors
        const validMessages = conversation.messages
            .filter(msg => msg.content && msg.content.trim().length > 0)
            .reverse();

        // Get current date and time in Turkish format
        const now = new Date();
        const turkishMonths = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
        const turkishDays = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
        const currentDate = `${now.getDate()} ${turkishMonths[now.getMonth()]} ${now.getFullYear()}`;
        const currentDay = turkishDays[now.getDay()];
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        // Build customer info string from contact data
        const contact = conversation.contact;
        let customerInfo = '';
        if (contact) {
            const infoParts = [];
            if (contact.name) infoParts.push(`Müşteri Adı: ${contact.name}`);
            if (contact.phone) infoParts.push(`Telefon: ${contact.phone}`);
            if (contact.email) infoParts.push(`E-posta: ${contact.email}`);
            customerInfo = infoParts.length > 0 ? infoParts.join('\n') : 'Müşteri bilgisi mevcut değil.';
        } else {
            customerInfo = 'Müşteri bilgisi mevcut değil.';
        }

        // Build enhanced system instruction with clear structure
        const fullSystemInstruction = `### GÜNCEL TARİH VE SAAT ###
Bugün: ${currentDay}, ${currentDate}
Saat: ${currentTime} (Türkiye Saati)
Yıl: ${now.getFullYear()}

### MÜŞTERİ BİLGİLERİ ###
${customerInfo}

### KULLANILACAK BİLGİLER ###
${documentContext || "Bilgi bankası boş."}

### VARSAYILAN YANITLAMA KURALLARI ###
1. SADECE VE YALNIZCA yukarıdaki "KULLANILACAK BİLGİLER" ve "ANA SİSTEM TALİMATI"nda yer alan bilgileri kullanarak yanıt ver. Bilgi bankasında veya prompt'ta olmayan konularda KENDİNCE YORUM YAPMA, TAHMİN YÜRÜTME VEYA BİLGİ UYDURMA! Doğrudan web sitesine veya yetkili ekibe yönlendir.
2. Yanıtların orta düzeyde uzunlukta (ideal olarak 2-4 cümle), net, anlaşılır ve doğrudan soruya odaklı olsun. Asla destan gibi uzun paragraflar yazma.
3. Türkçe yanıt ver.
4. Müşteriye her zaman yardımcı olmaya çalış.
5. Tarih veya saat sorulursa yukarıdaki GÜNCEL TARİH bilgisini kullan, kendi bilgini KULLANMA.
6. Müşteri adını veya iletişim bilgilerini sorulursa yukarıdaki MÜŞTERİ BİLGİLERİ kısmını kullan.
7. **KRİTİK - DİL KURALLARI**: ASLA birinci şahıs dili kullanma ("ben", "benim", "bence", "sanırım"). ASLA belirsizlik ifadesi kullanma ("emin değilim", "bilmiyorum"). Her zaman kurum adına "biz/bizim/ekibimiz" şeklinde konuş.
8. **İSTİSNA, MUAFİYET VE GİRİŞ ÜCRETİ KURALI (ASLA KAFANDAN ONAY VERME)**: Müşteri şartları veya ücretleri esnetme (örn. "giriş ücreti ödemeden olur mu?", "ayrı alabilir miyim?", "ücretsiz mi?") sorduğunda, bilgi bankasında açıkça yazmıyorsa KESİNLİKLE "mümkündür / evet" şeklinde onay verme! Hamam/spa tesislerinde giriş ücreti ödenmeden tek başına kese-köpük veya masaj alınamaz, tesis giriş ücreti + hizmet bedeli birlikte zorunludur.
9. **HAYALİ LİNK VE BAĞLANTI YASAĞI**: Bilgi bankasında veya sistem talimatında açıkça tam link/URL verilmemişse, ASLA kafandan markdown link (örn: [Fiyatlar](https://...)) veya uydurma internet adresi türetme.

${getSectorPrompt(currentWorkspace?.industry, `${currentWorkspace?.companyName || ''} ${currentWorkspace?.companyDescription || ''} ${systemPrompt || ''} ${documentContext || ''}`)}

### ⭐ ANA SİSTEM TALİMATI (EN YÜKSEK ÖNCELİK) ⭐ ###
Aşağıdaki talimat işletme sahibi tarafından yazılmıştır ve yukarıdaki varsayılan kurallarla çeliştiğinde BU TALİMAT GEÇERLİDİR. Her zaman önce bu talimata uy:

${systemPrompt}`;

        // Build chat history WITHOUT system instruction embedded.
        // System instruction goes via systemInstruction param to prevent prompt leakage.
        const historyParts = [];

        let lastRole = "model";

        for (const msg of validMessages) {
            const currentRole = msg.isFromContact ? "user" : "model";

            if (currentRole === lastRole) {
                // Merge with previous message
                if (historyParts.length > 0) {
                    historyParts[historyParts.length - 1].parts[0].text += `\n\n${msg.content}`;
                } else {
                    historyParts.push({
                        role: currentRole,
                        parts: [{ text: msg.content }]
                    });
                }
            } else {
                // New turn
                historyParts.push({
                    role: currentRole,
                    parts: [{ text: msg.content }]
                });
                lastRole = currentRole;
            }
        }

        // 🔧 Gemini API requires the first history entry to be role 'user'.
        // Strip leading 'model' entries to prevent API errors.
        while (historyParts.length > 0 && historyParts[0].role === 'model') {
            historyParts.shift();
        }

        // Helper function to try generating content with fallback
        const tryGenerate = async (modelName) => {
            console.log(`🤖 Attempting to generate with model: ${modelName}`);
            const model = genAI.getGenerativeModel({
                model: modelName,
                systemInstruction: fullSystemInstruction,
                generationConfig: {
                    temperature: 0.2,
                }
            });
            const chat = model.startChat({ history: historyParts });
            return await chat.sendMessage("Son mesaja uygun bir yanıt öner.");
        };

        let result;
        try {
            // First try user requested model
            result = await tryGenerate("gemini-3.5-flash");
        } catch (primaryError) {
            console.warn(`⚠️ Primary model (gemini-3.5-flash) failed: ${primaryError.message}`);

            // If quota/not found/etc, try fallback
            if (primaryError.message.includes('404') || primaryError.message.includes('429') || primaryError.message.includes('503')) {
                console.log('🔄 Switching to fallback model: gemini-3.5-flash');
                try {
                    result = await tryGenerate("gemini-3.5-flash");
                } catch (fallbackError) {
                    throw new Error(`Both primary and fallback models failed. Last error: ${fallbackError.message}`);
                }
            } else {
                throw primaryError;
            }
        }

        res.json({ suggestion: result.response.text() });

    } catch (error) {
        console.error('AI Generate Error:', error);

        // Format user-friendly error message
        let userMessage = 'Yapay zeka yanıt üretemedi.';
        if (error.message.includes('429')) userMessage = 'AI Kota limiti aşıldı (429). Lütfen faturalandırma hesabınızı kontrol edin.';
        if (error.message.includes('API key')) userMessage = 'Hatalı API Anahtarı. Lütfen ayarlardan kontrol edin.';

        res.status(500).json({
            error: userMessage,
            details: error.message
        });
    }
};

export const summarizeConversation = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { conversationId } = req.body;

        // 1. Get API Key (workspace key > global key)
        const aiApiKey = await getEffectiveAiApiKey(workspaceId);
        if (!aiApiKey) {
            return res.status(400).json({ error: 'AI API Key not configured' });
        }

        // 2. Get Messages
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: {
                messages: {
                    orderBy: { createdAt: 'asc' },
                    select: { content: true, isFromContact: true, createdAt: true }
                }
            }
        });

        if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

        if (!conversation.messages || conversation.messages.length === 0) {
            return res.json({ topic: null, summary: 'Bu sohbette henüz mesaj bulunmuyor.' });
        }

        // 3a. Generate topic with AI from full conversation
        const chatLogForTopic = conversation.messages
            .filter(m => m.content?.trim())
            .map(m => `${m.isFromContact ? 'Müşteri' : 'Temsilci'}: ${m.content.trim()}`)
            .join('\n');

        let topic = null;
        try {
            const topicPrompt = `Aşağıdaki müşteri sohbetini dikkatle analiz et ve konuşmanın ANA KONUSUNU özetleyen profesyonel bir başlık oluştur.

KURALLAR:
- Türkçe yaz
- Maksimum 5-7 kelime
- Sohbetin GERÇEK amacını yansıt — tüm konuşmaya bak, sadece ilk mesaja değil
- Somut ve açıklayıcı ol (örnek: "Doğum Paketi Fiyat Talebi", "Randevu Saati Değiştirme", "Sipariş Teslimat Sorunu")
- SADECE başlığı yaz — başka hiçbir şey ekleme, tırnak işareti kullanma

SOHBET:
${chatLogForTopic.substring(0, 3000)}

Konu başlığı:`;

            const topicModel = new GoogleGenerativeAI(aiApiKey).getGenerativeModel({ model: 'gemini-3.5-flash' });
            const topicResult = await topicModel.generateContent(topicPrompt);
            topic = topicResult.response.text()
                .trim()
                .replace(/^["'`*#]|["'`*#]$/g, '')
                .replace(/\*+/g, '')
                .trim()
                .substring(0, 80) || null;
        } catch (topicErr) {
            console.warn('⚠️ [Summarize] Topic AI failed, using fallback:', topicErr.message);
            const firstCustomerMessage = conversation.messages.find(m => m.isFromContact);
            topic = firstCustomerMessage ? firstCustomerMessage.content.substring(0, 100) : null;
        }

        // 3. Prepare Prompt for Summary only
        const chatLog = conversation.messages.map(m =>
            `${m.isFromContact ? 'Müşteri' : 'Temsilci'} (${new Date(m.createdAt).toLocaleString('tr-TR')}): ${m.content}`
        ).join('\n');

        const prompt = `Aşağıdaki konuşma geçmişini analiz et ve profesyonel bir dille, kısa ve öz bir şekilde özetle. Müşterinin ne istediğini ve temsilcinin ne cevap verdiğini belirt.

KONUŞMA GEÇMİŞİ:
${chatLog}

ÖZET:`;

        const genAI = new GoogleGenerativeAI(aiApiKey);

        let result;
        const trySummarize = async (modelName) => {
            const model = genAI.getGenerativeModel({ model: modelName });
            return await model.generateContent(prompt);
        };

        try {
            result = await trySummarize("gemini-3.5-flash");
        } catch (e) {
            console.warn('Fallback to 1.5 for summary');
            result = await trySummarize("gemini-3.5-flash");
        }

        const summary = result.response.text();

        // 4. Save to database for persistence
        try {
            await prisma.conversation.update({
                where: { id: conversationId },
                data: {
                    aiTopic: topic,
                    aiSummary: summary
                }
            });
            console.log(`✅ Saved AI analysis to conversation ${conversationId} - Topic: ${topic}`);
        } catch (saveError) {
            console.error('Failed to save AI analysis to DB:', saveError);
            // Don't fail the request, just log the error
        }

        res.json({ topic, summary });

    } catch (error) {
        console.error('AI Summary Error:', error);
        res.status(500).json({ error: 'Özet oluşturulamadı.', details: error.message });
    }
};

// Update conversation analysis (topic/summary/category/branch) - for manual edits
export const updateConversationAnalysis = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { topic, summary, topicCategoryId, branchId } = req.body;

        const data = {};
        if (topic !== undefined) data.aiTopic = topic || null;
        if (summary !== undefined) data.aiSummary = summary || null;
        if (topicCategoryId !== undefined) data.topicCategoryId = topicCategoryId || null;
        if (branchId !== undefined) data.branchId = branchId || null;

        const updated = await prisma.conversation.update({
            where: { id: conversationId },
            data,
            include: {
                topicCategory: {
                    select: { id: true, name: true, icon: true, color: true }
                },
                branch: {
                    select: { id: true, name: true }
                }
            }
        });

        console.log(`✅ Updated AI analysis for conversation ${conversationId}`);
        res.json({ success: true, topic: updated.aiTopic, summary: updated.aiSummary, topicCategory: updated.topicCategory, branch: updated.branch, branchId: updated.branchId });
    } catch (error) {
        console.error('Update analysis error:', error);
        res.status(500).json({ error: 'Analiz kaydedilemedi.', details: error.message });
    }
};

// Simple text translation (no tool calling overhead)
export const translateText = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { text, targetLang = 'Turkish' } = req.body;

        if (!text?.trim()) {
            return res.status(400).json({ error: 'Text is required' });
        }

        const aiApiKey = await getEffectiveAiApiKey(workspaceId);
        if (!aiApiKey) {
            return res.status(400).json({ error: 'AI API Key not configured' });
        }

        const genAI = new GoogleGenerativeAI(aiApiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

        const result = await model.generateContent(
            `Translate the following text to ${targetLang}. Output ONLY the translation, nothing else. No quotes, no explanation.\n\n${text}`
        );

        const translation = result.response.text().trim().replace(/^"|"$/g, '');
        res.json({ translation });

    } catch (error) {
        console.error('Translation error:', error.message);
        res.status(500).json({ error: 'Çeviri yapılamadı.', translation: null });
    }
};

// Get AI suggested replies for a conversation
export const getSuggestedReplies = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { conversationId } = req.body;

        console.log(`💡 [AI Suggestions] Getting reply suggestions for conversation ${conversationId}`);

        // 1. Get API Key (workspace key > global key)
        const aiApiKey = await getEffectiveAiApiKey(workspaceId);
        if (!aiApiKey) {
            return res.status(400).json({ error: 'AI API Key not configured' });
        }

        // Get company context separately
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { companyName: true, companyDescription: true }
        });

        // 2. Get Recent Messages (last 10)
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: {
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                    select: { content: true, isFromContact: true, createdAt: true }
                },
                contact: {
                    select: { name: true, status: true }
                }
            }
        });

        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        if (!conversation.messages || conversation.messages.length === 0) {
            return res.json({ suggestions: [] });
        }

        // Get last message from customer
        const reversedMessages = [...conversation.messages].reverse();
        const lastCustomerMessage = reversedMessages.filter(m => m.isFromContact).pop();

        if (!lastCustomerMessage) {
            return res.json({ suggestions: [] });
        }

        // 3. Build context
        const chatHistory = reversedMessages.map(m =>
            `${m.isFromContact ? 'Müşteri' : 'Temsilci'}: ${m.content}`
        ).join('\n');

        const companyContext = workspace.companyName
            ? `Şirket: ${workspace.companyName}. ${workspace.companyDescription || ''}`
            : '';

        const customerContext = conversation.contact?.name
            ? `Müşteri adı: ${conversation.contact.name}`
            : '';

        // 4. Create prompt
        const prompt = `Sen bir müşteri hizmetleri asistanısın. ${companyContext}

${customerContext}

Son konuşma geçmişi:
${chatHistory}

Müşterinin son mesajı: "${lastCustomerMessage.content}"

Bu mesaja verilecek 3 farklı profesyonel yanıt önerisi oluştur. Her öneri farklı bir ton veya yaklaşım kullanmalı:
1. Kısa ve öz yanıt
2. Detaylı ve yardımsever yanıt  
3. Alternatif çözüm sunan yanıt

SADECE JSON formatında yanıt ver, başka açıklama ekleme:
{
  "suggestions": [
    {"id": 1, "text": "yanıt 1", "tone": "kısa"},
    {"id": 2, "text": "yanıt 2", "tone": "detaylı"},
    {"id": 3, "text": "yanıt 3", "tone": "alternatif"}
  ]
}`;

        // 5. Call AI
        const genAI = new GoogleGenerativeAI(aiApiKey);

        let result;
        const tryGenerate = async (modelName) => {
            const model = genAI.getGenerativeModel({ model: modelName });
            return await model.generateContent(prompt);
        };

        try {
            result = await tryGenerate("gemini-3.5-flash");
        } catch (e) {
            console.warn('Fallback to gemini-3.5-flash for suggestions');
            result = await tryGenerate("gemini-3.5-flash");
        }

        const responseText = result.response.text();

        // Parse JSON from response
        let suggestions = [];
        try {
            // Extract JSON from response (might have markdown code blocks)
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                suggestions = parsed.suggestions || [];
            }
        } catch (parseError) {
            console.error('Failed to parse AI suggestions:', parseError);
            // Fallback: create simple suggestions
            suggestions = [
                { id: 1, text: "Merhaba, size nasıl yardımcı olabilirim?", tone: "kısa" },
                { id: 2, text: "Talebinizi aldım, en kısa sürede size dönüş yapacağım.", tone: "detaylı" },
                { id: 3, text: "Bu konuda size yardımcı olmak isterim. Detayları paylaşır mısınız?", tone: "alternatif" }
            ];
        }

        console.log(`✅ [AI Suggestions] Generated ${suggestions.length} suggestions`);
        res.json({ suggestions });

    } catch (error) {
        console.error('AI Suggestions Error:', error);
        res.status(500).json({ error: 'Öneriler oluşturulamadı.', details: error.message });
    }
};

export const extractContactInfo = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { conversationId } = req.body;

        console.log(`🔍 [AI Extract] Processing conversation ${conversationId} for workspace ${workspaceId}`);

        // 1. Get API Key (workspace key > global key)
        const aiApiKey = await getEffectiveAiApiKey(workspaceId);
        if (!aiApiKey) {
            console.error('❌ [AI Extract] API Key missing for workspace:', workspaceId);
            return res.status(400).json({ error: 'AI API Key not configured' });
        }

        // 2. Get Messages
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: {
                messages: {
                    orderBy: { createdAt: 'asc' },
                    select: { content: true, isFromContact: true }
                }
            }
        });

        if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

        if (!conversation.messages || conversation.messages.length === 0) {
            console.log('ℹ️ [AI Extract] No messages in conversation.');
            return res.status(400).json({ error: 'Bu görüşmede taranacak mesaj bulunmuyor.' });
        }

        // 3. Prepare Prompt
        const chatLog = conversation.messages.map(m =>
            `${m.isFromContact ? 'Müşteri' : 'Temsilci'}: ${m.content}`
        ).join('\n');

        const prompt = `Aşağıdaki konuşma geçmişinden müşterinin iletişim bilgilerini çıkar. 
Bilgileri SADECE JSON formatında bir OBJE olarak döndür (Liste/Array içine koyma). Eğer bir bilgi bulunamadıysa değerini null yap.
Format: {"name": "Ad ve Soyad", "phone": "Telefon", "email": "E-posta"}

ÖNEMLİ: Eğer isim ve soyisim ayrıysa tek bir "name" alanında birleştir.

KONUŞMA GEÇMİŞİ:
${chatLog}

JSON:`;

        const genAI = new GoogleGenerativeAI(aiApiKey);

        const tryExtract = async (modelName) => {
            console.log(`🤖 [AI Extract] Attempting with model: ${modelName}`);
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: { responseMimeType: "application/json" }
            });
            const result = await model.generateContent(prompt);
            let responseText = result.response.text();

            // Clean markdown
            responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

            let data = JSON.parse(responseText);

            // Handle if model returned an array instead of object
            if (Array.isArray(data)) data = data[0];

            // Handle split name/surname
            if (!data.name && (data.first_name || data.given_name)) {
                data.name = `${data.first_name || data.given_name} ${data.last_name || data.surname || ''}`.trim();
            } else if (data.name && (data.surname || data.last_name)) {
                const sn = data.surname || data.last_name;
                if (!data.name.includes(sn)) {
                    data.name = `${data.name} ${sn}`;
                }
            }

            return data;
        };

        let extractedData;
        try {
            // Try 1.5 flash latest which is more standard now
            extractedData = await tryExtract("gemini-3.5-flash");
            console.log('✅ [AI Extract] Extracted info:', JSON.stringify(extractedData));
        } catch (firstError) {
            console.warn(`⚠️ [AI Extract] gemini-3.5-flash failed: ${firstError.message}`);
            try {
                extractedData = await tryExtract("gemini-3.5-flash");
                console.log('✅ [AI Extract] Fallback extracted info:', JSON.stringify(extractedData));
            } catch (secondError) {
                console.error(`❌ [AI Extract] All attempts failed.`);
                throw secondError;
            }
        }

        res.json({ info: extractedData });

    } catch (error) {
        console.error('❌ [AI Extraction Error]:', error);
        res.status(500).json({
            error: 'Bilgiler çıkarılamadı.',
            details: error.message,
            hint: error.message.includes('API key') ? 'API Anahtarı geçersiz.' : 'Bir iç hata oluştu.'
        });
    }
};

// Helper function to check if bot is within scheduled time
const isBotScheduleActive = (bot) => {
    if (!bot.schedulerEnabled) {
        return true; // No scheduler = always active (if isActive is true)
    }

    const now = new Date();
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const currentTime = now.toTimeString().slice(0, 5); // "HH:mm"

    // Check date range if specified
    if (bot.scheduleStartDate && now < new Date(bot.scheduleStartDate)) {
        console.log(`⏰ Bot ${bot.name}: Not yet started (starts ${bot.scheduleStartDate})`);
        return false;
    }
    if (bot.scheduleEndDate && now > new Date(bot.scheduleEndDate)) {
        console.log(`⏰ Bot ${bot.name}: Schedule ended (ended ${bot.scheduleEndDate})`);
        return false;
    }

    // Check days if specified
    if (bot.scheduleDays) {
        try {
            const days = JSON.parse(bot.scheduleDays);
            if (days.length > 0 && !days.includes(currentDay)) {
                console.log(`⏰ Bot ${bot.name}: Not active on ${currentDay}`);
                return false;
            }
        } catch (e) {
            console.error('Error parsing scheduleDays:', e);
        }
    }

    // Check time range if specified
    if (bot.scheduleStartTime && bot.scheduleEndTime) {
        if (currentTime < bot.scheduleStartTime || currentTime > bot.scheduleEndTime) {
            console.log(`⏰ Bot ${bot.name}: Outside time range (${bot.scheduleStartTime}-${bot.scheduleEndTime}), current: ${currentTime}`);
            return false;
        }
    }

    console.log(`✅ Bot ${bot.name}: Schedule is active`);
    return true;
};

// ========== BOT ROUTING HELPERS ==========

// Process the routing question-answer flow
// Silent routing: analyzes messages in background, extracts routing fields, assigns team when ready
// NEVER generates responses — always lets normal AI handle customer-facing messages
const processRoutingFlow = async (conversation, activeBot, userMessage, workspaceId) => {
    try {
        let questions = [];
        try {
            questions = JSON.parse(activeBot.routingQuestions || '[]');
        } catch (e) {
            console.error('Error parsing routingQuestions:', e);
            return;
        }

        if (questions.length === 0) return;

        // Get or initialize routing state
        let routingState = null;
        try {
            routingState = conversation.routingState ? JSON.parse(conversation.routingState) : null;
        } catch (e) {
            routingState = null;
        }

        if (!routingState) {
            routingState = { answers: {}, completed: false };
        }

        // If routing is already completed, do nothing
        if (routingState.completed) return;

        // Missing fields
        const missingFields = questions
            .filter(q => !routingState.answers[q.fieldName])
            .map(q => q.fieldName);

        if (missingFields.length === 0) {
            // All fields already collected, finalize routing
            await finalizeRouting(conversation, activeBot, routingState, workspaceId);
            return;
        }

        // Build conversation history for AI context
        const chatHistory = (conversation.messages || [])
            .slice()
            .reverse()
            .map(m => `${m.isFromContact ? 'Müşteri' : 'Bot'}: ${m.content}`)
            .join('\n');

        // Build field descriptions for the AI
        const fieldDescriptions = questions.map(q =>
            `- Alan: "${q.fieldName}" | Açıklama: "${q.question}"`
        ).join('\n');

        // Get API Key
        const aiApiKey = await getEffectiveAiApiKey(workspaceId);
        if (!aiApiKey) {
            console.error('❌ [Routing] No AI API key for workspace:', workspaceId);
            return;
        }

        const genAI = new GoogleGenerativeAI(aiApiKey);

        // Simple extraction prompt — only extracts data, NO response generation
        const analysisPrompt = `Aşağıdaki konuşmadan belirli bilgileri çıkar. SADECE veri çıkar, yanıt üretme.

ÇIKARILMASI GEREKEN BİLGİLER:
${fieldDescriptions}

KONUŞMA GEÇMİŞİ:
${chatHistory}

MÜŞTERİNİN SON MESAJI: "${userMessage}"

GÖREV: Müşterinin mesajlarından yukarıdaki alanların değerlerini çıkar.
Örnek: Müşteri "bornova şubeden bilgi almak istiyorum" diyorsa, sube alanı "bornova" olur.
Örnek: Müşteri "gaziemir" diyorsa, sube alanı "gaziemir" olur.
Örnek: Müşteri sadece "selam" veya "merhaba" diyorsa, hiçbir alan çıkarılamaz.

SADECE şu JSON formatında yanıt ver, başka hiçbir şey yazma:
{"extractedFields": {"alan_adı": "değer"}}

Eğer hiçbir alan tespit edilemiyorsa:
{"extractedFields": {}}`;

        let result;
        try {
            const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
            result = await model.generateContent(analysisPrompt);
        } catch (err) {
            try {
                const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
                result = await model.generateContent(analysisPrompt);
            } catch (err2) {
                console.error('❌ [Routing] AI extraction failed:', err2);
                return;
            }
        }

        const responseText = result.response.text().trim();
        console.log(`🔍 [Routing] AI extraction result: ${responseText}`);

        // Parse AI response
        let aiResult;
        try {
            const jsonStr = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            aiResult = JSON.parse(jsonStr);
        } catch (e) {
            console.error('❌ [Routing] Failed to parse AI extraction as JSON:', e);
            return;
        }

        // Merge extracted fields into routing state
        let newFieldsFound = false;
        if (aiResult.extractedFields && typeof aiResult.extractedFields === 'object') {
            for (const [key, value] of Object.entries(aiResult.extractedFields)) {
                if (value && String(value).trim() && missingFields.includes(key)) {
                    routingState.answers[key] = String(value).trim().toLowerCase();
                    newFieldsFound = true;
                    console.log(`✅ [Routing] Extracted field: ${key} = ${value}`);
                }
            }
        }

        if (!newFieldsFound) {
            // No new fields found, save state if it was newly created
            if (!conversation.routingState) {
                await prisma.conversation.update({
                    where: { id: conversation.id },
                    data: { routingState: JSON.stringify(routingState) }
                });
            }
            console.log(`🔄 [Routing] No routing fields detected in message. Waiting for natural mention.`);
            return;
        }

        // Check if all fields are now collected
        const stillMissing = questions.filter(q => !routingState.answers[q.fieldName]);

        if (stillMissing.length === 0) {
            // All fields collected — route!
            await finalizeRouting(conversation, activeBot, routingState, workspaceId);
        } else {
            // Save partial state, wait for more info
            await prisma.conversation.update({
                where: { id: conversation.id },
                data: { routingState: JSON.stringify(routingState) }
            });
            console.log(`🔄 [Routing] Still missing: ${stillMissing.map(q => q.fieldName).join(', ')}. Waiting.`);
        }

    } catch (error) {
        console.error('❌ [Routing] Error in processRoutingFlow:', error);
    }
};

// Helper: Finalize routing — evaluate rules and assign conversation
const finalizeRouting = async (conversation, activeBot, routingState, workspaceId) => {
    routingState.completed = true;
    await prisma.conversation.update({
        where: { id: conversation.id },
        data: { routingState: JSON.stringify(routingState) }
    });

    console.log(`✅ [Routing] All fields collected for ${conversation.id}:`, routingState.answers);

    // Determine target team/user
    let targetTeamId = activeBot.routingDefaultTeamId;
    let targetUserId = activeBot.routingDefaultUserId;

    // If conditional routing is enabled, evaluate rules
    if (activeBot.routingConditionalEnabled) {
        const ruleResult = evaluateRoutingRules(routingState.answers, activeBot.routingRules);
        if (ruleResult) {
            targetTeamId = ruleResult.teamId || targetTeamId;
            targetUserId = ruleResult.userId || targetUserId;
            console.log(`📋 [Routing] Conditional rule matched: team=${targetTeamId}, user=${targetUserId}`);
        } else {
            console.log(`📋 [Routing] No conditional rule matched, using defaults`);
        }
    }

    // Assign conversation to target team/user
    await assignConversationToTarget(conversation.id, targetTeamId, targetUserId, workspaceId, activeBot.name);
    console.log(`✅ [Routing] Conversation ${conversation.id} routed successfully`);
};

// Evaluate conditional routing rules against collected answers
const evaluateRoutingRules = (answers, rulesJson) => {
    try {
        const rules = JSON.parse(rulesJson || '[]');
        if (rules.length === 0) return null;

        // Sort by priority (lower = higher priority)
        const sortedRules = [...rules].sort((a, b) => (a.priority || 0) - (b.priority || 0));

        for (const rule of sortedRules) {
            const answerValue = (answers[rule.field] || '').toLowerCase().trim();
            const ruleValue = (rule.value || '').toLowerCase().trim();

            let matched = false;
            switch (rule.operator) {
                case 'equals':
                    matched = answerValue === ruleValue;
                    break;
                case 'contains':
                    matched = answerValue.includes(ruleValue);
                    break;
                case 'greater_than':
                    matched = parseFloat(answerValue) > parseFloat(ruleValue);
                    break;
                case 'less_than':
                    matched = parseFloat(answerValue) < parseFloat(ruleValue);
                    break;
                case 'not_equals':
                    matched = answerValue !== ruleValue;
                    break;
                default:
                    matched = answerValue === ruleValue;
            }

            if (matched) {
                console.log(`✅ [Routing Rule] Matched: ${rule.field} ${rule.operator} ${rule.value}`);
                return { teamId: rule.teamId, userId: rule.userId };
            }
        }

        return null; // No rule matched
    } catch (e) {
        console.error('Error evaluating routing rules:', e);
        return null;
    }
};

// Assign conversation to target team/user and disable bot
const assignConversationToTarget = async (conversationId, teamId, userId, workspaceId, botName) => {
    try {
        const updateData = {
            botEnabled: true, // Keep bot active until a human agent takes over
            handoffPending: false
        };

        if (teamId) {
            updateData.assignedTeamId = teamId;
            updateData.teamIds = JSON.stringify([teamId]);
        }

        console.log(`🔧 [Routing] Updating conversation ${conversationId} with:`, JSON.stringify(updateData));

        const updated = await prisma.conversation.update({
            where: { id: conversationId },
            data: updateData,
            select: { id: true, teamIds: true, assignedTeamId: true }
        });

        console.log(`✅ [Routing] Conversation ${conversationId} assigned to team=${teamId}, user=${userId}`);
        console.log(`✅ [Routing] DB result - teamIds: ${updated.teamIds}, assignedTeamId: ${updated.assignedTeamId}`);

        // Get conversation contact info for notification
        let contactName = 'Müşteri';
        try {
            const conv = await prisma.conversation.findUnique({
                where: { id: conversationId },
                select: { contact: { select: { name: true, fullName: true } } }
            });
            contactName = conv?.contact?.fullName || conv?.contact?.name || 'Müşteri';
        } catch (e) { /* ignore */ }

        // Emit socket events to notify team
        try {
            const { emitToWorkspace } = await import('../socket.js');
            emitToWorkspace(workspaceId, 'bot_routing_complete', {
                conversationId,
                workspaceId,
                teamId,
                userId,
                message: `Bot ${botName} müşteriyi yönlendirdi.`,
                botName
            });

            // Also emit conversation_assigned so Inbox updates team badge in real-time
            emitToWorkspace(workspaceId, 'conversation_assigned', {
                conversationId,
                assignedToId: userId || null,
                assignedToName: null,
                botEnabled: true,
                teamIds: teamId ? JSON.stringify([teamId]) : '[]'
            });
        } catch (socketErr) {
            console.error('Socket emit error for routing:', socketErr);
        }

        // Create in-app notifications for team members
        try {
            const { createTeamNotifications, createNotification } = await import('./notification.controller.js');
            if (teamId) {
                // Get team name
                let teamName = 'Takım';
                try {
                    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { name: true } });
                    teamName = team?.name || 'Takım';
                } catch (e) { /* ignore */ }

                await createTeamNotifications(
                    workspaceId,
                    teamId,
                    'BOT_ROUTING',
                    `${contactName} — yeni konuşma`,
                    `${botName} tarafından ${teamName} takımına yönlendirildi.`,
                    { conversationId, teamId }
                );
            }
            if (userId) {
                await createNotification(
                    workspaceId,
                    userId,
                    'CONVERSATION_ASSIGNED',
                    `${contactName} — konuşma atandı`,
                    `${botName} tarafından size atandı.`,
                    { conversationId }
                );
            }
        } catch (notifErr) {
            console.error('Notification error:', notifErr);
        }
    } catch (error) {
        console.error('❌ [Routing] Error assigning conversation:', error);
    }
};

// Helper for Webhooks to get Auto Reply
// type: 'CHATS' for DM conversations, 'COMMENTS' for post/media comments
// pageId: required for COMMENTS type to find the assigned comment bot
export const getAutoReply = async (workspaceId, conversationId, userMessage, channel = null, type = 'CHATS', pageId = null) => {
    try {
        console.log(`🤖 Auto-reply check for workspace ${workspaceId}, channel: ${channel}, type: ${type}`);

        // Check if message consists purely of emojis/symbols/icons
        if (isEmojiOrIconOnly(userMessage)) {
            console.log(`ℹ️ [AI] Message contains only emojis/symbols/icons ("${userMessage}"). Skipping auto-reply.`);
            return null;
        }

        // Check if message contains profanity as a fallback check
        if (hasProfanity(userMessage)) {
            console.log(`ℹ️ [AI] Message contains profanity. Skipping auto-reply.`);
            return null;
        }

        // 🔒 AI Kullanım Limiti Kontrolü
        const usageCheck = await checkAiUsageLimit(workspaceId);
        if (!usageCheck.allowed) {
            console.log(`🚫 [AI] Usage limit exceeded for workspace ${workspaceId}: ${usageCheck.currentCount}/${usageCheck.limit}`);
            console.log(`   Reason: ${usageCheck.reason}, Plan: ${usageCheck.subscription}`);
            return null; // Bot cevap vermesin
        }

        // For CHATS type, acquire lock to prevent duplicate AI replies
        if (type === 'CHATS' && conversationId) {
            if (!acquireAiReplyLock(conversationId)) {
                console.log(`🔒 [AI] Conversation ${conversationId} AI reply already in progress, skipping`);
                return null;
            }
        }

        let activeBot = null;
        let conversation = null;

        // 🎯 WORKSPACE ROUTER — Funnel yönlendirmesi (CHATS tipinde, yeni/eşleşmemiş sohbetler için)
        if ((type === 'CHATS' || type === 'WIDGET') && conversationId) {
            try {
                const { routeConversationToFunnel } = await import('../services/workspaceRouter.service.js');
                await routeConversationToFunnel(workspaceId, conversationId, userMessage, channel);
                // Router, funnel atamasını yaptı (bot değiştirmiş olabilir)
                // Bot seçimi aşağıda DB'den taze okunacak
            } catch (routerErr) {
                console.error('⚠️ [Router] Non-fatal router error:', routerErr.message);
            }

            // 🎯 EVRENSEL SINIFLANDIRICI — Konuşmayı sınıflandır + yapılandırılmış veri çıkar
            try {
                const conv = await prisma.conversation.findUnique({
                    where: { id: conversationId },
                    select: { classifiedAt: true, isQualifiedLead: true, contactId: true }
                });

                // Son 30 dk içinde sınıflandırılmışsa tekrar yapma
                // AMA mesajda telefon numarası varsa cooldown'u bypass et (numara geldiğinde arama planla tetiklenmeli)
                const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
                const phoneRegex = /(?:\+?90|0)?[\s.-]?[5][0-9]{2}[\s.-]?[0-9]{3}[\s.-]?[0-9]{2}[\s.-]?[0-9]{2}/;
                const hasPhoneInMessage = phoneRegex.test(userMessage);
                const shouldClassify = hasPhoneInMessage || !conv?.classifiedAt || conv.classifiedAt < thirtyMinAgo;

                if (shouldClassify) {
                    // Feature Flag: Birleşik AI modu açıksa ayrı classifier çağrısını atla
                    const { isUnifiedAIEnabled } = await import('../services/unifiedAI.service.js');
                    const unifiedMode = await isUnifiedAIEnabled(workspaceId);
                    
                    if (unifiedMode) {
                        console.log('🧠 [UnifiedAI] Birleşik mod aktif — ayrı classifier çağrısı atlanıyor');
                        // Sınıflandırma chat yanıtıyla birlikte yapılacak (aşağıda)
                    } else {
                    const { classifyAndExtract, executeClassificationActions } = await import('../services/universalClassifier.service.js');

                    const recentMsgs = await prisma.message.findMany({
                        where: { conversationId },
                        orderBy: { createdAt: 'desc' },
                        take: 10,
                        select: { content: true, isFromContact: true }
                    });

                    const contact = await prisma.contact.findUnique({
                        where: { id: conv.contactId },
                        select: { name: true, phone: true, email: true }
                    });

                    const classResult = await classifyAndExtract(
                        conversationId, recentMsgs.reverse(), contact, channel, workspaceId
                    );

                    // Sonucu kaydet
                    const extractedTopic = classResult.extractedData?.topic || null;
                    const topicCategoryId = classResult.topicCategoryId || null;
                    await prisma.conversation.update({
                        where: { id: conversationId },
                        data: {
                            classificationData: JSON.stringify(classResult),
                            classifiedAt: new Date(),
                            isQualifiedLead: classResult.isQualifiedLead,
                            ...(extractedTopic && { aiTopic: extractedTopic }),
                            ...(topicCategoryId && { topicCategoryId })
                        }
                    });

                    // aiTopic güncellenince bağlı case'in başlığını da güncelle
                    if (extractedTopic) {
                        try {
                            const updatedConv = await prisma.conversation.findUnique({
                                where: { id: conversationId },
                                select: { caseId: true }
                            });
                            if (updatedConv?.caseId) {
                                await prisma.case.update({
                                    where: { id: updatedConv.caseId },
                                    data: { title: extractedTopic.trim().substring(0, 200) }
                                });
                                console.log(`🔄 [Classifier] Case title synced: "${extractedTopic}" → case ${updatedConv.caseId}`);
                            }
                        } catch (_) {}
                    }

                    // Aksiyonları çalıştır: Lead olduysa VEYA telefon numarası varsa
                    // Contact.phone'u taze oku — executePhoneCaptureRule tarafından güncellenmiş olabilir
                    const freshContact = await prisma.contact.findUnique({ where: { id: conv.contactId }, select: { phone: true } });
                    const contactHasPhone = !!(classResult.extractedData?.phone || freshContact?.phone || contact?.phone);
                    const shouldRunActions = (classResult.isQualifiedLead && !conv?.isQualifiedLead) || contactHasPhone;
                    if (shouldRunActions) {
                        await executeClassificationActions(
                            workspaceId, conversationId, conv.contactId, classResult
                        );
                    }

                    console.log(`🎯 [Classifier] Sınıflandırma tamamlandı: ${classResult.classification} | Lead: ${classResult.isQualifiedLead}`);
                    } // end else (eski ayrık classifier modu)
                }
            } catch (classifyErr) {
                // Sınıflandırma hatası bot yanıtını ENGELLEMEMELİ
                console.error('⚠️ [Classifier] Non-fatal classification error:', classifyErr.message);
            }
        }

        // COMMENTS type - no conversation, find the comment bot assigned to the page
        if (type === 'COMMENTS') {
            const isInstagramComment = channel?.toLowerCase() === 'instagram';
            console.log(`💬 [getAutoReply] COMMENTS mode - looking for ${isInstagramComment ? 'Instagram' : 'Facebook'} comment bot`);

            // Find the page and its assigned comment bot
            if (pageId) {
                const page = await prisma.facebookPage.findFirst({
                    where: {
                        OR: [
                            { pageId: pageId },
                            { instagramBusinessId: pageId }
                        ],
                        workspaceId
                    },
                    include: {
                        commentBot: { include: { documents: true } },
                        instagramCommentBot: { include: { documents: true } }
                    }
                });

                // Use Instagram comment bot for Instagram, Facebook comment bot for Facebook
                if (isInstagramComment && page?.instagramCommentBot) {
                    activeBot = page.instagramCommentBot;
                    console.log(`✅ Using Instagram Comment Bot: ${activeBot.name}`);
                } else if (!isInstagramComment && page?.commentBot) {
                    activeBot = page.commentBot;
                    console.log(`✅ Using Facebook Comment Bot: ${activeBot.name}`);
                }
            }

            if (!activeBot) {
                console.log(`ℹ️ No ${isInstagramComment ? 'Instagram' : 'Facebook'} comment bot assigned to page: ${pageId}`);
                return null;
            }
        } else {
            // 1. Get conversation with all possible channel relations
            conversation = await prisma.conversation.findUnique({
                where: { id: conversationId },
                select: {
                    id: true,
                    handoffPending: true,
                    botEnabled: true,
                    botPausedUntil: true,
                    teamIds: true,
                    routingState: true,
                    appointmentState: true,
                    funnelStageId: true,
                    classificationData: true,
                    aiTopic: true,
                    assignedBot: { include: { documents: true } },
                    facebookPage: {
                        include: {
                            assignedBot: { include: { documents: true } },
                            instagramBot: { include: { documents: true } }
                        }
                    },
                    whatsappPhoneNumber: { include: { assignedBot: { include: { documents: true } } } },
                    emailChannel: { include: { assignedBot: { include: { documents: true } } } },
                    messages: {
                        take: 22,
                        orderBy: { createdAt: 'desc' },
                        select: { content: true, isFromContact: true }
                    },
                    contact: {
                        select: { name: true, email: true, phone: true }
                    }
                }
            });

            // Get Team assignment if conversation is assigned to a team
            let teamBot = null;
            if (conversation?.teamIds) {
                try {
                    const teamIds = JSON.parse(conversation.teamIds);
                    const validTeamIds = teamIds.filter(id => id != null && id !== '');
                    if (validTeamIds.length > 0) {
                        const team = await prisma.team.findFirst({
                            where: { id: validTeamIds[0] },
                            include: {
                                assignedBot: { include: { documents: true } },
                                members: {
                                    where: { botId: { not: null } },
                                    include: { bot: { include: { documents: true } } }
                                }
                            }
                        });
                        if (team?.assignedBot) {
                            teamBot = team.assignedBot;
                        } else if (team?.members?.length > 0) {
                            const botMember = team.members.find(m => m.bot && m.bot.isActive);
                            if (botMember) {
                                teamBot = botMember.bot;
                            }
                        }
                    }
                } catch (e) {
                    console.error('Error parsing teamIds:', e);
                }
            }

            console.log(`🔍 [getAutoReply] Tracing: channel=${channel}, type=${type}, workspaceId=${workspaceId}`);
            console.log(`   └─ Conversation ID: ${conversationId}, botEnabled: ${conversation?.botEnabled}`);

            // If bot is disabled for this conversation (human took over), skip
            if (conversation?.botEnabled === false) {
                console.log(`⏸️ Bot disabled for conversation ${conversationId} (human took over)`);
                if (type === 'CHATS' && conversationId) releaseAiReplyLock(conversationId);
                return null;
            }

            // If bot is temporarily paused (agent replied), skip
            if (conversation?.botPausedUntil && new Date(conversation.botPausedUntil) > new Date()) {
                console.log(`⏸️ Bot paused until ${conversation.botPausedUntil} for conversation ${conversationId}`);
                if (type === 'CHATS' && conversationId) releaseAiReplyLock(conversationId);
                return null;
            }

            // Priority Logic: Conversation > Team > Channel (bot works when assigned)
            if (conversation?.assignedBot) {
                console.log(`✅ Using Conversation-Assigned Bot: ${conversation.assignedBot.name}`);
                activeBot = conversation.assignedBot;
            } else if (teamBot) {
                console.log(`✅ Using Team-Assigned Bot: ${teamBot.name}`);
                activeBot = teamBot;
            } else if (channel?.toLowerCase() === 'facebook' && conversation?.facebookPage?.assignedBot) {
                console.log(`✅ Using Facebook Page-Assigned Bot: ${conversation.facebookPage.assignedBot.name}`);
                activeBot = conversation.facebookPage.assignedBot;
            } else if (channel?.toLowerCase() === 'instagram' && conversation?.facebookPage?.instagramBot) {
                console.log(`✅ Using Instagram-Assigned Bot: ${conversation.facebookPage.instagramBot.name}`);
                activeBot = conversation.facebookPage.instagramBot;
            } else if (channel?.toLowerCase() === 'whatsapp' && conversation?.whatsappPhoneNumber?.assignedBot) {
                console.log(`✅ Using WhatsApp-Assigned Bot: ${conversation.whatsappPhoneNumber.assignedBot.name}`);
                activeBot = conversation.whatsappPhoneNumber.assignedBot;
            } else if (channel?.toLowerCase() === 'email' && conversation?.emailChannel?.assignedBot) {
                console.log(`✅ Using Email-Assigned Bot: ${conversation.emailChannel.assignedBot.name}`);
                activeBot = conversation.emailChannel.assignedBot;
            }
            
            // ─── KANAL BAZLI BOT KISITLAMALARI (UI'daki Switchler) ───
            if (activeBot) {
                const channelLower = channel?.toLowerCase() || '';
                
                // For COMMENTS type, we always allow the bot since it's specifically assigned to the page's comments
                if (type !== 'COMMENTS' && channelLower) {
                    // Check if the bot has explicitly defined channel restrictions
                    const hasAnyEnabled = activeBot.whatsappEnabled || activeBot.facebookEnabled || activeBot.instagramEnabled || activeBot.widgetEnabled;
                    
                    // If NO channels are explicitly enabled, we assume it's a legacy bot and allow all.
                    // If AT LEAST ONE channel is enabled, we strictly enforce the flags.
                    if (hasAnyEnabled) {
                        let isChannelAllowed = true;
                        if (channelLower === 'whatsapp' && !activeBot.whatsappEnabled) isChannelAllowed = false;
                        else if (channelLower === 'facebook' && !activeBot.facebookEnabled) isChannelAllowed = false;
                        else if (channelLower === 'instagram' && !activeBot.instagramEnabled) isChannelAllowed = false;
                        else if (channelLower === 'widget' && !activeBot.widgetEnabled) isChannelAllowed = false;
                        
                        if (!isChannelAllowed) {
                            console.log(`🚫 Bot ${activeBot.name} is DISABLED for channel ${channelLower}. Skipping AI reply.`);
                            if (type === 'CHATS' && conversationId) releaseAiReplyLock(conversationId);
                            return null;
                        }
                    }
                }
            }
            
            if (channel?.toLowerCase() === 'widget' && !activeBot) {
                // For Widget, check if there's a WebWidget with assigned bot
                const webWidget = await prisma.webWidget.findFirst({
                    where: {
                        workspaceId,
                        isActive: true
                    },
                    include: { assignedBot: { include: { documents: true } } }
                });
                if (webWidget?.assignedBot) {
                    activeBot = webWidget.assignedBot;
                    console.log(`✅ Using Widget-Assigned Bot: ${activeBot.name}`);
                }
            }

            // ─── WORKSPACE FALLBACK: Bot modalındaki "Çalışacağı Kanallar" toggle'ları ───
            // Spesifik atama bulunamadıysa (kanal, takım, konuşma) → o kanalı
            // etkinleştirmiş herhangi bir aktif bot'u workspace genelinde ara.
            // Bu sayede kullanıcı bot modalından WhatsApp/Facebook/Instagram toggle'larını
            // açtığında bot o kanalda otomatik devreye girer.
            if (!activeBot && type === 'CHATS') {
                try {
                    const channelLower = channel?.toLowerCase() || '';
                    const channelFlagMap = {
                        'whatsapp':  { whatsappEnabled: true },
                        'facebook':  { facebookEnabled: true },
                        'instagram': { instagramEnabled: true },
                        'widget':    { widgetEnabled: true }
                    };
                    const channelFilter = channelFlagMap[channelLower];
                    if (channelFilter) {
                        // 1. Önce: O kanalı açıkça etkinleştirmiş bot
                        let fallbackBot = await prisma.aIBot.findFirst({
                            where: {
                                workspaceId,
                                isActive: true,
                                botType: 'CHATS',
                                ...channelFilter
                            },
                            include: { documents: true },
                            orderBy: { createdAt: 'asc' }
                        });

                        // 2. Bulunamazsa: Hiçbir kanal ayarlanmamış (hepsi false = legacy/yeni bot)
                        // Frontend'de UI'da hepsi true gösterilir ama DB'ye henüz kaydedilmemiştir.
                        if (!fallbackBot) {
                            fallbackBot = await prisma.aIBot.findFirst({
                                where: {
                                    workspaceId,
                                    isActive: true,
                                    botType: 'CHATS',
                                    whatsappEnabled: false,
                                    facebookEnabled: false,
                                    instagramEnabled: false,
                                    widgetEnabled: false
                                },
                                include: { documents: true },
                                orderBy: { createdAt: 'asc' }
                            });
                            if (fallbackBot) {
                                console.log(`✅ [Fallback] Legacy/unconfigured bot "${fallbackBot.name}" selected for channel ${channelLower} — treating as all-channels`);
                            }
                        }

                        if (fallbackBot) {
                            activeBot = fallbackBot;
                            if (!activeBot.whatsappEnabled && !activeBot.facebookEnabled && !activeBot.instagramEnabled && !activeBot.widgetEnabled) {
                                // Legacy bot — skip channel restriction check below
                                activeBot._legacyAllChannels = true;
                            }
                            console.log(`✅ [Fallback] Workspace bot "${fallbackBot.name}" selected for channel ${channelLower}`);
                        }
                    }
                } catch (fallbackErr) {
                    console.warn('⚠️ Workspace bot fallback error:', fallbackErr.message);
                }
            }
        }

        if (!activeBot) {
            console.log(`ℹ️ No active bot assigned for channel: ${channel}, type: ${type}. Manual mode active.`);
            if (type === 'CHATS' && conversationId) releaseAiReplyLock(conversationId);
            return null;
        }

        // Check if bot is active
        if (!activeBot.isActive) {
            console.log(`⏸️ Bot ${activeBot.name} is not active (isActive: false). Skipping auto-reply.`);
            if (type === 'CHATS' && conversationId) releaseAiReplyLock(conversationId);
            return null;
        }

        // Check scheduler - if bot has scheduler enabled, verify it's within active hours
        // Widget kanalı: ignoreSchedule aktifse schedule kontrolünü atla (7/24 çalışır)
        let skipScheduleCheck = false;
        if (channel?.toLowerCase() === 'widget') {
            try {
                const widgetSettings = await prisma.webWidget.findFirst({
                    where: { workspaceId, isActive: true },
                    select: { ignoreSchedule: true }
                });
                if (widgetSettings?.ignoreSchedule !== false) {
                    skipScheduleCheck = true;
                    console.log(`🌐 [Widget] Schedule bypass active — bot will respond 24/7`);
                }
            } catch (e) { /* ignore */ }
        }
        if (!skipScheduleCheck && !isBotScheduleActive(activeBot)) {
            console.log(`⏰ Bot ${activeBot.name} is not within scheduled time. Skipping auto-reply.`);
            if (type === 'CHATS' && conversationId) releaseAiReplyLock(conversationId);
            return null;
        }

        console.log(`✅ Active bot prepared: ${activeBot.name}`);

        // Fetch tools for this bot (for Function Calling)
        try {
            const botTools = await prisma.aIBotTool.findMany({
                where: { workspaceId: workspaceId, isActive: true },
                include: { apiIntegration: true }
            });
            activeBot.tools = botTools;
            if (botTools.length > 0) {
                console.log(`🛠️ [AI] Loaded ${botTools.length} tools for bot ${activeBot.name}`);
            }
        } catch (toolError) {
            console.error(`⚠️ [AI] Failed to load tools for bot ${activeBot.name}:`, toolError.message);
            activeBot.tools = [];
        }

        // 🏥 APPOINTMENT BOT — Inject built-in appointment tools
        let isAppointmentBot = false;

        // 🚀 Dynamic Appointment Capability: Check if workspace has Probel Health API
        const hasHealthApi = await prisma.apiIntegration.findFirst({
            where: { workspaceId, authType: 'OAUTH_PASSWORD', isActive: true }
        });

        // 🔒 Workspace bazlı randevu modülü kontrolü (appointmentEnabled: false ise hiç devreye girme)
        const wsAppointmentCheck = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { appointmentEnabled: true, industry: true, companyName: true, companyDescription: true }
        });
        const appointmentAllowed = wsAppointmentCheck?.appointmentEnabled !== false;

        let isProbelBot = false; // Probel-specific logic only for workspaces with health API
        if (appointmentAllowed && (activeBot.botType === 'APPOINTMENT' || hasHealthApi)) {
            isAppointmentBot = true;
            if (hasHealthApi) isProbelBot = true; // Only Probel-connected workspaces get special treatment
            const { getAppointmentToolDeclarations } = await import('../services/appointmentBot.service.js');
            activeBot._appointmentTools = getAppointmentToolDeclarations();
            console.log(`🏥 [AI] Appointment bot capability detected: ${activeBot.name}, ${activeBot._appointmentTools.length} built-in tools loaded${isProbelBot ? ' (Probel)' : ''}`);
        } else if (!appointmentAllowed) {
            console.log(`🔒 [AI] Appointment module disabled for workspace ${workspaceId} — skipping appointment bot`);
        }


        // 🔄 BOT ROUTING CHECK - Silent background analysis (never blocks normal AI)
        if (activeBot.routingEnabled && type === 'CHATS' && conversationId && conversation) {
            console.log(`🔄 [Routing] Bot ${activeBot.name} has routing enabled, running silent analysis...`);
            // Run routing analysis in background — extracts fields and routes when ready
            // Does NOT generate responses, always falls through to normal AI
            processRoutingFlow(conversation, activeBot, userMessage, workspaceId)
                .catch(err => console.error('❌ [Routing] Background routing error:', err));
        }

        // 🧠 BİRLEŞİK AI ÇAĞRISI — classifier + chat tek seferde
        if (type === 'CHATS' && conversationId) {
            try {
                const { isUnifiedAIEnabled, executeUnifiedAICall } = await import('../services/unifiedAI.service.js');
                const unifiedMode = await isUnifiedAIEnabled(workspaceId);

                if (unifiedMode) {
                    console.log('🧠 [UnifiedAI] Birleşik AI çağrısı başlatılıyor...');

                    // Aşama AI konfigürasyonunu al
                    let stageAIConfig = {};
                    if (conversation?.funnelStageId) {
                        const { getStageAIConfig } = await import('../services/responsibilityLookup.service.js');
                        stageAIConfig = await getStageAIConfig(conversation.funnelStageId);
                    }

                    // Son mesajları al
                    const recentMsgs = await prisma.message.findMany({
                        where: { conversationId },
                        orderBy: { createdAt: 'desc' },
                        take: 15,
                        select: { content: true, isFromContact: true }
                    });

                    // Contact bilgilerini al
                    const contact = conversation?.contactId
                        ? await prisma.contact.findUnique({
                            where: { id: conversation.contactId },
                            select: { name: true, phone: true, email: true }
                        })
                        : {};

                    const unifiedResult = await executeUnifiedAICall({
                        workspaceId,
                        conversationId,
                        userMessage,
                        channel,
                        contact: contact || {},
                        recentMessages: recentMsgs.reverse(),
                        activeBot,
                        stageAIConfig
                    });

                    if (unifiedResult?.chatResponse) {
                        // Sınıflandırma sonuçlarını kaydet
                        if (unifiedResult.classification) {
                            const classResult = unifiedResult.classification;
                            const extractedTopic = classResult.extractedData?.topic || null;
                            const topicCategoryId = classResult.topicCategoryId || null;
                            await prisma.conversation.update({
                                where: { id: conversationId },
                                data: {
                                    classificationData: JSON.stringify(classResult),
                                    classifiedAt: new Date(),
                                    isQualifiedLead: classResult.isQualifiedLead,
                                    ...(extractedTopic && { aiTopic: extractedTopic }),
                                    ...(topicCategoryId && { topicCategoryId })
                                }
                            });

                            // Lead ise aksiyonları çalıştır
                            if (classResult.isQualifiedLead) {
                                try {
                                    const { executeClassificationActions } = await import('../services/universalClassifier.service.js');
                                    await executeClassificationActions(
                                        workspaceId, conversationId, conversation.contactId, classResult
                                    );
                                } catch (actionErr) {
                                    console.error('⚠️ [UnifiedAI] Classification action error:', actionErr.message);
                                }
                            }
                        }

                        // AI kullanım sayacını artır
                        try { await incrementAiUsage(workspaceId); } catch { }

                        if (type === 'CHATS' && conversationId) releaseAiReplyLock(conversationId);
                        console.log(`🧠 [UnifiedAI] Birleşik yanıt hazır (${unifiedResult.chatResponse.length} chars)`);
                        return unifiedResult.chatResponse;
                    }

                    // Birleşik çağrı başarısız olduysa normal akışa devam et
                    console.log('⚠️ [UnifiedAI] Birleşik çağrı sonuç vermedi, normal akışa geçiliyor');
                }
            } catch (unifiedErr) {
                console.error('⚠️ [UnifiedAI] Non-fatal error:', unifiedErr.message);
                // Normal akışa devam et
            }
        }

        // 2. Prepare Context (similar to generateResponse)
        let systemPrompt = activeBot.prompt || "You are a helpful assistant.";

        // For COMMENTS type, add special instructions
        if (type === 'COMMENTS') {
            systemPrompt += "\n\nBu bir sosyal medya yorumuna yanıt. Yanıtın kısa, samimi ve profesyonel olsun. Emoji kullanabilirsin. Yanıtın 280 karakteri geçmesin."
        }
        let documentContext = "";

        // Get workspace-level knowledge base (company info + knowledge entries)
        const workspaceKnowledge = await getWorkspaceKnowledgeContext(workspaceId);
        if (workspaceKnowledge) {
            documentContext += workspaceKnowledge;
            console.log(`📚 [AI] Workspace knowledge loaded: ${workspaceKnowledge.length} chars`);
        } else {
            console.log(`⚠️ [AI] No workspace knowledge found for workspace: ${workspaceId}`);
        }

        if (activeBot.documents && activeBot.documents.length > 0) {
            documentContext += "\n=== BOT DÖKÜMALARI ===\n" + activeBot.documents.map(d => `--- ${d.filename} ---\n${d.content}\n`).join("\n");
            console.log(`📄 [AI] Bot documents loaded: ${activeBot.documents.length} documents`);
        } else {
            console.log(`⚠️ [AI] No bot documents found for bot: ${activeBot.name}`);
        }

        // 🏥 Probel bağlantısı olan workspace'ler için dinamik branş+doktor listesi enjekte et
        if (hasHealthApi) {
            try {
                const healthContext = await getDynamicHealthContext(workspaceId);
                if (healthContext) {
                    documentContext += healthContext;
                    console.log(`🏥 [AI] Dynamic health context injected: ${healthContext.length} chars`);
                }
            } catch (healthErr) {
                console.error(`⚠️ [AI] Health context injection failed (non-fatal):`, healthErr.message);
            }
        }

        // Detect language from bot prompt
        const isEnglish = /\b(english|respond|answer|customer|provide|information|service|assist|help me|inquiry|please)\b/i.test(systemPrompt);

        // Add instruction to use knowledge base
        if (documentContext) {
            systemPrompt += isEnglish
                ? "\n\nIMPORTANT: Answer customer questions using the Knowledge Base, Company Information and Bot Documents below. Do not answer outside of this information."
                : "\n\nÖNEMLİ: Aşağıdaki Bilgi Bankası, Şirket Bilgileri ve Bot Dökümanlarını kullanarak müşteri sorularını yanıtla. Bu bilgiler dışında cevap verme.";
            console.log(`📋 [AI] Total document context: ${documentContext.length} chars`);
        } else {
            console.log(`⚠️ [AI] No document context available!`);
        }

        // 🚀 Probel appointment bot: Use code-defined prompt as BASE, preserve bot's custom info as supplement
        if (isProbelBot) {
            const { DEFAULT_APPOINTMENT_PROMPT } = await import('../services/appointmentBot.service.js');
            // Bot'un DB'deki özel prompt'u varsa, randevu kurallarından SONRA ek bilgi olarak ekle
            const botCustomPrompt = systemPrompt || '';
            systemPrompt = DEFAULT_APPOINTMENT_PROMPT;
            if (botCustomPrompt && !botCustomPrompt.includes('RANDEVU AKIŞI')) {
                // Sadece randevu akışı kuralları DEĞİLSE ek bilgi olarak ekle (hastane adı, özel talimatlar vb.)
                systemPrompt += '\n\nEK BİLGİLER (Bot yöneticisi tarafından eklenen):\n' + botCustomPrompt;
            }
        }

        const convShort = conversationId ? conversationId.substring(0, 8) : 'N/A';
        console.log(`🤖 [AI][${convShort}] System Prompt (first 200 chars): ${systemPrompt.substring(0, 200)}...`);
        // For COMMENTS type, there's no conversation history - just respond to the single comment
        const validMessages = (type === 'COMMENTS' || !conversation?.messages)
            ? []
            : conversation.messages
                .filter(msg => msg.content && msg.content.trim().length > 0)
                .reverse();

        // Get current date and time
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        let currentDate, currentDay;
        if (isEnglish) {
            const enMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            const enDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            currentDate = `${enMonths[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
            currentDay = enDays[now.getDay()];
        } else {
            const turkishMonths = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
            const turkishDays = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
            currentDate = `${now.getDate()} ${turkishMonths[now.getMonth()]} ${now.getFullYear()}`;
            currentDay = turkishDays[now.getDay()];
        }

        // Build customer info string from contact data
        const contact = conversation?.contact;
        let customerInfo = '';
        let hasContactInfo = false;
        if (contact) {
            const infoParts = [];
            if (contact.name && contact.name !== 'Web Ziyaretçisi') {
                infoParts.push(`${isEnglish ? 'Customer Name' : 'Müşteri Adı'}: ${contact.name}`);
                hasContactInfo = true;
            }
            if (contact.phone) {
                infoParts.push(`${isEnglish ? 'Phone' : 'Telefon'}: ${contact.phone}`);
                hasContactInfo = true;
            }
            if (contact.email) {
                infoParts.push(`${isEnglish ? 'Email' : 'E-posta'}: ${contact.email}`);
                hasContactInfo = true;
            }
            if (infoParts.length > 0) {
                customerInfo = infoParts.join('\n');
                if (!isProbelBot) {
                    customerInfo += isEnglish
                        ? '\n\n⚠️ WARNING: The above information is ALREADY AVAILABLE! Do NOT ask for it again!'
                        : '\n\n⚠️ UYARI: Yukarıdaki bilgiler ZATEN MEVCUT! Bu bilgileri tekrar SORMA!';
                }
            } else {
                customerInfo = isEnglish ? 'No customer information available.' : 'Müşteri bilgisi mevcut değil.';
            }
        } else {
            customerInfo = isEnglish ? 'No customer information available.' : 'Müşteri bilgisi mevcut değil.';
        }

        // If contact info exists, add prefix to bot prompt to prevent asking
        let enhancedSystemPrompt = systemPrompt;
        if (hasContactInfo) {
            enhancedSystemPrompt = isEnglish
                ? `⛔ IMPORTANT: Customer's name and phone number are ALREADY KNOWN. Do NOT ask for this information again!\n\n${enhancedSystemPrompt}`
                : `⛔ ÖNEMLİ: Müşterinin isim ve telefon bilgisi ZATEN VAR. Bu bilgileri TEKRAR SORMA!\n\n${enhancedSystemPrompt}`;
        }

        // Aşama gereksinim kontrolü — eksik alanları bot'a bildir
        let stageQualHint = '';
        if (conversation?.funnelStageId) {
            try {
                const { checkStageRequirements } = await import('../services/stageQualification.service.js');
                const stageReq = await checkStageRequirements(conversationId);
                if (stageReq.promptHint) {
                    stageQualHint = stageReq.promptHint;
                }
            } catch (sqErr) {
                console.error('⚠️ [StageQual] Non-fatal error:', sqErr.message);
            }
        }
        if (stageQualHint) {
            enhancedSystemPrompt += stageQualHint;
        }

        // Add funnel/stage/team context to bot prompt
        let contextBlock = '';
        if (conversation?.funnelType) {
            const funnel = await prisma.funnel.findUnique({
                where: { id: conversation.funnelType },
                select: { name: true }
            }).catch(() => null);
            
            if (funnel) contextBlock += `\nMevcut Akış: ${funnel.name}`;
        }
        if (conversation?.funnelStageId) {
            const stage = await prisma.funnelStage.findUnique({
                where: { id: conversation.funnelStageId },
                select: { name: true }
            }).catch(() => null);
            
            if (stage) contextBlock += `\nMevcut Aşama: ${stage.name}`;
        }
        if (conversation?.assignedTeamId) {
            const team = await prisma.team.findUnique({
                where: { id: conversation.assignedTeamId },
                select: { name: true }
            }).catch(() => null);
            
            if (team) contextBlock += `\nSorumlu Takım: ${team.name}`;
        }

        if (contextBlock) {
            enhancedSystemPrompt += `\n\n--- CRM BAĞLAM ---${contextBlock}\n--- CRM BAĞLAM SONU ---\n`;
        }

        // Build enhanced system instruction with clear structure
        // Add critical warning at the VERY TOP if contact info exists
        const contactWarning = hasContactInfo
            ? (isEnglish
                ? `🚫🚫🚫 MOST IMPORTANT RULE 🚫🚫🚫
CUSTOMER'S NAME AND PHONE NUMBER ARE ALREADY KNOWN!
- Name: ${contact?.name || 'Unknown'}
- Phone: ${contact?.phone || 'Unknown'}
DO NOT ASK THE CUSTOMER FOR THIS INFORMATION AGAIN!
🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫

`
                : `🚫🚫🚫 EN ÖNEMLİ KURAL 🚫🚫🚫
MÜŞTERİNİN İSMİ VE TELEFON NUMARASI ZATEN BİLİNİYOR!
- İsim: ${contact?.name || 'Bilinmiyor'}
- Telefon: ${contact?.phone || 'Bilinmiyor'}
BU BİLGİLERİ MÜŞTERİDEN TEKRAR İSTEME! GSM, telefon, isim, ad-soyad SORMA!
Bu kuralı ihlal edersen işten atılırsın.
🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫

`)
            : '';

        // Handoff message: use bot-specific or default
        const defaultHandoffMsgTR = 'Bu konuda detaylı bilgi için web sitemizi ziyaret edebilir veya iletişim sayfamızdaki bilgiler aracılığıyla ekibimize ulaşabilirsiniz. Size en kısa sürede yardımcı olacaklardır. 🤝';
        const defaultHandoffMsgEN = "For detailed information on this topic, please visit our website or reach out to our team through the contact details on our website. They will be happy to assist you. 🤝";
        const handoffMsg = activeBot.handoffMessage || (isEnglish ? defaultHandoffMsgEN : defaultHandoffMsgTR);

        const fullSystemInstruction = isEnglish
            ? `${contactWarning}### CURRENT DATE AND TIME ###
Today: ${currentDay}, ${currentDate}
Time: ${currentTime}
Year: ${now.getFullYear()}

### CUSTOMER INFORMATION ###
${customerInfo}

### AVAILABLE INFORMATION ###
${documentContext || "Knowledge base is empty."}

### DEFAULT RESPONSE RULES ###
1. **STRICT FACTUAL GROUNDING (ZERO HALLUCINATION)**: ONLY respond using the information in AVAILABLE INFORMATION (Knowledge Base, Company Info, Documents) and PRIMARY SYSTEM INSTRUCTION. Do NOT interpret creatively, guess, extrapolate, or invent any rules, conditions, prices, guarantees, policies, or services that are not explicitly stated.
2. **IMPORTANT**: If the knowledge base and prompt do NOT contain information about the topic asked AND it is not a simple greeting, DO NOT invent or guess an answer. Write [HANDOFF] at the beginning of your response and then say "${handoffMsg}". Never write [HANDOFF] for greetings or introductions — just greet them warmly.
3. **BALANCED MEDIUM LENGTH (CONCISE AND CLEAR)**: Never write excessively long responses, essays, or dense paragraphs. Keep replies balanced and medium-length (ideally 2-4 sentences), directly answering the user's specific question in a clear, professional, and friendly tone. Do not dump entire documents; summarize only what was asked.
4. Respond in English.
5. Always try to help the customer.
6. If asked about date or time, use the CURRENT DATE information above, do NOT use your own knowledge.
7. If you CAN answer the question from the knowledge base, do NOT write [HANDOFF].
8. If asked for customer name or contact info, use the CUSTOMER INFORMATION section above.
9. **CRITICAL**: If the CUSTOMER INFORMATION section above has "Customer Name" and/or "Phone" filled in, NEVER ask the customer for name or phone! This info is already available.
10. **CRITICAL**: If the user EXPLICITLY asks to speak to a representative, agent, or human (e.g. "connect me to an agent", "I want to talk to a person"), you MUST write [HANDOFF] at the beginning of your response.
11. **CRITICAL - LANGUAGE RULES**: NEVER use first-person language ("I", "I'm", "I think", "I'm not sure"). NEVER express uncertainty ("I'm not sure", "I don't know", "I believe"). Always speak on behalf of the establishment using "we/our" (e.g. "Our team will assist you"). If you don't have the answer, directly redirect to the website or email — never say you are unsure.
12. **MULTI-BRANCH CLARIFICATION**: If your knowledge base or documents contain information for multiple separate branches/locations and the customer asks a general question without specifying their preferred branch (e.g. "Can I get more info?", "What are the prices?"), do NOT assume or dump information for only one branch. Instead, politely ask which branch they are interested in. Once the customer specifies the branch, provide the relevant details for that branch.
13. **EXCEPTIONS, WAIVERS & ENTRANCE FEES**: Never grant waivers, free services, or unauthorized exceptions (e.g., "can I get service without entrance fee?") unless EXPLICITLY stated in the knowledge base. In spa/hamam facilities, entrance fee is mandatory to receive massage or scrub services.
14. **NO FABRICATED LINKS**: Never invent markdown links or URLs (e.g. [Prices](https://...)) unless the exact URL is explicitly given in the knowledge base.

${getSectorPrompt(wsAppointmentCheck?.industry, `${wsAppointmentCheck?.companyName || ''} ${wsAppointmentCheck?.companyDescription || ''} ${activeBot.prompt || ''} ${documentContext || ''}`)}

### ⭐ PRIMARY SYSTEM INSTRUCTION (HIGHEST PRIORITY) ⭐ ###
The following instruction was written by the business owner and OVERRIDES any conflicting default rules above. Always follow these instructions first:

${enhancedSystemPrompt}`
            : `${contactWarning}### GÜNCEL TARİH VE SAAT ###
Bugün: ${currentDay}, ${currentDate}
Saat: ${currentTime} (Türkiye Saati)
Yıl: ${now.getFullYear()}

### MÜŞTERİ BİLGİLERİ ###
${customerInfo}

### KULLANILACAK BİLGİLER ###
${documentContext || "Bilgi bankası boş."}

### VARSAYILAN YANITLAMA KURALLARI ###
1. **SIFIR TAHMİN / SIFIR UYDURMA (KATI KURAL)**: SADECE VE YALNIZCA yukarıdaki "KULLANILACAK BİLGİLER" (Bilgi Bankası, Şirket Bilgileri, Dökümanlar, SSS) ve "ANA SİSTEM TALİMATI"nda yer alan doğrulanmış resmi bilgileri kullan. Bu kaynaklarda açıkça yazmayan hiçbir kural, fiyat, şart, vaat, özellik, prosedür, indirim veya hizmet hakkında KENDİNCE YORUM YAPMA, TAHMİN YÜRÜTME VEYA ASLA KAFANDAN BİLGİ UYDURMA!
2. **ÖNEMLİ**: Eğer bilgi bankasında ve AI prompt'ta sorulan konuyla ilgili BİLGİ YOKSA: ASLA kendince bir cevap veya tahmin üretme! Mesaj sadece selamlama/tanışma değilse, yanıtının başına [HANDOFF] yaz ve ardından "${handoffMsg}" mesajını ver. Selamlama mesajlarına (selam, merhaba, iyi günler, nasılsınız, vs.) ASLA [HANDOFF] yazma, nazikçe karşıla.
3. **ORTA VE DENGELİ MESAJ UZUNLUĞU (UZUN OLMADAN, ÖZ VE NET)**: Yanıtların ASLA çok uzun, destan gibi, paragraflar dolusu veya gereksiz açıklamalarla dolu olmasın! İdeal olarak 2-4 cümlelik, doğrudan müşterinin sorusuna cevap veren, orta düzeyde uzunlukta, net ve profesyonel olsun. Bilgi bankasındaki tüm metinleri kopyalama, sadece ilgili kısmı özetleyerek aktar.
4. Türkçe yanıt ver.
5. Müşteriye her zaman yardımcı olmaya çalış.
6. Tarih veya saat sorulursa yukarıdaki GÜNCEL TARİH bilgisini kullan, kendi bilgini KULLANMA.
7. Eğer soruya bilgi bankasından cevap verebiliyorsan, [HANDOFF] YAZMA.
8. Müşteri adını veya iletişim bilgilerini sorulursa yukarıdaki MÜŞTERİ BİLGİLERİ kısmını kullan.
9. **KRİTİK**: Yukarıdaki MÜŞTERİ BİLGİLERİ kısmında "Müşteri Adı" ve/veya "Telefon" bilgisi DOLUYSA, müşteriden ASLA isim veya telefon numarası isteme! Bu bilgiler zaten mevcut.
10. **KRİTİK**: Eğer müşteri AÇIKÇA bir temsilci, yetkili veya gerçek kişiyle konuşmak istediğini belirtirse (örn. "temsilciye bağla", "müşteri temsilcisi istiyorum", "gerçek kişiyle konuşmak istiyorum"), yanıtının başına MUTLAKA [HANDOFF] yaz.
11. **KRİTİK - DİL KURALLARI**: ASLA birinci şahıs dili kullanma ("ben", "benim", "bence", "sanırım", "düşünüyorum"). ASLA belirsizlik ifadesi kullanma ("emin değilim", "bilmiyorum", "tam olarak bilemiyorum", "şu an bilgi sahibi değilim"). Her zaman kurum adına "biz/bizim/ekibimiz" şeklinde konuş (örn. "Ekibimiz size yardımcı olacaktır"). Cevabını bilmediğin sorularda "emin değilim" DEME, doğrudan yetkiliye aktaracağını belirt.
12. **ÇOKLU ŞUBE KURALI**: Eğer bilgi bankanızda veya dökümanlarınızda birden fazla ayrı şube/lokasyon bilgisi varsa ve müşteri belirli bir şube belirtmeden genel bir hizmet/fiyat sorduysa, doğrudan tek bir şubenin fiyatını vermek yerine müşteriye hangi şube için bilgi almak istediğini sor. Müşteri şubesini belirttikten sonra o şubenin detaylarını ver.
13. **İSTİSNA, MUAFİYET VE GİRİŞ ÜCRETİ KURALI (ASLA KAFANDAN ONAY VERME)**: Müşteri "giriş ücreti ödemeden olur mu?", "şunu ödemeden sadece şunu alabilir miyim?", "ücretsiz mi?", "ayrı almam mümkün mü?", "indirim olur mu?" gibi şartları/ücretleri esnetme soruları sorduğunda: EĞER Bilgi Bankasında veya AI Prompt metninde bunun mümkün olduğu KELİMESİ KELİMESİNE AÇIKÇA YAZMIYORSA, KESİNLİKLE "mümkündür", "ayrı alabilirsiniz", "giriş ücreti ödemeden hizmet almanız mümkündür" GİBİ BİR ONAY VERME! Örneğin hamam/spa tesislerinde giriş ücreti ödenmeden tek başına kese-köpük veya tek başına masaj ALINAMAZ; tesis giriş ücreti + hizmet bedeli birlikte alınmak zorundadır.
14. **HAYALİ LİNK VE BAĞLANTI YASAĞI**: Bilgi bankasında veya sistem talimatında açıkça tam link/URL verilmemişse, ASLA kafandan markdown link (örn: [Fiyatlar](https://...)) veya uydurma internet adresi türetme.

${getSectorPrompt(wsAppointmentCheck?.industry, `${wsAppointmentCheck?.companyName || ''} ${wsAppointmentCheck?.companyDescription || ''} ${activeBot.prompt || ''} ${documentContext || ''}`)}

### ⭐ ANA SİSTEM TALİMATI (EN YÜKSEK ÖNCELİK) ⭐ ###
Aşağıdaki talimat işletme sahibi tarafından yazılmıştır ve yukarıdaki varsayılan kurallarla çeliştiğinde BU TALİMAT GEÇERLİDİR. Her zaman önce bu talimata uy:

${enhancedSystemPrompt}`;

        // 🏥 PROBEL BOT — Build a clean, focused system instruction
        let finalSystemInstruction;
        if (isProbelBot) {
            let appointmentContextPrompt = '';
            if (conversation?.appointmentState) {
                try {
                    const aptState = JSON.parse(conversation.appointmentState);
                    if (aptState.step !== 'COMPLETED') {
                        appointmentContextPrompt = `\n\n### 🏥 RANDEVU AKIŞI DURUMU ###\nBu müşteri ile randevu akışı devam ediyor.\nMevcut durum: ${JSON.stringify(aptState)}\nZaten toplanan bilgileri TEKRAR SORMA, eksik bilgileri toplamaya devam et.`;
                    }
                } catch (e) { }
            }
            
            // Randevu botu için SADECE randevu prompt'u + tarih bilgisi kullan
            // Genel kurallar ([HANDOFF], bilgi bankası, vb.) randevu akışını bozuyor!
            finalSystemInstruction = `### GÜNCEL TARİH VE SAAT ###
Bugün: ${currentDay}, ${currentDate}
Saat: ${currentTime} (Türkiye Saati)
Yıl: ${now.getFullYear()}

### MÜŞTERİ BİLGİLERİ ###
${customerInfo}

### RANDEVU ASİSTANI TALİMATI ###
${systemPrompt}${appointmentContextPrompt}`;
            
            console.log(`🏥 [AI][${convShort}] Using clean appointment-only system instruction`);
        } else {
            // Normal bot — use full system instruction with all rules
            finalSystemInstruction = fullSystemInstruction;
        }

        // Build chat history WITHOUT the system instruction embedded in it.
        // The system instruction is passed via the systemInstruction parameter instead,
        // which prevents Gemini from ever echoing it back as a customer-facing reply.
        const historyParts = [];

        let lastRole = "model"; // We build from model perspective after system prompt

        for (const msg of validMessages) {
            const currentRole = msg.isFromContact ? "user" : "model";

            if (currentRole === lastRole) {
                // Merge with previous message
                if (historyParts.length > 0) {
                    historyParts[historyParts.length - 1].parts[0].text += `\n\n${msg.content}`;
                } else {
                    historyParts.push({
                        role: currentRole,
                        parts: [{ text: msg.content }]
                    });
                }
            } else {
                // New turn
                historyParts.push({
                    role: currentRole,
                    parts: [{ text: msg.content }]
                });
                lastRole = currentRole;
            }
        }

        // 🔧 Gemini API requires the first history entry to be role 'user'.
        // If the conversation started with a bot message (e.g. welcome/greeting),
        // strip leading 'model' entries to prevent "First content should be with role 'user'" error.
        while (historyParts.length > 0 && historyParts[0].role === 'model') {
            historyParts.shift();
            console.log(`🔧 [AI] Stripped leading 'model' entry from history to satisfy Gemini API requirement`);
        }

        // Determine the final message to send (must be from user)
        let finalUserMessage = userMessage || (isEnglish ? 'Hello' : 'Merhaba');

        // If the last history item is the same as finalUserMessage, pop it to use as trigger
        if (historyParts.length > 0 && historyParts[historyParts.length - 1].role === 'user') {
            const lastHistoryMsg = historyParts[historyParts.length - 1].parts[0].text;
            // If the last user message in history matches current userMessage, pop and use it
            if (userMessage && lastHistoryMsg.includes(userMessage)) {
                historyParts.pop();
            }
        }

        // 4. Generate
        // Get API Key (workspace key > global key)
        const aiApiKey = await getEffectiveAiApiKey(workspaceId);
        if (!aiApiKey) {
            console.error(`❌ AI Auto-Reply error: Workspace ${workspaceId} has NO aiApiKey configured.`);
            if (type === 'CHATS' && conversationId) releaseAiReplyLock(conversationId);
            return null;
        }

        const genAI = new GoogleGenerativeAI(aiApiKey);

        // Format tools for Gemini Function Calling
        const geminiTools = [];
        if (activeBot.tools && activeBot.tools.length > 0) {
            const functionDeclarations = activeBot.tools.map(tool => {
                let schema = { type: "object", properties: {} };
                try {
                    if (tool.parametersSchema) {
                        schema = typeof tool.parametersSchema === 'string'
                            ? JSON.parse(tool.parametersSchema)
                            : tool.parametersSchema;
                    }
                } catch (e) {
                    console.error('Schema parse error:', e);
                }

                return {
                    name: tool.name,
                    description: tool.description,
                    parameters: schema
                };
            });

            const builtInTools = [
                {
                    name: "transfer_to_team",
                    description: "Görüşmeyi bir takımın asistanına veya insan temsilciye devretmek için kullanılır.",
                    parameters: {
                        type: "object",
                        properties: {
                            team_name: { type: "string", description: "Devredilecek takımın adı" },
                            reason: { type: "string", description: "Devir nedeni" }
                        },
                        required: ["team_name"]
                    }
                },
                {
                    name: "change_funnel_stage",
                    description: "Müşteriyi satış veya süreç hunisinde belirli bir aşamaya taşımak için kullanılır.",
                    parameters: {
                        type: "object",
                        properties: {
                            funnel_name: { type: "string", description: "Huni adı (Örn: 'Satış Akışı')" },
                            stage_name: { type: "string", description: "Aşama adı" }
                        },
                        required: ["funnel_name", "stage_name"]
                    }
                },
                {
                    name: "send_whatsapp_template",
                    description: "Kişiye WhatsApp üzerinden hazır bir şablon mesaj (örn: Konum) göndermek için kullanılır.",
                    parameters: {
                        type: "object",
                        properties: {
                            template_name: { type: "string", description: "Gönderilecek şablonun adı" }
                        },
                        required: ["template_name"]
                    }
                },
                {
                    name: "recommend_product",
                    description: "Müşteriye ürün kategori veya arama kriterine göre ürün önerir",
                    parameters: {
                        type: "object",
                        properties: {
                            query: { type: "string", description: "Arama terimi" },
                            category: { type: "string", description: "Ürün kategorisi" }
                        }
                    }
                },
                {
                    name: "create_order",
                    description: "Müşteri için sipariş oluşturur",
                    parameters: {
                        type: "object",
                        properties: {
                            product_name: { type: "string", description: "Ürün adı" },
                            quantity: { type: "number", description: "Adet" },
                            notes: { type: "string", description: "Sipariş notu" }
                        },
                        required: ["product_name"]
                    }
                },
                {
                    name: "send_payment_link",
                    description: "Müşteriye ödeme linki veya ödeme talebi gönderir",
                    parameters: {
                        type: "object",
                        properties: {
                            amount: { type: "number", description: "Ödeme tutarı (TL)" },
                            description: { type: "string", description: "Ödeme açıklaması" },
                            order_id: { type: "string", description: "İlişkili sipariş ID" }
                        },
                        required: ["amount"]
                    }
                },
                {
                    name: "create_appointment",
                    description: "Müşteri için randevu oluşturur",
                    parameters: {
                        type: "object",
                        properties: {
                            date: { type: "string", description: "Tarih (YYYY-MM-DD)" },
                            time: { type: "string", description: "Saat (HH:MM)" },
                            notes: { type: "string", description: "Randevu notu" }
                        },
                        required: ["date"]
                    }
                },
                {
                    name: "send_location",
                    description: "Şube veya ofis konum bilgisini gönderir",
                    parameters: {
                        type: "object",
                        properties: {
                            branch_name: { type: "string", description: "Şube adı" }
                        }
                    }
                },
                {
                    name: "add_note",
                    description: "Müşteri kaydına not ekler",
                    parameters: {
                        type: "object",
                        properties: {
                            note: { type: "string", description: "Not içeriği" },
                            title: { type: "string", description: "Not başlığı" }
                        },
                        required: ["note"]
                    }
                },
                {
                    name: "add_tag",
                    description: "Müşteriye etiket ekler",
                    parameters: {
                        type: "object",
                        properties: {
                            tag_name: { type: "string", description: "Etiket adı" }
                        },
                        required: ["tag_name"]
                    }
                },
                {
                    name: "check_stock",
                    description: "Ürün stok durumunu kontrol eder",
                    parameters: {
                        type: "object",
                        properties: {
                            product_name: { type: "string", description: "Ürün adı" }
                        },
                        required: ["product_name"]
                    }
                }
            ];

            // Filter out tools that will be provided by appointment bot to avoid duplicates
            const appointmentBotToolNames = isAppointmentBot && activeBot._appointmentTools
                ? activeBot._appointmentTools.map(t => t.name)
                : [];
            const filteredBuiltIn = builtInTools.filter(t => !appointmentBotToolNames.includes(t.name));
            const allDeclarations = [...functionDeclarations, ...filteredBuiltIn];
            geminiTools.push({ functionDeclarations: allDeclarations });
        } else {
            const builtInTools = [
                {
                    name: "transfer_to_team",
                    description: "Görüşmeyi bir takımın asistanına veya insan temsilciye devretmek için kullanılır.",
                    parameters: {
                        type: "object",
                        properties: {
                            team_name: { type: "string", description: "Devredilecek takımın adı" },
                            reason: { type: "string", description: "Devir nedeni" }
                        },
                        required: ["team_name"]
                    }
                },
                {
                    name: "change_funnel_stage",
                    description: "Müşteriyi satış veya süreç hunisinde belirli bir aşamaya taşımak için kullanılır.",
                    parameters: {
                        type: "object",
                        properties: {
                            funnel_name: { type: "string", description: "Huni adı (Örn: 'Satış Akışı')" },
                            stage_name: { type: "string", description: "Aşama adı" }
                        },
                        required: ["funnel_name", "stage_name"]
                    }
                },
                {
                    name: "send_whatsapp_template",
                    description: "Kişiye WhatsApp üzerinden hazır bir şablon mesaj (örn: Konum) göndermek için kullanılır.",
                    parameters: {
                        type: "object",
                        properties: {
                            template_name: { type: "string", description: "Gönderilecek şablonun adı" }
                        },
                        required: ["template_name"]
                    }
                },
                {
                    name: "recommend_product",
                    description: "Müşteriye ürün kategori veya arama kriterine göre ürün önerir",
                    parameters: {
                        type: "object",
                        properties: {
                            query: { type: "string", description: "Arama terimi" },
                            category: { type: "string", description: "Ürün kategorisi" }
                        }
                    }
                },
                {
                    name: "create_order",
                    description: "Müşteri için sipariş oluşturur",
                    parameters: {
                        type: "object",
                        properties: {
                            product_name: { type: "string", description: "Ürün adı" },
                            quantity: { type: "number", description: "Adet" },
                            notes: { type: "string", description: "Sipariş notu" }
                        },
                        required: ["product_name"]
                    }
                },
                {
                    name: "send_payment_link",
                    description: "Müşteriye ödeme linki veya ödeme talebi gönderir",
                    parameters: {
                        type: "object",
                        properties: {
                            amount: { type: "number", description: "Ödeme tutarı (TL)" },
                            description: { type: "string", description: "Ödeme açıklaması" },
                            order_id: { type: "string", description: "İlişkili sipariş ID" }
                        },
                        required: ["amount"]
                    }
                },
                {
                    name: "create_appointment",
                    description: "Müşteri için randevu oluşturur",
                    parameters: {
                        type: "object",
                        properties: {
                            date: { type: "string", description: "Tarih (YYYY-MM-DD)" },
                            time: { type: "string", description: "Saat (HH:MM)" },
                            notes: { type: "string", description: "Randevu notu" }
                        },
                        required: ["date"]
                    }
                },
                {
                    name: "send_location",
                    description: "Şube veya ofis konum bilgisini gönderir",
                    parameters: {
                        type: "object",
                        properties: {
                            branch_name: { type: "string", description: "Şube adı" }
                        }
                    }
                },
                {
                    name: "add_note",
                    description: "Müşteri kaydına not ekler",
                    parameters: {
                        type: "object",
                        properties: {
                            note: { type: "string", description: "Not içeriği" },
                            title: { type: "string", description: "Not başlığı" }
                        },
                        required: ["note"]
                    }
                },
                {
                    name: "add_tag",
                    description: "Müşteriye etiket ekler",
                    parameters: {
                        type: "object",
                        properties: {
                            tag_name: { type: "string", description: "Etiket adı" }
                        },
                        required: ["tag_name"]
                    }
                },
                {
                    name: "check_stock",
                    description: "Ürün stok durumunu kontrol eder",
                    parameters: {
                        type: "object",
                        properties: {
                            product_name: { type: "string", description: "Ürün adı" }
                        },
                        required: ["product_name"]
                    }
                }
            ];
            // Filter out tools that will be provided by appointment bot to avoid duplicates
            const appointmentBotToolNames = isAppointmentBot && activeBot._appointmentTools
                ? activeBot._appointmentTools.map(t => t.name)
                : [];
            const filteredBuiltIn = builtInTools.filter(t => !appointmentBotToolNames.includes(t.name));
            geminiTools.push({ functionDeclarations: filteredBuiltIn });
        }

        // 🏥 Append appointment bot tools if applicable
        if (isAppointmentBot && activeBot._appointmentTools) {
            if (geminiTools.length === 0) {
                geminiTools.push({ functionDeclarations: activeBot._appointmentTools });
            } else {
                geminiTools[0].functionDeclarations.push(...activeBot._appointmentTools);
            }
            console.log(`🏥 [AI] Appointment tools appended to Gemini tools`);
        }

        // Fallback Logic - system instruction passed via systemInstruction parameter (NEVER as user message)
        const tryGenerate = async (modelName) => {
            const modelConfig = {
                model: modelName,
                systemInstruction: finalSystemInstruction,
                generationConfig: {
                    temperature: 0.2, // Strict grounding, zero hallucination
                }
            };

            if (geminiTools.length > 0) {
                modelConfig.tools = geminiTools;
            }

            const model = genAI.getGenerativeModel(modelConfig);
            const chat = model.startChat({ history: historyParts });

            let chatResult = await chat.sendMessage(finalUserMessage);
            let responseObj = chatResult.response;

            // Handle Function Calling recursively
            let callCount = 0;
            while (callCount < 5) {
                callCount++;
                let functionCalls = [];
                if (typeof responseObj.functionCalls === 'function') {
                    functionCalls = responseObj.functionCalls();
                } else if (typeof responseObj.functionCalls === 'object' && responseObj.functionCalls !== null) {
                    functionCalls = responseObj.functionCalls;
                } else if (responseObj.candidates?.[0]?.content?.parts) {
                    functionCalls = responseObj.candidates[0].content.parts
                        .filter(p => p.functionCall)
                        .map(p => p.functionCall);
                }

                if (!functionCalls || functionCalls.length === 0) {
                    break;
                }

                let functionResponsesParts = [];
                for (const call of functionCalls) {
                    console.log(`⚙️ Gemini called function: ${call.name} with args:`, call.args);

                    // 🏥 Check if this is an appointment bot function
                    const appointmentFunctions = ['validate_patient', 'get_branches', 'get_doctors', 'get_available_days', 'get_available_hours', 'check_availability', 'create_appointment', 'handoff_to_human'];
                    if (isAppointmentBot && appointmentFunctions.includes(call.name)) {
                        try {
                            const { executeAppointmentFunction } = await import('../services/appointmentBot.service.js');
                            const result = await executeAppointmentFunction(call.name, call.args, workspaceId, conversationId, activeBot.id);

                            functionResponsesParts.push({
                                functionResponse: {
                                    name: call.name,
                                    response: result
                                }
                            });
                        } catch (aptErr) {
                            console.error(`🏥 Appointment function failed:`, aptErr);
                            functionResponsesParts.push({
                                functionResponse: {
                                    name: call.name,
                                    response: { error: aptErr.message }
                                }
                            });
                        }
                    } else if (['transfer_to_team', 'change_funnel_stage', 'send_whatsapp_template', 'recommend_product', 'create_order', 'send_payment_link', 'create_appointment', 'send_location', 'add_note', 'add_tag', 'check_stock'].includes(call.name)) {
                        try {
                            const { executeBuiltInTool } = await import('../utils/builtInToolExecutor.js');
                            // Need to pass conversation if available
                            const result = await executeBuiltInTool(call.name, call.args, {
                                workspaceId,
                                conversationId,
                                activeBotId: activeBot.id
                            });

                            functionResponsesParts.push({
                                functionResponse: {
                                    name: call.name,
                                    response: result
                                }
                            });
                        } catch (toolErr) {
                            console.error(`⚙️ Built-in Tool execution failed:`, toolErr);
                            functionResponsesParts.push({
                                functionResponse: {
                                    name: call.name,
                                    response: { error: toolErr.message }
                                }
                            });
                        }
                    } else {
                        // Regular tool execution
                        const tool = activeBot.tools?.find(t => t.name === call.name);

                        if (tool) {
                            try {
                                const { executeToolRequest } = await import('../utils/toolExecutor.js');
                                const result = await executeToolRequest(tool, call.args);

                                functionResponsesParts.push({
                                    functionResponse: {
                                        name: call.name,
                                        response: result
                                    }
                                });
                            } catch (toolErr) {
                                console.error(`⚙️ Tool execution failed:`, toolErr);
                                functionResponsesParts.push({
                                    functionResponse: {
                                        name: call.name,
                                        response: { error: toolErr.message }
                                    }
                                });
                            }
                        } else {
                            functionResponsesParts.push({
                                functionResponse: {
                                    name: call.name,
                                    response: { error: "Function not found" }
                                }
                            });
                        }
                    }
                }
                
                if (functionResponsesParts.length > 0) {
                    console.log(`📡 [AI] Sending function responses back to Gemini:`, JSON.stringify(functionResponsesParts).substring(0, 500));
                    chatResult = await chat.sendMessage(functionResponsesParts);
                    responseObj = chatResult.response;
                    
                    try {
                        const tempText = responseObj.text();
                        console.log(`🤖 [AI] Gemini text after function response:`, tempText.substring(0, 200));
                    } catch (e) {
                        console.log(`🤖 [AI] Gemini text after function response: [No text or another function call]`);
                    }
                } else {
                    break;
                }
            }

            return chatResult;
        };

        let result;
        const effectiveModel = await getEffectiveAiModel(workspaceId);
        console.log(`🤖 [AI] Using model: ${effectiveModel} for workspace ${workspaceId}`);
        try {
            result = await tryGenerate(effectiveModel);
        } catch (e) {
            console.warn(`⚠️ [AI] Primary model (${effectiveModel}) failed for workspace ${workspaceId}: ${e.message}`);

            // 429 Rate Limit → 3 saniye bekle + farklı modelle dene
            if (e.message.includes('429') || e.message.includes('Resource exhausted')) {
                console.log('⏳ [AI] Rate limited, waiting 3s before fallback...');
                await new Promise(r => setTimeout(r, 3000));
            }

            try {
                const fallbackModel = effectiveModel === 'gemini-2.5-flash' ? 'gemini-2.0-flash' : 'gemini-2.5-flash';
                console.log(`🔄 [AI] Falling back to ${fallbackModel}...`);
                result = await tryGenerate(fallbackModel);
            } catch (fallbackError) {
                console.error(`❌ [AI] Both models failed for workspace ${workspaceId}. Primary: ${e.message}, Fallback: ${fallbackError.message}`);
                if (type === 'CHATS' && conversationId) releaseAiReplyLock(conversationId);
                return null;
            }
        }

        let responseText = "";
        try {
            responseText = stripAiThinking(result.response.text());
            console.log(`✅ [AI] Final Response Text length: ${responseText.length}`);
            if (!responseText || responseText.trim() === '') {
                console.warn(`⚠️ [AI] Response text is empty! Candidates:`, JSON.stringify(result.response.candidates));
                
                // Retry once if response is completely empty (Gemini sometimes freezes)
                try {
                    console.log(`🔄 [AI] Retrying with same message due to empty response...`);
                    result = await tryGenerate(effectiveModel);
                    responseText = stripAiThinking(result.response.text());
                    console.log(`✅ [AI] Retry Response Text length: ${responseText.length}`);
                } catch (retryErr) {
                    console.error(`❌ [AI] Retry also failed:`, retryErr.message);
                    responseText = "";
                }
            }
        } catch (e) {
            console.error(`❌ [AI] Error extracting text from response:`, e.message);
            console.log(`🔍 [AI] Response object:`, JSON.stringify(result.response));
            responseText = "";
        }

        // 🏥 Probel bot empty response fallback — state-aware auto-action
        if ((!responseText || responseText.trim() === '') && isProbelBot && conversationId) {
            console.log(`🏥 [AI][${convShort}] Empty response for appointment bot — checking state for smart fallback`);
            try {
                const { executeAppointmentFunction } = await import('../services/appointmentBot.service.js');
                
                // Check current appointment state
                let aptState = {};
                if (conversation?.appointmentState) {
                    try { aptState = JSON.parse(conversation.appointmentState); } catch(e) {}
                }
                
                // Determine action based on state
                const userInput = (userMessage || '').trim();
                
                if (aptState.hours && aptState.hours.length > 0 && !aptState.patient_name) {
                    // Hours shown, user selecting hour
                    const selectedHour = aptState.hours.find(h => 
                        String(h.sira) === userInput || 
                        h.saat === userInput
                    );
                    if (selectedHour) {
                        responseText = `Harika, randevunuzu ${selectedHour.saat} olarak işaretledim. İşlemi tamamlamak için lütfen Adınızı ve Soyadınızı yazar mısınız?`;
                    } else {
                        const hourList = aptState.hours.map(h => `${h.sira}. ${h.saat}`).join('\n');
                        responseText = `Lütfen listeden uygun bir saat seçin:\n\n${hourList}`;
                    }
                } else if (aptState.days && aptState.days.length > 0 && !aptState.hours) {
                    // Days shown, user selecting day
                    const selectedDay = aptState.days.find(d => 
                        String(d.sira) === userInput || 
                        d.tarih === userInput || 
                        (d.tarih_str && d.tarih_str.toLowerCase().includes(userInput.toLowerCase()))
                    );
                    if (selectedDay) {
                        console.log(`🏥 [AI][${convShort}] Auto-matching day: ${selectedDay.tarih}`);
                        const hourResult = await executeAppointmentFunction('get_available_hours', { 
                            servis_kodu: aptState.selected_service_code || aptState.doctors?.[0]?.servis_kodu,
                            tarih: selectedDay.tarih
                        }, workspaceId, conversationId);
                        if (hourResult && hourResult.success && hourResult.hours) {
                            const hourList = hourResult.hours.map(h => `${h.sira}. ${h.saat}`).join('\n');
                            responseText = `${selectedDay.tarih} tarihi için müsait saatler:\n\n${hourList}\n\nHangi saati tercih edersiniz?`;
                        } else {
                            responseText = hourResult?.message || 'Bu tarihte uygun saat bulunamadı.';
                        }
                    } else {
                        const dayList = aptState.days.map(d => `${d.sira}. ${d.tarih}`).join('\n');
                        responseText = `Lütfen listeden bir tarih seçin:\n\n${dayList}`;
                    }
                } else if (aptState.doctors && aptState.doctors.length > 0 && !aptState.days) {
                    // Doctors shown, user selecting doctor
                    const selectedDoc = aptState.doctors.find(d => 
                        String(d.sira) === userInput || 
                        d.doktor_adi.toLowerCase().includes(userInput.toLowerCase())
                    );
                    if (selectedDoc) {
                        console.log(`🏥 [AI][${convShort}] Auto-matching doctor: ${selectedDoc.doktor_adi}`);
                        // Update state to remember selected service code for get_available_hours
                        try {
                            const { updateAppointmentState } = await import('../services/appointmentBot.service.js');
                            await updateAppointmentState(conversationId, { selected_service_code: selectedDoc.servis_kodu });
                        } catch(e) {}
                        
                        const dayResult = await executeAppointmentFunction('get_available_days', { 
                            brans_kodu: selectedDoc.brans_kodu,
                            doktor_kodu: selectedDoc.doktor_kodu,
                            servis_kodu: selectedDoc.servis_kodu
                        }, workspaceId, conversationId);
                        
                        if (dayResult && dayResult.success && dayResult.days) {
                            const dayList = dayResult.days.map(d => `${d.sira}. ${d.tarih}`).join('\n');
                            responseText = `${selectedDoc.doktor_adi} için müsait günler:\n\n${dayList}\n\nHangi gün randevu almak istersiniz?`;
                        } else {
                            responseText = dayResult?.message || 'Bu doktor için uygun gün bulunamadı.';
                        }
                    } else {
                        const docList = aptState.doctors.map(d => `${d.sira}. ${d.doktor_adi}`).join('\n');
                        responseText = `Lütfen listeden doktor numarasını veya adını yazın:\n\n${docList}`;
                    }
                } else if (aptState.branches && aptState.branches.length > 0 && !aptState.doctors) {
                    // Branches already shown — user is selecting a branch
                    const selectedBranch = aptState.branches.find(b => 
                        String(b.sira) === userInput || 
                        b.brans_adi.toLowerCase().includes(userInput.toLowerCase())
                    );
                    
                    if (selectedBranch) {
                        console.log(`🏥 [AI][${convShort}] Auto-matching branch: ${selectedBranch.brans_adi}`);
                        const docResult = await executeAppointmentFunction('get_doctors', { brans_kodu: selectedBranch.brans_kodu, brans_adi: selectedBranch.brans_adi }, workspaceId, conversationId);
                        if (docResult && docResult.success && docResult.doctors) {
                            const docList = docResult.doctors.map(d => `${d.sira}. ${d.doktor_adi}`).join('\n');
                            responseText = `${selectedBranch.brans_adi} bölümündeki doktorlarımız:\n\n${docList}\n\nHangi doktoru tercih edersiniz?`;
                        } else {
                            responseText = docResult?.message || 'Bu bölümde uygun doktor bulunamadı.';
                        }
                    } else {
                        // Couldn't match — re-show branches
                        const branchList = aptState.branches.map(b => `${b.sira}. ${b.brans_adi}`).join('\n');
                        responseText = `Lütfen listeden bölüm numarasını veya adını yazın:\n\n${branchList}`;
                    }
                } else if (!aptState.branches || aptState.branches.length === 0) {
                    // No branches yet — fetch them
                    const branchResult = await executeAppointmentFunction('get_branches', {}, workspaceId, conversationId);
                    if (branchResult && branchResult.success && branchResult.branches) {
                        const branchList = branchResult.branches.map(b => `${b.sira}. ${b.brans_adi}`).join('\n');
                        responseText = `Merhaba! 😊 Randevu almak istediğiniz bölümü seçebilirsiniz:\n\n${branchList}\n\nHangi bölümden randevu almak istersiniz?`;
                        console.log(`✅ [AI][${convShort}] Auto-generated branch list (${branchResult.branches.length} branches)`);
                    }
                } else {
                    // Other state — generic fallback
                    responseText = 'Devam edebilmem için lütfen bir seçim yapın veya bilgi verin. 😊';
                }
            } catch (fallbackErr) {
                console.error(`❌ [AI] Smart fallback failed:`, fallbackErr.message);
            }
        }

        // Release lock after generating response
        if (type === 'CHATS' && conversationId) {
            releaseAiReplyLock(conversationId);
        }

        // 🚨 CHECK FOR USER'S HANDOFF CONFIRMATION
        const userMessageLower = userMessage?.toLowerCase() || '';
        const confirmPhrases = ['evet', 'tamam', 'olur', 'lütfen', 'yönlendir', 'aktarın', 'görüşmek istiyorum', 'temsilci', 'yes', 'ok'];
        const declinePhrases = ['hayır', 'yok', 'istemiyorum', 'gerek yok', 'no', 'olmaz'];

        // 🚨 DIRECT TRANSFER REQUEST - User explicitly asks for a representative
        const directTransferPhrases = [
            'temsilciye bağla', 'temsilcime bağla', 'müşteri temsilcisi', 'temsilci istiyorum',
            'gerçek kişi', 'gerçek biriyle', 'canlı destek', 'yetkili ile görüşmek',
            'yetkiliyle görüşmek', 'yetkiliye bağla', 'operatöre bağla', 'insanla konuşmak',
            'talk to a human', 'speak to an agent', 'connect me to', 'real person',
            'temsilcinize bağla', 'temsilciye aktarın', 'temsilciye aktar'
        ];
        const isDirectTransferRequest = !conversation?.handoffPending && directTransferPhrases.some(phrase => userMessageLower.includes(phrase));

        if (isDirectTransferRequest && type === 'CHATS' && conversationId) {
            console.log(`🔄 [HANDOFF] Direct transfer request detected from user: "${userMessage}"`);

            // --- AGENT BULMA: 1) Takım üyeleri → 2) Online agent → 3) Herhangi bir workspace üyesi ---
            let directAgent = null;
            let directSource = '';

            // 1) Conversation'ın takımındaki üyeleri dene
            if (conversation?.teamIds) {
                try {
                    const teamIds = JSON.parse(conversation.teamIds);
                    if (teamIds.length > 0) {
                        const teamMembers = await prisma.teamMember.findMany({
                            where: { teamId: teamIds[0], userId: { not: null } },
                            include: { user: { select: { id: true, name: true, isOnline: true } } },
                            orderBy: { createdAt: 'asc' }
                        });
                        const validMembers = teamMembers.filter(m => m.user);
                        if (validMembers.length > 0) {
                            const onlineMember = validMembers.find(m => m.user.isOnline);
                            directAgent = onlineMember ? onlineMember.user : validMembers[0].user;
                            directSource = onlineMember ? 'Direct-TeamOnline' : 'Direct-TeamOffline';
                        }
                    }
                } catch (_) {}
            }

            // 2) Online workspace üyesi
            if (!directAgent) {
                const onlineMembers = await prisma.workspaceMember.findMany({
                    where: { workspaceId, user: { isOnline: true } },
                    include: { user: { select: { id: true, name: true } } }
                });
                const onlineAgents = onlineMembers.filter(m => m.user);
                if (onlineAgents.length > 0) {
                    directAgent = onlineAgents[0].user;
                    directSource = 'Direct-OnlineAgent';
                }
            }

            // 3) Offline fallback
            if (!directAgent) {
                const anyMember = await prisma.workspaceMember.findFirst({
                    where: { workspaceId, role: { not: 'VIEWER' } },
                    include: { user: { select: { id: true, name: true } } },
                    orderBy: { createdAt: 'asc' }
                });
                if (anyMember?.user) {
                    directAgent = anyMember.user;
                    directSource = 'Direct-OfflineFallback';
                }
            }

            if (directAgent) {
                console.log(`🎯 [HANDOFF] Direct routing to: ${directAgent.name} (${directSource})`);

                await incrementAiUsage(workspaceId);
                releaseAiReplyLock(conversationId);

                await prisma.conversation.update({
                    where: { id: conversationId },
                    data: { botPausedUntil: new Date(Date.now() + 60 * 60 * 1000), handoffPending: false, assignedToId: directAgent.id }
                });

                // Cascade: Case + siblings + activities
                try {
                    const { cascadeAssignment } = await import('../services/cascadeAssignment.service.js');
                    await cascadeAssignment(conversationId, workspaceId, { assignedToId: directAgent.id, source: directSource });
                } catch (_) {}

                try {
                    const { emitToWorkspace } = await import('../socket.js');
                    emitToWorkspace(workspaceId, 'bot_handoff', {
                        conversationId, workspaceId,
                        assignedToId: directAgent.id,
                        assignedToName: directAgent.name,
                        message: `🔔 Müşteri temsilciye aktarıldı → ${directAgent.name.trim().split(' ')[0]}`,
                        botName: activeBot.name
                    });
                    emitToWorkspace(workspaceId, 'conversation_updated', {
                        conversationId, assignedToId: directAgent.id
                    });
                } catch (socketErr) {
                    console.error('Socket emit error for handoff:', socketErr);
                }

                return `Sizi müşteri temsilcimiz ${directAgent.name.trim().split(' ')[0]} ile bağlıyorum. Kısa süre içinde size yardımcı olacaktır. 🙏`;
            } else {
                console.log(`⚠️ [HANDOFF] No agents found at all for direct transfer.`);
                // Don't return early — let AI continue responding below
            }
        }

        // Check if conversation has pending handoff request
        if (type === 'CHATS' && conversationId && conversation?.handoffPending) {
            if (confirmPhrases.some(phrase => userMessageLower.includes(phrase))) {
                console.log(`✅ [HANDOFF] User confirmed handoff for conversation: ${conversationId}`);

                // --- AGENT BULMA: 1) Takım üyeleri → 2) Online agent → 3) Herhangi bir workspace üyesi ---
                let confirmAgent = null;
                let confirmSource = '';

                // 1) Conversation'ın takımındaki üyeleri dene
                if (conversation?.teamIds) {
                    try {
                        const teamIds = JSON.parse(conversation.teamIds);
                        if (teamIds.length > 0) {
                            const teamMembers = await prisma.teamMember.findMany({
                                where: { teamId: teamIds[0], userId: { not: null } },
                                include: { user: { select: { id: true, name: true, isOnline: true } } },
                                orderBy: { createdAt: 'asc' }
                            });
                            const validMembers = teamMembers.filter(m => m.user);
                            if (validMembers.length > 0) {
                                const onlineMember = validMembers.find(m => m.user.isOnline);
                                confirmAgent = onlineMember ? onlineMember.user : validMembers[0].user;
                                confirmSource = onlineMember ? 'Confirm-TeamOnline' : 'Confirm-TeamOffline';
                            }
                        }
                    } catch (_) {}
                }

                // 2) Online workspace üyesi
                if (!confirmAgent) {
                    const onlineMembers = await prisma.workspaceMember.findMany({
                        where: { workspaceId, user: { isOnline: true } },
                        include: { user: { select: { id: true, name: true } } }
                    });
                    const onlineAgents = onlineMembers.filter(m => m.user);
                    if (onlineAgents.length > 0) {
                        confirmAgent = onlineAgents[0].user;
                        confirmSource = 'Confirm-OnlineAgent';
                    }
                }

                // 3) Offline fallback
                if (!confirmAgent) {
                    const anyMember = await prisma.workspaceMember.findFirst({
                        where: { workspaceId, role: { not: 'VIEWER' } },
                        include: { user: { select: { id: true, name: true } } },
                        orderBy: { createdAt: 'asc' }
                    });
                    if (anyMember?.user) {
                        confirmAgent = anyMember.user;
                        confirmSource = 'Confirm-OfflineFallback';
                    }
                }

                if (confirmAgent) {
                    console.log(`🎯 [HANDOFF] Confirmed → ${confirmAgent.name} (${confirmSource})`);

                    await prisma.conversation.update({
                        where: { id: conversationId },
                        data: { botPausedUntil: new Date(Date.now() + 60 * 60 * 1000), handoffPending: false, assignedToId: confirmAgent.id }
                    });

                    // Cascade: Case + siblings + activities
                    try {
                        const { cascadeAssignment } = await import('../services/cascadeAssignment.service.js');
                        await cascadeAssignment(conversationId, workspaceId, { assignedToId: confirmAgent.id, source: confirmSource });
                    } catch (_) {}

                    try {
                        const { emitToWorkspace } = await import('../socket.js');
                        emitToWorkspace(workspaceId, 'bot_handoff', {
                            conversationId, workspaceId,
                            assignedToId: confirmAgent.id,
                            assignedToName: confirmAgent.name,
                            message: `🔔 Müşteri temsilciye aktarıldı → ${confirmAgent.name.trim().split(' ')[0]}`,
                            botName: activeBot.name
                        });
                        emitToWorkspace(workspaceId, 'conversation_updated', {
                            conversationId, assignedToId: confirmAgent.id
                        });
                    } catch (socketErr) {
                        console.error('Socket emit error for handoff:', socketErr);
                    }

                    await incrementAiUsage(workspaceId);
                    releaseAiReplyLock(conversationId);
                    return `Sizi müşteri temsilcimiz ${confirmAgent.name.trim().split(' ')[0]} ile bağlıyorum. Kısa süre içinde size yardımcı olacaktır. 🙏`;
                } else {
                    // Edge case: hiç üye yok
                    console.log(`⚠️ [HANDOFF] Workspace'te üye bulunamadı.`);
                    await prisma.conversation.update({
                        where: { id: conversationId },
                        data: { handoffPending: false }
                    });
                    // Don't return early — let AI continue responding below
                }
            } else if (declinePhrases.some(phrase => userMessageLower.includes(phrase))) {
                console.log(`❌ [HANDOFF] User declined handoff for conversation: ${conversationId}`);

                // Clear pending handoff
                await prisma.conversation.update({
                    where: { id: conversationId },
                    data: { handoffPending: false }
                });

                await incrementAiUsage(workspaceId);
                releaseAiReplyLock(conversationId);
                return isEnglish
                    ? "I understand, can I help you with anything else?"
                    : "Anladım, size başka bir konuda yardımcı olabilir miyim?";
            }
        }

        // 🚨 HANDOFF DETECTION - Only explicit [HANDOFF] tag triggers routing (removed implicit phrase detection to avoid false positives)
        if (responseText.includes('[HANDOFF]') && (type === 'CHATS' || type === 'WIDGET') && conversationId) {
            console.log(`🔄 [HANDOFF] Bot indicated it can't answer: ${conversationId}`);

            // Strip [HANDOFF] tag from the bot's own response before returning it
            const cleanedResponse = responseText.replace(/\[HANDOFF\]/gi, '').trim();

            // 📊 AI Kullanım sayacını artır
            await incrementAiUsage(workspaceId);
            releaseAiReplyLock(conversationId);

            // --- AGENT BULMA VE ATAMA ---
            const bot = await prisma.aIBot.findUnique({ where: { id: activeBot.id } });
            
            switch (bot?.onHumanRequest || 'HANDOFF') {
                case 'NOTIFY':
                    // Just notify the team, don't transfer
                    try {
                        const { emitToWorkspace } = await import('../socket.js');
                        emitToWorkspace(workspaceId, 'bot_notification', {
                            conversationId, workspaceId,
                            message: `🔔 Bot yardıma ihtiyaç duyuyor.`
                        });
                    } catch (e) { console.error('Handoff notify error:', e); }
                    break;
                case 'CREATE_TASK':
                    // Create a task for the team
                    try {
                        // userId zorunlu — conversation'ın atanan kişisi veya workspace'in ilk admin'i
                        const noteUserId = conversation?.assignedToId || (await prisma.workspaceMember.findFirst({
                            where: { workspaceId, role: { in: ['ADMIN', 'OWNER'] } },
                            select: { userId: true }
                        }))?.userId;
                        
                        if (noteUserId) {
                            await prisma.internalNote.create({
                                data: {
                                    conversationId,
                                    userId: noteUserId,
                                    content: '🤖 Bot bu görüşme için insan yardımı talep etti.',
                                }
                            });
                        }
                    } catch (e) { console.error('Handoff task error:', e); }
                    break;
                case 'HANDOFF':
                default:
                    // Transfer to human (current behavior)
                    let assignedAgent = null;
                    let assignmentSource = '';

                    // 1) Conversation'ın takımındaki üyeleri dene (round-robin)
                    if (conversation?.teamIds) {
                        try {
                            const teamIds = JSON.parse(conversation.teamIds);
                            if (teamIds.length > 0) {
                                const teamMembers = await prisma.teamMember.findMany({
                                    where: { teamId: teamIds[0], userId: { not: null } },
                                    include: { user: { select: { id: true, name: true, isOnline: true } } },
                                    orderBy: { createdAt: 'asc' }
                                });
                                const validMembers = teamMembers.filter(m => m.user);

                                if (validMembers.length > 0) {
                                    // Online olanları öncelikle dene
                                    const onlineTeamMember = validMembers.find(m => m.user.isOnline);
                                    if (onlineTeamMember) {
                                        assignedAgent = onlineTeamMember.user;
                                        assignmentSource = 'Handoff-TeamOnline';
                                    } else {
                                        // Round-robin: Son atanan kişinin bir sonrakisine at
                                        const lastConv = await prisma.conversation.findFirst({
                                            where: { workspaceId, teamIds: { contains: teamIds[0] }, assignedToId: { not: null } },
                                            orderBy: { updatedAt: 'desc' },
                                            select: { assignedToId: true }
                                        });
                                        if (lastConv?.assignedToId) {
                                            const lastIdx = validMembers.findIndex(m => m.user.id === lastConv.assignedToId);
                                            const nextIdx = (lastIdx === -1 || lastIdx === validMembers.length - 1) ? 0 : lastIdx + 1;
                                            assignedAgent = validMembers[nextIdx].user;
                                        } else {
                                            assignedAgent = validMembers[0].user;
                                        }
                                        assignmentSource = 'Handoff-TeamRoundRobin';
                                    }
                                    console.log(`🎯 [HANDOFF] Takım üyesine atandı: ${assignedAgent.name} (${assignmentSource})`);
                                }
                            }
                        } catch (e) { console.error('HANDOFF team parse error:', e); }
                    }

                    // 2) Takım bulunamadıysa → Online workspace üyesine ata
                    if (!assignedAgent) {
                        const onlineMembers = await prisma.workspaceMember.findMany({
                            where: { workspaceId, user: { isOnline: true } },
                            include: { user: { select: { id: true, name: true } } }
                        });
                        const onlineAgents = onlineMembers.filter(m => m.user);
                        if (onlineAgents.length > 0) {
                            assignedAgent = onlineAgents[0].user;
                            assignmentSource = 'Handoff-OnlineAgent';
                            console.log(`🎯 [HANDOFF] Online agent'a atandı: ${assignedAgent.name}`);
                        }
                    }

                    // 3) Hiç online yoksa → Workspace'in ilk üyesine ata (offline bile olsa)
                    if (!assignedAgent) {
                        const anyMember = await prisma.workspaceMember.findFirst({
                            where: { workspaceId, role: { not: 'VIEWER' } },
                            include: { user: { select: { id: true, name: true } } },
                            orderBy: { createdAt: 'asc' }
                        });
                        if (anyMember?.user) {
                            assignedAgent = anyMember.user;
                            assignmentSource = 'Handoff-OfflineFallback';
                            console.log(`⚠️ [HANDOFF] Online agent yok → Offline üyeye atandı: ${assignedAgent.name}`);
                        }
                    }

                    // --- ATAMA UYGULA ---
                    if (assignedAgent) {
                        await prisma.conversation.update({
                            where: { id: conversationId },
                            data: {
                                botPausedUntil: new Date(Date.now() + 60 * 60 * 1000), // 1 saat bot dursun
                                handoffPending: false,
                                assignedToId: assignedAgent.id
                            }
                        });

                        // Cascade: Case + siblings + activities
                        try {
                            const { cascadeAssignment } = await import('../services/cascadeAssignment.service.js');
                            await cascadeAssignment(conversationId, workspaceId, { assignedToId: assignedAgent.id, source: assignmentSource });
                        } catch (_) {}

                        // Socket bildirim — tüm workspace'e
                        try {
                            const { emitToWorkspace } = await import('../socket.js');
                            emitToWorkspace(workspaceId, 'bot_handoff', {
                                conversationId, workspaceId,
                                assignedToId: assignedAgent.id,
                                assignedToName: assignedAgent.name,
                                message: `🔔 Müşteri temsilciye aktarıldı → ${assignedAgent.name.trim().split(' ')[0]}`,
                                botName: activeBot.name
                            });
                            emitToWorkspace(workspaceId, 'conversation_updated', {
                                conversationId,
                                assignedToId: assignedAgent.id
                            });
                        } catch (socketErr) {
                            console.error('Socket emit error for handoff:', socketErr);
                        }

                        console.log(`✅ [HANDOFF] Tamamlandı: ${assignedAgent.name} (${assignmentSource}) — Bot 1 saat duraklatıldı`);
                    } else {
                        // Workspace'te hiç üye yok (edge case)
                        console.log(`❌ [HANDOFF] Workspace'te hiç atanacak üye bulunamadı!`);
                        await prisma.conversation.update({
                            where: { id: conversationId },
                            data: { handoffPending: true }
                        });
                    }
                    break;
            }

            // Always return the bot's own response (with [HANDOFF] tag removed)
            return cleanedResponse || null;
        }

        // 📊 AI Kullanım sayacını artır (başarılı cevap sonrası)
        await incrementAiUsage(workspaceId);

        // Release lock before successful return
        if (type === 'CHATS' && conversationId) {
            releaseAiReplyLock(conversationId);

            // Update lastBotMessageAt for follow-up tracking
            try {
                const { updateLastBotMessageTime } = await import('../services/followUp.service.js');
                await updateLastBotMessageTime(conversationId);
                console.log(`⏰ [Follow-up] lastBotMessageAt updated for ${conversationId}`);
            } catch (e) {
                console.error(`❌ [Follow-up] Failed to update lastBotMessageAt:`, e.message);
            }
        }

        // Aşama otomatik ilerleme kontrolü
        if (conversationId) {
            try {
                const { tryAutoAdvance } = await import('../services/stageQualification.service.js');
                const advancedTo = await tryAutoAdvance(conversationId);
                if (advancedTo) {
                    console.log(`🚀 [AutoAdvance] ${conversationId}: Aşama otomatik ilerletildi`);
                }
            } catch (aaErr) {
                console.error('⚠️ [AutoAdvance] Non-fatal:', aaErr.message);
            }
        }

        return stripAiThinking(responseText).replace(/\[HANDOFF\]/gi, '').trim();

    } catch (error) {
        console.error('Auto-reply error:', error);
        // Release lock on error too
        if (type === 'CHATS' && conversationId) {
            releaseAiReplyLock(conversationId);
        }
        return null;
    }
};

// ... existing settings/bot CRUD functions ...
export const updateSettings = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { aiApiKey, aiModel, aiClassifierEnabled, aiAutoReplyEnabled, aiScorerEnabled, aiFollowUpEnabled } = req.body;
        const data = {};
        if (aiApiKey !== undefined) data.aiApiKey = aiApiKey || null;
        if (aiModel !== undefined) data.aiModel = aiModel || null; // null = Company'den miras
        if (aiClassifierEnabled !== undefined) data.aiClassifierEnabled = aiClassifierEnabled;
        if (aiAutoReplyEnabled !== undefined) data.aiAutoReplyEnabled = aiAutoReplyEnabled;
        if (aiScorerEnabled !== undefined) data.aiScorerEnabled = aiScorerEnabled;
        if (aiFollowUpEnabled !== undefined) data.aiFollowUpEnabled = aiFollowUpEnabled;
        await prisma.workspace.update({ where: { id: workspaceId }, data });
        res.json({ message: 'Saved' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save settings' });
    }
};

export const getSettings = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const ws = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                aiApiKey: true,
                aiModel: true,
                aiClassifierEnabled: true,
                aiAutoReplyEnabled: true,
                aiScorerEnabled: true,
                aiFollowUpEnabled: true,
                companyId: true,
                company: { select: { aiModel: true } }
            }
        });
        res.json({
            aiApiKey: ws?.aiApiKey || '',
            aiModel: ws?.aiModel || null,
            effectiveModel: ws?.aiModel || ws?.company?.aiModel || 'gemini-2.5-flash',
            aiClassifierEnabled: ws?.aiClassifierEnabled ?? true,
            aiAutoReplyEnabled: ws?.aiAutoReplyEnabled ?? true,
            aiScorerEnabled: ws?.aiScorerEnabled ?? true,
            aiFollowUpEnabled: ws?.aiFollowUpEnabled ?? true,
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get settings' });
    }
};

export const createBot = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const {
            name, role, prompt, whatsappEnabled, facebookEnabled, instagramEnabled, widgetEnabled, botType,
            // Scheduler fields
            schedulerEnabled, scheduleStartTime, scheduleEndTime, scheduleStartDate, scheduleEndDate, scheduleDays,
            // Auto-reply delay fields
            autoReplyDelayEnabled, autoReplyDelaySeconds, autoReplyDelayMessage,
            // Routing fields
            routingEnabled, routingQuestions, routingDefaultTeamId, routingDefaultUserId,
            routingConditionalEnabled, routingRules,
            // Linked automations
            automations,
            // Handoff message
            handoffMessage
        } = req.body;

        const bot = await prisma.aIBot.create({
            data: {
                name,
                role,
                prompt,
                workspaceId,
                botType: botType || 'CHATS',
                whatsappEnabled: whatsappEnabled !== undefined ? !!whatsappEnabled : true,
                facebookEnabled: facebookEnabled !== undefined ? !!facebookEnabled : true,
                instagramEnabled: instagramEnabled !== undefined ? !!instagramEnabled : true,
                widgetEnabled: widgetEnabled !== undefined ? !!widgetEnabled : true,
                // Scheduler
                schedulerEnabled: !!schedulerEnabled,
                scheduleStartTime: scheduleStartTime || null,
                scheduleEndTime: scheduleEndTime || null,
                scheduleStartDate: scheduleStartDate ? new Date(scheduleStartDate) : null,
                scheduleEndDate: scheduleEndDate ? new Date(scheduleEndDate) : null,
                scheduleDays: scheduleDays || null,
                // Auto-reply delay
                autoReplyDelayEnabled: !!autoReplyDelayEnabled,
                autoReplyDelaySeconds: autoReplyDelaySeconds !== undefined ? parseInt(autoReplyDelaySeconds) || 30 : 30,
                autoReplyDelayMessage: autoReplyDelayMessage || null,
                // Routing
                routingEnabled: !!routingEnabled,
                routingQuestions: routingQuestions || null,
                routingDefaultTeamId: routingDefaultTeamId || null,
                routingDefaultUserId: routingDefaultUserId || null,
                routingConditionalEnabled: !!routingConditionalEnabled,
                routingRules: routingRules || null,
                // Automations
                automations: automations ? JSON.stringify(automations) : null,
                // Handoff message
                handoffMessage: handoffMessage || null
            }
        });
        res.status(201).json({ bot });
    } catch (error) {
        console.error('Create bot error:', error);
        res.status(500).json({ error: 'Failed to create bot' });
    }
};

export const getBots = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const bots = await prisma.aIBot.findMany({
            where: { workspaceId },
            orderBy: { createdAt: 'desc' },
            include: {
                // Yorum botları için eski sistem hala geçerli
                commentPages: { select: { id: true, pageName: true, instagramUsername: true } },
                webWidgets: { select: { id: true, title: true } }
            }
        });

        // Yönlendirme tablosundan DM kanallarını al
        const channelRoutings = await prisma.channelRouting.findMany({
            where: { workspaceId, isActive: true },
            include: {
                team: { select: { id: true, name: true } }
            }
        });

        // Facebook/Instagram sayfalarına doğrudan atanmış botları al
        const facebookPages = await prisma.facebookPage.findMany({
            where: { workspaceId },
            select: {
                id: true,
                pageName: true,
                assignedBotId: true,
                instagramBotId: true,
                instagramUsername: true
            }
        });

        // WhatsApp numaralarına doğrudan atanmış botları al
        const whatsappNumbers = await prisma.whatsappPhoneNumber.findMany({
            where: { workspaceId },
            select: {
                id: true,
                displayPhoneNumber: true,
                assignedBotId: true
            }
        });

        // Her bot için atanmış kanalları bul
        const botsWithAssignments = bots.map(bot => {
            // Bu botun atanmış olduğu takımları bul (Yönlendirme üzerinden)
            const botRoutings = channelRoutings.filter(r => r.teamId && r.botEnabled);

            // Direkt kanal atamalarını bul
            const directFacebook = facebookPages.filter(p => p.assignedBotId === bot.id);
            const directInstagram = facebookPages.filter(p => p.instagramBotId === bot.id && p.instagramUsername);
            const directWhatsapp = whatsappNumbers.filter(w => w.assignedBotId === bot.id);

            // Kanal eşleşmelerini oluştur
            const routedChannels = {
                facebook: [
                    ...botRoutings.filter(r => r.channel === 'FACEBOOK').map(r => ({
                        id: r.id,
                        name: 'Facebook Messenger',
                        team: r.team?.name,
                        type: 'Yönlendirme'
                    })),
                    ...directFacebook.map(p => ({
                        id: p.id,
                        name: p.pageName,
                        type: 'Kanal'
                    }))
                ],
                instagram: [
                    ...botRoutings.filter(r => r.channel === 'INSTAGRAM').map(r => ({
                        id: r.id,
                        name: 'Instagram DM',
                        team: r.team?.name,
                        type: 'Yönlendirme'
                    })),
                    ...directInstagram.map(p => ({
                        id: p.id,
                        name: `@${p.instagramUsername}`,
                        type: 'Kanal'
                    }))
                ],
                whatsapp: [
                    ...botRoutings.filter(r => r.channel === 'WHATSAPP').map(r => ({
                        id: r.id,
                        name: 'WhatsApp',
                        team: r.team?.name,
                        type: 'Yönlendirme'
                    })),
                    ...directWhatsapp.map(w => ({
                        id: w.id,
                        name: w.displayPhoneNumber || 'WhatsApp',
                        type: 'Kanal'
                    }))
                ],
                email: botRoutings.filter(r => r.channel === 'EMAIL').map(r => ({
                    id: r.id,
                    name: 'E-posta',
                    team: r.team?.name,
                    type: 'Yönlendirme'
                })),
                webWidget: [
                    ...botRoutings.filter(r => r.channel === 'WEB_WIDGET').map(r => ({
                        id: r.id,
                        name: 'Web Widget',
                        team: r.team?.name,
                        type: 'Yönlendirme'
                    })),
                    ...bot.webWidgets.map(w => ({
                        id: w.id,
                        name: w.title || 'Web Widget',
                        type: 'Kanal'
                    }))
                ],
                form: botRoutings.filter(r => r.channel === 'FORM').map(r => ({
                    id: r.id,
                    name: 'Web Form',
                    team: r.team?.name,
                    type: 'Yönlendirme'
                }))
            };

            return {
                ...bot,
                assignments: {
                    // Yönlendirme sayfasından gelen DM kanalları
                    routedChannels,
                    // Yorum botları için eski sistem
                    facebookComments: bot.commentPages.filter(p => !p.instagramUsername).map(p => ({ id: p.id, name: p.pageName, type: 'Yorum' })),
                    instagramComments: bot.commentPages.filter(p => p.instagramUsername).map(p => ({ id: p.id, name: `@${p.instagramUsername}`, type: 'Yorum' })),
                    widget: bot.webWidgets.map(w => ({ id: w.id, name: w.title }))
                }
            };
        });

        res.json({ bots: botsWithAssignments });
    } catch (error) {
        console.error('Get bots error:', error);
        res.status(500).json({ error: 'Failed to get bots' });
    }
};

export const deleteBot = async (req, res) => {
    try {
        const { workspaceId, botId } = req.params;

        // Verify bot belongs to this workspace
        const existing = await prisma.aIBot.findFirst({ where: { id: botId, workspaceId } });
        if (!existing) {
            return res.status(404).json({ error: 'Bot not found' });
        }

        await prisma.aIBot.delete({ where: { id: botId } });
        res.json({ message: 'Deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete bot' });
    }
};

// Toggle bot active status (ensure only one is active per workspace)
export const toggleBotStatus = async (req, res) => {
    try {
        const { workspaceId, botId } = req.params;
        const { isActive } = req.body;

        // Verify bot belongs to this workspace
        const bot = await prisma.aIBot.findFirst({ where: { id: botId, workspaceId } });
        if (!bot) return res.status(404).json({ error: 'Bot not found' });

        if (isActive) {
            // Find channels enabled for THIS bot
            const currentBot = await prisma.aIBot.findUnique({ where: { id: botId } });

            // Deactivate other bots ONLY if they share an enabled channel with this bot
            // (Simplification: if this bot has WhatsApp enabled, deactivate other bots that also have WhatsApp enabled)
            // For now, let's keep it simple: allow user to manage it. 
            // If they want multiple active bots, it's fine as long as channels don't overlap.
            // If they do overlap, findFirst picks one.
        }

        const updatedBot = await prisma.aIBot.update({
            where: { id: botId },
            data: { isActive }
        });

        res.json({ bot: updatedBot });
    } catch (error) {
        console.error('Toggle bot status error:', error);
        res.status(500).json({ error: 'Failed to update bot status' });
    }
};

export const updateBot = async (req, res) => {
    try {
        const { workspaceId, botId } = req.params;
        const {
            name, role, prompt, whatsappEnabled, facebookEnabled, instagramEnabled, widgetEnabled, botType,
            // Scheduler fields
            schedulerEnabled, scheduleStartTime, scheduleEndTime, scheduleStartDate, scheduleEndDate, scheduleDays,
            // Auto-reply delay fields
            autoReplyDelayEnabled, autoReplyDelaySeconds, autoReplyDelayMessage,
            // Follow-up fields
            inactivityWarningEnabled, inactivityWarningSeconds, inactivityWarningMessage,
            dailyReminderEnabled, dailyReminderHours, dailyReminderMessage,
            // Smart Reminder Steps (5-step cascading follow-up)
            reminderSteps,
            // Routing fields
            routingEnabled, routingQuestions, routingDefaultTeamId, routingDefaultUserId,
            routingConditionalEnabled, routingRules,
            // Linked automations
            automations,
            // Handoff message
            handoffMessage,
            // Bot yetenekleri (tool toggles)
            capabilities
        } = req.body;

        // Verify bot belongs to this workspace
        const existing = await prisma.aIBot.findFirst({ where: { id: botId, workspaceId } });
        if (!existing) {
            return res.status(404).json({ error: 'Bot not found' });
        }

        const bot = await prisma.aIBot.update({
            where: { id: botId },
            data: {
                name,
                role,
                prompt,
                botType,
                whatsappEnabled: !!whatsappEnabled,
                facebookEnabled: !!facebookEnabled,
                instagramEnabled: !!instagramEnabled,
                widgetEnabled: !!widgetEnabled,
                // Scheduler
                schedulerEnabled: !!schedulerEnabled,
                scheduleStartTime: scheduleStartTime || null,
                scheduleEndTime: scheduleEndTime || null,
                scheduleStartDate: scheduleStartDate ? new Date(scheduleStartDate) : null,
                scheduleEndDate: scheduleEndDate ? new Date(scheduleEndDate) : null,
                scheduleDays: scheduleDays || null,
                // Auto-reply delay
                autoReplyDelayEnabled: !!autoReplyDelayEnabled,
                autoReplyDelaySeconds: autoReplyDelaySeconds !== undefined ? parseInt(autoReplyDelaySeconds) || 30 : 30,
                autoReplyDelayMessage: autoReplyDelayMessage || null,
                // Inactivity warning
                inactivityWarningEnabled: !!inactivityWarningEnabled,
                inactivityWarningSeconds: inactivityWarningSeconds !== undefined ? parseInt(inactivityWarningSeconds) || 40 : 40,
                inactivityWarningMessage: inactivityWarningMessage || null,
                // Daily reminder
                dailyReminderEnabled: !!dailyReminderEnabled,
                dailyReminderHours: dailyReminderHours !== undefined ? parseInt(dailyReminderHours) || 24 : 24,
                dailyReminderMessage: dailyReminderMessage || null,
                // Smart Reminder Steps (5-step cascading follow-up JSON)
                ...(reminderSteps !== undefined && {
                    reminderSteps: typeof reminderSteps === 'string' ? reminderSteps : JSON.stringify(reminderSteps)
                }),
                // Routing
                routingEnabled: !!routingEnabled,
                routingQuestions: routingQuestions || null,
                routingDefaultTeamId: routingDefaultTeamId || null,
                routingDefaultUserId: routingDefaultUserId || null,
                routingConditionalEnabled: !!routingConditionalEnabled,
                routingRules: routingRules || null,
                // Automations
                automations: automations ? JSON.stringify(automations) : null,
                // Handoff message
                ...(handoffMessage !== undefined && { handoffMessage: handoffMessage || null }),
                // Bot capabilities (tool toggles)
                ...(capabilities !== undefined && { capabilities: capabilities || null })
            }
        });
        res.json({ bot });
    } catch (error) {
        console.error('Update Bot Error:', error);
        res.status(500).json({ error: 'Failed to update bot' });
    }
};

// Automated Background Extraction (Called from webhooks)
export const autoExtractFromConversation = async (workspaceId, conversationId) => {
    try {
        console.log(`🤖 [AI Auto-Extract] Starting for conversation: ${conversationId}`);

        // 🔄 TOKEN OPTİMİZASYONU: Sınıflandırıcı (classifyAndExtract) zaten isim/telefon/email çıkarıyorsa
        // bu fonksiyonun ayrı bir AI çağrısı yapmasına gerek yok.
        // Son 2 dk içinde sınıflandırılmışsa atla.
        const recentConv = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { classifiedAt: true }
        });
        if (recentConv?.classifiedAt) {
            const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);
            if (recentConv.classifiedAt > twoMinAgo) {
                console.log(`⏭️ [Auto-Extract] Skipped — classifier already extracted contact info recently`);
                return null;
            }
        }

        // 1. Get API Key (workspace key > global key)
        const aiApiKey = await getEffectiveAiApiKey(workspaceId);
        if (!aiApiKey) {
            console.log('ℹ️ [AI Auto-Extract] No API key configured for workspace:', workspaceId);
            return null;
        }

        // 2. Get last messages
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: {
                messages: {
                    take: 20,
                    orderBy: { createdAt: 'desc' },
                    select: { content: true, isFromContact: true }
                },
                contact: true
            }
        });

        if (!conversation || !conversation.messages || conversation.messages.length === 0) {
            console.log('ℹ️ [AI Auto-Extract] No messages found for conversation:', conversationId);
            return null;
        }

        // Skip if we already have name, phone AND email
        const currentName = conversation.contact.name || '';
        const isGenericName = !currentName ||
            currentName.toLowerCase().includes('user ') ||
            currentName.toLowerCase().includes('web ziyaretçisi') ||
            currentName.toLowerCase().includes('misafir') ||
            currentName.toLowerCase().includes('ziyaretçi');

        const hasName = currentName && !isGenericName;
        const hasPhone = !!conversation.contact.phone;
        const hasEmail = !!conversation.contact.email;

        console.log(`📊 [AI Auto-Extract] Current Info - Name: "${currentName}" (Generic: ${isGenericName}), Phone: ${hasPhone}, Email: ${hasEmail}`);

        if (hasName && hasPhone && hasEmail) {
            console.log('ℹ️ [AI Auto-Extract] Contact already has full info. Skipping.');
            return null;
        }

        // 3. Prepare Prompt
        const chatLog = [...conversation.messages].reverse().map(m =>
            `${m.isFromContact ? 'Müşteri' : 'Temsilci'}: ${m.content}`
        ).join('\n');

        const prompt = `Aşağıdaki konuşma geçmişinden müşterinin iletişim bilgilerini çıkar. 
Bilgileri SADECE JSON formatında bir OBJE olarak döndür (Liste/Array içine koyma). Eğer bir bilgi bulunamadıysa değerini null yap.
Format: {"name": "Ad ve Soyad", "phone": "Telefon", "email": "E-posta"}

ÖNEMLİ KURALLAR:
1. İSİM ÇIKARMA:
   - İsim SADECE müşterinin kendini tanıtırken söylediği gerçek isim-soyisim olmalı.
   - "Benim adım Ali Yılmaz", "Ali Yılmaz 0544...", "İsmim Ayşe" gibi ifadelerden çıkar.
   - Tek harfli cevaplar (Y, N, E, H), kısa cevaplar (evet, hayır, tamam, ok) İSİM DEĞİLDİR.
   - Selamlaşmalar (merhaba, selam, hey, hi) İSİM DEĞİLDİR.
   - Sorular veya genel cümleler İSİM DEĞİLDİR.
   - İsim en az 2 kelime veya en az 4 karakter olmalı.
   - Emin değilsen null döndür.

2. TELEFON ÇIKARMA:
   - Türkiye formatı: 05XX XXX XX XX veya +90 5XX XXX XX XX
   - En az 10 rakam içermeli.
   - "Numaram 0544...", "Beni 0532... arayin" gibi ifadelerden çıkar.

3. E-POSTA ÇIKARMA:
   - Standart e-posta formatı: xxx@xxx.xxx

KONUŞMA GEÇMİŞİ:
${chatLog}

JSON:`;

        const genAI = new GoogleGenerativeAI(aiApiKey);

        const tryModel = async (modelName) => {
            console.log(`🤖 [AI Auto-Extract] Trying model: ${modelName}`);
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: { responseMimeType: "application/json" }
            });
            const result = await model.generateContent(prompt);
            let text = result.response.text();

            // Clean markdown if present
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();

            try {
                let data = JSON.parse(text);

                // Handle if model returned an array instead of object
                if (Array.isArray(data)) data = data[0];

                // Handle split name/surname
                if (!data.name && (data.first_name || data.given_name)) {
                    data.name = `${data.first_name || data.given_name} ${data.last_name || data.surname || ''}`.trim();
                } else if (data.name && (data.surname || data.last_name)) {
                    const sn = data.surname || data.last_name;
                    if (!data.name.includes(sn)) {
                        data.name = `${data.name} ${sn}`;
                    }
                }

                return data;
            } catch (e) {
                console.error(`❌ [AI Auto-Extract] JSON Parse error from ${modelName}. Text was:`, text);
                throw e;
            }
        };

        let extracted;
        try {
            extracted = await tryModel("gemini-3.5-flash");
        } catch (err) {
            console.warn(`⚠️ [AI Auto-Extract] gemini-3.5-flash failed, trying fallback: ${err.message}`);
            if (err.message.includes('429') || err.message.includes('Resource exhausted')) {
                await new Promise(r => setTimeout(r, 2000));
            }
            try {
                extracted = await tryModel("gemini-3.5-flash");
            } catch (err2) {
                console.error(`❌ [AI Auto-Extract] All models failed for workspace ${workspaceId}: ${err2.message}`);
                return null;
            }
        }

        console.log('✅ [AI Auto-Extract] Extracted:', JSON.stringify(extracted));

        // 4. Update Contact if we found something NEW or BETTER
        const updateData = {};
        const oldName = conversation.contact.name || '';
        const oldPhone = conversation.contact.phone || '';
        const oldEmail = conversation.contact.email || '';


        // VALIDATION: Only update if we have BOTH name AND phone (for WIDGET channel)
        // This prevents saving incomplete information like just "selam"
        if (conversation.channel === 'WIDGET') {
            const hasExtractedName = extracted.name && extracted.name.trim().length > 0;
            const hasExtractedPhone = extracted.phone && extracted.phone.trim().length > 0;

            if (!hasExtractedName || !hasExtractedPhone) {
                console.log('⚠️ [AI Auto-Extract] Skipping update - need BOTH name and phone for widget contacts');
                return null;
            }
        }

        // STRICT NAME POLICY:
        // 1. SOCIAL CHANNELS (FB, IG, WA) - NEVER update the display name OR fullName, keep platform profile name
        // 2. Only update the main display name (sidebar name) IF it's a WIDGET channel AND the current name is generic.
        const isSocialChannel = ['WHATSAPP', 'FACEBOOK', 'INSTAGRAM'].includes(conversation.channel);

        // Validate extracted name with strict rules
        const validateExtractedName = (name) => {
            if (!name) return false;
            const trimmed = name.trim();

            // Must be at least 4 characters
            if (trimmed.length < 4) {
                console.log(`⚠️ [Name Validation] "${trimmed}" rejected: too short (< 4 chars)`);
                return false;
            }

            // Must not be single word greetings/responses
            const invalidWords = [
                'evet', 'hayır', 'tamam', 'ok', 'hi', 'hey', 'merhaba', 'selam',
                'yes', 'no', 'hello', 'teşekkürler', 'tesekkurler', 'thanks',
                'iyi', 'kötü', 'güzel', 'peki', 'olur', 'olmaz', 'var', 'yok',
                'bilgi', 'fiyat', 'ücret', 'randevu', 'saat', 'gün', 'tarih'
            ];
            if (invalidWords.some(w => trimmed.toLowerCase() === w)) {
                console.log(`⚠️ [Name Validation] "${trimmed}" rejected: common word/greeting`);
                return false;
            }

            // Should ideally have at least 2 parts (name + surname) OR be a recognizable single name (min 4 chars)
            const parts = trimmed.split(/\s+/);
            if (parts.length === 1 && trimmed.length < 4) {
                console.log(`⚠️ [Name Validation] "${trimmed}" rejected: single word too short`);
                return false;
            }

            // Must contain mostly letters (allow Turkish chars, spaces, and some punctuation)
            if (!/^[a-zA-ZğüşöçıİĞÜŞÖÇ\s\-\.]+$/.test(trimmed)) {
                console.log(`⚠️ [Name Validation] "${trimmed}" rejected: contains invalid characters`);
                return false;
            }

            console.log(`✅ [Name Validation] "${trimmed}" accepted`);
            return true;
        };

        const isValidExtractedName = validateExtractedName(extracted.name);

        if (isSocialChannel) {
            console.log(`🔒 [AI Auto-Extract] Social channel (${conversation.channel}) - NOT updating name or fullName, keeping platform profile name`);
            // Do NOT update name OR fullName for social channels - they should keep their WhatsApp/FB/IG profile names
        } else if (isValidExtractedName && conversation.channel === 'WIDGET' && isGenericName) {
            updateData.name = extracted.name.trim();
            // Also update fullName for WIDGET only
            if (extracted.name.trim() !== (conversation.contact.fullName || '')) {
                updateData.fullName = extracted.name.trim();
                console.log(`🧠 [AI Name Debug] WIDGET channel - Updating fullName: "${extracted.name.trim()}"`);
            }
        }

        // Validate and save phone
        if (extracted.phone && !oldPhone) {
            // Clean phone number - remove spaces, dashes, parentheses
            let cleanPhone = extracted.phone.replace(/[\s\-\(\)]/g, '');

            // Must have at least 10 digits
            const digitsOnly = cleanPhone.replace(/\D/g, '');
            if (digitsOnly.length >= 10) {
                // Import and apply phone normalization
                const { normalizePhone } = await import('../utils/phoneNormalizer.js');
                updateData.phone = normalizePhone(cleanPhone);
                console.log(`📞 [AI Auto-Extract] Valid phone extracted: ${cleanPhone}`);
            } else {
                console.log(`⚠️ [AI Auto-Extract] Invalid phone "${extracted.phone}" - not enough digits`);
            }
        }

        // Validate and save email
        if (extracted.email && !oldEmail) {
            // Basic email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (emailRegex.test(extracted.email.trim())) {
                updateData.email = extracted.email.trim().toLowerCase();
                console.log(`📧 [AI Auto-Extract] Valid email extracted: ${extracted.email.trim()}`);
            } else {
                console.log(`⚠️ [AI Auto-Extract] Invalid email "${extracted.email}"`);
            }
        }

        if (Object.keys(updateData).length > 0) {
            // Auto-upgrade status to OPPORTUNITY if phone is being added and current status is NEW
            if (updateData.phone && conversation.contact.status === 'NEW') {
                updateData.status = 'OPPORTUNITY';
                console.log(`📱 [AI Auto-Extract] Auto-upgrading status to OPPORTUNITY (phone extracted)`);
            }

            let finalContactId = conversation.contact.id;

            // ── Auto Merge Logic if phone changes ──
            if (updateData.phone && updateData.phone !== conversation.contact.phone) {
                const normalizedNewPhone = normalizePhone(updateData.phone);
                const phoneVariants = [...new Set([updateData.phone, normalizedNewPhone])];
                
                if (updateData.phone.startsWith('90') && updateData.phone.length === 12) {
                    phoneVariants.push('+' + updateData.phone, '0' + updateData.phone.slice(2));
                }
                if (normalizedNewPhone.startsWith('+90')) {
                    phoneVariants.push(normalizedNewPhone.slice(1), '0' + normalizedNewPhone.slice(3));
                }

                const duplicateContact = await prisma.contact.findFirst({
                    where: {
                        workspaceId,
                        id: { not: conversation.contact.id },
                        OR: phoneVariants.map(p => ({ phone: p }))
                    }
                });

                if (duplicateContact) {
                    console.log(`🔗 [Auto-Merge] AI phone extraction triggered merge. Target: ${duplicateContact.id}, Source: ${conversation.contact.id}`);
                    // Before merging, apply the requested updates to duplicateContact
                    await prisma.contact.update({
                        where: { id: duplicateContact.id },
                        data: updateData
                    });
                    const mergedContact = await mergeContacts(duplicateContact.id, conversation.contact.id);
                    finalContactId = mergedContact.id;
                }
            }

            if (finalContactId === conversation.contact.id) {
                console.log(`💾 [AI Auto-Extract] Saving new info for contact ${conversation.contact.id}:`, updateData);
                await prisma.contact.update({
                    where: { id: conversation.contact.id },
                    data: updateData
                });
            }

            // Emit socket event (workspace-specific)
            emitToWorkspace(workspaceId, 'contact_updated', {
                workspaceId,
                contactId: finalContactId,
                updatedFields: updateData
            });
            console.log('📡 [AI Auto-Extract] WebSocket event (contact_updated) emitted to workspace');

            // 🔁 If phone was just extracted, trigger auto call planning
            // This covers cases where regex-based phone capture missed the number
            // (e.g. separatorless formats like 0561090832)
            if (updateData.phone) {
                try {
                    const { executeAutoCallPlanning } = await import('./rules.controller.js');
                    console.log(`📞 [AI Auto-Extract] Phone extracted → triggering auto call planning for contact ${finalContactId}`);
                    await executeAutoCallPlanning(workspaceId, finalContactId, conversation.channel || 'AI_EXTRACT');
                } catch (callErr) {
                    console.error('⚠️ [AI Auto-Extract] Auto call planning trigger error:', callErr.message);
                }
            }
        } else {
            console.log(`ℹ️ [AI Auto-Extract] No updates needed. Current: [${oldName}, ${oldPhone}, ${oldEmail}], Extracted: [${extracted.name}, ${extracted.phone}, ${extracted.email}] (Generic: ${isGenericName})`);
        }

        return extracted;
    } catch (error) {
        console.error('❌ [AI Auto-Extract] Final Error:', error);
        return null;
    }
};

/**
 * Auto-generate a short topic title for a conversation from its first customer message.
 * Fire-and-forget: call without await from webhook handlers.
 * Only runs if conversation has no aiTopic yet.
 *
 * @param {string} workspaceId
 * @param {string} conversationId
 * @param {string} firstMessage - The first customer message text
 */
export const autoGenerateTopic = async (workspaceId, conversationId, firstMessage) => {
    try {
        if (!workspaceId || !conversationId) return;

        // 🔄 TOKEN OPTİMİZASYONU: Sınıflandırıcı (classifyAndExtract) zaten topic üretiyorsa
        // bu fonksiyonun ayrı bir AI çağrısı yapmasına gerek yok.
        // Son 2 dk içinde sınıflandırılmışsa ve aiTopic set edilmişse atla.
        const recentConv = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { classifiedAt: true, aiTopic: true }
        });
        if (recentConv?.classifiedAt && recentConv?.aiTopic) {
            const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);
            if (recentConv.classifiedAt > twoMinAgo) {
                console.log(`⏭️ [AutoTopic] Skipped — classifier already set topic recently: "${recentConv.aiTopic}"`);
                return;
            }
        }

        // Get API key first
        const aiApiKey = await getEffectiveAiApiKey(workspaceId);
        if (!aiApiKey) return;

        // Fetch full conversation with all messages
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: {
                messages: {
                    orderBy: { createdAt: 'asc' },
                    select: { content: true, isFromContact: true }
                }
            }
        });

        if (!conversation || !conversation.messages?.length) return;

        const customerMessages = conversation.messages.filter(m => m.isFromContact && m.content?.trim());
        const totalCustomerMsgs = customerMessages.length;
        const existingTopic = conversation.aiTopic;

        // ── When to generate/re-generate ──────────────────────────────────
        if (existingTopic) {
            // Long topic (>60 chars) = likely manually edited — never overwrite
            if (existingTopic.length > 60) {
                return;
            }
            // Re-generate only at milestones: 3rd, 6th, 10th customer message
            const MILESTONES = [3, 6, 10];
            if (!MILESTONES.includes(totalCustomerMsgs)) {
                return;
            }
            console.log(`🔄 [AutoTopic] Re-generating at milestone ${totalCustomerMsgs} customer msgs`);
        } else {
            if (totalCustomerMsgs < 1) return;
            // 🆕 Immediate fallback: set first customer message as topic right away
            const firstCustomerMsg = customerMessages[0]?.content?.trim();
            if (firstCustomerMsg) {
                const fallbackTopic = firstCustomerMsg.substring(0, 80);
                await prisma.conversation.update({
                    where: { id: conversationId },
                    data: { aiTopic: fallbackTopic }
                });
                console.log(`📝 [AutoTopic] Fallback set from first message: "${fallbackTopic}"`);
            }
            console.log(`🆕 [AutoTopic] First generation (${totalCustomerMsgs} customer msgs in DB)`);
        }

        // Build chat log from last 20 messages for context
        const recentMessages = conversation.messages.slice(-20);
        const chatLog = recentMessages
            .filter(m => m.content?.trim())
            .map(m => `${m.isFromContact ? 'Müşteri' : 'Temsilci'}: ${m.content.trim()}`)
            .join('\n');

        if (!chatLog) return;

        const prompt = `Aşağıdaki müşteri sohbetini dikkatle analiz et ve konuşmanın ANA KONUSUNU özetleyen profesyonel bir başlık oluştur.

KURALLAR:
- Türkçe yaz
- Maksimum 5-7 kelime
- Sohbetin GERÇEK amacını yansıt — tüm konuşmaya bak, sadece ilk mesaja değil
- Somut, açıklayıcı ve anlamlı ol
  İyi örnekler: "Doğum Paketi Fiyat Talebi", "Ameliyat Randevusu Değiştirme", "Sipariş Teslimat Sorunu", "Ürün Kurulum Yardımı"
- "Hakkında", "İle İlgili", "Konusunda" gibi gereksiz kelimelerden kaçın
- SADECE başlığı yaz — başka hiçbir şey ekleme, tırnak işareti kullanma

SOHBET (${totalCustomerMsgs} müşteri mesajı):
${chatLog.substring(0, 3000)}

Konu başlığı:`;

        const genAI = new GoogleGenerativeAI(aiApiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
        const result = await model.generateContent(prompt);
        const topic = result.response.text()
            .trim()
            .replace(/^["'`*#]|["'`*#]$/g, '')
            .replace(/\*+/g, '')
            .replace(/#+/g, '')
            .trim()
            .substring(0, 80);

        if (!topic || topic.length < 3) return;

        await prisma.conversation.update({
            where: { id: conversationId },
            data: { aiTopic: topic }
        });

        // ── AUTO-CASE: Topic oluştuğunda otomatik Case oluştur ──
        try {
            const convForCase = await prisma.conversation.findUnique({
                where: { id: conversationId },
                select: { caseId: true, contactId: true, assignedToId: true, assignedTeamId: true, topicCategoryId: true }
            });
            if (convForCase && !convForCase.caseId && convForCase.contactId) {
                const caseNumber = await generateCaseNumber(workspaceId);

                let caseTypeId = null;
                try {
                    if (convForCase.topicCategoryId) {
                        const tcForCase = await prisma.topicCategory.findUnique({ where: { id: convForCase.topicCategoryId }, select: { caseTypeId: true } });
                        caseTypeId = tcForCase?.caseTypeId || null;
                    }
                } catch (_) {}

                const newCase = await prisma.case.create({
                    data: {
                        workspaceId,
                        contactId: convForCase.contactId,
                        caseNumber,
                        title: topic,
                        assignedToId: convForCase.assignedToId || null,
                        assignedTeamId: convForCase.assignedTeamId || null,
                        priority: 'NORMAL',
                        caseTypeId
                    }
                });
                await prisma.conversation.update({
                    where: { id: conversationId },
                    data: { caseId: newCase.id }
                });
                console.log(`📦 [AutoCase] Auto-created case "${caseNumber}" for topic "${topic}"`);
            }
        } catch (caseErr) {
            console.error(`⚠️ [AutoCase] Failed in autoGenerateTopic:`, caseErr.message);
        }
        // ── AUTO-CASE END ──

        // ── AUTO-APPOINTMENT: Topic "randevu" içeriyorsa otomatik randevu görevi oluştur ──
        try {
            const appointmentKeywords = ['randevu', 'görüşme', 'ziyaret', 'appointment', 'meeting', 'toplantı'];
            const topicLower = topic.toLowerCase();
            const hasAppointmentIntent = appointmentKeywords.some(kw => topicLower.includes(kw));
            if (hasAppointmentIntent) {
                const convForAppt = await prisma.conversation.findUnique({
                    where: { id: conversationId },
                    select: { contactId: true }
                });
                if (convForAppt?.contactId) {
                    const { executeAppointmentPlanning } = await import('./rules.controller.js');
                    executeAppointmentPlanning(workspaceId, convForAppt.contactId, 'AI_TOPIC', { topic }).catch(e =>
                        console.error('⚠️ [AutoAppointment] Error:', e.message)
                    );
                    console.log(`📅 [AutoTopic] Appointment intent detected in topic "${topic}" → triggering appointment planning`);
                }
            }
        } catch (apptErr) {
            console.error(`⚠️ [AutoAppointment] Failed in autoGenerateTopic:`, apptErr.message);
        }
        // ── AUTO-APPOINTMENT END ──

        console.log(`✅ [AutoTopic] Conv ${conversationId} (${totalCustomerMsgs} msgs): "${topic}"`);
    } catch (err) {
        console.error('❌ [AutoTopic] Error:', err.message);
    }
};

/**
 * Müşteri yazışmasının genel duygusunu (Sentiment) analiz eder.
 *
 * @param {string} workspaceId 
 * @param {string} conversationId 
 * @param {boolean} force - Zaten analiz edilmişse bile zorla
 */
export const analyzeSentimentForConversation = async (workspaceId, conversationId, force = false) => {
    // KULLANICI İSTEĞİ: Yüksek ilgi vs puan hesaplamasını ve gösterimini tamamen kaldır.
    return null;
    
    try {
        if (!workspaceId || !conversationId) return null;

        // Konuşmayı çek
        const existing = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: {
                messages: {
                    orderBy: { createdAt: 'asc' },
                    select: { content: true, isFromContact: true }
                }
            }
        });

        if (!existing) return null;
        if (existing.sentiment && !force) return null; // Zaten varsa atla

        // Mesaj yoksa atla
        if (!existing.messages || existing.messages.length === 0) return null;

        // Get API key
        const aiApiKey = await getEffectiveAiApiKey(workspaceId);
        if (!aiApiKey) return null;

        // Log oluştur
        const chatLog = existing.messages.map(m =>
            `${m.isFromContact ? 'Müşteri' : 'Temsilci/Bot'}: ${m.content}`
        ).join('\n');

        const prompt = `Aşağıdaki müşteri konuşmasını analiz et. 
Sadece JSON döndür. Başka hiçbir şey yazma.
İlgi ve Memnuniyet durumunu (sentiment) GEREKTİĞİ GİBİ şu etiketlerden BİRİNE göre sınıflandır:
- "YÜKSEK İLGİLİ" (Olumlu sinyal, alışverişe hazır, çok mutlu veya çok ilgili)
- "OLUMLU" (Normal bir akış, sorunsuz ilerliyor)
- "NÖTR" (Sadece soru soruyor, duygu barındırmıyor)
- "İLGİSİZ" (Kısa cevaplar, konuşmaya pek hevesli değil)
- "KIZGIN/ŞİKAYET" (Sorunu var, öfkeli, memnuniyetsiz veya iptal istiyor)

Bir de 0 ile 100 arasında ilgi/memnuniyet puanı ver (sentimentScore). 
100 en ilgili/olumlu, 0 en şikayetçi/kızgın, 50 nötr.

JSON formatı:
{ "sentiment": "OLUMLU", "score": 75 }

Konuşma Geçmişi:
${chatLog.substring(0, 5000)}`;

        const genAI = new GoogleGenerativeAI(aiApiKey);
        // Daha hızlı maliyet-etkin model kullanılabilir (1.5-flash vb)
        const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
        const result = await model.generateContent(prompt);
        let text = result.response.text().trim();

        // Temizleme
        text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            console.error('Sentiment JSON parse hatası:', text);
            return null;
        }

        if (parsed.sentiment) {
            await prisma.conversation.update({
                where: { id: conversationId },
                data: {
                    sentiment: parsed.sentiment,
                    sentimentScore: parsed.score || 50
                }
            });
            console.log(`✅ [Sentiment] Conversation ${conversationId}: ${parsed.sentiment} (${parsed.score})`);
            return parsed;
        }

        return null;
    } catch (err) {
        console.error('❌ [Sentiment] Error:', err.message);
        return null;
    }
};

// ─── AI Excel Column Mapping ─────────────────────────────────────────────────
// POST /:workspaceId/detect-import-columns
// Body: { headers: string[], sampleRows: string[][] }
// Returns: { mapping: { name: number, phone: number, email: number, notes: number }, confidence: string }
export const detectImportColumns = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { headers, sampleRows } = req.body;

        if (!headers || !Array.isArray(headers) || headers.length === 0) {
            return res.status(400).json({ error: 'Headers array is required' });
        }

        const aiApiKey = await getEffectiveAiApiKey(workspaceId);
        if (!aiApiKey) {
            return res.status(400).json({ error: 'AI API Key not configured' });
        }

        // Build a clear representation of the data
        const headerList = headers.map((h, i) => `  Sütun ${i}: "${h}"`).join('\n');
        const sampleList = (sampleRows || []).slice(0, 5).map((row, ri) =>
            `  Satır ${ri + 1}: ${row.map((c, ci) => `[${ci}]="${c}"`).join(' | ')}`
        ).join('\n');

        const prompt = `Aşağıdaki Excel tablosunun sütun başlıklarını ve örnek verileri analiz et.
Her sütunun hangi bilgiyi içerdiğini tespit et.

SÜTUN BAŞLIKLARI:
${headerList}

ÖRNEK VERİLER:
${sampleList}

GÖREV: Her sütunun aşağıdaki alanlardan hangisine karşılık geldiğini belirle:
- name: Kişi adı, ad soyad, müşteri adı
- phone: Telefon numarası, GSM, cep telefonu
- email: E-posta adresi
- notes: Notlar, açıklama, mesaj, detay
- date: Tarih, oluşturulma tarihi
- company: Şirket, firma adı
- city: Şehir, il, lokasyon
- skip: Bu sütun kişi içe aktarma için gereksiz (ID, sıra no, vs.)

SADECE şu JSON formatında yanıt ver, başka hiçbir şey yazma:
{"mapping": {"0": "field_type", "1": "field_type", ...}, "confidence": "high|medium|low"}

Örnek: {"mapping": {"0": "skip", "1": "name", "2": "phone", "3": "email"}, "confidence": "high"}`;

        const genAI = new GoogleGenerativeAI(aiApiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-3.5-flash',
            generationConfig: { responseMimeType: 'application/json' }
        });
        const result = await model.generateContent(prompt);
        let responseText = result.response.text().trim();

        // Parse AI response
        responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(responseText);

        console.log(`🧠 [AI Import] Column mapping detected:`, JSON.stringify(parsed));
        res.json(parsed);
    } catch (error) {
        console.error('❌ [AI Import] Column detection error:', error.message);
        res.status(500).json({ error: 'Sütun algılama başarısız', details: error.message });
    }
};

// Get all connected channels in a workspace (for bot assignment UI)
export const getWorkspaceChannels = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        
        console.log(`📡 [getWorkspaceChannels] workspaceId: ${workspaceId}`);
        
        // Facebook pages (for FB Messenger DM)
        const facebookPages = await prisma.facebookPage.findMany({
            where: { workspaceId },
            select: { id: true, pageName: true, assignedBotId: true, instagramBusinessId: true, instagramUsername: true, instagramBotId: true }
        });
        console.log(`   └─ Facebook pages found: ${facebookPages.length}`, facebookPages.map(p => p.pageName));
        
        // WhatsApp numbers
        const whatsappNumbers = await prisma.whatsappPhoneNumber.findMany({
            where: { workspaceId },
            select: { id: true, displayPhoneNumber: true, name: true, assignedBotId: true }
        });
        
        // Email channels
        const emailChannels = await prisma.emailChannel.findMany({
            where: { workspaceId, isActive: true },
            select: { id: true, email: true, provider: true, assignedBotId: true }
        });
        
        // Web widgets
        const webWidgets = await prisma.webWidget.findMany({
            where: { workspaceId, isActive: true },
            select: { id: true, name: true, title: true, assignedBotId: true }
        });
        
        // Build unified channel list
        const channels = [];
        
        facebookPages.forEach(p => {
            channels.push({
                id: p.id,
                type: 'FACEBOOK',
                name: p.pageName,
                assignedBotId: p.assignedBotId,
                icon: '💬',
                field: 'assignedBotId'
            });
            if (p.instagramBusinessId && p.instagramUsername) {
                channels.push({
                    id: p.id,
                    type: 'INSTAGRAM',
                    name: `@${p.instagramUsername}`,
                    assignedBotId: p.instagramBotId,
                    icon: '📸',
                    field: 'instagramBotId'
                });
            }
        });
        
        whatsappNumbers.forEach(w => {
            channels.push({
                id: w.id,
                type: 'WHATSAPP',
                name: w.name || w.displayPhoneNumber,
                assignedBotId: w.assignedBotId,
                icon: '📱',
                field: 'assignedBotId'
            });
        });
        
        emailChannels.forEach(e => {
            channels.push({
                id: e.id,
                type: 'EMAIL',
                name: e.email,
                assignedBotId: e.assignedBotId,
                icon: '📧',
                field: 'assignedBotId'
            });
        });
        
        webWidgets.forEach(w => {
            channels.push({
                id: w.id,
                type: 'WEB_WIDGET',
                name: w.name || w.title || 'Web Widget',
                assignedBotId: w.assignedBotId,
                icon: '🌐',
                field: 'assignedBotId'
            });
        });
        
        res.json({ channels });
    } catch (error) {
        console.error('Get workspace channels error:', error);
        res.status(500).json({ error: 'Failed to get channels' });
    }
};

// Assign/unassign a bot to specific channels
export const updateBotChannels = async (req, res) => {
    try {
        const { workspaceId, botId } = req.params;
        const { assignments } = req.body;
        // assignments = [{ channelId, channelType, assign }]
        // assign: true = assign this bot, false = unassign
        
        const bot = await prisma.aIBot.findFirst({ where: { id: botId, workspaceId } });
        if (!bot) return res.status(404).json({ error: 'Bot not found' });
        
        for (const a of assignments) {
            const botIdValue = a.assign ? botId : null;
            
            switch (a.channelType) {
                case 'FACEBOOK':
                    await prisma.facebookPage.update({
                        where: { id: a.channelId },
                        data: { assignedBotId: botIdValue }
                    });
                    break;
                case 'INSTAGRAM':
                    await prisma.facebookPage.update({
                        where: { id: a.channelId },
                        data: { instagramBotId: botIdValue }
                    });
                    break;
                case 'WHATSAPP':
                    await prisma.whatsappPhoneNumber.update({
                        where: { id: a.channelId },
                        data: { assignedBotId: botIdValue }
                    });
                    break;
                case 'EMAIL':
                    await prisma.emailChannel.update({
                        where: { id: a.channelId },
                        data: { assignedBotId: botIdValue }
                    });
                    break;
                case 'WEB_WIDGET':
                    await prisma.webWidget.update({
                        where: { id: a.channelId },
                        data: { assignedBotId: botIdValue }
                    });
                    break;
            }
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Update bot channels error:', error);
        res.status(500).json({ error: 'Failed to update channels' });
    }
};
