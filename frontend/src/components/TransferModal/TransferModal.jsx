import React, { useState } from 'react';
import { conversationAPI } from '../../services/api';
import { X, ArrowRightLeft, User, Users, MessageSquare } from 'lucide-react';
import './TransferModal.css';

const TransferModal = ({ isOpen, onClose, conversationId, workspaceId, members = [], teams = [], onTransferComplete }) => {
    const [transferType, setTransferType] = useState('user'); // 'user' or 'team'
    const [selectedUser, setSelectedUser] = useState('');
    const [selectedTeam, setSelectedTeam] = useState('');
    const [note, setNote] = useState('');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleTransfer = async (e) => {
        e.preventDefault();
        
        if (transferType === 'user' && !selectedUser) {
            alert('Lütfen bir kullanıcı seçin');
            return;
        }
        if (transferType === 'team' && !selectedTeam) {
            alert('Lütfen bir takım seçin');
            return;
        }

        try {
            setLoading(true);
            await conversationAPI.transfer(workspaceId, conversationId, {
                toUserId: transferType === 'user' ? selectedUser : null,
                toTeamId: transferType === 'team' ? selectedTeam : null,
                note: note
            });
            
            // Reset form
            setSelectedUser('');
            setSelectedTeam('');
            setNote('');
            
            // Callback
            if (onTransferComplete) {
                onTransferComplete();
            }
            
            alert('Sohbet başarıyla transfer edildi!');
            onClose();
        } catch (error) {
            console.error('Transfer error:', error);
            alert('Transfer başarısız: ' + (error.response?.data?.error || error.message));
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setSelectedUser('');
        setSelectedTeam('');
        setNote('');
        setTransferType('user');
        onClose();
    };

    return (
        <div className="transfer-modal-overlay" onClick={handleClose}>
            <div className="transfer-modal" onClick={e => e.stopPropagation()}>
                <div className="transfer-modal-header">
                    <div className="transfer-modal-title">
                        <ArrowRightLeft size={20} />
                        <h3>Sohbeti Devret</h3>
                    </div>
                    <button onClick={handleClose} className="close-btn">
                        <X size={20} />
                    </button>
                </div>

                <div className="transfer-info">
                    <MessageSquare size={16} />
                    <span>Bu sohbet tüm geçmişiyle birlikte devredilecektir.</span>
                </div>

                <form onSubmit={handleTransfer}>
                    {/* Transfer Type Selection */}
                    <div className="transfer-type-tabs">
                        <button
                            type="button"
                            className={`transfer-type-tab ${transferType === 'user' ? 'active' : ''}`}
                            onClick={() => setTransferType('user')}
                        >
                            <User size={16} />
                            Kullanıcıya
                        </button>
                        <button
                            type="button"
                            className={`transfer-type-tab ${transferType === 'team' ? 'active' : ''}`}
                            onClick={() => setTransferType('team')}
                        >
                            <Users size={16} />
                            Takıma
                        </button>
                    </div>

                    {/* User Selection */}
                    {transferType === 'user' && (
                        <div className="form-group">
                            <label>Hangi Kullanıcıya?</label>
                            <div className="user-list">
                                {members.map(member => (
                                    <label 
                                        key={member.userId || member.user?.id} 
                                        className={`user-option ${selectedUser === (member.userId || member.user?.id) ? 'selected' : ''}`}
                                    >
                                        <input
                                            type="radio"
                                            name="transferUser"
                                            value={member.userId || member.user?.id}
                                            checked={selectedUser === (member.userId || member.user?.id)}
                                            onChange={(e) => setSelectedUser(e.target.value)}
                                        />
                                        <div className="user-avatar">
                                            {member.user?.name?.charAt(0)?.toUpperCase() || 'U'}
                                        </div>
                                        <div className="user-info">
                                            <span className="user-name">{member.user?.name || 'Kullanıcı'}</span>
                                            <span className="user-role">{member.role}</span>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Team Selection */}
                    {transferType === 'team' && (
                        <div className="form-group">
                            <label>Hangi Takıma?</label>
                            {teams && teams.length > 0 ? (
                                <div className="team-list">
                                    {teams.map(team => (
                                        <label 
                                            key={team.id} 
                                            className={`team-option ${selectedTeam === team.id ? 'selected' : ''}`}
                                        >
                                            <input
                                                type="radio"
                                                name="transferTeam"
                                                value={team.id}
                                                checked={selectedTeam === team.id}
                                                onChange={(e) => setSelectedTeam(e.target.value)}
                                            />
                                            <div className="team-avatar">
                                                <Users size={16} />
                                            </div>
                                            <div className="team-info">
                                                <span className="team-name">{team.name}</span>
                                                <span className="team-members">{team._count?.members || 0} üye</span>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            ) : (
                                <p className="no-teams">Henüz takım oluşturulmamış.</p>
                            )}
                        </div>
                    )}

                    <div className="form-group">
                        <label>Transfer Notu (Opsiyonel)</label>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Neden transfer ediyorsunuz? Önemli bilgiler..."
                            rows={3}
                            className="transfer-note-input"
                        />
                    </div>

                    <div className="modal-actions">
                        <button type="button" onClick={handleClose} className="btn-cancel">
                            İptal
                        </button>
                        <button 
                            type="submit" 
                            className="btn-confirm" 
                            disabled={loading || (transferType === 'user' && !selectedUser) || (transferType === 'team' && !selectedTeam)}
                        >
                            {loading ? 'Transfer Ediliyor...' : 'Devret'}
                            <ArrowRightLeft size={16} />
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default TransferModal;
