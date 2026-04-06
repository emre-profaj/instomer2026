import prisma from '../lib/prisma.js';
import axios from 'axios';

const WHATSAPP_API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || 'v21.0';

// ============================================
// WhatsApp Template Management
// ============================================

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

// Create/Add a template manually
export const createTemplate = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const {
            templateId, name, language, category, status,
            headerType, headerContent, bodyText, footerText,
            buttons, exampleValues, whatsappPhoneNumberId
        } = req.body;

        if (!templateId || !name || !bodyText) {
            return res.status(400).json({
                error: 'Template ID, isim ve gövde metni gereklidir'
            });
        }

        const template = await prisma.whatsappTemplate.create({
            data: {
                workspaceId,
                whatsappPhoneNumberId: whatsappPhoneNumberId || null,
                templateId,
                name,
                language: language || 'tr',
                category: category || 'MARKETING',
                status: status || 'APPROVED',
                headerType,
                headerContent,
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
            return res.status(400).json({ error: 'Bu template ID zaten mevcut' });
        }
        res.status(500).json({ error: 'Şablon oluşturulurken hata oluştu' });
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
        if (updateData.buttons) {
            updateData.buttons = JSON.stringify(updateData.buttons);
        }
        if (updateData.exampleValues) {
            updateData.exampleValues = JSON.stringify(updateData.exampleValues);
        }

        const template = await prisma.whatsappTemplate.update({
            where: { id: templateId },
            data: updateData
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
            where: { id: templateId, workspaceId }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Şablon bulunamadı' });
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
                            headerContent: header?.text || null,
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
                            headerContent: header?.text || null,
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
        recipientPhone = recipientPhone.replace(/[\s\+\-]/g, '');

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
            // Use provided headerMediaUrl or fall back to template's headerContent
            const mediaUrl = headerMediaUrl || template.headerContent;

            if (!mediaUrl) {
                return res.status(400).json({
                    error: 'Bu şablon için medya URL\'si gereklidir',
                    headerType: template.headerType
                });
            }

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
            console.log('📎 Header component added:', headerComponent);
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

        // Find or create conversation
        let conversation = null;
        if (contact) {
            conversation = await prisma.conversation.findFirst({
                where: {
                    contactId: contact.id,
                    workspaceId,
                    channel: 'WHATSAPP'
                }
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

            // Save message to database
            await prisma.message.create({
                data: {
                    conversationId: conversation.id,
                    content: `[Şablon: ${template.name}]\n${template.bodyText}`,
                    messageType: 'TEMPLATE',
                    isFromContact: false,
                    whatsappMessageId: response.data.messages?.[0]?.id,
                    status: 'SENT'
                }
            });

            // Update conversation
            await prisma.conversation.update({
                where: { id: conversation.id },
                data: { lastMessageAt: new Date() }
            });
        }

        res.json({
            success: true,
            message: 'Şablon mesajı gönderildi',
            whatsappMessageId: response.data.messages?.[0]?.id,
            conversationId: conversation?.id
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
        recipientPhone = recipientPhone.replace(/[\s\+\-\(\)]/g, '');

        // Ensure it starts with country code
        if (!recipientPhone.startsWith('90') && recipientPhone.length === 10) {
            recipientPhone = '90' + recipientPhone;
        }

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
        let recipientPhone = phoneNumber.replace(/[\s\+\-\(\)]/g, '');

        // Add Turkey country code if missing
        if (recipientPhone.startsWith('0')) {
            recipientPhone = '90' + recipientPhone.substring(1);
        } else if (!recipientPhone.startsWith('90') && recipientPhone.length === 10) {
            recipientPhone = '90' + recipientPhone;
        }

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
            const mediaUrl = headerMediaUrl || template.headerContent;

            if (mediaUrl) {
                components.push({
                    type: 'header',
                    parameters: [{
                        type: template.headerType.toLowerCase(),
                        [template.headerType.toLowerCase()]: { link: mediaUrl }
                    }]
                });
                console.log('📎 [sendTemplateDynamic] Header added:', template.headerType);
            }
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

        // 6. LOG TO DATABASE (Optional: Create contact/conversation if needed)
        const whatsappMessageId = response.data.messages?.[0]?.id;

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
            action, templateId, messageContent, assignToUserId,
            delayMinutes, conditions
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
                templateId,
                messageContent,
                assignToUserId,
                delayMinutes: delayMinutes || 0,
                conditions: conditions ? JSON.stringify(conditions) : null
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
                        }, automation.delayMinutes * 60 * 1000);
                    } else {
                        console.log(`📤 [AUTOMATION] Sending template immediately...`);
                        await sendTemplateToContact(workspaceId, automation.templateId, contact);
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
            const emailChannel = await prisma.emailChannel.findFirst({
                where: { workspaceId }
            });

            // Priority: 1) Connected email channel, 2) Workspace owner
            const targetEmail = emailChannel?.email || workspace?.members?.[0]?.user?.email;
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
                            <a href="https://app.instomer.com/inbox" 
                               style="display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
                                Lead'i Görüntüle
                            </a>
                        </p>
                        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
                        <p style="color: #6b7280; font-size: 12px;">Bu e-posta Instomer CRM tarafından otomatik gönderilmiştir.</p>
                    </div>
                `;

                await sendSystemEmail(targetEmail, emailSubject, emailBody);
                console.log(`📧 [AUTOMATION] Lead notification sent to ${emailChannel ? 'connected channel' : 'workspace owner'}: ${targetEmail}`);
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

        const recipientPhone = contact.phone.replace(/[\s\+\-]/g, '');

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
                const mediaUrl = template.headerContent;
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
            data: { lastMessageAt: new Date() }
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

