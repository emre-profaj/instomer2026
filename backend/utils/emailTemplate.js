/**
 * ═══════════════════════════════════════════════════════════════
 * BİLDİRİM E-POSTASI ŞABLONU
 * ═══════════════════════════════════════════════════════════════
 *
 * Neden tablo ve satır içi stil:
 *   Gmail, Outlook ve mobil istemciler <style> bloklarını, flex ve
 *   grid'i güvenilir biçimde uygulamıyor. E-postada çalışan tek düzen
 *   hâlâ iç içe tablo + inline style. Bu yüzden burası projenin geri
 *   kalanına benzemiyor; bilerek öyle.
 *
 * Tek bir yerden üretiliyor ki bildirim ve lead mailleri aynı görünsün.
 */

const RENK = {
    zemin: '#f1f3f6',
    kart: '#ffffff',
    cizgi: '#e6e9ee',
    koyu: '#111827',
    metin: '#334155',
    soluk: '#6b7480',
    vurgu: '#dc2626'
};

const KACIS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Başlık ve satırlara dışarıdan gelen metin giriyor; HTML olarak yorumlanmasın. */
export function kacir(deger) {
    if (deger === null || deger === undefined) return '';
    return String(deger).replace(/[&<>"']/g, k => KACIS[k]);
}

/** Emoji ve süs karakterlerini başlıktan ayıklar (konu satırı zaten dar). */
function baslikTemizle(metin) {
    return String(metin || '')
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * @param {Object} p
 * @param {string} p.baslik      Ana başlık
 * @param {string} [p.ozet]      Başlığın altındaki açıklama cümlesi
 * @param {Array}  [p.satirlar]  [{ etiket, deger, link }] — künye tablosu
 * @param {string} [p.butonMetni]
 * @param {string} [p.butonUrl]
 * @param {string} [p.altNot]    Footer'daki açıklama
 */
export function bildirimMaili({ baslik, ozet, satirlar = [], butonMetni, butonUrl, altNot } = {}) {
    const temizBaslik = baslikTemizle(baslik) || 'Instomer bildirimi';
    const onizleme = kacir(baslikTemizle(ozet) || temizBaslik).slice(0, 120);

    const satirHtml = (satirlar || [])
        .filter(s => s && s.deger)
        .map(s => {
            const deger = s.link
                ? `<a href="${kacir(s.link)}" style="color:${RENK.koyu};text-decoration:none;">${kacir(s.deger)}</a>`
                : kacir(s.deger);
            return `<tr>
                <td style="padding:9px 0;border-bottom:1px solid ${RENK.cizgi};font-size:13px;color:${RENK.soluk};width:38%;vertical-align:top;">${kacir(s.etiket)}</td>
                <td style="padding:9px 0;border-bottom:1px solid ${RENK.cizgi};font-size:14px;color:${RENK.koyu};font-weight:600;">${deger}</td>
            </tr>`;
        })
        .join('');

    // Buton kendi <tr><td> hücresinde durmalı: doğrudan <table> altına
    // konan bir <table> tarayıcıda dışarı taşınıyor ve buton kartın
    // dışında kalıyordu.
    const butonHtml = (butonMetni && butonUrl)
        ? `<tr><td style="padding:20px 28px 0;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
             <a href="${kacir(butonUrl)}" style="display:inline-block;background:${RENK.koyu};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:13px 26px;border-radius:9px;">${kacir(butonMetni)}</a>
           </td></tr>`
        : '';

    return `<!doctype html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${RENK.zemin};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${onizleme}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${RENK.zemin};padding:28px 14px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:${RENK.kart};border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.08);">

      <tr><td style="background:${RENK.koyu};padding:18px 28px;">
        <span style="color:#ffffff;font-size:16px;font-weight:700;letter-spacing:-.2px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">Instomer</span>
        <span style="color:#94a3b8;font-size:12px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;"> &nbsp;·&nbsp; Bildirim</span>
      </td></tr>

      <tr><td style="padding:28px 28px 8px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
        <h1 style="margin:0;font-size:20px;line-height:1.35;color:${RENK.koyu};font-weight:700;">${kacir(temizBaslik)}</h1>
        ${ozet ? `<p style="margin:10px 0 0;font-size:14.5px;line-height:1.6;color:${RENK.metin};">${kacir(ozet)}</p>` : ''}
      </td></tr>

      ${satirHtml ? `<tr><td style="padding:14px 28px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">${satirHtml}</table>
      </td></tr>` : ''}

      ${butonHtml}

      <tr><td style="padding:24px 28px 26px;">
        <div style="border-top:1px solid ${RENK.cizgi};padding-top:14px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;line-height:1.6;color:${RENK.soluk};">
          ${kacir(altNot || 'Bu bildirimi Instomer panelinde Ayarlar → Bildirim Ayarları menüsünden yönetebilirsiniz.')}
        </div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export default { bildirimMaili, kacir };
