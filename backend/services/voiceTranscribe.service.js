/**
 * ═══════════════════════════════════════════════════════════════
 * SESLİ MESAJ ÇÖZÜMLEME (VOICE_MESSAGE_TRANSCRIBE)
 * ═══════════════════════════════════════════════════════════════
 *
 * Müşteri sesli mesaj attığında sohbette yalnızca "📎 Ses" yazıyordu;
 * temsilci dinlemeden ne istendiğini bilemiyor, AI bot da içeriği
 * göremiyordu. Bu servis sesi metne çevirip mesaj içeriğine yazar.
 *
 * Ses dosyaları WhatsApp webhook'unda backend/uploads/media altına
 * indiriliyor; buradan okuyup workspace'in kendi Gemini anahtarıyla
 * çözümlüyoruz (ayrı bir servis veya ek maliyet kalemi yok).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from '../lib/prisma.js';
import { getRuleConfig, logExecution } from './ruleEngine.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = path.join(__dirname, '..', 'uploads', 'media');
const TAG = '[VoiceTranscribe]';
const FALLBACK_MODEL = 'gemini-2.5-flash';
const MAX_BYTES = 18 * 1024 * 1024; // Gemini inline veri sınırı için güvenli üst sınır

const MIME = {
    '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.mp3': 'audio/mp3',
    '.m4a': 'audio/mp4', '.mp4': 'audio/mp4', '.wav': 'audio/wav',
    '.aac': 'audio/aac', '.amr': 'audio/amr'
};

/**
 * Sesli mesajı çözümler ve mesaj içeriğine yazar.
 * Kural pasifse hiçbir şey yapmaz.
 */
export async function transcribeVoiceMessage(opts = {}) {
    const { workspaceId, contactId, messageId, mediaUrl } = opts;
    if (!workspaceId || !messageId || !mediaUrl) return null;

    try {
        // Kural aktif mi? (pasifse config null döner)
        const config = await getRuleConfig(workspaceId, 'VOICE_MESSAGE_TRANSCRIBE');
        if (!config) return null;

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { aiApiKey: true, aiModel: true, company: { select: { aiApiKey: true, aiModel: true } } }
        });
        const apiKey = workspace?.aiApiKey || workspace?.company?.aiApiKey;
        if (!apiKey) {
            console.warn(`${TAG} AI anahtarı yok → çözümleme atlandı`);
            return null;
        }

        // Yerel dosyayı bul — mediaUrl "/api/uploads/media/<dosya>" biçiminde
        const fileName = path.basename(String(mediaUrl));
        const filePath = path.join(MEDIA_DIR, fileName);
        if (!fs.existsSync(filePath)) {
            console.warn(`${TAG} ses dosyası bulunamadı: ${fileName}`);
            return null;
        }

        const stat = fs.statSync(filePath);
        if (stat.size > MAX_BYTES) {
            console.warn(`${TAG} ses dosyası çok büyük (${(stat.size / 1048576).toFixed(1)}MB) → atlandı`);
            return null;
        }

        const ext = path.extname(fileName).toLowerCase();
        const mimeType = MIME[ext];
        if (!mimeType) {
            console.warn(`${TAG} desteklenmeyen ses biçimi: ${ext}`);
            return null;
        }

        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: workspace?.aiModel || workspace?.company?.aiModel || FALLBACK_MODEL,
            systemInstruction:
                'Sana bir sesli mesaj verilecek. Görevin YALNIZCA konuşulanı birebir metne çevirmek. ' +
                'Yorum yapma, özetleme, soruyu cevaplama, ekleme yapma. Konuşma Türkçe ise Türkçe yaz. ' +
                'Ses anlaşılmıyorsa veya konuşma yoksa yalnızca ANLASILMADI yaz.'
        });

        const base64 = fs.readFileSync(filePath).toString('base64');
        const result = await model.generateContent([
            { inlineData: { mimeType, data: base64 } },
            { text: 'Bu sesli mesajı metne çevir.' }
        ]);

        const transcript = (result?.response?.text() || '').trim();
        if (!transcript || transcript === 'ANLASILMADI') {
            console.log(`${TAG} çözümlenemedi (${fileName})`);
            if (contactId) {
                await logExecution(workspaceId, 'VOICE_MESSAGE_TRANSCRIBE', contactId, 'FAILED', {
                    reason: 'Ses anlaşılamadı', file: fileName
                });
            }
            return null;
        }

        // Mesaj içeriğini güncelle — ses dosyası (mediaUrl) yerinde kalır
        await prisma.message.update({
            where: { id: messageId },
            data: { content: `🎤 Sesli mesaj: "${transcript}"` }
        });

        console.log(`${TAG} çözümlendi (${fileName}): "${transcript.substring(0, 80)}"`);

        if (contactId) {
            await logExecution(workspaceId, 'VOICE_MESSAGE_TRANSCRIBE', contactId, 'SUCCESS', {
                file: fileName, length: transcript.length
            });
        }

        return transcript;
    } catch (err) {
        console.error(`${TAG} hata:`, err.message);
        return null;
    }
}

export default { transcribeVoiceMessage };
