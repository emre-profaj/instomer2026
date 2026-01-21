import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import multer from 'multer';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
import mammoth from 'mammoth';
import { getIO, emitToWorkspace } from '../socket.js';
import { checkAiUsageLimit, incrementAiUsage } from '../services/aiUsage.service.js';

const prisma = new PrismaClient();

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
        // Get company info
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                companyName: true,
                companyDescription: true,
                companyAddress: true,
                companyPhone: true,
                companyEmail: true,
                companyWebsite: true,
                companyWorkingHours: true
            }
        });

        // Get knowledge base entries
        const knowledgeEntries = await prisma.knowledgeBase.findMany({
            where: { workspaceId },
            select: { title: true, content: true, sourceType: true }
        });

        let context = "";

        // Add company info if exists
        if (workspace && (workspace.companyName || workspace.companyDescription)) {
            context += "=== ŞİRKET BİLGİLERİ ===\n";
            if (workspace.companyName) context += `Şirket Adı: ${workspace.companyName}\n`;
            if (workspace.companyDescription) context += `Hakkımızda: ${workspace.companyDescription}\n`;
            if (workspace.companyAddress) context += `Adres: ${workspace.companyAddress}\n`;
            if (workspace.companyPhone) context += `Telefon: ${workspace.companyPhone}\n`;
            if (workspace.companyEmail) context += `E-posta: ${workspace.companyEmail}\n`;
            if (workspace.companyWebsite) context += `Website: ${workspace.companyWebsite}\n`;
            if (workspace.companyWorkingHours) context += `Çalışma Saatleri: ${workspace.companyWorkingHours}\n`;
            context += "\n";
        }

        // Add knowledge base entries
        if (knowledgeEntries && knowledgeEntries.length > 0) {
            context += "=== BİLGİ BANKASI ===\n";
            for (const entry of knowledgeEntries) {
                context += `--- ${entry.title} ---\n${entry.content}\n\n`;
            }
        }

        return context;
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
                    take: 10,
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

        // Get workspace-level knowledge base (company info + knowledge entries)
        const workspaceKnowledge = await getWorkspaceKnowledgeContext(workspaceId);
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

### SİSTEM TALİMATI ###
${systemPrompt}

### KULLANILACAK BİLGİLER ###
${documentContext || "Bilgi bankası boş."}

