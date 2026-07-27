/**
 * ═══════════════════════════════════════════════════════════════
 * CONTACT ATTRIBUTION SERVİSİ
 * ═══════════════════════════════════════════════════════════════
 * 
 * Her lead'in nereden geldiğini kaydeder.
 * Tüm adapter'lar ve controller'lar bu servisi çağırır.
 * 
 * Desteklenen kaynaklar:
 *   → Google Ads (gclid, utm_*)
 *   → Meta Ads (fbclid, fb_ad_id, fb_campaign_id)
 *   → WhatsApp Click-to-WA Ads (referral)
 *   → Meta Lead Gen Forms
 *   → Web Form submissions (form_id, hidden fields)
 *   → Landing page & referrer
 * 
 * @module attributionService
 */

import prisma from '../lib/prisma.js';

/**
 * Kaynak bilgisini kaydet
 * 
 * @param {Object} params
 * @param {string} params.contactId
 * @param {string} params.workspaceId
 * @param {string} [params.channel] - WHATSAPP, FACEBOOK, INSTAGRAM, FORM, EMAIL, WEB_WIDGET
 * @param {Object} [params.google] - { gclid, utm_source, utm_medium, utm_campaign, utm_content, utm_term }
 * @param {Object} [params.meta] - { fbclid, fb_ad_id, fb_adset_id, fb_campaign_id, fb_ad_name, fb_campaign_name }
 * @param {Object} [params.whatsapp] - { headline, body, source_id, source_type, ctwa_clid }
 * @param {Object} [params.leadForm] - { form_id, form_name }
 * @param {Object} [params.webForm] - { form_id, form_name, form_webhook_id }
 * @param {Object} [params.page] - { landing_page, referrer, ip_address, user_agent }
 * @param {Object} [params.raw] - Tüm ham veri (JSON olarak kaydedilir)
 */
export async function saveAttribution(params) {
  try {
    const { contactId, workspaceId, channel } = params;
    if (!contactId || !workspaceId) return null;

    // Boş attribution oluşturmayı engelle
    const hasData = [
      params.google, params.meta, params.whatsapp, 
      params.leadForm, params.webForm, params.page
    ].some(obj => obj && Object.values(obj).some(v => v));

    if (!hasData) return null;

    const data = {
      contactId,
      workspaceId,
      channel: channel || undefined,
    };

    // Google
    if (params.google) {
      const g = params.google;
      if (g.gclid) data.gclid = g.gclid;
      if (g.utm_source) data.utm_source = g.utm_source;
      if (g.utm_medium) data.utm_medium = g.utm_medium;
      if (g.utm_campaign) data.utm_campaign = g.utm_campaign;
      if (g.utm_content) data.utm_content = g.utm_content;
      if (g.utm_term) data.utm_term = g.utm_term;
    }

    // Meta
    if (params.meta) {
      const m = params.meta;
      if (m.fbclid) data.fbclid = m.fbclid;
      if (m.fb_ad_id) data.fb_ad_id = m.fb_ad_id;
      if (m.fb_adset_id) data.fb_adset_id = m.fb_adset_id;
      if (m.fb_campaign_id) data.fb_campaign_id = m.fb_campaign_id;
      if (m.fb_ad_name) data.fb_ad_name = m.fb_ad_name;
      if (m.fb_campaign_name) data.fb_campaign_name = m.fb_campaign_name;
    }

    // WhatsApp
    if (params.whatsapp) {
      const w = params.whatsapp;
      if (w.headline) data.wa_referral_headline = w.headline;
      if (w.body) data.wa_referral_body = w.body;
      if (w.source_id) data.wa_referral_source_id = w.source_id;
      if (w.source_type) data.wa_referral_source_type = w.source_type;
      if (w.ctwa_clid) data.wa_ctwa_clid = w.ctwa_clid;
    }

    // Meta Lead Form
    if (params.leadForm) {
      const lf = params.leadForm;
      if (lf.form_id) data.meta_lead_form_id = lf.form_id;
      if (lf.form_name) data.meta_lead_form_name = lf.form_name;
    }

    // Web Form
    if (params.webForm) {
      const wf = params.webForm;
      if (wf.form_id) data.form_id = wf.form_id;
      if (wf.form_name) data.form_name = wf.form_name;
      if (wf.form_webhook_id) data.form_webhook_id = wf.form_webhook_id;
    }

    // Page info
    if (params.page) {
      const p = params.page;
      if (p.landing_page) data.landing_page = p.landing_page;
      if (p.referrer) data.referrer = p.referrer;
      if (p.ip_address) data.ip_address = p.ip_address;
      if (p.user_agent) data.user_agent = p.user_agent;
    }

    // Raw data
    if (params.raw) {
      data.raw_data = JSON.stringify(params.raw);
    }

    const attribution = await prisma.contactAttribution.create({ data });
    console.log(`📊 [Attribution] Saved for contact ${contactId}: channel=${channel}`);
    return attribution;

  } catch (error) {
    console.error('[Attribution] Save error:', error.message);
    return null;
  }
}

