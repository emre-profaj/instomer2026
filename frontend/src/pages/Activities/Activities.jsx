import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { activityAPI } from '../../services/activity.api';
import { Phone, Users, Calendar, CheckCircle2, Clock, AlertCircle, CircleDot, PhoneCall, Handshake, ListTodo, CalendarClock, User, Building2, XCircle } from 'lucide-react';
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
    const [viewFilter, setViewFilter] = useState('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const loadActivities = useCallback(async () => {
        if (!currentWorkspace?.id) return;
        try {
            setLoading(true);
            const filters = {
                type: config.type === 'APPOINTMENT' ? undefined : config.type,
                status: statusFilter !== 'ALL' ? statusFilter : undefined,
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
                    ...(statusFilter !== 'ALL' && statusFilter === 'PLANNED' ? { status: 'SCHEDULED' } : {}),
                    ...(statusFilter === 'COMPLETED' ? { status: 'COMPLETED' } : {}),
                    ...(viewFilter === 'mine' && user?.id ? { assignedToId: user.id } : {})
                });
                const appts = res.data?.appointments || [];
                setActivities(appts.map(a => ({
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
                })));
                const planned = appts.filter(a => a.status === 'SCHEDULED').length;
                const completed = appts.filter(a => a.status === 'COMPLETED').length;
                setSummary({ planned, completed, inProgress: 0, cancelled: appts.filter(a => a.status === 'CANCELLED').length });
            } else {
                // Load from activities API
                const data = await activityAPI.getWorkspaceActivities(currentWorkspace.id, filters);
                setActivities(data.activities || []);
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

    const handleComplete = async (activity, e) => {
        e.stopPropagation();
        try {
            if (activity._isAppointment) {
                const { appointmentAPI } = await import('../../services/api');
                await appointmentAPI.update(currentWorkspace.id, activity.id, { status: 'COMPLETED' });
            } else {
                await activityAPI.completeActivity(activity.id, 'Tamamlandı');
            }
            loadActivities();
        } catch (error) {
            console.error('Complete error:', error);
        }
    };

    const handleClaim = async (activity, e) => {
        e.stopPropagation();
        try {
            await activityAPI.claimActivity(activity.id);
            loadActivities();
        } catch (error) {
            console.error('Claim error:', error);
        }
    };

    const handleCardClick = (activity) => {
        if (activity.contact?.id) {
            navigate(`/customers?contact=${activity.contact.id}`);
        }
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

    const PageIcon = config.icon;

    return (
        <div className="activities-page">
            {/* Header */}
            <div className="activities-header">
                <div className="activities-header-left">
                    <h1>
                        <PageIcon size={24} />
                        {config.title}
                    </h1>
                </div>
                <div className="activities-header-right">
                    <button className="filter-btn" onClick={loadActivities}>
                        <Clock size={14} /> Yenile
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="activities-summary">
                <div
                    className={`summary-card planned ${statusFilter === 'PLANNED' ? 'active' : ''}`}
                    onClick={() => setStatusFilter(statusFilter === 'PLANNED' ? 'ALL' : 'PLANNED')}
                >
                    <div className="summary-icon">
                        <CircleDot size={20} />
                    </div>
                    <div className="summary-info">
                        <span className="summary-count">{summary.planned || 0}</span>
                        <span className="summary-label">Bekleyen</span>
                    </div>
                </div>

                <div
                    className={`summary-card completed ${statusFilter === 'COMPLETED' ? 'active' : ''}`}
                    onClick={() => setStatusFilter(statusFilter === 'COMPLETED' ? 'ALL' : 'COMPLETED')}
                >
                    <div className="summary-icon">
                        <CheckCircle2 size={20} />
                    </div>
                    <div className="summary-info">
                        <span className="summary-count">{summary.completed || 0}</span>
                        <span className="summary-label">Tamamlanan</span>
                    </div>
                </div>

                {overdueCount > 0 && (
                    <div className="summary-card overdue">
                        <div className="summary-icon">
                            <AlertCircle size={20} />
                        </div>
                        <div className="summary-info">
                            <span className="summary-count">{overdueCount}</span>
                            <span className="summary-label">Gecikmiş</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Filters */}
            <div className="activities-filters">
                <button
                    className={`filter-btn ${viewFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setViewFilter('all')}
                >
                    <Users size={14} /> Tüm Ekip
                </button>
                <button
                    className={`filter-btn ${viewFilter === 'mine' ? 'active' : ''}`}
                    onClick={() => setViewFilter('mine')}
                >
                    <User size={14} /> Benim
                </button>

                <div style={{ width: 1, height: 24, background: '#e5e7eb', margin: '0 4px' }} />

                <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    placeholder="Başlangıç"
                />
                <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    placeholder="Bitiş"
                />

                {(dateFrom || dateTo) && (
                    <button
                        className="filter-btn"
                        onClick={() => { setDateFrom(''); setDateTo(''); }}
                    >
                        <XCircle size={14} /> Temizle
                    </button>
                )}
            </div>

            {/* Activity List */}
            <div className="activities-list">
                {loading ? (
                    <div className="activities-loading">
                        <div className="spinner" />
                    </div>
                ) : activities.length === 0 ? (
                    <div className="activities-empty">
                        <PageIcon size={48} />
                        <h3>{config.emptyText}</h3>
                        <p>Filtreleri değiştirmeyi deneyin</p>
                    </div>
                ) : (
                    activities.map(activity => {
                        const due = formatDueDate(activity.dueDate);
                        const isOverdue = due?.className === 'overdue' && activity.status !== 'COMPLETED';
                        const isCompleted = activity.status === 'COMPLETED';

                        return (
                            <div
                                key={activity.id}
                                className={`activity-card ${isCompleted ? 'completed-card' : ''} ${isOverdue ? 'overdue-card' : ''}`}
                                onClick={() => handleCardClick(activity)}
                            >
                                <div className={`activity-status-dot ${getStatusDotClass(activity.status)}`} />

                                <div className="activity-card-content">
                                    <div className="activity-card-top">
                                        <span className="activity-contact-name">
                                            {activity.contact?.name || 'Bilinmeyen Kişi'}
                                        </span>
                                        {activity.contact?.phone && (
                                            <span className="activity-contact-phone">
                                                <Phone size={12} />
                                                {activity.contact.phone}
                                            </span>
                                        )}
                                    </div>

                                    {(activity.title || activity.callTopic || activity.description) && (
                                        <div className="activity-card-title">
                                            {activity.title || activity.callTopic || activity.description}
                                        </div>
                                    )}

                                    <div className="activity-card-meta">
                                        {activity.source && activity.source !== 'MANUAL' && (
                                            <span className="activity-meta-tag source">
                                                {activity.source}
                                            </span>
                                        )}
                                        {(activity.priority === 'HIGH' || activity.priority === 'URGENT') && (
                                            <span className={`activity-meta-tag priority-${activity.priority}`}>
                                                <AlertCircle size={10} />
                                                {activity.priority === 'HIGH' ? 'Yüksek' : 'Acil'}
                                            </span>
                                        )}
                                        {activity.assignee && (
                                            <span className="activity-meta-tag assignee">
                                                <User size={10} />
                                                {activity.assignee.name}
                                            </span>
                                        )}
                                        {activity.contact?.company && (
                                            <span className="activity-meta-tag source">
                                                <Building2 size={10} />
                                                {activity.contact.company}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="activity-card-right">
                                    {due && (
                                        <span className={`activity-due-date ${due.className}`}>
                                            <CalendarClock size={13} />
                                            {due.text}
                                        </span>
                                    )}

                                    {!isCompleted && (
                                        <div className="activity-actions">
                                            {config.type === 'CALL' && activity.contact?.phone && (
                                                <a
                                                    href={`tel:${activity.contact.phone}`}
                                                    className="activity-action-btn call"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <PhoneCall size={12} /> Ara
                                                </a>
                                            )}
                                            <button
                                                className="activity-action-btn complete"
                                                onClick={(e) => handleComplete(activity, e)}
                                            >
                                                <CheckCircle2 size={12} /> Tamamla
                                            </button>
                                            {!activity.assignee && !activity._isAppointment && (
                                                <button
                                                    className="activity-action-btn claim"
                                                    onClick={(e) => handleClaim(activity, e)}
                                                >
                                                    Üstlen
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default Activities;
