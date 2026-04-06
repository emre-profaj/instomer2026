import prisma from '../lib/prisma.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';


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
        const { title, content } = req.body;

        if (!title || !content) {
            return res.status(400).json({ error: 'Başlık ve içerik gereklidir' });
        }

        const entry = await prisma.knowledgeBase.create({
            data: {
                workspaceId,
                title,
                content,
                sourceType: 'TEXT'
            }
        });

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
        const { title, content } = req.body;

        // Verify entry belongs to this workspace
        const existing = await prisma.knowledgeBase.findFirst({ where: { id, workspaceId } });
        if (!existing) {
            return res.status(404).json({ error: 'Bilgi bulunamadı' });
        }

        const entry = await prisma.knowledgeBase.update({
            where: { id },
            data: {
                ...(title && { title }),
                ...(content && { content })
            }
        });

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
            select: { title: true, content: true }
        });

        return entries.map(e => `## ${e.title}\n${e.content}`).join('\n\n---\n\n');
    } catch (error) {
        console.error('Get knowledge content error:', error);
        return '';
    }
};

