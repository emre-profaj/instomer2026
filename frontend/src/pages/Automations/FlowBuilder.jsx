import { useTranslation } from 'react-i18next';
import React, { useState, useEffect, useCallback } from 'react';
import {
    Plus, Trash2, Settings, ChevronDown, ChevronUp,
    Zap, MessageSquare, Phone, User, Clock, GitBranch,
    Play, Save, X, CheckCircle, Eye, MailCheck,
    AlarmClock, Tag, Bell, ArrowDown, Edit2
} from 'lucide-react';
import { flowAPI, automationAPI } from '../../services/api';
import './FlowBuilder.css';

// ─── Step type definitions ─────────────────────────────────────────────────
const STEP_TYPES = {
    // Triggers
    NEW_FORM:       { group: 'trigger', label: 'Yeni Form Kaydı',        icon: '📋', color: '#3b82f6', borderColor: '#3b82f6' },
    FIRST_MSG:      { group: 'trigger', label: 'Gelen İlk Mesaj',        icon: '💬', color: '#3b82f6', borderColor: '#3b82f6' },
    TAG_ADDED:      { group: 'trigger', label: 'Etiket Eklendi',         icon: '🏷️', color: '#3b82f6', borderColor: '#3b82f6' },
    HAS_PHONE:      { group: 'trigger', label: 'Numara Bıraktıysa',      icon: '📞', color: '#3b82f6', borderColor: '#3b82f6' },
    NO_REPLY:       { group: 'trigger', label: 'Yanıt Vermedi (Süre)',   icon: '⏰', color: '#3b82f6', borderColor: '#3b82f6' },
    STAGE_CHANGED:  { group: 'trigger', label: 'Aşama Değiştiğinde',     icon: '🔀', color: '#3b82f6', borderColor: '#3b82f6' },
    // Actions
    WA_SEND:        { group: 'action',  label: 'WhatsApp Gönder',        icon: '💬', color: '#10b981', borderColor: '#10b981' },
    AI_CALL:        { group: 'action',  label: 'AI Araması Başlat',      icon: '🤖', color: '#10b981', borderColor: '#10b981' },
    RETRY_CALL:     { group: 'action',  label: 'Hatırlatma Araması',     icon: '🔁', color: '#10b981', borderColor: '#10b981' },
    ASSIGN_AGENT:   { group: 'action',  label: 'Temsilci Ata',           icon: '👤', color: '#10b981', borderColor: '#10b981' },
    ASSIGN_TEAM:    { group: 'action',  label: 'Ekibe Ata',              icon: '👥', color: '#10b981', borderColor: '#10b981' },
    CONVERT_TO_OPP: { group: 'action',  label: 'Fırsata Çevir',          icon: '🎯', color: '#10b981', borderColor: '#10b981' },

    // Logic
    WAIT:           { group: 'logic',   label: 'Bekleme Süresi',         icon: '⏱️', color: '#f59e0b', borderColor: '#f59e0b' },
    CONDITION:      { group: 'logic',   label: 'Koşul (Eğer)',           icon: '⑂',  color: '#ec4899', borderColor: '#ec4899' },
};

const PALETTE = {
    'TETİKLEYİCİLER': ['NEW_FORM', 'FIRST_MSG', 'HAS_PHONE', 'NO_REPLY', 'STAGE_CHANGED', 'TAG_ADDED'],
    'AKSİYONLAR':     ['WA_SEND', 'AI_CALL', 'RETRY_CALL', 'ASSIGN_AGENT', 'ASSIGN_TEAM', 'CONVERT_TO_OPP'],
    'MANTIK & KONTROL': ['WAIT', 'CONDITION'],
};

const CONDITION_OPTIONS = [
    { value: 'MSG_READ',       label: 'Mesaj Görüldü mü?' },
    { value: 'MSG_REPLIED',    label: 'Mesaj Yanıtlandı mı?' },
    { value: 'MSG_CONTAINS',   label: 'Mesaj şu kelimeleri içeriyorsa' },
    { value: 'HAS_TAG',        label: 'Etiket var mı?' },
    { value: 'IS_LEAD',        label: 'Lead mi?' },
    { value: 'HAS_PHONE',      label: 'Telefon numarası var mı?' },
    { value: 'IS_OPPORTUNITY', label: 'Fırsat aşamasında mı?' },
    { value: 'CALL_UNANSWERED',label: 'Arama açılmadı mı?' },
];

