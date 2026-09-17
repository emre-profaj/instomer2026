import { useState } from 'react';
import { dealAPI } from '../../services/api';
import { PICKABLE_SOURCES, sourceLabel, sourceIcon, isAutoSource } from '../../utils/leadSource';

/**
 * Satışın kaynağını gösteren ve değiştiren seçim kutusu.
 *
 * Teklif → Sipariş → Fatura tek bir kayıttır (stage değişir), bu yüzden
 * kaynak bir kez seçilir ve üç ekranda da aynı değer görünür.
 *
 * Değer `deal.channel` alanında tutulur. Sohbetten gelen siparişlerde bu
 * alan otomatik dolabilir (WHATSAPP, WIDGET...). O kodlar listede seçilebilir
 * değildir ama kayıtta duruyorsa listeye eklenir — yoksa kutu boş görünür ve
 * ilk dokunuşta otomatik gelen bilgi silinir.
 *
 * @param {string}   workspaceId
 * @param {object}   deal         - En az { id, channel }
 * @param {function} onChange     - Kaydedildikten SONRA yeni kod ile çağrılır
 */
export default function DealSourceSelect({ workspaceId, deal, onChange }) {
    const [saving, setSaving] = useState(false);
    const [failed, setFailed] = useState(false);

    const value = deal?.channel || '';
    const showAutoOption = value && isAutoSource(value);

    const handleChange = async (e) => {
        const next = e.target.value;
        if (next === value) return;
        setSaving(true);
        setFailed(false);
        try {
            await dealAPI.update(workspaceId, deal.id, { channel: next || null });
            onChange?.(next || null);
        } catch (error) {
            // Kaydedilemediyse kutu eski değerinde kalır — üst bileşenin
            // durumu yalnızca başarılı yanıtta güncelleniyor.
            console.error('Kaynak güncellenemedi:', error);
            setFailed(true);
        } finally {
            setSaving(false);
        }
    };

    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {failed && (
                <span style={{ fontSize: 11, color: '#dc2626' }} title="Tekrar deneyin">
                    kaydedilemedi
                </span>
            )}
            <span style={{ fontSize: '1rem', opacity: value ? 1 : 0.35 }}>
                {sourceIcon(value)}
            </span>
            <select
                className="status-select"
                value={value}
                disabled={saving}
                onChange={handleChange}
                title="Bu satış nereden geldi?"
            >
                <option value="">Seçilmedi</option>
                {showAutoOption && (
                    <option value={value}>{sourceLabel(value)} (otomatik)</option>
                )}
                {PICKABLE_SOURCES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                ))}
            </select>
        </span>
    );
}
