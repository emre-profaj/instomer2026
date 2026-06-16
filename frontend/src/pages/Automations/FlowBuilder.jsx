import { useTranslation } from 'react-i18next';
import React, { useState, useEffect, useCallback } from 'react';
import {
    Plus, Trash2, Settings, ChevronDown, ChevronUp,
    Zap, MessageSquare, Phone, User, Clock, GitBranch,
    Play, Save, X, CheckCircle, Eye, MailCheck,
    AlarmClock, Tag, Bell, ArrowDown, Edit2
} from 'lucide-react';
import api, { flowAPI, automationAPI, funnelAPI, workspaceAPI, teamAPI, aiAPI, adminAPI } from '../../services/api';
import './FlowBuilder.css';

// ─── Step type definitions ─────────────────────────────────────────────────
const STEP_TYPES = {
    // Triggers
    NEW_FORM:       { group: 'trigger', label: 'Yeni Form Kaydı',        icon: '📋', color: '#3b82f6', borderColor: '#3b82f6' },
    FIRST_MSG:      { group: 'trigger', label: 'Gelen Mesaj',              icon: '💬', color: '#3b82f6', borderColor: '#3b82f6' },
    TAG_ADDED:      { group: 'trigger', label: 'Etiket Eklendi',         icon: '🏷️', color: '#3b82f6', borderColor: '#3b82f6' },
    HAS_PHONE:      { group: 'trigger', label: 'Numara Bıraktıysa',      icon: '📞', color: '#3b82f6', borderColor: '#3b82f6' },
    NO_REPLY:       { group: 'trigger', label: 'Yanıt Vermedi (Süre)',   icon: '⏰', color: '#3b82f6', borderColor: '#3b82f6' },
    STAGE_CHANGED:  { group: 'trigger', label: 'Aşama Değiştiğinde',     icon: '🔀', color: '#3b82f6', borderColor: '#3b82f6' },
    FLOW_ENTERED:   { group: 'trigger', label: 'Akışa Girdiğinde',       icon: '🌀', color: '#3b82f6', borderColor: '#3b82f6' },
    // Actions
    WA_SEND:        { group: 'action',  label: 'WhatsApp Gönder',        icon: '💬', color: '#10b981', borderColor: '#10b981' },
    SEND_MESSAGE:   { group: 'action',  label: 'Mesaj / Soru Sor',       icon: '✏️', color: '#10b981', borderColor: '#10b981' },
    AI_CALL:        { group: 'action',  label: 'AI Araması Başlat',      icon: '🤖', color: '#10b981', borderColor: '#10b981' },
    RETRY_CALL:     { group: 'action',  label: 'Hatırlatma Araması',     icon: '🔁', color: '#10b981', borderColor: '#10b981' },
    ASSIGN_AGENT:   { group: 'action',  label: 'Temsilci Ata',           icon: '👤', color: '#10b981', borderColor: '#10b981' },
    ASSIGN_TEAM:    { group: 'action',  label: 'Ekibe Ata',              icon: '👥', color: '#10b981', borderColor: '#10b981' },
    ASSIGN_BOT:     { group: 'action',  label: 'AI Bot Ata',             icon: '🤖', color: '#10b981', borderColor: '#10b981' },
    CONVERT_TO_OPP: { group: 'action',  label: 'Fırsata Çevir',          icon: '🎯', color: '#10b981', borderColor: '#10b981' },
    SWITCH_FLOW:    { group: 'action',  label: 'Akışa Geç',              icon: '🔀', color: '#10b981', borderColor: '#10b981' },

    // Logic
    WAIT:           { group: 'logic',   label: 'Bekleme Süresi',         icon: '⏱️', color: '#f59e0b', borderColor: '#f59e0b' },
    CONDITION:      { group: 'logic',   label: 'Koşul (Eğer)',           icon: '⑂',  color: '#ec4899', borderColor: '#ec4899' },
};