function makeStep(type) {
    const base = { id: Date.now() + Math.random(), type, config: {} };
    if (type === 'WAIT')           base.config = { amount: 5, unit: 'dakika' };
    if (type === 'CONDITION')      base.config = { condition: 'MSG_READ', keywords: '', matchMode: 'any', yesBranch: [], noBranch: [] };
    if (type === 'WA_SEND')        base.config = { templateName: '' };
    if (type === 'ASSIGN_AGENT')   base.config = { agentName: '' };
    if (type === 'ASSIGN_TEAM')    base.config = { teamName: '' };
    if (type === 'NO_REPLY')       base.config = { amount: 1, unit: 'saat' };
    if (type === 'STAGE_CHANGED')  base.config = { fromStage: '', toStage: '' };
    if (type === 'RETRY_CALL')     base.config = { maxRetries: 3, waitAmount: 1, waitUnit: 'saat' };
    if (type === 'CONVERT_TO_OPP') base.config = { targetStage: '' };
    return base;
}

// API-based persistence (no longer uses localStorage)

// ─── Step Card ──────────────────────────────────────────────────────────────
function StepCard({ step, isSelected, onClick, onDelete, branchKey, depth = 0 }) {
    const { t } = useTranslation();
    const def = STEP_TYPES[step.type];
    const groupLabel = def.group === 'trigger' ? 'TETİKLEYİCİ' : def.group === 'action' ? 'AKSİYON' : 'KOŞUL';

    return (
        <div
            className={`fb-step-card fb-step-${def.group} ${isSelected ? 'fb-step-selected' : ''}`}
            style={{ borderColor: def.borderColor }}
            onClick={(e) => { e.stopPropagation(); onClick(step.id, branchKey); }}
        >
            {def.group !== 'logic' && (
                <div className="fb-step-badge" style={{ background: def.borderColor }}>
                    {groupLabel}
                </div>
            )}
            {def.group === 'logic' && step.type === 'WAIT' && (
                <div className="fb-step-badge fb-badge-wait">BEKLE</div>
            )}
            {def.group === 'logic' && step.type === 'CONDITION' && (
                <div className="fb-step-badge fb-badge-condition">{t('flowBuilder.condition')}</div>
            )}
            <div className="fb-step-body">
                <span className="fb-step-icon">{def.icon}</span>
                <div className="fb-step-info">
                    <div className="fb-step-type-label">
                        {step.type === 'WAIT'           ? 'BEKLE' :
                         step.type === 'WA_SEND'        ? 'WHATSAPP' :
                         step.type === 'AI_CALL'        ? 'AI ARAMA' :
                         step.type === 'RETRY_CALL'     ? 'TEKRAR ARA' :
                         step.type === 'ASSIGN_AGENT'   ? 'ATAMA' :
                         step.type === 'ASSIGN_TEAM'    ? 'EKİP ATAMA' :
                         step.type === 'CONVERT_TO_OPP' ? 'DÖNÜŞTÜR' :
                         step.type === 'CONDITION'      ? 'KOŞUL' : 'OLAY'}
                    </div>
                    <div className="fb-step-name">
                        {step.type === 'WAIT'
                            ? `${step.config.amount || 5} ${step.config.unit || 'dakika'}`
                            : step.type === 'NO_REPLY'
                            ? `${step.config.amount || 1} ${step.config.unit || 'saat'} yanıt yok`
                            : step.type === 'RETRY_CALL'
                            ? `Max ${step.config.maxRetries || 3} tekrar, ${step.config.waitAmount || 1} ${step.config.waitUnit || 'saat'} ara`
                            : step.type === 'CONDITION'
                            ? (step.config.condition === 'MSG_CONTAINS' && step.config.keywords
                                ? `İçeriyorsa: ${step.config.keywords.split(',').slice(0,2).map(k=>k.trim()).join(', ')}${step.config.keywords.split(',').length > 2 ? '…' : ''}`
                                : CONDITION_OPTIONS.find(o => o.value === step.config.condition)?.label || 'Koşul seçin')
                            : step.type === 'STAGE_CHANGED'
                            ? `${step.config.fromStage || 'Herhangi'} → ${step.config.toStage || 'Herhangi'}`
                            : step.type === 'ASSIGN_TEAM'
                            ? (step.config.teamName || 'Ekip seçin')
                            : step.type === 'CONVERT_TO_OPP'
                            ? (step.config.targetStage || 'Fırsata Çevir')
                            : step.config.templateName || step.config.agentName || STEP_TYPES[step.type]?.label}
                    </div>
                    {step.config.detail && (
                        <div className="fb-step-detail">{step.config.detail}</div>
                    )}
                </div>
            </div>
            <button
                className="fb-step-delete"
                onClick={(e) => { e.stopPropagation(); onDelete(step.id, branchKey); }}
                title="Adımı Sil"
            >
                <X size={12} />
            </button>
        </div>
    );
}

