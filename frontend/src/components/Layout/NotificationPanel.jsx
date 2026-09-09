import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, ArrowRightLeft, UserCheck, MessageSquare, BellOff, Check, Trash2, PhoneCall, AlarmClock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { notificationAPI } from '../../services/api';
import { activityAPI } from '../../services/activity.api';
import './NotificationPanel.css';

const NOTIF_CATEGORIES = {
    all: { label: 'Tümü', types: null },
    assignment: { label: 'Atama', types: ['CONVERSATION_ASSIGNED', 'TEAM_ASSIGNED', 'CONTACT_ASSIGNED'] },
    call: { label: 'Arama', types: ['CALL', 'CALL_SCHEDULED', 'CALL_MISSED'] },
    overdue: { label: 'Gecikmiş', types: ['CALL_OVERDUE'] },
    general: { label: 'Genel', types: ['BOT_ROUTING', 'NEW_MESSAGE', 'APPOINTMENT', 'TASK', 'OTHER'] },
};

const getCategory = (type) => {
    if (NOTIF_CATEGORIES.assignment.types.includes(type)) return 'assignment';
    if (NOTIF_CATEGORIES.call.types.includes(type)) return 'call';
    if (NOTIF_CATEGORIES.overdue.types.includes(type)) return 'overdue';
    return 'general';
};

