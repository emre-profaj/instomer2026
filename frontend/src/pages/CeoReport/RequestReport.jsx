import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ClipboardList, RefreshCw, Filter, ArrowLeft, Phone, PhoneCall,
    Users, MessageSquare, Sparkles, BarChart3, ChevronDown, X, ExternalLink
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
    const [selectedTopic, setSelectedTopic] = useState(null);
    const [topicContacts, setTopicContacts] = useState([]);
    const [topicContactsLoading, setTopicContactsLoading] = useState(false);

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

    const fetchTopicContacts = async (topicName) => {
        if (!currentWorkspace?.id) return;
        setSelectedTopic(topicName);
        setTopicContactsLoading(true);
        try {
            const dateParams = getDateRange();
            const res = await contactAPI.getTopicContacts(currentWorkspace.id, { topic: topicName, ...dateParams });
            setTopicContacts(res.data?.contacts || []);
        } catch (err) {
            console.error('Topic contacts error:', err);
            setTopicContacts([]);
        } finally {
            setTopicContactsLoading(false);
        }
    };

    const reqAnalysis = analytics?.requestAnalysis || {};
    const topics = reqAnalysis.topics || [];
    const prev = analytics?.previousPeriod || {};

    // Merge similar topics (basic normalization - backup for any backend didn't catch)
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
            existing.relevant = (existing.relevant || 0) + (t.relevant || 0);
            existing.wonCount = (existing.wonCount || 0) + (t.wonCount || 0);
            existing.wonAmount = (existing.wonAmount || 0) + (t.wonAmount || 0);
            // Merge stageDist
            if (t.stageDist) {
                if (!existing.stageDist) existing.stageDist = {};
                for (const [sName, sData] of Object.entries(t.stageDist)) {
                    if (!existing.stageDist[sName]) existing.stageDist[sName] = { count: 0, color: sData.color };
                    existing.stageDist[sName].count += sData.count;
                }
            }
        } else {
            seen.set(key, mergedTopics.length);
            mergedTopics.push({ ...t, stageDist: t.stageDist ? { ...t.stageDist } : {} });
        }
    }
    const sortedTopics = [...mergedTopics].sort((a, b) => (b.count || 0) - (a.count || 0));
    const displayTopics = showAllTopics ? sortedTopics : sortedTopics.slice(0, 15);
    const maxTopicCount = sortedTopics.length > 0 ? sortedTopics[0].count : 1;
    const totalTopicCount = sortedTopics.reduce((s, t) => s + (t.count || 0), 0) || 1;

    const totalRequests = reqAnalysis.totalRequests || analytics?.totalContacts || 0;
    const totalWithPhone = reqAnalysis.withPhoneCount || reqAnalysis.totalWithPhone || 0;
    const totalCalled = reqAnalysis.calledCount || reqAnalysis.totalCalled || 0;
    const totalInterested = reqAnalysis.relevantCount || reqAnalysis.totalInterested || 0;

    // Overall stage distribution from backend or computed
    const overallStageDist = reqAnalysis.stageDistribution || {};
    const stageDistEntries = Object.entries(overallStageDist).sort((a, b) => b[1].count - a[1].count);

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

    const mainContent = (
        <div className="ceo-report">
            <button className="ceo-back-btn" onClick={() => navigate('/general-report')}><ArrowLeft size={16} /> Dashboard</button>

            <div className="ceo-detail-header">
                <div className="ceo-detail-header-left">
                    <h1><ClipboardList size={24} style={{ color: '#6366f1' }} /> Talep Analizi</h1>
                    <p>Kategori bazlı talep analizi ve performans detayları</p>
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

            {/* Stage Distribution Overview */}
            {stageDistEntries.length > 0 && (
                <div className="ceo-section" style={{ marginBottom: 20 }}>
                    <div className="ceo-section-header">
                        <div className="ceo-section-icon" style={{ background: '#f0fdf4', color: '#10b981' }}><BarChart3 size={18} /></div>
                        <h2>Talep Son Durum Dağılımı</h2>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', marginLeft: 'auto' }}>
                            Kişilerin mevcut aşaması
                        </span>
                    </div>
                    <div className="ceo-section-body">
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                            {stageDistEntries.map(([sName, sData]) => (
                                <div key={sName} style={{ 
                                    display: 'flex', alignItems: 'center', gap: 8, 
                                    padding: '8px 14px', borderRadius: 10, 
                                    background: `${sData.color || '#64748b'}12`, 
                                    border: `1px solid ${sData.color || '#64748b'}30` 
                                }}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: sData.color || '#64748b' }} />
                                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1e293b' }}>{sName}</span>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: sData.color || '#64748b' }}>{sData.count}</span>
                                </div>
                            ))}
                        </div>
                        {/* Horizontal stacked bar */}
                        <div style={{ display: 'flex', height: 14, borderRadius: 8, overflow: 'hidden', background: '#f1f5f9' }}>
                            {stageDistEntries.map(([sName, sData]) => {
                                const pct = (sData.count / totalRequests) * 100;
                                return pct > 0 ? (
                                    <div key={sName} style={{ width: `${pct}%`, background: sData.color || '#64748b', transition: 'width 0.6s ease' }} title={`${sName}: ${sData.count} (${pct.toFixed(1)}%)`} />
                                ) : null;
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Top Topics Bar Chart */}
            {sortedTopics.length > 0 && (
                <div className="ceo-section" style={{ marginBottom: 20 }}>
                    <div className="ceo-section-header">
                        <div className="ceo-section-icon" style={{ background: '#eef2ff', color: '#6366f1' }}><BarChart3 size={18} /></div>
                        <h2>En Çok Talep Edilen Kategoriler</h2>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', marginLeft: 'auto' }}>
                            Kategori Bazlı
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
                                        <span style={{ minWidth: 140, maxWidth: 200, fontSize: '0.82rem', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            {topic.icon && <span style={{ fontSize: '0.85rem' }}>{topic.icon}</span>}
                                            {topic.topic || topic.name}
                                        </span>
                                        <div style={{ flex: 1, height: 10, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${topic.color || '#6366f1'}, ${topic.color ? topic.color + '99' : '#818cf8'})`, borderRadius: 6, transition: 'width 0.6s ease' }} />
                                        </div>
                                        <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a', minWidth: 36, textAlign: 'right' }}>{topic.count}</span>
                                        <span style={{ fontWeight: 600, fontSize: '0.68rem', color: '#94a3b8', minWidth: 36, textAlign: 'right' }}>{globalPct}%</span>
                                        {(topic.wonCount || 0) > 0 && (
                                            <span style={{ fontWeight: 700, fontSize: '0.7rem', color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                                                {topic.wonCount} satış · {(topic.wonAmount || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })}
                                            </span>
                                        )}
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
                                    <th>Aşama Dağılımı</th>
                                    <th>Numaralı</th>
                                    <th>Arandı</th>
                                    <th>İlgili</th>
                                    <th>Satış Adet</th>
                                    <th>Satış Tutar</th>
                                    <th>Arama %</th>
                                    <th>İlgi %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayTopics.map((topic, idx) => {
                                    const callRate = (topic.withPhone || 0) > 0 ? (((topic.called || 0) / topic.withPhone) * 100).toFixed(0) : '-';
                                    const interestRate = (topic.count || 0) > 0 ? (((topic.relevant || topic.interested || 0) / topic.count) * 100).toFixed(0) : '-';
                                    return (
                                        <tr key={idx} style={{ cursor: 'pointer' }} onClick={() => fetchTopicContacts(topic.topic || topic.name)} title="Kişi listesini görmek için tıklayın">
                                            <td><span style={{ fontWeight: 800, color: idx < 3 ? '#6366f1' : '#94a3b8', fontSize: '0.82rem' }}>{idx + 1}</span></td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    {topic.icon && <span style={{ fontSize: '0.9rem' }}>{topic.icon}</span>}
                                                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>{topic.topic || topic.name}</span>
                                                </div>
                                            </td>
                                            <td><span style={{ fontWeight: 800, color: '#6366f1' }}>{topic.count}</span></td>
                                            <td>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                                    {Object.entries(topic.stageDist || {}).sort((a, b) => b[1].count - a[1].count).slice(0, 4).map(([sName, sData]) => (
                                                        <span key={sName} style={{ 
                                                            display: 'inline-flex', alignItems: 'center', gap: 3,
                                                            padding: '2px 6px', borderRadius: 6, 
                                                            background: `${sData.color || '#64748b'}18`, 
                                                            fontSize: '0.68rem', fontWeight: 600, color: sData.color || '#64748b',
                                                            whiteSpace: 'nowrap'
                                                        }}>
                                                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: sData.color || '#64748b' }} />
                                                            {sName.length > 10 ? sName.slice(0, 10) + '..' : sName} {sData.count}
                                                        </span>
                                                    ))}
                                                    {Object.keys(topic.stageDist || {}).length === 0 && <span style={{ color: '#d1d5db', fontSize: '0.68rem' }}>—</span>}
                                                </div>
                                            </td>
                                            <td><span style={{ fontWeight: 700, color: (topic.withPhone || 0) > 0 ? '#10b981' : '#d1d5db' }}>{topic.withPhone || 0}</span></td>
                                            <td><span style={{ fontWeight: 700, color: (topic.called || 0) > 0 ? '#059669' : '#d1d5db' }}>{topic.called || 0}</span></td>
                                            <td><span style={{ fontWeight: 700, color: (topic.relevant || topic.interested || 0) > 0 ? '#f59e0b' : '#d1d5db' }}>{topic.relevant || topic.interested || 0}</span></td>
                                            <td><span style={{ fontWeight: 700, color: (topic.wonCount || 0) > 0 ? '#059669' : '#d1d5db' }}>{topic.wonCount || 0}</span></td>
                                            <td>{(topic.wonAmount || 0) > 0 ? <span style={{ fontWeight: 700, color: '#059669', fontSize: '0.82rem' }}>{(topic.wonAmount || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })}</span> : <span style={{ color: '#d1d5db' }}>—</span>}</td>
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

    // Contact list modal
    const statusLabels = {
        NEW: 'Yeni', OPPORTUNITY: 'Fırsat', HOT_OPPORTUNITY: 'Sıcak Fırsat',
        INFORMED: 'Bilgi Verildi', MEETING_PLANNED: 'Görüşme Planlandı',
        PROPOSAL: 'Teklif', CONVERTED: 'Satış', UNREACHABLE: 'Ulaşılamadı', LOST: 'Kayıp'
    };
    const statusColors = {
        NEW: '#6366f1', OPPORTUNITY: '#f59e0b', HOT_OPPORTUNITY: '#ef4444',
        INFORMED: '#0ea5e9', MEETING_PLANNED: '#8b5cf6',
        PROPOSAL: '#f97316', CONVERTED: '#10b981', UNREACHABLE: '#94a3b8', LOST: '#ef4444'
    };

    return (
        <>
            {mainContent}

            {/* Topic Contact List Modal */}
            {selectedTopic && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
                     onClick={() => setSelectedTopic(null)}>
                    <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 900, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
                         onClick={e => e.stopPropagation()}>
                        {/* Modal Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#1e293b' }}>{selectedTopic}</h3>
                                <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                                    {topicContactsLoading ? 'Yükleniyor...' : `${topicContacts.length} kişi`}
                                </p>
                            </div>
                            <button onClick={() => setSelectedTopic(null)} style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex' }}>
                                <X size={18} color="#64748b" />
                            </button>
                        </div>
                        {/* Modal Body */}
                        <div style={{ overflowY: 'auto', flex: 1 }}>
                            {topicContactsLoading ? (
                                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                                    <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
                                    <p>Kişiler yükleniyor...</p>
                                </div>
                            ) : topicContacts.length === 0 ? (
                                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                                    <Users size={28} style={{ marginBottom: 8 }} />
                                    <p>Bu konuda kişi bulunamadı</p>
                                </div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>#</th>
                                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>İsim</th>
                                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Telefon</th>
                                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Durum</th>
                                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Aşama</th>
                                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Temsilci</th>
                                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Kanal</th>
                                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Tarih</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {topicContacts.map((c, idx) => (
                                            <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '8px 14px', color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</td>
                                                <td style={{ padding: '8px 14px', fontWeight: 700, color: '#1e293b' }}>{c.name}</td>
                                                <td style={{ padding: '8px 14px', color: '#475569' }}>{c.phone || '—'}</td>
                                                <td style={{ padding: '8px 14px' }}>
                                                    <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: `${statusColors[c.status] || '#94a3b8'}15`, color: statusColors[c.status] || '#94a3b8' }}>
                                                        {statusLabels[c.status] || c.status}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '8px 14px' }}>
                                                    {c.stageName ? (
                                                        <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: `${c.stageColor || '#64748b'}15`, color: c.stageColor || '#64748b' }}>
                                                            {c.stageName}
                                                        </span>
                                                    ) : <span style={{ color: '#d1d5db' }}>—</span>}
                                                </td>
                                                <td style={{ padding: '8px 14px', fontWeight: 600, color: c.assigneeName ? '#1e293b' : '#d1d5db' }}>{c.assigneeName || '—'}</td>
                                                <td style={{ padding: '8px 14px', fontWeight: 600, color: '#64748b', fontSize: '0.75rem' }}>{c.channel || '—'}</td>
                                                <td style={{ padding: '8px 14px', color: '#94a3b8', fontSize: '0.75rem' }}>{c.conversationCreatedAt ? new Date(c.conversationCreatedAt).toLocaleDateString('tr-TR') : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default RequestReport;
