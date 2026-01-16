import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { workspaceAPI } from '../../services/api';
import AddMemberModal from '../../components/AddMemberModal';
import { Users as UsersIcon, Plus, Shield, Trash2, UserCog, MoreVertical } from 'lucide-react';
import './Users.css';

const Users = () => {
    const { currentWorkspace, user } = useAuth();
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showAddMemberModal, setShowAddMemberModal] = useState(false);

    useEffect(() => {
        if (currentWorkspace) {
            loadMembers();
        }
    }, [currentWorkspace]);

    const loadMembers = async () => {
        try {
            setLoading(true);
            const response = await workspaceAPI.getMembers(currentWorkspace.id);
            setMembers(response.data.members);
        } catch (error) {
            console.error('Error loading members:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveMember = async (targetUserId) => {
        if (!window.confirm('Bu üyeyi takımdan çıkarmak istediğinize emin misiniz?')) return;

        try {
            await workspaceAPI.removeMember(currentWorkspace.id, targetUserId);
            loadMembers();
        } catch (error) {
            console.error('Error removing member:', error);
            alert(error.response?.data?.error || 'Üye çıkarılırken hata oluştu');
        }
    };

    const handleUpdateRole = async (targetUserId, newRole) => {
        try {
            await workspaceAPI.updateMemberRole(currentWorkspace.id, targetUserId, { role: newRole });
            loadMembers();
        } catch (error) {
            console.error('Error updating role:', error);
            alert(error.response?.data?.error || 'Rol güncellenirken hata oluştu');
        }
    };

    const canManage = (memberRole) => {
        const currentUserRole = user?.role;

        if (['SUPER_ADMIN', 'OWNER'].includes(currentUserRole)) return true;
        return false;
    };

    if (!currentWorkspace) {
        return (
            <div className="empty-state">
                <p>Lütfen bir workspace seçin</p>
            </div>
        );
    }

    return (
        <div className="users-page">
            <div className="section-header">
                <div>
                    <h1>Kullanıcılar</h1>
                    <p className="text-muted">Bu workshop'taki takım üyelerini yönetin.</p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => setShowAddMemberModal(true)}
                >
                    <Plus size={16} />
                    Üye Ekle
                </button>
            </div>

            {loading ? (
                <div className="loading">Yükleniyor...</div>
            ) : (
                <div className="card">
                    <table className="members-table">
                        <thead>
                            <tr>
                                <th>Üye</th>
                                <th>E-posta</th>
                                <th>Rol</th>
                                <th>İşlemler</th>
                            </tr>
                        </thead>
                        <tbody>
                            {members.map((member) => (
                                <tr key={member.id}>
                                    <td>
                                        <div className="member-info">
                                            <div className="member-avatar">
                                                {member.user.avatar ? (
                                                    <img src={member.user.avatar} alt={member.user.name} />
                                                ) : (
                                                    <span>{member.user.name.charAt(0).toUpperCase()}</span>
                                                )}
                                            </div>
                                            <span>{member.user.name}</span>
                                        </div>
                                    </td>
                                    <td>{member.user.email}</td>
                                    <td>
                                        <span className={`badge badge-${member.role.toLowerCase()}`}>
                                            {member.role}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="action-buttons">
                                            {canManage(member.role) && member.userId !== user?.id && (
                                                <>
                                                    <select
                                                        className="role-select"
                                                        value={member.role}
                                                        onChange={(e) => handleUpdateRole(member.userId, e.target.value)}
                                                    >
                                                        <option value="OWNER">Owner</option>
                                                        <option value="AGENT">Agent</option>
                                                    </select>
                                                    <button
                                                        className="btn-icon btn-danger"
                                                        title="Üyeyi Çıkar"
                                                        onClick={() => handleRemoveMember(member.userId)}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showAddMemberModal && (
                <AddMemberModal
                    workspaceId={currentWorkspace.id}
                    onClose={() => setShowAddMemberModal(false)}
                    onSuccess={loadMembers}
                />
            )}
        </div>
    );
};

export default Users;
