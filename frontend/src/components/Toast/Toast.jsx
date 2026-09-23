import React, { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';
import { X, CheckCircle, AlertCircle, Info, UserPlus, MessageSquare, Bell } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import notificationService from '../../services/notificationService';
import './Toast.css';

// Toast Context
const ToastContext = createContext(null);

// Toast Provider Component
export const ToastProvider = ({ children }) => {
    const { user, currentWorkspace, switchWorkspace } = useAuth() || {};
    const [toasts, setToasts] = useState([]);

    const userRef = useRef(user);
    const currentWorkspaceRef = useRef(currentWorkspace);

    useEffect(() => {
        userRef.current = user;
    }, [user]);

    useEffect(() => {
        currentWorkspaceRef.current = currentWorkspace;
    }, [currentWorkspace]);

    const switchWorkspaceRef = useRef(switchWorkspace);
    useEffect(() => {
        switchWorkspaceRef.current = switchWorkspace;
    }, [switchWorkspace]);

    const addToast = useCallback((toast) => {
        const id = Date.now() + Math.random();
        const newToast = {
            id,
            type: toast.type || 'info',
            title: toast.title || '',
            message: toast.message || '',
            duration: toast.duration || 5000,
            onClick: toast.onClick || null
        };

        setToasts(prev => [...prev, newToast]);

        // Auto remove after duration
        if (newToast.duration > 0) {
            setTimeout(() => {
                removeToast(id);
            }, newToast.duration);
        }

        return id;
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // Convenience methods
    const showSuccess = useCallback((title, message, options = {}) => {
        return addToast({ type: 'success', title, message, ...options });
    }, [addToast]);

    const showError = useCallback((title, message, options = {}) => {
        return addToast({ type: 'error', title, message, ...options });
    }, [addToast]);

    const showInfo = useCallback((title, message, options = {}) => {
        return addToast({ type: 'info', title, message, ...options });
    }, [addToast]);

    const showWarning = useCallback((title, message, options = {}) => {
        if (typeof title === 'string' && !message) {
            return addToast({ type: 'warning', title: 'Mesai Dışı Atama', message: title, duration: 7000, ...options });
        }
        return addToast({ type: 'warning', title, message, duration: 7000, ...options });
    }, [addToast]);

    const showAssignment = useCallback((title, message, options = {}) => {
        return addToast({ type: 'assignment', title, message, duration: 8000, ...options });
    }, [addToast]);

    // Listen for real-time new_message events and show toast
    const addToastRef = useRef(addToast);
    addToastRef.current = addToast;

    useEffect(() => {
        const handleNewMessage = (event) => {
            const data = event.detail;
            // Only show toast for incoming contact messages
            if (!data?.message?.isFromContact) return;

            const currentUser = userRef.current;
            const ws = currentWorkspaceRef.current;
            const member = ws?.members?.find(m => m.userId === currentUser?.id);
            const role = member?.role || currentUser?.role || 'AGENT';
            const isAdminOrOwner = ['OWNER', 'ADMIN', 'SUPER_ADMIN'].includes(role) || currentUser?.role === 'SUPER_ADMIN';

            const assignedToId = data.assignedToId || data.conversation?.assignedToId;

            // Agent: strictly only receive notifications if conversation is assigned to this user
            if (!isAdminOrOwner) {
                if (!assignedToId || assignedToId !== currentUser?.id) {
                    return;
                }
            } else {
                // Admin / Owner: do not show if assigned to another agent
                if (assignedToId && assignedToId !== currentUser?.id) {
                    return;
                }
            }

            const senderName = data.contactName || data.message?.contactName || data.contact?.name || 'Yeni Mesaj';
            const messageText = data.message?.content || '';
            const preview = messageText.length > 60 ? messageText.substring(0, 60) + '...' : messageText;

            const channelLabels = {
                'FACEBOOK': 'Facebook',
                'FACEBOOK_COMMENT': 'Facebook Yorum',
                'INSTAGRAM': 'Instagram',
                'INSTAGRAM_COMMENT': 'Instagram Yorum',
                'WHATSAPP': 'WhatsApp',
                'WIDGET': 'Widget',
                'LEAD': 'Lead',
                'EMAIL': 'E-posta'
            };
            const channelLabel = channelLabels[data.channel] || data.channel || '';

            addToastRef.current({
                type: 'message',
                title: `📨 ${senderName}`,
                message: `${channelLabel ? channelLabel + ': ' : ''}${preview}`,
                duration: 5000,
                onClick: async () => {
                    const convId = data.conversationId || data.message?.conversationId || data.conversation?.id;
                    const msgWorkspaceId = data.workspaceId;
                    // Workspace geçişi gerekiyorsa yap
                    if (msgWorkspaceId && msgWorkspaceId !== currentWorkspaceRef.current?.id && switchWorkspaceRef.current) {
                        await switchWorkspaceRef.current(msgWorkspaceId);
                    }
                    if (convId) {
                        window.location.href = `/inbox?conversationId=${convId}`;
                    } else {
                        window.location.href = '/inbox';
                    }
                }
            });

            // Show browser notification if document is hidden (out of tab)
            if (document.hidden) {
                const convId = data.conversationId || data.conversation?.id;
                const msgWorkspaceId = data.workspaceId;
                notificationService.showNewMessageNotification(
                    data.message,
                    { id: convId, channel: data.channel },
                    { name: senderName, id: data.contactId || data.message?.contactId || data.contact?.id },
                    msgWorkspaceId
                );
            }
        };

        window.addEventListener('websocket:new_message', handleNewMessage);
        return () => window.removeEventListener('websocket:new_message', handleNewMessage);
    }, []);

    // Listen for real-time conversation assignment events and show toast + browser notification
    useEffect(() => {
        const handleAssignment = (event) => {
            const data = event.detail;
            if (!data) return;

            const currentUser = userRef.current;
            const targetUserId = data.assignedToId || data.targetUserId || data.userId;
            if (targetUserId && currentUser?.id && targetUserId !== currentUser.id) return;

            const senderName = data.contact?.name || data.contact?.fullName || data.contactName || 'Müşteri';
            const assignedBy = data.assignedBy || 'Yönetici';
            const message = data.message || `${assignedBy} size yeni bir sohbet atadı (${senderName})`;
            const conversationId = data.conversationId || data.conversation?.id;

            addToastRef.current({
                type: 'assignment',
                title: '📋 Yeni Sohbet Atandı',
                message: message,
                duration: 8000,
                onClick: async () => {
                    const assignWorkspaceId = data.workspaceId;
                    // Workspace geçişi gerekiyorsa yap
                    if (assignWorkspaceId && assignWorkspaceId !== currentWorkspaceRef.current?.id && switchWorkspaceRef.current) {
                        await switchWorkspaceRef.current(assignWorkspaceId);
                    }
                    if (conversationId) {
                        window.location.href = `/inbox?conversationId=${conversationId}`;
                    } else {
                        window.location.href = '/inbox';
                    }
                }
            });

            if (document.hidden) {
                const assignWorkspaceId = data.workspaceId;
                notificationService.showNotification('📋 Yeni Sohbet Atandı', {
                    body: message,
                    tag: `assign-${conversationId || Date.now()}`,
                    renotify: true,
                    data: {
                        url: conversationId
                            ? `/inbox?conversationId=${conversationId}${assignWorkspaceId ? `&workspaceId=${assignWorkspaceId}` : ''}`
                            : '/inbox',
                        conversationId,
                        workspaceId: assignWorkspaceId
                    }
                });
            }
        };

        window.addEventListener('websocket:conversation_assigned_to_you', handleAssignment);
        window.addEventListener('websocket:new_conversation_assigned', handleAssignment);
        return () => {
            window.removeEventListener('websocket:conversation_assigned_to_you', handleAssignment);
            window.removeEventListener('websocket:new_conversation_assigned', handleAssignment);
        };
    }, []);

    // Listen for real-time reminder notifications and show toast popup
    useEffect(() => {
        const handleNewNotification = (event) => {
            const data = event.detail;
            if (!data?.notification) return;

            const currentUser = userRef.current;
            if (data.targetUserId && currentUser?.id && data.targetUserId !== currentUser.id) return;

            const notif = data.notification;
            // Only show popup for REMINDER type
            if (notif.type !== 'REMINDER') return;

            // Parse data for conversationId
            let conversationId = null;
            try {
                const parsed = notif.data ? JSON.parse(notif.data) : null;
                conversationId = parsed?.conversationId;
            } catch (e) { /* ignore */ }

            addToastRef.current({
                type: 'reminder',
                title: notif.title || '⏰ Hatırlatıcı',
                message: notif.body || 'Hatırlatıcı zamanı geldi!',
                duration: 8000,
                onClick: conversationId ? async () => {
                    const reminderWorkspaceId = notif.workspaceId;
                    if (reminderWorkspaceId && reminderWorkspaceId !== currentWorkspaceRef.current?.id && switchWorkspaceRef.current) {
                        await switchWorkspaceRef.current(reminderWorkspaceId);
                    }
                    window.location.href = `/inbox?conversationId=${conversationId}`;
                } : undefined
            });
        };

        window.addEventListener('websocket:new_notification', handleNewNotification);
        return () => window.removeEventListener('websocket:new_notification', handleNewNotification);
    }, []);

    return (
        <ToastContext.Provider value={{
            addToast,
            removeToast,
            showSuccess,
            showError,
            showInfo,
            showWarning,
            showAssignment,
            success: (msg, title) => showSuccess(title || 'Başarılı', msg || title),
            error: (msg, title) => showError(title || 'Hata', msg || title),
            info: (msg, title) => showInfo(title || 'Bilgi', msg || title),
            warning: (msg, title) => showWarning(title || 'Mesai Dışı Atama', msg || title)
        }}>
            {children}
            <ToastContainer toasts={toasts} removeToast={removeToast} />
        </ToastContext.Provider>
    );
};

// Toast Container Component
const ToastContainer = ({ toasts, removeToast }) => {
    if (toasts.length === 0) return null;

    return (
        <div className="toast-container">
            {toasts.map(toast => (
                <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
            ))}
        </div>
    );
};

// Individual Toast Item
const ToastItem = ({ toast, onClose }) => {
    const [isExiting, setIsExiting] = useState(false);

    const handleClose = () => {
        setIsExiting(true);
        setTimeout(onClose, 300);
    };

    const handleClick = () => {
        if (toast.onClick) {
            toast.onClick();
            handleClose();
        }
    };

    const getIcon = () => {
        switch (toast.type) {
            case 'success':
                return <CheckCircle size={20} />;
            case 'error':
                return <AlertCircle size={20} />;
            case 'warning':
                return <AlertCircle size={20} />;
            case 'assignment':
                return <UserPlus size={20} />;
            case 'message':
                return <MessageSquare size={20} />;
            case 'reminder':
                return <Bell size={20} />;
            default:
                return <Info size={20} />;
        }
    };

    return (
        <div
            className={`toast-item toast-${toast.type} ${isExiting ? 'toast-exit' : ''} ${toast.onClick ? 'toast-clickable' : ''}`}
            onClick={toast.onClick ? handleClick : undefined}
        >
            <div className="toast-icon">
                {getIcon()}
            </div>
            <div className="toast-content">
                {toast.title && <div className="toast-title">{toast.title}</div>}
                {toast.message && <div className="toast-message">{toast.message}</div>}
            </div>
            <button className="toast-close" onClick={(e) => { e.stopPropagation(); handleClose(); }}>
                <X size={16} />
            </button>
        </div>
    );
};

// Custom hook to use toast
export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        return {
            addToast: () => {},
            removeToast: () => {},
            showSuccess: (title, message) => console.log(title, message),
            showError: (title, message) => alert(message || title),
            showInfo: (title, message) => console.info(title, message),
            showWarning: (title, message) => console.warn(title, message),
            showAssignment: (title, message) => console.log(title, message),
            success: (msg, title) => console.log(title, msg),
            error: (msg, title) => alert(msg || title),
            info: (msg, title) => console.info(title, msg),
            warning: (msg, title) => console.warn(title, msg)
        };
    }
    return context;
};

export default ToastProvider;


