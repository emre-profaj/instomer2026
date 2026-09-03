import prisma from '../lib/prisma.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { normalizePhone } from '../utils/phoneNormalizer.js';
import { generateCaseNumber } from '../services/caseNumber.service.js';

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = './uploads/templates';
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
    const allowedTypes = ['.jpg', '.jpeg', '.png', '.mp4', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Sadece JPG, PNG, MP4 ve PDF dosyaları yüklenebilir'), false);
    }
};

export const templateMediaUpload = multer({ 
    storage, 
    fileFilter,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB max (for PDFs)
});

const WHATSAPP_API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || 'v21.0';

/**
 * Convert Google Drive sharing links to direct download links.
 * 
 * Google Drive share links (e.g. /file/d/FILE_ID/view?usp=sharing) return
 * an HTML preview page, which WhatsApp rejects as "Unsupported mime type text/html".
 * This converts them to the direct download format: /uc?export=download&id=FILE_ID
 * 
 * Non-Google-Drive URLs are returned unchanged.
 */
function convertGoogleDriveLink(url) {
    if (!url) return url;

    let fileId = null;

    // Pattern 1: https://drive.google.com/file/d/FILE_ID/view...
    const filePattern = /https?:\/\/drive\.google\.com\/file\/d\/([^/]+)\/.*/;
    const match = url.match(filePattern);
    if (match) fileId = match[1];

    // Pattern 2: https://drive.google.com/open?id=FILE_ID
    if (!fileId) {
        const openPattern = /https?:\/\/drive\.google\.com\/open\?id=([^&]+)/;
        const openMatch = url.match(openPattern);
        if (openMatch) fileId = openMatch[1];
    }

    // Pattern 3: https://drive.google.com/uc?export=download&id=FILE_ID
    if (!fileId) {
        const ucPattern = /https?:\/\/drive\.google\.com\/uc\?.*id=([^&]+)/;
        const ucMatch = url.match(ucPattern);
        if (ucMatch) fileId = ucMatch[1];
    }

    if (fileId) {
        // Use drive.usercontent.google.com - this is the FINAL redirect target
        // that serves the actual file with correct Content-Type (e.g. video/mp4)
        // without any 303 redirect. The /uc?export=download format does a 303 redirect
        // which WhatsApp API may not follow.
        const directUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;
        console.log(`🔗 [GDrive] Converted to direct content URL: ${directUrl}`);
        return directUrl;
    }

    return url;
}
/**
 * Upload media from a URL to Meta's media API and return the media_id.
 * This is required for Google Drive and other indirect URLs that Meta cannot
 * reliably fetch directly. Returns null if upload fails (fallback to link).
 */
async function uploadMediaToMeta(mediaUrl, mediaType, phoneNumberId, accessToken) {
    try {
        console.log(`📤 [MediaUpload] Downloading media from: ${mediaUrl}`);

        // 1. Download the file as buffer
        const downloadResp = await axios.get(mediaUrl, {
            responseType: 'arraybuffer',
            timeout: 15000,
            maxRedirects: 5,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const buffer = Buffer.from(downloadResp.data);
        const contentType = downloadResp.headers['content-type']?.split(';')[0]?.trim() || 'image/jpeg';

        // Map to accepted MIME types
        const mimeMap = {
            'IMAGE': 'image/jpeg',
            'VIDEO': 'video/mp4',
            'DOCUMENT': 'application/pdf'
        };
        const mime = contentType !== 'application/octet-stream' ? contentType : (mimeMap[mediaType] || 'image/jpeg');

        console.log(`📦 [MediaUpload] Downloaded ${buffer.length} bytes, mime: ${mime}`);

        // 2. Upload to Meta Media API using form-data
        const FormData = (await import('form-data')).default;
        const form = new FormData();
        form.append('file', buffer, { filename: 'media', contentType: mime });
        form.append('type', mime);
        form.append('messaging_product', 'whatsapp');

        const uploadResp = await axios.post(
            `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/media`,
            form,
            {
                headers: {
                    ...form.getHeaders(),
                    'Authorization': `Bearer ${accessToken}`
                },
                timeout: 30000
            }
        );

        const mediaId = uploadResp.data?.id;
        console.log(`✅ [MediaUpload] Uploaded successfully, media_id: ${mediaId}`);
        return mediaId;
    } catch (err) {
        console.error(`❌ [MediaUpload] Upload failed, falling back to link:`, err.response?.data || err.message);
        return null;
    }
}


// Get all templates for a workspace
export const getTemplates = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const templates = await prisma.whatsappTemplate.findMany({
            where: { workspaceId },
            orderBy: { createdAt: 'desc' },
            include: {
                whatsappPhoneNumber: {
                    select: { displayPhoneNumber: true, name: true }
                }
            }
        });

        res.json({ templates });
    } catch (error) {
        console.error('Get templates error:', error);
        res.status(500).json({ error: 'Şablonlar yüklenirken hata oluştu' });
    }
};

// Create/Add a template manually (And create it on Meta)
export const createTemplate = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        let { name } = req.body;
        const {
            language, category, status,
            headerType, headerContent, headerHandle, headerMediaUrl, bodyText, footerText,
            buttons, exampleValues, whatsappPhoneNumberId
        } = req.body;

        if (!name || !bodyText) {
            return res.status(400).json({
                error: 'İsim ve gövde metni gereklidir'
            });
        }

        // 1. Find a valid WhatsApp Phone Number
        const whatsappPhone = whatsappPhoneNumberId
            ? await prisma.whatsappPhoneNumber.findUnique({ where: { id: whatsappPhoneNumberId, workspaceId } })
            : await prisma.whatsappPhoneNumber.findFirst({ where: { workspaceId } });

        if (!whatsappPhone) {
            return res.status(400).json({ error: 'Bu işlem için hesaba bağlı bir WhatsApp numarası bulunamadı.' });
        }

        // 2. Prepare components for Meta API
        const components = [];

        // Header Component
        if (headerType && headerType !== '') {
            let headerComponent = { type: 'HEADER', format: headerType };
            if (headerType === 'TEXT' && headerContent) {
                headerComponent.text = headerContent;
            } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType)) {
                if (headerHandle) {
                    headerComponent.example = { header_handle: [ headerHandle ] };
                } else if (headerMediaUrl) {
                    headerComponent.example = { header_handle: [ headerMediaUrl ] }; // Might fail in Meta, but fallback
                }
            }
            components.push(headerComponent);
        }

        // Body Component
        const bodyComponent = { type: 'BODY', text: bodyText };
        const placeholderCount = (bodyText.match(/\{\{\d+\}\}/g) || []).length;
        if (placeholderCount > 0) {
            const examples = Array.from({ length: placeholderCount }, (_, i) => `Örnek ${i + 1}`);
            bodyComponent.example = { body_text: [examples] };
        }
        components.push(bodyComponent);

        // Footer Component
        if (footerText) {
            components.push({ type: 'FOOTER', text: footerText });
        }

        // Buttons Component
        if (buttons) {
            const parsedButtons = typeof buttons === 'string' ? JSON.parse(buttons) : buttons;
            if (Array.isArray(parsedButtons) && parsedButtons.length > 0) {
                components.push({ type: 'BUTTONS', buttons: parsedButtons });
            }
        }

        // 3. Call Meta API to create the template
        const apiUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${whatsappPhone.wabaId}/message_templates`;
        console.log(`🚀 [CREATE_TEMPLATE] Calling Meta API: ${apiUrl}`);

        let newTemplateId;
        let metaStatus = 'PENDING';

        try {
            // Meta API requires template names to be lowercase and alphanumeric/underscore only
            const sanitizedName = name.toLowerCase()
                .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
                .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
                .replace(/[^a-z0-9_]/g, '_');

            const metaRes = await axios.post(apiUrl, {
                name: sanitizedName,
                language: language || 'tr',
                category: category || 'MARKETING',
                components
            }, {
                headers: { Authorization: `Bearer ${whatsappPhone.accessToken}` }
            });

            newTemplateId = metaRes.data.id;
            metaStatus = metaRes.data.status || 'PENDING';
            name = sanitizedName; // Update name to sanitized version for DB
        } catch (metaErr) {
            console.error('❌ [CREATE_TEMPLATE] Meta API Error:', JSON.stringify(metaErr.response?.data || metaErr.message, null, 2));
            const responseData = metaErr.response?.data;
            let errDetail = 'Meta API şablon oluşturmayı reddetti.';
            if (responseData?.error) {
                const metaError = responseData.error;
                if (metaError.error_subcode === 2388024 || metaError.error_user_title === 'Content in this language already exists') {
                    errDetail = `"${sanitizedName}" adında ve Türkçe dilinde Meta hesabınızda zaten kayıtlı bir şablon var. Lütfen farklı bir şablon adı girin.`;
                } else if (metaError.error_user_msg) {
                    errDetail = `${metaError.error_user_title ? metaError.error_user_title + ' - ' : ''}${metaError.error_user_msg}`;
                } else if (metaError.message) {
                    errDetail = metaError.message;
                }
            } else if (responseData) {
                errDetail = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
            } else {
                errDetail = metaErr.message;
            }
            return res.status(400).json({ error: errDetail });
        }

        // 4. Save to Database
        const template = await prisma.whatsappTemplate.create({
            data: {
                workspaceId,
                whatsappPhoneNumberId: whatsappPhone.id,
                templateId: newTemplateId,
                name,
                language: language || 'tr',
                category: category || 'MARKETING',
                status: metaStatus,
                headerType,
                headerContent: headerMediaUrl || headerContent, // Save the actual URL for local display
                bodyText,
                footerText,
                buttons: buttons ? JSON.stringify(buttons) : null,
                exampleValues: exampleValues ? JSON.stringify(exampleValues) : null
            }
        });

        res.status(201).json({ template });
    } catch (error) {
        console.error('Create template error:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Bu isimde bir şablon zaten mevcut.' });
        }
        res.status(500).json({ error: 'Şablon oluşturulurken hata oluştu' });
    }
};

// Upload media for template creation (Resumable Upload to Meta)
export const uploadTemplateMedia = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'Dosya yüklenemedi' });
        }

        // 1. Get WhatsApp Phone Number to get the Access Token & WABA ID/App ID
        const whatsappPhone = await prisma.whatsappPhoneNumber.findFirst({
            where: { workspaceId }
        });

        if (!whatsappPhone) {
            return res.status(400).json({ error: 'Hesaba bağlı WhatsApp numarası bulunamadı.' });
        }

        const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
        if (!FACEBOOK_APP_ID) {
            console.error('❌ [UPLOAD_MEDIA] FACEBOOK_APP_ID is missing in .env');
            return res.status(500).json({ error: 'Sunucu yapılandırması eksik (App ID).' });
        }

        // 2. Start Resumable Upload Session
        const fileSize = file.size;
        const fileType = file.mimetype;
        const sessionUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${FACEBOOK_APP_ID}/uploads`;

        console.log(`☁️ [UPLOAD_MEDIA] Starting upload session on Meta...`);
        const sessionRes = await axios.post(sessionUrl, {}, {
            params: {
                file_length: fileSize,
                file_type: fileType,
                access_token: whatsappPhone.accessToken
            }
        });

        const sessionId = sessionRes.data.id;
        if (!sessionId) {
            throw new Error('Meta did not return a session ID');
        }

        // 3. Upload file bytes to the session
        console.log(`☁️ [UPLOAD_MEDIA] Uploading file data to Meta session ${sessionId}...`);
        const fileData = fs.readFileSync(file.path);
        
        const uploadRes = await axios.post(`https://graph.facebook.com/${WHATSAPP_API_VERSION}/${sessionId}`, fileData, {
            headers: {
                'Authorization': `OAuth ${whatsappPhone.accessToken}`,
                'file_offset': '0',
                'Content-Type': 'application/octet-stream'
            }
        });

        const headerHandle = uploadRes.data.h;
        if (!headerHandle) {
            throw new Error('Meta did not return a file handle (h)');
        }

        console.log(`✅ [UPLOAD_MEDIA] Successfully got header_handle from Meta: ${headerHandle}`);

        // 4. Return the local URL and the Meta handle
        // Using /api/uploads to ensure Nginx proxies the request to the Node.js backend
        const mediaUrl = `/api/uploads/templates/${file.filename}`;
        
        res.status(200).json({
            mediaUrl,
            headerHandle
        });

    } catch (error) {
        console.error('❌ [UPLOAD_MEDIA] Error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Dosya Meta sunucularına yüklenirken hata oluştu',
            details: error.response?.data?.error?.message || error.message 
        });
    }
};

