import React, { useState, useEffect } from 'react';
import { conversationAPI } from '../../services/api';
import { X, Check, ArrowRight } from 'lucide-react';
import './PendingTransfersModal.css';

const PendingTransfersModal = ({ isOpen, onClose, onTransferProcessed }) => {
    const [transfers, setTransfers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen) {
            loadTransfers();
        }
    }, [isOpen]);

    const loadTransfers = async () => {
        try {
            setLoading(true);
            const response = await conversationAPI.getPendingTransfers();
            setTransfers(response.data.transfers);
        } catch (error) {
            console.error('Error loading transfers:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAccept = async (transferId) => {
        try {
            await conversationAPI.acceptTransfer(transferId);
            setTransfers(transfers.filter(t => t.id !== transferId));
            if (onTransferProcessed) onTransferProcessed();
            // If no transfers left, close modal automatically after a delay or let user close
            if (transfers.length === 1) onClose();
        } catch (error) {
            console.error('Error accepting transfer:', error);
            alert('Transfer kabul edilirken hata oluştu.');
        }
    };

    const handleReject = async (transferId) => {
        if (!window.confirm('Bu transferi reddetmek istediğinize emin misiniz?')) return;
        try {
            await conversationAPI.rejectTransfer(transferId);
            setTransfers(transfers.filter(t => t.id !== transferId));
            if (transfers.length === 1) onClose();
        } catch (error) {
            console.error('Error rejecting transfer:', error);
            alert('Transfer reddedilirken hata oluştu.');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="pending-transfers-overlay">
            <div className="pending-transfers-modal">
                <div className="modal-header">
                    <h3>Bekleyen Transferler</h3>
                    <button onClick={onClose} className="close-btn">
                        <X size={20} />
                    </button>
                </div>

                <div className="transfers-list">
                    {loading ? (
                        <div className="loading-text">Yükleniyor...</div>
                    ) : transfers.length === 0 ? (
                        <div className="empty-text">Bekleyen transfer yok.</div>
                    ) : (
                        transfers.map(transfer => (
                            <div key={transfer.id} className="transfer-item">
                                <div className="transfer-info">
                                    <div className="transfer-meta">
                                        <span className="from-user">
                                            {transfer.fromUser.name}
                                        </span>
                                        <ArrowRight size={14} className="arrow-icon" />
                                        <span className="to-me">Bana Transfer</span>
                                    </div>
                                    <div className="transfer-conversation">
                                        <strong>{transfer.conversation.contact.name}</strong> ile sohbet
                                    </div>
                                    {transfer.note && (
                                        <div className="transfer-note">
                                            "{transfer.note}"
                                        </div>
                                    )}
                                    <div className="transfer-time">
                                        {new Date(transfer.createdAt).toLocaleString('tr-TR')}
                                    </div>
                                </div>
                                <div className="transfer-actions">
                                    <button
                                        className="btn-accept"
                                        onClick={() => handleAccept(transfer.id)}
                                        title="Kabul Et"
                                    >
                                        <Check size={18} />
                                    </button>
                                    <button
                                        className="btn-reject"
                                        onClick={() => handleReject(transfer.id)}
                                        title="Reddet"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default PendingTransfersModal;
