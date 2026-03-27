import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { funnelAPI } from '../../services/api';
import { Plus, Trash2, Edit2, Check, X, Loader, Kanban, ChevronDown, ChevronRight, Circle } from 'lucide-react';
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

    // Stage state
    const [expandedFunnel, setExpandedFunnel] = useState(null);
    const [newStageName, setNewStageName] = useState('');
    const [newStageColor, setNewStageColor] = useState(STAGE_COLORS[0]);
    const [stageSaving, setStageSaving] = useState(false);

    useEffect(() => {
        if (currentWorkspace) loadFunnels();
    }, [currentWorkspace]);

    const loadFunnels = async () => {
        try {
            setLoading(true);
            const res = await funnelAPI.getAll(currentWorkspace.id);
            setFunnels(res.data.funnels || []);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    // Auto-assign next color in cycle
    const nextColor = () => AUTO_COLORS[funnels.length % AUTO_COLORS.length];

    const handleCreate = async () => {
        if (!newName.trim()) return;
        setSaving(true);
        try {
            const res = await funnelAPI.create(currentWorkspace.id, { name: newName.trim(), color: nextColor() });
            setFunnels(prev => [...prev, res.data.funnel]);
            setNewName('');
        } catch (err) { console.error(err); }
        finally { setSaving(false); }
    };

    const handleUpdate = async () => {
        if (!editingFunnel?.name?.trim()) return;
        setSaving(true);
        try {
            const res = await funnelAPI.update(currentWorkspace.id, editingFunnel.id, { name: editingFunnel.name, color: editingFunnel.color });
            setFunnels(prev => prev.map(f => f.id === editingFunnel.id ? res.data.funnel : f));
            setEditingFunnel(null);
        } catch (err) { console.error(err); }
        finally { setSaving(false); }
    };

    const handleDelete = async (id) => {
        if (!confirm('Bu funnel silinecek. Emin misiniz?')) return;
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
    };

    // ── Stage handlers ──
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

    return (
        <div className="funnels-page">
            <div className="funnels-header">
                <div className="funnels-header-icon"><Kanban size={22} /></div>
                <div>
                    <h1>{t('funnels.management')}</h1>
                    <p>{t('funnels.description')}</p>
                </div>
            </div>

            {/* Create form */}
            <div className="funnels-create-card">
                <h2>New Funnel Add</h2>
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
            </div>

            {/* List */}
            <div className="funnels-list-card">
                {loading ? (
                    <div className="funnels-empty">Loading...</div>
                ) : funnels.length === 0 ? (
                    <div className="funnels-empty">
                        <Kanban size={40} />
                        <p>{t('funnels.empty')}</p>
                    </div>
                ) : (
                    funnels.map(funnel => {
                        const isExpanded = expandedFunnel === funnel.id;
                        const stages = funnel.stages || [];
                        return (
                            <div key={funnel.id} className={`funnels-funnel-block${isExpanded ? ' funnels-funnel-block--open' : ''}`}>
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
                                            <button className="funnels-btn-sm funnels-btn-save" onClick={handleUpdate} disabled={saving}>
                                                <Check size={13} /> Kaydet
                                            </button>
                                            <button className="funnels-btn-sm funnels-btn-cancel" onClick={() => setEditingFunnel(null)}>
                                                <X size={13} /> İptal
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <span className="funnels-name">{funnel.name}</span>
                                            <span className="funnels-stage-count">{stages.length} durum</span>
                                            <button className="funnels-icon-btn" onClick={() => setEditingFunnel({ id: funnel.id, name: funnel.name, color: funnel.color })} title={t('common.edit')}>
                                                <Edit2 size={15} />
                                            </button>
                                            <button className="funnels-icon-btn funnels-icon-btn-danger" onClick={() => handleDelete(funnel.id)} title={t('common.delete')}>
                                                <Trash2 size={15} />
                                            </button>
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
                                                {stages.map(stage => (
                                                    <div key={stage.id} className="funnels-stage-row">
                                                        <span className="funnels-stage-dot" style={{ background: stage.color }} />
                                                        <span className="funnels-stage-name">{stage.name}</span>
                                                        <button
                                                            className="funnels-icon-btn funnels-icon-btn-danger funnels-stage-del"
                                                            onClick={() => handleDeleteStage(funnel.id, stage.id)}
                                                            title={t('common.delete')}
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                ))}
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
                )}
            </div>
        </div>
    );
};

export default Funnels;
