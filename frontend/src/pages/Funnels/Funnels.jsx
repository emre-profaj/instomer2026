import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { funnelAPI, teamAPI, workspaceAPI, aiAPI } from '../../services/api';
import { Plus, Trash2, Edit2, Check, X, Loader, Kanban, ChevronDown, ChevronRight, Circle } from 'lucide-react';
import EntryRulesModal from '../../components/Funnels/EntryRulesModal';
import './Funnels.css';

// Colors cycle automatically — no user selection needed
const AUTO_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#f97316','#06b6d4','#ec4899','#14b8a6','#64748b','#8b5cf6'];

// Pretty stage color palette
const STAGE_COLORS = [
    '#3b82f6','#06b6d4','#10b981','#14b8a6','#f59e0b',
    '#f97316','#ec4899','#a855f7','#8b5cf6','#ef4444','#64748b','#94a3b8'
];

const Funnels = () => {
    const { t } = useTranslation();
    const { currentWorkspace } = useAuth();
    const [funnels, setFunnels] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [newName, setNewName] = useState('');
    const [editingFunnel, setEditingFunnel] = useState(null);
    const [newClassificationCriteria, setNewClassificationCriteria] = useState('');

    const [newTeamId, setNewTeamId] = useState('');
    const [newUserId, setNewUserId] = useState('');

    // Teams and Members loaded for dropdowns
    const [teams, setTeams] = useState([]);
    const [members, setMembers] = useState([]);
    const [bots, setBots] = useState([]);

    // Stage state
    const [expandedFunnel, setExpandedFunnel] = useState(null);
    const [newStageName, setNewStageName] = useState('');
    const [newStageColor, setNewStageColor] = useState(STAGE_COLORS[0]);
    const [newStageTeamId, setNewStageTeamId] = useState('');
    const [newStageUserId, setNewStageUserId] = useState('');
    const [stageSaving, setStageSaving] = useState(false);
    const [editingStage, setEditingStage] = useState(null); // { id, teamId, userId }
    const [entryRulesModal, setEntryRulesModal] = useState({ isOpen: false, stage: null });
    const [defaultFunnelId, setDefaultFunnelId] = useState(null);

    useEffect(() => {
        if (currentWorkspace) {
            loadFunnels();
            loadTeamsAndMembers();
        }
    }, [currentWorkspace]);

    const loadTeamsAndMembers = async () => {
        try {
            const [teamsRes, membersRes, botsRes] = await Promise.all([
                teamAPI.getWorkspaceTeams(currentWorkspace.id).catch(() => ({ data: { teams: [] } })),
                workspaceAPI.getMembers(currentWorkspace.id).catch(() => ({ data: { members: [] } })),
                aiAPI.getBots(currentWorkspace.id).catch(() => ({ data: { bots: [] } }))
            ]);
            setTeams(teamsRes.data?.teams || []);
            setMembers(membersRes.data?.members?.map(m => m.user) || membersRes.data || []);
            setBots(botsRes.data?.bots || []);
        } catch (err) { console.error(err); }
    };

    const loadFunnels = async () => {
        try {
            setLoading(true);
            const res = await funnelAPI.getAll(currentWorkspace.id);
            setFunnels(res.data.funnels || []);
            if (res.data.defaultFunnelId !== undefined) {
                setDefaultFunnelId(res.data.defaultFunnelId);
            }
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    const handleSetDefaultFunnel = async (funnelId) => {
        try {
            await funnelAPI.setDefaultFunnel(currentWorkspace.id, funnelId || null);
            setDefaultFunnelId(funnelId || null);
        } catch (err) { console.error('Default funnel error:', err); }
    };

    // Auto-assign next color in cycle
    const nextColor = () => AUTO_COLORS[funnels.length % AUTO_COLORS.length];

    const handleCreate = async () => {
        if (!newName.trim()) return;
        setSaving(true);
        try {
            const res = await funnelAPI.create(currentWorkspace.id, { 
                name: newName.trim(), 
                color: nextColor(),
                assignedTeamId: newTeamId || null,
                assignedUserId: newUserId || null,
                classificationCriteria: newClassificationCriteria.trim() || null
            });
            setFunnels(prev => [...prev, res.data.funnel]);
            setNewName('');
            setNewTeamId('');
            setNewUserId('');
            setNewClassificationCriteria('');
        } catch (err) { console.error(err); }
        finally { setSaving(false); }
    };

    const handleUpdate = async () => {
        if (!editingFunnel?.name?.trim()) return;
        setSaving(true);
        try {
            const res = await funnelAPI.update(currentWorkspace.id, editingFunnel.id, { 
                name: editingFunnel.name, 
                color: editingFunnel.color,
                assignedTeamId: editingFunnel.assignedTeamId || null,
                assignedUserId: editingFunnel.assignedUserId || null,
                qualifiedLeadStageId: editingFunnel.qualifiedLeadStageId || null,
                classificationCriteria: editingFunnel.classificationCriteria || null
            });
            setFunnels(prev => prev.map(f => f.id === editingFunnel.id ? res.data.funnel : f));
            setEditingFunnel(null);
        } catch (err) { console.error(err); }
        finally { setSaving(false); }
    };

    const handleDelete = async (id) => {
        if (!confirm('Bu akış silinecek. Emin misiniz?')) return;
        try {
            await funnelAPI.delete(currentWorkspace.id, id);
            setFunnels(prev => prev.filter(f => f.id !== id));
            if (expandedFunnel === id) setExpandedFunnel(null);
        } catch (err) { console.error(err); }
    };

    const toggleExpand = (funnelId) => {
        setExpandedFunnel(prev => prev === funnelId ? null : funnelId);
        setNewStageName('');
        setNewStageColor(STAGE_COLORS[0]);
        setNewStageTeamId('');
        setNewStageUserId('');
    };

    // ── Stage handlers ──
    const handleAddStage = async (funnelId) => {
        if (!newStageName.trim()) return;
        setStageSaving(true);
        try {
            const res = await funnelAPI.createStage(currentWorkspace.id, funnelId, {
                name: newStageName.trim(),
                color: newStageColor,
                assignedTeamId: newStageTeamId || null,
                assignedUserId: newStageUserId || null
            });
            setFunnels(prev => prev.map(f => {
                if (f.id !== funnelId) return f;
                return { ...f, stages: [...(f.stages || []), res.data.stage] };
            }));
            setNewStageName('');
            setNewStageColor(STAGE_COLORS[0]);
            setNewStageTeamId('');
            setNewStageUserId('');
        } catch (err) { console.error(err); }
        finally { setStageSaving(false); }
    };

    const handleDeleteStage = async (funnelId, stageId) => {
        if (!confirm('Bu durum silinecek. Emin misiniz?')) return;
        try {
            await funnelAPI.deleteStage(currentWorkspace.id, funnelId, stageId);
            setFunnels(prev => prev.map(f => {
                if (f.id !== funnelId) return f;
                return { ...f, stages: f.stages.filter(s => s.id !== stageId) };
            }));
        } catch (err) { console.error(err); }
    };

    const handleUpdateStage = async (funnelId, stageId) => {
        if (!editingStage) return;
        try {
            const res = await funnelAPI.updateStage(
                currentWorkspace.id, funnelId, stageId,
                {
                    assignedTeamId: editingStage.teamId || null,
                    assignedUserId: editingStage.userId || null,
                    assignedBotId:  editingStage.botId  || null,
                    ...(editingStage.isClosing !== undefined && { isClosing: editingStage.isClosing })
                }
            );
            setFunnels(prev => prev.map(f => {
                if (f.id !== funnelId) return f;
                return { ...f, stages: f.stages.map(s => s.id === stageId ? res.data.stage : s) };
            }));
            setEditingStage(null);
        } catch (err) { console.error('Stage update error:', err); }
    };

    const handleSaveEntryRules = async (stageId, rulesJson) => {
        const funnelId = expandedFunnel;
        if (!funnelId) return;
        try {
            const res = await funnelAPI.updateStage(currentWorkspace.id, funnelId, stageId, { entryRules: rulesJson });
            setFunnels(prev => prev.map(f => {
                if (f.id !== funnelId) return f;
                return { ...f, stages: f.stages.map(s => s.id === stageId ? res.data.stage : s) };
            }));
        } catch (err) { console.error('Entry rules save error:', err); }
    };

    return (
        <div className="funnels-page">
            <div className="funnels-header">
                <div className="funnels-header-icon"><Kanban size={22} /></div>
                <div>
                    <h1>{t('funnels.management')}</h1>
                    <p>{t('funnels.description')}</p>
                </div>
            </div>

            {/* Varsayılan Akış Seçici */}
            <div className="funnels-create-card" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>⭐ Varsayılan Giriş Akışı:</span>
                <select
                    className="funnels-input"
                    style={{ flex: 1, maxWidth: 320, minWidth: 180 }}
                    value={defaultFunnelId || ''}
                    onChange={e => handleSetDefaultFunnel(e.target.value)}
                >
                    <option value="">— Seçilmedi —</option>
                    {funnels.filter(f => f.funnelType !== 'MAIN').map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                </select>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Yeni konuşmalar bu akışa otomatik atanır</span>
            </div>

            {/* Create form */}
            <div className="funnels-create-card">
                <h2>Yeni Akış Ekle</h2>
                <div className="funnels-create-form">
                    <div className="funnels-create-row">
                        <input
                            className="funnels-input"
                            type="text"
                            placeholder={t('funnels.createPlaceholder')}
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCreate()}
                        />
                        <button
                            className="funnels-btn-primary"
                            onClick={handleCreate}
                            disabled={saving || !newName.trim()}
                        >
                            {saving ? <Loader size={15} className="spin" /> : <Plus size={15} />}
                            Oluştur
                        </button>
                    </div>
                    <div className="funnels-create-row">
                        <select
                            className="funnels-input"
                            value={newTeamId}
                            onChange={e => setNewTeamId(e.target.value)}
                        >
                            <option value="">Takım Ata (İsteğe Bağlı)</option>
                            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>

                        <select
                            className="funnels-input"
                            value={newUserId}
                            onChange={e => setNewUserId(e.target.value)}
                        >
                            <option value="">Kişi Ata (İsteğe Bağlı)</option>
                            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                    </div>
                    <textarea
                        className="funnels-input funnels-criteria-textarea"
                        placeholder="🤖 AI Giriş Kriterleri — Bu akışa hangi konuşmalar atanmalı? Örn: 'Estetik cerrahi, check-up, doğum paketi, poliklinik soruları bu akışa girer'"
                        value={newClassificationCriteria}
                        onChange={e => setNewClassificationCriteria(e.target.value)}
                        rows={2}
                    />
                </div>
            </div>

            {/* List */}
            <div className="funnels-list-card">
                {loading ? (
                    <div className="funnels-empty">Yükleniyor...</div>
                ) : funnels.length === 0 ? (
                    <div className="funnels-empty">
                        <Kanban size={40} />
                        <p>{t('funnels.empty')}</p>
                    </div>
                ) : (
                    (() => {
                        // Build tree: main funnel first, then children
                        const mainFunnel = funnels.find(f => f.funnelType === 'MAIN');
                        const subFunnels = mainFunnel 
                            ? funnels.filter(f => f.id !== mainFunnel.id)
                            : funnels;
                        const orderedList = mainFunnel ? [mainFunnel, ...subFunnels] : subFunnels;

                        return orderedList.map(funnel => {
                        const isExpanded = expandedFunnel === funnel.id;
                        const stages = funnel.stages || [];
                        const isMain = funnel.funnelType === 'MAIN';
                        const isSub = funnel.parentId && funnel.parentId === mainFunnel?.id;
                        return (
                            <div key={funnel.id} className={`funnels-funnel-block${isExpanded ? ' funnels-funnel-block--open' : ''}${isMain ? ' funnels-funnel-block--main' : ''}`}
                                 style={isSub ? { marginLeft: 24, borderLeft: '2px solid #e0e7ff' } : undefined}>
                                {/* Funnel header row */}
                                <div className="funnels-row">
                                    <button
                                        className="funnels-expand-btn"
                                        onClick={() => !editingFunnel && toggleExpand(funnel.id)}
                                        title={isExpanded ? t('common.close') : t('funnels.manageStatuses')}
                                    >
                                        {isExpanded
                                            ? <ChevronDown size={15} />
                                            : <ChevronRight size={15} />}
                                    </button>

                                    <div className="funnels-dot" style={{ background: editingFunnel?.id === funnel.id ? editingFunnel.color : funnel.color }} />

                                    {editingFunnel?.id === funnel.id ? (
                                        <>
                                            <input
                                                autoFocus
                                                className="funnels-input funnels-input-edit"
                                                value={editingFunnel.name}
                                                onChange={e => setEditingFunnel(p => ({ ...p, name: e.target.value }))}
                                                onKeyDown={e => e.key === 'Enter' && handleUpdate()}
                                            />
                                            <select
                                                className="funnels-input funnels-input-edit"
                                                value={editingFunnel.assignedTeamId}
                                                onChange={e => setEditingFunnel(p => ({ ...p, assignedTeamId: e.target.value }))}
                                            >
                                                <option value="">Takım Ata</option>
                                                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                            </select>
                                            <select
                                                className="funnels-input funnels-input-edit"
                                                value={editingFunnel.assignedUserId}
                                                onChange={e => setEditingFunnel(p => ({ ...p, assignedUserId: e.target.value }))}
                                            >
                                                <option value="">Kişi Ata</option>
                                                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                            </select>
                                            {editingFunnel.stages?.length > 0 && (
                                                <select
                                                    className="funnels-input funnels-input-edit"
                                                    value={editingFunnel.qualifiedLeadStageId || ''}
                                                    onChange={e => setEditingFunnel(p => ({ ...p, qualifiedLeadStageId: e.target.value }))}
                                                >
                                                    <option value="">🎯 Nitelikli Talepler → (İlk aşamaya düşer)</option>
                                                    {editingFunnel.stages.map(s => <option key={s.id} value={s.id}>🎯 Nitelikli Talepler → {s.name}</option>)}
                                                </select>
                                            )}
                                            <div style={{ width: '100%', marginTop: '8px' }}>
                                                <textarea
                                                    className="funnels-input"
                                                    placeholder="🤖 AI Giriş Kriterleri — Bu akışa hangi konuşmalar girmeli?"
                                                    value={editingFunnel.classificationCriteria || ''}
                                                    onChange={e => setEditingFunnel(p => ({ ...p, classificationCriteria: e.target.value }))}
                                                    rows={2}
                                                    style={{ width: '100%', resize: 'vertical', fontSize: '12px' }}
                                                />
                                            </div>
                                            <button className="funnels-btn-sm funnels-btn-save" onClick={handleUpdate} disabled={saving}>
                                                <Check size={13} /> Kaydet
                                            </button>
                                            <button className="funnels-btn-sm funnels-btn-cancel" onClick={() => setEditingFunnel(null)}>
                                                <X size={13} /> İptal
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <span className="funnels-name">
                                                {funnel.name}
                                                {isMain && (
                                                    <span style={{ 
                                                        fontSize: '10px', fontWeight: 700, color: '#6366f1', 
                                                        background: '#eef2ff', padding: '2px 8px', borderRadius: '10px',
                                                        marginLeft: '8px', letterSpacing: '0.5px'
                                                    }}>
                                                        ANA AKIŞ
                                                    </span>
                                                )}
                                                {isSub && (
                                                    <span style={{
                                                        fontSize: '10px', color: '#94a3b8', marginLeft: '6px'
                                                    }}>
                                                        ↳ alt akış
                                                    </span>
                                                )}
                                                {(funnel.assignedTeamId || funnel.assignedUserId) && (
                                                    <span className="funnels-assigned-info" style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '6px' }}>
                                                        ({funnel.assignedTeamId ? teams.find(t => t.id === funnel.assignedTeamId)?.name : ''}
                                                        {funnel.assignedTeamId && funnel.assignedUserId ? ' - ' : ''}
                                                        {funnel.assignedUserId ? members.find(m => m.id === funnel.assignedUserId)?.name : ''})
                                                    </span>
                                                )}
                                            </span>
                                            <span className="funnels-stage-count">{stages.length} durum</span>
                                            <button className="funnels-icon-btn" onClick={() => {
                                                setEditingFunnel({ 
                                                    id: funnel.id, 
                                                    name: funnel.name, 
                                                    color: funnel.color,
                                                    assignedTeamId: funnel.assignedTeamId || '',
                                                    assignedUserId: funnel.assignedUserId || '',
                                                    classificationCriteria: funnel.classificationCriteria || ''
                                                });
                                                setExpandedFunnel(funnel.id);
                                            }} title={t('common.edit')}>
                                                <Edit2 size={15} />
                                            </button>
                                            {!isMain && (
                                                <button className="funnels-icon-btn funnels-icon-btn-danger" onClick={() => handleDelete(funnel.id)} title={t('common.delete')}>
                                                    <Trash2 size={15} />
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>

                                {/* Stages panel */}
                                {isExpanded && (
                                    <div className="funnels-stages-panel">
                                        <div className="funnels-stages-label">Durumlar</div>

                                        {stages.length === 0 ? (
                                            <div className="funnels-stages-empty">{t('funnels.noStatuses')}</div>
                                        ) : (
                                            <div className="funnels-stages-list">
                                                {stages.map(stage => {
                                                    const isEditingThis = editingStage?.id === stage.id;
                                                    return (
                                                        <div key={stage.id} className="funnels-stage-row">
                                                            <span className="funnels-stage-dot" style={{ background: stage.color }} />
                                                            <span className="funnels-stage-name" style={{ flex: 1 }}>
                                                                {stage.name}
                                                            </span>

                                                            {/* Takım seç */}
                                                            <select
                                                                className="funnels-input funnels-stage-input"
                                                                style={{ 
                                                                    width: '130px', fontSize: '12px', padding: '4px 6px',
                                                                    ...(!(isEditingThis ? editingStage.teamId : stage.assignedTeamId) && funnel.assignedTeamId ? { color: '#9ca3af', fontStyle: 'italic' } : {})
                                                                }}
                                                                value={isEditingThis ? editingStage.teamId : (stage.assignedTeamId || '')}
                                                                onChange={e => {
                                                                    const val = e.target.value;
                                                                    setEditingStage({ id: stage.id, teamId: val, userId: isEditingThis ? editingStage.userId : (stage.assignedUserId || ''), botId: isEditingThis ? editingStage.botId : (stage.assignedBotId || '') });
                                                                }}
                                                            >
                                                                <option value="">
                                                                    {funnel.assignedTeamId 
                                                                        ? `↑ ${teams.find(t => t.id === funnel.assignedTeamId)?.name || 'Üst Akış'}` 
                                                                        : 'Takım Ata'}
                                                                </option>
                                                                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                                            </select>

                                                            {/* Kişi seç */}
                                                            <select
                                                                className="funnels-input funnels-stage-input"
                                                                style={{ width: '130px', fontSize: '12px', padding: '4px 6px' }}
                                                                value={isEditingThis ? editingStage.userId : (stage.assignedUserId || '')}
                                                                onChange={e => {
                                                                    const val = e.target.value;
                                                                    setEditingStage({ id: stage.id, teamId: isEditingThis ? editingStage.teamId : (stage.assignedTeamId || ''), userId: val, botId: isEditingThis ? editingStage.botId : (stage.assignedBotId || '') });
                                                                }}
                                                            >
                                                                <option value="">
                                                                    {funnel.assignedUserId 
                                                                        ? `↑ ${members.find(m => m.id === funnel.assignedUserId)?.name || 'Üst Akış'}` 
                                                                        : 'Kişi Ata'}
                                                                </option>
                                                                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                                            </select>

                                                            {/* Bot seç */}
                                                            <select
                                                                className="funnels-input funnels-stage-input"
                                                                style={{ width: '130px', fontSize: '12px', padding: '4px 6px' }}
                                                                value={isEditingThis ? editingStage.botId : (stage.assignedBotId || '')}
                                                                onChange={e => {
                                                                    const val = e.target.value;
                                                                    setEditingStage({ id: stage.id, teamId: isEditingThis ? editingStage.teamId : (stage.assignedTeamId || ''), userId: isEditingThis ? editingStage.userId : (stage.assignedUserId || ''), botId: val });
                                                                }}
                                                            >
                                                                <option value="">🤖 Robot Ata</option>
                                                                {bots.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                                            </select>

                                                            {/* Durum Tipi — Açık / Kazanıldı / Kaybedildi / Kapandı */}
                                                            <select
                                                                className="funnels-input funnels-stage-input"
                                                                style={{
                                                                    width: '120px', fontSize: '11px', padding: '3px 6px',
                                                                    borderRadius: '12px', cursor: 'pointer',
                                                                    background: stage.statusType === 'WON' ? '#dcfce7'
                                                                        : stage.statusType === 'LOST' ? '#fee2e2'
                                                                        : stage.statusType === 'CLOSED' ? '#f1f5f9'
                                                                        : '#f3f4f6',
                                                                    color: stage.statusType === 'WON' ? '#166534'
                                                                        : stage.statusType === 'LOST' ? '#991b1b'
                                                                        : stage.statusType === 'CLOSED' ? '#475569'
                                                                        : '#9ca3af',
                                                                    border: `1px solid ${
                                                                        stage.statusType === 'WON' ? '#86efac'
                                                                        : stage.statusType === 'LOST' ? '#fca5a5'
                                                                        : stage.statusType === 'CLOSED' ? '#cbd5e1'
                                                                        : '#e5e7eb'
                                                                    }`,
                                                                    fontWeight: stage.statusType ? 600 : 400
                                                                }}
                                                                value={stage.statusType || ''}
                                                                onChange={async (e) => {
                                                                    try {
                                                                        const newStatusType = e.target.value || null;
                                                                        const newIsClosing = !!newStatusType;
                                                                        const res = await funnelAPI.updateStage(
                                                                            currentWorkspace.id, funnel.id, stage.id,
                                                                            { statusType: newStatusType, isClosing: newIsClosing }
                                                                        );
                                                                        setFunnels(prev => prev.map(f => {
                                                                            if (f.id !== funnel.id) return f;
                                                                            return { ...f, stages: f.stages.map(s => s.id === stage.id ? res.data.stage : s) };
                                                                        }));
                                                                    } catch (err) { console.error('statusType error:', err); }
                                                                }}
                                                                title="Aşama sonucu: Case durumunu otomatik günceller"
                                                            >
                                                                <option value="">⚪ Açık</option>
                                                                <option value="WON">🟢 Kazanıldı</option>
                                                                <option value="LOST">🔴 Kaybedildi</option>
                                                                <option value="CLOSED">⚫ Kapandı</option>
                                                            </select>

                                                            {/* Giriş Kuralları */}
                                                            <button
                                                                className="funnels-btn-sm"
                                                                style={{
                                                                    fontSize: '11px', padding: '3px 8px',
                                                                    background: (() => { try { const p = stage.entryRules ? JSON.parse(stage.entryRules) : null; return p?.rules?.length ? '#eff6ff' : '#f3f4f6'; } catch { return '#f3f4f6'; } })(),
                                                                    color: (() => { try { const p = stage.entryRules ? JSON.parse(stage.entryRules) : null; return p?.rules?.length ? '#3b82f6' : '#9ca3af'; } catch { return '#9ca3af'; } })(),
                                                                    border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap'
                                                                }}
                                                                onClick={() => setEntryRulesModal({ isOpen: true, stage })}
                                                                title="Giriş Kuralları"
                                                            >
                                                                {(() => { try { const p = stage.entryRules ? JSON.parse(stage.entryRules) : null; const c = p?.rules?.length || 0; return c > 0 ? `⚙️ ${c} Kural` : '⚙️ Kural Ekle'; } catch { return '⚙️ Kural Ekle'; } })()}
                                                            </button>

                                                            {/* Kaydet (sadece değişiklik yapıldıysa) */}
                                                            {isEditingThis && (
                                                                <button
                                                                    className="funnels-btn-sm funnels-btn-save"
                                                                    onClick={() => handleUpdateStage(funnel.id, stage.id)}
                                                                    title="Kaydet"
                                                                >
                                                                    <Check size={13} /> Kaydet
                                                                </button>
                                                            )}

                                                            <button
                                                                className="funnels-icon-btn funnels-icon-btn-danger funnels-stage-del"
                                                                onClick={() => handleDeleteStage(funnel.id, stage.id)}
                                                                title={t('common.delete')}
                                                            >
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Add stage row */}
                                        <div className="funnels-stage-add-row">
                                            <div className="funnels-stage-color-picker">
                                                {STAGE_COLORS.map(c => (
                                                    <button
                                                        key={c}
                                                        className={`funnels-stage-color-dot${newStageColor === c ? ' active' : ''}`}
                                                        style={{ background: c }}
                                                        onClick={() => setNewStageColor(c)}
                                                    />
                                                ))}
                                            </div>
                                            <div className="funnels-stage-add-inputs">
                                                <input
                                                    className="funnels-input funnels-stage-input"
                                                    placeholder="Yeni durum adı…"
                                                    value={newStageName}
                                                    onChange={e => setNewStageName(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleAddStage(funnel.id)}
                                                />
                                                <select
                                                    className="funnels-input funnels-stage-input"
                                                    value={newStageTeamId}
                                                    onChange={e => setNewStageTeamId(e.target.value)}
                                                >
                                                <option value="">
                                                    {funnel.assignedTeamId 
                                                        ? `↑ ${teams.find(t => t.id === funnel.assignedTeamId)?.name || 'Üst Akış'}` 
                                                        : 'Takım Ata'}
                                                </option>
                                                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                                </select>
                                                <select
                                                    className="funnels-input funnels-stage-input"
                                                    value={newStageUserId}
                                                    onChange={e => setNewStageUserId(e.target.value)}
                                                >
                                                    <option value="">Kişi Ata</option>
                                                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                                </select>
                                                <button
                                                    className="funnels-btn-primary funnels-btn-sm-add"
                                                    onClick={() => handleAddStage(funnel.id)}
                                                    disabled={stageSaving || !newStageName.trim()}
                                                >
                                                    {stageSaving ? <Loader size={13} className="spin" /> : <Plus size={13} />}
                                                    Ekle
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                    })()
                )}
            </div>

            <EntryRulesModal
                isOpen={entryRulesModal.isOpen}
                onClose={() => setEntryRulesModal({ isOpen: false, stage: null })}
                stage={entryRulesModal.stage}
                onSave={handleSaveEntryRules}
            />
        </div>
    );
};

export default Funnels;
