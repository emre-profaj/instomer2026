import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    BarChart3, RefreshCw, Filter, ArrowLeft, Users, Phone,
    Sparkles, ChevronDown, ChevronRight, Search, X, Download, ShoppingCart
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { contactAPI } from '../../services/api';
import './CeoReport.css';
import './CeoDetailReport.css';
import { getDateRangeLogic, dateFilterOptions } from '../../utils/dateFilters';

const AnalysisReport = () => {
    const { currentWorkspace } = useAuth();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState(() => sessionStorage.getItem('reportDateFilter') || '30d');
    const [startDate, setStartDate] = useState(() => sessionStorage.getItem('reportStartDate') || '');
    const [endDate, setEndDate] = useState(() => sessionStorage.getItem('reportEndDate') || '');
    const [agentFilter, setAgentFilter] = useState('');
    const [topicFilter, setTopicFilter] = useState('');
    const [stageFilter, setStageFilter] = useState('');
    const [expandedAgents, setExpandedAgents] = useState(new Set());
    const [showContacts, setShowContacts] = useState(true);
    const [contactSearch, setContactSearch] = useState('');
    const [kpiFilter, setKpiFilter] = useState(null);
    const [salesSearch, setSalesSearch] = useState('');
    const [viewMode, setViewMode] = useState('byAgent'); // 'byAgent' | 'byTopic'
    const [expandedTopics, setExpandedTopics] = useState(new Set()); // for drill-down

    useEffect(() => {
        sessionStorage.setItem('reportDateFilter', dateFilter);
        sessionStorage.setItem('reportStartDate', startDate);
        sessionStorage.setItem('reportEndDate', endDate);
    }, [dateFilter, startDate, endDate]);

    const fetchData = async () => {
        if (!currentWorkspace?.id) return;
        setLoading(true);
        try {
            const dateParams = getDateRangeLogic(dateFilter, startDate, endDate);
            const params = { ...dateParams };
            if (agentFilter) params.agentId = agentFilter;
            if (topicFilter) params.topic = topicFilter;
            if (stageFilter) params.stageId = stageFilter;
            const res = await contactAPI.getAnalysis(currentWorkspace.id, params);
            setData(res.data);
        } catch (error) {
            console.error('Analysis report error:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [currentWorkspace?.id, dateFilter, startDate, endDate, agentFilter, topicFilter, stageFilter]);

    const summary = data?.summary || {};
    const pivotData = data?.pivotData || [];
    const agentSummaries = data?.agentSummaries || [];
    const contacts = data?.contacts || [];
    const salesList = data?.salesList || [];
    const filters = data?.filters || { agents: [], topics: [], stages: [] };

    // Toggle agent expansion
    const toggleAgent = (agentId) => {
        setExpandedAgents(prev => {
            const next = new Set(prev);
            next.has(agentId) ? next.delete(agentId) : next.add(agentId);
            return next;
        });
    };

    // Group pivot data by agent
    const agentGroups = {};
    for (const row of pivotData) {
        if (!agentGroups[row.agentId]) agentGroups[row.agentId] = [];
        agentGroups[row.agentId].push(row);
    }

    // Group pivot data by topic (for byTopic view)
    const topicGroups = {};
    for (const row of pivotData) {
        if (!topicGroups[row.topic]) topicGroups[row.topic] = { topic: row.topic, totalCount: 0, wonCount: 0, wonAmount: 0, agents: [], stages: {} };
        const tg = topicGroups[row.topic];
        tg.totalCount += row.count;
        tg.wonCount += (row.wonCount || 0);
        tg.wonAmount += (row.wonAmount || 0);
        tg.agents.push({ agentId: row.agentId, agentName: row.agentName, count: row.count, wonCount: row.wonCount || 0, wonAmount: row.wonAmount || 0 });
        for (const [sName, sData] of Object.entries(row.stages || {})) {
            if (!tg.stages[sName]) tg.stages[sName] = { count: 0, color: sData.color };
            tg.stages[sName].count += sData.count;
        }
    }
    const topicSummaries = Object.values(topicGroups).sort((a, b) => b.totalCount - a.totalCount);

    // Toggle topic expansion for drill-down
    const toggleTopicExpand = (key) => {
        setExpandedTopics(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    };

    // Get contacts for a specific agent+topic or just topic
    const getContactsForFilter = (agentId, topic) => {
        return contacts.filter(c => {
            if (agentId && c.assigneeId !== agentId && !(agentId === '__unassigned' && !c.assigneeId)) return false;
            if (topic && c.topic !== topic) return false;
            return true;
        });
    };

    // Filter contacts by KPI + search
    const relevantStatusList = ['OPPORTUNITY', 'HOT_OPPORTUNITY', 'MEETING_PLANNED', 'PROPOSAL', 'CONVERTED'];
    let kpiFiltered = contacts;
    if (kpiFilter === 'withPhone') kpiFiltered = contacts.filter(c => c.phone && c.phone.trim());
    else if (kpiFilter === 'noPhone') kpiFiltered = contacts.filter(c => !c.phone || !c.phone.trim());
    else if (kpiFilter === 'interested') kpiFiltered = contacts.filter(c => relevantStatusList.includes(c.status));
    else if (kpiFilter === 'won') kpiFiltered = contacts.filter(c => c.dealTotal > 0);

    const filteredContacts = contactSearch
        ? kpiFiltered.filter(c =>
            (c.name || '').toLowerCase().includes(contactSearch.toLowerCase()) ||
            (c.phone || '').includes(contactSearch) ||
            (c.topic || '').toLowerCase().includes(contactSearch.toLowerCase()) ||
            (c.assigneeName || '').toLowerCase().includes(contactSearch.toLowerCase())
        )
        : kpiFiltered;

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

    if (loading && !data) {
        return (
            <div className="ceo-report" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                <div style={{ textAlign: 'center', color: '#64748b' }}>
                    <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
                    <p>Analiz yükleniyor...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="ceo-report">
            <button className="ceo-back-btn" onClick={() => navigate('/general-report')}><ArrowLeft size={16} /> Dashboard</button>

            <div className="ceo-detail-header">
                <div className="ceo-detail-header-left">
                    <h1><BarChart3 size={24} style={{ color: '#8b5cf6' }} /> Analiz</h1>
                    <p>Temsilci × Konu × Aşama kırılımlı detaylı analiz</p>
                </div>
                <button className="ceo-refresh-btn" onClick={fetchData}><RefreshCw size={14} /> Güncelle</button>
            </div>

            {/* Filters */}
            <div className="ceo-filter-bar">
                <div className="ceo-filter-left" style={{ flexWrap: 'wrap', gap: 12 }}>
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

            {/* Dimension Filters */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '0 0 20px' }}>
                <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 260 }}>
                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Temsilci</label>
                    <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.85rem', fontWeight: 600, color: '#1e293b', background: agentFilter ? '#f0f9ff' : '#fff', cursor: 'pointer' }}>
                        <option value="">Tüm Temsilciler</option>
                        {filters.agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                </div>
                <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 260 }}>
                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Konu Grubu</label>
                    <select value={topicFilter} onChange={e => setTopicFilter(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.85rem', fontWeight: 600, color: '#1e293b', background: topicFilter ? '#faf5ff' : '#fff', cursor: 'pointer' }}>
                        <option value="">Tüm Konular</option>
                        {filters.topics.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 260 }}>
                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Aşama</label>
                    <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.85rem', fontWeight: 600, color: '#1e293b', background: stageFilter ? '#ecfdf5' : '#fff', cursor: 'pointer' }}>
                        <option value="">Tüm Aşamalar</option>
                        {filters.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
                {(agentFilter || topicFilter || stageFilter) && (
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <button onClick={() => { setAgentFilter(''); setTopicFilter(''); setStageFilter(''); }}
                            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <X size={14} /> Temizle
                        </button>
                    </div>
                )}
            </div>

            {/* KPI Summary - Clickable */}
            {kpiFilter && (
                <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6366f1' }}>
                        Filtre: {kpiFilter === 'withPhone' ? 'Numaralı' : kpiFilter === 'noPhone' ? 'Numarasız' : kpiFilter === 'interested' ? 'İlgili / Potansiyel' : 'Satış Yapılan'} ({filteredContacts.length} kişi)
                    </span>
                    <button onClick={() => setKpiFilter(null)} style={{ border: 'none', background: '#fef2f2', color: '#dc2626', fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, cursor: 'pointer' }}>✕ Kaldır</button>
                </div>
            )}
            <div className="ceo-detail-kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                <div className="ceo-detail-kpi-card" onClick={() => setKpiFilter(null)} style={{ cursor: 'pointer', outline: !kpiFilter ? '2px solid #6366f1' : 'none', outlineOffset: -2 }}><div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #6366f1, #6366f188)' }} /><div className="kpi-icon-wrap" style={{ background: '#eef2ff', color: '#6366f1' }}><Users size={20} /></div><div className="kpi-label">Toplam Kişi</div><div className="kpi-value">{summary.totalCount || 0}</div></div>
                <div className="ceo-detail-kpi-card" onClick={() => setKpiFilter(kpiFilter === 'withPhone' ? null : 'withPhone')} style={{ cursor: 'pointer', outline: kpiFilter === 'withPhone' ? '2px solid #0ea5e9' : 'none', outlineOffset: -2 }}><div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #0ea5e9, #0ea5e988)' }} /><div className="kpi-icon-wrap" style={{ background: '#e0f2fe', color: '#0ea5e9' }}><Phone size={20} /></div><div className="kpi-label">Numaralı</div><div className="kpi-value">{summary.withPhone || 0}</div></div>
                <div className="ceo-detail-kpi-card" onClick={() => setKpiFilter(kpiFilter === 'interested' ? null : 'interested')} style={{ cursor: 'pointer', outline: kpiFilter === 'interested' ? '2px solid #f59e0b' : 'none', outlineOffset: -2 }}><div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #f59e0b, #f59e0b88)' }} /><div className="kpi-icon-wrap" style={{ background: '#fef3c7', color: '#d97706' }}><Sparkles size={20} /></div><div className="kpi-label">İlgili / Potansiyel</div><div className="kpi-value">{summary.interested || 0}</div></div>
                <div className="ceo-detail-kpi-card" onClick={() => setKpiFilter(kpiFilter === 'won' ? null : 'won')} style={{ cursor: 'pointer', outline: kpiFilter === 'won' ? '2px solid #10b981' : 'none', outlineOffset: -2 }}><div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #10b981, #10b98188)' }} /><div className="kpi-icon-wrap" style={{ background: '#ecfdf5', color: '#10b981' }}><BarChart3 size={20} /></div><div className="kpi-label">Satış</div><div className="kpi-value">{summary.wonCount || 0}</div></div>
                <div className="ceo-detail-kpi-card"><div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #059669, #05966988)' }} /><div className="kpi-icon-wrap" style={{ background: '#d1fae5', color: '#059669' }}><BarChart3 size={20} /></div><div className="kpi-label">Ciro</div><div className="kpi-value" style={{ fontSize: '1rem' }}>{(summary.wonAmount || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })}</div></div>
            </div>

            {/* Temsilci / Konu Pivot Table */}
            <div className="ceo-section" style={{ marginBottom: 20 }}>
                <div className="ceo-section-header" style={{ justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="ceo-section-icon" style={{ background: '#f5f3ff', color: '#8b5cf6' }}><BarChart3 size={18} /></div>
                        <h2>{viewMode === 'byAgent' ? 'Temsilciye Göre' : 'Konuya Göre'}</h2>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 10 }}>
                            {viewMode === 'byAgent' ? `${agentSummaries.length} temsilci` : `${topicSummaries.length} konu`}
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 8, padding: 2 }}>
                        <button onClick={() => { setViewMode('byAgent'); setExpandedAgents(new Set()); setExpandedTopics(new Set()); }}
                            style={{ border: 'none', padding: '6px 14px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                                background: viewMode === 'byAgent' ? '#fff' : 'transparent', color: viewMode === 'byAgent' ? '#6366f1' : '#64748b',
                                boxShadow: viewMode === 'byAgent' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                            Temsilciye Göre
                        </button>
                        <button onClick={() => { setViewMode('byTopic'); setExpandedAgents(new Set()); setExpandedTopics(new Set()); }}
                            style={{ border: 'none', padding: '6px 14px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                                background: viewMode === 'byTopic' ? '#fff' : 'transparent', color: viewMode === 'byTopic' ? '#8b5cf6' : '#64748b',
                                boxShadow: viewMode === 'byTopic' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                            Konuya Göre
                        </button>
                    </div>
                </div>
                <div className="ceo-section-body" style={{ padding: 0 }}>
                    {/* ═══ BY AGENT VIEW ═══ */}
                    {viewMode === 'byAgent' && (
                        agentSummaries.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}><BarChart3 size={28} style={{ marginBottom: 8 }} /><p>Veri bulunamadı</p></div>
                        ) : (
                            <div>
                                {agentSummaries.map((agent) => {
                                    const isExpanded = expandedAgents.has(agent.agentId);
                                    const agentTopics = agentGroups[agent.agentId] || [];
                                    const agentContacts = contacts.filter(c => c.assigneeId === agent.agentId || (agent.agentId === '__unassigned' && !c.assigneeId));
                                    const withPhone = agentContacts.filter(c => c.phone && c.phone.trim()).length;
                                    return (
                                        <div key={agent.agentId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                            <div onClick={() => toggleAgent(agent.agentId)}
                                                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', cursor: 'pointer', background: isExpanded ? '#f8fafc' : '#fff', transition: 'background 0.15s' }}>
                                                <ChevronRight size={16} style={{ color: '#94a3b8', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
                                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.8rem', color: '#6366f1', flexShrink: 0 }}>
                                                    {agent.agentName?.charAt(0) || '?'}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#1e293b' }}>{agent.agentName}</div>
                                                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 500 }}>{agent.topicCount} konu · {withPhone} numaralı</div>
                                                </div>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#6366f1' }}>{agent.totalCount}</span>
                                                    {(agent.wonCount > 0) && (
                                                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#10b981', background: '#ecfdf5', padding: '2px 8px', borderRadius: 6 }}>
                                                            {agent.wonCount} satış · {(agent.wonAmount || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {isExpanded && (
                                                <div style={{ padding: '0 20px 16px 60px' }}>
                                                    {agentTopics.map((row) => {
                                                        const topicKey = `${agent.agentId}|||${row.topic}`;
                                                        const isTopicOpen = expandedTopics.has(topicKey);
                                                        const topicContacts = getContactsForFilter(agent.agentId, row.topic);
                                                        const rowStages = Object.entries(row.stages || {}).sort((a, b) => b[1].count - a[1].count);
                                                        return (
                                                            <div key={row.topic} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                <div onClick={() => toggleTopicExpand(topicKey)}
                                                                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px', cursor: 'pointer', background: isTopicOpen ? '#faf5ff' : 'transparent', borderRadius: 6, transition: 'background 0.15s' }}>
                                                                    <ChevronRight size={14} style={{ color: '#94a3b8', transform: isTopicOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
                                                                    <span style={{ fontWeight: 700, color: '#1e293b', flex: 1, fontSize: '0.85rem' }}>{row.topic}</span>
                                                                    <span style={{ fontWeight: 800, color: '#6366f1', fontSize: '0.85rem' }}>{row.count}</span>
                                                                    {row.wonCount > 0 && <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10b981', background: '#ecfdf5', padding: '1px 6px', borderRadius: 5 }}>{row.wonCount} satış</span>}
                                                                    {rowStages.slice(0, 3).map(([sName, sData]) => (
                                                                        <span key={sName} style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 6px', borderRadius: 5, background: `${sData.color || '#94a3b8'}15`, color: sData.color || '#94a3b8' }}>
                                                                            {sName}: {sData.count}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                                {isTopicOpen && topicContacts.length > 0 && (
                                                                    <div style={{ padding: '4px 0 12px 28px' }}>
                                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                                                            <thead><tr style={{ background: '#f1f5f9' }}>
                                                                                <th style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>İsim</th>
                                                                                <th style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Telefon</th>
                                                                                <th style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Durum</th>
                                                                                <th style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Aşama</th>
                                                                                <th style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Satış</th>
                                                                            </tr></thead>
                                                                            <tbody>
                                                                                {topicContacts.map((c, ci) => (
                                                                                    <tr key={c.id || ci} style={{ borderBottom: '1px solid #f8fafc' }}>
                                                                                        <td style={{ padding: '5px 8px', fontWeight: 600, color: '#1e293b' }}>{c.name}</td>
                                                                                        <td style={{ padding: '5px 8px', color: '#475569' }}>{c.phone || '—'}</td>
                                                                                        <td style={{ padding: '5px 8px' }}><span style={{ padding: '1px 6px', borderRadius: 5, fontSize: '0.7rem', fontWeight: 700, background: `${statusColors[c.status] || '#94a3b8'}15`, color: statusColors[c.status] || '#94a3b8' }}>{statusLabels[c.status] || c.status}</span></td>
                                                                                        <td style={{ padding: '5px 8px' }}>{c.stageName ? <span style={{ padding: '1px 6px', borderRadius: 5, fontSize: '0.7rem', fontWeight: 700, background: `${c.stageColor || '#64748b'}15`, color: c.stageColor || '#64748b' }}>{c.stageName}</span> : '—'}</td>
                                                                                        <td style={{ padding: '5px 8px' }}>{c.dealTotal > 0 ? <span style={{ fontWeight: 800, color: '#059669', fontSize: '0.72rem' }}>✓ {(c.dealWonAmount || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })}</span> : '—'}</td>
                                                                                    </tr>
                                                                                ))}
                                                                            </tbody>
                                                                        </table>
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
                        )
                    )}

                    {/* ═══ BY TOPIC VIEW ═══ */}
                    {viewMode === 'byTopic' && (
                        topicSummaries.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}><BarChart3 size={28} style={{ marginBottom: 8 }} /><p>Veri bulunamadı</p></div>
                        ) : (
                            <div>
                                {topicSummaries.map((tg) => {
                                    const isExpanded = expandedTopics.has(tg.topic);
                                    const topicContacts = contacts.filter(c => c.topic === tg.topic);
                                    const tStages = Object.entries(tg.stages || {}).sort((a, b) => b[1].count - a[1].count);
                                    return (
                                        <div key={tg.topic} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                            <div onClick={() => toggleTopicExpand(tg.topic)}
                                                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', cursor: 'pointer', background: isExpanded ? '#faf5ff' : '#fff', transition: 'background 0.15s' }}>
                                                <ChevronRight size={16} style={{ color: '#94a3b8', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
                                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.7rem', color: '#8b5cf6', flexShrink: 0 }}>
                                                    {tg.topic?.charAt(0) || '?'}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#1e293b' }}>{tg.topic}</div>
                                                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 500 }}>{tg.agents.length} temsilci</div>
                                                </div>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#8b5cf6' }}>{tg.totalCount}</span>
                                                    {tg.wonCount > 0 && (
                                                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#10b981', background: '#ecfdf5', padding: '2px 8px', borderRadius: 6 }}>
                                                            {tg.wonCount} satış · {(tg.wonAmount || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })}
                                                        </span>
                                                    )}
                                                    {tStages.slice(0, 4).map(([sName, sData]) => (
                                                        <span key={sName} style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 6px', borderRadius: 6, background: `${sData.color || '#94a3b8'}15`, color: sData.color || '#94a3b8', whiteSpace: 'nowrap' }}>
                                                            {sName}: {sData.count}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                            {isExpanded && topicContacts.length > 0 && (
                                                <div style={{ padding: '0 20px 16px 60px' }}>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                        <thead><tr style={{ background: '#f5f3ff' }}>
                                                            <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>#</th>
                                                            <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>İsim</th>
                                                            <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Telefon</th>
                                                            <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Durum</th>
                                                            <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Aşama</th>
                                                            <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Satış</th>
                                                            <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Temsilci</th>
                                                            <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Tarih</th>
                                                        </tr></thead>
                                                        <tbody>
                                                            {topicContacts.map((c, ci) => (
                                                                <tr key={c.id || ci} style={{ borderBottom: '1px solid #f8fafc' }}>
                                                                    <td style={{ padding: '5px 10px', color: '#94a3b8', fontSize: '0.75rem' }}>{ci + 1}</td>
                                                                    <td style={{ padding: '5px 10px', fontWeight: 700, color: '#1e293b' }}>{c.name}</td>
                                                                    <td style={{ padding: '5px 10px', color: '#475569' }}>{c.phone || '—'}</td>
                                                                    <td style={{ padding: '5px 10px' }}><span style={{ padding: '1px 6px', borderRadius: 5, fontSize: '0.7rem', fontWeight: 700, background: `${statusColors[c.status] || '#94a3b8'}15`, color: statusColors[c.status] || '#94a3b8' }}>{statusLabels[c.status] || c.status}</span></td>
                                                                    <td style={{ padding: '5px 10px' }}>{c.stageName ? <span style={{ padding: '1px 6px', borderRadius: 5, fontSize: '0.7rem', fontWeight: 700, background: `${c.stageColor || '#64748b'}15`, color: c.stageColor || '#64748b' }}>{c.stageName}</span> : '—'}</td>
                                                                    <td style={{ padding: '5px 10px' }}>{c.dealTotal > 0 ? <span style={{ fontWeight: 800, color: '#059669', fontSize: '0.72rem' }}>✓ {(c.dealWonAmount || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })}</span> : '—'}</td>
                                                                    <td style={{ padding: '5px 10px', fontWeight: 600, color: c.assigneeName ? '#1e293b' : '#d1d5db', fontSize: '0.78rem' }}>{c.assigneeName || '—'}</td>
                                                                    <td style={{ padding: '5px 10px', color: '#94a3b8', fontSize: '0.73rem' }}>{c.conversationDate ? new Date(c.conversationDate).toLocaleDateString('tr-TR') : '—'}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )
                    )}
                </div>
            </div>

            {/* Satış Listesi */}
            <div className="ceo-section" style={{ marginBottom: 20 }}>
                <div className="ceo-section-header" style={{ justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="ceo-section-icon" style={{ background: '#ecfdf5', color: '#059669' }}><ShoppingCart size={18} /></div>
                        <h2>Satış Listesi</h2>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 10 }}>
                            {salesList.length} satış · {(summary.wonAmount || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })}
                        </span>
                    </div>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                        <input type="text" placeholder="Satış ara..." value={salesSearch} onChange={e => setSalesSearch(e.target.value)}
                            style={{ paddingLeft: 32, padding: '6px 10px 6px 32px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.82rem', width: 200 }} />
                    </div>
                </div>
                <div className="ceo-section-body" style={{ padding: 0, overflowX: 'auto' }}>
                    {salesList.length === 0 ? (
                        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                            <ShoppingCart size={28} style={{ marginBottom: 8 }} />
                            <p>Seçilen filtrelere uygun satış bulunamadı</p>
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead>
                                <tr style={{ background: '#f0fdf4', borderBottom: '2px solid #bbf7d0' }}>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#166534' }}>#</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#166534' }}>Müşteri</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#166534' }}>Telefon</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#166534' }}>Konu</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#166534' }}>Tutar</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#166534' }}>Aşama</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#166534' }}>Temsilci</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#166534' }}>Tarih</th>
                                </tr>
                            </thead>
                            <tbody>
                                {salesList
                                    .filter(s => !salesSearch || 
                                        (s.contactName || '').toLowerCase().includes(salesSearch.toLowerCase()) ||
                                        (s.phone || '').includes(salesSearch) ||
                                        (s.topic || '').toLowerCase().includes(salesSearch.toLowerCase()) ||
                                        (s.agentName || '').toLowerCase().includes(salesSearch.toLowerCase()) ||
                                        (s.title || '').toLowerCase().includes(salesSearch.toLowerCase())
                                    )
                                    .map((s, idx) => (
                                    <tr key={s.dealId || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '8px 14px', color: '#94a3b8', fontWeight: 600, fontSize: '0.75rem' }}>{idx + 1}</td>
                                        <td style={{ padding: '8px 14px', fontWeight: 700, color: '#1e293b' }}>{s.contactName}</td>
                                        <td style={{ padding: '8px 14px', color: '#475569' }}>{s.phone || '—'}</td>
                                        <td style={{ padding: '8px 14px' }}>
                                            {s.topic ? (
                                                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#f5f3ff', color: '#7c3aed' }}>{s.topic}</span>
                                            ) : <span style={{ color: '#d1d5db' }}>—</span>}
                                        </td>
                                        <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 800, color: '#059669' }}>
                                            {s.amount > 0 ? s.amount.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }) : '—'}
                                        </td>
                                        <td style={{ padding: '8px 14px' }}>
                                            {s.stageName ? (
                                                <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: `${s.stageColor || '#64748b'}15`, color: s.stageColor || '#64748b' }}>{s.stageName}</span>
                                            ) : <span style={{ color: '#d1d5db' }}>—</span>}
                                        </td>
                                        <td style={{ padding: '8px 14px', fontWeight: 600, color: '#1e293b', fontSize: '0.8rem' }}>{s.agentName}</td>
                                        <td style={{ padding: '8px 14px', color: '#94a3b8', fontSize: '0.75rem' }}>{s.createdAt ? new Date(s.createdAt).toLocaleDateString('tr-TR') : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Contact List */}
            <div className="ceo-section">
                <div className="ceo-section-header" style={{ justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="ceo-section-icon" style={{ background: '#ecfdf5', color: '#10b981' }}><Users size={18} /></div>
                        <h2>Kişi Listesi</h2>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 10 }}>
                            {filteredContacts.length} kişi
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input
                                type="text"
                                placeholder="Ara..."
                                value={contactSearch}
                                onChange={e => setContactSearch(e.target.value)}
                                style={{ paddingLeft: 32, padding: '6px 10px 6px 32px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.82rem', width: 200 }}
                            />
                        </div>
                        <button onClick={() => setShowContacts(!showContacts)}
                            style={{ border: 'none', background: '#f1f5f9', padding: '6px 10px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 700, color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            {showContacts ? 'Gizle' : 'Göster'} <ChevronDown size={14} style={{ transform: showContacts ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                        </button>
                    </div>
                </div>
                {showContacts && (
                    <div className="ceo-section-body" style={{ padding: 0, overflowX: 'auto' }}>
                        {filteredContacts.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                                <Users size={28} style={{ marginBottom: 8 }} />
                                <p>Filtrelere uygun kişi bulunamadı</p>
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>#</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>İsim</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Telefon</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Konu</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Durum</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Aşama</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Satış</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Temsilci</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Kanal</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Tarih</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredContacts.map((c, idx) => (
                                        <tr key={c.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '8px 14px', color: '#94a3b8', fontWeight: 600, fontSize: '0.75rem' }}>{idx + 1}</td>
                                            <td style={{ padding: '8px 14px', fontWeight: 700, color: '#1e293b' }}>{c.name}</td>
                                            <td style={{ padding: '8px 14px', color: '#475569' }}>{c.phone || '—'}</td>
                                            <td style={{ padding: '8px 14px' }}>
                                                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#f5f3ff', color: '#7c3aed', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
                                                    {c.topic || '—'}
                                                </span>
                                            </td>
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
                                            <td style={{ padding: '8px 14px' }}>
                                                {c.dealTotal > 0 ? (
                                                    <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 800, background: '#ecfdf5', color: '#059669' }}>
                                                        ✓ {(c.dealWonAmount || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })}
                                                    </span>
                                                ) : <span style={{ color: '#d1d5db' }}>—</span>}
                                            </td>
                                            <td style={{ padding: '8px 14px', fontWeight: 600, color: c.assigneeName ? '#1e293b' : '#d1d5db', fontSize: '0.8rem' }}>{c.assigneeName || '—'}</td>
                                            <td style={{ padding: '8px 14px', fontWeight: 600, color: '#64748b', fontSize: '0.75rem' }}>{c.channel || '—'}</td>
                                            <td style={{ padding: '8px 14px', color: '#94a3b8', fontSize: '0.75rem' }}>{c.conversationDate ? new Date(c.conversationDate).toLocaleDateString('tr-TR') : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AnalysisReport;
