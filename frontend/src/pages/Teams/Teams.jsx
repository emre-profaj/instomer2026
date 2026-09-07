import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { teamAPI, workspaceAPI, aiAPI, retellAPI, appointmentConfigAPI } from '../../services/api';
import { Plus, Users, Edit2, Trash2, X, UserPlus, ChevronDown, ChevronRight, GitBranch, GripVertical, Bot, Phone, Clock, Mail, Calendar, Zap } from 'lucide-react';
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

    // Distribution (Havuz Dağıtım) States
    const [distributionMode, setDistributionMode] = useState('POOL');
    const [distributionMethod, setDistributionMethod] = useState('ROUND_ROBIN');
    const [triggerOnPhone, setTriggerOnPhone] = useState(false);
    const [triggerOnEmail, setTriggerOnEmail] = useState(false);
    const [triggerOnAppointment, setTriggerOnAppointment] = useState(false);
    const [triggerTimeoutMinutes, setTriggerTimeoutMinutes] = useState('');

    // Member Management States
    const [workspaceMembers, setWorkspaceMembers] = useState([]);
    const [teamMembers, setTeamMembers] = useState([]);
    const [selectedMemberToAdd, setSelectedMemberToAdd] = useState('');

    // Bot (AI Assistant) states
    const [bots, setBots] = useState([]);
    const [selectedBotToAdd, setSelectedBotToAdd] = useState('');

    // Retell voice assistant states
    const [retellAgents, setRetellAgents] = useState([]);
    const [selectedRetellAgentToAdd, setSelectedRetellAgentToAdd] = useState('');

    // Şube states
    const [branches, setBranches] = useState([]);
    const [teamBranchIds, setTeamBranchIds] = useState([]);

    useEffect(() => {
        if (currentWorkspace) {
            loadTeams();
            loadWorkspaceMembers();
            loadBots();
            loadRetellAgents();
            loadBranches();
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

    const loadRetellAgents = async () => {
        try {
            const response = await retellAPI.getAgents(currentWorkspace.id);
            setRetellAgents(response.data.agents || []);
        } catch (error) {
            console.error('Error loading Retell agents:', error);
            setRetellAgents([]);
        }
    };

    const loadBranches = async () => {
        try {
            const response = await appointmentConfigAPI.getBranches(currentWorkspace.id);
            setBranches(response.data.branches || []);
        } catch (error) {
            console.error('Error loading branches:', error);
        }
    };

    const handleCreateTeam = async (e) => {
        e.preventDefault();
        const distPayload = {
            distributionMode,
            distributionMethod,
            triggerOnPhone,
            triggerOnEmail,
            triggerOnAppointment,
            triggerTimeoutMinutes: triggerTimeoutMinutes ? parseInt(triggerTimeoutMinutes, 10) : null,
        };
        try {
            if (selectedTeam) {
                // Update
                const response = await teamAPI.update(currentWorkspace.id, selectedTeam.id, {
                    name: teamName,
                    description: teamDescription,
                    assignmentRule: teamAssignmentRule,
                    branchIds: teamBranchIds.length > 0 ? teamBranchIds : null,
                    ...distPayload
                });
                if (response.data && response.data.team) {
                    loadTeams();
                }
            } else {
                // Create
                const response = await teamAPI.create(currentWorkspace.id, {
                    name: teamName,
                    description: teamDescription,
                    assignmentRule: teamAssignmentRule,
                    parentId: parentIdForCreate || null,
                    branchIds: teamBranchIds.length > 0 ? teamBranchIds : null,
                    ...distPayload
                });
                if (response.data && response.data.team) {
                    loadTeams();
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

    const resetDistributionState = () => {
        setDistributionMode('POOL');
        setDistributionMethod('ROUND_ROBIN');
        setTriggerOnPhone(false);
        setTriggerOnEmail(false);
        setTriggerOnAppointment(false);
        setTriggerTimeoutMinutes('');
    };

    const openCreateModal = (team = null, parentId = null) => {
        if (team) {
            setSelectedTeam(team);
            setTeamName(team.name);
            setTeamDescription(team.description || '');
            setTeamAssignmentRule(team.assignmentRule || 'POOL');
            setDistributionMode(team.distributionMode || 'POOL');
            setDistributionMethod(team.distributionMethod || 'ROUND_ROBIN');
            setTriggerOnPhone(team.triggerOnPhone || false);
            setTriggerOnEmail(team.triggerOnEmail || false);
            setTriggerOnAppointment(team.triggerOnAppointment || false);
            setTriggerTimeoutMinutes(team.triggerTimeoutMinutes ? String(team.triggerTimeoutMinutes) : '');
            setParentIdForCreate(null);
            let parsedBranchIds = [];
            try { parsedBranchIds = team.branchIds ? JSON.parse(team.branchIds) : []; } catch {}
            setTeamBranchIds(parsedBranchIds);
        } else {
            setSelectedTeam(null);
            setTeamName('');
            setTeamDescription('');
            setTeamAssignmentRule('POOL');
            resetDistributionState();
            setParentIdForCreate(parentId);
            setTeamBranchId('');
        }
        setIsCreateModalOpen(true);
    };

    const closeCreateModal = () => {
        setIsCreateModalOpen(false);
        setSelectedTeam(null);
        setTeamName('');
        setTeamDescription('');
        setTeamAssignmentRule('POOL');
        resetDistributionState();
        setParentIdForCreate(null);
        setTeamBranchId('');
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

    const getAvailableRetellAgents = () => {
        const teamRetellAgentIds = teamMembers.filter(m => m.retellAgentId).map(m => m.retellAgentId);
        return retellAgents.filter(a => !teamRetellAgentIds.includes(a.agent_id));
    };

    const handleAddRetellAgent = async () => {
        if (!selectedRetellAgentToAdd || !selectedTeam) return;
        try {
            await teamAPI.addMember(currentWorkspace.id, selectedTeam.id, { retellAgentId: selectedRetellAgentToAdd });
            const response = await teamAPI.getMembers(currentWorkspace.id, selectedTeam.id);
            setTeamMembers(response.data.members);
            setSelectedRetellAgentToAdd('');
            loadTeams();
        } catch (error) {
            console.error('Error adding Retell agent:', error);
            alert('Arama asistanı eklenemedi.');
        }
    };

    const handleRemoveRetellAgent = async (agentId) => {
        if (!selectedTeam) return;
        try {
            await teamAPI.removeMember(currentWorkspace.id, selectedTeam.id, agentId, 'retellAgent');
            const response = await teamAPI.getMembers(currentWorkspace.id, selectedTeam.id);
            setTeamMembers(response.data.members);
            loadTeams();
        } catch (error) {
            console.error('Error removing Retell agent:', error);
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
                            {(() => {
                                let ids = [];
                                try { ids = team.branchIds ? JSON.parse(team.branchIds) : []; } catch {}
                                return ids.length > 0 && branches.length > 1 ? (
                                    <span style={{ fontSize: '0.7rem', background: '#eef2ff', color: '#4f46e5', padding: '2px 8px', borderRadius: '10px', marginTop: '4px', display: 'inline-block' }}>
                                        🏢 {ids.map(id => branches.find(b => b.id === id)?.name).filter(Boolean).join(', ')}
                                    </span>
                                ) : null;
                            })()}
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

                    <div className="team-stats" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Users size={15} />
                            <span>{team.members?.filter(m => m.userId).length || 0} {t('teams.userLabel')}</span>
                        </div>
                        {team.members?.filter(m => m.botId).length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#ef4444' }}>
                                <Bot size={15} />
                                <span>{team.members.filter(m => m.botId).length} {t('teams.aiAssistant')}</span>
                            </div>
                        )}
                        {team.members?.filter(m => m.retellAgentId).length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#0d9488' }}>
                                <Phone size={15} />
                                <span>{team.members.filter(m => m.retellAgentId).length} Arama Asistanı</span>
                            </div>
                        )}
                        {hasChildren && (
                            <span className="sub-team-count">
                                <GitBranch size={13} />
                                {team.children.length} alt takım
                            </span>
                        )}
                    </div>

                    {/* Distribution Mode — Inline pills */}
                    <div className="dist-section">
                        <span className="dist-label">Havuzdakilere ne yapılsın?</span>
                        <div className="dist-pills">
                            {[
                                { value: 'POOL', icon: '📂', label: 'Beklet' },
                                { value: 'DISTRIBUTE', icon: '🔄', label: 'Dağıt' },
                                { value: 'CONDITIONAL', icon: '⚡', label: 'Koşullu' },
                            ].map(m => (
                                <button
                                    key={m.value}
                                    className={`dist-pill ${(team.distributionMode || 'POOL') === m.value ? 'active' : ''}`}
                                    onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                            await teamAPI.update(currentWorkspace.id, team.id, { distributionMode: m.value });
                                            const updateNested = (list) => list.map(t => {
                                                if (t.id === team.id) return { ...t, distributionMode: m.value };
                                                if (t.children) return { ...t, children: updateNested(t.children) };
                                                return t;
                                            });
                                            setTeams(prev => updateNested(prev));
                                        } catch (err) { console.error(err); }
                                    }}
                                >
                                    <span>{m.icon}</span> {m.label}
                                </button>
                            ))}
                        </div>
                        {/* Show method badge if DISTRIBUTE or CONDITIONAL */}
                        {(team.distributionMode === 'DISTRIBUTE' || team.distributionMode === 'CONDITIONAL') && (
                            <div className="dist-method-badge">
                                {team.distributionMethod === 'ROUND_ROBIN' && '🔁 Sırayla'}
                                {team.distributionMethod === 'LEAST_BUSY' && '📊 En az yoğun'}
                                {team.distributionMethod === 'ONLINE_ONLY' && '🟢 Online'}
                                {!team.distributionMethod && '🔁 Sırayla'}
                            </div>
                        )}
                        {/* Show trigger badges if CONDITIONAL */}
                        {team.distributionMode === 'CONDITIONAL' && (
                            <div className="dist-triggers-inline">
                                {team.triggerOnPhone && <span className="trigger-badge phone">📱 Numara</span>}
                                {team.triggerOnEmail && <span className="trigger-badge email">📧 E-posta</span>}
                                {team.triggerOnAppointment && <span className="trigger-badge appt">📅 Randevu</span>}
                                {team.triggerTimeoutMinutes > 0 && <span className="trigger-badge timeout">⏰ {team.triggerTimeoutMinutes} dk</span>}
                                {!team.triggerOnPhone && !team.triggerOnEmail && !team.triggerOnAppointment && !team.triggerTimeoutMinutes && (
                                    <span className="trigger-badge none">Tetikleyici ayarlanmamış</span>
                                )}
                            </div>
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
                <h2>{t('teams.management')} <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#e0e7ff', color: '#4f46e5', fontSize: '0.75rem', fontWeight: 600, borderRadius: '10px', padding: '2px 10px', marginLeft: '8px', minWidth: '24px' }}>{teams.length}</span></h2>
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
                            {/* Şube Seçimi */}
                            {branches.length > 1 && (
                                <div className="form-group">
                                    <label>🏢 Şubeler</label>
                                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', padding: '8px 0' }}>
                                        {branches.filter(b => b.isActive).map(b => (
                                            <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: 13 }}>
                                                <input
                                                    type="checkbox"
                                                    checked={teamBranchIds.includes(b.id)}
                                                    onChange={e => {
                                                        setTeamBranchIds(e.target.checked
                                                            ? [...teamBranchIds, b.id]
                                                            : teamBranchIds.filter(x => x !== b.id)
                                                        );
                                                    }}
                                                />
                                                {b.name}
                                            </label>
                                        ))}
                                    </div>
                                    <span style={{ fontSize: 11, color: '#94a3b8' }}>Seçilmezse tüm şubelerde aktif</span>
                                </div>
                            )}
                            {/* Havuz Dağıtım Kuralları */}
                            <div className="form-group">
                                <label className="dist-modal-label">
                                    <Zap size={14} /> Havuzdakilere ne yapılsın?
                                </label>

                                {/* 3 Mode Pill Selector */}
                                <div className="dist-mode-selector">
                                    {[
                                        { value: 'POOL', icon: '📂', label: 'Havuzda Beklet', desc: 'Ekip üyeleri manuel olarak üzerine alır' },
                                        { value: 'DISTRIBUTE', icon: '🔄', label: 'Hemen Dağıt', desc: 'Her gelen yazışma anında dağıtılır' },
                                        { value: 'CONDITIONAL', icon: '⚡', label: 'Koşullu Dağıt', desc: 'Koşul oluşana kadar bekle, sonra dağıt' },
                                    ].map(mode => (
                                        <label
                                            key={mode.value}
                                            className={`dist-mode-card ${distributionMode === mode.value ? 'active' : ''}`}
                                        >
                                            <input
                                                type="radio"
                                                name="distributionMode"
                                                value={mode.value}
                                                checked={distributionMode === mode.value}
                                                onChange={() => setDistributionMode(mode.value)}
                                            />
                                            <div className="dist-mode-card-inner">
                                                <span className="dist-mode-icon">{mode.icon}</span>
                                                <div className="dist-mode-text">
                                                    <div className="dist-mode-title">{mode.label}</div>
                                                    <div className="dist-mode-desc">{mode.desc}</div>
                                                </div>
                                            </div>
                                        </label>
                                    ))}
                                </div>

                                {/* Distribution Method (shown for DISTRIBUTE & CONDITIONAL) */}
                                {(distributionMode === 'DISTRIBUTE' || distributionMode === 'CONDITIONAL') && (
                                    <div className="dist-method-section">
                                        <label className="dist-sub-label">Dağıtım Yöntemi</label>
                                        <div className="dist-method-options">
                                            {[
                                                { value: 'ROUND_ROBIN', icon: '🔁', label: 'Sırayla (Round Robin)', desc: 'Üyeler arasında sırayla ve eşit dağıtır' },
                                                { value: 'LEAST_BUSY', icon: '📊', label: 'En Az Yoğuna', desc: 'Açık yazışması en az olana atar' },
                                                { value: 'ONLINE_ONLY', icon: '🟢', label: 'Online Olanlara', desc: 'Sadece aktif üyelere, yoksa havuzda bekler' },
                                            ].map(method => (
                                                <label
                                                    key={method.value}
                                                    className={`dist-method-card ${distributionMethod === method.value ? 'active' : ''}`}
                                                >
                                                    <input
                                                        type="radio"
                                                        name="distributionMethod"
                                                        value={method.value}
                                                        checked={distributionMethod === method.value}
                                                        onChange={() => setDistributionMethod(method.value)}
                                                    />
                                                    <span className="dist-method-icon">{method.icon}</span>
                                                    <div>
                                                        <div className="dist-method-title">{method.label}</div>
                                                        <div className="dist-method-desc">{method.desc}</div>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Conditional Triggers (only for CONDITIONAL) */}
                                {distributionMode === 'CONDITIONAL' && (
                                    <div className="dist-triggers-section">
                                        <label className="dist-sub-label">Dağıtımı Tetikleyen Koşullar</label>
                                        <p className="dist-triggers-hint">Aşağıdakilerden biri oluştuğunda havuzdan dağıtılır:</p>

                                        <div className="dist-trigger-options">
                                            <label className={`dist-trigger-card ${triggerOnPhone ? 'active' : ''}`}>
                                                <input type="checkbox" checked={triggerOnPhone} onChange={(e) => setTriggerOnPhone(e.target.checked)} />
                                                <Phone size={16} className="trigger-icon phone" />
                                                <div>
                                                    <div className="trigger-title">Numara verildiğinde</div>
                                                    <div className="trigger-desc">Kişi telefon numarası paylaştığında</div>
                                                </div>
                                            </label>

                                            <label className={`dist-trigger-card ${triggerOnEmail ? 'active' : ''}`}>
                                                <input type="checkbox" checked={triggerOnEmail} onChange={(e) => setTriggerOnEmail(e.target.checked)} />
                                                <Mail size={16} className="trigger-icon email" />
                                                <div>
                                                    <div className="trigger-title">E-posta verildiğinde</div>
                                                    <div className="trigger-desc">Kişi e-posta adresi paylaştığında</div>
                                                </div>
                                            </label>

                                            <label className={`dist-trigger-card ${triggerOnAppointment ? 'active' : ''}`}>
                                                <input type="checkbox" checked={triggerOnAppointment} onChange={(e) => setTriggerOnAppointment(e.target.checked)} />
                                                <Calendar size={16} className="trigger-icon appt" />
                                                <div>
                                                    <div className="trigger-title">Görüşme planlandığında</div>
                                                    <div className="trigger-desc">Randevu veya arama planlandığında</div>
                                                </div>
                                            </label>

                                            <label className={`dist-trigger-card timeout ${triggerTimeoutMinutes ? 'active' : ''}`}>
                                                <Clock size={16} className="trigger-icon timeout" />
                                                <div style={{ flex: 1 }}>
                                                    <div className="trigger-title">Süre dolduğunda</div>
                                                    <div className="trigger-desc">Havuzda belli süre bekledikten sonra</div>
                                                </div>
                                                <div className="timeout-input-wrap">
                                                    <input
                                                        type="number"
                                                        className="timeout-input"
                                                        value={triggerTimeoutMinutes}
                                                        onChange={(e) => setTriggerTimeoutMinutes(e.target.value)}
                                                        placeholder="—"
                                                        min="1"
                                                        max="1440"
                                                    />
                                                    <span className="timeout-unit">dk</span>
                                                </div>
                                            </label>
                                        </div>
                                    </div>
                                )}
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

                        {/* Arama Asistanı Ekle */}
                        <div className="add-member-section add-retell-section" style={{ marginTop: '4px', paddingTop: '12px', borderTop: '1px solid #f3f4f6' }}>
                            <div className="members-section-label retell-label" style={{ color: '#0d9488' }}><Phone size={13} /> Arama Asistanı Ekle</div>
                            <div className="member-select-row">
                                <select
                                    className="member-select"
                                    value={selectedRetellAgentToAdd}
                                    onChange={(e) => setSelectedRetellAgentToAdd(e.target.value)}
                                >
                                    <option value="">Arama Asistanı Seçin</option>
                                    {getAvailableRetellAgents().map(a => (
                                        <option key={a.agent_id} value={a.agent_id}>{a.agent_name || a.agent_id}</option>
                                    ))}
                                </select>
                                <button
                                    className="btn-primary retell-add-btn"
                                    onClick={handleAddRetellAgent}
                                    disabled={!selectedRetellAgentToAdd}
                                    style={{ backgroundColor: '#0d9488' }}
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

                            {/* Retell Agent üyeleri */}
                            {teamMembers.filter(m => m.retellAgentId).map(member => {
                                const agent = retellAgents.find(a => a.agent_id === member.retellAgentId);
                                const agentName = agent ? agent.agent_name : member.retellAgentId;
                                return (
                                    <div key={member.id} className="member-item retell-member-item">
                                        <div className="member-info">
                                            <div className="member-avatar retell-avatar">
                                                <Phone size={16} color="#fff" />
                                            </div>
                                            <div className="member-details">
                                                <span className="member-name">{agentName}</span>
                                                <span className="member-type-badge retell-badge">Arama Asistanı</span>
                                            </div>
                                        </div>
                                        <button className="icon-btn danger" onClick={() => handleRemoveRetellAgent(member.retellAgentId)} title={t('common.remove') || 'Remove'}>
                                            <X size={16} />
                                        </button>
                                    </div>
                                );
                            })}

                            {teamMembers.filter(m => m.userId || m.botId || m.retellAgentId).length === 0 && (
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
