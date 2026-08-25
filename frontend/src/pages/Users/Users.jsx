import { useTranslation } from 'react-i18next';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { workspaceAPI, teamAPI, aiAPI, retellAPI, automationAPI } from '../../services/api';
import AddMemberModal from '../../components/AddMemberModal';
import BotModal from '../../components/Settings/BotModal';
import RetellSettings from '../../components/Settings/RetellSettings';
import ConfirmModal from '../../components/ConfirmModal/ConfirmModal';
import {
    Users as UsersIcon,
    Plus,
    Trash2,
    Key,
    X,
    Eye,
    EyeOff,
    Edit2,
    GitBranch,
    GripVertical,
    ChevronDown,
    ChevronRight,
    UserCircle2,
    Layers,
    Shield,
    CheckCircle2,
    Bot,
    Phone,
    ToggleRight,
    ToggleLeft,
    Power
} from 'lucide-react';
import './Users.css';

// ─── Working Hours Default ────────────────────────────────
const DEFAULT_WORKING_HOURS = {
    monday: { enabled: true, start: '08:00', end: '18:00' },
    tuesday: { enabled: true, start: '08:00', end: '18:00' },
    wednesday: { enabled: true, start: '08:00', end: '18:00' },
    thursday: { enabled: true, start: '08:00', end: '18:00' },
    friday: { enabled: true, start: '08:00', end: '18:00' },
    saturday: { enabled: false, start: '08:00', end: '18:00' },
    sunday: { enabled: false, start: '08:00', end: '18:00' }
};

const DAY_LABELS = {
    monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
    thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday'
};