const PALETTE = {
    'TETİKLEYİCİLER': ['NEW_FORM', 'FIRST_MSG', 'HAS_PHONE', 'NO_REPLY', 'STAGE_CHANGED', 'FLOW_ENTERED', 'TAG_ADDED'],
    'AKSİYONLAR':     ['SEND_MESSAGE', 'WA_SEND', 'AI_CALL', 'RETRY_CALL', 'ASSIGN_AGENT', 'ASSIGN_TEAM', 'ASSIGN_BOT', 'CONVERT_TO_OPP', 'SWITCH_FLOW'],
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
    if (type === 'SEND_MESSAGE')   base.config = { message: '' };
    if (type === 'ASSIGN_AGENT')   base.config = { agentId: '', agentName: '' };
    if (type === 'ASSIGN_TEAM')    base.config = { teamId: '', teamName: '', assignMode: 'ROUND_ROBIN' };
    if (type === 'ASSIGN_BOT')     base.config = { botId: '', botName: '' };
    if (type === 'NO_REPLY')       base.config = { amount: 1, unit: 'saat' };
    if (type === 'STAGE_CHANGED')  base.config = { fromStage: '', toStage: '' };
    if (type === 'FLOW_ENTERED')   base.config = { funnelId: '', funnelName: '' };
    if (type === 'RETRY_CALL')     base.config = { maxRetries: 3, waitAmount: 1, waitUnit: 'saat' };
    if (type === 'CONVERT_TO_OPP') base.config = { targetStage: '' };
    if (type === 'SWITCH_FLOW')    base.config = { flowId: '', flowName: '' };
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
                         step.type === 'SEND_MESSAGE'   ? 'MESAJ / SORU' :
                         step.type === 'AI_CALL'        ? 'AI ARAMA' :
                         step.type === 'RETRY_CALL'     ? 'TEKRAR ARA' :
                         step.type === 'ASSIGN_AGENT'   ? 'ATAMA' :
                         step.type === 'ASSIGN_TEAM'    ? 'EKİP ATAMA' :
                         step.type === 'ASSIGN_BOT'     ? 'AI BOT' :
                         step.type === 'CONVERT_TO_OPP' ? 'DÖNÜŞTÜR' :
                         step.type === 'SWITCH_FLOW'    ? 'AKIŞA GEÇ' :
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
                            : step.type === 'FLOW_ENTERED'
                            ? (step.config.funnelName || 'Akış seçin')
                            : step.type === 'ASSIGN_TEAM'
                            ? ((step.config.teamName || 'Ekip seçin') + (step.config.assignMode === 'MANUAL' ? ' · Manuel' : step.config.assignMode === 'PHONE_ROUND_ROBIN' ? ' · Tel. Sıralı' : ' · Sıralı'))
                            : step.type === 'ASSIGN_BOT'
                            ? (step.config.botName || 'Bot seçin')
                            : step.type === 'CONVERT_TO_OPP'
                            ? (step.config.targetStage || 'Fırsata Çevir')
                            : step.type === 'SWITCH_FLOW'
                            ? (step.config.flowName || 'Akış seçin')
                            : step.type === 'SEND_MESSAGE'
                            ? (step.config.message
                                ? step.config.message.split('\n')[0].substring(0, 40) + (step.config.message.length > 40 ? '…' : '')
                                : 'Mesaj yazın...')
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
function BranchBlock({ steps, branchKey, parentConditionId, onAdd, selectedId, onSelect, onDelete, label, color }) {
    return (
        <div className={`fb-branch fb-branch-${branchKey}`}>
            <div className="fb-branch-label" style={{ color, borderColor: color }}>
                {label}
            </div>
            <div className="fb-branch-steps">
                {Array.isArray(steps) && steps.map(s => (
                    <React.Fragment key={s.id}>
                        <StepCard
                            step={s}
                            isSelected={selectedId === s.id}
                            onClick={onSelect}
                            onDelete={(id) => onDelete(id)} // It's recursive, ID is enough
                            branchKey={branchKey}
                        />
                        {/* Recursive rendering of nested conditions */}
                        {s.type === 'CONDITION' && (
                            <div className="fb-condition-branches">
                                <BranchBlock
                                    steps={s.config.yesBranch || []}
                                    branchKey="yes"
                                    parentConditionId={s.id}
                                    onAdd={onAdd}
                                    selectedId={selectedId}
                                    onSelect={onSelect}
                                    onDelete={onDelete}
                                    label="EVET"
                                    color="#10b981"
                                />
                                <BranchBlock
                                    steps={s.config.noBranch || []}
                                    branchKey="no"
                                    parentConditionId={s.id}
                                    onAdd={onAdd}
                                    selectedId={selectedId}
                                    onSelect={onSelect}
                                    onDelete={onDelete}
                                    label="HAYIR"
                                    color="#ef4444"
                                />
                            </div>
                        )}
                        <div className="fb-connector"><ArrowDown size={16} color="#9ca3af" /></div>
                    </React.Fragment>
                ))}
                <button
                    className="fb-add-branch-step"
                    style={{ borderColor: color, color }}
                    onClick={() => onAdd(branchKey, parentConditionId)}
                    title={`${label} dalına adım ekle`}
                >
                    <Plus size={14} /> Adım Ekle
                </button>
            </div>
        </div>
    );
}

// ─── Step Settings Panel ────────────────────────────────────────────────────
function SettingsPanel({ step, onChange, onClose, templates = [], flows = [], funnels = [], members = [], teams = [], bots = [] }) {
    const { t } = useTranslation();
    const [flowOpen, setFlowOpen] = React.useState(false);
    const flowRef = React.useRef(null);

    // Close dropdown on outside click
    React.useEffect(() => {
        const handler = (e) => {
            if (flowRef.current && !flowRef.current.contains(e.target)) {
                setFlowOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

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

            {/* SEND_MESSAGE */}
            {step.type === 'SEND_MESSAGE' && (
                <div className="fb-field-group">
                    <label>Bot Mesaj\u0131 / Sorusu ✏️</label>
                    <textarea
                        rows={5}
                        placeholder={"Ameliyat randevusu mu muayene randevusu mu?\n\n1️⃣ Ameliyat Randevusu\n2️⃣ Muayene Randevusu"}
                        value={step.config.message || ''}
                        onChange={e => onChange({ ...step.config, message: e.target.value })}
                        className="fb-msg-textarea"
                    />
                    <div className="fb-msg-meta">
                        <span className="fb-msg-chars">{(step.config.message || '').length} karakter</span>
                        <span className="fb-msg-hint">Emoji, liste, soru yazabilirsiniz</span>
                    </div>
                    {step.config.message && (
                        <div className="fb-msg-preview">
                            <div className="fb-msg-preview-label">Ön İzleme</div>
                            <div className="fb-msg-preview-bubble">
                                {step.config.message}
                            </div>
                        </div>
                    )}
                    <p className="fb-hint" style={{ marginTop: 8 }}>
                        Bot bu mesaj\u0131 kullan\u0131c\u0131ya g\u00f6nderir. Bir sonraki ad\u0131mda yan\u0131t\u0131 ko\u015ful ile kontrol edebilirsiniz.
                    </p>
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
                            {Array.isArray(templates) && templates.map(t => (
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
                    <label>Temsilci Seç</label>
                    <select
                        value={step.config.agentId || ''}
                        onChange={e => {
                            const m = members.find(x => x.user?.id === e.target.value || x.id === e.target.value);
                            const name = m?.user?.name || m?.name || e.target.value;
                            onChange({ ...step.config, agentId: e.target.value, agentName: name });
                        }}
                        style={{ width: '100%', marginTop: 4 }}
                    >
                        <option value="">Temsilci seçin...</option>
                        {members.length === 0 && <option disabled>— Yükleniyor... —</option>}
                        {Array.isArray(members) && members.map(m => {
                            const id   = m.user?.id   || m.id;
                            const name = m.user?.name || m.name || id;
                            const role = m.role || '';
                            return (
                                <option key={id} value={id}>
                                    {name}{role ? ` (${role})` : ''}
                                </option>
                            );
                        })}
                    </select>
                    {step.config.agentName && (
                        <p className="fb-hint" style={{ color: '#10b981', marginTop: 5 }}>
                            ✅ Seçili: <strong>{step.config.agentName}</strong>
                        </p>
                    )}
                </div>
            )}

            {/* ASSIGN_TEAM */}
            {step.type === 'ASSIGN_TEAM' && (
                <div className="fb-field-group">
                    <label>Takım Seç</label>
                    <select
                        value={step.config.teamId || ''}
                        onChange={e => {
                            const t = teams.find(x => x.id === e.target.value);
                            onChange({ ...step.config, teamId: e.target.value, teamName: t?.name || '' });
                        }}
                        style={{ width: '100%', marginTop: 4 }}
                    >
                        <option value="">Takım seçin...</option>
                        {teams.length === 0 && <option disabled>— Yükleniyor... —</option>}
                        {Array.isArray(teams) && teams.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                    {step.config.teamName && (
                        <p className="fb-hint" style={{ color: '#10b981', marginTop: 5 }}>
                            ✅ Seçili: <strong>{step.config.teamName}</strong>
                        </p>
                    )}

                    {/* Assignment Mode Cards */}
                    <label style={{ marginTop: 14, marginBottom: 6, display: 'block' }}>Atama Modu</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {/* Round Robin */}
                        {(() => {
                            const mode = step.config.assignMode || (step.config.useRoundRobin ? 'ROUND_ROBIN' : 'ROUND_ROBIN');
                            const modes = [
                                {
                                    key: 'ROUND_ROBIN',
                                    icon: '🔄',
                                    title: 'Ekibe Sırayla Ata',
                                    desc: 'Takım üyelerine sırayla ve eşit şekilde dağıtılır',
                                    activeColor: '#10b981',
                                    activeBg: '#f0fdf4',
                                    activeBorder: '#86efac'
                                },
                                {
                                    key: 'MANUAL',
                                    icon: '✋',
                                    title: 'Manuel Elle Aktar',
                                    desc: 'Takıma bildirim gider, üyeler kendileri alır',
                                    activeColor: '#3b82f6',
                                    activeBg: '#eff6ff',
                                    activeBorder: '#93c5fd'
                                },
                                {
                                    key: 'PHONE_ROUND_ROBIN',
                                    icon: '📞',
                                    title: 'Numaralı Sırayla Ata',
                                    desc: 'Sadece telefon numarası olan kişiler sırayla atanır',
                                    activeColor: '#f59e0b',
                                    activeBg: '#fffbeb',
                                    activeBorder: '#fcd34d'
                                }
                            ];
                            return modes.map(m => {
                                const isActive = mode === m.key;
                                return (
                                    <div
                                        key={m.key}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '10px',
                                            padding: '10px 12px',
                                            background: isActive ? m.activeBg : '#f9fafb',
                                            border: `2px solid ${isActive ? m.activeBorder : '#e5e7eb'}`,
                                            borderRadius: '8px', cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            boxShadow: isActive ? `0 0 0 1px ${m.activeBorder}40` : 'none'
                                        }}
                                        onClick={() => onChange({ ...step.config, assignMode: m.key, useRoundRobin: m.key === 'ROUND_ROBIN' || m.key === 'PHONE_ROUND_ROBIN' })}
                                    >
                                        {/* Radio circle */}
                                        <div style={{
                                            width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                                            border: `2px solid ${isActive ? m.activeColor : '#d1d5db'}`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            transition: 'border-color 0.2s'
                                        }}>
                                            {isActive && (
                                                <div style={{
                                                    width: '10px', height: '10px', borderRadius: '50%',
                                                    background: m.activeColor
                                                }} />
                                            )}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '13px', fontWeight: '600', color: isActive ? m.activeColor : '#374151' }}>
                                                {m.icon} {m.title}
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                                                {m.desc}
                                            </div>
                                        </div>
                                        {isActive && (
                                            <span style={{ fontSize: '14px' }}>✓</span>
                                        )}
                                    </div>
                                );
                            });
                        })()}
                    </div>

                    <p className="fb-hint" style={{ marginTop: 8 }}>
                        {(step.config.assignMode || 'ROUND_ROBIN') === 'ROUND_ROBIN'
                            ? '👥 Sohbet, takım üyelerine eşit şekilde dağıtılır.'
                            : (step.config.assignMode === 'MANUAL'
                                ? '🔔 Takıma bildirim gönderilir, ilk alan üye konuşmayı üstlenir.'
                                : '📱 Sadece telefon numarası olan kişiler takım üyelerine sırayla dağıtılır.')}
                    </p>
                </div>
            )}


            {/* ASSIGN_BOT */}
            {step.type === 'ASSIGN_BOT' && (
                <div className="fb-field-group">
                    <label>AI Bot Seç 🤖</label>
                    <select
                        value={step.config.botId || ''}
                        onChange={e => {
                            const b = bots.find(x => x.id === e.target.value);
                            onChange({ ...step.config, botId: e.target.value, botName: b?.name || '' });
                        }}
                        style={{ width: '100%', marginTop: 4 }}
                    >
                        <option value="">Bot seçin...</option>
                        {bots.length === 0 && <option disabled>— Bot bulunamadı —</option>}
                        {Array.isArray(bots) && bots.map(b => (
                            <option key={b.id} value={b.id}>
                                {b.name}{b.isActive === false ? ' (Pasif)' : ''}
                            </option>
                        ))}
                    </select>
                    {step.config.botName && (
                        <p className="fb-hint" style={{ color: '#10b981', marginTop: 5 }}>
                            ✅ Seçili: <strong>{step.config.botName}</strong>
                        </p>
                    )}
                    <p className="fb-hint" style={{ marginTop: 6 }}>Bu adımdan itibaren seçilen AI bot konuşmayı devralır.</p>
                </div>
            )}

            {/* CONVERT_TO_OPP */}
            {step.type === 'CONVERT_TO_OPP' && (
                <div className="fb-field-group">
                    <label>Hedef Akış Aşaması</label>
                    <input
                        type="text"
                        placeholder="örn: Fırsat / Yeni Teklif"
                        value={step.config.targetStage || ''}
                        onChange={e => onChange({ ...step.config, targetStage: e.target.value })}
                    />
                    <p className="fb-hint">Kişinin yazışması bu aşamaya taşınır ve fırsat olarak işaretlenir.</p>
                </div>
            )}



            {/* SWITCH_FLOW */}
            {step.type === 'SWITCH_FLOW' && (
                <div className="fb-field-group">
                    <label>Hedef Akış</label>
                    <select
                        value={step.config.flowId || ''}
                        onChange={e => {
                            const selected = funnels.find(f => f.id === e.target.value);
                            onChange({
                                ...step.config,
                                flowId: e.target.value,
                                flowName: selected?.name || ''
                            });
                        }}
                        style={{ width: '100%', marginTop: 4 }}
                    >
                        <option value="">Akış seçin...</option>
                        {(!funnels || funnels.length === 0) ? (
                            <option disabled>— Henüz akış yok —</option>
                        ) : (
                            Array.isArray(funnels) && funnels.map(f => (
                                <option key={f.id} value={f.id}>
                                    {f.icon ? `${f.icon} ` : ''}{f.name}
                                </option>
                            ))
                        )}
                    </select>
                    {step.config.flowId && (
                        <p className="fb-hint" style={{ marginTop: 6, color: '#10b981' }}>
                            ✅ Seçili: <strong>{step.config.flowName}</strong>
                        </p>
                    )}
                    <p className="fb-hint" style={{ marginTop: 6 }}>Bu adıma gelindiğinde konuşma seçilen akışa yönlendirilir.</p>
                </div>
            )}

            {/* FLOW_ENTERED */}
            {step.type === 'FLOW_ENTERED' && (
                <div className="fb-field-group">
                    <label>🌀 Hangi Akışa Girdiğinde?</label>
                    <select
                        value={step.config.funnelId || ''}
                        onChange={e => {
                            const selected = funnels.find(f => f.id === e.target.value);
                            onChange({ ...step.config, funnelId: e.target.value, funnelName: selected?.name || '' });
                        }}
                        style={{ width: '100%', marginTop: 4 }}
                    >
                        <option value="">Akış seçin...</option>
                        {(!funnels || funnels.length === 0) ? (
                            <option disabled>— Henüz akış yok —</option>
                        ) : (
                            Array.isArray(funnels) && funnels.map(f => (
                                <option key={f.id} value={f.id}>
                                    {f.icon ? `${f.icon} ` : ''}{f.name}
                                </option>
                            ))
                        )}
                    </select>
                    {step.config.funnelName && (
                        <p className="fb-hint" style={{ color: '#10b981', marginTop: 5 }}>
                            ✅ Seçili: <strong>{step.config.funnelName}</strong>
                        </p>
                    )}
                    <p className="fb-hint" style={{ marginTop: 6 }}>Bir konuşma bu akışa taşındığında otomasyon tetiklenir.</p>
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

// ─── Recursive State Management Helpers ─────────────────────────────────────
const recursiveFind = (steps, targetId) => {
    if (!Array.isArray(steps)) return null;
    for (const s of steps) {
        if (s.id === targetId) return s;
        if (s.type === 'CONDITION') {
            const y = recursiveFind(s.config.yesBranch, targetId);
            if (y) return y;
            const n = recursiveFind(s.config.noBranch, targetId);
            if (n) return n;
        }
    }
    return null;
};

const recursiveUpdateConfig = (steps, targetId, newConfig) => {
    if (!Array.isArray(steps)) return [];
    return steps.map(s => {
        if (s.id === targetId) return { ...s, config: newConfig };
        if (s.type === 'CONDITION') {
            return {
                ...s,
                config: {
                    ...s.config,
                    yesBranch: recursiveUpdateConfig(s.config.yesBranch || [], targetId, newConfig),
                    noBranch: recursiveUpdateConfig(s.config.noBranch || [], targetId, newConfig)
                }
            };
        }
        return s;
    });
};

const recursiveAddBranchStep = (steps, parentConditionId, branchKey, newStep) => {
    if (!Array.isArray(steps)) return [];
    return steps.map(s => {
        if (s.id === parentConditionId) {
            const key = branchKey === 'yes' ? 'yesBranch' : 'noBranch';
            return {
                ...s,
                config: {
                    ...s.config,
                    [key]: [...(s.config[key] || []), newStep]
                }
            };
        }
        if (s.type === 'CONDITION') {
            return {
                ...s,
                config: {
                    ...s.config,
                    yesBranch: recursiveAddBranchStep(s.config.yesBranch || [], parentConditionId, branchKey, newStep),
                    noBranch: recursiveAddBranchStep(s.config.noBranch || [], parentConditionId, branchKey, newStep)
                }
            };
        }
        return s;
    });
};

const recursiveDelete = (steps, targetId) => {
    if (!Array.isArray(steps)) return [];
    const filtered = steps.filter(s => s.id !== targetId);
    return filtered.map(s => {
        if (s.type === 'CONDITION') {
            return {
                ...s,
                config: {
                    ...s.config,
                    yesBranch: recursiveDelete(s.config.yesBranch || [], targetId),
                    noBranch: recursiveDelete(s.config.noBranch || [], targetId)
                }
            };
        }
        return s;
    });
};

// ─── Main FlowBuilder ────────────────────────────────────────────────────────
export default function FlowBuilder({ workspaceId, isTemplateMode = false, onImportTemplate }) {
    const { t } = useTranslation();
    const [flows, setFlows] = useState([]);
    const [funnelList, setFunnelList] = useState([]); // CRM pipelines — same as Inbox
    const [currentFlow, setCurrentFlow] = useState(null);   // { id, name, steps[], isActive }
    const [showNewFlow, setShowNewFlow] = useState(false);
    const [newFlowName, setNewFlowName] = useState('');
    const [selectedStepId, setSelectedStepId] = useState(null);
    const [selectedBranch, setSelectedBranch] = useState(null); // 'main' | 'yes' | 'no'
    const [expandedGroups, setExpandedGroups] = useState({ 'TEKLEYİCİLER': true, 'AKSİYONLAR': true, 'MANTIK & KONTROL': true });
    const [savedMsg, setSavedMsg] = useState(false);
    const [loading, setLoading] = useState(false);
    const [templates, setTemplates] = useState([]);
    
    const [members, setMembers] = useState([]);
    const [teams, setTeams] = useState([]);
    const [bots, setBots] = useState([]);
    const [mainFlow, setMainFlow] = useState(null);
    const [expandedFlows, setExpandedFlows] = useState({});

    // Load flows from API
    useEffect(() => {
        if (!workspaceId && !isTemplateMode) return;
        setLoading(true);
        
        const fetchFlows = isTemplateMode ? adminAPI.getFlowTemplates() : flowAPI.getAll(workspaceId);
        
        fetchFlows
            .then(res => {
                const raw = res.data;
                const list = Array.isArray(raw) ? raw
                    : Array.isArray(raw?.templates) ? raw.templates
                    : Array.isArray(raw?.flows) ? raw.flows
                    : Array.isArray(raw?.data) ? raw.data
                    : [];
                const parsedList = list.map(f => ({
                    ...f,
                    steps: typeof f.steps === 'string' ? JSON.parse(f.steps) : (f.steps || []),
                    children: (f.children || []).map(c => ({
                        ...c,
                        steps: typeof c.steps === 'string' ? JSON.parse(c.steps) : (c.steps || []),
                        children: (c.children || []).map(gc => ({
                            ...gc,
                            steps: typeof gc.steps === 'string' ? JSON.parse(gc.steps) : (gc.steps || [])
                        }))
                    }))
                }));
                setFlows(parsedList);
            })
            .catch(err => console.error('Failed to load flows:', err))
            .finally(() => setLoading(false));

        // Ensure MAIN (Triyaj) flow exists
        if (!isTemplateMode && workspaceId) {
            flowAPI.ensureMainFlow(workspaceId)
                .then(res => {
                    if (res.data?.flow) {
                        const mf = res.data.flow;
                        mf.steps = typeof mf.steps === 'string' ? JSON.parse(mf.steps) : (mf.steps || []);
                        (mf.children || []).forEach(c => {
                            c.steps = typeof c.steps === 'string' ? JSON.parse(c.steps) : (c.steps || []);
                            (c.children || []).forEach(gc => {
                                gc.steps = typeof gc.steps === 'string' ? JSON.parse(gc.steps) : (gc.steps || []);
                            });
                        });
                        setMainFlow(mf);
                        setExpandedFlows(prev => ({ ...prev, [mf.id]: true }));
                    }
                })
                .catch(err => console.error('Failed to ensure main flow:', err));
        }

        if (!isTemplateMode && workspaceId) {
            // Load CRM funnels (pipelines) for SWITCH_FLOW
            funnelAPI.getAll(workspaceId)
                .then(res => {
                    const list = res.data?.funnels || res.data || [];
                    setFunnelList(Array.isArray(list) ? list : []);
                })
                .catch(() => {});

            // Load WhatsApp templates
            automationAPI.getTemplates(workspaceId)
                .then(res => setTemplates(Array.isArray(res.data?.templates) ? res.data.templates : Array.isArray(res.data) ? res.data : []))
                .catch(() => {});

            // Load agents, teams, and bots
            workspaceAPI.getMembers(workspaceId)
                .then(res => setMembers(Array.isArray(res.data) ? res.data : Array.isArray(res.data?.members) ? res.data.members : []))
                .catch(() => {});
                
            teamAPI.getWorkspaceTeams(workspaceId)
                .then(res => setTeams(Array.isArray(res.data) ? res.data : Array.isArray(res.data?.teams) ? res.data.teams : []))
                .catch(() => {});
                
            aiAPI.getBots(workspaceId)
                .then(res => setBots(Array.isArray(res.data) ? res.data : Array.isArray(res.data?.bots) ? res.data.bots : []))
                .catch(() => {});
        }
    }, [workspaceId, isTemplateMode]);

    // Get the selected step object from main or branch
    const getSelectedStep = () => {
        if (!currentFlow || !selectedStepId) return null;
        return recursiveFind(currentFlow.steps, selectedStepId);
    };

    const updateStepConfig = (newConfig) => {
        if (!currentFlow || !selectedStepId) return;
        setCurrentFlow(f => ({
            ...f,
            steps: recursiveUpdateConfig(f.steps, selectedStepId, newConfig)
        }));
    };

    // Add step from palette
    const addStep = useCallback((type, branchKey = 'main', conditionStepId = null) => {
        const newStep = makeStep(type);

        setCurrentFlow(f => {
            if (!f) return f;
            if (branchKey === 'main' || !conditionStepId) {
                // Trigger can only be first; don't allow 2 triggers
                if (STEP_TYPES[type].group === 'trigger' && f.steps.some(s => STEP_TYPES[s.type].group === 'trigger')) {
                    alert('Bir akışta yalnızca bir tetikleyici olabilir.');
                    return f;
                }
                return { ...f, steps: [...f.steps, newStep] };
            }
            // Add to branch recursively
            return {
                ...f,
                steps: recursiveAddBranchStep(f.steps, conditionStepId, branchKey, newStep)
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
    const [groupPickerOpen, setGroupPickerOpen] = useState(null); // group name like 'TETİKLEYİCİLER'

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

    // Open group picker (for palette group "Ekle" buttons)
    const openGroupPicker = (groupName) => {
        if (!currentFlow) { alert('Önce bir akış oluşturun veya seçin.'); return; }
        setGroupPickerOpen(groupName);
    };

    // Add step from group picker
    const addStepFromGroupPicker = (type) => {
        addStep(type, 'main');
        setGroupPickerOpen(null);
    };

    // Add step to branch from inside canvas (used by BranchBlock via addBranchStep)
    const addBranchStep = (branchKey, conditionStepId) => {
        openBranchPicker(branchKey, conditionStepId);
    };

    // Delete step
    const deleteStep = (stepId) => {
        setCurrentFlow(f => {
            if (!f) return f;
            return { ...f, steps: recursiveDelete(f.steps, stepId) };
        });
        if (selectedStepId === stepId) setSelectedStepId(null);
    };

    const deleteMainStep = deleteStep;

    // Save to API
    const handleSave = async () => {
        if (!currentFlow || (!workspaceId && !isTemplateMode)) return;
        try {
            if (isTemplateMode) {
                await adminAPI.updateFlowTemplate(currentFlow.id, {
                    name: currentFlow.name,
                    steps: currentFlow.steps,
                    trigger: currentFlow.trigger
                });
            } else {
                await flowAPI.update(workspaceId, currentFlow.id, {
                    name: currentFlow.name,
                    steps: currentFlow.steps,
                    isActive: currentFlow.isActive
                });
            }
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
        if (!workspaceId || isTemplateMode) return;
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
        if (!newFlowName.trim() || (!workspaceId && !isTemplateMode)) return;
        try {
            let flow;
            if (isTemplateMode) {
                const res = await adminAPI.createFlowTemplate({
                    name: newFlowName.trim(),
                    steps: []
                });
                flow = res.data.template;
            } else {
                const res = await flowAPI.create(workspaceId, {
                    name: newFlowName.trim(),
                    steps: [],
                    isActive: false,
                    parentId: mainFlow?.id || null,
                    flowType: 'SUB'
                });
                flow = res.data.flow;
            }
            // Ensure steps is parsed as array
            if (typeof flow.steps === 'string') {
                try { flow.steps = JSON.parse(flow.steps); } catch { flow.steps = []; }
            }
            flow.steps = flow.steps || [];
            setFlows(prev => [...prev, flow]);
            setCurrentFlow(flow);
            setNewFlowName('');
            setShowNewFlow(false);
            // Auto-expand main flow to show newly created child
            if (mainFlow?.id && flow.parentId === mainFlow.id) {
                setExpandedFlows(prev => ({ ...prev, [mainFlow.id]: true }));
            }
        } catch (err) {
            console.error('Create flow error:', err);
            alert('Akış oluşturulamadı.');
        }
    };

    const deleteFlow = async (id) => {
        if (!confirm('Bu akışı silmek istiyor musunuz?')) return;
        if (!workspaceId && !isTemplateMode) return;
        try {
            if (isTemplateMode) {
                await adminAPI.deleteFlowTemplate(id);
            } else {
                await flowAPI.delete(workspaceId, id);
            }
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
                        <span>{isTemplateMode ? 'ŞABLONLARIM' : 'AKİŞLERİM'}</span>
                        <button className="fb-new-btn" onClick={() => setShowNewFlow(true)} title="Yeni">
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
                    {/* Tree View: Main Flow + Children */}
                    {(() => {
                        // Build tree: show main flow first, then its children indented
                        const mainF = flows.find(f => f.flowType === 'MAIN') || mainFlow;
                        const topLevel = mainF
                            ? [mainF, ...flows.filter(f => f.parentId === mainF.id && f.id !== mainF.id)]
                            : flows.filter(f => !f.parentId);
                        const renderFlowItem = (f, depth = 0) => {
                            const isMain = f.flowType === 'MAIN';
                            // Always derive children from flows state to reflect real-time changes
                            const childrenFromState = flows.filter(c => c.parentId === f.id && c.id !== f.id);
                            const children = childrenFromState.length > 0 ? childrenFromState : (f.children || []);
                            const hasChildren = children.length > 0;
                            const isExpanded = expandedFlows[f.id];
                            return (
                                <React.Fragment key={f.id}>
                                    <div
                                        className={`fb-flow-item ${currentFlow?.id === f.id ? 'fb-flow-active' : ''}`}
                                        style={{ paddingLeft: `${12 + depth * 16}px` }}
                                        onClick={() => setCurrentFlow(f)}
                                    >
                                        {hasChildren && (
                                            <button
                                                className="fb-flow-expand"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setExpandedFlows(prev => ({ ...prev, [f.id]: !prev[f.id] }));
                                                }}
                                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginRight: 4, lineHeight: 1 }}
                                            >
                                                {isExpanded ? <ChevronDown size={12} /> : <ChevronUp size={12} style={{ transform: 'rotate(90deg)' }} />}
                                            </button>
                                        )}
                                        {!hasChildren && <span style={{ width: 16 }} />}
                                        <span className={`fb-flow-dot ${f.isActive ? 'fb-dot-active' : 'fb-dot-draft'}`} title={f.isActive ? 'Aktif' : 'Taslak'} />
                                        {f.icon && <span style={{ fontSize: 13, marginRight: 4 }}>{f.icon}</span>}
                                        <span className="fb-flow-name" style={{ fontWeight: isMain ? 600 : 400, color: isMain ? '#6366f1' : undefined }}>
                                            {f.name}
                                        </span>
                                        {isMain && <span style={{ fontSize: 9, color: '#6366f1', marginLeft: 'auto', opacity: 0.7 }}>ANA</span>}
                                        {!isMain && (
                                            <button className="fb-flow-delete" onClick={e => { e.stopPropagation(); deleteFlow(f.id); }}>
                                                <Trash2 size={12} />
                                            </button>
                                        )}
                                    </div>
                                    {hasChildren && isExpanded && children.map(child => renderFlowItem(child, depth + 1))}
                                </React.Fragment>
                            );
                        };

                        // Render main flow + orphans
                        if (mainF) {
                            return renderFlowItem(mainF, 0);
                        }
                        return topLevel.map(f => renderFlowItem(f, 0));
                    })()}
                </div>

                {/* Palette */}
                <div className="fb-palette">
                    <div className="fb-palette-title">BİLEŞENLER</div>
                    {Object.entries(PALETTE).map(([group, types]) => {
                        const groupType = types[0] ? STEP_TYPES[types[0]]?.group : 'action';
                        const groupColorClass = groupType === 'trigger' ? 'fb-palette-trigger' : groupType === 'action' ? 'fb-palette-action' : 'fb-palette-logic';
                        return (
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
                                                    <span className="fb-palette-item-icon">{def.icon}</span>
                                                    <span>{def.label}</span>
                                                </button>
                                            );
                                        })}
                                        {/* Group-level "Ekle" button */}
                                        <button
                                            className={`fb-palette-group-add ${groupColorClass}`}
                                            onClick={() => openGroupPicker(group)}
                                            title={`${group} grubundan adım ekle`}
                                        >
                                            <Plus size={13} />
                                            <span>Ekle</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
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
                                {isTemplateMode && onImportTemplate && (
                                    <button 
                                        className="fb-btn-publish" 
                                        onClick={() => onImportTemplate(currentFlow)}
                                        style={{ backgroundColor: '#8b5cf6' }}
                                    >
                                        <ArrowDown size={14} /> Aktar
                                    </button>
                                )}
                                {!isTemplateMode && (
                                    <button
                                        className={`fb-btn-publish ${currentFlow.isActive ? 'fb-btn-unpublish' : ''}`}
                                        onClick={async () => {
                                            await handleSave();
                                            toggleFlow(currentFlow.id, !currentFlow.isActive);
                                        }}
                                    >
                                        <Play size={14} /> {currentFlow.isActive ? 'Durdur' : 'Yayınla'}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Flow steps */}
                        <div className="fb-flow-steps">
                            {(!currentFlow.steps || currentFlow.steps.length === 0) ? (
                                <div className="fb-canvas-hint">
                                    ← Sol panelden bileşenlere tıklayarak adım ekleyin
                                </div>
                            ) : null}

                            {Array.isArray(currentFlow.steps) && currentFlow.steps.map((step, idx) => (
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
                                                parentConditionId={step.id}
                                                onAdd={addBranchStep}
                                                selectedId={selectedStepId}
                                                onSelect={(id) => { setSelectedStepId(id); setSelectedBranch('yes'); }}
                                                onDelete={deleteStep}
                                                label="EVET"
                                                color="#10b981"
                                            />
                                            <BranchBlock
                                                steps={step.config.noBranch || []}
                                                branchKey="no"
                                                parentConditionId={step.id}
                                                onAdd={addBranchStep}
                                                selectedId={selectedStepId}
                                                onSelect={(id) => { setSelectedStepId(id); setSelectedBranch('no'); }}
                                                onDelete={deleteStep}
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
                    flows={flows.filter(f => f.id !== currentFlow?.id)}
                    funnels={funnelList}
                    members={members}
                    teams={teams}
                    bots={bots}
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
                            {[...PALETTE['AKSİYONLAR'], ...PALETTE['MANTIK & KONTROL']].map(type => {
                                const def = STEP_TYPES[type];
                                if (!def) return null;
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

            {/* Group picker overlay (for palette group "Ekle" buttons) */}
            {groupPickerOpen && (
                <div className="fb-picker-overlay" onClick={() => setGroupPickerOpen(null)}>
                    <div className="fb-picker-modal" onClick={e => e.stopPropagation()}>
                        <div className="fb-picker-title">
                            <span>
                                {groupPickerOpen === 'TETİKLEYİCİLER' && '⚡ Tetikleyici Ekle'}
                                {groupPickerOpen === 'AKSİYONLAR' && '🎯 Aksiyon Ekle'}
                                {groupPickerOpen === 'MANTIK & KONTROL' && '⑂ Mantık & Kontrol Ekle'}
                            </span>
                            <button onClick={() => setGroupPickerOpen(null)}><X size={14} /></button>
                        </div>
                        <div className="fb-picker-list">
                            {(PALETTE[groupPickerOpen] || []).map(type => {
                                const def = STEP_TYPES[type];
                                return (
                                    <button
                                        key={type}
                                        className={`fb-picker-item fb-palette-${def.group}`}
                                        onClick={() => addStepFromGroupPicker(type)}
                                    >
                                        <span style={{ fontSize: 18 }}>{def.icon}</span>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                            <span style={{ fontWeight: 700 }}>{def.label}</span>
                                        </div>
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
