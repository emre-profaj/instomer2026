import React, { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';
import { X, CheckCircle, AlertCircle, Info, UserPlus, MessageSquare, Bell } from 'lucide-react';
import './Toast.css';

// Toast Context
const ToastContext = createContext(null);

// Toast Provider Component
export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

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

            const senderName = data.contactName || data.message?.contactName || 'Yeni Mesaj';
            const messageText = data.message?.content || '';
            const preview = messageText.length > 60 ? messageText.substring(0, 60) + '...' : messageText;

            const channelLabels = {
                'FACEBOOK': 'Facebook',
                'INSTAGRAM': 'Instagram',
                'WHATSAPP': 'WhatsApp',
                'WIDGET': 'Widget',
                'LEAD': 'Lead',
                'EMAIL': 'E-posta'
            };
            const channelLabel = channelLabels[data.channel] || data.channel || '';

            addToastRef.current({
                type: 'message',
                title: `📨 ${senderName}`,
                message: `${channelLabel}: ${preview}`,
                duration: 5000
            });
        };

        window.addEventListener('websocket:new_message', handleNewMessage);
        return () => window.removeEventListener('websocket:new_message', handleNewMessage);
    }, []);

    // Listen for real-time reminder notifications and show toast popup
    useEffect(() => {
        const handleNewNotification = (event) => {
            const data = event.detail;
            if (!data?.notification) return;

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
                onClick: conversationId ? () => {
                    window.location.href = `/inbox?conversation=${conversationId}`;
                } : undefined
            });
        };

        window.addEventListener('websocket:new_notification', handleNewNotification);
        return () => window.removeEventListener('websocket:new_notification', handleNewNotification);
    }, []);

    return (
        <ToastContext.Provider value={{ addToast, removeToast, showSuccess, showError, showInfo, showAssignment }}>
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
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

export default ToastProvider;


