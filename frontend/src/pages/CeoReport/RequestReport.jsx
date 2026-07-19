import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ClipboardList, RefreshCw, Filter, ArrowLeft, Phone, DollarSign,
    Users, ShoppingCart, TrendingUp, ChevronRight, Hash, Layers,
    UserCheck, ThumbsUp, ThumbsDown
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

const formatCurrency = (n) => {
    if (!n && n !== 0) return '₺0';
    return (n || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
};

const StageBadges = ({ stages, max = 5 }) => {
    if (!stages || stages.length === 0) return <span style={{ color: '#d1d5db', fontSize: '0.68rem' }}>—</span>;
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {stages.slice(0, max).map((s, i) => (
                <span key={i} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    padding: '2px 6px', borderRadius: 6,
                    background: `${s.color || '#64748b'}18`,
                    fontSize: '0.66rem', fontWeight: 600, color: s.color || '#64748b',
                    whiteSpace: 'nowrap'
                }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color || '#64748b' }} />
                    {s.name?.length > 10 ? s.name.slice(0, 10) + '..' : s.name} {s.count}
                </span>
            ))}
        </div>
    );
};

const RequestReport = () => {
    const { currentWorkspace } = useAuth();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState(() => sessionStorage.getItem('reportDateFilter') || '30d');
    const [startDate, setStartDate] = useState(() => sessionStorage.getItem('reportStartDate') || '');
    const [endDate, setEndDate] = useState(() => sessionStorage.getItem('reportEndDate') || '');
    const [expandedTopics, setExpandedTopics] = useState({});
    const [expandedTopicAgents, setExpandedTopicAgents] = useState({});
    const [expandedFunnels, setExpandedFunnels] = useState({});
    const [expandedFunnelTopics, setExpandedFunnelTopics] = useState({});

    useEffect(() => {
        sessionStorage.setItem('reportDateFilter', dateFilter);
        sessionStorage.setItem('reportStartDate', startDate);
        sessionStorage.setItem('reportEndDate', endDate);
    }, [dateFilter, startDate, endDate]);

    const getDateRange = () => getDateRangeLogic(dateFilter, startDate, endDate);

    const fetchData = async () => {
        if (!currentWorkspace?.id) return;
        setLoading(true);
        try {
            const params = getDateRange();
            const res = await contactAPI.getRequestReport(currentWorkspace.id, params);
            setData(res.data);
        } catch (err) {
            console.error('Request report error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [currentWorkspace?.id, dateFilter, startDate, endDate]);

    if (loading && !data) {
        return (
            <div className="ceo-report" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                <div style={{ textAlign: 'center', color: '#64748b' }}>
                    <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
                    <p>Yükleniyor...</p>
                </div>
            </div>
        );
    }

    const {
        totalCount = 0, withPhoneCount = 0, relevantCount = 0, irrelevantCount = 0,
        totalWonCount = 0, totalWonAmount = 0,
        topicGroups = [], funnelGroups = []
    } = data || {};

    const toggleTopic = (n) => setExpandedTopics(p => ({ ...p, [n]: !p[n] }));
    const toggleTopicAgent = (k) => setExpandedTopicAgents(p => ({ ...p, [k]: !p[k] }));
    const toggleFunnel = (n) => setExpandedFunnels(p => ({ ...p, [n]: !p[n] }));
    const toggleFunnelTopic = (k) => setExpandedFunnelTopics(p => ({ ...p, [k]: !p[k] }));

    const maxTopicCount = topicGroups.length > 0 ? topicGroups[0].count : 1;
    const maxFunnelCount = funnelGroups.length > 0 ? funnelGroups[0].count : 1;

    return (
        <div className="ceo-report">
            <button className="ceo-back-btn" onClick={() => navigate('/general-report')}><ArrowLeft size={16} /> Dashboard</button>

            <div className="ceo-detail-header">
                <div className="ceo-detail-header-left">
                    <h1><ClipboardList size={24} style={{ color: '#6366f1' }} /> Talep Raporu</h1>
                    <p>Kategori, temsilci ve akış bazlı talep analizi</p>
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

            {/* ═══ 1. TOPLAM KPI'LAR ═══ */}
            <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
                {/* Toplam Talep */}
                <div style={{
                    flex: '1 1 160px', minWidth: 160,
                    background: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)',
                    borderRadius: 16, padding: '24px 24px', color: '#fff',
                    boxShadow: '0 8px 32px rgba(99, 102, 241, 0.3)',
                    position: 'relative', overflow: 'hidden'
                }}>
                    <div style={{ position: 'absolute', top: -16, right: -16, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, opacity: 0.85, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Users size={14} /> Toplam Talep
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.02em' }}>{formatNumber(totalCount)}</div>
                </div>

                {/* Numaralı */}
                <div style={{
                    flex: '1 1 160px', minWidth: 160,
                    background: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
                    borderRadius: 16, padding: '24px 24px', color: '#fff',
                    boxShadow: '0 8px 32px rgba(16, 185, 129, 0.3)',
                    position: 'relative', overflow: 'hidden'
                }}>
                    <div style={{ position: 'absolute', top: -16, right: -16, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, opacity: 0.85, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Phone size={14} /> Numaralı
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 900 }}>{formatNumber(withPhoneCount)}</div>
                    <div style={{ fontSize: '0.72rem', opacity: 0.7 }}>{totalCount > 0 ? ((withPhoneCount / totalCount) * 100).toFixed(0) : 0}%</div>
                </div>

                {/* Satış */}
                <div style={{
                    flex: '1 1 200px', minWidth: 200,
                    background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                    borderRadius: 16, padding: '24px 24px', color: '#fff',
                    boxShadow: '0 8px 32px rgba(5, 150, 105, 0.3)',
                    position: 'relative', overflow: 'hidden'
                }}>
                    <div style={{ position: 'absolute', top: -16, right: -16, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, opacity: 0.85, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <ShoppingCart size={14} /> Satış
                    </div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 900 }}>{totalWonCount} adet</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, opacity: 0.9 }}>{formatCurrency(totalWonAmount)}</div>
                </div>

                {/* İlgili / İlgisiz */}
                <div style={{
                    flex: '1 1 200px', minWidth: 200,
                    background: '#fff', borderRadius: 16, padding: '24px 24px',
                    border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                    display: 'flex', gap: 20, alignItems: 'center'
                }}>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, color: '#f59e0b', marginBottom: 4 }}>
                            <ThumbsUp size={14} />
                            <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>İlgili</span>
                        </div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0f172a' }}>{formatNumber(relevantCount)}</div>
                        <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{totalCount > 0 ? ((relevantCount / totalCount) * 100).toFixed(0) : 0}%</div>
                    </div>
                    <div style={{ width: 1, height: 40, background: '#e2e8f0' }} />
                    <div style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, color: '#94a3b8', marginBottom: 4 }}>
                            <ThumbsDown size={14} />
                            <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>İlgisiz</span>
                        </div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0f172a' }}>{formatNumber(irrelevantCount)}</div>
                        <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{totalCount > 0 ? ((irrelevantCount / totalCount) * 100).toFixed(0) : 0}%</div>
                    </div>
                </div>
            </div>

            {/* ═══ 2. KONU BAZLI TALEP RAPORU ═══ */}
            <div className="ceo-section" style={{ marginBottom: 24 }}>
                    <div className="ceo-section-header">
                        <div className="ceo-section-icon" style={{ background: '#eef2ff', color: '#6366f1' }}><TrendingUp size={18} /></div>
                        <h2>Konu Bazlı Talep Raporu</h2>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', marginLeft: 'auto' }}>{topicGroups.length} kategori</span>
                    </div>
                    <div className="ceo-section-body" style={{ padding: 0 }}>
                        {topicGroups.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '32px 20px', color: '#94a3b8' }}>
                                <TrendingUp size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
                                <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>Konu verisi bulunamadı</p>
                            </div>
                        )}
                        {topicGroups.map((group, gi) => {
                            const pct = ((group.count / maxTopicCount) * 100).toFixed(0);
                            const isExpanded = expandedTopics[group.name];
                            return (
                                <div key={gi} style={{ borderBottom: gi < topicGroups.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                    {/* Ana Grup */}
                                    <div
                                        onClick={() => toggleTopic(group.name)}
                                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', transition: 'background 0.15s' }}
                                        onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <div style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                                            <ChevronRight size={14} style={{ color: '#94a3b8' }} />
                                        </div>
                                        <span style={{ fontSize: '0.9rem', width: 22, textAlign: 'center' }}>{group.icon || '📁'}</span>
                                        <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a', minWidth: 120 }}>{group.name}</span>
                                        <div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden', maxWidth: 160 }}>
                                            <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${group.color || '#6366f1'}, ${group.color ? group.color + '99' : '#818cf8'})`, borderRadius: 6, transition: 'width 0.6s' }} />
                                        </div>
                                        <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#6366f1', minWidth: 40, textAlign: 'right' }}>{group.count}</span>
                                        <StageBadges stages={group.stages} max={3} />
                                        {group.wonCount > 0 && (
                                            <span style={{ fontWeight: 700, fontSize: '0.7rem', color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                                                {group.wonCount} satış · {formatCurrency(group.wonAmount)}
                                            </span>
                                        )}
                                    </div>

                                    {/* Alt Grup: Temsilciler */}
                                    {isExpanded && (
                                        <div style={{ background: '#fafbfc', padding: '4px 16px 8px 46px' }}>
                                            {group.agents.map((agent, ai) => {
                                                const agentKey = `${group.name}__${agent.name}`;
                                                const showDetail = expandedTopicAgents[agentKey];
                                                return (
                                                    <div key={ai}>
                                                        <div
                                                            onClick={() => toggleTopicAgent(agentKey)}
                                                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s', marginBottom: 2 }}
                                                            onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; }}
                                                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                                        >
                                                            <ChevronRight size={11} style={{ color: '#cbd5e1', transition: 'transform 0.2s', transform: showDetail ? 'rotate(90deg)' : 'none' }} />
                                                            <UserCheck size={13} style={{ color: '#6366f1' }} />
                                                            <span style={{ fontWeight: 600, fontSize: '0.8rem', color: '#374151', flex: 1 }}>{agent.name}</span>
                                                            <span style={{ fontWeight: 700, fontSize: '0.78rem', color: '#6366f1', minWidth: 30 }}>{agent.count}</span>
                                                            {agent.wonCount > 0 && (
                                                                <span style={{ fontWeight: 600, fontSize: '0.65rem', color: '#059669', background: '#ecfdf5', padding: '1px 6px', borderRadius: 4 }}>
                                                                    {agent.wonCount} satış
                                                                </span>
                                                            )}
                                                        </div>
                                                        {showDetail && (
                                                            <div style={{ marginLeft: 20, marginBottom: 6, borderLeft: '2px solid #e2e8f0', paddingLeft: 12, padding: '4px 12px' }}>
                                                                <StageBadges stages={agent.stages} max={10} />
                                                                {agent.wonAmount > 0 && (
                                                                    <div style={{ marginTop: 4, fontSize: '0.7rem', color: '#059669', fontWeight: 700 }}>
                                                                        Satış: {formatCurrency(agent.wonAmount)}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

            {/* ═══ 3. AKIŞ BAZLI TALEP RAPORU ═══ */}
            <div className="ceo-section" style={{ marginBottom: 24 }}>
                    <div className="ceo-section-header">
                        <div className="ceo-section-icon" style={{ background: '#f5f3ff', color: '#8b5cf6' }}><Layers size={18} /></div>
                        <h2>Akış Bazlı Talep Raporu</h2>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', marginLeft: 'auto' }}>{funnelGroups.length} akış</span>
                    </div>
                    <div className="ceo-section-body" style={{ padding: 0 }}>
                        {funnelGroups.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '32px 20px', color: '#94a3b8' }}>
                                <Layers size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
                                <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>Akış verisi bulunamadı</p>
                            </div>
                        )}
                        {funnelGroups.map((group, gi) => {
                            const pct = ((group.count / maxFunnelCount) * 100).toFixed(0);
                            const isExpanded = expandedFunnels[group.name];
                            return (
                                <div key={gi} style={{ borderBottom: gi < funnelGroups.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                    {/* Ana Grup */}
                                    <div
                                        onClick={() => toggleFunnel(group.name)}
                                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', transition: 'background 0.15s' }}
                                        onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <div style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                                            <ChevronRight size={14} style={{ color: '#94a3b8' }} />
                                        </div>
                                        <Layers size={16} style={{ color: '#8b5cf6' }} />
                                        <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a', minWidth: 120 }}>{group.name}</span>
                                        <div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden', maxWidth: 160 }}>
                                            <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)', borderRadius: 6, transition: 'width 0.6s' }} />
                                        </div>
                                        <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#8b5cf6', minWidth: 40, textAlign: 'right' }}>{group.count}</span>
                                        <StageBadges stages={group.stages} max={3} />
                                        {group.wonCount > 0 && (
                                            <span style={{ fontWeight: 700, fontSize: '0.7rem', color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                                                {group.wonCount} satış · {formatCurrency(group.wonAmount)}
                                            </span>
                                        )}
                                    </div>

                                    {/* Alt Grup: Konular */}
                                    {isExpanded && (
                                        <div style={{ background: '#fafbfc', padding: '4px 16px 8px 46px' }}>
                                            {group.topics.map((topic, ti) => {
                                                const topicKey = `${group.name}__${topic.name}`;
                                                const showDetail = expandedFunnelTopics[topicKey];
                                                return (
                                                    <div key={ti}>
                                                        <div
                                                            onClick={() => toggleFunnelTopic(topicKey)}
                                                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s', marginBottom: 2 }}
                                                            onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; }}
                                                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                                        >
                                                            <ChevronRight size={11} style={{ color: '#cbd5e1', transition: 'transform 0.2s', transform: showDetail ? 'rotate(90deg)' : 'none' }} />
                                                            <span style={{ fontSize: '0.8rem' }}>{topic.icon || '📁'}</span>
                                                            <span style={{ fontWeight: 600, fontSize: '0.8rem', color: topic.color || '#374151', flex: 1 }}>{topic.name}</span>
                                                            <span style={{ fontWeight: 700, fontSize: '0.78rem', color: topic.color || '#6366f1', minWidth: 30 }}>{topic.count}</span>
                                                            {topic.wonCount > 0 && (
                                                                <span style={{ fontWeight: 600, fontSize: '0.65rem', color: '#059669', background: '#ecfdf5', padding: '1px 6px', borderRadius: 4 }}>
                                                                    {topic.wonCount} satış
                                                                </span>
                                                            )}
                                                        </div>
                                                        {showDetail && (
                                                            <div style={{ marginLeft: 20, marginBottom: 6, borderLeft: '2px solid #e2e8f0', paddingLeft: 12, padding: '4px 12px' }}>
                                                                <StageBadges stages={topic.stages} max={10} />
                                                                {topic.wonAmount > 0 && (
                                                                    <div style={{ marginTop: 4, fontSize: '0.7rem', color: '#059669', fontWeight: 700 }}>
                                                                        Satış: {formatCurrency(topic.wonAmount)}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
        </div>
    );
};

export default RequestReport;