// ─── Working Hours Component ────────────────────────────────
const WorkingHoursEditor = ({ workingHours, onChange }) => {
    const { t } = useTranslation();
    const hours = { ...DEFAULT_WORKING_HOURS, ...workingHours };

    const updateDay = (day, field, value) => {
        const updated = { ...hours, [day]: { ...hours[day], [field]: value } };
        onChange(updated);
    };

    return (
        <div className="ut-wh-section">
            <div className="ut-wh-header">
                <span className="ut-wh-title">{t('users.workingHoursTitle')}</span>
            </div>
            <div className="ut-wh-table">
                {Object.entries(DAY_LABELS).map(([key, label]) => (
                    <div key={key} className={`ut-wh-row ${!hours[key]?.enabled ? 'disabled' : ''}`}>
                        <label className="ut-wh-toggle">
                            <input
                                type="checkbox"
                                checked={hours[key]?.enabled ?? false}
                                onChange={(e) => updateDay(key, 'enabled', e.target.checked)}
                            />
                            <span className="ut-wh-slider" />
                        </label>
                        <span className="ut-wh-day">{label}</span>
                        <div className="ut-wh-times">
                            <input
                                type="time"
                                value={hours[key]?.start || '08:00'}
                                onChange={(e) => updateDay(key, 'start', e.target.value)}
                                disabled={!hours[key]?.enabled}
                            />
                            <span className="ut-wh-sep">—</span>
                            <input
                                type="time"
                                value={hours[key]?.end || '18:00'}
                                onChange={(e) => updateDay(key, 'end', e.target.value)}
                                disabled={!hours[key]?.enabled}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ─── Edit Member Modal ────────────────────────────────
const EditMemberModal = ({ member, onSubmit, onPasswordChange, onClose }) => {
    const [name, setName] = useState(member.user?.name || '');
    const [email, setEmail] = useState(member.user?.email || '');
    const [workingHours, setWorkingHours] = useState(member.user?.workingHours || DEFAULT_WORKING_HOURS);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');
        if (!name.trim()) { setError('Ad Soyad boş olamaz'); return; }
        if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) { setError('Geçerli bir e-posta girin'); return; }
        if (password) {
            if (password.length < 6) { setError('Şifre en az 6 karakter olmalıdır'); return; }
            if (password !== confirmPassword) { setError('Şifreler eşleşmiyor'); return; }
        }
        setLoading(true);
        try {
            await onSubmit({ name: name.trim(), email: email.trim(), workingHours });
            if (password) {
                await onPasswordChange(password);
                setPassword('');
                setConfirmPassword('');
            }
            setSuccessMsg(password ? '✅ Bilgiler ve şifre kaydedildi' : '✅ Bilgiler kaydedildi');
            setTimeout(() => setSuccessMsg(''), 2000);
        }
        catch (err) { setError(err.response?.data?.error || err.message || 'Güncelleme başarısız'); }
        finally { setLoading(false); }
    };

    return (
        <div className="ut-modal-overlay" onClick={onClose}>
            <div className="ut-modal ut-modal-wide" onClick={e => e.stopPropagation()}>
                <div className="ut-modal-header">
                    <h3><Edit2 size={16} /> {member.user?.name || 'Kullanıcı'}</h3>
                    <button className="ut-modal-close" onClick={onClose}><X size={18} /></button>
                </div>
                <form onSubmit={handleSubmit} className="ut-modal-body">
                    {error && <div className="ut-alert-danger">{error}</div>}
                    {successMsg && <div className="ut-alert-success">{successMsg}</div>}

                    <div className="ut-form-row">
                        <div className="ut-form-group ut-form-half">
                            <label>Ad Soyad</label>
                            <input type="text" value={name} onChange={e => setName(e.target.value)}
                                placeholder="Ad Soyad" autoFocus required />
                        </div>
                        <div className="ut-form-group ut-form-half">
                            <label>E-posta</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                                placeholder="ornek@mail.com" required />
                        </div>
                    </div>

                    <div className="ut-form-row">
                        <div className="ut-form-group ut-form-half">
                            <label>Şifre Sıfırla <span className="ut-optional">(opsiyonel)</span></label>
                            <div className="ut-password-wrap">
                                <input type={showPassword ? 'text' : 'password'} value={password}
                                    onChange={e => setPassword(e.target.value)} placeholder="Değiştirmek için girin" />
                                <button type="button" className="ut-pw-toggle" onClick={() => setShowPassword(!showPassword)}>
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                        {password && (
                            <div className="ut-form-group ut-form-half ut-fade-in">
                                <label>Şifre Tekrar</label>
                                <input type={showPassword ? 'text' : 'password'} value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)} placeholder="Şifreyi tekrar girin" />
                            </div>
                        )}
                    </div>

                    <WorkingHoursEditor workingHours={workingHours} onChange={setWorkingHours} />

                    <div className="ut-modal-footer">
                        <button type="button" className="ut-btn-secondary" onClick={onClose}>Kapat</button>
                        <button type="submit" className="ut-btn-primary" disabled={loading}>
                            {loading ? 'Kaydediliyor...' : 'Kaydet'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};



// ─── Create / Edit Team Modal ─────────────────────────────────
const TeamModal = ({ team, parentName, onSubmit, onClose }) => {
    const [name, setName] = useState(team?.name || '');
    const [description, setDescription] = useState(team?.description || '');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try { await onSubmit({ name, description }); onClose(); }
        catch { }
        finally { setLoading(false); }
    };

    return (
        <div className="ut-modal-overlay" onClick={onClose}>
            <div className="ut-modal" onClick={e => e.stopPropagation()}>
                <div className="ut-modal-header">
                    <h3>{team ? 'Takımı Düzenle' : parentName ? `Alt Takım Oluştur` : 'Yeni Takım Oluştur'}</h3>
                    <button className="ut-modal-close" onClick={onClose}><X size={18} /></button>
                </div>
                {parentName && (
                    <div className="ut-parent-badge"><GitBranch size={13} /> <strong>{parentName}</strong> altına eklenecek</div>
                )}
                <form onSubmit={handleSubmit} className="ut-modal-body">
                    <div className="ut-form-group">
                        <label>Team Name</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)}
                            placeholder="Örn: Destek Ekibi" required autoFocus />
                    </div>
                    <div className="ut-form-group">
                        <label>Description</label>
                        <textarea value={description} onChange={e => setDescription(e.target.value)}
                            placeholder="Takım hakkında kısa bilgi..." rows={3} />
                    </div>
                    <div className="ut-modal-footer">
                        <button type="button" className="ut-btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="ut-btn-primary" disabled={loading}>
                            {loading ? 'Kaydediliyor...' : 'Kaydet'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ─── Helpers ──────────────────────────────────────────────────
const getInitials = (name = '') => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

const ROLE_COLORS = {
    SUPER_ADMIN: { bg: '#818cf8', color: '#fff', label: 'Super Admin' },
    OWNER: { bg: '#fef3c7', color: '#92400e', label: 'Owner' },
    MANAGER: { bg: '#dcfce7', color: '#166534', label: 'Yönetici' },
    AGENT: { bg: '#f1f5f9', color: '#475569', label: 'Agent' },
    VIEWER: { bg: '#fce7f3', color: '#9d174d', label: 'İzleyici' }
};

// ─── Member Chip with hover popup ────────────────────────────
const MemberChip = ({ member, roleInfo, isOnline, onRemove, email }) => {
    const { t } = useTranslation();
    const [popupPos, setPopupPos] = useState(null);
    const chipRef = useRef(null);

    const showPopup = () => {
        if (!chipRef.current) return;
        const rect = chipRef.current.getBoundingClientRect();
        setPopupPos({
            left: rect.left + rect.width / 2,
            bottom: window.innerHeight - rect.top + 8
        });
    };

    const hidePopup = () => setPopupPos(null);

    return (
        <div
            ref={chipRef}
            className="ut-team-member-chip"
            onMouseEnter={showPopup}
            onMouseLeave={hidePopup}
        >
            {popupPos && (
                <div
                    className="ut-member-popup"
                    style={{
                        position: 'fixed',
                        left: popupPos.left,
                        bottom: popupPos.bottom,
                        transform: 'translateX(-50%)'
                    }}
                >
                    <div className="ut-popup-avatar">
                        {member.user?.avatar
                            ? <img src={member.user.avatar} alt={member.user?.name} />
                            : getInitials(member.user?.name)}
                    </div>
                    <div className="ut-popup-name">{member.user?.name || 'Bilinmiyor'}</div>
                    {email && <div className="ut-popup-email">{email}</div>}
                    <div className="ut-popup-meta">
                        <span className="ut-popup-role" style={{ background: roleInfo.bg, color: roleInfo.color }}>
                            {roleInfo.label}
                        </span>
                        <span className="ut-popup-status">
                            <span className={`ut-popup-dot ${isOnline ? 'online' : 'offline'}`} />
                            {isOnline ? 'Online' : 'Offline'}
                        </span>
                    </div>
                </div>
            )}
            <span className="ut-chip-avatar">{getInitials(member.user?.name)}</span>
            <span className="ut-chip-name">{member.user?.name || 'Bilinmiyor'}</span>
            <button className="ut-chip-remove" title={t('common.remove') || 'Remove'} onClick={onRemove}>
                <X size={10} />
            </button>
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────
const UsersTeams = () => {
    const { t } = useTranslation();
    const { currentWorkspace, user, onlineUsers } = useAuth();

    // Members
    const [members, setMembers] = useState([]);
    const [membersLoading, setMembersLoading] = useState(false);
    const [showAddMemberModal, setShowAddMemberModal] = useState(false);
    const [passwordModal, setPasswordModal] = useState({ show: false, userId: null, memberName: '' });
    const [editModal, setEditModal] = useState({ show: false, member: null });

    // Teams
    const [teams, setTeams] = useState([]);
    const [teamsLoading, setTeamsLoading] = useState(false);
    const [teamModal, setTeamModal] = useState({ show: false, team: null, parentId: null, parentName: null });

    // Bots (AI Assistants)
    const [bots, setBots] = useState([]);
    const [retellAgents, setRetellAgents] = useState([]);
    const [botModal, setBotModal] = useState({ isOpen: false, bot: null });
    const [showRetellModal, setShowRetellModal] = useState(false);
    const [createBotModal, setCreateBotModal] = useState(false);
    const [newBotName, setNewBotName] = useState('');
    const [automationsList, setAutomationsList] = useState([]);
    const [expandedTeams, setExpandedTeams] = useState({});

    // Retell auto-call settings
    const [retellAutoCallEnabled, setRetellAutoCallEnabled] = useState(false);
    const [retellAutoCallTriggers, setRetellAutoCallTriggers] = useState({});

    // Drag & drop — user onto team
    const dragUser = useRef(null);
    const dragBot = useRef(null);
    const dragRetellAgent = useRef(null);
    const [dragOverTeamId, setDragOverTeamId] = useState(null);
    const [dropSuccess, setDropSuccess] = useState(null);

    // Team drag & drop (reorder / re-parent)
    const dragTeamRef = useRef(null);
    const [dragOverTeamParent, setDragOverTeamParent] = useState(null);

    // Shared confirm modal
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null, title: '', message: '' });

    const loadUsersAndTeams = () => {
        loadMembers(); loadTeams(); loadBots(); loadRetellAgents(); loadAutomations(); loadRetellSettings();
    };

    const loadRetellSettings = async () => {
        try {
            const res = await retellAPI.getSettings(currentWorkspace.id);
            setRetellAutoCallEnabled(res.data.retellAutoCallEnabled || false);
            setRetellAutoCallTriggers(res.data.retellAutoCallTriggers || {});
        } catch { }
    };

    const handleMasterToggle = async () => {
        const newVal = !retellAutoCallEnabled;
        setRetellAutoCallEnabled(newVal);
        try {
            await retellAPI.saveSettings(currentWorkspace.id, { retellAutoCallEnabled: newVal });
        } catch {
            setRetellAutoCallEnabled(!newVal); // rollback
        }
    };

    const handleAgentActiveToggle = async (e, agentId) => {
        e.stopPropagation(); // kartın onClick'ini engelle
        const triggers = { ...retellAutoCallTriggers };
        const configs = { ...(triggers.agentConfigs || {}) };
        const cfg = { ...(configs[agentId] || {}) };
        const newActive = cfg.active === false ? true : false; // undefined/true → false, false → true
        cfg.active = newActive;
        configs[agentId] = cfg;
        triggers.agentConfigs = configs;
        setRetellAutoCallTriggers(triggers);
        try {
            await retellAPI.saveSettings(currentWorkspace.id, { retellAutoCallTriggers: triggers });
        } catch {
            // rollback
            cfg.active = !newActive;
            configs[agentId] = cfg;
            setRetellAutoCallTriggers({ ...triggers, agentConfigs: configs });
        }
    };

    const loadAutomations = async () => {
        try {
            const res = await automationAPI.getAutomations(currentWorkspace.id);
            setAutomationsList(res.data.automations || []);
        } catch { }
    };

    useEffect(() => {
        if (currentWorkspace) { loadUsersAndTeams(); }
    }, [currentWorkspace]);

    // ── Loaders ──────────────────────────────────────────────
    const loadMembers = async () => {
        setMembersLoading(true);
        try {
            const res = await workspaceAPI.getMembers(currentWorkspace.id);
            setMembers(res.data.members || []);
        } catch { } finally { setMembersLoading(false); }
    };

    const loadTeams = async () => {
        setTeamsLoading(true);
        try {
            const res = await teamAPI.getWorkspaceTeams(currentWorkspace.id);
            setTeams(res.data.teams || []);
        } catch { } finally { setTeamsLoading(false); }
    };

    const loadBots = async () => {
        try {
            const res = await aiAPI.getBots(currentWorkspace.id);
            setBots(res.data.bots || []);
        } catch { }
    };

    const loadRetellAgents = async () => {
        try {
            const res = await retellAPI.getAgents(currentWorkspace.id);
            setRetellAgents(res.data.agents || []);
        } catch { setRetellAgents([]); }
    };

    const handleRemoveBotFromTeam = async (teamId, botId) => {
        try { await teamAPI.removeMember(currentWorkspace.id, teamId, botId, 'bot'); loadTeams(); }
        catch (err) { alert('Bot çıkarılamadı: ' + (err.response?.data?.error || err.message)); }
    };

    const handleRemoveRetellAgentFromTeam = async (teamId, agentId) => {
        try { await teamAPI.removeMember(currentWorkspace.id, teamId, agentId, 'retellAgent'); loadTeams(); }
        catch (err) { alert('Arama asistanı çıkarılamadı: ' + (err.response?.data?.error || err.message)); }
    };

    const handleDeleteBot = async (botId) => {
        setConfirmModal({
            isOpen: true,
            title: 'Asistanı Sil',
            message: 'Bu asistanı silmek istediğinize emin misiniz?',
            confirmText: 'Sil',
            type: 'danger',
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                try {
                    await aiAPI.deleteBot(currentWorkspace.id, botId);
                    setBotModal({ isOpen: false, bot: null });
                    loadBots();
                } catch (error) {
                    alert('Asistan silinemedi.');
                }
            }
        });
    };

    // ── Update member role ────────────────────────────────────────
    const canManage = () => ['SUPER_ADMIN', 'OWNER'].includes(user?.role);

    const handleRemoveMember = (targetUserId) => {
        setConfirmModal({
            isOpen: true, title: 'Üye Çıkar',
            message: 'Bu üyeyi workspace\'ten çıkarmak istediğinize emin misiniz?',
            confirmText: 'Evet, Çıkar', type: 'danger',
            onConfirm: async () => {
                setConfirmModal(p => ({ ...p, isOpen: false }));
                try { await workspaceAPI.removeMember(currentWorkspace.id, targetUserId); loadMembers(); }
                catch (err) { alert(err.response?.data?.error || 'Hata oluştu'); }
            }
        });
    };

    const handleUpdateRole = async (targetUserId, newRole) => {
        try { await workspaceAPI.updateMemberRole(currentWorkspace.id, targetUserId, { role: newRole }); loadMembers(); }
        catch (err) { alert(err.response?.data?.error || 'Hata oluştu'); }
    };

    const handleChangePassword = async (newPassword) => {
        const res = await workspaceAPI.changeMemberPassword(currentWorkspace.id, passwordModal.userId, newPassword);
        alert(res.data.message || 'Şifre başarıyla değiştirildi');
    };

    const handleUpdateMemberInfo = async (data) => {
        await workspaceAPI.updateMemberInfo(currentWorkspace.id, editModal.member.userId, data);
        loadMembers();
    };

    // ── Team actions ──────────────────────────────────────────
    const handleSaveTeam = async ({ name, description }) => {
        const { team, parentId } = teamModal;
        if (team) {
            await teamAPI.update(currentWorkspace.id, team.id, { name, description });
        } else {
            await teamAPI.create(currentWorkspace.id, { name, description, parentId: parentId || null });
            if (parentId) setExpandedTeams(p => ({ ...p, [parentId]: true }));
        }
        loadTeams();
    };

    const handleDeleteTeam = (teamId) => {
        setConfirmModal({
            isOpen: true, title: t('teams.deleteTeam'),
            message: t('teams.deleteConfirm'),
            confirmText: t('common.confirm'), type: 'danger',
            onConfirm: async () => {
                setConfirmModal(p => ({ ...p, isOpen: false }));
                try { await teamAPI.delete(currentWorkspace.id, teamId); loadTeams(); }
                catch { }
            }
        });
    };

    const handleRemoveFromTeam = async (teamId, memberId) => {
        try { await teamAPI.removeMember(currentWorkspace.id, teamId, memberId, 'user'); loadTeams(); }
        catch (err) { alert('Çıkarma başarısız'); }
    };

    // ── Drag & drop: USER → TEAM ──────────────────────────────
    const handleUserDragStart = (e, member) => {
        dragUser.current = member;
        dragBot.current = null;
        dragRetellAgent.current = null;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('type', 'user');
        e.dataTransfer.setData('userId', member.userId);
    };

    // ── Drag & drop: BOT → TEAM ───────────────────────────────
    const handleBotDragStart = (e, bot) => {
        dragBot.current = bot;
        dragUser.current = null;
        dragRetellAgent.current = null;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('type', 'bot');
        e.dataTransfer.setData('botId', bot.id);
    };

    const handleRetellAgentDragStart = (e, agent) => {
        dragRetellAgent.current = agent;
        dragUser.current = null;
        dragBot.current = null;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('type', 'retellAgent');
        e.dataTransfer.setData('retellAgentId', agent.agent_id);
    };

    const handleTeamDragOver = (e, teamId) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('type')) {
            e.dataTransfer.dropEffect = 'move';
            setDragOverTeamId(teamId);
        }
    };

    const handleTeamDragLeave = (e, teamId) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
            setDragOverTeamId(prev => prev === teamId ? null : prev);
        }
    };

    const handleTeamDrop = async (e, team) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverTeamId(null);

        const type = e.dataTransfer.getData('type');

        // Bot drop: type 'bot' olabilir veya dataTransfer okunduktan sonra boş kalabilir (re-entrant call)
        if ((type === 'bot' || dragBot.current) && dragBot.current) {
            const bot = dragBot.current;
            dragBot.current = null;
            const alreadyIn = team.members?.some(m => m.botId === bot.id);
            if (alreadyIn) return;
            try {
                await teamAPI.addMember(currentWorkspace.id, team.id, { botId: bot.id });
                setDropSuccess(team.id);
                setTimeout(() => setDropSuccess(null), 1500);
                loadTeams();
            } catch (err) {
                alert('Bot eklenemedi: ' + (err.response?.data?.error || err.message));
            }
            return;
        }

        // Retell Agent drop
        if ((type === 'retellAgent' || dragRetellAgent.current) && dragRetellAgent.current) {
            const agent = dragRetellAgent.current;
            dragRetellAgent.current = null;
            const alreadyIn = team.members?.some(m => m.retellAgentId === agent.agent_id);
            if (alreadyIn) return;
            try {
                await teamAPI.addMember(currentWorkspace.id, team.id, { retellAgentId: agent.agent_id });
                setDropSuccess(team.id);
                setTimeout(() => setDropSuccess(null), 1500);
                loadTeams();
            } catch (err) {
                alert('Arama asistanı eklenemedi: ' + (err.response?.data?.error || err.message));
            }
            return;
        }

        if (!dragUser.current) return;
        const userId = dragUser.current.userId;
        dragUser.current = null;
        const alreadyIn = team.members?.some(m => m.userId === userId);
        if (alreadyIn) return;
        try {
            await teamAPI.addMember(currentWorkspace.id, team.id, { userId });
            setDropSuccess(team.id);
            setTimeout(() => setDropSuccess(null), 1500);
            loadTeams();
        } catch (err) {
            alert('Üye eklenemedi: ' + (err.response?.data?.error || err.message));
        }
    };

    // ── Drag & drop: TEAM → TEAM (re-parent) ─────────────────
    const handleTeamDragStart = (e, team) => {
        dragTeamRef.current = team;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('type', 'team');
        e.dataTransfer.setData('teamId', team.id);
    };

    const handleTeamOnTeamDrop = async (e, targetTeam) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverTeamParent(null);
        const type = e.dataTransfer.getData('type');
        if (type === 'user' || type === 'bot' || type === 'retellAgent') return handleTeamDrop(e, targetTeam);
        if (type !== 'team' || !dragTeamRef.current) return;
        const moved = dragTeamRef.current;
        dragTeamRef.current = null;
        if (moved.id === targetTeam.id || moved.parentId === targetTeam.id) return;
        try {
            await teamAPI.update(currentWorkspace.id, moved.id, { parentId: targetTeam.id });
            setExpandedTeams(p => ({ ...p, [targetTeam.id]: true }));
            loadTeams();
        } catch { alert('Takım taşınamadı'); }
    };

    // ── Render team card (recursive) ──────────────────────────
    const renderTeam = (team, depth = 0) => {
        const hasChildren = team.children?.length > 0;
        const isExpanded = expandedTeams[team.id];
        const isDragOver = dragOverTeamId === team.id;
        const isSuccess = dropSuccess === team.id;
        // Exclude SUPER_ADMIN from team user display
        const visibleMembers = team.members?.filter(m => m.userId && m.user?.role !== 'SUPER_ADMIN') || [];
        // Bot members
        const botMembers = team.members?.filter(m => m.botId) || [];
        const retellMembers = team.members?.filter(m => m.retellAgentId) || [];
        const memberCount = visibleMembers.length;

        return (
            <div key={team.id} className={`ut-team-block depth-${depth}`}
                onDragOver={e => { handleTeamDragOver(e, team.id); }}
                onDragLeave={e => handleTeamDragLeave(e, team.id)}
                onDrop={e => handleTeamOnTeamDrop(e, team)}
            >
                <div className={`ut-team-card ${isDragOver ? 'drag-over' : ''} ${isSuccess ? 'drop-success' : ''}`}>
                    <div className="ut-team-card-header">
                        <div className="ut-team-card-left">
                            <span
                                className="ut-team-drag-handle"
                                draggable
                                onDragStart={e => handleTeamDragStart(e, team)}
                                title={t('teams.dragDrop')}
                            >
                                <GripVertical size={14} />
                            </span>
                            {depth > 0 && <GitBranch size={13} className="ut-branch-icon" />}
                            <span className="ut-team-name">{team.name}</span>
                            {team.description && <span className="ut-team-desc">{team.description}</span>}
                        </div>
                        <div className="ut-team-card-right">
                            <span className="ut-team-member-count">
                                <UsersIcon size={12} /> {memberCount}
                            </span>
                            {hasChildren && (
                                <button className="ut-icon-btn" onClick={() => setExpandedTeams(p => ({ ...p, [team.id]: !p[team.id] }))}>
                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                            )}
                            <button className="ut-icon-btn" title={t('teams.addSubTeam')}
                                onClick={() => setTeamModal({ show: true, team: null, parentId: team.id, parentName: team.name })}>
                                <Plus size={14} />
                            </button>
                            <button className="ut-icon-btn" title={t('common.edit')}
                                onClick={() => setTeamModal({ show: true, team, parentId: null, parentName: null })}>
                                <Edit2 size={14} />
                            </button>
                            <button className="ut-icon-btn danger" title={t('common.delete')}
                                onClick={() => handleDeleteTeam(team.id)}>
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>

                    {/* AI Bot Assignment */}
                    {botMembers.length > 0 && (
                        <div className="ut-team-bot-chips">
                            <Bot size={11} className="ut-team-bot-icon" />
                            {botMembers.map(m => (
                                <div key={m.id} className="ut-bot-chip">
                                    <Bot size={10} />
                                    <span className="ut-bot-chip-name">{m.bot?.name}</span>
                                    <button className="ut-chip-remove" title={t('common.remove') || 'Remove'}
                                        onClick={() => handleRemoveBotFromTeam(team.id, m.botId)}>
                                        <X size={9} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Retell Agent Assignment */}
                    {retellMembers.length > 0 && (
                        <div className="ut-team-bot-chips" style={{ borderColor: '#ccfbf1' }}>
                            <Phone size={11} className="ut-team-bot-icon" style={{ color: '#0d9488' }} />
                            {retellMembers.map(m => {
                                const agent = retellAgents.find(a => a.agent_id === m.retellAgentId);
                                return (
                                    <div key={m.id} className="ut-bot-chip" style={{ background: '#f0fdfa', borderColor: '#99f6e4' }}>
                                        <Phone size={10} style={{ color: '#0d9488' }} />
                                        <span className="ut-bot-chip-name" style={{ color: '#0d9488' }}>{agent?.agent_name || m.retellAgentId}</span>
                                        <button className="ut-chip-remove" title="Kaldır"
                                            onClick={() => handleRemoveRetellAgentFromTeam(team.id, m.retellAgentId)}>
                                            <X size={9} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Team members */}
                    <div className="ut-team-members">
                        {visibleMembers.map(m => {
                            const roleInfo = ROLE_COLORS[m.user?.role] || ROLE_COLORS.AGENT;
                            const isOnline = onlineUsers?.get(m.userId)?.isOnline || m.user?.isOnline;
                            const wsm = members.find(wm => wm.userId === m.userId);
                            const email = m.user?.email || wsm?.user?.email || '';
                            return (
                                <MemberChip
                                    key={m.id}
                                    member={m}
                                    roleInfo={roleInfo}
                                    isOnline={isOnline}
                                    email={email}
                                    onRemove={() => handleRemoveFromTeam(team.id, m.userId)}
                                />
                            );
                        })}

                        {/* Drop hint */}
                        <div className={`ut-team-drop-hint ${isDragOver ? 'active' : ''} ${isSuccess ? 'success' : ''}`}>
                            {isSuccess ? <><CheckCircle2 size={13} /> Eklendi!</>
                                : isDragOver ? <><UserCircle2 size={13} /> Buraya bırak</>
                                    : <><UserCircle2 size={13} /> Kullanıcı / Asistanı sürükle</>}
                        </div>
                    </div>

                    {/* Assignment Rule */}
                    <div style={{
                        display: 'flex', flexDirection: 'column', gap: '6px',
                        padding: '8px 10px', marginTop: '6px',
                        background: '#f8fafc', borderRadius: '8px',
                        border: '1px solid #e2e8f0'
                    }}>
                        <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>
                            Havuzdakilere ne yapılsın?
                        </span>
                        <select
                            value={team.assignmentRule || 'POOL'}
                            onChange={async (e) => {
                                const newRule = e.target.value;
                                try {
                                    await teamAPI.update(currentWorkspace.id, team.id, { assignmentRule: newRule });
                                    const updateNested = (list) => list.map(t => {
                                        if (t.id === team.id) return { ...t, assignmentRule: newRule };
                                        if (t.children) return { ...t, children: updateNested(t.children) };
                                        return t;
                                    });
                                    setTeams(prev => updateNested(prev));
                                } catch (err) {
                                    console.error('Assignment rule update error:', err);
                                }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                width: '100%', fontSize: '0.72rem', padding: '5px 8px', borderRadius: '6px',
                                border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer',
                                fontWeight: 500, color: '#334155', outline: 'none'
                            }}
                        >
                            <option value="POOL">🗂️ Havuzda Beklet</option>
                            <option value="ROUND_ROBIN">🔄 Sırayla Dağıt (Round Robin)</option>
                            <option value="LEAST_BUSY">📊 En Az Görüşmesi Olana Dağıt</option>
                            <option value="ONLINE_ONLY">🟢 Sadece Online Olanlara Dağıt</option>
                            <option value="PHONE_ONLY">📞 Telefon Numarası Olanları Dağıt</option>
                        </select>
                    </div>
                </div>

                {/* Children */}
                {hasChildren && isExpanded && (
                    <div className="ut-sub-teams">
                        {team.children.map(child => renderTeam(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    if (!currentWorkspace) return <div className="ut-empty">{t('common.selectWorkspace')}</div>;

    return (
        <div className="ut-page">
            {/* ── Header ── */}
            <div className="ut-header">
                <div className="ut-header-left">
                    <Layers size={20} className="ut-header-icon" />
                    <div>
                        <h1 className="ut-page-title">Takımlar ve Temsilciler</h1>
                        <span className="ut-page-subtitle">Kullanıcıları ve AI asistanları takımlara sürükleyip bırakarak atayın</span>
                    </div>
                </div>
                <div className="ut-header-actions">
                    <button className="ut-btn-outline" onClick={() => setShowAddMemberModal(true)}>
                        <Plus size={15} /> Kullanıcı Ekle
                    </button>
                    <button className="ut-btn-outline" onClick={() => setCreateBotModal(true)}>
                        <Bot size={15} /> AI Asistan Ekle
                    </button>
                    <button className="ut-btn-outline" onClick={() => setShowRetellModal(true)}>
                        <Phone size={15} /> Sesli Asistan Ekle
                    </button>
                    <button className="ut-btn-primary" onClick={() => setTeamModal({ show: true, team: null, parentId: null, parentName: null })}>
                        <Plus size={15} /> Takım Oluştur
                    </button>
                </div>
            </div>

            {/* ── Two panels ── */}
            <div className="ut-body">
                {/* LEFT: Users */}
                <div className="ut-panel ut-users-panel">
                    <div className="ut-panel-header">
                        <UsersIcon size={16} />
                        <span>Temsilciler</span>
                        <span className="ut-panel-count">{members.length + bots.length}</span>
                    </div>
                    <div className="ut-panel-body">
                        {membersLoading ? (
                            <div className="ut-loading"><div className="ut-spinner" /><p>Loading...</p></div>
                        ) : (
                            <>
                                {/* ── Kullanıcılar ── */}
                                {members.length > 0 && (
                                    <div className="ut-panel-section-label"><UserCircle2 size={12} /> Users</div>
                                )}
                                {members.map(member => {
                                    const roleInfo = ROLE_COLORS[member.role] || ROLE_COLORS.AGENT;
                                    const isOnline = onlineUsers?.get(member.userId)?.isOnline || member.user?.isOnline;
                                    return (
                                        <div
                                            key={member.id}
                                            className="ut-user-card"
                                            draggable
                                            onDragStart={e => handleUserDragStart(e, member)}
                                            title="Takıma eklemek için sürükle"
                                        >
                                            <div className="ut-user-drag-handle"><GripVertical size={14} /></div>
                                            <div className="ut-user-avatar-wrap">
                                                <div className="ut-user-avatar">
                                                    {member.user?.avatar
                                                        ? <img src={member.user.avatar} alt={member.user.name} />
                                                        : <span>{getInitials(member.user?.name)}</span>}
                                                </div>
                                                <span className={`ut-online-dot ${isOnline ? 'online' : 'offline'}`} />
                                            </div>
                                            <div className="ut-user-info">
                                                <span className="ut-user-name">{member.user?.name}</span>
                                                <span className="ut-user-email">{member.user?.email}</span>
                                            </div>
                                            <div className="ut-user-actions">
                                                <span className="ut-role-badge" style={{ background: roleInfo.bg, color: roleInfo.color }}>
                                                    {roleInfo.label}
                                                </span>
                                                {canManage() && member.userId !== user?.id && (
                                                    <div className="ut-user-btns">
                                                        <select className="ut-role-select" value={member.role}
                                                            onChange={e => handleUpdateRole(member.userId, e.target.value)}
                                                            title="Rol Değiştir">
                                                            <option value="OWNER">Owner</option>
                                                            <option value="MANAGER">Yönetici</option>
                                                            <option value="AGENT">Agent</option>
                                                        </select>
                                                        <button className="ut-icon-btn" title="Düzenle"
                                                            onClick={() => setEditModal({ show: true, member })}>
                                                            <Edit2 size={13} />
                                                        </button>
                                                        <button className="ut-icon-btn danger" title="Kaldır"
                                                            onClick={() => handleRemoveMember(member.userId)}>
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* ── AI Asistanlar ── */}
                                {bots.length > 0 && (
                                    <div className="ut-panel-section-label ut-panel-section-bot"><Bot size={12} /> AI Assistants</div>
                                )}
                                {bots.map(bot => (
                                    <div
                                        key={bot.id}
                                        className="ut-user-card ut-bot-card"
                                        draggable
                                        onDragStart={e => handleBotDragStart(e, bot)}
                                        onClick={() => setBotModal({ isOpen: true, bot })}
                                        title="Düzenlemek için tıklayın. Takıma eklemek için sürükleyin."
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <div className="ut-user-drag-handle"><GripVertical size={14} /></div>
                                        <div className="ut-user-avatar-wrap">
                                            <div className="ut-user-avatar ut-bot-avatar">
                                                <Bot size={16} />
                                            </div>
                                        </div>
                                        <div className="ut-user-info">
                                            <span className="ut-user-name">{bot.name}</span>
                                            <span className="ut-user-email">{bot.role || 'AI Asistan'}</span>
                                        </div>
                                        <div className="ut-user-actions">
                                            <span className="ut-role-badge" style={{ background: '#ede9fe', color: '#6d28d9' }}>AI Bot</span>
                                        </div>
                                    </div>
                                ))}

                                {/* ── AI Call Agents ── */}
                                {retellAgents.length > 0 && (
                                    <div className="ut-call-section-header">
                                        <div className="ut-panel-section-label" style={{ color: '#0d9488', borderColor: '#ccfbf1', margin: 0 }}><Phone size={12} /> AI Call Agents</div>
                                    </div>
                                )}
                                {retellAgents.map(agent => {
                                    const agentCfg = retellAutoCallTriggers?.agentConfigs?.[agent.agent_id] || {};
                                    const isAgentActive = agentCfg.active !== false;
                                    return (
                                    <div
                                        key={agent.agent_id}
                                        className={`ut-user-card ut-bot-card ${!isAgentActive ? 'ut-agent-inactive' : ''}`}
                                        draggable
                                        onDragStart={e => handleRetellAgentDragStart(e, agent)}
                                        onClick={() => setShowRetellModal(agent.agent_id)}
                                        title="Düzenlemek için tıklayın. Takıma eklemek için sürükleyin."
                                        style={{ borderLeftColor: '#0d9488', cursor: 'pointer' }}
                                    >
                                        <div className="ut-user-drag-handle"><GripVertical size={14} /></div>
                                        <div className="ut-user-avatar-wrap">
                                            <div className="ut-user-avatar" style={{ background: 'linear-gradient(135deg, #ccfbf1, #99f6e4)', color: '#0f766e' }}>
                                                <Phone size={16} />
                                            </div>
                                        </div>
                                        <div className="ut-user-info">
                                            <span className="ut-user-name">{agent.agent_name || 'İsimsiz Agent'}</span>
                                            <span className="ut-user-email">Ses Arama Asistanı</span>
                                        </div>
                                        <div className="ut-user-actions" style={{ gap: '6px' }}>
                                            <label className="ut-agent-toggle" title={isAgentActive ? 'Ajanı pasife al' : 'Ajanı aktif et'} onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={isAgentActive}
                                                    onChange={e => handleAgentActiveToggle(e, agent.agent_id)}
                                                />
                                                <span className="ut-agent-toggle-slider" />
                                            </label>
                                            <span className="ut-role-badge" style={{ background: '#f0fdfa', color: '#0d9488' }}>Call Agent</span>
                                        </div>
                                    </div>
                                    );
                                })}
                            </>
                        )}
                    </div>
                </div>

                {/* RIGHT: Teams */}
                <div className="ut-panel ut-teams-panel">
                    <div className="ut-panel-header">
                        <Shield size={16} />
                        <span>Takımlar</span>
                        <span className="ut-panel-count">{teams.length}</span>
                    </div>
                <div className="ut-panel-body ut-teams-grid">
                        {teamsLoading ? (
                            <div className="ut-loading"><div className="ut-spinner" /><p>Loading...</p></div>
                        ) : teams.length === 0 ? (
                            <div className="ut-teams-empty">
                                <Shield size={32} />
                                <p>Henüz takım yok</p>
                                <button className="ut-btn-primary"
                                    onClick={() => setTeamModal({ show: true, team: null, parentId: null, parentName: null })}>
                                    <Plus size={14} /> Takım Oluştur
                                </button>
                            </div>
                        ) : (
                            teams.map(team => renderTeam(team, 0))
                        )}
                    </div>
                </div>
            </div>

            {/* ── Modals ── */}
            {showAddMemberModal && (
                <AddMemberModal
                    workspaceId={currentWorkspace.id}
                    onClose={() => setShowAddMemberModal(false)}
                    onSuccess={loadMembers}
                />
            )}

            {editModal.show && (
                <EditMemberModal
                    member={editModal.member}
                    onSubmit={handleUpdateMemberInfo}
                    onPasswordChange={async (newPassword) => {
                        await workspaceAPI.changeMemberPassword(currentWorkspace.id, editModal.member.userId, newPassword);
                    }}
                    onClose={() => setEditModal({ show: false, member: null })}
                />
            )}

            {teamModal.show && (
                <TeamModal
                    team={teamModal.team}
                    parentName={teamModal.parentName}
                    onSubmit={handleSaveTeam}
                    onClose={() => setTeamModal({ show: false, team: null, parentId: null, parentName: null })}
                />
            )}

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                confirmText={confirmModal.confirmText}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal(p => ({ ...p, isOpen: false }))}
                type={confirmModal.type}
            />

            {createBotModal && (
                <div className="ut-modal-overlay" onClick={() => setCreateBotModal(false)}>
                    <div className="ut-modal" onClick={e => e.stopPropagation()}>
                        <div className="ut-modal-header">
                            <h3>Yeni AI Asistan Ekle</h3>
                            <button className="ut-modal-close" onClick={() => setCreateBotModal(false)}><X size={18} /></button>
                        </div>
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            try {
                                const res = await aiAPI.createBot(currentWorkspace.id, {
                                    name: newBotName,
                                    role: 'AI Asistan',
                                    prompt: 'Sen yardımsever bir müşteri temsilcisisin.',
                                    botType: 'CHATS'
                                });
                                setCreateBotModal(false);
                                setNewBotName('');
                                loadUsersAndTeams();
                                setBotModal({ isOpen: true, bot: res.data.bot });
                            } catch (err) {
                                alert("Bot oluşturulamadı: " + (err.response?.data?.error || err.message));
                            }
                        }} className="ut-modal-body">
                            <div className="ut-form-group">
                                <label>Asistan Adı</label>
                                <input type="text" value={newBotName} onChange={e => setNewBotName(e.target.value)} required autoFocus placeholder="Örn: Profiy Destek Botu" />
                            </div>
                            <div className="ut-modal-footer">
                                <button type="button" className="ut-btn-secondary" onClick={() => setCreateBotModal(false)}>İptal</button>
                                <button type="submit" className="ut-btn-primary">Oluştur</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {botModal.isOpen && botModal.bot && (
                <BotModal 
                    isOpen={botModal.isOpen} 
                    bot={botModal.bot} 
                    workspaceId={currentWorkspace?.id} 
                    automationsList={automationsList}
                    onRefresh={loadUsersAndTeams} 
                    onDelete={handleDeleteBot}
                    onClose={() => setBotModal({ isOpen: false, bot: null })} 
                />
            )}

            {showRetellModal && (
                <div className="ut-modal-overlay" onClick={() => setShowRetellModal(false)}>
                    <div className="ut-modal ut-modal-wide" style={{ width: '900px', maxHeight: '90vh', overflowY: 'auto', padding: 0 }} onClick={e => e.stopPropagation()}>
                        <div className="ut-modal-header" style={{ position: 'absolute', top: 0, right: 0, zIndex: 10, background: 'transparent', borderBottom: 'none' }}>
                            <button className="ut-modal-close" onClick={() => setShowRetellModal(false)}><X size={20} color="#6b7280" /></button>
                        </div>
                        <div className="ut-modal-body" style={{ padding: '24px', paddingTop: '40px' }}>
                            <RetellSettings hideApiSetup={true} initialAgentId={typeof showRetellModal === 'string' ? showRetellModal : null} onSave={() => loadUsersAndTeams()} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UsersTeams;
