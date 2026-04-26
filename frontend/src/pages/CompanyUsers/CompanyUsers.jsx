import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { Users, Plus, X, Check } from 'lucide-react';
import { companyAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import './CompanyUsers.css';

const CompanyUsers = ({ companyId }) => {
    const { t } = useTranslation();
    const { user, onlineUsers } = useAuth();
    const [users, setUsers] = useState([]);
    const [companyWorkspaces, setCompanyWorkspaces] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState(null);
    const [selectedWorkspaces, setSelectedWorkspaces] = useState([]);
    const [showAssignModal, setShowAssignModal] = useState(false);

    useEffect(() => {
        if (companyId) {
            fetchCompanyUsers();
        }
    }, [companyId]);

    const fetchCompanyUsers = async () => {
        try {
            setLoading(true);
            const response = await companyAPI.getCompanyUsers(companyId);
            setUsers(response.data.users || []);
            setCompanyWorkspaces(response.data.companyWorkspaces || []);
        } catch (error) {
            console.error('Error fetching company users:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAssignUser = (user) => {
        setSelectedUser(user);
        setSelectedWorkspaces(user.workspaces?.map(ws => ws.id) || []);
        setShowAssignModal(true);
    };

    const toggleWorkspace = (workspaceId) => {
        setSelectedWorkspaces(prev =>
            prev.includes(workspaceId)
                ? prev.filter(id => id !== workspaceId)
                : [...prev, workspaceId]
        );
    };

    const handleSaveAssignment = async () => {
        try {
            await companyAPI.assignUserToWorkspaces(companyId, {
                userId: selectedUser.id,
                workspaceIds: selectedWorkspaces,
                role: 'AGENT'
            });
            setShowAssignModal(false);
            fetchCompanyUsers();
        } catch (error) {
            console.error('Error assigning user:', error);
            alert('User assignment failed');
        }
    };

    const handleRemoveFromWorkspace = async (userId, workspaceId) => {
        if (!confirm('Bu kullanıcıyı workspace\'ten çıkarmak istediğinize emin misiniz?')) return;

        try {
            await companyAPI.removeUserFromWorkspace(companyId, { userId, workspaceId });
            fetchCompanyUsers();
        } catch (error) {
            console.error('Error removing user:', error);
            alert('User removal failed');
        }
    };

    if (loading) return <div className="loading">Loading...</div>;

    return (
        <div className="company-users-container">
            <div className="company-users-header">
                <h2><Users size={24} />{t('companyUsers.title')}</h2>
                <p>{users.length} kullanıcı</p>
            </div>

            <div className="users-list">
                {users.map(user => (
                    <div key={user.id} className="user-card">
                        <div className="user-info">
                            <div className="user-avatar">
                                {user.avatar ? (
                                    <img src={user.avatar} alt={user.name} />
                                ) : (
                                    <span>{user.name?.charAt(0)?.toUpperCase()}</span>
                                )}
                                <span className={`online-dot ${(onlineUsers.get(user.id)?.isOnline || user.isOnline) ? 'online' : 'offline'}`} />
                            </div>
                            <div className="user-details">
                                <h3>{user.name}</h3>
                                <p>{user.email}</p>
                            </div>
                        </div>

                        <div className="user-workspaces">
                            {user.workspaces?.map(ws => (
                                <span key={ws.id} className="workspace-badge">
                                    {ws.name}
                                    <button
                                        onClick={() => handleRemoveFromWorkspace(user.id, ws.id)}
                                        className="remove-btn"
                                        title={t('common.remove') || 'Remove'}
                                    >
                                        <X size={12} />
                                    </button>
                                </span>
                            ))}
                        </div>

                        <button
                            onClick={() => handleAssignUser(user)}
                            className="assign-btn"
                        >
                            <Plus size={16} /> Workspace Ata
                        </button>
                    </div>
                ))}
            </div>

            {showAssignModal && (
                <div className="modal-overlay" onClick={() => setShowAssignModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{t('companyUsers.workspaceAssignment')}</h3>
                            <button onClick={() => setShowAssignModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="modal-body">
                            <p className="user-name">{selectedUser?.name}</p>
                            <p className="workspace-count">
                                {selectedWorkspaces.length} / {companyWorkspaces.length} workspace seçildi
                            </p>

                            <div className="workspace-list">
                                {companyWorkspaces.map(ws => {
                                    const isSelected = selectedWorkspaces.includes(ws.id);
                                    return (
                                        <div
                                            key={ws.id}
                                            className={`workspace-item ${isSelected ? 'selected' : ''}`}
                                            onClick={() => toggleWorkspace(ws.id)}
                                        >
                                            <div className="checkbox">
                                                {isSelected && <Check size={16} />}
                                            </div>
                                            <span>{ws.name}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button onClick={() => setShowAssignModal(false)} className="btn-cancel">
                                İptal
                            </button>
                            <button onClick={handleSaveAssignment} className="btn-save">
                                Kaydet
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CompanyUsers;
