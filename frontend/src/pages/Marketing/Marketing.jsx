
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api, { marketingV2API } from '../../services/api';
import {
    Megaphone, Folder, MessageSquare, Users, Plus, Edit2, Trash2, Send,
    Phone, Mail, Smartphone, Play, CheckCircle, ChevronRight, ChevronDown,
    Loader2, RefreshCw, X, Eye, RotateCcw
} from 'lucide-react';
import CampaignWizardModal from './CampaignWizardModal';
import { getDateRangeLogic, dateFilterOptions } from '../../utils/dateFilters';
import './Marketing.css';
import './Pazarlama.css';
import '../KnowledgeBase/KnowledgeBase.css';

// ─────────────────────────────────────────────────────────────────────────────
// SHARED UTILS & COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

const GROUP_COLORS = [
    '#2563eb','#16a34a','#dc2626','#ca8a04','#7c3aed',
    '#0891b2','#db2777','#ea580c','#65a30d','#475569'
];

/* ─────────────────────────────────────────────────────────────
   EKRAN DİLİ

   Kanal ve durum veritabanında kod olarak duruyor (WHATSAPP,
   SENDING…). Bunlar ekrana olduğu gibi düşüyordu; artık tek yerden
   Türkçeye çevriliyor. Tanımsız bir kod gelirse kodun kendisi
   gösteriliyor — sessizce boş bırakmak neyin geldiğini gizliyor.
   ───────────────────────────────────────────────────────────── */

const CHANNEL_META = {
    WHATSAPP: { label: 'WhatsApp',  bg: '#ecfdf5', fg: '#15803d', Icon: MessageSquare },
    AI_CALL:  { label: 'AI Arama',  bg: '#eef2ff', fg: '#4338ca', Icon: Phone },
    EMAIL:    { label: 'E-posta',   bg: '#fffbeb', fg: '#b45309', Icon: Mail },
    SMS:      { label: 'SMS',       bg: '#faf5ff', fg: '#7e22ce', Icon: Smartphone },
};
const channelMeta = (code) =>
    CHANNEL_META[code] || { label: code || '—', bg: '#f1f2f5', fg: '#475569', Icon: MessageSquare };

const STATUS_META = {
    DRAFT:     { label: 'Taslak',       fg: '#6b7480', dot: '#cbd2dc' },
    SCHEDULED: { label: 'Planlandı',    fg: '#4338ca', dot: '#6366f1' },
    SENDING:   { label: 'Gönderiliyor', fg: '#15803d', dot: '#16a34a' },
    ACTIVE:    { label: 'Aktif',        fg: '#15803d', dot: '#16a34a' },
    COMPLETED: { label: 'Tamamlandı',   fg: '#475569', dot: '#94a3b8' },
    PAUSED:    { label: 'Duraklatıldı', fg: '#b45309', dot: '#f59e0b' },
    INACTIVE:  { label: 'Pasif',        fg: '#6b7480', dot: '#cbd2dc' },
    FAILED:    { label: 'Başarısız',    fg: '#b91c1c', dot: '#ef4444' },
};
const statusMeta = (code) =>
    STATUS_META[code] || { label: code || '—', fg: '#6b7480', dot: '#cbd2dc' };

const RECIPIENT_META = {
    PENDING:   { label: 'Bekliyor',   fg: '#6b7480', dot: '#cbd2dc' },
    SENT:      { label: 'Gönderildi', fg: '#475569', dot: '#94a3b8' },
    DELIVERED: { label: 'Teslim',     fg: '#15803d', dot: '#16a34a' },
    READ:      { label: 'Okundu',     fg: '#4338ca', dot: '#6366f1' },
    FAILED:    { label: 'Başarısız',  fg: '#b91c1c', dot: '#ef4444' },
};
const recipientMeta = (code) =>
    RECIPIENT_META[code] || { label: code || '—', fg: '#6b7480', dot: '#cbd2dc' };

const CAMPAIGN_TYPE_META = {
    ONE_TIME:    { label: '⚡ Tek Seferlik', bg: '#eff6ff', fg: '#1d4ed8' },
    RECURRING:   { label: '🔄 Tekrarlı',     bg: '#f0fdf4', fg: '#15803d' },
    EVENT_BASED: { label: '🎯 Olay Bazlı',  bg: '#fff7ed', fg: '#c2410c' },
    DAY_BASED:   { label: '📅 Gün / Süreç', bg: '#faf5ff', fg: '#7e22ce' },
};

const TRIGGER_LABELS = {
    NEW_CONTACT:      'Yeni kişi',
    INACTIVE_DAYS:    'Pasif müşteri (90-120 gün)',
    BIRTHDAY:         'Doğum günü',
    HOT_LEAD:         'Sıcak lead',
    POST_SALE:        'Satış sonrası',
    ANNIVERSARY:      'Yıl dönümü',
    SPECIAL_DAY:      'Özel gün',
    UNCONTACTED_LEAD: 'Aranmayan Lead (30 Gün)',
    STAGE_CHANGE:     'Aşama Değişimi',
    FORM_SUBMITTED:   'Form Gönderildi',
};

/** Ad baş harfleri — avatar karesi için. Boş adda tire döner. */
function initials(name) {
    const words = String(name || '').trim().split(/[\s_-]+/).filter(Boolean);
    if (!words.length) return '—';
    if (words.length === 1) return words[0].slice(0, 2).toLocaleUpperCase('tr');
    return (words[0][0] + words[1][0]).toLocaleUpperCase('tr');
}

/** Binlik ayraçlı sayı; yoksa tire (sıfırla "hiç" aynı şey değil). */
const num = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('tr-TR'));

const trDate = (d) =>
    d ? new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
const trDateTime = (d) =>
    d ? new Date(d).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

/** Sayfa başlığı — dört sekme ve kampanya detayı aynı bloğu kullanıyor. */
function PageHead({ title, lede, children }) {
    return (
        <header className="pz-head">
            <div className="pz-head-row">
                <div style={{ minWidth: 0 }}>
                    <p className="pz-eyebrow">Pazarlama</p>
                    <h1>{title}</h1>
                    {lede && <p>{lede}</p>}
                </div>
                {children}
            </div>
        </header>
    );
}

