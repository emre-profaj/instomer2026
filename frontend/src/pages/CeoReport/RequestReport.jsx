import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ClipboardList, RefreshCw, Filter, ArrowLeft, Phone, PhoneCall,
    Users, MessageSquare, Sparkles, BarChart3, ChevronDown
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { contactAPI } from '../../services/api';
import './CeoReport.css';
import './CeoDetailReport.css';
import { getDateRangeLogic, dateFilterOptions } from '../../utils/dateFilters';

const formatNumber = (n) => {
    if (!n && n !== 0) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toLocaleString('tr-TR');
};

const RequestReport = () => {
    const { currentWorkspace } = useAuth();
    const navigate = useNavigate();
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState(() => sessionStorage.getItem('reportDateFilter') || '30d');
    const [startDate, setStartDate] = useState(() => sessionStorage.getItem('reportStartDate') || '');
    const [endDate, setEndDate] = useState(() => sessionStorage.getItem('reportEndDate') || '');

    useEffect(() => {
        sessionStorage.setItem('reportDateFilter', dateFilter);
        sessionStorage.setItem('reportStartDate', startDate);
        sessionStorage.setItem('reportEndDate', endDate);
    }, [dateFilter, startDate, endDate]);
    const [showAllTopics, setShowAllTopics] = useState(false);

    const getDateRange = () => {
        return getDateRangeLogic(dateFilter, startDate, endDate);
    };

    const fetchData = async () => {
        if (!currentWorkspace?.id) return;
        setLoading(true);
        try {
            const dateParams = getDateRange();
            const params = { ...dateParams, comparePrevious: true };
            const res = await contactAPI.getAnalytics(currentWorkspace.id, params);
            setAnalytics(res.data);
        } catch (err) {
            console.error('Request report fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [currentWorkspace?.id, dateFilter, startDate, endDate]);

    const reqAnalysis = analytics?.requestAnalysis || {};
    const topics = reqAnalysis.topics || [];
    const prev = analytics?.previousPeriod || {};

    // Merge similar topics (basic normalization)
    const mergedTopics = [];
    const seen = new Map();
    for (const t of topics) {
        const key = (t.topic || t.name || '').toLowerCase().trim().replace(/\s+/g, ' ');
        if (seen.has(key)) {
            const existing = mergedTopics[seen.get(key)];
            existing.count = (existing.count || 0) + (t.count || 0);
            existing.withPhone = (existing.withPhone || 0) + (t.withPhone || 0);
            existing.called = (existing.called || 0) + (t.called || 0);
            existing.interested = (existing.interested || 0) + (t.interested || 0);
        } else {
            seen.set(key, mergedTopics.length);
            mergedTopics.push({ ...t });
        }
    }
    const sortedTopics = [...mergedTopics].sort((a, b) => (b.count || 0) - (a.count || 0));
    const displayTopics = showAllTopics ? sortedTopics : sortedTopics.slice(0, 15);
    const maxTopicCount = sortedTopics.length > 0 ? sortedTopics[0].count : 1;
    const totalTopicCount = sortedTopics.reduce((s, t) => s + (t.count || 0), 0) || 1;

    const totalRequests = reqAnalysis.totalRequests || analytics?.totalContacts || 0;
    const totalWithPhone = reqAnalysis.totalWithPhone || 0;
    const totalCalled = reqAnalysis.totalCalled || 0;
    const totalInterested = reqAnalysis.totalInterested || 0;

    if (loading && !analytics) {
        return (
            <div className="ceo-report" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                <div style={{ textAlign: 'center', color: '#64748b' }}>
                    <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
                    <p>Yükleniyor...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="ceo-report">
            <button className="ceo-back-btn" onClick={() => navigate('/general-report')}><ArrowLeft size={16} /> Dashboard</button>

            <div className="ceo-detail-header">
                <div className="ceo-detail-header-left">
                    <h1><ClipboardList size={24} style={{ color: '#6366f1' }} /> Talep Analizi</h1>
                    <p>AI destekli konu sınıflandırması ve talep detayları</p>
                </div>
                <button className="ceo-refresh-btn" onClick={fetchData}><RefreshCw size={14} /> Güncelle</button>
            </div>

            {/* Filters */}
            <div className="ceo-filter-bar">
                <div className="ceo-filter-left">
                    <div className="ceo-filter-label"><Filter size={14} /><span>Filtreler</span></div>
                    <div className="ceo-pill-group">
                        {dateFilterOptions.map(item => (
                            <button key={item.key} className={`ceo-pill${dateFilter === item.key ? ' active' : ''}`} onClick={() => setDateFilter(item.key)}>{item.label}</button>
                        ))}
                    </div>
                    {dateFilter === 'custom' && (
                        <div className="ceo-custom-dates">
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="ceo-date-input" />
                            <span style={{ color: '#9ca3af' }}>—</span>
                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="ceo-date-input" />
                        </div>
                    )}
                </div>
            </div>

            {/* Summary KPIs */}
            <div className="ceo-detail-kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div className="ceo-detail-kpi-card">
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #6366f1, #6366f188)' }} />
                    <div className="kpi-icon-wrap" style={{ background: '#eef2ff', color: '#6366f1' }}><Users size={20} /></div>
                    <div className="kpi-label">Toplam Talep</div>
                    <div className="kpi-value">{formatNumber(totalRequests)}</div>
                </div>
                <div className="ceo-detail-kpi-card">
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #10b981, #10b98188)' }} />
                    <div className="kpi-icon-wrap" style={{ background: '#ecfdf5', color: '#10b981' }}><Phone size={20} /></div>
                    <div className="kpi-label">Numaralı</div>
                    <div className="kpi-value">{formatNumber(totalWithPhone)}</div>
                </div>
                <div className="ceo-detail-kpi-card">
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #059669, #05966988)' }} />
                    <div className="kpi-icon-wrap" style={{ background: '#ecfdf5', color: '#059669' }}><PhoneCall size={20} /></div>
                    <div className="kpi-label">Arandı</div>
                    <div className="kpi-value">{formatNumber(totalCalled)}</div>
                </div>
                <div className="ceo-detail-kpi-card">
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #f59e0b, #f59e0b88)' }} />
                    <div className="kpi-icon-wrap" style={{ background: '#fef3c7', color: '#d97706' }}><Sparkles size={20} /></div>
                    <div className="kpi-label">İlgili Çıktı</div>
                    <div className="kpi-value">{formatNumber(totalInterested)}</div>
                </div>
            </div>

            {/* Top Topics Bar Chart */}
            {sortedTopics.length > 0 && (
                <div className="ceo-section" style={{ marginBottom: 20 }}>
                    <div className="ceo-section-header">
                        <div className="ceo-section-icon" style={{ background: '#eef2ff', color: '#6366f1' }}><BarChart3 size={18} /></div>
                        <h2>En Çok Talep Edilen Konular</h2>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', marginLeft: 'auto' }}>
                            <Sparkles size={12} style={{ color: '#8b5cf6', marginRight: 4 }} />
                            AI Sınıflandırma
                        </span>
                    </div>
                    <div className="ceo-section-body">
                        {/* Simple horizontal bar chart for top 10 */}
                        <div style={{ marginBottom: 20 }}>
                            {sortedTopics.slice(0, 10).map((topic, idx) => {
                                const pct = ((topic.count / maxTopicCount) * 100).toFixed(0);
                                const globalPct = ((topic.count / totalTopicCount) * 100).toFixed(1);
                                return (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                        <span style={{ width: 22, textAlign: 'center', fontWeight: 800, fontSize: '0.72rem', color: idx < 3 ? '#6366f1' : '#94a3b8' }}>{idx + 1}</span>
                                        <span style={{ minWidth: 140, maxWidth: 200, fontSize: '0.82rem', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topic.topic || topic.name}</span>
                                        <div style={{ flex: 1, height: 10, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, #6366f1, #818cf8)`, borderRadius: 6, transition: 'width 0.6s ease' }} />
                                        </div>
                                        <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a', minWidth: 36, textAlign: 'right' }}>{topic.count}</span>
                                        <span style={{ fontWeight: 600, fontSize: '0.68rem', color: '#94a3b8', minWidth: 36, textAlign: 'right' }}>{globalPct}%</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Full Topic Table */}
            {sortedTopics.length > 0 && (
                <div className="ceo-section" style={{ marginBottom: 20 }}>
                    <div className="ceo-section-header" style={{ justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div className="ceo-section-icon" style={{ background: '#f5f3ff', color: '#8b5cf6' }}><ClipboardList size={18} /></div>
                            <h2>Konu Detay Tablosu</h2>
                        </div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8' }}>{sortedTopics.length} konu</span>
                    </div>
                    <div className="ceo-section-body" style={{ padding: 0, overflowX: 'auto' }}>
                        <table className="ceo-league-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Konu</th>
                                    <th>Toplam</th>
                                    <th>Numaralı</th>
                                    <th>Arandı</th>
                                    <th>İlgili</th>
                                    <th>Arama %</th>
                                    <th>İlgi %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayTopics.map((topic, idx) => {
                                    const callRate = (topic.withPhone || 0) > 0 ? (((topic.called || 0) / topic.withPhone) * 100).toFixed(0) : '-';
                                    const interestRate = (topic.count || 0) > 0 ? (((topic.interested || 0) / topic.count) * 100).toFixed(0) : '-';
                                    return (
                                        <tr key={idx}>
                                            <td><span style={{ fontWeight: 800, color: idx < 3 ? '#6366f1' : '#94a3b8', fontSize: '0.82rem' }}>{idx + 1}</span></td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>{topic.topic || topic.name}</span>
                                                    {topic.isAiClassified && <Sparkles size={11} style={{ color: '#8b5cf6' }} />}
                                                </div>
                                            </td>
                                            <td><span style={{ fontWeight: 800, color: '#6366f1' }}>{topic.count}</span></td>
                                            <td><span style={{ fontWeight: 700, color: (topic.withPhone || 0) > 0 ? '#10b981' : '#d1d5db' }}>{topic.withPhone || 0}</span></td>
                                            <td><span style={{ fontWeight: 700, color: (topic.called || 0) > 0 ? '#059669' : '#d1d5db' }}>{topic.called || 0}</span></td>
                                            <td><span style={{ fontWeight: 700, color: (topic.interested || 0) > 0 ? '#f59e0b' : '#d1d5db' }}>{topic.interested || 0}</span></td>
                                            <td>
                                                {callRate !== '-' ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <span style={{ fontWeight: 700, color: parseInt(callRate) > 70 ? '#10b981' : parseInt(callRate) > 40 ? '#f59e0b' : '#ef4444', fontSize: '0.85rem' }}>{callRate}%</span>
                                                        <div style={{ width: 36, height: 3, background: '#f1f5f9', borderRadius: 2 }}><div style={{ height: '100%', width: `${callRate}%`, background: parseInt(callRate) > 70 ? '#10b981' : parseInt(callRate) > 40 ? '#f59e0b' : '#ef4444', borderRadius: 2 }} /></div>
                                                    </div>
                                                ) : <span style={{ color: '#d1d5db' }}>-</span>}
                                            </td>
                                            <td>
                                                {interestRate !== '-' ? (
                                                    <span style={{ fontWeight: 700, color: parseInt(interestRate) > 50 ? '#10b981' : '#64748b', fontSize: '0.85rem' }}>{interestRate}%</span>
                                                ) : <span style={{ color: '#d1d5db' }}>-</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {sortedTopics.length > 15 && (
                            <div style={{ textAlign: 'center', padding: '14px' }}>
                                <button
                                    onClick={() => setShowAllTopics(!showAllTopics)}
                                    style={{ border: 'none', background: '#f8fafc', padding: '8px 20px', borderRadius: 10, fontSize: '0.78rem', fontWeight: 600, color: '#6366f1', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                >
                                    {showAllTopics ? 'Daha az göster' : `Tümünü göster (${sortedTopics.length})`}
                                    <ChevronDown size={14} style={{ transform: showAllTopics ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* No data */}
            {sortedTopics.length === 0 && !loading && (
                <div className="ceo-section">
                    <div className="ceo-section-body" style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                        <ClipboardList size={32} style={{ marginBottom: 12 }} />
                        <p>Henüz konu sınıflandırma verisi bulunamadı</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RequestReport;
