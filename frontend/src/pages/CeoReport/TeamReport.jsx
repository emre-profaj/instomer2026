import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Users, UserCheck, RefreshCw, Filter, ArrowLeft,
    PhoneCall, Handshake, Calendar, MessageSquare, ListChecks,
    ShoppingCart, DollarSign, Bot, ChevronDown
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { contactAPI } from '../../services/api';
import './CeoReport.css';
import './CeoDetailReport.css';

const TeamReport = () => {
    const { currentWorkspace } = useAuth();
    const navigate = useNavigate();
    const [agentPerformance, setAgentPerformance] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [sortBy, setSortBy] = useState('totalConversations');

    const getDateRange = () => {
        const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const now = new Date();
        if (dateFilter === 'today') return { startDate: toDateStr(now), endDate: toDateStr(now) };
        if (dateFilter === 'yesterday') { const y = new Date(now); y.setDate(now.getDate()-1); return { startDate: toDateStr(y), endDate: toDateStr(y) }; }
        if (dateFilter === '7d') { const day = now.getDay(); const diff = day === 0 ? 6 : day - 1; const mon = new Date(now); mon.setDate(mon.getDate()-diff); const sun = new Date(mon); sun.setDate(sun.getDate()+6); return { startDate: toDateStr(mon), endDate: toDateStr(sun) }; }
        if (dateFilter === '30d') { const first = new Date(now.getFullYear(), now.getMonth(), 1); const last = new Date(now.getFullYear(), now.getMonth()+1, 0); return { startDate: toDateStr(first), endDate: toDateStr(last) }; }
        if (dateFilter === 'custom' && startDate) return { startDate, endDate };
        return {};
    };

    const fetchData = async () => {
        if (!currentWorkspace?.id) return;
        setLoading(true);
        try {
            const params = getDateRange();
            const res = await contactAPI.getAgentPerformance(currentWorkspace.id, params);
            setAgentPerformance(res.data);
        } catch (err) {
            console.error('Team report fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [currentWorkspace?.id, dateFilter, startDate, endDate]);

    const agents = agentPerformance?.agents || [];
    const bots = agentPerformance?.bots || [];
    const teamTotals = agentPerformance?.teamTotals || {};

    const sortedAgents = [...agents].sort((a, b) => {
        if (sortBy === 'dealOrders') return (b.dealOrders || 0) - (a.dealOrders || 0);
        if (sortBy === 'dealTotalAmount') return (b.dealTotalAmount || 0) - (a.dealTotalAmount || 0);
        if (sortBy === 'callCount') return (b.callCount || 0) - (a.callCount || 0);
        if (sortBy === 'resolutionRate') return (b.resolutionRate || 0) - (a.resolutionRate || 0);
        if (sortBy === 'avgResponseTime') return (a.avgResponseTime || a.avgResponseTimeMinutes || 999) - (b.avgResponseTime || b.avgResponseTimeMinutes || 999);
        return (b.totalConversations || 0) - (a.totalConversations || 0);
    });

    const getMedalClass = (idx) => idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : 'default';
    const getRowClass = (idx) => idx === 0 ? 'gold-row' : idx === 1 ? 'silver-row' : idx === 2 ? 'bronze-row' : '';

    if (loading && !agentPerformance) {
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
            <button className="ceo-back-btn" onClick={() => navigate('/ceo-report')}><ArrowLeft size={16} /> Dashboard</button>

            <div className="ceo-detail-header">
                <div className="ceo-detail-header-left">
                    <h1><UserCheck size={24} style={{ color: '#3b82f6' }} /> Takım Performansı</h1>
                    <p>Temsilci ve yapay zeka performans lig tablosu</p>
                </div>
                <button className="ceo-refresh-btn" onClick={fetchData}><RefreshCw size={14} /> Güncelle</button>
            </div>

            {/* Filters */}
            <div className="ceo-filter-bar">
                <div className="ceo-filter-left">
                    <div className="ceo-filter-label"><Filter size={14} /><span>Filtreler</span></div>
                    <div className="ceo-pill-group">
                        {[{ key: 'all', label: 'Tümü' }, { key: 'today', label: 'Bugün' }, { key: 'yesterday', label: 'Dün' }, { key: '7d', label: 'Bu Hafta' }, { key: '30d', label: 'Bu Ay' }, { key: 'custom', label: '📅 Özel' }].map(item => (
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

            {/* Team Summary */}
            <div className="ceo-detail-kpi-grid">
                <div className="ceo-detail-kpi-card"><div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #6366f1, #6366f188)' }} /><div className="kpi-icon-wrap" style={{ background: '#eef2ff', color: '#6366f1' }}><Users size={20} /></div><div className="kpi-label">Toplam Sohbet</div><div className="kpi-value">{teamTotals.totalConversations || agents.reduce((s, a) => s + (a.totalConversations || 0), 0)}</div></div>
                <div className="ceo-detail-kpi-card"><div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #10b981, #10b98188)' }} /><div className="kpi-icon-wrap" style={{ background: '#ecfdf5', color: '#10b981' }}><Users size={20} /></div><div className="kpi-label">Çözülen</div><div className="kpi-value">{teamTotals.resolvedConversations || agents.reduce((s, a) => s + (a.resolvedConversations || 0), 0)}</div></div>
                <div className="ceo-detail-kpi-card"><div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #3b82f6, #3b82f688)' }} /><div className="kpi-icon-wrap" style={{ background: '#eff6ff', color: '#3b82f6' }}><Users size={20} /></div><div className="kpi-label">Ort. Çözüm Oranı</div><div className="kpi-value">{teamTotals.avgResolutionRate || (agents.length > 0 ? (agents.reduce((s, a) => s + (a.resolutionRate || 0), 0) / agents.length).toFixed(0) : 0)}%</div></div>
                <div className="ceo-detail-kpi-card"><div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #f59e0b, #f59e0b88)' }} /><div className="kpi-icon-wrap" style={{ background: '#fef3c7', color: '#d97706' }}><Users size={20} /></div><div className="kpi-label">Ort. Yanıt Süresi</div><div className="kpi-value">{teamTotals.avgResponseTime || (agents.length > 0 ? (agents.reduce((s, a) => s + (a.avgResponseTime || a.avgResponseTimeMinutes || 0), 0) / agents.length).toFixed(0) : 0)} dk</div></div>
            </div>

            {/* Human League Table */}
            <div className="ceo-section" style={{ marginBottom: 20 }}>
                <div className="ceo-section-header" style={{ justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="ceo-section-icon" style={{ background: '#eff6ff', color: '#3b82f6' }}><UserCheck size={18} /></div>
                        <h2>Temsilci Lig Tablosu</h2>
                    </div>
                    <select className="ceo-sort-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                        <option value="totalConversations">Sohbet</option>
                        <option value="dealOrders">Sipariş</option>
                        <option value="dealTotalAmount">Ciro</option>
                        <option value="callCount">Arama</option>
                        <option value="resolutionRate">Çözüm %</option>
                        <option value="avgResponseTime">Yanıt Süresi</option>
                    </select>
                </div>
                <div className="ceo-section-body" style={{ padding: 0, overflowX: 'auto' }}>
                    <table className="ceo-league-table">
                        <thead>
                            <tr>
                                <th>Temsilci</th>
                                <th>Sohbet</th>
                                <th>Çözülen</th>
                                <th>Açık</th>
                                <th>Mesaj</th>
                                <th>Arama</th>
                                <th>Görüşme</th>
                                <th>Randevu</th>
                                <th>Teklif</th>
                                <th>Sipariş</th>
                                <th>Çözüm</th>
                                <th>Yanıt</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedAgents.map((agent, idx) => (
                                <tr key={agent.id || agent.userId} className={getRowClass(idx)}>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div className={`medal-badge ${getMedalClass(idx)}`}>{idx + 1}</div>
                                            {agent.avatar ? (
                                                <img src={agent.avatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                                            ) : (
                                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', color: '#6366f1' }}>{agent.name?.charAt(0)}</div>
                                            )}
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>{agent.name}</div>
                                                <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{agent.role === 'OWNER' ? 'Yönetici' : 'Temsilci'}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td><span style={{ fontWeight: 700, color: '#6366f1' }}>{agent.totalConversations}</span></td>
                                    <td><span style={{ fontWeight: 700, color: '#10b981' }}>{agent.resolvedConversations || 0}</span></td>
                                    <td><span style={{ fontWeight: 700, color: agent.openConversations > 0 ? '#f59e0b' : '#d1d5db' }}>{agent.openConversations ?? 0}</span></td>
                                    <td><span style={{ fontWeight: 700 }}>{agent.messagesSent || 0}</span></td>
                                    <td><span style={{ fontWeight: 700, color: agent.callCount > 0 ? '#059669' : '#d1d5db' }}>{agent.callCount || 0}</span></td>
                                    <td><span style={{ fontWeight: 700, color: agent.meetingCount > 0 ? '#0ea5e9' : '#d1d5db' }}>{agent.meetingCount || 0}</span></td>
                                    <td><span style={{ fontWeight: 700, color: agent.appointmentCount > 0 ? '#f97316' : '#d1d5db' }}>{agent.appointmentCount || 0}</span></td>
                                    <td><span style={{ fontWeight: 700, color: agent.dealQuotes > 0 ? '#8b5cf6' : '#d1d5db' }}>{agent.dealQuotes || 0}</span></td>
                                    <td><span style={{ fontWeight: 700, color: agent.dealOrders > 0 ? '#f59e0b' : '#d1d5db' }}>{agent.dealOrders || 0}</span></td>
                                    <td>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                            <span style={{ fontWeight: 700, color: '#10b981', fontSize: '0.9rem' }}>{agent.resolutionRate}%</span>
                                            <div style={{ height: 3, background: '#f1f5f9', borderRadius: 2, width: 40 }}><div style={{ height: '100%', background: '#10b981', borderRadius: 2, width: `${agent.resolutionRate}%` }} /></div>
                                        </div>
                                    </td>
                                    <td><span style={{ fontWeight: 600, color: '#64748b', fontSize: '0.82rem' }}>{agent.avgResponseTime || agent.avgResponseTimeMinutes || 0} dk</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Bot Table */}
            {bots.length > 0 && (
                <div className="ceo-section" style={{ marginBottom: 20 }}>
                    <div className="ceo-section-header">
                        <div className="ceo-section-icon" style={{ background: '#f5f3ff', color: '#8b5cf6' }}><Bot size={18} /></div>
                        <h2>Yapay Zeka Asistanları</h2>
                    </div>
                    <div className="ceo-section-body" style={{ padding: 0, overflowX: 'auto' }}>
                        <table className="ceo-league-table">
                            <thead>
                                <tr>
                                    <th>Bot</th>
                                    <th>Sohbet</th>
                                    <th>Çözülen</th>
                                    <th>Mesaj</th>
                                    <th>Çözüm</th>
                                </tr>
                            </thead>
                            <tbody>
                                {bots.map(bot => (
                                    <tr key={bot.botId || bot.id}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Bot size={16} color="#fff" />
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>{bot.name}</div>
                                                    <div style={{ fontSize: '0.65rem', color: '#8b5cf6' }}>Yapay Zeka</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td><span style={{ fontWeight: 700, color: '#6366f1' }}>{bot.totalConversations || 0}</span></td>
                                        <td><span style={{ fontWeight: 700, color: '#10b981' }}>{bot.resolvedConversations || 0}</span></td>
                                        <td><span style={{ fontWeight: 700 }}>{bot.messagesSent || 0}</span></td>
                                        <td><span style={{ fontWeight: 700, color: '#10b981' }}>{bot.resolutionRate || 0}%</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TeamReport;
