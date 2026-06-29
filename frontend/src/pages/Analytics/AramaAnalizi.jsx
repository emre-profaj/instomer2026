import React, { useState, useEffect } from 'react';
import { 
    Users, PhoneCall, CheckCircle2, PhoneOff, Phone, 
    TrendingUp, Calendar, Clock, RefreshCw, Trash2, 
    Search, FileText, AlertCircle, X, ChevronRight, MessageSquare 
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast/Toast';
import api, { contactAPI, retellAPI, funnelAPI } from '../../services/api';
import './AramaAnalizi.css';

const AramaAnalizi = () => {
    const { currentWorkspace } = useAuth();
    const { showSuccess, showError } = useToast();
    
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [analytics, setAnalytics] = useState(null);
    const [scheduledCalls, setScheduledCalls] = useState([]);
    const [funnels, setFunnels] = useState([]);
    const [bottomTab, setBottomTab] = useState('calls'); // calls | uncalled
    
    // Date filter states
    const [dateFilter, setDateFilter] = useState('7d'); // 24h | 7d | 30d | custom
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Table filter & search states
    const [searchTerm, setSearchTerm] = useState('');
    const [tableFilter, setTableFilter] = useState('all'); // all | called | notCalled | completed | planned

    // Modal states
    const [showPhoneModal, setShowPhoneModal] = useState(false);
    const [modalSearch, setModalSearch] = useState('');
    const [modalFilter, setModalFilter] = useState('all'); // all | called | notCalled

    useEffect(() => {
        if (currentWorkspace?.id) {
            loadAllData();
        }
    }, [currentWorkspace?.id, dateFilter]);

    const getDateRange = () => {
        const now = new Date();
        const start = new Date();
        if (dateFilter === '24h') {
            start.setHours(now.getHours() - 24);
        } else if (dateFilter === '7d') {
            start.setDate(now.getDate() - 7);
        } else if (dateFilter === '30d') {
            start.setDate(now.getDate() - 30);
        } else if (dateFilter === 'custom' && startDate) {
            const customStart = new Date(startDate);
            const customEnd = endDate ? new Date(endDate) : new Date();
            return { 
                startDate: customStart.toISOString(), 
                endDate: customEnd.toISOString() 
            };
        } else {
            // Default to 7 days
            start.setDate(now.getDate() - 7);
        }
        return { startDate: start.toISOString(), endDate: now.toISOString() };
    };

    const loadAllData = async (isRefresh = false) => {
        try {
            if (isRefresh) setRefreshing(true);
            else setLoading(true);

            const dateParams = getDateRange();
            
            const [analyticsRes, scheduledRes, funnelsRes] = await Promise.all([
                contactAPI.getAnalytics(currentWorkspace.id, dateParams),
                retellAPI.getScheduledCalls(currentWorkspace.id),
                funnelAPI.getAll(currentWorkspace.id).catch(() => ({ data: [] }))
            ]);

            setAnalytics(analyticsRes.data);
            setScheduledCalls(scheduledRes.data.scheduledCalls || []);
            setFunnels(funnelsRes.data?.funnels || funnelsRes.data || []);
        } catch (error) {
            console.error('Failed to load call analytics data:', error);
            showError('Arama analizi verileri yüklenirken bir hata oluştu.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleApplyCustomDates = () => {
        if (!startDate || !endDate) {
            showError('Lütfen başlangıç ve bitiş tarihlerini seçin.');
            return;
        }
        loadAllData();
    };

    const handleCancelScheduledCall = async (callId) => {
        if (!window.confirm('Bu gecikmiş/planlanmış aramayı iptal etmek istediğinize emin misiniz?')) {
            return;
        }
        try {
            await retellAPI.cancelScheduledCall(currentWorkspace.id, callId);
            showSuccess('Planlanmış arama başarıyla iptal edildi.');
            // Reload scheduled calls
            const scheduledRes = await retellAPI.getScheduledCalls(currentWorkspace.id);
            setScheduledCalls(scheduledRes.data.scheduledCalls || []);
        } catch (error) {
            console.error('Failed to cancel scheduled call:', error);
            showError('Arama iptal edilirken bir hata oluştu.');
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

    // Get call tracking stats
    const stats = analytics?.callTrackingStats || {
        totalWithPhone: 0,
        totalCalled: 0,
        totalCompleted: 0,
        totalNotCalled: 0,
        callRate: 0,
        details: [],
        phoneContactsList: [],
        activities: []
    };

    // Gecikmiş aramalar: backend'den tarih filtresi olmadan geliyor
    const delayedCalls = stats.overdueCalls || [];

    // Closure notes — backend'den tarih filtresi olmadan geliyor (en son 100)
    const closureNotes = stats.closureNotes || [];

    // Filter customer details table
    const filteredDetails = (stats.details || [])
        .filter(d => {
            if (tableFilter === 'called') return d.totalCalls > 0;
            if (tableFilter === 'notCalled') return d.totalCalls === 0;
            if (tableFilter === 'completed') return d.completedCalls > 0;
            if (tableFilter === 'planned') return d.plannedCalls > 0;
            return true;
        })
        .filter(d => {
            if (!searchTerm) return true;
            const term = searchTerm.toLowerCase();
            return (
                d.contactName.toLowerCase().includes(term) ||
                d.phone.includes(term) ||
                (d.assigneeName && d.assigneeName.toLowerCase().includes(term))
            );
        });

    if (loading && !analytics) {
        return (
            <div className="arama-analizi-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', color: '#6366f1' }}>
                    <RefreshCw className="spin" size={40} style={{ marginBottom: 12 }} />
                    <p style={{ fontWeight: 600 }}>Arama Analizleri Yükleniyor...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="arama-analizi-container">
            {/* Header */}
            <div className="arama-analizi-header">
                <div className="arama-analizi-title">
                    <h1>Arama Analizi</h1>
                    <p>Telefon aramaları, gecikmiş aramalar ve müşteri görüşme notları</p>
                </div>
                
                <div className="arama-analizi-actions">
                    {/* Presets */}
                    <div className="date-presets">
                        <button 
                            className={`preset-btn ${dateFilter === '24h' ? 'active' : ''}`}
                            onClick={() => setDateFilter('24h')}
                        >
                            Son 24 Saat
                        </button>
                        <button 
                            className={`preset-btn ${dateFilter === '7d' ? 'active' : ''}`}
                            onClick={() => setDateFilter('7d')}
                        >
                            Son 7 Gün
                        </button>
                        <button 
                            className={`preset-btn ${dateFilter === '30d' ? 'active' : ''}`}
                            onClick={() => setDateFilter('30d')}
                        >
                            Son 30 Gün
                        </button>
                        <button 
                            className={`preset-btn ${dateFilter === 'custom' ? 'active' : ''}`}
                            onClick={() => setDateFilter('custom')}
                        >
                            Özel Aralık
                        </button>
                    </div>

                    {/* Custom Date Inputs */}
                    {dateFilter === 'custom' && (
                        <div className="custom-date-inputs">
                            <input 
                                type="date" 
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                            <span className="date-separator">—</span>
                            <input 
                                type="date" 
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
                            <button className="btn-apply-dates" onClick={handleApplyCustomDates}>
                                Uygula
                            </button>
                        </div>
                    )}

                    <button 
                        className="btn-refresh" 
                        onClick={() => loadAllData(true)}
                        disabled={refreshing}
                    >
                        <RefreshCw className={refreshing ? 'spin' : ''} size={15} />
                        Güncelle
                    </button>
                </div>
            </div>

            {/* Metrics cards */}
            <div className="stats-grid">
                <div className="stat-card" onClick={() => setShowPhoneModal(true)} style={{ cursor: 'pointer' }}>
                    <div className="stat-card-icon" style={{ background: '#eef2ff', color: '#6366f1' }}>
                        <Users size={22} />
                    </div>
                    <div className="stat-card-info">
                        <span className="stat-card-label">Numaralı Başvurular</span>
                        <span className="stat-card-value">{stats.totalWithPhone}</span>
                        <span className="stat-card-desc">Telefon numarası olan kişi</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-card-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                        <PhoneCall size={22} />
                    </div>
                    <div className="stat-card-info">
                        <span className="stat-card-label">Kaçı Arandı</span>
                        <span className="stat-card-value">{stats.totalCalled}</span>
                        <span className="stat-card-desc">Benzersiz kişi (5 kez aransa da 1)</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-card-icon" style={{ background: '#e0f2fe', color: '#0ea5e9' }}>
                        <Phone size={22} />
                    </div>
                    <div className="stat-card-info">
                        <span className="stat-card-label">Toplam Arama</span>
                        <span className="stat-card-value">{stats.totalCallCount || 0}</span>
                        <span className="stat-card-desc">Toplam yapılan arama sayısı</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-card-icon" style={{ background: '#fef2f2', color: '#dc2626' }}>
                        <PhoneOff size={22} />
                    </div>
                    <div className="stat-card-info">
                        <span className="stat-card-label">Aranmayan Başvuru</span>
                        <span className="stat-card-value">{stats.totalNotCalled}</span>
                        <span className="stat-card-desc">Henüz hiç aranmamış kişi</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-card-icon" style={{ background: '#fffbeb', color: '#d97706' }}>
                        <TrendingUp size={22} />
                    </div>
                    <div className="stat-card-info">
                        <span className="stat-card-label">Arama Oranı</span>
                        <span className="stat-card-value">%{stats.callRate}</span>
                        <span className="stat-card-desc">Aranan / Toplam numaralı</span>
                    </div>
                </div>
            </div>

            {/* Split panels: Delayed Calls & Closed Call Notes */}
            <div className="sections-grid">
                {/* Delayed Calls Column */}
                <div className="section-card">
                    <div className="section-card-header">
                        <div className="section-card-title">
                            <div className="section-card-title-icon" style={{ color: '#ef4444' }}>
                                <AlertCircle size={20} />
                            </div>
                            <h2>Gecikmiş Aramalar</h2>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 700, background: '#fef2f2', padding: '2px 8px', borderRadius: '12px' }}>
                            {stats.overdueCount || delayedCalls.length} Bekleyen
                        </span>
                    </div>
                    
                    <div className="delayed-calls-list">
                        {delayedCalls.length > 0 ? (
                            delayedCalls.map(call => (
                                <div key={call.id} className="delayed-call-item">
                                    <div className="delayed-call-left">
                                        <span className="delayed-call-contact-name">
                                            {call.contact?.name || 'İsimsiz Müşteri'}
                                        </span>
                                        <span className="delayed-call-phone-num">
                                            {call.contact?.phone || '—'}
                                        </span>
                                        <div className="delayed-call-time-badge">
                                            <Clock size={12} />
                                            {formatDateTime(call.dueDate)}
                                        </div>
                                        {call.assignee && (
                                            <span style={{ fontSize: '0.68rem', background: '#eef2ff', color: '#6366f1', padding: '2px 8px', borderRadius: '12px', fontWeight: 600, marginTop: 4, alignSelf: 'flex-start' }}>
                                                👤 {call.assignee.name}
                                            </span>
                                        )}
                                    </div>
                                    <div className="delayed-call-right" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        <button 
                                            className="btn-action-cancel"
                                            style={{ background: '#10b981', fontSize: '0.75rem', padding: '7px 14px' }}
                                            onClick={async () => {
                                                try {
                                                    await api.put(`/activities/${call.id}/complete`, { result: 'Arandı' });
                                                    showSuccess('Arama tamamlandı olarak işaretlendi.');
                                                    loadAllData(true);
                                                } catch (err) {
                                                    console.error('Complete error:', err);
                                                    showError('İşaretlenirken hata oluştu.');
                                                }
                                            }}
                                            title="Arama Yapıldı"
                                        >
                                            <PhoneCall size={13} style={{ marginRight: 4 }} />
                                            Arandı ✓
                                        </button>
                                        <button 
                                            className="btn-action-cancel"
                                            style={{ fontSize: '0.75rem', padding: '7px 14px' }}
                                            onClick={async () => {
                                                if (!window.confirm('Bu gecikmiş aramayı iptal etmek istediğinize emin misiniz?')) return;
                                                try {
                                                    await api.delete(`/activities/${call.id}`);
                                                    showSuccess('Arama iptal edildi.');
                                                    loadAllData(true);
                                                } catch (err) {
                                                    console.error('Cancel error:', err);
                                                    showError('İptal edilirken hata oluştu.');
                                                }
                                            }}
                                            title="Aramayı İptal Et"
                                        >
                                            <Trash2 size={12} style={{ marginRight: 4 }} />
                                            İptal Et
                                        </button>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="empty-state">
                                <div className="empty-state-icon" style={{ color: '#10b981' }}>✓</div>
                                <p>Gecikmiş arama bulunmamaktadır.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Closed Call Notes Column */}
                <div className="section-card">
                    <div className="section-card-header">
                        <div className="section-card-title">
                            <div className="section-card-title-icon" style={{ color: '#6366f1' }}>
                                <FileText size={20} />
                            </div>
                            <h2>Arama Kapatma Notları</h2>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#6366f1', fontWeight: 700, background: '#eef2ff', padding: '2px 8px', borderRadius: '12px' }}>
                            {closureNotes.length} Kayıt
                        </span>
                    </div>

                    <div className="closure-notes-list">
                        {closureNotes.length > 0 ? (
                            closureNotes.map(act => (
                                <div key={act.id} className="closure-note-item">
                                    <div className="closure-note-meta">
                                        <span className="closure-note-contact-link">
                                            {act.contact?.name || 'Bilinmeyen Kişi'}
                                        </span>
                                        <span className="closure-note-agent">
                                            👤 {act.assignee?.name || 'Atanmamış'}
                                        </span>
                                    </div>
                                    <p className="closure-note-text">
                                        "{act.result}"
                                    </p>
                                    <span className="closure-note-date">
                                        {formatDateTime(act.completedAt || act.createdAt)}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <div className="empty-state">
                                <div className="empty-state-icon" style={{ color: '#94a3b8' }}>
                                    <MessageSquare size={32} />
                                </div>
                                <p>Bu aralıkta kapatma notu bulunmamaktadır.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Bottom Tables — Arama Listesi & Aranmayanlar */}
            <div className="bottom-section">
                <div className="bottom-section-header">
                    <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: 4, borderRadius: 12 }}>
                        <button
                            className={`preset-btn ${bottomTab === 'calls' ? 'active' : ''}`}
                            onClick={() => setBottomTab('calls')}
                        >
                            <PhoneCall size={14} style={{ marginRight: 4 }} />
                            Arama Listesi ({(stats.activities || []).length})
                        </button>
                        <button
                            className={`preset-btn ${bottomTab === 'uncalled' ? 'active' : ''}`}
                            onClick={() => setBottomTab('uncalled')}
                        >
                            <PhoneOff size={14} style={{ marginRight: 4 }} />
                            Aranmayanlar ({(stats.phoneContactsList || []).filter(c => !c.wasCalled).length})
                        </button>
                    </div>

                    <div className="bottom-section-filters">
                        <input
                            type="text"
                            className="input-search-contacts"
                            placeholder="İsim, numara veya temsilci ara..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* TAB 1: Arama Listesi */}
                {bottomTab === 'calls' && (
                    <div className="table-responsive">
                        <table className="modern-table" style={{ fontSize: '0.82rem' }}>
                            <thead>
                                <tr>
                                    <th>Kişi Adı</th>
                                    <th>Temsilci</th>
                                    <th>Aşama / Durum</th>
                                    <th>Arama Tarihi</th>
                                    <th style={{ textAlign: 'center' }}>Sonuç</th>
                                    <th>Arama Notu</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(() => {
                                    const callList = (stats.activities || [])
                                        .filter(a => {
                                            if (!searchTerm) return true;
                                            const q = searchTerm.toLowerCase();
                                            return (
                                                (a.contact?.name || '').toLowerCase().includes(q) ||
                                                (a.contact?.phone || '').includes(q) ||
                                                (a.assignee?.name || '').toLowerCase().includes(q)
                                            );
                                        })
                                        .sort((a, b) => new Date(b.dueDate || b.createdAt) - new Date(a.dueDate || a.createdAt));

                                    if (callList.length === 0) {
                                        return (
                                            <tr>
                                                <td colSpan="6" style={{ textAlign: 'center', color: '#94a3b8', padding: '30px 0' }}>
                                                    Eşleşen sonuç bulunamadı.
                                                </td>
                                            </tr>
                                        );
                                    }
                                    return callList.map(a => {
                                        const isCompleted = a.status === 'COMPLETED';
                                        const isPlanned = a.status === 'PLANNED';
                                        // Resolve funnel stage
                                        let stageName = '';
                                        let stageColor = '#6b7280';
                                        if (a.contact?.funnelStageId && funnels.length > 0) {
                                            for (const f of funnels) {
                                                const s = f.stages?.find(x => x.id === a.contact.funnelStageId);
                                                if (s) { stageName = s.name; stageColor = s.color || '#6366f1'; break; }
                                            }
                                        }
                                        if (!stageName && a.contact?.status) {
                                            const statusLabels = { NEW: 'Yeni', OPPORTUNITY: 'Fırsat', CUSTOMER: 'Müşteri', LOST: 'Kayıp' };
                                            stageName = statusLabels[a.contact.status] || a.contact.status;
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
                                                    {stageName ? (
                                                        <span style={{ fontSize: '0.72rem', background: `${stageColor}1a`, color: stageColor, padding: '2px 8px', borderRadius: '8px', fontWeight: 600, border: `1px solid ${stageColor}33` }}>
                                                            {stageName}
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#cbd5e1' }}>—</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <span style={{ color: '#64748b', fontSize: '0.76rem' }}>
                                                        {formatDateTime(a.completedAt || a.dueDate || a.createdAt)}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    {isCompleted ? (
                                                        <span style={{ fontSize: '0.68rem', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', borderRadius: '999px', padding: '2px 10px', fontWeight: 700 }}>
                                                            ✓ Ulaşıldı
                                                        </span>
                                                    ) : isPlanned ? (
                                                        <span style={{ fontSize: '0.68rem', background: '#fff7ed', color: '#c2410c', border: '1px solid #fdba74', borderRadius: '999px', padding: '2px 10px', fontWeight: 700 }}>
                                                            ⏳ Bekliyor
                                                        </span>
                                                    ) : (
                                                        <span style={{ fontSize: '0.68rem', background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '999px', padding: '2px 10px', fontWeight: 700 }}>
                                                            ✗ Ulaşılamadı
                                                        </span>
                                                    )}
                                                </td>
                                                <td>
                                                    {a.result ? (
                                                        <span style={{ fontSize: '0.76rem', color: '#334155', fontStyle: 'italic' }} title={a.result}>
                                                            "{a.result.length > 40 ? a.result.substring(0, 40) + '...' : a.result}"
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#cbd5e1' }}>—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    });
                                })()}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* TAB 2: Aranmayanlar Listesi */}
                {bottomTab === 'uncalled' && (
                    <div className="table-responsive">
                        <table className="modern-table" style={{ fontSize: '0.82rem' }}>
                            <thead>
                                <tr>
                                    <th>Kişi Adı</th>
                                    <th>Telefon</th>
                                    <th>Firma</th>
                                    <th>Aşama / Durum</th>
                                    <th>Kayıt Tarihi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(() => {
                                    const uncalledList = (stats.phoneContactsList || [])
                                        .filter(c => !c.wasCalled)
                                        .filter(c => {
                                            if (!searchTerm) return true;
                                            const q = searchTerm.toLowerCase();
                                            return c.name.toLowerCase().includes(q) || (c.phone || '').includes(q);
                                        });

                                    if (uncalledList.length === 0) {
                                        return (
                                            <tr>
                                                <td colSpan="5" style={{ textAlign: 'center', color: '#94a3b8', padding: '30px 0' }}>
                                                    Tüm numaralı kişiler aranmış! 🎉
                                                </td>
                                            </tr>
                                        );
                                    }
                                    return uncalledList.map(c => {
                                        let stageName = '';
                                        let stageColor = '#6b7280';
                                        if (c.funnelStageId && funnels.length > 0) {
                                            for (const f of funnels) {
                                                const s = f.stages?.find(x => x.id === c.funnelStageId);
                                                if (s) { stageName = s.name; stageColor = s.color || '#6366f1'; break; }
                                            }
                                        }
                                        if (!stageName && c.status) {
                                            const statusLabels = { NEW: 'Yeni', OPPORTUNITY: 'Fırsat', CUSTOMER: 'Müşteri', LOST: 'Kayıp' };
                                            stageName = statusLabels[c.status] || c.status;
                                        }
                                        return (
                                            <tr key={c.contactId}>
                                                <td>
                                                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{c.name}</div>
                                                </td>
                                                <td style={{ fontFamily: 'monospace', color: '#475569', fontSize: '0.78rem' }}>
                                                    {c.phone}
                                                </td>
                                                <td style={{ color: '#475569', fontSize: '0.78rem' }}>
                                                    {c.company || '—'}
                                                </td>
                                                <td>
                                                    {stageName ? (
                                                        <span style={{ fontSize: '0.72rem', background: `${stageColor}1a`, color: stageColor, padding: '2px 8px', borderRadius: '8px', fontWeight: 600, border: `1px solid ${stageColor}33` }}>
                                                            {stageName}
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#cbd5e1' }}>—</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <span style={{ color: '#64748b', fontSize: '0.76rem' }}>
                                                        {formatDateTime(c.createdAt)}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    });
                                })()}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal - Numaralı Kişiler Listesi */}
            {showPhoneModal && (
                <div className="modal-overlay">
                    <div className="modal-backdrop" onClick={() => setShowPhoneModal(false)} />
                    <div className="modal-container">
                        <div className="modal-header">
                            <div className="modal-header-info">
                                <h3>Numaralı Kişiler</h3>
                                <p>Rehberinizde telefon numarası kayıtlı olan {stats.phoneContactsList?.length || 0} kişi</p>
                            </div>
                            <button className="modal-close-btn" onClick={() => setShowPhoneModal(false)}>
                                <X size={16} />
                            </button>
                        </div>
                        
                        <div className="modal-filters">
                            <input 
                                type="text"
                                className="modal-search"
                                placeholder="İsim veya numara ara..."
                                value={modalSearch}
                                onChange={(e) => setModalSearch(e.target.value)}
                            />
                            
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button 
                                    className={`modal-filter-btn ${modalFilter === 'all' ? 'active' : ''}`}
                                    onClick={() => setModalFilter('all')}
                                >
                                    Tümü
                                </button>
                                <button 
                                    className={`modal-filter-btn ${modalFilter === 'called' ? 'active' : ''}`}
                                    onClick={() => setModalFilter('called')}
                                >
                                    Arandı
                                </button>
                                <button 
                                    className={`modal-filter-btn ${modalFilter === 'notCalled' ? 'active' : ''}`}
                                    onClick={() => setModalFilter('notCalled')}
                                >
                                    Aranmadı
                                </button>
                            </div>
                        </div>

                        <div className="modal-body">
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                                        <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 700, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase' }}>Kişi</th>
                                        <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 700, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase' }}>Telefon</th>
                                        <th style={{ textAlign: 'center', padding: '8px 6px', fontWeight: 700, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase' }}>Durum</th>
                                        <th style={{ textAlign: 'center', padding: '8px 6px', fontWeight: 700, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase' }}>Arama</th>
                                        <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 700, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase' }}>Son Arama</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.phoneContactsList
                                        ?.filter(c => {
                                            if (modalFilter === 'called') return c.wasCalled;
                                            if (modalFilter === 'notCalled') return !c.wasCalled;
                                            return true;
                                        })
                                        ?.filter(c => {
                                            if (!modalSearch) return true;
                                            const query = modalSearch.toLowerCase();
                                            return c.name.toLowerCase().includes(query) || (c.phone || '').includes(query);
                                        })
                                        ?.map(c => (
                                            <tr key={c.contactId} style={{ borderBottom: '1px solid #f8fafc' }}>
                                                <td style={{ padding: '10px 6px', fontWeight: 600, color: '#0f172a' }}>{c.name}</td>
                                                <td style={{ padding: '10px 6px', color: '#64748b', fontFamily: 'monospace', fontSize: '0.78rem' }}>{c.phone}</td>
                                                <td style={{ padding: '10px 6px', textAlign: 'center' }}>
                                                    {c.wasCalled ? (
                                                        <span style={{ fontSize: '0.68rem', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', borderRadius: '999px', padding: '2px 10px', fontWeight: 700 }}>
                                                            ✓ Arandı
                                                        </span>
                                                    ) : (
                                                        <span style={{ fontSize: '0.68rem', background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '999px', padding: '2px 10px', fontWeight: 700 }}>
                                                            ✗ Aranmadı
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '10px 6px', textAlign: 'center' }}>
                                                    {c.wasCalled ? (
                                                        <span style={{ fontWeight: 700, color: '#6366f1' }}>{c.totalCalls}</span>
                                                    ) : (
                                                        <span style={{ color: '#d1d5db' }}>—</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '10px 6px', color: '#64748b', fontSize: '0.76rem' }}>
                                                    {formatDateTime(c.lastCallDate)}
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                            
                            {stats.phoneContactsList
                                ?.filter(c => modalFilter === 'called' ? c.wasCalled : modalFilter === 'notCalled' ? !c.wasCalled : true)
                                ?.filter(c => !modalSearch || c.name.toLowerCase().includes(modalSearch.toLowerCase()) || (c.phone || '').includes(modalSearch))
                                ?.length === 0 && (
                                    <div style={{ textAlign: 'center', color: '#9ca3af', padding: '32px 0', fontSize: '0.85rem' }}>Eşleşen sonuç bulunamadı.</div>
                                )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AramaAnalizi;
