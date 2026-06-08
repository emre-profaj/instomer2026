import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { activityAPI } from '../../services/activity.api';
import { contactAPI } from '../../services/api';
import ContactSidebar from '../../components/ContactSidebar/ContactSidebar';
import '../../components/ContactSidebar/ContactSidebar.css';
import { Phone, Users, Calendar, CheckCircle2, Clock, AlertCircle, CircleDot, PhoneCall, Handshake, ListTodo, CalendarClock, User, Building2, XCircle, FileText, Search, ArrowUpDown, ClipboardList, Edit2, Trash2, Save, X } from 'lucide-react';
import './Activities.css';

const PAGE_CONFIG = {
    calls: {
        type: 'CALL',
        title: 'Aramalar',
        icon: Phone,
        emptyText: 'Planlanmış arama yok',
        color: '#16a34a'
    },
    meetings: {
        type: 'MEETING',
        title: 'Görüşmeler',
        icon: Handshake,
        emptyText: 'Planlanmış görüşme yok',
        color: '#6366f1'
    },
    tasks: {
        type: 'TASK',
        title: 'Görevler',
        icon: ListTodo,
        emptyText: 'Planlanmış görev yok',
        color: '#f59e0b'
    },
    appointments: {
        type: 'APPOINTMENT',
        title: 'Randevular',
        icon: CalendarClock,
        emptyText: 'Planlanmış randevu yok',
        color: '#8b5cf6'
    }
};

