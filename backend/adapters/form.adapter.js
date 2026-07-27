/**
 * ═══════════════════════════════════════════════════════════════
 * FORM WEBHOOK ADAPTER
 * ═══════════════════════════════════════════════════════════════
 * 
 * Web formlarından (Elementor, WordPress, Typeform, Webflow)
 * gelen verileri normalize eder.
 * 
 * Form'a özel: field mapping, markdown tablo formatı,
 * email/phone ile kişi tanıma.
 * 
 * @module formAdapter
 */

import prisma from '../lib/prisma.js';

const getAvatarFallback = (name, size = 150) => {
  const encodedName = encodeURIComponent(name || 'User');
  return `https://ui-avatars.com/api/?name=${encodedName}&background=10B981&color=fff&size=${size}`;
};

/**
 * Form gönderimini normalize eder.
 * 
 * @param {Object} mappedFields - smartFieldMatcher ile eşleştirilmiş alanlar
 * @param {Object} rawFields - Ham form alanları
 * @param {Object} formWebhook - FormWebhook kayıt objesi (DB'den)
 * @returns {{ normalized: Object|null, error: string|null }}
 */
export function normalizeFormSubmission(mappedFields, rawFields, formWebhook) {
  try {
    const { name, email, phone, company, message, subject, product, age } = mappedFields;

    // En az bir tanımlayıcı alanı olmalı
    if (!email && !phone && !name) {
      return { normalized: null, error: 'NO_IDENTIFIABLE_FIELDS' };
    }

    const senderName = name || email || phone || 'Form Gönderimi';

    // Mesaj metni: form alanlarını markdown tablo formatında
    let messageText = `📝 **Yeni Form Gönderimi**\n`;
    if (formWebhook.name) messageText += `📋 Form: ${formWebhook.name}\n`;
    messageText += `---\n`;
    if (name) messageText += `👤 İsim: ${name}\n`;
    if (email) messageText += `📧 Email: ${email}\n`;
    if (phone) messageText += `📞 Telefon: ${phone}\n`;
    if (company) messageText += `🏢 Şirket: ${company}\n`;
    if (product) messageText += `📦 Ürün: ${product}\n`;
    if (age) messageText += `🎂 Yaş: ${age}\n`;
    if (subject) messageText += `📌 Konu: ${subject}\n`;
    if (message) messageText += `💬 Mesaj: ${message}\n`;

    // Eşleştirilmemiş alanları da ekle
    const mappedKeys = new Set(Object.keys(mappedFields));
    for (const [key, value] of Object.entries(rawFields)) {
      if (!mappedKeys.has(key) && value) {
        messageText += `📎 ${key}: ${value}\n`;
      }
    }

    const normalized = {
      workspaceId: formWebhook.workspaceId,
      channelType: 'FORM',
      senderId: email || phone || `form_${Date.now()}`,
      senderName,
      senderPhone: phone || undefined,
      senderEmail: email || undefined,
      senderAvatar: getAvatarFallback(senderName),
      messageText,
      messageType: 'FORM',
      externalMessageId: null,
      contactSource: 'FORM',
      flowTrigger: 'NEW_FORM',
      isFormSubmission: true,
      metadata: {
        formId: formWebhook.id,
        formName: formWebhook.name,
        mappedFields,
        rawFields,
        product,
        company,
      },
      channelRef: {},

      // Kişi bulma: email veya telefon ile
      findContact: async (workspaceId, sid) => {
        if (email) {
          const byEmail = await prisma.contact.findFirst({
            where: { workspaceId, email, isDeleted: false }
          });
          if (byEmail) return byEmail;
        }
        if (phone) {
          const byPhone = await prisma.contact.findFirst({
            where: { workspaceId, phone, isDeleted: false }
          });
          if (byPhone) return byPhone;
        }
        return null;
      },

      // Kişi oluşturma
      createContactData: async (workspaceId, sid, cName, avatar) => {
        return {
          workspaceId,
          name: cName || senderName,
          email: email || undefined,
          phone: phone || undefined,
          company: company || undefined,
          avatar: avatar || getAvatarFallback(cName || senderName),
          tags: '["form"]',
          status: phone ? 'OPPORTUNITY' : 'NEW',
          source: 'FORM',
        };
      },
    };

    return { normalized, error: null };

  } catch (error) {
    console.error('[FormAdapter] Error:', error);
    return { normalized: null, error: error.message };
  }
}
