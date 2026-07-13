import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import './Marketing.css';

const DAY_OPTIONS = [7, 14, 30, 90];

const STATUS_META = {
    SENT:      { label: 'Gönderildi',    bg: '#eff6ff', text: '#2563eb', icon: '📤' },
    DELIVERED: { label: 'Teslim Edildi', bg: '#f0fdf4', text: '#16a34a', icon: '📦' },
    READ:      { label: 'Okundu',        bg: '#fefce8', text: '#ca8a04', icon: '👁'  },
    FAILED:    { label: 'Başarısız',     bg: '#fef2f2', text: '#dc2626', icon: '❌' },
};

const STATUS_FILTER_OPTS = [
    { value: '', label: 'Tümü' },
    { value: 'READ',      label: '👁 Okundu' },
    { value: 'DELIVERED', label: '📦 Teslim Edildi' },
    { value: 'SENT',      label: '📤 Bekliyor' },
    { value: 'FAILED',    label: '❌ Başarısız' },
];

const STATUS_LABELS = {
    NEW: '🔵 Yeni',
    CUSTOMER: '🟢 Müşteri',
    OPPORTUNITY: '🟡 Fırsat',
    SPAM: '🔴 Spam',
    VIP: '⭐ VIP',
};

function StatBig({ icon, label, value, sub, color }) {
    return (
        <div className="mkt-stat-card">
            <div className="mkt-stat-icon" style={{ background: color + '18' }}>{icon}</div>
            <div>
                <div className="mkt-stat-value" style={{ color }}>{(value ?? 0).toLocaleString('tr-TR')}</div>
                <div className="mkt-stat-label">{label}</div>
                {sub && <div className="mkt-stat-sub">{sub}</div>}
            </div>
        </div>
    );
}

