import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    DollarSign, ShoppingCart, FileText, RefreshCw, Filter, ArrowLeft,
    TrendingUp, UserCheck, Receipt, XCircle, CheckCircle2, Clock,
    ArrowUpRight, ArrowDownRight, PieChart
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
    return '₺' + formatNumber(n);
};

const SalesReport = () => {
    const { currentWorkspace } = useAuth();
    const navigate = useNavigate();
    const [analytics, setAnalytics] = useState(null);
    const [agentPerformance, setAgentPerformance] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState(() => sessionStorage.getItem('reportDateFilter') || '30d');
    const [startDate, setStartDate] = useState(() => sessionStorage.getItem('reportStartDate') || '');
    const [endDate, setEndDate] = useState(() => sessionStorage.getItem('reportEndDate') || '');

    useEffect(() => {
        sessionStorage.setItem('reportDateFilter', dateFilter);
        sessionStorage.setItem('reportStartDate', startDate);
        sessionStorage.setItem('reportEndDate', endDate);
    }, [dateFilter, startDate, endDate]);

    const getDateRange = () => {
        return getDateRangeLogic(dateFilter, startDate, endDate);
    };

    const fetchData = async () => {
        if (!currentWorkspace?.id) return;
        setLoading(true);
        try {
            const params = { ...getDateRange(), comparePrevious: true };
            const [analyticsRes, perfRes] = await Promise.all([
                contactAPI.getAnalytics(currentWorkspace.id, params),
                contactAPI.getAgentPerformance(currentWorkspace.id, params)
            ]);
            setAnalytics(analyticsRes.data);
            setAgentPerformance(perfRes.data);
        } catch (err) {
            console.error('Sales report error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [currentWorkspace?.id, dateFilter, startDate, endDate]);

    const ds = analytics?.dealStats || {};
    const prev = analytics?.previousPeriod || {};
    const agents = agentPerformance?.agents || [];

    const calcTrend = (current, previous) => {
        if (!previous || previous === 0) return null;
        const pct = ((current - previous) / previous * 100).toFixed(0);
        return { pct: Math.abs(pct), direction: current >= previous ? 'up' : 'down' };
    };

    const TrendBadge = ({ current, previous }) => {
        const trend = calcTrend(current, previous);
        if (!trend) return null;
        return (
            <span className={`kpi-trend ${trend.direction}`}>
                {trend.direction === 'up' ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                %{trend.pct}
            </span>
        );
    };

    // Agent sales sorted by order amount
    const salesAgents = [...agents].filter(a => (a.dealOrders || 0) > 0 || (a.dealTotalAmount || 0) > 0)
        .sort((a, b) => (b.dealTotalAmount || 0) - (a.dealTotalAmount || 0));

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

    const orderDeals = (ds.recentDeals || []).filter(deal => deal.stage === 'ORDER');

    const getGroupedSubjects = () => {
        if (!orderDeals || orderDeals.length === 0) return [];
        const groups = {};

        const normalizeTitle = (str) => {
            if (!str) return 'belirtilmemis';
            return str
                .toLocaleLowerCase('tr-TR')
                .replace(/ğ/g, 'g')
                .replace(/ü/g, 'u')
                .replace(/ş/g, 's')
                .replace(/ı/g, 'i')
                .replace(/ö/g, 'o')
                .replace(/ç/g, 'c')
                .replace(/[^a-z0-9]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        };

        orderDeals.forEach(deal => {
            let title = (deal.title || 'Belirtilmemiş').trim();
            const key = normalizeTitle(title);
            
            if (!groups[key]) {
                groups[key] = {
                    title: title,
                    count: 0,
                    amount: 0,
                    wonCount: 0,
                    lostCount: 0,
                    openCount: 0
                };
            }
            groups[key].count += 1;
            groups[key].amount += (deal.amount || 0);
            
            if (deal.status === 'WON') groups[key].wonCount += 1;
            else if (deal.status === 'LOST') groups[key].lostCount += 1;
            else groups[key].openCount += 1;
        });
        
        return Object.values(groups).sort((a, b) => b.count - a.count);
    };

    const getGroupedSources = () => {
        if (!orderDeals || orderDeals.length === 0) return [];
        const groups = {};

        orderDeals.forEach(deal => {
            const rawSource = deal.contact?.source || 'MANUAL';
            const title = rawSource.charAt(0).toUpperCase() + rawSource.slice(1).toLowerCase();
            const key = title.toLowerCase();
            
            if (!groups[key]) {
                groups[key] = {
                    title: title,
                    count: 0,
                    amount: 0,
                    wonCount: 0,
                    lostCount: 0,
                    openCount: 0
                };
            }
            groups[key].count += 1;
            groups[key].amount += (deal.amount || 0);
            
            if (deal.status === 'WON') groups[key].wonCount += 1;
            else if (deal.status === 'LOST') groups[key].lostCount += 1;
            else groups[key].openCount += 1;
        });
        
        return Object.values(groups).sort((a, b) => b.count - a.count);
    };

    const groupedSubjects = getGroupedSubjects();
    const groupedSources = getGroupedSources();

    return (
        <div className="ceo-report">
            <button className="ceo-back-btn" onClick={() => navigate('/general-report')}><ArrowLeft size={16} /> Dashboard</button>

            <div className="ceo-detail-header">
                <div className="ceo-detail-header-left">
                    <h1><DollarSign size={24} style={{ color: '#059669' }} /> Satış Raporu</h1>
                    <p>Teklif, sipariş, fatura ve temsilci bazlı satış performansı</p>
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

            {/* Pipeline Cards */}
            <div className="ceo-detail-kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {/* Teklif */}
                <div className="ceo-detail-kpi-card">
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #8b5cf6, #8b5cf688)' }} />
                    <div className="kpi-icon-wrap" style={{ background: '#f5f3ff', color: '#8b5cf6' }}><FileText size={20} /></div>
                    <div className="kpi-label">Teklif</div>
                    <div className="kpi-value">{formatCurrency(ds.quoteAmount || 0)}</div>
                    <div className="kpi-sub">{formatNumber(ds.totalQuotes || 0)} Adet</div>
                </div>
                {/* Sipariş */}
                <div className="ceo-detail-kpi-card">
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #f59e0b, #f59e0b88)' }} />
                    <div className="kpi-icon-wrap" style={{ background: '#fef3c7', color: '#d97706' }}><ShoppingCart size={20} /></div>
                    <div className="kpi-label">Sipariş</div>
                    <div className="kpi-value">{formatCurrency(ds.orderAmount || 0)}</div>
                    <div className="kpi-sub">{formatNumber(ds.totalOrders || 0)} Adet</div>
                    <TrendBadge current={ds.orderAmount || 0} previous={prev.orderAmount} />
                </div>
                {/* Fatura */}
                <div className="ceo-detail-kpi-card">
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #10b981, #10b98188)' }} />
                    <div className="kpi-icon-wrap" style={{ background: '#ecfdf5', color: '#10b981' }}><Receipt size={20} /></div>
                    <div className="kpi-label">Fatura</div>
                    <div className="kpi-value">{formatCurrency(ds.invoiceAmount || 0)}</div>
                    <div className="kpi-sub">{formatNumber(ds.totalInvoices || 0)} Adet</div>
                </div>
            </div>

            {/* Status Distribution */}
            <div className="ceo-section" style={{ marginBottom: 20 }}>
                <div className="ceo-section-header">
                    <div className="ceo-section-icon" style={{ background: '#eef2ff', color: '#6366f1' }}><TrendingUp size={18} /></div>
                    <h2>Durum Dağılımı</h2>
                </div>
                <div className="ceo-section-body">
                    <div className="ceo-mini-grid cols-4">
                        <div className="ceo-mini-card" style={{ background: '#eff6ff' }}>
                            <div className="mini-value" style={{ color: '#2563eb', fontSize: '1.4rem' }}>{formatCurrency(ds.openAmount || 0)}</div>
                            <div className="mini-label" style={{ color: '#3b82f6' }}>Açık</div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginTop: 2 }}>{ds.openCount || 0} Adet</div>
                        </div>
                        <div className="ceo-mini-card" style={{ background: '#f0fdf4' }}>
                            <div className="mini-value" style={{ color: '#16a34a', fontSize: '1.4rem' }}>{formatCurrency(ds.wonAmount || 0)}</div>
                            <div className="mini-label" style={{ color: '#059669' }}>Tamamlandı</div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginTop: 2 }}>{ds.wonCount || 0} Adet</div>
                        </div>
                        <div className="ceo-mini-card" style={{ background: '#fef2f2' }}>
                            <div className="mini-value" style={{ color: '#dc2626', fontSize: '1.4rem' }}>{formatCurrency(ds.lostAmount || 0)}</div>
                            <div className="mini-label" style={{ color: '#dc2626' }}>İptal</div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginTop: 2 }}>{ds.lostCount || 0} Adet</div>
                        </div>
                        <div className="ceo-mini-card" style={{ background: '#fef3c7' }}>
                            <div className="mini-value" style={{ color: '#b45309' }}>
                                {((ds.wonCount || 0) + (ds.openCount || 0) + (ds.lostCount || 0)) > 0
                                    ? (((ds.wonCount || 0) / ((ds.wonCount || 0) + (ds.openCount || 0) + (ds.lostCount || 0))) * 100).toFixed(0)
                                    : 0}%
                            </div>
                            <div className="mini-label" style={{ color: '#d97706' }}>Kapanış Oranı</div>
                        </div>
                    </div>

                    {/* Visual bar */}
                    {((ds.wonCount || 0) + (ds.openCount || 0) + (ds.lostCount || 0)) > 0 && (
                        <div style={{ marginTop: 16 }}>
                            <div style={{ display: 'flex', height: 12, borderRadius: 8, overflow: 'hidden', background: '#f1f5f9' }}>
                                {ds.wonCount > 0 && <div style={{ width: `${(ds.wonCount / ((ds.wonCount || 0) + (ds.openCount || 0) + (ds.lostCount || 0))) * 100}%`, background: '#10b981', transition: 'width 0.8s' }} title={`Tamamlandı: ${ds.wonCount}`} />}
                                {ds.openCount > 0 && <div style={{ width: `${(ds.openCount / ((ds.wonCount || 0) + (ds.openCount || 0) + (ds.lostCount || 0))) * 100}%`, background: '#3b82f6', transition: 'width 0.8s' }} title={`Açık: ${ds.openCount}`} />}
                                {ds.lostCount > 0 && <div style={{ width: `${(ds.lostCount / ((ds.wonCount || 0) + (ds.openCount || 0) + (ds.lostCount || 0))) * 100}%`, background: '#ef4444', transition: 'width 0.8s' }} title={`İptal: ${ds.lostCount}`} />}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: '#10b981' }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#10b981' }} />Tamamlandı</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: '#3b82f6' }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#3b82f6' }} />Açık</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: '#ef4444' }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#ef4444' }} />İptal</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Agent Sales Leaderboard */}
            {salesAgents.length > 0 && (
                <div className="ceo-section" style={{ marginBottom: 20 }}>
                    <div className="ceo-section-header">
                        <div className="ceo-section-icon" style={{ background: '#ecfdf5', color: '#059669' }}><UserCheck size={18} /></div>
                        <h2>Satış Lider Tablosu</h2>
                    </div>
                    <div className="ceo-section-body" style={{ padding: 0, overflowX: 'auto' }}>
                        <table className="ceo-league-table">
                            <thead>
                                <tr>
                                    <th>Temsilci</th>
                                    <th>Sipariş</th>
                                    <th>Ciro (₺)</th>
                                    <th>Ort. Sipariş</th>
                                    <th>Teklif</th>
                                    <th>Fatura</th>
                                </tr>
                            </thead>
                            <tbody>
                                {salesAgents.map((agent, idx) => {
                                    const avgOrder = (agent.dealOrders || 0) > 0 ? Math.round((agent.dealTotalAmount || 0) / agent.dealOrders) : 0;
                                    const getMedalClass = (i) => i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'default';
                                    const getRowClass = (i) => i === 0 ? 'gold-row' : i === 1 ? 'silver-row' : i === 2 ? 'bronze-row' : '';
                                    return (
                                        <tr key={agent.userId || idx} className={getRowClass(idx)}>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <div className={`medal-badge ${getMedalClass(idx)}`}>{idx + 1}</div>
                                                    {agent.avatar ? (
                                                        <img src={agent.avatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                                                    ) : (
                                                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', color: '#059669' }}>{agent.name?.charAt(0)}</div>
                                                    )}
                                                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>{agent.name}</span>
                                                </div>
                                            </td>
                                            <td><span style={{ fontWeight: 800, color: '#f59e0b', fontSize: '1.05rem' }}>{agent.dealOrders || 0}</span></td>
                                            <td><span style={{ fontWeight: 800, color: '#059669', fontSize: '1.05rem' }}>{formatCurrency(agent.dealTotalAmount || 0)}</span></td>
                                            <td><span style={{ fontWeight: 700, color: '#475569' }}>{formatCurrency(avgOrder)}</span></td>
                                            <td><span style={{ fontWeight: 700, color: '#8b5cf6' }}>{agent.dealQuotes || 0}</span></td>
                                            <td><span style={{ fontWeight: 700, color: '#10b981' }}>{agent.dealInvoices || 0}</span></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Konu Gruplaması */}
            {groupedSubjects.length > 0 && (
                <div className="ceo-section" style={{ marginBottom: 20 }}>
                    <div className="ceo-section-header">
                        <div className="ceo-section-icon" style={{ background: '#f5f3ff', color: '#8b5cf6' }}><PieChart size={18} /></div>
                        <h2>Satış Konuları (Gruplanmış)</h2>
                    </div>
                    <div className="ceo-section-body" style={{ padding: 0, overflowX: 'auto' }}>
                        <table className="ceo-league-table">
                            <thead>
                                <tr>
                                    <th>Konu</th>
                                    <th>Toplam Adet</th>
                                    <th>Kazanılan (Tamamlandı)</th>
                                    <th>Açık</th>
                                    <th>Kaybedilen (İptal)</th>
                                    <th>Toplam Tutar</th>
                                </tr>
                            </thead>
                            <tbody>
                                {groupedSubjects.map((grp, idx) => (
                                    <tr key={idx}>
                                        <td>
                                            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>{grp.title}</div>
                                        </td>
                                        <td><span style={{ fontWeight: 800, color: '#334155', fontSize: '1rem' }}>{grp.count}</span></td>
                                        <td><span style={{ fontWeight: 700, color: '#10b981' }}>{grp.wonCount}</span></td>
                                        <td><span style={{ fontWeight: 700, color: '#3b82f6' }}>{grp.openCount}</span></td>
                                        <td><span style={{ fontWeight: 700, color: '#ef4444' }}>{grp.lostCount}</span></td>
                                        <td><span style={{ fontWeight: 800, color: '#059669', fontSize: '1rem' }}>{formatCurrency(grp.amount)}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Kaynak Gruplaması */}
            {groupedSources.length > 0 && (
                <div className="ceo-section" style={{ marginBottom: 20 }}>
                    <div className="ceo-section-header">
                        <div className="ceo-section-icon" style={{ background: '#e0f2fe', color: '#0284c7' }}><PieChart size={18} /></div>
                        <h2>Satış Kaynakları (Gruplanmış)</h2>
                    </div>
                    <div className="ceo-section-body" style={{ padding: 0, overflowX: 'auto' }}>
                        <table className="ceo-league-table">
                            <thead>
                                <tr>
                                    <th>Kaynak</th>
                                    <th>Toplam Adet</th>
                                    <th>Kazanılan (Tamamlandı)</th>
                                    <th>Açık</th>
                                    <th>Kaybedilen (İptal)</th>
                                    <th>Toplam Tutar</th>
                                </tr>
                            </thead>
                            <tbody>
                                {groupedSources.map((grp, idx) => (
                                    <tr key={idx}>
                                        <td>
                                            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>{grp.title}</div>
                                        </td>
                                        <td><span style={{ fontWeight: 800, color: '#334155', fontSize: '1rem' }}>{grp.count}</span></td>
                                        <td><span style={{ fontWeight: 700, color: '#10b981' }}>{grp.wonCount}</span></td>
                                        <td><span style={{ fontWeight: 700, color: '#3b82f6' }}>{grp.openCount}</span></td>
                                        <td><span style={{ fontWeight: 700, color: '#ef4444' }}>{grp.lostCount}</span></td>
                                        <td><span style={{ fontWeight: 800, color: '#059669', fontSize: '1rem' }}>{formatCurrency(grp.amount)}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Satış Listesi */}
            {orderDeals?.length > 0 && (
                <div className="ceo-section" style={{ marginBottom: 20 }}>
                    <div className="ceo-section-header">
                        <div className="ceo-section-icon" style={{ background: '#fef3c7', color: '#d97706' }}><FileText size={18} /></div>
                        <h2>Satış Listesi</h2>
                    </div>
                    <div className="ceo-section-body" style={{ padding: 0, overflowX: 'auto' }}>
                        <table className="ceo-league-table">
                            <thead>
                                <tr>
                                    <th>Tarih</th>
                                    <th>Satıcı</th>
                                    <th>Konu</th>
                                    <th>Müşteri</th>
                                    <th>Kaynak</th>
                                    <th>Durum</th>
                                    <th>Tutar</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orderDeals.map((deal, idx) => {
                                    const statusConfig = {
                                        'OPEN': { label: 'Açık', bg: '#eff6ff', color: '#3b82f6' },
                                        'WON': { label: 'Tamamlandı', bg: '#f0fdf4', color: '#10b981' },
                                        'LOST': { label: 'Tamamlanmadı', bg: '#fef2f2', color: '#ef4444' },
                                    };
                                    const st = statusConfig[deal.status] || statusConfig['OPEN'];
                                    const typeLabel = deal.stage === 'ORDER' ? 'Sipariş' : deal.stage === 'QUOTE' ? 'Teklif' : deal.stage === 'INVOICE' ? 'Fatura' : deal.stage;
                                    return (
                                        <tr key={deal.id || idx}>
                                            <td><span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>{deal.createdAt ? new Date(deal.createdAt).toLocaleDateString('tr-TR') : '-'}</span></td>
                                            <td>
                                                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>
                                                    {deal.assignedTo?.name || 'Atanmadı'}
                                                </div>
                                            </td>
                                            <td>
                                                <div>
                                                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>{deal.title || 'Belirtilmemiş'}</div>
                                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 2 }}>{typeLabel}</div>
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 500 }}>
                                                    {deal.contact?.name || 'İsimsiz Müşteri'}
                                                </div>
                                            </td>
                                            <td>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '2px 8px', borderRadius: 12 }}>
                                                    {(deal.contact?.source || 'Manuel').charAt(0).toUpperCase() + (deal.contact?.source || 'MANUAL').slice(1).toLowerCase()}
                                                </span>
                                            </td>
                                            <td>
                                                <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 20, background: st.bg, color: st.color, fontSize: '0.75rem', fontWeight: 700 }}>
                                                    {st.label}
                                                </span>
                                            </td>
                                            <td><span style={{ fontWeight: 800, color: '#059669', fontSize: '0.95rem' }}>{formatCurrency(deal.amount || 0)}</span></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SalesReport;
