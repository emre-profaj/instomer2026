import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { teamAPI, workspaceAPI, aiAPI } from '../../services/api';
import { Plus, Users, Edit2, Trash2, X, UserPlus, ChevronDown, ChevronRight, GitBranch, GripVertical, Bot } from 'lucide-react';
import './Teams.css';
import ConfirmModal from '../../components/ConfirmModal/ConfirmModal';

const Teams = () => {
    const { t } = useTranslation();
    const { currentWorkspace, user } = useAuth();
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
    const [selectedTeam, setSelectedTeam] = useState(null);
    const [expandedTeams, setExpandedTeams] = useState({});
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null, title: '', message: '' });

    // Drag and Drop States
    const [draggedTeam, setDraggedTeam] = useState(null);
    const [dragOverTeamId, setDragOverTeamId] = useState(null);
    const [isDragOverRoot, setIsDragOverRoot] = useState(false);

    // Modal Form States
    const [teamName, setTeamName] = useState('');
    const [teamDescription, setTeamDescription] = useState('');
    const [teamAssignmentRule, setTeamAssignmentRule] = useState('POOL');
    const [parentIdForCreate, setParentIdForCreate] = useState(null);

    // Member Management States
    const [workspaceMembers, setWorkspaceMembers] = useState([]);
    const [teamMembers, setTeamMembers] = useState([]);
    const [selectedMemberToAdd, setSelectedMemberToAdd] = useState('');

    // Bot (AI Assistant) states
    const [bots, setBots] = useState([]);
    const [selectedBotToAdd, setSelectedBotToAdd] = useState('');

    useEffect(() => {
        if (currentWorkspace) {
            loadTeams();
            loadWorkspaceMembers();
            loadBots();
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

    const loadBots = async () => {
        try {
            const response = await aiAPI.getBots(currentWorkspace.id);
            setBots(response.data.bots || []);
        } catch (error) {
            console.error('Error loading bots:', error);
        }
    };

    const handleCreateTeam = async (e) => {
        e.preventDefault();
        try {
            if (selectedTeam) {
                // Update
                const response = await teamAPI.update(currentWorkspace.id, selectedTeam.id, {
                    name: teamName,
                    description: teamDescription,
                    assignmentRule: teamAssignmentRule
                });
                if (response.data && response.data.team) {
                    loadTeams(); // Reload to get hierarchy
                }
            } else {
                // Create
                const response = await teamAPI.create(currentWorkspace.id, {
                    name: teamName,
                    description: teamDescription,
                    assignmentRule: teamAssignmentRule,
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
        setConfirmModal({
            isOpen: true,
            title: t('teams.deleteTeam'),
            message: t('teams.deleteConfirm'),
            confirmText: t('common.confirm'),
            type: 'danger',
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                try {
                    await teamAPI.delete(currentWorkspace.id, teamId);
                    loadTeams();
                } catch (error) {
                    console.error('Error deleting team:', error);
                }
            }
        });
    };

    const openCreateModal = (team = null, parentId = null) => {
        if (team) {
            setSelectedTeam(team);
            setTeamName(team.name);
            setTeamDescription(team.description || '');
            setTeamAssignmentRule(team.assignmentRule || 'POOL');
            setParentIdForCreate(null);
        } else {
            setSelectedTeam(null);
            setTeamName('');
            setTeamDescription('');
            setTeamAssignmentRule('POOL');
            setParentIdForCreate(parentId);
        }
        setIsCreateModalOpen(true);
    };

    const closeCreateModal = () => {
        setIsCreateModalOpen(false);
        setSelectedTeam(null);
        setTeamName('');
        setTeamDescription('');
        setTeamAssignmentRule('POOL');
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
            alert(t('teams.addMemberError'));
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

    const getAvailableBots = () => {
        const teamBotIds = teamMembers.filter(m => m.botId).map(m => m.botId);
        return bots.filter(b => !teamBotIds.includes(b.id));
    };

    const handleAddBot = async () => {
        if (!selectedBotToAdd || !selectedTeam) return;
        try {
            await teamAPI.addMember(currentWorkspace.id, selectedTeam.id, { botId: selectedBotToAdd });
            const response = await teamAPI.getMembers(currentWorkspace.id, selectedTeam.id);
            setTeamMembers(response.data.members);
            setSelectedBotToAdd('');
            loadTeams();
        } catch (error) {
            console.error('Error adding bot:', error);
            alert(t('teams.addBotError'));
        }
    };

    const handleRemoveBot = async (botId) => {
        if (!selectedTeam) return;
        try {
            await teamAPI.removeMember(currentWorkspace.id, selectedTeam.id, botId, 'bot');
            const response = await teamAPI.getMembers(currentWorkspace.id, selectedTeam.id);
            setTeamMembers(response.data.members);
            loadTeams();
        } catch (error) {
            console.error('Error removing bot:', error);
        }
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
            alert(t('teams.moveError'));
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
            alert(t('teams.moveError'));
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
                                <span className="drag-handle" title={t('teams.dragDrop')}>
                                    <GripVertical size={14} />
                                </span>
                                {hasChildren && (
                                    <button
                                        className="expand-btn"
                                        onClick={() => toggleExpand(team.id)}
                                        title={isExpanded ? t('teams.collapse') : t('teams.expand')}
                                    >
                                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                    </button>
                                )}
                                {isChild && <GitBranch size={14} color="#9ca3af" />}
                                <h3>{team.name}</h3>
                            </div>
                            <p className="team-description">{team.description || t('teams.noDescription')}</p>
                        </div>
                        <div className="team-actions">
                            <button
                                className="icon-btn"
                                onClick={() => openCreateModal(null, team.id)}
                                title={t('teams.addSubTeam')}
                            >
                                <Plus size={16} />
                            </button>
                            <button className="icon-btn" onClick={() => openCreateModal(team)} title={t('common.edit')}>
                                <Edit2 size={16} />
                            </button>
                            <button className="icon-btn danger" onClick={() => handleDeleteTeam(team.id)} title={t('common.delete')}>
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="team-stats">
                        <Users size={16} />
                        <span>{team.members?.filter(m => m.userId).length || 0} {t('teams.userLabel')}</span>
                        {hasChildren && (
                            <span className="sub-team-count">
                                <GitBranch size={13} />
                                {team.children.length} alt takım
                            </span>
                        )}
                        <span style={{
                            marginLeft: 'auto',
                            fontSize: '0.72rem',
                            padding: '2px 8px',
                            borderRadius: 20,
                            background: team.assignmentRule === 'ROUND_ROBIN' ? '#fef3c7' : team.assignmentRule === 'ONLINE_ONLY' ? '#dcfce7' : '#eff6ff',
                            color: team.assignmentRule === 'ROUND_ROBIN' ? '#92400e' : team.assignmentRule === 'ONLINE_ONLY' ? '#166534' : '#1e40af',
                            fontWeight: 500,
                        }}>
                            {team.assignmentRule === 'ROUND_ROBIN' ? '🔄 Sıralı' : team.assignmentRule === 'ONLINE_ONLY' ? '🟢 Online' : '🏊 Havuz'}
                        </span>
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
                <h2>{t('teams.management')}</h2>
                <button className="create-team-btn" onClick={() => openCreateModal()}>
                    <Plus size={20} />
                    Yeni Takım Oluştur
                </button>
            </div>

            {loading ? (
                <div>Loading...</div>
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
                                    })()}</strong> will be added under
                                </span>
                            </div>
                        )}

                        <form onSubmit={handleCreateTeam}>
                            <div className="form-group">
                                <label>{t('teams.teamNameLabel')}</label>
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
                                <label>{t('teams.descriptionLabel')}</label>
                                <textarea
                                    className="form-input"
                                    value={teamDescription}
                                    onChange={(e) => setTeamDescription(e.target.value)}
                                    placeholder="Takım hakkında kısa bilgi..."
                                    rows={3}
                                />
                            </div>
                            <div className="form-group">
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    Atama Kuralı
                                </label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                                    {[
                                        { value: 'POOL', icon: '🏊', label: 'Havuz', desc: 'Herkes görür, kim üstlenirse o alır' },
                                        { value: 'ROUND_ROBIN', icon: '🔄', label: 'Sıralı Dağıtım', desc: 'Üyelere sırayla otomatik atar' },
                                        { value: 'ONLINE_ONLY', icon: '🟢', label: 'Online Kişilere', desc: 'Yalnızca online üyelere sırayla atar' },
                                    ].map(rule => (
                                        <label
                                            key={rule.value}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'flex-start',
                                                gap: 10,
                                                padding: '10px 12px',
                                                borderRadius: 8,
                                                border: `2px solid ${teamAssignmentRule === rule.value ? '#6366f1' : '#e5e7eb'}`,
                                                background: teamAssignmentRule === rule.value ? '#f0f0ff' : '#fafafa',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s',
                                            }}
                                        >
                                            <input
                                                type="radio"
                                                name="assignmentRule"
                                                value={rule.value}
                                                checked={teamAssignmentRule === rule.value}
                                                onChange={() => setTeamAssignmentRule(rule.value)}
                                                style={{ marginTop: 2 }}
                                            />
                                            <span style={{ fontSize: 18 }}>{rule.icon}</span>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1f2937' }}>{rule.label}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 2 }}>{rule.desc}</div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="teams-modal-actions">
                                <button type="button" className="btn-secondary" onClick={closeCreateModal}>Cancel</button>
                                <button type="submit" className="btn-primary">Save</button>
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
                            <h3>{selectedTeam.name} - Members</h3>
                            <button className="teams-close-modal-btn" onClick={() => setIsMembersModalOpen(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        {/* Kullanıcı Ekle */}
                        <div className="add-member-section">
                            <div className="members-section-label"><Users size={13} /> {t('teams.userLabel')}</div>
                            <div className="member-select-row">
                                <select
                                    className="member-select"
                                    value={selectedMemberToAdd}
                                    onChange={(e) => setSelectedMemberToAdd(e.target.value)}
                                >
                                    <option value="">{t('teams.selectUser')}</option>
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

                        {/* AI Asistan Ekle */}
                        <div className="add-member-section add-bot-section">
                            <div className="members-section-label bot-label"><Bot size={13} /> AI Asistan Add</div>
                            <div className="member-select-row">
                                <select
                                    className="member-select"
                                    value={selectedBotToAdd}
                                    onChange={(e) => setSelectedBotToAdd(e.target.value)}
                                >
                                    <option value="">{t('teams.selectAssistant')}</option>
                                    {getAvailableBots().map(b => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                </select>
                                <button
                                    className="btn-primary bot-add-btn"
                                    onClick={handleAddBot}
                                    disabled={!selectedBotToAdd}
                                >
                                    Ekle
                                </button>
                            </div>
                        </div>

                        <div className="members-list">
                            {/* Kullanıcı üyeleri */}
                            {teamMembers.filter(m => m.userId).map(member => (
                                <div key={member.id} className="member-item">
                                    <div className="member-info">
                                        <div className="member-avatar">
                                            <span style={{ color: '#ffffff' }}>{member.user?.name?.charAt(0).toUpperCase() || '?'}</span>
                                        </div>
                                        <div className="member-details">
                                            <span className="member-name">{member.user?.name}</span>
                                            <span className="member-type-badge">{t('teams.userLabel')}</span>
                                        </div>
                                    </div>
                                    <button className="icon-btn danger" onClick={() => handleRemoveMember(member)} title={t('common.remove') || 'Remove'}>
                                        <X size={16} />
                                    </button>
                                </div>
                            ))}

                            {/* Bot üyeleri */}
                            {teamMembers.filter(m => m.botId).map(member => (
                                <div key={member.id} className="member-item bot-member-item">
                                    <div className="member-info">
                                        <div className="member-avatar bot-avatar">
                                            <Bot size={16} color="#fff" />
                                        </div>
                                        <div className="member-details">
                                            <span className="member-name">{member.bot?.name}</span>
                                            <span className="member-type-badge bot-badge">{t('teams.aiAssistant')}</span>
                                        </div>
                                    </div>
                                    <button className="icon-btn danger" onClick={() => handleRemoveBot(member.botId)} title={t('common.remove') || 'Remove'}>
                                        <X size={16} />
                                    </button>
                                </div>
                            ))}

                            {teamMembers.filter(m => m.userId || m.botId).length === 0 && (
                                <div style={{ textAlign: 'center', color: '#9ca3af', padding: '20px' }}>
                                    Bu takımda henüz üye yok.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                confirmText={confirmModal.confirmText}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                type={confirmModal.type}
            />
        </div>
    );
};

export default Teams;
