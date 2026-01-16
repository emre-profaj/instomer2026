import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { teamAPI, workspaceAPI } from '../../services/api';
import { Plus, Users, Edit2, Trash2, X, UserPlus } from 'lucide-react';
import './Teams.css';

const Teams = () => {
    const { currentWorkspace, user } = useAuth();
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
    const [selectedTeam, setSelectedTeam] = useState(null);

    // Modal Form States
    const [teamName, setTeamName] = useState('');
    const [teamDescription, setTeamDescription] = useState('');

    // Member Management States
    const [workspaceMembers, setWorkspaceMembers] = useState([]);
    const [teamMembers, setTeamMembers] = useState([]);
    const [selectedMemberToAdd, setSelectedMemberToAdd] = useState('');

    useEffect(() => {
        if (currentWorkspace) {
            loadTeams();
            loadWorkspaceMembers();
        }
    }, [currentWorkspace]);

    const loadTeams = async () => {
        try {
            setLoading(true);
            const response = await teamAPI.getWorkspaceTeams(currentWorkspace.id);
            setTeams(response.data.teams);
        } catch (error) {
            console.error('Error loading teams:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadWorkspaceMembers = async () => {
        try {
            const response = await workspaceAPI.getMembers(currentWorkspace.id);
            setWorkspaceMembers(response.data.members);
        } catch (error) {
            console.error('Error loading members:', error);
        }
    };

    const handleCreateTeam = async (e) => {
        e.preventDefault();
        try {
            if (selectedTeam) {
                // Update
                const response = await teamAPI.update(currentWorkspace.id, selectedTeam.id, {
                    name: teamName,
                    description: teamDescription
                });
                if (response.data && response.data.team) {
                    setTeams(teams.map(t => t.id === selectedTeam.id ? response.data.team : t));
                }
            } else {
                // Create
                const response = await teamAPI.create(currentWorkspace.id, {
                    name: teamName,
                    description: teamDescription
                });
                if (response.data && response.data.team) {
                    setTeams([...teams, response.data.team]);
                }
            }
            closeCreateModal();
        } catch (error) {
            console.error('Error saving team:', error);
        }
    };

    const handleDeleteTeam = async (teamId) => {
        if (window.confirm('Bu takımı silmek istediğinize emin misiniz?')) {
            try {
                await teamAPI.delete(currentWorkspace.id, teamId);
                setTeams(teams.filter(t => t.id !== teamId));
            } catch (error) {
                console.error('Error deleting team:', error);
            }
        }
    };

    const openCreateModal = (team = null) => {
        if (team) {
            setSelectedTeam(team);
            setTeamName(team.name);
            setTeamDescription(team.description || '');
        } else {
            setSelectedTeam(null);
            setTeamName('');
            setTeamDescription('');
        }
        setIsCreateModalOpen(true);
    };

    const closeCreateModal = () => {
        setIsCreateModalOpen(false);
        setSelectedTeam(null);
        setTeamName('');
        setTeamDescription('');
    };

    // Members Management
    const openMembersModal = async (team) => {
        setSelectedTeam(team);
        try {
            // Optimistically set members from the team object if available, or fetch fresh
            if (team.members) {
                setTeamMembers(team.members);
            }
            // Fetch fresh members to be sure
            const response = await teamAPI.getMembers(currentWorkspace.id, team.id);
            setTeamMembers(response.data.members);
            setIsMembersModalOpen(true);
        } catch (error) {
            console.error('Error loading team members:', error);
        }
    };

    const handleAddMember = async () => {
        if (!selectedMemberToAdd || !selectedTeam) return;
        try {
            const data = { userId: selectedMemberToAdd };
            
            await teamAPI.addMember(currentWorkspace.id, selectedTeam.id, data);
            // Refresh members list
            const response = await teamAPI.getMembers(currentWorkspace.id, selectedTeam.id);
            const newMembers = response.data.members;
            setTeamMembers(newMembers);
            setSelectedMemberToAdd('');

            // Update team members in main list locally
            setTeams(teams.map(t => {
                if (t.id === selectedTeam.id) {
                    return { ...t, members: newMembers };
                }
                return t;
            }));
        } catch (error) {
            console.error('Error adding member:', error);
            alert('Üye eklenirken bir hata oluştu.');
        }
    };

    const handleRemoveMember = async (member) => {
        if (!selectedTeam) return;
        try {
            const memberId = member.userId;
            
            await teamAPI.removeMember(currentWorkspace.id, selectedTeam.id, memberId, 'user');
            // Refresh members list
            const response = await teamAPI.getMembers(currentWorkspace.id, selectedTeam.id);
            const newMembers = response.data.members;
            setTeamMembers(newMembers);

            // Update team members in main list locally
            setTeams(teams.map(t => {
                if (t.id === selectedTeam.id) {
                    return { ...t, members: newMembers };
                }
                return t;
            }));
        } catch (error) {
            console.error('Error removing member:', error);
        }
    };

    const getAvailableMembers = () => {
        const teamUserIds = teamMembers.filter(m => m.userId).map(m => m.userId);
        return workspaceMembers.filter(m => !teamUserIds.includes(m.userId));
    };

    return (
        <div className="teams-page-container">
            <div className="teams-header">
                <h2>Takım Yönetimi</h2>
                <button className="create-team-btn" onClick={() => openCreateModal()}>
                    <Plus size={20} />
                    Yeni Takım Oluştur
                </button>
            </div>

            {loading ? (
                <div>Yükleniyor...</div>
            ) : (
                <div className="teams-grid">
                    {teams.map(team => (
                        <div key={team.id} className="team-card">
                            <div className="team-card-header">
                                <div className="team-info">
                                    <h3>{team.name}</h3>
                                    <p className="team-description">{team.description || 'Açıklama yok'}</p>
                                </div>
                                <div className="team-actions">
                                    <button className="icon-btn" onClick={() => openCreateModal(team)} title="Düzenle">
                                        <Edit2 size={16} />
                                    </button>
                                    <button className="icon-btn danger" onClick={() => handleDeleteTeam(team.id)} title="Sil">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>

                            <div className="team-stats">
                                <Users size={16} />
                                <span>{team.members?.filter(m => m.userId).length || 0} Kullanıcı</span>
                            </div>

                            <button className="manage-members-btn" onClick={() => openMembersModal(team)}>
                                Üyeleri Yönet
                            </button>
                        </div>
                    ))}
                    {teams.length === 0 && (
                        <div className="no-teams">
                            Henüz hiç takım oluşturulmamış.
                        </div>
                    )}
                </div>
            )}

            {/* Create/Edit Team Modal */}
            {isCreateModalOpen && (
                <div className="teams-modal-overlay" onClick={closeCreateModal}>
                    <div className="teams-modal-content" onClick={e => e.stopPropagation()}>
                        <div className="teams-modal-header">
                            <h3>{selectedTeam ? 'Takımı Düzenle' : 'Yeni Takım Oluştur'}</h3>
                            <button className="teams-close-modal-btn" onClick={closeCreateModal}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleCreateTeam}>
                            <div className="form-group">
                                <label>Takım Adı</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={teamName}
                                    onChange={(e) => setTeamName(e.target.value)}
                                    placeholder="Örn: Destek Ekibi"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Açıklama</label>
                                <textarea
                                    className="form-input"
                                    value={teamDescription}
                                    onChange={(e) => setTeamDescription(e.target.value)}
                                    placeholder="Takım hakkında kısa bilgi..."
                                    rows={3}
                                />
                            </div>
                            <div className="teams-modal-actions">
                                <button type="button" className="btn-secondary" onClick={closeCreateModal}>İptal</button>
                                <button type="submit" className="btn-primary">Kaydet</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Manage Members Modal */}
            {isMembersModalOpen && selectedTeam && (
                <div className="teams-modal-overlay" onClick={() => setIsMembersModalOpen(false)}>
                    <div className="teams-modal-content" onClick={e => e.stopPropagation()}>
                        <div className="teams-modal-header">
                            <h3>{selectedTeam.name} - Üyeler</h3>
                            <button className="teams-close-modal-btn" onClick={() => setIsMembersModalOpen(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="add-member-section">
                            <div className="member-select-row">
                                <select
                                    className="member-select"
                                    value={selectedMemberToAdd}
                                    onChange={(e) => setSelectedMemberToAdd(e.target.value)}
                                >
                                    <option value="">Kullanıcı Seçin...</option>
                                    {getAvailableMembers().map(m => (
                                        <option key={m.userId} value={m.userId}>{m.user.name}</option>
                                    ))}
                                </select>
                                <button
                                    className="btn-primary"
                                    onClick={handleAddMember}
                                    disabled={!selectedMemberToAdd}
                                >
                                    Ekle
                                </button>
                            </div>
                        </div>

                        <div className="members-list">
                            {teamMembers.filter(m => m.userId).length > 0 ? (
                                teamMembers.filter(m => m.userId).map(member => (
                                    <div key={member.id} className="member-item">
                                        <div className="member-info">
                                            <div className="member-avatar">
                                                <span style={{ color: '#ffffff' }}>{member.user?.name?.charAt(0).toUpperCase() || '?'}</span>
                                            </div>
                                            <div className="member-details">
                                                <span className="member-name">
                                                    {member.user?.name}
                                                </span>
                                                <span className="member-type-badge">
                                                    Kullanıcı
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            className="icon-btn danger"
                                            onClick={() => handleRemoveMember(member)}
                                            title="Çıkar"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <div style={{ textAlign: 'center', color: '#9ca3af', padding: '20px' }}>
                                    Bu takımda henüz üye yok.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Teams;
