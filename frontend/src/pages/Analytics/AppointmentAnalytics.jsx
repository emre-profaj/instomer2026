/**
 * ═══════════════════════════════════════════════════════════════
 * RANDEVU ANALİZİ
 * ═══════════════════════════════════════════════════════════════
 *
 * Bu sayfa eskiden ActivityListAnalytics'i type="APPOINTMENT" ile
 * kullanıyordu — yani `contact_activities` tablosuna bakıyordu.
 *
 * Oradaki APPOINTMENT kayıtlarının TAMAMINI (1029/1029) tek bir kaynak
 * yazıyor: APPOINTMENT_AUTO_PLAN otomasyonu. Botla, takvimden elle veya
 * sesli botla açılan randevular doğrudan createAppointment() tek kapısına
 * gidiyor ve hiç aktivite kaydı üretmiyor.
 *
 * Sonuç: sayfa hem eksik hem fazla sayıyordu (Eylül 2026 ölçümü):
 *   Özemeksan       9 randevu →   0 görünüyordu
 *   Auto Uce        2 randevu →   0 görünüyordu
 *   Metropol S.G.  90 randevu → 123 görünüyordu (randevusuz otomasyon kaydı)
 *
 * Artık doğrudan `appointments` tablosunu okuyor — takvimde ne varsa o.
 */
