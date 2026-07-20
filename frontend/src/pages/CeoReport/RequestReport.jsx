import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ClipboardList, RefreshCw, Filter, ArrowLeft, Phone, DollarSign,
    Users, ShoppingCart, TrendingUp, ChevronRight, Hash, Layers,
    UserCheck, PhoneCall, MessageSquare, Calendar, FileText, Package, Globe
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { contactAPI } from '../../services/api';
import './CeoReport.css';
import './CeoDetailReport.css';
import { getDateRangeLogic, dateFilterOptions } from '../../utils/dateFilters';

const formatNumber = (n) => {
    if (!n && n !== 0) return '0';
    return n.toLocaleString('tr-TR');
};

const formatCurrency = (n) => {
    if (!n && n !== 0) return '0 ₺';
    return (n || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
};

const RequestReport = () => {
    const { currentWorkspace } = useAuth();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState(() => sessionStorage.getItem('reportDateFilter') || '30d');
    const [startDate, setStartDate] = useState(() => sessionStorage.getItem('reportStartDate') || '');
    const [endDate, setEndDate] = useState(() => sessionStorage.getItem('reportEndDate') || '');
    const [expandedAgent, setExpandedAgent] = useState(null);
    const [expandedTopics, setExpandedTopics] = useState({});
    const [expandedFunnels, setExpandedFunnels] = useState({});

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
        totalCount = 0, totalCases = 0, totalDeals = 0,
        withPhoneCount = 0,
        totalWonCount = 0, totalWonAmount = 0,
        totalCalls = 0, totalMeetings = 0, totalAppointments = 0,
        totalProposals = 0, totalOrders = 0,
        agentTable = [], topicGroups = [], funnelGroups = [], sourceGroups = []
    } = data || {};

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

            {/* ═══ KPI KARTLARI ═══ */}
            <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
                <div style={{
                    flex: '1 1 160px', minWidth: 160,
                    background: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)',
                    borderRadius: 16, padding: '20px 24px', color: '#fff',
                    boxShadow: '0 8px 32px rgba(99, 102, 241, 0.3)',
                    position: 'relative', overflow: 'hidden'
                }}>
                    <div style={{ position: 'absolute', top: -16, right: -16, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, opacity: 0.85, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Users size={14} /> Toplam Talep
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 900 }}>{formatNumber(totalCount)}</div>
                    <div style={{ fontSize: '0.68rem', opacity: 0.7 }}>{totalCases} case · {totalDeals} satış</div>
                </div>

                <div style={{
                    flex: '1 1 160px', minWidth: 160,
                    background: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
                    borderRadius: 16, padding: '20px 24px', color: '#fff',
                    boxShadow: '0 8px 32px rgba(16, 185, 129, 0.3)',
                    position: 'relative', overflow: 'hidden'
                }}>
                    <div style={{ position: 'absolute', top: -16, right: -16, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, opacity: 0.85, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <ShoppingCart size={14} /> Satış
                    </div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 900 }}>{totalWonCount} adet</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, opacity: 0.9 }}>{formatCurrency(totalWonAmount)}</div>
                </div>

                <div style={{
                    flex: '1 1 160px', minWidth: 160,
                    background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                    borderRadius: 16, padding: '20px 24px', color: '#fff',
                    boxShadow: '0 8px 32px rgba(5, 150, 105, 0.3)',
                    position: 'relative', overflow: 'hidden'
                }}>
                    <div style={{ position: 'absolute', top: -16, right: -16, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, opacity: 0.85, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Phone size={14} /> Kişi
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 900 }}>{formatNumber(withPhoneCount)}</div>
                </div>
            </div>

            {/* ═══ AKTİVİTE TABLOSU ═══ */}
            <div style={{
                background: '#fff', borderRadius: 16, marginBottom: 24,
                border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                overflow: 'hidden'
            }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            {[
                                { label: 'ARAMA', color: '#6366f1' },
                                { label: 'GÖRÜŞME', color: '#8b5cf6' },
                                { label: 'RANDEVU', color: '#f59e0b' },
                                { label: 'TEKLİF', color: '#ec4899' },
                                { label: 'SİPARİŞ', color: '#10b981' },
                                { label: 'CİRO (SATIŞ)', color: '#059669' },
                            ].map((col, i) => (
                                <th key={i} style={{
                                    padding: '14px 12px', textAlign: 'center',
                                    fontSize: '0.72rem', fontWeight: 700, color: '#64748b',
                                    textTransform: 'uppercase', letterSpacing: '0.05em'
                                }}>
                                    <span style={{ color: col.color }}>{col.label}</span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style={{ padding: '18px 12px', textAlign: 'center', fontSize: '1.4rem', fontWeight: 800, color: '#6366f1' }}>{formatNumber(totalCalls)}</td>
                            <td style={{ padding: '18px 12px', textAlign: 'center', fontSize: '1.4rem', fontWeight: 800, color: '#8b5cf6' }}>{formatNumber(totalMeetings)}</td>
                            <td style={{ padding: '18px 12px', textAlign: 'center', fontSize: '1.4rem', fontWeight: 800, color: '#f59e0b' }}>{formatNumber(totalAppointments)}</td>
                            <td style={{ padding: '18px 12px', textAlign: 'center', fontSize: '1.4rem', fontWeight: 800, color: '#ec4899' }}>{formatNumber(totalProposals)}</td>
                            <td style={{ padding: '18px 12px', textAlign: 'center', fontSize: '1.4rem', fontWeight: 800, color: '#10b981' }}>{formatNumber(totalOrders)}</td>
                            <td style={{ padding: '18px 12px', textAlign: 'center', fontSize: '1.4rem', fontWeight: 800, color: '#059669' }}>{formatCurrency(totalWonAmount)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* ═══ TEMSİLCİ BAZLI TABLO ═══ */}
            <div className="ceo-section" style={{ marginBottom: 24, overflow: 'visible' }}>
                <div className="ceo-section-header">
                    <div className="ceo-section-icon" style={{ background: '#eef2ff', color: '#6366f1' }}><UserCheck size={18} /></div>
                    <h2>Temsilci Bazlı Talep Raporu</h2>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', marginLeft: 'auto' }}>{agentTable.length} temsilci</span>
                </div>
                <div className="ceo-section-body" style={{ padding: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    {agentTable.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '32px 20px', color: '#94a3b8' }}>
                            <UserCheck size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
                            <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>Temsilci verisi bulunamadı</p>
                        </div>
                    ) : (
                        <table className="ceo-league-table" style={{ minWidth: 800 }}>
                            <thead>
                                <tr>
                                    <th>Temsilci</th>
                                    <th>Talep</th>
                                    <th>Kişi</th>
                                    <th>Arama</th>
                                    <th>Görüşme</th>
                                    <th>Randevu</th>
                                    <th>Teklif</th>
                                    <th>Sipariş</th>
                                    <th>Ciro (Satış)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {agentTable.map((agent, idx) => {
                                    const isExpanded = expandedAgent === (agent.agentId || idx);
                                    const topicEntries = Object.entries(agent.topicBreakdown || {}).sort((a, b) => b[1].count - a[1].count);
                                    return (
                                        <React.Fragment key={agent.agentId || idx}>
                                            <tr
                                                style={{ cursor: topicEntries.length > 0 ? 'pointer' : 'default' }}
                                                onClick={() => topicEntries.length > 0 && setExpandedAgent(isExpanded ? null : (agent.agentId || idx))}
                                            >
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        {topicEntries.length > 0 && (
                                                            <ChevronRight size={14} style={{ color: '#94a3b8', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
                                                        )}
                                                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', color: '#6366f1', flexShrink: 0 }}>
                                                            {agent.agentName?.charAt(0)}
                                                        </div>
                                                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>{agent.agentName}</div>
                                                    </div>
                                                </td>
                                                <td><span style={{ fontWeight: 700, color: '#6366f1' }}>{agent.caseCount}</span></td>
                                                <td><span style={{ fontWeight: 700 }}>{agent.contactCount}</span></td>
                                                <td><span style={{ fontWeight: 700, color: agent.calls > 0 ? '#059669' : '#d1d5db' }}>{agent.calls}</span></td>
                                                <td><span style={{ fontWeight: 700, color: agent.meetings > 0 ? '#0ea5e9' : '#d1d5db' }}>{agent.meetings}</span></td>
                                                <td><span style={{ fontWeight: 700, color: agent.appointments > 0 ? '#f97316' : '#d1d5db' }}>{agent.appointments}</span></td>
                                                <td><span style={{ fontWeight: 700, color: agent.proposals > 0 ? '#8b5cf6' : '#d1d5db' }}>{agent.proposals}</span></td>
                                                <td><span style={{ fontWeight: 700, color: agent.orders > 0 ? '#f59e0b' : '#d1d5db' }}>{agent.orders}</span></td>
                                                <td><span style={{ fontWeight: 700, color: agent.wonAmount > 0 ? '#10b981' : '#d1d5db' }}>{agent.wonAmount ? formatCurrency(agent.wonAmount) : '0 ₺'}</span></td>
                                            </tr>
                                            {isExpanded && topicEntries.length > 0 && (
                                                <tr>
                                                    <td colSpan={9} style={{ padding: 0, background: '#f8fafc' }}>
                                                        <div style={{ padding: '16px 20px 16px 56px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                                                <ClipboardList size={14} style={{ color: '#6366f1' }} />
                                                                <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1e293b' }}>{agent.agentName} — Konu Dağılımı</span>
                                                                <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600 }}>{topicEntries.length} konu</span>
                                                            </div>
                                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                                <thead>
                                                                    <tr style={{ background: '#e2e8f0' }}>
                                                                        <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Konu</th>
                                                                        <th style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Talep</th>
                                                                        <th style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Satış</th>
                                                                        <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>Ciro</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {topicEntries.slice(0, 20).map(([topic, td]) => (
                                                                        <tr key={topic} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                                            <td style={{ padding: '6px 10px', fontWeight: 600, color: '#1e293b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topic}</td>
                                                                            <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, color: '#6366f1' }}>{td.count}</td>
                                                                            <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, color: td.wonCount > 0 ? '#10b981' : '#d1d5db' }}>{td.wonCount || 0}</td>
                                                                            <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: td.wonAmount > 0 ? '#10b981' : '#d1d5db' }}>{td.wonAmount ? formatCurrency(td.wonAmount) : '—'}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                                {/* Toplam satırı */}
                                <tr style={{ background: '#f0fdf4', fontWeight: 800 }}>
                                    <td style={{ color: '#059669' }}>Toplam</td>
                                    <td><span style={{ color: '#6366f1' }}>{agentTable.reduce((s, a) => s + a.caseCount, 0)}</span></td>
                                    <td><span style={{ color: '#0f172a' }}>{agentTable.reduce((s, a) => s + a.contactCount, 0)}</span></td>
                                    <td><span style={{ color: '#059669' }}>{totalCalls}</span></td>
                                    <td><span style={{ color: '#0ea5e9' }}>{totalMeetings}</span></td>
                                    <td><span style={{ color: '#f97316' }}>{totalAppointments}</span></td>
                                    <td><span style={{ color: '#8b5cf6' }}>{totalProposals}</span></td>
                                    <td><span style={{ color: '#f59e0b' }}>{totalOrders}</span></td>
                                    <td><span style={{ color: '#10b981' }}>{formatCurrency(totalWonAmount)}</span></td>
                                </tr>
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* ═══ KONU BAZLI TALEP TABLOSU ═══ */}
            <div className="ceo-section" style={{ marginBottom: 24, overflow: 'visible' }}>
                <div className="ceo-section-header">
                    <div className="ceo-section-icon" style={{ background: '#eef2ff', color: '#6366f1' }}><TrendingUp size={18} /></div>
                    <h2>Konu Bazlı Talep Raporu</h2>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', marginLeft: 'auto' }}>{topicGroups.length} kategori</span>
                </div>
                <div className="ceo-section-body" style={{ padding: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    {topicGroups.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '32px 20px', color: '#94a3b8' }}>
                            <TrendingUp size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
                            <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>Konu verisi bulunamadı</p>
                        </div>
                    ) : (
                        <table className="ceo-league-table" style={{ minWidth: 800 }}>
                            <thead>
                                <tr>
                                    <th>Konu</th>
                                    <th>Talep</th>
                                    <th>Arama</th>
                                    <th>Görüşme</th>
                                    <th>Randevu</th>
                                    <th>Teklif</th>
                                    <th>Sipariş</th>
                                    <th>Satış</th>
                                    <th>Ciro</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topicGroups.map((group, gi) => {
                                    const isTopicExpanded = expandedTopics[group.name];
                                    return (
                                        <React.Fragment key={gi}>
                                            <tr
                                                style={{ borderBottom: (!isTopicExpanded && gi < topicGroups.length - 1) ? '1px solid #f1f5f9' : 'none', cursor: group.sources?.length > 0 ? 'pointer' : 'default' }}
                                                onClick={() => group.sources?.length > 0 && setExpandedTopics(p => ({ ...p, [group.name]: !p[group.name] }))}
                                            >
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        {group.sources?.length > 0 && <ChevronRight size={12} style={{ color: '#94a3b8', transition: 'transform 0.2s', transform: isTopicExpanded ? 'rotate(90deg)' : 'none' }} />}
                                                        <span style={{ fontSize: '0.9rem' }}>{group.icon || '📁'}</span>
                                                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: group.color || '#0f172a' }}>{group.name}</span>
                                                    </div>
                                                </td>
                                                <td><span style={{ fontWeight: 700, color: '#6366f1' }}>{group.count}</span></td>
                                                <td><span style={{ fontWeight: 700, color: group.calls > 0 ? '#059669' : '#d1d5db' }}>{group.calls}</span></td>
                                                <td><span style={{ fontWeight: 700, color: group.meetings > 0 ? '#0ea5e9' : '#d1d5db' }}>{group.meetings}</span></td>
                                                <td><span style={{ fontWeight: 700, color: group.appointments > 0 ? '#f97316' : '#d1d5db' }}>{group.appointments}</span></td>
                                                <td><span style={{ fontWeight: 700, color: group.proposals > 0 ? '#8b5cf6' : '#d1d5db' }}>{group.proposals}</span></td>
                                                <td><span style={{ fontWeight: 700, color: group.orders > 0 ? '#f59e0b' : '#d1d5db' }}>{group.orders}</span></td>
                                                <td><span style={{ fontWeight: 700, color: group.wonCount > 0 ? '#10b981' : '#d1d5db' }}>{group.wonCount}</span></td>
                                                <td><span style={{ fontWeight: 700, color: group.wonAmount > 0 ? '#10b981' : '#d1d5db' }}>{group.wonAmount ? formatCurrency(group.wonAmount) : '—'}</span></td>
                                            </tr>
                                            {isTopicExpanded && group.sources?.map((src, si) => (
                                                <tr key={`${gi}-src-${si}`} style={{ background: '#f8fafc', borderBottom: si < group.sources.length - 1 ? '1px solid #f1f5f9' : (gi < topicGroups.length - 1 ? '1px solid #e2e8f0' : 'none') }}>
                                                    <td style={{ paddingLeft: 48 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <Globe size={11} style={{ color: '#8b5cf6' }} />
                                                            <span style={{ fontWeight: 600, fontSize: '0.78rem', color: '#64748b' }}>{src.name}</span>
                                                        </div>
                                                    </td>
                                                    <td><span style={{ fontWeight: 600, fontSize: '0.78rem', color: '#6366f1' }}>{src.count}</span></td>
                                                    <td colSpan={5}></td>
                                                    <td><span style={{ fontWeight: 600, fontSize: '0.78rem', color: src.wonCount > 0 ? '#10b981' : '#d1d5db' }}>{src.wonCount}</span></td>
                                                    <td><span style={{ fontWeight: 600, fontSize: '0.78rem', color: src.wonAmount > 0 ? '#10b981' : '#d1d5db' }}>{src.wonAmount ? formatCurrency(src.wonAmount) : '—'}</span></td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    );
                                })}
                                <tr style={{ background: '#f0fdf4', fontWeight: 800 }}>
                                    <td style={{ color: '#059669' }}>Toplam</td>
                                    <td><span style={{ color: '#6366f1' }}>{topicGroups.reduce((s, g) => s + g.count, 0)}</span></td>
                                    <td><span style={{ color: '#059669' }}>{topicGroups.reduce((s, g) => s + g.calls, 0)}</span></td>
                                    <td><span style={{ color: '#0ea5e9' }}>{topicGroups.reduce((s, g) => s + g.meetings, 0)}</span></td>
                                    <td><span style={{ color: '#f97316' }}>{topicGroups.reduce((s, g) => s + g.appointments, 0)}</span></td>
                                    <td><span style={{ color: '#8b5cf6' }}>{topicGroups.reduce((s, g) => s + g.proposals, 0)}</span></td>
                                    <td><span style={{ color: '#f59e0b' }}>{topicGroups.reduce((s, g) => s + g.orders, 0)}</span></td>
                                    <td><span style={{ color: '#10b981' }}>{topicGroups.reduce((s, g) => s + g.wonCount, 0)}</span></td>
                                    <td><span style={{ color: '#10b981' }}>{formatCurrency(topicGroups.reduce((s, g) => s + g.wonAmount, 0))}</span></td>
                                </tr>
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* ═══ AKIŞ BAZLI TALEP RAPORU ═══ */}
            <div className="ceo-section" style={{ marginBottom: 24 }}>
                <div className="ceo-section-header">
                    <div className="ceo-section-icon" style={{ background: '#f5f3ff', color: '#8b5cf6' }}><Layers size={18} /></div>
                    <h2>Akış Bazlı Talep Raporu</h2>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', marginLeft: 'auto' }}>{funnelGroups.length} akış</span>
                </div>
                <div className="ceo-section-body" style={{ padding: 0 }}>
                    {funnelGroups.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '32px 20px', color: '#94a3b8' }}>
                            <Layers size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
                            <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>Akış verisi bulunamadı</p>
                        </div>
                    ) : funnelGroups.map((group, gi) => {
                        const isExpanded = expandedFunnels[group.name];
                        return (
                            <div key={gi} style={{ borderBottom: gi < funnelGroups.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                <div
                                    onClick={() => setExpandedFunnels(p => ({ ...p, [group.name]: !p[group.name] }))}
                                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', transition: 'background 0.15s' }}
                                    onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                >
                                    <ChevronRight size={14} style={{ color: '#94a3b8', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }} />
                                    <Layers size={16} style={{ color: '#8b5cf6' }} />
                                    <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a', flex: 1 }}>{group.name}</span>
                                    <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#8b5cf6' }}>{group.count}</span>
                                    {group.wonCount > 0 && (
                                        <span style={{ fontWeight: 700, fontSize: '0.7rem', color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: 6 }}>
                                            {group.wonCount} satış
                                        </span>
                                    )}
                                </div>
                                {isExpanded && group.stages && (
                                    <div style={{ padding: '4px 16px 12px 46px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {group.stages.map((s, i) => (
                                            <span key={i} style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                padding: '4px 10px', borderRadius: 8,
                                                background: `${s.color || '#64748b'}15`,
                                                fontSize: '0.75rem', fontWeight: 700, color: s.color || '#64748b'
                                            }}>
                                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color || '#64748b' }} />
                                                {s.name} <span style={{ fontWeight: 800, marginLeft: 2 }}>{s.count}</span>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
        </div>

            {/* ═══ KAYNAK BAZLI TALEP ANALİZİ ═══ */}
            <div className="ceo-section" style={{ marginBottom: 24, overflow: 'visible' }}>
                <div className="ceo-section-header">
                    <div className="ceo-section-icon" style={{ background: '#faf5ff', color: '#8b5cf6' }}><Globe size={18} /></div>
                    <h2>Kaynak Bazlı Talep Analizi</h2>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', marginLeft: 'auto' }}>{sourceGroups.length} kaynak</span>
                </div>
                <div className="ceo-section-body" style={{ padding: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    {sourceGroups.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '32px 20px', color: '#94a3b8' }}>
                            <Globe size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
                            <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>Kaynak verisi bulunamadı</p>
                        </div>
                    ) : (
                        <table className="ceo-league-table" style={{ minWidth: 800 }}>
                            <thead>
                                <tr>
                                    <th>Kaynak</th>
                                    <th>Talep</th>
                                    <th>Arama</th>
                                    <th>Görüşme</th>
                                    <th>Randevu</th>
                                    <th>Teklif</th>
                                    <th>Sipariş</th>
                                    <th>Satış</th>
                                    <th>Ciro</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sourceGroups.map((group, gi) => (
                                    <tr key={gi} style={{ borderBottom: gi < sourceGroups.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <Globe size={14} style={{ color: '#8b5cf6' }} />
                                                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a' }}>{group.name}</span>
                                            </div>
                                        </td>
                                        <td><span style={{ fontWeight: 700, color: '#6366f1' }}>{group.count}</span></td>
                                        <td><span style={{ fontWeight: 700, color: group.calls > 0 ? '#059669' : '#d1d5db' }}>{group.calls}</span></td>
                                        <td><span style={{ fontWeight: 700, color: group.meetings > 0 ? '#0ea5e9' : '#d1d5db' }}>{group.meetings}</span></td>
                                        <td><span style={{ fontWeight: 700, color: group.appointments > 0 ? '#f97316' : '#d1d5db' }}>{group.appointments}</span></td>
                                        <td><span style={{ fontWeight: 700, color: group.proposals > 0 ? '#8b5cf6' : '#d1d5db' }}>{group.proposals}</span></td>
                                        <td><span style={{ fontWeight: 700, color: group.orders > 0 ? '#f59e0b' : '#d1d5db' }}>{group.orders}</span></td>
                                        <td><span style={{ fontWeight: 700, color: group.wonCount > 0 ? '#10b981' : '#d1d5db' }}>{group.wonCount}</span></td>
                                        <td><span style={{ fontWeight: 700, color: group.wonAmount > 0 ? '#10b981' : '#d1d5db' }}>{group.wonAmount ? formatCurrency(group.wonAmount) : '—'}</span></td>
                                    </tr>
                                ))}
                                <tr style={{ background: '#faf5ff', fontWeight: 800 }}>
                                    <td style={{ color: '#8b5cf6' }}>Toplam</td>
                                    <td><span style={{ color: '#6366f1' }}>{sourceGroups.reduce((s, g) => s + g.count, 0)}</span></td>
                                    <td><span style={{ color: '#059669' }}>{sourceGroups.reduce((s, g) => s + g.calls, 0)}</span></td>
                                    <td><span style={{ color: '#0ea5e9' }}>{sourceGroups.reduce((s, g) => s + g.meetings, 0)}</span></td>
                                    <td><span style={{ color: '#f97316' }}>{sourceGroups.reduce((s, g) => s + g.appointments, 0)}</span></td>
                                    <td><span style={{ color: '#8b5cf6' }}>{sourceGroups.reduce((s, g) => s + g.proposals, 0)}</span></td>
                                    <td><span style={{ color: '#f59e0b' }}>{sourceGroups.reduce((s, g) => s + g.orders, 0)}</span></td>
                                    <td><span style={{ color: '#10b981' }}>{sourceGroups.reduce((s, g) => s + g.wonCount, 0)}</span></td>
                                    <td><span style={{ color: '#10b981' }}>{formatCurrency(sourceGroups.reduce((s, g) => s + g.wonAmount, 0))}</span></td>
                                </tr>
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RequestReport;
