import './ApiIntegrationSettings.css';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Plus, Trash2, Edit2, X, Check, MapPin, FileText,
    Video, MessageSquare, Zap, ChevronDown, ChevronUp, Copy
} from 'lucide-react';

const API_BASE = '/api';

const MESSAGE_TYPES = [
    { value: 'LOCATION',  label: '📍 Konum',              icon: MapPin },
    { value: 'TEXT',      label: '💬 Metin',               icon: MessageSquare },
    { value: 'DOCUMENT',  label: '📄 Doküman / Katalog',  icon: FileText },
    { value: 'VIDEO',     label: '🎬 Video',               icon: Video },
    { value: 'IMAGE',     label: '🖼️ Görsel',             icon: FileText },
    { value: 'TEMPLATE',  label: '📋 WA Şablonu',         icon: Zap },
];

const TYPE_COLOR = {
    LOCATION: '#8b5cf6',
    TEXT:     '#3b82f6',
    DOCUMENT: '#f59e0b',
    VIDEO:    '#ef4444',
    IMAGE:    '#10b981',
    TEMPLATE: '#6366f1',
};

const EMPTY_FORM = {
    name: '',
    actionKey: '',
    description: '',
    messageType: 'LOCATION',
    textContent: '',
    locationLat: '',
    locationLng: '',
    locationName: '',
    locationAddress: '',
    mediaUrl: '',
    mediaCaption: '',
    mediaFilename: '',
    templateName: '',
    isActive: true,
    sortOrder: 0,
};

