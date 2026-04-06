import prisma from '../lib/prisma.js';
import crypto from 'crypto';
import { getIO, emitToWorkspace } from '../socket.js';
import { smartFieldMatcher } from '../utils/fieldMatcher.js';
import { executeWebFormAutomation } from './automation.controller.js';


// Generate unique webhook URL and token
const generateWebhookCredentials = () => {
    const token = crypto.randomBytes(32).toString('hex');
    const urlSlug = crypto.randomBytes(16).toString('hex');
    return { token, urlSlug };
};

// Get all form webhooks for a workspace
export const getFormWebhooks = async (req, res) => {
    try {
        const { workspaceId } = req.params;

        const webhooks = await prisma.formWebhook.findMany({
            where: { workspaceId },
            include: {
                _count: {
                    select: { submissions: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ webhooks });
    } catch (error) {
        console.error('Get form webhooks error:', error);
        res.status(500).json({ error: 'Form webhook\'leri alınamadı' });
    }
};

// Create new form webhook
export const createFormWebhook = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { name, siteUrl } = req.body;

        if (!siteUrl) {
            return res.status(400).json({ error: 'Site URL gereklidir' });
        }

        const { token, urlSlug } = generateWebhookCredentials();

        // Remove trailing slash from siteUrl if exists
        const cleanSiteUrl = siteUrl.replace(/\/$/, '');

        // Webhook URL points to central API server
        const apiBaseUrl = process.env.API_URL || 'https://app.instomer.com';
        const webhookUrl = `${apiBaseUrl}/api/form-webhooks/submit/${urlSlug}`;

        const webhook = await prisma.formWebhook.create({
            data: {
                workspaceId,
                name,
                siteUrl: cleanSiteUrl,
                webhookUrl,
                webhookToken: token,
                fieldMapping: '{}'
            }
        });

        res.json({ webhook });
    } catch (error) {
        console.error('Create form webhook error:', error);
        res.status(500).json({ error: 'Form webhook oluşturulamadı' });
    }
};

// Update form webhook
export const updateFormWebhook = async (req, res) => {
    try {
        const { workspaceId, webhookId } = req.params;
        const { name, siteUrl, isActive } = req.body;

        const webhook = await prisma.formWebhook.update({
            where: {
                id: webhookId,
                workspaceId
            },
            data: {
                ...(name && { name }),
                ...(siteUrl !== undefined && { siteUrl }),
                ...(typeof isActive === 'boolean' && { isActive })
            }
        });

        res.json({ webhook });
    } catch (error) {
        console.error('Update form webhook error:', error);
        res.status(500).json({ error: 'Form webhook güncellenemedi' });
    }
};

// Delete form webhook
export const deleteFormWebhook = async (req, res) => {
    try {
        const { workspaceId, webhookId } = req.params;

        await prisma.formWebhook.delete({
            where: {
                id: webhookId,
                workspaceId
            }
        });

        res.json({ message: 'Form webhook silindi' });
    } catch (error) {
        console.error('Delete form webhook error:', error);
        res.status(500).json({ error: 'Form webhook silinemedi' });
    }
};

// PUBLIC: Handle form submission (webhook endpoint)
export const handleFormSubmission = async (req, res) => {
    try {
        const { urlSlug } = req.params;
        const formData = req.body;
        const token = req.headers['x-webhook-token'] || req.query.token;

        console.log('📝 Form submission received:', {
            urlSlug,
            hasToken: !!token,
            fields: Object.keys(formData),
            rawData: formData
        });

        // Find webhook by URL slug
        const webhook = await prisma.formWebhook.findFirst({
            where: {
                webhookUrl: { contains: urlSlug },
                isActive: true
            }
        });

        if (!webhook) {
            return res.status(404).json({ error: 'Webhook not found' });
        }

        // Verify token if provided
        if (token && token !== webhook.webhookToken) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        // 🎨 ELEMENTOR FORMAT DETECTION & NORMALIZATION
        let normalizedData = { ...formData };
        let fieldTitleMap = {}; // 🆕 Store field ID -> title mapping

        // Elementor sends data in nested format: { fields: { name: { value: 'x' } } }
        if (formData.fields && typeof formData.fields === 'object') {
            console.log('🎨 Elementor nested format detected');
            normalizedData = {};

            // Extract values from nested structure
            for (const [fieldId, fieldData] of Object.entries(formData.fields)) {
                if (fieldData && typeof fieldData === 'object' && fieldData.value !== undefined) {
                    // Use field ID as key, extract value
                    normalizedData[fieldId] = fieldData.value;

                    // 🆕 Store title mapping for later use (for readable display)
                    if (fieldData.title) {
                        fieldTitleMap[fieldId] = fieldData.title;
                        // Also add with title as key for pattern matching
                        normalizedData[fieldData.title] = fieldData.value;
                    }
                }
            }

            // Keep original data and title mapping for reference
            normalizedData._elementor_original = formData;
            normalizedData._fieldTitleMap = fieldTitleMap;
        }
        // Elementor also sends data as form_fields[field_id] or nested object
        else if (formData.form_fields) {
            console.log('🎨 Elementor form_fields format detected');
            const elementorFields = formData.form_fields;

            // If form_fields is an object (Elementor Pro format)
            if (typeof elementorFields === 'object' && !Array.isArray(elementorFields)) {
                normalizedData = { ...elementorFields };
            }

            // Keep original data for reference
            normalizedData._elementor_original = formData;
        }
        // Also check for form_fields[key] format in root
        else {
            for (const key in formData) {
                if (key.startsWith('form_fields[') && key.endsWith(']')) {
                    const fieldName = key.replace('form_fields[', '').replace(']', '');
                    normalizedData[fieldName] = formData[key];
                }
            }
        }

        console.log('📋 Normalized data:', normalizedData);

        // 🤖 OTOMATIK FIELD MAPPING
        const autoMapped = smartFieldMatcher.autoMap(normalizedData);
        const confidence = smartFieldMatcher.getConfidenceScore(normalizedData);

        console.log('🤖 Auto-mapped fields:', {
            name: autoMapped.name,
            email: autoMapped.email,
            phone: autoMapped.phone,
            company: autoMapped.company,
            confidence: confidence.confidence,
            score: confidence.score
        });

        // Extract mapped values
        const name = autoMapped.name;
        const email = autoMapped.email;
        const phone = autoMapped.phone;
        const company = autoMapped.company;
        const message = autoMapped.message;
        const subject = autoMapped.subject;
        const product = autoMapped.product;
        const age = autoMapped.age;

        // Get source info
        const source = formData._source || req.headers.referer || null;
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'];

        // Find or create contact (always create one, even if no email/phone)
        let contact = null;

        if (email || phone) {
            // Try to find existing contact
            contact = await prisma.contact.findFirst({
                where: {
                    workspaceId: webhook.workspaceId,
                    OR: [
                        ...(email ? [{ email }] : []),
                        ...(phone ? [{ phone }] : [])
                    ]
                }
            });

            if (contact) {
                // Update existing contact if new info provided
                const updateData = {};
                if (name && !contact.name) updateData.name = name;
                if (company && !contact.company) updateData.company = company;

                // Telefon varsa ve status NEW ise OPPORTUNITY yap
                if (phone && phone.trim() && contact.status === 'NEW') {
                    updateData.status = 'OPPORTUNITY';
                    console.log(`📱 Contact will be upgraded to OPPORTUNITY: ${contact.id}`);
                }

                if (Object.keys(updateData).length > 0) {
                    contact = await prisma.contact.update({
                        where: { id: contact.id },
                        data: updateData
                    });
                    console.log('✅ Contact updated:', contact.id);
                }
            }
        }

        // If no contact found, create a new one
        if (!contact) {
            // Telefon varsa OPPORTUNITY, yoksa NEW
            const initialStatus = phone && phone.trim() ? 'OPPORTUNITY' : 'NEW';

            contact = await prisma.contact.create({
                data: {
                    workspaceId: webhook.workspaceId,
                    name: name || 'Form Gönderen',
                    email,
                    phone,
                    company,
                    status: initialStatus,
                    source: 'WEB_FORM',
                    tags: JSON.stringify(['form', webhook.name])
                }
            });
            console.log(`✅ New contact created as ${initialStatus}:`, contact.id);
        }

        // Create form submission with auto-mapping metadata
        const submission = await prisma.formSubmission.create({
            data: {
                formWebhookId: webhook.id,
                workspaceId: webhook.workspaceId,
                contactId: contact?.id,
                formData: JSON.stringify({
                    ...formData,
                    _autoMapping: {
                        confidence: confidence.confidence,
                        score: confidence.score,
                        mapped: autoMapped
                    }
                }),
                name,
                email,
                phone,
                company,
                message: message || subject || null,
                source,
                ipAddress,
                userAgent,
                status: 'NEW'
            },
            include: {
                contact: true,
                formWebhook: true
            }
        });

        // Create conversation for this form submission
        const conversation = await prisma.conversation.create({
            data: {
                workspaceId: webhook.workspaceId,
                contactId: contact?.id,
                channel: 'FORM',
                status: 'OPEN'
            }
        });

        // Link submission to conversation
        await prisma.formSubmission.update({
            where: { id: submission.id },
            data: { conversationId: conversation.id }
        });

        // Create message with table format - DYNAMIC: show ALL form fields
        let messageContent = `📋 ${webhook.name}\n\n`;

        // 🆕 Track displayed values to prevent duplicates (Elementor sends both ID and title)
        const displayedValues = new Set();

        // Build table rows for known fields with icons
        const rows = [];
        if (name) {
            rows.push(`👤 İsim | ${name}`);
            displayedValues.add(name);
        }
        if (email) {
            rows.push(`📧 E-posta | ${email}`);
            displayedValues.add(email);
        }
        if (phone) {
            rows.push(`📞 Telefon | ${phone}`);
            displayedValues.add(phone);
        }
        if (company) {
            rows.push(`🏢 Şirket | ${company}`);
            displayedValues.add(company);
        }
        if (age) {
            rows.push(`🎂 Yaş | ${age}`);
            displayedValues.add(age);
        }
        if (product) {
            rows.push(`🛍️ Ürün/Hizmet | ${product}`);
            displayedValues.add(product);
        }
        if (subject) {
            rows.push(`📋 Konu | ${subject}`);
            displayedValues.add(subject);
        }
        if (message) {
            rows.push(`💬 Mesaj | ${message}`);
            displayedValues.add(message);
        }

        // 🆕 DYNAMIC: Add ALL unmapped/unknown fields automatically
        // This ensures any form field (regardless of name) is captured
        const unmappedFields = autoMapped.unmapped || {};
        const unmappedRows = [];

        // 🆕 Get title mapping from Elementor data if available
        const titleMap = normalizedData._fieldTitleMap || {};

        for (const [fieldName, fieldValue] of Object.entries(unmappedFields)) {
            // Skip internal fields (starting with _) and empty values
            if (fieldName.startsWith('_') || !fieldValue) continue;

            // Skip if it's an object (like _elementor_original)
            if (typeof fieldValue === 'object') continue;

            // 🆕 Skip if this value was already displayed (prevents Elementor duplicates)
            if (displayedValues.has(fieldValue)) {
                console.log(`⏭️ Skipping duplicate value: ${fieldValue}`);
                continue;
            }

            // 🆕 First check if we have a title from Elementor
            if (titleMap[fieldName]) {
                // Use the actual form label from Elementor
                unmappedRows.push(`📝 ${titleMap[fieldName]} | ${fieldValue}`);
                displayedValues.add(fieldValue);
            } else {
                // Fall back to smart field name detection (analyzes value content)
                const { name: readableName, icon } = smartFieldMatcher.getReadableFieldName(fieldName, fieldValue);
                unmappedRows.push(`${icon} ${readableName} | ${fieldValue}`);
                displayedValues.add(fieldValue);
            }
        }

        // Add unmapped fields to the message
        if (unmappedRows.length > 0) {
            rows.push(...unmappedRows);
        }

        // Join with line breaks
        messageContent += rows.join('\n');

        await prisma.message.create({
            data: {
                conversationId: conversation.id,
                content: messageContent,
                isFromContact: true,
                messageType: 'TEXT'
            }
        });

        // Emit WebSocket events (workspace-specific)
        try {
            emitToWorkspace(webhook.workspaceId, 'new_form_submission', {
                workspaceId: webhook.workspaceId,
                submission,
                webhook: webhook,
                autoMapping: {
                    confidence: confidence.confidence,
                    score: confidence.score
                }
            });

            emitToWorkspace(webhook.workspaceId, 'new_conversation', {
                workspaceId: webhook.workspaceId,
                conversationId: conversation.id,
                conversation,
                channel: 'FORM'
            });

            console.log(`✅ Form submission processed: ${submission.id} (confidence: ${confidence.confidence})`);
        } catch (socketError) {
            console.error('❌ Socket emit error:', socketError);
        }

        // 🤖 Trigger NEW_WEBFORM automations (e.g., send WhatsApp template)
        if (contact && contact.phone) {
            try {
                await executeWebFormAutomation(webhook.workspaceId, contact, {
                    name,
                    email,
                    phone,
                    message,
                    formName: webhook.name
                });
                console.log(`🤖 [FormWebhook] Web form automation triggered for contact ${contact.id}`);
            } catch (automationError) {
                console.error('❌ [FormWebhook] Automation trigger error:', automationError);
            }
        } else {
            console.log(`ℹ️ [FormWebhook] Skipping automation - contact has no phone number`);
        }

        // --- FLOW ENGINE TRIGGER ---
        try {
            const { executeFlowsByTrigger } = await import('./flow.controller.js');
            executeFlowsByTrigger(webhook.workspaceId, 'NEW_FORM', {
                contact, conversation,
                formData: { name, email, phone, message, formName: webhook.name }
            });
        } catch (flowErr) {
            console.error('⚠️ [FormWebhook] Flow engine error:', flowErr.message);
        }

        // --- AUTO CALL TRIGGER ---
        if (phone) {
            try {
                const { triggerAutoCall } = await import('./retell.controller.js');
                // IMPORTANT: Pass null — form messages are system-generated, not customer time requests
                triggerAutoCall(webhook.workspaceId, phone, contact?.id, name || 'Form Gönderen', 'FORM', null);
            } catch (autoCallErr) {
                console.error('⚠️ [FormWebhook] AutoCall trigger error:', autoCallErr.message);
            }
        }

        res.json({
            success: true,
            message: 'Form başarıyla gönderildi',
            submissionId: submission.id,
            autoMapping: {
                confidence: confidence.confidence,
                score: confidence.score
            }
        });

    } catch (error) {
        console.error('❌ Form submission error:', error);
        res.status(500).json({ error: 'Form gönderilemedi' });
    }
};

// Get form submissions for a workspace
export const getFormSubmissions = async (req, res) => {
    try {
        const { workspaceId } = req.params;
        const { status, formWebhookId, limit = 50 } = req.query;

        const where = {
            workspaceId,
            ...(status && { status }),
            ...(formWebhookId && { formWebhookId })
        };

        const submissions = await prisma.formSubmission.findMany({
            where,
            include: {
                contact: true,
                formWebhook: true,
                conversation: true
            },
            orderBy: { createdAt: 'desc' },
            take: parseInt(limit)
        });

        res.json({ submissions });
    } catch (error) {
        console.error('Get form submissions error:', error);
        res.status(500).json({ error: 'Form gönderileri alınamadı' });
    }
};

// Update form submission status
export const updateFormSubmissionStatus = async (req, res) => {
    try {
        const { workspaceId, submissionId } = req.params;
        const { status } = req.body;

        const submission = await prisma.formSubmission.update({
            where: {
                id: submissionId,
                workspaceId
            },
            data: { status }
        });

        res.json({ submission });
    } catch (error) {
        console.error('Update submission status error:', error);
        res.status(500).json({ error: 'Durum güncellenemedi' });
    }
};

// Delete form submission
export const deleteFormSubmission = async (req, res) => {
    try {
        const { workspaceId, submissionId } = req.params;

        await prisma.formSubmission.delete({
            where: {
                id: submissionId,
                workspaceId
            }
        });

        res.json({ message: 'Form gönderisi silindi' });
    } catch (error) {
        console.error('Delete submission error:', error);
        res.status(500).json({ error: 'Form gönderisi silinemedi' });
    }
};

// Test endpoint to see incoming form fields
export const testFormWebhook = async (req, res) => {
    try {
        const { urlSlug } = req.params;

        // Return the field names that were sent
        const fields = Object.keys(req.body);

        // Auto-map to show what would be detected
        const autoMapped = smartFieldMatcher.autoMap(req.body);
        const confidence = smartFieldMatcher.getConfidenceScore(req.body);

        res.json({
            success: true,
            message: 'Test başarılı - Otomatik field eşleştirme aktif',
            receivedFields: fields,
            sampleData: req.body,
            autoMapping: {
                detected: autoMapped,
                confidence: confidence.confidence,
                score: Math.round(confidence.score)
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Test başarısız' });
    }
};