### YANITLAMA KURALLARI ###
1. SADECE yukarıdaki bilgileri kullanarak yanıt ver.
2. Bilgi bankasında olmayan konularda "Bu konuda size yardımcı olamıyorum, lütfen müşteri temsilcimizle iletişime geçin" de.
3. Yanıtların kısa, net ve profesyonel olsun.
4. Türkçe yanıt ver.
5. Müşteriye her zaman yardımcı olmaya çalış.
6. Tarih veya saat sorulursa yukarıdaki GÜNCEL TARİH bilgisini kullan, kendi bilgini KULLANMA.
7. Müşteri adını veya iletişim bilgilerini sorulursa yukarıdaki MÜŞTERİ BİLGİLERİ kısmını kullan.`;

        // Merge consecutive messages from same role to satisfy Gemini API requirements
        const historyParts = [
            {
                role: "user",
                parts: [{ text: fullSystemInstruction }]
            },
            {
                role: "model",
                parts: [{ text: "Anladım. Sistem talimatlarını ve bilgi bankasını kullanarak müşterilere yardımcı olacağım." }]
            }
        ];

        let lastRole = "model"; // Our starting point after the system-ack

        for (const msg of validMessages) {
            const currentRole = msg.isFromContact ? "user" : "model";

            if (currentRole === lastRole) {
                // Merge with previous message
                const lastHistoryItem = historyParts[historyParts.length - 1];
                lastHistoryItem.parts[0].text += `\n\n[${currentRole === 'user' ? 'Müşteri' : 'Temsilci'} Ek Bilgi]: ${msg.content}`;
            } else {
                // New turn
                historyParts.push({
                    role: currentRole,
                    parts: [{ text: msg.content }]
                });
                lastRole = currentRole;
            }
        }

        // Ensure the last message is from the USER so the model can reply
        // If the last message in history is from 'model', we can't ask the model to reply to itself easily in chat mode
        // unless we force a user turn.

        if (historyParts.length > 0 && historyParts[historyParts.length - 1].role === "model") {
            // Force a user prompt if the last message was from the bot/agent
            historyParts.push({
                role: "user",
                parts: [{ text: "Please continue or provide the next logical response." }]
            });
        }

        const genAI = new GoogleGenerativeAI(aiApiKey);

        // Helper function to try generating content with fallback
        const tryGenerate = async (modelName) => {
            console.log(`🤖 Attempting to generate with model: ${modelName}`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const chat = model.startChat({ history: historyParts });
            return await chat.sendMessage("Son mesaja uygun bir yanıt öner.");
        };

        let result;
        try {
            // First try user requested model
            result = await tryGenerate("gemini-2.0-flash");
        } catch (primaryError) {
            console.warn(`⚠️ Primary model (gemini-2.0-flash) failed: ${primaryError.message}`);

            // If quota/not found/etc, try fallback
            if (primaryError.message.includes('404') || primaryError.message.includes('429') || primaryError.message.includes('503')) {
                console.log('🔄 Switching to fallback model: gemini-2.0-flash');
                try {
                    result = await tryGenerate("gemini-2.0-flash");
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

        // Get first customer message as topic
        const firstCustomerMessage = conversation.messages.find(m => m.isFromContact);
        const topic = firstCustomerMessage ? firstCustomerMessage.content.substring(0, 100) : null;

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
            result = await trySummarize("gemini-2.0-flash");
        } catch (e) {
            console.warn('Fallback to 1.5 for summary');
            result = await trySummarize("gemini-1.5-flash");
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

// Update conversation analysis (topic/summary) - for manual edits
export const updateConversationAnalysis = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { topic, summary } = req.body;

        const updated = await prisma.conversation.update({
            where: { id: conversationId },
            data: {
                aiTopic: topic || null,
                aiSummary: summary || null
            }
        });

        console.log(`✅ Updated AI analysis for conversation ${conversationId}`);
        res.json({ success: true, topic: updated.aiTopic, summary: updated.aiSummary });
    } catch (error) {
        console.error('Update analysis error:', error);
        res.status(500).json({ error: 'Analiz kaydedilemedi.', details: error.message });
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
            result = await tryGenerate("gemini-2.0-flash");
        } catch (e) {
            console.warn('Fallback to gemini-1.5-flash for suggestions');
            result = await tryGenerate("gemini-1.5-flash");
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
            extractedData = await tryExtract("gemini-2.0-flash");
            console.log('✅ [AI Extract] Extracted info:', JSON.stringify(extractedData));
        } catch (firstError) {
            console.warn(`⚠️ [AI Extract] gemini-2.0-flash failed: ${firstError.message}`);
            try {
                extractedData = await tryExtract("gemini-2.0-flash");
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

// Helper for Webhooks to get Auto Reply
// type: 'CHATS' for DM conversations, 'COMMENTS' for post/media comments
// pageId: required for COMMENTS type to find the assigned comment bot
export const getAutoReply = async (workspaceId, conversationId, userMessage, channel = null, type = 'CHATS', pageId = null) => {
    try {
        console.log(`🤖 Auto-reply check for workspace ${workspaceId}, channel: ${channel}, type: ${type}`);

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
                    teamIds: true,
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
                        take: 10,
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
                    if (teamIds.length > 0) {
                        const team = await prisma.team.findFirst({
                            where: { id: teamIds[0] },
                            include: { assignedBot: { include: { documents: true } } }
                        });
                        if (team?.assignedBot) {
                            teamBot = team.assignedBot;
                        }
                    }
                } catch (e) {
                    console.error('Error parsing teamIds:', e);
                }
            }

            console.log(`🔍 [getAutoReply] Tracing: channel=${channel}, type=${type}, workspaceId=${workspaceId}`);
            console.log(`   └─ Conversation ID: ${conversationId}`);

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
            } else if (channel?.toLowerCase() === 'widget') {
                // For Widget, check if there's a WebWidget with assigned bot
                const webWidget = await prisma.webWidget.findFirst({
                    where: {
                        workspaceId,
                        isActive: true // Only get active widgets
                    },
                    include: { assignedBot: { include: { documents: true } } }
                });
                if (webWidget?.assignedBot) {
                    activeBot = webWidget.assignedBot;
                    console.log(`✅ Using Widget-Assigned Bot: ${activeBot.name}`);
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
        if (!isBotScheduleActive(activeBot)) {
            console.log(`⏰ Bot ${activeBot.name} is not within scheduled time. Skipping auto-reply.`);
            if (type === 'CHATS' && conversationId) releaseAiReplyLock(conversationId);
            return null;
        }

        console.log(`✅ Active bot prepared: ${activeBot.name}`);

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

        // Add instruction to use knowledge base
        if (documentContext) {
            systemPrompt += "\n\nÖNEMLİ: Aşağıdaki Bilgi Bankası, Şirket Bilgileri ve Bot Dökümanlarını kullanarak müşteri sorularını yanıtla. Bu bilgiler dışında cevap verme.";
            console.log(`📋 [AI] Total document context: ${documentContext.length} chars`);
        } else {
            console.log(`⚠️ [AI] No document context available!`);
        }

        console.log(`🤖 [AI] System Prompt (first 200 chars): ${systemPrompt.substring(0, 200)}...`);

        // 3. fetch conversation history for context
        // For COMMENTS type, there's no conversation history - just respond to the single comment
        const validMessages = (type === 'COMMENTS' || !conversation?.messages)
            ? []
            : conversation.messages
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
        const contact = conversation?.contact;
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

### SİSTEM TALİMATI ###
${systemPrompt}

### KULLANILACAK BİLGİLER ###
${documentContext || "Bilgi bankası boş."}

### YANITLAMA KURALLARI ###
1. SADECE yukarıdaki bilgileri kullanarak yanıt ver.
2. **ÖNEMLİ**: Eğer bilgi bankasında sorulan konuyla ilgili BİLGİ YOKSA, yanıtının başına [HANDOFF] yaz ve ardından "Bu konuda size daha iyi yardımcı olabilecek müşteri temsilcimize aktarıyorum. En kısa sürede size dönüş yapacağız." mesajını ver.
3. Yanıtların kısa, net ve profesyonel olsun.
4. Türkçe yanıt ver.
5. Müşteriye her zaman yardımcı olmaya çalış.
6. Tarih veya saat sorulursa yukarıdaki GÜNCEL TARİH bilgisini kullan, kendi bilgini KULLANMA.
7. Eğer soruya bilgi bankasından cevap verebiliyorsan, [HANDOFF] YAZMA.
8. Müşteri adını veya iletişim bilgilerini sorulursa yukarıdaki MÜŞTERİ BİLGİLERİ kısmını kullan.`;

        const historyParts = [
            {
                role: "user",
                parts: [{ text: fullSystemInstruction }]
            },
            {
                role: "model",
                parts: [{ text: "Anladım. Sistem talimatlarını ve bilgi bankasını kullanarak müşterilere yardımcı olacağım." }]
            }
        ];

        let lastRole = "model"; // Starting point after system-ack

        for (const msg of validMessages) {
            const currentRole = msg.isFromContact ? "user" : "model";

            if (currentRole === lastRole) {
                // Merge with previous message
                const lastHistoryItem = historyParts[historyParts.length - 1];
                lastHistoryItem.parts[0].text += `\n\n[Ek Bilgi]: ${msg.content}`;
            } else {
                // New turn
                historyParts.push({
                    role: currentRole,
                    parts: [{ text: msg.content }]
                });
                lastRole = currentRole;
            }
        }

        // Ensure last message is from user OR add the new user message
        if (historyParts[historyParts.length - 1].role === 'model') {
            historyParts.push({ role: 'user', parts: [{ text: userMessage || 'Hello' }] });
        } else if (userMessage) {
            // Append current user message to the last user turn if it's not already there
            const lastPart = historyParts[historyParts.length - 1].parts[0];
            if (!lastPart.text.includes(userMessage)) {
                lastPart.text += `\n\n[Current Message]: ${userMessage}`;
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

        // Fallback Logic
        const tryGenerate = async (modelName) => {
            const model = genAI.getGenerativeModel({ model: modelName });
            // We just send the last part again or a 'continue' prompt? 
            // Actually startChat + sendMessage is cleaner.
            // But if history already has the user message at the end, we can send " " or something?
            // No, standard is: history up to N-1, sendMessage(N)
            // Simpler: Just put all history in historyParts, and ask for "Generate response"

            // Correct approach: History includes everything EXCEPT the very last user message?
            // No, the gemini SDK `sendMessage` ADDS the new message to history.
            // If we pre-fill history with the new message, we can't easily trigger generation.
            // So let's pop the last user message if it exists and use it as trigger.

            let lastMsg = "Merhabalar";
            if (historyParts[historyParts.length - 1].role === 'user') {
                lastMsg = historyParts.pop().parts[0].text;
            }

            const chat = model.startChat({ history: historyParts });
            return await chat.sendMessage(lastMsg);
        };

        let result;
        try {
            result = await tryGenerate("gemini-2.0-flash");
        } catch (e) {
            console.log('Fallback to 1.5 due to:', e.message);
            result = await tryGenerate("gemini-2.0-flash");
        }

        const responseText = result.response.text();

        // Release lock after generating response
        if (type === 'CHATS' && conversationId) {
            releaseAiReplyLock(conversationId);
        }

        // 🚨 CHECK FOR USER'S HANDOFF CONFIRMATION
        const userMessageLower = userMessage?.toLowerCase() || '';
        const confirmPhrases = ['evet', 'tamam', 'olur', 'lütfen', 'yönlendir', 'aktarın', 'görüşmek istiyorum', 'temsilci', 'yes', 'ok'];
        const declinePhrases = ['hayır', 'yok', 'istemiyorum', 'gerek yok', 'no', 'olmaz'];

        // Check if conversation has pending handoff request
        if (type === 'CHATS' && conversationId && conversation?.handoffPending) {
            if (confirmPhrases.some(phrase => userMessageLower.includes(phrase))) {
                console.log(`✅ [HANDOFF] User confirmed handoff for conversation: ${conversationId}`);

                // Disable bot and proceed with handoff
                await prisma.conversation.update({
                    where: { id: conversationId },
                    data: { botEnabled: false, handoffPending: false }
                });

                // Emit socket event to notify team
                try {
                    const { emitToWorkspace } = await import('../socket.js');
                    emitToWorkspace(workspaceId, 'bot_handoff', {
                        conversationId,
                        workspaceId,
                        message: 'Müşteri takıma yönlendirilmeyi onayladı.',
                        botName: activeBot.name
                    });
                } catch (socketErr) {
                    console.error('Socket emit error for handoff:', socketErr);
                }

                await incrementAiUsage(workspaceId);
                releaseAiReplyLock(conversationId);
                return "Sizi müşteri temsilcimize aktarıyorum. En kısa sürede size dönüş yapacağız. 🙏";
            } else if (declinePhrases.some(phrase => userMessageLower.includes(phrase))) {
                console.log(`❌ [HANDOFF] User declined handoff for conversation: ${conversationId}`);

                // Clear pending handoff
                await prisma.conversation.update({
                    where: { id: conversationId },
                    data: { handoffPending: false }
                });

                await incrementAiUsage(workspaceId);
                releaseAiReplyLock(conversationId);
                return "Anladım, size başka bir konuda yardımcı olabilir miyim?";
            }
        }

        // 🚨 HANDOFF DETECTION - Bot can't answer, ask for confirmation first
        if (responseText.includes('[HANDOFF]') && type === 'CHATS' && conversationId) {
            console.log(`🔄 [HANDOFF] Bot couldn't answer, asking for confirmation: ${conversationId}`);

            // Mark conversation as having pending handoff
            await prisma.conversation.update({
                where: { id: conversationId },
                data: { handoffPending: true }
            });
            console.log(`⏳ [HANDOFF] Pending handoff set for conversation: ${conversationId}`);

            // 📊 AI Kullanım sayacını artır
            await incrementAiUsage(workspaceId);

            // Release lock before return
            releaseAiReplyLock(conversationId);

            // Ask user if they want to be redirected
            return "Bu konuda size yardımcı olamadım. Sizi müşteri temsilcimize aktarmamı ister misiniz? 🤝";
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

        return responseText;

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
        const { aiApiKey } = req.body;
        await prisma.workspace.update({ where: { id: workspaceId }, data: { aiApiKey } });
        res.json({ message: 'Saved' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save settings' });
    }
};

export const getSettings = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { aiApiKey: true } });
        res.json({ aiApiKey: ws?.aiApiKey || '' });
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
            autoReplyDelayEnabled, autoReplyDelaySeconds, autoReplyDelayMessage
        } = req.body;

        const bot = await prisma.aIBot.create({
            data: {
                name,
                role,
                prompt,
                workspaceId,
                botType: botType || 'CHATS',
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
                autoReplyDelayMessage: autoReplyDelayMessage || null
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
                webWidget: botRoutings.filter(r => r.channel === 'WEB_WIDGET').map(r => ({
                    id: r.id,
                    name: 'Web Widget',
                    team: r.team?.name,
                    type: 'Yönlendirme'
                })),
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
            dailyReminderEnabled, dailyReminderHours, dailyReminderMessage
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
                dailyReminderMessage: dailyReminderMessage || null
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
            extracted = await tryModel("gemini-2.0-flash");
        } catch (err) {
            console.warn(`⚠️ [AI Auto-Extract] gemini-2.0-flash failed, trying fallback: ${err.message}`);
            try {
                extracted = await tryModel("gemini-2.0-flash");
            } catch (err2) {
                console.error(`❌ [AI Auto-Extract] All models failed: ${err2.message}`);
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
                updateData.phone = cleanPhone;
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
            // Auto-upgrade status to HOT_OPPORTUNITY if phone is being added and current status is NEW
            if (updateData.phone && conversation.contact.status === 'NEW') {
                updateData.status = 'HOT_OPPORTUNITY';
                console.log(`📱 [AI Auto-Extract] Auto-upgrading status to HOT_OPPORTUNITY (phone extracted)`);
            }

            console.log(`💾 [AI Auto-Extract] Saving new info for contact ${conversation.contact.id}:`, updateData);
            await prisma.contact.update({
                where: { id: conversation.contact.id },
                data: updateData
            });

            // Emit socket event (workspace-specific)
            emitToWorkspace(workspaceId, 'contact_updated', {
                workspaceId,
                contactId: conversation.contact.id,
                updatedFields: updateData
            });
            console.log('📡 [AI Auto-Extract] WebSocket event (contact_updated) emitted to workspace');
        } else {
            console.log(`ℹ️ [AI Auto-Extract] No updates needed. Current: [${oldName}, ${oldPhone}, ${oldEmail}], Extracted: [${extracted.name}, ${extracted.phone}, ${extracted.email}] (Generic: ${isGenericName})`);
        }

        return extracted;
    } catch (error) {
        console.error('❌ [AI Auto-Extract] Final Error:', error);
        return null;
    }
};