// ─── Branch block ────────────────────────────────────────────────────────────
function BranchBlock({ steps, branchKey, onAdd, selectedId, onSelect, onDelete, label, color }) {
    return (
        <div className={`fb-branch fb-branch-${branchKey}`}>
            <div className="fb-branch-label" style={{ color, borderColor: color }}>
                {label}
            </div>
            <div className="fb-branch-steps">
                {steps.map(s => (
                    <React.Fragment key={s.id}>
                        <StepCard
                            step={s}
                            isSelected={selectedId === s.id}
                            onClick={onSelect}
                            onDelete={onDelete}
                            branchKey={branchKey}
                        />
                        <div className="fb-connector"><ArrowDown size={16} color="#9ca3af" /></div>
                    </React.Fragment>
                ))}
                <button
                    className="fb-add-branch-step"
                    style={{ borderColor: color, color }}
                    onClick={() => onAdd(branchKey)}
                    title={`${label} dalına adım ekle`}
                >
                    <Plus size={14} /> Adım Ekle
                </button>
            </div>
        </div>
    );
}

// ─── Step Settings Panel ────────────────────────────────────────────────────
function SettingsPanel({ step, onChange, onClose, templates = [] }) {
    const { t } = useTranslation();
    if (!step) return (
        <div className="fb-settings-empty">
            <Settings size={32} color="#d1d5db" />
            <p>{t('flowBuilder.clickStep')}</p>
        </div>
    );

    const def = STEP_TYPES[step.type];

    return (
        <div className="fb-settings-body">
            <div className="fb-settings-title">
                <span>{def.icon}</span>
                <h3>{def.label}</h3>
                <button className="fb-settings-close" onClick={onClose}><X size={16} /></button>
            </div>

            {/* WAIT */}
            {step.type === 'WAIT' && (
                <div className="fb-field-group">
                    <label>{t('flowBuilder.duration')}</label>
                    <div className="fb-row">
                        <input
                            type="number" min={1} value={step.config.amount || 5}
                            onChange={e => onChange({ ...step.config, amount: Number(e.target.value) })}
                        />
                        <select
                            value={step.config.unit || 'dakika'}
                            onChange={e => onChange({ ...step.config, unit: e.target.value })}
                        >
                            <option value="saniye">Saniye</option>
                            <option value="dakika">Dakika</option>
                            <option value="saat">Saat</option>
                            <option value="gün">{t("flowBuilder.days")}</option>
                        </select>
                    </div>
                </div>
            )}

            {/* NO_REPLY */}
            {step.type === 'NO_REPLY' && (
                <div className="fb-field-group">
                    <label>{t('flowBuilder.waitTime')}</label>
                    <div className="fb-row">
                        <input
                            type="number" min={1} value={step.config.amount || 1}
                            onChange={e => onChange({ ...step.config, amount: Number(e.target.value) })}
                        />
                        <select
                            value={step.config.unit || 'saat'}
                            onChange={e => onChange({ ...step.config, unit: e.target.value })}
                        >
                            <option value="dakika">Dakika</option>
                            <option value="saat">Saat</option>
                            <option value="gün">{t("flowBuilder.days")}</option>
                        </select>
                    </div>
                    <p className="fb-hint">Kişi bu süre boyunca yanıt vermezse akış devam eder.</p>
                </div>
            )}

            {/* STAGE_CHANGED */}
            {step.type === 'STAGE_CHANGED' && (
                <>
                    <div className="fb-field-group">
                        <label>Kaynak Aşama (boş = herhangi)</label>
                        <input
                            type="text"
                            placeholder="örn: Gelen Talepler"
                            value={step.config.fromStage || ''}
                            onChange={e => onChange({ ...step.config, fromStage: e.target.value })}
                        />
                    </div>
                    <div className="fb-field-group">
                        <label>Hedef Aşama</label>
                        <input
                            type="text"
                            placeholder="örn: Fırsat"
                            value={step.config.toStage || ''}
                            onChange={e => onChange({ ...step.config, toStage: e.target.value })}
                        />
                    </div>
                    <p className="fb-hint">Kişi belirtilen aşamaya geçtiğinde bu akış tetiklenir.</p>
                </>
            )}

            {/* CONDITION */}
            {step.type === 'CONDITION' && (
                <div className="fb-field-group">
                    <label>Koşul</label>
                    <select
                        value={step.config.condition || 'MSG_READ'}
                        onChange={e => onChange({ ...step.config, condition: e.target.value, keywords: '', matchMode: 'any' })}
                    >
                        {CONDITION_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>

                    {/* Keyword input – only for MSG_CONTAINS */}
                    {step.config.condition === 'MSG_CONTAINS' && (
                        <>
                            <div style={{ marginTop: 12 }}>
                                <label>Aranacak Kelimeler</label>
                                <textarea
                                    rows={3}
                                    placeholder="fiyat, fatura, teklif"
                                    value={step.config.keywords || ''}
                                    onChange={e => onChange({ ...step.config, keywords: e.target.value })}
                                    style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, resize: 'vertical', marginTop: 4 }}
                                />
                                <p className="fb-hint">Virgülle ayırarak birden fazla kelime girin.</p>
                            </div>
                            <div style={{ marginTop: 8 }}>
                                <label>Eşleşme Modu</label>
                                <select
                                    value={step.config.matchMode || 'any'}
                                    onChange={e => onChange({ ...step.config, matchMode: e.target.value })}
                                    style={{ width: '100%', marginTop: 4 }}
                                >
                                    <option value="any">Herhangi biri varsa (VEYA)</option>
                                    <option value="all">Hepsi varsa (VE)</option>
                                </select>
                            </div>
                        </>
                    )}

                    <p className="fb-hint" style={{ marginTop: 8 }}>Koşul sağlanırsa EVET dalı, sağlanmazsa HAYIR dalı çalışır.</p>
                </div>
            )}

            {/* WA_SEND */}
            {step.type === 'WA_SEND' && (
                <>
                    <div className="fb-field-group">
                        <label>Gönderilecek Şablon</label>
                        <select
                            value={step.config.templateName || ''}
                            onChange={e => onChange({ ...step.config, templateName: e.target.value })}
                        >
                            <option value="">Şablon seçin...</option>
                            {templates.map(t => (
                                <option key={t.id} value={t.name}>
                                    {t.name} {t.status === 'APPROVED' ? '✅' : t.status === 'PENDING' ? '⏳' : ''}
                                </option>
                            ))}
                        </select>
                        {templates.length === 0 && (
                            <p className="fb-hint">Henüz şablon bulunamadı. Otomasyonlar → Şablonlar sekmesinden ekleyin.</p>
                        )}
                    </div>
                    <div className="fb-field-group">
                        <label>Açıklama (isteğe bağlı)</label>
                        <input
                            type="text"
                            placeholder="Katalog Gönder"
                            value={step.config.detail || ''}
                            onChange={e => onChange({ ...step.config, detail: e.target.value })}
                        />
                    </div>
                </>
            )}

            {/* AI_CALL */}
            {step.type === 'AI_CALL' && (
                <div className="fb-field-group">
                    <label>Açıklama (isteğe bağlı)</label>
                    <input
                        type="text"
                        placeholder="Geri Dönüş Ara"
                        value={step.config.detail || ''}
                        onChange={e => onChange({ ...step.config, detail: e.target.value })}
                    />
                </div>
            )}

            {/* RETRY_CALL */}
            {step.type === 'RETRY_CALL' && (
                <>
                    <div className="fb-field-group">
                        <label>Maksimum Tekrar Sayısı</label>
                        <input
                            type="number" min={1} max={10}
                            value={step.config.maxRetries || 3}
                            onChange={e => onChange({ ...step.config, maxRetries: Number(e.target.value) })}
                        />
                    </div>
                    <div className="fb-field-group">
                        <label>Tekrarlar Arası Bekleme</label>
                        <div className="fb-row">
                            <input
                                type="number" min={1}
                                value={step.config.waitAmount || 1}
                                onChange={e => onChange({ ...step.config, waitAmount: Number(e.target.value) })}
                            />
                            <select
                                value={step.config.waitUnit || 'saat'}
                                onChange={e => onChange({ ...step.config, waitUnit: e.target.value })}
                            >
                                <option value="dakika">Dakika</option>
                                <option value="saat">Saat</option>
                                <option value="gün">{t("flowBuilder.days")}</option>
                            </select>
                        </div>
                    </div>
                    <p className="fb-hint">Arama açılmadıysa belirlenen süre sonra tekrar aranır. Maksimum tekrar sayısına ulaşıldığında durur.</p>
                </>
            )}

            {/* ASSIGN_AGENT */}
            {step.type === 'ASSIGN_AGENT' && (
                <div className="fb-field-group">
                    <label>Agent Adı</label>
                    <input
                        type="text"
                        placeholder="örn: Ahmet Yılmaz"
                        value={step.config.agentName || ''}
                        onChange={e => onChange({ ...step.config, agentName: e.target.value })}
                    />
                </div>
            )}

            {/* ASSIGN_TEAM */}
            {step.type === 'ASSIGN_TEAM' && (
                <div className="fb-field-group">
                    <label>Ekip / Takım Adı</label>
                    <input
                        type="text"
                        placeholder="örn: Saha Satış"
                        value={step.config.teamName || ''}
                        onChange={e => onChange({ ...step.config, teamName: e.target.value })}
                    />
                    <p className="fb-hint">Fırsat aşamasına geçen kişiler bu ekibe atanır.</p>
                </div>
            )}

            {/* CONVERT_TO_OPP */}
            {step.type === 'CONVERT_TO_OPP' && (
                <div className="fb-field-group">
                    <label>Hedef Funnel Aşaması</label>
                    <input
                        type="text"
                        placeholder="örn: Fırsat / Yeni Teklif"
                        value={step.config.targetStage || ''}
                        onChange={e => onChange({ ...step.config, targetStage: e.target.value })}
                    />
                    <p className="fb-hint">Kişinin yazışması bu aşamaya taşınır ve fırsat olarak işaretlenir.</p>
                </div>
            )}



            {/* Triggers have no extra settings */}
            {['NEW_FORM', 'FIRST_MSG', 'TAG_ADDED', 'HAS_PHONE'].includes(step.type) && (
                <p className="fb-hint" style={{ marginTop: 12 }}>
                    Bu adım akışın tetikleyicisidir. Ek ayar gerektirmez.
                </p>
            )}
        </div>
    );
}