export default function RetellActionsSettings({ workspaceId }) {
    const [actions, setActions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [expanded, setExpanded] = useState(true);
    const [copied, setCopied] = useState(false);

    const actionEndpoint = `https://app.instomer.com/api/retell/action/${workspaceId}`;

    useEffect(() => {
        if (workspaceId) fetchActions();
    }, [workspaceId]);

    const fetchActions = async () => {
        try {
            setLoading(true);
            const res = await axios.get(`${API_BASE}/retell/${workspaceId}/actions`);
            setActions(res.data.actions || []);
        } catch (e) {
            console.error('Fetch actions error:', e);
        } finally {
            setLoading(false);
        }
    };

    const openCreate = () => {
        setEditingId(null);
        setForm({ ...EMPTY_FORM });
        setShowModal(true);
    };

    const openEdit = (action) => {
        setEditingId(action.id);
        setForm({
            name: action.name || '',
            actionKey: action.actionKey || '',
            description: action.description || '',
            messageType: action.messageType || 'LOCATION',
            textContent: action.textContent || '',
            locationLat: action.locationLat ?? '',
            locationLng: action.locationLng ?? '',
            locationName: action.locationName || '',
            locationAddress: action.locationAddress || '',
            mediaUrl: action.mediaUrl || '',
            mediaCaption: action.mediaCaption || '',
            mediaFilename: action.mediaFilename || '',
            templateName: action.templateName || '',
            isActive: action.isActive !== false,
            sortOrder: action.sortOrder || 0,
        });
        setShowModal(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!form.name.trim() || !form.actionKey.trim()) return;
        setSaving(true);
        try {
            if (editingId) {
                await axios.put(`${API_BASE}/retell/${workspaceId}/actions/${editingId}`, form);
            } else {
                await axios.post(`${API_BASE}/retell/${workspaceId}/actions`, form);
            }
            setShowModal(false);
            fetchActions();
        } catch (e) {
            alert(e.response?.data?.error || 'Kayıt sırasında hata oluştu.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Bu aksiyonu silmek istediğinizden emin misiniz?')) return;
        try {
            await axios.delete(`${API_BASE}/retell/${workspaceId}/actions/${id}`);
            fetchActions();
        } catch (e) {
            alert('Silme sırasında hata oluştu.');
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(actionEndpoint);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const autoKey = (name) => {
        if (!form.actionKey || form.actionKey === '') {
            setField('actionKey', name.toLowerCase()
                .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
                .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
                .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
        }
    };

    const typeInfo = (val) => MESSAGE_TYPES.find(t => t.value === val) || MESSAGE_TYPES[0];

    return (
        <div className="retell-actions-wrap">

            {/* ── Endpoint Bilgisi ── */}
            <div className="retell-endpoint-card">
                <div className="retell-endpoint-label">
                    <Zap size={14} />
                    Retell'de tanımlayacağınız Function URL:
                </div>
                <div className="retell-endpoint-url">
                    <code>{actionEndpoint}</code>
                    <button className="copy-btn" onClick={handleCopy}>
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                        {copied ? 'Kopyalandı' : 'Kopyala'}
                    </button>
                </div>
                <p className="retell-endpoint-hint">
                    Retell Dashboard → Agent → Tools → "send_to_customer" fonksiyonu ekleyin.
                    <code style={{ marginLeft: 6 }}>action</code> parametresi aşağıdaki "Aksiyon Key" değerlerinden biri olacak.
                </p>
            </div>

            {/* ── Aksiyon Listesi ── */}
            <div className="tool-section-block" style={{ marginTop: 16 }}>
                <div
                    className="tool-section-header"
                    onClick={() => setExpanded(v => !v)}
                    style={{ cursor: 'pointer' }}
                >
                    <div className="section-title-group">
                        <Zap size={18} style={{ color: '#8b5cf6' }} />
                        <span>Otomatik WhatsApp Gönderimleri</span>
                        <span className="badge-pill badge-purple">{actions.filter(a => a.isActive).length} Aktif</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button
                            className="btn-modern btn-primary"
                            onClick={(e) => { e.stopPropagation(); openCreate(); }}
                            style={{ padding: '4px 10px', fontSize: 12 }}
                        >
                            <Plus size={13} /> Yeni Aksiyon
                        </button>
                        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                </div>

                {expanded && (
                    <div className="tool-section-body">
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: 24, color: '#9ca3af' }}>Yükleniyor...</div>
                        ) : actions.length === 0 ? (
                            <div className="empty-state-small">
                                <Zap size={28} style={{ color: '#d1d5db', marginBottom: 8 }} />
                                <p>Henüz aksiyon tanımlanmadı.</p>
                                <small>Retell agent arama sırasında konum, katalog, video vb. gönderebilsin diye aksiyonlar ekleyin.</small>
                            </div>
                        ) : (
                            <div className="retell-actions-list">
                                {actions.map(action => {
                                    const ti = typeInfo(action.messageType);
                                    return (
                                        <div
                                            key={action.id}
                                            className={`retell-action-card ${!action.isActive ? 'inactive' : ''}`}
                                            style={{ '--type-color': TYPE_COLOR[action.messageType] || '#6b7280' }}
                                        >
                                            <div className="action-type-badge" style={{ background: TYPE_COLOR[action.messageType] + '18', color: TYPE_COLOR[action.messageType] }}>
                                                {ti.label}
                                            </div>
                                            <div className="action-main">
                                                <div className="action-name">
                                                    {action.name}
                                                    {!action.isActive && <span className="inactive-tag">Pasif</span>}
                                                </div>
                                                <code className="action-key-tag">{action.actionKey}</code>
                                                {action.description && (
                                                    <p className="action-desc">{action.description}</p>
                                                )}
                                                {/* Preview based on type */}
                                                {action.messageType === 'LOCATION' && action.locationName && (
                                                    <span className="action-preview">📍 {action.locationName}</span>
                                                )}
                                                {['DOCUMENT', 'VIDEO', 'IMAGE'].includes(action.messageType) && action.mediaUrl && (
                                                    <span className="action-preview">🔗 {action.mediaUrl.length > 50 ? action.mediaUrl.substring(0, 50) + '...' : action.mediaUrl}</span>
                                                )}
                                                {action.messageType === 'TEXT' && action.textContent && (
                                                    <span className="action-preview">{action.textContent.substring(0, 80)}{action.textContent.length > 80 ? '...' : ''}</span>
                                                )}
                                                {action.messageType === 'TEMPLATE' && action.templateName && (
                                                    <span className="action-preview">📋 {action.templateName}</span>
                                                )}
                                            </div>
                                            <div className="action-btns">
                                                <button className="btn-icon-sm" onClick={() => openEdit(action)}><Edit2 size={14} /></button>
                                                <button className="btn-icon-sm text-danger" onClick={() => handleDelete(action.id)}><Trash2 size={14} /></button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── MODAL ── */}
            {showModal && (
                <div className="modal-overlay" style={{ zIndex: 1100 }}>
                    <div className="modal-content" style={{ maxWidth: 620, maxHeight: '90vh', overflowY: 'auto' }}>
                        <div className="modal-header">
                            <h2>{editingId ? 'Aksiyonu Düzenle' : 'Yeni Aksiyon'}</h2>
                            <button className="btn-icon" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>

                        <form onSubmit={handleSave} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                            {/* Temel Bilgiler */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label className="form-label-sm">Aksiyon Adı *</label>
                                    <input
                                        className="input-modern"
                                        placeholder="Hastane Konumu Gönder"
                                        value={form.name}
                                        onChange={e => { setField('name', e.target.value); autoKey(e.target.value); }}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="form-label-sm">Aksiyon Key * <small style={{ color: '#9ca3af' }}>(Retell'den gelecek)</small></label>
                                    <input
                                        className="input-modern"
                                        placeholder="location_hastane"
                                        value={form.actionKey}
                                        onChange={e => setField('actionKey', e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="form-label-sm">Açıklama <small style={{ color: '#9ca3af' }}>(Retell agent ne zaman kullanacağını buradan anlar)</small></label>
                                <textarea
                                    className="input-modern"
                                    rows={2}
                                    placeholder="Müşteri konum, adres veya nerede olduğunuzu sorduğunda kullan."
                                    value={form.description}
                                    onChange={e => setField('description', e.target.value)}
                                />
                            </div>

                            {/* Mesaj Tipi */}
                            <div>
                                <label className="form-label-sm">Mesaj Tipi *</label>
                                <div className="msg-type-grid">
                                    {MESSAGE_TYPES.map(t => (
                                        <button
                                            key={t.value}
                                            type="button"
                                            className={`msg-type-btn ${form.messageType === t.value ? 'active' : ''}`}
                                            style={form.messageType === t.value ? { borderColor: TYPE_COLOR[t.value], background: TYPE_COLOR[t.value] + '15', color: TYPE_COLOR[t.value] } : {}}
                                            onClick={() => setField('messageType', t.value)}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Tip'e göre içerik alanları */}
                            {form.messageType === 'LOCATION' && (
                                <div className="content-fields">
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                        <div>
                                            <label className="form-label-sm">Enlem (Latitude) *</label>
                                            <input className="input-modern" type="number" step="any" placeholder="41.0082" value={form.locationLat} onChange={e => setField('locationLat', e.target.value)} required />
                                        </div>
                                        <div>
                                            <label className="form-label-sm">Boylam (Longitude) *</label>
                                            <input className="input-modern" type="number" step="any" placeholder="28.9784" value={form.locationLng} onChange={e => setField('locationLng', e.target.value)} required />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="form-label-sm">Konum İsmi</label>
                                        <input className="input-modern" placeholder="Özel Sağlık Hastanesi — Ana Giriş" value={form.locationName} onChange={e => setField('locationName', e.target.value)} />
                                    </div>
                                    <div>
                                        <label className="form-label-sm">Adres</label>
                                        <input className="input-modern" placeholder="Bağcılar Mah. Çetin Emek Cad. No:5, İstanbul" value={form.locationAddress} onChange={e => setField('locationAddress', e.target.value)} />
                                    </div>
                                    <div>
                                        <label className="form-label-sm">Ek Metin <small style={{ color: '#9ca3af' }}>(konumun altında gönderilir — ör: "Çalışma saatlerimiz 08:00-18:00")</small></label>
                                        <textarea className="input-modern" rows={2} value={form.textContent} onChange={e => setField('textContent', e.target.value)} />
                                    </div>
                                </div>
                            )}

                            {form.messageType === 'TEXT' && (
                                <div className="content-fields">
                                    <label className="form-label-sm">Metin İçeriği *</label>
                                    <textarea className="input-modern" rows={4} placeholder="İletişim: 0212 xxx xx xx&#10;E-posta: info@firma.com&#10;Adres: ..." value={form.textContent} onChange={e => setField('textContent', e.target.value)} required />
                                    <small style={{ color: '#9ca3af', marginTop: 4, display: 'block' }}>
                                        Retell agent {'"note"'} parametresiyle ek bilgi gönderirse (ör: randevu saati) metnin altına eklenir.
                                    </small>
                                </div>
                            )}

                            {['DOCUMENT', 'VIDEO', 'IMAGE'].includes(form.messageType) && (
                                <div className="content-fields">
                                    <div>
                                        <label className="form-label-sm">
                                            {form.messageType === 'DOCUMENT' ? 'Doküman URL (PDF, vb.) *' : form.messageType === 'VIDEO' ? 'Video URL *' : 'Görsel URL *'}
                                        </label>
                                        <input className="input-modern" type="url" placeholder="https://..." value={form.mediaUrl} onChange={e => setField('mediaUrl', e.target.value)} required />
                                    </div>
                                    {form.messageType === 'DOCUMENT' && (
                                        <div>
                                            <label className="form-label-sm">Dosya Adı</label>
                                            <input className="input-modern" placeholder="katalog-2024.pdf" value={form.mediaFilename} onChange={e => setField('mediaFilename', e.target.value)} />
                                        </div>
                                    )}
                                    <div>
                                        <label className="form-label-sm">Açıklama / Başlık</label>
                                        <input className="input-modern" placeholder="2024 Ürün Kataloğumuz" value={form.mediaCaption} onChange={e => setField('mediaCaption', e.target.value)} />
                                    </div>
                                </div>
                            )}

                            {form.messageType === 'TEMPLATE' && (
                                <div className="content-fields">
                                    <div>
                                        <label className="form-label-sm">WhatsApp Şablon Adı *</label>
                                        <input className="input-modern" placeholder="randevu_olusturuldu" value={form.templateName} onChange={e => setField('templateName', e.target.value)} required />
                                        <small style={{ color: '#9ca3af', display: 'block', marginTop: 4 }}>Instomer'daki WhatsApp şablon adıyla eşleşmeli.</small>
                                    </div>
                                </div>
                            )}

                            {/* Durum */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <input
                                    type="checkbox"
                                    id="action-active"
                                    checked={form.isActive}
                                    onChange={e => setField('isActive', e.target.checked)}
                                    style={{ width: 16, height: 16 }}
                                />
                                <label htmlFor="action-active" style={{ fontSize: 13, color: '#374151', cursor: 'pointer' }}>Aktif (Retell bu aksiyonu çağırabilir)</label>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                                <button type="button" className="btn-modern btn-secondary" onClick={() => setShowModal(false)}>İptal</button>
                                <button type="submit" className="btn-modern btn-primary" disabled={saving}>
                                    {saving ? 'Kaydediliyor...' : editingId ? 'Güncelle' : 'Kaydet'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