function EmptyState({ Icon, title, note }) {
    return (
        <div className="pz-empty">
            <div className="pz-empty-ico"><Icon size={21} /></div>
            <h3>{title}</h3>
            {note && <p>{note}</p>}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1: KAMPANYALAR (CAMPAIGNS)
// ─────────────────────────────────────────────────────────────────────────────

function CampaignFormModal({ initial, onSave, onClose }) {
    const [name, setName] = useState(initial?.name || '');
    const [description, setDescription] = useState(initial?.description || '');
    const [budget, setBudget] = useState(initial?.budget || '');
    const [startDate, setStartDate] = useState(initial?.startDate ? initial.startDate.split('T')[0] : '');
    const [endDate, setEndDate] = useState(initial?.endDate ? initial.endDate.split('T')[0] : '');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!name.trim()) return alert('Kampanya adı zorunlu');
        setSaving(true);
        await onSave({ name, description, budget: Number(budget), startDate, endDate });
        setSaving(false);
    };

    return (
        <div className="pz-overlay" onClick={onClose}>
            <div className="pz-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="pz-kamp-b">
                <div className="pz-modal-h">
                    <span className="pz-modal-ico"><Megaphone size={17} /></span>
                    <div style={{ flexGrow: 1, minWidth: 0 }}>
                        <h2 id="pz-kamp-b">{initial ? 'Kampanyayı Düzenle' : 'Yeni Kampanya'}</h2>
                        <p>Kampanya bir çatı. Gönderimler altındaki gruplara eklenir.</p>
                    </div>
                    <button className="pz-modal-x" type="button" aria-label="Kapat" onClick={onClose}><X size={15} /></button>
                </div>

                <div className="pz-modal-b">
                    <div className="pz-field">
                        <label htmlFor="pz-k-ad">Kampanya adı <span className="pz-req" aria-hidden="true">*</span></label>
                        <input id="pz-k-ad" className="pz-input" value={name} onChange={e => setName(e.target.value)} placeholder="Örn. Eylül kapanış duyurusu" required />
                    </div>
                    <div className="pz-field">
                        <label htmlFor="pz-k-ac">Açıklama</label>
                        <textarea id="pz-k-ac" className="pz-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Bu kampanyanın amacı ne?" />
                    </div>
                    <div className="pz-field">
                        <label htmlFor="pz-k-bu">Bütçe (TL)</label>
                        <input id="pz-k-bu" className="pz-input" type="number" min="0" step="0.01" value={budget} onChange={e => setBudget(e.target.value)} placeholder="0,00" />
                        <span className="pz-hint">Boş bırakılabilir. Maliyet gönderim başına ayrıca hesaplanır.</span>
                    </div>
                    <div className="pz-two">
                        <div className="pz-field">
                            <label htmlFor="pz-k-b1">Başlangıç tarihi</label>
                            <input id="pz-k-b1" className="pz-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        </div>
                        <div className="pz-field">
                            <label htmlFor="pz-k-b2">Bitiş tarihi</label>
                            <input id="pz-k-b2" className="pz-input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                        </div>
                    </div>
                </div>

                <div className="pz-modal-f">
                    <button className="pz-btn" type="button" onClick={onClose}>Vazgeç</button>
                    <button className="pz-btn pz-btn-primary" type="button" onClick={handleSave} disabled={saving || !name}>
                        {saving ? 'Kaydediliyor…' : 'Kaydet'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// CAMPAIGN DETAIL MODAL — Mesaj önizlemesi + alıcı listesi + retry
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_BADGES = {
    PENDING: { label: '⏳ Bekliyor', bg: '#fef3c7', color: '#92400e' },
    SENT: { label: '📤 Gönderildi', bg: '#dbeafe', color: '#1e40af' },
    DELIVERED: { label: '✅ Teslim', bg: '#d1fae5', color: '#065f46' },
    READ: { label: '👁 Okundu', bg: '#ede9fe', color: '#5b21b6' },
    FAILED: { label: '❌ Başarısız', bg: '#fee2e2', color: '#991b1b' }
};

function CampaignDetailModal({ wsId, campaignId, onClose }) {
    const [detail, setDetail] = useState(null);
    const [recipients, setRecipients] = useState([]);
    const [recipientTotal, setRecipientTotal] = useState(0);
    const [statusCounts, setStatusCounts] = useState({});
    const [recipientFilter, setRecipientFilter] = useState('ALL');
    const [recipientPage, setRecipientPage] = useState(1);
    const [recipientSearch, setRecipientSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [loadingRecipients, setLoadingRecipients] = useState(false);
    const [retrying, setRetrying] = useState(false);

    // Kampanya detayını yükle
    useEffect(() => {
        if (!campaignId) return;
        setLoading(true);
        marketingV2API.getCampaignDetail(wsId, campaignId)
            .then(res => {
                setDetail(res.data);
                setStatusCounts(res.data.statusSummary || {});
            })
            .catch(err => console.error('Detail load error:', err))
            .finally(() => setLoading(false));
    }, [campaignId, wsId]);

    // Alıcıları yükle
    const loadRecipients = useCallback(() => {
        if (!campaignId) return;
        setLoadingRecipients(true);
        const params = { page: recipientPage, limit: 50 };
        if (recipientFilter !== 'ALL') params.status = recipientFilter;
        if (recipientSearch.trim()) params.search = recipientSearch.trim();
        marketingV2API.getCampaignRecipients(wsId, campaignId, params)
            .then(res => {
                setRecipients(res.data.recipients || []);
                setRecipientTotal(res.data.total || 0);
                if (res.data.statusCounts) setStatusCounts(res.data.statusCounts);
            })
            .catch(err => console.error('Recipients load error:', err))
            .finally(() => setLoadingRecipients(false));
    }, [campaignId, wsId, recipientPage, recipientFilter, recipientSearch]);

    useEffect(() => { loadRecipients(); }, [loadRecipients]);

    const handleRetry = async () => {
        if (!confirm('Başarısız alıcılara tekrar göndermek istediğinize emin misiniz?')) return;
        setRetrying(true);
        try {
            const res = await marketingV2API.retryCampaignFailed(wsId, campaignId);
            alert(res.data.message || 'Tekrar gönderim başlatıldı');
            setTimeout(() => { loadRecipients(); setRetrying(false); }, 3000);
        } catch (err) {
            alert('Hata: ' + (err.response?.data?.error || err.message));
            setRetrying(false);
        }
    };

    const camp = detail?.campaign;
    const totalPages = Math.ceil(recipientTotal / 50);
    const failedCount = statusCounts.FAILED || 0;

    return (
        <div className="mkt-modal-overlay" onClick={onClose}>
            <div style={{
                background: '#fff', borderRadius: 16, width: '90%', maxWidth: 900, maxHeight: '90vh',
                overflow: 'auto', padding: 0, position: 'relative'
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '20px 24px', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0,
                    background: '#fff', zIndex: 10, borderRadius: '16px 16px 0 0'
                }}>
                    <div>
                        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                            📊 Kampanya Detayı
                        </h2>
                        {camp && <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{camp.name}</div>}
                    </div>
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8',
                        width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }} onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'}
                       onMouseOut={e => e.currentTarget.style.background = 'none'}>✕</button>
                </div>

                {loading ? (
                    <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
                        <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} />
                        <div style={{ marginTop: 10 }}>Yükleniyor...</div>
                    </div>
                ) : !camp ? (
                    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Kampanya bulunamadı</div>
                ) : (
                    <div style={{ padding: '20px 24px' }}>

                        {/* İstatistik Kartları */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
                            {[
                                { label: 'Gönderildi', value: camp.sentCount || 0, color: '#2563eb', icon: '📤' },
                                { label: 'Teslim', value: camp.deliveredCount || 0, color: '#16a34a', icon: '✅' },
                                { label: 'Okundu', value: camp.readCount || 0, color: '#7c3aed', icon: '👁' },
                                { label: 'Başarısız', value: camp.failedCount || 0, color: '#dc2626', icon: '❌' },
                                { label: 'Yanıtlayan', value: camp.repliedCount || 0, color: '#0891b2', icon: '💬' }
                            ].map(s => (
                                <div key={s.label} style={{
                                    background: s.color + '0a', border: `1px solid ${s.color}22`, borderRadius: 10,
                                    padding: '14px 16px', textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.icon} {s.value}</div>
                                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{s.label}</div>
                                </div>
                            ))}
                        </div>

                        {/* Mesaj Önizlemesi */}
                        {detail?.messagePreviews?.length > 0 && (
                            <div style={{ marginBottom: 20 }}>
                                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 10 }}>📝 Gönderilen Mesaj</h3>
                                {detail.messagePreviews.map((msg, i) => (
                                    <div key={i} style={{
                                        background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
                                        padding: '12px 16px', marginBottom: 8
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{msg.name || msg.templateName || 'Mesaj'}</span>
                                            <span style={{
                                                fontSize: 10, background: '#e2e8f0', color: '#475569',
                                                padding: '2px 8px', borderRadius: 6, fontWeight: 500
                                            }}>{msg.channel}</span>
                                            {msg.groupName && msg.groupName !== '(Legacy)' && msg.groupName !== '(Şablon)' && (
                                                <span style={{ fontSize: 10, color: '#94a3b8' }}>• {msg.groupName}</span>
                                            )}
                                        </div>
                                        {msg.templateName && (
                                            <div style={{ fontSize: 12, color: '#64748b' }}>
                                                Şablon: <strong>{msg.templateName}</strong>
                                            </div>
                                        )}
                                        {msg.content && typeof msg.content === 'string' && (
                                            <div style={{
                                                fontSize: 13, color: '#374151', marginTop: 6, lineHeight: 1.5,
                                                background: '#fff', padding: '8px 12px', borderRadius: 8,
                                                border: '1px solid #e5e7eb', whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto'
                                            }}>
                                                {msg.content.substring(0, 500)}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Hedef Listeler */}
                        {detail?.targetLists?.length > 0 && (
                            <div style={{ marginBottom: 20 }}>
                                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>🎯 Hedef Listeler</h3>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {detail.targetLists.map((l, i) => (
                                        <span key={i} style={{
                                            background: l.color + '15', color: l.color, border: `1px solid ${l.color}33`,
                                            padding: '4px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500
                                        }}>{l.icon} {l.name}</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Alıcı Listesi */}
                        <div>
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                marginBottom: 12, flexWrap: 'wrap', gap: 8
                            }}>
                                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: 0 }}>
                                    👥 Alıcılar ({recipientTotal})
                                </h3>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <input
                                        placeholder="Ara..."
                                        value={recipientSearch}
                                        onChange={e => { setRecipientSearch(e.target.value); setRecipientPage(1); }}
                                        style={{
                                            padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0',
                                            fontSize: 13, width: 160, outline: 'none'
                                        }}
                                    />
                                    {['ALL', 'SENT', 'DELIVERED', 'READ', 'FAILED'].map(s => (
                                        <button key={s} onClick={() => { setRecipientFilter(s); setRecipientPage(1); }} style={{
                                            padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                                            cursor: 'pointer', border: '1px solid',
                                            background: recipientFilter === s ? '#2563eb' : '#fff',
                                            color: recipientFilter === s ? '#fff' : '#64748b',
                                            borderColor: recipientFilter === s ? '#2563eb' : '#e2e8f0'
                                        }}>
                                            {s === 'ALL' ? 'Tümü' : STATUS_BADGES[s]?.label?.split(' ')[0] || s}
                                            {s !== 'ALL' && statusCounts[s] ? ` (${statusCounts[s]})` : ''}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Tablo */}
                            {loadingRecipients ? (
                                <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>
                                    <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                                </div>
                            ) : recipients.length === 0 ? (
                                <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                                    Alıcı bulunamadı
                                </div>
                            ) : (
                                <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc' }}>
                                                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Kişi</th>
                                                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Telefon</th>
                                                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#374151' }}>Durum</th>
                                                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: '#374151' }}>Tarih</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {recipients.map(r => {
                                                const badge = STATUS_BADGES[r.status] || { label: r.status, bg: '#f1f5f9', color: '#475569' };
                                                const displayName = r.contact?.name || r.name || '—';
                                                const displayPhone = r.contact?.phone || r.phone || r.email || '—';
                                                const dateStr = r.sentAt || r.deliveredAt || r.readAt || r.failedAt;
                                                return (
                                                    <tr key={r.id} style={{ borderTop: '1px solid #f1f5f9' }}
                                                        title={r.failReason ? `Hata: ${r.failReason}` : ''}>
                                                        <td style={{ padding: '10px 14px', color: '#0f172a', fontWeight: 500 }}>{displayName}</td>
                                                        <td style={{ padding: '10px 14px', color: '#64748b' }}>{displayPhone}</td>
                                                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                            <span style={{
                                                                background: badge.bg, color: badge.color,
                                                                padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600
                                                            }}>{badge.label}</span>
                                                            {r.failReason && (
                                                                <div style={{ fontSize: 10, color: '#ef4444', marginTop: 3 }} title={r.failReason}>
                                                                    {r.failReason.substring(0, 60)}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#94a3b8', fontSize: 12 }}>
                                                            {dateStr ? new Date(dateStr).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
                                    <button disabled={recipientPage <= 1} onClick={() => setRecipientPage(p => p - 1)}
                                        style={{
                                            padding: '6px 14px', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer',
                                            background: recipientPage <= 1 ? '#f8fafc' : '#fff', color: recipientPage <= 1 ? '#cbd5e1' : '#374151', fontSize: 13
                                        }}>← Önceki</button>
                                    <span style={{ padding: '6px 10px', fontSize: 13, color: '#64748b' }}>{recipientPage} / {totalPages}</span>
                                    <button disabled={recipientPage >= totalPages} onClick={() => setRecipientPage(p => p + 1)}
                                        style={{
                                            padding: '6px 14px', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer',
                                            background: recipientPage >= totalPages ? '#f8fafc' : '#fff', color: recipientPage >= totalPages ? '#cbd5e1' : '#374151', fontSize: 13
                                        }}>Sonraki →</button>
                                </div>
                            )}
                        </div>

                        {/* Footer Actions */}
                        <div style={{
                            display: 'flex', justifyContent: 'flex-end', gap: 10,
                            marginTop: 20, paddingTop: 16, borderTop: '1px solid #e5e7eb'
                        }}>
                            {failedCount > 0 && (
                                <button onClick={handleRetry} disabled={retrying} style={{
                                    padding: '10px 20px', borderRadius: 10, border: 'none',
                                    background: retrying ? '#fecaca' : '#dc2626', color: '#fff',
                                    fontSize: 14, fontWeight: 600, cursor: retrying ? 'default' : 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 6
                                }}>
                                    <RefreshCw size={15} />
                                    {retrying ? 'Gönderiliyor...' : `Başarısızlara Tekrar Gönder (${failedCount})`}
                                </button>
                            )}
                            <button onClick={onClose} style={{
                                padding: '10px 20px', borderRadius: 10, border: '1px solid #e2e8f0',
                                background: '#fff', color: '#374151', fontSize: 14, fontWeight: 500, cursor: 'pointer'
                            }}>Kapat</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function CampaignsTab({ wsId, onGoToGroups }) {
    const [campaigns, setCampaigns] = useState([]);
    const [editItem, setEditItem] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [showWizard, setShowWizard] = useState(false);
    const [typeFilter, setTypeFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [dateFilter, setDateFilter] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [detailCampaignId, setDetailCampaignId] = useState(null);
    const [detailView, setDetailView] = useState(null); // inline detail data
    const [detailLoading, setDetailLoading] = useState(false);

    const getCampaignChannels = (c) => {
        const chs = new Set();
        if (c.groups && c.groups.length > 0) {
            c.groups.forEach(g => { if (g.channel) chs.add(g.channel); });
        }
        if (chs.size === 0) {
            if (c.name?.includes('AI Arama') || c.description?.includes('Arama')) chs.add('AI_CALL');
            else if (c.name?.includes('SMS')) chs.add('SMS');
            else if (c.name?.includes('E-posta') || c.name?.includes('Email')) chs.add('EMAIL');
            else chs.add('WHATSAPP');
        }
        return Array.from(chs);
    };

    const isAutoCampaign = (c) => c.isAutomation || c.isSystemTemplate || ['AUTO', 'DYNAMIC', 'TRIGGERED', 'AUTO_DRIP', 'AUTO_TRIGGERED', 'AUTO_RECURRING', 'RECURRING', 'EVENT_BASED', 'DAY_BASED'].includes(c.type || c.campaignType);

    const fetchCampaigns = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(`/marketing-v2/${wsId}/campaigns`);
            setCampaigns(res.data.campaigns || []);
        } catch (e) {
            console.error(e);
            setCampaigns([]);
        }
        setLoading(false);
    }, [wsId]);

    useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

    // Kampanya detayını yükle (inline drill-down)
    const loadCampaignDetail = useCallback(async (campaignId) => {
        setDetailLoading(true);
        setDetailCampaignId(campaignId);
        try {
            const res = await api.get(`/marketing-v2/${wsId}/campaigns/${campaignId}/detail`);
            const data = res.data || {};
            setDetailView({
                ...data,
                groups: data.campaign?.groups || data.groups || []
            });
        } catch (e) {
            console.error('Detail load error:', e);
            // Fallback: sadece kampanya bilgisi
            setDetailView({ groups: [] });
        }
        setDetailLoading(false);
    }, [wsId]);

    const backToList = () => {
        setDetailCampaignId(null);
        setDetailView(null);
        setExpandedSendId(null);
        setSendRecipients([]);
    };

    // Gönderi drill-down: karta tıklayınca alıcı listesini yükle
    const [expandedSendId, setExpandedSendId] = useState(null);
    const [sendRecipients, setSendRecipients] = useState([]);
    const [recipientsLoading, setRecipientsLoading] = useState(false);
    const [recipientFilter, setRecipientFilter] = useState('ALL');
    const [recipientSearch, setRecipientSearch] = useState('');

    const toggleSendExpand = useCallback(async (groupId) => {
        if (expandedSendId === groupId) {
            setExpandedSendId(null);
            setSendRecipients([]);
            return;
        }
        setExpandedSendId(groupId);
        setRecipientsLoading(true);
        setRecipientFilter('ALL');
        setRecipientSearch('');
        try {
            const res = await api.get(`/marketing-v2/${wsId}/campaigns/${detailCampaignId}/recipients?groupId=${groupId}&limit=200`);
            setSendRecipients(res.data?.recipients || []);
        } catch (e) {
            console.error('Recipients load error:', e);
            setSendRecipients([]);
        }
        setRecipientsLoading(false);
    }, [wsId, expandedSendId, detailCampaignId]);

    const handleSave = async (data) => {
        try {
            if (editItem) {
                await api.put(`/marketing-v2/${wsId}/campaigns/${editItem.id}`, data);
            } else {
                await api.post(`/marketing-v2/${wsId}/campaigns`, data);
            }
            setShowForm(false);
            setEditItem(null);
            fetchCampaigns();
        } catch (e) {
            alert('Hata: ' + (e.response?.data?.error || e.message));
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Bu kampanyayı silmek istediğinize emin misiniz?')) return;
        try {
            await api.delete(`/marketing-v2/${wsId}/campaigns/${id}`);
            fetchCampaigns();
        } catch (e) {
            alert('Silinemedi: ' + (e.response?.data?.error || e.message));
        }
    };

    const filteredCampaigns = campaigns.filter(c => {
        // Tip Filtresi: Manuel vs Otomatik veya spesifik tipler
        if (typeFilter === 'MANUAL' && isAutoCampaign(c)) return false;
        if (typeFilter === 'AUTO' && !isAutoCampaign(c)) return false;
        if (typeFilter === 'ONE_TIME' && c.campaignType !== 'ONE_TIME' && (c.campaignType || isAutoCampaign(c))) return false;
        if (typeFilter === 'RECURRING' && c.campaignType !== 'RECURRING') return false;
        if (typeFilter === 'EVENT_BASED' && c.campaignType !== 'EVENT_BASED') return false;
        if (typeFilter === 'DAY_BASED' && c.campaignType !== 'DAY_BASED') return false;

        // Durum Filtresi
        if (statusFilter === 'ACTIVE' && c.status !== 'ACTIVE' && c.status !== 'SENDING') return false;
        if (statusFilter === 'COMPLETED' && c.status !== 'COMPLETED') return false;
        if (statusFilter === 'DRAFT' && c.status !== 'DRAFT') return false;
        if (statusFilter === 'PAUSED' && c.status !== 'PAUSED' && c.status !== 'INACTIVE') return false;

        // Tarih Filtresi
        if (dateFilter) {
            const cDate = new Date(c.startDate || c.createdAt);
            const now = new Date();
            if (dateFilter === 'thisWeek') {
                const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay() + 1); weekStart.setHours(0,0,0,0);
                if (cDate < weekStart) return false;
            } else if (dateFilter === 'thisMonth') {
                const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                if (cDate < monthStart) return false;
            } else if (dateFilter === 'last30') {
                const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                if (cDate < d30) return false;
            } else if (dateFilter === 'last90') {
                const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                if (cDate < d90) return false;
            } else if (dateFilter === 'custom') {
                if (dateFrom && cDate < new Date(dateFrom)) return false;
                if (dateTo && cDate > new Date(dateTo + 'T23:59:59')) return false;
            }
        }

        // Arama Filtresi
        if (searchQuery.trim() && !c.name.toLowerCase().includes(searchQuery.trim().toLowerCase())) return false;
        return true;
    }).sort((a, b) => {
        // En yeniden en eskiye sıralama
        const dateA = new Date(a.startDate || a.createdAt || 0);
        const dateB = new Date(b.startDate || b.createdAt || 0);
        return dateB - dateA;
    });

    const getDateDisplay = (c) => {
        if (isAutoCampaign(c)) {
            const lastSent = c.lastSentAt || c.updatedAt;
            return lastSent ? `Süresiz · Son: ${new Date(lastSent).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}` : 'Süresiz';
        }
        if (c.startDate) {
            const start = new Date(c.startDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
            const end = c.endDate ? new Date(c.endDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
            return end ? `${start} — ${end}` : start;
        }
        if (c.createdAt) return new Date(c.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
        return '—';
    };

    const getSentCount = (c) => c.isLegacy ? (c.sentCount || 0) : (c.stats?.sent || c.sentCount || 0);
    const getDeliveredCount = (c) => c.isLegacy ? (c.deliveredCount || 0) : (c.stats?.delivered || c.deliveredCount || 0);
    const getReadCount = (c) => c.isLegacy ? (c.readCount || 0) : (c.stats?.read || c.readCount || 0);

    // Kanal bazlı birim fiyatlar — backend'den dinamik çekilir
    const DEFAULT_PRICES = { WHATSAPP: 0.0415, SMS: 0.01, EMAIL: 0.003, AI_CALL: 0.25 };
    const [channelPrices, setChannelPrices] = useState(DEFAULT_PRICES);

    useEffect(() => {
        if (!wsId) return;
        import('../../services/api').then(({ workspaceAPI }) => {
            workspaceAPI.getChannelPricing(wsId)
                .then(res => {
                    const p = res.data?.pricing;
                    if (p) {
                        setChannelPrices({
                            WHATSAPP: (parseFloat(p.WHATSAPP?.baseCost) || 0) * (parseFloat(p.WHATSAPP?.multiplier) || 1),
                            SMS: (parseFloat(p.SMS?.baseCost) || 0) * (parseFloat(p.SMS?.multiplier) || 1),
                            EMAIL: (parseFloat(p.EMAIL?.baseCost) || 0) * (parseFloat(p.EMAIL?.multiplier) || 1),
                            AI_CALL: (parseFloat(p.AI_CALL?.baseCost) || 0) * (parseFloat(p.AI_CALL?.multiplier) || 1),
                        });
                    }
                })
                .catch(() => {});
        });
    }, [wsId]);

    const getCampaignCost = (c) => {
        let total = 0;
        if (c.groups && c.groups.length > 0) {
            c.groups.forEach(g => {
                const sent = g.sentCount || 0;
                const ch = g.channel || 'WHATSAPP';
                const price = channelPrices[ch] || 0;
                total += sent * price;
            });
        } else {
            // Legacy kampanyalar — grup yok, toplam sentCount × varsayılan kanal fiyatı
            const sent = getSentCount(c);
            const channels = getCampaignChannels(c);
            if (channels.length > 0) {
                const price = channelPrices[channels[0]] || channelPrices.WHATSAPP;
                total = sent * price;
            }
        }
        return total;
    };

    // Eğer detay seçilmişse inline drill-down göster
    if (detailCampaignId) {
        const camp = campaigns.find(c => c.id === detailCampaignId) || detailView?.campaign;
        const groups = detailView?.groups || [];
        const detail = detailView;

        const campSt = statusMeta(camp?.status);

        return (
            <>
                <button className="pz-back" type="button" onClick={backToList}>
                    <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} /> Kampanyalar
                </button>

                {detailLoading ? (
                    <div className="pz-surface"><div className="pz-loading">Yükleniyor…</div></div>
                ) : !camp ? (
                    <div className="pz-surface">
                        <EmptyState Icon={Megaphone} title="Kampanya bulunamadı" note="Silinmiş ya da başka bir çalışma alanına ait olabilir." />
                    </div>
                ) : (
                    <>
                        <PageHead
                            title={camp.name}
                            lede={[
                                camp.description || null,
                                getDateDisplay(camp) || null,
                                camp.campaignType === 'RECURRING' && camp.nextRunAt ? `Sonraki Planlı Çalışma: ${trDateTime(camp.nextRunAt)}` : null,
                                camp.campaignType === 'EVENT_BASED' && camp.eventTrigger ? `Olay Tetikleyici: ${TRIGGER_LABELS[camp.eventTrigger] || camp.eventTrigger}` : null,
                                camp.campaignType === 'DAY_BASED' && camp.dayTrigger ? `Süreç Tetikleyici: ${TRIGGER_LABELS[camp.dayTrigger] || camp.dayTrigger}` : null,
                                camp.triggerType ? `Tetikleyici: ${TRIGGER_LABELS[camp.triggerType] || camp.triggerType}` : null,
                            ].filter(Boolean).join(' · ')}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                                {camp.campaignType && CAMPAIGN_TYPE_META[camp.campaignType] ? (
                                    <span className="pz-chip" style={{ background: CAMPAIGN_TYPE_META[camp.campaignType].bg, color: CAMPAIGN_TYPE_META[camp.campaignType].fg, fontWeight: 700, padding: '4px 9px', fontSize: 11.5 }}>
                                        {CAMPAIGN_TYPE_META[camp.campaignType].label}
                                    </span>
                                ) : camp.isSystemTemplate ? (
                                    <span className="pz-tag-auto">OTOMATİK</span>
                                ) : null}
                                {camp.autoRetry && (
                                    <span className="pz-chip" style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', fontSize: 11, padding: '3px 8px' }} title="Hatalı alıcılara 15 dk aralıkla otomatik arka plan tekrarı yapılır">
                                        🔁 Oto-Tekrar Aktif (15 dk)
                                    </span>
                                )}
                                <span className="pz-status" style={{ color: campSt.fg }}>
                                    <i style={{ background: campSt.dot }} />{campSt.label}
                                </span>
                                {(camp.isSystemTemplate || camp.campaignType === 'RECURRING' || camp.campaignType === 'EVENT_BASED' || camp.campaignType === 'DAY_BASED') && (
                                    <button
                                        className="pz-btn pz-btn-sm"
                                        type="button"
                                        onClick={async () => {
                                            const newStatus = camp.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
                                            try {
                                                await api.put(`/marketing-v2/${wsId}/campaigns/${camp.id}`, { status: newStatus });
                                                loadCampaignDetail(camp.id);
                                                fetchCampaigns();
                                            } catch (err) {
                                                alert('Hata: ' + (err.response?.data?.error || err.message));
                                            }
                                        }}
                                    >
                                        {camp.status === 'ACTIVE' ? <><X size={13} /> Durdur</> : <><Play size={13} /> Aktifleştir</>}
                                    </button>
                                )}
                            </div>
                        </PageHead>

                        {/* İstatistikler — kutu yerine tek yüzeyde beş alan */}
                        {(() => {
                            const sent = detail?.sentCount || camp.sentCount || 0;
                            const oran = (v) => (sent > 0 ? `%${((v / sent) * 100).toFixed(1).replace('.', ',')}` : '—');
                            const kpis = [
                                { label: 'Gönderildi', value: sent, sub: null, color: null },
                                { label: 'Teslim', value: detail?.deliveredCount || camp.deliveredCount || 0, color: null },
                                { label: 'Okundu', value: detail?.readCount || camp.readCount || 0, color: '#15803d' },
                                { label: 'Başarısız', value: detail?.failedCount || camp.failedCount || 0, color: '#b91c1c' },
                                { label: 'Yanıtlayan', value: detail?.repliedCount || camp.repliedCount || 0, color: null },
                            ];
                            return (
                                <div className="pz-surface pz-kpis">
                                    {kpis.map((k, i) => (
                                        <div className="pz-kpi" key={k.label}>
                                            <div className="pz-kpi-l">{k.label}</div>
                                            <div className="pz-kpi-v" style={k.color ? { color: k.color } : undefined}>{num(k.value)}</div>
                                            <div className="pz-kpi-s">{i === 0 ? 'toplam alıcı' : oran(k.value)}</div>
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}

                        {/* Otomasyon adımları */}
                        {(camp.isSystemTemplate || camp.campaignType === 'DAY_BASED' || camp.campaignType === 'EVENT_BASED' || groups.some(g => (g.delayDays || 0) > 0 || g.targetMilestone)) && groups.length > 1 && (
                            <>
                                <div className="pz-sechead pz-section">
                                    <span className="pz-sechead-n">Kampanya akış adımları</span>
                                    <span className="pz-rule" />
                                    <span className="pz-sechead-x">{groups.length} adım</span>
                                </div>
                                <div className="pz-surface" style={{ padding: '22px 26px' }}>
                                    <div className="pz-steps">
                                        {[...groups]
                                            .sort((a, b) => (a.delayDays || 0) - (b.delayDays || 0) || (a.sortOrder || 0) - (b.sortOrder || 0))
                                            .map((grp, idx, arr) => (
                                                <div className="pz-step" key={grp.id}>
                                                    {idx < arr.length - 1 && <span className="pz-step-r" />}
                                                    <div className={`pz-step-c ${(grp.sentCount || 0) > 0 ? '' : 'idle'}`}>
                                                        {grp.targetMilestone ? grp.targetMilestone.replace('DAY_', '') : (grp.delayDays ? `+${grp.delayDays}` : '0')}
                                                    </div>
                                                    <div className="pz-step-l">
                                                        {grp.targetMilestone
                                                            ? (grp.targetMilestone === 'DAY_90' ? '90. Gün' : grp.targetMilestone === 'DAY_100' ? '100. Gün' : grp.targetMilestone === 'DAY_120' ? '120. Gün' : grp.targetMilestone)
                                                            : grp.delayDays === 0 ? 'Hemen' : `${grp.delayDays} gün sonra`}
                                                    </div>
                                                    <div className="pz-step-s">
                                                        {(grp.sentCount || 0) > 0 ? `${num(grp.sentCount)} gönderim` : 'henüz yok'}
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Reklam Grupları — 3 Katmanlı: Grup → Gönderi */}
                        {(() => {
                            // Gönderileri groupTag'e göre grupla
                            const tagMap = {};
                            groups.forEach(g => {
                                const tag = g.groupTag || g.name || 'Genel';
                                if (!tagMap[tag]) tagMap[tag] = { tag, sends: [], totalSent: 0, totalDelivered: 0, totalRead: 0, totalFailed: 0 };
                                tagMap[tag].sends.push(g);
                                tagMap[tag].totalSent += (g.sentCount || 0);
                                tagMap[tag].totalDelivered += (g.deliveredCount || 0);
                                tagMap[tag].totalRead += (g.readCount || 0);
                                tagMap[tag].totalFailed += (g.failedCount || 0);
                            });
                            const groupedTags = Object.values(tagMap);

                            return (
                                <>
                                    <div className="pz-sechead pz-section">
                                        <span className="pz-sechead-n">Reklam grupları</span>
                                        <span className="pz-rule" />
                                        <span className="pz-sechead-x">
                                            {groupedTags.length} grup · {groups.length} gönderi
                                        </span>
                                    </div>

                                    {groups.length === 0 ? (
                                        <div className="pz-surface">
                                            <EmptyState
                                                Icon={Folder}
                                                title="Bu kampanyada grup yok"
                                                note="Gruplar sekmesinden bu kampanyaya grup ekleyebilirsin."
                                            />
                                        </div>
                                    ) : (
                                        <section className="pz-surface">
                                            {groupedTags.map(grp => {
                                                const oran = grp.totalSent > 0 ? Math.round((grp.totalDelivered / grp.totalSent) * 100) : 0;
                                                const channels = [...new Set(grp.sends.map(s => s.channel))];
                                                const halkaRengi = oran >= 80 ? '#16a34a' : oran >= 50 ? '#f59e0b' : '#dc2626';

                                                /* Gruba bağlı mesajlar — gönderimlerden önce gösteriliyor:
                                                   "hangi mesaj gitti" sorusu "kime gitti"den önce geliyor. */
                                                const allMessages = grp.sends.flatMap(s => (s.groupMessages || []).map(gm => gm.message).filter(Boolean));
                                                const uniqueMessages = allMessages.filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i);

                                                return (
                                                    <div key={grp.tag}>
                                                        <div className="pz-row grp open" style={{ gridTemplateColumns: '34px minmax(0,1fr) 150px 110px' }}>
                                                            <span className="pz-av"><Folder size={16} /></span>
                                                            <div style={{ minWidth: 0 }}>
                                                                <div className="pz-name" style={{ cursor: 'default' }}>{grp.tag}</div>
                                                                <div className="pz-sub">
                                                                    <span>{grp.sends.length} gönderi</span>
                                                                    {channels.map(ch => {
                                                                        const m = channelMeta(ch);
                                                                        return (
                                                                            <span key={ch} className="pz-chip" style={{ background: m.bg, color: m.fg }}>
                                                                                {m.label}
                                                                            </span>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <div className="pz-num">{num(grp.totalSent)}</div>
                                                                <div className="pz-sub" style={{ marginTop: 2 }}>toplam gönderim</div>
                                                            </div>
                                                            {grp.totalSent > 0 && (
                                                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                                    <span
                                                                        style={{
                                                                            width: 42, height: 42, borderRadius: '50%',
                                                                            background: `conic-gradient(${halkaRengi} ${oran * 3.6}deg, #f1f2f5 0deg)`,
                                                                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                                                        }}
                                                                        title={`Teslim oranı %${oran}`}
                                                                    >
                                                                        <span style={{
                                                                            width: 32, height: 32, borderRadius: '50%', background: '#fff',
                                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                            fontSize: 10.5, fontWeight: 700, color: '#0b1220'
                                                                        }}>%{oran}</span>
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="pz-detail">
                                                            {/* Kullanılan mesaj */}
                                                            {uniqueMessages.length > 0 && (
                                                                <>
                                                                    <div className="pz-sechead" style={{ marginTop: 14 }}>
                                                                        <span className="pz-sechead-n">Kullanılan mesaj</span>
                                                                        <span className="pz-rule" />
                                                                    </div>
                                                                    {uniqueMessages.map(msg => {
                                                                        const m = channelMeta(msg.channel);
                                                                        const preview = msg.content || msg.emailBody || msg.bodyText || '';
                                                                        return (
                                                                            <div className="pz-card" key={msg.id}>
                                                                                <div className="pz-card-row" style={{ flexWrap: 'wrap', gap: 9 }}>
                                                                                    <span className="pz-chip" style={{ background: m.bg, color: m.fg }}>{m.label}</span>
                                                                                    <span style={{ fontSize: 13, fontWeight: 650 }}>{msg.name || 'Mesaj'}</span>
                                                                                    {msg.templateName && msg.templateName !== msg.name && (
                                                                                        <span className="pz-chip" style={{ background: '#fef2f2', color: '#b91c1c' }}>
                                                                                            {msg.templateName}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                {preview && (
                                                                                    <p className="pz-preview" style={{ marginTop: 9 }}>
                                                                                        {preview.length > 300 ? preview.slice(0, 300) + '…' : preview}
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </>
                                                            )}

                                                            {/* Gönderimler */}
                                                            <div className="pz-sechead">
                                                                <span className="pz-sechead-n">Gönderimler</span>
                                                                <span className="pz-rule" />
                                                                <span className="pz-sechead-x">{grp.sends.length}</span>
                                                                <button
                                                                    className="pz-btn pz-btn-sm"
                                                                    type="button"
                                                                    onClick={() => alert('Yeni gönderim ekranı henüz bağlanmadı.')}
                                                                >
                                                                    <Plus size={13} /> Yeni Gönderim
                                                                </button>
                                                            </div>

                                                            {grp.sends.map((g, idx) => {
                                                                const sent = g.sentCount || 0;
                                                                const delivered = g.deliveredCount || 0;
                                                                const read = g.readCount || 0;
                                                                const failed = g.failedCount || 0;
                                                                const total = g.totalCount || sent;
                                                                const acik = expandedSendId === g.id;
                                                                const hedef = g.list?.name || g.segmentName || null;

                                                                return (
                                                                    <div key={g.id} style={{ marginBottom: 8 }}>
                                                                        <div
                                                                            className="pz-card clickable"
                                                                            style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr) 90px auto 30px', alignItems: 'center', gap: 12 }}
                                                                            onClick={() => toggleSendExpand(g.id)}
                                                                        >
                                                                            <span className="pz-av sm"><Send size={14} /></span>
                                                                            <div style={{ minWidth: 0 }}>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                                                    <button
                                                                                        type="button"
                                                                                        className="pz-name"
                                                                                        onClick={e => { e.stopPropagation(); toggleSendExpand(g.id); }}
                                                                                        aria-expanded={acik}
                                                                                    >
                                                                                        {g.name || `Gönderi #${idx + 1}`}
                                                                                    </button>
                                                                                    {g.targetMilestone && (
                                                                                        <span className="pz-chip" style={{ background: '#ede9fe', color: '#5b21b6', fontSize: 10, padding: '2px 6px' }}>
                                                                                            🎯 {g.targetMilestone === 'DAY_90' ? '90. Gün' : g.targetMilestone === 'DAY_100' ? '100. Gün' : g.targetMilestone === 'DAY_120' ? '120. Gün' : g.targetMilestone}
                                                                                        </span>
                                                                                    )}
                                                                                    {g.channel && (() => {
                                                                                        const cm = channelMeta(g.channel);
                                                                                        return (
                                                                                            <span className="pz-chip" style={{ background: cm.bg, color: cm.fg, fontSize: 10, padding: '2px 6px' }}>
                                                                                                {cm.label}
                                                                                            </span>
                                                                                        );
                                                                                    })()}
                                                                                </div>
                                                                                <div className="pz-sub">
                                                                                    <span>{trDate(g.sentAt || g.scheduledAt || g.createdAt)}</span>
                                                                                    {hedef && <><span className="pz-dot-sep">·</span><span>Hedef: {hedef}</span></>}
                                                                                </div>
                                                                            </div>
                                                                            <span style={{ fontSize: 12.5, fontWeight: 650 }}>{num(total)} kişi</span>
                                                                            <div style={{ display: 'flex', gap: 10, fontSize: 12, fontWeight: 650 }}>
                                                                                {delivered > 0 && <span style={{ color: '#15803d' }}>{num(delivered)} teslim</span>}
                                                                                {read > 0 && <span style={{ color: '#4338ca' }}>{num(read)} okundu</span>}
                                                                                {failed > 0 && <span style={{ color: '#b91c1c' }}>{num(failed)} hata</span>}
                                                                            </div>
                                                                            <button className="pz-ico" type="button" aria-label={acik ? 'Kapat' : 'Aç'} onClick={() => toggleSendExpand(g.id)}>
                                                                                {acik ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                                            </button>
                                                                        </div>

                                                                        {acik && (
                                                                            <div style={{ padding: '12px 2px 0' }}>
                                                                                {recipientsLoading ? (
                                                                                    <div className="pz-loading" style={{ padding: 28 }}>Alıcılar yükleniyor…</div>
                                                                                ) : sendRecipients.length === 0 ? (
                                                                                    <p style={{ margin: 0, padding: '8px 2px', fontSize: 12.5, color: '#6b7480' }}>
                                                                                        Bu gönderi için alıcı kaydı bulunamadı.
                                                                                    </p>
                                                                                ) : (
                                                                                    <>
                                                                                        <div className="pz-tagrow">
                                                                                            {[
                                                                                                { key: 'ALL', label: 'Tümü' },
                                                                                                { key: 'SENT', label: 'Gönderildi' },
                                                                                                { key: 'DELIVERED', label: 'Teslim' },
                                                                                                { key: 'READ', label: 'Okundu' },
                                                                                                { key: 'FAILED', label: 'Başarısız' },
                                                                                                { key: 'PENDING', label: 'Bekleyen' }
                                                                                            ].map(f => {
                                                                                                const cnt = f.key === 'ALL'
                                                                                                    ? sendRecipients.length
                                                                                                    : sendRecipients.filter(r => r.status === f.key).length;
                                                                                                if (f.key !== 'ALL' && cnt === 0) return null;
                                                                                                return (
                                                                                                    <button
                                                                                                        key={f.key}
                                                                                                        type="button"
                                                                                                        className={`pz-tag ${recipientFilter === f.key ? 'active' : ''}`}
                                                                                                        onClick={() => setRecipientFilter(f.key)}
                                                                                                    >
                                                                                                        {f.label} <i>{cnt}</i>
                                                                                                    </button>
                                                                                                );
                                                                                            })}
                                                                                            <span className="pz-spacer" />
                                                                                            <label className="pz-sr" htmlFor={`kisi-ara-${g.id}`}>Kişi ara</label>
                                                                                            <input
                                                                                                id={`kisi-ara-${g.id}`}
                                                                                                className="pz-select"
                                                                                                type="search"
                                                                                                placeholder="Kişi ara…"
                                                                                                style={{ width: 170, fontWeight: 400, cursor: 'text' }}
                                                                                                value={recipientSearch}
                                                                                                onChange={e => setRecipientSearch(e.target.value)}
                                                                                            />
                                                                                        </div>

                                                                                        {recipientFilter !== 'ALL' && (() => {
                                                                                            const filteredCount = sendRecipients.filter(r => r.status === recipientFilter).length;
                                                                                            return (
                                                                                                <div className="pz-bulk">
                                                                                                    <CheckCircle size={15} />
                                                                                                    <span>{recipientMeta(recipientFilter).label} · {num(filteredCount)} kişi seçili</span>
                                                                                                    <span className="pz-spacer" />
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        onClick={() => {
                                                                                                            if (window.confirm(`${filteredCount} kişiye aynı mesajı tekrar göndermek istediğinize emin misiniz?`)) {
                                                                                                                api.post(`/marketing-v2/${wsId}/campaigns/${detailCampaignId}/retry`, {
                                                                                                                    groupId: g.id, status: recipientFilter
                                                                                                                }).then(() => {
                                                                                                                    alert(`${filteredCount} kişiye tekrar gönderim başlatıldı!`);
                                                                                                                    toggleSendExpand(g.id);
                                                                                                                    setTimeout(() => toggleSendExpand(g.id), 300);
                                                                                                                }).catch(err => alert('Hata: ' + (err.response?.data?.error || err.message)));
                                                                                                            }
                                                                                                        }}
                                                                                                    >
                                                                                                        <RotateCcw size={12} /> Tekrar gönder
                                                                                                    </button>
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        onClick={() => alert(`${filteredCount} kişiye yeni gönderim başlatılacak.\nMesaj seçim ekranı açılacak.`)}
                                                                                                    >
                                                                                                        <Send size={12} /> Yeni gönderim başlat
                                                                                                    </button>
                                                                                                </div>
                                                                                            );
                                                                                        })()}

                                                                                        <div className="pz-tbl">
                                                                                            <div className="pz-tbl-cols">
                                                                                                <span>Kişi</span>
                                                                                                <span>Telefon / E-posta</span>
                                                                                                <span>Durum</span>
                                                                                                <span style={{ textAlign: 'right' }}>Zaman</span>
                                                                                            </div>
                                                                                            <div className="pz-tbl-scroll">
                                                                                                {sendRecipients
                                                                                                    .filter(r => recipientFilter === 'ALL' || r.status === recipientFilter)
                                                                                                    .filter(r => {
                                                                                                        if (!recipientSearch.trim()) return true;
                                                                                                        const q = recipientSearch.toLowerCase();
                                                                                                        return (r.name || '').toLowerCase().includes(q) ||
                                                                                                            (r.phone || '').includes(q) ||
                                                                                                            (r.email || '').toLowerCase().includes(q) ||
                                                                                                            (r.contact?.name || '').toLowerCase().includes(q);
                                                                                                    })
                                                                                                    .map(r => {
                                                                                                        const rm = recipientMeta(r.status);
                                                                                                        return (
                                                                                                            <div className="pz-tbl-row" key={r.id}>
                                                                                                                <div>
                                                                                                                    <div style={{ fontWeight: 600 }}>
                                                                                                                        {r.contact?.name || r.name || 'İsimsiz'}
                                                                                                                    </div>
                                                                                                                    {r.group?.targetMilestone && (
                                                                                                                        <span className="pz-chip" style={{ background: '#f5f3ff', color: '#6d28d9', fontSize: 9.5, padding: '1px 5px', marginTop: 2, display: 'inline-block' }}>
                                                                                                                            🎯 {r.group.targetMilestone === 'DAY_90' ? '90. Gün Drip' : r.group.targetMilestone === 'DAY_100' ? '100. Gün Drip' : r.group.targetMilestone === 'DAY_120' ? '120. Gün Drip' : r.group.targetMilestone}
                                                                                                                        </span>
                                                                                                                    )}
                                                                                                                </div>
                                                                                                                <span style={{ color: '#475569', fontVariantNumeric: 'tabular-nums' }}>
                                                                                                                    {r.phone || r.email || '—'}
                                                                                                                </span>
                                                                                                                <div>
                                                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                                                                                        <span className="pz-status" style={{ color: rm.fg }}>
                                                                                                                            <i style={{ background: rm.dot }} />{rm.label}
                                                                                                                        </span>
                                                                                                                        {r.retryCount > 0 && (
                                                                                                                            <span className="pz-chip" style={{ background: '#fef3c7', color: '#92400e', fontSize: 10, padding: '1px 5px' }} title={`${r.retryCount}. otomatik yeniden deneme yapıldı`}>
                                                                                                                                🔁 {r.retryCount}. deneme
                                                                                                                            </span>
                                                                                                                        )}
                                                                                                                    </div>
                                                                                                                    {r.failReason && (
                                                                                                                        <div style={{ fontSize: 10.5, color: '#b91c1c', marginTop: 2 }}>{r.failReason}</div>
                                                                                                                    )}
                                                                                                                    {r.status === 'FAILED' && camp?.autoRetry && (r.retryCount || 0) < (camp?.maxRetries || 3) && (
                                                                                                                        <div style={{ fontSize: 10, color: '#059669', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                                                                                                                            <RefreshCw size={10} /> 15 dk sonra otomatik tekrar denenecek
                                                                                                                        </div>
                                                                                                                    )}
                                                                                                                </div>
                                                                                                                <span className="pz-tnum">
                                                                                                                    {trDateTime(r.readAt || r.deliveredAt || r.sentAt || r.createdAt)}
                                                                                                                </span>
                                                                                                            </div>
                                                                                                        );
                                                                                                    })}
                                                                                            </div>
                                                                                        </div>
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </section>
                                    )}
                                </>
                            );
                        })()}

                        {/* Gönderilen mesajlar (eski kampanyalar için) */}
                        {detail?.messagePreviews?.length > 0 && (
                            <>
                                <div className="pz-sechead pz-section">
                                    <span className="pz-sechead-n">Gönderilen mesajlar</span>
                                    <span className="pz-rule" />
                                </div>
                                <div className="pz-surface" style={{ padding: 16 }}>
                                    {detail.messagePreviews.map((msg, i) => {
                                        const m = channelMeta(msg.channel);
                                        return (
                                            <div className="pz-card" key={i}>
                                                <div className="pz-card-row">
                                                    <span className="pz-chip" style={{ background: m.bg, color: m.fg }}>{m.label}</span>
                                                    <span style={{ fontSize: 13, fontWeight: 650 }}>
                                                        {msg.name || msg.templateName || 'Mesaj'}
                                                    </span>
                                                </div>
                                                {msg.content && typeof msg.content === 'string' && (
                                                    <p className="pz-preview" style={{ marginTop: 9 }}>
                                                        {msg.content.slice(0, 500)}
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}

                        {/* Hedef Listeler */}
                        {detail?.targetLists?.length > 0 && (
                            <>
                                <div className="pz-sechead pz-section">
                                    <span className="pz-sechead-n">Hedef listeler</span>
                                    <span className="pz-rule" />
                                    <span className="pz-sechead-x">{detail.targetLists.length} liste</span>
                                </div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {detail.targetLists.map((l, i) => (
                                        <span
                                            key={i}
                                            className="pz-chip"
                                            style={{ background: '#fff', color: '#475569', padding: '6px 13px', fontSize: 12.5, boxShadow: '0 0 0 1px rgba(15,23,42,.06)' }}
                                        >
                                            {l.name}
                                        </span>
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                )}
            </>
        );
    }

    const toplamGonderim = filteredCampaigns.reduce((s, c) => s + getSentCount(c), 0);
    const toplamMaliyet = filteredCampaigns.reduce((s, c) => s + getCampaignCost(c), 0);
    const suzgecAcik = statusFilter !== 'ALL' || typeFilter !== 'ALL' || dateFilter || searchQuery;

    return (
        <>
            <PageHead
                title="Kampanyalar"
                lede="Gönderilen, teslim edilen ve okunan mesaj sayıları listede — satıra girmene gerek yok."
            />

            <div className="pz-filters">
                <div className="pz-pills" role="group" aria-label="Kampanya türü">
                    {[
                        { key: 'ALL', label: 'Tümü' },
                        { key: 'ONE_TIME', label: '⚡ Tek Seferlik' },
                        { key: 'RECURRING', label: '🔄 Tekrarlı' },
                        { key: 'EVENT_BASED', label: '🎯 Olay Bazlı' },
                        { key: 'DAY_BASED', label: '📅 Gün / Süreç' },
                    ].map(f => (
                        <button key={f.key} type="button" className={`pz-pill ${typeFilter === f.key ? 'active' : ''}`} onClick={() => setTypeFilter(f.key)}>
                            {f.label}
                        </button>
                    ))}
                </div>

                <div className="pz-pills" role="group" aria-label="Durum">
                    {[
                        { key: 'ALL', label: 'Tümü' },
                        { key: 'ACTIVE', label: 'Aktifler' },
                        { key: 'COMPLETED', label: 'Tamamlanan' },
                        { key: 'DRAFT', label: 'Taslak' },
                    ].map(f => (
                        <button key={f.key} type="button" className={`pz-pill ${statusFilter === f.key ? 'active' : ''}`} onClick={() => setStatusFilter(f.key)}>
                            {f.label}
                        </button>
                    ))}
                </div>

                <label className="pz-sr" htmlFor="pz-tarih">Tarih aralığı</label>
                <select
                    id="pz-tarih"
                    className="pz-select"
                    value={dateFilter}
                    onChange={e => { setDateFilter(e.target.value); if (e.target.value !== 'custom') { setDateFrom(''); setDateTo(''); } }}
                >
                    <option value="">Tüm tarihler</option>
                    <option value="thisWeek">Bu hafta</option>
                    <option value="thisMonth">Bu ay</option>
                    <option value="last30">Son 30 gün</option>
                    <option value="last90">Son 90 gün</option>
                    <option value="custom">Özel aralık</option>
                </select>

                {dateFilter === 'custom' && (
                    <>
                        <label className="pz-sr" htmlFor="pz-tarih-bas">Başlangıç</label>
                        <input id="pz-tarih-bas" className="pz-date" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                        <span style={{ color: '#94a3b8', fontSize: 13 }}>—</span>
                        <label className="pz-sr" htmlFor="pz-tarih-bit">Bitiş</label>
                        <input id="pz-tarih-bit" className="pz-date" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                    </>
                )}

                <label className="pz-sr" htmlFor="pz-ara">Kampanya ara</label>
                <input
                    id="pz-ara"
                    className="pz-search"
                    type="search"
                    placeholder="Ara…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />

                {suzgecAcik && (
                    <button
                        className="pz-clear"
                        type="button"
                        onClick={() => { setStatusFilter('ALL'); setDateFilter(''); setDateFrom(''); setDateTo(''); setSearchQuery(''); setTypeFilter('ALL'); }}
                    >
                        <X size={12} /> Temizle
                    </button>
                )}

                <span className="pz-spacer" />
                <button className="pz-btn pz-btn-primary" type="button" onClick={() => setShowWizard(true)}>
                    <Plus size={15} /> Yeni Kampanya
                </button>
            </div>

            <section className="pz-surface">
                {loading ? (
                    <div className="pz-loading">Yükleniyor…</div>
                ) : filteredCampaigns.length === 0 ? (
                    <EmptyState
                        Icon={Megaphone}
                        title="Kampanya yok"
                        note={suzgecAcik ? 'Süzgeçlere uyan kampanya bulunamadı.' : 'İlk kampanyanı oluşturarak başla.'}
                    />
                ) : (
                    <>
                        <div className="pz-cols camp">
                            <span />
                            <span>Kampanya</span>
                            <span>Durum</span>
                            <span className="pz-r">Gönderilen</span>
                            <span className="pz-r">Teslim</span>
                            <span className="pz-r">Okunan</span>
                            <span className="pz-r">Maliyet</span>
                            <span />
                        </div>

                        {filteredCampaigns.map(c => {
                            const st = statusMeta(c.status);
                            const channels = getCampaignChannels(c);
                            const sent = getSentCount(c);
                            const delivered = getDeliveredCount(c);
                            const read = getReadCount(c);
                            const isAuto = isAutoCampaign(c);
                            const cost = getCampaignCost(c);
                            const hicGonderim = sent === 0;
                            const duzenlenebilir = !c.isLegacy && !c.isArchive && !c.isSystemTemplate;

                            return (
                                <div
                                    className="pz-row camp clickable"
                                    key={c.id}
                                    onClick={() => loadCampaignDetail(c.id)}
                                >
                                    <span className={`pz-av ${isAuto ? 'auto' : ''}`}>{initials(c.name)}</span>

                                    <div style={{ minWidth: 0 }}>
                                        <div className="pz-name-wrap">
                                            <button
                                                type="button"
                                                className="pz-name"
                                                onClick={e => { e.stopPropagation(); loadCampaignDetail(c.id); }}
                                            >
                                                {c.name}
                                            </button>
                                            {c.campaignType && CAMPAIGN_TYPE_META[c.campaignType] ? (
                                                <span className="pz-chip" style={{ background: CAMPAIGN_TYPE_META[c.campaignType].bg, color: CAMPAIGN_TYPE_META[c.campaignType].fg, fontWeight: 650 }}>
                                                    {CAMPAIGN_TYPE_META[c.campaignType].label}
                                                </span>
                                            ) : c.isSystemTemplate ? (
                                                <span className="pz-tag-auto">OTOMATİK</span>
                                            ) : null}
                                            {c.autoRetry && (
                                                <span className="pz-chip" style={{ background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', fontSize: 10 }} title="Başarısız gönderimlerde 15 dk arayla otomatik yeniden deneme devrede">
                                                    🔁 Oto-Tekrar
                                                </span>
                                            )}
                                            {channels.map(ch => {
                                                const m = channelMeta(ch);
                                                return (
                                                    <span key={ch} className="pz-chip" style={{ background: m.bg, color: m.fg }}>
                                                        {m.label}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                        <div className="pz-sub">
                                            <span>{c.description || (isAuto ? 'Sistem otomasyonu' : 'Açıklama yok')}</span>
                                            <span className="pz-dot-sep">·</span>
                                            <span>{getDateDisplay(c)}</span>
                                            {c.campaignType === 'RECURRING' && c.nextRunAt && (
                                                <>
                                                    <span className="pz-dot-sep">·</span>
                                                    <span style={{ color: '#16a34a', fontWeight: 600 }}>Sonraki: {trDateTime(c.nextRunAt)}</span>
                                                </>
                                            )}
                                            {c.campaignType === 'EVENT_BASED' && c.eventTrigger && (
                                                <>
                                                    <span className="pz-dot-sep">·</span>
                                                    <span style={{ color: '#ea580c', fontWeight: 600 }}>Olay: {TRIGGER_LABELS[c.eventTrigger] || c.eventTrigger}</span>
                                                </>
                                            )}
                                            {c.campaignType === 'DAY_BASED' && c.dayTrigger && (
                                                <>
                                                    <span className="pz-dot-sep">·</span>
                                                    <span style={{ color: '#7c3aed', fontWeight: 600 }}>Süreç: {TRIGGER_LABELS[c.dayTrigger] || c.dayTrigger}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <span className="pz-status" style={{ color: st.fg }}>
                                        <i style={{ background: st.dot }} />{st.label}
                                    </span>

                                    <span className={`pz-num pz-r ${hicGonderim ? 'zero' : ''}`}>{hicGonderim ? '—' : num(sent)}</span>
                                    <span className={`pz-num pz-r ${hicGonderim ? 'zero' : ''}`}>{hicGonderim ? '—' : num(delivered)}</span>
                                    <span className={`pz-num pz-r ${hicGonderim ? 'zero' : 'good'}`}>{hicGonderim ? '—' : num(read)}</span>
                                    <span className={`pz-num pz-r ${cost > 0 ? '' : 'zero'}`}>{cost > 0 ? `$${cost.toFixed(2)}` : '—'}</span>

                                    {/* Satırın tamamı tıklanabilir; buradaki düğmeler kampanyayı açmasın */}
                                    <div className="pz-acts" onClick={e => e.stopPropagation()}>
                                        {(c.isSystemTemplate || c.campaignType === 'RECURRING' || c.campaignType === 'EVENT_BASED' || c.campaignType === 'DAY_BASED') && (
                                            <button
                                                className="pz-btn pz-btn-sm"
                                                type="button"
                                                onClick={async () => {
                                                    const newStatus = c.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
                                                    try {
                                                        await api.put(`/marketing-v2/${wsId}/campaigns/${c.id}`, { status: newStatus });
                                                        fetchCampaigns();
                                                    } catch (err) {
                                                        alert('Hata: ' + (err.response?.data?.error || err.message));
                                                    }
                                                }}
                                            >
                                                {c.status === 'ACTIVE' ? <><X size={12} /> Durdur</> : <><Play size={12} /> Aktifleştir</>}
                                            </button>
                                        )}
                                        {duzenlenebilir && (
                                            <>
                                                <button className="pz-ico" type="button" aria-label="Düzenle" onClick={() => { setEditItem(c); setShowForm(true); }}>
                                                    <Edit2 size={14} />
                                                </button>
                                                <button className="pz-ico danger" type="button" aria-label="Sil" onClick={() => handleDelete(c.id)}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </>
                                        )}
                                        <button className="pz-ico" type="button" aria-label="Kampanyayı aç" onClick={() => loadCampaignDetail(c.id)}>
                                            <ChevronRight size={14} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </>
                )}
            </section>

            {!loading && filteredCampaigns.length > 0 && (
                <p className="pz-foot">
                    {num(filteredCampaigns.length)} kampanya · {num(toplamGonderim)} gönderim
                    {toplamMaliyet > 0 && ` · toplam $${toplamMaliyet.toFixed(2)}`}
                </p>
            )}

            {/* Campaign Wizard Modal */}
            {showWizard && (
                <CampaignWizardModal
                    workspaceId={wsId}
                    isOpen={showWizard}
                    onClose={() => setShowWizard(false)}
                    onSuccess={(newCampaign) => {
                        fetchCampaigns();
                        if (newCampaign?.id) onGoToGroups(newCampaign.id);
                    }}
                />
            )}

            {/* Basic Campaign Edit Modal */}
            {showForm && (
                <CampaignFormModal initial={editItem} onSave={handleSave} onClose={() => { setShowForm(false); setEditItem(null); }} />
            )}
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2: GRUPLAR (AD SETS)
// ─────────────────────────────────────────────────────────────────────────────

function AdSetFormModal({ wsId, initial, campaigns, contactGroups, onSave, onClose }) {
    const [name, setName] = useState(initial?.name || '');
    const [groupTag, setGroupTag] = useState(initial?.groupTag || '');
    const [campaignId, setCampaignId] = useState(initial?.campaignId || '');
    const [channel, setChannel] = useState(initial?.channel || 'WHATSAPP');
    const [audienceType, setAudienceType] = useState(initial?.segmentId ? 'segment' : 'list');
    const [listId, setListId] = useState(initial?.listId || '');
    const [segmentId, setSegmentId] = useState(initial?.segmentId || '');
    const [sendRate, setSendRate] = useState(initial?.sendRate || 20);
    const [scheduledAt, setScheduledAt] = useState(initial?.scheduledAt ? initial.scheduledAt.substring(0,16) : '');
    const [saving, setSaving] = useState(false);

    // Smart segmentleri yükle
    const [smartSegments, setSmartSegments] = useState([]);
    useEffect(() => {
        api.get(`/smart-segments/${wsId}/segments/definitions`)
            .then(r => setSmartSegments(r.data.segments || []))
            .catch(() => setSmartSegments([]));
    }, [wsId]);

    const handleSave = async () => {
        if (!name.trim() || !campaignId) return alert('Lütfen zorunlu alanları doldurun');
        if (audienceType === 'list' && !listId) return alert('Lütfen hedef kitle listesi seçin');
        if (audienceType === 'segment' && !segmentId) return alert('Lütfen hedef segment seçin');
        setSaving(true);
        const selectedSeg = smartSegments.find(s => s.id === segmentId);
        await onSave({
            name, campaignId, channel, sendRate: Number(sendRate), scheduledAt,
            groupTag: groupTag.trim() || name.trim(), // Boşsa gönderi adı kullanılır
            listId: audienceType === 'list' ? listId : null,
            segmentId: audienceType === 'segment' ? segmentId : null,
            segmentName: audienceType === 'segment' ? (selectedSeg?.name || segmentId) : null,
        });
        setSaving(false);
    };

    return (
        <div className="pz-overlay" onClick={onClose}>
            <div className="pz-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="pz-grup-b">
                <div className="pz-modal-h">
                    <span className="pz-modal-ico"><Folder size={17} /></span>
                    <div style={{ flexGrow: 1, minWidth: 0 }}>
                        <h2 id="pz-grup-b">{initial ? 'Grubu Düzenle' : 'Yeni Grup'}</h2>
                        <p>Bir gönderim partisi: kime, hangi kanaldan, ne hızda.</p>
                    </div>
                    <button className="pz-modal-x" type="button" aria-label="Kapat" onClick={onClose}><X size={15} /></button>
                </div>

                <div className="pz-modal-b">
                    <div className="pz-field">
                        <label htmlFor="pz-g-ad">Grup adı <span className="pz-req" aria-hidden="true">*</span></label>
                        <input id="pz-g-ad" className="pz-input" value={name} onChange={e => setName(e.target.value)} placeholder="Örn. Gaziemir duyurusu — 1. parti" required />
                    </div>

                    <div className="pz-field">
                        <label htmlFor="pz-g-etiket">Grup etiketi</label>
                        <input id="pz-g-etiket" className="pz-input" value={groupTag} onChange={e => setGroupTag(e.target.value)} placeholder="Boş bırakılırsa grup adı kullanılır" />
                        <span className="pz-hint">Aynı etiketi taşıyan gönderimler tek reklam grubunda toplanır.</span>
                    </div>

                    <div className="pz-field">
                        <label htmlFor="pz-g-kamp">Kampanya <span className="pz-req" aria-hidden="true">*</span></label>
                        <select id="pz-g-kamp" className="pz-input" value={campaignId} onChange={e => setCampaignId(e.target.value)} required>
                            <option value="">Kampanya seçin…</option>
                            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>

                    <div className="pz-field">
                        <span className="pz-field-l" id="pz-g-kanal-l">Kanal</span>
                        <div className="pz-pills pz-pills-wide" role="group" aria-labelledby="pz-g-kanal-l">
                            {['WHATSAPP', 'AI_CALL', 'EMAIL', 'SMS'].map(code => (
                                <button
                                    key={code}
                                    type="button"
                                    className={`pz-pill ${channel === code ? 'active' : ''}`}
                                    onClick={() => setChannel(code)}
                                >
                                    {channelMeta(code).label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="pz-modal-rule" />

                    <div className="pz-field">
                        <span className="pz-field-l" id="pz-g-hk-l">Hedef kitle</span>
                        <div className="pz-pills pz-pills-wide" role="group" aria-labelledby="pz-g-hk-l">
                            <button type="button" className={`pz-pill ${audienceType === 'list' ? 'active' : ''}`} onClick={() => setAudienceType('list')}>
                                Hazır liste
                            </button>
                            <button type="button" className={`pz-pill ${audienceType === 'segment' ? 'active' : ''}`} onClick={() => setAudienceType('segment')}>
                                Otomatik segment
                            </button>
                        </div>
                    </div>

                    {audienceType === 'list' ? (
                        <div className="pz-field">
                            <label htmlFor="pz-g-liste">Liste <span className="pz-req" aria-hidden="true">*</span></label>
                            <select id="pz-g-liste" className="pz-input" value={listId} onChange={e => setListId(e.target.value)} required>
                                <option value="">Liste seçin…</option>
                                {contactGroups.map(cg => <option key={cg.id} value={cg.id}>{cg.name}</option>)}
                            </select>
                        </div>
                    ) : (
                        <div className="pz-field">
                            <label htmlFor="pz-g-segment">Segment <span className="pz-req" aria-hidden="true">*</span></label>
                            <select id="pz-g-segment" className="pz-input" value={segmentId} onChange={e => setSegmentId(e.target.value)} required>
                                <option value="">Segment seçin…</option>
                                {smartSegments.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                    )}

                    <div className="pz-two">
                        <div className="pz-field">
                            <label htmlFor="pz-g-hiz">Gönderim hızı</label>
                            <div className="pz-suffix">
                                <input id="pz-g-hiz" className="pz-input" type="number" min="1" value={sendRate} onChange={e => setSendRate(e.target.value)} />
                                <span>mesaj / dk</span>
                            </div>
                        </div>
                        <div className="pz-field">
                            <label htmlFor="pz-g-zaman">Planlanan zaman</label>
                            <input id="pz-g-zaman" className="pz-input" type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
                        </div>
                    </div>
                    <span className="pz-hint">Zaman boş bırakılırsa grup taslak kalır, göndermek için “Gönder” demen gerekir.</span>
                </div>

                <div className="pz-modal-f">
                    <button className="pz-btn" type="button" onClick={onClose}>Vazgeç</button>
                    <button className="pz-btn pz-btn-primary" type="button" onClick={handleSave} disabled={saving || !name}>
                        {saving ? 'Kaydediliyor…' : 'Kaydet'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function AdSetsTab({ wsId, initialCampaignFilter }) {
    const [adSets, setAdSets] = useState([]);
    const [campaigns, setCampaigns] = useState([]);
    const [contactGroups, setContactGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [filterCampaignId, setFilterCampaignId] = useState(initialCampaignFilter || '');
    const [expandedSet, setExpandedSet] = useState(null);
    const [messages, setMessages] = useState([]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [setsRes, campRes, cgRes, msgRes] = await Promise.all([
                api.get(`/marketing-v2/${wsId}/groups`),
                api.get(`/marketing-v2/${wsId}/campaigns`),
                api.get(`/contact-groups/${wsId}/groups`),
                api.get(`/marketing-v2/${wsId}/messages`)
            ]);
            setAdSets(setsRes.data.adSets || setsRes.data.groups || []);
            setCampaigns(campRes.data.campaigns || []);
            setContactGroups(cgRes.data.groups || []);
            setMessages(msgRes.data.messages || []);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    }, [wsId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSave = async (data) => {
        try {
            if (editItem) {
                await api.put(`/marketing-v2/${wsId}/groups/${editItem.id}`, data);
            } else {
                await api.post(`/marketing-v2/${wsId}/groups`, data);
            }
            setShowForm(false);
            setEditItem(null);
            fetchData();
        } catch (e) {
            alert('Hata: ' + (e.response?.data?.error || e.message));
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Bu reklam grubunu silmek istediğinize emin misiniz?')) return;
        try {
            await api.delete(`/marketing-v2/${wsId}/groups/${id}`);
            fetchData();
        } catch (e) {
            alert('Silinemedi: ' + (e.response?.data?.error || e.message));
        }
    };

    const handleExecute = async (id) => {
        if (!window.confirm('Bu grubun gönderimini başlatmak istediğinize emin misiniz?')) return;
        try {
            const res = await api.post(`/marketing-v2/${wsId}/groups/${id}/execute`);
            alert(res.data?.message || 'Gönderim başarıyla başlatıldı!');
            fetchData();
        } catch (e) {
            alert('Başlatılamadı: ' + (e.response?.data?.error || e.message));
        }
    };

    const toggleExpand = (id) => {
        setExpandedSet(expandedSet === id ? null : id);
    };

    const linkMessage = async (setId, messageId) => {
        try {
            await api.post(`/marketing-v2/${wsId}/groups/${setId}/messages`, { messageId });
            fetchData();
        } catch (e) { alert('Mesaj eklenemedi'); }
    };
    
    const unlinkMessage = async (setId, messageId) => {
        try {
            await api.delete(`/marketing-v2/${wsId}/groups/${setId}/messages/${messageId}`);
            fetchData();
        } catch (e) { alert('Mesaj çıkarılamadı'); }
    };

    const filteredSets = filterCampaignId ? adSets.filter(a => a.campaignId === filterCampaignId) : adSets;

    return (
        <>
            <PageHead
                title="Gruplar"
                lede="Bir kampanyanın gönderim partileri. Satırı açınca gruba bağlı mesajları yönetirsin."
            />

            <div className="pz-filters">
                <label htmlFor="pz-kampanya-suzgec" style={{ fontSize: 12.5, fontWeight: 600, color: '#6b7480' }}>Kampanya</label>
                <select
                    id="pz-kampanya-suzgec"
                    className="pz-select"
                    value={filterCampaignId}
                    onChange={e => setFilterCampaignId(e.target.value)}
                >
                    <option value="">Tümü</option>
                    {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <span className="pz-spacer" />
                <button className="pz-btn pz-btn-primary" type="button" onClick={() => setShowForm(true)}>
                    <Plus size={15} /> Yeni Grup
                </button>
            </div>

            <section className="pz-surface">
                {loading ? (
                    <div className="pz-loading">Yükleniyor…</div>
                ) : filteredSets.length === 0 ? (
                    <EmptyState
                        Icon={Folder}
                        title="Grup yok"
                        note={filterCampaignId ? 'Bu kampanyaya bağlı grup bulunmuyor.' : 'Gönderim yapmak için önce bir grup oluştur.'}
                    />
                ) : (
                    <>
                        <div className="pz-cols grp">
                            <span />
                            <span>Grup</span>
                            <span>Kampanya</span>
                            <span>Performans</span>
                            <span>Durum</span>
                            <span />
                        </div>
                        {filteredSets.map(s => {
                            const ch = channelMeta(s.channel);
                            const st = statusMeta(s.status || 'DRAFT');
                            const isOpen = expandedSet === s.id;
                            const isCall = s.channel === 'AI_CALL';
                            const list = contactGroups.find(c => c.id === s.listId);
                            const hedef = list?.name || s.segmentName || null;
                            const linked = s.groupMessages || [];
                            const secilebilir = messages.filter(
                                m => m.channel === s.channel && !linked.some(sm => sm.messageId === m.id)
                            );

                            return (
                                <React.Fragment key={s.id}>
                                    <div
                                        className={`pz-row grp clickable ${isOpen ? 'open' : ''}`}
                                        onClick={() => toggleExpand(s.id)}
                                    >
                                        <span className="pz-av"><Folder size={16} /></span>
                                        <div style={{ minWidth: 0 }}>
                                            <button
                                                type="button"
                                                className="pz-name"
                                                onClick={e => { e.stopPropagation(); toggleExpand(s.id); }}
                                                aria-expanded={isOpen}
                                            >
                                                {s.name}
                                            </button>
                                            <div className="pz-sub">
                                                <span className="pz-chip" style={{ background: ch.bg, color: ch.fg }}>{ch.label}</span>
                                                <span>{hedef ? `Hedef: ${hedef}` : 'Hedef kitle seçilmemiş'}</span>
                                            </div>
                                        </div>
                                        <span style={{ fontSize: 12.5, color: '#475569' }}>
                                            {campaigns.find(c => c.id === s.campaignId)?.name || '—'}
                                        </span>
                                        <div>
                                            <div className="pz-num">
                                                {num(s.sentCount || 0)} {isCall ? 'arama' : 'gönderildi'}
                                            </div>
                                            <div className="pz-sub" style={{ marginTop: 2 }}>
                                                {isCall
                                                    ? `${num(s.deliveredCount || s.readCount || 0)} başarılı`
                                                    : `${num(s.deliveredCount || 0)} teslim · ${num(s.readCount || 0)} okundu`}
                                            </div>
                                        </div>
                                        <span className="pz-status" style={{ color: st.fg }}>
                                            <i style={{ background: st.dot }} />{st.label}
                                        </span>
                                        {/* Satırın tamamı açıp kapatıyor; buradaki düğmeler onu tetiklemesin */}
                                        <div className="pz-acts" onClick={e => e.stopPropagation()}>
                                            {s.status !== 'COMPLETED' && (
                                                <button
                                                    className="pz-btn pz-btn-sm"
                                                    type="button"
                                                    onClick={() => handleExecute(s.id)}
                                                    disabled={s.status === 'SENDING'}
                                                >
                                                    <Send size={13} /> Gönder
                                                </button>
                                            )}
                                            <button className="pz-ico" type="button" aria-label="Düzenle" onClick={() => { setEditItem(s); setShowForm(true); }}>
                                                <Edit2 size={14} />
                                            </button>
                                            <button className="pz-ico danger" type="button" aria-label="Sil" onClick={() => handleDelete(s.id)}>
                                                <Trash2 size={14} />
                                            </button>
                                            <button className="pz-ico" type="button" aria-label={isOpen ? 'Kapat' : 'Aç'} onClick={() => toggleExpand(s.id)}>
                                                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                            </button>
                                        </div>
                                    </div>

                                    {isOpen && (
                                        <div className="pz-detail">
                                            <div className="pz-sechead">
                                                <span className="pz-sechead-n">Bağlı mesajlar</span>
                                                <span className="pz-rule" />
                                                <span className="pz-sechead-x">{linked.length ? `${linked.length} mesaj` : 'yok'}</span>
                                            </div>

                                            {linked.length > 0 ? (
                                                linked.map(m => {
                                                    const msgObj = messages.find(x => x.id === m.messageId);
                                                    const mch = channelMeta(msgObj?.channel);
                                                    return (
                                                        <div className="pz-card" key={m.messageId}>
                                                            <div className="pz-card-row">
                                                                <span className="pz-av sm" style={{ background: mch.bg, color: mch.fg }}>
                                                                    <mch.Icon size={14} />
                                                                </span>
                                                                <div style={{ minWidth: 0, flexGrow: 1 }}>
                                                                    <div style={{ fontSize: 13, fontWeight: 650 }}>
                                                                        {msgObj?.name || 'Kaydı bulunamayan mesaj'}
                                                                    </div>
                                                                    <div className="pz-sub" style={{ marginTop: 3 }}>
                                                                        {mch.label}
                                                                        {msgObj?.templateName ? ` · ${msgObj.templateName}` : ''}
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    className="pz-btn pz-btn-sm pz-btn-danger"
                                                                    type="button"
                                                                    onClick={() => unlinkMessage(s.id, m.messageId)}
                                                                >
                                                                    Çıkar
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <p style={{ margin: 0, fontSize: 12.5, color: '#6b7480' }}>
                                                    Bu gruba henüz mesaj bağlanmamış — gönderim yapabilmek için en az bir tane gerekiyor.
                                                </p>
                                            )}

                                            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12 }}>
                                                <label className="pz-sr" htmlFor={`msg-select-${s.id}`}>Eklenecek mesaj</label>
                                                <select className="pz-select" style={{ minWidth: 260 }} id={`msg-select-${s.id}`} defaultValue="">
                                                    <option value="">Mesaj seçin…</option>
                                                    {secilebilir.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                                </select>
                                                <button
                                                    className="pz-btn pz-btn-sm"
                                                    type="button"
                                                    onClick={() => {
                                                        const sel = document.getElementById(`msg-select-${s.id}`);
                                                        if (sel?.value) linkMessage(s.id, sel.value);
                                                    }}
                                                >
                                                    <Plus size={13} /> Mesaj Ekle
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </>
                )}
            </section>

            {showForm && <AdSetFormModal wsId={wsId} initial={editItem} campaigns={campaigns} contactGroups={contactGroups} onSave={handleSave} onClose={() => { setShowForm(false); setEditItem(null); }} />}
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3: MESAJLAR (MESSAGES)
// ─────────────────────────────────────────────────────────────────────────────

function MessageFormModal({ wsId, initial, onClose, onSave }) {
    const [name, setName] = useState(initial?.name || '');
    const [channel, setChannel] = useState(initial?.channel || 'WHATSAPP');
    const [externalId, setExternalId] = useState(initial?.externalId || ''); // templateId or agentId
    const [subject, setSubject] = useState(initial?.subject || '');
    const [bodyText, setBodyText] = useState(initial?.bodyText || '');
    
    const [waTemplates, setWaTemplates] = useState([]);
    const [retellAgents, setRetellAgents] = useState([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (channel === 'WHATSAPP') {
            api.get(`/automations/${wsId}/templates`)
                .then(r => setWaTemplates(r.data?.templates || r.data || []))
                .catch(() => setWaTemplates([]));
        } else if (channel === 'AI_CALL') {
            api.get(`/retell/${wsId}/agents`)
                .then(r => setRetellAgents(r.data?.agents || r.data?.data || []))
                .catch(() => setRetellAgents([]));
        }
    }, [wsId, channel]);

    const handleSave = async () => {
        if (!name.trim()) return alert('Mesaj adı zorunlu');
        setSaving(true);
        const selectedTpl = waTemplates.find(t => t.id === externalId);
        await onSave({
            name,
            channel,
            externalId,
            templateId: channel === 'WHATSAPP' ? externalId : null,
            templateName: channel === 'WHATSAPP' ? (selectedTpl?.name || null) : null,
            retellAgentId: channel === 'AI_CALL' ? externalId : null,
            emailSubject: channel === 'EMAIL' ? subject : null,
            emailBody: channel === 'EMAIL' ? bodyText : null,
            content: (channel === 'SMS' || channel === 'WHATSAPP') ? (bodyText || null) : null,
            subject,
            bodyText
        });
        setSaving(false);
    };

    /* Seçili WhatsApp şablonunun metni — onaylı şablon değiştirilemez,
       ne gönderileceğini görebilmek için salt okunur gösteriliyor. */
    const seciliSablon = waTemplates.find(t => t.id === externalId);

    return (
        <div className="pz-overlay" onClick={onClose}>
            <div className="pz-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="pz-mesaj-b">
                <div className="pz-modal-h">
                    <span className="pz-modal-ico"><MessageSquare size={17} /></span>
                    <div style={{ flexGrow: 1, minWidth: 0 }}>
                        <h2 id="pz-mesaj-b">{initial ? 'Mesajı Düzenle' : 'Yeni Mesaj'}</h2>
                        <p>Gruplara bağlanacak içerik. Kanala göre alanlar değişir.</p>
                    </div>
                    <button className="pz-modal-x" type="button" aria-label="Kapat" onClick={onClose}><X size={15} /></button>
                </div>

                <div className="pz-modal-b">
                    <div className="pz-field">
                        <label htmlFor="pz-m-ad">Mesaj adı <span className="pz-req" aria-hidden="true">*</span></label>
                        <input id="pz-m-ad" className="pz-input" value={name} onChange={e => setName(e.target.value)} placeholder="Örn. Eylül kapanış duyurusu" required />
                    </div>

                    <div className="pz-field">
                        <span className="pz-field-l" id="pz-m-kanal-l">Kanal</span>
                        <div className="pz-pills pz-pills-wide" role="group" aria-labelledby="pz-m-kanal-l">
                            {['WHATSAPP', 'AI_CALL', 'EMAIL', 'SMS'].map(code => (
                                <button
                                    key={code}
                                    type="button"
                                    className={`pz-pill ${channel === code ? 'active' : ''}`}
                                    onClick={() => { setChannel(code); setExternalId(''); }}
                                >
                                    {channelMeta(code).label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="pz-modal-rule" />

                    {channel === 'WHATSAPP' && (
                        <>
                            <div className="pz-field">
                                <label htmlFor="pz-m-sablon">Onaylı şablon</label>
                                <select id="pz-m-sablon" className="pz-input" value={externalId} onChange={e => setExternalId(e.target.value)}>
                                    <option value="">Şablon seçin…</option>
                                    {waTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </div>
                            {seciliSablon?.bodyText && (
                                <div className="pz-field">
                                    <span className="pz-field-l">Şablon metni</span>
                                    <p className="pz-preview">{seciliSablon.bodyText}</p>
                                    <span className="pz-hint">Onaylı şablonun metni değiştirilemez — WhatsApp tarafında sabittir.</span>
                                </div>
                            )}
                            <div className="pz-field">
                                <label htmlFor="pz-m-serbest">Serbest metin</label>
                                <textarea id="pz-m-serbest" className="pz-input" value={bodyText} onChange={e => setBodyText(e.target.value)} placeholder="Şablon kullanmayan gönderimler için" />
                            </div>
                        </>
                    )}

                    {channel === 'AI_CALL' && (
                        <div className="pz-field">
                            <label htmlFor="pz-m-ajan">AI sesli asistanı</label>
                            <select id="pz-m-ajan" className="pz-input" value={externalId} onChange={e => setExternalId(e.target.value)}>
                                <option value="">Asistan seçin…</option>
                                {retellAgents.map(a => (
                                    <option key={a.agent_id || a.id} value={a.agent_id || a.id}>
                                        {a.agent_name || a.name || a.agent_id}
                                    </option>
                                ))}
                            </select>
                            <span className="pz-hint">Seçilmezse çalışma alanının varsayılan asistanı kullanılır.</span>
                        </div>
                    )}

                    {channel === 'EMAIL' && (
                        <>
                            <div className="pz-field">
                                <label htmlFor="pz-m-konu">Konu</label>
                                <input id="pz-m-konu" className="pz-input" value={subject} onChange={e => setSubject(e.target.value)} placeholder="E-postanın konu satırı" />
                            </div>
                            <div className="pz-field">
                                <label htmlFor="pz-m-icerik">İçerik</label>
                                <textarea id="pz-m-icerik" className="pz-input" rows={5} value={bodyText} onChange={e => setBodyText(e.target.value)} />
                            </div>
                        </>
                    )}

                    {channel === 'SMS' && (
                        <div className="pz-field">
                            <label htmlFor="pz-m-sms">SMS metni</label>
                            <textarea
                                id="pz-m-sms"
                                className="pz-input"
                                rows={5}
                                placeholder="SMS içeriğini yaz…"
                                value={bodyText}
                                onChange={e => setBodyText(e.target.value)}
                            />
                            <div className="pz-hint" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>NetGSM başlığıyla gönderilir.</span>
                                <span>{bodyText.length} karakter · {Math.ceil(bodyText.length / 160) || 1} SMS</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="pz-modal-f">
                    <button className="pz-btn" type="button" onClick={onClose}>Vazgeç</button>
                    <button className="pz-btn pz-btn-primary" type="button" onClick={handleSave} disabled={saving || !name}>
                        {saving ? 'Kaydediliyor…' : 'Kaydet'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function MessagesTab({ wsId }) {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [channelFilter, setChannelFilter] = useState('');

    const fetchMessages = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(`/marketing-v2/${wsId}/messages`);
            setMessages(res.data.messages || []);
        } catch (e) { console.error(e); }
        setLoading(false);
    }, [wsId]);

    useEffect(() => { fetchMessages(); }, [fetchMessages]);

    const handleSave = async (data) => {
        try {
            if (editItem) await api.put(`/marketing-v2/${wsId}/messages/${editItem.id}`, data);
            else await api.post(`/marketing-v2/${wsId}/messages`, data);
            setShowForm(false);
            setEditItem(null);
            fetchMessages();
        } catch(e) { alert('Hata'); }
    }

    const handleDelete = async (id) => {
        if (!window.confirm('Emin misiniz?')) return;
        try {
            await api.delete(`/marketing-v2/${wsId}/messages/${id}`);
            fetchMessages();
        } catch(e) { alert('Silinemedi'); }
    }

    const filtered = channelFilter ? messages.filter(m => m.channel === channelFilter) : messages;

    const CHANNELS = [
        { value: '',         label: 'Tümü' },
        { value: 'WHATSAPP', label: 'WhatsApp' },
        { value: 'AI_CALL',  label: 'AI Arama' },
        { value: 'EMAIL',    label: 'E-posta' },
        { value: 'SMS',      label: 'SMS' },
    ];

    /** Mesajın neye dayandığı: şablon adı, ajan kimliği, konu ya da metnin başı. */
    const reference = (m) =>
        m.templateName || m.externalId || m.emailSubject || m.subject ||
        (m.content ? m.content.slice(0, 80) : '—');

    return (
        <>
            <PageHead
                title="Mesajlar"
                lede="Gruplara bağlanan hazır içerikler: WhatsApp şablonları, arama senaryoları, e-posta ve SMS metinleri."
            />

            <div className="pz-filters">
                <div className="pz-pills" role="group" aria-label="Kanal">
                    {CHANNELS.map(o => (
                        <button
                            key={o.value}
                            type="button"
                            className={`pz-pill ${channelFilter === o.value ? 'active' : ''}`}
                            onClick={() => setChannelFilter(o.value)}
                        >
                            {o.label}
                        </button>
                    ))}
                </div>
                <span className="pz-spacer" />
                <button className="pz-btn pz-btn-primary" type="button" onClick={() => setShowForm(true)}>
                    <Plus size={15} /> Yeni Mesaj
                </button>
            </div>

            <section className="pz-surface">
                {loading ? (
                    <div className="pz-loading">Yükleniyor…</div>
                ) : filtered.length === 0 ? (
                    <EmptyState
                        Icon={MessageSquare}
                        title="Mesaj yok"
                        note={channelFilter ? 'Bu kanalda kayıtlı mesaj bulunmuyor.' : 'Gruplara bağlamak için önce bir mesaj oluştur.'}
                    />
                ) : (
                    <>
                        <div className="pz-cols msg">
                            <span />
                            <span>Mesaj</span>
                            <span>Kanal</span>
                            <span>İçerik</span>
                            <span>Kullanım</span>
                            <span />
                        </div>
                        {filtered.map(m => {
                            const ch = channelMeta(m.channel);
                            return (
                                <div className="pz-row msg" key={m.id}>
                                    <span className="pz-av" style={{ background: ch.bg, color: ch.fg }}>
                                        <ch.Icon size={16} />
                                    </span>
                                    <div style={{ minWidth: 0 }}>
                                        <div className="pz-name" style={{ cursor: 'default' }}>{m.name}</div>
                                    </div>
                                    <span className="pz-chip" style={{ background: ch.bg, color: ch.fg }}>{ch.label}</span>
                                    <span
                                        style={{ fontSize: 12.5, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                        title={reference(m)}
                                    >
                                        {reference(m)}
                                    </span>
                                    <span style={{ fontSize: 12.5, fontWeight: 600, color: '#475569' }}>
                                        {m.usageCount ? `${m.usageCount} grupta` : 'Kullanılmıyor'}
                                    </span>
                                    <div className="pz-acts">
                                        <button className="pz-ico" type="button" aria-label="Düzenle" onClick={() => { setEditItem(m); setShowForm(true); }}>
                                            <Edit2 size={14} />
                                        </button>
                                        <button className="pz-ico danger" type="button" aria-label="Sil" onClick={() => handleDelete(m.id)}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </>
                )}
            </section>

            {showForm && <MessageFormModal wsId={wsId} initial={editItem} onSave={handleSave} onClose={() => { setShowForm(false); setEditItem(null); }} />}
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4: LİSTELER (ContactGroups - REUSED FROM ORIGINAL GroupsTab)
// ─────────────────────────────────────────────────────────────────────────────

function ListsTab({ wsId }) {
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editGroup, setEditGroup] = useState(null);
    const [listType, setListType] = useState('manual'); // 'manual' | 'smart'

    // Smart Segments
    const [smartSegments, setSmartSegments] = useState([]);
    const [segmentCounts, setSegmentCounts] = useState({});
    const [segmentsLoading, setSegmentsLoading] = useState(false);

    const [viewGroup, setViewGroup] = useState(null);
    const [members, setMembers] = useState([]);
    const [membersLoading, setMembersLoading] = useState(false);
    const [memberSearch, setMemberSearch] = useState('');
    const [memberTotal, setMemberTotal] = useState(0);

    // Kişi ekleme state'leri
    const [showAddMember, setShowAddMember] = useState(false);
    const [addSearch, setAddSearch] = useState('');
    const [addResults, setAddResults] = useState([]);
    const [addLoading, setAddLoading] = useState(false);
    const [addingId, setAddingId] = useState(null);

    const fetchGroups = useCallback(async () => {
        if (!wsId) return;
        setLoading(true);
        try {
            const res = await api.get(`/contact-groups/${wsId}/groups`);
            setGroups(res.data.groups || []);
        } catch (e) { console.error(e); }
        setLoading(false);
    }, [wsId]);

    // Smart segmentleri yükle
    const fetchSmartSegments = useCallback(async () => {
        if (!wsId) return;
        setSegmentsLoading(true);
        try {
            // counts uç noktası { "segment_id": 12, ... } biçiminde NESNE döndürüyor.
            // Burada dizi sanılıp .forEach çağrılıyordu: nesnede o metot yok, atılan
            // TypeError catch'e düşüyor ve segment TANIMLARI da siliniyordu — sunucu
            // iki isteği de başarıyla yanıtlamasına rağmen ekranda "(0)" görünüyordu.
            // Sayı isteği ayrıca kendi hatasını yutuyor: sayılar gelmezse bile
            // segmentlerin listelenmesi engellenmemeli.
            const [defsRes, countsRes] = await Promise.all([
                api.get(`/smart-segments/${wsId}/segments/definitions`),
                api.get(`/smart-segments/${wsId}/segments/counts`)
                    .catch(err => { console.error('Segment sayıları alınamadı:', err); return { data: {} }; })
            ]);
            setSmartSegments(defsRes.data.segments || []);
            setSegmentCounts(countsRes.data.counts || {});
        } catch (e) {
            console.error('Smart segments yüklenemedi:', e);
            setSmartSegments([]);
        }
        setSegmentsLoading(false);
    }, [wsId]);

    useEffect(() => { fetchGroups(); fetchSmartSegments(); }, [fetchGroups, fetchSmartSegments]);

    const fetchMembers = useCallback(async (groupId, search = '') => {
        if (!wsId || !groupId) return;
        setMembersLoading(true);
        try {
            const res = await api.get(`/contact-groups/${wsId}/groups/${groupId}/members`, {
                params: { search, limit: 100 }
            });
            setMembers(res.data.members || []);
            setMemberTotal(res.data.total || (res.data.members || []).length);
        } catch (e) {
            console.error('Üyeler yüklenemedi:', e);
        } finally {
            setMembersLoading(false);
        }
    }, [wsId]);

    useEffect(() => {
        if (viewGroup) {
            fetchMembers(viewGroup.id, memberSearch);
        }
    }, [viewGroup, memberSearch, fetchMembers]);

    const handleRemoveMember = async (contactId) => {
        if (!window.confirm('Bu kişiyi listeden çıkarmak istediğinize emin misiniz?')) return;
        try {
            await api.delete(`/contact-groups/${wsId}/groups/${viewGroup.id}/members/${contactId}`);
            setMembers(prev => prev.filter(m => m.id !== contactId));
            setMemberTotal(prev => Math.max(0, prev - 1));
            setGroups(prev => prev.map(g => g.id === viewGroup.id ? { ...g, _count: { members: Math.max(0, (g._count?.members || 1) - 1) } } : g));
        } catch (e) {
            alert('Kişi listeden çıkarılamadı');
        }
    };

    const handleCreate = async (data) => {
        try {
            const res = await api.post(`/contact-groups/${wsId}/groups`, data);
            setGroups(prev => [res.data, ...prev]);
            setShowForm(false);
        } catch (e) { alert('Hata: ' + (e.response?.data?.error || e.message)); }
    };

    const handleUpdate = async (data) => {
        try {
            const res = await api.put(`/contact-groups/${wsId}/groups/${editGroup.id}`, data);
            setGroups(prev => prev.map(g => g.id === editGroup.id ? { ...g, ...res.data } : g));
            setEditGroup(null);
        } catch (e) { alert('Güncellenemedi: ' + (e.response?.data?.error || e.message)); }
    };

    const handleDelete = async (group) => {
        if (!window.confirm(`"${group.name}" silinecek. Onaylıyor musunuz?`)) return;
        try {
            await api.delete(`/contact-groups/${wsId}/groups/${group.id}`);
            setGroups(prev => prev.filter(g => g.id !== group.id));
        } catch (e) { alert('Silinemedi'); }
    };

    // Kişi arama (listeye eklemek için)
    const searchContacts = useCallback(async (q) => {
        if (!q || q.length < 2) { setAddResults([]); return; }
        setAddLoading(true);
        try {
            const res = await api.get(`/contacts/${wsId}`, { params: { search: q, limit: 20 } });
            const contacts = res.data.contacts || res.data || [];
            // Zaten listede olanları filtrele
            const memberIds = new Set(members.map(m => m.id));
            setAddResults(contacts.filter(c => !memberIds.has(c.id)));
        } catch (e) { console.error(e); }
        setAddLoading(false);
    }, [wsId, members]);

    useEffect(() => {
        const timer = setTimeout(() => searchContacts(addSearch), 300);
        return () => clearTimeout(timer);
    }, [addSearch, searchContacts]);

    const handleAddMember = async (contactId) => {
        if (!viewGroup) return;
        setAddingId(contactId);
        try {
            await api.post(`/contact-groups/${wsId}/groups/${viewGroup.id}/members`, { contactIds: [contactId] });
            fetchMembers(viewGroup.id, memberSearch);
            setGroups(prev => prev.map(g => g.id === viewGroup.id ? { ...g, _count: { members: (g._count?.members || 0) + 1 } } : g));
            setAddResults(prev => prev.filter(c => c.id !== contactId));
        } catch (e) {
            alert('Eklenemedi: ' + (e.response?.data?.error || e.message));
        }
        setAddingId(null);
    };

    /* Segment renkleri kimliğe bağlı; tanımsız gelen segment nötr moru alır. */
    const SEGMENT_COLORS = {
        cold_leads: '#475569', warm_leads: '#b45309', hot_leads: '#b91c1c',
        silent_30_days: '#475569', has_phone: '#1d4ed8', has_email: '#7e22ce',
        whatsapp_active: '#15803d', recent_contacts: '#0e7490'
    };

    return (
        <>
            <PageHead
                title="Listeler"
                lede="Gönderimlerin hedef kitlesi. Elle kurduğun listeler ve sistemin kendi ürettiği segmentler."
            />

            <div className="pz-filters">
                <div className="pz-pills" role="group" aria-label="Liste türü">
                    {[
                        { key: 'manual', label: 'Manuel listeler', n: groups.length },
                        { key: 'smart',  label: 'Otomatik segmentler', n: smartSegments.length }
                    ].map(t => (
                        <button
                            key={t.key}
                            type="button"
                            className={`pz-pill ${listType === t.key ? 'active' : ''}`}
                            onClick={() => setListType(t.key)}
                        >
                            {t.label}<i>{t.n}</i>
                        </button>
                    ))}
                </div>
                <span className="pz-spacer" />
                {listType === 'manual' && (
                    <button className="pz-btn pz-btn-primary" type="button" onClick={() => setShowForm(true)}>
                        <Plus size={15} /> Yeni Liste
                    </button>
                )}
            </div>

            {/* Otomatik Segmentler Görünümü */}
            {listType === 'smart' && (
                segmentsLoading ? (
                    <div className="pz-surface"><div className="pz-loading">Yükleniyor…</div></div>
                ) : smartSegments.length === 0 ? (
                    <div className="pz-surface">
                        <EmptyState
                            Icon={Users}
                            title="Otomatik segment yok"
                            note="Segmentler kişi hareketlerine göre kendiliğinden oluşur."
                        />
                    </div>
                ) : (
                    <div className="pz-seg">
                        {smartSegments.map(seg => {
                            const count = segmentCounts[seg.id] || 0;
                            const color = SEGMENT_COLORS[seg.id] || '#7e22ce';
                            return (
                                <div className="pz-seg-card" key={seg.id}>
                                    <div className="pz-seg-top">
                                        <span className="pz-av" style={{ background: color + '14', color }}>
                                            <Users size={15} />
                                        </span>
                                        <span className="pz-badge" style={{ background: color + '14', color }}>
                                            {count.toLocaleString('tr-TR')}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: 13.5, fontWeight: 650, marginBottom: 4 }}>{seg.name}</div>
                                    {seg.description && (
                                        <div style={{ fontSize: 12, lineHeight: 1.45, color: '#6b7480' }}>{seg.description}</div>
                                    )}
                                    {seg.group && (
                                        <div style={{ marginTop: 8, fontSize: 11.5, color: '#6b7480' }}>
                                            Grup: <strong style={{ color: '#475569' }}>{seg.group}</strong>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )
            )}

            {/* Manuel Listeler Görünümü */}
            {listType === 'manual' && (
                <section className="pz-surface">
                    {loading ? (
                        <div className="pz-loading">Yükleniyor…</div>
                    ) : groups.length === 0 ? (
                        <EmptyState
                            Icon={Users}
                            title="Liste yok"
                            note="Gönderim yapmak için önce bir hedef kitle listesi oluştur."
                        />
                    ) : (
                        <>
                            <div className="pz-cols list">
                                <span />
                                <span>Liste</span>
                                <span>Açıklama</span>
                                <span>Kişi</span>
                                <span />
                            </div>
                            {groups.map(g => (
                                <div
                                    className="pz-row list clickable"
                                    key={g.id}
                                    onClick={() => { setViewGroup(g); setMemberSearch(''); }}
                                >
                                    <span className="pz-av">{initials(g.name)}</span>
                                    <button
                                        type="button"
                                        className="pz-name"
                                        onClick={e => { e.stopPropagation(); setViewGroup(g); setMemberSearch(''); }}
                                    >
                                        {g.name}
                                    </button>
                                    <span style={{ fontSize: 12.5, color: '#6b7480' }}>{g.description || '—'}</span>
                                    <span className="pz-num">{num(g._count?.members || 0)}</span>
                                    <div className="pz-acts" onClick={e => e.stopPropagation()}>
                                        <button className="pz-ico" type="button" aria-label="Kişileri görüntüle" onClick={() => { setViewGroup(g); setMemberSearch(''); }}>
                                            <Eye size={14} />
                                        </button>
                                        <button className="pz-ico" type="button" aria-label="Düzenle" onClick={() => { setEditGroup(g); setShowForm(true); }}>
                                            <Edit2 size={14} />
                                        </button>
                                        <button className="pz-ico danger" type="button" aria-label="Sil" onClick={() => handleDelete(g)}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </section>
            )}

            {showForm && (
                <div className="pz-overlay" onClick={() => { setShowForm(false); setEditGroup(null); }}>
                    <div className="pz-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="pz-liste-b">
                        <form onSubmit={e => {
                            e.preventDefault();
                            const fd = new FormData(e.target);
                            const data = { name: fd.get('name'), description: fd.get('desc'), color: fd.get('color'), icon: '👥' };
                            editGroup ? handleUpdate(data) : handleCreate(data);
                        }}>
                            <div className="pz-modal-h">
                                <span className="pz-modal-ico"><Users size={17} /></span>
                                <div style={{ flexGrow: 1, minWidth: 0 }}>
                                    <h2 id="pz-liste-b">{editGroup ? 'Listeyi Düzenle' : 'Yeni Liste'}</h2>
                                    <p>Gönderimlerde hedef kitle olarak seçebileceğin kişi listesi.</p>
                                </div>
                                <button className="pz-modal-x" type="button" aria-label="Kapat" onClick={() => { setShowForm(false); setEditGroup(null); }}>
                                    <X size={15} />
                                </button>
                            </div>

                            <div className="pz-modal-b">
                                <div className="pz-field">
                                    <label htmlFor="pz-l-ad">Liste adı <span className="pz-req" aria-hidden="true">*</span></label>
                                    <input id="pz-l-ad" name="name" className="pz-input" defaultValue={editGroup?.name || ''} placeholder="Örn. Gaziemir üyeleri" required />
                                </div>
                                <div className="pz-field">
                                    <label htmlFor="pz-l-ac">Açıklama</label>
                                    <input id="pz-l-ac" name="desc" className="pz-input" defaultValue={editGroup?.description || ''} placeholder="Bu listede kimler var?" />
                                </div>
                                <div className="pz-field">
                                    <label htmlFor="pz-l-renk">Renk</label>
                                    <input id="pz-l-renk" name="color" type="color" className="pz-input" style={{ padding: 4, height: 42, width: 84, cursor: 'pointer' }} defaultValue={editGroup?.color || '#ef4444'} />
                                    <span className="pz-hint">Listeyi listede ve gönderim ekranlarında ayırt etmek için.</span>
                                </div>
                            </div>

                            <div className="pz-modal-f">
                                <button className="pz-btn" type="button" onClick={() => { setShowForm(false); setEditGroup(null); }}>Vazgeç</button>
                                <button type="submit" className="pz-btn pz-btn-primary">Kaydet</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Listeye Kayıtlı Kişiler / Üye Görüntüleme Modalı */}
            {viewGroup && (
                <div className="pz-overlay" onClick={() => { setViewGroup(null); setMemberSearch(''); }}>
                    <div className="pz-modal wide" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="pz-uye-b">
                        <div className="pz-modal-h" style={{ alignItems: 'center' }}>
                            <span className="pz-av" style={{ width: 40, height: 40, borderRadius: 12, fontSize: 13 }}>
                                {initials(viewGroup.name)}
                            </span>
                            <div style={{ flexGrow: 1, minWidth: 0 }}>
                                <h2 id="pz-uye-b">{viewGroup.name}</h2>
                                <p>{viewGroup.description || 'Hedef kitle listesi'} · {num(memberTotal || members.length)} kişi</p>
                            </div>
                            <button className="pz-modal-x" type="button" aria-label="Kapat" onClick={() => { setViewGroup(null); setMemberSearch(''); }}>
                                <X size={15} />
                            </button>
                        </div>

                        <div style={{ padding: '0 24px 14px', display: 'flex', gap: 9, alignItems: 'center' }}>
                            <label className="pz-sr" htmlFor="pz-uye-ara">Bu listede ara</label>
                            <input
                                id="pz-uye-ara"
                                className="pz-input"
                                type="search"
                                placeholder="Bu listede ara — ad, telefon, e-posta"
                                value={memberSearch}
                                onChange={e => setMemberSearch(e.target.value)}
                                style={{ flexGrow: 1 }}
                            />
                            <button
                                className={`pz-btn ${showAddMember ? '' : 'pz-btn-primary'}`}
                                type="button"
                                onClick={() => { setShowAddMember(!showAddMember); setAddSearch(''); setAddResults([]); }}
                            >
                                <Plus size={14} /> Kişi Ekle
                            </button>
                        </div>

                        {showAddMember && (
                            <div style={{ margin: '0 24px 14px', padding: '14px 16px', borderRadius: 14, background: '#fafafb', boxShadow: 'inset 0 0 0 1px #f0eced' }}>
                                <div className="pz-field">
                                    <label className="pz-sr" htmlFor="pz-uye-ekle">Kişi adı veya telefon</label>
                                    <input
                                        id="pz-uye-ekle"
                                        className="pz-input"
                                        type="search"
                                        placeholder="Kişi adı veya telefon ile ara…"
                                        value={addSearch}
                                        onChange={e => setAddSearch(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                                {addLoading && <p className="pz-hint" style={{ textAlign: 'center', margin: '10px 0 0' }}>Aranıyor…</p>}
                                {addResults.length > 0 && (
                                    <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 8 }}>
                                        {addResults.map(c => (
                                            <div className="pz-card" key={c.id} style={{ padding: '9px 12px' }}>
                                                <div className="pz-card-row">
                                                    <span className="pz-av sm">{initials(c.name)}</span>
                                                    <div style={{ flexGrow: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: 12.5, fontWeight: 650 }}>{c.name || 'İsimsiz'}</div>
                                                        <div className="pz-hint">{c.phone || c.email || '—'}</div>
                                                    </div>
                                                    <button
                                                        className="pz-btn pz-btn-sm"
                                                        type="button"
                                                        onClick={() => handleAddMember(c.id)}
                                                        disabled={addingId === c.id}
                                                    >
                                                        {addingId === c.id ? 'Eklendi' : 'Ekle'}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {addSearch.length >= 2 && !addLoading && addResults.length === 0 && (
                                    <p className="pz-hint" style={{ textAlign: 'center', margin: '10px 0 0' }}>Sonuç bulunamadı.</p>
                                )}
                            </div>
                        )}

                        <div className="pz-modal-b" style={{ paddingTop: 0 }}>
                            {membersLoading ? (
                                <div className="pz-loading" style={{ padding: 36 }}>Kişiler yükleniyor…</div>
                            ) : members.length === 0 ? (
                                <EmptyState
                                    Icon={Users}
                                    title={memberSearch ? 'Aramaya uyan kişi yok' : 'Bu listede kişi yok'}
                                    note="Kişiler menüsünden müşteri seçip bu listeye ekleyebilirsin."
                                />
                            ) : (
                                <div className="pz-tbl">
                                    <div className="pz-tbl-cols" style={{ gridTemplateColumns: 'minmax(0,1.2fr) 150px minmax(0,1.3fr) 104px 40px' }}>
                                        <span>Kişi</span>
                                        <span>Telefon</span>
                                        <span>E-posta</span>
                                        <span>Eklenme</span>
                                        <span />
                                    </div>
                                    {members.map(m => (
                                        <div className="pz-tbl-row" key={m.id} style={{ gridTemplateColumns: 'minmax(0,1.2fr) 150px minmax(0,1.3fr) 104px 40px' }}>
                                            <span style={{ fontWeight: 650 }}>{m.name || 'İsimsiz müşteri'}</span>
                                            <span style={{ color: '#475569', fontVariantNumeric: 'tabular-nums' }}>{m.phone || '—'}</span>
                                            <span style={{ color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {m.email || '—'}
                                            </span>
                                            <span className="pz-tnum" style={{ textAlign: 'left' }}>
                                                {m.addedAt ? new Date(m.addedAt).toLocaleDateString('tr-TR') : '—'}
                                            </span>
                                            <button className="pz-ico danger" type="button" aria-label="Listeden çıkar" onClick={() => handleRemoveMember(m.id)}>
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="pz-modal-f" style={{ justifyContent: 'space-between' }}>
                            <span className="pz-hint">
                                Bu listeyi <strong style={{ color: '#0b1220' }}>Gruplar</strong> sekmesinde hedef kitle olarak seçebilirsin.
                            </span>
                            <button className="pz-btn" type="button" onClick={() => { setViewGroup(null); setMemberSearch(''); }}>
                                Kapat
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function Marketing() {
    const { currentWorkspace } = useAuth();
    const [activeTab, setActiveTab] = useState('campaigns');
    const [filterCampaignId, setFilterCampaignId] = useState('');

    const wsId = currentWorkspace?.id;

    const TABS = [
        { key: 'campaigns', label: 'Kampanyalar',  Icon: Megaphone },
        { key: 'adsets',    label: 'Gruplar',      Icon: Folder },
        { key: 'messages',  label: 'Mesajlar',     Icon: MessageSquare },
        { key: 'lists',     label: 'Listeler',     Icon: Users },
    ];

    const goToGroups = (campaignId) => {
        setFilterCampaignId(campaignId);
        setActiveTab('adsets');
    };

    return (
        <div className="mkt-page base-layout">
            {/* Sol Sidebar */}
            <div className="base-sidebar">
                <div className="base-sidebar-header">
                    <div className="base-sidebar-header-icon">
                        <Megaphone size={16} />
                    </div>
                    <span>Pazarlama</span>
                </div>
                {/* Vurgu rengi .base-nav-item'ın kendi kuralından geliyor (kırmızı).
                    Buradaki satır içi mavi zorlamalar kaldırıldı: Pazarlama tek
                    başına mavi kalıyor, ayarlar sayfalarının hiçbiri öyle değil. */}
                <nav className="base-nav">
                    {TABS.map(({ key, label, Icon }) => (
                        <button
                            key={key}
                            className={`base-nav-item ${activeTab === key ? 'active' : ''}`}
                            onClick={() => { setActiveTab(key); if (key !== 'adsets') setFilterCampaignId(''); }}
                        >
                            <Icon size={16} />
                            {label}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Sağ İçerik */}
            <div className="base-content">
                <div className="pz">
                    {activeTab === 'campaigns' && <CampaignsTab wsId={wsId} onGoToGroups={goToGroups} />}
                    {activeTab === 'adsets'    && <AdSetsTab wsId={wsId} initialCampaignFilter={filterCampaignId} />}
                    {activeTab === 'messages'  && <MessagesTab wsId={wsId} />}
                    {activeTab === 'lists'     && <ListsTab wsId={wsId} />}
                </div>
            </div>
        </div>
    );
}
