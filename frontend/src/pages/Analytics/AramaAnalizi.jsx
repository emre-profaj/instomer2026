import React, { useState, useEffect } from 'react';
import { 
    Users, PhoneCall, CheckCircle2, PhoneOff, Phone, 
    TrendingUp, Calendar, Clock, RefreshCw, Trash2, 
    Search, FileText, AlertCircle, X, ChevronRight, MessageSquare, Filter 
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast/Toast';
import api, { contactAPI, retellAPI, funnelAPI } from '../../services/api';
import { activityAPI } from '../../services/activity.api';
import { getDateRangeLogic, dateFilterOptions } from '../../utils/dateFilters';
import '../CeoReport/CeoReport.css';
import '../CeoReport/CeoDetailReport.css';
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
    const [dateFilter, setDateFilter] = useState(() => sessionStorage.getItem('aramaDateFilter') || 'thisMonth');
    const [startDate, setStartDate] = useState(() => sessionStorage.getItem('aramaStartDate') || '');
    const [endDate, setEndDate] = useState(() => sessionStorage.getItem('aramaEndDate') || '');

    useEffect(() => {
        sessionStorage.setItem('aramaDateFilter', dateFilter);
        sessionStorage.setItem('aramaStartDate', startDate);
        sessionStorage.setItem('aramaEndDate', endDate);
    }, [dateFilter, startDate, endDate]);

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
    }, [currentWorkspace?.id, dateFilter, startDate, endDate]);

    const getDateRange = () => {
        const range = getDateRangeLogic(dateFilter, startDate, endDate);
        return { startDate: range.startDate, endDate: range.endDate };
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
            <div className="ceo-detail-header" style={{ marginBottom: 0 }}>
                <div className="ceo-detail-header-left">
                    <h1><PhoneCall size={24} style={{ color: '#6366f1' }} /> Arama Analizi</h1>
                    <p>Telefon aramaları, gecikmiş aramalar ve müşteri görüşme notları</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button className="ceo-refresh-btn" onClick={() => loadAllData(true)} disabled={refreshing}>
                        <RefreshCw className={refreshing ? 'spin' : ''} size={14} /> Güncelle
                    </button>
                    <button className="ceo-refresh-btn" onClick={() => window.print()} style={{ background: '#6366f1', color: 'white' }}>
                        <FileText size={14} /> Raporu İndir
                    </button>
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
                    <div className="contacts-table-container" style={{ marginTop: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'auto' }}>
                        <table className="contacts-table" style={{ width: '100%' }}>
                            <thead>
                                <tr>
                                    <th style={{ width: '40px', paddingLeft: '12px', paddingRight: '4px' }}>Tarih</th>
                                    <th style={{ padding: '8px 4px' }}>Temsilci</th>
                                    <th style={{ padding: '8px 4px' }}>Müşteri</th>
                                    <th style={{ padding: '8px 4px' }}>Konu</th>
                                    <th style={{ padding: '8px 4px' }}>Aşama</th>
                                    <th style={{ padding: '8px 4px' }}>Durum</th>
                                    <th style={{ padding: '8px 4px' }}>Ulaşılabilirlik</th>
                                    <th style={{ padding: '8px 4px' }}>Değerlendirme</th>
                                    <th style={{ padding: '8px 4px' }}>Arama Notu</th>
                                    <th style={{ textAlign: 'right', paddingRight: '12px', paddingLeft: '4px' }}>İşlem</th>
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
                                                ((a.contact?.activeAssigneeName || a.contact?.assigneeName) || '').toLowerCase().includes(q)
                                            );
                                        })
                                        .sort((a, b) => new Date(b.dueDate || b.createdAt) - new Date(a.dueDate || a.createdAt));

                                    if (callList.length === 0) {
                                        return (
                                            <tr>
                                                <td colSpan="9" style={{ textAlign: 'center', color: '#94a3b8', padding: '30px 0' }}>
                                                    Eşleşen sonuç bulunamadı.
                                                </td>
                                            </tr>
                                        );
                                    }
                                    return callList.map(a => {
                                        const isCompleted = a.status === 'COMPLETED';
                                        const isPlanned = a.status === 'PLANNED';
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
                                                <td style={{ paddingLeft: '12px', paddingRight: '4px', color: '#64748b', fontSize: '0.76rem' }}>
                                                    {formatDateTime(a.completedAt || a.dueDate || a.createdAt)}
                                                </td>
                                                <td style={{ padding: '8px 4px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        {a.contact?.activeAssigneeName || a.contact?.assigneeName ? (
                                                            <>
                                                                <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#e0e7ff', color: '#4338ca', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700 }}>
                                                                    {(a.contact.activeAssigneeName || a.contact.assigneeName).substring(0, 2).toUpperCase()}
                                                                </div>
                                                                <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 500 }}>
                                                                    {a.contact.activeAssigneeName || a.contact.assigneeName}
                                                                </span>
                                                            </>
                                                        ) : (
                                                            <span style={{ color: '#cbd5e1', fontSize: '0.7rem' }}>Atanmamış</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '8px 4px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>
                                                            {a.contact?.name ? a.contact.name.charAt(0).toUpperCase() : '👤'}
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.8rem' }}>{a.contact?.name || 'Bilinmiyor'}</div>
                                                            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{a.contact?.phone || '-'}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '8px 4px', maxWidth: '120px' }}>
                                                    {a.contact?.aiTopic ? (
                                                        <span style={{
                                                            display: 'inline-block',
                                                            padding: '2px 6px',
                                                            backgroundColor: '#f0f9ff',
                                                            color: '#0369a1',
                                                            borderRadius: '4px',
                                                            fontSize: '0.7rem',
                                                            fontWeight: 500,
                                                            maxWidth: '100%',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap'
                                                        }}>
                                                            {a.contact.aiTopic}
                                                        </span>
                                                    ) : <span style={{color: '#94a3b8'}}>---</span>}
                                                </td>
                                                <td style={{ padding: '8px 4px' }}>
                                                    {stageName ? (
                                                        <span style={{ fontSize: '0.7rem', padding: '4px 8px', borderRadius: '999px', background: `${stageColor}1a`, color: stageColor, fontWeight: 600, border: `1px solid ${stageColor}33`, display: 'inline-block', whiteSpace: 'nowrap' }}>
                                                            {stageName}
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#d1d5db' }}>—</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '8px 4px' }}>
                                                    {isCompleted ? (
                                                        <span style={{ fontSize: '0.7rem', background: '#dcfce7', color: '#15803d', borderRadius: '999px', padding: '4px 8px', fontWeight: 600, display: 'inline-block', whiteSpace: 'nowrap' }}>✓ Tamamlandı</span>
                                                    ) : isPlanned ? (
                                                        <span style={{ fontSize: '0.7rem', background: '#fff7ed', color: '#c2410c', borderRadius: '999px', padding: '4px 8px', fontWeight: 600, display: 'inline-block', whiteSpace: 'nowrap' }}>⏳ Bekliyor</span>
                                                    ) : (
                                                        <span style={{ fontSize: '0.7rem', background: '#fef2f2', color: '#dc2626', borderRadius: '999px', padding: '4px 8px', fontWeight: 600, display: 'inline-block', whiteSpace: 'nowrap' }}>✗ İptal</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '8px 4px' }}>
                                                    {a.callSuccessful === true ? (
                                                        <span style={{ fontSize: '0.7rem', background: '#e0f2fe', color: '#0369a1', borderRadius: '999px', padding: '4px 8px', fontWeight: 600, display: 'inline-block', whiteSpace: 'nowrap' }}>✓ Ulaşıldı</span>
                                                    ) : a.callSuccessful === false ? (
                                                        <span style={{ fontSize: '0.7rem', background: '#fef2f2', color: '#dc2626', borderRadius: '999px', padding: '4px 8px', fontWeight: 600, display: 'inline-block', whiteSpace: 'nowrap' }}>✗ Ulaşılamadı</span>
                                                    ) : (
                                                        <span style={{ color: '#cbd5e1' }}>—</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '8px 4px' }}>
                                                    {a.callSentiment === 'Positive' ? (
                                                        <span style={{ fontSize: '0.7rem', color: '#15803d', fontWeight: 600, whiteSpace: 'nowrap' }}>😊 Olumlu</span>
                                                    ) : a.callSentiment === 'Negative' ? (
                                                        <span style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: 600, whiteSpace: 'nowrap' }}>😔 Olumsuz</span>
                                                    ) : a.callSentiment === 'Neutral' ? (
                                                        <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>😐 Nötr</span>
                                                    ) : (
                                                        <span style={{ color: '#cbd5e1' }}>—</span>
                                                    )}
                                                </td>
                                                <td style={{ maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.75rem', color: '#334155', fontStyle: 'italic', padding: '8px 4px' }}>
                                                    {a.result ? `"${a.result}"` : '—'}
                                                </td>
                                                <td style={{ textAlign: 'right', paddingRight: '12px', paddingLeft: '4px' }}>
                                                    <button 
                                                        className="btn btn-sm btn-outline" 
                                                        style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
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
                    <div className="contacts-table-container" style={{ marginTop: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'auto' }}>
                        <table className="contacts-table" style={{ width: '100%' }}>
                            <thead>
                                <tr>
                                    <th style={{ paddingLeft: '12px', paddingRight: '4px' }}>Kişi Adı</th>
                                    <th style={{ padding: '8px 4px' }}>Telefon</th>
                                    <th style={{ padding: '8px 4px' }}>Firma</th>
                                    <th style={{ padding: '8px 4px' }}>Temsilci</th>
                                    <th style={{ padding: '8px 4px' }}>Konu</th>
                                    <th style={{ padding: '8px 4px' }}>Aşama / Durum</th>
                                    <th style={{ padding: '8px 4px' }}>Kayıt Tarihi</th>
                                    <th style={{ textAlign: 'right', paddingRight: '12px', paddingLeft: '4px' }}>İşlem</th>
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
                                                <td colSpan="6" style={{ textAlign: 'center', color: '#94a3b8', padding: '30px 0' }}>
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
                                                <td style={{ paddingLeft: '12px', paddingRight: '4px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>
                                                            {c.name ? c.name.charAt(0).toUpperCase() : '👤'}
                                                        </div>
                                                        <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.8rem' }}>{c.name}</div>
                                                    </div>
                                                </td>
                                                <td style={{ fontFamily: 'monospace', color: '#475569', fontSize: '0.75rem', padding: '8px 4px' }}>
                                                    {c.phone}
                                                </td>
                                                <td style={{ color: '#475569', fontSize: '0.75rem', padding: '8px 4px' }}>
                                                    {c.company || '—'}
                                                </td>
                                                <td style={{ padding: '8px 4px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        {c.activeAssigneeName || c.assigneeName ? (
                                                            <>
                                                                <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#e0e7ff', color: '#4338ca', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700 }}>
                                                                    {(c.activeAssigneeName || c.assigneeName).substring(0, 2).toUpperCase()}
                                                                </div>
                                                                <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 500 }}>
                                                                    {c.activeAssigneeName || c.assigneeName}
                                                                </span>
                                                            </>
                                                        ) : (
                                                            <span style={{ color: '#cbd5e1', fontSize: '0.7rem' }}>Atanmamış</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '8px 4px', maxWidth: '120px' }}>
                                                    {c.aiTopic ? (
                                                        <span style={{
                                                            display: 'inline-block',
                                                            padding: '2px 6px',
                                                            backgroundColor: '#f0f9ff',
                                                            color: '#0369a1',
                                                            borderRadius: '4px',
                                                            fontSize: '0.7rem',
                                                            fontWeight: 500,
                                                            maxWidth: '100%',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap'
                                                        }}>
                                                            {c.aiTopic}
                                                        </span>
                                                    ) : <span style={{color: '#94a3b8'}}>---</span>}
                                                </td>
                                                <td style={{ padding: '8px 4px' }}>
                                                    {stageName ? (
                                                        <span style={{ fontSize: '0.7rem', background: `${stageColor}1a`, color: stageColor, padding: '4px 8px', borderRadius: '999px', fontWeight: 600, border: `1px solid ${stageColor}33`, whiteSpace: 'nowrap' }}>
                                                            {stageName}
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#cbd5e1' }}>—</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '8px 4px' }}>
                                                    <span style={{ color: '#64748b', fontSize: '0.7rem' }}>
                                                        {formatDateTime(c.createdAt)}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'right', paddingRight: '12px', paddingLeft: '4px' }}>
                                                    <button 
                                                        className="btn btn-sm btn-outline" 
                                                        style={{ padding: '4px 8px', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
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
            {/* Arama Notları Raporu */}
            {analytics?.callTrackingStats?.closureNotes?.length > 0 && (
                <div className="call-notes-report" style={{ marginTop: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                            📝 Arama Notları
                            <span style={{ background: '#6366f1', color: 'white', borderRadius: '12px', padding: '2px 10px', fontSize: '0.75rem', fontWeight: 600 }}>
                                {analytics.callTrackingStats.closureNotes.length}
                            </span>
                        </h2>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {(() => {
                                const notes = analytics.callTrackingStats.closureNotes;
                                const successful = notes.filter(n => n.callSuccessful === true).length;
                                const failed = notes.filter(n => n.callSuccessful === false).length;
                                const positive = notes.filter(n => n.callSentiment === 'Positive').length;
                                const negative = notes.filter(n => n.callSentiment === 'Negative').length;
                                const neutral = notes.filter(n => n.callSentiment === 'Neutral').length;
                                return (
                                    <>
                                        <span style={{ background: '#dcfce7', color: '#16a34a', borderRadius: '8px', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 600 }}>✅ Ulaşıldı: {successful}</span>
                                        <span style={{ background: '#fee2e2', color: '#dc2626', borderRadius: '8px', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 600 }}>❌ Ulaşılamadı: {failed}</span>
                                        {positive > 0 && <span style={{ background: '#dbeafe', color: '#2563eb', borderRadius: '8px', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 600 }}>😊 Olumlu: {positive}</span>}
                                        {negative > 0 && <span style={{ background: '#fef3c7', color: '#d97706', borderRadius: '8px', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 600 }}>😞 Olumsuz: {negative}</span>}
                                        {neutral > 0 && <span style={{ background: '#f1f5f9', color: '#64748b', borderRadius: '8px', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 600 }}>😐 Nötr: {neutral}</span>}
                                    </>
                                );
                            })()}
                        </div>
                    </div>

                    <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 600, color: '#64748b' }}>Tarih</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 600, color: '#64748b' }}>Temsilci</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 600, color: '#64748b' }}>Müşteri</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: '0.78rem', fontWeight: 600, color: '#64748b' }}>Durum</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: '0.78rem', fontWeight: 600, color: '#64748b' }}>Duygu</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 600, color: '#64748b' }}>Not</th>
                                </tr>
                            </thead>
                            <tbody>
                                {analytics.callTrackingStats.closureNotes.map(note => (
                                    <tr key={note.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '10px 14px', fontSize: '0.82rem', color: '#475569', whiteSpace: 'nowrap' }}>
                                            {new Date(note.completedAt || note.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                            <br />
                                            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                                {new Date(note.completedAt || note.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px 14px', fontSize: '0.82rem', color: '#1e293b', fontWeight: 500 }}>
                                            {note.assignee?.name || note.creator?.name || '—'}
                                        </td>
                                        <td style={{ padding: '10px 14px', fontSize: '0.82rem', color: '#1e293b' }}>
                                            {note.contact?.name || '—'}
                                        </td>
                                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                            {note.callSuccessful ? (
                                                <span style={{ background: '#dcfce7', color: '#16a34a', borderRadius: '6px', padding: '3px 8px', fontSize: '0.72rem', fontWeight: 600 }}>Ulaşıldı</span>
                                            ) : (
                                                <span style={{ background: '#fee2e2', color: '#dc2626', borderRadius: '6px', padding: '3px 8px', fontSize: '0.72rem', fontWeight: 600 }}>Ulaşılamadı</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: '1rem' }}>
                                            {note.callSentiment === 'Positive' ? '😊' : note.callSentiment === 'Negative' ? '😞' : note.callSentiment === 'Neutral' ? '😐' : '—'}
                                        </td>
                                        <td style={{ padding: '10px 14px', fontSize: '0.82rem', color: '#475569', maxWidth: '300px' }}>
                                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                                {note.result || note.description || '—'}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

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
                            <div style={{ marginBottom: '12px' }}>
                                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>📞 Arama Başarılı mı?</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setNoteSuccess('SUCCESS')}
                                        style={{
                                            flex: 1, padding: '10px', borderRadius: '10px', border: '2px solid',
                                            borderColor: noteSuccess === 'SUCCESS' ? '#16a34a' : '#e5e7eb',
                                            background: noteSuccess === 'SUCCESS' ? '#dcfce7' : '#fff',
                                            color: noteSuccess === 'SUCCESS' ? '#15803d' : '#6b7280',
                                            fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                                            transition: 'all 0.2s ease'
                                        }}
                                    >
                                        ✅ Ulaşıldı
                                        <div style={{ fontSize: '0.68rem', fontWeight: 400, marginTop: '2px', opacity: 0.8 }}>Görüşme sağlandı</div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setNoteSuccess('FAILED'); setNoteSentiment(null); }}
                                        style={{
                                            flex: 1, padding: '10px', borderRadius: '10px', border: '2px solid',
                                            borderColor: noteSuccess === 'FAILED' ? '#ef4444' : '#e5e7eb',
                                            background: noteSuccess === 'FAILED' ? '#fef2f2' : '#fff',
                                            color: noteSuccess === 'FAILED' ? '#dc2626' : '#6b7280',
                                            fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                                            transition: 'all 0.2s ease'
                                        }}
                                    >
                                        ❌ Ulaşılamadı
                                        <div style={{ fontSize: '0.68rem', fontWeight: 400, marginTop: '2px', opacity: 0.8 }}>Açmadı veya meşgul</div>
                                    </button>
                                </div>
                            </div>

                            {/* Duygu Analizi */}
                            {noteSuccess !== 'FAILED' && (
                            <div style={{ marginBottom: '12px' }}>
                                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>🎭 Görüşme Nasıl Geçti?</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {[
                                        { key: 'Positive', emoji: '😊', label: 'Olumlu', color: '#16a34a', bg: '#dcfce7' },
                                        { key: 'Neutral', emoji: '😐', label: 'Nötr', color: '#6b7280', bg: '#f3f4f6' },
                                        { key: 'Negative', emoji: '😞', label: 'Olumsuz', color: '#ef4444', bg: '#fef2f2' }
                                    ].map(s => (
                                        <button
                                            key={s.key}
                                            type="button"
                                            onClick={() => setNoteSentiment(s.key)}
                                            style={{
                                                flex: 1, padding: '10px 6px', borderRadius: '10px', border: '2px solid',
                                                borderColor: noteSentiment === s.key ? s.color : '#e5e7eb',
                                                background: noteSentiment === s.key ? s.bg : '#fff',
                                                color: noteSentiment === s.key ? s.color : '#6b7280',
                                                fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                                                transition: 'all 0.2s ease', textAlign: 'center'
                                            }}
                                        >
                                            <div style={{ fontSize: '1.4rem', marginBottom: '2px' }}>{s.emoji}</div>
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            )}

                            <div>
                                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>
                                    📝 Notlar
                                </label>
                                <textarea 
                                    style={{ 
                                        width: '100%', minHeight: '110px', padding: '12px', 
                                        border: '1.5px solid #e5e7eb', borderRadius: '10px',
                                        fontSize: '0.85rem', fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical', outline: 'none'
                                    }}
                                    placeholder="Görüşme detaylarını girin..."
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
