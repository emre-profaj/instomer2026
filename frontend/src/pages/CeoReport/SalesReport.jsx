import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    DollarSign, ShoppingCart, RefreshCw, Filter, ArrowLeft,
    TrendingUp, ChevronDown, ChevronRight, Users, UserCheck, Hash, Globe, FileText
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { contactAPI } from '../../services/api';
import './CeoReport.css';
import './CeoDetailReport.css';
import { getDateRangeLogic, dateFilterOptions } from '../../utils/dateFilters';

const formatCurrency = (n) => {
    if (!n && n !== 0) return '₺0';
    return (n || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
};

const SalesReport = () => {
    const { currentWorkspace } = useAuth();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState(() => sessionStorage.getItem('reportDateFilter') || 'thisMonth');
    const [startDate, setStartDate] = useState(() => sessionStorage.getItem('reportStartDate') || '');
    const [endDate, setEndDate] = useState(() => sessionStorage.getItem('reportEndDate') || '');
    const [expandedTopics, setExpandedTopics] = useState({});
    const [expandedAgents, setExpandedAgents] = useState({});
    const [expandedTopicSales, setExpandedTopicSales] = useState({});
    const [expandedAgentSales, setExpandedAgentSales] = useState({});
    const [expandedSources, setExpandedSources] = useState({});
    const [expandedSourceSales, setExpandedSourceSales] = useState({});

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
            const res = await contactAPI.getSalesReport(currentWorkspace.id, params);
            setData(res.data);
        } catch (err) {
            console.error('Sales report error:', err);
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

    const { totalCount = 0, totalAmount = 0, topicGroups = [], agentGroups = [], sourceGroups = [], salesList = [] } = data || {};
    const maxTopicAmount = topicGroups.length > 0 ? topicGroups[0].amount : 1;
    const maxAgentAmount = agentGroups.length > 0 ? agentGroups[0].amount : 1;

    const toggleTopic = (name) => setExpandedTopics(p => ({ ...p, [name]: !p[name] }));
    const toggleAgent = (name) => setExpandedAgents(p => ({ ...p, [name]: !p[name] }));
    const toggleTopicSales = (key) => setExpandedTopicSales(p => ({ ...p, [key]: !p[key] }));
    const toggleAgentSales = (key) => setExpandedAgentSales(p => ({ ...p, [key]: !p[key] }));
    const toggleSource = (name) => setExpandedSources(p => ({ ...p, [name]: !p[name] }));
    const toggleSourceSales = (key) => setExpandedSourceSales(p => ({ ...p, [key]: !p[key] }));

    // Get sales for a specific topic+agent combination
    const getSalesFor = (categoryName, agentName) => {
        return salesList.filter(s =>
            s.categoryName === categoryName && (agentName ? s.agentName === agentName : true)
        );
    };

    return (
        <div className="ceo-report">
            <button className="ceo-back-btn" onClick={() => navigate('/general-report')}><ArrowLeft size={16} /> Dashboard</button>

            <div className="ceo-detail-header">
                <div className="ceo-detail-header-left">
                    <h1><DollarSign size={24} style={{ color: '#059669' }} /> Satış Raporu</h1>
                    <p>Kategori ve temsilci bazlı satış analizi</p>
                </div>

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
                <div className="ceo-filter-right">
                    <button className="ceo-refresh-btn" onClick={fetchData}><RefreshCw size={14} /> Güncelle</button>
                    <button className="ceo-refresh-btn" onClick={() => window.print()} style={{ background: '#6366f1', color: 'white' }}><FileText size={14} /> Raporu İndir</button>
                </div>
            </div>

            {/* ═══ 1. TOPLAM SATIŞ ═══ */}
            <div style={{
                display: 'flex', gap: 20, marginBottom: 24, flexWrap: 'wrap'
            }}>
                <div style={{
                    flex: 1, minWidth: 200,
                    background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                    borderRadius: 16, padding: '28px 32px', color: '#fff',
                    boxShadow: '0 8px 32px rgba(5, 150, 105, 0.3)',
                    position: 'relative', overflow: 'hidden'
                }}>
                    <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, opacity: 0.85, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <DollarSign size={16} /> Toplam Satış Tutarı
                    </div>
                    <div style={{ fontSize: '2.4rem', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                        {formatCurrency(totalAmount)}
                    </div>
                </div>
                <div style={{
                    flex: 1, minWidth: 200,
                    background: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)',
                    borderRadius: 16, padding: '28px 32px', color: '#fff',
                    boxShadow: '0 8px 32px rgba(99, 102, 241, 0.3)',
                    position: 'relative', overflow: 'hidden'
                }}>
                    <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, opacity: 0.85, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ShoppingCart size={16} /> Toplam Satış Adedi
                    </div>
                    <div style={{ fontSize: '2.4rem', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                        {totalCount}
                    </div>
                    <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: 4 }}>
                        Ort: {totalCount > 0 ? formatCurrency(totalAmount / totalCount) : '₺0'}
                    </div>
                </div>
            </div>

            {/* ═══ 2. KONUYA GÖRE SATIŞ ═══ */}
            {topicGroups.length > 0 && (
                <div className="ceo-section" style={{ marginBottom: 24 }}>
                    <div className="ceo-section-header">
                        <div className="ceo-section-icon" style={{ background: '#ecfdf5', color: '#059669' }}><TrendingUp size={18} /></div>
                        <h2>Konuya Göre Satış</h2>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', marginLeft: 'auto' }}>{topicGroups.length} kategori</span>
                    </div>
                    <div className="ceo-section-body" style={{ padding: 0 }}>
                        {topicGroups.map((group, gi) => {
                            const pct = ((group.amount / maxTopicAmount) * 100).toFixed(0);
                            const isExpanded = expandedTopics[group.name];
                            return (
                                <div key={gi} style={{ borderBottom: gi < topicGroups.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                    {/* Ana Grup Satırı */}
                                    <div
                                        onClick={() => toggleTopic(group.name)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
                                            cursor: 'pointer', transition: 'background 0.15s'
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <div style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                                            <ChevronRight size={14} style={{ color: '#94a3b8' }} />
                                        </div>
                                        <span style={{ fontSize: '0.9rem', width: 22, textAlign: 'center' }}>{group.icon || '📁'}</span>
                                        <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a', flex: 1 }}>{group.name}</span>
                                        <div style={{ flex: 2, height: 8, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden', maxWidth: 200 }}>
                                            <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${group.color || '#059669'}, ${group.color ? group.color + '99' : '#34d399'})`, borderRadius: 6, transition: 'width 0.6s' }} />
                                        </div>
                                        <span style={{ fontWeight: 800, fontSize: '0.82rem', color: '#059669', minWidth: 50, textAlign: 'right' }}>{group.count} adet</span>
                                        <span style={{ fontWeight: 900, fontSize: '0.92rem', color: '#0f172a', minWidth: 100, textAlign: 'right' }}>{formatCurrency(group.amount)}</span>
                                    </div>

                                    {/* Alt Grup: Temsilciler */}
                                    {isExpanded && (
                                        <div style={{ background: '#fafbfc', padding: '0 16px 8px 46px' }}>
                                            {group.agents.map((agent, ai) => {
                                                const agentKey = `${group.name}__${agent.name}`;
                                                const showSales = expandedTopicSales[agentKey];
                                                const agentSales = getSalesFor(group.name, agent.name);
                                                return (
                                                    <div key={ai}>
                                                        <div
                                                            onClick={() => toggleTopicSales(agentKey)}
                                                            style={{
                                                                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                                                                borderRadius: 8, cursor: 'pointer', marginBottom: 2,
                                                                transition: 'background 0.15s'
                                                            }}
                                                            onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; }}
                                                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                                        >
                                                            <ChevronRight size={11} style={{ color: '#cbd5e1', transition: 'transform 0.2s', transform: showSales ? 'rotate(90deg)' : 'none' }} />
                                                            <UserCheck size={13} style={{ color: '#6366f1' }} />
                                                            <span style={{ fontWeight: 600, fontSize: '0.8rem', color: '#374151', flex: 1 }}>{agent.name}</span>
                                                            <span style={{ fontWeight: 700, fontSize: '0.75rem', color: '#6366f1' }}>{agent.count}</span>
                                                            <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#0f172a', minWidth: 80, textAlign: 'right' }}>{formatCurrency(agent.amount)}</span>
                                                        </div>
                                                        {/* Satış listesi */}
                                                        {showSales && agentSales.length > 0 && (
                                                            <div style={{ marginLeft: 20, marginBottom: 6, borderLeft: '2px solid #e2e8f0', paddingLeft: 12 }}>
                                                                {agentSales.map((s, si) => (
                                                                    <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: '0.72rem', color: '#64748b' }}>
                                                                        <Hash size={10} style={{ color: '#cbd5e1' }} />
                                                                        <span style={{ flex: 1, fontWeight: 600, color: '#374151' }}>{s.contactName}</span>
                                                                        <span>{s.title}</span>
                                                                        {s.source && <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#8b5cf6', background: '#f5f3ff', padding: '1px 6px', borderRadius: 4 }}>{s.source}</span>}
                                                                        <span style={{ fontWeight: 700, color: '#059669' }}>{formatCurrency(s.amount)}</span>
                                                                        <span style={{ color: '#94a3b8', fontSize: '0.65rem' }}>{new Date(s.createdAt).toLocaleDateString('tr-TR')}</span>
                                                                    </div>
                                                                ))}
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
            )}

            {/* ═══ 3. TEMSİLCİYE GÖRE SATIŞ ═══ */}
            {agentGroups.length > 0 && (
                <div className="ceo-section" style={{ marginBottom: 24 }}>
                    <div className="ceo-section-header">
                        <div className="ceo-section-icon" style={{ background: '#eef2ff', color: '#6366f1' }}><Users size={18} /></div>
                        <h2>Temsilciye Göre Satış</h2>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', marginLeft: 'auto' }}>{agentGroups.length} temsilci</span>
                    </div>
                    <div className="ceo-section-body" style={{ padding: 0 }}>
                        {agentGroups.map((group, gi) => {
                            const pct = ((group.amount / maxAgentAmount) * 100).toFixed(0);
                            const isExpanded = expandedAgents[group.name];
                            return (
                                <div key={gi} style={{ borderBottom: gi < agentGroups.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                    {/* Ana Grup Satırı */}
                                    <div
                                        onClick={() => toggleAgent(group.name)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
                                            cursor: 'pointer', transition: 'background 0.15s'
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <div style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                                            <ChevronRight size={14} style={{ color: '#94a3b8' }} />
                                        </div>
                                        <div style={{
                                            width: 28, height: 28, borderRadius: '50%',
                                            background: 'linear-gradient(135deg, #6366f1, #818cf8)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: '#fff', fontWeight: 800, fontSize: '0.7rem'
                                        }}>
                                            {group.name?.charAt(0)?.toUpperCase() || '?'}
                                        </div>
                                        <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a', flex: 1 }}>{group.name}</span>
                                        <div style={{ flex: 2, height: 8, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden', maxWidth: 200 }}>
                                            <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #6366f1, #818cf8)', borderRadius: 6, transition: 'width 0.6s' }} />
                                        </div>
                                        <span style={{ fontWeight: 800, fontSize: '0.82rem', color: '#6366f1', minWidth: 50, textAlign: 'right' }}>{group.count} adet</span>
                                        <span style={{ fontWeight: 900, fontSize: '0.92rem', color: '#0f172a', minWidth: 100, textAlign: 'right' }}>{formatCurrency(group.amount)}</span>
                                    </div>

                                    {/* Alt Grup: Konular */}
                                    {isExpanded && (
                                        <div style={{ background: '#fafbfc', padding: '0 16px 8px 46px' }}>
                                            {group.topics.map((topic, ti) => {
                                                const topicKey = `${group.name}__${topic.name}`;
                                                const showSales = expandedAgentSales[topicKey];
                                                const topicSales = salesList.filter(s => s.agentName === group.name && s.categoryName === topic.name);
                                                return (
                                                    <div key={ti}>
                                                        <div
                                                            onClick={() => toggleAgentSales(topicKey)}
                                                            style={{
                                                                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                                                                borderRadius: 8, cursor: 'pointer', marginBottom: 2,
                                                                transition: 'background 0.15s'
                                                            }}
                                                            onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; }}
                                                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                                        >
                                                            <ChevronRight size={11} style={{ color: '#cbd5e1', transition: 'transform 0.2s', transform: showSales ? 'rotate(90deg)' : 'none' }} />
                                                            <span style={{ fontSize: '0.8rem' }}>{topic.icon || '📁'}</span>
                                                            <span style={{ fontWeight: 600, fontSize: '0.8rem', color: topic.color || '#374151', flex: 1 }}>{topic.name}</span>
                                                            <span style={{ fontWeight: 700, fontSize: '0.75rem', color: topic.color || '#059669' }}>{topic.count}</span>
                                                            <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#0f172a', minWidth: 80, textAlign: 'right' }}>{formatCurrency(topic.amount)}</span>
                                                        </div>
                                                        {/* Satış listesi */}
                                                        {showSales && topicSales.length > 0 && (
                                                            <div style={{ marginLeft: 20, marginBottom: 6, borderLeft: '2px solid #e2e8f0', paddingLeft: 12 }}>
                                                                {topicSales.map((s, si) => (
                                                                    <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: '0.72rem', color: '#64748b' }}>
                                                                        <Hash size={10} style={{ color: '#cbd5e1' }} />
                                                                        <span style={{ flex: 1, fontWeight: 600, color: '#374151' }}>{s.contactName}</span>
                                                                        <span>{s.title}</span>
                                                                        {s.source && <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#8b5cf6', background: '#f5f3ff', padding: '1px 6px', borderRadius: 4 }}>{s.source}</span>}
                                                                        <span style={{ fontWeight: 700, color: '#059669' }}>{formatCurrency(s.amount)}</span>
                                                                        <span style={{ color: '#94a3b8', fontSize: '0.65rem' }}>{new Date(s.createdAt).toLocaleDateString('tr-TR')}</span>
                                                                    </div>
                                                                ))}
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
            )}

            {/* ═══ 4. TÜM SATIŞ LİSTESİ ═══ */}
            {salesList.length > 0 && (
                <div className="ceo-section" style={{ marginBottom: 24 }}>
                    <div className="ceo-section-header" style={{ justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div className="ceo-section-icon" style={{ background: '#fef3c7', color: '#d97706' }}><ShoppingCart size={18} /></div>
                            <h2>Tüm Satış Listesi</h2>
                        </div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8' }}>{salesList.length} satış</span>
                    </div>
                    <div className="ceo-section-body" style={{ padding: 0, overflowX: 'auto' }}>
                        <table className="ceo-league-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Müşteri</th>
                                    <th>Kategori</th>
                                    <th>Temsilci</th>
                                    <th>Başlık</th>
                                    <th>Kaynak</th>
                                    <th>Tutar</th>
                                    <th>Tarih</th>
                                </tr>
                            </thead>
                            <tbody>
                                {salesList.map((s, idx) => (
                                    <tr key={s.id}>
                                        <td><span style={{ fontWeight: 800, color: idx < 3 ? '#059669' : '#94a3b8', fontSize: '0.82rem' }}>{idx + 1}</span></td>
                                        <td>
                                            <div>
                                                <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f172a' }}>{s.contactName}</span>
                                                {s.contactPhone && <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{s.contactPhone}</div>}
                                            </div>
                                        </td>
                                        <td>
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                padding: '2px 8px', borderRadius: 6,
                                                background: s.categoryColor ? s.categoryColor + '18' : '#f1f5f9',
                                                color: s.categoryColor || '#64748b',
                                                fontSize: '0.72rem', fontWeight: 600
                                            }}>
                                                {s.categoryIcon && <span>{s.categoryIcon}</span>}
                                                {s.categoryName}
                                            </span>
                                        </td>
                                        <td><span style={{ fontWeight: 600, fontSize: '0.8rem', color: '#374151' }}>{s.agentName}</span></td>
                                        <td><span style={{ fontSize: '0.78rem', color: '#64748b' }}>{s.title}</span></td>
                                        <td>
                                            {s.source ? (
                                                <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#8b5cf6', background: '#f5f3ff', padding: '2px 8px', borderRadius: 6 }}>{s.source}</span>
                                            ) : (
                                                <span style={{ fontSize: '0.68rem', color: '#d1d5db' }}>—</span>
                                            )}
                                        </td>
                                        <td><span style={{ fontWeight: 800, color: '#059669', fontSize: '0.88rem' }}>{formatCurrency(s.amount)}</span></td>
                                        <td><span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{new Date(s.createdAt).toLocaleDateString('tr-TR')}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ═══ 4. KAYNAĞA GÖRE SATIŞ ═══ */}
            {sourceGroups.length > 0 && (
                <div className="ceo-section" style={{ marginBottom: 24 }}>
                    <div className="ceo-section-header">
                        <div className="ceo-section-icon" style={{ background: '#faf5ff', color: '#8b5cf6' }}><Globe size={18} /></div>
                        <h2>Kaynağa Göre Satış</h2>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', marginLeft: 'auto' }}>{sourceGroups.length} kaynak</span>
                    </div>
                    <div className="ceo-section-body" style={{ padding: 0 }}>
                        {sourceGroups.map((group, gi) => {
                            const pct = ((group.amount / (sourceGroups[0]?.amount || 1)) * 100).toFixed(0);
                            const isExpanded = expandedSources[group.name];
                            return (
                                <div key={gi} style={{ borderBottom: gi < sourceGroups.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                    <div
                                        onClick={() => toggleSource(group.name)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
                                            cursor: 'pointer', transition: 'background 0.15s'
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <div style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                                            <ChevronRight size={14} style={{ color: '#94a3b8' }} />
                                        </div>
                                        <Globe size={16} style={{ color: '#8b5cf6' }} />
                                        <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a', flex: 1 }}>{group.name}</span>
                                        <div style={{ flex: 2, height: 8, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden', maxWidth: 200 }}>
                                            <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)', borderRadius: 6, transition: 'width 0.6s' }} />
                                        </div>
                                        <span style={{ fontWeight: 800, fontSize: '0.82rem', color: '#8b5cf6', minWidth: 50, textAlign: 'right' }}>{group.count} adet</span>
                                        <span style={{ fontWeight: 900, fontSize: '0.92rem', color: '#0f172a', minWidth: 100, textAlign: 'right' }}>{formatCurrency(group.amount)}</span>
                                    </div>

                                    {isExpanded && (
                                        <div style={{ background: '#fafbfc', padding: '0 16px 8px 46px' }}>
                                            {group.agents.map((agent, ai) => {
                                                const agentKey = `src__${group.name}__${agent.name}`;
                                                const showSales = expandedSourceSales[agentKey];
                                                const agentSales = salesList.filter(s => (s.source || 'Bilinmeyen') === group.name && s.agentName === agent.name);
                                                return (
                                                    <div key={ai}>
                                                        <div
                                                            onClick={() => toggleSourceSales(agentKey)}
                                                            style={{
                                                                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                                                                borderRadius: 8, cursor: 'pointer', marginBottom: 2,
                                                                transition: 'background 0.15s'
                                                            }}
                                                            onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; }}
                                                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                                        >
                                                            <ChevronRight size={11} style={{ color: '#cbd5e1', transition: 'transform 0.2s', transform: showSales ? 'rotate(90deg)' : 'none' }} />
                                                            <UserCheck size={13} style={{ color: '#6366f1' }} />
                                                            <span style={{ fontWeight: 600, fontSize: '0.8rem', color: '#374151', flex: 1 }}>{agent.name}</span>
                                                            <span style={{ fontWeight: 700, fontSize: '0.75rem', color: '#6366f1' }}>{agent.count}</span>
                                                            <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#0f172a', minWidth: 80, textAlign: 'right' }}>{formatCurrency(agent.amount)}</span>
                                                        </div>
                                                        {showSales && agentSales.length > 0 && (
                                                            <div style={{ marginLeft: 20, marginBottom: 6, borderLeft: '2px solid #e2e8f0', paddingLeft: 12 }}>
                                                                {agentSales.map((s, si) => (
                                                                    <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: '0.72rem', color: '#64748b' }}>
                                                                        <Hash size={10} style={{ color: '#cbd5e1' }} />
                                                                        <span style={{ flex: 1, fontWeight: 600, color: '#374151' }}>{s.contactName}</span>
                                                                        <span>{s.title}</span>
                                                                        <span style={{ fontWeight: 700, color: '#059669' }}>{formatCurrency(s.amount)}</span>
                                                                        <span style={{ color: '#94a3b8', fontSize: '0.65rem' }}>{new Date(s.createdAt).toLocaleDateString('tr-TR')}</span>
                                                                    </div>
                                                                ))}
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
            )}

            {totalCount === 0 && !loading && (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
                    <ShoppingCart size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
                    <p style={{ fontSize: '1rem', fontWeight: 600 }}>Bu dönemde satış bulunamadı</p>
                    <p style={{ fontSize: '0.82rem' }}>Tarih filtresini değiştirmeyi deneyin</p>
                </div>
            )}
        </div>
    );
};

export default SalesReport;
