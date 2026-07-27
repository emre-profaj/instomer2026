import React, { useState, useEffect } from 'react';
import { 
    Calendar, Users, CheckCircle2, Clock, 
    RefreshCw, Search, X, MessageSquare, Phone,
    FileText, Filter
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast/Toast';
import { activityAPI } from '../../services/activity.api';
import { getDateRangeLogic, dateFilterOptions } from '../../utils/dateFilters';
import './AramaAnalizi.css'; // Reuse styles
import '../CeoReport/CeoReport.css';
import '../CeoReport/CeoDetailReport.css';

const ActivityListAnalytics = ({ type, title, subtitle, icon: Icon }) => {
    const { currentWorkspace } = useAuth();
    const { showSuccess, showError } = useToast();
    
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activities, setActivities] = useState([]);
    const [summary, setSummary] = useState({ planned: 0, completed: 0, cancelled: 0, inProgress: 0 });
    
    // Date filter states
    const [dateFilter, setDateFilter] = useState('thisMonth');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    
    // Table states
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (currentWorkspace?.id) {
            loadData();
        }
    }, [currentWorkspace?.id, dateFilter, startDate, endDate, type]);

    const loadData = async (isRefresh = false) => {
        try {
            if (isRefresh) setRefreshing(true);
            else setLoading(true);

            const { startDate: sd, endDate: ed } = getDateRangeLogic(dateFilter, startDate, endDate);
            let dateFrom, dateTo;
            if (sd) {
                dateFrom = new Date(sd).toISOString();
            }
            if (ed) {
                const end = new Date(ed);
                end.setHours(23, 59, 59, 999);
                dateTo = end.toISOString();
            }
            
            const res = await activityAPI.getWorkspaceActivities(currentWorkspace.id, {
                type,
                dateFrom,
                dateTo,
                dateField: 'createdAt',
                limit: 500
            });

            setActivities(res.activities || []);
            setSummary(res.summary || { planned: 0, completed: 0, cancelled: 0, inProgress: 0 });
        } catch (error) {
            console.error('Failed to load activities:', error);
            showError('Veriler yüklenirken bir hata oluştu.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const formatDateTime = (dateStr) => {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleString('tr-TR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const filteredActivities = activities.filter(a => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
            (a.contact?.name && a.contact.name.toLowerCase().includes(term)) ||
            (a.contact?.phone && a.contact.phone.includes(term)) ||
            (a.assignee?.name && a.assignee.name.toLowerCase().includes(term))
        );
    });

    const total = summary.planned + summary.completed + summary.cancelled + summary.inProgress;

    if (loading && activities.length === 0) {
        return (
            <div className="arama-analizi-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', color: '#6366f1' }}>
                    <RefreshCw className="spin" size={40} style={{ marginBottom: 12 }} />
                    <p style={{ fontWeight: 600 }}>{title} Yükleniyor...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="arama-analizi-container">
            {/* Header */}
            <div className="ceo-detail-header">
                <div className="ceo-detail-header-left">
                    <h1>{title}</h1>
                    <p>{subtitle}</p>
                </div>
            </div>

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
                    <button className="ceo-refresh-btn" onClick={() => loadData(true)} disabled={refreshing}>
                        <RefreshCw className={refreshing ? 'spin' : ''} size={14} /> Güncelle
                    </button>
                    <button className="ceo-refresh-btn" onClick={() => window.print()} style={{ background: '#6366f1', color: 'white' }}>
                        <FileText size={14} /> Raporu İndir
                    </button>
                </div>
            </div>

            {/* Metrics */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-card-icon" style={{ background: '#eef2ff', color: '#6366f1' }}><Icon size={22} /></div>
                    <div className="stat-card-info">
                        <span className="stat-card-label">Toplam {title.split(' ')[0]}</span>
                        <span className="stat-card-value">{total}</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-card-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}><CheckCircle2 size={22} /></div>
                    <div className="stat-card-info">
                        <span className="stat-card-label">Tamamlanan</span>
                        <span className="stat-card-value" style={{ color: '#16a34a' }}>{summary.completed}</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-card-icon" style={{ background: '#fffbeb', color: '#d97706' }}><Clock size={22} /></div>
                    <div className="stat-card-info">
                        <span className="stat-card-label">Bekleyen (Planlı)</span>
                        <span className="stat-card-value" style={{ color: '#d97706' }}>{summary.planned}</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-card-icon" style={{ background: '#fef2f2', color: '#dc2626' }}><X size={22} /></div>
                    <div className="stat-card-info">
                        <span className="stat-card-label">İptal Edilen</span>
                        <span className="stat-card-value" style={{ color: '#dc2626' }}>{summary.cancelled}</span>
                    </div>
                </div>
            </div>

            {/* Table Area */}
            <div className="content-section">
                <div className="section-header">
                    <h2>{title.split(' ')[0]} Listesi</h2>
                    <div className="section-actions">
                        <div className="search-box">
                            <Search size={16} />
                            <input 
                                type="text" 
                                placeholder="Kişi veya temsilci ara..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <div className="table-responsive">
                    <table className="modern-table" style={{ fontSize: '0.82rem' }}>
                        <thead>
                            <tr>
                                <th>Kişi Adı</th>
                                <th>Temsilci</th>
                                <th>Aşama / Durum</th>
                                <th>Tarih</th>
                                <th style={{ textAlign: 'center' }}>Sonuç</th>
                                <th>Not</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredActivities.length === 0 ? (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                                        <MessageSquare size={32} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                                        Bu aralıkta kayıt bulunamadı.
                                    </td>
                                </tr>
                            ) : (
                                filteredActivities.map((a) => {
                                    const isCompleted = a.status === 'COMPLETED';
                                    const isPlanned = a.status === 'PLANNED';
                                    
                                    let statusLabel = isCompleted ? '✓ Tamamlandı' : (isPlanned ? '⏳ Bekliyor' : '✗ İptal');
                                    let statusColor = isCompleted ? '#15803d' : (isPlanned ? '#c2410c' : '#dc2626');
                                    let statusBg = isCompleted ? '#dcfce7' : (isPlanned ? '#fff7ed' : '#fef2f2');
                                    let statusBorder = isCompleted ? '#86efac' : (isPlanned ? '#fdba74' : '#fca5a5');

                                    if (isCompleted && a.callSuccessful !== null && a.callSuccessful !== undefined) {
                                        if (a.callSuccessful) {
                                            statusLabel = '✓ Ulaşıldı';
                                        } else {
                                            statusLabel = '✗ Ulaşılamadı';
                                            statusColor = '#dc2626';
                                            statusBg = '#fef2f2';
                                            statusBorder = '#fca5a5';
                                        }
                                    }

                                    return (
                                        <tr key={a.id}>
                                            <td>
                                                <div style={{ fontWeight: 700, color: '#0f172a' }}>{a.contact?.name || 'Bilinmiyor'}</div>
                                                <div style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace' }}>{a.contact?.phone || ''}</div>
                                            </td>
                                            <td>
                                                {a.assignee ? (
                                                    <span style={{ fontSize: '0.72rem', background: '#eef2ff', color: '#6366f1', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                                                        {a.assignee.name}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#cbd5e1', fontSize: '0.78rem' }}>Atanmamış</span>
                                                )}
                                            </td>
                                            <td>
                                                <span style={{ fontSize: '0.72rem', background: '#f8fafc', color: '#475569', padding: '2px 8px', borderRadius: '8px', fontWeight: 600, border: '1px solid #e2e8f0' }}>
                                                    {a.contact?.status || 'Yeni'}
                                                </span>
                                            </td>
                                            <td>
                                                <span style={{ color: '#64748b', fontSize: '0.76rem' }}>
                                                    {formatDateTime(a.completedAt || a.dueDate || a.createdAt)}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <span style={{ fontSize: '0.68rem', background: statusBg, color: statusColor, border: `1px solid ${statusBorder}`, borderRadius: '999px', padding: '2px 10px', fontWeight: 700 }}>
                                                    {statusLabel}
                                                </span>
                                                {a.callSentiment && (
                                                    <div style={{ fontSize: '0.65rem', marginTop: '4px', color: '#64748b' }}>
                                                        {a.callSentiment === 'Positive' ? '😊 Olumlu' : a.callSentiment === 'Negative' ? '😔 Olumsuz' : '😐 Nötr'}
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                {a.result || a.description ? (
                                                    <span style={{ fontSize: '0.76rem', color: '#334155', fontStyle: 'italic' }} title={a.result || a.description}>
                                                        "{(a.result || a.description).length > 50 ? (a.result || a.description).substring(0, 50) + '...' : (a.result || a.description)}"
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#cbd5e1' }}>—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ActivityListAnalytics;
