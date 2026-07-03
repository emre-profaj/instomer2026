import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Activity, RefreshCw, Filter, ArrowLeft, ChevronDown, ChevronRight,
    ClipboardList, Calendar, Briefcase, Headphones, Truck, Building2, DollarSign
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { contactAPI, funnelAPI } from '../../services/api';
import './CeoReport.css';
import './CeoDetailReport.css';
import { getDateRangeLogic, dateFilterOptions } from '../../utils/dateFilters';

const FunnelReport = () => {
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
    const [selectedFunnel, setSelectedFunnel] = useState(null);
    const [funnelFilter, setFunnelFilter] = useState('');
    const [funnelList, setFunnelList] = useState([]);

    useEffect(() => {
        if (!currentWorkspace?.id) return;
        funnelAPI.getAll(currentWorkspace.id).then(res => setFunnelList(res.data || [])).catch(() => {});
    }, [currentWorkspace?.id]);

    const getDateRange = () => {
        return getDateRangeLogic(dateFilter, startDate, endDate);
    };

    useEffect(() => { fetchData(); }, [currentWorkspace?.id, dateFilter, startDate, endDate, funnelFilter]);

    const funnels = analytics?.funnelSummary || [];
    const totalContacts = funnels.reduce((s, f) => s + (f.count || 0), 0);

    const getFlowIcon = (flowName) => {
        const name = flowName?.toLowerCase() || '';
        if (name.includes('randevu')) return <Calendar size={18} />;
        if (name.includes('kurumsal')) return <Building2 size={18} />;
        if (name.includes('satış') || name.includes('satis')) return <DollarSign size={18} />;
        if (name.includes('destek')) return <Headphones size={18} />;
        if (name.includes('iş') || name.includes('taseron') || name.includes('taşeron')) return <Briefcase size={18} />;
        if (name.includes('tedarik')) return <Truck size={18} />;
        return <ClipboardList size={18} />;
    };

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
                    <h1><Activity size={24} style={{ color: '#a855f7' }} /> Akış Raporu</h1>
                    <p>Akış bazlı müşteri dağılımı ve aşama kırılımları</p>
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
                {funnelList.length > 0 && (
                    <div className="ceo-filter-right">
                        <select value={funnelFilter} onChange={e => setFunnelFilter(e.target.value)} className="ceo-funnel-select">
                            <option value="">Tüm Akışlar</option>
                            {funnelList.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                    </div>
                )}
            </div>

            {/* Funnel Cards */}
            {funnels.length === 0 ? (
                <div className="ceo-section" style={{ marginBottom: 20 }}>
                    <div className="ceo-section-body" style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Akış verisi bulunamadı</div>
                </div>
            ) : (
                <>
                    <div className="ceo-funnel-overview">
                        {funnels.map(flow => {
                            const pct = totalContacts > 0 ? ((flow.count / totalContacts) * 100).toFixed(0) : 0;
                            const isSelected = selectedFunnel === flow.id;
                            return (
                                <div key={flow.id} className={`ceo-funnel-card${isSelected ? ' selected' : ''}`} onClick={() => setSelectedFunnel(isSelected ? null : flow.id)}>
                                    <div className="funnel-color-bar" style={{ background: flow.color || '#6366f1' }} />
                                    <div className="funnel-name">{flow.name}</div>
                                    <div className="funnel-stats">
                                        <div className="funnel-stat">
                                            <div className="funnel-stat-value" style={{ color: flow.color || '#6366f1' }}>{flow.count}</div>
                                            <div className="funnel-stat-label">Kişi</div>
                                        </div>
                                        <div className="funnel-stat">
                                            <div className="funnel-stat-value">{flow.conversationCount || 0}</div>
                                            <div className="funnel-stat-label">Görüşme</div>
                                        </div>
                                        <div className="funnel-stat">
                                            <div className="funnel-stat-value">{pct}%</div>
                                            <div className="funnel-stat-label">Oran</div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Selected funnel stages */}
                    {selectedFunnel && (() => {
                        const flow = funnels.find(f => f.id === selectedFunnel);
                        if (!flow || !flow.stages?.length) return null;
                        const maxStageCount = Math.max(...flow.stages.map(s => s.count || 0), 1);
                        return (
                            <div className="ceo-section" style={{ marginBottom: 20 }}>
                                <div className="ceo-section-header">
                                    <div className="ceo-section-icon" style={{ background: (flow.color || '#6366f1') + '18', color: flow.color || '#6366f1' }}>
                                        {getFlowIcon(flow.name)}
                                    </div>
                                    <h2>{flow.name} — Aşama Kırılımı</h2>
                                </div>
                                <div className="ceo-section-body">
                                    {flow.stages.map((stage, idx) => {
                                        const pct = ((stage.count / maxStageCount) * 100).toFixed(0);
                                        return (
                                            <div key={stage.id || idx} className="ceo-stage-bar-row">
                                                <div className="ceo-stage-color-dot" style={{ background: stage.color || flow.color || '#6366f1' }} />
                                                <span className="ceo-stage-bar-name">{stage.name}</span>
                                                <div className="ceo-stage-bar-track">
                                                    <div className="ceo-stage-bar-fill" style={{ width: `${pct}%`, background: stage.color || flow.color || '#6366f1' }} />
                                                </div>
                                                <span className="ceo-stage-bar-count">{stage.count || 0}</span>
                                                {(stage.recentCount || 0) > 0 && <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 700 }}>+{stage.recentCount}</span>}
                                                {(stage.conversationCount || 0) > 0 && <span className="ceo-stage-bar-pct">{stage.conversationCount} grş</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })()}

                    {/* All funnels stage overview */}
                    {!selectedFunnel && (
                        <div className="ceo-section" style={{ marginBottom: 20 }}>
                            <div className="ceo-section-header">
                                <div className="ceo-section-icon" style={{ background: '#fdf4ff', color: '#a855f7' }}><Activity size={18} /></div>
                                <h2>Tüm Akışlar — Genel Dağılım</h2>
                            </div>
                            <div className="ceo-section-body">
                                {funnels.map(flow => {
                                    const pct = totalContacts > 0 ? ((flow.count / totalContacts) * 100).toFixed(0) : 0;
                                    return (
                                        <div key={flow.id} className="ceo-stage-bar-row" style={{ cursor: 'pointer' }} onClick={() => setSelectedFunnel(flow.id)}>
                                            <div className="ceo-stage-color-dot" style={{ background: flow.color || '#6366f1' }} />
                                            <span className="ceo-stage-bar-name">{flow.name}</span>
                                            <div className="ceo-stage-bar-track">
                                                <div className="ceo-stage-bar-fill" style={{ width: `${pct}%`, background: flow.color || '#6366f1' }} />
                                            </div>
                                            <span className="ceo-stage-bar-count">{flow.count}</span>
                                            <span className="ceo-stage-bar-pct">{pct}%</span>
                                            <ChevronRight size={14} style={{ color: '#94a3b8' }} />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default FunnelReport;