const NotificationPanel = ({ isCollapsed }) => {
    const { currentWorkspace, user, switchWorkspace } = useAuth();
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [notifTab, setNotifTab] = useState('all');
    const [overdueAlerts, setOverdueAlerts] = useState([]);
    const panelRef = useRef(null);

    const workspaceId = currentWorkspace?.id;

    // Fetch unread count
    const fetchUnreadCount = useCallback(async () => {
        if (!workspaceId) return;
        try {
            const res = await notificationAPI.getUnreadCount(workspaceId);
            setUnreadCount(res.data.count || 0);
        } catch (err) {
            // silent fail
        }
    }, [workspaceId]);

    // Fetch notifications (cross-workspace: tüm workspace'lerden)
    const fetchNotifications = useCallback(async () => {
        setLoading(true);
        try {
            const res = await notificationAPI.getAllCrossWorkspace(50, 0);
            setNotifications(res.data.notifications || []);
            setUnreadCount(res.data.totalUnread || 0);
        } catch (err) {
            console.error('Error fetching notifications:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch overdue calls
    const fetchOverdueCalls = useCallback(async () => {
        if (!workspaceId) return;
        try {
            const res = await activityAPI.getPlannedActivities(workspaceId);
            const activities = res.activities || res.data?.activities || [];
            const now = new Date();
            const overdue = activities
                .filter(a => a.activityType === 'CALL' && a.status === 'SCHEDULED' && a.dueDate && new Date(a.dueDate) < now)
                .map(a => ({
                    id: `overdue_${a.id}`,
                    _activityId: a.id,
                    type: 'CALL_OVERDUE',
                    title: `⏰ ${a.contact?.name || 'İsimsiz'} — Gecikmiş Arama`,
                    body: `📱 ${a.contact?.phone || '-'} · Planlanan: ${new Date(a.dueDate).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
                    createdAt: a.dueDate,
                    isRead: false,
                    isOverdue: true,
                    data: JSON.stringify({
                        conversationId: a.contact?.conversations?.[0]?.id || null,
                        contactId: a.contact?.id || null,
                        phone: a.contact?.phone || null,
                    }),
                }));
            setOverdueAlerts(overdue);
        } catch (err) {
            console.error('Error fetching overdue calls:', err);
        }
    }, [workspaceId]);

    // Poll unread count + overdue every 30 seconds
    useEffect(() => {
        fetchUnreadCount();
        fetchOverdueCalls();
        const interval = setInterval(() => {
            fetchUnreadCount();
            fetchOverdueCalls();
        }, 30000);
        return () => clearInterval(interval);
    }, [fetchUnreadCount, fetchOverdueCalls]);

    // Listen for real-time notifications via window event (dispatched from AuthContext)
    useEffect(() => {
        const handleNewNotification = (event) => {
            const data = event.detail;
            if (data?.notification && data?.targetUserId === user?.id) {
                setNotifications(prev => [data.notification, ...prev]);
                setUnreadCount(prev => prev + 1);
            }
        };

        window.addEventListener('websocket:new_notification', handleNewNotification);
        return () => window.removeEventListener('websocket:new_notification', handleNewNotification);
    }, [user?.id]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (panelRef.current && !panelRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const handleToggle = () => {
        if (!isOpen) {
            fetchNotifications();
            fetchOverdueCalls();
        }
        setIsOpen(!isOpen);
    };

    const handleMarkAsRead = async (notif) => {
        // Overdue alerts — switch workspace if needed and navigate
        if (notif.isOverdue) {
            try {
                const data = notif.data ? JSON.parse(notif.data) : null;
                if (data?.conversationId) {
                    navigate(`/inbox?conversationId=${data.conversationId}`);
                    setIsOpen(false);
                }
            } catch (e) { /* ignore */ }
            return;
        }

        if (!notif.isRead) {
            try {
                await notificationAPI.markAsRead(notif.workspaceId || workspaceId, notif.id);
                setNotifications(prev =>
                    prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n)
                );
                setUnreadCount(prev => Math.max(0, prev - 1));
            } catch (err) {
                console.error('Error marking as read:', err);
            }
        }

        // Navigate to conversation or contact page — switch workspace if needed
        try {
            const data = notif.data ? JSON.parse(notif.data) : null;
            const notifWorkspaceId = notif.workspaceId;

            // Workspace geçişi gerekiyorsa önce geçiş yap
            if (notifWorkspaceId && notifWorkspaceId !== workspaceId) {
                await switchWorkspace(notifWorkspaceId);
            }

            if (data?.conversationId) {
                navigate(`/inbox?conversationId=${data.conversationId}`);
                setIsOpen(false);
            } else if (data?.contactId) {
                navigate(`/customers`);
                setIsOpen(false);
            }
        } catch (e) { /* ignore */ }
    };

    const handleMarkAllAsRead = async () => {
        if (!workspaceId) return;
        try {
            await notificationAPI.markAllAsRead(workspaceId);
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
            setUnreadCount(0);
        } catch (err) {
            console.error('Error marking all as read:', err);
        }
    };

    const handleDeleteAll = async () => {
        if (!workspaceId) return;
        try {
            await notificationAPI.deleteAll(workspaceId);
            setNotifications([]);
            setUnreadCount(0);
        } catch (err) {
            console.error('Error deleting notifications:', err);
        }
    };

    const getIcon = (type) => {
        switch (type) {
            case 'BOT_ROUTING':
                return <ArrowRightLeft size={16} />;
            case 'CONVERSATION_ASSIGNED':
            case 'TEAM_ASSIGNED':
            case 'CONTACT_ASSIGNED':
                return <UserCheck size={16} />;
            case 'NEW_MESSAGE':
                return <MessageSquare size={16} />;
            case 'CALL_OVERDUE':
                return <AlarmClock size={16} />;
            case 'CALL':
            case 'CALL_SCHEDULED':
            case 'CALL_MISSED':
                return <PhoneCall size={16} />;
            default:
                return <Bell size={16} />;
        }
    };

    const getIconClass = (type) => {
        switch (type) {
            case 'BOT_ROUTING': return 'routing';
            case 'CONVERSATION_ASSIGNED':
            case 'TEAM_ASSIGNED':
            case 'CONTACT_ASSIGNED': return 'assignment';
            case 'NEW_MESSAGE': return 'message';
            case 'CALL_OVERDUE': return 'overdue';
            case 'CALL':
            case 'CALL_SCHEDULED':
            case 'CALL_MISSED': return 'call';
            default: return '';
        }
    };

    const formatTime = (dateStr) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;
        const mins = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (mins < 1) return 'Az önce';
        if (mins < 60) return `${mins} dk önce`;
        if (hours < 24) return `${hours} saat önce`;
        if (days < 7) return `${days} gün önce`;
        return date.toLocaleDateString('tr-TR');
    };

    // Merge overdue alerts (top) with real notifications
    const allNotifications = [...overdueAlerts, ...notifications];

    // Filter by category tab
    const filteredNotifications = notifTab === 'all'
        ? allNotifications
        : allNotifications.filter(n => getCategory(n.type) === notifTab);

    // Count unread per category (include overdue)
    const unreadCounts = {
        all: notifications.filter(n => !n.isRead).length + overdueAlerts.length,
        assignment: notifications.filter(n => !n.isRead && getCategory(n.type) === 'assignment').length,
        call: notifications.filter(n => !n.isRead && getCategory(n.type) === 'call').length,
        overdue: overdueAlerts.length,
        general: notifications.filter(n => !n.isRead && getCategory(n.type) === 'general').length,
    };

    const totalBadge = unreadCount + overdueAlerts.length;

    return (
        <div className="notification-panel" ref={panelRef}>
            <button
                className="notification-trigger"
                onClick={handleToggle}
                title="Bildirimler"
            >
                <Bell size={20} className="nav-icon" />
                {!isCollapsed && <span>Bildirimler</span>}
                {totalBadge > 0 && (
                    <span className="notification-badge">
                        {totalBadge > 99 ? '99+' : totalBadge}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="notification-dropdown">
                    <div className="notification-dropdown-header">
                        <h4>Bildirimler</h4>
                        <div style={{ display: 'flex', gap: 4 }}>
                            {unreadCount > 0 && (
                                <button className="mark-all-read-btn" onClick={handleMarkAllAsRead}>
                                    <Check size={12} style={{ marginRight: 4, display: 'inline' }} />
                                    Okundu
                                </button>
                            )}
                            {notifications.length > 0 && (
                                <button className="mark-all-read-btn" onClick={handleDeleteAll} style={{ color: '#ef4444' }}>
                                    <Trash2 size={12} style={{ marginRight: 4, display: 'inline' }} />
                                    Temizle
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Category tabs */}
                    <div className="notif-category-tabs">
                        {Object.entries(NOTIF_CATEGORIES).map(([key, cat]) => (
                            <button
                                key={key}
                                className={`notif-cat-btn ${notifTab === key ? 'active' : ''} ${key === 'overdue' && overdueAlerts.length > 0 ? 'notif-cat-overdue' : ''}`}
                                onClick={() => setNotifTab(key)}
                            >
                                {key === 'overdue' && <AlarmClock size={11} />}
                                {cat.label}
                                {unreadCounts[key] > 0 && (
                                    <span className={`notif-cat-badge ${key === 'overdue' ? 'notif-cat-badge-overdue' : ''}`}>{unreadCounts[key]}</span>
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="notification-list">
                        {loading ? (
                            <div className="notification-loading">Yükleniyor...</div>
                        ) : filteredNotifications.length === 0 ? (
                            <div className="notification-empty">
                                <BellOff size={32} className="notification-empty-icon" />
                                <p>{notifTab === 'all' ? 'Henüz bildirim yok' : 'Bu kategoride bildirim yok'}</p>
                            </div>
                        ) : (
                            filteredNotifications.map(notif => (
                                <div
                                    key={notif.id}
                                    className={`notification-item ${!notif.isRead ? 'unread' : ''} ${notif.isOverdue ? 'notification-overdue' : ''}`}
                                    onClick={() => handleMarkAsRead(notif)}
                                >
                                    <div className={`notification-icon-wrapper ${getIconClass(notif.type)}`}>
                                        {getIcon(notif.type)}
                                    </div>
                                    <div className="notification-content">
                                        <p className="notification-title">{notif.title}</p>
                                        <p className="notification-body">{notif.body}</p>
                                        <span className="notification-time">
                                            {notif.isOverdue ? `⏰ ${formatTime(notif.createdAt)} gecikmiş` : formatTime(notif.createdAt)}
                                            {notif.workspaceName && notif.workspaceId !== workspaceId && (
                                                <span className="notification-workspace-badge">📁 {notif.workspaceName}</span>
                                            )}
                                        </span>
                                    </div>
                                    {!notif.isRead && !notif.isOverdue && <div className="notification-unread-dot" />}
                                    {notif.isOverdue && <div className="notification-overdue-badge">Gecikmiş</div>}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationPanel;
