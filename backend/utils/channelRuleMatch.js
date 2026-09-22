/**
 * ═══════════════════════════════════════════════════════════════
 * KANAL KURALI EŞLEŞTİRME — TEK YER
 * ═══════════════════════════════════════════════════════════════
 *
 * "Kanallar & Sınıflandırıcı" ekranı kuralları HESAP KİMLİĞİYLE yazıyor:
 *
 *   wa-<whatsappPhoneNumber.id>   fb-msg-<facebookPage.id>
 *   ig-<page.id>                  widget-<webWidget.id>
 *   form-<formWebhook.id>         fb-form-<metaFormId>
 *   fb-comment-<page.id>          ig-comment-<page.id>
 *
 * İki ayrı yerde bu değerler kanal TÜRÜYLE ('WHATSAPP', 'WIDGET')
 * karşılaştırılıyordu; hiçbir zaman tutmuyordu. Sonuç: kullanıcının
 * "Satış Akışı > Yeni Fırsat" ayarı sohbet kanallarında hiç işlemiyor,
 * konuşma varsayılan "Genel" akışına düşüyordu.
 *
 * Önce KİMLİK eşleşmesi denenir (bir işletmede birden fazla numara veya
 * sayfa olabilir). Konuşma o tür için kimlik taşımıyorsa — widget ve form
 * kayıtlarında kimlik tutulmuyor — kuralın ön eki kanal türüyle
 * eşleşiyorsa kabul edilir.
 */

const KANAL_ONEK_TURU = {
    'wa-': ['WHATSAPP'],
    'fb-msg-': ['FACEBOOK'],
    'fb-comment-': ['FACEBOOK_COMMENT'],
    'ig-comment-': ['INSTAGRAM_COMMENT'],
    'ig-': ['INSTAGRAM'],
    'fb-form-': ['LEAD'],
    'widget-': ['WIDGET', 'WEB_WIDGET'],
    'form-': ['FORM', 'WEB_FORM'],
    'email-': ['EMAIL']
};

/** Konuşmanın taşıdığı kanal kimlikleri (kanal türüne göre üretilir). */
export function conversationChannelIds(conversation) {
    const ids = new Set();
    if (!conversation) return ids;
    const tur = String(conversation.channel || '').toUpperCase();
    const sayfa = conversation.facebookPageId;

    if (conversation.whatsappPhoneNumberId) ids.add(`wa-${conversation.whatsappPhoneNumberId}`);
    if (conversation.emailChannelId) ids.add(`email-${conversation.emailChannelId}`);
    if (conversation.formWebhookId) ids.add(`form-${conversation.formWebhookId}`);
    if (conversation.webWidgetId) ids.add(`widget-${conversation.webWidgetId}`);
    if (conversation.leadFormId) ids.add(`fb-form-${conversation.leadFormId}`);

    // Sayfa kimliği hem mesaj hem yorum kanalında kullanılıyor; türe göre
    // ayrılmazsa aynı sayfanın yorum kuralı normal mesaja da uyuyor.
    if (tur === 'FACEBOOK' && sayfa) {
        ids.add(`fb-msg-${sayfa}`);
        ids.add(`fb-${sayfa}`);
    } else if (tur === 'FACEBOOK_COMMENT' && sayfa) {
        ids.add(`fb-comment-${sayfa}`);
    } else if (tur === 'INSTAGRAM') {
        if (sayfa) ids.add(`ig-${sayfa}`);
        if (conversation.instagramBusinessId) ids.add(`ig-${conversation.instagramBusinessId}`);
    } else if (tur === 'INSTAGRAM_COMMENT' && sayfa) {
        ids.add(`ig-comment-${sayfa}`);
    }
    return ids;
}

/** Kural bu konuşmaya uyuyor mu? */
export function channelRuleMatches(ruleChannels, conversation, channelType) {
    if (!Array.isArray(ruleChannels) || ruleChannels.length === 0) return false;
    const tur = String(conversation?.channel || channelType || '').toUpperCase();
    const ids = conversationChannelIds({ ...(conversation || {}), channel: tur });
    const onekler = Object.keys(KANAL_ONEK_TURU).sort((a, b) => b.length - a.length);

    for (const ham of ruleChannels) {
        const ch = String(ham || '');
        if (!ch) continue;

        // 1) Tür adı doğrudan yazılmışsa (eski kurallar)
        if (ch.toUpperCase() === tur) return true;

        // 2) Kimlik eşleşmesi
        if (ids.has(ch)) return true;

        // 3) Kimlik tutulmayan kanallarda ön ek + tür eşleşmesi
        const onek = onekler.find(o => ch.startsWith(o));
        if (onek && KANAL_ONEK_TURU[onek].includes(tur)) {
            const kimlikVar = [...ids].some(i => i.startsWith(onek));
            if (!kimlikVar) return true;   // daha iyi eşleşme mümkün değil
        }
    }
    return false;
}

export default { conversationChannelIds, channelRuleMatches };
