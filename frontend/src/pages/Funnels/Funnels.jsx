import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { funnelAPI, teamAPI, workspaceAPI, aiAPI, channelRoutingAPI, automationAPI } from '../../services/api';
import { getTopicCategories } from '../../services/topicCategory.api';
import { Plus, Trash2, X, Loader, Kanban, ChevronDown, Settings } from 'lucide-react';
import { useToast } from '../../components/Toast/Toast';
import EntryRulesModal from '../../components/Funnels/EntryRulesModal';
import FunnelPipeline from '../../components/Funnels/FunnelPipeline';
import './Funnels.css';

// Colors cycle automatically — no user selection needed
const AUTO_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#f97316','#06b6d4','#ec4899','#14b8a6','#64748b','#8b5cf6'];

// Pretty stage color palette
const STAGE_COLORS = [
    '#3b82f6','#06b6d4','#10b981','#14b8a6','#f59e0b',
    '#f97316','#ec4899','#a855f7','#8b5cf6','#ef4444','#64748b','#94a3b8'
];

const FUNNEL_ICONS = ['📁','🎯','💼','🏥','📋','🔥','⭐','💎','🚀','🛒','📞','💬','🎓','🏠','✈️','🔧'];

const Funnels = () => {
    const { t } = useTranslation();
    const { currentWorkspace } = useAuth();
    const { showError } = useToast();
    const [funnels, setFunnels] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const [stageSaving, setStageSaving] = useState(false);

    // Teams and Members loaded for dropdowns
    const [teams, setTeams] = useState([]);
    const [members, setMembers] = useState([]);
    const [bots, setBots] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [automations, setAutomations] = useState([]);
    const [topicCategories, setTopicCategories] = useState([]);

    // Stage counts
    const [stageCounts, setStageCounts] = useState({});

    // Settings panels
    const [stagePanel, setStagePanel] = useState(null);   // { stage, funnelId }
    const [funnelPanel, setFunnelPanel] = useState(null);  // funnel object being edited
    const [allChannelRoutings, setAllChannelRoutings] = useState([]);

    // Add new funnel form
    const [showAddForm, setShowAddForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [newParentId, setNewParentId] = useState('');
    const [newTeamId, setNewTeamId] = useState('');
    const [newUserId, setNewUserId] = useState('');
    const [newClassificationCriteria, setNewClassificationCriteria] = useState('');

    // Add new stage (inline in pipeline)
    const [addStageFunnelId, setAddStageFunnelId] = useState(null);
    const [newStageName, setNewStageName] = useState('');
    const [newStageColor, setNewStageColor] = useState(STAGE_COLORS[0]);

    // Selected stage (for highlighting)
    const [selectedStage, setSelectedStage] = useState(null);

    // Entry rules modal
    const [entryRulesModal, setEntryRulesModal] = useState({ isOpen: false, stage: null });

    useEffect(() => {
        if (currentWorkspace) {
            loadFunnels();
            loadTeamsAndMembers();
            loadStageCounts();
        }
    }, [currentWorkspace]);

    const loadTeamsAndMembers = async () => {
        try {
            const [teamsRes, membersRes, botsRes, tplRes, autoRes] = await Promise.all([
                teamAPI.getWorkspaceTeams(currentWorkspace.id).catch(() => ({ data: { teams: [] } })),
                workspaceAPI.getMembers(currentWorkspace.id).catch(() => ({ data: { members: [] } })),
                aiAPI.getBots(currentWorkspace.id).catch(() => ({ data: { bots: [] } })),
                automationAPI.getTemplates(currentWorkspace.id).catch(() => ({ data: { templates: [] } })),
                automationAPI.getAutomations(currentWorkspace.id).catch(() => ({ data: { automations: [] } }))
            ]);
            setTeams(teamsRes.data?.teams || []);
            setMembers(membersRes.data?.members?.map(m => m.user) || membersRes.data || []);
            setBots(botsRes.data?.bots || []);
            setTemplates(tplRes.data?.templates || tplRes.data || []);
            setAutomations(autoRes.data?.automations || autoRes.data || []);
            // Topic Categories yükle
            try {
                const catRes = await getTopicCategories(currentWorkspace.id);
                setTopicCategories(catRes.data || []);
            } catch { /* Kategori yoksa sorun değil */ }
        } catch (err) { console.error(err); }
    };

    const loadFunnels = async () => {
        try {
            setLoading(true);
            const res = await funnelAPI.getAll(currentWorkspace.id);
            setFunnels(res.data.funnels || []);
            
            try {
                const routingsRes = await channelRoutingAPI.getAll(currentWorkspace.id);
                setAllChannelRoutings(routingsRes.data?.routings || []);
            } catch (e) { console.log('Channel routings load error:', e); }
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    const loadStageCounts = async () => {
        try {
            const res = await funnelAPI.getStageCounts(currentWorkspace.id);
            setStageCounts(res.data?.counts || {});
        } catch (err) { console.error('Stage counts not available:', err); }
    };

    // Auto-assign next color in cycle
    const nextColor = () => AUTO_COLORS[funnels.length % AUTO_COLORS.length];

    // ── Funnel CRUD ──
    const handleCreate = async () => {
        if (!newName.trim()) return;
        setSaving(true);
        try {
            const res = await funnelAPI.create(currentWorkspace.id, {
                name: newName.trim(),
                color: nextColor(),
                assignedTeamId: newTeamId || null,
                assignedUserId: newUserId || null,
                classificationCriteria: newClassificationCriteria.trim() || null,
                parentId: newParentId || null
            });
            setFunnels(prev => [...prev, res.data.funnel]);
            setNewName('');
            setNewTeamId('');
            setNewUserId('');
            setNewParentId('');
            setNewClassificationCriteria('');
            setShowAddForm(false);
        } catch (err) { console.error(err); }
        finally { setSaving(false); }
    };

    const handleUpdateFunnel = async () => {
        if (!funnelPanel?.name?.trim()) return;
        setSaving(true);
        try {
            const res = await funnelAPI.update(currentWorkspace.id, funnelPanel.id, {
                name: funnelPanel.name,
                color: funnelPanel.color,
                icon: funnelPanel.icon || null,
                assignedTeamId: funnelPanel.assignedTeamId || null,
                assignedUserId: funnelPanel.assignedUserId || null,
                assignedBotId: funnelPanel.assignedBotId || null,
                qualifiedLeadStageId: funnelPanel.qualifiedLeadStageId || null,
                classificationCriteria: funnelPanel.classificationCriteria || null,
                categoryIds: funnelPanel.categoryIds || [],
                parentId: funnelPanel.parentId || null
            });
            setFunnels(prev => prev.map(f => f.id === funnelPanel.id ? res.data.funnel : f));

            // Save channel routings
            if (funnelPanel._routings) {
                for (const routing of funnelPanel._routings) {
                    try {
                        await channelRoutingAPI.upsert(currentWorkspace.id, {
                            channel: routing.channel,
                            pageId: routing.pageId || null,
                            funnelId: funnelPanel.id,
                            teamId: funnelPanel.assignedTeamId || teams[0]?.id,
                            accountName: routing.accountName || null
                        });
                    } catch (err) {
                        console.error('Routing save error:', err);
                    }
                }
            }

            setFunnelPanel(null);
        } catch (err) { console.error(err); }
        finally { setSaving(false); }
    };

    const handleDeleteFunnel = async (id) => {
        if (!confirm('Bu akış silinecek. Emin misiniz?')) return;
        try {
            await funnelAPI.delete(currentWorkspace.id, id);
            setFunnels(prev => prev.filter(f => f.id !== id));
            setFunnelPanel(null);
        } catch (err) {
            console.error(err);
            showError(err.response?.data?.error || 'Akış silinemedi');
        }
    };

    // ── Stage CRUD ──
    const handleAddStage = async (funnelId) => {
        if (!newStageName.trim()) return;
        setStageSaving(true);
        try {
            const res = await funnelAPI.createStage(currentWorkspace.id, funnelId, {
                name: newStageName.trim(),
                color: newStageColor
            });
            setFunnels(prev => prev.map(f => {
                if (f.id !== funnelId) return f;
                return { ...f, stages: [...(f.stages || []), res.data.stage] };
            }));
            setNewStageName('');
            setNewStageColor(STAGE_COLORS[0]);
            setAddStageFunnelId(null);
        } catch (err) { console.error(err); }
        finally { setStageSaving(false); }
    };

    const handleUpdateStage = async () => {
        if (!stagePanel) return;
        setSaving(true);
        try {
            const data = {
                name: stagePanel.name,
                color: stagePanel.color,
                assignedTeamId: stagePanel.assignedTeamId || null,
                assignedUserId: stagePanel.assignedUserId || null,
                assignedBotId: stagePanel.assignedBotId || null,
                statusType: stagePanel.statusType || null,
                isClosing: !!stagePanel.statusType,
                entryActions: stagePanel.entryActions || null,
                timedActions: stagePanel.timedActions || null,
                exitActions: stagePanel.exitActions || null,
                requiredFields: stagePanel.requiredFields || null,
                aiGoal: stagePanel.aiGoal || null,
                aiInstruction: stagePanel.aiInstruction || null,
                transitionCriteria: stagePanel.transitionCriteria || null
            };
            const res = await funnelAPI.updateStage(
                currentWorkspace.id, stagePanel.funnelId, stagePanel.id, data
            );
            setFunnels(prev => prev.map(f => {
                if (f.id !== stagePanel.funnelId) return f;
                return { ...f, stages: f.stages.map(s => s.id === stagePanel.id ? res.data.stage : s) };
            }));
            setStagePanel(null);
        } catch (err) { console.error('Stage update error:', err); }
        finally { setSaving(false); }
    };

    const handleDeleteStage = async (funnelId, stageId) => {
        if (!confirm('Bu aşama silinecek. Emin misiniz?')) return;
        try {
            await funnelAPI.deleteStage(currentWorkspace.id, funnelId, stageId);
            setFunnels(prev => prev.map(f => {
                if (f.id !== funnelId) return f;
                return { ...f, stages: f.stages.filter(s => s.id !== stageId) };
            }));
            setStagePanel(null);
        } catch (err) { console.error(err); }
    };

    const handleSaveEntryRules = async (stageId, rulesJson) => {
        const funnelId = stagePanel?.funnelId || entryRulesModal.funnelId;
        if (!funnelId) return;
        try {
            const res = await funnelAPI.updateStage(currentWorkspace.id, funnelId, stageId, { entryRules: rulesJson });
            setFunnels(prev => prev.map(f => {
                if (f.id !== funnelId) return f;
                return { ...f, stages: f.stages.map(s => s.id === stageId ? res.data.stage : s) };
            }));
            // Update stage panel if it's open for this stage
            if (stagePanel?.id === stageId) {
                setStagePanel(prev => ({ ...prev, entryRules: rulesJson }));
            }
        } catch (err) { console.error('Entry rules save error:', err); }
    };

    const handleStageReorder = async (funnelId, draggedStageId, targetOrder) => {
        const funnel = funnels.find(f => f.id === funnelId);
        if (!funnel) return;

        const stages = [...funnel.stages].sort((a, b) => a.order - b.order);
        const draggedStage = stages.find(s => s.id === draggedStageId);
        if (!draggedStage) return;

        // Remove dragged and insert at target position
        const filtered = stages.filter(s => s.id !== draggedStageId);
        const targetIdx = filtered.findIndex(s => s.order >= targetOrder);
        const newStages = targetIdx === -1
            ? [...filtered, draggedStage]
            : [...filtered.slice(0, targetIdx), draggedStage, ...filtered.slice(targetIdx)];

        // Assign new orders
        const updates = newStages.map((s, i) => ({ ...s, order: i }));

        // Optimistic update
        setFunnels(prev => prev.map(f => f.id === funnelId ? { ...f, stages: updates } : f));

        // Save each stage's new order
        try {
            await Promise.all(updates.map(s =>
                funnelAPI.updateStage(currentWorkspace.id, funnelId, s.id, { order: s.order })
            ));
        } catch (err) {
            console.error('Reorder error:', err);
            loadFunnels(); // Reload on error
        }
    };

    // ── Panel openers ──
    const openStagePanel = (stage, funnelId) => {
        setStagePanel({
            ...stage,
            funnelId,
            assignedTeamId: stage.assignedTeamId || '',
            assignedUserId: stage.assignedUserId || '',
            assignedBotId: stage.assignedBotId || '',
            statusType: stage.statusType || '',
            color: stage.color || STAGE_COLORS[0],
            entryRules: stage.entryRules || ''
        });
        setFunnelPanel(null);
    };

    const openFunnelPanel = (funnel) => {
        let aiDescription = '';
        let catIds = [];
        if (funnel.classificationCriteria) {
            try {
                const parsed = JSON.parse(funnel.classificationCriteria);
                if (typeof parsed === 'object' && parsed !== null) {
                    aiDescription = parsed.aiDescription || parsed.description || parsed.keywords || '';
                    catIds = Array.isArray(parsed.categoryIds) ? parsed.categoryIds : [];
                } else {
                    aiDescription = String(funnel.classificationCriteria);
                }
            } catch {
                aiDescription = String(funnel.classificationCriteria);
            }
        }

        setFunnelPanel({
            ...funnel,
            assignedTeamId: funnel.assignedTeamId || '',
            assignedUserId: funnel.assignedUserId || '',
            classificationCriteria: aiDescription,
            categoryIds: catIds,
            color: funnel.color || nextColor(),
            icon: funnel.icon || '📁',
            parentId: funnel.parentId || '',
            _routings: []
        });
        setStagePanel(null);
        // Load existing routings
        channelRoutingAPI.getByFunnel(currentWorkspace.id, funnel.id)
            .then(res => {
                const routings = res.data?.routings || [];
                setFunnelPanel(p => p ? { ...p, _routings: routings } : p);
            })
            .catch(() => {});
    };

    // ── Helpers ──
    const getParentOptions = () => {
        const editingId = funnelPanel?.id;
        return funnels.filter(f => f.id !== editingId);
    };

    const getEntryRulesCount = (stage) => {
        try {
            const parsed = stage.entryRules ? JSON.parse(stage.entryRules) : null;
            return parsed?.rules?.length || 0;
        } catch { return 0; }
    };

    const getEntryRulesList = (stage) => {
        try {
            const parsed = stage.entryRules ? JSON.parse(stage.entryRules) : null;
            return parsed?.rules || [];
        } catch { return []; }
    };

    // Build funnel tree
    const mainFunnel = funnels.find(f => f.funnelType === 'MAIN');
    const childrenMap = {};
    funnels.forEach(f => {
        const parentKey = f.parentId || (f.funnelType !== 'MAIN' ? mainFunnel?.id : null);
        if (parentKey && f.id !== mainFunnel?.id) {
            if (!childrenMap[parentKey]) childrenMap[parentKey] = [];
            childrenMap[parentKey].push(f);
        }
    });

    // Re-parent a funnel via drag-and-drop
    const handleFunnelReparent = async (draggedFunnelId, targetParentId) => {
        if (draggedFunnelId === targetParentId) return;
        // Prevent circular: can't drop onto own descendant
        const isDescendant = (parentId, checkId) => {
            const children = childrenMap[checkId] || [];
            for (const c of children) {
                if (c.id === parentId) return true;
                if (isDescendant(parentId, c.id)) return true;
            }
            return false;
        };
        if (isDescendant(targetParentId, draggedFunnelId)) return;

        // Optimistic update
        setFunnels(prev => prev.map(f =>
            f.id === draggedFunnelId ? { ...f, parentId: targetParentId } : f
        ));

        try {
            await funnelAPI.update(currentWorkspace.id, draggedFunnelId, { parentId: targetParentId });
        } catch (err) {
            console.error('Reparent error:', err);
            loadFunnels();
        }
    };

    const renderFunnelTree = (funnel, depth = 0, isLast = true, ancestorLines = []) => {
        const childFunnels = childrenMap[funnel.id] || [];

        // connectorLines: array of booleans per ancestor depth — true means draw a vertical line at that depth
        const myConnectorLines = depth > 0 ? [...ancestorLines] : [];

        return (
            <FunnelPipeline
                key={funnel.id}
                funnel={funnel}
                stageCounts={stageCounts}
                selectedStage={selectedStage}
                connectedChannels={allChannelRoutings.filter(r => r.funnelId === funnel.id)}
                onStageClick={(stage) => setSelectedStage(stage.id === selectedStage ? null : stage.id)}
                onStageSettingsClick={(stage) => openStagePanel(stage, funnel.id)}
                onFunnelSettingsClick={openFunnelPanel}
                onStageReorder={handleStageReorder}
                onFunnelDrop={handleFunnelReparent}
                onAddStageClick={(f) => { setAddStageFunnelId(f.id); setNewStageName(''); setNewStageColor(STAGE_COLORS[0]); }}
                depth={depth}
                isLast={isLast}
                connectorLines={myConnectorLines}
            >
                {childFunnels.map((child, i) => {
                    const childIsLast = i === childFunnels.length - 1;
                    // For children, pass down whether ancestor lines continue
                    const childAncestorLines = [...myConnectorLines, !isLast];
                    return renderFunnelTree(child, depth + 1, childIsLast, childAncestorLines);
                })}
            </FunnelPipeline>
        );
    };

    return (
        <div className="funnels-page">
            {/* Header */}
            <div className="funnels-header">
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Kanban size={22} />
                    {t('funnels.management')}
                </h2>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <button className="btn-primary" onClick={() => setShowAddForm(prev => !prev)} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 16px', borderRadius: 8, fontSize: 14, fontWeight: 500 }}>
                        <Plus size={16} />
                        Yeni Akış
                    </button>
                </div>
            </div>

            {/* Add Funnel Form */}
            {showAddForm && (
                <div className="add-funnel-card" style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>Yeni Akış Ekle</span>
                        <button className="btn-icon" onClick={() => setShowAddForm(false)}><X size={16} /></button>
                    </div>
                    <div className="add-funnel-form">
                        <div className="settings-field">
                            <label>Akış Adı</label>
                            <input
                                type="text"
                                placeholder={t('funnels.createPlaceholder')}
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                            />
                        </div>
                        <div className="settings-field">
                            <label>Üst Akış</label>
                            <select value={newParentId} onChange={e => setNewParentId(e.target.value)}>
                                <option value="">Üst Akış Yok (Bağımsız)</option>
                                {getParentOptions().map(f => <option key={f.id} value={f.id}>↳ {f.name} altına</option>)}
                            </select>
                        </div>
                        <div className="settings-field">
                            <label>Takım</label>
                            <select value={newTeamId} onChange={e => setNewTeamId(e.target.value)}>
                                <option value="">Takım Ata (İsteğe Bağlı)</option>
                                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>
                        <div className="settings-field">
                            <label>Kişi</label>
                            <select value={newUserId} onChange={e => setNewUserId(e.target.value)}>
                                <option value="">Kişi Ata (İsteğe Bağlı)</option>
                                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                        </div>
                        <div className="settings-field full-width">
                            <label>🤖 AI Giriş Kriterleri</label>
                            <textarea
                                placeholder="Bu akışa hangi konuşmalar atanmalı? Örn: 'Estetik cerrahi, check-up, doğum paketi'"
                                value={newClassificationCriteria}
                                onChange={e => setNewClassificationCriteria(e.target.value)}
                                rows={2}
                            />
                        </div>
                        <div className="full-width" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button className="btn-secondary" onClick={() => setShowAddForm(false)}>İptal</button>
                            <button className="btn-primary" onClick={handleCreate} disabled={saving || !newName.trim()}>
                                {saving ? <Loader size={14} className="spin" /> : <Plus size={14} />}
                                Oluştur
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Funnels List */}
            {loading ? (
                <div className="empty-state">
                    <Loader size={32} className="spin" />
                    <p>Yükleniyor...</p>
                </div>
            ) : funnels.length === 0 ? (
                <div className="empty-state">
                    <Kanban size={40} />
                    <p>{t('funnels.empty')}</p>
                </div>
            ) : (
                mainFunnel ? renderFunnelTree(mainFunnel) : funnels.filter(f => !f.parentId).map(f => renderFunnelTree(f))
            )}

            {/* Add Stage Modal (simple inline) */}
            {addStageFunnelId && (
                <>
                    <div className="settings-panel-overlay" onClick={() => setAddStageFunnelId(null)} />
                    <div className="settings-panel">
                        <div className="settings-panel-content" style={{ width: 360 }}>
                            <div className="settings-panel-header">
                                <h3>Yeni Aşama Ekle</h3>
                                <button className="btn-icon" onClick={() => setAddStageFunnelId(null)}><X size={18} /></button>
                            </div>
                            <div className="settings-section">
                                <div className="settings-field">
                                    <label>Aşama Adı</label>
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="Yeni aşama adı…"
                                        value={newStageName}
                                        onChange={e => setNewStageName(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleAddStage(addStageFunnelId)}
                                    />
                                </div>
                                <div className="settings-field">
                                    <label>Renk</label>
                                    <div className="color-picker-grid">
                                        {STAGE_COLORS.map(c => (
                                            <button
                                                key={c}
                                                className={`color-picker-dot${newStageColor === c ? ' active' : ''}`}
                                                style={{ backgroundColor: c }}
                                                onClick={() => setNewStageColor(c)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="panel-actions">
                                <button className="btn-secondary" onClick={() => setAddStageFunnelId(null)}>İptal</button>
                                <button
                                    className="btn-primary"
                                    onClick={() => handleAddStage(addStageFunnelId)}
                                    disabled={stageSaving || !newStageName.trim()}
                                >
                                    {stageSaving ? <Loader size={14} className="spin" /> : <Plus size={14} />}
                                    Ekle
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* ═══════════════════════════════════════════════
                STAGE SETTINGS PANEL
               ═══════════════════════════════════════════════ */}
            {stagePanel && (
                <>
                    <div className="settings-panel-overlay" onClick={() => setStagePanel(null)} />
                    <div className="settings-panel">
                        <div className="settings-panel-content">
                            <div className="settings-panel-header">
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className="stage-color-dot" style={{
                                        width: 12, height: 12, borderRadius: '50%',
                                        backgroundColor: stagePanel.color, display: 'inline-block'
                                    }} />
                                    Aşama Ayarları
                                </h3>
                                <button className="btn-icon" onClick={() => setStagePanel(null)}><X size={18} /></button>
                            </div>

                            {/* Basic Info */}
                            <div className="settings-section">
                                <div className="settings-section-title">Genel</div>
                                <div className="settings-field">
                                    <label>Aşama Adı</label>
                                    <input
                                        type="text"
                                        value={stagePanel.name}
                                        onChange={e => setStagePanel(p => ({ ...p, name: e.target.value }))}
                                    />
                                </div>
                                <div className="settings-field">
                                    <label>Renk</label>
                                    <div className="color-picker-grid">
                                        {STAGE_COLORS.map(c => (
                                            <button
                                                key={c}
                                                className={`color-picker-dot${stagePanel.color === c ? ' active' : ''}`}
                                                style={{ backgroundColor: c }}
                                                onClick={() => setStagePanel(p => ({ ...p, color: c }))}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Assignment */}
                            <div className="settings-section">
                                <div className="settings-section-title">Atama</div>
                                <div className="settings-field">
                                    <label>Takım</label>
                                    <select
                                        value={stagePanel.assignedTeamId}
                                        onChange={e => setStagePanel(p => ({ ...p, assignedTeamId: e.target.value }))}
                                    >
                                        <option value="">
                                            {(() => {
                                                const funnel = funnels.find(f => f.id === stagePanel.funnelId);
                                                if (funnel?.assignedTeamId) {
                                                    const teamName = teams.find(t => t.id === funnel.assignedTeamId)?.name;
                                                    return `↑ Üst Akıştan (${teamName || 'Üst Akış'})`;
                                                }
                                                return 'Takım Ata';
                                            })()}
                                        </option>
                                        {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                </div>
                                <div className="settings-field">
                                    <label>Kişi</label>
                                    <select
                                        value={stagePanel.assignedUserId}
                                        onChange={e => setStagePanel(p => ({ ...p, assignedUserId: e.target.value }))}
                                    >
                                        <option value="">
                                            {(() => {
                                                const funnel = funnels.find(f => f.id === stagePanel.funnelId);
                                                if (funnel?.assignedUserId) {
                                                    const userName = members.find(m => m.id === funnel.assignedUserId)?.name;
                                                    return `↑ Üst Akıştan (${userName || 'Üst Akış'})`;
                                                }
                                                return 'Kişi Ata';
                                            })()}
                                        </option>
                                        {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                    </select>
                                </div>
                                <div className="settings-field">
                                    <label>🤖 Robot</label>
                                    <select
                                        value={stagePanel.assignedBotId}
                                        onChange={e => setStagePanel(p => ({ ...p, assignedBotId: e.target.value }))}
                                    >
                                        <option value="">Robot Ata</option>
                                        {bots.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* Status Type */}
                            <div className="settings-section">
                                <div className="settings-section-title">Durum Tipi</div>
                                <div className="settings-field">
                                    <label>Aşama Sonucu</label>
                                    <select
                                        value={stagePanel.statusType}
                                        onChange={e => setStagePanel(p => ({ ...p, statusType: e.target.value }))}
                                    >
                                        <option value="">⚪ Açık</option>
                                        <option value="WON">🟢 Kazanıldı</option>
                                        <option value="LOST">🔴 Kaybedildi</option>
                                        <option value="CLOSED">⚫ Kapandı</option>
                                    </select>
                                </div>
                            </div>

                            {/* AI Davranışı */}
                            <div className="settings-section">
                                <div className="settings-section-title">🧠 AI Davranışı</div>
                                <p className="settings-hint">Bu aşamadayken AI'ın nasıl davranacağını tanımlayın</p>
                                <div className="settings-field">
                                    <label>AI Hedefi</label>
                                    <input
                                        type="text"
                                        placeholder="Örn: Müşteriyi randevuya yönlendir"
                                        value={stagePanel.aiGoal || ''}
                                        onChange={e => setStagePanel(p => ({ ...p, aiGoal: e.target.value }))}
                                    />
                                </div>
                                <div className="settings-field">
                                    <label>AI Talimatı</label>
                                    <textarea
                                        rows={3}
                                        placeholder="Örn: Müşteriyle görüşme saati belirle, telefon numarası al. Nazik ve profesyonel ol."
                                        value={stagePanel.aiInstruction || ''}
                                        onChange={e => setStagePanel(p => ({ ...p, aiInstruction: e.target.value }))}
                                        style={{ width: '100%', resize: 'vertical', minHeight: 60 }}
                                    />
                                </div>
                                <div className="settings-field">
                                    <label>Geçiş Kriteri</label>
                                    <input
                                        type="text"
                                        placeholder="Örn: Telefon numarası ve randevu saati alındığında sonraki aşamaya geç"
                                        value={(() => {
                                            if (!stagePanel.transitionCriteria) return '';
                                            try {
                                                const parsed = typeof stagePanel.transitionCriteria === 'string' 
                                                    ? JSON.parse(stagePanel.transitionCriteria) 
                                                    : stagePanel.transitionCriteria;
                                                return parsed.description || '';
                                            } catch { return stagePanel.transitionCriteria || ''; }
                                        })()}
                                        onChange={e => setStagePanel(p => ({ 
                                            ...p, 
                                            transitionCriteria: e.target.value 
                                                ? JSON.stringify({ description: e.target.value, autoTransition: true })
                                                : null
                                        }))}
                                    />
                                    <span style={{ fontSize: 11, color: '#94a3b8' }}>Bu kriter sağlandığında konuşma otomatik sonraki aşamaya geçer</span>
                                </div>
                            </div>

                            {/* Entry Rules */}
                            <div className="settings-section">
                                <div className="settings-section-title">Giriş Kuralları</div>
                                {getEntryRulesCount(stagePanel) > 0 ? (
                                    <div className="entry-rules-list">
                                        {getEntryRulesList(stagePanel).map((rule, i) => (
                                            <div key={i} className="entry-rule-item">
                                                <span className="entry-rule-badge">{rule.type}</span>
                                                <span>{rule.type === 'CHANNEL_IS'
                                                    ? (rule.channels || []).join(', ')
                                                    : (rule.field || rule.value || '')
                                                }</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0' }}>Henüz kural tanımlanmadı.</p>
                                )}
                                <button
                                    className="btn-secondary"
                                    style={{ marginTop: 8 }}
                                    onClick={() => {
                                        setEntryRulesModal({
                                            isOpen: true,
                                            stage: stagePanel,
                                            funnelId: stagePanel.funnelId
                                        });
                                    }}
                                >
                                    <Settings size={13} />
                                    {getEntryRulesCount(stagePanel) > 0 ? `${getEntryRulesCount(stagePanel)} Kuralı Düzenle` : 'Kural Ekle'}
                                </button>
                            </div>

                            {/* Giriş Aksiyonları */}
                            <div className="settings-section">
                                <div className="settings-section-title">⚡ Giriş Aksiyonları</div>
                                <p className="settings-hint">Bir kişi bu aşamaya girdiğinde otomatik çalışır</p>
                                {(() => {
                                    const config = stagePanel.entryActions ? (typeof stagePanel.entryActions === 'string' ? JSON.parse(stagePanel.entryActions) : stagePanel.entryActions) : { actions: [] };
                                    const actions = config.actions || [];
                                    const updateEntryAction = (idx, changes) => {
                                        const newActions = [...actions];
                                        newActions[idx] = { ...newActions[idx], ...changes };
                                        setStagePanel(p => ({ ...p, entryActions: JSON.stringify({ actions: newActions }) }));
                                    };
                                    return (
                                        <>
                                            {actions.map((a, i) => (
                                                <div key={i} className="automation-item channel-action">
                                                    <div className="action-row">
                                                        <select
                                                            value={a.type}
                                                            onChange={e => updateEntryAction(i, { type: e.target.value })}
                                                        >
                                                            <optgroup label="⚙️ Genel">
                                                                <option value="CREATE_TASK">📋 Görev Oluştur</option>
                                                                <option value="ADD_TAG">🏷️ Etiket Ekle</option>
                                                                <option value="NOTIFY_TEAM">🔔 Takıma Bildir</option>
                                                                <option value="MOVE_STAGE">↗️ Aşama Değiştir</option>
                                                            </optgroup>
                                                            <optgroup label="📱 WhatsApp">
                                                                <option value="WA_SEND_TEMPLATE">📱 Şablon Gönder</option>
                                                                <option value="WA_SEND_MESSAGE">💬 Mesaj Gönder</option>
                                                            </optgroup>
                                                            <optgroup label="📸 Instagram">
                                                                <option value="IG_SEND_MESSAGE">📸 Mesaj Gönder</option>
                                                            </optgroup>
                                                            <optgroup label="📞 Arama">
                                                                <option value="RETELL_CALL">📞 AI Arama Yap</option>
                                                            </optgroup>
                                                            <optgroup label="📧 E-posta">
                                                                <option value="SEND_EMAIL">📧 E-posta Gönder</option>
                                                            </optgroup>
                                                            <optgroup label="🔄 Otomatik">
                                                                <option value="AUTO_CHANNEL_MESSAGE">🔄 Yazıştığı Kanaldan Gönder</option>
                                                                <option value="TRIGGER_AUTOMATION">🤖 Otomasyon Tetikle</option>
                                                            </optgroup>
                                                        </select>
                                                        <button className="btn-icon" onClick={() => {
                                                            const newActions = actions.filter((_, idx) => idx !== i);
                                                            setStagePanel(p => ({ ...p, entryActions: JSON.stringify({ actions: newActions }) }));
                                                        }}><X size={12} /></button>
                                                    </div>
                                                    {/* Dynamic inputs based on type */}
                                                    {a.type === 'WA_SEND_TEMPLATE' && (
                                                        <select className="action-param" value={a.templateId || ''} onChange={e => updateEntryAction(i, { templateId: e.target.value })}>
                                                            <option value="">Şablon Seç...</option>
                                                            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                                        </select>
                                                    )}
                                                    {a.type === 'RETELL_CALL' && (
                                                        <select className="action-param" value={a.botId || ''} onChange={e => updateEntryAction(i, { botId: e.target.value })}>
                                                            <option value="">Asistan Seç...</option>
                                                            {bots.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                                        </select>
                                                    )}
                                                    {a.type === 'TRIGGER_AUTOMATION' && (
                                                        <select className="action-param" value={a.automationId || ''} onChange={e => updateEntryAction(i, { automationId: e.target.value })}>
                                                            <option value="">Otomasyon Seç...</option>
                                                            {automations.map(auto => <option key={auto.id} value={auto.id}>{auto.name}</option>)}
                                                        </select>
                                                    )}
                                                    {a.type === 'SEND_EMAIL' && (
                                                        <>
                                                            <input className="action-param" placeholder="E-posta konusu" value={a.subject || ''} onChange={e => updateEntryAction(i, { subject: e.target.value })} />
                                                            <textarea className="action-param" placeholder="E-posta içeriği" rows={2} value={a.content || ''} onChange={e => updateEntryAction(i, { content: e.target.value })} />
                                                        </>
                                                    )}
                                                    {['WA_SEND_MESSAGE', 'IG_SEND_MESSAGE', 'AUTO_CHANNEL_MESSAGE'].includes(a.type) && (
                                                        <textarea className="action-param" placeholder="Mesaj içeriği" rows={2} value={a.message || ''} onChange={e => updateEntryAction(i, { message: e.target.value })} />
                                                    )}
                                                    {['CREATE_TASK', 'NOTIFY_TEAM'].includes(a.type) && (
                                                        <input className="action-param" placeholder={a.type === 'CREATE_TASK' ? 'Görev başlığı' : 'Bildirim içeriği'} value={a.title || ''} onChange={e => updateEntryAction(i, { title: e.target.value })} />
                                                    )}
                                                    {a.type === 'ADD_TAG' && (
                                                        <input className="action-param" placeholder="Etiket adı" value={a.tagName || ''} onChange={e => updateEntryAction(i, { tagName: e.target.value })} />
                                                    )}
                                                </div>
                                            ))}
                                            <button className="btn-add-sm" onClick={() => {
                                                const newActions = [...actions, { type: 'CREATE_TASK', title: '' }];
                                                setStagePanel(p => ({ ...p, entryActions: JSON.stringify({ actions: newActions }) }));
                                            }}>+ Aksiyon Ekle</button>
                                        </>
                                    );
                                })()}
                            </div>

                            {/* Zamanlı Aksiyonlar */}
                            <div className="settings-section">
                                <div className="settings-section-title">⏰ Zamanlı Aksiyonlar</div>
                                <p className="settings-hint">Belli süre sonra otomatik tetiklenir</p>
                                {(() => {
                                    const config = stagePanel.timedActions ? (typeof stagePanel.timedActions === 'string' ? JSON.parse(stagePanel.timedActions) : stagePanel.timedActions) : { actions: [] };
                                    const actions = config.actions || [];
                                    const updateTimedAction = (idx, changes) => {
                                        const newActions = [...actions];
                                        newActions[idx] = { ...newActions[idx], ...changes };
                                        setStagePanel(p => ({ ...p, timedActions: JSON.stringify({ actions: newActions }) }));
                                    };
                                    return (
                                        <>
                                            {actions.map((a, i) => (
                                                <div key={i} className="automation-item timed channel-action">
                                                    <div className="timed-row">
                                                        <input
                                                            type="number" min="0" placeholder="Gün" style={{ width: 60 }}
                                                            value={a.delayDays || ''}
                                                            onChange={e => updateTimedAction(i, { delayDays: parseInt(e.target.value) || 0 })}
                                                        />
                                                        <span>gün</span>
                                                        <input
                                                            type="number" min="0" max="23" placeholder="Saat" style={{ width: 60 }}
                                                            value={a.delayHours || ''}
                                                            onChange={e => updateTimedAction(i, { delayHours: parseInt(e.target.value) || 0 })}
                                                        />
                                                        <span>saat sonra</span>
                                                    </div>
                                                    <div className="action-row">
                                                        <select
                                                            value={a.type}
                                                            onChange={e => updateTimedAction(i, { type: e.target.value })}
                                                        >
                                                            <optgroup label="⚙️ Genel">
                                                                <option value="CREATE_TASK">📋 Hatırlatma Görevi</option>
                                                                <option value="NOTIFY_TEAM">🔔 Takıma Bildir</option>
                                                                <option value="MOVE_STAGE">↗️ Aşama Değiştir</option>
                                                            </optgroup>
                                                            <optgroup label="📱 WhatsApp">
                                                                <option value="WA_SEND_TEMPLATE">📱 Şablon Gönder</option>
                                                                <option value="WA_SEND_MESSAGE">💬 Mesaj Gönder</option>
                                                            </optgroup>
                                                            <optgroup label="📸 Instagram">
                                                                <option value="IG_SEND_MESSAGE">📸 Mesaj Gönder</option>
                                                            </optgroup>
                                                            <optgroup label="📞 Arama">
                                                                <option value="RETELL_CALL">📞 AI Arama Yap</option>
                                                            </optgroup>
                                                            <optgroup label="📧 E-posta">
                                                                <option value="SEND_EMAIL">📧 E-posta Gönder</option>
                                                            </optgroup>
                                                            <optgroup label="🔄 Otomatik">
                                                                <option value="AUTO_CHANNEL_MESSAGE">🔄 Yazıştığı Kanaldan Gönder</option>
                                                            </optgroup>
                                                        </select>
                                                        <button className="btn-icon" onClick={() => {
                                                            const newActions = actions.filter((_, idx) => idx !== i);
                                                            setStagePanel(p => ({ ...p, timedActions: JSON.stringify({ actions: newActions }) }));
                                                        }}><X size={12} /></button>
                                                    </div>
                                                    {/* Dynamic inputs based on type */}
                                                    {a.type === 'WA_SEND_TEMPLATE' && (
                                                        <select className="action-param" value={a.templateId || ''} onChange={e => updateTimedAction(i, { templateId: e.target.value })}>
                                                            <option value="">Şablon Seç...</option>
                                                            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                                        </select>
                                                    )}
                                                    {a.type === 'RETELL_CALL' && (
                                                        <select className="action-param" value={a.botId || ''} onChange={e => updateTimedAction(i, { botId: e.target.value })}>
                                                            <option value="">Asistan Seç...</option>
                                                            {bots.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                                        </select>
                                                    )}
                                                    {a.type === 'SEND_EMAIL' && (
                                                        <>
                                                            <input className="action-param" placeholder="E-posta konusu" value={a.subject || ''} onChange={e => updateTimedAction(i, { subject: e.target.value })} />
                                                            <textarea className="action-param" placeholder="E-posta içeriği" rows={2} value={a.content || ''} onChange={e => updateTimedAction(i, { content: e.target.value })} />
                                                        </>
                                                    )}
                                                    {['WA_SEND_MESSAGE', 'IG_SEND_MESSAGE', 'AUTO_CHANNEL_MESSAGE'].includes(a.type) && (
                                                        <textarea className="action-param" placeholder="Mesaj içeriği" rows={2} value={a.message || ''} onChange={e => updateTimedAction(i, { message: e.target.value })} />
                                                    )}
                                                    {['CREATE_TASK', 'NOTIFY_TEAM'].includes(a.type) && (
                                                        <input className="action-param" placeholder={a.type === 'CREATE_TASK' ? 'Görev başlığı' : 'Bildirim içeriği'} value={a.title || ''} onChange={e => updateTimedAction(i, { title: e.target.value })} />
                                                    )}
                                                </div>
                                            ))}
                                            <button className="btn-add-sm" onClick={() => {
                                                const newActions = [...actions, { type: 'CREATE_TASK', delayDays: 1, delayHours: 0, title: '' }];
                                                setStagePanel(p => ({ ...p, timedActions: JSON.stringify({ actions: newActions }) }));
                                            }}>+ Zamanlı Aksiyon Ekle</button>
                                        </>
                                    );
                                })()}
                            </div>

                            {/* Zorunluluklar */}
                            <div className="settings-section">
                                <div className="settings-section-title">🔒 Zorunluluklar</div>
                                <p className="settings-hint">Bu aşamaya geçerken karşılanması gereken koşullar</p>
                                {(() => {
                                    const config = stagePanel.requiredFields ? (typeof stagePanel.requiredFields === 'string' ? JSON.parse(stagePanel.requiredFields) : stagePanel.requiredFields) : { mode: 'FREE', fields: [], autoAdvance: false };
                                    const existingFields = config.fields || [];
                                    const AI_FIELDS = [
                                        { key: 'name', label: '👤 Ad Soyad', desc: 'Müşterinin ismi' },
                                        { key: 'phone', label: '📞 Telefon', desc: 'Telefon numarası' },
                                        { key: 'email', label: '📧 E-posta', desc: 'E-posta adresi' },
                                        { key: 'topic', label: '💬 İlgi Alanı', desc: 'İlgilendiği ürün/hizmet' },
                                        { key: 'budget', label: '💰 Bütçe', desc: 'Bütçe bilgisi' },
                                        { key: 'city', label: '📍 Şehir', desc: 'Şehir/konum' },
                                        { key: 'company', label: '🏢 Firma', desc: 'Firma adı' },
                                        { key: 'preferredCallTime', label: '⏰ Aranma Zamanı', desc: 'Müsait olduğu saat' },
                                    ];
                                    // Mevcut fields listesindeki string alanları (AI tarafından toplanacaklar)
                                    const activeAiFields = existingFields.filter(f => typeof f === 'string');
                                    // Mevcut fields listesindeki object alanları (eski zorunluluklar)
                                    const activeOldFields = existingFields.filter(f => typeof f === 'object' && f.type);
                                    return (
                                        <>
                                            <div className="settings-field">
                                                <label>Zorunluluk Modu</label>
                                                <select
                                                    value={config.mode || 'FREE'}
                                                    onChange={e => setStagePanel(p => ({ ...p, requiredFields: JSON.stringify({ ...config, mode: e.target.value }) }))}
                                                >
                                                    <option value="FREE">Serbest — Zorunluluk yok</option>
                                                    <option value="SUGGESTED">Önerilen — Uyarı göster</option>
                                                    <option value="MANDATORY">Zorunlu — Tamamlanmadan geçilemez</option>
                                                </select>
                                            </div>
                                            {config.mode !== 'FREE' && (
                                                <>
                                                    {/* AI Bilgi Toplama Alanları */}
                                                    <div className="settings-field">
                                                        <label>🤖 Bot'un Toplaması Gereken Bilgiler</label>
                                                        <p className="settings-hint" style={{margin: '0 0 8px', fontSize: '0.75rem', color: '#64748b'}}>Bot bu bilgileri doğal konuşma akışında müşteriden sorar</p>
                                                        <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px'}}>
                                                            {AI_FIELDS.map(af => {
                                                                const isActive = activeAiFields.includes(af.key);
                                                                return (
                                                                    <button
                                                                        key={af.key}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            const newAiFields = isActive
                                                                                ? activeAiFields.filter(k => k !== af.key)
                                                                                : [...activeAiFields, af.key];
                                                                            setStagePanel(p => ({ ...p, requiredFields: JSON.stringify({ ...config, fields: [...newAiFields, ...activeOldFields] }) }));
                                                                        }}
                                                                        style={{
                                                                            padding: '4px 12px', borderRadius: '16px', fontSize: '0.8rem', fontWeight: 500,
                                                                            border: isActive ? '2px solid #10b981' : '1px solid #d1d5db',
                                                                            background: isActive ? '#ecfdf5' : '#fff',
                                                                            color: isActive ? '#047857' : '#475569',
                                                                            cursor: 'pointer', transition: 'all 0.15s'
                                                                        }}
                                                                    >
                                                                        {af.label}{isActive && ' ✓'}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                    {/* Otomatik İlerleme */}
                                                    <div className="settings-field" style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                                        <input
                                                            type="checkbox"
                                                            checked={config.autoAdvance || false}
                                                            onChange={e => setStagePanel(p => ({ ...p, requiredFields: JSON.stringify({ ...config, autoAdvance: e.target.checked }) }))}
                                                            style={{width: 16, height: 16}}
                                                        />
                                                        <label style={{margin: 0, cursor: 'pointer'}}>🚀 Tüm bilgiler tamamlanınca otomatik sonraki aşamaya geç</label>
                                                    </div>
                                                    {/* Eski zorunluluklar (NOT, DEAL, APPOINTMENT vb.) */}
                                                    {activeOldFields.map((f, i) => (
                                                        <div key={i} className="automation-item">
                                                            <select
                                                                value={f.type}
                                                                onChange={e => {
                                                                    const newOld = [...activeOldFields];
                                                                    newOld[i] = { ...f, type: e.target.value };
                                                                    setStagePanel(p => ({ ...p, requiredFields: JSON.stringify({ ...config, fields: [...activeAiFields, ...newOld] }) }));
                                                                }}
                                                            >
                                                                <option value="NOTE">📝 Not girilmeli</option>
                                                                <option value="DEAL_EXISTS">💰 Teklif/Fırsat olmalı</option>
                                                                <option value="APPOINTMENT">📅 Randevu olmalı</option>
                                                                <option value="PHONE">📞 Telefon numarası olmalı</option>
                                                            </select>
                                                            <input
                                                                placeholder="Kullanıcıya mesaj"
                                                                value={f.prompt || ''}
                                                                onChange={e => {
                                                                    const newOld = [...activeOldFields];
                                                                    newOld[i] = { ...f, prompt: e.target.value };
                                                                    setStagePanel(p => ({ ...p, requiredFields: JSON.stringify({ ...config, fields: [...activeAiFields, ...newOld] }) }));
                                                                }}
                                                            />
                                                            <button className="btn-icon" onClick={() => {
                                                                const newOld = activeOldFields.filter((_, idx) => idx !== i);
                                                                setStagePanel(p => ({ ...p, requiredFields: JSON.stringify({ ...config, fields: [...activeAiFields, ...newOld] }) }));
                                                            }}><X size={12} /></button>
                                                        </div>
                                                    ))}
                                                    <button className="btn-add-sm" onClick={() => {
                                                        const newOld = [...activeOldFields, { type: 'NOTE', prompt: '' }];
                                                        setStagePanel(p => ({ ...p, requiredFields: JSON.stringify({ ...config, fields: [...activeAiFields, ...newOld] }) }));
                                                    }}>+ İş Kuralı Ekle</button>
                                                </>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>

                            {/* Actions */}
                            <div className="panel-actions">
                                <button
                                    className="btn-danger"
                                    onClick={() => handleDeleteStage(stagePanel.funnelId, stagePanel.id)}
                                >
                                    <Trash2 size={13} />
                                    Sil
                                </button>
                                <div style={{ flex: 1 }} />
                                <button className="btn-secondary" onClick={() => setStagePanel(null)}>İptal</button>
                                <button className="btn-primary" onClick={handleUpdateStage} disabled={saving}>
                                    {saving ? <Loader size={14} className="spin" /> : null}
                                    Kaydet
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* ═══════════════════════════════════════════════
                FUNNEL SETTINGS PANEL
               ═══════════════════════════════════════════════ */}
            {funnelPanel && (
                <>
                    <div className="settings-panel-overlay" onClick={() => setFunnelPanel(null)} />
                    <div className="settings-panel">
                        <div className="settings-panel-content">
                            <div className="settings-panel-header">
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 20 }}>{funnelPanel.icon || '📁'}</span>
                                    Akış Ayarları
                                </h3>
                                <button className="btn-icon" onClick={() => setFunnelPanel(null)}><X size={18} /></button>
                            </div>

                            {/* Basic Info */}
                            <div className="settings-section">
                                <div className="settings-section-title">Genel</div>
                                <div className="settings-field">
                                    <label>Akış Adı</label>
                                    <input
                                        type="text"
                                        value={funnelPanel.name}
                                        onChange={e => setFunnelPanel(p => ({ ...p, name: e.target.value }))}
                                    />
                                </div>
                                <div className="settings-field">
                                    <label>Renk</label>
                                    <div className="color-picker-grid">
                                        {STAGE_COLORS.map(c => (
                                            <button
                                                key={c}
                                                className={`color-picker-dot${funnelPanel.color === c ? ' active' : ''}`}
                                                style={{ backgroundColor: c }}
                                                onClick={() => setFunnelPanel(p => ({ ...p, color: c }))}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div className="settings-field">
                                    <label>İkon</label>
                                    <div className="emoji-picker-grid">
                                        {FUNNEL_ICONS.map(emoji => (
                                            <button
                                                key={emoji}
                                                className={`emoji-picker-btn${funnelPanel.icon === emoji ? ' active' : ''}`}
                                                onClick={() => setFunnelPanel(p => ({ ...p, icon: emoji }))}
                                            >
                                                {emoji}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Hierarchy */}
                            {funnelPanel.funnelType !== 'MAIN' && (
                                <div className="settings-section">
                                    <div className="settings-section-title">Hiyerarşi</div>
                                    <div className="settings-field">
                                        <label>Üst Akış</label>
                                        <select
                                            value={funnelPanel.parentId}
                                            onChange={e => setFunnelPanel(p => ({ ...p, parentId: e.target.value }))}
                                        >
                                            <option value="">Üst Akış Yok (Bağımsız)</option>
                                            {funnels.filter(f => f.id !== funnelPanel.id && f.funnelType !== 'MAIN' && !f.parentId).map(f =>
                                                <option key={f.id} value={f.id}>↳ {f.name} altına</option>
                                            )}
                                        </select>
                                    </div>
                                </div>
                            )}

                            {/* Assignment */}
                            <div className="settings-section">
                                <div className="settings-section-title">Atama</div>
                                <div className="settings-field">
                                    <label>Takım</label>
                                    <select
                                        value={funnelPanel.assignedTeamId}
                                        onChange={e => setFunnelPanel(p => ({ ...p, assignedTeamId: e.target.value }))}
                                    >
                                        <option value="">Takım Ata</option>
                                        {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                </div>
                                <div className="settings-field">
                                    <label>Kişi</label>
                                    <select
                                        value={funnelPanel.assignedUserId}
                                        onChange={e => setFunnelPanel(p => ({ ...p, assignedUserId: e.target.value }))}
                                    >
                                        <option value="">Kişi Ata</option>
                                        {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                    </select>
                                </div>
                                <div className="settings-field">
                                    <label>Bot</label>
                                    <select
                                        value={funnelPanel.assignedBotId || ''}
                                        onChange={e => setFunnelPanel(p => ({ ...p, assignedBotId: e.target.value }))}
                                    >
                                        <option value="">Bot Ata (Miras alınır)</option>
                                        {bots.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* AI Criteria */}
                            <div className="settings-section">
                                <div className="settings-section-title">AI Sınıflandırma</div>
                                <div className="settings-field">
                                    <label>Giriş Kriterleri</label>
                                    <textarea
                                        placeholder="Bu akışa hangi konuşmalar girmeli? Örn: 'Estetik cerrahi, check-up soruları bu akışa girer'"
                                        value={funnelPanel.classificationCriteria}
                                        onChange={e => setFunnelPanel(p => ({ ...p, classificationCriteria: e.target.value }))}
                                        rows={3}
                                    />
                                </div>
                                {/* Sorumlu Kategoriler */}
                                <div className="settings-field">
                                    <label>Sorumlu Kategoriler</label>
                                    <p className="settings-hint" style={{margin: '0 0 8px', fontSize: '0.75rem', color: '#64748b'}}>Bu akışa hangi konu kategorileri yönlendirilsin?</p>
                                    <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px'}}>
                                        {topicCategories.map(cat => {
                                            const selected = (funnelPanel.categoryIds || []).includes(cat.id);
                                            return (
                                                <button
                                                    key={cat.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setFunnelPanel(p => ({
                                                            ...p,
                                                            categoryIds: selected
                                                                ? (p.categoryIds || []).filter(id => id !== cat.id)
                                                                : [...(p.categoryIds || []), cat.id]
                                                        }));
                                                    }}
                                                    style={{
                                                        padding: '4px 12px',
                                                        borderRadius: '16px',
                                                        fontSize: '0.8rem',
                                                        fontWeight: 500,
                                                        border: selected ? '2px solid #3b82f6' : '1px solid #d1d5db',
                                                        background: selected ? '#eff6ff' : '#fff',
                                                        color: selected ? '#1d4ed8' : '#475569',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s'
                                                    }}
                                                >
                                                    {cat.icon && <span style={{marginRight: 4}}>{cat.icon}</span>}
                                                    {cat.name}
                                                    {selected && ' ✓'}
                                                </button>
                                            );
                                        })}
                                        {topicCategories.length === 0 && (
                                            <span style={{color: '#94a3b8', fontSize: '0.8rem'}}>Henüz kategori yok. Ayarlar → Konu Kategorileri'nden oluşturun.</span>
                                        )}
                                    </div>
                                </div>
                            </div>


                            {/* Actions */}
                            <div className="panel-actions">
                                {funnelPanel.funnelType !== 'MAIN' && !funnelPanel.isDefault && (
                                    <button
                                        className="btn-danger"
                                        onClick={() => handleDeleteFunnel(funnelPanel.id)}
                                    >
                                        <Trash2 size={13} />
                                        Sil
                                    </button>
                                )}
                                <div style={{ flex: 1 }} />
                                <button className="btn-secondary" onClick={() => setFunnelPanel(null)}>İptal</button>
                                <button className="btn-primary" onClick={handleUpdateFunnel} disabled={saving}>
                                    {saving ? <Loader size={14} className="spin" /> : null}
                                    Kaydet
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Entry Rules Modal */}
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
