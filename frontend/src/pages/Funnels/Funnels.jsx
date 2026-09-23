import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { funnelAPI, teamAPI, workspaceAPI, aiAPI, channelRoutingAPI, automationAPI, appointmentConfigAPI, rulesAPI, productAPI } from '../../services/api';
import { getTopicCategories, updateTopicCategory } from '../../services/topicCategory.api';
import { getCaseTypes, updateCaseType } from '../../services/caseType.api';
import { Plus, Trash2, X, Loader, Kanban, ChevronDown, Settings, Layers, Package } from 'lucide-react';
import { useToast } from '../../components/Toast/Toast';
import EntryRulesModal from '../../components/Funnels/EntryRulesModal';
import FunnelPipeline from '../../components/Funnels/FunnelPipeline';
import CaseTypesAndTopics from '../Settings/CaseTypesAndTopics';
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
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') === 'casetypes' ? 'casetypes' : 'funnels';

    const handleTabChange = (tab) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (tab === 'funnels') {
                next.delete('tab');
            } else {
                next.set('tab', tab);
            }
            return next;
        });
    };

    const [funnels, setFunnels] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const [stageSaving, setStageSaving] = useState(false);
    
    const [linkedAutomations, setLinkedAutomations] = useState([]);
    const [linkedAutomationsLoading, setLinkedAutomationsLoading] = useState(false);

    const loadLinkedAutomations = async (stageId) => {
        if (!stageId || !currentWorkspace?.id) return;
        setLinkedAutomationsLoading(true);
        try {
            const res = await rulesAPI.getByStage(currentWorkspace.id, stageId);
            setLinkedAutomations(res.data?.rules || []);
        } catch (err) {
            console.error('Linked automations load error:', err);
            setLinkedAutomations([]);
        } finally {
            setLinkedAutomationsLoading(false);
        }
    };

    // Teams and Members loaded for dropdowns
    const [teams, setTeams] = useState([]);
    const [members, setMembers] = useState([]);
    const [bots, setBots] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [automations, setAutomations] = useState([]);
    const [topicCategories, setTopicCategories] = useState([]);
    const [productGroups, setProductGroups] = useState([]);
    const [allCaseTypes, setAllCaseTypes] = useState([]);

    // Stage counts
    const [stageCounts, setStageCounts] = useState({});
    // Otomasyon bağlantı sayıları (stageId → count)
    const [stageAutomationCounts, setStageAutomationCounts] = useState({});

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

    // Branches
    const [branches, setBranches] = useState([]);
    const [selectedBranchId, setSelectedBranchId] = useState(() => {
        if (!currentWorkspace) return 'ALL';
        return localStorage.getItem(`funnels_branchFilter_${currentWorkspace.id}`) || 'ALL';
    });

    useEffect(() => {
        if (currentWorkspace) {
            appointmentConfigAPI.getBranches(currentWorkspace.id)
                .then(res => setBranches(res.data.branches || []))
                .catch(() => {});
        }
    }, [currentWorkspace]);

    useEffect(() => {
        if (currentWorkspace) {
            localStorage.setItem(`funnels_branchFilter_${currentWorkspace.id}`, selectedBranchId);
        }
    }, [selectedBranchId, currentWorkspace]);

    useEffect(() => {
        if (currentWorkspace) {
            loadFunnels();
            loadTeamsAndMembers();
        }
    }, [currentWorkspace]);

    useEffect(() => {
        if (currentWorkspace) {
            loadStageCounts();
        }
    }, [currentWorkspace, selectedBranchId]);

    const loadTeamsAndMembers = async () => {
        try {
            const [teamsRes, membersRes, botsRes, tplRes, autoRes, rulesRes] = await Promise.all([
                teamAPI.getWorkspaceTeams(currentWorkspace.id).catch(() => ({ data: { teams: [] } })),
                workspaceAPI.getMembers(currentWorkspace.id).catch(() => ({ data: { members: [] } })),
                aiAPI.getBots(currentWorkspace.id).catch(() => ({ data: { bots: [] } })),
                automationAPI.getTemplates(currentWorkspace.id).catch(() => ({ data: { templates: [] } })),
                automationAPI.getAutomations(currentWorkspace.id).catch(() => ({ data: { automations: [] } })),
                rulesAPI.getAll(currentWorkspace.id).catch(() => ({ data: { rules: [] } }))
            ]);
            setTeams(teamsRes.data?.teams || []);
            setMembers(membersRes.data?.members?.map(m => m.user) || membersRes.data || []);
            setBots(botsRes.data?.bots || []);
            setTemplates(tplRes.data?.templates || tplRes.data || []);
            setAutomations(autoRes.data?.automations || autoRes.data || []);
            // Otomasyon → Aşama bağlantı sayıları
            const rules = rulesRes.data?.rules || [];
            const counts = {};
            for (const r of rules) {
                if (r.linkedStageId) {
                    counts[r.linkedStageId] = (counts[r.linkedStageId] || 0) + 1;
                }
            }
            setStageAutomationCounts(counts);
            // Topic Categories yükle
            try {
                const catRes = await getTopicCategories(currentWorkspace.id);
                setTopicCategories(catRes.data || []);
            } catch { /* Kategori yoksa sorun değil */ }
            // Ürün Grupları yükle
            try {
                const pgRes = await productAPI.getAll(currentWorkspace.id, { isGroup: true });
                setProductGroups(pgRes.data?.products || pgRes.data || []);
            } catch { /* Ürün yoksa sorun değil */ }
            // CaseTypes yükle
            try {
                const ctRes = await getCaseTypes(currentWorkspace.id);
                setAllCaseTypes(ctRes.data || []);
            } catch { /* CaseType yoksa sorun değil */ }
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
            const params = selectedBranchId !== 'ALL' ? { branchId: selectedBranchId } : undefined;
            const res = await funnelAPI.getStageCounts(currentWorkspace.id, params);
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

            // ── Bağlı Öğeleri Kaydet ──
            const wId = currentWorkspace.id;

            // CaseType bağlantıları: eklenenler funnelId = this funnel, kaldırılanlar funnelId = null
            for (const ctId of (funnelPanel._addedCaseTypeIds || [])) {
                try { await updateCaseType(wId, ctId, { funnelId: funnelPanel.id }); } catch (e) { console.error('CaseType link error:', e); }
            }
            for (const ctId of (funnelPanel._removedCaseTypeIds || [])) {
                try { await updateCaseType(wId, ctId, { funnelId: null }); } catch (e) { console.error('CaseType unlink error:', e); }
            }

            // Kategori bağlantıları: defaultFunnelId
            for (const catId of (funnelPanel._addedCategoryIds || [])) {
                try { await updateTopicCategory(wId, catId, { defaultFunnelId: funnelPanel.id }); } catch (e) { console.error('Category link error:', e); }
            }
            for (const catId of (funnelPanel._removedCategoryIds || [])) {
                try { await updateTopicCategory(wId, catId, { defaultFunnelId: null }); } catch (e) { console.error('Category unlink error:', e); }
            }

            // Ürün Grubu bağlantıları: funnelId
            for (const pgId of (funnelPanel._addedProductIds || [])) {
                try { await productAPI.update(wId, pgId, { funnelId: funnelPanel.id }); } catch (e) { console.error('Product link error:', e); }
            }
            for (const pgId of (funnelPanel._removedProductIds || [])) {
                try { await productAPI.update(wId, pgId, { funnelId: null }); } catch (e) { console.error('Product unlink error:', e); }
            }

            // Funnels listesini yeniden yükle (bağlı öğeler güncellendiği için)
            try {
                const refreshRes = await funnelAPI.getAll(wId);
                setFunnels(refreshRes.data.funnels || []);
            } catch {}

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
                transitionCriteria: stagePanel.transitionCriteria || null,
                collectFields: stagePanel.collectFields || null
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
        loadLinkedAutomations(stage.id);
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
    const getParentOptions = (editingId = funnelPanel?.id) => {
        const isDescendant = (parentId, checkId) => {
            const children = childrenMap[checkId] || [];
            for (const c of children) {
                if (c.id === parentId) return true;
                if (isDescendant(parentId, c.id)) return true;
            }
            return false;
        };
        return funnels.filter(f => {
            if (editingId && f.id === editingId) return false;
            if (editingId && isDescendant(f.id, editingId)) return false;
            return true;
        });
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
    const mainFunnel = funnels.find(f => f.funnelType === 'MAIN') || funnels.find(f => f.isDefault) || funnels[0];
    const childrenMap = {};
    funnels.forEach(f => {
        if (f.parentId) {
            if (!childrenMap[f.parentId]) childrenMap[f.parentId] = [];
            childrenMap[f.parentId].push(f);
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
            const res = await funnelAPI.update(currentWorkspace.id, draggedFunnelId, { parentId: targetParentId });
            if (res.data?.funnel) {
                setFunnels(prev => prev.map(f => f.id === draggedFunnelId ? { ...f, ...res.data.funnel } : f));
            }
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
                stageAutomationCounts={stageAutomationCounts}
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
                teams={teams}
                members={members}
                bots={bots}
                allFunnels={funnels}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
                        <Kanban size={22} />
                        {t('funnels.management')}
                    </h2>

                    {/* Akış yönetiminin başlığının yanında Sekmeler (Akışlar & Vaka Tipleri) */}
                    <div className="funnel-header-tabs">
                        <button
                            type="button"
                            className={`funnel-header-tab ${activeTab === 'funnels' ? 'active' : ''}`}
                            onClick={() => handleTabChange('funnels')}
                        >
                            <Kanban size={14} color={activeTab === 'funnels' ? '#2563eb' : '#64748b'} />
                            Akışlar
                        </button>
                        <button
                            type="button"
                            className={`funnel-header-tab ${activeTab === 'casetypes' ? 'active' : ''}`}
                            onClick={() => handleTabChange('casetypes')}
                        >
                            <Layers size={14} color={activeTab === 'casetypes' ? '#2563eb' : '#64748b'} />
                            Vaka Tipleri
                        </button>
                    </div>
                </div>

                {activeTab === 'funnels' && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>Şube:</span>
                            <select
                                value={selectedBranchId}
                                onChange={(e) => setSelectedBranchId(e.target.value)}
                                style={{
                                    padding: '6px 12px',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '6px',
                                    fontSize: '13px',
                                    color: '#334155',
                                    background: '#ffffff',
                                    outline: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="ALL">Tüm Şubeler</option>
                                {branches.map(branch => (
                                    <option key={branch.id} value={branch.id}>
                                        {branch.name} {!branch.isActive ? '(Pasif)' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <button className="btn-primary" onClick={() => setShowAddForm(prev => !prev)} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 16px', borderRadius: 8, fontSize: 14, fontWeight: 500 }}>
                            <Plus size={16} />
                            Yeni Akış
                        </button>
                    </div>
                )}
            </div>

            {activeTab === 'casetypes' ? (
                <CaseTypesAndTopics />
            ) : (
                <>

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
                                <option value="">Normal Akış (Bağımsız / Üst Akış Yok)</option>
                                {mainFunnel && (
                                    <option value={mainFunnel.id}>↳ {mainFunnel.name} (Ana Akış) Altında</option>
                                )}
                                {getParentOptions().filter(f => f.id !== mainFunnel?.id).map(f =>
                                    <option key={f.id} value={f.id}>↳ {f.name} altına</option>
                                )}
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
                [
                    ...(mainFunnel ? [mainFunnel] : []),
                    ...funnels.filter(f => !f.parentId && f.id !== mainFunnel?.id)
                ].map((rootFunnel, idx, arr) => renderFunnelTree(rootFunnel, 0, idx === arr.length - 1))
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

                            {/* Toplanacak Bilgiler (collectFields) */}
                            <div className="settings-section">
                                <div className="settings-section-title">📋 Toplanacak Bilgiler</div>
                                <p className="settings-hint">Bu aşamadayken bot'un müşteriden toplaması gereken bilgiler</p>
                                {(() => {
                                    const cfRaw = stagePanel.collectFields;
                                    let config;
                                    try { config = cfRaw ? (typeof cfRaw === 'string' ? JSON.parse(cfRaw) : cfRaw) : { fields: [], onComplete: 'advance_stage' }; } catch { config = { fields: [], onComplete: 'advance_stage' }; }
                                    const fields = config.fields || [];
                                    const updateConfig = (newConfig) => setStagePanel(p => ({ ...p, collectFields: JSON.stringify(newConfig) }));
                                    const PRESET_FIELDS = [
                                        { key: 'phone', label: 'Telefon', type: 'phone' },
                                        { key: 'name', label: 'İsim Soyisim', type: 'text' },
                                        { key: 'email', label: 'E-posta', type: 'email' },
                                        { key: 'company', label: 'Firma', type: 'text' },
                                        { key: 'budget', label: 'Bütçe', type: 'text' },
                                        { key: 'preferredCallTime', label: 'Aranma Zamanı', type: 'text' },
                                        { key: 'appointmentDate', label: 'Randevu Tarihi', type: 'date' },
                                        { key: 'orderNumber', label: 'Sipariş No', type: 'text' },
                                    ];
                                    const usedKeys = new Set(fields.map(f => f.key));
                                    const availablePresets = PRESET_FIELDS.filter(p => !usedKeys.has(p.key));
                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {fields.map((field, idx) => (
                                                <div key={field.key + idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                                    <span style={{ fontSize: 14, minWidth: 20 }}>
                                                        {field.key === 'phone' ? '📞' : field.key === 'name' ? '👤' : field.key === 'email' ? '📧' : field.key === 'company' ? '🏢' : field.key === 'budget' ? '💰' : field.key === 'preferredCallTime' ? '🕐' : field.key === 'appointmentDate' ? '📅' : field.key === 'orderNumber' ? '📦' : '✏️'}
                                                    </span>
                                                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{field.label}</span>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: field.required ? '#059669' : '#94a3b8', cursor: 'pointer' }}>
                                                        <input type="checkbox" checked={!!field.required} onChange={e => {
                                                            const newFields = [...fields]; newFields[idx] = { ...field, required: e.target.checked };
                                                            updateConfig({ ...config, fields: newFields });
                                                        }} style={{ width: 14, height: 14 }} />
                                                        Zorunlu
                                                    </label>
                                                    <button onClick={() => { updateConfig({ ...config, fields: fields.filter((_, i) => i !== idx) }); }}
                                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>×</button>
                                                </div>
                                            ))}
                                            {availablePresets.length > 0 && (
                                                <select
                                                    value="" onChange={e => {
                                                        const preset = PRESET_FIELDS.find(p => p.key === e.target.value);
                                                        if (preset) updateConfig({ ...config, fields: [...fields, { ...preset, required: false, prompt: '' }] });
                                                    }}
                                                    style={{ padding: '6px 8px', fontSize: 13, borderRadius: 6, border: '1px dashed #cbd5e1', color: '#64748b', background: '#fff', cursor: 'pointer' }}
                                                >
                                                    <option value="">+ Alan ekle...</option>
                                                    {availablePresets.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                                                    <option value="__custom">✏️ Özel alan...</option>
                                                </select>
                                            )}
                                            {fields.length > 0 && (
                                                <div className="settings-field" style={{ marginTop: 4 }}>
                                                    <label style={{ fontSize: 12 }}>Zorunlu alanlar dolunca:</label>
                                                    <select value={config.onComplete || 'advance_stage'}
                                                        onChange={e => updateConfig({ ...config, onComplete: e.target.value })}
                                                        style={{ padding: '4px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #e2e8f0' }}
                                                    >
                                                        <option value="advance_stage">🔄 Sonraki aşamaya geç</option>
                                                        <option value="notify_team">🔔 Takıma bildirim gönder</option>
                                                        <option value="mark_qualified">🔥 Sıcak lead olarak işaretle</option>
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
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
                            {/* 🔗 Bağlı Otomasyonlar */}
                            <div className="settings-section" style={{ background: '#f0f7ff', borderRadius: '10px', padding: '14px', margin: '8px 0' }}>
                                <div className="settings-section-title">🔗 Bağlı Otomasyonlar</div>
                                <p className="settings-hint" style={{ marginBottom: '10px' }}>Otomasyonlar sayfasından bu aşamaya bağlanan kurallar</p>
                                {linkedAutomationsLoading ? (
                                    <div style={{ textAlign: 'center', padding: '12px', color: '#9ca3af', fontSize: '0.8rem' }}>Yükleniyor...</div>
                                ) : linkedAutomations.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '12px', color: '#9ca3af', fontSize: '0.8rem' }}>
                                        Bu aşamaya bağlı otomasyon yok
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {linkedAutomations.map(rule => (
                                            <div key={rule.id} style={{
                                                padding: '10px 12px',
                                                background: '#fff',
                                                border: rule.isActive ? '1px solid #bbf7d0' : '1px solid #e5e7eb',
                                                borderRadius: '8px',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontWeight: 600, fontSize: '0.82rem', color: rule.isActive ? '#111827' : '#9ca3af' }}>
                                                            {rule.ruleType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                                                        </span>
                                                        <span style={{
                                                            fontSize: '0.6rem', fontWeight: 600, padding: '1px 6px', borderRadius: '6px',
                                                            background: rule.isActive ? '#dcfce7' : '#f3f4f6',
                                                            color: rule.isActive ? '#16a34a' : '#9ca3af'
                                                        }}>
                                                            {rule.isActive ? 'AKTİF' : 'PASİF'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <label className="toggle-switch" style={{ transform: 'scale(0.8)' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={rule.isActive}
                                                        onChange={async () => {
                                                            try {
                                                                await rulesAPI.upsert(currentWorkspace.id, rule.ruleType, {
                                                                    isActive: !rule.isActive,
                                                                    config: rule.config,
                                                                    linkedStageId: rule.linkedStageId
                                                                });
                                                                loadLinkedAutomations(stagePanel.id);
                                                            } catch (err) {
                                                                console.error('Toggle linked automation error:', err);
                                                            }
                                                        }}
                                                    />
                                                    <span className="toggle-slider" />
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                )}
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

                            {/* Çıkış Aksiyonları */}
                            <div className="settings-section">
                                <div className="settings-section-title">🚪 Çıkış Aksiyonları</div>
                                <p className="settings-hint">Bir kişi bu aşamadan ayrıldığında otomatik çalışır</p>
                                {(() => {
                                    const config = stagePanel.exitActions ? (typeof stagePanel.exitActions === 'string' ? JSON.parse(stagePanel.exitActions) : stagePanel.exitActions) : { actions: [] };
                                    const actions = config.actions || [];
                                    const updateExitAction = (idx, changes) => {
                                        const newActions = [...actions];
                                        newActions[idx] = { ...newActions[idx], ...changes };
                                        setStagePanel(p => ({ ...p, exitActions: JSON.stringify({ actions: newActions }) }));
                                    };
                                    return (
                                        <>
                                            {actions.map((a, i) => (
                                                <div key={i} className="automation-item channel-action">
                                                    <div className="action-row">
                                                        <select
                                                            value={a.type}
                                                            onChange={e => updateExitAction(i, { type: e.target.value })}
                                                        >
                                                            <optgroup label="⚙️ Genel">
                                                                <option value="CREATE_TASK">📋 Görev Oluştur</option>
                                                                <option value="ADD_TAG">🏷️ Etiket Ekle</option>
                                                                <option value="NOTIFY_TEAM">🔔 Takıma Bildir</option>
                                                            </optgroup>
                                                            <optgroup label="📱 WhatsApp">
                                                                <option value="WA_SEND_TEMPLATE">📱 Şablon Gönder</option>
                                                                <option value="WA_SEND_MESSAGE">💬 Mesaj Gönder</option>
                                                            </optgroup>
                                                        </select>
                                                        <button className="btn-icon" onClick={() => {
                                                            const newActions = actions.filter((_, idx) => idx !== i);
                                                            setStagePanel(p => ({ ...p, exitActions: JSON.stringify({ actions: newActions }) }));
                                                        }}><X size={12} /></button>
                                                    </div>
                                                    {a.type === 'WA_SEND_TEMPLATE' && (
                                                        <select className="action-param" value={a.templateId || ''} onChange={e => updateExitAction(i, { templateId: e.target.value })}>
                                                            <option value="">Şablon Seç...</option>
                                                            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                                        </select>
                                                    )}
                                                    {['WA_SEND_MESSAGE'].includes(a.type) && (
                                                        <textarea className="action-param" placeholder="Mesaj içeriği" rows={2} value={a.message || ''} onChange={e => updateExitAction(i, { message: e.target.value })} />
                                                    )}
                                                    {['CREATE_TASK', 'NOTIFY_TEAM'].includes(a.type) && (
                                                        <input className="action-param" placeholder={a.type === 'CREATE_TASK' ? 'Görev başlığı' : 'Bildirim içeriği'} value={a.title || ''} onChange={e => updateExitAction(i, { title: e.target.value })} />
                                                    )}
                                                    {a.type === 'ADD_TAG' && (
                                                        <input className="action-param" placeholder="Etiket adı" value={a.tagName || ''} onChange={e => updateExitAction(i, { tagName: e.target.value })} />
                                                    )}
                                                </div>
                                            ))}
                                            <button className="btn-add-sm" onClick={() => {
                                                const newActions = [...actions, { type: 'NOTIFY_TEAM', title: '' }];
                                                setStagePanel(p => ({ ...p, exitActions: JSON.stringify({ actions: newActions }) }));
                                            }}>+ Çıkış Aksiyonu Ekle</button>
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
                                            value={funnelPanel.parentId || ''}
                                            onChange={e => setFunnelPanel(p => ({ ...p, parentId: e.target.value }))}
                                        >
                                            <option value="">Normal Akış (Bağımsız / Üst Akış Yok)</option>
                                            {mainFunnel && funnelPanel.id !== mainFunnel.id && (
                                                <option value={mainFunnel.id}>↳ {mainFunnel.name} (Ana Akış) Altında</option>
                                            )}
                                            {getParentOptions(funnelPanel.id).filter(f => f.id !== mainFunnel?.id).map(f =>
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

                            {/* ═══════════════════════════════════════════════
                                BAĞLI ÖĞELER BÖLÜMÜ
                               ═══════════════════════════════════════════════ */}
                            <div className="settings-section">
                                <div className="settings-section-title" style={{display: 'flex', alignItems: 'center', gap: 6}}>
                                    🔗 Bağlı Öğeler
                                </div>

                                {/* Bağlı Vaka Tipleri */}
                                <div className="settings-field">
                                    <label style={{display: 'flex', alignItems: 'center', gap: 6}}>
                                        <Layers size={13} /> Bağlı Vaka Tipleri
                                    </label>
                                    <p className="settings-hint" style={{margin: '0 0 8px', fontSize: '0.75rem', color: '#64748b'}}>
                                        Bu akışa otomatik yönlendirilen vaka tipleri
                                    </p>
                                    <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px'}}>
                                        {(funnelPanel.caseTypes || []).map(ct => (
                                            <span key={ct.id} style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                padding: '3px 10px', borderRadius: '14px', fontSize: '0.78rem', fontWeight: 500,
                                                background: `${ct.color || '#3b82f6'}15`, color: ct.color || '#3b82f6',
                                                border: `1px solid ${ct.color || '#3b82f6'}40`
                                            }}>
                                                <span>{ct.icon || '📋'}</span> {ct.name}
                                                <button type="button" onClick={() => {
                                                    setFunnelPanel(p => ({ ...p, caseTypes: (p.caseTypes || []).filter(c => c.id !== ct.id), _removedCaseTypeIds: [...(p._removedCaseTypeIds || []), ct.id] }));
                                                }} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '0.9rem', padding: 0, marginLeft: 2}}>×</button>
                                            </span>
                                        ))}
                                        {/* Ekle dropdown */}
                                        {(() => {
                                            const linkedIds = (funnelPanel.caseTypes || []).map(c => c.id);
                                            const available = allCaseTypes.filter(ct => !linkedIds.includes(ct.id));
                                            if (available.length === 0) return null;
                                            return (
                                                <select
                                                    value=""
                                                    onChange={e => {
                                                        const ct = allCaseTypes.find(c => c.id === e.target.value);
                                                        if (ct) setFunnelPanel(p => ({ ...p, caseTypes: [...(p.caseTypes || []), ct], _addedCaseTypeIds: [...(p._addedCaseTypeIds || []), ct.id] }));
                                                    }}
                                                    style={{ padding: '3px 8px', borderRadius: '14px', fontSize: '0.78rem', border: '1px dashed #cbd5e1', background: '#fff', color: '#64748b', cursor: 'pointer' }}
                                                >
                                                    <option value="">+ Vaka Tipi Ekle</option>
                                                    {available.map(ct => (
                                                        <option key={ct.id} value={ct.id}>{ct.icon || '📋'} {ct.name}</option>
                                                    ))}
                                                </select>
                                            );
                                        })()}
                                        {(funnelPanel.caseTypes || []).length === 0 && allCaseTypes.length === 0 && (
                                            <span style={{color: '#94a3b8', fontSize: '0.78rem', fontStyle: 'italic'}}>Henüz vaka tipi tanımlanmamış</span>
                                        )}
                                    </div>
                                </div>

                                {/* Bağlı Kategoriler */}
                                <div className="settings-field">
                                    <label style={{display: 'flex', alignItems: 'center', gap: 6}}>
                                        📋 Bağlı Kategoriler
                                    </label>
                                    <p className="settings-hint" style={{margin: '0 0 8px', fontSize: '0.75rem', color: '#64748b'}}>
                                        Varsayılan akışı bu akış olan kategoriler
                                    </p>
                                    <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px'}}>
                                        {(funnelPanel.categories || []).map(cat => (
                                            <span key={cat.id} style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                padding: '3px 10px', borderRadius: '14px', fontSize: '0.78rem', fontWeight: 500,
                                                background: `${cat.color || '#6b7280'}15`, color: cat.color || '#6b7280',
                                                border: `1px solid ${cat.color || '#6b7280'}40`
                                            }}>
                                                <span>{cat.icon || '📋'}</span> {cat.name}
                                                <button type="button" onClick={() => {
                                                    setFunnelPanel(p => ({ ...p, categories: (p.categories || []).filter(c => c.id !== cat.id), _removedCategoryIds: [...(p._removedCategoryIds || []), cat.id] }));
                                                }} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '0.9rem', padding: 0, marginLeft: 2}}>×</button>
                                            </span>
                                        ))}
                                        {(() => {
                                            const linkedIds = (funnelPanel.categories || []).map(c => c.id);
                                            const available = topicCategories.filter(cat => !linkedIds.includes(cat.id));
                                            if (available.length === 0) return null;
                                            return (
                                                <select
                                                    value=""
                                                    onChange={e => {
                                                        const cat = topicCategories.find(c => c.id === e.target.value);
                                                        if (cat) setFunnelPanel(p => ({ ...p, categories: [...(p.categories || []), cat], _addedCategoryIds: [...(p._addedCategoryIds || []), cat.id] }));
                                                    }}
                                                    style={{ padding: '3px 8px', borderRadius: '14px', fontSize: '0.78rem', border: '1px dashed #cbd5e1', background: '#fff', color: '#64748b', cursor: 'pointer' }}
                                                >
                                                    <option value="">+ Kategori Ekle</option>
                                                    {available.map(cat => (
                                                        <option key={cat.id} value={cat.id}>{cat.icon || '📋'} {cat.name}</option>
                                                    ))}
                                                </select>
                                            );
                                        })()}
                                        {(funnelPanel.categories || []).length === 0 && topicCategories.length === 0 && (
                                            <span style={{color: '#94a3b8', fontSize: '0.78rem', fontStyle: 'italic'}}>Henüz kategori tanımlanmamış</span>
                                        )}
                                    </div>
                                </div>

                                {/* Bağlı Ürün Grupları */}
                                <div className="settings-field">
                                    <label style={{display: 'flex', alignItems: 'center', gap: 6}}>
                                        <Package size={13} /> Bağlı Ürün / Hizmet Grupları
                                    </label>
                                    <p className="settings-hint" style={{margin: '0 0 8px', fontSize: '0.75rem', color: '#64748b'}}>
                                        Bu akışa bağlı ürün ve hizmet grupları
                                    </p>
                                    <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px'}}>
                                        {(funnelPanel.products || []).map(pg => (
                                            <span key={pg.id} style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                padding: '3px 10px', borderRadius: '14px', fontSize: '0.78rem', fontWeight: 500,
                                                background: '#f0fdf4', color: '#166534',
                                                border: '1px solid #bbf7d0'
                                            }}>
                                                📦 {pg.name}
                                                <button type="button" onClick={() => {
                                                    setFunnelPanel(p => ({ ...p, products: (p.products || []).filter(pr => pr.id !== pg.id), _removedProductIds: [...(p._removedProductIds || []), pg.id] }));
                                                }} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '0.9rem', padding: 0, marginLeft: 2}}>×</button>
                                            </span>
                                        ))}
                                        {(() => {
                                            const linkedIds = (funnelPanel.products || []).map(p => p.id);
                                            const available = productGroups.filter(pg => !linkedIds.includes(pg.id));
                                            if (available.length === 0) return null;
                                            return (
                                                <select
                                                    value=""
                                                    onChange={e => {
                                                        const pg = productGroups.find(p => p.id === e.target.value);
                                                        if (pg) setFunnelPanel(p => ({ ...p, products: [...(p.products || []), pg], _addedProductIds: [...(p._addedProductIds || []), pg.id] }));
                                                    }}
                                                    style={{ padding: '3px 8px', borderRadius: '14px', fontSize: '0.78rem', border: '1px dashed #cbd5e1', background: '#fff', color: '#64748b', cursor: 'pointer' }}
                                                >
                                                    <option value="">+ Ürün Grubu Ekle</option>
                                                    {available.map(pg => (
                                                        <option key={pg.id} value={pg.id}>📦 {pg.name}</option>
                                                    ))}
                                                </select>
                                            );
                                        })()}
                                        {(funnelPanel.products || []).length === 0 && productGroups.length === 0 && (
                                            <span style={{color: '#94a3b8', fontSize: '0.78rem', fontStyle: 'italic'}}>Henüz ürün grubu tanımlanmamış</span>
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
                </>
            )}
        </div>
    );
};

export default Funnels;
