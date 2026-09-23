import { sourceLabel, sourceIcon, formatAttribution } from '../../utils/leadSource';

// ─── Kanal etiketleri (yazışma kanalı) ────────────────────────────
const CHANNEL_LABELS = {
    WHATSAPP: { label: 'WhatsApp', icon: '💬' },
    FACEBOOK: { label: 'Facebook', icon: '💬' },
    INSTAGRAM: { label: 'Instagram', icon: '📸' },
    EMAIL: { label: 'E-posta', icon: '📧' },
    PHONE: { label: 'Telefon', icon: '📞' },
    FORM: { label: 'Web Formu', icon: '📝' },
    WEB_FORM: { label: 'Web Formu', icon: '📝' },
    WEB_WIDGET: { label: 'Web Sohbeti', icon: '🌐' },
    WIDGET: { label: 'Web Sohbeti', icon: '🌐' },
    AI_CALL: { label: 'AI Arama', icon: '🤖' },
    SMS: { label: 'SMS', icon: '✉️' },
    WALK_IN: { label: 'Yüz Yüze', icon: '🚶' },
    LEAD: { label: 'Lead Form', icon: '📋' },
    FACEBOOK_LEAD: { label: 'Lead Form', icon: '📋' }
};

function channelLabel(code) {
    if (!code) return '';
    return CHANNEL_LABELS[String(code).toUpperCase()]?.label || code;
}
function channelIcon(code) {
    if (!code) return '📋';
    return CHANNEL_LABELS[String(code).toUpperCase()]?.icon || '📋';
}

/**
 * Satışın kaynağını ve geliş kanalını SADECE GÖSTEREN bileşen (read-only).
 *
 * İki ayrı kavram gösterilir:
 *   1. GELİŞ KANALI (case.channel): WhatsApp, Telefon, Form...
 *   2. KAYNAK (case.leadSource): Meta reklam, Google Ads, Referans...
 *
 * Kaynak bilgisi Case'den veya kişiden otomatik devralınır,
 * kullanıcı tarafından değiştirilemez.
 *
 * @param {object}  deal  - En az { channel, sourceNote, case, contact }
 */
export default function DealSourceSelect({ deal }) {
    const dealChannel = deal?.channel;
    const caseData = deal?.case;
    const attrText = formatAttribution(caseData?.attributions?.[0]);

    // Case'den gelen kanal ve kaynak bilgisi
    const caseChannel = caseData?.channel;
    const caseSource = caseData?.leadSource;
    const contactSource = deal?.contact?.leadSource || deal?.contact?.source;

    const displayChannel = caseChannel || dealChannel;
    const displaySource = caseSource || dealChannel; // dealChannel fallback (eski veri uyumu)

    // Hiçbir bilgi yoksa
    if (!displayChannel && !displaySource && !contactSource) {
        return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#94a3b8', fontSize: '0.85rem' }}>
                <span style={{ fontSize: '1rem', opacity: 0.35 }}>📋</span>
                <span>Kaynak bilgisi yok</span>
            </span>
        );
    }

    return (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* Geliş Kanalı */}
            {displayChannel && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', minWidth: 42 }}>Kanal:</span>
                    <span style={{ fontSize: '1rem' }}>{channelIcon(displayChannel)}</span>
                    <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>
                        {channelLabel(displayChannel)}
                    </span>
                    {caseChannel && (
                        <span style={{
                            fontSize: '0.68rem', color: '#94a3b8', background: '#f1f5f9',
                            padding: '1px 5px', borderRadius: 3
                        }}>Case'den</span>
                    )}
                </span>
            )}
            {/* Kaynak (nereden duydu) */}
            {displaySource && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', minWidth: 42 }}>Kaynak:</span>
                    <span style={{ fontSize: '1rem' }}>{sourceIcon(displaySource)}</span>
                    <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>
                        {sourceLabel(displaySource)}
                    </span>
                    {caseSource && (
                        <span style={{
                            fontSize: '0.68rem', color: '#94a3b8', background: '#f1f5f9',
                            padding: '1px 5px', borderRadius: 3
                        }}>Case'den</span>
                    )}
                    {/* Attribution detayı (kampanya/reklam adı) */}
                    {attrText && (
                        <span
                            style={{
                                fontSize: '0.7rem', color: '#64748b',
                                maxWidth: 200, overflow: 'hidden',
                                textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                            }}
                            title={attrText}
                        >
                            • {attrText}
                        </span>
                    )}
                </span>
            )}
            {/* Kaynak notu */}
            {deal?.sourceNote && (
                <span style={{ fontSize: '0.75rem', color: '#64748b', paddingLeft: 48 }}>
                    {deal.sourceNote}
                </span>
            )}
        </span>
    );
}
