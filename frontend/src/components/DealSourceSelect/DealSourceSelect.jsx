import { sourceLabel, sourceIcon, formatAttribution } from '../../utils/leadSource';

/**
 * Satışın kaynağını SADECE GÖSTEREN bileşen (read-only).
 *
 * Kaynak bilgisi Case'den veya kişiden otomatik devralınır,
 * kullanıcı tarafından değiştirilemez.
 *
 * @param {object}  deal  - En az { channel, sourceNote, case }
 */
export default function DealSourceSelect({ deal }) {
    const channel = deal?.channel;
    const caseData = deal?.case;
    const attrText = formatAttribution(caseData?.attributions?.[0]);

    // Kaynak bilgisi yoksa
    if (!channel && !caseData?.leadSource) {
        return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#94a3b8', fontSize: '0.85rem' }}>
                <span style={{ fontSize: '1rem', opacity: 0.35 }}>📋</span>
                <span>Kaynak bilgisi yok</span>
            </span>
        );
    }

    const displaySource = caseData?.leadSource || channel;
    const isFromCase = !!caseData?.leadSource;
    const isFromContact = !isFromCase && !!channel;

    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1rem' }}>{sourceIcon(displaySource)}</span>
            <span style={{ fontWeight: 500, fontSize: '0.88rem' }}>
                {sourceLabel(displaySource)}
            </span>
            {/* Devralma bilgisi */}
            <span style={{
                fontSize: '0.72rem',
                color: '#94a3b8',
                background: '#f1f5f9',
                padding: '1px 6px',
                borderRadius: 4,
                whiteSpace: 'nowrap'
            }}>
                {isFromCase ? `Case'den` : isFromContact ? 'Kişiden' : ''}
            </span>
            {/* Attribution detayı */}
            {attrText && (
                <span
                    style={{
                        fontSize: '0.72rem',
                        color: '#64748b',
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                    }}
                    title={attrText}
                >
                    {attrText}
                </span>
            )}
        </span>
    );
}