import React, { useState, useEffect } from 'react';
import {
    Calendar, CheckCircle2, Clock, RefreshCw, Search, X,
    MessageSquare, FileText, Filter, Bot, UserX
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast/Toast';
import { appointmentAPI } from '../../services/api';
import { getDateRangeLogic, dateFilterOptions } from '../../utils/dateFilters';
import './AramaAnalizi.css';
import '../CeoReport/CeoReport.css';
import '../CeoReport/CeoDetailReport.css';

// Takvimdeki durumlarla birebir aynı — orada ne yazıyorsa burada da o yazsın
const STATUS_UI = {
    SCHEDULED:            { label: '⏳ Planlandı',    color: '#c2410c', bg: '#fff7ed', border: '#fdba74' },
    PENDING_CONFIRMATION: { label: '⚠️ Teyit Bekliyor', color: '#92400e', bg: '#fffbeb', border: '#fcd34d' },
    COMPLETED:            { label: '✓ Tamamlandı',   color: '#15803d', bg: '#dcfce7', border: '#86efac' },
    CANCELLED:            { label: '✗ İptal',        color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
    NO_SHOW:              { label: '⊘ Gelmedi',      color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd' },
};
const statusUi = (s) => STATUS_UI[s] || { label: s || '—', color: '#475569', bg: '#f8fafc', border: '#e2e8f0' };

const AppointmentAnalytics = () => {
    const { currentWorkspace } = useAuth();
    const { showError } = useToast();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [appointments, setAppointments] = useState([]);

    const [dateFilter, setDateFilter] = useState('thisMonth');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    // Randevu tarihi mi, kayıt tarihi mi? İkisi farklı soru:
    // "bu ay hangi randevular var" ≠ "bu ay kaç randevu aldık"
    const [dateField, setDateField] = useState('startTime');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (currentWorkspace?.id) loadData();
    }, [currentWorkspace?.id, dateFilter, startDate, endDate, dateField]);

    const loadData = async (isRefresh = false) => {
        try {
            if (isRefresh) setRefreshing(true); else setLoading(true);

            const { startDate: sd, endDate: ed } = getDateRangeLogic(dateFilter, startDate, endDate);
            const params = { dateField };
            if (sd) params.startDate = sd;
            if (ed) params.endDate = ed;

            const res = await appointmentAPI.getAll(currentWorkspace.id, params);
            setAppointments(res.data?.appointments || []);
        } catch (error) {
            console.error('Randevular yüklenemedi:', error);
            showError('Veriler yüklenirken bir hata oluştu.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const formatDateTime = (dateStr) => {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleString('tr-TR', {
            timeZone: 'Europe/Istanbul',
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
        });
    };

    const filtered = appointments.filter(a => {
        if (!searchTerm) return true;
        const t = searchTerm.toLowerCase();
        return (
            (a.contactName || '').toLowerCase().includes(t) ||
            (a.contactPhone || '').includes(t) ||
            (a.assignedTo?.name || '').toLowerCase().includes(t) ||
            (a.title || '').toLowerCase().includes(t) ||
            (a.branch || '').toLowerCase().includes(t)
        );
    });

    const count = (s) => appointments.filter(a => a.status === s).length;
    const summary = {
        total: appointments.length,
        completed: count('COMPLETED'),
        planned: count('SCHEDULED') + count('PENDING_CONFIRMATION'),
        cancelled: count('CANCELLED'),
        noShow: count('NO_SHOW'),
    };

    if (loading && appointments.length === 0) {
        return (
            <div className="arama-analizi-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', color: '#6366f1' }}>
                    <RefreshCw className="spin" size={40} style={{ marginBottom: 12 }} />
                    <p style={{ fontWeight: 600 }}>Randevu Analizi Yükleniyor...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="arama-analizi-container">
            <div className="ceo-detail-header">
                <div className="ceo-detail-header-left">
                    <h1>Randevu Analizi</h1>
                    <p>Takvimdeki tüm randevular — bot, temsilci ve otomasyon dahil</p>
                </div>
            </div>

            <div className="ceo-filter-bar">
                <div className="ceo-filter-left">
                    <div className="ceo-filter-label"><Filter size={14} /><span>Filtreler</span></div>
                    <div className="ceo-pill-group">
                        {dateFilterOptions.map(item => (
                            <button key={item.key} className={`ceo-pill${dateFilter === item.key ? ' active' : ''}`}
                                onClick={() => setDateFilter(item.key)}>{item.label}</button>
                        ))}
                    </div>
                    {dateFilter === 'custom' && (
                        <div className="ceo-custom-dates">
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="ceo-date-input" />
                            <span style={{ color: '#9ca3af' }}>—</span>
                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="ceo-date-input" />
                        </div>
                    )}
                    <div className="ceo-pill-group" style={{ marginLeft: '8px' }}>
                        <button className={`ceo-pill${dateField === 'startTime' ? ' active' : ''}`}
                            title="Randevunun yapılacağı tarihe göre"
                            onClick={() => setDateField('startTime')}>Randevu tarihi</button>
                        <button className={`ceo-pill${dateField === 'createdAt' ? ' active' : ''}`}
                            title="Randevunun sisteme girildiği tarihe göre"
                            onClick={() => setDateField('createdAt')}>Kayıt tarihi</button>
                    </div>
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

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-card-icon" style={{ background: '#eef2ff', color: '#6366f1' }}><Calendar size={22} /></div>
                    <div className="stat-card-info">
                        <span className="stat-card-label">Toplam Randevu</span>
                        <span className="stat-card-value">{summary.total}</span>
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
                    <div className="stat-card-icon" style={{ background: '#f5f3ff', color: '#7c3aed' }}><UserX size={22} /></div>
                    <div className="stat-card-info">
                        <span className="stat-card-label">Gelmedi</span>
                        <span className="stat-card-value" style={{ color: '#7c3aed' }}>{summary.noShow}</span>
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

            <div className="content-section">
                <div className="section-header">
                    <h2>Randevu Listesi</h2>
                    <div className="section-actions">
                        <div className="search-box">
                            <Search size={16} />
                            <input type="text" placeholder="Kişi, temsilci, hizmet veya branş ara..."
                                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        </div>
                    </div>
                </div>

                <div className="table-responsive">
                    <table className="modern-table" style={{ fontSize: '0.82rem' }}>
                        <thead>
                            <tr>
                                <th>Kişi Adı</th>
                                <th>Randevu</th>
                                <th>Temsilci / Bot</th>
                                <th>Randevu Tarihi</th>
                                <th>Kayıt Tarihi</th>
                                <th style={{ textAlign: 'center' }}>Durum</th>
                                <th>Not</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                                        <MessageSquare size={32} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                                        Bu aralıkta randevu bulunamadı.
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((a) => {
                                    const ui = statusUi(a.status);
                                    return (
                                        <tr key={a.id}>
                                            <td>
                                                <div style={{ fontWeight: 700, color: '#0f172a' }}>{a.contactName || 'Bilinmiyor'}</div>
                                                <div style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace' }}>{a.contactPhone || ''}</div>
                                            </td>
                                            <td>
                                                <div style={{ color: '#334155' }}>{a.title || '—'}</div>
                                                {(a.branch || a.doctorName) && (
                                                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                                        {[a.branch, a.doctorName].filter(Boolean).join(' · ')}
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                {a.assignedTo ? (
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                        fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: '12px',
                                                        background: a.assignedTo.isBot ? '#f0f9ff' : '#eef2ff',
                                                        color: a.assignedTo.isBot ? '#0369a1' : '#6366f1'
                                                    }}>
                                                        {a.assignedTo.isBot && <Bot size={11} />}
                                                        {a.assignedTo.name}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#cbd5e1', fontSize: '0.78rem' }}>Atanmamış</span>
                                                )}
                                            </td>
                                            <td>
                                                <span style={{ color: '#0f172a', fontSize: '0.76rem', fontWeight: 600 }}>
                                                    {formatDateTime(a.startTime)}
                                                </span>
                                            </td>
                                            <td>
                                                <span style={{ color: '#64748b', fontSize: '0.76rem' }}>
                                                    {formatDateTime(a.createdAt)}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <span style={{
                                                    fontSize: '0.68rem', background: ui.bg, color: ui.color,
                                                    border: `1px solid ${ui.border}`, borderRadius: '999px',
                                                    padding: '2px 10px', fontWeight: 700, whiteSpace: 'nowrap'
                                                }}>
                                                    {ui.label}
                                                </span>
                                            </td>
                                            <td>
                                                {a.notes || a.description ? (
                                                    <span style={{ fontSize: '0.76rem', color: '#334155', fontStyle: 'italic' }}
                                                        title={a.notes || a.description}>
                                                        "{(a.notes || a.description).length > 50
                                                            ? (a.notes || a.description).substring(0, 50) + '...'
                                                            : (a.notes || a.description)}"
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

export default AppointmentAnalytics;
