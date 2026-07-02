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
import { getDateRangeLogic, dateFilterOptions } from '../../utils/dateFilters';

const TeamReport = () => {
    const { currentWorkspace } = useAuth();
    const navigate = useNavigate();
    const [agentPerformance, setAgentPerformance] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [sortBy, setSortBy] = useState('totalConversations');
    const [viewMode, setViewMode] = useState('team-grouped');

    const getDateRange = () => {
        return getDateRangeLogic(dateFilter, startDate, endDate);
    };

    useEffect(() => { fetchData(); }, [currentWorkspace?.id, dateFilter, startDate, endDate]);

    const agents = agentPerformance?.agents || [];
    const bots = agentPerformance?.bots || [];
    const teamTotals = agentPerformance?.teamTotals || {};

    const allMembers = [
        ...agents.map(a => ({ ...a, id: a.userId || a.id, isBot: false })),
        ...bots.map(b => ({
            ...b,
            id: b.botId || b.id,
            userId: b.botId || b.id,
            isBot: true,
            role: b.role || 'Yapay Zeka',
            avatar: null,
            resolvedConversations: b.resolvedConversations || 0,
            openConversations: b.openConversations || 0,
            messagesSent: b.messagesSent || 0,
            callCount: b.callCount || 0,
            meetingCount: b.meetingCount || 0,
            appointmentCount: b.appointmentCount || 0,
            dealQuotes: b.dealQuotes || 0,
            dealOrders: b.dealOrders || 0,
            dealTotalAmount: b.dealTotalAmount || 0,
            resolutionRate: b.resolutionRate || 0,
            avgResponseTime: b.avgResponseTime || b.avgResponseTimeMinutes || 0,
            teams: b.teams || []
        }))
    ];

    const sortedMembers = [...allMembers].sort((a, b) => {
        if (sortBy === 'dealOrders') return (b.dealOrders || 0) - (a.dealOrders || 0);
        if (sortBy === 'dealTotalAmount') return (b.dealTotalAmount || 0) - (a.dealTotalAmount || 0);
        if (sortBy === 'callCount') return (b.callCount || 0) - (a.callCount || 0);
        if (sortBy === 'resolutionRate') return (b.resolutionRate || 0) - (a.resolutionRate || 0);
        if (sortBy === 'avgResponseTime') {
            const timeA = a.avgResponseTime || a.avgResponseTimeMinutes || (a.isBot ? 0 : 999);
            const timeB = b.avgResponseTime || b.avgResponseTimeMinutes || (b.isBot ? 0 : 999);
            return timeA - timeB;
        }
        return (b.totalConversations || 0) - (a.totalConversations || 0);
    });

    // Group members by team
    const getGroupedTeams = () => {
        const teamsMap = {};
        const apiTeams = agentPerformance?.teams || [];
        
        apiTeams.forEach(t => {
            teamsMap[t.id] = {
                id: t.id,
                name: t.name,
                color: t.color,
                description: t.description,
                members: []
            };
        });
        
        const unassignedMembers = [];
        
        sortedMembers.forEach(member => {
            if (member.teams && member.teams.length > 0) {
                member.teams.forEach(t => {
                    if (!teamsMap[t.id]) {
                        teamsMap[t.id] = {
                            id: t.id,
                            name: t.name,
                            color: t.color || '#3b82f6',
                            description: '',
                            members: []
                        };
                    }
                    if (!teamsMap[t.id].members.some(m => m.userId === member.userId)) {
                        teamsMap[t.id].members.push(member);
                    }
                });
            } else {
                unassignedMembers.push(member);
            }
        });
        
        return {
            grouped: Object.values(teamsMap).filter(t => t.members.length > 0 || apiTeams.some(at => at.id === t.id)),
            unassigned: unassignedMembers
        };
    };

    const getTeamTotalsObj = (teamMembers) => {
        const totalConvs = teamMembers.reduce((s, m) => s + (m.totalConversations || 0), 0);
        const resolved = teamMembers.reduce((s, m) => s + (m.resolvedConversations || 0), 0);
        const open = teamMembers.reduce((s, m) => s + (m.openConversations || 0), 0);
        const msgs = teamMembers.reduce((s, m) => s + (m.messagesSent || 0), 0);
        const calls = teamMembers.reduce((s, m) => s + (m.callCount || 0), 0);
        const meetings = teamMembers.reduce((s, m) => s + (m.meetingCount || 0), 0);
        const appointments = teamMembers.reduce((s, m) => s + (m.appointmentCount || 0), 0);
        const quotes = teamMembers.reduce((s, m) => s + (m.dealQuotes || 0), 0);
        const orders = teamMembers.reduce((s, m) => s + (m.dealOrders || 0), 0);
        const totalAmount = teamMembers.reduce((s, m) => s + (m.dealTotalAmount || 0), 0);
        
        const avgResolution = teamMembers.length > 0
            ? Math.round(teamMembers.reduce((s, m) => s + (m.resolutionRate || 0), 0) / teamMembers.length)
            : 0;
            
        const membersWithResponse = teamMembers.filter(m => (m.avgResponseTime || m.avgResponseTimeMinutes || 0) > 0);
        const avgResponse = membersWithResponse.length > 0
            ? Math.round(membersWithResponse.reduce((s, m) => s + (m.avgResponseTime || m.avgResponseTimeMinutes || 0), 0) / membersWithResponse.length)
            : 0;

        return { totalConvs, resolved, open, msgs, calls, meetings, appointments, quotes, orders, totalAmount, avgResolution, avgResponse };
    };

    const renderAgentTable = (membersList, showMedals = false, isTeamTotal = false, teamTotalsObj = null) => {
        return (
            <table className="ceo-league-table">
                <thead>
                    <tr>
                        <th>Temsilci / Bot</th>
                        <th>Sohbet (Kişi)</th>
                        <th>Yazışma (Mesaj)</th>
                        <th>Arama</th>
                        <th>Görüşme</th>
                        <th>Randevu</th>
                        <th>Teklif</th>
                        <th>Sipariş</th>
                        <th>Ciro (Satış)</th>
                        <th>Çözüm %</th>
                        <th>Yanıt</th>
                    </tr>
                </thead>
                <tbody>
                    {membersList.map((member, idx) => (
                        <tr key={member.id || member.userId} className={showMedals ? getRowClass(idx) : ''}>
                            <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    {showMedals ? (
                                        <div className={`medal-badge ${getMedalClass(idx)}`}>{idx + 1}</div>
                                    ) : (
                                        <div style={{ width: 20, textAlign: 'center', fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</div>
                                    )}
                                    {member.isBot ? (
                                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(99, 102, 241, 0.2)' }}>
                                            <Bot size={16} color="#fff" />
                                        </div>
                                    ) : member.avatar ? (
                                        <img src={member.avatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                                    ) : (
                                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', color: '#6366f1' }}>{member.name?.charAt(0)}</div>
                                    )}
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>{member.name}</div>
                                            {member.isBot && (
                                                <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#8b5cf6', background: '#f5f3ff', padding: '1px 6px', borderRadius: 10, border: '1px solid #ddd6fe', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                                    <Bot size={8} /> Bot
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{member.isBot ? 'Yapay Zeka' : (member.role === 'OWNER' ? 'Yönetici' : 'Temsilci')}</div>
                                    </div>
                                </div>
                            </td>
                            <td><span style={{ fontWeight: 700, color: '#6366f1' }}>{member.totalConversations}</span></td>
                            <td><span style={{ fontWeight: 700 }}>{member.messagesSent || 0}</span></td>
                            <td><span style={{ fontWeight: 700, color: member.callCount > 0 ? '#059669' : '#d1d5db' }}>{member.callCount || 0}</span></td>
                            <td><span style={{ fontWeight: 700, color: member.meetingCount > 0 ? '#0ea5e9' : '#d1d5db' }}>{member.meetingCount || 0}</span></td>
                            <td><span style={{ fontWeight: 700, color: member.appointmentCount > 0 ? '#f97316' : '#d1d5db' }}>{member.appointmentCount || 0}</span></td>
                            <td><span style={{ fontWeight: 700, color: member.dealQuotes > 0 ? '#8b5cf6' : '#d1d5db' }}>{member.dealQuotes || 0}</span></td>
                            <td><span style={{ fontWeight: 700, color: member.dealOrders > 0 ? '#f59e0b' : '#d1d5db' }}>{member.dealOrders || 0}</span></td>
                            <td><span style={{ fontWeight: 700, color: member.dealTotalAmount > 0 ? '#10b981' : '#d1d5db' }}>{member.dealTotalAmount ? member.dealTotalAmount.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }) : '0 ₺'}</span></td>
                            <td>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                    <span style={{ fontWeight: 700, color: '#10b981', fontSize: '0.9rem' }}>{member.resolutionRate}%</span>
                                    <div style={{ height: 3, background: '#f1f5f9', borderRadius: 2, width: 40 }}><div style={{ height: '100%', background: '#10b981', borderRadius: 2, width: `${member.resolutionRate}%` }} /></div>
                                </div>
                            </td>
                            <td><span style={{ fontWeight: 600, color: '#64748b', fontSize: '0.82rem' }}>{member.avgResponseTime || member.avgResponseTimeMinutes || 0} dk</span></td>
                        </tr>
                    ))}
                    {isTeamTotal && teamTotalsObj && (
                        <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0', fontWeight: 'bold' }}>
                            <td>
                                <div style={{ fontWeight: 800, paddingLeft: 30, fontSize: '0.85rem', color: '#475569' }}>
                                    Takım Toplamı
                                </div>
                            </td>
                            <td><span style={{ fontWeight: 800, color: '#6366f1' }}>{teamTotalsObj.totalConvs}</span></td>
                            <td><span style={{ fontWeight: 800 }}>{teamTotalsObj.msgs}</span></td>
                            <td><span style={{ fontWeight: 800, color: '#059669' }}>{teamTotalsObj.calls}</span></td>
                            <td><span style={{ fontWeight: 800, color: '#0ea5e9' }}>{teamTotalsObj.meetings}</span></td>
                            <td><span style={{ fontWeight: 800, color: '#f97316' }}>{teamTotalsObj.appointments}</span></td>
                            <td><span style={{ fontWeight: 800, color: '#8b5cf6' }}>{teamTotalsObj.quotes}</span></td>
                            <td><span style={{ fontWeight: 800, color: '#f59e0b' }}>{teamTotalsObj.orders}</span></td>
                            <td><span style={{ fontWeight: 800, color: '#10b981' }}>{teamTotalsObj.totalAmount ? teamTotalsObj.totalAmount.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }) : '0 ₺'}</span></td>
                            <td>
                                <span style={{ fontWeight: 800, color: '#10b981' }}>{teamTotalsObj.avgResolution}%</span>
                            </td>
                            <td><span style={{ fontWeight: 800, color: '#64748b' }}>{teamTotalsObj.avgResponse} dk</span></td>
                        </tr>
                    )}
                </tbody>
            </table>
        );
    };

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

            {/* Team Summary */}
            <div className="ceo-detail-kpi-grid">
                <div className="ceo-detail-kpi-card"><div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #6366f1, #6366f188)' }} /><div className="kpi-icon-wrap" style={{ background: '#eef2ff', color: '#6366f1' }}><Users size={20} /></div><div className="kpi-label">Toplam Sohbet</div><div className="kpi-value">{teamTotals.totalConversations || agents.reduce((s, a) => s + (a.totalConversations || 0), 0)}</div></div>
                <div className="ceo-detail-kpi-card"><div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #10b981, #10b98188)' }} /><div className="kpi-icon-wrap" style={{ background: '#ecfdf5', color: '#10b981' }}><Users size={20} /></div><div className="kpi-label">Çözülen</div><div className="kpi-value">{teamTotals.resolvedConversations || agents.reduce((s, a) => s + (a.resolvedConversations || 0), 0)}</div></div>
                <div className="ceo-detail-kpi-card"><div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #3b82f6, #3b82f688)' }} /><div className="kpi-icon-wrap" style={{ background: '#eff6ff', color: '#3b82f6' }}><Users size={20} /></div><div className="kpi-label">Ort. Çözüm Oranı</div><div className="kpi-value">{teamTotals.avgResolutionRate || (agents.length > 0 ? (agents.reduce((s, a) => s + (a.resolutionRate || 0), 0) / agents.length).toFixed(0) : 0)}%</div></div>
                <div className="ceo-detail-kpi-card"><div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #f59e0b, #f59e0b88)' }} /><div className="kpi-icon-wrap" style={{ background: '#fef3c7', color: '#d97706' }}><Users size={20} /></div><div className="kpi-label">Ort. Yanıt Süresi</div><div className="kpi-value">{teamTotals.avgResponseTime || (agents.length > 0 ? (agents.reduce((s, a) => s + (a.avgResponseTime || a.avgResponseTimeMinutes || 0), 0) / agents.length).toFixed(0) : 0)} dk</div></div>
            </div>

            {/* Human League Table */}
            <div className="ceo-section" style={{ marginBottom: 20 }}>
                <div className="ceo-section-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="ceo-section-icon" style={{ background: '#eff6ff', color: '#3b82f6' }}><UserCheck size={18} /></div>
                        <h2>Temsilci Performans Raporu</h2>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {/* View Mode Switcher */}
                        <div className="ceo-pill-group" style={{ margin: 0, padding: 2, background: '#f1f5f9', borderRadius: 8, display: 'flex', gap: 2 }}>
                            <button 
                                className={`ceo-pill ${viewMode === 'team-grouped' ? 'active' : ''}`} 
                                onClick={() => setViewMode('team-grouped')}
                                style={{ 
                                    padding: '4px 10px', 
                                    fontSize: 11, 
                                    border: 'none', 
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    background: viewMode === 'team-grouped' ? '#fff' : 'transparent', 
                                    color: viewMode === 'team-grouped' ? '#1e293b' : '#64748b',
                                    boxShadow: viewMode === 'team-grouped' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' 
                                }}
                            >
                                Takımlara Göre
                            </button>
                            <button 
                                className={`ceo-pill ${viewMode === 'flat' ? 'active' : ''}`} 
                                onClick={() => setViewMode('flat')}
                                style={{ 
                                    padding: '4px 10px', 
                                    fontSize: 11, 
                                    border: 'none', 
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    background: viewMode === 'flat' ? '#fff' : 'transparent', 
                                    color: viewMode === 'flat' ? '#1e293b' : '#64748b',
                                    boxShadow: viewMode === 'flat' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' 
                                }}
                            >
                                Genel Sıralama
                            </button>
                        </div>

                        <select className="ceo-sort-select" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ height: 32, padding: '0 8px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                            <option value="totalConversations">Sohbet</option>
                            <option value="dealOrders">Sipariş</option>
                            <option value="dealTotalAmount">Ciro</option>
                            <option value="callCount">Arama</option>
                            <option value="resolutionRate">Çözüm %</option>
                            <option value="avgResponseTime">Yanıt Süresi</option>
                        </select>
                    </div>
                </div>
                <div className="ceo-section-body" style={{ padding: viewMode === 'team-grouped' ? '20px' : 0, background: viewMode === 'team-grouped' ? '#f8fafc' : '#fff' }}>
                    {viewMode === 'team-grouped' ? (
                        (() => {
                            const { grouped, unassigned } = getGroupedTeams();
                            return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                                    {grouped.map(t => {
                                        const tTotals = getTeamTotalsObj(t.members);
                                        return (
                                            <div key={t.id} className="ceo-team-section-card" style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: `${t.color}0a`, borderBottom: '1px solid #e2e8f0' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <span style={{ width: 12, height: 12, borderRadius: '50%', background: t.color || '#3b82f6', display: 'inline-block' }} />
                                                        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>{t.name}</h3>
                                                        {t.description && <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>— {t.description}</span>}
                                                    </div>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', background: '#f1f5f9', padding: '2px 8px', borderRadius: 12 }}>
                                                        {t.members.length} Üye (Temsilci/Bot)
                                                    </span>
                                                </div>
                                                <div style={{ overflowX: 'auto' }}>
                                                    {t.members.length > 0 ? (
                                                        renderAgentTable(t.members, false, true, tTotals)
                                                    ) : (
                                                        <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>Bu takımda henüz üye yok</div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    
                                    {unassigned.length > 0 && (
                                        <div className="ceo-team-section-card" style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#94a3b8', display: 'inline-block' }} />
                                                    <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>Takımsız / Diğer Temsilciler ve Botlar</h3>
                                                </div>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', background: '#f1f5f9', padding: '2px 8px', borderRadius: 12 }}>
                                                    {unassigned.length} Üye
                                                </span>
                                            </div>
                                            <div style={{ overflowX: 'auto' }}>
                                                {renderAgentTable(unassigned, false, true, getTeamTotalsObj(unassigned))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            {renderAgentTable(sortedMembers, true)}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TeamReport;
