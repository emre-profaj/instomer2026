import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, ArrowRightLeft, UserCheck, MessageSquare, BellOff, Check, Trash2, PhoneCall } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { notificationAPI } from '../../services/api';
import './NotificationPanel.css';

const NOTIF_CATEGORIES = {
    all: { label: 'Tümü', types: null },
    assignment: { label: 'Atama', types: ['CONVERSATION_ASSIGNED', 'TEAM_ASSIGNED', 'CONTACT_ASSIGNED'] },
    call: { label: 'Arama', types: ['CALL', 'CALL_SCHEDULED', 'CALL_MISSED'] },
    general: { label: 'Genel', types: ['BOT_ROUTING', 'NEW_MESSAGE', 'APPOINTMENT', 'TASK', 'OTHER'] },
};

const getCategory = (type) => {
    if (NOTIF_CATEGORIES.assignment.types.includes(type)) return 'assignment';
    if (NOTIF_CATEGORIES.call.types.includes(type)) return 'call';
    return 'general';
};

const NotificationPanel = ({ isCollapsed }) => {
    const { currentWorkspace, user } = useAuth();
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [notifTab, setNotifTab] = useState('all');
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

    // Fetch notifications
    const fetchNotifications = useCallback(async () => {
        if (!workspaceId) return;
        setLoading(true);
        try {
            const res = await notificationAPI.getAll(workspaceId, 50, 0);
            setNotifications(res.data.notifications || []);
        } catch (err) {
            console.error('Error fetching notifications:', err);
        } finally {
            setLoading(false);
        }
    }, [workspaceId]);

    // Poll unread count every 30 seconds
    useEffect(() => {
        fetchUnreadCount();
        const interval = setInterval(fetchUnreadCount, 30000);
        return () => clearInterval(interval);
    }, [fetchUnreadCount]);

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
        }
        setIsOpen(!isOpen);
    };

    const handleMarkAsRead = async (notif) => {
        if (!notif.isRead) {
            try {
                await notificationAPI.markAsRead(workspaceId, notif.id);
                setNotifications(prev =>
                    prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n)
                );
                setUnreadCount(prev => Math.max(0, prev - 1));
            } catch (err) {
                console.error('Error marking as read:', err);
            }
        }

        // Navigate to conversation or contact page
        try {
            const data = notif.data ? JSON.parse(notif.data) : null;
            if (data?.conversationId) {
                navigate(`/inbox?conversation=${data.conversationId}`);
                setIsOpen(false);
            } else if (data?.contactId) {
                navigate(`/contacts`);
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

    // Filter notifications by category tab
    const filteredNotifications = notifTab === 'all'
        ? notifications
        : notifications.filter(n => getCategory(n.type) === notifTab);

    // Count unread per category
    const unreadCounts = {
        all: notifications.filter(n => !n.isRead).length,
        assignment: notifications.filter(n => !n.isRead && getCategory(n.type) === 'assignment').length,
        call: notifications.filter(n => !n.isRead && getCategory(n.type) === 'call').length,
        general: notifications.filter(n => !n.isRead && getCategory(n.type) === 'general').length,
    };

    return (
        <div className="notification-panel" ref={panelRef}>
            <button
                className="notification-trigger"
                onClick={handleToggle}
                title="Bildirimler"
            >
                <Bell size={20} className="nav-icon" />
                {!isCollapsed && <span>Bildirimler</span>}
                {unreadCount > 0 && (
                    <span className="notification-badge">
                        {unreadCount > 99 ? '99+' : unreadCount}
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
                                className={`notif-cat-btn ${notifTab === key ? 'active' : ''}`}
                                onClick={() => setNotifTab(key)}
                            >
                                {cat.label}
                                {unreadCounts[key] > 0 && (
                                    <span className="notif-cat-badge">{unreadCounts[key]}</span>
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
                                    className={`notification-item ${!notif.isRead ? 'unread' : ''}`}
                                    onClick={() => handleMarkAsRead(notif)}
                                >
                                    <div className={`notification-icon-wrapper ${getIconClass(notif.type)}`}>
                                        {getIcon(notif.type)}
                                    </div>
                                    <div className="notification-content">
                                        <p className="notification-title">{notif.title}</p>
                                        <p className="notification-body">{notif.body}</p>
                                        <span className="notification-time">{formatTime(notif.createdAt)}</span>
                                    </div>
                                    {!notif.isRead && <div className="notification-unread-dot" />}
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
