
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api, { marketingV2API } from '../../services/api';
import {
    Megaphone, Folder, MessageSquare, Users, Plus, Edit2, Trash2, Send,
    BarChart2, Phone, Mail, Smartphone, Play, CheckCircle, XCircle, Search, Settings, ArrowRight, ChevronRight, ChevronDown,
    Loader2, Sparkles, RefreshCw, Calendar, Filter, X, Eye
} from 'lucide-react';
import CampaignWizardModal from './CampaignWizardModal';
import { getDateRangeLogic, dateFilterOptions } from '../../utils/dateFilters';
import './Marketing.css';
import '../KnowledgeBase/KnowledgeBase.css';

// ─────────────────────────────────────────────────────────────────────────────
// SHARED UTILS & COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

const GROUP_COLORS = [
    '#2563eb','#16a34a','#dc2626','#ca8a04','#7c3aed',
    '#0891b2','#db2777','#ea580c','#65a30d','#475569'
];

function StatBig({ icon, label, value, color, sub }) {
    return (
        <div className="mkt-stat-card">
            <div className="mkt-stat-icon" style={{ background: color + '1a', color }}>{icon}</div>
            <div>
                <div className="mkt-stat-value" style={{ color }}>{value} {sub && <small style={{ fontSize: 13, color: '#9ca3af' }}>{sub}</small>}</div>
                <div className="mkt-stat-label">{label}</div>
            </div>
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
        <div className="mkt-modal-overlay" onClick={onClose}>
            <div className="grp-form-modal" onClick={e => e.stopPropagation()}>
                <div className="grp-modal-header">
                    <h2 className="grp-modal-title">{initial ? 'Kampanyayı Düzenle' : 'Yeni Kampanya'}</h2>
                    <button className="grp-modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="grp-modal-body">
                    <div className="grp-field">
                        <label className="grp-label">Kampanya Adı</label>
                        <input className="grp-input" value={name} onChange={e => setName(e.target.value)} placeholder="örn. Kış İndirimi" />
                    </div>
                    <div className="grp-field">
                        <label className="grp-label">Açıklama</label>
                        <input className="grp-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Açıklama" />
                    </div>
                    <div className="grp-field">
                        <label className="grp-label">Bütçe (TL)</label>
                        <input className="grp-input" type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="0.00" />
                    </div>
                    <div className="grp-field" style={{ display: 'flex', gap: 10 }}>
                        <div style={{ flex: 1 }}>
                            <label className="grp-label">Başlangıç</label>
                            <input className="grp-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label className="grp-label">Bitiş</label>
                            <input className="grp-input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                        </div>
                    </div>
                </div>
                <div className="grp-modal-footer">
                    <button className="grp-btn-cancel" onClick={onClose}>İptal</button>
                    <button className="grp-btn-save" style={{ background: '#2563eb' }} onClick={handleSave} disabled={saving || !name}>
                        {saving ? 'Kaydediliyor...' : 'Kaydet'}
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

    const isAutoCampaign = (c) => c.isAutomation || c.campaignType === 'AUTO' || c.campaignType === 'DYNAMIC' || c.campaignType === 'TRIGGERED';

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
    };

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
        // Tip Filtresi: Manuel vs Otomatik
        if (typeFilter === 'MANUAL' && isAutoCampaign(c)) return false;
        if (typeFilter === 'AUTO' && !isAutoCampaign(c)) return false;

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

    const getStatusBadge = (c) => {
        const s = c.status;
        if (s === 'ACTIVE' || s === 'SENDING') return { label: '🟢 Aktif', bg: '#dcfce7', color: '#15803d' };
        if (s === 'COMPLETED') return { label: 'Tamamlandı', bg: '#f1f5f9', color: '#64748b' };
        if (s === 'PAUSED' || s === 'INACTIVE') return { label: 'Pasif', bg: '#f3f4f6', color: '#6b7280' };
        if (s === 'DRAFT') return { label: 'Taslak', bg: '#fefce8', color: '#a16207' };
        return { label: s || 'Taslak', bg: '#fefce8', color: '#a16207' };
    };

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

    const CHANNEL_BADGE = {
        WHATSAPP: { icon: <MessageSquare size={11} />, label: 'WhatsApp', bg: '#dcfce7', color: '#15803d' },
        AI_CALL: { icon: <Phone size={11} />, label: 'AI Arama', bg: '#e0e7ff', color: '#3730a3' },
        SMS: { icon: <Smartphone size={11} />, label: 'SMS', bg: '#f3e8ff', color: '#7e22ce' },
        EMAIL: { icon: <Mail size={11} />, label: 'E-posta', bg: '#fef3c7', color: '#b45309' },
    };

    // Eğer detay seçilmişse inline drill-down göster
    if (detailCampaignId) {
        const camp = campaigns.find(c => c.id === detailCampaignId) || detailView?.campaign;
        const groups = detailView?.groups || [];
        const detail = detailView;

        return (
            <div style={{ padding: '24px 28px' }}>
                {/* Geri Butonu */}
                <button onClick={backToList} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 14, color: '#6b7280', fontWeight: 500, marginBottom: 16, padding: 0,
                }} onMouseOver={e => e.currentTarget.style.color = '#2563eb'}
                   onMouseOut={e => e.currentTarget.style.color = '#6b7280'}>
                    <ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} /> Kampanyalara Dön
                </button>

                {detailLoading ? (
                    <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                        <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} />
                        <div style={{ marginTop: 10 }}>Yükleniyor...</div>
                    </div>
                ) : !camp ? (
                    <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Kampanya bulunamadı</div>
                ) : (
                    <>
                        {/* Kampanya Başlığı */}
                        <div style={{
                            background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
                            borderRadius: 16, padding: '24px 28px', marginBottom: 24,
                            border: '1px solid #e2e8f0'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                <div>
                                    <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#0f172a' }}>{camp.name}</h2>
                                    {camp.description && <p style={{ margin: '6px 0 0', fontSize: 14, color: '#64748b' }}>{camp.description}</p>}
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <span style={{
                                        fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 8,
                                        background: camp.status === 'ACTIVE' || camp.status === 'SENDING' ? '#dcfce7' : camp.status === 'COMPLETED' ? '#f1f5f9' : '#fefce8',
                                        color: camp.status === 'ACTIVE' || camp.status === 'SENDING' ? '#15803d' : camp.status === 'COMPLETED' ? '#64748b' : '#a16207'
                                    }}>
                                        {camp.status === 'ACTIVE' || camp.status === 'SENDING' ? '🟢 Aktif' : camp.status === 'COMPLETED' ? 'Tamamlandı' : camp.status || 'Taslak'}
                                    </span>
                                </div>
                            </div>

                            {/* İstatistik Kartları */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 20 }}>
                                {[
                                    { label: 'Gönderildi', value: detail?.sentCount || camp.sentCount || 0, color: '#2563eb', icon: <Send size={16}/> },
                                    { label: 'Teslim', value: detail?.deliveredCount || camp.deliveredCount || 0, color: '#16a34a', icon: <CheckCircle size={16}/> },
                                    { label: 'Okundu', value: detail?.readCount || camp.readCount || 0, color: '#7c3aed', icon: <Eye size={16}/> },
                                    { label: 'Başarısız', value: detail?.failedCount || camp.failedCount || 0, color: '#dc2626', icon: <XCircle size={16}/> },
                                    { label: 'Yanıtlayan', value: detail?.repliedCount || camp.repliedCount || 0, color: '#0891b2', icon: <MessageSquare size={16}/> }
                                ].map(s => (
                                    <div key={s.label} style={{
                                        background: '#fff', border: `1px solid ${s.color}22`, borderRadius: 12,
                                        padding: '14px 16px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: s.color }}>
                                            {s.icon}
                                            <span style={{ fontSize: 24, fontWeight: 700 }}>{s.value}</span>
                                        </div>
                                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, fontWeight: 500 }}>{s.label}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

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
                                <div style={{ marginBottom: 20 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Folder size={18} style={{ color: '#2563eb' }} /> Reklam Grupları ({groupedTags.length}) — {groups.length} Gönderi
                                        </h3>
                                    </div>

                                    {groups.length === 0 ? (
                                        <div style={{
                                            textAlign: 'center', padding: '40px 20px', background: '#f8fafc',
                                            borderRadius: 12, border: '1px dashed #e2e8f0', color: '#94a3b8'
                                        }}>
                                            <Folder size={28} style={{ marginBottom: 8, opacity: 0.4 }} />
                                            <div style={{ fontSize: 14, fontWeight: 500 }}>Bu kampanyada henüz reklam grubu yok</div>
                                            <div style={{ fontSize: 12, marginTop: 4 }}>Reklam Grupları sekmesinden bu kampanyaya grup ekleyebilirsiniz</div>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            {groupedTags.map(grp => {
                                                const tagSuccessRate = grp.totalSent > 0 ? Math.round((grp.totalDelivered / grp.totalSent) * 100) : 0;
                                                const channels = [...new Set(grp.sends.map(s => s.channel))];
                                                return (
                                                    <details key={grp.tag} open style={{
                                                        background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0',
                                                        overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                                                    }}>
                                                        {/* Grup Başlığı (Tıklanabilir) */}
                                                        <summary style={{
                                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                            padding: '14px 20px', cursor: 'pointer', userSelect: 'none',
                                                            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                                                            borderBottom: '1px solid #e2e8f0', listStyle: 'none'
                                                        }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                                <ChevronDown size={16} style={{ color: '#64748b', transition: 'transform 0.2s' }} />
                                                                <div style={{
                                                                    width: 32, height: 32, borderRadius: 8,
                                                                    background: '#2563eb15', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                                }}>
                                                                    <Folder size={16} style={{ color: '#2563eb' }} />
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{grp.tag}</div>
                                                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                                                                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{grp.sends.length} gönderi</span>
                                                                        {channels.map(ch => {
                                                                            const b = CHANNEL_BADGE[ch];
                                                                            return b ? <span key={ch} style={{ fontSize: 9, background: b.bg, color: b.color, padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>{b.label}</span> : null;
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                                                <div style={{ textAlign: 'right' }}>
                                                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{grp.totalSent.toLocaleString()}</div>
                                                                    <div style={{ fontSize: 10, color: '#94a3b8' }}>toplam gönderim</div>
                                                                </div>
                                                                {grp.totalSent > 0 && (
                                                                    <div style={{
                                                                        width: 42, height: 42, borderRadius: '50%',
                                                                        background: `conic-gradient(${tagSuccessRate >= 80 ? '#16a34a' : tagSuccessRate >= 50 ? '#f59e0b' : '#dc2626'} ${tagSuccessRate * 3.6}deg, #f1f5f9 0deg)`,
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                                    }}>
                                                                        <div style={{
                                                                            width: 34, height: 34, borderRadius: '50%', background: '#fff',
                                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                            fontSize: 10, fontWeight: 700, color: '#374151'
                                                                        }}>%{tagSuccessRate}</div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </summary>

                                                        {/* Gönderimler Listesi */}
                                                        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                            {grp.sends.map((g, idx) => {
                                                                const chBadge = CHANNEL_BADGE[g.channel] || {};
                                                                const sent = g.sentCount || 0;
                                                                const delivered = g.deliveredCount || 0;
                                                                const read = g.readCount || 0;
                                                                const failed = g.failedCount || 0;
                                                                const total = g.totalCount || sent;
                                                                const rate = total > 0 ? Math.round((delivered / total) * 100) : 0;
                                                                const dateStr = g.sentAt ? new Date(g.sentAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
                                                                    : g.scheduledAt ? new Date(g.scheduledAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
                                                                    : new Date(g.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });

                                                                return (
                                                                    <div key={g.id} style={{
                                                                        background: '#fafbfc', borderRadius: 10, border: '1px solid #f1f5f9',
                                                                        padding: '12px 16px'
                                                                    }}>
                                                                        {/* Gönderi Başlığı */}
                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: sent > 0 ? 8 : 0 }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                                <span style={{
                                                                                    width: 22, height: 22, borderRadius: 6,
                                                                                    background: chBadge.bg || '#f1f5f9',
                                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                                    fontSize: 11
                                                                                }}>{chBadge.icon || <Send size={10}/>}</span>
                                                                                <div>
                                                                                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                                                                                        Gönderi {idx + 1}
                                                                                    </span>
                                                                                    <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>
                                                                                        📅 {dateStr}
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                                                {g.list && <span style={{ fontSize: 11, background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 5, fontWeight: 500 }}>🎯 {g.list.name}</span>}
                                                                                {g.segmentName && <span style={{ fontSize: 11, background: '#faf5ff', color: '#7c3aed', padding: '2px 8px', borderRadius: 5, fontWeight: 500 }}>📊 {g.segmentName}</span>}
                                                                                <span style={{
                                                                                    padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                                                                                    background: g.status === 'COMPLETED' ? '#dcfce7' : g.status === 'SENDING' ? '#dbeafe' : '#f3f4f6',
                                                                                    color: g.status === 'COMPLETED' ? '#166534' : g.status === 'SENDING' ? '#1e40af' : '#6b7280'
                                                                                }}>{g.status || 'DRAFT'}</span>
                                                                            </div>
                                                                        </div>

                                                                        {/* İstatistikler */}
                                                                        {sent > 0 && (
                                                                            <div>
                                                                                <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#64748b', marginBottom: 4 }}>
                                                                                    <span>Gönderilen: <strong style={{ color: '#334155' }}>{sent}</strong></span>
                                                                                    <span>Teslim: <strong style={{ color: '#16a34a' }}>{delivered}</strong></span>
                                                                                    <span>Okunan: <strong style={{ color: '#7c3aed' }}>{read}</strong></span>
                                                                                    {failed > 0 && <span>Başarısız: <strong style={{ color: '#dc2626' }}>{failed}</strong></span>}
                                                                                    <span style={{ marginLeft: 'auto', fontWeight: 600, color: rate >= 80 ? '#16a34a' : rate >= 50 ? '#f59e0b' : '#dc2626' }}>%{rate}</span>
                                                                                </div>
                                                                                <div style={{ height: 4, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
                                                                                    <div style={{
                                                                                        height: '100%', borderRadius: 2,
                                                                                        background: rate >= 80 ? '#16a34a' : rate >= 50 ? '#f59e0b' : '#dc2626',
                                                                                        width: `${rate}%`, transition: 'width 0.5s ease'
                                                                                    }} />
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {/* Bağlı Mesajlar */}
                                                                        {g.groupMessages && g.groupMessages.length > 0 && (
                                                                            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                                                {g.groupMessages.map(gm => (
                                                                                    <span key={gm.messageId || gm.id} style={{
                                                                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                                                                        background: '#f8fafc', border: '1px solid #e2e8f0',
                                                                                        borderRadius: 6, padding: '3px 8px', fontSize: 11, color: '#475569'
                                                                                    }}>
                                                                                        <MessageSquare size={10} /> {gm.message?.name || 'Mesaj'}
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </details>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Mesaj Önizlemesi (eski kampanyalar için) */}
                        {detail?.messagePreviews?.length > 0 && (
                            <div style={{ marginBottom: 20 }}>
                                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <MessageSquare size={15} style={{ color: '#2563eb' }} /> Gönderilen Mesajlar
                                </h3>
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
                                        </div>
                                        {msg.content && typeof msg.content === 'string' && (
                                            <div style={{
                                                fontSize: 13, color: '#374151', lineHeight: 1.5,
                                                background: '#fff', padding: '8px 12px', borderRadius: 8,
                                                border: '1px solid #e5e7eb', whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'auto'
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
                                            background: (l.color || '#2563eb') + '15', color: l.color || '#2563eb',
                                            border: `1px solid ${(l.color || '#2563eb')}33`,
                                            padding: '4px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500
                                        }}>{l.icon || '👥'} {l.name}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    }

    return (
        <div style={{ padding: '24px 28px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0 }}>Kampanyalar</h2>
                <button
                    className="mkt-btn-primary"
                    onClick={() => setShowWizard(true)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                    <Plus size={15} />
                    <span>Yeni Kampanya</span>
                </button>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 18, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', background: '#f1f5f9', padding: 2, borderRadius: 7 }}>
                    {[
                        { key: 'ALL', label: 'Tümü' },
                        { key: 'MANUAL', label: 'Manuel' },
                        { key: 'AUTO', label: 'Otomatik' },
                    ].map(f => (
                        <button
                            key={f.key}
                            onClick={() => setTypeFilter(f.key)}
                            style={{
                                padding: '6px 14px',
                                border: 'none',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                                background: typeFilter === f.key ? '#fff' : 'transparent',
                                color: typeFilter === f.key ? '#1e293b' : '#64748b',
                                boxShadow: typeFilter === f.key ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                            }}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                {/* Durum Filtresi */}
                <div style={{ display: 'flex', background: '#f1f5f9', padding: 2, borderRadius: 7 }}>
                    {[
                        { key: 'ALL', label: 'Tümü' },
                        { key: 'ACTIVE', label: '🟢 Aktifler' },
                        { key: 'COMPLETED', label: 'Tamamlanan' },
                        { key: 'DRAFT', label: 'Taslak' },
                    ].map(f => (
                        <button
                            key={f.key}
                            onClick={() => setStatusFilter(f.key)}
                            style={{
                                padding: '6px 12px',
                                border: 'none',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                                background: statusFilter === f.key ? '#fff' : 'transparent',
                                color: statusFilter === f.key ? '#1e293b' : '#64748b',
                                boxShadow: statusFilter === f.key ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                {/* Tarih Filtresi */}
                <select
                    value={dateFilter}
                    onChange={e => { setDateFilter(e.target.value); if (e.target.value !== 'custom') { setDateFrom(''); setDateTo(''); } }}
                    style={{
                        height: 33, borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 12,
                        padding: '0 28px 0 10px', outline: 'none', background: '#fff', color: dateFilter ? '#1e293b' : '#94a3b8',
                        fontWeight: dateFilter ? 600 : 400, cursor: 'pointer',
                        appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2394a3b8\' stroke-width=\'2\'%3E%3Cpath d=\'M6 9l6 6 6-6\'/%3E%3C/svg%3E")',
                        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
                    }}
                >
                    <option value="">📅 Tüm Tarihler</option>
                    <option value="thisWeek">Bu Hafta</option>
                    <option value="thisMonth">Bu Ay</option>
                    <option value="last30">Son 30 Gün</option>
                    <option value="last90">Son 90 Gün</option>
                    <option value="custom">Özel Aralık</option>
                </select>

                {dateFilter === 'custom' && (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                            style={{ height: 33, borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 11, padding: '0 8px', outline: 'none' }} />
                        <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                            style={{ height: 33, borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 11, padding: '0 8px', outline: 'none' }} />
                    </div>
                )}

                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, color: '#94a3b8' }} />
                    <input
                        type="text"
                        placeholder="Ara..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{
                            paddingLeft: 30,
                            paddingRight: 12,
                            height: 33,
                            borderRadius: 7,
                            border: '1px solid #e2e8f0',
                            fontSize: 12,
                            outline: 'none',
                            width: 160,
                            background: '#fff'
                        }}
                    />
                </div>

                {/* Aktif filtre sayısı */}
                {(statusFilter !== 'ALL' || dateFilter || searchQuery) && (
                    <button
                        onClick={() => { setStatusFilter('ALL'); setDateFilter(''); setDateFrom(''); setDateTo(''); setSearchQuery(''); setTypeFilter('ALL'); }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '5px 10px', border: '1px solid #fca5a5', borderRadius: 6,
                            background: '#fef2f2', color: '#dc2626', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        }}
                    >
                        <X size={12} /> Temizle
                    </button>
                )}
            </div>

            {/* Campaign List */}
            {loading ? (
                <div className="mkt-loading">Yükleniyor...</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {filteredCampaigns.map(c => {
                        const statusBadge = getStatusBadge(c);
                        const channels = getCampaignChannels(c);
                        const sent = getSentCount(c);
                        const delivered = getDeliveredCount(c);
                        const read = getReadCount(c);
                        const isAuto = isAutoCampaign(c);
                        const cost = getCampaignCost(c);

                        return (
                            <div
                                key={c.id}
                                style={{
                                    background: '#fff',
                                    borderRadius: 12,
                                    border: '1px solid #e5e7eb',
                                    padding: '16px 20px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 10,
                                }}
                                onClick={() => loadCampaignDetail(c.id)}
                                onMouseOver={e => { e.currentTarget.style.boxShadow = '0 3px 12px rgba(0,0,0,0.05)'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                                onMouseOut={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#e5e7eb'; }}
                            >
                                {/* Üst Satır: İsim + Kanallar + Durum */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: isAuto ? '#f59e0b' : '#94a3b8', flexShrink: 0 }} title={isAuto ? 'Otomatik' : 'Manuel'} />
                                        <span style={{ fontWeight: 600, fontSize: 15, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                            {channels.map(ch => {
                                                const badge = CHANNEL_BADGE[ch];
                                                if (!badge) return null;
                                                return (
                                                    <span key={ch} style={{ fontSize: 10, background: badge.bg, color: badge.color, padding: '2px 8px', borderRadius: 5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
                                                        {badge.icon} {badge.label}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: statusBadge.bg, color: statusBadge.color }}>
                                            {statusBadge.label}
                                        </span>
                                        {!c.isLegacy && !c.isArchive && (
                                            <div style={{ display: 'flex', gap: 3 }} onClick={e => e.stopPropagation()}>
                                                <button className="grp-icon-action" onClick={() => { setEditItem(c); setShowForm(true); }} title="Düzenle"><Edit2 size={13}/></button>
                                                <button className="grp-icon-action danger" onClick={() => handleDelete(c.id)} title="Sil"><Trash2 size={13}/></button>
                                            </div>
                                        )}
                                        <ChevronRight size={16} style={{ color: '#cbd5e1' }} />
                                    </div>
                                </div>

                                {/* Alt Satır: Açıklama + Tarih + İstatistikler */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, fontSize: 12, color: '#64748b' }}>
                                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#94a3b8' }}>
                                        {c.description || (c.isAutomation ? 'Sistem otomasyonu' : 'Açıklama yok')}
                                    </div>
                                    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0, color: '#64748b' }}>
                                        <span style={{ color: '#94a3b8', fontSize: 11 }}>{getDateDisplay(c)}</span>
                                        {sent > 0 && (
                                            <>
                                                <span style={{ width: 1, height: 14, background: '#e5e7eb' }} />
                                                <span>Gönderilen <strong style={{ color: '#334155' }}>{sent}</strong></span>
                                                <span>Teslim <strong style={{ color: '#334155' }}>{delivered}</strong></span>
                                                <span>Okunan <strong style={{ color: '#16a34a' }}>{read}</strong></span>
                                                {cost > 0 && (
                                                    <>
                                                        <span style={{ width: 1, height: 14, background: '#e5e7eb' }} />
                                                        <span style={{ fontWeight: 700, color: '#ec4899' }}>💰 ${cost.toFixed(2)}</span>
                                                    </>
                                                )}
                                            </>
                                        )}
                                        {sent === 0 && <span style={{ color: '#cbd5e1' }}>—</span>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {filteredCampaigns.length === 0 && (
                        <div className="mkt-empty"><p>Kampanya bulunamadı.</p></div>
                    )}
                </div>
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

        </div>
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
        <div className="mkt-modal-overlay" onClick={onClose}>
            <div className="grp-form-modal" onClick={e => e.stopPropagation()}>
                <div className="grp-modal-header">
                    <h2 className="grp-modal-title">{initial ? 'Grubu Düzenle' : 'Yeni Reklam Grubu'}</h2>
                    <button className="grp-modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="grp-modal-body">
                    <div className="grp-field">
                        <label className="grp-label">Gönderi Adı</label>
                        <input className="grp-input" value={name} onChange={e => setName(e.target.value)} placeholder="ör: VIP Liste - 15 Eylül" />
                    </div>
                    <div className="grp-field">
                        <label className="grp-label">Grup Etiketi <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>(Aynı etiketli gönderiler gruplanır)</span></label>
                        <input className="grp-input" value={groupTag} onChange={e => setGroupTag(e.target.value)} placeholder="ör: Arama Başarılı" />
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>Boş bırakılırsa gönderi adı kullanılır</div>
                    </div>
                    <div className="grp-field">
                        <label className="grp-label">Kampanya</label>
                        <select className="grp-input" value={campaignId} onChange={e => setCampaignId(e.target.value)}>
                            <option value="">Seçiniz...</option>
                            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="grp-field">
                        <label className="grp-label">Kanal</label>
                        <select className="grp-input" value={channel} onChange={e => setChannel(e.target.value)}>
                            <option value="WHATSAPP">WhatsApp</option>
                            <option value="AI_CALL">AI Arama</option>
                            <option value="EMAIL">E-posta</option>
                            <option value="SMS">SMS (NetGSM)</option>
                        </select>
                    </div>

                    {/* Hedef Kitle Seçimi */}
                    <div className="grp-field">
                        <label className="grp-label">Hedef Kitle</label>
                        <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: 2, borderRadius: 7, marginBottom: 8 }}>
                            <button type="button" onClick={() => setAudienceType('list')} style={{
                                flex: 1, padding: '6px 0', border: 'none', borderRadius: 6, fontSize: 12,
                                fontWeight: 600, cursor: 'pointer',
                                background: audienceType === 'list' ? '#fff' : 'transparent',
                                color: audienceType === 'list' ? '#1e293b' : '#64748b',
                                boxShadow: audienceType === 'list' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                            }}>📋 Manuel Liste</button>
                            <button type="button" onClick={() => setAudienceType('segment')} style={{
                                flex: 1, padding: '6px 0', border: 'none', borderRadius: 6, fontSize: 12,
                                fontWeight: 600, cursor: 'pointer',
                                background: audienceType === 'segment' ? '#fff' : 'transparent',
                                color: audienceType === 'segment' ? '#1e293b' : '#64748b',
                                boxShadow: audienceType === 'segment' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                            }}>🤖 Otomatik Segment</button>
                        </div>

                        {audienceType === 'list' ? (
                            <select className="grp-input" value={listId} onChange={e => setListId(e.target.value)}>
                                <option value="">Liste seçiniz...</option>
                                {contactGroups.map(cg => <option key={cg.id} value={cg.id}>{cg.name}</option>)}
                            </select>
                        ) : (
                            <select className="grp-input" value={segmentId} onChange={e => setSegmentId(e.target.value)}>
                                <option value="">Segment seçiniz...</option>
                                {smartSegments.map(s => <option key={s.id} value={s.id}>{s.icon || '📊'} {s.name}</option>)}
                            </select>
                        )}
                    </div>

                    <div className="grp-field" style={{ display: 'flex', gap: 10 }}>
                        <div style={{ flex: 1 }}>
                            <label className="grp-label">Gönderim Hızı (dakika/adet)</label>
                            <input className="grp-input" type="number" value={sendRate} onChange={e => setSendRate(e.target.value)} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label className="grp-label">Zamanlama</label>
                            <input className="grp-input" type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
                        </div>
                    </div>
                </div>
                <div className="grp-modal-footer">
                    <button className="grp-btn-cancel" onClick={onClose}>İptal</button>
                    <button className="grp-btn-save" style={{ background: '#2563eb' }} onClick={handleSave} disabled={saving || !name}>
                        {saving ? 'Kaydediliyor...' : 'Kaydet'}
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

    const getChannelIcon = (ch) => {
        if (ch === 'WHATSAPP') return <MessageSquare size={16} color="#10b981"/>;
        if (ch === 'AI_CALL') return <Phone size={16} color="#3b82f6"/>;
        if (ch === 'EMAIL') return <Mail size={16} color="#f59e0b"/>;
        if (ch === 'SMS') return <Smartphone size={16} color="#8b5cf6"/>;
        return null;
    };

    return (
        <div className="mkt-analytics-wrap">
            <div className="mkt-analytics-bar">
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#6b7280' }}>Kampanya Filtresi:</span>
                    <select className="mkt-filter-select" value={filterCampaignId} onChange={e => setFilterCampaignId(e.target.value)}>
                        <option value="">Tümü</option>
                        {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
                <button className="mkt-btn-primary" onClick={() => setShowForm(true)}>+ Yeni Grup</button>
            </div>

            <div className="mkt-table-wrap">
                {loading ? <div className="mkt-loading">Yükleniyor...</div> : (
                    <table className="mkt-table">
                        <thead>
                            <tr>
                                <th>Grup Adı</th>
                                <th>Kampanya</th>
                                <th>Kanal</th>
                                <th>Hedef Liste</th>
                                <th>Performans</th>
                                <th>Durum</th>
                                <th style={{ textAlign: 'right' }}>İşlemler</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSets.length === 0 && <tr><td colSpan={7} style={{ textAlign:'center', padding:20 }}>Grup bulunamadı.</td></tr>}
                            {filteredSets.map(s => (
                                <React.Fragment key={s.id}>
                                    <tr onClick={() => toggleExpand(s.id)}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                {expandedSet === s.id ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                                                <strong style={{ color: '#111827' }}>{s.name}</strong>
                                            </div>
                                        </td>
                                        <td>{campaigns.find(c => c.id === s.campaignId)?.name || '-'}</td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                {getChannelIcon(s.channel)}
                                                <span style={{ fontSize: 12 }}>{s.channel}</span>
                                            </div>
                                        </td>
                                        <td>{contactGroups.find(c => c.id === s.listId)?.name || '-'}</td>
                                        <td>
                                            <div style={{ fontSize: 12 }}>
                                                <span style={{ fontWeight: 600, color: '#111827' }}>
                                                    {s.channel === 'AI_CALL' ? `Arama: ${s.sentCount || 0}` : `Gönderilen: ${s.sentCount || 0}`}
                                                </span>
                                                <div style={{ color: '#6b7280', fontSize: 11 }}>
                                                    {s.channel === 'AI_CALL' 
                                                        ? `Başarılı: ${s.deliveredCount || s.readCount || 0}`
                                                        : `Teslim/Okunan: ${s.deliveredCount || 0} / ${s.readCount || 0}`}
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <span style={{ padding: '4px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: s.status === 'COMPLETED' ? '#dcfce7' : s.status === 'SENDING' ? '#dbeafe' : '#f3f4f6', color: s.status === 'COMPLETED' ? '#166534' : s.status === 'SENDING' ? '#1e40af' : '#4b5563' }}>
                                                {s.status || 'DRAFT'}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                                                {s.status !== 'COMPLETED' && (
                                                    <button className="mkt-btn-send-bulk" onClick={() => handleExecute(s.id)} disabled={s.status === 'SENDING'} style={{ padding: '4px 10px', fontSize: 12 }}>Gönder</button>
                                                )}
                                                <button className="grp-icon-action" onClick={() => { setEditItem(s); setShowForm(true); }}><Edit2 size={14}/></button>
                                                <button className="grp-icon-action danger" onClick={() => handleDelete(s.id)}><Trash2 size={14}/></button>
                                            </div>
                                        </td>
                                    </tr>
                                    {expandedSet === s.id && (
                                        <tr style={{ background: '#fafafa' }}>
                                            <td colSpan={7} style={{ padding: '20px 40px' }}>
                                                <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 13, color: '#374151' }}>Bağlı Mesajlar</div>
                                                {s.groupMessages && s.groupMessages.length > 0 ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                                                        {s.groupMessages.map(m => {
                                                            const msgObj = messages.find(x => x.id === m.messageId);
                                                            return (
                                                                <div key={m.messageId} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                        {getChannelIcon(msgObj?.channel)}
                                                                        <span style={{ fontSize: 13, fontWeight: 500 }}>{msgObj?.name || 'Bilinmeyen Mesaj'}</span>
                                                                    </div>
                                                                    <button style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }} onClick={() => unlinkMessage(s.id, m.messageId)}>Çıkar</button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>Henüz mesaj eklenmemiş.</div>}
                                                
                                                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                                    <select className="mkt-filter-select" style={{ width: 250 }} id={`msg-select-${s.id}`}>
                                                        <option value="">Mesaj Seçin...</option>
                                                        {messages.filter(m => m.channel === s.channel && !s.groupMessages?.some(sm => sm.messageId === m.id)).map(m => (
                                                            <option key={m.id} value={m.id}>{m.name}</option>
                                                        ))}
                                                    </select>
                                                    <button className="mkt-btn-secondary" style={{ padding: '7px 12px' }} onClick={() => {
                                                        const sel = document.getElementById(`msg-select-${s.id}`);
                                                        if (sel.value) linkMessage(s.id, sel.value);
                                                    }}>+ Mesaj Ekle</button>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            {showForm && <AdSetFormModal wsId={wsId} initial={editItem} campaigns={campaigns} contactGroups={contactGroups} onSave={handleSave} onClose={() => { setShowForm(false); setEditItem(null); }} />}
        </div>
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

    return (
        <div className="mkt-modal-overlay" onClick={onClose}>
            <div className="grp-form-modal" onClick={e => e.stopPropagation()}>
                <div className="grp-modal-header">
                    <h2 className="grp-modal-title">{initial ? 'Mesajı Düzenle' : 'Yeni Mesaj'}</h2>
                    <button className="grp-modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="grp-modal-body">
                    <div className="grp-field">
                        <label className="grp-label">Mesaj Adı</label>
                        <input className="grp-input" value={name} onChange={e => setName(e.target.value)} />
                    </div>
                    <div className="grp-field">
                        <label className="grp-label">Kanal</label>
                        <select className="grp-input" value={channel} onChange={e => { setChannel(e.target.value); setExternalId(''); }}>
                            <option value="WHATSAPP">WhatsApp</option>
                            <option value="AI_CALL">AI Arama</option>
                            <option value="EMAIL">E-posta</option>
                            <option value="SMS">SMS (NetGSM)</option>
                        </select>
                    </div>
                    
                    {channel === 'WHATSAPP' && (
                        <div className="grp-field">
                            <label className="grp-label">WhatsApp Şablonu</label>
                            <select className="grp-input" value={externalId} onChange={e => setExternalId(e.target.value)}>
                                <option value="">Seçiniz...</option>
                                {waTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>
                    )}
                    
                    {channel === 'AI_CALL' && (
                        <div className="grp-field">
                            <label className="grp-label">AI Sesli Asistanı</label>
                            <select className="grp-input" value={externalId} onChange={e => setExternalId(e.target.value)}>
                                <option value="">Seçiniz...</option>
                                {retellAgents.map(a => <option key={a.agent_id || a.id} value={a.agent_id || a.id}>{a.agent_name || a.name || a.agent_id}</option>)}
                            </select>
                        </div>
                    )}
                    
                    {channel === 'EMAIL' && (
                        <>
                            <div className="grp-field">
                                <label className="grp-label">Konu</label>
                                <input className="grp-input" value={subject} onChange={e => setSubject(e.target.value)} />
                            </div>
                            <div className="grp-field">
                                <label className="grp-label">İçerik</label>
                                <textarea className="grp-input" rows={4} value={bodyText} onChange={e => setBodyText(e.target.value)} />
                            </div>
                        </>
                    )}

                    {channel === 'SMS' && (
                        <div className="grp-field">
                            <label className="grp-label">SMS Metni (NetGSM)</label>
                            <textarea
                                className="grp-input"
                                rows={4}
                                placeholder="SMS içeriğinizi yazın..."
                                value={bodyText}
                                onChange={e => setBodyText(e.target.value)}
                            />
                            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                                <span>NetGSM SMS başlığı ile gönderilir.</span>
                                <span>{bodyText.length} karakter ({Math.ceil(bodyText.length / 160) || 1} SMS)</span>
                            </div>
                        </div>
                    )}
                </div>
                <div className="grp-modal-footer">
                    <button className="grp-btn-cancel" onClick={onClose}>İptal</button>
                    <button className="grp-btn-save" style={{ background: '#2563eb' }} onClick={handleSave} disabled={saving || !name}>
                        {saving ? 'Kaydediliyor...' : 'Kaydet'}
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

    return (
        <div className="mkt-analytics-wrap">
            <div className="mkt-analytics-bar">
                <div className="mkt-filter-tabs">
                    {[{value: '', label: 'Tümü'}, {value: 'WHATSAPP', label: 'WhatsApp'}, {value: 'AI_CALL', label: 'AI Arama'}, {value: 'EMAIL', label: 'E-posta'}, {value: 'SMS', label: 'SMS'}].map(o => (
                        <button key={o.value} className={`mkt-filter-tab ${channelFilter === o.value ? 'active' : ''}`} onClick={() => setChannelFilter(o.value)}>{o.label}</button>
                    ))}
                </div>
                <button className="mkt-btn-primary" onClick={() => setShowForm(true)}>+ Yeni Mesaj</button>
            </div>
            
            <div className="mkt-table-wrap">
                {loading ? <div className="mkt-loading">Yükleniyor...</div> : (
                    <table className="mkt-table">
                        <thead>
                            <tr>
                                <th>Mesaj Adı</th>
                                <th>Kanal</th>
                                <th>Referans (Şablon/Agent)</th>
                                <th>Kullanım</th>
                                <th style={{ textAlign: 'right' }}>İşlemler</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && <tr><td colSpan={5} style={{textAlign:'center', padding:20}}>Mesaj bulunamadı.</td></tr>}
                            {filtered.map(m => (
                                <tr key={m.id}>
                                    <td style={{ fontWeight: 600 }}>{m.name}</td>
                                    <td>
                                        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 12, background: '#f3f4f6', fontWeight: 600 }}>
                                            {m.channel}
                                        </span>
                                    </td>
                                    <td style={{ fontSize: 12, color: '#4b5563', maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {m.templateName || m.externalId || m.emailSubject || m.subject || (m.content ? m.content.substring(0, 30) + '...' : '-')}
                                    </td>
                                    <td>
                                        <span style={{ fontSize: 12, color: '#6b7280' }}>{m.usageCount || 0} grupta kullanılıyor</span>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                            <button className="grp-icon-action" onClick={() => { setEditItem(m); setShowForm(true); }}><Edit2 size={14}/></button>
                                            <button className="grp-icon-action danger" onClick={() => handleDelete(m.id)}><Trash2 size={14}/></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            {showForm && <MessageFormModal wsId={wsId} initial={editItem} onSave={handleSave} onClose={() => { setShowForm(false); setEditItem(null); }} />}
        </div>
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
            const [defsRes, countsRes] = await Promise.all([
                api.get(`/smart-segments/${wsId}/segments/definitions`),
                api.get(`/smart-segments/${wsId}/segments/counts`)
            ]);
            setSmartSegments(defsRes.data.segments || []);
            const countsMap = {};
            (countsRes.data.counts || []).forEach(c => { countsMap[c.id] = c.count; });
            setSegmentCounts(countsMap);
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

    return (
        <div className="mkt-analytics-wrap">
            <div className="mkt-analytics-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: 2, borderRadius: 7 }}>
                    {[
                        { key: 'manual', label: `📋 Manuel Listeler (${groups.length})` },
                        { key: 'smart', label: `🤖 Otomatik Segmentler (${smartSegments.length})` }
                    ].map(t => (
                        <button key={t.key} onClick={() => setListType(t.key)} style={{
                            padding: '6px 14px', border: 'none', borderRadius: 6, fontSize: 12,
                            fontWeight: 600, cursor: 'pointer',
                            background: listType === t.key ? '#fff' : 'transparent',
                            color: listType === t.key ? '#1e293b' : '#64748b',
                            boxShadow: listType === t.key ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                        }}>{t.label}</button>
                    ))}
                </div>
                {listType === 'manual' && (
                    <button className="mkt-btn-primary" onClick={() => setShowForm(true)}>+ Yeni Liste</button>
                )}
            </div>

            {/* Otomatik Segmentler Görünümü */}
            {listType === 'smart' && (
                <div style={{ padding: '16px 0' }}>
                    {segmentsLoading ? <div className="mkt-loading">Yükleniyor...</div> : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                            {smartSegments.map(seg => {
                                const count = segmentCounts[seg.id] || 0;
                                const SEGMENT_COLORS = {
                                    cold_leads: '#64748b', warm_leads: '#f59e0b', hot_leads: '#ef4444',
                                    silent_30_days: '#94a3b8', has_phone: '#2563eb', has_email: '#7c3aed',
                                    whatsapp_active: '#16a34a', recent_contacts: '#0891b2'
                                };
                                const color = SEGMENT_COLORS[seg.id] || '#6366f1';

                                return (
                                    <div key={seg.id} style={{
                                        background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb',
                                        padding: '16px 20px', transition: 'all 0.15s', cursor: 'default'
                                    }}
                                        onMouseOver={e => { e.currentTarget.style.boxShadow = '0 3px 12px rgba(0,0,0,0.05)'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                                        onMouseOut={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#e5e7eb'; }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{
                                                    width: 36, height: 36, borderRadius: 10,
                                                    background: color + '15', color: color,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 16
                                                }}>
                                                    {seg.icon || '📊'}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{seg.name}</div>
                                                    {seg.description && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{seg.description}</div>}
                                                </div>
                                            </div>
                                            <div style={{
                                                background: color + '12', color: color,
                                                padding: '4px 12px', borderRadius: 8,
                                                fontSize: 14, fontWeight: 700
                                            }}>
                                                {count.toLocaleString()}
                                            </div>
                                        </div>
                                        {seg.group && (
                                            <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
                                                Grup: <strong style={{ color: '#64748b' }}>{seg.group}</strong>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {smartSegments.length === 0 && (
                                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                                    Otomatik segment tanımlanmamış
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Manuel Listeler Görünümü */}
            {listType === 'manual' && (loading ? <div className="mkt-loading">Yükleniyor...</div> : (
                <div className="mkt-table-wrap">
                    <table className="mkt-table">
                        <thead>
                            <tr>
                                <th>İkon</th>
                                <th>Liste Adı</th>
                                <th>Açıklama</th>
                                <th>Kişi Sayısı</th>
                                <th style={{ textAlign: 'right' }}>İşlemler</th>
                            </tr>
                        </thead>
                        <tbody>
                            {groups.map(g => (
                                <tr key={g.id}>
                                    <td onClick={() => { setViewGroup(g); setMemberSearch(''); }} style={{ cursor: 'pointer' }}>
                                        <div style={{ width: 32, height: 32, borderRadius: 8, background: g.color || '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                                            {g.name.charAt(0).toUpperCase()}
                                        </div>
                                    </td>
                                    <td onClick={() => { setViewGroup(g); setMemberSearch(''); }} style={{ fontWeight: 600, cursor: 'pointer' }}>
                                        <span style={{ color: '#1d4ed8' }}>{g.name}</span>
                                    </td>
                                    <td style={{ fontSize: 12, color: '#6b7280' }}>{g.description || '-'}</td>
                                    <td>
                                        <span className="mkt-badge" style={{ background: '#eff6ff', color: '#1d4ed8', fontWeight: 600 }}>
                                            {(g._count?.members || 0).toLocaleString()} kişi
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                            <button className="grp-icon-action" title="Kişileri Görüntüle" onClick={() => { setViewGroup(g); setMemberSearch(''); }}><Eye size={14}/></button>
                                            <button className="grp-icon-action" title="Düzenle" onClick={() => { setEditGroup(g); setShowForm(true); }}><Edit2 size={14}/></button>
                                            <button className="grp-icon-action danger" title="Sil" onClick={() => handleDelete(g)}><Trash2 size={14}/></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
            
            {showForm && (
                <div className="mkt-modal-overlay" onClick={() => { setShowForm(false); setEditGroup(null); }}>
                    <div className="grp-form-modal" onClick={e => e.stopPropagation()}>
                        <div className="grp-modal-header">
                            <h2 className="grp-modal-title">{editGroup ? 'Listeyi Düzenle' : 'Yeni Liste'}</h2>
                            <button className="grp-modal-close" onClick={() => { setShowForm(false); setEditGroup(null); }}>✕</button>
                        </div>
                        <div className="grp-modal-body">
                            {/* Reusing GroupFormModal logic inline for simplicity in rewrite, though could componentize further */}
                            <form onSubmit={e => {
                                e.preventDefault();
                                const fd = new FormData(e.target);
                                const data = { name: fd.get('name'), description: fd.get('desc'), color: fd.get('color'), icon: '👥' };
                                editGroup ? handleUpdate(data) : handleCreate(data);
                            }}>
                                <div className="grp-field">
                                    <label className="grp-label">Liste Adı</label>
                                    <input name="name" className="grp-input" defaultValue={editGroup?.name || ''} required />
                                </div>
                                <div className="grp-field">
                                    <label className="grp-label">Açıklama</label>
                                    <input name="desc" className="grp-input" defaultValue={editGroup?.description || ''} />
                                </div>
                                <div className="grp-field">
                                    <label className="grp-label">Renk Hex</label>
                                    <input name="color" type="color" className="grp-input" style={{ padding: 4, height: 40 }} defaultValue={editGroup?.color || '#2563eb'} />
                                </div>
                                <div className="grp-modal-footer" style={{ marginTop: 20 }}>
                                    <button type="submit" className="grp-btn-save" style={{ background: '#2563eb' }}>Kaydet</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Listeye Kayıtlı Kişiler / Üye Görüntüleme Modalı */}
            {viewGroup && (
                <div className="mkt-modal-overlay" onClick={() => { setViewGroup(null); setMemberSearch(''); }}>
                    <div className="grp-form-modal" onClick={e => e.stopPropagation()} style={{ width: 680, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                        <div className="grp-modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                    width: 34, height: 34, borderRadius: 8,
                                    background: viewGroup.color || '#2563eb', color: '#fff',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 14
                                }}>
                                    {viewGroup.name?.charAt(0).toUpperCase() || '👥'}
                                </div>
                                <div>
                                    <h2 className="grp-modal-title" style={{ margin: 0, fontSize: 16 }}>{viewGroup.name}</h2>
                                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                                        {viewGroup.description || 'Hedef Kitle Listesi'} • <strong style={{ color: '#2563eb' }}>{memberTotal || members.length} Kişi</strong>
                                    </div>
                                </div>
                            </div>
                            <button className="grp-modal-close" onClick={() => { setViewGroup(null); setMemberSearch(''); }}>✕</button>
                        </div>

                        <div style={{ padding: '12px 24px', borderBottom: '1px solid #f3f4f6', background: '#fafafa' }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <Search size={16} style={{ position: 'absolute', left: 12, top: 11, color: '#9ca3af' }} />
                                    <input
                                        type="text"
                                        className="grp-input"
                                        placeholder="Bu listede ara (Ad, telefon, e-posta)..."
                                        value={memberSearch}
                                        onChange={e => setMemberSearch(e.target.value)}
                                        style={{ paddingLeft: 36, fontSize: 13, height: 38 }}
                                    />
                                    {memberSearch && (
                                        <button
                                            onClick={() => setMemberSearch('')}
                                            style={{ position: 'absolute', right: 10, top: 9, background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}
                                        >
                                            <X size={16} />
                                        </button>
                                    )}
                                </div>
                                <button
                                    onClick={() => { setShowAddMember(!showAddMember); setAddSearch(''); setAddResults([]); }}
                                    style={{
                                        padding: '8px 16px', borderRadius: 8, border: 'none',
                                        background: showAddMember ? '#dbeafe' : '#2563eb', color: showAddMember ? '#1e40af' : '#fff',
                                        fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                                        display: 'flex', alignItems: 'center', gap: 4
                                    }}
                                >
                                    <Plus size={14} /> Kişi Ekle
                                </button>
                            </div>

                            {/* Kişi ekleme paneli */}
                            {showAddMember && (
                                <div style={{
                                    marginTop: 10, background: '#fff', border: '1px solid #e2e8f0',
                                    borderRadius: 10, padding: '10px 12px'
                                }}>
                                    <div style={{ position: 'relative' }}>
                                        <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
                                        <input
                                            type="text"
                                            placeholder="Kişi adı veya telefon ile ara..."
                                            value={addSearch}
                                            onChange={e => setAddSearch(e.target.value)}
                                            style={{
                                                width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8,
                                                border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box'
                                            }}
                                            autoFocus
                                        />
                                    </div>
                                    {addLoading && (
                                        <div style={{ padding: '10px 0', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>Aranıyor...</div>
                                    )}
                                    {addResults.length > 0 && (
                                        <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 8 }}>
                                            {addResults.map(c => (
                                                <div key={c.id} style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                                                    transition: 'background 0.1s'
                                                }}
                                                    onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                                                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <div>
                                                        <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{c.name || 'İsimsiz'}</div>
                                                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.phone || c.email || '-'}</div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleAddMember(c.id)}
                                                        disabled={addingId === c.id}
                                                        style={{
                                                            padding: '4px 12px', borderRadius: 6, border: 'none',
                                                            background: addingId === c.id ? '#d1fae5' : '#16a34a', color: '#fff',
                                                            fontSize: 12, fontWeight: 600, cursor: addingId === c.id ? 'default' : 'pointer'
                                                        }}
                                                    >
                                                        {addingId === c.id ? '✓' : '+ Ekle'}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {addSearch.length >= 2 && !addLoading && addResults.length === 0 && (
                                        <div style={{ padding: '10px 0', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                                            Sonuç bulunamadı
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                            {membersLoading ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: 10, color: '#6b7280' }}>
                                    <Loader2 className="spinning" size={24} style={{ color: '#2563eb' }} />
                                    <span style={{ fontSize: 13 }}>Kişiler yükleniyor...</span>
                                </div>
                            ) : members.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280' }}>
                                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: '#9ca3af' }}>
                                        <Users size={24} />
                                    </div>
                                    <p style={{ margin: 0, fontWeight: 500, color: '#374151' }}>
                                        {memberSearch ? 'Aramanıza uygun kişi bulunamadı.' : 'Bu listede henüz kayıtlı kişi bulunmuyor.'}
                                    </p>
                                    <p style={{ margin: '6px 0 0', fontSize: 12 }}>
                                        Kişiler menüsünden müşteri seçip bu listeye ekleyebilir veya doğrudan toplu kampanya başlatabilirsiniz.
                                    </p>
                                </div>
                            ) : (
                                <table className="mkt-table" style={{ width: '100%', fontSize: 13 }}>
                                    <thead>
                                        <tr>
                                            <th>Kişi</th>
                                            <th>Telefon</th>
                                            <th>E-posta</th>
                                            <th>Eklenme Tarihi</th>
                                            <th style={{ textAlign: 'right' }}>İşlem</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {members.map(m => (
                                            <tr key={m.id}>
                                                <td style={{ fontWeight: 600, color: '#111827' }}>
                                                    {m.name || 'İsimsiz Müşteri'}
                                                </td>
                                                <td style={{ color: '#4b5563' }}>
                                                    {m.phone ? (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                            <Phone size={12} style={{ color: '#9ca3af' }} />
                                                            {m.phone}
                                                        </span>
                                                    ) : '-'}
                                                </td>
                                                <td style={{ color: '#4b5563' }}>
                                                    {m.email ? (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                            <Mail size={12} style={{ color: '#9ca3af' }} />
                                                            {m.email}
                                                        </span>
                                                    ) : '-'}
                                                </td>
                                                <td style={{ fontSize: 12, color: '#9ca3af' }}>
                                                    {m.addedAt ? new Date(m.addedAt).toLocaleDateString('tr-TR') : '-'}
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button
                                                        className="grp-icon-action danger"
                                                        title="Listeden Çıkar"
                                                        onClick={() => handleRemoveMember(m.id)}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <div className="grp-modal-footer" style={{ padding: '12px 24px', borderTop: '1px solid #f3f4f6', background: '#fafafa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: '#6b7280' }}>
                                💡 Bu kitleyi <strong>Gruplar (Ad Sets)</strong> sekmesinde hedef kitle olarak seçebilirsiniz.
                            </span>
                            <button
                                type="button"
                                className="grp-btn-save"
                                style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', padding: '6px 16px', fontSize: 13 }}
                                onClick={() => { setViewGroup(null); setMemberSearch(''); }}
                            >
                                Kapat
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
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
                    <div className="base-sidebar-header-icon" style={{ background: '#eff6ff', color: '#2563eb', borderColor: '#dbeafe' }}>
                        <Megaphone size={16} />
                    </div>
                    <span>Pazarlama</span>
                </div>
                <nav className="base-nav">
                    {TABS.map(({ key, label, Icon }) => (
                        <button
                            key={key}
                            className={`base-nav-item ${activeTab === key ? 'active' : ''}`}
                            onClick={() => { setActiveTab(key); if (key !== 'adsets') setFilterCampaignId(''); }}
                            style={activeTab === key ? { color: '#2563eb', borderColor: 'rgba(59,130,246,0.3)', boxShadow: '0 1px 4px rgba(37,99,235,0.08), 0 1px 2px rgba(0,0,0,0.03)' } : {}}
                        >
                            <Icon size={16} style={activeTab === key ? { color: '#2563eb' } : {}} />
                            {label}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Sağ İçerik */}
            <div className="base-content">
                {activeTab === 'campaigns' && <CampaignsTab wsId={wsId} onGoToGroups={goToGroups} />}
                {activeTab === 'adsets'    && <AdSetsTab wsId={wsId} initialCampaignFilter={filterCampaignId} />}
                {activeTab === 'messages'  && <MessagesTab wsId={wsId} />}
                {activeTab === 'lists'     && <ListsTab wsId={wsId} />}
            </div>
        </div>
    );
}
