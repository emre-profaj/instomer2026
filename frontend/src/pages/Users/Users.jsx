import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { workspaceAPI } from '../../services/api';
import AddMemberModal from '../../components/AddMemberModal';
import { Users as UsersIcon, Plus, Shield, Trash2, UserCog, MoreVertical, Key, X, Eye, EyeOff } from 'lucide-react';
import './Users.css';

// Şifre Değiştirme Modal Komponenti
const ChangePasswordModal = ({ memberName, onSubmit, onClose }) => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (password.length < 6) {
            setError('Şifre en az 6 karakter olmalıdır');
            return;
        }

        if (password !== confirmPassword) {
            setError('Şifreler eşleşmiyor');
            return;
        }

        setLoading(true);
        try {
            await onSubmit(password);
            onClose();
        } catch (err) {
            setError(err.message || 'Şifre değiştirilemedi');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content password-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2><Key size={20} /> Şifre Değiştir</h2>
                    <button className="btn-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <p className="password-modal-info">
                            <strong>{memberName}</strong> için yeni şifre belirleyin
                        </p>

                        {error && <div className="alert alert-danger">{error}</div>}

                        <div className="form-group">
                            <label>Yeni Şifre</label>
                            <div className="password-input-wrapper">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="En az 6 karakter"
                                    autoFocus
                                    required
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Şifre Tekrar</label>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Şifreyi tekrar girin"
                                required
                            />
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            İptal
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? 'Kaydediliyor...' : 'Şifreyi Değiştir'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const Users = () => {
    const { currentWorkspace, user } = useAuth();
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showAddMemberModal, setShowAddMemberModal] = useState(false);
    const [passwordModal, setPasswordModal] = useState({ show: false, userId: null, memberName: '' });

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

    const handleChangePassword = async (newPassword) => {
        const response = await workspaceAPI.changeMemberPassword(
            currentWorkspace.id,
            passwordModal.userId,
            newPassword
        );
        alert(response.data.message || 'Şifre başarıyla değiştirildi');
    };

    const openPasswordModal = (userId, memberName) => {
        setPasswordModal({ show: true, userId, memberName });
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
                                                        className="btn-icon btn-secondary"
                                                        title="Şifre Değiştir"
                                                        onClick={() => openPasswordModal(member.userId, member.user.name)}
                                                    >
                                                        <Key size={16} />
                                                    </button>
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

            {passwordModal.show && (
                <ChangePasswordModal
                    memberName={passwordModal.memberName}
                    onSubmit={handleChangePassword}
                    onClose={() => setPasswordModal({ show: false, userId: null, memberName: '' })}
                />
            )}
        </div>
    );
};

export default Users;