// Update template
export const updateTemplate = async (req, res) => {
    try {
        const { workspaceId, templateId } = req.params;
        const updateData = req.body;

        const existing = await prisma.whatsappTemplate.findFirst({
            where: { id: templateId, workspaceId }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Şablon bulunamadı' });
        }

        // Handle JSON fields
        if (updateData.buttons && typeof updateData.buttons !== 'string') {
            updateData.buttons = JSON.stringify(updateData.buttons);
        }
        if (updateData.exampleValues && typeof updateData.exampleValues !== 'string') {
            updateData.exampleValues = JSON.stringify(updateData.exampleValues);
        }

        // Only pass fields that exist in the WhatsappTemplate schema
        // (filter out transient request fields like headerMediaUrl, etc.)
        const ALLOWED_FIELDS = new Set([
            'name', 'language', 'category', 'status', 'bodyText',
            'headerType', 'headerContent', 'footerText', 'buttons',
            'components', 'exampleValues', 'templateId',
            'whatsappPhoneNumberId'
        ]);
        const safeData = {};
        for (const [key, val] of Object.entries(updateData)) {
            if (ALLOWED_FIELDS.has(key)) safeData[key] = val;
        }

        const template = await prisma.whatsappTemplate.update({
            where: { id: templateId },
            data: safeData
        });

        res.json({ template });
    } catch (error) {
        console.error('Update template error:', error);
        res.status(500).json({ error: 'Şablon güncellenirken hata oluştu' });
    }
};

// Delete template
export const deleteTemplate = async (req, res) => {
    try {
        const { workspaceId, templateId } = req.params;

        const existing = await prisma.whatsappTemplate.findFirst({
            where: { id: templateId, workspaceId },
            include: { whatsappPhoneNumber: true }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Şablon bulunamadı' });
        }

        // Delete from Meta API if connected to a WhatsApp number
        if (existing.whatsappPhoneNumber) {
            try {
                const phone = existing.whatsappPhoneNumber;
                const apiUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phone.wabaId}/message_templates?name=${existing.name}`;
                await axios.delete(apiUrl, {
                    headers: { Authorization: `Bearer ${phone.accessToken}` }
                });
                console.log(`✅ [DELETE_TEMPLATE] Deleted from Meta: ${existing.name}`);
            } catch (metaErr) {
                console.error(`❌ [DELETE_TEMPLATE] Meta API Error:`, metaErr.response?.data || metaErr.message);
                // We won't block local deletion if Meta deletion fails (e.g. if it was already deleted on Meta)
            }
        }

        await prisma.whatsappTemplate.delete({
            where: { id: templateId }
        });

        res.json({ message: 'Şablon silindi' });
    } catch (error) {
        console.error('Delete template error:', error);
        res.status(500).json({ error: 'Şablon silinirken hata oluştu' });
    }
};

// Sync templates from WhatsApp Business API
export const syncTemplates = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        // Get all WhatsApp phone numbers for this workspace
        const phoneNumbers = await prisma.whatsappPhoneNumber.findMany({
            where: { workspaceId }
        });

        if (phoneNumbers.length === 0) {
            return res.status(400).json({ error: 'WhatsApp numarası bağlı değil' });
        }

        let syncedCount = 0;
        let errors = [];

        for (const phone of phoneNumbers) {
            try {
                const apiUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phone.wabaId}/message_templates`;
                console.log(`📡 [SYNC] Fetching templates from: ${apiUrl}`);
                console.log(`📡 [SYNC] Phone: ${phone.displayPhoneNumber}, WABA: ${phone.wabaId}, Token: ${phone.accessToken?.substring(0, 20)}...`);

                // Fetch templates from WhatsApp API
                const response = await axios.get(apiUrl, {
                    params: {
                        access_token: phone.accessToken,
                        limit: 250
                    }
                });

                const templates = response.data.data || [];
                console.log(`📋 [SYNC] Found ${templates.length} templates from Meta for WABA ${phone.wabaId}`);

                for (const tpl of templates) {
                    // Parse components
                    const header = tpl.components?.find(c => c.type === 'HEADER');
                    const body = tpl.components?.find(c => c.type === 'BODY');
                    const footer = tpl.components?.find(c => c.type === 'FOOTER');
                    const buttons = tpl.components?.find(c => c.type === 'BUTTONS');

                    await prisma.whatsappTemplate.upsert({
                        where: {
                            workspaceId_templateId: {
                                workspaceId,
                                templateId: tpl.id
                            }
                        },
                        create: {
                            workspaceId,
                            whatsappPhoneNumberId: phone.id,
                            templateId: tpl.id,
                            name: tpl.name,
                            language: tpl.language || 'tr',
                            category: tpl.category || 'MARKETING',
                            status: tpl.status || 'APPROVED',
                            components: JSON.stringify(tpl.components || []),
                            headerType: header?.format || null,
                            headerContent: header?.text || header?.example?.header_url?.[0] || header?.example?.header_handle?.[0] || null,
                            bodyText: body?.text || '',
                            footerText: footer?.text || null,
                            buttons: buttons ? JSON.stringify(buttons.buttons) : null
                        },
                        update: {
                            name: tpl.name,
                            status: tpl.status || 'APPROVED',
                            category: tpl.category || 'MARKETING',
                            components: JSON.stringify(tpl.components || []),
                            headerType: header?.format || null,
                            headerContent: header?.text || header?.example?.header_url?.[0] || header?.example?.header_handle?.[0] || null,
                            bodyText: body?.text || '',
                            footerText: footer?.text || null,
                            buttons: buttons ? JSON.stringify(buttons.buttons) : null
                        }
                    });
                    syncedCount++;
                }
            } catch (err) {
                const errDetail = err.response?.data?.error || err.response?.data || err.message;
                console.error(`❌ [SYNC] Error for ${phone.displayPhoneNumber} (WABA: ${phone.wabaId}):`, JSON.stringify(errDetail));
                errors.push({
                    phone: phone.displayPhoneNumber,
                    error: err.response?.data?.error?.message || err.message
                });
            }
        }

        res.json({
            message: `${syncedCount} şablon senkronize edildi`,
            syncedCount,
            apiVersion: WHATSAPP_API_VERSION,
            phoneCount: phoneNumbers.length,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        console.error('Sync templates error:', error);
        res.status(500).json({ error: 'Şablonlar senkronize edilirken hata oluştu' });
    }
};

// Send template message to a contact
export const sendTemplateMessage = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { templateId, contactId, phoneNumber, variables, headerMediaUrl } = req.body;

        if (!templateId || (!contactId && !phoneNumber)) {
            return res.status(400).json({
                error: 'Template ID ve kişi/telefon numarası gereklidir'
            });
        }

        // Get template
        const template = await prisma.whatsappTemplate.findFirst({
            where: { id: templateId, workspaceId },
            include: { whatsappPhoneNumber: true }
        });

        if (!template) {
            return res.status(404).json({ error: 'Şablon bulunamadı' });
        }

        // Get phone number to use
        let whatsappPhone = template.whatsappPhoneNumber;
        if (!whatsappPhone) {
            whatsappPhone = await prisma.whatsappPhoneNumber.findFirst({
                where: { workspaceId }
            });
        }

        if (!whatsappPhone) {
            return res.status(400).json({ error: 'WhatsApp numarası bulunamadı' });
        }

        // Get recipient phone number
        let recipientPhone = phoneNumber;
        let contact = null;

        if (contactId) {
            contact = await prisma.contact.findUnique({
                where: { id: contactId }
            });
            if (!contact?.phone) {
                return res.status(400).json({ error: 'Kişinin telefon numarası yok' });
            }
            recipientPhone = contact.phone;
        }

        // Clean phone number (remove + and spaces)
        recipientPhone = normalizePhone(recipientPhone);

        // Build template message payload
        const templatePayload = {
            messaging_product: 'whatsapp',
            to: recipientPhone,
            type: 'template',
            template: {
                name: template.name,
                language: { code: template.language || 'tr' }
            }
        };

        // Initialize components array
        const components = [];

        // Add header component for media templates (IMAGE, VIDEO, DOCUMENT)
        if (template.headerType && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(template.headerType)) {
            let rawMediaUrl = headerMediaUrl || template.headerContent;
            
            // If it's a local relative path, convert to absolute (assuming app.instomer.com)
            if (rawMediaUrl && (rawMediaUrl.startsWith('/api/uploads') || rawMediaUrl.startsWith('/uploads'))) {
                rawMediaUrl = `https://app.instomer.com${rawMediaUrl}`;
            }
            
            const mediaUrl = convertGoogleDriveLink(rawMediaUrl);
            
            if (!mediaUrl) {
                return res.status(400).json({
                    error: 'Bu şablon için medya URL\'si gereklidir',
                    headerType: template.headerType
                });
            }

            // scontent.whatsapp.net URLs are temporary/signed and expire - must upload to Meta first
            const needsUpload = mediaUrl.includes('scontent.whatsapp.net')
                || mediaUrl.includes('scontent.cdninstagram.com')
                || mediaUrl.includes('drive.google.com')
                || mediaUrl.includes('drive.usercontent.google.com');

            let headerParam;
            if (needsUpload) {
                console.log(`☁️ [sendTemplateMessage] Temporary URL detected, uploading to Meta Media API...`);
                const mediaId = await uploadMediaToMeta(mediaUrl, template.headerType, whatsappPhone.phoneNumberId, whatsappPhone.accessToken);
                if (mediaId) {
                    headerParam = {
                        type: template.headerType.toLowerCase(),
                        [template.headerType.toLowerCase()]: { id: mediaId }
                    };
                } else {
                    console.warn(`⚠️ [sendTemplateMessage] Media upload failed, falling back to link`);
                    headerParam = {
                        type: template.headerType.toLowerCase(),
                        [template.headerType.toLowerCase()]: { link: mediaUrl }
                    };
                }
            } else {
                headerParam = {
                    type: template.headerType.toLowerCase(),
                    [template.headerType.toLowerCase()]: { link: mediaUrl }
                };
            }

            const headerComponent = { type: 'header', parameters: [headerParam] };
            components.push(headerComponent);
            console.log('📎 Header component added:', JSON.stringify(headerComponent));
        }

        // Add body variables if provided and template has placeholders
        if (variables && variables.length > 0 && variables.some(v => v && v.trim())) {
            components.push({
                type: 'body',
                parameters: variables.filter(v => v && v.trim()).map(v => ({ type: 'text', text: v }))
            });
        }

        // Only add components if there are any
        if (components.length > 0) {
            templatePayload.template.components = components;
        }

        // Send message via WhatsApp API
        console.log('📤 Sending template message:', {
            phoneNumberId: whatsappPhone.phoneNumberId,
            templateName: template.name,
            recipientPhone,
            payload: JSON.stringify(templatePayload, null, 2)
        });

        const response = await axios.post(
            `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${whatsappPhone.phoneNumberId}/messages`,
            templatePayload,
            {
                headers: {
                    'Authorization': `Bearer ${whatsappPhone.accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ Template message sent:', response.data);

        const whatsappMessageId = response.data.messages?.[0]?.id;

        // Find or create contact if not provided (e.g. manual phone number entry)
        if (!contact && recipientPhone) {
            try {
                contact = await prisma.contact.findFirst({
                    where: {
                        workspaceId,
                        OR: [
                            { phone: recipientPhone },
                            { phone: '+' + recipientPhone },
                            { phone: '0' + recipientPhone.slice(2) }
                        ]
                    }
                });
                if (!contact) {
                    contact = await prisma.contact.create({
                        data: {
                            workspaceId,
                            name: recipientPhone,
                            phone: recipientPhone,
                            source: 'WHATSAPP'
                        }
                    });
                }
            } catch (e) {
                console.error('⚠️ [sendTemplate] Contact find/create failed:', e.message);
            }
        }

        // Save message to database
        if (contact) {
            try {
                let conversation = await prisma.conversation.findFirst({
                    where: { contactId: contact.id, workspaceId, channel: 'WHATSAPP' }
                });

                if (!conversation) {
                    conversation = await prisma.conversation.create({
                        data: {
                            contactId: contact.id,
                            workspaceId,
                            whatsappPhoneNumberId: whatsappPhone.id,
                            channel: 'WHATSAPP',
                            status: 'OPEN'
                        }
                    });
                }

                await prisma.message.create({
                    data: {
                        conversationId: conversation.id,
                        content: `[Şablon: ${template.name}]\n${template.bodyText}`,
                        messageType: 'TEMPLATE',
                        isFromContact: false,
                        whatsappMessageId,
                        status: 'SENT'
                    }
                });

                await prisma.conversation.update({
                    where: { id: conversation.id },
                    data: { lastMessageAt: new Date() }
                });

                console.log(`✅ [sendTemplate] Message logged to DB for contact: ${contact.id}`);
            } catch (dbErr) {
                console.error('⚠️ [sendTemplate] DB logging failed:', dbErr.message);
            }
        }

        res.json({
            success: true,
            message: 'Şablon mesajı gönderildi',
            whatsappMessageId: response.data.messages?.[0]?.id
        });
    } catch (error) {
        console.error('❌ Send template message error:', error.response?.data || error);
        const errorDetails = error.response?.data?.error;
        res.status(500).json({
            error: 'Şablon mesajı gönderilemedi',
            details: errorDetails?.message || error.message,
            code: errorDetails?.code,
            subcode: errorDetails?.error_subcode
        });
    }
};

// Send template from Inbox (simpler version)
export const sendTemplateFromInbox = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { templateId, contactId, phoneNumber, variables } = req.body;

        console.log('📨 [sendTemplateFromInbox] Request:', { workspaceId, templateId, contactId, phoneNumber });

        // Get template from our database
        const template = await prisma.whatsappTemplate.findFirst({
            where: { id: templateId, workspaceId }
        });

        if (!template) {
            return res.status(404).json({ error: 'Şablon bulunamadı' });
        }

        // Get WhatsApp phone number for this workspace
        const whatsappPhone = await prisma.whatsappPhoneNumber.findFirst({
            where: { workspaceId }
        });

        if (!whatsappPhone) {
            return res.status(400).json({ error: 'Bu workspace için WhatsApp numarası bağlı değil' });
        }

        // Get recipient phone
        let recipientPhone = phoneNumber;
        let contact = null;

        if (contactId) {
            contact = await prisma.contact.findUnique({ where: { id: contactId } });
            if (!contact?.phone) {
                return res.status(400).json({ error: 'Kişinin telefon numarası yok' });
            }
            recipientPhone = contact.phone;
        }

        // Clean phone number
        recipientPhone = normalizePhone(recipientPhone);


        console.log('📞 Cleaned phone number:', recipientPhone);

        // Build template payload
        const templatePayload = {
            messaging_product: 'whatsapp',
            to: recipientPhone,
            type: 'template',
            template: {
                name: template.name,
                language: { code: template.language || 'tr' }
            }
        };

        // Add body variables if provided
        if (variables && variables.length > 0 && variables.some(v => v)) {
            templatePayload.template.components = [{
                type: 'body',
                parameters: variables.filter(v => v).map(v => ({ type: 'text', text: v }))
            }];
        }

        console.log('📤 WhatsApp API Request:', {
            url: `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${whatsappPhone.phoneNumberId}/messages`,
            payload: templatePayload
        });

        // Send via WhatsApp API
        const response = await axios.post(
            `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${whatsappPhone.phoneNumberId}/messages`,
            templatePayload,
            {
                headers: {
                    'Authorization': `Bearer ${whatsappPhone.accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ Template sent successfully:', response.data);

        res.json({
            success: true,
            message: 'Şablon mesajı gönderildi',
            whatsappMessageId: response.data.messages?.[0]?.id
        });

    } catch (error) {
        console.error('❌ Send template error:', error.response?.data || error.message);

        const errorData = error.response?.data?.error;
        let userMessage = 'Şablon mesajı gönderilemedi';

        if (errorData?.code === 132000) {
            userMessage = 'Şablon parametreleri eksik veya hatalı';
        } else if (errorData?.code === 131026) {
            userMessage = 'Bu numara WhatsApp kullanmıyor';
        } else if (errorData?.code === 131047) {
            userMessage = 'Son 24 saat içinde mesaj alınmadı, sadece şablon gönderilebilir';
        } else if (errorData?.message) {
            userMessage = errorData.message;
        }

        res.status(500).json({
            error: userMessage,
            details: errorData?.message,
            code: errorData?.code
        });
    }
};

// ============================================
// Dynamic Template Sending (by name or ID)
// ============================================

/**
 * Send a WhatsApp template message dynamically
 * Fetches template details from database, not hardcoded
 * 
 * Request body:
 * - templateName or templateId: Template identifier
 * - phoneNumber: Recipient phone number
 * - customerName: Customer name for {{1}} placeholder
 * - variables: Optional array of additional variables
 * - headerMediaUrl: Optional media URL for header
 */
export const sendTemplateDynamic = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const {
            templateName,
            templateId,
            phoneNumber,
            customerName,
            variables = [],
            headerMediaUrl
        } = req.body;

        console.log('🚀 [sendTemplateDynamic] Request:', {
            workspaceId,
            templateName,
            templateId,
            phoneNumber,
            customerName
        });

        // Validate required fields
        if (!phoneNumber) {
            return res.status(400).json({ error: 'Telefon numarası gereklidir' });
        }

        if (!templateName && !templateId) {
            return res.status(400).json({ error: 'Şablon adı veya ID gereklidir' });
        }

        // 1. DYNAMIC TEMPLATE LOOKUP - Fetch from database
        let template = null;

        if (templateId) {
            // Lookup by ID
            template = await prisma.whatsappTemplate.findFirst({
                where: { id: templateId, workspaceId }
            });
        } else if (templateName) {
            // Lookup by name (case-insensitive)
            template = await prisma.whatsappTemplate.findFirst({
                where: {
                    name: { equals: templateName, mode: 'insensitive' },
                    workspaceId
                }
            });

            // Fallback: exact match if case-insensitive fails
            if (!template) {
                template = await prisma.whatsappTemplate.findFirst({
                    where: { name: templateName, workspaceId }
                });
            }
        }

        if (!template) {
            return res.status(404).json({
                error: 'Şablon bulunamadı',
                details: `"${templateName || templateId}" adlı/ID'li şablon bu workspace'te mevcut değil`
            });
        }

        // Check if template is approved
        if (template.status !== 'APPROVED') {
            return res.status(400).json({
                error: 'Şablon onaylı değil',
                status: template.status
            });
        }

        console.log('📋 [sendTemplateDynamic] Template found:', {
            id: template.id,
            name: template.name,
            language: template.language,
            headerType: template.headerType,
            bodyText: template.bodyText?.substring(0, 100)
        });

        // 2. GET WHATSAPP PHONE NUMBER
        let whatsappPhone = null;

        if (template.whatsappPhoneNumberId) {
            whatsappPhone = await prisma.whatsappPhoneNumber.findUnique({
                where: { id: template.whatsappPhoneNumberId }
            });
        }

        if (!whatsappPhone) {
            whatsappPhone = await prisma.whatsappPhoneNumber.findFirst({
                where: { workspaceId }
            });
        }

        if (!whatsappPhone) {
            return res.status(400).json({ error: 'WhatsApp numarası bağlı değil' });
        }

        // 3. CLEAN PHONE NUMBER
        let recipientPhone = normalizePhone(phoneNumber);
        
        console.log('📞 [sendTemplateDynamic] Recipient phone:', recipientPhone);

        // 4. BUILD TEMPLATE PAYLOAD
        const templatePayload = {
            messaging_product: 'whatsapp',
            to: recipientPhone,
            type: 'template',
            template: {
                name: template.name,
                language: { code: template.language || 'tr' }
            }
        };

        // Build components array
        const components = [];

        // 4a. HEADER COMPONENT (for IMAGE, VIDEO, DOCUMENT templates)
        if (template.headerType && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(template.headerType)) {
            let rawUrl = headerMediaUrl || template.headerContent;
            
            if (rawUrl && (rawUrl.startsWith('/api/uploads') || rawUrl.startsWith('/uploads'))) {
                rawUrl = `https://app.instomer.com${rawUrl}`;
            }
            const mediaUrl = convertGoogleDriveLink(rawUrl);

            if (!mediaUrl) {
                console.error(`❌ [sendTemplateDynamic] Template "${template.name}" has ${template.headerType} header but no media URL provided`);
                return res.status(400).json({
                    error: `Bu şablon ${template.headerType} header içeriyor ancak medya URL'si eksik`,
                    details: `"${template.name}" şablonu için headerMediaUrl parametresi gönderilmeli veya şablona headerContent kaydedilmeli`,
                    headerType: template.headerType
                });
            }

            // These URL types cannot be used directly as template header links:
            // - Google Drive: requires redirect/auth that Meta can't follow
            // - scontent.whatsapp.net: temporary signed URLs that expire (oe= param)
            const needsUpload = mediaUrl.includes('drive.usercontent.google.com')
                || mediaUrl.includes('drive.google.com')
                || mediaUrl.includes('scontent.whatsapp.net')
                || mediaUrl.includes('scontent.cdninstagram.com');
            let headerParam;

            if (needsUpload) {
                console.log(`☁️ [sendTemplateDynamic] Temporary/indirect URL detected, uploading to Meta Media API...`);
                const mediaId = await uploadMediaToMeta(mediaUrl, template.headerType, whatsappPhone.phoneNumberId, whatsappPhone.accessToken);
                if (mediaId) {
                    headerParam = {
                        type: template.headerType.toLowerCase(),
                        [template.headerType.toLowerCase()]: { id: mediaId }
                    };
                } else {
                    console.warn(`⚠️ [sendTemplateDynamic] Media upload failed, falling back to link`);
                    headerParam = {
                        type: template.headerType.toLowerCase(),
                        [template.headerType.toLowerCase()]: { link: mediaUrl }
                    };
                }
            } else {
                headerParam = {
                    type: template.headerType.toLowerCase(),
                    [template.headerType.toLowerCase()]: { link: mediaUrl }
                };
            }

            components.push({ type: 'header', parameters: [headerParam] });
            console.log('📎 [sendTemplateDynamic] Header added:', template.headerType, headerParam);
        }

        // 4b. BODY COMPONENT - Dynamic variable substitution
        // Count placeholders in bodyText ({{1}}, {{2}}, etc.)
        const placeholderCount = (template.bodyText?.match(/\{\{\d+\}\}/g) || []).length;

        if (placeholderCount > 0) {
            // Build parameters array
            // {{1}} = customerName, {{2}}, {{3}}, etc. = additional variables
            const bodyParams = [];

            // First placeholder is always customer name
            if (customerName) {
                bodyParams.push({ type: 'text', text: customerName });
            }

            // Add additional variables for remaining placeholders
            if (variables && variables.length > 0) {
                variables.forEach(v => {
                    if (v && v.trim()) {
                        bodyParams.push({ type: 'text', text: v });
                    }
                });
            }

            // Validate we have enough parameters
            if (bodyParams.length < placeholderCount) {
                console.log(`⚠️ [sendTemplateDynamic] Template has ${placeholderCount} placeholders but only ${bodyParams.length} values provided`);
                // Fill missing with empty strings to prevent API error
                while (bodyParams.length < placeholderCount) {
                    bodyParams.push({ type: 'text', text: '' });
                }
            }

            if (bodyParams.length > 0) {
                components.push({
                    type: 'body',
                    parameters: bodyParams
                });
                console.log('📝 [sendTemplateDynamic] Body params:', bodyParams);
            }
        }

        // Add components to payload if any
        if (components.length > 0) {
            templatePayload.template.components = components;
        }

        console.log('📤 [sendTemplateDynamic] API Request:', JSON.stringify(templatePayload, null, 2));

        // 5. SEND VIA META WHATSAPP API
        const response = await axios.post(
            `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${whatsappPhone.phoneNumberId}/messages`,
            templatePayload,
            {
                headers: {
                    'Authorization': `Bearer ${whatsappPhone.accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ [sendTemplateDynamic] Message sent:', response.data);

        // 6. LOG TO DATABASE - Find or create contact/conversation and save message
        const whatsappMessageId = response.data.messages?.[0]?.id;

        try {
            // Try to find contact by phone
            const cleanPhone = recipientPhone;
            let contact = await prisma.contact.findFirst({
                where: {
                    workspaceId,
                    OR: [
                        { phone: cleanPhone },
                        { phone: '+' + cleanPhone },
                        { phone: '0' + cleanPhone.slice(2) }
                    ]
                }
            });

            // If no contact exists, create one
            if (!contact) {
                contact = await prisma.contact.create({
                    data: {
                        workspaceId,
                        name: customerName || recipientPhone,
                        phone: recipientPhone,
                        source: 'WHATSAPP'
                    }
                });
            }

            // Find or create conversation
            let conversation = await prisma.conversation.findFirst({
                where: { contactId: contact.id, workspaceId, channel: 'WHATSAPP' }
            });

            if (!conversation) {
                conversation = await prisma.conversation.create({
                    data: {
                        contactId: contact.id,
                        workspaceId,
                        whatsappPhoneNumberId: whatsappPhone.id,
                        channel: 'WHATSAPP',
                        status: 'OPEN'
                    }
                });
            }

            // Save message with whatsappMessageId for status tracking
            await prisma.message.create({
                data: {
                    conversationId: conversation.id,
                    content: `[Şablon: ${template.name}]\n${template.bodyText}`,
                    messageType: 'TEMPLATE',
                    isFromContact: false,
                    whatsappMessageId,
                    status: 'SENT'
                }
            });

            await prisma.conversation.update({
                where: { id: conversation.id },
                data: { lastMessageAt: new Date() }
            });

            // ─── Auto-Case: Şablon gönderiminde otomatik case oluştur/güncelle ───
            try {
                const existingCase = await prisma.case.findFirst({
                    where: {
                        contactId: contact.id,
                        workspaceId,
                        status: 'ACTIVE',
                        title: { contains: template.name }
                    },
                    orderBy: { createdAt: 'desc' }
                });

                if (existingCase) {
                    // Hatırlatma aktivitesi ekle
                    await prisma.contactActivity.create({
                        data: {
                            contactId: contact.id,
                            workspaceId,
                            caseId: existingCase.id,
                            type: 'NOTE',
                            title: 'Hatırlatma Gönderildi',
                            description: `[Şablon Gönderim] ${template.name} tekrar gönderildi.`,
                            status: 'COMPLETED',
                            completedAt: new Date(),
                            source: 'AUTOMATION'
                        }
                    });
                    if (!conversation.caseId) {
                        await prisma.conversation.update({
                            where: { id: conversation.id },
                            data: { caseId: existingCase.id }
                        });
                    }
                    console.log(`📦 [SendTemplate-AutoCase] Reminder added to case ${existingCase.caseNumber}`);
                } else {
                    // Yeni case oluştur
                    const caseNumber = await generateCaseNumber(workspaceId);

                    let caseTypeId = null;
                    try {
                        const frsatType = await prisma.caseType.findFirst({ where: { workspaceId, systemCode: 'FIRSAT' } });
                        caseTypeId = frsatType?.id || null;
                    } catch (_) {}

                    const newCase = await prisma.case.create({
                        data: {
                            workspaceId,
                            contactId: contact.id,
                            caseNumber,
                            title: `WA: ${template.name}`,
                            type: 'FIRSAT',
                            status: 'ACTIVE',
                            priority: 'NORMAL',
                            caseTypeId
                        }
                    });
                    await prisma.conversation.update({
                        where: { id: conversation.id },
                        data: { caseId: newCase.id }
                    });
                    await prisma.contactActivity.create({
                        data: {
                            contactId: contact.id,
                            workspaceId,
                            caseId: newCase.id,
                            type: 'NOTE',
                            title: 'Kayıt Oluşturuldu',
                            description: `[Şablon Gönderim] ${template.name} gönderildi.`,
                            status: 'COMPLETED',
                            completedAt: new Date(),
                            source: 'AUTOMATION'
                        }
                    });
                    console.log(`📦 [SendTemplate-AutoCase] Created case ${caseNumber} for contact ${contact.id}`);
                }
            } catch (caseErr) {
                console.error(`⚠️ [SendTemplate-AutoCase] Case error:`, caseErr.message);
            }
            // ─── End Auto-Case ───

            console.log(`✅ [sendTemplateDynamic] Message logged to DB for contact: ${contact.id}`);
        } catch (dbErr) {
            // DB logging failure shouldn't affect the API response
            console.error('⚠️ [sendTemplateDynamic] DB logging failed:', dbErr.message);
        }

        res.json({
            success: true,
            message: 'Şablon mesajı gönderildi',
            templateName: template.name,
            templateId: template.id,
            whatsappMessageId,
            recipientPhone
        });

    } catch (error) {
        console.error('❌ [sendTemplateDynamic] Error:', error.response?.data || error.message);

        const errorData = error.response?.data?.error;
        let userMessage = 'Şablon mesajı gönderilemedi';

        if (errorData?.code === 132000) {
            userMessage = 'Şablon parametreleri eksik veya hatalı';
        } else if (errorData?.code === 131026) {
            userMessage = 'Bu numara WhatsApp kullanmıyor';
        } else if (errorData?.code === 131047) {
            userMessage = 'Bu numaraya sadece şablon mesajı gönderilebilir (24 saat kuralı)';
        } else if (errorData?.code === 100) {
            userMessage = 'Geçersiz parametre: ' + (errorData?.message || 'Bilinmeyen hata');
        } else if (errorData?.message) {
            userMessage = errorData.message;
        }

        res.status(500).json({
            error: userMessage,
            details: errorData?.message,
            code: errorData?.code
        });
    }
};

// ============================================
// Automation Management
// ============================================

// Get all automations
export const getAutomations = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const automations = await prisma.automation.findMany({
            where: { workspaceId },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ automations });
    } catch (error) {
        console.error('Get automations error:', error);
        res.status(500).json({ error: 'Otomasyonlar yüklenirken hata oluştu' });
    }
};

// Create automation
export const createAutomation = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const {
            name, description, isActive, trigger, triggerChannel,
            action, actions, actionLogic, templateId, messageContent, assignToUserId,
            emailChannelId, emailSubject, emailBody, emailIsHtml,
            delayMinutes, conditions,
            // New action-specific fields
            targetFlowId, targetTeamId, reminderMessage, reminderDelayMin,
            callAgentId, appointmentType, marketingTplId
        } = req.body;

        if (!name || !trigger || !action) {
            return res.status(400).json({
                error: 'İsim, tetikleyici ve aksiyon gereklidir'
            });
        }

        const automation = await prisma.automation.create({
            data: {
                workspaceId,
                name,
                description,
                isActive: isActive !== false,
                trigger,
                triggerChannel,
                action,
                actions: actions || null,
                actionLogic: actionLogic || 'AND',
                templateId,
                messageContent,
                assignToUserId,
                emailChannelId,
                emailSubject,
                emailBody,
                emailIsHtml: emailIsHtml || false,
                delayMinutes: delayMinutes || 0,
                conditions: conditions ? JSON.stringify(conditions) : null,
                targetFlowId,
                targetTeamId,
                reminderMessage,
                reminderDelayMin,
                callAgentId,
                appointmentType,
                marketingTplId
            }
        });

        res.status(201).json({ automation });
    } catch (error) {
        console.error('Create automation error:', error);
        res.status(500).json({ error: 'Otomasyon oluşturulurken hata oluştu' });
    }
};

// Update automation
export const updateAutomation = async (req, res) => {
    try {
        const { workspaceId, automationId } = req.params;
        const updateData = req.body;

        const existing = await prisma.automation.findFirst({
            where: { id: automationId, workspaceId }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Otomasyon bulunamadı' });
        }

        if (updateData.conditions) {
            updateData.conditions = JSON.stringify(updateData.conditions);
        }

        const automation = await prisma.automation.update({
            where: { id: automationId },
            data: updateData
        });

        res.json({ automation });
    } catch (error) {
        console.error('Update automation error:', error);
        res.status(500).json({ error: 'Otomasyon güncellenirken hata oluştu' });
    }
};

// Delete automation
export const deleteAutomation = async (req, res) => {
    try {
        const { workspaceId, automationId } = req.params;

        const existing = await prisma.automation.findFirst({
            where: { id: automationId, workspaceId }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Otomasyon bulunamadı' });
        }

        await prisma.automation.delete({
            where: { id: automationId }
        });

        res.json({ message: 'Otomasyon silindi' });
    } catch (error) {
        console.error('Delete automation error:', error);
        res.status(500).json({ error: 'Otomasyon silinirken hata oluştu' });
    }
};

// Toggle automation status
export const toggleAutomation = async (req, res) => {
    try {
        const { workspaceId, automationId } = req.params;
        const { isActive } = req.body;

        const existing = await prisma.automation.findFirst({
            where: { id: automationId, workspaceId }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Otomasyon bulunamadı' });
        }

        const automation = await prisma.automation.update({
            where: { id: automationId },
            data: { isActive }
        });

        res.json({ automation });
    } catch (error) {
        console.error('Toggle automation error:', error);
        res.status(500).json({ error: 'Otomasyon güncellenirken hata oluştu' });
    }
};

// Execute automation for a lead (called internally)
export const executeLeadAutomation = async (workspaceId, lead, contact) => {
    try {
        console.log(`🤖 [AUTOMATION] executeLeadAutomation called`);
        console.log(`🤖 [AUTOMATION] WorkspaceId: ${workspaceId}`);
        console.log(`🤖 [AUTOMATION] Lead ID: ${lead?.id}, Name: ${lead?.name}`);
        console.log(`🤖 [AUTOMATION] Contact ID: ${contact?.id}, Phone: ${contact?.phone}`);

        // Find active automations for NEW_LEAD trigger
        const automations = await prisma.automation.findMany({
            where: {
                workspaceId,
                isActive: true,
                trigger: 'NEW_LEAD'
            }
        });

        console.log(`🤖 [AUTOMATION] Found ${automations.length} active NEW_LEAD automations`);

        if (automations.length === 0) {
            console.log(`ℹ️ [AUTOMATION] No active automations for NEW_LEAD trigger`);
            return;
        }

        for (const automation of automations) {
            console.log(`🤖 [AUTOMATION] Processing: ${automation.name}`);

            // Smart Segment condition evaluation
            if (automation.conditions) {
                try {
                    const conds = JSON.parse(automation.conditions);
                    
                    // Segment check
                    if (conds.segment && contact?.id) {
                        const { evaluateContactSegment } = await import('../services/smartSegment.service.js');
                        const matches = await evaluateContactSegment(contact.id, conds.segment, workspaceId);
                        if (!matches) {
                            console.log(`⏭️ [Automation] Skipping "${automation.name}" - contact not in segment ${conds.segment}`);
                            continue;
                        }
                    }
                    
                    // Tag check
                    if (conds.tags?.length && contact) {
                        const contactTags = (() => { try { return JSON.parse(contact.tags || '[]'); } catch { return []; } })();
                        const hasMatchingTag = conds.tags.some(t => contactTags.includes(t));
                        if (!hasMatchingTag) {
                            console.log(`⏭️ [Automation] Skipping "${automation.name}" - contact missing required tags`);
                            continue;
                        }
                    }
                } catch (parseErr) {
                    console.warn(`⚠️ [Automation] Failed to parse conditions for "${automation.name}":`, parseErr.message);
                }
            }

            // Parse actions from JSON or use legacy single action
            let actionsToExecute = [];
            try {
                actionsToExecute = automation.actions ? JSON.parse(automation.actions) : [automation.action];
            } catch (e) {
                actionsToExecute = [automation.action];
            }

            console.log(`🤖 [AUTOMATION] Actions: ${actionsToExecute.join(', ')}, Logic: ${automation.actionLogic || 'AND'}`);

            // Execute each action (AND = all, OR = first successful)
            for (const actionType of actionsToExecute) {
                console.log(`🤖 [AUTOMATION] Executing action: ${actionType}`);

                if (actionType === 'SEND_TEMPLATE' && automation.templateId) {
                    if (!contact?.phone) {
                        console.log(`⚠️ [AUTOMATION] Skipping - Contact has no phone number`);
                        continue;
                    }

                    // Delay if configured
                    if (automation.delayMinutes > 0) {
                        console.log(`⏱️ [AUTOMATION] Scheduling template send in ${automation.delayMinutes} minutes`);
                        setTimeout(async () => {
                            await sendTemplateToContact(workspaceId, automation.templateId, contact);
                            await trackAutomationCampaign(workspaceId, automation);
                        }, automation.delayMinutes * 60 * 1000);
                    } else {
                        console.log(`📤 [AUTOMATION] Sending template immediately...`);
                        await sendTemplateToContact(workspaceId, automation.templateId, contact);
                        await trackAutomationCampaign(workspaceId, automation);
                    }
                }

                // SEND_EMAIL action
                if (actionType === 'SEND_EMAIL' && automation.emailChannelId) {
                    if (!contact?.email) {
                        console.log(`⚠️ [AUTOMATION] Skipping email - Contact has no email address`);
                        continue;
                    }

                    const sendEmailAction = async () => {
                        try {
                            const { sendEmailViaChannel, replacePlaceholders } = await import('../services/emailSender.service.js');

                            // Replace placeholders in subject and body
                            const emailData = {
                                name: contact.name || lead?.name || '',
                                phone: contact.phone || lead?.phone || '',
                                email: contact.email || lead?.email || ''
                            };

                            const subject = replacePlaceholders(automation.emailSubject || 'Merhaba', emailData);
                            const body = replacePlaceholders(automation.emailBody || '', emailData);

                            await sendEmailViaChannel(
                                automation.emailChannelId,
                                contact.email,
                                subject,
                                body,
                                { isHtml: automation.emailIsHtml }
                            );

                            console.log(`✅ [AUTOMATION] Email sent to ${contact.email}`);
                        } catch (emailError) {
                            console.error(`❌ [AUTOMATION] Email send error:`, emailError);
                        }
                    };

                    // Delay if configured
                    if (automation.delayMinutes > 0) {
                        console.log(`⏱️ [AUTOMATION] Scheduling email in ${automation.delayMinutes} minutes`);
                        setTimeout(sendEmailAction, automation.delayMinutes * 60 * 1000);
                    } else {
                        console.log(`📧 [AUTOMATION] Sending email immediately...`);
                        await sendEmailAction();
                    }
                }
            }
        }

        // ====== SEND NOTIFICATION EMAIL TO CONNECTED EMAIL CHANNEL ======
        try {
            const { sendSystemEmail } = await import('../services/systemEmail.service.js');

            // Get workspace with connected email channel and owner
            const workspace = await prisma.workspace.findUnique({
                where: { id: workspaceId },
                include: {
                    members: {
                        where: { role: 'OWNER' },
                        include: {
                            user: { select: { email: true, name: true } }
                        }
                    }
                }
            });

            // Find connected email channel for this workspace
            // NOT: Email kanalına göndermek YANLIŞ — IMAP geri çekip CRM'de sahte konuşma oluşturur
            // Lead bildirimlerini workspace owner'ın kişisel e-postasına gönder
            const targetEmail = workspace?.members?.[0]?.user?.email;
            const ownerName = workspace?.members?.[0]?.user?.name || 'Değerli Kullanıcı';

            if (targetEmail) {
                const leadName = lead?.name || contact?.name || 'Bilinmeyen';
                const leadPhone = contact?.phone || lead?.phone || '-';
                const leadEmail = contact?.email || lead?.email || '-';

                const emailSubject = `🎯 Yeni Lead: ${leadName}`;
                const emailBody = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #4F46E5;">Yeni Lead Bildirimi</h2>
                        <p>Merhaba ${ownerName},</p>
                        <p><strong>${workspace?.name || 'İşletme'}</strong> işletmenize yeni bir lead geldi:</p>
                        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                            <tr style="background: #f3f4f6;">
                                <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Ad Soyad</strong></td>
                                <td style="padding: 10px; border: 1px solid #e5e7eb;">${leadName}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Telefon</strong></td>
                                <td style="padding: 10px; border: 1px solid #e5e7eb;">${leadPhone}</td>
                            </tr>
                            <tr style="background: #f3f4f6;">
                                <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>E-posta</strong></td>
                                <td style="padding: 10px; border: 1px solid #e5e7eb;">${leadEmail}</td>
                            </tr>
                        </table>
                        <p>
                            <a href="https://app.instomer.com/inbox?contactId=${contact?.id || ''}" 
                               style="display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
                                Lead'i Görüntüle
                            </a>
                        </p>
                        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
                        <p style="color: #6b7280; font-size: 12px;">Bu e-posta Instomer CRM tarafından otomatik gönderilmiştir.</p>
                    </div>
                `;

                await sendSystemEmail(targetEmail, emailSubject, emailBody);
                console.log(`📧 [AUTOMATION] Lead notification sent to workspace owner: ${targetEmail}`);
            }
        } catch (notifyError) {
            console.error('⚠️ [AUTOMATION] Owner notification email error:', notifyError.message);
            // Don't throw - notification failure shouldn't break automation
        }


        console.log(`✅ [AUTOMATION] All automations processed`);
    } catch (error) {
        console.error('❌ [AUTOMATION] Execute lead automation error:', error);
    }
};

/**
 * Execute automation based on Retell call outcome (Success/Fail)
 * @param {string} workspaceId 
 * @param {object} callRecord - Prisma RetellCall object
 */
export const executeRetellAutomation = async (workspaceId, callRecord) => {
    try {
        if (!callRecord || !workspaceId) return;

        const isSuccess = callRecord.callSuccessful === true;
        const trigger = isSuccess ? 'RETELL_COMPLETED_SUCCESS' : 'RETELL_COMPLETED_FAIL';

        console.log(`🤖 [AUTOMATION] executeRetellAutomation called for trigger: ${trigger} (Call: ${callRecord.callId})`);

        const contact = callRecord.contactId ? await prisma.contact.findUnique({ where: { id: callRecord.contactId } }) : null;

        // Find active automations for this trigger
        const automations = await prisma.automation.findMany({
            where: {
                workspaceId,
                isActive: true,
                trigger
            }
        });

        if (automations.length === 0) {
            console.log(`ℹ️ [AUTOMATION] No active automations for ${trigger}`);
            return;
        }

        for (const automation of automations) {
            console.log(`🤖 [AUTOMATION] Processing: ${automation.name} for ${callRecord.callId}`);

            // Smart Segment condition evaluation
            if (automation.conditions) {
                try {
                    const conds = JSON.parse(automation.conditions);
                    
                    // Segment check
                    if (conds.segment && contact?.id) {
                        const { evaluateContactSegment } = await import('../services/smartSegment.service.js');
                        const matches = await evaluateContactSegment(contact.id, conds.segment, workspaceId);
                        if (!matches) {
                            console.log(`⏭️ [Automation] Skipping "${automation.name}" - contact not in segment ${conds.segment}`);
                            continue;
                        }
                    }
                    
                    // Tag check
                    if (conds.tags?.length && contact) {
                        const contactTags = (() => { try { return JSON.parse(contact.tags || '[]'); } catch { return []; } })();
                        const hasMatchingTag = conds.tags.some(t => contactTags.includes(t));
                        if (!hasMatchingTag) {
                            console.log(`⏭️ [Automation] Skipping "${automation.name}" - contact missing required tags`);
                            continue;
                        }
                    }
                } catch (parseErr) {
                    console.warn(`⚠️ [Automation] Failed to parse conditions for "${automation.name}":`, parseErr.message);
                }
            }

            // Parse actions from JSON or use legacy single action
            let actionsToExecute = [];
            try {
                actionsToExecute = automation.actions ? JSON.parse(automation.actions) : [automation.action];
            } catch (e) {
                actionsToExecute = [automation.action];
            }

            for (const actionType of actionsToExecute) {
                if (actionType === 'SEND_TEMPLATE' && automation.templateId) {
                    if (!contact?.phone) {
                        console.log(`⚠️ [AUTOMATION] Skipping - Contact has no phone number`);
                        continue;
                    }

                    // Delay if configured
                    if (automation.delayMinutes > 0) {
                        console.log(`⏱️ [AUTOMATION] Scheduling template in ${automation.delayMinutes}m`);
                        setTimeout(async () => {
                            await sendTemplateToContact(workspaceId, automation.templateId, contact);
                        }, automation.delayMinutes * 60 * 1000);
                    } else {
                        await sendTemplateToContact(workspaceId, automation.templateId, contact);
                    }
                }

                // SEND_EMAIL action
                if (actionType === 'SEND_EMAIL' && automation.emailChannelId) {
                    if (!contact?.email) continue;

                    const sendEmailAction = async () => {
                        try {
                            const { sendEmailViaChannel, replacePlaceholders } = await import('../services/emailSender.service.js');
                            const emailData = {
                                name: contact.name || '',
                                phone: contact.phone || '',
                                email: contact.email || ''
                            };
                            const subject = replacePlaceholders(automation.emailSubject || 'Arama Bilgilendirmesi', emailData);
                            const body = replacePlaceholders(automation.emailBody || '', emailData);

                            await sendEmailViaChannel(
                                automation.emailChannelId,
                                contact.email,
                                subject,
                                body,
                                { isHtml: automation.emailIsHtml }
                            );
                        } catch (e) { console.error('❌ Email automation error:', e); }
                    };

                    if (automation.delayMinutes > 0) {
                        setTimeout(sendEmailAction, automation.delayMinutes * 60 * 1000);
                    } else {
                        await sendEmailAction();
                    }
                }
            }
        }
    } catch (error) {
        console.error('❌ [AUTOMATION] executeRetellAutomation error:', error);
    }
};

// Helper: Send template to a contact
const sendTemplateToContact = async (workspaceId, templateId, contact) => {
    try {
        const template = await prisma.whatsappTemplate.findFirst({
            where: { id: templateId, workspaceId },
            include: { whatsappPhoneNumber: true }
        });

        if (!template || !contact?.phone) {
            console.log('❌ Template or phone not found for automation');
            return;
        }

        let whatsappPhone = template.whatsappPhoneNumber;
        if (!whatsappPhone) {
            whatsappPhone = await prisma.whatsappPhoneNumber.findFirst({
                where: { workspaceId }
            });
        }

        if (!whatsappPhone) {
            console.log('❌ No WhatsApp number found');
            return;
        }

        const recipientPhone = normalizePhone(contact.phone);

        const templatePayload = {
            messaging_product: 'whatsapp',
            to: recipientPhone,
            type: 'template',
            template: {
                name: template.name,
                language: { code: template.language || 'tr' }
            }
        };

        // Build components array for header/body parameters
        const components = [];

        // Add header component for media templates (IMAGE, VIDEO, DOCUMENT, LOCATION)
        if (template.headerType) {
            if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(template.headerType)) {
                const mediaUrl = convertGoogleDriveLink(template.headerContent);
                if (mediaUrl) {
                    const headerComponent = {
                        type: 'header',
                        parameters: [{
                            type: template.headerType.toLowerCase(),
                            [template.headerType.toLowerCase()]: {
                                link: mediaUrl
                            }
                        }]
                    };
                    components.push(headerComponent);
                    console.log('📎 [AUTOMATION] Header component added:', template.headerType);
                } else {
                    console.log(`⚠️ [AUTOMATION] Template has ${template.headerType} header but no headerContent URL`);
                }
            } else if (template.headerType === 'LOCATION') {
                // Location header - parse from headerContent or use defaults
                let locationData = { latitude: '41.0082', longitude: '28.9784', name: 'Konum', address: '' };
                try {
                    if (template.headerContent) {
                        const parsed = JSON.parse(template.headerContent);
                        locationData = { ...locationData, ...parsed };
                    }
                } catch (e) { }

                components.push({
                    type: 'header',
                    parameters: [{
                        type: 'location',
                        location: locationData
                    }]
                });
                console.log('📍 [AUTOMATION] Location header added');
            }
        }

        // Add body parameters for templates with placeholders ({{1}}, {{2}}, etc.)
        const placeholderCount = (template.bodyText?.match(/\{\{\d+\}\}/g) || []).length;
        if (placeholderCount > 0) {
            const bodyParams = [];

            // {{1}} = Contact name (primary placeholder)
            const customerName = contact.name || contact.fullName || 'Değerli Müşterimiz';
            bodyParams.push({ type: 'text', text: customerName });
            console.log(`📝 [AUTOMATION] Body param {{1}} = "${customerName}"`);

            // Fill remaining placeholders with empty or default values
            for (let i = 1; i < placeholderCount; i++) {
                bodyParams.push({ type: 'text', text: '' });
            }

            components.push({
                type: 'body',
                parameters: bodyParams
            });
        }

        // Only add components if there are any
        if (components.length > 0) {
            templatePayload.template.components = components;
        }

        console.log('📤 [AUTOMATION] Sending template:', template.name, 'to:', recipientPhone);

        const response = await axios.post(
            `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${whatsappPhone.phoneNumberId}/messages`,
            templatePayload,
            {
                headers: {
                    'Authorization': `Bearer ${whatsappPhone.accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log(`✅ Automation template sent to ${contact.phone}:`, response.data);

        // Find existing conversation - PRIORITY: LEAD (most recent open), then WHATSAPP, then create new
        // This prevents duplicate conversations when automation fires on a lead form submission
        let conversation = await prisma.conversation.findFirst({
            where: {
                contactId: contact.id,
                workspaceId,
                status: 'OPEN'
            },
            orderBy: { lastMessageAt: 'desc' }
        });

        if (!conversation) {
            // Check for any existing WHATSAPP conversation (even if resolved)
            conversation = await prisma.conversation.findFirst({
                where: {
                    contactId: contact.id,
                    workspaceId,
                    channel: 'WHATSAPP'
                },
                orderBy: { lastMessageAt: 'desc' }
            });
        }

        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: {
                    contactId: contact.id,
                    workspaceId,
                    whatsappPhoneNumberId: whatsappPhone.id,
                    channel: 'WHATSAPP',
                    status: 'OPEN'
                }
            });
        }

        console.log(`📋 [AUTOMATION] Using conversation: ${conversation.id} (channel: ${conversation.channel}, status: ${conversation.status})`);

        await prisma.message.create({
            data: {
                conversationId: conversation.id,
                content: `[Otomatik Şablon: ${template.name}]\n${template.bodyText}`,
                messageType: 'TEMPLATE',
                isFromContact: false,
                whatsappMessageId: response.data.messages?.[0]?.id,
                status: 'SENT'
            }
        });

        await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
                lastMessageAt: new Date(),
                lastBotMessageAt: new Date(),       // Follow-up tracking: marks this as a bot message
                inactivityWarningSent: false,        // Reset inactivity flag for new bot message
                reminderSentAt: null                 // Reset reminder flag so reminder can be sent if customer doesn't respond
            }
        });

    } catch (error) {
        console.error('Send template to contact error:', error.response?.data || error);
    }
};

// Execute automation for web form / widget submission (called internally)
export const executeWebFormAutomation = async (workspaceId, contact, formData = {}) => {
    try {
        console.log(`🤖 [AUTOMATION] executeWebFormAutomation called`);
        console.log(`🤖 [AUTOMATION] WorkspaceId: ${workspaceId}`);

        // PRIORITY: Use phone from form data first, then contact's stored phone
        const phoneToUse = formData.phone || contact?.phone;
        console.log(`🤖 [AUTOMATION] Contact ID: ${contact?.id}, Name: ${contact?.name}`);
        console.log(`🤖 [AUTOMATION] Phone from form: ${formData.phone}, Phone from contact: ${contact?.phone}`);
        console.log(`🤖 [AUTOMATION] Using phone: ${phoneToUse}`);

        // Find active automations for NEW_WEBFORM trigger
        const automations = await prisma.automation.findMany({
            where: {
                workspaceId,
                isActive: true,
                trigger: 'NEW_WEBFORM'
            }
        });

        console.log(`🤖 [AUTOMATION] Found ${automations.length} active NEW_WEBFORM automations`);

        if (automations.length === 0) {
            console.log(`ℹ️ [AUTOMATION] No active automations for NEW_WEBFORM trigger`);
            return;
        }

        for (const automation of automations) {
            console.log(`🤖 [AUTOMATION] Processing: ${automation.name}`);

            // Smart Segment condition evaluation
            if (automation.conditions) {
                try {
                    const conds = JSON.parse(automation.conditions);
                    
                    // Segment check
                    if (conds.segment && contact?.id) {
                        const { evaluateContactSegment } = await import('../services/smartSegment.service.js');
                        const matches = await evaluateContactSegment(contact.id, conds.segment, workspaceId);
                        if (!matches) {
                            console.log(`⏭️ [Automation] Skipping "${automation.name}" - contact not in segment ${conds.segment}`);
                            continue;
                        }
                    }
                    
                    // Tag check
                    if (conds.tags?.length && contact) {
                        const contactTags = (() => { try { return JSON.parse(contact.tags || '[]'); } catch { return []; } })();
                        const hasMatchingTag = conds.tags.some(t => contactTags.includes(t));
                        if (!hasMatchingTag) {
                            console.log(`⏭️ [Automation] Skipping "${automation.name}" - contact missing required tags`);
                            continue;
                        }
                    }
                } catch (parseErr) {
                    console.warn(`⚠️ [Automation] Failed to parse conditions for "${automation.name}":`, parseErr.message);
                }
            }

            // Parse actions from JSON or use legacy single action
            let actionsToExecute = [];
            try {
                actionsToExecute = automation.actions ? JSON.parse(automation.actions) : [automation.action];
            } catch (e) {
                actionsToExecute = [automation.action];
            }

            console.log(`🤖 [AUTOMATION] Actions: ${actionsToExecute.join(', ')}, Logic: ${automation.actionLogic || 'AND'}`);

            // Execute each action
            for (const actionType of actionsToExecute) {
                console.log(`🤖 [AUTOMATION] Executing action: ${actionType}`);

                // SEND_TEMPLATE action
                if (actionType === 'SEND_TEMPLATE' && automation.templateId) {
                    if (!phoneToUse) {
                        console.log(`⚠️ [AUTOMATION] Skipping SEND_TEMPLATE - No phone number available`);
                        continue;
                    }

                    // Create contact object with form phone prioritized
                    const contactWithFormPhone = {
                        ...contact,
                        phone: phoneToUse,
                        name: formData.name || contact?.name
                    };

                    // Delay if configured
                    if (automation.delayMinutes > 0) {
                        console.log(`⏱️ [AUTOMATION] Scheduling template send in ${automation.delayMinutes} minutes`);
                        setTimeout(async () => {
                            await sendTemplateToContact(workspaceId, automation.templateId, contactWithFormPhone);
                        }, automation.delayMinutes * 60 * 1000);
                    } else {
                        console.log(`📤 [AUTOMATION] Sending template immediately...`);
                        await sendTemplateToContact(workspaceId, automation.templateId, contactWithFormPhone);
                    }
                }


                // SEND_EMAIL action
                if (actionType === 'SEND_EMAIL' && automation.emailChannelId) {
                    if (!contact?.email) {
                        console.log(`⚠️ [AUTOMATION] Skipping SEND_EMAIL - Contact has no email address`);
                        continue;
                    }

                    const sendEmailAction = async () => {
                        try {
                            const { sendEmailViaChannel, replacePlaceholders } = await import('../services/emailSender.service.js');

                            // Replace placeholders in subject and body
                            const emailData = {
                                name: contact.name || formData.name || '',
                                phone: contact.phone || formData.phone || '',
                                email: contact.email || formData.email || ''
                            };

                            const subject = replacePlaceholders(automation.emailSubject || 'Web Form Bildirimi', emailData);
                            const body = replacePlaceholders(automation.emailBody || '', emailData);

                            await sendEmailViaChannel(
                                automation.emailChannelId,
                                contact.email,
                                subject,
                                body,
                                { isHtml: automation.emailIsHtml }
                            );

                            console.log(`✅ [AUTOMATION] Email sent to ${contact.email}`);
                        } catch (emailError) {
                            console.error(`❌ [AUTOMATION] Email send error:`, emailError);
                        }
                    };

                    // Delay if configured
                    if (automation.delayMinutes > 0) {
                        console.log(`⏱️ [AUTOMATION] Scheduling email in ${automation.delayMinutes} minutes`);
                        setTimeout(sendEmailAction, automation.delayMinutes * 60 * 1000);
                    } else {
                        console.log(`📧 [AUTOMATION] Sending email immediately...`);
                        await sendEmailAction();
                    }
                }

                // SEND_MESSAGE action (for channels that support direct messaging)
                if (actionType === 'SEND_MESSAGE' && automation.messageContent) {
                    console.log(`💬 [AUTOMATION] SEND_MESSAGE configured - will be sent via channel if available`);
                    // This would be handled by the conversation/messaging system
                }
            }
        }

        console.log(`✅ [AUTOMATION] All web form automations processed`);
    } catch (error) {
        console.error('❌ [AUTOMATION] Execute web form automation error:', error);
    }
};


// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Helper: Otomasyon mesajı gönderildiğinde günlük kampanya kaydı oluştur/güncelle
// ─────────────────────────────────────────────────────────────────────────────
async function trackAutomationCampaign(workspaceId, automation) {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const startOfDay = new Date(today + 'T00:00:00.000Z');

        // Bugün bu otomasyon için kampanya var mı?
        let campaign = await prisma.marketingCampaign.findFirst({
            where: {
                workspaceId,
                automationId: automation.id,
                createdAt: { gte: startOfDay }
            }
        });

        if (campaign) {
            await prisma.marketingCampaign.update({
                where: { id: campaign.id },
                data: {
                    totalCount: { increment: 1 },
                    sentCount: { increment: 1 }
                }
            });
        } else {
            await prisma.marketingCampaign.create({
                data: {
                    workspaceId,
                    name: `${automation.name || 'Otomasyon'} — ${today}`,
                    type: 'AUTOMATION',
                    automationId: automation.id,
                    status: 'ACTIVE',
                    totalCount: 1,
                    sentCount: 1
                }
            });
        }
    } catch (err) {
        console.warn('⚠️ [trackAutomationCampaign]', err.message);
    }
}

// GET /automations/:workspaceId/unified-panel
// Tüm otomasyon kaynaklarını birleşik tek liste halinde döner
// ─────────────────────────────────────────────────────────────────────────────
export const getUnifiedAutomationPanel = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const [automations, flows, rules, scheduledMessages, retellTemplates] = await Promise.all([
            // 1. Basit Otomasyonlar
            prisma.automation.findMany({
                where: { workspaceId },
                select: { id: true, name: true, description: true, trigger: true, action: true, isActive: true, createdAt: true },
                orderBy: { createdAt: 'desc' }
            }),
            // 2. Akış Otomasyonları
            prisma.flow.findMany({
                where: { workspaceId },
                select: { id: true, name: true, description: true, isActive: true, triggerType: true, createdAt: true },
                orderBy: { createdAt: 'desc' }
            }),
            // 3. Kurallar
            prisma.workspaceRule.findMany({
                where: { workspaceId },
                select: { id: true, ruleType: true, config: true, isActive: true, updatedAt: true },
                orderBy: { updatedAt: 'desc' }
            }),
            // 4. Zamanlanmış Mesajlar (son 100)
            prisma.scheduledMessage.findMany({
                where: { workspaceId },
                select: { id: true, content: true, scheduledAt: true, status: true, botId: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 100
            }),
            // 5. Retell Arama Şablonları
            prisma.retellTemplate.findMany({
                where: { workspaceId },
                select: { id: true, name: true, description: true, isActive: true, agentId: true, createdAt: true },
                orderBy: { order: 'asc' }
            })
        ]);

        // Hepsini birleşik formata çevir
        const unified = [
            ...automations.map(a => ({
                id: a.id, source: 'AUTOMATION', name: a.name, description: a.description,
                isActive: a.isActive, trigger: a.trigger, action: a.action, createdAt: a.createdAt
            })),
            ...flows.map(f => ({
                id: f.id, source: 'FLOW', name: f.name, description: f.description,
                isActive: f.isActive, trigger: f.triggerType, createdAt: f.createdAt
            })),
            ...rules.map(r => ({
                id: r.id, source: 'RULE', name: r.ruleType, description: `Kural: ${r.ruleType}`,
                isActive: r.isActive, createdAt: r.updatedAt
            })),
            ...retellTemplates.map(t => ({
                id: t.id, source: 'RETELL_TEMPLATE', name: t.name, description: t.description,
                isActive: t.isActive, createdAt: t.createdAt
            }))
        ];

        // Aktif/pasif sayıları
        const activeCount = unified.filter(u => u.isActive).length;
        const inactiveCount = unified.filter(u => !u.isActive).length;

        // Zamanlanmış mesaj özet
        const pendingScheduled = scheduledMessages.filter(m => m.status === 'PENDING').length;
        const failedScheduled = scheduledMessages.filter(m => m.status === 'FAILED').length;

        res.json({
            success: true,
            unified,
            scheduledMessages,
            stats: {
                totalAutomations: unified.length,
                active: activeCount,
                inactive: inactiveCount,
                automationCount: automations.length,
                flowCount: flows.length,
                ruleCount: rules.length,
                retellTemplateCount: retellTemplates.length,
                pendingScheduled,
                failedScheduled
            }
        });
    } catch (error) {
        console.error('❌ [UnifiedPanel]', error);
        res.status(500).json({ error: 'Birleşik panel yüklenemedi' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /automations/:workspaceId/unified-toggle
// Birleşik panelden her türlü otomasyon için tek tıkla aç/kapat
// ─────────────────────────────────────────────────────────────────────────────
export const toggleUnifiedAutomation = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { source, id, isActive } = req.body;

        if (!source || !id || isActive === undefined) {
            return res.status(400).json({ error: 'source, id ve isActive zorunludur' });
        }

        switch (source) {
            case 'AUTOMATION':
                await prisma.automation.update({ where: { id, workspaceId }, data: { isActive } });
                break;
            case 'FLOW':
                await prisma.flow.update({ where: { id, workspaceId }, data: { isActive } });
                break;
            case 'RULE':
                await prisma.workspaceRule.update({ where: { id, workspaceId }, data: { isActive } });
                break;
            case 'RETELL_TEMPLATE':
                await prisma.retellTemplate.update({ where: { id, workspaceId }, data: { isActive } });
                break;
            default:
                return res.status(400).json({ error: `Bilinmeyen kaynak: ${source}` });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('❌ [UnifiedToggle]', error.message);
        res.status(500).json({ error: 'Durum değiştirilemedi' });
    }
};
