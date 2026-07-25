import { useTranslation } from 'react-i18next';
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { retellAPI } from '../../services/api';
import {
    Phone, PhoneCall, PhoneOff, Clock, TrendingUp, CheckCircle,
    AlertCircle, Calendar, Filter, ChevronLeft, ChevronRight,
    Play, FileText, Smile, Frown, Meh, Loader, Search, PhoneIncoming, PhoneMissed, DollarSign,
    RefreshCw, CheckSquare, Square, X
} from 'lucide-react';
import './AICallAnalytics.css';
import ConfirmModal from '../../components/ConfirmModal/ConfirmModal';
import { getDateRangeLogic, dateFilterOptions } from '../../utils/dateFilters';
import '../CeoReport/CeoReport.css';
import '../CeoReport/CeoDetailReport.css';

const AICallAnalytics = () => {
    const { t } = useTranslation();
    const { currentWorkspace } = useAuth();
    const [loading, setLoading] = useState(true);
    const [analytics, setAnalytics] = useState(null);
    const [calls, setCalls] = useState([]);
    const [totalCalls, setTotalCalls] = useState(0);
    const [page, setPage] = useState(0);
    const [dateFilter, setDateFilter] = useState('thisMonth');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [expandedCall, setExpandedCall] = useState(null);
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [sentimentFilter, setSentimentFilter] = useState('ALL');
    const limit = 15;

    // Bulk selection
    const [selectedCalls, setSelectedCalls] = useState(new Set());
    const [retrying, setRetrying] = useState(false);
    const [retryResult, setRetryResult] = useState(null);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null, title: '', message: '' });

    useEffect(() => {
        if (currentWorkspace) {
            loadData();
        }
    }, [currentWorkspace, dateFilter, page, search, statusFilter, sentimentFilter, startDate, endDate]);

    // Clear selection on filter change
    useEffect(() => {
        setSelectedCalls(new Set());
    }, [statusFilter, sentimentFilter, page, search, dateFilter, startDate, endDate]);

    const getDateParams = () => {
        const { startDate: sd, endDate: ed } = getDateRangeLogic(dateFilter, startDate, endDate);
        const params = {};
        if (sd) {
            params.startDate = new Date(sd).toISOString();
        }
        if (ed) {
            const end = new Date(ed);
            end.setHours(23, 59, 59, 999);
            params.endDate = end.toISOString();
        }
        return params;
    };

    const loadData = async () => {
        setLoading(true);
        try {
            const params = getDateParams();
            const callParams = {
                limit,
                offset: page * limit,
                ...params
            };
            if (search) callParams.search = search;
            if (statusFilter !== 'ALL') callParams.status = statusFilter;
            if (sentimentFilter === 'positive' || sentimentFilter === 'negative' || sentimentFilter === 'neutral') {
                callParams.sentiment = sentimentFilter;
            }

            const [analyticsRes, callsRes] = await Promise.all([
                retellAPI.getAnalytics(currentWorkspace.id, params),
                retellAPI.getCallHistory(currentWorkspace.id, Object.fromEntries(
                    Object.entries(callParams).filter(([_, v]) => v !== undefined && v !== '')
                ))
            ]);
            setAnalytics(analyticsRes.data);
            setCalls(callsRes.data.calls || []);
            setTotalCalls(callsRes.data.total || 0);
        } catch (error) {
            console.error('Error loading AI Call analytics:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '0sn';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        if (mins > 0) return `${mins}dk ${secs}sn`;
        return `${secs}sn`;
    };

    const formatDate = (dateStr) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('tr-TR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    const getStatusBadge = (status) => {
        const map = {
            ended: { label: 'Tamamlandı', className: 'badge-success' },
            not_connected: { label: 'Ulaşılamadı', className: 'badge-default' },
            ongoing: { label: 'Devam Ediyor', className: 'badge-warning' },
            registered: { label: 'Başlatıldı', className: 'badge-info' },
            error: { label: 'Hata', className: 'badge-error' }
        };
        const s = map[status] || { label: status || 'Bilinmiyor', className: 'badge-default' };
        return <span className={`call-badge ${s.className}`}>{s.label}</span>;
    };

    const getSentimentIcon = (sentiment) => {
        if (!sentiment) return <Meh size={16} className="sentiment-neutral" />;
        const s = sentiment.toLowerCase();
        if (s === 'positive') return <Smile size={16} className="sentiment-positive" />;
        if (s === 'negative') return <Frown size={16} className="sentiment-negative" />;
        return <Meh size={16} className="sentiment-neutral" />;
    };

    // Bulk selection handlers
    const toggleSelect = (callId) => {
        setSelectedCalls(prev => {
            const next = new Set(prev);
            if (next.has(callId)) next.delete(callId);
            else next.add(callId);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedCalls.size === calls.length) {
            setSelectedCalls(new Set());
        } else {
            setSelectedCalls(new Set(calls.map(c => c.id)));
        }
    };

    const handleSelectAllCalls = async () => {
        if (selectedCalls.size === totalCalls) {
            setSelectedCalls(new Set());
            return;
        }
        try {
            const params = getDateParams();
            const callParams = { limit: 10000, offset: 0, ...params };
            if (search) callParams.search = search;
            if (statusFilter !== 'ALL') callParams.status = statusFilter;
            if (sentimentFilter !== 'ALL') callParams.sentiment = sentimentFilter;

            const res = await retellAPI.getCallHistory(currentWorkspace.id,
                Object.fromEntries(Object.entries(callParams).filter(([_, v]) => v !== undefined && v !== ''))
            );
            const allIds = (res.data.calls || []).map(c => c.id);
            setSelectedCalls(new Set(allIds));
        } catch (err) {
            console.error('Select all calls error:', err);
        }
    };

    const handleBulkRetry = async () => {
        if (selectedCalls.size === 0) return;
        setConfirmModal({
            isOpen: true,
            title: 'Tekrar Arama',
            message: `${selectedCalls.size} kişiyi tekrar aramak istediğinize emin misiniz?`,
            confirmText: 'Evet, Ara',
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                setRetrying(true);
                setRetryResult(null);
                try {
                    const res = await retellAPI.bulkRetryCall(currentWorkspace.id, [...selectedCalls]);
                    setRetryResult(res.data);
                    setSelectedCalls(new Set());
                    setTimeout(() => loadData(), 2000);
                } catch (error) {
                    setRetryResult({ success: 0, failed: selectedCalls.size, errors: [{ error: error.response?.data?.error || error.message }] });
                } finally {
                    setRetrying(false);
                }
            }
        });
    };

    const totalPages = Math.ceil(totalCalls / limit);

    if (!currentWorkspace) {
        return (
            <div className="aicall-analytics-page">
                <div className="empty-state">
                    <Phone size={48} />
                    <p>Bir workspace seçin.</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="aicall-analytics-page">
                <div className="aicall-header">
                    <div className="aicall-title-row">
                        <h1><PhoneCall size={28} /> AI Call Raporlama</h1>
                        <p className="aicall-subtitle">{t('aiCallAnalytics.subtitle')}</p>
                    </div>
                    <div className="aicall-filters" style={{ flexWrap: 'wrap' }}>
                        <button className="btn-refresh" onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>
                            <FileText size={15} />
                            PDF İndir
                        </button>
                    </div>
                </div>

                <div className="ceo-filter-bar" style={{ marginBottom: '1.5rem', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '12px 20px', marginTop: '-10px' }}>
                    <div className="ceo-filter-left">
                        <div className="ceo-filter-label"><Filter size={14} /><span>Filtreler</span></div>
                        <div className="ceo-pill-group">
                            {dateFilterOptions.map(item => (
                                <button key={item.key} className={`ceo-pill${dateFilter === item.key ? ' active' : ''}`} onClick={() => { setDateFilter(item.key); setPage(0); }}>{item.label}</button>
                            ))}
                        </div>
                        {dateFilter === 'custom' && (
                            <div className="ceo-custom-dates">
                                <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(0); }} className="ceo-date-input" />
                                <span style={{ color: '#9ca3af' }}>—</span>
                                <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(0); }} className="ceo-date-input" />
                            </div>
                        )}
                    </div>
                </div>

                {loading ? (
                    <div className="aicall-loading">
                        <Loader size={24} className="spin" />
                        <p>{t('aiCallAnalytics.loading')}</p>
                    </div>
                ) : (
                    <>
                        {/* Summary Cards */}
                        <div className="aicall-summary-grid">
                            <div className="aicall-summary-card">
                                <div className="summary-icon" style={{ background: '#eff6ff', color: '#3b82f6' }}>
                                    <Phone size={22} />
                                </div>
                                <div className="summary-content">
                                    <span className="summary-value">{analytics?.totalCalls || 0}</span>
                                    <span className="summary-label">Toplam Arama</span>
                                </div>
                            </div>
                            <div className="aicall-summary-card">
                                <div className="summary-icon" style={{ background: '#f0fdf4', color: '#22c55e' }}>
                                    <Clock size={22} />
                                </div>
                                <div className="summary-content">
                                    <span className="summary-value">{formatDuration(analytics?.totalDuration || 0)}</span>
                                    <span className="summary-label">Toplam Süre</span>
                                </div>
                            </div>
                            <div className="aicall-summary-card">
                                <div className="summary-icon" style={{ background: '#fefce8', color: '#eab308' }}>
                                    <TrendingUp size={22} />
                                </div>
                                <div className="summary-content">
                                    <span className="summary-value">{formatDuration(analytics?.avgDuration || 0)}</span>
                                    <span className="summary-label">Ort. Süre</span>
                                </div>
                            </div>
                            <div className="aicall-summary-card">
                                <div className="summary-icon" style={{ background: '#f0fdfa', color: '#0d9488' }}>
                                    <CheckCircle size={22} />
                                </div>
                                <div className="summary-content">
                                    <span className="summary-value">%{analytics?.successRate || 0}</span>
                                    <span className="summary-label">Başarı Oranı</span>
                                </div>
                            </div>
                            <div className="aicall-summary-card">
                                <div className="summary-icon" style={{ background: '#fdf2f8', color: '#ec4899' }}>
                                    <DollarSign size={22} />
                                </div>
                                <div className="summary-content">
                                    <span className="summary-value">
                                        ${(((analytics?.totalCost || 0) * 2) + ((analytics?.totalCalls || 0) * 0.10)).toFixed(2)}
                                    </span>
                                    <span className="summary-label">Toplam Maliyet</span>
                                </div>
                            </div>
                        </div>

                        {/* Breakdown Cards */}
                        <div className="aicall-breakdown-grid">
                            {/* Status Breakdown */}
                            {analytics?.statusBreakdown && Object.keys(analytics.statusBreakdown).length > 0 && (
                                <div className="aicall-breakdown-card">
                                    <h3><Filter size={16} /> Durum Dağılımı</h3>
                                    <div className="breakdown-list">
                                        {Object.entries(analytics.statusBreakdown).map(([status, count]) => (
                                            <div key={status} className="breakdown-item">
                                                <span className="breakdown-label">{getStatusBadge(status)}</span>
                                                <span className="breakdown-value">{count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Sentiment Breakdown */}
                            {analytics?.sentimentBreakdown && Object.keys(analytics.sentimentBreakdown).length > 0 && (
                                <div className="aicall-breakdown-card">
                                    <h3><Smile size={16} /> Duygu Analizi</h3>
                                    <div className="breakdown-list">
                                        {Object.entries(analytics.sentimentBreakdown).map(([sentiment, count]) => (
                                            <div key={sentiment} className="breakdown-item">
                                                <span className="breakdown-label">
                                                    {getSentimentIcon(sentiment)}
                                                    {sentiment.toLowerCase() === 'positive' ? 'Olumlu' : sentiment.toLowerCase() === 'negative' ? 'Olumsuz' : 'Nötr'}
                                                </span>
                                                <span className="breakdown-value">{count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Call History Table */}
                        <div className="aicall-table-section">
                            <div className="aicall-table-header">
                                <h2><FileText size={18} /> Arama Geçmişi</h2>
                                <div className="aicall-table-controls">
                                    <div className="aicall-status-filter">
                                        <Filter size={14} />
                                        <select
                                            value={statusFilter}
                                            onChange={(e) => {
                                                setStatusFilter(e.target.value);
                                                setPage(0);
                                            }}
                                        >
                                            <option value="ALL">Tüm Durumlar</option>
                                            <option value="ended">Tamamlandı</option>
                                            <option value="not_connected">Ulaşılamadı</option>
                                            <option value="registered">Başlatıldı</option>
                                            <option value="error">Hata</option>
                                        </select>
                                    </div>
                                    <div className="aicall-search">
                                        <Search size={16} className="search-icon" />
                                        <input
                                            type="text"
                                            placeholder="Numara ara..."
                                            value={searchInput}
                                            onChange={(e) => setSearchInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    setPage(0);
                                                    setSearch(searchInput);
                                                }
                                            }}
                                        />
                                        {search && (
                                            <button
                                                className="clear-search"
                                                onClick={() => {
                                                    setSearchInput('');
                                                    setSearch('');
                                                    setPage(0);
                                                }}
                                            >
                                                &times;
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Bulk Action Bar */}
                            {selectedCalls.size > 0 && (
                                <div className="bulk-action-bar">
                                    <div className="bulk-info">
                                        <CheckSquare size={16} />
                                        <span><strong>{selectedCalls.size}</strong> / {totalCalls} arama seçildi</span>
                                        {selectedCalls.size < totalCalls && (
                                            <button className="bulk-select-all-btn" onClick={handleSelectAllCalls}>
                                                Tümünü Seç ({totalCalls})
                                            </button>
                                        )}
                                        <button
                                            className="bulk-clear-btn"
                                            onClick={() => setSelectedCalls(new Set())}
                                        >
                                            <X size={14} /> Seçimi Temizle
                                        </button>
                                    </div>
                                    <div className="bulk-actions">
                                        <button
                                            className="bulk-retry-btn"
                                            onClick={handleBulkRetry}
                                            disabled={retrying}
                                        >
                                            {retrying ? (
                                                <><Loader size={14} className="spin" /> Aranıyor...</>
                                            ) : (
                                                <><RefreshCw size={14} /> Tekrar Ara ({selectedCalls.size})</>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Retry Result Toast */}
                            {retryResult && (
                                <div className={`retry-result-toast ${retryResult.failed > 0 && retryResult.success === 0 ? 'error' : 'success'}`}>
                                    <span>
                                        {retryResult.success > 0 && `✅ ${retryResult.success} arama başarıyla başlatıldı.`}
                                        {retryResult.failed > 0 && ` ❌ ${retryResult.failed} arama başarısız.`}
                                    </span>
                                    <button onClick={() => setRetryResult(null)}><X size={14} /></button>
                                </div>
                            )}

                            {calls.length === 0 ? (
                                <div className="aicall-empty">
                                    <PhoneOff size={40} />
                                    <p>Bu dönemde arama kaydı bulunamadı.</p>
                                </div>
                            ) : (
                                <div className="aicall-results-container">
                                    <div className="aicall-table-wrapper">
                                        <div className="aicall-table-div">
                                            <div className="aicall-thead">
                                                <div className="aicall-th th-checkbox">
                                                    <button
                                                        className="checkbox-btn"
                                                        onClick={toggleSelectAll}
                                                    >
                                                        {selectedCalls.size === calls.length && calls.length > 0
                                                            ? <CheckSquare size={16} />
                                                            : <Square size={16} />
                                                        }
                                                    </button>
                                                </div>
                                                <div className="aicall-th">Tarih</div>
                                                <div className="aicall-th">Arayan</div>
                                                <div className="aicall-th">Aranan</div>
                                                <div className="aicall-th">{t('flowBuilder.duration')}</div>
                                                <div className="aicall-th">{t('analytics.status')}</div>
                                                <div className="aicall-th">Duygu</div>
                                                <div className="aicall-th">Başarılı</div>
                                                <div className="aicall-th">Maliyet</div>
                                                <div className="aicall-th">Detay</div>
                                            </div>
                                            <div className="aicall-tbody">
                                                {calls.map(call => (
                                                    <div key={call.id} className="aicall-row-container">
                                                        <div className={`aicall-row ${expandedCall === call.id ? 'expanded' : ''} ${selectedCalls.has(call.id) ? 'row-selected' : ''}`}>
                                                            <div className="aicall-td td-checkbox">
                                                                <button
                                                                    className="checkbox-btn"
                                                                    onClick={() => toggleSelect(call.id)}
                                                                >
                                                                    {selectedCalls.has(call.id)
                                                                        ? <CheckSquare size={16} className="checked" />
                                                                        : <Square size={16} />
                                                                    }
                                                                </button>
                                                            </div>
                                                            <div className="aicall-td">{formatDate(call.startedAt || call.createdAt)}</div>
                                                            <div className="aicall-td phone-cell">{call.fromNumber}</div>
                                                            <div className="aicall-td phone-cell">{call.toNumber}</div>
                                                            <div className="aicall-td">{formatDuration(call.duration)}</div>
                                                            <div className="aicall-td">{getStatusBadge(call.status)}</div>
                                                            <div className="aicall-td">{getSentimentIcon(call.sentiment)}</div>
                                                            <div className="aicall-td">
                                                                {call.callSuccessful === true && <CheckCircle size={16} className="sentiment-positive" />}
                                                                {call.callSuccessful === false && <AlertCircle size={16} className="sentiment-negative" />}
                                                                {call.callSuccessful === null && <span className="text-muted">—</span>}
                                                            </div>
                                                            <div className="aicall-td" style={{ fontWeight: 600, color: '#ec4899' }}>
                                                                ${((((call.cost || 0) / 100) * 2) + 0.10).toFixed(3)}
                                                            </div>
                                                            <div className="aicall-td">
                                                                {(call.transcript || call.summary) && (
                                                                    <button
                                                                        className="btn-detail"
                                                                        onClick={() => setExpandedCall(expandedCall === call.id ? null : call.id)}
                                                                    >
                                                                        {expandedCall === call.id ? 'Kapat' : 'Göster'}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {expandedCall === call.id && (
                                                            <div className="aicall-detail-row">
                                                                <div className="call-detail-panel">
                                                                    {call.summary && (
                                                                        <div className="detail-block">
                                                                            <strong>Özet:</strong>
                                                                            <p>{call.summary}</p>
                                                                        </div>
                                                                    )}
                                                                    {call.transcript && (
                                                                        <div className="detail-block">
                                                                            <strong>Transkript:</strong>
                                                                            <pre className="transcript-text">{call.transcript}</pre>
                                                                        </div>
                                                                    )}
                                                                    {call.endedReason && (
                                                                        <div className="detail-block">
                                                                            <strong>Sonlanma Sebebi:</strong>
                                                                            <span>{call.endedReason}</span>
                                                                        </div>
                                                                    )}
                                                                    {call.recordingUrl && (
                                                                        <div className="detail-block">
                                                                            <a href={call.recordingUrl} target="_blank" rel="noopener noreferrer" className="recording-link">
                                                                                <Play size={14} /> Kaydı Dinle
                                                                            </a>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Pagination */}
                                    {totalPages > 1 && (
                                        <div className="aicall-pagination">
                                            <button
                                                className="pagination-btn"
                                                disabled={page === 0}
                                                onClick={() => setPage(p => p - 1)}
                                            >
                                                <ChevronLeft size={16} /> Önceki
                                            </button>
                                            <span className="pagination-info">
                                                {page + 1} / {totalPages} ({totalCalls} arama)
                                            </span>
                                            <button
                                                className="pagination-btn"
                                                disabled={page >= totalPages - 1}
                                                onClick={() => setPage(p => p + 1)}
                                            >
                                                Sonraki <ChevronRight size={16} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                confirmText={confirmModal.confirmText}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                type="warning"
            />
        </>
    );
};

export default AICallAnalytics;
