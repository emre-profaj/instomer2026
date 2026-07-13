import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import './Marketing.css';

const TABS = ['campaigns', 'newCampaign', 'history'];

const statusLabel = {
    DRAFT: { label: 'Taslak', color: '#6b7280' },
    SCHEDULED: { label: 'Zamanlandı', color: '#f59e0b' },
    RUNNING: { label: 'Gönderiliyor', color: '#3b82f6' },
    COMPLETED: { label: 'Tamamlandı', color: '#10b981' },
    FAILED: { label: 'Başarısız', color: '#ef4444' },
};

function StatCard({ label, value, color, icon }) {
    return (
        <div className="mkt-stat-card">
            <div className="mkt-stat-icon" style={{ background: color + '22', color }}>{icon}</div>
            <div>
                <div className="mkt-stat-value" style={{ color }}>{value}</div>
                <div className="mkt-stat-label">{label}</div>
            </div>
        </div>
    );
}

function ProgressBar({ value, max, color }) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    return (
        <div className="mkt-progress-bar-bg">
            <div className="mkt-progress-bar-fill" style={{ width: pct + '%', background: color }} />
            <span className="mkt-progress-pct">{pct}%</span>
        </div>
    );
}

export default function Marketing() {
    const { currentWorkspace } = useAuth();
    const [tab, setTab] = useState('campaigns');
    const [campaigns, setCampaigns] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [segments, setSegments] = useState(null);
    const [loading, setLoading] = useState(false);
    const [selectedCampaign, setSelectedCampaign] = useState(null);
    const [campaignDetail, setCampaignDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);

    // New campaign form
    const [form, setForm] = useState({
        name: '', description: '', templateId: '',
        scheduledAt: '', sendMode: 'all', segmentStatus: '', segmentSource: ''
    });
    const [sendLoading, setSendLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const wsId = currentWorkspace?.id;

    const fetchCampaigns = useCallback(async () => {
        if (!wsId) return;
        setLoading(true);
        try {
            const res = await api.get(`/marketing/${wsId}/campaigns`);
            setCampaigns(res.data.campaigns || []);
        } catch (e) { console.error(e); }
        setLoading(false);
    }, [wsId]);

    const fetchTemplates = useCallback(async () => {
        if (!wsId) return;
        try {
            const res = await api.get(`/automations/${wsId}/templates`);
            setTemplates((res.data.templates || []).filter(t => t.status === 'APPROVED'));
        } catch (e) { console.error(e); }
    }, [wsId]);

    const fetchSegments = useCallback(async () => {
        if (!wsId) return;
        try {
            const res = await api.get(`/marketing/${wsId}/segments`);
            setSegments(res.data);
        } catch (e) { console.error(e); }
    }, [wsId]);

    const fetchCampaignDetail = useCallback(async (id) => {
        if (!wsId) return;
        setDetailLoading(true);
        try {
            const res = await api.get(`/marketing/${wsId}/campaigns/${id}`);
            setCampaignDetail(res.data.campaign);
        } catch (e) { console.error(e); }
        setDetailLoading(false);
    }, [wsId]);

    useEffect(() => {
        fetchCampaigns();
        fetchTemplates();
        fetchSegments();
    }, [fetchCampaigns, fetchTemplates, fetchSegments]);

    // Auto-refresh running campaigns
    useEffect(() => {
        const hasRunning = campaigns.some(c => c.status === 'RUNNING');
        if (!hasRunning) return;
        const t = setInterval(fetchCampaigns, 5000);
        return () => clearInterval(t);
    }, [campaigns, fetchCampaigns]);

    const handleCreateAndSend = async () => {
        setErrorMsg('');
        setSuccessMsg('');
        if (!form.name || !form.templateId) {
            setErrorMsg('Kampanya adı ve şablon seçimi zorunludur.');
            return;
        }
        setSendLoading(true);
        try {
            // 1. Create campaign
            const createRes = await api.post(`/marketing/${wsId}/campaigns`, {
                name: form.name,
                description: form.description,
                templateId: form.templateId,
                scheduledAt: form.scheduledAt || null
            });
            const campId = createRes.data.campaign.id;

            // 2. Send campaign
            const sendBody = {};
            if (form.sendMode === 'status' && form.segmentStatus) {
                sendBody.segmentFilter = { status: form.segmentStatus };
            } else if (form.sendMode === 'source' && form.segmentSource) {
                sendBody.segmentFilter = { source: form.segmentSource };
            }
            // 'all' => empty body, backend takes all contacts with phone

            await api.post(`/marketing/${wsId}/campaigns/${campId}/send`, sendBody);
            setSuccessMsg('Kampanya başarıyla başlatıldı! Gönderim arka planda devam ediyor.');
            setForm({ name: '', description: '', templateId: '', scheduledAt: '', sendMode: 'all', segmentStatus: '', segmentSource: '' });
            setTab('campaigns');
            fetchCampaigns();
        } catch (e) {
            setErrorMsg(e.response?.data?.error || 'Kampanya oluşturulamadı.');
        }
        setSendLoading(false);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Bu kampanyayı silmek istediğinize emin misiniz?')) return;
        try {
            await api.delete(`/marketing/${wsId}/campaigns/${id}`);
            fetchCampaigns();
            if (selectedCampaign === id) { setSelectedCampaign(null); setCampaignDetail(null); }
        } catch (e) { alert('Silinemedi: ' + (e.response?.data?.error || e.message)); }
    };

    const handleSelectCampaign = (c) => {
        setSelectedCampaign(c.id);
        fetchCampaignDetail(c.id);
    };

    const selectedCampaignData = campaigns.find(c => c.id === selectedCampaign);

    return (
        <div className="mkt-page">
            {/* Header */}
            <div className="mkt-header">
                <div className="mkt-header-left">
                    <div className="mkt-header-icon">📣</div>
                    <div>
                        <h1 className="mkt-header-title">Pazarlama</h1>
                        <p className="mkt-header-sub">WhatsApp toplu mesaj kampanyaları</p>
                    </div>
                </div>
                <button className="mkt-btn-primary" onClick={() => setTab('newCampaign')}>
                    + Yeni Kampanya
                </button>
            </div>

            {/* Stats row */}
            <div className="mkt-stats-row">
                <StatCard label="Toplam Kampanya" value={campaigns.length} color="#6366f1" icon="📋" />
                <StatCard label="Tamamlanan" value={campaigns.filter(c => c.status === 'COMPLETED').length} color="#10b981" icon="✅" />
                <StatCard label="Toplam Gönderim" value={campaigns.reduce((s, c) => s + (c.sentCount || 0), 0)} color="#3b82f6" icon="📤" />
                <StatCard label="Toplam Okunma" value={campaigns.reduce((s, c) => s + (c.readCount || 0), 0)} color="#f59e0b" icon="👁" />
            </div>

            {/* Tabs */}
            <div className="mkt-tabs">
                <button className={`mkt-tab ${tab === 'campaigns' ? 'active' : ''}`} onClick={() => setTab('campaigns')}>📋 Kampanyalar</button>
                <button className={`mkt-tab ${tab === 'newCampaign' ? 'active' : ''}`} onClick={() => setTab('newCampaign')}>➕ Yeni Kampanya</button>
                <button className={`mkt-tab ${tab === 'segments' ? 'active' : ''}`} onClick={() => setTab('segments')}>🎯 Segmentler</button>
            </div>

            {/* === CAMPAIGNS TAB === */}
            {tab === 'campaigns' && (
                <div className="mkt-content">
                    {loading && <div className="mkt-loading">Yükleniyor...</div>}
                    {!loading && campaigns.length === 0 && (
                        <div className="mkt-empty">
                            <div className="mkt-empty-icon">📭</div>
                            <p>Henüz kampanya oluşturulmamış.</p>
                            <button className="mkt-btn-primary" onClick={() => setTab('newCampaign')}>İlk Kampanyayı Oluştur</button>
                        </div>
                    )}
                    <div className="mkt-campaigns-layout">
                        {/* Campaign list */}
                        <div className="mkt-campaign-list">
                            {campaigns.map(c => {
                                const st = statusLabel[c.status] || { label: c.status, color: '#6b7280' };
                                return (
                                    <div
                                        key={c.id}
                                        className={`mkt-campaign-card ${selectedCampaign === c.id ? 'selected' : ''}`}
                                        onClick={() => handleSelectCampaign(c)}
                                    >
                                        <div className="mkt-campaign-card-top">
                                            <div className="mkt-campaign-name">{c.name}</div>
                                            <span className="mkt-status-badge" style={{ background: st.color + '22', color: st.color }}>{st.label}</span>
                                        </div>
                                        <div className="mkt-campaign-tmpl">📄 {c.template?.name}</div>
                                        <div className="mkt-campaign-stats-mini">
                                            <span>📤 {c.sentCount || 0}</span>
                                            <span>📦 {c.deliveredCount || 0}</span>
                                            <span>👁 {c.readCount || 0}</span>
                                            <span>❌ {c.failedCount || 0}</span>
                                        </div>
                                        {c.status === 'RUNNING' && (
                                            <ProgressBar value={c.sentCount || 0} max={c.totalCount || 1} color="#3b82f6" />
                                        )}
                                        <div className="mkt-campaign-date">{new Date(c.createdAt).toLocaleDateString('tr-TR')}</div>
                                        <button className="mkt-btn-danger-sm" onClick={e => { e.stopPropagation(); handleDelete(c.id); }}>Sil</button>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Campaign detail */}
                        {selectedCampaign && (
                            <div className="mkt-campaign-detail">
                                {detailLoading && <div className="mkt-loading">Detay yükleniyor...</div>}
                                {!detailLoading && campaignDetail && (
                                    <>
                                        <div className="mkt-detail-header">
                                            <h2>{campaignDetail.name}</h2>
                                            <span className="mkt-status-badge" style={{
                                                background: (statusLabel[campaignDetail.status]?.color || '#6b7280') + '22',
                                                color: statusLabel[campaignDetail.status]?.color || '#6b7280'
                                            }}>{statusLabel[campaignDetail.status]?.label || campaignDetail.status}</span>
                                        </div>
                                        <div className="mkt-detail-stats">
                                            <StatCard label="Gönderildi" value={campaignDetail.sentCount || 0} color="#3b82f6" icon="📤" />
                                            <StatCard label="Teslim" value={campaignDetail.deliveredCount || 0} color="#6366f1" icon="📦" />
                                            <StatCard label="Okundu" value={campaignDetail.readCount || 0} color="#f59e0b" icon="👁" />
                                            <StatCard label="Başarısız" value={campaignDetail.failedCount || 0} color="#ef4444" icon="❌" />
                                        </div>

                                        <div className="mkt-recipient-table-wrap">
                                            <table className="mkt-recipient-table">
                                                <thead>
                                                    <tr>
                                                        <th>Ad</th>
                                                        <th>Telefon</th>
                                                        <th>Durum</th>
                                                        <th>Gönderim</th>
                                                        <th>Teslim</th>
                                                        <th>Okunma</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(campaignDetail.recipients || []).map(r => {
                                                        const st = {
                                                            PENDING: { label: 'Bekliyor', color: '#6b7280' },
                                                            SENT: { label: 'Gönderildi', color: '#3b82f6' },
                                                            DELIVERED: { label: 'Teslim', color: '#6366f1' },
                                                            READ: { label: 'Okundu', color: '#10b981' },
                                                            FAILED: { label: 'Başarısız', color: '#ef4444' },
                                                        }[r.status] || { label: r.status, color: '#6b7280' };
                                                        return (
                                                            <tr key={r.id}>
                                                                <td>{r.name || '—'}</td>
                                                                <td>{r.phone}</td>
                                                                <td><span className="mkt-status-badge" style={{ background: st.color + '22', color: st.color }}>{st.label}</span></td>
                                                                <td>{r.sentAt ? new Date(r.sentAt).toLocaleTimeString('tr-TR') : '—'}</td>
                                                                <td>{r.deliveredAt ? new Date(r.deliveredAt).toLocaleTimeString('tr-TR') : '—'}</td>
                                                                <td>{r.readAt ? new Date(r.readAt).toLocaleTimeString('tr-TR') : '—'}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* === NEW CAMPAIGN TAB === */}
            {tab === 'newCampaign' && (
                <div className="mkt-content mkt-form-wrap">
                    <h2 className="mkt-form-title">Yeni Kampanya Oluştur</h2>
                    {successMsg && <div className="mkt-alert success">{successMsg}</div>}
                    {errorMsg && <div className="mkt-alert error">{errorMsg}</div>}

                    <div className="mkt-form-grid">
                        <div className="mkt-form-group">
                            <label>Kampanya Adı *</label>
                            <input type="text" placeholder="Örn: Mayıs Kampanyası" value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div className="mkt-form-group">
                            <label>Açıklama</label>
                            <input type="text" placeholder="İsteğe bağlı" value={form.description}
                                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                        </div>
                        <div className="mkt-form-group">
                            <label>WhatsApp Şablonu *</label>
                            <select value={form.templateId} onChange={e => setForm(f => ({ ...f, templateId: e.target.value }))}>
                                <option value="">Şablon seçin...</option>
                                {templates.map(t => (
                                    <option key={t.id} value={t.id}>{t.name} {t.headerType ? `(${t.headerType})` : ''}</option>
                                ))}
                            </select>
                            {templates.length === 0 && <small style={{ color: '#f59e0b' }}>Onaylı şablon bulunamadı. Önce şablon oluşturun.</small>}
                        </div>
                        <div className="mkt-form-group">
                            <label>Zamanlama (boş = hemen gönder)</label>
                            <input type="datetime-local" value={form.scheduledAt}
                                onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))} />
                        </div>
                        <div className="mkt-form-group full">
                            <label>Alıcı Segmenti</label>
                            <div className="mkt-segment-options">
                                <label className={`mkt-segment-opt ${form.sendMode === 'all' ? 'active' : ''}`}>
                                    <input type="radio" name="sendMode" value="all" checked={form.sendMode === 'all'} onChange={e => setForm(f => ({ ...f, sendMode: e.target.value }))} />
                                    <span>🌐 Tüm Kişiler (telefonu olan)</span>
                                    {segments && <em>{segments.totalWithPhone} kişi</em>}
                                </label>
                                <label className={`mkt-segment-opt ${form.sendMode === 'status' ? 'active' : ''}`}>
                                    <input type="radio" name="sendMode" value="status" checked={form.sendMode === 'status'} onChange={e => setForm(f => ({ ...f, sendMode: e.target.value }))} />
                                    <span>📊 Duruma Göre Filtrele</span>
                                </label>
                                <label className={`mkt-segment-opt ${form.sendMode === 'source' ? 'active' : ''}`}>
                                    <input type="radio" name="sendMode" value="source" checked={form.sendMode === 'source'} onChange={e => setForm(f => ({ ...f, sendMode: e.target.value }))} />
                                    <span>📡 Kaynağa Göre Filtrele</span>
                                </label>
                            </div>

                            {form.sendMode === 'status' && (
                                <select className="mkt-segment-select" value={form.segmentStatus} onChange={e => setForm(f => ({ ...f, segmentStatus: e.target.value }))}>
                                    <option value="">Durum seçin...</option>
                                    {(segments?.statusCounts || []).map(s => (
                                        <option key={s.status} value={s.status}>{s.status} ({s._count.id} kişi)</option>
                                    ))}
                                </select>
                            )}
                            {form.sendMode === 'source' && (
                                <select className="mkt-segment-select" value={form.segmentSource} onChange={e => setForm(f => ({ ...f, segmentSource: e.target.value }))}>
                                    <option value="">Kaynak seçin...</option>
                                    {(segments?.sourceCounts || []).map(s => (
                                        <option key={s.source} value={s.source}>{s.source} ({s._count.id} kişi)</option>
                                    ))}
                                </select>
                            )}
                        </div>
                    </div>

                    <div className="mkt-form-actions">
                        <button className="mkt-btn-secondary" onClick={() => setTab('campaigns')}>İptal</button>
                        <button className="mkt-btn-primary" onClick={handleCreateAndSend} disabled={sendLoading}>
                            {sendLoading ? '⏳ Gönderiliyor...' : '🚀 Kampanyayı Başlat'}
                        </button>
                    </div>
                </div>
            )}

            {/* === SEGMENTS TAB === */}
            {tab === 'segments' && (
                <div className="mkt-content">
                    <h2 className="mkt-section-title">🎯 Kişi Segmentleri</h2>
                    {segments ? (
                        <div className="mkt-segments-grid">
                            <div className="mkt-segment-block">
                                <div className="mkt-segment-block-title">📊 Duruma Göre</div>
                                {(segments.statusCounts || []).map(s => (
                                    <div key={s.status} className="mkt-segment-row">
                                        <span className="mkt-segment-name">{s.status}</span>
                                        <span className="mkt-segment-count">{s._count.id} kişi</span>
                                        <ProgressBar value={s._count.id} max={segments.totalWithPhone || 1} color="#6366f1" />
                                    </div>
                                ))}
                            </div>
                            <div className="mkt-segment-block">
                                <div className="mkt-segment-block-title">📡 Kaynağa Göre</div>
                                {(segments.sourceCounts || []).length === 0 && <p style={{ color: '#9ca3af' }}>Kaynak verisi bulunamadı.</p>}
                                {(segments.sourceCounts || []).map(s => (
                                    <div key={s.source} className="mkt-segment-row">
                                        <span className="mkt-segment-name">{s.source}</span>
                                        <span className="mkt-segment-count">{s._count.id} kişi</span>
                                        <ProgressBar value={s._count.id} max={segments.totalWithPhone || 1} color="#f59e0b" />
                                    </div>
                                ))}
                            </div>
                            <div className="mkt-segment-block full">
                                <div className="mkt-segment-total">
                                    📱 Toplam telefon numarası olan kişi: <strong>{segments.totalWithPhone}</strong>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="mkt-loading">Segmentler yükleniyor...</div>
                    )}
                </div>
            )}
        </div>
    );
}