function MiniBar({ value, max, color }) {
    const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
    return (
        <div className="mkt-mini-bar-wrap">
            <div className="mkt-mini-bar-bg">
                <div className="mkt-mini-bar-fill" style={{ width: pct + '%', background: color }} />
            </div>
            <span className="mkt-mini-bar-pct">{pct}%</span>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// BULK SEND TAB
// ─────────────────────────────────────────────────────────────────────────────
function BulkSendTab({ wsId }) {
    const [contacts, setContacts] = useState([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [filterStatuses, setFilterStatuses] = useState([]);
    const [filterSources, setFilterSources] = useState([]);

    const [search, setSearch] = useState('');
    const [inputSearch, setInputSearch] = useState(''); // raw input before commit
    const [statusFilter, setStatusFilter] = useState('');
    const [sourceFilter, setSourceFilter] = useState('');

    const [selected, setSelected] = useState(new Set());
    const [selectAllPages, setSelectAllPages] = useState(false);
    const [templates, setTemplates] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [showCallModal, setShowCallModal] = useState(false);
    const [calling, setCalling] = useState(false);
    const [callResult, setCallResult] = useState(null);
    const [sending, setSending] = useState(false);
    const [sentMsg, setSentMsg] = useState('');

    const searchTimer = useRef(null);

    const fetchContacts = useCallback(async (p = 1) => {
        if (!wsId) return;
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: p, limit: 50 });
            if (search) params.set('search', search);
            if (statusFilter) params.set('status', statusFilter);
            if (sourceFilter) params.set('source', sourceFilter);

            const res = await api.get(`/marketing/${wsId}/contacts?${params}`);
            setContacts(res.data.contacts || []);
            setTotal(res.data.total || 0);
            setTotalPages(res.data.totalPages || 1);
            if (res.data.filters) {
                setFilterStatuses(res.data.filters.statuses || []);
                setFilterSources(res.data.filters.sources || []);
            }
        } catch (e) { console.error(e); }
        setLoading(false);
    }, [wsId, search, statusFilter, sourceFilter]);

    useEffect(() => { fetchContacts(1); setPage(1); setSelected(new Set()); setSelectAllPages(false); }, [fetchContacts]);

    const fetchTemplates = async () => {
        try {
            const res = await api.get(`/automations/${wsId}/templates`);
            setTemplates((res.data.templates || []).filter(t => t.status === 'APPROVED'));
        } catch (e) { console.error(e); }
    };

    const handleSearchChange = (val) => setInputSearch(val);

    const commitSearch = () => {
        setSearch(inputSearch);
        setSelectAllPages(false);
    };

    const clearSearch = () => {
        setInputSearch('');
        setSearch('');
        setSelectAllPages(false);
    };

    const toggleSelect = (id) => {
        setSelectAllPages(false);
        setSelected(prev => {
            const s = new Set(prev);
            s.has(id) ? s.delete(id) : s.add(id);
            return s;
        });
    };

    const toggleAll = () => {
        setSelectAllPages(false);
        if (selected.size === contacts.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(contacts.map(c => c.id)));
        }
    };

    const handleSelectAllPages = () => setSelectAllPages(true);
    const handleClearAllPages  = () => { setSelectAllPages(false); setSelected(new Set()); };

    const openModal = async () => {
        await fetchTemplates();
        setShowModal(true);
        setSentMsg('');
    };

    const handleBulkSend = async (templateId) => {
        if (!templateId) return alert('Lütfen bir şablon seçin');
        setSending(true);
        try {
            const body = { templateId };
            if (selectAllPages) {
                // Pass filters, backend fetches all matching contacts
                body.selectAll = true;
                body.filters = { search, status: statusFilter, source: sourceFilter };
            } else {
                body.contactIds = [...selected];
            }
            const res = await api.post(`/marketing/${wsId}/bulk-send`, body);
            setSentMsg(res.data.message);
            setSelected(new Set());
            setSelectAllPages(false);
        } catch (e) {
            alert('Gönderim hatası: ' + (e.response?.data?.error || e.message));
        }
        setSending(false);
    };

    const handleBulkCall = async (agentId, agentName) => {
        if (!agentId) return alert('Lütfen bir agent seçin');
        if (!selectAllPages && !selected.size) return alert('Kişi seçilmedi');

        setCalling(true);
        setCallResult(null);
        try {
            const body = { agentId, agentName };
            if (selectAllPages) {
                body.selectAll = true;
                body.filters = { search, status: statusFilter, source: sourceFilter };
            } else {
                body.contactIds = [...selected];
            }
            const res = await api.post(`/retell/${wsId}/call/bulk`, body);
            setCallResult({ queued: res.data.queued, batchId: res.data.batchId });
            setSelected(new Set());
            setSelectAllPages(false);
        } catch (e) {
            alert('Arama başlatılamadı: ' + (e.response?.data?.error || e.message));
        }
        setCalling(false);
    };

    const allSelected   = contacts.length > 0 && selected.size === contacts.length;
    const someSelected  = selected.size > 0 && selected.size < contacts.length;
    const selectedCount = selectAllPages ? total : selected.size;

    return (
        <div className="mkt-bulk-wrap">
            {/* Toolbar */}
            <div className="mkt-bulk-toolbar">
                <div className="mkt-bulk-toolbar-row">
                    <div className="mkt-bulk-filters">
                        <div className="mkt-search-group">
                            <input
                                className="mkt-search-input"
                                type="text"
                                placeholder="🔍 İsim, telefon veya e-posta..."
                                value={inputSearch}
                                onChange={e => handleSearchChange(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && commitSearch()}
                            />
                            {inputSearch && (
                                <button className="mkt-search-clear" onClick={clearSearch} title="Temizle">×</button>
                            )}
                            <button className="mkt-search-btn" onClick={commitSearch}>🔍 Ara</button>
                        </div>
                        <select className="mkt-filter-select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setSelectAllPages(false); }}>
                            <option value="">Tüm Durumlar</option>
                            {filterStatuses.map(s => <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>)}
                        </select>
                        <select className="mkt-filter-select" value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setSelectAllPages(false); }}>
                            <option value="">Tüm Kaynaklar</option>
                            {filterSources.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <span className="mkt-total-badge">
                            {search || statusFilter || sourceFilter ? `${total.toLocaleString('tr-TR')} sonuç` : `${total.toLocaleString('tr-TR')} kişi`}
                        </span>
                    </div>

                    <div className="mkt-bulk-actions">
                        {selectedCount > 0 && (
                            <>
                                <button className="mkt-btn-call-bulk" onClick={() => { setShowCallModal(true); setCallResult(null); }}>
                                    📞 {selectedCount.toLocaleString('tr-TR')} Kişiyi Ara
                                </button>
                                <button className="mkt-btn-send-bulk" onClick={openModal}>
                                    📤 {selectedCount.toLocaleString('tr-TR')} Kişiye Şablon Gönder
                                </button>
                            </>
                        )}
                        {selectedCount === 0 && (
                            <span className="mkt-hint">Kişi seçmek için checkbox'a tıklayın</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Select-all-pages banner */}
            {allSelected && !selectAllPages && totalPages > 1 && (
                <div className="mkt-select-all-banner">
                    Bu sayfadaki <strong>{contacts.length}</strong> kişi seçili.
                    <button className="mkt-banner-btn" onClick={handleSelectAllPages}>
                        Filtrelere uyan tüm <strong>{total.toLocaleString('tr-TR')}</strong> kişiyi seç
                    </button>
                </div>
            )}
            {selectAllPages && (
                <div className="mkt-select-all-banner active">
                    ✅ Filtrelere uyan tüm <strong>{total.toLocaleString('tr-TR')}</strong> kişi seçili.
                    <button className="mkt-banner-btn" onClick={handleClearAllPages}>Seçimi kaldır</button>
                </div>
            )}

            {/* Table */}
            <div className="mkt-bulk-table-wrap">
                <table className="mkt-table">
                    <thead>
                        <tr>
                            <th style={{ width: 40 }}>
                                <input
                                    type="checkbox"
                                    className="mkt-checkbox"
                                    checked={allSelected}
                                    ref={el => { if (el) el.indeterminate = someSelected; }}
                                    onChange={toggleAll}
                                />
                            </th>
                            <th>Ad Soyad</th>
                            <th>Telefon</th>
                            <th>E-posta</th>
                            <th>Durum</th>
                            <th>Kaynak</th>
                            <th>Etiketler</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>
                                <div className="mkt-loading-spinner" style={{ margin: '0 auto 8px' }} />Yükleniyor...
                            </td></tr>
                        )}
                        {!loading && contacts.length === 0 && (
                            <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>
                                Kişi bulunamadı
                            </td></tr>
                        )}
                        {!loading && contacts.map(c => (
                            <tr
                                key={c.id}
                                className={selected.has(c.id) ? 'row-selected' : ''}
                                onClick={() => toggleSelect(c.id)}
                            >
                                <td onClick={e => e.stopPropagation()}>
                                    <input
                                        type="checkbox"
                                        className="mkt-checkbox"
                                        checked={selected.has(c.id)}
                                        onChange={() => toggleSelect(c.id)}
                                    />
                                </td>
                                <td>
                                    <div className="mkt-contact-cell">
                                        <div className="mkt-contact-avatar">
                                            {c.name ? c.name.charAt(0).toUpperCase() : '?'}
                                        </div>
                                        <span className="mkt-contact-name">{c.name || '—'}</span>
                                    </div>
                                </td>
                                <td><span className="mkt-phone">{c.phone}</span></td>
                                <td style={{ fontSize: 12, color: '#6b7280' }}>{c.email || '—'}</td>
                                <td>
                                    <span className="mkt-status-badge" style={{
                                        background: c.status === 'CUSTOMER' ? '#f0fdf4' : c.status === 'NEW' ? '#eff6ff' : '#f9fafb',
                                        color: c.status === 'CUSTOMER' ? '#16a34a' : c.status === 'NEW' ? '#2563eb' : '#6b7280'
                                    }}>
                                        {STATUS_LABELS[c.status] || c.status}
                                    </span>
                                </td>
                                <td style={{ fontSize: 12, color: '#6b7280' }}>{c.source || '—'}</td>
                                <td>
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                        {(c.tags || []).slice(0, 3).map((t, i) => (
                                            <span key={i} className="mkt-tag-chip">{t}</span>
                                        ))}
                                        {c.tags?.length > 3 && <span className="mkt-tag-chip">+{c.tags.length - 3}</span>}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="mkt-pagination">
                    <button className="mkt-page-btn" disabled={page === 1} onClick={() => { setPage(p => p - 1); fetchContacts(page - 1); }}>‹ Önceki</button>
                    <span className="mkt-page-info">{page} / {totalPages}</span>
                    <button className="mkt-page-btn" disabled={page === totalPages} onClick={() => { setPage(p => p + 1); fetchContacts(page + 1); }}>Sonraki ›</button>
                </div>
            )}

            {/* Bulk Send Modal */}
            {showModal && (
                <BulkSendModal
                    count={selectedCount}
                    templates={templates}
                    sending={sending}
                    sentMsg={sentMsg}
                    onSend={handleBulkSend}
                    onClose={() => setShowModal(false)}
                />
            )}

            {/* Bulk Call Modal */}
            {showCallModal && (
                <BulkCallModal
                    count={selectedCount}
                    wsId={wsId}
                    calling={calling}
                    callResult={callResult}
                    onCall={handleBulkCall}
                    onClose={() => { setShowCallModal(false); setCallResult(null); }}
                />
            )}
        </div>
    );
}

function BulkCallModal({ count, wsId, calling, callResult, onCall, onClose }) {
    const [agents, setAgents] = useState([]);
    const [agentId, setAgentId] = useState('');
    const [loadingAgents, setLoadingAgents] = useState(true);

    useEffect(() => {
        api.get(`/retell/${wsId}/agents`).then(res => {
            const list = res.data?.agents || res.data || [];
            setAgents(Array.isArray(list) ? list : []);
            if (list.length === 1) setAgentId(list[0].agent_id || list[0].id);
        }).catch(() => setAgents([])).finally(() => setLoadingAgents(false));
    }, [wsId]);

    return (
        <div className="mkt-modal-overlay" onClick={onClose}>
            <div className="mkt-modal" onClick={e => e.stopPropagation()}>
                <div className="mkt-modal-header">
                    <div className="mkt-modal-title">📞 Toplu Retell Araması</div>
                    <button className="mkt-close-btn" onClick={onClose}>✕</button>
                </div>

                {callResult ? (
                    <div className="mkt-modal-body">
                        <div className="mkt-success-box">
                            <div style={{ fontSize: '2rem', marginBottom: 8 }}>📞</div>
                            <div style={{ fontWeight: 600, color: '#059669', marginBottom: 4 }}>
                                Arama başlatıldı!
                            </div>
                            <div style={{ fontSize: 14, color: '#374151', marginBottom: 8 }}>
                                <strong>{callResult.queued}</strong> kişi kuyruğa alındı. Aramalar arka planda devam ediyor.
                            </div>
                            <div style={{ fontSize: 12, color: '#6b7280' }}>
                                📊 Arama Analizi sekmesinden durumu takip edebilirsiniz.
                            </div>
                        </div>
                        <button className="mkt-btn-primary" onClick={onClose} style={{ marginTop: 16, width: '100%' }}>Tamam</button>
                    </div>
                ) : (
                    <div className="mkt-modal-body">
                        <div className="mkt-modal-info">
                            <span>📋 Aranacak kişi:</span>
                            <strong>{count} kişi</strong>
                        </div>

                        <div className="mkt-form-group">
                            <label>Retell Agent</label>
                            {loadingAgents ? (
                                <div style={{ fontSize: 13, color: '#9ca3af' }}>Agentlar yükleniyor...</div>
                            ) : agents.length === 0 ? (
                                <div style={{ fontSize: 13, color: '#dc2626' }}>
                                    ⚠️ Agent bulunamadı. Ayarlar &gt; AI Arama bölümünden agent ekleyin.
                                </div>
                            ) : (
                                <select className="mkt-form-select" value={agentId} onChange={e => setAgentId(e.target.value)}>
                                    <option value="">— Agent seçin —</option>
                                    {agents.map(a => (
                                        <option key={a.agent_id || a.id} value={a.agent_id || a.id}>
                                            {a.agent_name || a.name || a.agent_id || a.id}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>

                        <div className="mkt-modal-warning">
                            ⚠️ Aramalar arka planda sırayla başlatılır (0.8 sn aralıkla). Sonuçları Arama Analizi sekmesinden takip edin.
                        </div>

                        <div className="mkt-modal-actions">
                            <button className="mkt-btn-secondary" onClick={onClose}>İptal</button>
                            <button
                                className="mkt-btn-call"
                                onClick={() => {
                                    const selectedAgent = agents.find(a => (a.agent_id || a.id) === agentId);
                                    const name = selectedAgent ? (selectedAgent.agent_name || selectedAgent.name || agentId) : agentId;
                                    onCall(agentId, name);
                                }}
                                disabled={!agentId || calling || agents.length === 0}
                            >
                                {calling ? '⏳ Başlatılıyor...' : `📞 ${count} Kişiyi Ara`}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function BulkSendModal({ count, templates, sending, sentMsg, onSend, onClose }) {
    const [templateId, setTemplateId] = useState('');
    const selectedTpl = templates.find(t => t.id === templateId);

    return (
        <div className="mkt-modal-overlay" onClick={onClose}>
            <div className="mkt-modal" onClick={e => e.stopPropagation()}>
                <div className="mkt-modal-header">
                    <div className="mkt-modal-title">📤 Toplu Şablon Gönderimi</div>
                    <button className="mkt-close-btn" onClick={onClose}>✕</button>
                </div>

                {sentMsg ? (
                    <div className="mkt-modal-body">
                        <div className="mkt-success-box">
                            <div style={{ fontSize: '2rem', marginBottom: 8 }}>✅</div>
                            <div style={{ fontWeight: 600, color: '#16a34a', marginBottom: 4 }}>{sentMsg}</div>
                            <div style={{ fontSize: 13, color: '#6b7280' }}>Gönderimler arka planda devam ediyor. Analiz sekmesinden takip edebilirsiniz.</div>
                        </div>
                        <button className="mkt-btn-primary" onClick={onClose} style={{ marginTop: 16, width: '100%' }}>Tamam</button>
                    </div>
                ) : (
                    <div className="mkt-modal-body">
                        <div className="mkt-modal-info">
                            <span>📋 Seçilen kişi:</span>
                            <strong>{count} kişi</strong>
                        </div>

                        <div className="mkt-form-group">
                            <label>Gönderilecek Şablon</label>
                            <select
                                className="mkt-form-select"
                                value={templateId}
                                onChange={e => setTemplateId(e.target.value)}
                            >
                                <option value="">— Şablon seçin —</option>
                                {templates.map(t => (
                                    <option key={t.id} value={t.id}>{t.name} ({t.language})</option>
                                ))}
                            </select>
                        </div>

                        {selectedTpl && (
                            <div className="mkt-tpl-preview">
                                <div className="mkt-tpl-preview-label">Önizleme</div>
                                <div className="mkt-tpl-preview-body">{selectedTpl.bodyText}</div>
                                {selectedTpl.bodyText?.includes('{{1}}') && (
                                    <div className="mkt-tpl-preview-note">
                                        💡 <code>{'{{1}}'}</code> → kişi adıyla otomatik doldurulacak
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="mkt-modal-warning">
                            ⚠️ Mesajlar arasına 1.5 sn gecikme eklenir (WhatsApp rate limit). {count} kişi için tahmini süre: ~{Math.ceil(count * 1.5 / 60)} dakika.
                        </div>

                        <div className="mkt-modal-actions">
                            <button className="mkt-btn-secondary" onClick={onClose}>İptal</button>
                            <button
                                className="mkt-btn-primary"
                                onClick={() => onSend(templateId)}
                                disabled={!templateId || sending}
                            >
                                {sending ? '⏳ Başlatılıyor...' : `📤 ${count} Kişiye Gönder`}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS TAB
// ─────────────────────────────────────────────────────────────────────────────
function AnalyticsTab({ wsId }) {
    const navigate = useNavigate();
    const [days, setDays] = useState(30);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [clearing, setClearing] = useState(false);
    const [statusFilter, setStatusFilter] = useState('');
    const [search, setSearch] = useState('');
    const [inputSearch, setInputSearch] = useState('');
    const [sortCol, setSortCol] = useState('sentAt');
    const [sortDir, setSortDir] = useState('desc');

    const commitSearch = () => setSearch(inputSearch);
    const clearSearch  = () => { setInputSearch(''); setSearch(''); };

    const fetchAnalytics = useCallback(async () => {
        if (!wsId) return;
        setLoading(true);
        try {
            const res = await api.get(`/marketing/${wsId}/template-analytics?days=${days}`);
            setData(res.data);
        } catch (e) { console.error(e); }
        setLoading(false);
    }, [wsId, days]);

    useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

    const handleClearTemplate = async (templateName) => {
        if (!window.confirm(`"${templateName}" şablonuna ait tüm gönderim geçmişi silinecek.\nBu işlem geri alınamaz. Devam etmek istiyor musunuz?`)) return;
        setClearing(true);
        try {
            const res = await api.delete(`/marketing/${wsId}/template-analytics?templateName=${encodeURIComponent(templateName)}`);
            alert(res.data.message);
            setSelectedTemplate(null);
            fetchAnalytics();
        } catch (e) { alert('Silme hatası: ' + (e.response?.data?.error || e.message)); }
        setClearing(false);
    };

    const handleClearAll = async () => {
        if (!window.confirm(`TÜM şablon gönderim geçmişi silinecek.\nBu işlem geri alınamaz. Devam etmek istiyor musunuz?`)) return;
        setClearing(true);
        try {
            const res = await api.delete(`/marketing/${wsId}/template-analytics`);
            alert(res.data.message);
            setSelectedTemplate(null);
            fetchAnalytics();
        } catch (e) { alert('Silme hatası: ' + (e.response?.data?.error || e.message)); }
        setClearing(false);
    };

    const overall = data?.overall || {};
    const templates = data?.templates || [];
    const sel = selectedTemplate ? templates.find(t => t.templateName === selectedTemplate) : null;

    const readRate = overall.totalSent > 0 ? Math.round((overall.totalRead / overall.totalSent) * 100) : 0;
    const deliveryRate = overall.totalSent > 0 ? Math.round((overall.totalDelivered / overall.totalSent) * 100) : 0;
    const failedCount = sel ? (sel.recipients || []).filter(r => r.status === 'FAILED').length : 0;

    const filteredRecipients = (sel?.recipients || [])
        .filter(r => {
            if (statusFilter && r.status !== statusFilter) return false;
            if (search) {
                const q = search.toLowerCase();
                return (r.name?.toLowerCase().includes(q) || r.phone?.includes(q) || r.email?.toLowerCase().includes(q));
            }
            return true;
        })
        .sort((a, b) => {
            let va = a[sortCol], vb = b[sortCol];
            if (sortCol === 'sentAt') { va = new Date(va); vb = new Date(vb); }
            else { va = (va || '').toString().toLowerCase(); vb = (vb || '').toString().toLowerCase(); }
            if (va < vb) return sortDir === 'asc' ? -1 : 1;
            if (va > vb) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });

    const handleSort = (col) => {
        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortCol(col); setSortDir('asc'); }
    };
    const sortIcon = (col) => sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

    return (
        <div className="mkt-analytics-wrap">
            {/* Stats */}
            <div className="mkt-stats-row">
                <StatBig icon="📤" label="Toplam Gönderim"  value={overall.totalSent}      sub={`${overall.uniqueTemplates ?? 0} farklı şablon`} color="#2563eb" />
                <StatBig icon="📦" label="Teslim Edildi"    value={overall.totalDelivered}  sub={`%${deliveryRate} teslim oranı`}                 color="#16a34a" />
                <StatBig icon="👁"  label="Okundu"           value={overall.totalRead}       sub={`%${readRate} okunma oranı`}                     color="#ca8a04" />
                <StatBig icon="❌" label="Başarısız"        value={overall.totalFailed}     sub=""                                                color="#dc2626" />
            </div>

            {/* Filter bar */}
            <div className="mkt-analytics-bar">
                <div className="mkt-day-selector">
                    {DAY_OPTIONS.map(d => (
                        <button key={d} className={`mkt-day-btn ${days === d ? 'active' : ''}`} onClick={() => { setDays(d); setSelectedTemplate(null); }}>
                            Son {d} gün
                        </button>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button className="mkt-refresh-btn" onClick={fetchAnalytics} disabled={loading}>
                        {loading ? '⏳' : '🔄'} Yenile
                    </button>
                    {(overall.totalSent > 0) && (
                        <button className="mkt-clear-all-btn" onClick={handleClearAll} disabled={clearing}>
                            🗑️ Tüm Geçmişi Temizle
                        </button>
                    )}
                </div>
            </div>

            {/* Content */}
            {loading ? (
                <div className="mkt-loading"><div className="mkt-loading-spinner" />Yükleniyor...</div>
            ) : templates.length === 0 ? (
                <div className="mkt-empty">
                    <div className="mkt-empty-icon">📭</div>
                    <p>Son {days} günde gönderilmiş şablon mesajı bulunamadı.</p>
                    <small>Toplu Gönderim sekmesinden şablon gönderdiğinizde burada görünecek.</small>
                </div>
            ) : (
                <div className="mkt-body">
                    {/* Template list */}
                    <div className="mkt-template-list">
                        <div className="mkt-list-header">Şablonlar ({templates.length})</div>
                        {templates.map(t => (
                            <div
                                key={t.templateName}
                                className={`mkt-template-row ${selectedTemplate === t.templateName ? 'selected' : ''}`}
                                onClick={() => { setSelectedTemplate(t.templateName === selectedTemplate ? null : t.templateName); setStatusFilter(''); setSearch(''); }}
                            >
                                <div className="mkt-tpl-top">
                                    <span className="mkt-tpl-name" title={t.templateName}>{t.templateName}</span>
                                    <span className="mkt-tpl-total">{t.total}</span>
                                </div>
                                <div className="mkt-tpl-chips">
                                    <span className="mkt-chip delivered">✅ {t.delivered + t.read}</span>
                                    <span className="mkt-chip read">👁 {t.read}</span>
                                    {t.failed > 0 && <span className="mkt-chip failed">❌ {t.failed}</span>}
                                </div>
                                <MiniBar value={t.delivered + t.read} max={t.total} color="#16a34a" />
                                <div className="mkt-tpl-date">
                                    {t.lastSentAt ? new Date(t.lastSentAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Detail panel */}
                    <div className="mkt-detail-area">
                        {!sel ? (
                            <div className="mkt-detail-placeholder"><div style={{ fontSize: '2.5rem' }}>👈</div><p>Şablon seçin</p></div>
                        ) : (
                            <>
                                <div className="mkt-detail-header">
                                    <div className="mkt-detail-title-row">
                                        <span className="mkt-detail-tpl-name">📄 {sel.templateName}</span>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button className="mkt-clear-tpl-btn" onClick={() => handleClearTemplate(sel.templateName)} disabled={clearing}>🗑️ Geçmişi Temizle</button>
                                            <button className="mkt-close-btn" onClick={() => setSelectedTemplate(null)}>✕</button>
                                        </div>
                                    </div>
                                    <div className="mkt-rate-row-grid">
                                        <div className="mkt-rate-item"><div className="mkt-rate-label">Toplam</div><div className="mkt-rate-val" style={{ color: '#1f2937' }}>{sel.total}</div></div>
                                        <div className="mkt-rate-item"><div className="mkt-rate-label">Teslim</div><div className="mkt-rate-val" style={{ color: '#16a34a' }}>{sel.delivered + sel.read} <small>%{sel.deliveryRate}</small></div></div>
                                        <div className="mkt-rate-item"><div className="mkt-rate-label">Okundu</div><div className="mkt-rate-val" style={{ color: '#ca8a04' }}>{sel.read} <small>%{sel.readRate}</small></div></div>
                                        <div className="mkt-rate-item"><div className="mkt-rate-label">Bekliyor</div><div className="mkt-rate-val" style={{ color: '#2563eb' }}>{sel.sent}</div></div>
                                        <div className="mkt-rate-item"><div className="mkt-rate-label">Başarısız</div><div className="mkt-rate-val" style={{ color: '#dc2626' }}>{sel.failed} <small>%{sel.failRate}</small></div></div>
                                    </div>
                                </div>

                                <div className="mkt-filters">
                                    <div className="mkt-search-group">
                                        <input
                                            className="mkt-search-input"
                                            type="text"
                                            placeholder="🔍 İsim veya numara..."
                                            value={inputSearch}
                                            onChange={e => setInputSearch(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && commitSearch()}
                                        />
                                        {inputSearch && (
                                            <button className="mkt-search-clear" onClick={clearSearch} title="Temizle">×</button>
                                        )}
                                        <button className="mkt-search-btn" onClick={commitSearch}>🔍 Ara</button>
                                    </div>
                                    <div className="mkt-filter-tabs">
                                        {STATUS_FILTER_OPTS.map(opt => (
                                            <button key={opt.value} className={`mkt-filter-tab ${statusFilter === opt.value ? 'active' : ''}`} onClick={() => setStatusFilter(opt.value)}>
                                                {opt.label}
                                                {opt.value === 'FAILED' && failedCount > 0 && <span className="mkt-badge-red">{failedCount}</span>}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="mkt-table-wrap">
                                    {/* Search result header when filtering */}
                                    {(search || statusFilter) && (
                                        <div className="mkt-search-result-header">
                                            {search && <span>🔍 <strong>{search}</strong> için arama sonucu</span>}
                                            {statusFilter && <span className="mkt-search-result-badge">{STATUS_META[statusFilter]?.icon} {STATUS_META[statusFilter]?.label}</span>}
                                            <span className="mkt-search-result-count">{filteredRecipients.length} sonuç</span>
                                            <button className="mkt-search-result-clear" onClick={() => { clearSearch(); setStatusFilter(''); }}>× Filtreyi kaldır</button>
                                        </div>
                                    )}
                                    <table className="mkt-table">
                                        <thead>
                                            <tr>
                                                <th onClick={() => handleSort('name')} className="sortable">Ad Soyad{sortIcon('name')}</th>
                                                <th onClick={() => handleSort('phone')} className="sortable">Telefon{sortIcon('phone')}</th>
                                                <th onClick={() => handleSort('status')} className="sortable">Durum{sortIcon('status')}</th>
                                                <th onClick={() => handleSort('sentAt')} className="sortable">Tarih{sortIcon('sentAt')}</th>
                                                <th>İşlem</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredRecipients.length === 0 && (
                                                <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>Kayıt bulunamadı.</td></tr>
                                            )}
                                            {filteredRecipients.map(r => {
                                                const st = STATUS_META[r.status] || { label: r.status, bg: '#f3f4f6', text: '#6b7280', icon: '?' };
                                                return (
                                                    <tr key={r.messageId} className={r.status === 'FAILED' ? 'row-failed' : ''}>
                                                        <td>
                                                            <div className="mkt-contact-cell">
                                                                <div className="mkt-contact-avatar">{(r.name && r.name !== '—') ? r.name.charAt(0).toUpperCase() : '?'}</div>
                                                                <div>
                                                                    <div className="mkt-contact-name">{r.name || '—'}</div>
                                                                    {r.email && <div className="mkt-contact-email">{r.email}</div>}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td><span className="mkt-phone">{r.phone}</span></td>
                                                        <td><span className="mkt-status-badge" style={{ background: st.bg, color: st.text }}>{st.icon} {st.label}</span></td>
                                                        <td className="mkt-date-cell">
                                                            <div>{new Date(r.sentAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</div>
                                                            <div className="mkt-time">{new Date(r.sentAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>
                                                        </td>
                                                        <td>
                                                            {r.conversationId && (
                                                                <button className="mkt-action-btn primary" onClick={() => navigate('/inbox', { state: { conversationId: r.conversationId } })}>
                                                                    💬 Konuşma
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    {filteredRecipients.length > 0 && (
                                        <div className="mkt-table-footer">{filteredRecipients.length} / {sel.recipients.length} kişi</div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

const TARGET_STATUS_META = {
    queued:  { label: 'Bekliyor',  bg: '#f3f4f6', text: '#6b7280',  icon: '⏳' },
    called:  { label: 'Arandı',    bg: '#f0fdf4', text: '#16a34a',  icon: '✅' },
    failed:  { label: 'Aranamadı', bg: '#fef2f2', text: '#dc2626',  icon: '❌' },
};

function CallAnalyticsTab({ wsId }) {
    const [batches, setBatches]         = useState([]);
    const [total, setTotal]             = useState(0);
    const [loading, setLoading]         = useState(true);
    const [selectedBatch, setSelected]  = useState(null); // batch detail object
    const [detailLoading, setDetailL]   = useState(false);
    const [statusFilter, setStatusFilter] = useState(''); // for detail view
    const [inputSearch, setInputSearch] = useState('');
    const [search, setSearch]           = useState('');

    const fetchBatches = useCallback(async () => {
        if (!wsId) return;
        setLoading(true);
        try {
            const res = await api.get(`/retell/${wsId}/bulk-batches?limit=50`);
            setBatches(res.data.batches || []);
            setTotal(res.data.total || 0);
        } catch (e) { console.error(e); }
        setLoading(false);
    }, [wsId]);

    useEffect(() => { fetchBatches(); }, [fetchBatches]);

    const openBatch = async (batchId) => {
        setDetailL(true);
        setSelected(null);
        setStatusFilter('');
        setInputSearch('');
        setSearch('');
        try {
            const res = await api.get(`/retell/${wsId}/bulk-batches/${batchId}`);
            setSelected(res.data);
        } catch (e) { alert('Detay yüklenemedi'); }
        setDetailL(false);
    };

    const commitSearch = () => setSearch(inputSearch);
    const clearSearch  = () => { setInputSearch(''); setSearch(''); };

    // Overall stats across all batches
    const totalTarget = batches.reduce((s, b) => s + b.totalTarget, 0);
    const totalCalled = batches.reduce((s, b) => s + b.totalCalled, 0);
    const totalFailed = batches.reduce((s, b) => s + b.totalFailed, 0);

    // Detail view filters
    const filteredTargets = selectedBatch ? (selectedBatch.targets || []).filter(t => {
        if (statusFilter && t.status !== statusFilter) return false;
        if (search) {
            const q = search.toLowerCase();
            return t.name?.toLowerCase().includes(q) || t.phone?.includes(q);
        }
        return true;
    }) : [];

    if (selectedBatch) {
        const b = selectedBatch;
        const calledCount  = (b.targets || []).filter(t => t.status === 'called').length;
        const failedCount  = (b.targets || []).filter(t => t.status === 'failed').length;
        const queuedCount  = (b.targets || []).filter(t => t.status === 'queued').length;

        return (
            <div className="mkt-analytics-wrap">
                {/* Batch header */}
                <div className="mkt-detail-header">
                    <div className="mkt-detail-title-row">
                        <div>
                            <span className="mkt-detail-tpl-name">📞 Toplu Arama — {new Date(b.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Agent: {b.agentName || b.agentId}</div>
                        </div>
                        <button className="mkt-close-btn" onClick={() => setSelected(null)}>✕ Listeye Dön</button>
                    </div>
                    <div className="mkt-rate-row-grid">
                        <div className="mkt-rate-item"><div className="mkt-rate-label">Hedef</div><div className="mkt-rate-val" style={{ color: '#1f2937' }}>{b.totalTarget}</div></div>
                        <div className="mkt-rate-item"><div className="mkt-rate-label">Arandı</div><div className="mkt-rate-val" style={{ color: '#16a34a' }}>{calledCount} <small>%{b.totalTarget > 0 ? Math.round(calledCount/b.totalTarget*100) : 0}</small></div></div>
                        <div className="mkt-rate-item"><div className="mkt-rate-label">Aranamadı</div><div className="mkt-rate-val" style={{ color: '#dc2626' }}>{failedCount}</div></div>
                        <div className="mkt-rate-item"><div className="mkt-rate-label">Bekliyor</div><div className="mkt-rate-val" style={{ color: '#ca8a04' }}>{queuedCount}</div></div>
                    </div>
                </div>

                {/* Filters */}
                <div className="mkt-filters">
                    <div className="mkt-search-group">
                        <input className="mkt-search-input" type="text" placeholder="🔍 İsim veya numara..."
                            value={inputSearch} onChange={e => setInputSearch(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && commitSearch()} />
                        {inputSearch && <button className="mkt-search-clear" onClick={clearSearch}>×</button>}
                        <button className="mkt-search-btn" onClick={commitSearch}>🔍 Ara</button>
                    </div>
                    <div className="mkt-filter-tabs">
                        {[{ value: '', label: 'Tümü' }, { value: 'called', label: '✅ Arandı' }, { value: 'failed', label: '❌ Aranamadı' }, { value: 'queued', label: '⏳ Bekliyor' }].map(opt => (
                            <button key={opt.value} className={`mkt-filter-tab ${statusFilter === opt.value ? 'active' : ''}`} onClick={() => setStatusFilter(opt.value)}>
                                {opt.label}
                                {opt.value === 'failed' && failedCount > 0 && <span className="mkt-badge-red">{failedCount}</span>}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Table */}
                <div className="mkt-table-wrap">
                    {(search || statusFilter) && (
                        <div className="mkt-search-result-header">
                            {search && <span>🔍 <strong>{search}</strong> için sonuç</span>}
                            {statusFilter && <span className="mkt-search-result-badge">{TARGET_STATUS_META[statusFilter]?.icon} {TARGET_STATUS_META[statusFilter]?.label}</span>}
                            <span className="mkt-search-result-count">{filteredTargets.length} kişi</span>
                            <button className="mkt-search-result-clear" onClick={() => { clearSearch(); setStatusFilter(''); }}>× Filtreyi kaldır</button>
                        </div>
                    )}
                    <table className="mkt-table">
                        <thead><tr>
                            <th>Kişi</th>
                            <th>Telefon</th>
                            <th>Arama Durumu</th>
                            <th>Çağrı Durumu</th>
                            <th>Süre</th>
                            <th>Duygu</th>
                        </tr></thead>
                        <tbody>
                            {filteredTargets.length === 0 && (
                                <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>Kayıt bulunamadı.</td></tr>
                            )}
                            {filteredTargets.map((t, i) => {
                                const ts = TARGET_STATUS_META[t.status] || TARGET_STATUS_META.queued;
                                const cs = t.call ? (CALL_STATUS_META[t.call.status] || { label: t.call.status, bg: '#f3f4f6', text: '#6b7280', icon: '?' }) : null;
                                const sm = t.call?.sentiment ? SENTIMENT_META[t.call.sentiment.toLowerCase()] : null;
                                return (
                                    <tr key={i} className={t.status === 'failed' ? 'row-failed' : ''}>
                                        <td>
                                            <div className="mkt-contact-cell">
                                                <div className="mkt-contact-avatar">{t.name ? t.name.charAt(0).toUpperCase() : '?'}</div>
                                                <span className="mkt-contact-name">{t.name || '—'}</span>
                                            </div>
                                        </td>
                                        <td><span className="mkt-phone">{t.phone}</span></td>
                                        <td>
                                            <span className="mkt-status-badge" style={{ background: ts.bg, color: ts.text }}>
                                                {ts.icon} {ts.label}
                                            </span>
                                        </td>
                                        <td>
                                            {cs ? <span className="mkt-status-badge" style={{ background: cs.bg, color: cs.text }}>{cs.icon} {cs.label}</span>
                                                 : <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>}
                                        </td>
                                        <td className="mkt-date-cell">{fmtDur(t.call?.duration)}</td>
                                        <td>{sm ? <span style={{ fontSize: 13, color: sm.color, fontWeight: 600 }}>{sm.icon} {sm.label}</span> : <span style={{ color: '#9ca3af' }}>—</span>}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    // ── BATCH LIST VIEW ──
    return (
        <div className="mkt-analytics-wrap">
            {/* Overall stats */}
            <div className="mkt-stats-row">
                <StatBig icon="📋" label="Toplam Kampanya" value={total}                                         color="#2563eb" />
                <StatBig icon="👥" label="Toplam Hedef"    value={totalTarget.toLocaleString('tr-TR')}           color="#7c3aed" />
                <StatBig icon="✅" label="Arandı"          value={totalCalled.toLocaleString('tr-TR')}           color="#16a34a" sub={totalTarget > 0 ? `%${Math.round(totalCalled/totalTarget*100)}` : ''} />
                <StatBig icon="❌" label="Aranamadı"       value={totalFailed.toLocaleString('tr-TR')}           color="#dc2626" />
            </div>

            {/* Refresh bar */}
            <div className="mkt-analytics-bar">
                <span style={{ fontSize: 13, color: '#6b7280' }}>Toplu arama kampanyaları — en yeni önce</span>
                <button className="mkt-refresh-btn" onClick={fetchBatches} disabled={loading}>
                    {loading ? '⏳' : '🔄'} Yenile
                </button>
            </div>

            {/* Batch list */}
            {loading ? (
                <div className="mkt-loading"><div className="mkt-loading-spinner" />Yükleniyor...</div>
            ) : batches.length === 0 ? (
                <div className="mkt-empty">
                    <div className="mkt-empty-icon">📭</div>
                    <p>Henüz toplu arama kampanyası yok.</p>
                    <small>Toplu Gönderim sekmesinde kişi seçip 📞 Kişiyi Ara butonuna basın.</small>
                </div>
            ) : (
                <div className="mkt-bulk-table-wrap">
                    <table className="mkt-table">
                        <thead><tr>
                            <th>Tarih</th>
                            <th>Agent</th>
                            <th>Hedef</th>
                            <th>Arandı</th>
                            <th>Aranamadı</th>
                            <th>Başarı %</th>
                            <th></th>
                        </tr></thead>
                        <tbody>
                            {batches.map(b => {
                                const rate = b.totalTarget > 0 ? Math.round(b.totalCalled / b.totalTarget * 100) : 0;
                                const queued = b.totalTarget - b.totalCalled - b.totalFailed;
                                return (
                                    <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => openBatch(b.id)}>
                                        <td className="mkt-date-cell">
                                            <div>{new Date(b.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                                            <div className="mkt-time">{new Date(b.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>
                                        </td>
                                        <td style={{ fontSize: 13 }}>{b.agentName || '—'}</td>
                                        <td><strong>{b.totalTarget}</strong></td>
                                        <td><span style={{ color: '#16a34a', fontWeight: 600 }}>✅ {b.totalCalled}</span></td>
                                        <td>
                                            {b.totalFailed > 0
                                                ? <span style={{ color: '#dc2626', fontWeight: 600 }}>❌ {b.totalFailed}</span>
                                                : <span style={{ color: '#9ca3af' }}>—</span>}
                                            {queued > 0 && <span style={{ color: '#ca8a04', fontSize: 12, marginLeft: 4 }}>⏳{queued}</span>}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{ flex: 1, height: 6, background: '#e5e7eb', borderRadius: 3, minWidth: 60 }}>
                                                    <div style={{ width: `${rate}%`, height: '100%', background: rate > 80 ? '#16a34a' : rate > 50 ? '#ca8a04' : '#dc2626', borderRadius: 3, transition: 'width .3s' }} />
                                                </div>
                                                <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', minWidth: 28 }}>%{rate}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <button className="mkt-detail-btn" onClick={e => { e.stopPropagation(); openBatch(b.id); }}>
                                                Detay →
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            {detailLoading && <div className="mkt-loading"><div className="mkt-loading-spinner" />Detay yükleniyor...</div>}
        </div>
    );
}


// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function Marketing() {
    const { currentWorkspace } = useAuth();
    const [activeTab, setActiveTab] = useState('bulk');
    const wsId = currentWorkspace?.id;

    return (
        <div className="mkt-page">
            {/* Header */}
            <div className="mkt-header">
                <div className="mkt-header-left">
                    <span className="mkt-header-icon">📣</span>
                    <div>
                        <h1 className="mkt-header-title">Pazarlama</h1>
                        <p className="mkt-header-sub">Toplu gönderim, Retell arama ve analiz</p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="mkt-tabs">
                <button className={`mkt-tab ${activeTab === 'bulk' ? 'active' : ''}`} onClick={() => setActiveTab('bulk')}>
                    📤 Toplu Gönderim
                </button>
                <button className={`mkt-tab ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>
                    💬 WhatsApp Şablon Analiz
                </button>
                <button className={`mkt-tab ${activeTab === 'calls' ? 'active' : ''}`} onClick={() => setActiveTab('calls')}>
                    📞 Arama Analizi
                </button>
            </div>

            {/* Tab content */}
            <div className="mkt-tab-content">
                {activeTab === 'bulk'      && <BulkSendTab wsId={wsId} />}
                {activeTab === 'analytics' && <AnalyticsTab wsId={wsId} />}
                {activeTab === 'calls'     && <CallAnalyticsTab wsId={wsId} />}
            </div>
        </div>
    );
}