// ─── Main FlowBuilder ────────────────────────────────────────────────────────
export default function FlowBuilder({ workspaceId }) {
    const { t } = useTranslation();
    const [flows, setFlows] = useState([]);
    const [currentFlow, setCurrentFlow] = useState(null);   // { id, name, steps[], isActive }
    const [showNewFlow, setShowNewFlow] = useState(false);
    const [newFlowName, setNewFlowName] = useState('');
    const [selectedStepId, setSelectedStepId] = useState(null);
    const [selectedBranch, setSelectedBranch] = useState(null); // 'main' | 'yes' | 'no'
    const [expandedGroups, setExpandedGroups] = useState({ 'TEKLEYİCİLER': true, 'AKSİYONLAR': true, 'MANTIK & KONTROL': true });
    const [savedMsg, setSavedMsg] = useState(false);
    const [loading, setLoading] = useState(false);
    const [templates, setTemplates] = useState([]);

    // Load flows from API
    useEffect(() => {
        if (!workspaceId) return;
        setLoading(true);
        flowAPI.getAll(workspaceId)
            .then(res => setFlows(res.data.flows || []))
            .catch(err => console.error('Failed to load flows:', err))
            .finally(() => setLoading(false));

        // Load WhatsApp templates for WA_SEND step
        automationAPI.getTemplates(workspaceId)
            .then(res => setTemplates(res.data.templates || []))
            .catch(() => {});
    }, [workspaceId]);

    // Get the selected step object from main or branch
    const getSelectedStep = () => {
        if (!currentFlow || !selectedStepId) return null;
        for (const s of currentFlow.steps) {
            if (s.id === selectedStepId) return s;
            if (s.type === 'CONDITION') {
                const y = (s.config.yesBranch || []).find(b => b.id === selectedStepId);
                if (y) return y;
                const n = (s.config.noBranch || []).find(b => b.id === selectedStepId);
                if (n) return n;
            }
        }
        return null;
    };

    const updateStepConfig = (newConfig) => {
        if (!currentFlow || !selectedStepId) return;
        const updateInArray = (arr) => arr.map(s => {
            if (s.id === selectedStepId) return { ...s, config: newConfig };
            if (s.type === 'CONDITION') {
                return {
                    ...s,
                    config: {
                        ...s.config,
                        yesBranch: (s.config.yesBranch || []).map(b => b.id === selectedStepId ? { ...b, config: newConfig } : b),
                        noBranch: (s.config.noBranch || []).map(b => b.id === selectedStepId ? { ...b, config: newConfig } : b),
                    }
                };
            }
            return s;
        });
        setCurrentFlow(f => ({ ...f, steps: updateInArray(f.steps) }));
    };

    // Add step from palette
    const addStep = useCallback((type, branchKey = 'main', conditionStepId = null) => {
        const newStep = makeStep(type);

        setCurrentFlow(f => {
            if (!f) return f;
            if (branchKey === 'main') {
                // Trigger can only be first; don't allow 2 triggers
                if (STEP_TYPES[type].group === 'trigger' && f.steps.some(s => STEP_TYPES[s.type].group === 'trigger')) {
                    alert('Bir akışta yalnızca bir tetikleyici olabilir.');
                    return f;
                }
                return { ...f, steps: [...f.steps, newStep] };
            }
            // Add to branch
            return {
                ...f,
                steps: f.steps.map(s => {
                    if (s.id !== conditionStepId) return s;
                    const key = branchKey === 'yes' ? 'yesBranch' : 'noBranch';
                    return { ...s, config: { ...s.config, [key]: [...(s.config[key] || []), newStep] } };
                })
            };
        });
        setSelectedStepId(newStep.id);
        setSelectedBranch(branchKey);
    }, []);

    // Add step from left palette (always to main)
    const handlePaletteClick = (type) => {
        if (!currentFlow) { alert('Önce bir akış oluşturun.'); return; }
        addStep(type, 'main');
    };

    const [branchPickerOpen, setBranchPickerOpen] = useState(null); // { branchKey, conditionStepId }

    // Open branch step picker
    const openBranchPicker = (branchKey, conditionStepId) => {
        setBranchPickerOpen({ branchKey, conditionStepId });
    };

    // Add step to branch from inline picker
    const addBranchStepFromPicker = (type) => {
        if (!branchPickerOpen) return;
        addStep(type, branchPickerOpen.branchKey, branchPickerOpen.conditionStepId);
        setBranchPickerOpen(null);
    };

    // Add step to branch from inside canvas (used by BranchBlock via addBranchStep)
    const addBranchStep = (branchKey, conditionStepId) => {
        openBranchPicker(branchKey, conditionStepId);
    };

    // Delete step
    const deleteStep = (stepId, branchKey, conditionStepId) => {
        setCurrentFlow(f => {
            if (!f) return f;
            if (!branchKey || branchKey === 'main') {
                return { ...f, steps: f.steps.filter(s => s.id !== stepId) };
            }
            return {
                ...f,
                steps: f.steps.map(s => {
                    if (s.id !== conditionStepId) return s;
                    const key = branchKey === 'yes' ? 'yesBranch' : 'noBranch';
                    return { ...s, config: { ...s.config, [key]: (s.config[key] || []).filter(b => b.id !== stepId) } };
                })
            };
        });
        if (selectedStepId === stepId) setSelectedStepId(null);
    };

    const deleteMainStep = (stepId) => deleteStep(stepId, 'main');

    // Save to API
    const handleSave = async () => {
        if (!currentFlow || !workspaceId) return;
        try {
            await flowAPI.update(workspaceId, currentFlow.id, {
                name: currentFlow.name,
                steps: currentFlow.steps,
                isActive: currentFlow.isActive
            });
            setFlows(prev => prev.map(f => f.id === currentFlow.id ? currentFlow : f));
            setSavedMsg(true);
            setTimeout(() => setSavedMsg(false), 2000);
        } catch (err) {
            console.error('Save flow error:', err);
            alert('Akış kaydedilemedi.');
        }
    };

    // Toggle flow active/inactive
    const toggleFlow = async (flowId, isActive) => {
        if (!workspaceId) return;
        try {
            const res = await flowAPI.toggle(workspaceId, flowId, isActive);
            const updated = res.data.flow;
            setFlows(prev => prev.map(f => f.id === flowId ? { ...f, isActive: updated.isActive } : f));
            if (currentFlow?.id === flowId) {
                setCurrentFlow(f => ({ ...f, isActive: updated.isActive }));
            }
        } catch (err) {
            console.error('Toggle flow error:', err);
        }
    };

    // Create new flow
    const createFlow = async () => {
        if (!newFlowName.trim() || !workspaceId) return;
        try {
            const res = await flowAPI.create(workspaceId, {
                name: newFlowName.trim(),
                steps: [],
                isActive: false
            });
            const flow = res.data.flow;
            setFlows(prev => [...prev, flow]);
            setCurrentFlow(flow);
            setNewFlowName('');
            setShowNewFlow(false);
        } catch (err) {
            console.error('Create flow error:', err);
            alert('Akış oluşturulamadı.');
        }
    };

    const deleteFlow = async (id) => {
        if (!confirm('Bu akışı silmek istiyor musunuz?')) return;
        if (!workspaceId) return;
        try {
            await flowAPI.delete(workspaceId, id);
            setFlows(prev => prev.filter(f => f.id !== id));
            if (currentFlow?.id === id) setCurrentFlow(null);
        } catch (err) {
            console.error('Delete flow error:', err);
        }
    };

    const selectedStep = getSelectedStep();

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <div className="fb-root">
            {/* ── LEFT: Flow list + Palette ───────────────────── */}
            <div className="fb-left">
                {/* Flow list */}
                <div className="fb-flows-list">
                    <div className="fb-flows-header">
                        <span>AKİŞLERİM</span>
                        <button className="fb-new-btn" onClick={() => setShowNewFlow(true)} title="Yeni Akış">
                            <Plus size={14} />
                        </button>
                    </div>
                    {showNewFlow && (
                        <div className="fb-new-flow-form">
                            <input
                                autoFocus
                                placeholder="Akış adı..."
                                value={newFlowName}
                                onChange={e => setNewFlowName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') createFlow(); if (e.key === 'Escape') setShowNewFlow(false); }}
                            />
                            <button onClick={createFlow}><CheckCircle size={14} /></button>
                            <button onClick={() => setShowNewFlow(false)}><X size={14} /></button>
                        </div>
                    )}
                    {loading && (
                        <div className="fb-no-flows">Loading...</div>
                    )}
                    {!loading && flows.length === 0 && !showNewFlow && (
                        <div className="fb-no-flows">Henüz akış yok.<br />New oluşturun.</div>
                    )}
                    {flows.map(f => (
                        <div
                            key={f.id}
                            className={`fb-flow-item ${currentFlow?.id === f.id ? 'fb-flow-active' : ''}`}
                            onClick={() => setCurrentFlow(f)}
                        >
                            <span className={`fb-flow-dot ${f.isActive ? 'fb-dot-active' : 'fb-dot-draft'}`} title={f.isActive ? 'Aktif' : 'Taslak'} />
                            <span className="fb-flow-name">{f.name}</span>
                            <button className="fb-flow-delete" onClick={e => { e.stopPropagation(); deleteFlow(f.id); }}>
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))}
                </div>

                {/* Palette */}
                <div className="fb-palette">
                    <div className="fb-palette-title">BİLEŞENLER</div>
                    {Object.entries(PALETTE).map(([group, types]) => (
                        <div key={group} className="fb-palette-group">
                            <button
                                className="fb-palette-group-header"
                                onClick={() => setExpandedGroups(g => ({ ...g, [group]: !g[group] }))}
                            >
                                <span>{group}</span>
                                {expandedGroups[group] ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </button>
                            {expandedGroups[group] && (
                                <div className="fb-palette-items">
                                    {types.map(type => {
                                        const def = STEP_TYPES[type];
                                        return (
                                            <button
                                                key={type}
                                                className={`fb-palette-item fb-palette-${def.group}`}
                                                onClick={() => handlePaletteClick(type)}
                                                title={`Canvas'a ekle: ${def.label}`}
                                            >
                                                <Plus size={12} />
                                                <span>{def.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* ── CENTER: Canvas ──────────────────────────────── */}
            <div className="fb-canvas" onClick={() => setSelectedStepId(null)}>
                {!currentFlow ? (
                    <div className="fb-canvas-empty">
                        <GitBranch size={48} color="#d1d5db" />
                        <h3>Akış seçin veya oluşturun</h3>
                        <p>Sol panelden bir akış seçin ya da "+" ile yeni oluşturun, ardından bileşen paletinden adım ekleyin.</p>
                        <button className="fb-create-btn" onClick={() => setShowNewFlow(true)}>
                            <Plus size={16} /> Yeni Akış Oluştur
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Flow top bar */}
                        <div className="fb-canvas-topbar">
                            <div className="fb-canvas-name">
                                <Zap size={18} color="#3b82f6" />
                                <span>{currentFlow.name}</span>
                                <span className="fb-canvas-saved">{savedMsg ? '✅ Kaydedildi' : ''}</span>
                            </div>
                            <div className="fb-canvas-actions">
                                <button className="fb-btn-save" onClick={handleSave}>
                                    <Save size={14} /> Kaydet
                                </button>
                                <button
                                    className={`fb-btn-publish ${currentFlow.isActive ? 'fb-btn-unpublish' : ''}`}
                                    onClick={async () => {
                                        await handleSave();
                                        toggleFlow(currentFlow.id, !currentFlow.isActive);
                                    }}
                                >
                                    <Play size={14} /> {currentFlow.isActive ? 'Durdur' : 'Yayınla'}
                                </button>
                            </div>
                        </div>

                        {/* Flow steps */}
                        <div className="fb-flow-steps">
                            {currentFlow.steps.length === 0 ? (
                                <div className="fb-canvas-hint">
                                    ← Sol panelden bileşenlere tıklayarak adım ekleyin
                                </div>
                            ) : null}

                            {currentFlow.steps.map((step, idx) => (
                                <React.Fragment key={step.id}>
                                    <StepCard
                                        step={step}
                                        isSelected={selectedStepId === step.id}
                                        onClick={(id) => { setSelectedStepId(id); setSelectedBranch('main'); }}
                                        onDelete={deleteMainStep}
                                        branchKey="main"
                                    />

                                    {/* Condition branching */}
                                    {step.type === 'CONDITION' && (
                                        <div className="fb-condition-branches">
                                            <BranchBlock
                                                steps={step.config.yesBranch || []}
                                                branchKey="yes"
                                                onAdd={(br) => addBranchStep(br, step.id)}
                                                selectedId={selectedStepId}
                                                onSelect={(id) => { setSelectedStepId(id); setSelectedBranch('yes'); }}
                                                onDelete={(id, br) => deleteStep(id, br, step.id)}
                                                label="EVET"
                                                color="#10b981"
                                            />
                                            <BranchBlock
                                                steps={step.config.noBranch || []}
                                                branchKey="no"
                                                onAdd={(br) => addBranchStep(br, step.id)}
                                                selectedId={selectedStepId}
                                                onSelect={(id) => { setSelectedStepId(id); setSelectedBranch('no'); }}
                                                onDelete={(id, br) => deleteStep(id, br, step.id)}
                                                label="HAYIR"
                                                color="#ef4444"
                                            />
                                        </div>
                                    )}

                                    {/* Connector */}
                                    {idx < currentFlow.steps.length - 1 && step.type !== 'CONDITION' && (
                                        <div className="fb-connector"><ArrowDown size={16} color="#9ca3af" /></div>
                                    )}
                                </React.Fragment>
                            ))}

                            {/* Add step at bottom */}
                            {currentFlow.steps.length > 0 && (
                                <div className="fb-add-step-hint">
                                    <div className="fb-connector"><ArrowDown size={16} color="#d1d5db" /></div>
                                    <div className="fb-add-dashed">
                                        <Plus size={18} color="#9ca3af" />
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* ── RIGHT: Settings ─────────────────────────────── */}
            <div className="fb-right">
                <div className="fb-settings-header">
                    <Settings size={16} />
                    <span>ADIM AYARLARI</span>
                </div>
                <SettingsPanel
                    step={selectedStep}
                    onChange={updateStepConfig}
                    onClose={() => setSelectedStepId(null)}
                    templates={templates}
                />
            </div>

            {/* Branch step picker overlay */}
            {branchPickerOpen && (
                <div className="fb-picker-overlay" onClick={() => setBranchPickerOpen(null)}>
                    <div className="fb-picker-modal" onClick={e => e.stopPropagation()}>
                        <div className="fb-picker-title">
                            <span>{branchPickerOpen.branchKey === 'yes' ? '✅ EVET' : '❌ HAYIR'} dalı için adım seçin</span>
                            <button onClick={() => setBranchPickerOpen(null)}><X size={14} /></button>
                        </div>
                        <div className="fb-picker-list">
                            {['WA_SEND', 'AI_CALL', 'RETRY_CALL', 'ASSIGN_AGENT', 'ASSIGN_TEAM', 'CONVERT_TO_OPP', 'WAIT'].map(type => {
                                const def = STEP_TYPES[type];
                                return (
                                    <button
                                        key={type}
                                        className={`fb-picker-item fb-palette-${def.group}`}
                                        onClick={() => addBranchStepFromPicker(type)}
                                    >
                                        <span>{def.icon}</span>
                                        <span>{def.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
