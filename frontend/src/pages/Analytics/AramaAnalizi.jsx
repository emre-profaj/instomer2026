import React, { useState, useEffect } from 'react';
import { 
    Users, PhoneCall, CheckCircle2, PhoneOff, Phone, 
    TrendingUp, Calendar, Clock, RefreshCw, Trash2, 
    Search, FileText, AlertCircle, X, ChevronRight, MessageSquare 
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast/Toast';
import api, { contactAPI, retellAPI, funnelAPI } from '../../services/api';
import { activityAPI } from '../../services/activity.api';
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
    
    // Note Modal States
    const [noteModalOpen, setNoteModalOpen] = useState(false);
    const [noteContactId, setNoteContactId] = useState(null);
    const [noteSuccess, setNoteSuccess] = useState(null);
    const [noteSentiment, setNoteSentiment] = useState(null);
    const [noteDesc, setNoteDesc] = useState('');
    const [noteSaving, setNoteSaving] = useState(false);

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

    const handleOpenNoteModal = (contactId) => {
        setNoteContactId(contactId);
        setNoteSuccess(null);
        setNoteSentiment(null);
        setNoteDesc('');
        setNoteModalOpen(true);
    };

    const handleSaveNote = async () => {
        if (!noteSuccess) {
            showError('Lütfen aramanın durumunu (Ulaşıldı / Ulaşılamadı) seçin.');
            return;
        }
        if (noteSuccess === 'SUCCESS' && !noteSentiment) {
            showError('Lütfen görüşmenin nasıl geçtiğini seçin.');
            return;
        }
        
        setNoteSaving(true);
        try {
            const dataToSave = {
                workspaceId: currentWorkspace.id,
                type: 'CALL',
                title: 'Telefon Görüşmesi',
                description: noteSuccess === 'FAILED' ? `📵 Ulaşılamadı: ${noteDesc}` : noteDesc,
                dueDate: new Date().toISOString(),
                assignedToId: null,
                teamId: null,
                status: 'COMPLETED',
                completedAt: new Date().toISOString(),
                callSuccessful: noteSuccess === 'SUCCESS',
                ...(noteSentiment && noteSuccess === 'SUCCESS' && { callSentiment: noteSentiment }),
                completePlannedCall: true
            };

            await activityAPI.createActivity(noteContactId, dataToSave);
            
            showSuccess('Arama notu başarıyla eklendi.');
            setNoteModalOpen(false);
            loadAllData(false);
        } catch (error) {
            console.error('Not eklenirken hata:', error);
            showError('Not eklenirken bir hata oluştu.');
        } finally {
            setNoteSaving(false);
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

    // Calculate new metrics requested by user
    const callListAll = stats.activities || [];
    const totalPositive = callListAll.filter(a => a.callSentiment === 'Positive').length;
    const totalNegative = callListAll.filter(a => a.callSentiment === 'Negative').length;
    const totalReached = callListAll.filter(a => a.callSuccessful === true).length;
    const totalNotReached = callListAll.filter(a => a.callSuccessful === false).length;
    const totalCompleted = callListAll.filter(a => a.status === 'COMPLETED').length;
    const totalPending = callListAll.filter(a => a.status !== 'COMPLETED' && a.status !== 'CANCELLED').length;


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

            <div className="stats-grid" style={{ marginTop: '16px' }}>
                <div className="stat-card">
                    <div className="stat-card-icon" style={{ background: '#dcfce7', color: '#15803d' }}>
                        <TrendingUp size={22} />
                    </div>
                    <div className="stat-card-info">
                        <span className="stat-card-label">Olumlu / Olumsuz</span>
                        <span className="stat-card-value">
                            <span style={{ color: '#15803d' }}>{totalPositive}</span> / <span style={{ color: '#dc2626' }}>{totalNegative}</span>
                        </span>
                        <span className="stat-card-desc">Görüşme değerlendirmesi</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-card-icon" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                        <PhoneCall size={22} />
                    </div>
                    <div className="stat-card-info">
                        <span className="stat-card-label">Ulaşılan / Ulaşılamayan</span>
                        <span className="stat-card-value">
                            <span style={{ color: '#0369a1' }}>{totalReached}</span> / <span style={{ color: '#dc2626' }}>{totalNotReached}</span>
                        </span>
                        <span className="stat-card-desc">Çağrı yanıtlanma durumu</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-card-icon" style={{ background: '#f3e8ff', color: '#7e22ce' }}>
                        <AlertCircle size={22} />
                    </div>
                    <div className="stat-card-info">
                        <span className="stat-card-label">Kapatıldı / Aranacak</span>
                        <span className="stat-card-value">
                            <span style={{ color: '#15803d' }}>{totalCompleted}</span> / <span style={{ color: '#ea580c' }}>{totalPending}</span>
                        </span>
                        <span className="stat-card-desc">Kapatılan vs bekleyen kayıt</span>
                    </div>
                </div>
            </div>

            {/* Split panels: Delayed Calls & Closed Call Notes removed as requested */}

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
                                    <th>Tarih</th>
                                    <th>Temsilci</th>
                                    <th>Müşteri</th>
                                    <th>Konu</th>
                                    <th style={{ textAlign: 'center' }}>Durum</th>
                                    <th style={{ textAlign: 'center' }}>Ulaşılabilirlik</th>
                                    <th style={{ textAlign: 'center' }}>Değerlendirme</th>
                                    <th>Arama Notu</th>
                                    <th style={{ textAlign: 'center', width: '130px' }}>İşlem</th>
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
                                                    <span style={{ color: '#64748b', fontSize: '0.76rem' }}>
                                                        {formatDateTime(a.completedAt || a.dueDate || a.createdAt)}
                                                    </span>
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
                                                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{a.contact?.name || 'Bilinmiyor'}</div>
                                                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace' }}>{a.contact?.phone || ''}</div>
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
                                                <td style={{ textAlign: 'center' }}>
                                                    {isCompleted ? (
                                                        <span style={{ fontSize: '0.68rem', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', borderRadius: '999px', padding: '2px 10px', fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-block' }}>✓ Tamamlandı</span>
                                                    ) : isPlanned ? (
                                                        <span style={{ fontSize: '0.68rem', background: '#fff7ed', color: '#c2410c', border: '1px solid #fdba74', borderRadius: '999px', padding: '2px 10px', fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-block' }}>⏳ Bekliyor</span>
                                                    ) : (
                                                        <span style={{ fontSize: '0.68rem', background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '999px', padding: '2px 10px', fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-block' }}>✗ İptal</span>
                                                    )}
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    {a.callSuccessful === true ? (
                                                        <span style={{ fontSize: '0.68rem', background: '#e0f2fe', color: '#0369a1', border: '1px solid #7dd3fc', borderRadius: '999px', padding: '2px 10px', fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-block' }}>✓ Ulaşıldı</span>
                                                    ) : a.callSuccessful === false ? (
                                                        <span style={{ fontSize: '0.68rem', background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '999px', padding: '2px 10px', fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-block' }}>✗ Ulaşılamadı</span>
                                                    ) : (
                                                        <span style={{ color: '#cbd5e1' }}>—</span>
                                                    )}
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    {a.callSentiment === 'Positive' ? (
                                                        <span style={{ fontSize: '0.68rem', color: '#15803d', fontWeight: 600 }}>😊 Olumlu</span>
                                                    ) : a.callSentiment === 'Negative' ? (
                                                        <span style={{ fontSize: '0.68rem', color: '#dc2626', fontWeight: 600 }}>😔 Olumsuz</span>
                                                    ) : a.callSentiment === 'Neutral' ? (
                                                        <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>😐 Nötr</span>
                                                    ) : (
                                                        <span style={{ color: '#cbd5e1' }}>—</span>
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
                                                <td style={{ textAlign: 'center' }}>
                                                    <button 
                                                        className="btn btn-outline" 
                                                        style={{ padding: '4px 8px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                        onClick={() => handleOpenNoteModal(a.contact?.id || a.contactId)}
                                                    >
                                                        <FileText size={12} />
                                                        Not Ekle
                                                    </button>
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
                                    <th style={{ textAlign: 'center', width: '130px' }}>İşlem</th>
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
                                                <td style={{ textAlign: 'center' }}>
                                                    <button 
                                                        className="btn btn-outline" 
                                                        style={{ padding: '4px 8px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                        onClick={() => handleOpenNoteModal(c.contactId)}
                                                    >
                                                        <FileText size={12} />
                                                        Not Ekle
                                                    </button>
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

            {/* Arama Notu Ekle Modal */}
            {noteModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-backdrop" onClick={() => setNoteModalOpen(false)} />
                    <div className="modal-container" style={{ maxWidth: '450px' }}>
                        <div className="modal-header">
                            <div className="modal-header-info">
                                <h3>Arama Notu Ekle</h3>
                                <p>Müşteri aramasıyla ilgili detayları girin</p>
                            </div>
                            <button className="modal-close-btn" onClick={() => setNoteModalOpen(false)}>
                                <X size={16} />
                            </button>
                        </div>
                        
                        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
                                    Arama Durumu
                                </label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button 
                                        onClick={() => setNoteSuccess('SUCCESS')}
                                        style={{ flex: 1, padding: '10px', borderRadius: '8px', border: `1px solid ${noteSuccess === 'SUCCESS' ? '#10b981' : '#e2e8f0'}`, background: noteSuccess === 'SUCCESS' ? '#ecfdf5' : 'white', color: noteSuccess === 'SUCCESS' ? '#047857' : '#475569', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                                    >
                                        ✓ Ulaşıldı
                                    </button>
                                    <button 
                                        onClick={() => setNoteSuccess('FAILED')}
                                        style={{ flex: 1, padding: '10px', borderRadius: '8px', border: `1px solid ${noteSuccess === 'FAILED' ? '#ef4444' : '#e2e8f0'}`, background: noteSuccess === 'FAILED' ? '#fef2f2' : 'white', color: noteSuccess === 'FAILED' ? '#b91c1c' : '#475569', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                                    >
                                        ✗ Ulaşılamadı
                                    </button>
                                </div>
                            </div>

                            {noteSuccess === 'SUCCESS' && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
                                        Görüşme Nasıl Geçti?
                                    </label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button 
                                            onClick={() => setNoteSentiment('Positive')}
                                            style={{ flex: 1, padding: '8px', borderRadius: '8px', border: `1px solid ${noteSentiment === 'Positive' ? '#10b981' : '#e2e8f0'}`, background: noteSentiment === 'Positive' ? '#ecfdf5' : 'white', color: noteSentiment === 'Positive' ? '#047857' : '#475569', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                                        >
                                            😊 Olumlu
                                        </button>
                                        <button 
                                            onClick={() => setNoteSentiment('Neutral')}
                                            style={{ flex: 1, padding: '8px', borderRadius: '8px', border: `1px solid ${noteSentiment === 'Neutral' ? '#6366f1' : '#e2e8f0'}`, background: noteSentiment === 'Neutral' ? '#eef2ff' : 'white', color: noteSentiment === 'Neutral' ? '#4338ca' : '#475569', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                                        >
                                            😐 Nötr
                                        </button>
                                        <button 
                                            onClick={() => setNoteSentiment('Negative')}
                                            style={{ flex: 1, padding: '8px', borderRadius: '8px', border: `1px solid ${noteSentiment === 'Negative' ? '#ef4444' : '#e2e8f0'}`, background: noteSentiment === 'Negative' ? '#fef2f2' : 'white', color: noteSentiment === 'Negative' ? '#b91c1c' : '#475569', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                                        >
                                            😔 Olumsuz
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
                                    Arama Notu
                                </label>
                                <textarea 
                                    className="modal-search"
                                    style={{ width: '100%', minHeight: '100px', resize: 'vertical' }}
                                    placeholder="Görüşme ile ilgili notlarınızı buraya yazın..."
                                    value={noteDesc}
                                    onChange={(e) => setNoteDesc(e.target.value)}
                                ></textarea>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '16px 24px', borderTop: '1px solid #f1f5f9' }}>
                            <button className="btn btn-outline" onClick={() => setNoteModalOpen(false)}>İptal</button>
                            <button className="btn btn-primary" disabled={noteSaving || !noteSuccess || (noteSuccess === 'SUCCESS' && !noteSentiment)} onClick={handleSaveNote}>
                                {noteSaving ? 'Kaydediliyor...' : 'Notu Kaydet'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AramaAnalizi;
