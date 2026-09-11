import prisma from '../lib/prisma.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

/**
 * Instomer KB girişini Retell'e otomatik senkronize et.
 * Fire-and-forget — ana isteği bloklamaz.
 * Her KB girişi kendi bağımsız Retell KB'sini alır.
 */
const autoSyncToRetell = async (workspaceId, kbEntry) => {
    try {
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellApiKey: true, retellAgentId: true }
        });
        if (!workspace?.retellApiKey) return; // Retell yapılandırılmamış

        const { default: Retell } = await import('retell-sdk');
        const client = new Retell({ apiKey: workspace.retellApiKey });
        let retellKbId = kbEntry.retellKbId;
        let isNew = false;

        if (retellKbId) {
            // Mevcut Retell KB'yi güncelle: kaynakları temizle ve yeniden ekle
            try {
                const existing = await client.knowledgeBase.retrieve(retellKbId);
                for (const src of (existing.knowledge_base_sources || [])) {
                    await client.knowledgeBase.deleteSource(retellKbId, src.source_id).catch(() => {});
                }
            } catch (e) {
                console.warn(`⚠️ [AutoSync] Retell KB ${retellKbId} not found, creating new`);
                retellKbId = null;
            }
        }

        const textContent = (kbEntry.content || kbEntry.title || '').trim() || 'Instomer bilgi tabanı kaydı.';
        const safeTitle = (kbEntry.title || 'Instomer KB').trim().substring(0, 35);

        if (!retellKbId) {
            // Yeni Retell KB oluştur (Retell max name length: 40 chars, text ile birlikte)
            const newKb = await client.knowledgeBase.create({
                knowledge_base_name: safeTitle,
                knowledge_base_texts: [{
                    title: safeTitle,
                    text: textContent
                }]
            });
            retellKbId = newKb.knowledge_base_id;
            isNew = true;
        } else {
            // Mevcut KB'ye kaynak ekle
            await client.knowledgeBase.addSources(retellKbId, {
                knowledge_base_texts: [{
                    title: safeTitle,
                    text: textContent
                }]
            });
        }

        // retellKbId'yi kaydet
        await prisma.knowledgeBase.update({
            where: { id: kbEntry.id },
            data: { retellKbId }
        });

        // Yeni KB oluşturulduysa → workspace'in TÜM agent'larına otomatik bağla
        if (isNew) {
            try {
                const rawAgents = await client.agent.list().catch(() => []);
                const allAgents = Array.isArray(rawAgents) ? rawAgents : (Array.isArray(rawAgents?.items) ? rawAgents.items : (Array.isArray(rawAgents?.data) ? rawAgents.data : []));
                for (const ag of allAgents) {
                    const currentKbIds = ag.knowledge_base_ids || [];
                    if (!currentKbIds.includes(retellKbId)) {
                        await client.agent.update(ag.agent_id, {
                            knowledge_base_ids: [...currentKbIds, retellKbId]
                        }).catch(() => {});
                    }
                }
                console.log(`🔗 [AutoSync] Auto-bound KB ${retellKbId} to all agents`);
            } catch (agentErr) {
                console.warn(`⚠️ [AutoSync] Could not auto-bind KB to agents:`, agentErr.message);
            }
        }

        console.log(`✅ [AutoSync] KB "${kbEntry.title}" → Retell KB ${retellKbId}`);
    } catch (error) {
        console.error(`❌ [AutoSync] KB sync failed for ${kbEntry.id}:`, error.message);
    }
};

/**
 * Instomer'den silinen KB'nin Retell karşılığını da sil.
 */
const autoDeleteFromRetell = async (workspaceId, retellKbId) => {
    if (!retellKbId) return;
    try {
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { retellApiKey: true }
        });
        if (!workspace?.retellApiKey) return;

        const { default: Retell } = await import('retell-sdk');
        const client = new Retell({ apiKey: workspace.retellApiKey });
        await client.knowledgeBase.delete(retellKbId);
        console.log(`🗑️ [AutoSync] Deleted Retell KB ${retellKbId}`);
    } catch (error) {
        console.warn(`⚠️ [AutoSync] Failed to delete Retell KB ${retellKbId}:`, error.message);
    }
};

/**
 * POST /api/knowledge-base/:workspaceId/bulk-sync-retell
 * Mevcut tüm Instomer KB'leri Retell'e toplu sync et (retellKbId olmayanlar için)
 */
