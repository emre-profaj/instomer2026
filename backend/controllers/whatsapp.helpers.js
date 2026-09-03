import axios from 'axios';
import prisma from '../lib/prisma.js';

export async function sendWhatsappTemplate(whatsappPhone, recipientPhone, template) {
    const GRAPH_API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || 'v18.0';
    const cleanPhone = String(recipientPhone).replace(/\D/g, '');
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${whatsappPhone.phoneNumberId}/messages`;
    return axios.post(url, {
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'template',
        template: {
            name: template.name,
            language: { code: template.language || 'tr' }
        }
    }, {
        headers: { Authorization: `Bearer ${whatsappPhone.accessToken}` }
    });
}

export async function sendWhatsappTextMessage(workspaceId, conversation, text) {
    const { sendWhatsAppMessage } = await import('./whatsapp.controller.js');
    const waNumber = await prisma.whatsappPhoneNumber.findFirst({
        where: { workspaceId, isActive: true }
    });
    if (!waNumber || !conversation?.contact?.phone) return;
    return sendWhatsAppMessage(waNumber, conversation.contact.phone, text, conversation.id);
}

export default {
    sendWhatsappTemplate,
    sendWhatsappTextMessage
};
