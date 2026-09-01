import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import {
    Megaphone, Users, BarChart2, Phone,
    Send
} from 'lucide-react';
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
    const [tagFilter, setTagFilter] = useState('');
    const [segmentFilter, setSegmentFilter] = useState('');
    const [filterTags, setFilterTags] = useState([]);
    const [segmentGroups, setSegmentGroups] = useState({});
    const [segmentCounts, setSegmentCounts] = useState({});

    const [selected, setSelected] = useState(new Set());
    const [selectAllPages, setSelectAllPages] = useState(false);
    const [templates, setTemplates] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [showCallModal, setShowCallModal] = useState(false);
    const [calling, setCalling] = useState(false);
    const [callResult, setCallResult] = useState(null);
    const [sending, setSending] = useState(false);
    const [sentMsg, setSentMsg] = useState('');
    const [bulkJob, setBulkJob] = useState(null); // { jobId, sent, failed, total, done, templateName }
    const pollRef = useRef(null);

    const searchTimer = useRef(null);

    const fetchContacts = useCallback(async (p = 1) => {
        if (!wsId) return;
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: p, limit: 50 });
            if (search) params.set('search', search);
            if (statusFilter) params.set('status', statusFilter);
            if (sourceFilter) params.set('source', sourceFilter);
            if (tagFilter) params.set('tag', tagFilter);
            if (segmentFilter) params.set('segment', segmentFilter);

            const res = await api.get(`/marketing/${wsId}/contacts?${params}`);
            setContacts(res.data.contacts || []);
            setTotal(res.data.total || 0);
            setTotalPages(res.data.totalPages || 1);
            if (res.data.filters) {
                setFilterStatuses(res.data.filters.statuses || []);
                setFilterSources(res.data.filters.sources || []);
                if (res.data.filters.tags) setFilterTags(res.data.filters.tags);
            }
        } catch (e) { console.error(e); }
        setLoading(false);
    }, [wsId, search, statusFilter, sourceFilter, tagFilter, segmentFilter]);

    useEffect(() => { fetchContacts(1); setPage(1); setSelected(new Set()); setSelectAllPages(false); }, [fetchContacts]);

    const fetchTemplates = async () => {
        try {
            const res = await api.get(`/automations/${wsId}/templates`);
            setTemplates((res.data.templates || []).filter(t => t.status === 'APPROVED'));
        } catch (e) { console.error(e); }
    };

    const fetchSegments = useCallback(async () => {
        if (!wsId) return;
        try {
            const res = await api.get(`/smart-segments/${wsId}/segments/definitions`);
            setSegmentGroups(res.data.groups || {});
        } catch (e) { console.error('Segment fetch error:', e); }
    }, [wsId]);

    const fetchSegmentCounts = useCallback(async () => {
        if (!wsId) return;
        try {
            const res = await api.get(`/smart-segments/${wsId}/segments/counts`);
            setSegmentCounts(res.data.counts || {});
        } catch (e) { console.error('Segment count error:', e); }
    }, [wsId]);

    useEffect(() => { fetchSegments(); fetchSegmentCounts(); }, [fetchSegments, fetchSegmentCounts]);

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
                body.selectAll = true;
                body.filters = { search, status: statusFilter, source: sourceFilter, tag: tagFilter, segment: segmentFilter };
            } else {
                body.contactIds = [...selected];
            }
            const res = await api.post(`/marketing/${wsId}/bulk-send`, body);
            const { jobId, queued, templateName } = res.data;

            // Start live progress tracking
            setBulkJob({ jobId, sent: 0, failed: 0, total: queued, done: false, templateName });
            setSentMsg('');
            setSelected(new Set());
            setSelectAllPages(false);

            // Poll for progress every 2 seconds
            pollRef.current = setInterval(async () => {
                try {
                    const status = await api.get(`/marketing/${wsId}/bulk-send-status/${jobId}`);
                    const { sent, failed, total, done, lastError, errors } = status.data;
                    setBulkJob(prev => prev ? { ...prev, sent, failed, total, done, lastError, errors } : null);
                    if (done) {
                        clearInterval(pollRef.current);
                        pollRef.current = null;
                    }
                } catch (e) {
                    // Ignore polling errors silently
                }
            }, 2000);

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
                body.filters = { search, status: statusFilter, source: sourceFilter, tag: tagFilter, segment: segmentFilter };
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
            {/* ── Floating bulk-send progress banner (visible when modal is closed) ── */}
            {bulkJob && !showModal && (
                <div
                    onClick={() => setShowModal(true)}
                    style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 100,
                        background: bulkJob.done
                            ? (bulkJob.sent > 0 ? '#f0fdf4' : '#fef2f2')
                            : 'linear-gradient(90deg, #1e40af 0%, #3b82f6 100%)',
                        color: bulkJob.done ? '#111' : '#fff',
                        padding: '10px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        cursor: 'pointer',
                        boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
                        borderRadius: '0 0 12px 12px',
                        marginBottom: 8,
                        userSelect: 'none',
                        flexWrap: 'wrap'
                    }}
                >
                    {bulkJob.done ? (
                        <span style={{ fontSize: 18 }}>{bulkJob.sent > 0 ? '✅' : '❌'}</span>
                    ) : (
                        <span style={{
                            width: 16, height: 16,
                            border: '2.5px solid rgba(255,255,255,0.35)',
                            borderTop: '2.5px solid #fff',
                            borderRadius: '50%',
                            display: 'inline-block',
                            flexShrink: 0,
                            animation: 'mkt-spin 0.8s linear infinite'
                        }} />
                    )}

                    <span style={{ fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
                        {bulkJob.templateName || 'Toplu Gönderim'}
                    </span>

                    <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.5px' }}>
                        {(bulkJob.sent + bulkJob.failed).toLocaleString('tr-TR')}
                        <span style={{ fontWeight: 400, fontSize: 13, opacity: 0.75 }}> / {bulkJob.total.toLocaleString('tr-TR')}</span>
                    </span>

                    <span style={{ fontSize: 12, opacity: 0.9 }}>
                        ✅ {bulkJob.sent.toLocaleString('tr-TR')}
                        {bulkJob.failed > 0 && (
                            <span style={{ marginLeft: 8, color: bulkJob.done ? '#ef4444' : '#fca5a5' }}>
                                ❌ {bulkJob.failed.toLocaleString('tr-TR')}
                            </span>
                        )}
                    </span>

                    <div style={{ flex: 1, background: 'rgba(255,255,255,0.25)', borderRadius: 999, height: 7, overflow: 'hidden', minWidth: 80 }}>
                        <div style={{
                            height: '100%',
                            background: bulkJob.done ? '#22c55e' : '#fff',
                            borderRadius: 999,
                            width: bulkJob.total > 0
                                ? `${Math.round(((bulkJob.sent + bulkJob.failed) / bulkJob.total) * 100)}%`
                                : '0%',
                            transition: 'width 1.5s ease'
                        }} />
                    </div>

                    <span style={{ fontSize: 12, opacity: 0.85, flexShrink: 0 }}>
                        {bulkJob.total > 0
                            ? `${Math.round(((bulkJob.sent + bulkJob.failed) / bulkJob.total) * 100)}%`
                            : '0%'}
                    </span>

                    {!bulkJob.done && (
                        <span style={{ fontSize: 11, opacity: 0.7, flexShrink: 0 }}>↗ detay</span>
                    )}

                    {bulkJob.done && (
                        <button
                            onClick={e => { e.stopPropagation(); setBulkJob(null); }}
                            style={{
                                background: 'rgba(0,0,0,0.1)', border: 'none', cursor: 'pointer',
                                fontSize: 14, borderRadius: '50%', width: 22, height: 22,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                marginLeft: 4, flexShrink: 0
                            }}
                            title="Kapat"
                        >×</button>
                    )}
                </div>
            )}

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
                        <select className="mkt-filter-select" value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setSelectAllPages(false); }}>
                            <option value="">Tüm Kaynaklar</option>
                            {filterSources.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select className="mkt-filter-select" value={tagFilter} onChange={e => { setTagFilter(e.target.value); setSelectAllPages(false); }}>
                            <option value="">Tüm Etiketler</option>
                            {filterTags.map(t => <option key={t} value={t}>🏷️ {t}</option>)}
                        </select>
                        <span className="mkt-total-badge">
                            {search || sourceFilter || tagFilter || segmentFilter ? `${total.toLocaleString('tr-TR')} sonuç` : `${total.toLocaleString('tr-TR')} kişi`}
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

                {/* Akıllı Segmentler */}
                {Object.keys(segmentGroups).length > 0 && (
                    <div style={{ 
                        display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 0',
                        borderTop: '1px solid #f1f5f9'
                    }}>
                        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, width: '100%', marginBottom: 2 }}>📊 Akıllı Segmentler</span>
                        {Object.entries(segmentGroups).map(([groupKey, segs]) => (
                            segs.map(seg => (
                                <button
                                    key={seg.id}
                                    onClick={() => {
                                        setSegmentFilter(prev => prev === seg.id ? '' : seg.id);
                                        setSelectAllPages(false);
                                    }}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                        padding: '4px 10px', borderRadius: 20,
                                        fontSize: 12, fontWeight: 500, cursor: 'pointer',
                                        border: segmentFilter === seg.id ? '1.5px solid #3b82f6' : '1px solid #e2e8f0',
                                        background: segmentFilter === seg.id ? '#eff6ff' : '#fff',
                                        color: segmentFilter === seg.id ? '#2563eb' : '#475569',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    <span style={{ fontSize: 13 }}>{seg.icon}</span>
                                    {seg.label}
                                    {segmentCounts[seg.id] !== undefined && (
                                        <span style={{
                                            fontSize: 10, fontWeight: 700, padding: '1px 5px',
                                            borderRadius: 10,
                                            background: segmentFilter === seg.id ? '#3b82f6' : '#f1f5f9',
                                            color: segmentFilter === seg.id ? '#fff' : '#64748b'
                                        }}>
                                            {segmentCounts[seg.id]}
                                        </span>
                                    )}
                                </button>
                            ))
                        ))}
                    </div>
                )}
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
                            <th>Kaynak</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>
                                <div className="mkt-loading-spinner" style={{ margin: '0 auto 8px' }} />Yükleniyor...
                            </td></tr>
                        )}
                        {!loading && contacts.length === 0 && (
                            <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>
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
                                <td style={{ fontSize: 12, color: '#6b7280' }}>{c.source || '—'}</td>
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
                    bulkJob={bulkJob}
                    onSend={handleBulkSend}
                    onClose={() => {
                        setShowModal(false);
                        // Don't stop polling or clear bulkJob — send continues in background
                        setSentMsg('');
                    }}
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

function BulkSendModal({ count, templates, sending, sentMsg, bulkJob, onSend, onClose }) {
    const [templateId, setTemplateId] = useState('');
    const selectedTpl = templates.find(t => t.id === templateId);

    // Active job running
    const isRunning = bulkJob && !bulkJob.done;
    const isDone    = bulkJob && bulkJob.done;

    const pct = bulkJob && bulkJob.total > 0
        ? Math.round(((bulkJob.sent + bulkJob.failed) / bulkJob.total) * 100)
        : 0;

    return (
        <div className="mkt-modal-overlay" onClick={onClose}>
            <div className="mkt-modal" onClick={e => e.stopPropagation()}>
                <div className="mkt-modal-header">
                    <div className="mkt-modal-title">📤 Toplu Şablon Gönderimi</div>
                    <button className="mkt-close-btn" onClick={onClose}>✕</button>
                </div>

                {/* ── PROGRESS VIEW (running or done) ── */}
                {bulkJob ? (
                    <div className="mkt-modal-body">
                        <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
                            <div style={{ fontSize: '2rem', marginBottom: 10 }}>
                                {isDone ? '✅' : '📤'}
                            </div>
                            <div style={{ fontWeight: 700, fontSize: 16, color: isDone ? '#16a34a' : '#1e293b', marginBottom: 4 }}>
                                {isDone
                                    ? `Gönderim tamamlandı!`
                                    : `"${bulkJob.templateName}" gönderiliyor...`}
                            </div>

                            {/* Counter: 51 / 1600 */}
                            <div style={{
                                fontSize: 36,
                                fontWeight: 800,
                                color: '#4f46e5',
                                letterSpacing: '-1px',
                                margin: '12px 0 4px'
                            }}>
                                {bulkJob.sent + bulkJob.failed}
                                <span style={{ fontSize: 18, color: '#94a3b8', fontWeight: 500 }}>
                                    {' '}/ {bulkJob.total}
                                </span>
                            </div>

                            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
                                ✅ {bulkJob.sent} gönderildi
                                {bulkJob.failed > 0 && <span style={{ color: '#ef4444', marginLeft: 8 }}>❌ {bulkJob.failed} başarısız</span>}
                            </div>

                            {/* Progress bar */}
                            <div style={{
                                width: '100%',
                                height: 10,
                                background: '#e2e8f0',
                                borderRadius: 999,
                                overflow: 'hidden',
                                marginBottom: 8
                            }}>
                                <div style={{
                                    height: '100%',
                                    width: pct + '%',
                                    background: isDone ? '#22c55e' : 'linear-gradient(90deg, #4f46e5, #818cf8)',
                                    borderRadius: 999,
                                    transition: 'width 1.8s ease'
                                }} />
                            </div>
                            <div style={{ fontSize: 13, color: '#64748b' }}>{pct}%</div>

                            {!isDone && (
                                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 12 }}>
                                    ⏱ Mesajlar arasında 1.5 sn bekleniyor. Modal'ı kapatabilirsiniz, gönderim arka planda devam eder.
                                </div>
                            )}

                            {isDone && bulkJob.failed > 0 && (
                                <div style={{
                                    marginTop: 12,
                                    padding: '10px 14px',
                                    background: '#fef2f2',
                                    borderRadius: 8,
                                    fontSize: 12,
                                    color: '#dc2626',
                                    textAlign: 'left'
                                }}>
                                    <div style={{ fontWeight: 700, marginBottom: 6 }}>
                                        ❌ {bulkJob.failed} gönderim başarısız
                                    </div>
                                    {bulkJob.lastError && (
                                        <div style={{
                                            background: '#fff',
                                            border: '1px solid #fecaca',
                                            borderRadius: 6,
                                            padding: '6px 10px',
                                            marginBottom: 6,
                                            fontFamily: 'monospace',
                                            fontSize: 11,
                                            wordBreak: 'break-all'
                                        }}>
                                            🔍 Hata: {bulkJob.lastError}
                                        </div>
                                    )}
                                    {bulkJob.errors?.length > 0 && (
                                        <div>
                                            <div style={{ fontSize: 11, color: '#92400e', marginBottom: 4 }}>İlk başarısız numaralar:</div>
                                            {bulkJob.errors.map((e, i) => (
                                                <div key={i} style={{ fontSize: 11, color: '#7f1d1d', padding: '2px 0' }}>
                                                    📱 {e.phone} — {e.msg}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <button
                            className="mkt-btn-primary"
                            onClick={onClose}
                            style={{ marginTop: 8, width: '100%' }}
                        >
                            {isDone ? 'Kapat' : 'Arka planda devam et →'}
                        </button>
                    </div>

                ) : sentMsg ? (
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
// CAMPAIGNS TAB — Kampanya Takibi
// ─────────────────────────────────────────────────────────────────────────────
function CampaignsTab({ wsId }) {
    const [campaigns, setCampaigns] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [typeFilter, setTypeFilter] = useState('');
    const [days, setDays] = useState(30);

    const fetchCampaigns = useCallback(async () => {
        if (!wsId) return;
        setLoading(true);
        try {
            const params = new URLSearchParams({ days });
            if (typeFilter) params.set('type', typeFilter);
            const res = await api.get(`/marketing/${wsId}/campaigns?${params}`);
            setCampaigns(res.data?.data || []);
            setStats(res.data?.stats || null);
        } catch (e) { console.error(e); }
        setLoading(false);
    }, [wsId, typeFilter, days]);

    useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

    const TYPE_LABELS = { BULK: '📤 Toplu', AUTOMATION: '⚡ Otomasyon', CALL: '📞 Arama' };
    const STATUS_COLORS = {
        SENDING: { bg: '#fef9c3', text: '#a16207' },
        COMPLETED: { bg: '#dcfce7', text: '#16a34a' },
        DRAFT: { bg: '#f1f5f9', text: '#64748b' },
        SCHEDULED: { bg: '#dbeafe', text: '#2563eb' }
    };

    return (
        <div>
            {/* Stats */}
            {stats && (
                <div className="mkt-stats-row" style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                    <StatBig icon="📤" label="Gönderildi" value={stats.totalSent} color="#3b82f6" />
                    <StatBig icon="💬" label="Cevap Verdi" value={stats.totalReplied} sub={`%${stats.replyRate}`} color="#10b981" />
                    <StatBig icon="🎯" label="Dönüşüm" value={stats.totalConverted} sub={`%${stats.conversionRate}`} color="#8b5cf6" />
                    <StatBig icon="📖" label="Okundu" value={stats.totalRead} color="#f59e0b" />
                </div>
            )}

            {/* Filters */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
                    style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}>
                    <option value="">Tüm Tipler</option>
                    <option value="BULK">📤 Toplu Gönderim</option>
                    <option value="AUTOMATION">⚡ Otomasyon</option>
                    <option value="CALL">📞 Arama</option>
                </select>
                <select value={days} onChange={(e) => setDays(parseInt(e.target.value))}
                    style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}>
                    {DAY_OPTIONS.map(d => <option key={d} value={d}>Son {d} gün</option>)}
                </select>
            </div>

            {/* Campaign List */}
            {loading ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Yükleniyor...</div>
            ) : campaigns.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
                    <div>Henüz kampanya yok</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {campaigns.map(c => {
                        const sc = STATUS_COLORS[c.status] || STATUS_COLORS.DRAFT;
                        const replyRate = c.sentCount > 0 ? ((c.repliedCount || 0) / c.sentCount * 100).toFixed(0) : 0;
                        return (
                            <div key={c.id} style={{
                                background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
                                padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16
                            }}>
                                {/* Type + Name */}
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, background: sc.bg, color: sc.text, fontWeight: 600 }}>
                                            {c.status}
                                        </span>
                                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{TYPE_LABELS[c.type] || c.type}</span>
                                    </div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{c.name}</div>
                                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                        {new Date(c.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                        {c.template?.name && <span> • Şablon: {c.template.name}</span>}
                                    </div>
                                </div>

                                {/* Stats mini */}
                                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#475569' }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontWeight: 700, fontSize: 16, color: '#3b82f6' }}>{c.totalCount || 0}</div>
                                        <div>Toplam</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontWeight: 700, fontSize: 16, color: '#10b981' }}>{c.sentCount || 0}</div>
                                        <div>Gönderildi</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontWeight: 700, fontSize: 16, color: '#f59e0b' }}>{c.repliedCount || 0}</div>
                                        <div>Cevap</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontWeight: 700, fontSize: 16, color: '#8b5cf6' }}>{replyRate}%</div>
                                        <div>Oran</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontWeight: 700, fontSize: 16, color: '#dc2626' }}>{c.failedCount || 0}</div>
                                        <div>Başarısız</div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
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
    const [retrying, setRetrying] = useState(false);
    const [campaignRecipients, setCampaignRecipients] = useState([]);
    const [inputSearch, setInputSearch] = useState('');
    const [sortCol, setSortCol] = useState('sentAt');
    const [sortDir, setSortDir] = useState('desc');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo]     = useState('');
    const [errorPopup, setErrorPopup] = useState(null); // messageId of the row showing error tooltip

    const commitSearch = () => setSearch(inputSearch);
    const clearSearch  = () => { setInputSearch(''); setSearch(''); };
    const clearDateFilter = () => { setDateFrom(''); setDateTo(''); };

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

    const fetchRecipients = useCallback(async (campaignId) => {
        if (!wsId || !campaignId) return;
        try {
            const res = await api.get(`/marketing/${wsId}/campaigns/${campaignId}/recipients`);
            setCampaignRecipients(res.data.recipients || res.data || []);
        } catch (e) { console.error(e); }
    }, [wsId]);

    const handleRetry = async (selected) => {
        const campaignId = selected.id || selected.campaignId;
        
        if (!campaignId && !selected.templateName) return alert('Kampanya ID veya Şablon bulunamadı.');
        
        const failedMessageIds = filteredRecipients.filter(r => r.status === 'FAILED').map(r => r.messageId);
        if (failedMessageIds.length === 0) {
            return alert('Filtrelenmiş sonuçlarda tekrar gönderilecek başarısız mesaj bulunamadı.');
        }

        if (!window.confirm(`Listelenen ${failedMessageIds.length} başarısız mesaja tekrar göndermek istediğinize emin misiniz?`)) return;
        
        setRetrying(true);
        try {
            if (campaignId) {
                await api.post(`/marketing/${wsId}/campaigns/${campaignId}/retry`, { messageIds: failedMessageIds });
                fetchRecipients(campaignId);
            } else if (selected.templateName) {
                await api.post(`/marketing/${wsId}/template-analytics/retry`, {
                    templateName: selected.templateName,
                    messageIds: failedMessageIds
                });
            }
            alert(`${failedMessageIds.length} kişi için yeniden gönderim başlatıldı!`);
            fetchAnalytics();
        } catch (e) {
            alert('Hata: ' + (e.response?.data?.error || e.message));
        }
        setRetrying(false);
    };

    const overall = data?.overall || {};
    const templates = data?.templates || [];
    const sel = selectedTemplate ? templates.find(t => t.templateName === selectedTemplate) : null;

    useEffect(() => {
        const cId = sel?.id || sel?.campaignId;
        if (cId) {
            fetchRecipients(cId);
        } else {
            setCampaignRecipients([]);
        }
    }, [sel, fetchRecipients]);

    const readRate = overall.totalSent > 0 ? Math.round((overall.totalRead / overall.totalSent) * 100) : 0;
    const deliveryRate = overall.totalSent > 0 ? Math.round((overall.totalDelivered / overall.totalSent) * 100) : 0;
    const failedCount = sel ? (sel.recipients || []).filter(r => r.status === 'FAILED').length : 0;

    const baseRecipients = campaignRecipients.length > 0 ? campaignRecipients : (sel?.recipients || []);
    const filteredRecipients = baseRecipients
        .filter(r => {
            if (statusFilter && r.status !== statusFilter) return false;
            if (dateFrom) {
                const sent = new Date(r.sentAt);
                const from = new Date(dateFrom);
                from.setHours(0, 0, 0, 0);
                if (sent < from) return false;
            }
            if (dateTo) {
                const sent = new Date(r.sentAt);
                const to = new Date(dateTo);
                to.setHours(23, 59, 59, 999);
                if (sent > to) return false;
            }
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
                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
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
                                    
                                    {(() => {
                                        const cRecs = campaignRecipients.length > 0 ? campaignRecipients : (sel.recipients || []);
                                        const tot = cRecs.length;
                                        if (tot === 0) return null;
                                        const stats = { PENDING: 0, SENT: 0, DELIVERED: 0, READ: 0, FAILED: 0 };
                                        cRecs.forEach(r => {
                                            const st = (r.status || '').toUpperCase();
                                            if (stats[st] !== undefined) stats[st]++;
                                        });
                                        return (
                                            <div style={{ marginTop: '16px', padding: '0 4px' }}>
                                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Alıcı Durumu</div>
                                                <div style={{ display: 'flex', height: '10px', borderRadius: '5px', overflow: 'hidden', background: '#e5e7eb' }}>
                                                    <div style={{ width: `${(stats.READ / tot) * 100}%`, background: '#3b82f6' }} title={`Okundu: ${stats.READ}`} />
                                                    <div style={{ width: `${(stats.DELIVERED / tot) * 100}%`, background: '#22c55e' }} title={`Teslim Edildi: ${stats.DELIVERED}`} />
                                                    <div style={{ width: `${(stats.SENT / tot) * 100}%`, background: '#eab308' }} title={`Gönderildi: ${stats.SENT}`} />
                                                    <div style={{ width: `${(stats.PENDING / tot) * 100}%`, background: '#9ca3af' }} title={`Bekliyor: ${stats.PENDING}`} />
                                                    <div style={{ width: `${(stats.FAILED / tot) * 100}%`, background: '#ef4444' }} title={`Başarısız: ${stats.FAILED}`} />
                                                </div>
                                                <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '12px', color: '#4b5563', flexWrap: 'wrap' }}>
                                                    {stats.READ > 0 && <span>🔵 Okundu: %{Math.round((stats.READ / tot) * 100)}</span>}
                                                    {stats.DELIVERED > 0 && <span>🟢 Teslim: %{Math.round((stats.DELIVERED / tot) * 100)}</span>}
                                                    {stats.SENT > 0 && <span>🟡 Gönderildi: %{Math.round((stats.SENT / tot) * 100)}</span>}
                                                    {stats.PENDING > 0 && <span>⬜ Bekliyor: %{Math.round((stats.PENDING / tot) * 100)}</span>}
                                                    {stats.FAILED > 0 && <span>🔴 Başarısız: %{Math.round((stats.FAILED / tot) * 100)}</span>}
                                                </div>
                                            </div>
                                        );
                                    })()}
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
                                    {/* Date range filter */}
                                    <div className="mkt-date-range">
                                        <label className="mkt-date-label">📅 Başlangıç</label>
                                        <input
                                            type="date"
                                            className="mkt-date-input"
                                            value={dateFrom}
                                            onChange={e => setDateFrom(e.target.value)}
                                        />
                                        <label className="mkt-date-label">—</label>
                                        <input
                                            type="date"
                                            className="mkt-date-input"
                                            value={dateTo}
                                            onChange={e => setDateTo(e.target.value)}
                                        />
                                        {(dateFrom || dateTo) && (
                                            <button className="mkt-search-clear" onClick={clearDateFilter} title="Tarihi temizle">×</button>
                                        )}
                                    </div>
                                    <div className="mkt-filter-tabs">
                                        {STATUS_FILTER_OPTS.map(opt => (
                                            <button key={opt.value} className={`mkt-filter-tab ${statusFilter === opt.value ? 'active' : ''}`} onClick={() => setStatusFilter(opt.value)}>
                                                {opt.label}
                                                {opt.value === 'FAILED' && failedCount > 0 && <span className="mkt-badge-red">{failedCount}</span>}
                                            </button>
                                        ))}
                                        {(() => {
                                            const failedToRetry = filteredRecipients.filter(r => r.status === 'FAILED');
                                            if (failedToRetry.length > 0) {
                                                return (
                                                    <button 
                                                        className="mkt-btn-primary" 
                                                        style={{ background: '#3b82f6', borderColor: '#2563eb', padding: '4px 12px', fontSize: '0.85rem', marginLeft: '4px', height: '32px' }}
                                                        onClick={() => handleRetry(sel)}
                                                        disabled={retrying}
                                                    >
                                                        {retrying ? '⏳ Bekleyin...' : `🔄 ${failedToRetry.length} kişiye tekrar gönder`}
                                                    </button>
                                                );
                                            }
                                            return null;
                                        })()}
                                    </div>
                                </div>

                                <div className="mkt-table-wrap">
                                    {/* Search/filter result header */}
                                    {(search || statusFilter || dateFrom || dateTo) && (
                                        <div className="mkt-search-result-header">
                                            {search && <span>🔍 <strong>{search}</strong> için arama sonucu</span>}
                                            {statusFilter && <span className="mkt-search-result-badge">{STATUS_META[statusFilter]?.icon} {STATUS_META[statusFilter]?.label}</span>}
                                            {(dateFrom || dateTo) && (
                                                <span className="mkt-search-result-badge" style={{ background: '#eff6ff', color: '#2563eb' }}>
                                                    📅 {dateFrom || '...'} — {dateTo || '...'}
                                                </span>
                                            )}
                                            <span className="mkt-search-result-count">{filteredRecipients.length} sonuç</span>
                                            <button className="mkt-search-result-clear" onClick={() => { clearSearch(); setStatusFilter(''); clearDateFilter(); }}>× Filtreyi kaldır</button>
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
                                                        <td>
                                                            <div style={{ position: 'relative', display: 'inline-block' }}>
                                                                <span
                                                                    className="mkt-status-badge"
                                                                    style={{
                                                                        background: st.bg,
                                                                        color: st.text,
                                                                        cursor: r.status === 'FAILED' && r.errorReason ? 'pointer' : 'default'
                                                                    }}
                                                                    title={r.status === 'FAILED' && r.errorReason ? 'Hata detayı için tıkla' : undefined}
                                                                    onClick={() => {
                                                                        if (r.status === 'FAILED' && r.errorReason) {
                                                                            setErrorPopup(prev => prev === r.messageId ? null : r.messageId);
                                                                        }
                                                                    }}
                                                                >
                                                                    {st.icon} {st.label}
                                                                    {r.status === 'FAILED' && r.errorReason && (
                                                                        <span style={{ marginLeft: 4, fontSize: 11, opacity: 0.7 }}>ℹ️</span>
                                                                    )}
                                                                </span>
                                                                {errorPopup === r.messageId && r.errorReason && (
                                                                    <div style={{
                                                                        position: 'absolute',
                                                                        top: '110%',
                                                                        left: 0,
                                                                        zIndex: 999,
                                                                        background: '#1e293b',
                                                                        color: '#f1f5f9',
                                                                        borderRadius: 8,
                                                                        padding: '10px 14px',
                                                                        fontSize: 12,
                                                                        maxWidth: 320,
                                                                        minWidth: 200,
                                                                        lineHeight: 1.5,
                                                                        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                                                                        whiteSpace: 'pre-wrap',
                                                                        wordBreak: 'break-word'
                                                                    }}>
                                                                        <div style={{ fontWeight: 700, marginBottom: 4, color: '#f87171' }}>❌ Gönderim Hatası</div>
                                                                        <div style={{ opacity: 0.9 }}>{r.errorReason}</div>
                                                                        <div
                                                                            onClick={e => { e.stopPropagation(); setErrorPopup(null); }}
                                                                            style={{ marginTop: 8, color: '#94a3b8', cursor: 'pointer', fontSize: 11 }}
                                                                        >× Kapat</div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
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

const CALL_STATUS_META = {
    registered: { label: 'Hazırlanıyor', bg: '#f3f4f6', text: '#6b7280', icon: '⏳' },
    ongoing:    { label: 'Devam Ediyor', bg: '#eff6ff', text: '#3b82f6', icon: '📞' },
    ended:      { label: 'Bitti',        bg: '#f0fdf4', text: '#16a34a', icon: '✅' },
    error:      { label: 'Hata',         bg: '#fef2f2', text: '#dc2626', icon: '❌' },
};

const SENTIMENT_META = {
    positive: { label: 'Olumlu',  color: '#16a34a', icon: '😊' },
    neutral:  { label: 'Nötr',    color: '#6b7280', icon: '😐' },
    negative: { label: 'Olumsuz', color: '#dc2626', icon: '😞' },
};

const fmtDur = (ms) => {
    if (!ms) return '—';
    const s = Math.round(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
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
// GROUPS TAB
// ─────────────────────────────────────────────────────────────────────────────
const GROUP_COLORS = [
    '#2563eb','#16a34a','#dc2626','#ca8a04','#7c3aed',
    '#0891b2','#db2777','#ea580c','#65a30d','#475569'
];

function GroupFormModal({ initial, onSave, onClose }) {
    const [name, setName]     = useState(initial?.name || '');
    const [desc, setDesc]     = useState(initial?.description || '');
    const [color, setColor]   = useState(initial?.color || '#2563eb');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!name.trim()) return alert('Grup adı zorunlu');
        setSaving(true);
        await onSave({ name: name.trim(), description: desc.trim(), icon: '👥', color });
        setSaving(false);
    };

    return (
        <div className="mkt-modal-overlay" onClick={onClose}>
            <div className="grp-form-modal" onClick={e => e.stopPropagation()}>
                <div className="grp-modal-header">
                    <h2 className="grp-modal-title">{initial ? 'Grubu Düzenle' : 'Yeni Grup Oluştur'}</h2>
                    <button className="grp-modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="grp-modal-body">
                    <div className="grp-field">
                        <label className="grp-label">Grup Adı</label>
                        <input
                            className="grp-input"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="örn. Fitness Üyeleri"
                            maxLength={60}
                            autoFocus
                            onKeyDown={e => e.key === 'Enter' && handleSave()}
                        />
                    </div>
                    <div className="grp-field">
                        <label className="grp-label">Açıklama <span className="grp-label-opt">(isteğe bağlı)</span></label>
                        <input
                            className="grp-input"
                            value={desc}
                            onChange={e => setDesc(e.target.value)}
                            placeholder="Bu grup hakkında kısa bir açıklama"
                            maxLength={120}
                        />
                    </div>
                    <div className="grp-field">
                        <label className="grp-label">Renk</label>
                        <div className="grp-color-row">
                            {GROUP_COLORS.map(c => (
                                <button
                                    key={c}
                                    className={`grp-color-dot ${color === c ? 'active' : ''}`}
                                    style={{ background: c }}
                                    onClick={() => setColor(c)}
                                />
                            ))}
                        </div>
                    </div>
                </div>
                <div className="grp-modal-footer">
                    <button className="grp-btn-cancel" onClick={onClose}>İptal</button>
                    <button
                        className="grp-btn-save"
                        style={{ background: color }}
                        onClick={handleSave}
                        disabled={saving || !name.trim()}
                    >
                        {saving ? 'Kaydediliyor...' : 'Kaydet'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function ContactPickerModal({ wsId, groupId, onAdded, onClose }) {
    const [contacts, setContacts]   = useState([]);
    const [total, setTotal]         = useState(0);
    const [inputSearch, setInput]   = useState('');
    const [search, setSearch]       = useState('');
    const [page, setPage]           = useState(1);
    const [loading, setLoading]     = useState(false);
    const [selected, setSelected]   = useState(new Set());
    const [adding, setAdding]       = useState(false);
    const limit = 50;

    const fetchContacts = useCallback(async (p = 1, q = search) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: p, limit, ...(q ? { search: q } : {}) });
            const res = await api.get(`/contact-groups/${wsId}/groups/${groupId}/available-contacts?${params}`);
            setContacts(res.data.contacts || []);
            setTotal(res.data.total || 0);
        } catch (e) { console.error(e); }
        setLoading(false);
    }, [wsId, groupId, search]);

    useEffect(() => { fetchContacts(1); }, [fetchContacts]);

    const commitSearch = () => { setSearch(inputSearch); setPage(1); };
    const toggleSelect = id => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const toggleAll    = () => setSelected(prev => prev.size === contacts.length ? new Set() : new Set(contacts.map(c => c.id)));

    const handleAdd = async () => {
        if (!selected.size) return;
        setAdding(true);
        try {
            await api.post(`/contact-groups/${wsId}/groups/${groupId}/members`, { contactIds: [...selected] });
            onAdded(selected.size);
        } catch (e) { alert('Eklenemedi: ' + (e.response?.data?.error || e.message)); }
        setAdding(false);
    };

    const totalPages = Math.ceil(total / limit);

    return (
        <div className="mkt-modal-overlay" onClick={onClose}>
            <div className="mkt-modal grp-picker-modal" onClick={e => e.stopPropagation()}>
                <div className="mkt-modal-header">
                    <div className="mkt-modal-title">👤 Kişi Ekle</div>
                    <button className="mkt-close-btn" onClick={onClose}>✕</button>
                </div>
                <div className="grp-picker-search">
                    <div className="mkt-search-group">
                        <input className="mkt-search-input" type="text" placeholder="🔍 İsim veya numara..."
                            value={inputSearch} onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && commitSearch()} />
                        {inputSearch && <button className="mkt-search-clear" onClick={() => { setInput(''); setSearch(''); }}>×</button>}
                        <button className="mkt-search-btn" onClick={commitSearch}>🔍 Ara</button>
                    </div>
                    <span style={{ fontSize: 13, color: '#6b7280' }}>{total.toLocaleString('tr-TR')} kişi mevcut</span>
                </div>
                <div className="grp-picker-list">
                    {loading ? (
                        <div className="mkt-loading"><div className="mkt-loading-spinner" />Yükleniyor...</div>
                    ) : contacts.length === 0 ? (
                        <div className="mkt-empty" style={{ padding: 32 }}>
                            <div className="mkt-empty-icon">📭</div>
                            <p>Eklenebilecek kişi bulunamadı.</p>
                        </div>
                    ) : (
                        <table className="mkt-table">
                            <thead><tr>
                                <th style={{ width: 36 }}>
                                    <input type="checkbox" className="mkt-checkbox"
                                        checked={selected.size === contacts.length && contacts.length > 0}
                                        onChange={toggleAll} />
                                </th>
                                <th>Ad Soyad</th>
                                <th>Telefon</th>
                                <th>Kaynak</th>
                            </tr></thead>
                            <tbody>
                                {contacts.map(c => (
                                    <tr key={c.id} className={selected.has(c.id) ? 'row-selected' : ''} onClick={() => toggleSelect(c.id)} style={{ cursor: 'pointer' }}>
                                        <td onClick={e => e.stopPropagation()}>
                                            <input type="checkbox" className="mkt-checkbox"
                                                checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} />
                                        </td>
                                        <td>
                                            <div className="mkt-contact-cell">
                                                <div className="mkt-contact-avatar">{c.name ? c.name.charAt(0).toUpperCase() : '?'}</div>
                                                <span className="mkt-contact-name">{c.name || '—'}</span>
                                            </div>
                                        </td>
                                        <td><span className="mkt-phone">{c.phone || '—'}</span></td>
                                        <td style={{ fontSize: 12, color: '#6b7280' }}>{c.source || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="mkt-pagination" style={{ border: 'none', borderTop: '1px solid #f3f4f6' }}>
                        <button className="mkt-page-btn" disabled={page === 1} onClick={() => { setPage(p => p-1); fetchContacts(page-1); }}>‹</button>
                        <span className="mkt-page-info">{page} / {totalPages}</span>
                        <button className="mkt-page-btn" disabled={page === totalPages} onClick={() => { setPage(p => p+1); fetchContacts(page+1); }}>›</button>
                    </div>
                )}
                <div className="mkt-modal-actions" style={{ borderTop: '1px solid #f3f4f6', padding: '12px 20px' }}>
                    <span style={{ fontSize: 13, color: '#6b7280' }}>{selected.size} kişi seçildi</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="mkt-btn-secondary" onClick={onClose}>İptal</button>
                        <button className="mkt-btn-primary" onClick={handleAdd} disabled={!selected.size || adding}>
                            {adding ? '⏳ Ekleniyor...' : `✅ ${selected.size} Kişi Ekle`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function GroupDetailDrawer({ wsId, group, onClose, onEdit, onDelete, onBulkSend, onBulkCall, onCountChange }) {
    const [members, setMembers]     = useState([]);
    const [total, setTotal]         = useState(0);
    const [page, setPage]           = useState(1);
    const [loading, setLoading]     = useState(true);
    const [search, setSearch]       = useState('');
    const [inputSearch, setInput]   = useState('');
    const [showPicker, setShowPicker] = useState(false);
    const [removing, setRemoving]   = useState(new Set());
    const [selectedMembers, setSelectedMembers] = useState(new Set());
    const limit = 50;

    const fetchMembers = useCallback(async (p = 1, q = search) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: p, limit, ...(q ? { search: q } : {}) });
            const res = await api.get(`/contact-groups/${wsId}/groups/${group.id}/members?${params}`);
            setMembers(res.data.members || []);
            setTotal(res.data.total || 0);
        } catch (e) { console.error(e); }
        setLoading(false);
    }, [wsId, group.id, search]);

    useEffect(() => { fetchMembers(1); }, [fetchMembers]);

    const commitSearch = () => { setSearch(inputSearch); setPage(1); };

    const handleRemove = async (contactId) => {
        setRemoving(prev => new Set([...prev, contactId]));
        try {
            await api.delete(`/contact-groups/${wsId}/groups/${group.id}/members/${contactId}`);
            setMembers(prev => prev.filter(m => m.id !== contactId));
            setTotal(prev => { const n = prev - 1; onCountChange?.(group.id, n); return n; });
        } catch (e) { alert('Üye çıkarılamadı'); }
        setRemoving(prev => { const n = new Set(prev); n.delete(contactId); return n; });
    };

    const handleRemoveSelected = async () => {
        if (!selectedMembers.size || !window.confirm(`${selectedMembers.size} kişi gruptan çıkarılacak. Onaylıyor musunuz?`)) return;
        try {
            await api.delete(`/contact-groups/${wsId}/groups/${group.id}/members`, { data: { contactIds: [...selectedMembers] } });
            setMembers(prev => prev.filter(m => !selectedMembers.has(m.id)));
            setTotal(prev => { const n = prev - selectedMembers.size; onCountChange?.(group.id, n); return n; });
            setSelectedMembers(new Set());
        } catch (e) { alert('Çıkarma başarısız'); }
    };

    const toggleMember = id => setSelectedMembers(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const toggleAll    = () => setSelectedMembers(prev => prev.size === members.length ? new Set() : new Set(members.map(m => m.id)));

    const totalPages = Math.ceil(total / limit);

    return (
        <>
            <div className="grp-drawer-overlay" onClick={onClose} />
            <div className="grp-drawer">
                {/* ── Header ── */}
                <div className="grp-drawer-top" style={{ borderLeft: `4px solid ${group.color}` }}>
                    <div className="grp-drawer-top-left">
                        <div className="grp-drawer-badge" style={{ background: group.color + '18', color: group.color }}>
                            {group.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div className="grp-drawer-name">{group.name}</div>
                            {group.description && <div className="grp-drawer-desc">{group.description}</div>}
                        </div>
                    </div>
                    <div className="grp-drawer-top-right">
                        <button className="grp-icon-action" title="Düzenle" onClick={onEdit}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button className="grp-icon-action danger" title="Sil" onClick={onDelete}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                        <button className="grp-icon-action" title="Kapat" onClick={onClose}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                </div>

                {/* ── Stats + actions ── */}
                <div className="grp-drawer-stats">
                    <div className="grp-stat">
                        <span className="grp-stat-val" style={{ color: group.color }}>{total.toLocaleString('tr-TR')}</span>
                        <span className="grp-stat-label">Kişi</span>
                    </div>
                    <div className="grp-stat-divider" />
                    <button className="grp-action-pill" style={{ color: group.color, borderColor: group.color + '40', background: group.color + '0a' }} onClick={() => onBulkCall(group)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 17z"/></svg>
                        Toplu Ara
                    </button>
                    <button className="grp-action-pill" style={{ color: group.color, borderColor: group.color + '40', background: group.color + '0a' }} onClick={() => onBulkSend(group)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                        Şablon Gönder
                    </button>
                </div>

                {/* ── Toolbar ── */}
                <div className="grp-drawer-toolbar">
                    <div className="grp-search-wrap">
                        <svg className="grp-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <input
                            className="grp-search-input"
                            type="text"
                            placeholder="İsim veya numara ara..."
                            value={inputSearch}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && commitSearch()}
                        />
                        {inputSearch && <button className="grp-search-clear-btn" onClick={() => { setInput(''); setSearch(''); }}>✕</button>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {selectedMembers.size > 0 && (
                            <button className="grp-remove-selected-btn" onClick={handleRemoveSelected}>
                                Çıkar ({selectedMembers.size})
                            </button>
                        )}
                        <button className="grp-add-btn" style={{ background: group.color }} onClick={() => setShowPicker(true)}>
                            + Kişi Ekle
                        </button>
                    </div>
                </div>

                {/* Member list */}
                <div className="grp-drawer-list">
                    {loading ? (
                        <div className="mkt-loading"><div className="mkt-loading-spinner" />Yükleniyor...</div>
                    ) : members.length === 0 ? (
                        <div className="mkt-empty">
                            <div className="mkt-empty-icon">👥</div>
                            <p>Bu grupta henüz kişi yok.</p>
                            <button className="mkt-btn-primary" onClick={() => setShowPicker(true)}>+ Kişi Ekle</button>
                        </div>
                    ) : (
                        <table className="mkt-table">
                            <thead><tr>
                                <th style={{ width: 36 }}>
                                    <input type="checkbox" className="mkt-checkbox"
                                        checked={selectedMembers.size === members.length && members.length > 0}
                                        onChange={toggleAll} />
                                </th>
                                <th>Ad Soyad</th>
                                <th>Telefon</th>
                                <th>Kaynak</th>
                                <th></th>
                            </tr></thead>
                            <tbody>
                                {members.map(m => (
                                    <tr key={m.id} className={selectedMembers.has(m.id) ? 'row-selected' : ''} onClick={() => toggleMember(m.id)} style={{ cursor: 'pointer' }}>
                                        <td onClick={e => e.stopPropagation()}>
                                            <input type="checkbox" className="mkt-checkbox"
                                                checked={selectedMembers.has(m.id)} onChange={() => toggleMember(m.id)} />
                                        </td>
                                        <td>
                                            <div className="mkt-contact-cell">
                                                <div className="mkt-contact-avatar" style={{ background: group.color + '18', color: group.color }}>
                                                    {m.name ? m.name.charAt(0).toUpperCase() : '?'}
                                                </div>
                                                <span className="mkt-contact-name">{m.name || '—'}</span>
                                            </div>
                                        </td>
                                        <td><span className="mkt-phone">{m.phone || '—'}</span></td>
                                        <td style={{ fontSize: 12, color: '#6b7280' }}>{m.source || '—'}</td>
                                        <td>
                                            <button className="grp-remove-btn" disabled={removing.has(m.id)}
                                                onClick={e => { e.stopPropagation(); handleRemove(m.id); }}
                                                title="Gruptan Çıkar">
                                                {removing.has(m.id) ? '⏳' : '×'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                {totalPages > 1 && (
                    <div className="mkt-pagination" style={{ flexShrink: 0 }}>
                        <button className="mkt-page-btn" disabled={page === 1} onClick={() => { setPage(p => p-1); fetchMembers(page-1); }}>‹ Önceki</button>
                        <span className="mkt-page-info">{page} / {totalPages}</span>
                        <button className="mkt-page-btn" disabled={page === totalPages} onClick={() => { setPage(p => p+1); fetchMembers(page+1); }}>Sonraki ›</button>
                    </div>
                )}
            </div>

            {showPicker && (
                <ContactPickerModal wsId={wsId} groupId={group.id}
                    onAdded={(count) => { setShowPicker(false); fetchMembers(1); setTotal(t => { const n = t + count; onCountChange?.(group.id, n); return n; }); }}
                    onClose={() => setShowPicker(false)} />
            )}
        </>
    );
}

function GroupsTab({ wsId }) {
    const [groups, setGroups]           = useState([]);
    const [loading, setLoading]         = useState(true);
    const [showForm, setShowForm]       = useState(false);
    const [editGroup, setEditGroup]     = useState(null);
    const [activeGroup, setActiveGroup] = useState(null); // for drawer
    // for passing to bulk modals
    const [bulkSendGroup, setBulkSendGroup] = useState(null);
    const [bulkCallGroup, setBulkCallGroup] = useState(null);
    const [groupMembers, setGroupMembers]   = useState([]); // members for bulk actions

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

    const handleCreate = async (data) => {
        try {
            const res = await api.post(`/contact-groups/${wsId}/groups`, data);
            setGroups(prev => [res.data, ...prev]);
            setShowForm(false);
        } catch (e) { alert('Grup oluşturulamadı: ' + (e.response?.data?.error || e.message)); }
    };

    const handleUpdate = async (data) => {
        try {
            const res = await api.put(`/contact-groups/${wsId}/groups/${editGroup.id}`, data);
            setGroups(prev => prev.map(g => g.id === editGroup.id ? { ...g, ...res.data } : g));
            if (activeGroup?.id === editGroup.id) setActiveGroup(prev => ({ ...prev, ...res.data }));
            setEditGroup(null);
        } catch (e) { alert('Güncellenemedi: ' + (e.response?.data?.error || e.message)); }
    };

    const handleDelete = async (group) => {
        if (!window.confirm(`"${group.name}" grubu silinecek. Kişiler etkilenmez. Onaylıyor musunuz?`)) return;
        try {
            await api.delete(`/contact-groups/${wsId}/groups/${group.id}`);
            setGroups(prev => prev.filter(g => g.id !== group.id));
            if (activeGroup?.id === group.id) setActiveGroup(null);
        } catch (e) { alert('Silinemedi'); }
    };

    // Fetch group members for bulk actions
    const openBulkAction = async (group, type) => {
        try {
            const res = await api.get(`/contact-groups/${wsId}/groups/${group.id}/members?limit=10000`);
            const members = res.data.members || [];
            if (members.length === 0) return alert('Bu grupta henüz kişi yok.');
            setGroupMembers(members);
            type === 'send' ? setBulkSendGroup(group) : setBulkCallGroup(group);
        } catch (e) { alert('Üyeler yüklenemedi'); }
    };

    // Update group card count in real-time without re-fetching
    const handleCountChange = (groupId, newTotal) => {
        setGroups(prev => prev.map(g =>
            g.id === groupId
                ? { ...g, _count: { ...g._count, members: newTotal } }
                : g
        ));
    };

    return (
        <div className="mkt-analytics-wrap">
            {/* Top bar */}
            <div className="mkt-analytics-bar">
                <span style={{ fontSize: 13, color: '#6b7280' }}>
                    {groups.length} grup · Gruba tıklayarak kişi ekleyebilirsiniz
                </span>
                <button className="mkt-btn-primary" onClick={() => setShowForm(true)}>+ Yeni Grup</button>
            </div>

            {loading ? (
                <div className="mkt-loading"><div className="mkt-loading-spinner" />Yükleniyor...</div>
            ) : groups.length === 0 ? (
                <div className="mkt-empty">
                    <div className="mkt-empty-icon">👥</div>
                    <p>Henüz grup oluşturulmadı.</p>
                    <button className="mkt-btn-primary" onClick={() => setShowForm(true)}>+ İlk Grubu Oluştur</button>
                </div>
            ) : (
                <div className="grp-grid">
                    {groups.map(g => (
                        <div key={g.id} className="grp-card" onClick={() => setActiveGroup(g)}>
                            <div className="grp-card-header" style={{ background: `linear-gradient(135deg, ${g.color}20 0%, ${g.color}06 100%)` }}>
                                <div className="grp-card-avatar" style={{ background: g.color, boxShadow: `0 4px 12px ${g.color}55` }}>
                                    {g.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="grp-card-meta">
                                    <div className="grp-card-name">{g.name}</div>
                                    {g.description && <div className="grp-card-desc">{g.description}</div>}
                                </div>
                            </div>
                            <div className="grp-card-footer">
                                <div className="grp-card-count-badge" style={{ color: g.color, background: g.color + '12' }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                    {(g._count?.members || 0).toLocaleString('tr-TR')} kişi
                                </div>
                                <div className="grp-card-actions" onClick={e => e.stopPropagation()}>
                                    <button className="grp-card-action-btn" title="Şablon Gönder" onClick={() => openBulkAction(g, 'send')}>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                                    </button>
                                    <button className="grp-card-action-btn" title="Toplu Ara" onClick={() => openBulkAction(g, 'call')}>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 17z"/></svg>
                                    </button>
                                    <button className="grp-card-action-btn" title="Düzenle" onClick={() => { setEditGroup(g); setShowForm(true); }}>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                    </button>
                                    <button className="grp-card-action-btn danger" title="Sil" onClick={() => handleDelete(g)}>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create/Edit modal */}
            {showForm && (
                <GroupFormModal
                    initial={editGroup}
                    onSave={editGroup ? handleUpdate : handleCreate}
                    onClose={() => { setShowForm(false); setEditGroup(null); }}
                />
            )}

            {/* Drawer */}
            {activeGroup && (
                <GroupDetailDrawer
                    wsId={wsId}
                    group={activeGroup}
                    onClose={() => { setActiveGroup(null); fetchGroups(); }}
                    onEdit={() => { setEditGroup(activeGroup); setShowForm(true); }}
                    onDelete={() => handleDelete(activeGroup)}
                    onBulkSend={(g) => openBulkAction(g, 'send')}
                    onBulkCall={(g) => openBulkAction(g, 'call')}
                    onCountChange={handleCountChange}
                />
            )}

            {/* Bulk Send Modal (reuse existing BulkSendModal) */}
            {bulkSendGroup && (
                <BulkSendGroupModal
                    wsId={wsId}
                    group={bulkSendGroup}
                    members={groupMembers}
                    onClose={() => { setBulkSendGroup(null); setGroupMembers([]); }}
                />
            )}

            {/* Bulk Call Modal (reuse existing BulkCallModal) */}
            {bulkCallGroup && (
                <BulkCallGroupModal
                    wsId={wsId}
                    group={bulkCallGroup}
                    members={groupMembers}
                    onClose={() => { setBulkCallGroup(null); setGroupMembers([]); }}
                />
            )}
        </div>
    );
}

function BulkSendGroupModal({ wsId, group, members, onClose }) {
    const [templates, setTemplates] = useState([]);
    const [templateId, setTemplateId] = useState('');
    const [sending, setSending]     = useState(false);
    const [result, setResult]       = useState(null);

    useEffect(() => {
        api.get(`/automations/${wsId}/templates`)
            .then(r => setTemplates((r.data.templates || []).filter(t => t.status === 'APPROVED')))
            .catch(() => {});
    }, [wsId]);

    const selectedTpl = templates.find(t => t.id === templateId);

    const handleSend = async () => {
        if (!templateId) return alert('Şablon seçin');
        setSending(true);
        try {
            const res = await api.post(`/marketing/${wsId}/bulk-send`, {
                templateId,
                contactIds: members.map(m => m.id)
            });
            setResult(res.data);
        } catch (e) { alert('Gönderilemedi: ' + (e.response?.data?.error || e.message)); }
        setSending(false);
    };

    return (
        <div className="mkt-modal-overlay" onClick={onClose}>
            <div className="mkt-modal" onClick={e => e.stopPropagation()}>
                <div className="mkt-modal-header">
                    <div className="mkt-modal-title">📤 Toplu Şablon — {group.icon} {group.name}</div>
                    <button className="mkt-close-btn" onClick={onClose}>✕</button>
                </div>
                {result ? (
                    <div className="mkt-modal-body">
                        <div className="mkt-success-box">
                            <div style={{ fontSize: '2rem', marginBottom: 8 }}>✅</div>
                            <div style={{ fontWeight: 600, color: '#16a34a' }}>Gönderim başlatıldı!</div>
                            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Analiz sekmesinden takip edin.</div>
                        </div>
                        <button className="mkt-btn-primary" onClick={onClose} style={{ marginTop: 16, width: '100%' }}>Tamam</button>
                    </div>
                ) : (
                    <div className="mkt-modal-body">
                        <div className="mkt-modal-info"><span>👥 Kişi sayısı:</span><strong>{members.length}</strong></div>
                        <div className="mkt-form-group">
                            <label>Şablon</label>
                            <select className="mkt-form-select" value={templateId} onChange={e => setTemplateId(e.target.value)}>
                                <option value="">— Şablon seçin —</option>
                                {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.language})</option>)}
                            </select>
                        </div>
                        {selectedTpl && (
                            <div className="mkt-tpl-preview">
                                <div className="mkt-tpl-preview-label">Önizleme</div>
                                <div className="mkt-tpl-preview-body">{selectedTpl.bodyText}</div>
                            </div>
                        )}
                        <div className="mkt-modal-actions">
                            <button className="mkt-btn-secondary" onClick={onClose}>İptal</button>
                            <button className="mkt-btn-primary" onClick={handleSend} disabled={!templateId || sending}>
                                {sending ? '⏳ Gönderiliyor...' : `📤 ${members.length} Kişiye Gönder`}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function BulkCallGroupModal({ wsId, group, members, onClose }) {
    const [agents, setAgents]       = useState([]);
    const [agentId, setAgentId]     = useState('');
    const [calling, setCalling]     = useState(false);
    const [result, setResult]       = useState(null);

    useEffect(() => {
        api.get(`/retell/${wsId}/agents`).then(r => {
            const list = r.data?.agents || r.data || [];
            setAgents(Array.isArray(list) ? list : []);
            if (list.length === 1) setAgentId(list[0].agent_id || list[0].id);
        }).catch(() => {});
    }, [wsId]);

    const handleCall = async () => {
        if (!agentId) return alert('Agent seçin');
        setCalling(true);
        try {
            const selectedAgent = agents.find(a => (a.agent_id || a.id) === agentId);
            const agentName = selectedAgent ? (selectedAgent.agent_name || selectedAgent.name || agentId) : agentId;
            const res = await api.post(`/retell/${wsId}/call/bulk`, {
                agentId, agentName,
                contactIds: members.map(m => m.id)
            });
            setResult(res.data);
        } catch (e) { alert('Arama başlatılamadı: ' + (e.response?.data?.error || e.message)); }
        setCalling(false);
    };

    return (
        <div className="mkt-modal-overlay" onClick={onClose}>
            <div className="mkt-modal" onClick={e => e.stopPropagation()}>
                <div className="mkt-modal-header">
                    <div className="mkt-modal-title">📞 Toplu Arama — {group.icon} {group.name}</div>
                    <button className="mkt-close-btn" onClick={onClose}>✕</button>
                </div>
                {result ? (
                    <div className="mkt-modal-body">
                        <div className="mkt-success-box">
                            <div style={{ fontSize: '2rem', marginBottom: 8 }}>📞</div>
                            <div style={{ fontWeight: 600, color: '#059669' }}>Arama başlatıldı!</div>
                            <div style={{ fontSize: 14, color: '#374151', marginTop: 4 }}><strong>{result.queued}</strong> kişi kuyruğa alındı.</div>
                        </div>
                        <button className="mkt-btn-primary" onClick={onClose} style={{ marginTop: 16, width: '100%' }}>Tamam</button>
                    </div>
                ) : (
                    <div className="mkt-modal-body">
                        <div className="mkt-modal-info"><span>👥 Kişi sayısı:</span><strong>{members.length}</strong></div>
                        <div className="mkt-form-group">
                            <label>Retell Agent</label>
                            <select className="mkt-form-select" value={agentId} onChange={e => setAgentId(e.target.value)}>
                                <option value="">— Agent seçin —</option>
                                {agents.map(a => <option key={a.agent_id || a.id} value={a.agent_id || a.id}>{a.agent_name || a.name || a.agent_id}</option>)}
                            </select>
                        </div>
                        <div className="mkt-modal-warning">⚠️ Aramalar arka planda başlatılır. Arama Analizi sekmesinden takip edin.</div>
                        <div className="mkt-modal-actions">
                            <button className="mkt-btn-secondary" onClick={onClose}>İptal</button>
                            <button className="mkt-btn-call" onClick={handleCall} disabled={!agentId || calling}>
                                {calling ? '⏳ Başlatılıyor...' : `📞 ${members.length} Kişiyi Ara`}
                            </button>
                        </div>
                    </div>
                )}
            </div>
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

    const TABS = [
        { key: 'bulk',      label: 'Toplu Gönderim',      Icon: Send },
        { key: 'campaigns', label: 'Kampanyalar',          Icon: Megaphone },
        { key: 'analytics', label: 'WhatsApp Şablon Analiz', Icon: BarChart2 },
        { key: 'calls',     label: 'Arama Analizi',        Icon: Phone },
    ];

    return (
        <div className="mkt-page">
            {/* ── Modern Header ── */}
            <div className="mkt-header">
                <div className="mkt-header-inner">
                    <div className="mkt-header-icon-wrap">
                        <Megaphone size={22} />
                    </div>
                    <div>
                        <h1 className="mkt-header-title">Pazarlama</h1>
                        <p className="mkt-header-sub">Toplu gönderim ve arama analizi</p>
                    </div>
                </div>
            </div>

            {/* ── Modern Tabs ── */}
            <div className="mkt-tabs">
                <div className="mkt-tabs-inner">
                    {TABS.map(({ key, label, Icon }) => (
                        <button
                            key={key}
                            className={`mkt-tab ${activeTab === key ? 'active' : ''}`}
                            onClick={() => setActiveTab(key)}
                        >
                            <Icon size={15} />
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab content */}
            <div className="mkt-tab-content">
                {activeTab === 'bulk'      && <BulkSendTab wsId={wsId} />}
                {activeTab === 'campaigns' && <CampaignsTab wsId={wsId} />}
                {activeTab === 'analytics' && <AnalyticsTab wsId={wsId} />}
                {activeTab === 'calls'     && <CallAnalyticsTab wsId={wsId} />}
            </div>
        </div>
    );
}