/**
 * WhatsApp referral verisinden attribution kaydet
 */
export async function saveWhatsAppAttribution(contactId, workspaceId, referral) {
  if (!referral) return null;

  return saveAttribution({
    contactId,
    workspaceId,
    channel: 'WHATSAPP',
    whatsapp: {
      headline: referral.headline || referral.body,
      body: referral.body,
      source_id: referral.source_id || referral.ad_id,
      source_type: referral.source_type,
      ctwa_clid: referral.ctwa_clid,
    },
    raw: referral,
  });
}

/**
 * Facebook/Instagram referral verisinden attribution kaydet
 */
export async function saveFacebookAttribution(contactId, workspaceId, referral, isInstagram = false) {
  if (!referral) return null;

  return saveAttribution({
    contactId,
    workspaceId,
    channel: isInstagram ? 'INSTAGRAM' : 'FACEBOOK',
    meta: {
      fb_ad_id: referral.ad_id,
      fb_campaign_id: referral.campaign_id,
      fb_ad_name: referral.headline || referral.body,
    },
    raw: referral,
  });
}

/**
 * Form gönderiminden UTM/GCLID çıkar ve attribution kaydet
 * 
 * @param {string} contactId
 * @param {string} workspaceId
 * @param {Object} formData - Ham form verisi
 * @param {Object} formWebhook - FormWebhook kaydı
 * @param {Object} [requestInfo] - { ip, userAgent, referer, originalUrl }
 */
export async function saveFormAttribution(contactId, workspaceId, formData, formWebhook, requestInfo = {}) {
  // UTM ve GCLID'yi form verisi + URL'den çıkar
  const utmFields = extractUtmFields(formData);

  return saveAttribution({
    contactId,
    workspaceId,
    channel: 'FORM',
    google: {
      gclid: utmFields.gclid,
      utm_source: utmFields.utm_source,
      utm_medium: utmFields.utm_medium,
      utm_campaign: utmFields.utm_campaign,
      utm_content: utmFields.utm_content,
      utm_term: utmFields.utm_term,
    },
    meta: {
      fbclid: utmFields.fbclid,
    },
    webForm: {
      form_id: formData._form_id || formData.form_id || formData.formId,
      form_name: formWebhook?.name || formData._form_name,
      form_webhook_id: formWebhook?.id,
    },
    page: {
      landing_page: formData._landing_page || formData.landing_page || formData.page_url || requestInfo.originalUrl,
      referrer: formData._referrer || formData.referrer || requestInfo.referer,
      ip_address: requestInfo.ip,
      user_agent: requestInfo.userAgent,
    },
    raw: formData,
  });
}

/**
 * Meta Lead Gen form'dan attribution kaydet
 */
export async function saveLeadFormAttribution(contactId, workspaceId, leadData, formId, formName) {
  return saveAttribution({
    contactId,
    workspaceId,
    channel: 'FACEBOOK',
    leadForm: {
      form_id: formId,
      form_name: formName,
    },
    meta: {
      fb_ad_id: leadData.ad_id,
      fb_campaign_id: leadData.campaign_id,
      fb_campaign_name: leadData.campaign_name,
    },
    raw: leadData,
  });
}

/**
 * Bir kişinin tüm kaynak bilgilerini getir
 */
export async function getContactAttributions(contactId) {
  return prisma.contactAttribution.findMany({
    where: { contactId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Form verisinden UTM ve GCLID alanlarını çıkar
 * Hidden field'lar, URL parametreleri, veya düz alanlar olabilir
 */
function extractUtmFields(formData) {
  const result = {};

  // Tüm olası alan adları
  const fieldMap = {
    gclid: ['gclid', '_gclid', 'google_click_id'],
    fbclid: ['fbclid', '_fbclid', 'facebook_click_id'],
    utm_source: ['utm_source', '_utm_source', 'source'],
    utm_medium: ['utm_medium', '_utm_medium', 'medium'],
    utm_campaign: ['utm_campaign', '_utm_campaign', 'campaign'],
    utm_content: ['utm_content', '_utm_content'],
    utm_term: ['utm_term', '_utm_term', 'keyword'],
  };

  for (const [key, aliases] of Object.entries(fieldMap)) {
    for (const alias of aliases) {
      const value = formData[alias] || formData[alias.toUpperCase()];
      if (value && typeof value === 'string' && value.trim()) {
        result[key] = value.trim();
        break;
      }
    }
  }

  // URL parametrelerinden çıkar (form_url veya page_url alanı varsa)
  const pageUrl = formData._page_url || formData.page_url || formData.pageUrl || '';
  if (pageUrl && pageUrl.includes('?')) {
    try {
      const url = new URL(pageUrl);
      for (const [key, aliases] of Object.entries(fieldMap)) {
        if (!result[key]) {
          const param = url.searchParams.get(key) || url.searchParams.get(`_${key}`);
          if (param) result[key] = param;
        }
      }
    } catch { /* geçersiz URL */ }
  }

  return result;
}