export const bulkSyncAllToRetell = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const entries = await prisma.knowledgeBase.findMany({
            where: { workspaceId, retellKbId: null }
        });
        if (entries.length === 0) {
            return res.json({ success: true, message: 'Tüm KB\'ler zaten senkronize', synced: 0 });
        }
        // Fire-and-forget for each entry
        let count = 0;
        for (const entry of entries) {
            await autoSyncToRetell(workspaceId, entry);
            count++;
        }
        res.json({ success: true, message: `${count} Bilgi Bankası AI Call Agent'a senkronize edildi`, synced: count });
    } catch (error) {
        console.error('bulkSyncAllToRetell error:', error.message);
        res.status(500).json({ error: 'Toplu senkronizasyon başarısız' });
    }
};


// Lazy load mammoth and pdf-parse to avoid startup issues
let mammoth = null;
let pdfParse = null;

const loadMammoth = async () => {
    if (!mammoth) {
        mammoth = (await import('mammoth')).default;
    }
    return mammoth;
};

const loadPdfParse = async () => {
    if (!pdfParse) {
        pdfParse = (await import('pdf-parse')).default;
    }
    return pdfParse;
};

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = './uploads/knowledge';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['.pdf', '.docx', '.doc', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Sadece PDF, DOCX, DOC ve TXT dosyaları yüklenebilir'), false);
    }
};

export const upload = multer({ 
    storage, 
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Extract text from uploaded file
const extractTextFromFile = async (filePath, fileType) => {
    const ext = fileType.toLowerCase();
    
    try {
        if (ext === '.txt') {
            return fs.readFileSync(filePath, 'utf-8');
        } else if (ext === '.pdf') {
            const pdf = await loadPdfParse();
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdf(dataBuffer);
            return data.text;
        } else if (ext === '.docx' || ext === '.doc') {
            const mammothLib = await loadMammoth();
            const result = await mammothLib.extractRawText({ path: filePath });
            return result.value;
        }
    } catch (error) {
        console.error('Error extracting text:', error);
        throw new Error('Dosya içeriği okunamadı');
    }
    
    return '';
};

// Get all knowledge base entries for a workspace
export const getKnowledgeBase = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const entries = await prisma.knowledgeBase.findMany({
            where: { workspaceId },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ entries });
    } catch (error) {
        console.error('Get knowledge base error:', error);
        res.status(500).json({ error: 'Bilgi bankası yüklenemedi' });
    }
};

// Add text entry to knowledge base
export const addTextEntry = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { title, content, sourceType, sourceUrl } = req.body;

        if (!title || !content) {
            return res.status(400).json({ error: 'Başlık ve içerik gereklidir' });
        }

        const entry = await prisma.knowledgeBase.create({
            data: {
                workspaceId,
                title: title.trim(),
                content: content.trim(),
                sourceType: sourceType || 'TEXT',
                sourceUrl: sourceUrl ? sourceUrl.trim() : null
            }
        });

        // Auto-sync to Retell (fire-and-forget)
        autoSyncToRetell(workspaceId, entry).catch(e => console.warn('AutoSync error:', e.message));

        res.status(201).json({ entry });
    } catch (error) {
        console.error('Add text entry error:', error);
        res.status(500).json({ error: 'Bilgi eklenemedi' });
    }
};

// Upload file to knowledge base
export const uploadFile = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'Dosya yüklenmedi' });
        }

        const fileType = path.extname(file.originalname).toLowerCase();
        const content = await extractTextFromFile(file.path, fileType);

        if (!content || content.trim().length === 0) {
            // Clean up file if no content extracted
            fs.unlinkSync(file.path);
            return res.status(400).json({ error: 'Dosyadan içerik çıkarılamadı' });
        }

        const entry = await prisma.knowledgeBase.create({
            data: {
                workspaceId,
                title: file.originalname,
                content: content.substring(0, 100000), // Limit content size
                sourceType: 'FILE',
                filename: file.originalname,
                fileType: fileType
            }
        });

        // Auto-sync to Retell (fire-and-forget)
        autoSyncToRetell(workspaceId, entry).catch(e => console.warn('AutoSync error:', e.message));

        // Optionally delete the file after extracting content
        // fs.unlinkSync(file.path);

        res.status(201).json({ entry });
    } catch (error) {
        console.error('Upload file error:', error);
        res.status(500).json({ error: error.message || 'Dosya yüklenemedi' });
    }
};

