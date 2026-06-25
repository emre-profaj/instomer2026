import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Sparkles, RefreshCw, Filter, ArrowLeft, Phone, PhoneCall, Clock, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { contactAPI } from '../../services/api';
import './CeoReport.css';
import './CeoDetailReport.css';

const formatNumber = (n) => {
    if (!n && n !== 0) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toLocaleString('tr-TR');
};

const AICallReport = () => {
    const { currentWorkspace } = useAuth();
    const navigate = useNavigate();
    const [analytics, setAnalytics] = useState(null);
    const [agentPerformance, setAgentPerformance] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

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
            const [analyticsRes, perfRes] = await Promise.all([
                contactAPI.getAnalytics(currentWorkspace.id, params),
                contactAPI.getAgentPerformance(currentWorkspace.id, params)
            ]);
            setAnalytics(analyticsRes.data);
            setAgentPerformance(perfRes.data);
        } catch (err) {
            console.error('AI call report error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [currentWorkspace?.id, dateFilter, startDate, endDate]);

    // Check if AI calls exist
    const agents = agentPerformance?.agents || [];
    const totalAICalls = agents.reduce((s, a) => s + (a.retellCallCount || 0), 0);
    const aiCallStats = analytics?.aiCallStats || {};
    const hasAICalls = totalAICalls > 0 || (aiCallStats.totalCalls || 0) > 0;

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
            <button className="ceo-back-btn" onClick={() => navigate('/ceo-report')}><ArrowLeft size={16} /> Dashboard</button>

            <div className="ceo-detail-header">
                <div className="ceo-detail-header-left">
                    <h1><Bot size={24} style={{ color: '#8b5cf6' }} /> AI Arama Analizi</h1>
                    <p>Yapay zeka destekli otomatik arama performansı</p>
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

            {hasAICalls ? (
                <>
                    {/* AI Call KPIs */}
                    <div className="ceo-detail-kpi-grid">
                        <div className="ceo-detail-kpi-card"><div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #8b5cf6, #8b5cf688)' }} /><div className="kpi-icon-wrap" style={{ background: '#f5f3ff', color: '#8b5cf6' }}><PhoneCall size={20} /></div><div className="kpi-label">Toplam AI Arama</div><div className="kpi-value">{formatNumber(aiCallStats.totalCalls || totalAICalls)}</div></div>
                        <div className="ceo-detail-kpi-card"><div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #10b981, #10b98188)' }} /><div className="kpi-icon-wrap" style={{ background: '#ecfdf5', color: '#10b981' }}><CheckCircle2 size={20} /></div><div className="kpi-label">Başarılı</div><div className="kpi-value">{formatNumber(aiCallStats.successfulCalls || 0)}</div></div>
                        <div className="ceo-detail-kpi-card"><div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #3b82f6, #3b82f688)' }} /><div className="kpi-icon-wrap" style={{ background: '#eff6ff', color: '#3b82f6' }}><Clock size={20} /></div><div className="kpi-label">Ort. Süre</div><div className="kpi-value">{aiCallStats.avgDuration || 0} sn</div></div>
                    </div>

                    {/* Existing AI Call analytics link */}
                    <div className="ceo-section" style={{ marginBottom: 20 }}>
                        <div className="ceo-section-body" style={{ textAlign: 'center', padding: 30 }}>
                            <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 12 }}>Detaylı AI arama analizi için mevcut sayfayı ziyaret edin</p>
                            <button className="ceo-refresh-btn" onClick={() => navigate('/ai-call-analytics')} style={{ background: '#f5f3ff', borderColor: '#ddd6fe', color: '#7c3aed' }}>
                                <Bot size={14} /> AI Arama Analizi Sayfasına Git →
                            </button>
                        </div>
                    </div>

                    {/* Agent AI call stats */}
                    {agents.filter(a => (a.retellCallCount || 0) > 0).length > 0 && (
                        <div className="ceo-section" style={{ marginBottom: 20 }}>
                            <div className="ceo-section-header">
                                <div className="ceo-section-icon" style={{ background: '#f5f3ff', color: '#8b5cf6' }}><Bot size={18} /></div>
                                <h2>Temsilci Bazlı AI Arama</h2>
                            </div>
                            <div className="ceo-section-body">
                                {agents.filter(a => (a.retellCallCount || 0) > 0).sort((a, b) => (b.retellCallCount || 0) - (a.retellCallCount || 0)).map((agent, idx) => (
                                    <div key={agent.userId || idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: idx === 0 ? '#faf5ff' : '#f8fafc', marginBottom: 6 }}>
                                        <div className={`medal-badge ${idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : 'default'}`}>{idx + 1}</div>
                                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b', flex: 1 }}>{agent.name}</span>
                                        <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#8b5cf6' }}>{agent.retellCallCount}</span>
                                        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>AI arama</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            ) : (
                /* Upgrade Card */
                <div className="ceo-section" style={{ marginBottom: 20, background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 30%, #ddd6fe 100%)', border: '1px solid #c4b5fd' }}>
                    <div className="ceo-section-body" style={{ textAlign: 'center', padding: '50px 30px' }}>
                        <div style={{ width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                            <Sparkles size={32} color="#fff" />
                        </div>
                        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b', marginBottom: 10 }}>AI ile Otomatik Arama</h2>
                        <p style={{ fontSize: '0.9rem', color: '#64748b', maxWidth: 480, margin: '0 auto 24px', lineHeight: 1.6 }}>
                            Yapay zeka destekli otomatik arama ile müşterilerinize ulaşın. AI, konuşmayı analiz eder, notları otomatik alır ve sonuçları kaydeder.
                        </p>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
                            {['Otomatik Arama', 'Konuşma Analizi', 'Duygu Tespiti', 'Otomatik Notlar'].map(feat => (
                                <span key={feat} style={{ padding: '6px 14px', borderRadius: 20, background: 'rgba(139,92,246,0.12)', color: '#7c3aed', fontSize: '0.78rem', fontWeight: 600 }}>✨ {feat}</span>
                            ))}
                        </div>
                        <button
                            onClick={() => navigate('/settings')}
                            style={{ padding: '12px 32px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: '#fff', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}
                            onMouseOver={e => { e.target.style.transform = 'translateY(-2px)'; e.target.style.boxShadow = '0 6px 20px rgba(99,102,241,0.4)'; }}
                            onMouseOut={e => { e.target.style.transform = 'none'; e.target.style.boxShadow = '0 4px 14px rgba(99,102,241,0.3)'; }}
                        >
                            Detaylı Bilgi →
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AICallReport;
