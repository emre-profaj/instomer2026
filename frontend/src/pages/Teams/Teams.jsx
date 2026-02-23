import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { teamAPI, workspaceAPI } from '../../services/api';
import { Plus, Users, Edit2, Trash2, X, UserPlus, ChevronDown, ChevronRight, GitBranch, GripVertical } from 'lucide-react';
import './Teams.css';

const Teams = () => {
    const { currentWorkspace, user } = useAuth();
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
    const [selectedTeam, setSelectedTeam] = useState(null);
    const [expandedTeams, setExpandedTeams] = useState({});

    // Drag and Drop States
    const [draggedTeam, setDraggedTeam] = useState(null);
    const [dragOverTeamId, setDragOverTeamId] = useState(null);
    const [isDragOverRoot, setIsDragOverRoot] = useState(false);

    // Modal Form States
    const [teamName, setTeamName] = useState('');
    const [teamDescription, setTeamDescription] = useState('');
    const [parentIdForCreate, setParentIdForCreate] = useState(null);

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
                    loadTeams(); // Reload to get hierarchy
                }
            } else {
                // Create
                const response = await teamAPI.create(currentWorkspace.id, {
                    name: teamName,
                    description: teamDescription,
                    parentId: parentIdForCreate || null
                });
                if (response.data && response.data.team) {
                    loadTeams(); // Reload to get hierarchy
                    // Auto-expand parent if creating sub-team
                    if (parentIdForCreate) {
                        setExpandedTeams(prev => ({ ...prev, [parentIdForCreate]: true }));
                    }
                }
            }
            closeCreateModal();
        } catch (error) {
            console.error('Error saving team:', error);
        }
    };

    const handleDeleteTeam = async (teamId) => {
        if (window.confirm('Bu takımı ve alt takımlarını silmek istediğinize emin misiniz?')) {
            try {
                await teamAPI.delete(currentWorkspace.id, teamId);
                loadTeams();
            } catch (error) {
                console.error('Error deleting team:', error);
            }
        }
    };

    const openCreateModal = (team = null, parentId = null) => {
        if (team) {
            setSelectedTeam(team);
            setTeamName(team.name);
            setTeamDescription(team.description || '');
            setParentIdForCreate(null);
        } else {
            setSelectedTeam(null);
            setTeamName('');
            setTeamDescription('');
            setParentIdForCreate(parentId);
        }
        setIsCreateModalOpen(true);
    };

    const closeCreateModal = () => {
        setIsCreateModalOpen(false);
        setSelectedTeam(null);
        setTeamName('');
        setTeamDescription('');
        setParentIdForCreate(null);
    };

    const toggleExpand = (teamId) => {
        setExpandedTeams(prev => ({ ...prev, [teamId]: !prev[teamId] }));
    };

    // Members Management
    const openMembersModal = async (team) => {
        setSelectedTeam(team);
        try {
            if (team.members) {
                setTeamMembers(team.members);
            }
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
            const response = await teamAPI.getMembers(currentWorkspace.id, selectedTeam.id);
            const newMembers = response.data.members;
            setTeamMembers(newMembers);
            setSelectedMemberToAdd('');
            loadTeams();
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
            const response = await teamAPI.getMembers(currentWorkspace.id, selectedTeam.id);
            const newMembers = response.data.members;
            setTeamMembers(newMembers);
            loadTeams();
        } catch (error) {
            console.error('Error removing member:', error);
        }
    };

    const getAvailableMembers = () => {
        const teamUserIds = teamMembers.filter(m => m.userId).map(m => m.userId);
        return workspaceMembers.filter(m => !teamUserIds.includes(m.userId));
    };

    // Drag and Drop Handlers
    const isDescendantOf = (teamId, potentialParentId) => {
        // Prevent circular references: check if potentialParentId is a descendant of teamId
        const findTeam = (teams, id) => {
            for (const t of teams) {
                if (t.id === id) return t;
                if (t.children) {
                    const found = findTeam(t.children, id);
                    if (found) return found;
                }
            }
            return null;
        };
        const team = findTeam(teams, teamId);
        if (!team || !team.children) return false;
        const checkChildren = (children) => {
            for (const child of children) {
                if (child.id === potentialParentId) return true;
                if (child.children && checkChildren(child.children)) return true;
            }
            return false;
        };
        return checkChildren(team.children);
    };

    const handleDragStart = (e, team) => {
        setDraggedTeam(team);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', team.id);
        // Add a slight delay to allow the drag image to render
        setTimeout(() => {
            e.target.closest('.team-card-wrapper').classList.add('dragging');
        }, 0);
    };

    const handleDragEnd = (e) => {
        setDraggedTeam(null);
        setDragOverTeamId(null);
        setIsDragOverRoot(false);
        document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    };

    const handleDragOver = (e, targetTeamId) => {
        e.preventDefault();
        e.stopPropagation();
        if (!draggedTeam || draggedTeam.id === targetTeamId) return;
        if (isDescendantOf(draggedTeam.id, targetTeamId)) return;
        e.dataTransfer.dropEffect = 'move';
        setDragOverTeamId(targetTeamId);
        setIsDragOverRoot(false);
    };

    const handleDragLeave = (e, targetTeamId) => {
        // Only clear if we're leaving the actual target, not entering a child
        const relatedTarget = e.relatedTarget;
        const currentTarget = e.currentTarget;
        if (currentTarget.contains(relatedTarget)) return;
        if (dragOverTeamId === targetTeamId) {
            setDragOverTeamId(null);
        }
    };

    const handleDrop = async (e, targetTeamId) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverTeamId(null);
        setIsDragOverRoot(false);

        if (!draggedTeam || draggedTeam.id === targetTeamId) return;
        if (isDescendantOf(draggedTeam.id, targetTeamId)) return;
        // Don't drop on itself or if already a child of target
        if (draggedTeam.parentId === targetTeamId) return;

        try {
            await teamAPI.update(currentWorkspace.id, draggedTeam.id, { parentId: targetTeamId });
            loadTeams();
            // Auto-expand the target team so the moved team is visible
            setExpandedTeams(prev => ({ ...prev, [targetTeamId]: true }));
        } catch (error) {
            console.error('Error moving team:', error);
            alert('Takım taşınırken bir hata oluştu.');
        }
        setDraggedTeam(null);
    };

    const handleRootDragOver = (e) => {
        e.preventDefault();
        if (!draggedTeam || !draggedTeam.parentId) return;
        e.dataTransfer.dropEffect = 'move';
        setIsDragOverRoot(true);
        setDragOverTeamId(null);
    };

    const handleRootDragLeave = (e) => {
        const relatedTarget = e.relatedTarget;
        const currentTarget = e.currentTarget;
        if (currentTarget.contains(relatedTarget)) return;
        setIsDragOverRoot(false);
    };

    const handleRootDrop = async (e) => {
        e.preventDefault();
        setIsDragOverRoot(false);
        setDragOverTeamId(null);

        if (!draggedTeam || !draggedTeam.parentId) return;

        try {
            await teamAPI.update(currentWorkspace.id, draggedTeam.id, { parentId: null });
            loadTeams();
        } catch (error) {
            console.error('Error moving team to root:', error);
            alert('Takım taşınırken bir hata oluştu.');
        }
        setDraggedTeam(null);
    };

    // Render a team card (used for both parent and child)
    const renderTeamCard = (team, isChild = false) => {
        const hasChildren = team.children && team.children.length > 0;
        const isExpanded = expandedTeams[team.id];

        return (
            <div
                key={team.id}
                className={`team-card-wrapper ${isChild ? 'sub-team' : ''} ${dragOverTeamId === team.id ? 'drag-over' : ''}`}
                draggable
                onDragStart={(e) => handleDragStart(e, team)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, team.id)}
                onDragLeave={(e) => handleDragLeave(e, team.id)}
                onDrop={(e) => handleDrop(e, team.id)}
            >
                <div className={`team-card ${isChild ? 'team-card-child' : ''}`}>
                    <div className="team-card-header">
                        <div className="team-info">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="drag-handle" title="Sürükle & Bırak">
                                    <GripVertical size={14} />
                                </span>
                                {hasChildren && (
                                    <button
                                        className="expand-btn"
                                        onClick={() => toggleExpand(team.id)}
                                        title={isExpanded ? 'Daralt' : 'Genişlet'}
                                    >
                                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                    </button>
                                )}
                                {isChild && <GitBranch size={14} color="#9ca3af" />}
                                <h3>{team.name}</h3>
                            </div>
                            <p className="team-description">{team.description || 'Açıklama yok'}</p>
                        </div>
                        <div className="team-actions">
                            <button
                                className="icon-btn"
                                onClick={() => openCreateModal(null, team.id)}
                                title="Alt Takım Ekle"
                            >
                                <Plus size={16} />
                            </button>
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
                        {hasChildren && (
                            <span className="sub-team-count">
                                <GitBranch size={13} />
                                {team.children.length} alt takım
                            </span>
                        )}
                    </div>

                    <button className="manage-members-btn" onClick={() => openMembersModal(team)}>
                        Üyeleri Yönet
                    </button>
                </div>

                {/* Sub-teams */}
                {hasChildren && isExpanded && (
                    <div className="sub-teams-container">
                        {team.children.map(child => renderTeamCard(child, true))}
                    </div>
                )}
            </div>
        );
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
                <div
                    className={`teams-grid ${isDragOverRoot ? 'drag-over-root' : ''}`}
                    onDragOver={handleRootDragOver}
                    onDragLeave={handleRootDragLeave}
                    onDrop={handleRootDrop}
                >
                    {teams.map(team => renderTeamCard(team))}
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
                            <h3>
                                {selectedTeam ? 'Takımı Düzenle' : parentIdForCreate ? 'Alt Takım Oluştur' : 'Yeni Takım Oluştur'}
                            </h3>
                            <button className="teams-close-modal-btn" onClick={closeCreateModal}>
                                <X size={20} />
                            </button>
                        </div>

                        {parentIdForCreate && (
                            <div className="sub-team-info-badge">
                                <GitBranch size={14} />
                                <span>
                                    <strong>{(() => {
                                        const findTeam = (list, id) => {
                                            for (const t of list) {
                                                if (t.id === id) return t;
                                                if (t.children) {
                                                    const found = findTeam(t.children, id);
                                                    if (found) return found;
                                                }
                                            }
                                            return null;
                                        };
                                        return findTeam(teams, parentIdForCreate)?.name;
                                    })()}</strong> takımının altına eklenecek
                                </span>
                            </div>
                        )}

                        <form onSubmit={handleCreateTeam}>
                            <div className="form-group">
                                <label>Takım Adı</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={teamName}
                                    onChange={(e) => setTeamName(e.target.value)}
                                    placeholder={parentIdForCreate ? "Örn: İstanbul Satış" : "Örn: Destek Ekibi"}
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
