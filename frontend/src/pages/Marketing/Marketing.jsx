
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
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

function CampaignsTab({ wsId, onGoToGroups }) {
    const [campaigns, setCampaigns] = useState([]);
    const [editItem, setEditItem] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [showWizard, setShowWizard] = useState(false);
    const [typeFilter, setTypeFilter] = useState('ALL'); // 'ALL' | 'MANUAL' | 'AUTO'
    const [searchQuery, setSearchQuery] = useState('');

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

        // Arama Filtresi
        if (searchQuery.trim() && !c.name.toLowerCase().includes(searchQuery.trim().toLowerCase())) return false;
        return true;
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
            <div style={{ display: 'flex', gap: 8, marginBottom: 18, alignItems: 'center' }}>
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
                                onClick={() => {
                                    if (c.isAutomation) {
                                        alert(`Bu kayıt otomasyon tarafından oluşturulan rapordur.\n\nGönderilen: ${sent} adet.`);
                                    } else if (c.isLegacy) {
                                        alert(`Eski Kampanya Mesajları:\n${c.messagesLegacy?.map(m => m.name || 'İsimsiz').join(', ') || 'Mesaj yok'}`);
                                    } else {
                                        onGoToGroups(c.id);
                                    }
                                }}
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
    const [campaignId, setCampaignId] = useState(initial?.campaignId || '');
    const [channel, setChannel] = useState(initial?.channel || 'WHATSAPP');
    const [listId, setListId] = useState(initial?.listId || '');
    const [sendRate, setSendRate] = useState(initial?.sendRate || 20);
    const [scheduledAt, setScheduledAt] = useState(initial?.scheduledAt ? initial.scheduledAt.substring(0,16) : '');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!name.trim() || !campaignId || !listId) return alert('Lütfen zorunlu alanları doldurun');
        setSaving(true);
        await onSave({ name, campaignId, channel, listId, sendRate: Number(sendRate), scheduledAt });
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
                        <label className="grp-label">Grup Adı</label>
                        <input className="grp-input" value={name} onChange={e => setName(e.target.value)} />
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
                    <div className="grp-field">
                        <label className="grp-label">Hedef Kitle (Liste)</label>
                        <select className="grp-input" value={listId} onChange={e => setListId(e.target.value)}>
                            <option value="">Seçiniz...</option>
                            {contactGroups.map(cg => <option key={cg.id} value={cg.id}>{cg.name}</option>)}
                        </select>
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

    const [viewGroup, setViewGroup] = useState(null);
    const [members, setMembers] = useState([]);
    const [membersLoading, setMembersLoading] = useState(false);
    const [memberSearch, setMemberSearch] = useState('');
    const [memberTotal, setMemberTotal] = useState(0);

    const fetchGroups = useCallback(async () => {
        if (!wsId) return;
        setLoading(true);
        try {
            const res = await api.get(`/contact-groups/${wsId}/groups`);
            setGroups(res.data.groups || []);
        } catch (e) { console.error(e); }
        setLoading(false);
    }, [wsId]);

    useEffect(() => { fetchGroups(); }, [fetchGroups]);

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

    return (
        <div className="mkt-analytics-wrap">
            <div className="mkt-analytics-bar">
                <span style={{ fontSize: 13, color: '#6b7280' }}>{groups.length} liste</span>
                <button className="mkt-btn-primary" onClick={() => setShowForm(true)}>+ Yeni Liste</button>
            </div>
            {loading ? <div className="mkt-loading">Yükleniyor...</div> : (
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
            )}
            
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
                            <div style={{ position: 'relative' }}>
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