const Activities = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { currentWorkspace, user } = useAuth();

    // Determine page type from URL
    const pathSegment = location.pathname.split('/').pop();
    const config = PAGE_CONFIG[pathSegment] || PAGE_CONFIG.calls;

    const [activities, setActivities] = useState([]);
    const [summary, setSummary] = useState({ planned: 0, completed: 0 });
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('PLANNED');
    // Read initial view from URL query params (?view=mine)
    const searchParams = new URLSearchParams(location.search);
    const initialView = searchParams.get('view') || 'all';

    const [viewFilter, setViewFilter] = useState(initialView);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('dueDate_desc'); // dueDate_asc, dueDate_desc, createdAt_asc, createdAt_desc

    // ContactSidebar state
    const [selectedContactId, setSelectedContactId] = useState(null);

    // 3-panel: selected activity for detail panel
    const [selectedActivity, setSelectedActivity] = useState(null);
    const [editNotes, setEditNotes] = useState('');
    const [savingNotes, setSavingNotes] = useState(false);

    const loadActivities = useCallback(async () => {
        if (!currentWorkspace?.id) return;
        try {
            setLoading(true);

            // For "OVERDUE" we still request PLANNED from backend, then client-filter
            const backendStatus = statusFilter === 'OVERDUE' ? 'PLANNED' : statusFilter;

            const filters = {
                type: config.type === 'APPOINTMENT' ? undefined : config.type,
                status: backendStatus !== 'ALL' ? backendStatus : undefined,
                view: viewFilter,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined
            };

            if (config.type === 'APPOINTMENT') {
                // Load from appointments API
                const { appointmentAPI } = await import('../../services/api');
                const res = await appointmentAPI.getAll(currentWorkspace.id, {
                    ...(dateFrom && { startDate: dateFrom }),
                    ...(dateTo && { endDate: dateTo }),
                    ...(backendStatus !== 'ALL' && backendStatus === 'PLANNED' ? { status: 'SCHEDULED' } : {}),
                    ...(backendStatus === 'COMPLETED' ? { status: 'COMPLETED' } : {}),
                    ...(viewFilter === 'mine' && user?.id ? { assignedToId: user.id } : {})
                });
                const appts = res.data?.appointments || [];
                let mapped = appts.map(a => ({
                    ...a,
                    _isAppointment: true,
                    type: 'APPOINTMENT',
                    status: a.status === 'SCHEDULED' ? 'PLANNED' : a.status,
                    dueDate: a.startTime,
                    contact: {
                        id: a.contactId,
                        name: a.contactName || 'Bilinmiyor',
                        phone: a.contactPhone,
                        email: a.contactEmail
                    },
                    assignee: a.assignedTo
                }));

                // Client-side overdue filter
                if (statusFilter === 'OVERDUE') {
                    const now = new Date();
                    mapped = mapped.filter(a => a.status === 'PLANNED' && a.dueDate && new Date(a.dueDate) < now);
                }

                setActivities(mapped);
                const planned = appts.filter(a => a.status === 'SCHEDULED').length;
                const completed = appts.filter(a => a.status === 'COMPLETED').length;
                setSummary({ planned, completed, inProgress: 0, cancelled: appts.filter(a => a.status === 'CANCELLED').length });
            } else {
                // Load from activities API
                const data = await activityAPI.getWorkspaceActivities(currentWorkspace.id, filters);
                let items = data.activities || [];

                // Client-side overdue filter
                if (statusFilter === 'OVERDUE') {
                    const now = new Date();
                    items = items.filter(a => (a.status === 'PLANNED' || a.status === 'IN_PROGRESS') && a.dueDate && new Date(a.dueDate) < now);
                }

                setActivities(items);
                setSummary(data.summary || { planned: 0, completed: 0 });
            }
        } catch (error) {
            console.error('Activities load error:', error);
        } finally {
            setLoading(false);
        }
    }, [currentWorkspace?.id, config.type, statusFilter, viewFilter, dateFrom, dateTo, user?.id]);

    useEffect(() => {
        loadActivities();
    }, [loadActivities]);

    // Reset sidebar when switching pages
    useEffect(() => {
        setSelectedContactId(null);
        setSelectedActivity(null);
    }, [pathSegment]);

    const handleComplete = async (activity, e) => {
        if (e) e.stopPropagation();
        try {
            if (activity._isAppointment) {
                const { appointmentAPI } = await import('../../services/api');
                await appointmentAPI.update(currentWorkspace.id, activity.id, { status: 'COMPLETED' });
            } else {
                await activityAPI.completeActivity(activity.id, 'Tamamlandı');
            }
            loadActivities();
            if (selectedActivity?.id === activity.id) {
                setSelectedActivity(prev => prev ? { ...prev, status: 'COMPLETED', completedAt: new Date().toISOString() } : null);
            }
        } catch (error) {
            console.error('Complete error:', error);
        }
    };

    const handleClaim = async (activity, e) => {
        if (e) e.stopPropagation();
        try {
            await activityAPI.claimActivity(activity.id);
            loadActivities();
        } catch (error) {
            console.error('Claim error:', error);
        }
    };

    const handleCardClick = (activity) => {
        setSelectedActivity(activity);
        setEditNotes(activity.description || '');
        if (activity.contact?.id) {
            setSelectedContactId(activity.contact.id);
        }
    };

    const handleStatusChange = async (newStatus) => {
        if (!selectedActivity || selectedActivity._isAppointment) return;
        try {
            await activityAPI.updateActivity(selectedActivity.id, { status: newStatus });
            setSelectedActivity(prev => prev ? { ...prev, status: newStatus } : null);
            loadActivities();
        } catch (error) {
            console.error('Status change error:', error);
        }
    };

    const handleSaveNotes = async () => {
        if (!selectedActivity || selectedActivity._isAppointment) return;
        try {
            setSavingNotes(true);
            await activityAPI.updateActivity(selectedActivity.id, { description: editNotes });
            setSelectedActivity(prev => prev ? { ...prev, description: editNotes } : null);
            loadActivities();
        } catch (error) {
            console.error('Save notes error:', error);
        } finally {
            setSavingNotes(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedActivity || selectedActivity._isAppointment) return;
        if (!window.confirm('Bu aktiviteyi silmek istediğinize emin misiniz?')) return;
        try {
            await activityAPI.deleteActivity(selectedActivity.id);
            setSelectedActivity(null);
            setSelectedContactId(null);
            loadActivities();
        } catch (error) {
            console.error('Delete error:', error);
        }
    };

    const getTypeLabel = (type) => {
        const labels = { CALL: 'Arama', MEETING: 'Görüşme', TASK: 'Görev', APPOINTMENT: 'Randevu', NOTE: 'Not', REMINDER: 'Hatırlatıcı', PROPOSAL: 'Teklif', ORDER: 'Sipariş' };
        return labels[type] || type;
    };

    const getStatusLabel = (status) => {
        const labels = { PLANNED: 'Bekliyor', IN_PROGRESS: 'Devam Ediyor', COMPLETED: 'Tamamlandı', CANCELLED: 'İptal' };
        return labels[status] || status;
    };

    const getPriorityLabel = (priority) => {
        const labels = { LOW: 'Düşük', NORMAL: 'Normal', HIGH: 'Yüksek', URGENT: 'Acil' };
        return labels[priority] || priority;
    };

    const formatDueDate = (dateStr) => {
        if (!dateStr) return null;
        const date = new Date(dateStr);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const diff = Math.floor((target - today) / (1000 * 60 * 60 * 24));

        const timeStr = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        const dateStr2 = date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });

        if (diff < 0) return { text: `Gecikmiş ${dateStr2} ${timeStr}`, className: 'overdue' };
        if (diff === 0) return { text: `Bugün ${timeStr}`, className: 'today' };
        if (diff === 1) return { text: `Yarın ${timeStr}`, className: 'upcoming' };
        return { text: `${dateStr2} ${timeStr}`, className: 'upcoming' };
    };

    const getStatusDotClass = (status) => {
        switch (status) {
            case 'PLANNED': return 'planned';
            case 'IN_PROGRESS': return 'in-progress';
            case 'COMPLETED': return 'completed';
            case 'CANCELLED': return 'cancelled';
            default: return 'planned';
        }
    };

    const overdueCount = activities.filter(a => {
        if (a.status !== 'PLANNED' && a.status !== 'IN_PROGRESS') return false;
        if (!a.dueDate) return false;
        return new Date(a.dueDate) < new Date();
    }).length;

    // When OVERDUE filter is active, count from full dataset isn't accurate
    // So we compute it from the raw summary
    const totalOverdueForBadge = statusFilter === 'OVERDUE' ? activities.length : overdueCount;

    const PageIcon = config.icon;

    // Build the topic/description text to show prominently
    const getTopicText = (activity) => {
        const parts = [];
        if (activity.title) parts.push(activity.title);
        if (activity.callTopic && activity.callTopic !== activity.title) parts.push(activity.callTopic);
        if (activity.description && activity.description !== activity.title && activity.description !== activity.callTopic) {
            parts.push(activity.description);
        }
        // For appointments show notes too
        if (activity.notes && !parts.includes(activity.notes)) parts.push(activity.notes);
        return parts.join(' — ');
    };

    return (
        <div className="activities-page">
            {/* LEFT PANEL — List */}
            <div className="activities-list-panel">
                {/* Header */}
                <div className="activities-header">
                    <div className="activities-header-left">
                        <h1>
                            <PageIcon size={20} />
                            {config.title}
                        </h1>
                    </div>
                    <button className="filter-btn" onClick={loadActivities} style={{ padding: '5px 10px', fontSize: '0.75rem' }}>
                        <Clock size={12} /> Yenile
                    </button>
                </div>

                {/* Summary Cards — Compact */}
                <div className="activities-summary">
                    <div
                        className={`summary-card planned ${statusFilter === 'PLANNED' ? 'active' : ''}`}
                        onClick={() => setStatusFilter(statusFilter === 'PLANNED' ? 'ALL' : 'PLANNED')}
                    >
                        <div className="summary-info">
                            <span className="summary-count">{summary.planned || 0}</span>
                            <span className="summary-label">Bekleyen</span>
                        </div>
                    </div>
                    <div
                        className={`summary-card completed ${statusFilter === 'COMPLETED' ? 'active' : ''}`}
                        onClick={() => setStatusFilter(statusFilter === 'COMPLETED' ? 'ALL' : 'COMPLETED')}
                    >
                        <div className="summary-info">
                            <span className="summary-count">{summary.completed || 0}</span>
                            <span className="summary-label">Tamam</span>
                        </div>
                    </div>
                    <div
                        className={`summary-card overdue ${statusFilter === 'OVERDUE' ? 'active' : ''}`}
                        onClick={() => setStatusFilter(statusFilter === 'OVERDUE' ? 'ALL' : 'OVERDUE')}
                    >
                        <div className="summary-info">
                            <span className="summary-count">{totalOverdueForBadge}</span>
                            <span className="summary-label">Gecik</span>
                        </div>
                    </div>
                </div>

                {/* Filters — compact */}
                <div className="activities-filters">
                    <button className={`filter-btn ${viewFilter === 'all' ? 'active' : ''}`} onClick={() => setViewFilter('all')} style={{ padding: '5px 10px', fontSize: '0.75rem' }}>
                        <Users size={12} /> Ekip
                    </button>
                    <button className={`filter-btn ${viewFilter === 'mine' ? 'active' : ''}`} onClick={() => setViewFilter('mine')} style={{ padding: '5px 10px', fontSize: '0.75rem' }}>
                        <User size={12} /> Ben
                    </button>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Ara..."
                            style={{ width: '100%', padding: '5px 8px 5px 28px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '0.78rem', background: '#f8fafc', outline: 'none' }}
                        />
                    </div>
                </div>

                {/* Activity List */}
                <div className="activities-list">
                    {loading ? (
                        <div className="activities-loading"><div className="spinner" /></div>
                    ) : (() => {
                        let filtered = activities;
                        if (searchQuery.trim()) {
                            const q = searchQuery.trim().toLowerCase();
                            filtered = filtered.filter(a =>
                                (a.contact?.name || '').toLowerCase().includes(q) ||
                                (a.contact?.phone || '').toLowerCase().includes(q) ||
                                (a.title || '').toLowerCase().includes(q) ||
                                (a.description || '').toLowerCase().includes(q) ||
                                (a.callTopic || '').toLowerCase().includes(q) ||
                                (a.assignee?.name || '').toLowerCase().includes(q)
                            );
                        }
                        const [sortField, sortDir] = sortBy.split('_');
                        filtered = [...filtered].sort((a, b) => {
                            const dateA = new Date(a[sortField] || a.createdAt || 0);
                            const dateB = new Date(b[sortField] || b.createdAt || 0);
                            return sortDir === 'asc' ? dateA - dateB : dateB - dateA;
                        });

                        if (filtered.length === 0) return (
                            <div className="activities-empty">
                                <PageIcon size={40} />
                                <h3>{searchQuery ? 'Sonuç yok' : config.emptyText}</h3>
                            </div>
                        );

                        return filtered.map(activity => {
                            const due = formatDueDate(activity.dueDate);
                            const isOverdue = due?.className === 'overdue' && activity.status !== 'COMPLETED';
                            const isCompleted = activity.status === 'COMPLETED';
                            const isSelected = selectedActivity?.id === activity.id;

                            return (
                                <div
                                    key={activity.id}
                                    className={`activity-card ${isCompleted ? 'completed-card' : ''} ${isOverdue ? 'overdue-card' : ''} ${isSelected ? 'selected-card' : ''}`}
                                    onClick={() => handleCardClick(activity)}
                                >
                                    <div className={`activity-status-dot ${getStatusDotClass(activity.status)}`} />
                                    <div className="activity-card-content">
                                        <div className="activity-card-top">
                                            <span className="activity-contact-name">
                                                {activity.contact?.name || 'Bilinmeyen Kişi'}
                                            </span>
                                        </div>
                                        {getTopicText(activity) && (
                                            <div className="activity-card-topic">
                                                <span>{getTopicText(activity)}</span>
                                            </div>
                                        )}
                                        <div className="activity-card-meta">
                                            {activity.assignee && (
                                                <span className="activity-meta-tag assignee">
                                                    <User size={10} /> {activity.assignee.name}
                                                </span>
                                            )}
                                            {due && (
                                                <span className={`activity-meta-tag ${due.className === 'overdue' ? 'priority-URGENT' : 'source'}`}>
                                                    <CalendarClock size={10} /> {due.text}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        });
                    })()}
                </div>
            </div>

            {/* MIDDLE PANEL — Detail */}
            <div className="activities-detail-panel">
                {selectedActivity ? (
                    <div className="activities-detail-content">
                        {/* Detail Header */}
                        <div className="activities-detail-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <PageIcon size={22} style={{ color: config.color }} />
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b' }}>
                                        {selectedActivity.title || getTypeLabel(selectedActivity.type)}
                                    </h2>
                                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                        {getTypeLabel(selectedActivity.type)}
                                    </span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className={`act-detail-badge ${selectedActivity.status.toLowerCase().replace('_', '-')}`}>
                                    {getStatusLabel(selectedActivity.status)}
                                </span>
                                <button className="btn-icon" onClick={() => { setSelectedActivity(null); setSelectedContactId(null); }}>
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Info Grid */}
                        <div className="activities-detail-grid">
                            <div className="act-detail-row">
                                <span className="act-detail-label">Müşteri</span>
                                <span className="act-detail-value">
                                    {selectedActivity.contact?.name || 'Bilinmiyor'}
                                    {selectedActivity.contact?.phone && (
                                        <span style={{ color: '#6b7280', marginLeft: 6, fontSize: '0.82rem' }}>
                                            <Phone size={12} style={{ verticalAlign: 'middle' }} /> {selectedActivity.contact.phone}
                                        </span>
                                    )}
                                </span>
                            </div>
                            <div className="act-detail-row">
                                <span className="act-detail-label">Tarih</span>
                                <span className="act-detail-value">
                                    {selectedActivity.dueDate ? new Date(selectedActivity.dueDate).toLocaleString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                                </span>
                            </div>
                            <div className="act-detail-row">
                                <span className="act-detail-label">Atanan</span>
                                <span className="act-detail-value">{selectedActivity.assignee?.name || 'Atanmadı'}</span>
                            </div>
                            <div className="act-detail-row">
                                <span className="act-detail-label">Öncelik</span>
                                <span className="act-detail-value">{getPriorityLabel(selectedActivity.priority)}</span>
                            </div>
                            <div className="act-detail-row">
                                <span className="act-detail-label">Kaynak</span>
                                <span className="act-detail-value">{selectedActivity.source || 'Manuel'}</span>
                            </div>
                            <div className="act-detail-row">
                                <span className="act-detail-label">Durum</span>
                                <select
                                    value={selectedActivity.status}
                                    onChange={(e) => handleStatusChange(e.target.value)}
                                    className="act-status-select"
                                    disabled={selectedActivity._isAppointment}
                                >
                                    <option value="PLANNED">Bekliyor</option>
                                    <option value="IN_PROGRESS">Devam Ediyor</option>
                                    <option value="COMPLETED">Tamamlandı</option>
                                    <option value="CANCELLED">İptal</option>
                                </select>
                            </div>
                            {selectedActivity.callTopic && (
                                <div className="act-detail-row" style={{ gridColumn: '1 / -1' }}>
                                    <span className="act-detail-label">Arama Konusu</span>
                                    <span className="act-detail-value">{selectedActivity.callTopic}</span>
                                </div>
                            )}
                        </div>

                        {/* Result (if completed) */}
                        {selectedActivity.result && (
                            <div className="act-detail-section">
                                <h4>Sonuç Notu</h4>
                                <p style={{ margin: 0, fontSize: '0.88rem', color: '#1e293b', lineHeight: 1.5, background: '#f0fdf4', padding: '10px 14px', borderRadius: '8px', border: '1px solid #dcfce7' }}>
                                    {selectedActivity.result}
                                </p>
                            </div>
                        )}

                        {/* Notes — editable */}
                        <div className="act-detail-section">
                            <h4>Açıklama / Notlar</h4>
                            <textarea
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                placeholder="Not ekle..."
                                rows={4}
                                className="act-notes-textarea"
                                disabled={selectedActivity._isAppointment}
                            />
                            {editNotes !== (selectedActivity.description || '') && !selectedActivity._isAppointment && (
                                <button className="act-save-notes-btn" onClick={handleSaveNotes} disabled={savingNotes}>
                                    <Save size={14} /> {savingNotes ? 'Kaydediliyor...' : 'Kaydet'}
                                </button>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className="act-detail-footer">
                            {selectedActivity.status !== 'COMPLETED' && !selectedActivity._isAppointment && (
                                <button className="act-btn success" onClick={() => handleComplete(selectedActivity)}>
                                    <CheckCircle2 size={16} /> Tamamla
                                </button>
                            )}
                            {config.type === 'CALL' && selectedActivity.contact?.phone && (
                                <a href={`tel:${selectedActivity.contact.phone}`} className="act-btn primary">
                                    <PhoneCall size={16} /> Ara
                                </a>
                            )}
                            {!selectedActivity._isAppointment && (
                                <button className="act-btn danger" onClick={handleDelete}>
                                    <Trash2 size={16} /> Sil
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="activities-empty-state">
                        <ClipboardList size={48} strokeWidth={1.2} />
                        <h3>Aktivite Seçin</h3>
                        <p>Detayları görüntülemek için sol panelden bir aktivite seçin</p>
                    </div>
                )}
            </div>

            {/* RIGHT PANEL — Contact Sidebar */}
            {selectedActivity && selectedContactId && (
                <div className="activities-sidebar-panel">
                    <ContactSidebar
                        contactId={selectedContactId}
                        isOpen={true}
                        onClose={() => { setSelectedContactId(null); setSelectedActivity(null); }}
                        members={[]}
                        teams={[]}
                        isOwner={true}
                        currentUserId={user?.id}
                    />
                </div>
            )}
        </div>
    );
};

export default Activities;
