import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import './ConfirmModal.css';

const ConfirmModal = ({
    isOpen,
    onConfirm,
    onCancel,
    title = 'Emin misiniz?',
    message = 'Bu işlemi gerçekleştirmek istediğinize emin misiniz?',
    confirmText = 'Evet, Devam Et',
    cancelText = 'İptal',
    type = 'danger' // 'danger' | 'warning' | 'info'
}) => {
    if (!isOpen) return null;

    return (
        <div className="confirm-modal-overlay" onClick={onCancel}>
            <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
                <button className="confirm-modal-close" onClick={onCancel}>
                    <X size={18} />
                </button>
                <div className={`confirm-modal-icon ${type}`}>
                    <AlertTriangle size={28} />
                </div>
                <h3 className="confirm-modal-title">{title}</h3>
                <p className="confirm-modal-message">{message}</p>
                <div className="confirm-modal-actions">
                    <button className="confirm-modal-btn cancel" onClick={onCancel}>
                        {cancelText}
                    </button>
                    <button className={`confirm-modal-btn confirm ${type}`} onClick={onConfirm}>
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;