// Update knowledge base entry
export const updateEntry = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;
        const { title, content, sourceType, sourceUrl } = req.body;

        // Verify entry belongs to this workspace
        const existing = await prisma.knowledgeBase.findFirst({ where: { id, workspaceId } });
        if (!existing) {
            return res.status(404).json({ error: 'Bilgi bulunamadı' });
        }

        const entry = await prisma.knowledgeBase.update({
            where: { id },
            data: {
                ...(title !== undefined && { title: title.trim() }),
                ...(content !== undefined && { content: content.trim() }),
                ...(sourceType !== undefined && { sourceType }),
                ...(sourceUrl !== undefined && { sourceUrl: sourceUrl ? sourceUrl.trim() : null })
            }
        });

        // Auto-sync to Retell (fire-and-forget)
        autoSyncToRetell(workspaceId, entry).catch(e => console.warn('AutoSync error:', e.message));

        res.json({ entry });
    } catch (error) {
        console.error('Update entry error:', error);
        res.status(500).json({ error: 'Bilgi güncellenemedi' });
    }
};

// Delete knowledge base entry
export const deleteEntry = async (req, res) => {
    try {
        const { workspaceId, id } = req.params;

        // Verify entry belongs to this workspace
        const existing = await prisma.knowledgeBase.findFirst({ where: { id, workspaceId } });
        if (!existing) {
            return res.status(404).json({ error: 'Bilgi bulunamadı' });
        }

        await prisma.knowledgeBase.delete({
            where: { id }
        });

        // Auto-delete from Retell (fire-and-forget)
        autoDeleteFromRetell(workspaceId, existing.retellKbId).catch(e => console.warn('AutoSync delete error:', e.message));

        res.json({ message: 'Bilgi silindi' });
    } catch (error) {
        console.error('Delete entry error:', error);
        res.status(500).json({ error: 'Bilgi silinemedi' });
    }
};

// Get all knowledge base content for AI context (used by AI controller)
export const getKnowledgeContent = async (workspaceId) => {
    try {
        const entries = await prisma.knowledgeBase.findMany({
            where: { workspaceId },
            select: { title: true, content: true, sourceType: true, sourceUrl: true }
        });

        const faqs = entries.filter(e => e.sourceType === 'FAQ');
        const docs = entries.filter(e => e.sourceType !== 'FAQ');

        let output = '';
        if (faqs.length > 0) {
            output += "### SIKÇA SORULAN SORULAR VE CEVAPLAR (SSS)\n";
            output += faqs.map(f => {
                const cat = f.sourceUrl ? `[${f.sourceUrl}] ` : '';
                return `${cat}S: ${f.title}\nC: ${f.content}`;
            }).join('\n\n') + '\n\n---\n\n';
        }

        if (docs.length > 0) {
            output += "### BİLGİ BANKASI DOKÜMANLARI\n";
            output += docs.map(e => `## ${e.title}\n${e.content}`).join('\n\n---\n\n');
        }

        return output;
    } catch (error) {
        console.error('Get knowledge content error:', error);
        return '';
    }
};

// Import scraper for URL/Feed functionalities
import { scrapeUrlContent } from '../services/scraper.service.js';
import { syncKnowledgeEntry } from '../services/knowledgeSync.service.js';

// Add URL or Feed entry to knowledge base
export const addUrlEntry = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { url, syncInterval } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL gereklidir' });
        }

        // İlk veriyi çek
        const scrapedData = await scrapeUrlContent(url);

        const entry = await prisma.knowledgeBase.create({
            data: {
                workspaceId,
                title: scrapedData.title,
                content: scrapedData.content,
                sourceType: scrapedData.type === 'FEED' ? 'FEED' : 'URL',
                sourceUrl: url,
                syncInterval: syncInterval ? parseInt(syncInterval) : null,
                lastSyncedAt: new Date()
            }
        });

        // Auto-sync to Retell (fire-and-forget)
        autoSyncToRetell(workspaceId, entry).catch(e => console.warn('AutoSync error:', e.message));

        res.status(201).json({ entry });
    } catch (error) {
        console.error('Add URL entry error:', error);
        res.status(500).json({ error: error.message || 'URL taraması sırasında hata oluştu' });
    }
};

// Manually sync a specific knowledge entry
export const syncEntryManually = async (req, res) => {
    try {
        const { id } = req.params; // entryId
        
        const success = await syncKnowledgeEntry(id);
        
        if (success) {
            const entry = await prisma.knowledgeBase.findUnique({ where: { id } });
            return res.json({ success: true, entry });
        } else {
            return res.status(400).json({ error: 'Senkronizasyon başarısız oldu' });
        }
    } catch (error) {
        console.error('Sync entry error:', error);
        res.status(500).json({ error: 'Senkronizasyon sırasında hata oluştu' });
    }
};

