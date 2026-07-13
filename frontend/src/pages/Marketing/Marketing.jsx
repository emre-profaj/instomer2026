import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import './Marketing.css';

const DAY_OPTIONS = [7, 14, 30, 90];

const STATUS_META = {
    SENT:      { label: 'Gönderildi',     bg: '#eff6ff', text: '#2563eb', icon: '📤' },
    DELIVERED: { label: 'Teslim Edildi',  bg: '#f0fdf4', text: '#16a34a', icon: '📦' },
    READ:      { label: 'Okundu',         bg: '#fefce8', text: '#ca8a04', icon: '👁'  },
    FAILED:    { label: 'Başarısız',      bg: '#fef2f2', text: '#dc2626', icon: '❌' },
};

const STATUS_FILTER_OPTIONS = [
    { value: '', label: 'Tümü' },
    { value: 'READ', label: '👁 Okundu' },
    { value: 'DELIVERED', label: '📦 Teslim Edildi' },
    { value: 'SENT', label: '📤 Gönderildi (Bekliyor)' },
    { value: 'FAILED', label: '❌ Başarısız' },
];

function StatBig({ icon, label, value, sub, color }) {
    return (
        <div className="mkt-stat-card">
            <div className="mkt-stat-icon" style={{ background: color + '18' }}>{icon}</div>
            <div>
                <div className="mkt-stat-value" style={{ color }}>{value?.toLocaleString('tr-TR')}</div>
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

export default function Marketing() {
    const { currentWorkspace } = useAuth();
    const navigate = useNavigate();
    const [days, setDays] = useState(30);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedTemplate, setSelectedTemplate] = useState(null);

    // Detail table filters
    const [statusFilter, setStatusFilter] = useState('');
    const [search, setSearch] = useState('');
    const [sortCol, setSortCol] = useState('sentAt');
    const [sortDir, setSortDir] = useState('desc');

    const wsId = currentWorkspace?.id;

    const fetchAnalytics = useCallback(async () => {
        if (!wsId) return;
        setLoading(true);
        try {
            const res = await api.get(`/marketing/${wsId}/template-analytics?days=${days}`);
            setData(res.data);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    }, [wsId, days]);

    useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

    const overall = data?.overall || {};
    const templates = data?.templates || [];
    const sel = selectedTemplate ? templates.find(t => t.templateName === selectedTemplate) : null;

    const readRate = overall.totalSent > 0 ? Math.round((overall.totalRead / overall.totalSent) * 100) : 0;
    const deliveryRate = overall.totalSent > 0 ? Math.round((overall.totalDelivered / overall.totalSent) * 100) : 0;

    // Filter & sort recipients for detail table
    const filteredRecipients = (sel?.recipients || [])
        .filter(r => {
            if (statusFilter && r.status !== statusFilter) return false;
            if (search) {
                const q = search.toLowerCase();
                return (
                    (r.name && r.name.toLowerCase().includes(q)) ||
                    (r.phone && r.phone.includes(q)) ||
                    (r.email && r.email.toLowerCase().includes(q))
                );
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

    // Failed recipients count for badge
    const failedCount = sel ? (sel.recipients || []).filter(r => r.status === 'FAILED').length : 0;

    return (
        <div className="mkt-page">
            {/* ── Header ── */}
            <div className="mkt-header">
                <div className="mkt-header-left">
                    <span className="mkt-header-icon">📊</span>
                    <div>
                        <h1 className="mkt-header-title">Pazarlama Analizi</h1>
                        <p className="mkt-header-sub">WhatsApp şablon mesaj istatistikleri</p>
                    </div>
                </div>
                <div className="mkt-header-actions">
                    <div className="mkt-day-selector">
                        {DAY_OPTIONS.map(d => (
                            <button key={d} className={`mkt-day-btn ${days === d ? 'active' : ''}`} onClick={() => setDays(d)}>
                                Son {d} gün
                            </button>
                        ))}
                    </div>
                    <button className="mkt-refresh-btn" onClick={fetchAnalytics} disabled={loading}>
                        {loading ? '⏳' : '🔄'} Yenile
                    </button>
                </div>
            </div>

            {/* ── Overall Stats ── */}
            <div className="mkt-stats-row">
                <StatBig icon="📤" label="Toplam Gönderim"   value={overall.totalSent ?? 0}       sub={`${overall.uniqueTemplates ?? 0} farklı şablon`} color="#2563eb" />
                <StatBig icon="📦" label="Teslim Edildi"     value={overall.totalDelivered ?? 0}  sub={`%${deliveryRate} teslim oranı`}                  color="#16a34a" />
                <StatBig icon="👁"  label="Okundu"            value={overall.totalRead ?? 0}       sub={`%${readRate} okunma oranı`}                      color="#ca8a04" />
                <StatBig icon="❌" label="Başarısız"         value={overall.totalFailed ?? 0}     sub=""                                                 color="#dc2626" />
            </div>

            {/* ── Main body ── */}
            {loading ? (
                <div className="mkt-loading"><div className="mkt-loading-spinner" />Veriler yükleniyor...</div>
            ) : templates.length === 0 ? (
                <div className="mkt-empty">
                    <div className="mkt-empty-icon">📭</div>
                    <p>Son {days} günde gönderilmiş şablon mesajı bulunamadı.</p>
                    <small>Otomasyonlar sayfasından WhatsApp şablonu gönderdiğinizde burada görünecek.</small>
                </div>
            ) : (
                <div className="mkt-body">
                    {/* ── Left: template list ── */}
                    <div className="mkt-template-list">
                        <div className="mkt-list-header">Şablonlar ({templates.length})</div>
                        {templates.map(t => (
                            <div
                                key={t.templateName}
                                className={`mkt-template-row ${selectedTemplate === t.templateName ? 'selected' : ''}`}
                                onClick={() => {
                                    setSelectedTemplate(t.templateName === selectedTemplate ? null : t.templateName);
                                    setStatusFilter('');
                                    setSearch('');
                                }}
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
                                <div className="mkt-tpl-bar-row">
                                    <MiniBar value={t.delivered + t.read} max={t.total} color="#16a34a" />
                                </div>
                                <div className="mkt-tpl-date">
                                    {t.lastSentAt ? new Date(t.lastSentAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* ── Right: detail ── */}
                    <div className="mkt-detail-area">
                        {!sel ? (
                            <div className="mkt-detail-placeholder">
                                <div style={{ fontSize: '2.5rem' }}>👈</div>
                                <p>Detay görmek için sol listeden bir şablon seçin.</p>
                            </div>
                        ) : (
                            <>
                                {/* Detail header */}
                                <div className="mkt-detail-header">
                                    <div className="mkt-detail-title-row">
                                        <span className="mkt-detail-tpl-name">📄 {sel.templateName}</span>
                                        <button className="mkt-close-btn" onClick={() => setSelectedTemplate(null)}>✕</button>
                                    </div>

                                    {/* Rate summary */}
                                    <div className="mkt-rate-row-grid">
                                        <div className="mkt-rate-item">
                                            <div className="mkt-rate-label">Toplam</div>
                                            <div className="mkt-rate-val" style={{ color: '#1f2937' }}>{sel.total}</div>
                                        </div>
                                        <div className="mkt-rate-item">
                                            <div className="mkt-rate-label">Teslim</div>
                                            <div className="mkt-rate-val" style={{ color: '#16a34a' }}>{sel.delivered + sel.read} <small>%{sel.deliveryRate}</small></div>
                                        </div>
                                        <div className="mkt-rate-item">
                                            <div className="mkt-rate-label">Okundu</div>
                                            <div className="mkt-rate-val" style={{ color: '#ca8a04' }}>{sel.read} <small>%{sel.readRate}</small></div>
                                        </div>
                                        <div className="mkt-rate-item">
                                            <div className="mkt-rate-label">Bekliyor</div>
                                            <div className="mkt-rate-val" style={{ color: '#2563eb' }}>{sel.sent}</div>
                                        </div>
                                        <div className="mkt-rate-item">
                                            <div className="mkt-rate-label">Başarısız</div>
                                            <div className="mkt-rate-val" style={{ color: '#dc2626' }}>{sel.failed} <small>%{sel.failRate}</small></div>
                                        </div>
                                    </div>
                                </div>

                                {/* Filters */}
                                <div className="mkt-filters">
                                    <input
                                        className="mkt-search-input"
                                        type="text"
                                        placeholder="🔍 İsim veya numara ara..."
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                    />
                                    <div className="mkt-filter-tabs">
                                        {STATUS_FILTER_OPTIONS.map(opt => (
                                            <button
                                                key={opt.value}
                                                className={`mkt-filter-tab ${statusFilter === opt.value ? 'active' : ''}`}
                                                onClick={() => setStatusFilter(opt.value)}
                                            >
                                                {opt.label}
                                                {opt.value === 'FAILED' && failedCount > 0 && (
                                                    <span className="mkt-badge-red">{failedCount}</span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Recipients table */}
                                <div className="mkt-table-wrap">
                                    <table className="mkt-table">
                                        <thead>
                                            <tr>
                                                <th onClick={() => handleSort('name')} className="sortable">Ad Soyad{sortIcon('name')}</th>
                                                <th onClick={() => handleSort('phone')} className="sortable">Telefon{sortIcon('phone')}</th>
                                                <th onClick={() => handleSort('status')} className="sortable">Durum{sortIcon('status')}</th>
                                                <th onClick={() => handleSort('sentAt')} className="sortable">Gönderim Tarihi{sortIcon('sentAt')}</th>
                                                <th>İşlem</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredRecipients.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} style={{ textAlign: 'center', color: '#9ca3af', padding: '32px' }}>
                                                        Bu filtreyle eşleşen kayıt bulunamadı.
                                                    </td>
                                                </tr>
                                            )}
                                            {filteredRecipients.map(r => {
                                                const st = STATUS_META[r.status] || { label: r.status, bg: '#f3f4f6', text: '#6b7280', icon: '?' };
                                                return (
                                                    <tr key={r.messageId} className={r.status === 'FAILED' ? 'row-failed' : ''}>
                                                        <td>
                                                            <div className="mkt-contact-cell">
                                                                <div className="mkt-contact-avatar">
                                                                    {(r.name && r.name !== '—') ? r.name.charAt(0).toUpperCase() : '?'}
                                                                </div>
                                                                <div>
                                                                    <div className="mkt-contact-name">{r.name || '—'}</div>
                                                                    {r.email && <div className="mkt-contact-email">{r.email}</div>}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <span className="mkt-phone">{r.phone}</span>
                                                        </td>
                                                        <td>
                                                            <span className="mkt-status-badge" style={{ background: st.bg, color: st.text }}>
                                                                {st.icon} {st.label}
                                                            </span>
                                                        </td>
                                                        <td className="mkt-date-cell">
                                                            <div>{new Date(r.sentAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                                                            <div className="mkt-time">{new Date(r.sentAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>
                                                        </td>
                                                        <td>
                                                            <div className="mkt-action-btns">
                                                                {r.conversationId && (
                                                                    <button
                                                                        className="mkt-action-btn primary"
                                                                        title="Konuşmaya git"
                                                                        onClick={() => navigate('/inbox', { state: { conversationId: r.conversationId } })}
                                                                    >
                                                                        💬 Konuşma
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    {filteredRecipients.length > 0 && (
                                        <div className="mkt-table-footer">
                                            {filteredRecipients.length} / {sel.recipients.length} kişi gösteriliyor
                                        </div>
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
