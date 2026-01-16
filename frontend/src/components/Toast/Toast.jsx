import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info, UserPlus } from 'lucide-react';
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


