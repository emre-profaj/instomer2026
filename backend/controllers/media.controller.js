import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Configure multer for media upload
const mediaStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/media';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'media-' + uniqueSuffix + path.extname(file.originalname).toLowerCase());
    }
});

export const mediaUpload = multer({
    storage: mediaStorage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit (WhatsApp limit)
    fileFilter: (req, file, cb) => {
        const allowedTypes = /^(jpeg|jpg|png|gif|webp|pdf|doc|docx|xls|xlsx|ppt|pptx|mp4|mp3|ogg|wav|zip|csv|txt)$/i;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase().replace('.', ''));
        if (extname) {
            cb(null, true);
        } else {
            cb(new Error('Desteklenmeyen dosya türü. İzin verilen türler: jpeg, jpg, png, gif, webp, pdf, doc, docx, xls, xlsx, ppt, pptx, mp4, mp3, ogg, wav, zip, csv, txt'));
        }
    }
});

export const uploadMedia = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Dosya yüklenemedi veya dosya bulunamadı' });
        }

        // Determine mediaType: image/document/video/audio based on mimetype
        let mediaType = 'document';
        const mimetype = req.file.mimetype || '';

        if (mimetype.startsWith('image/')) {
            mediaType = 'image';
        } else if (mimetype.startsWith('video/')) {
            mediaType = 'video';
        } else if (mimetype.startsWith('audio/')) {
            mediaType = 'audio';
        }

        // Relative URL format: /api/uploads/media/filename.ext (proxied by Nginx /api/ to backend)
        const url = `/api/uploads/media/${req.file.filename}`;

        res.json({
            url,
            mediaType,
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size
        });
    } catch (error) {
        console.error('Media upload error:', error);
        res.status(500).json({ error: 'Dosya yüklenirken bir hata oluştu' });
    }
};
