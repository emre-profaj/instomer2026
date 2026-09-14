import { useEffect, useState, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { X, Phone, Mail, User, Users, Clock, MapPin, Globe, Tag, Plus, ExternalLink, Loader, Trash2, StickyNote, ArrowRight, Sparkles, Brain, UserCheck, ChevronDown, ChevronRight, Ban, ShieldCheck, FileText, TrendingUp, Save, Bell, Check, CheckCircle2, PhoneCall, MessageSquare, Zap, Calendar, CalendarDays, History, Pencil, UserPlus, Banknote, Briefcase, Building2, Bot, RefreshCw, Cake, FileSpreadsheet, Database } from 'lucide-react';
import { facebookAPI, aiAPI, contactAPI, dealAPI, conversationAPI, appointmentAPI, retellAPI, funnelAPI, caseAPI, productAPI, appointmentConfigAPI } from '../../services/api';
import { getTopicCategories } from '../../services/topicCategory.api';
import { activityAPI } from '../../services/activity.api';
import CaseCards from './CaseCards';
import TransferModal from '../TransferModal/TransferModal';
import ChatPopup from '../ChatPopup/ChatPopup';
import './ContactSidebar.css';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { detectCallIntent } from '../../utils/callIntentDetector';
import ErrorBoundary from '../ErrorBoundary/ErrorBoundary';

// Phone normalization (frontend mirror of backend)
const normalizePhone = (phone) => {
    if (!phone) return phone;
    let cleaned = phone.replace(/[\s\-\(\)\.]/g, '').trim();
    if (cleaned.startsWith('+')) return cleaned;
    if (cleaned.startsWith('00')) return '+' + cleaned.slice(2);
    if (cleaned.startsWith('0') && cleaned.length === 11) return '+9' + cleaned;
    if (cleaned.startsWith('5') && cleaned.length === 10) return '+90' + cleaned;
    if (cleaned.startsWith('90') && cleaned.length === 12) return '+' + cleaned;
    return cleaned;
};

// Güvenli Tarih Formatlama Fonksiyonu (Crash Önleyici)
const safeFormatDate = (dateVal, options) => {
    if (!dateVal) return '-';
    try {
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleDateString('tr-TR', options || { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return '-';
    }
};

const safeFormatDateTime = (dateVal, options) => {
    if (!dateVal) return '-';
    try {
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleString('tr-TR', options || { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
        return '-';
    }
};

const getContactCreationSourceInfo = (c) => {
    if (!c) return { label: 'Bilinmiyor', color: '#64748b', bg: '#f1f5f9', border: '#cbd5e1', icon: '❓' };

    // Direct channel sources
    if (c.source === 'WHATSAPP' || c.whatsappId) {
        return { label: 'WhatsApp', color: '#15803d', bg: '#dcfce7', border: '#86efac', icon: '💬' };
    }
    if (c.source === 'INSTAGRAM' || c.instagramId || c.instagramUsername) {
        return { label: 'Instagram DM', color: '#be185d', bg: '#fdf2f8', border: '#fbcfe8', icon: '📸' };
    }
    if (c.source === 'FACEBOOK' || c.facebookId) {
        return { label: 'Facebook', color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', icon: '📘' };
    }
    if (c.source === 'WEBCHAT' || c.source === 'WIDGET') {
        return { label: 'Web Canlı Destek', color: '#0f766e', bg: '#f0fdfa', border: '#99f6e4', icon: '🌐' };
    }
    if (c.source === 'FORM') {
        return { label: 'Web Formu', color: '#b45309', bg: '#fefce8', border: '#fde047', icon: '📝' };
    }
    if (c.source === 'CALL' || c.source === 'INBOUND_CALL') {
        return { label: 'Gelen Telefon', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0', icon: '📞' };
    }
    if (c.source === 'OUTBOUND_CALL') {
        return { label: 'Giden Arama', color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd', icon: '📞' };
    }
    if (c.leadSource) {
        const map = {
            INBOUND: { label: 'Gelen Arama', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0', icon: '📞' },
            SOCIAL_MEDIA: { label: 'Sosyal Medya', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', icon: '📱' },
            FACEBOOK: { label: 'Facebook Reklamı', color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', icon: '📘' },
            INSTAGRAM: { label: 'Instagram Reklamı', color: '#be185d', bg: '#fdf2f8', border: '#fbcfe8', icon: '📸' },
            GOOGLE: { label: 'Google Arama/Ads', color: '#ea580c', bg: '#fff7ed', border: '#fed7aa', icon: '🔍' },
            REFERRAL: { label: 'Tavsiye / Referans', color: '#4338ca', bg: '#e0e7ff', border: '#c7d2fe', icon: '🤝' },
            WEBSITE: { label: 'Web Sitesi', color: '#0f766e', bg: '#f0fdfa', border: '#99f6e4', icon: '🌐' },
            WALK_IN: { label: 'Yüz Yüze Başvuru', color: '#374151', bg: '#f3f4f6', border: '#e5e7eb', icon: '🚶' },
            EVENT: { label: 'Etkinlik / Fuar', color: '#9333ea', bg: '#faf5ff', border: '#e9d5ff', icon: '🎪' },
            OTHER: { label: 'Diğer', color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0', icon: '📍' }
        };
        if (map[c.leadSource]) return map[c.leadSource];
    }
    if (c.source === 'MANUAL') {
        return { label: 'Manuel Eklendi', color: '#475569', bg: '#f8fafc', border: '#e2e8f0', icon: '✍️' };
    }
    if (c.source === 'GYMPRO') {
        return { label: 'GymPro', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0', icon: '⚡' };
    }
    if (c.source === 'PROBEL') {
        return { label: 'Probel HBYS', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd', icon: '⚡' };
    }
    if (c.source === 'IMPORT') {
        return { label: 'İçe Aktarım', color: '#0d9488', bg: '#f0fdfa', border: '#99f6e4', icon: '📁' };
    }
    return { label: c.source || 'Sistem Kaydı', color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0', icon: 'ℹ️' };
};

const getContactCreationSource = (c) => {
    return getContactCreationSourceInfo(c).label;
};

// Harici sistemlerle aktif senkronizasyon (GymPro, Probel, API vb.)
const getContactSyncInfo = (c) => {
    if (!c) return null;
    let safeTags = c.tags;
    if (typeof safeTags === 'string') {
        try { safeTags = JSON.parse(safeTags); } catch { safeTags = []; }
    }
    if (Array.isArray(safeTags)) {
        if (safeTags.some(t => String(t).toLowerCase().includes('gympro'))) {
            return { isSynced: true, provider: 'GymPro', label: 'GymPro', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' };
        }
        if (safeTags.some(t => String(t).toLowerCase().includes('probel'))) {
            return { isSynced: true, provider: 'Probel', label: 'Probel HBYS', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' };
        }
    }
    if (c.source === 'GYMPRO') {
        return { isSynced: true, provider: 'GymPro', label: 'GymPro', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' };
    }
    if (c.source === 'PROBEL') {
        return { isSynced: true, provider: 'Probel', label: 'Probel HBYS', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' };
    }
    if (c.source === 'API') {
        return { isSynced: true, provider: 'API', label: 'API Entegrasyonu', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' };
    }
    return null;
};

// Dosya / Toplu İçe Aktarım (Excel, CSV, importGroup)
const getContactImportInfo = (c) => {
    if (!c) return null;
    let safeTags = c.tags;
    if (typeof safeTags === 'string') {
        try { safeTags = JSON.parse(safeTags); } catch { safeTags = []; }
    }
    const importTag = Array.isArray(safeTags) ? safeTags.find(t => {
        const s = String(t).toLowerCase();
        return s.includes('excel') || s.includes('import') || s.includes('.xlsx') || s.includes('.csv');
    }) : null;

    if (c.importGroup) {
        return {
            isImported: true,
            provider: 'Excel / CSV',
            groupName: c.importGroup,
            label: c.importGroup,
            fullLabel: `Excel (${c.importGroup})`,
            color: '#0d9488',
            bg: '#f0fdfa',
            border: '#99f6e4'
        };
    }
    if (c.source === 'IMPORT' || importTag) {
        return {
            isImported: true,
            provider: 'Excel / CSV',
            groupName: importTag || null,
            label: importTag ? `${importTag}` : 'Excel Aktarımı',
            fullLabel: importTag ? `Excel (${importTag})` : 'Excel İçe Aktarımı',
            color: '#0d9488',
            bg: '#f0fdfa',
            border: '#99f6e4'
        };
    }
    return null;
};

// Kategori seçenekleri
const CATEGORY_OPTIONS = [
    { value: 'NEW', label: 'Yeni', color: '#3b82f6' },
    { value: 'CUSTOMER', label: 'Müşteriler', color: '#10b981' },
    { value: 'OPPORTUNITY', label: 'Fırsatlar', color: '#f59e0b' },
    { value: 'VIP', label: 'VIP', color: '#8b5cf6' },
    { value: 'PARTNER', label: 'İş Ortakları', color: '#3b82f6' },
    { value: 'SPAM', label: 'Spam', color: '#ef4444' },
    { value: 'BLACKLIST', label: 'Kara Liste', color: '#1f2937' }
];

const getScoreColor = (temp) => ({
  COLD: '#3b82f6', COOL: '#22c55e', WARM: '#eab308', HOT: '#f97316', FIRE: '#ef4444'
})[temp] || '#94a3b8';

const getScoreBgColor = (temp) => ({
  COLD: '#eff6ff', COOL: '#f0fdf4', WARM: '#fefce8', HOT: '#fff7ed', FIRE: '#fef2f2'
})[temp] || '#f1f5f9';

const getScoreEmoji = (temp) => ({
  COLD: '🔵', COOL: '🟢', WARM: '🟡', HOT: '🟠', FIRE: '🔴'
})[temp] || '⬜';

const getScoreLabel = (temp) => ({
  COLD: 'Soğuk', COOL: 'Ilık', WARM: 'Sıcak', HOT: 'Çok Sıcak', FIRE: 'Yanıyor'
})[temp] || 'Bilinmiyor';


// Inline ReminderList component
const ReminderList = ({ workspaceId, contactName, contactPhone }) => {
    const [reminders, setReminders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadReminders = async () => {
            if (!workspaceId || !contactName) {
                setLoading(false);
                return;
            }
            try {
                const now = new Date();
                const pastDate = new Date();
                pastDate.setDate(pastDate.getDate() - 30); // Include last 30 days
                const futureDate = new Date();
                futureDate.setMonth(futureDate.getMonth() + 3);

                const response = await appointmentAPI.getAll(workspaceId, {
                    startDate: pastDate.toISOString(), // Include past appointments
                    endDate: futureDate.toISOString()
                });

                // Filter reminders for this contact (exclude completed)
                const contactReminders = (response.data.appointments || []).filter(apt =>
                    (apt.contactName === contactName || apt.contactPhone === contactPhone) &&
                    apt.status !== 'COMPLETED'
                );
                setReminders(contactReminders);
            } catch (err) {
                console.error('Load reminders error:', err);
            } finally {
                setLoading(false);
            }
        };
        loadReminders();
    }, [workspaceId, contactName, contactPhone]);

    if (loading) return <div className="reminder-list-loading"><Loader size={14} /> Yükleniyor...</div>;
    if (reminders.length === 0) return null;

    const handleCompleteReminder = async (reminderId) => {
        try {
            await appointmentAPI.update(workspaceId, reminderId, { status: 'COMPLETED' });
            setReminders(prev => prev.filter(r => r.id !== reminderId));
        } catch (err) {
            console.error('Complete reminder error:', err);
            alert('Hatırlatıcı tamamlanırken hata oluştu.');
        }
    };

    // Sort reminders: overdue first, then by date
    const now = new Date();
    const sortedReminders = [...reminders].sort((a, b) => {
        const aOverdue = new Date(a.endTime) < now;
        const bOverdue = new Date(b.endTime) < now;
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
        return new Date(a.startTime) - new Date(b.startTime);
    });

    return (
        <div className="reminder-list">
            {sortedReminders.map(reminder => {
                const isOverdue = new Date(reminder.endTime) < now;
                return (
                    <div key={reminder.id} className={`reminder-item ${isOverdue ? 'reminder-item-overdue' : ''}`}>
                        <div className="reminder-item-content">
                            <div className="reminder-item-time">
                                <Clock size={12} />
                                {new Date(reminder.startTime).toLocaleDateString('tr-TR', {
                                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                                })}
                            </div>
                            <div className="reminder-item-desc">{reminder.description || reminder.title}</div>
                        </div>
                        <button
                            className="reminder-complete-btn"
                            onClick={() => handleCompleteReminder(reminder.id)}
                            title="Tamamlandı olarak işaretle"
                        >
                            <Check size={14} />
                        </button>
                    </div>
                );
            })}
        </div>
    );
};

const ContactSidebar = ({ conversationId, contactId, isOpen, members = [], onAssign, isOwner, externalProfile = null, readOnly = false, onClose, onConversationOpen, teams = [], onAssignTeam, onAssignUser, onTakeOver, conversationData = null, currentUserId = null, onActivitySaved = null, onOpenConversationPopup = null, onConversationStatusChange = null, funnelOptions = [], initialAction = null }) => {
    const { currentWorkspace, onlineUsers, user } = useAuth();
    const navigate = useNavigate();

    // Safe helper to check online status without crashing if onlineUsers is not a Map
    const isUserOnline = (userId, userObj) => {
        try {
            if (onlineUsers && typeof onlineUsers.get === 'function') {
                const status = onlineUsers.get(userId);
                if (status && status.isOnline !== undefined) return Boolean(status.isOnline);
            }
            return Boolean(userObj?.isOnline);
        } catch {
            return false;
        }
    };
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isAddingTag, setIsAddingTag] = useState(false);
    const [newTag, setNewTag] = useState('');
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [summary, setSummary] = useState('');
    const [topic, setTopic] = useState('');
    const [summarizing, setSummarizing] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isBlocking, setIsBlocking] = useState(false);
    const [showBlockConfirm, setShowBlockConfirm] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deals, setDeals] = useState([]);
    const [dealsLoading, setDealsLoading] = useState(false);
    const [contactConversations, setContactConversations] = useState([]);
    const [localConvOverride, setLocalConvOverride] = useState(null);
    const [attributions, setAttributions] = useState([]);

    useEffect(() => {
        const fetchId = contactId || profile?.id;
        if (currentWorkspace?.id && fetchId) {
            import('../../services/api').then(({ default: api }) => {
                api.get(`/contacts/${currentWorkspace.id}/${fetchId}/attributions`)
                    .then(res => setAttributions(res.data?.attributions || []))
                    .catch(() => {});
            });
        }
    }, [contactId, profile?.id, currentWorkspace?.id]);

    // Sync localConvOverride when conversationData prop changes from parent (e.g. assignment or funnel change from Inbox header)
    useEffect(() => {
        if (conversationData && localConvOverride) {
            const changed =
                conversationData.assignedToId !== localConvOverride.assignedToId ||
                conversationData.teamIds !== localConvOverride.teamIds ||
                conversationData.funnelStageId !== localConvOverride.funnelStageId ||
                conversationData.funnelType !== localConvOverride.funnelType;
            if (changed) {
                setLocalConvOverride(prev => ({
                    ...prev,
                    assignedToId: conversationData.assignedToId,
                    assignedTo: conversationData.assignedTo,
                    teamIds: conversationData.teamIds,
                    funnelStageId: conversationData.funnelStageId,
                    funnelType: conversationData.funnelType
                }));
            }
        }
    }, [conversationData?.assignedToId, conversationData?.teamIds, conversationData?.funnelStageId, conversationData?.funnelType]);

    const [newNote, setNewNote] = useState('');
    const [savingNote, setSavingNote] = useState(false);
    const [notesExpanded, setNotesExpanded] = useState(false);
    const [expandedNotes, setExpandedNotes] = useState({});
    const [isEditingName, setIsEditingName] = useState(false);
    const [isEditingFullName, setIsEditingFullName] = useState(false);
    const [isEditingCompany, setIsEditingCompany] = useState(false);
    const [contactSegments, setContactSegments] = useState([]);
    const [segmentsExpanded, setSegmentsExpanded] = useState(() => {
        try {
            return localStorage.getItem('instomer_sidebar_segments_expanded') === 'true';
        } catch {
            return false;
        }
    });

    const toggleSegmentsExpanded = () => {
        setSegmentsExpanded(prev => {
            const next = !prev;
            try { localStorage.setItem('instomer_sidebar_segments_expanded', String(next)); } catch {}
            return next;
        });
    };
    const [funnelStage, setFunnelStage] = useState(null); // { name, color } of the current funnel stage
    const [activeCaseInfo, setActiveCaseInfo] = useState(null); // { caseNumber, caseId, title } from CaseCards
    const [allCases, setAllCases] = useState([]); // all cases for this contact

    // Deduplicate and merge same-case records, but preserve truly different cases!
    const sanitizeCases = (rawList) => {
        if (!Array.isArray(rawList) || rawList.length === 0) return [];
        
        // 1. Manuel veya otomatik birleştirilmiş ("Birleştirildi") olanları ayıkla
        const unmerged = rawList.filter(c => c && !c.description?.includes('Birleştirildi'));
        const listToProcess = unmerged.length > 0 ? unmerged : rawList;

        // 2. caseNumber (kısa ve tam) bazında grupla; aynı numaralı mükerrerleri BİRLEŞTİR, farklı numaralı olanları AYRI tut
        const groupedByNumber = new Map();
        const noNumberCases = [];

        for (const c of listToProcess) {
            if (!c || !c.id) continue;
            const rawNum = c.caseNumber ? String(c.caseNumber).trim() : null;
            const shortNum = rawNum ? (rawNum.includes('-') && rawNum.length > 8 ? rawNum.split('-').pop() : rawNum) : null;
            const groupKey = shortNum ? shortNum.toLowerCase() : null;

            if (!groupKey) {
                noNumberCases.push(c);
                continue;
            }

            if (!groupedByNumber.has(groupKey)) {
                groupedByNumber.set(groupKey, { ...c, _allIds: [c.id] });
            } else {
                // AYNI CASE NUMARASINA SAHİP MÜKERRER KAYIT BULUNDU -> BİRLEŞTİR
                const existing = groupedByNumber.get(groupKey);
                existing._allIds = existing._allIds || [existing.id];
                if (!existing._allIds.includes(c.id)) {
                    existing._allIds.push(c.id);
                }

                // Konuşmaları birleştir
                const existingConvs = existing.conversations || [];
                const newConvs = c.conversations || [];
                const convIdSet = new Set(existingConvs.map(cv => cv.id));
                for (const cv of newConvs) {
                    if (!convIdSet.has(cv.id)) {
                        existingConvs.push(cv);
                        convIdSet.add(cv.id);
                    }
                }
                existing.conversations = existingConvs;

                // Aktiviteleri birleştir
                const existingActs = existing.activities || [];
                const newActs = c.activities || [];
                const actIdSet = new Set(existingActs.map(a => a.id));
                for (const a of newActs) {
                    if (!actIdSet.has(a.id)) {
                        existingActs.push(a);
                        actIdSet.add(a.id);
                    }
                }
                existing.activities = existingActs;

                // Başlık kontrolü: Eğer mevcudun başlığı generic ise ama yeni kaydın başlığı doluysa güncelle
                const GENERIC = ['💬 WhatsApp', '💬 Facebook', '💬 Instagram', '📧 E-posta', '📞 Telefon', '🌐 Web Widget', '📝 Form', 'Yeni İletişim', 'Yeni Case', '-', '—', ''];
                if ((!existing.title || GENERIC.includes(existing.title.trim())) && c.title && !GENERIC.includes(c.title.trim())) {
                    existing.title = c.title;
                }

                // Eksik alanları tamamla
                if (!existing.funnelStageId && c.funnelStageId) existing.funnelStageId = c.funnelStageId;
                if (!existing.funnelType && c.funnelType) existing.funnelType = c.funnelType;
                if (!existing.categoryId && c.categoryId) existing.categoryId = c.categoryId;
                if (!existing.caseTypeId && c.caseTypeId) existing.caseTypeId = c.caseTypeId;
                if (existing.status !== 'ACTIVE' && c.status === 'ACTIVE') existing.status = 'ACTIVE';
            }
        }

        return [...groupedByNumber.values(), ...noNumberCases];
    };

    const distinctCases = useMemo(() => sanitizeCases(allCases), [allCases]);
    const [caseIdOpenCaseId, setCaseIdOpenCaseId] = useState(null);
    const [showNewCaseInline, setShowNewCaseInline] = useState(false);
    const [newCaseTitle, setNewCaseTitle] = useState('');
    const [categoryOpenCaseId, setCategoryOpenCaseId] = useState(null);
    const [availableCategories, setAvailableCategories] = useState([]);
    const [categorySearch, setCategorySearch] = useState('');
    const [branchOpenCaseId, setBranchOpenCaseId] = useState(null);
    const [availableBranches, setAvailableBranches] = useState([]);
    const [branchSearch, setBranchSearch] = useState('');
    const [creatingCase, setCreatingCase] = useState(false);
    const [catalogProducts, setCatalogProducts] = useState([]);
    const [productSearchText, setProductSearchText] = useState('');
    const [productOpenCaseId, setProductOpenCaseId] = useState(null);
    const [showExtraFields, setShowExtraFields] = useState(false);
    const [caseStatusDropdownOpenCaseId, setCaseStatusDropdownOpenCaseId] = useState(null);
    const [expandedCases, setExpandedCases] = useState({});
    const [assignMegaMenuOpenCaseId, setAssignMegaMenuOpenCaseId] = useState(null);


    // Grup state'leri
    const [allGroups, setAllGroups] = useState([]);
    const [contactGroups, setContactGroups] = useState([]); // Bu kişinin dahil olduğu grup ID'leri
    const [groupSaving, setGroupSaving] = useState(false);

    // Reminder states
    const [showReminderModal, setShowReminderModal] = useState(initialAction === 'REMINDER');
    const [reminderSaving, setReminderSaving] = useState(false);

    // Call popup states
    const [showCallPopup, setShowCallPopup] = useState(false);
    const [callScheduleMode, setCallScheduleMode] = useState(false);
    const [scheduledDateTime, setScheduledDateTime] = useState('');
    const [schedulingCall, setSchedulingCall] = useState(false);
    const [callingInProgress, setCallingInProgress] = useState(false);
    const [retellAgentsLoading, setRetellAgentsLoading] = useState(false);
    const [targetCallPhone, setTargetCallPhone] = useState('');
    const [callRefreshKey, setCallRefreshKey] = useState(0);
    const [retellAgents, setRetellAgents] = useState([]);
    const [selectedAgentId, setSelectedAgentId] = useState('');
    const [selectedRetellTemplateId, setSelectedRetellTemplateId] = useState(null);
    const [retellCallTemplates, setRetellCallTemplates] = useState([]);

    // Case Timeline Quick Action & Internal Note states
    const [caseActionMenuOpenId, setCaseActionMenuOpenId] = useState(null);
    const [showInternalNoteModal, setShowInternalNoteModal] = useState(false);
    const [internalNoteContent, setInternalNoteContent] = useState('');
    const [internalNoteCaseId, setInternalNoteCaseId] = useState(null);
    const [savingInternalNote, setSavingInternalNote] = useState(false);

    // AI Sesli Arama Modalı Açıcı (Hatasız ve güvenli veri yükleme)
    const handleOpenAiCall = (phoneToCall) => {
        const raw = phoneToCall || profile?.phone;
        if (!raw) {
            return alert('Arama yapılacak telefon numarası bulunamadı.');
        }
        const normalized = normalizePhone(raw);
        setTargetCallPhone(normalized);
        setCallScheduleMode(false);
        setScheduledDateTime('');
        setSelectedAgentId('');
        setSelectedRetellTemplateId(null);
        setShowCallPopup(true);
        setRetellAgentsLoading(true);

        if (currentWorkspace?.id) {
            retellAPI.getAgents(currentWorkspace.id)
                .then(res => {
                    const list = res.data?.agents || res.data?.data || (Array.isArray(res.data) ? res.data : []);
                    setRetellAgents(Array.isArray(list) ? list : []);
                })
                .catch(err => {
                    console.warn('⚠️ [Retell] Agent listesi yüklenemedi:', err?.message);
                    setRetellAgents([]);
                })
                .finally(() => {
                    setRetellAgentsLoading(false);
                });

            retellAPI.getTemplates(currentWorkspace.id)
                .then(res => {
                    const list = res.data?.data || res.data?.templates || (Array.isArray(res.data) ? res.data : []);
                    setRetellCallTemplates(Array.isArray(list) ? list : []);
                })
                .catch(err => {
                    console.warn('⚠️ [Retell] Şablon listesi yüklenemedi:', err?.message);
                    setRetellCallTemplates([]);
                });
        }
    };

    const [reminderForm, setReminderForm] = useState({
        reminderDate: '',
        assignedToId: '',
        description: ''
    });

    // New Activity Timeline States
    const [plannedTimeline, setPlannedTimeline] = useState([]);
    const [pastTimeline, setPastTimeline] = useState([]);
    const [timelineLoading, setTimelineLoading] = useState(false);
    const [showActivityModal, setShowActivityModal] = useState(!!initialAction && initialAction !== 'REMINDER');
    // Local atama state — API cevabı beklemeden dropdown anında güncellenir
    const [localTeamId, setLocalTeamId] = useState(() => {
        const t = conversationData?.teamIds;
        return t ? (JSON.parse(t)[0] || '') : '';
    });
    const [localAgentId, setLocalAgentId] = useState(() => conversationData?.assignedToId || '');

    // Assignment dropdown menu states
    const [assignMegaMenuOpen, setAssignMegaMenuOpen] = useState(false);
    const [assignMegaMenuPos, setAssignMegaMenuPos] = useState({ top: 0, left: 0 });
    const [assignSelectedTeam, setAssignSelectedTeam] = useState(null);
    const [takingOver, setTakingOver] = useState(false);
    const assignMegaMenuRef = useRef(null);
    const assignMenuDivRef = useRef(null);
    const [editingActivity, setEditingActivity] = useState(null); // { id, description, title }
    const [editActivityText, setEditActivityText] = useState('');
    const [editingActivityId, setEditingActivityId] = useState(null); // For modal edit mode
    const [activityForm, setActivityForm] = useState({
        type: (initialAction && initialAction !== 'REMINDER') ? initialAction : 'NOTE',
        title: '',
        description: '',
        dueDate: '',
        assignedToId: '',
        teamId: '',
        funnelStageId: ''
    });
    const [activitySaving, setActivitySaving] = useState(false);
    const [completingActivity, setCompletingActivity] = useState(null);
    const [completeResult, setCompleteResult] = useState('');
    const [completeCallSuccess, setCompleteCallSuccess] = useState(null); // true/false/null
    const [completeCallSentiment, setCompleteCallSentiment] = useState(null); // 'Positive'/'Neutral'/'Negative'
    const [activityFunnels, setActivityFunnels] = useState([]); // stage seçici için
    const [popupConversationId, setPopupConversationId] = useState(null); // Chat popup state
    const [callCompleted, setCallCompleted] = useState(true); // Arama tamamlandı mı? checkbox
    const [noteCallSuccess, setNoteCallSuccess] = useState(null); // true/false/null — not modalındaki başarı durumu
    const [noteCallSentiment, setNoteCallSentiment] = useState(null); // 'Positive'/'Neutral'/'Negative' — not modalındaki sentiment
    const [existingPlannedCall, setExistingPlannedCall] = useState(null); // Açık planlanmış arama varsa
    const [completePlannedCall, setCompletePlannedCall] = useState(true); // Default tikli — planlı aramayı tamamla
    const [postNoteAction, setPostNoteAction] = useState(null); // { funnelStageId, teamId, assignedToId } — not sonrası aksiyon
    const [expandedMilestone, setExpandedMilestone] = useState(null); // Sohbet akışı popup
    const [caseStageMegaOpen, setCaseStageMegaOpen] = useState(false);
    const [caseStageMegaPos, setCaseStageMegaPos] = useState({ top: 0, left: 0 });
    const [caseStageMegaHoverFunnel, setCaseStageMegaHoverFunnel] = useState(null);
    const caseStageMegaRef = useRef(null);
    const [aiCalls, setAiCalls] = useState([]);
    const [selectedAiCall, setSelectedAiCall] = useState(null);
    const [translatedSummary, setTranslatedSummary] = useState('');
    const [translatingSum, setTranslatingSum] = useState(false);
    const translationCache = useRef({});

    // Inline Quote Form State
    const [showQuoteForm, setShowQuoteForm] = useState(false);
    const [quoteFormData, setQuoteFormData] = useState({
        title: '',
        description: '',
        amount: '',
        currency: 'TRY',
        products: [{ name: '', quantity: 1, unitPrice: 0 }],
        notes: '',
        caseId: ''
    });
    const [quoteSubmitting, setQuoteSubmitting] = useState(false);

    // Inline Order Form State
    const [showOrderForm, setShowOrderForm] = useState(false);
    const [orderFormData, setOrderFormData] = useState({
        title: '',
        description: '',
        currency: 'TRY',
        products: [{ name: '', quantity: 1, unitPrice: 0 }],
        notes: '',
        caseId: '',
        protocolNo: '',
        assignedToId: ''
    });
    const [orderSubmitting, setOrderSubmitting] = useState(false);

    // Inline Invoice Form State
    const [showInvoiceForm, setShowInvoiceForm] = useState(false);
    const [invoiceFormData, setInvoiceFormData] = useState({
        title: '',
        currency: 'TRY',
        taxRate: 20,
        dueDate: '',
        products: [{ name: '', quantity: 1, unitPrice: 0 }],
        notes: '',
        caseId: ''
    });
    const [invoiceSubmitting, setInvoiceSubmitting] = useState(false);

    // Deal detail popup (from timeline click)
    const [selectedDealDetail, setSelectedDealDetail] = useState(null);

    // Note edit popup state
    const [editingNoteData, setEditingNoteData] = useState(null); // { id, content, description, date, sourceType }
    const [editNoteText, setEditNoteText] = useState('');

    // Takeover confirmation popup
    const [showTakeoverModal, setShowTakeoverModal] = useState(false);

    // If external profile is provided (e.g., for comments), use it directly
    useEffect(() => {
        if (externalProfile) {
            const normalized = { ...externalProfile };
            if (normalized.phone) normalized.phone = normalizePhone(normalized.phone);
            // Ensure tags is always an array
            if (normalized.tags && typeof normalized.tags === 'string') {
                try { normalized.tags = JSON.parse(normalized.tags); } catch { normalized.tags = []; }
            }
            if (normalized.tags && !Array.isArray(normalized.tags)) normalized.tags = [];
            setProfile(normalized);
            setLoading(false);
            setError(null);
        }
    }, [externalProfile]);

    useEffect(() => {
        if (isOpen && conversationId && !externalProfile && !contactId) {
            fetchProfile();
        }
        // Clear analysis when conversation changes
        setSummary('');
        setTopic('');
    }, [isOpen, conversationId, externalProfile, contactId]);

    // Load profile directly from contactId (used by Customers page)
    useEffect(() => {
        if (isOpen && contactId && !conversationId && !externalProfile) {
            fetchProfileByContactId();
        }
    }, [isOpen, contactId, conversationId, externalProfile]);

    // Grupları yükle
    useEffect(() => {
        if (!isOpen || !currentWorkspace?.id) return;
        import('../../services/api').then(({ default: api }) => {
            api.get(`/contact-groups/${currentWorkspace.id}/groups`)
                .then(res => setAllGroups(res.data.groups || []))
                .catch(() => {});
        });
    }, [isOpen, currentWorkspace?.id]);

    // Ürün kataloğunu yükle
    useEffect(() => {
        if (!isOpen || !currentWorkspace?.id) return;
        productAPI.getAll(currentWorkspace.id, { isGroup: false, limit: 500 }).then(res => {
            setCatalogProducts(res.data?.products || res.data || []);
        }).catch(() => {});
    }, [isOpen, currentWorkspace?.id]);

    // Kişinin gruplarını yükle
    useEffect(() => {
        if (!isOpen || !profile?.id || !currentWorkspace?.id) return;
        import('../../services/api').then(({ default: api }) => {
            api.get(`/contact-groups/${currentWorkspace.id}/contacts/${profile.id}/groups`)
                .then(res => setContactGroups((res.data.groups || []).map(g => g.id)))
                .catch(() => {});
        });
    }, [isOpen, profile?.id, currentWorkspace?.id]);

    // Kişinin dahil olduğu akıllı segmentleri yükle
    useEffect(() => {
        if (!isOpen || !profile?.id || !currentWorkspace?.id) return;
        setContactSegments([]);
        import('../../services/api').then(({ default: api }) => {
            api.get(`/smart-segments/${currentWorkspace.id}/segments/contact/${profile.id}`)
                .then(res => setContactSegments(res.data.segments || []))
                .catch(() => {});
        });
    }, [isOpen, profile?.id, currentWorkspace?.id]);

    // conversationData prop değişince local atama state'ini sync et
    useEffect(() => {
        setLocalConvOverride(null); // Reset override when conversation changes
        if (conversationData) {
            const tid = conversationData.teamIds ? (JSON.parse(conversationData.teamIds)[0] || '') : '';
            setLocalTeamId(tid);
            setLocalAgentId(conversationData.assignedToId || '');
        }
    }, [conversationData?.teamIds, conversationData?.assignedToId]);

    // AI Aramaları — fetch call history
    useEffect(() => {
        if (!currentWorkspace?.id || !profile?.id) return;
        retellAPI.getCallHistory(currentWorkspace.id, { contactId: profile.id, limit: 10 })
            .then(res => setAiCalls(res.data.calls || []))
            .catch(() => {});
    }, [currentWorkspace?.id, profile?.id, callRefreshKey]);

    // AI Araması özet çevirisi — İngilizce ise otomatik Türkçeye çevir
    const aiCallSummaryToTranslate = selectedAiCall?.summary || (expandedMilestone?._type === 'CALL' && expandedMilestone?._aiCalls?.[0]?.summary) || null;
    useEffect(() => {
        if (!aiCallSummaryToTranslate || !currentWorkspace?.id) {
            setTranslatedSummary('');
            return;
        }
        const summary = aiCallSummaryToTranslate;
        // Cache kontrolü
        if (translationCache.current[summary]) {
            setTranslatedSummary(translationCache.current[summary]);
            return;
        }
        // Basit İngilizce tespiti — yaygın İngilizce kelimeler varsa çevir
        const engWords = /\b(the|and|was|for|with|that|this|from|they|have|been|were|are|but|not|will|would|could|should|about|their|which|when|what|your|each|make|like|has|him|her|had|its|than|been|who|did|get|may|more|now|out|very|also|back|after|use|how|our|just|most|new|some|time|call|over|such|into|only|other|then|them|these|two|first|being|between|does|down|where|during|while|upon|those|still|both|before|through|same|right|going|much|because|under|another|appointment|scheduled|confirmed|discussed|provided|pricing|details|focused|ended|positively|successfully|contacted|agent|customer|conversation|regarding)\b/gi;
        const matches = summary.match(engWords) || [];
        if (matches.length < 3) {
            setTranslatedSummary(summary); // Zaten Türkçe
            return;
        }
        setTranslatingSum(true);
        setTranslatedSummary('');
        aiAPI.instoBotChat(currentWorkspace.id, summary, [], true
        ).then(res => {
            const tr = (res.data?.translation || res.data?.reply || summary).replace(/^"|"$/g, '');
            translationCache.current[summary] = tr;
            setTranslatedSummary(tr);
        }).catch(() => {
            setTranslatedSummary('Çeviri yapılamadı.');
        }).finally(() => setTranslatingSum(false));
    }, [aiCallSummaryToTranslate, currentWorkspace?.id]);

    // Sync assignment mega menu position on window resize and scroll
    useEffect(() => {
        if (!assignMegaMenuOpen) return;

        const updatePosition = () => {
            if (assignMegaMenuRef.current) {
                const trigger = assignMegaMenuRef.current.querySelector('.stage-mega-trigger');
                if (trigger) {
                    const rect = trigger.getBoundingClientRect();
                    const menuWidth = assignMenuDivRef.current ? assignMenuDivRef.current.getBoundingClientRect().width : 342;
                    setAssignMegaMenuPos({
                        top: rect.bottom + 6,
                        left: Math.max(10, rect.right - menuWidth)
                    });
                }
            }
        };

        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);

        // Initial update
        updatePosition();

        // Refine position in the next cycle to capture measured DOM width
        const timer = setTimeout(updatePosition, 0);

        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
            clearTimeout(timer);
        };
    }, [assignMegaMenuOpen]);

    // Listen for funnel stage changes (from Pipeline view or other sources)
    useEffect(() => {
        const handler = async (e) => {
            const { conversationId: updatedId, funnelStageId, stageName, stageColor } = e.detail || {};
            if (updatedId !== conversationId) return; // Not our conversation

            if (!funnelStageId) {
                setFunnelStage(null);
                return;
            }

            // If stage name/color already included in event, use directly (no extra API call)
            if (stageName) {
                setFunnelStage({ id: funnelStageId, name: stageName, color: stageColor || '#6366f1' });
                return;
            }

            // Fallback: look up in funnelAPI
            if (!currentWorkspace?.id) return;
            try {
                const funnelsRes = await funnelAPI.getAll(currentWorkspace.id);
                const funnels = funnelsRes.data?.funnels || [];
                let found = null;
                for (const funnel of funnels) {
                    const stage = (funnel.stages || []).find(s => s.id === funnelStageId);
                    if (stage) { found = stage; break; }
                }
                setFunnelStage(found);
            } catch {
                setFunnelStage(null);
            }
        };
        window.addEventListener('websocket:funnel_stage_updated', handler);
        return () => window.removeEventListener('websocket:funnel_stage_updated', handler);
    }, [conversationId, currentWorkspace?.id]);

    // Case updated (status, title, funnel, assignment) — sync sidebar activeCaseInfo
    useEffect(() => {
        const handleCaseUpdated = (e) => {
            const { caseId, changes } = e.detail || {};
            if (!caseId || !activeCaseInfo || activeCaseInfo.caseId !== caseId) return;
            setActiveCaseInfo(prev => {
                if (!prev) return prev;
                const updates = {};
                if (changes.title !== undefined) updates.title = changes.title;
                if (changes.status !== undefined) updates.status = changes.status;
                if (changes.funnelType !== undefined) updates.funnelType = changes.funnelType;
                if (changes.funnelStageId !== undefined) updates.funnelStageId = changes.funnelStageId;
                if (changes.assignedToId !== undefined) updates.assignedToId = changes.assignedToId;
                if (changes.assignedTeamId !== undefined) updates.assignedTeamId = changes.assignedTeamId;
                if (changes.assignedTo !== undefined) updates.assignedTo = changes.assignedTo;
                if (changes.branchId !== undefined) {
                    updates.branchId = changes.branchId;
                    updates.branch = changes.branch !== undefined ? changes.branch : (availableBranches.find(b => b.id === changes.branchId) || null);
                }
                return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
            });
        };

        const handleCaseAssignment = (e) => {
            const { caseId, assignedToId, assignedTeamId, assignedToName } = e.detail || {};
            if (!caseId || !activeCaseInfo || activeCaseInfo.caseId !== caseId) return;
            // activeCaseInfo'yu direkt güncelle — refresh beklemeye gerek yok
            setActiveCaseInfo(prev => {
                if (!prev) return prev;
                const updates = {};
                if (assignedToId !== undefined) updates.assignedToId = assignedToId;
                if (assignedTeamId !== undefined) updates.assignedTeamId = assignedTeamId;
                if (assignedToName) updates.assignedTo = { name: assignedToName };
                else if (assignedToId === null) updates.assignedTo = null;
                return { ...prev, ...updates };
            });
            // Ayrıca CaseCards'ı da refresh et
            window.dispatchEvent(new CustomEvent('case_cards_refresh', { detail: { caseId } }));
        };

        window.addEventListener('websocket:case_updated', handleCaseUpdated);
        window.addEventListener('websocket:case_assignment_updated', handleCaseAssignment);
        return () => {
            window.removeEventListener('websocket:case_updated', handleCaseUpdated);
            window.removeEventListener('websocket:case_assignment_updated', handleCaseAssignment);
        };
    }, [activeCaseInfo?.caseId]);

    // Canlı Lead & Vaka Skor Güncellemesi (Socket Dinleyicisi)
    useEffect(() => {
        const handleCaseScoreUpdated = (e) => {
            const { caseId, score, temperature } = e.detail || {};
            if (!caseId) return;
            setActiveCaseInfo(prev => {
                if (!prev) return prev;
                if (prev.caseId === caseId || prev.id === caseId) {
                    return { ...prev, leadScore: score, leadTemperature: temperature };
                }
                return prev;
            });
            setAllCases(prev => Array.isArray(prev) ? prev.map(c => (c.id === caseId || c.caseId === caseId) ? { ...c, leadScore: score, leadTemperature: temperature } : c) : prev);
        };

        const handleContactScoreUpdated = (e) => {
            const { contactId, score, temperature } = e.detail || {};
            if (!contactId) return;
            setProfile(prev => {
                if (!prev) return prev;
                if (prev.id === contactId) {
                    return { ...prev, leadScore: score, leadTemperature: temperature };
                }
                return prev;
            });
        };

        window.addEventListener('websocket:case_score_updated', handleCaseScoreUpdated);
        window.addEventListener('websocket:contact_score_updated', handleContactScoreUpdated);
        return () => {
            window.removeEventListener('websocket:case_score_updated', handleCaseScoreUpdated);
            window.removeEventListener('websocket:contact_score_updated', handleContactScoreUpdated);
        };
    }, []);

    useEffect(() => {
        if (currentWorkspace?.id) {
            appointmentConfigAPI.getBranches(currentWorkspace.id)
                .then(res => setAvailableBranches(res.data?.branches || []))
                .catch(err => console.error('Failed to load branches in ContactSidebar:', err));

            getTopicCategories(currentWorkspace.id)
                .then(res => setAvailableCategories(res.data || []))
                .catch(err => console.error('Failed to load categories in ContactSidebar:', err));
        }
    }, [currentWorkspace?.id]);

    const fetchProfile = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await facebookAPI.getContactProfile(conversationId);
            const profileData = response.data.profile;
            if (profileData?.phone) profileData.phone = normalizePhone(profileData.phone);
            // Parse JSON string fields to arrays (same as fetchProfileByContactId)
            if (profileData?.tags && typeof profileData.tags === 'string') {
                try { profileData.tags = JSON.parse(profileData.tags); } catch { profileData.tags = []; }
            }
            setProfile(profileData);
            setHasUnsavedChanges(false);

            // Load saved AI topic and summary from conversation
            const conversationResponse = await conversationAPI.getById(currentWorkspace.id, conversationId);
            const conversation = conversationResponse.data.conversation;

            if (conversation?.aiTopic) {
                setTopic(conversation.aiTopic);
            }
            if (conversation?.aiSummary) {
                setSummary(conversation.aiSummary);
            }

            // Load funnel stage for this conversation (Effective Status: Conversation Stage first, then Contact Status)
            const effectiveStageId = conversation?.funnelStageId || profileData?.status;
            if (effectiveStageId && currentWorkspace?.id) {
                try {
                    const funnelsRes = await funnelAPI.getAll(currentWorkspace.id);
                    const funnels = funnelsRes.data?.funnels || [];
                    let found = null;
                    for (const funnel of funnels) {
                        const stage = (funnel.stages || []).find(s => s.id === effectiveStageId);
                        if (stage) { found = stage; break; }
                    }
                    setFunnelStage(found);
                } catch {
                    setFunnelStage(null);
                }
            } else {
                setFunnelStage(null);
            }

            // Fetch deals for this contact
            if (response.data.profile.id && currentWorkspace?.id) {
                fetchDeals(response.data.profile.id);
                fetchContactConversations(response.data.profile.id);
                fetchTimeline(response.data.profile.id);
            }
        } catch (err) {
            console.error('Error fetching contact profile:', err);
            setError('Profil bilgileri alınamadı.');
        } finally {
            setLoading(false);
        }
    };

    // Fetch profile directly from contactId (used by Customers page)
    const fetchProfileByContactId = async () => {
        if (!currentWorkspace?.id || !contactId) return;
        setLoading(true);
        setError(null);
        try {
            const response = await contactAPI.getById(currentWorkspace.id, contactId);
            const contact = response.data.contact;
            if (contact?.phone) contact.phone = normalizePhone(contact.phone);
            // Parse JSON string fields to arrays (only tags — phones/emails stay as JSON strings for rendering)
            if (contact?.tags && typeof contact.tags === 'string') {
                try { contact.tags = JSON.parse(contact.tags); } catch { contact.tags = []; }
            }
            setProfile(contact);
            setHasUnsavedChanges(false);
            setSummary('');
            setTopic('');
            setFunnelStage(null);

            if (contact?.id) {
                fetchDeals(contact.id);
                fetchContactConversations(contact.id);
                fetchTimeline(contact.id);
            }
        } catch (err) {
            console.error('Error fetching contact by ID:', err);
            setError('Profil bilgileri alınamadı.');
        } finally {
            setLoading(false);
        }
    };



    const fetchTimeline = async (profileId) => {
        if (!currentWorkspace?.id || !profileId) return;
        setTimelineLoading(true);
        try {
            const res = await activityAPI.getTimeline(profileId, currentWorkspace.id);
            // Yeni format: { planned: [], past: [] }
            if (res && res.planned !== undefined) {
                setPlannedTimeline(res.planned || []);
                setPastTimeline(res.past || []);
            } else if (Array.isArray(res)) {
                // Eski format uyumluluğu
                setPlannedTimeline([]);
                setPastTimeline(res);
            }
        } catch (err) {
            console.error('Fetch timeline err:', err);
        } finally {
            setTimelineLoading(false);
        }
    };

    // Funnelleri yükle (CALL/MEETING için aşama seçici)
    const loadActivityFunnels = async () => {
        if (!currentWorkspace?.id || activityFunnels.length > 0) return;
        try {
            const res = await funnelAPI.getAll(currentWorkspace.id);
            setActivityFunnels(Array.isArray(res.data) ? res.data : (res.data?.funnels || []));
        } catch { }
    };

    // Sidebar açıldığında funnelleri otomatik yükle (case status select için gerekli)
    useEffect(() => {
        loadActivityFunnels();
    }, [currentWorkspace?.id]);

    // Aktivite modalını konuşmanın mevcut atamasıyla aç
    const openActivityModal = (type, targetCaseId = null) => {
        const effectiveConv = activeConv;
        const defaultAssigneeId = effectiveConv?.assignedToId || '';
        const defaultTeamId = effectiveConv?.teamIds
            ? ((() => { try { return JSON.parse(effectiveConv.teamIds)[0] || ''; } catch { return ''; } })())
            : '';
        const defaultStageId = activeCaseInfo?.funnelStageId || effectiveConv?.funnelStageId || conversationData?.funnelStageId || '';
        setActivityForm({
            type,
            title: '',
            description: '',
            dueDate: '',
            assignedToId: defaultAssigneeId,
            teamId: defaultTeamId,
            funnelStageId: defaultStageId,
            caseId: targetCaseId || activeCaseInfo?.id || (allCases?.length > 0 ? allCases[0].id : '')
        });
        setCallCompleted(true);
        setNoteCallSuccess(null);
        setNoteCallSentiment(null);

        // NOTE tipi açılırken, planlanmış arama var mı kontrol et
        if (type === 'NOTE') {
            const plannedCall = (plannedTimeline || []).find(item =>
                item.sourceType === 'ACTIVITY' &&
                (item.type === 'CALL' || item.type === 'REMINDER') &&
                (item.status === 'PLANNED' || item.status === 'IN_PROGRESS')
            );
            setExistingPlannedCall(plannedCall || null);
            setCompletePlannedCall(true); // Backend halledeceği için her zaman varsayılan olarak seçili
        } else {
            setExistingPlannedCall(null);
            setCompletePlannedCall(false);
        }

        setShowActivityModal(true);
    };

    const openInternalNoteModal = (targetCaseId = null) => {
        setInternalNoteCaseId(targetCaseId || activeCaseInfo?.id || (allCases?.length > 0 ? allCases[0].id : null));
        setInternalNoteContent('');
        setShowInternalNoteModal(true);
    };

    const handleSaveInternalNote = async () => {
        if (!internalNoteContent.trim()) return;
        setSavingInternalNote(true);
        try {
            const noteText = internalNoteContent.trim();
            const activeTargetCaseId = internalNoteCaseId || activeCaseInfo?.id || conversationData?.caseId || (allCases?.length > 0 ? allCases[0].id : null);

            // 1. If conversation exists, post to conversation so it appears in the chat box
            let noteMsg = null;
            if (conversationId && currentWorkspace?.id) {
                try {
                    const res = await conversationAPI.addNote(currentWorkspace.id, conversationId, {
                        content: noteText,
                        isCallNote: false
                    });
                    noteMsg = res.data?.note;
                    window.dispatchEvent(new CustomEvent('internal_note_added', {
                        detail: {
                            conversationId,
                            note: {
                                ...noteMsg,
                                isInternalNote: true,
                                messageType: 'NOTE',
                                sender: user,
                                isFromContact: false
                            }
                        }
                    }));
                } catch (convErr) {
                    console.warn('Conversation note add error:', convErr);
                }
            } else if (profile?.id && currentWorkspace?.id) {
                // 2. If no active conversation, save activity linked to this case
                try {
                    await activityAPI.createActivity(profile.id, {
                        workspaceId: currentWorkspace.id,
                        type: 'NOTE',
                        title: 'Dahili Not',
                        description: noteText,
                        status: 'COMPLETED',
                        completedAt: new Date().toISOString(),
                        caseId: activeTargetCaseId || null,
                        assignedToId: user?.id || null
                    });
                } catch (actErr) {
                    console.warn('Activity note create error:', actErr);
                }
            }

            // 3. Refresh timeline
            if (profile?.id) {
                fetchTimeline(profile.id);
            }

            window.dispatchEvent(new CustomEvent('activity_saved'));
            if (onActivitySaved) onActivitySaved();

            setShowInternalNoteModal(false);
            setInternalNoteContent('');
            setInternalNoteCaseId(null);
        } catch (err) {
            console.error('Error saving internal note:', err);
            alert('Not kaydedilirken hata oluştu.');
        } finally {
            setSavingInternalNote(false);
        }
    };

    useEffect(() => {
        const handleRefresh = () => {
            if (profile?.id) {
                fetchTimeline(profile.id);
            }
        };
        window.addEventListener('refresh_timeline', handleRefresh);
        window.addEventListener('internal_note_added', handleRefresh);
        return () => {
            window.removeEventListener('refresh_timeline', handleRefresh);
            window.removeEventListener('internal_note_added', handleRefresh);
        };
    }, [profile?.id]);

    useEffect(() => {
        if (!caseActionMenuOpenId) return;
        const closeMenu = () => setCaseActionMenuOpenId(null);
        window.addEventListener('click', closeMenu);
        return () => window.removeEventListener('click', closeMenu);
    }, [caseActionMenuOpenId]);

    const openQuoteFormHandler = () => {
        setQuoteFormData(p => ({ ...p, caseId: activeCaseInfo?.id || (allCases?.length > 0 ? allCases[0].id : '') }));
        setShowQuoteForm(true);
    };

    const openOrderFormHandler = () => {
        setOrderFormData(p => ({ 
            ...p, 
            caseId: activeCaseInfo?.id || (allCases?.length > 0 ? allCases[0].id : ''),
            assignedToId: user?.id || ''
        }));
        setShowOrderForm(true);
    };

    const openInvoiceFormHandler = () => {
        setInvoiceFormData(p => ({ ...p, caseId: activeCaseInfo?.id || (allCases?.length > 0 ? allCases[0].id : '') }));
        setShowInvoiceForm(true);
    };

    const handleSaveActivity = async () => {
        if (!profile || !profile.id) return;
        if (!activityForm.type) return;

        // Validation based on type
        if (activityForm.type === 'NOTE' && !activityForm.description.trim()) {
            return alert('Görüşme notu boş olamaz.');
        }
        if (activityForm.type === 'NOTE' && noteCallSuccess === null) {
            return alert('Lütfen aramanın durumunu (Başarılı / Başarısız / Ulaşılamadı) seçin.');
        }
        if (activityForm.type === 'NOTE' && noteCallSuccess === 'SUCCESS' && !noteCallSentiment) {
            return alert('Lütfen görüşmenin nasıl geçtiğini seçin.');
        }
        
        if ((activityForm.type === 'REMINDER' || activityForm.type === 'MEETING') && (!activityForm.dueDate || !activityForm.description.trim())) {
            return alert('Tarih ve açıklama girmelisiniz.');
        }
        
        if (activityForm.type === 'TASK' && (!activityForm.title.trim() || !activityForm.assignedToId)) {
            return alert('Görev başlığı ve atanacak kişi zorunludur.');
        }
        if (!activityForm.caseId && !editingActivityId) {
            return alert('Lütfen bu işlem için bir Case seçiniz (Zorunlu).');
        }

        setActivitySaving(true);
        try {
            // NOTE tipi → her zaman Arama Notu (CALL+COMPLETED) olarak kaydedilir
            const isNoteType = activityForm.type === 'NOTE';
            const isCallNote = isNoteType;
            const dataToSave = {
                workspaceId: currentWorkspace.id,
                type: isCallNote ? 'CALL' : activityForm.type,
                title: isCallNote ? 'Telefon Görüşmesi' : (activityForm.title || (activityForm.type === 'REMINDER' ? 'Hatırlatıcı' : 'Aktivite')),
                description: (isCallNote && noteCallSuccess === 'FAILED') ? `📵 Ulaşılamadı: ${activityForm.description}` : activityForm.description,
                dueDate: isNoteType ? new Date().toISOString() : (activityForm.dueDate ? new Date(activityForm.dueDate).toISOString() : null),
                assignedToId: isNoteType ? null : (activityForm.assignedToId || null),
                teamId: activityForm.teamId || null,
                ...(isNoteType && { status: 'COMPLETED', completedAt: new Date().toISOString() }),
                ...(isCallNote && noteCallSuccess !== null && { callSuccessful: noteCallSuccess === 'SUCCESS' }),
                ...(isCallNote && noteCallSentiment && noteCallSuccess === 'SUCCESS' && { callSentiment: noteCallSentiment }),
                ...(isCallNote && completePlannedCall && { completePlannedCall: true }),
                ...(activityForm.caseId ? { caseId: activityForm.caseId } : {})
            };

            let activityResponse = null;
            if (editingActivityId) {
                // Update existing activity
                const rawId = editingActivityId.replace(/^act_/, '');
                await activityAPI.updateActivity(rawId, dataToSave);
            } else {
                // Create new activity
                activityResponse = await activityAPI.createActivity(profile.id, dataToSave);
            }

            // 🤖 Otomatik aktivite planlandıysa bildir
            const autoAct = activityResponse?.data?.autoActivity;
            if (autoAct) {
                setTimeout(() => {
                    alert(`🤖 Akıllı Planlama\n\n${autoAct.summary}\n\nAktivite otomatik oluşturuldu!`);
                }, 200);
            }

            // CALL veya MEETING planlandıysa → conversation'ı ilgili aşamaya taşı
            // NOT: NOTE tipi (görüşme notu) için aşama değişikliği YAPILMAZ
            if (!isNoteType && (activityForm.type === 'CALL' || activityForm.type === 'MEETING') && activityForm.dueDate) {
                let targetStageId = activityForm.funnelStageId;

                // Seçili stage yoksa → workspace'te "Görüşme Planlandı" veya "Arama Planlandı" aşamasını bul
                if (!targetStageId) {
                    try {
                        const fRes = await funnelAPI.getAll(currentWorkspace.id);
                        const allStages = (Array.isArray(fRes.data) ? fRes.data : (fRes.data?.funnels || [])).flatMap(f => f.stages || []);
                        const keywords = activityForm.type === 'CALL'
                            ? ['arama planlandı', 'görüşme planlandı', 'aranacak', 'arama']
                            : ['görüşme planlandı', 'görüşme', 'toplantı planlandı'];
                        const match = allStages.find(s => keywords.some(k => s.name.toLowerCase().includes(k)));
                        if (match) targetStageId = match.id;
                    } catch { }
                }

                // ConversationId'yi profile üzerinden al
                if (targetStageId && conversationId) {
                    try {
                        await conversationAPI.updateFunnel(currentWorkspace.id, conversationId, { funnelStageId: targetStageId });
                        // Sync contact's status field
                        if (profile?.id) {
                            try { await contactAPI.update(currentWorkspace.id, profile.id, { status: targetStageId }); } catch (_) {}
                        }
                        // Notify Inbox header about auto-stage change
                        window.dispatchEvent(new CustomEvent('websocket:funnel_stage_updated', {
                            detail: { conversationId, funnelStageId: targetStageId }
                        }));
                    } catch { }
                }
            }

            setShowActivityModal(false);
            setEditingActivityId(null);
            setActivityForm({ type: 'NOTE', title: '', description: '', dueDate: '', assignedToId: '', funnelStageId: '', caseId: '' });
            setNoteCallSuccess(null);
            setNoteCallSentiment(null);
            fetchTimeline(profile.id);
            // Inbox list'teki badge'leri hemen güncelle
            if (onActivitySaved) {
                onActivitySaved({
                    type: isCallNote ? 'CALL' : activityForm.type,
                    status: isNoteType ? 'COMPLETED' : 'PLANNED',
                    contactId: profile.id,
                    dueDate: activityForm.dueDate
                });
            }

            // Not kaydedildi — artık akış/takım/üstlen paneli gösterilMEZ
            // Görüşme notu giren kişi otomatik olarak atanır (backend tarafında)
        } catch (err) {
            console.error('Save activity err:', err);
            const errorMsg = err.response?.data?.error || err.message || 'Aktivite kaydedilirken hata oluştu.';
            alert('Hata: ' + errorMsg);
        } finally {
            setActivitySaving(false);
        }
    };



    const handleCompleteActivity = async () => {
        if (!completingActivity) return;
        const isCallType = (completingActivity.type === 'CALL' || completingActivity.type === 'REMINDER');
        if (isCallType && completeCallSuccess === null) {
            return alert('Lütfen aramanın durumunu (Ulaşıldı / Ulaşılamadı) seçin.');
        }
        if (isCallType && completeCallSuccess !== 'FAILED' && !completeCallSentiment) {
            return alert('Lütfen görüşmenin nasıl geçtiğini (Duygu Durumu) seçin.');
        }
        
        try {
            const rawId = completingActivity.id.replace(/^act_/, '');
            let finalResult = completeResult;
            if (isCallType && completeCallSuccess === 'FAILED') {
                finalResult = finalResult ? `📵 Ulaşılamadı: ${finalResult}` : '📵 Ulaşılamadı';
            }
            await activityAPI.completeActivity(
                rawId,
                finalResult,
                isCallType ? (completeCallSuccess === 'SUCCESS') : undefined,
                isCallType && completeCallSuccess !== 'FAILED' ? completeCallSentiment : undefined
            );
            // Planned'dan kaldır, past'a ekle
            const completedItem = {
                ...completingActivity,
                isCompleted: true,
                isPlanned: false,
                status: 'COMPLETED',
                content: finalResult || completingActivity.content,
                callSuccessful: isCallType ? (completeCallSuccess === 'SUCCESS') : undefined,
                callSentiment: isCallType && completeCallSuccess !== 'FAILED' ? completeCallSentiment : undefined
            };
            setPlannedTimeline(prev => prev.filter(i => i.id !== completingActivity.id));
            setPastTimeline(prev => [completedItem, ...prev]);
            setCompletingActivity(null);
            setCompleteResult('');
            setCompleteCallSuccess(null);
            setCompleteCallSentiment(null);

            // Inbox'taki aktivite badge'ini anında yeşile çevir
            if (onActivitySaved && profile?.id) {
                const actType = completingActivity.type || completingActivity.activityType || 'CALL';
                onActivitySaved({ type: actType, status: 'COMPLETED', contactId: profile.id });
            }
        } catch (err) {
            console.error('Complete activity error:', err);
            alert('Tamamlama başarısız: ' + (err.response?.data?.error || err.message));
        }
    };

    const handleClaimActivity = async (activityId) => {
        try {
            const rawId = activityId.replace(/^act_/, '');
            const response = await activityAPI.claimActivity(rawId);
            
            const userName = user?.name || 'Ben';
            const userId = currentUserId || user?.id;

            setPlannedTimeline(prev => 
                prev.map(item => {
                    if (item.id === activityId) {
                        return {
                            ...item,
                            assignedToId: userId,
                            assignedToName: response?.assignee?.name || userName
                        };
                    }
                    return item;
                })
            );

            if (onActivitySaved && profile?.id) {
                const activity = plannedTimeline.find(i => i.id === activityId);
                const actType = activity?.type || 'CALL';
                onActivitySaved({ type: actType, status: 'CLAIMED', contactId: profile.id });
            }
        } catch (err) {
            console.error('Claim activity error:', err);
            alert(err.response?.data?.error || 'Aktivite üstlenilemedi.');
        }
    };

    const handleUpdateActivity = async () => {
        if (!editingActivity) return;
        try {
            const rawId = editingActivity.id.replace(/^act_/, '');
            await activityAPI.updateActivity(rawId, { description: editActivityText, title: editingActivity.title });
            const updateItem = item => item.id === editingActivity.id ? { ...item, content: editActivityText } : item;
            setPlannedTimeline(prev => prev.map(updateItem));
            setPastTimeline(prev => prev.map(updateItem));
            setEditingActivity(null);
            setEditActivityText('');
        } catch (err) {
            console.error('Update activity error:', err);
            alert('Güncelleme başarısız.');
        }
    };

    const renderTimelineIcon = (type) => {
        switch (type) {
            case 'WHATSAPP': return <MessageSquare size={14} />;
            case 'EMAIL': return <Mail size={14} />;
            case 'CALL': return <PhoneCall size={14} />;
            case 'NOTE': return <StickyNote size={14} />;
            case 'TASK': return <Check size={14} />;
            case 'MEETING': return <Calendar size={14} />;
            case 'VISIT': return <MapPin size={14} />;
            case 'REMINDER': return <Bell size={14} />;
            case 'PROPOSAL': return <FileText size={14} />;
            case 'ORDER': return <TrendingUp size={14} />;
            case 'INVOICE': return <FileText size={14} />;
            case 'PAYMENT': return <Banknote size={14} />;
            case 'FACEBOOK': return <MessageSquare size={14} />;
            case 'INSTAGRAM': return <MessageSquare size={14} />;
            case 'WIDGET': return <MessageSquare size={14} />;
            default: return <History size={14} />;
        }
    };

    const renderTimelineTypeName = (type) => {
        switch (type) {
            case 'WHATSAPP': return 'WhatsApp';
            case 'EMAIL': return 'E-posta';
            case 'CALL': return 'Arama';
            case 'NOTE': return 'Not';
            case 'TASK': return 'Görev';
            case 'MEETING': return 'Görüşme';
            case 'VISIT': return 'Ziyaret';
            case 'REMINDER': return 'Hatırlatıcı';
            case 'PROPOSAL': return 'Teklif';
            case 'ORDER': return 'Sipariş';
            case 'INVOICE': return 'Fatura';
            case 'PAYMENT': return 'Tahsilat';
            case 'FACEBOOK': return 'Facebook';
            case 'INSTAGRAM': return 'Instagram';
            case 'WIDGET': return 'Web Widget';
            default: return 'Aktivite';
        }
    };

    const fetchDeals = async (contactId) => {
        if (!currentWorkspace?.id || !contactId) return;
        setDealsLoading(true);
        try {
            const response = await dealAPI.getByContact(currentWorkspace.id, contactId);
            setDeals(response.data.deals || []);
        } catch (err) {
            console.error('Error fetching deals:', err);
        } finally {
            setDealsLoading(false);
        }
    };

    const fetchContactConversations = async (contactId) => {
        if (!currentWorkspace?.id || !contactId) return;
        try {
            const response = await conversationAPI.getAll(currentWorkspace.id, { contactId });
            setContactConversations(response.data.conversations || []);
        } catch (err) {
            console.error('Error fetching contact conversations:', err);
        }
    };

    // Pick the best conversation: prefer non-LEAD channels with recent messages
    const pickBestConversation = (convs) => {
        if (!convs || convs.length === 0) return null;
        if (convs.length === 1) return convs[0];
        // Sort by lastMessageAt descending (most recent first)
        const sorted = [...convs].sort((a, b) => {
            const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return bTime - aTime;
        });
        // Prefer non-LEAD conversation with messages
        const nonLead = sorted.find(c => c.channel !== 'LEAD' && c.lastMessageAt);
        if (nonLead) return nonLead;
        // Fallback: any conversation with messages
        const withMsg = sorted.find(c => c.lastMessageAt);
        if (withMsg) return withMsg;
        // Fallback: first in sorted order
        return sorted[0];
    };

    const activeConv = localConvOverride || conversationData || pickBestConversation(contactConversations);

    const handleAssign = async (teamId, userId) => {
        if (!activeConv) return;
        setAssignMegaMenuOpen(false);
        try {
            // Her zaman teamId + userId birlikte gönder
            const payload = {};
            if (teamId !== undefined) payload.teamId = teamId || null;
            if (userId !== undefined) payload.userId = userId || null;

            // Always use conversationAPI.assign with full payload to ensure both teamId and userId are sent
            await conversationAPI.assign(currentWorkspace.id, activeConv.id, payload);

            // Notify parent callbacks for any additional side-effects (e.g. list refresh)
            if (userId !== undefined && onAssignUser) {
                // Call with 3rd arg to signal parent — don't await (API already called above)
                try { await onAssignUser(activeConv.id, userId, true, teamId); } catch {}
            } else if (userId === undefined && onAssignTeam) {
                try { await onAssignTeam(activeConv.id, teamId, true); } catch {}
            }

            // CASCADE: Case + aktiviteleri de güncelle (backend cascade yapar)
            const convCaseId = activeConv.caseId;
            if (convCaseId && currentWorkspace?.id) {
                try {
                    const effectiveTeamId = teamId !== undefined ? (teamId || null) : (activeConv?.assignedTeamId || null);
                    const effectiveUserId = userId !== undefined ? (userId || null) : (activeConv?.assignedToId || null);
                    await caseAPI.assign(currentWorkspace.id, convCaseId, {
                        assignedToId: effectiveUserId,
                        assignedTeamId: effectiveTeamId
                    });
                } catch (caseErr) {
                    console.warn('Case cascade assign failed (non-critical):', caseErr.message);
                }
            }

            // Local state güncelle - sidebar anında yansıtsın
            const foundMember = userId ? (members.find(m => (m.user?.id || m.userId) === userId) || members.find(m => m.id === userId)) : null;
            const assignedToObj = foundMember ? { id: userId, name: foundMember.user?.name || foundMember.name || 'Agent' } : (userId ? { id: userId, name: 'Agent' } : null);
            const updatedData = {
                teamIds: teamId !== undefined ? (teamId ? JSON.stringify([teamId]) : '[]') : (activeConv?.teamIds || '[]'),
                assignedTeamId: teamId !== undefined ? (teamId || null) : activeConv?.assignedTeamId,
                assignedToId: userId !== undefined ? (userId || null) : activeConv?.assignedToId,
                assignedTo: userId !== undefined ? assignedToObj : activeConv?.assignedTo
            };

            setLocalConvOverride(prev => ({ ...(prev || activeConv), ...updatedData }));
            setContactConversations(prev => prev.map(c =>
                c.id === activeConv.id ? { ...c, ...updatedData } : c
            ));
        } catch (err) {
            console.error('Assign error:', err);
            alert('Atama işlemi gerçekleştirilemedi: ' + (err?.response?.data?.error || err.message));
        }
    };


    const handleClaim = async () => {
        if (!activeConv || takingOver) return;
        setTakingOver(true);
        try {
            if (onTakeOver) {
                await onTakeOver(activeConv.id);
            } else {
                await conversationAPI.claim(currentWorkspace.id, activeConv.id);
            }
            const myId = currentUserId || user?.id;
            const myName = user?.name || 'Ben';

            // CASCADE: Case'i de üstlenen kişiye ata
            const convCaseId = activeConv.caseId;
            if (convCaseId && currentWorkspace?.id) {
                try {
                    await caseAPI.assign(currentWorkspace.id, convCaseId, {
                        assignedToId: myId,
                        assignedTeamId: activeConv?.assignedTeamId || null
                    });
                } catch (caseErr) {
                    console.warn('Case cascade claim failed (non-critical):', caseErr.message);
                }
            }

            const claimUpdate = { assignedToId: myId, assignedTo: { id: myId, name: myName } };
            setLocalConvOverride(prev => ({ ...(prev || activeConv), ...claimUpdate }));
            setContactConversations(prev => prev.map(c =>
                c.id === activeConv.id ? { ...c, ...claimUpdate } : c
            ));
        } catch (err) {
            console.error('Claim error:', err);
            alert('Konuşma üstlenilemedi: ' + (err?.response?.data?.error || err.message));
        } finally {
            setTakingOver(false);
        }
    };

    const handleBranchSelect = async (branchId) => {
        try {
            const targetBranch = availableBranches.find(b => b.id === branchId) || null;
            const caseId = activeCaseInfo?.caseId || activeConv?.caseId;
            if (caseId) {
                await caseAPI.update(currentWorkspace.id, caseId, { branchId: branchId || null });
                setActiveCaseInfo(prev => prev ? ({
                    ...prev,
                    branchId: branchId || null,
                    branch: targetBranch
                }) : prev);
                setAllCases(prev => (prev || []).map(c => c.id === caseId ? { ...c, branchId: branchId || null, branch: targetBranch } : c));
                window.dispatchEvent(new CustomEvent('case_cards_refresh'));
            }
            if (activeConv?.id) {
                await aiAPI.updateConversationAnalysis(currentWorkspace.id, activeConv.id, { branchId: branchId || null });
                setLocalConvOverride(prev => ({
                    ...(prev || activeConv),
                    branchId: branchId || null,
                    branch: targetBranch
                }));
                setContactConversations(prev => (prev || []).map(c => 
                    c.id === activeConv.id ? { ...c, branchId: branchId || null, branch: targetBranch } : c
                ));
            }
            setBranchOpenCaseId(null);
        } catch (err) {
            console.error('Şube güncelleme hatası:', err);
            alert('Şube güncellenirken bir hata oluştu: ' + (err?.response?.data?.error || err.message));
        }
    };

    const formatConversationDate = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    };

    const handleAddTag = async () => {
        if (!newTag.trim()) return;
        try {
            if (conversationId) {
                // Conversation context: use facebookAPI (updates via conversationId → contact)
                const response = await facebookAPI.addContactTag(conversationId, newTag.trim());
                setProfile(prev => ({ ...prev, tags: response.data.tags }));
            } else if (profile?.id) {
                // Direct contact context (e.g. Customers page): update contact directly
                const currentTags = Array.isArray(profile.tags) ? profile.tags : [];
                if (!currentTags.includes(newTag.trim())) {
                    const updatedTags = [...currentTags, newTag.trim()];
                    await contactAPI.update(currentWorkspace.id, profile.id, { tags: JSON.stringify(updatedTags) });
                    setProfile(prev => ({ ...prev, tags: updatedTags }));
                }
            }
            setNewTag('');
            setIsAddingTag(false);
        } catch (err) {
            console.error('Add tag error:', err);
            alert('Etiket eklenirken hata oluştu: ' + (err.response?.data?.error || err.message));
        }
    };

    const handleRemoveTag = async (tagToDelete) => {
        try {
            if (conversationId) {
                // Conversation context: use facebookAPI
                const response = await facebookAPI.removeContactTag(conversationId, tagToDelete);
                setProfile(prev => ({ ...prev, tags: response.data.tags }));
            } else if (profile?.id) {
                // Direct contact context: update contact directly
                const currentTags = Array.isArray(profile.tags) ? profile.tags : [];
                const updatedTags = currentTags.filter(t => t !== tagToDelete);
                await contactAPI.update(currentWorkspace.id, profile.id, { tags: JSON.stringify(updatedTags) });
                setProfile(prev => ({ ...prev, tags: updatedTags }));
            }
        } catch (err) {
            console.error('Remove tag error:', err);
            alert('Etiket silinirken hata oluştu: ' + (err.response?.data?.error || err.message));
        }
    };



    const handleSaveProfile = async () => {
        if (!profile || !profile.id) return;
        setIsSaving(true);
        try {
            await contactAPI.update(currentWorkspace.id, profile.id, {
                name: profile.name,
                fullName: profile.fullName,
                phone: profile.phone,
                email: profile.email,
                status: profile.status
            });
            setHasUnsavedChanges(false);
            // Optional: Show success Toast
        } catch (err) {
            console.error('Save profile error:', err);
            alert('Bilgiler kaydedilirken bir hata oluştu.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleStatusChange = async (newCategory) => {
        if (!profile || !profile.id) return;
        try {
            await contactAPI.update(currentWorkspace.id, profile.id, { category: newCategory });
            setProfile(prev => ({ ...prev, category: newCategory }));
        } catch (err) {
            console.error('Category update error:', err);
            alert('Kategori güncellenirken bir hata oluştu.');
        }
    };

    const handleGenerateSummary = async () => {
        setSummarizing(true);
        try {
            const response = await aiAPI.summarizeConversation(currentWorkspace.id, conversationId);
            setSummary(response.data.summary);
            // Topic is also returned from the same API
            if (response.data.topic) {
                setTopic(response.data.topic);
            }


        } catch (err) {
            console.error('Summary error:', err);
            alert('Özet oluşturulurken bir hata oluştu.');
        } finally {
            setSummarizing(false);
        }
    };

    const handleUpdateProfile = async (updateData) => {
        if (!profile || !profile.id || !currentWorkspace) return;
        try {
            await contactAPI.update(currentWorkspace.id, profile.id, updateData);
            console.log('✅ Profile updated:', updateData);
        } catch (err) {
            console.error('Profile update error:', err);
        }
    };

    const handleSaveNote = async () => {
        if (!profile || !profile.id) return;
        if (!topic.trim() && !summary.trim()) {
            alert('Not başlığı veya analiz giriniz.');
            return;
        }

        setSavingNote(true);
        try {
            const timestamp = new Date().toLocaleString('tr-TR');
            const noteContent = topic.trim()
                ? `**${topic.trim()}**\n\n${summary.trim()}`
                : summary.trim();

            const noteData = {
                content: noteContent,
                timestamp: timestamp
            };

            // 1. Clear conversation aiTopic/aiSummary (only if we have a conversationId)
            if (conversationId) {
                await aiAPI.updateConversationAnalysis(currentWorkspace.id, conversationId, {
                    topic: '',
                    summary: ''
                });
            }

            // 2. Save to contact notes
            const existingNotes = profile.notes ? JSON.parse(profile.notes) : [];
            // Add new note to the beginning
            const updatedNotes = [noteData, ...existingNotes];

            await contactAPI.update(currentWorkspace.id, profile.id, {
                notes: JSON.stringify(updatedNotes)
            });

            // Update local profile
            setProfile(prev => ({ ...prev, notes: JSON.stringify(updatedNotes) }));

            // Clear fields after saving
            setTopic('');
            setSummary('');

            // Refresh timeline so the note appears instantly in the journey
            fetchTimeline(profile.id);

            console.log('✅ Note saved to both conversation and contact');
        } catch (saveErr) {
            console.error('Error saving note:', saveErr);
            alert('Not kaydedilirken bir hata oluştu.');
        } finally {
            setSavingNote(false);
        }
    };

    const handleDeleteNote = async (indexToDelete) => {
        if (!profile || !profile.id || !profile.notes) return;

        setSavingNote(true);
        try {
            const existingNotes = JSON.parse(profile.notes);
            const updatedNotes = existingNotes.filter((_, index) => index !== indexToDelete);

            await contactAPI.update(currentWorkspace.id, profile.id, {
                notes: JSON.stringify(updatedNotes)
            });

            setProfile(prev => ({ ...prev, notes: JSON.stringify(updatedNotes) }));
            console.log('✅ Note deleted');
        } catch (err) {
            console.error('Delete note error:', err);
            alert('Not silinirken hata oluştu.');
        } finally {
            setSavingNote(false);
        }
    };

    // Note update handler (from edit popup)
    const handleUpdateNote = async (noteItem, newText) => {
        if (!profile?.id || !newText.trim()) return;
        try {
            // Activity-based note
            if (noteItem.sourceType === 'ACTIVITY' && noteItem.id) {
                const rawId = noteItem.id.replace(/^act_/, '');
                await activityAPI.updateActivity(rawId, { description: newText });
                // Update local timeline
                const updateItem = item => item.id === noteItem.id ? { ...item, content: newText, description: newText } : item;
                setPlannedTimeline(prev => prev.map(updateItem));
                setPastTimeline(prev => prev.map(updateItem));
            }
            // Contact-notes based note (cnote_X)
            else if (noteItem.id?.startsWith('cnote_')) {
                const parts = noteItem.id.split('_');
                const idx = parseInt(parts[parts.length - 1], 10);
                const existingNotes = profile.notes ? JSON.parse(profile.notes) : [];
                if (existingNotes[idx]) {
                    existingNotes[idx].content = newText;
                    await contactAPI.update(currentWorkspace.id, profile.id, {
                        notes: JSON.stringify(existingNotes)
                    });
                    setProfile(prev => ({ ...prev, notes: JSON.stringify(existingNotes) }));
                    fetchTimeline(profile.id);
                }
            }
            // Inline note (inote_X) — no update API available, only delete exists
            // So we skip inote updates silently
            setEditingNoteData(null);
            setEditNoteText('');
        } catch (err) {
            console.error('Update note error:', err);
            alert('Not güncellenirken hata oluştu.');
        }
    };

    const handleDeleteActivity = async (activityId) => {
        if (!confirm('Bu aktiviteyi silmek istediğinize emin misiniz?')) return;
        try {
            const activity = plannedTimeline.find(i => i.id === activityId) || pastTimeline.find(i => i.id === activityId);
            
            if (activityId.startsWith('cnote_')) {
                const parts = activityId.split('_');
                const idx = parseInt(parts[parts.length - 1], 10);
                await handleDeleteNote(idx);
            } else if (activityId.startsWith('inote_')) {
                const noteId = activityId.replace(/^inote_/, '');
                const noteConversationId = activity?.raw?.conversationId || conversationId;
                if (!noteConversationId) {
                    alert('Konuşma kimliği bulunamadı.');
                    return;
                }
                await conversationAPI.deleteNote(currentWorkspace.id, noteConversationId, noteId);
            } else {
                const rawId = activityId.replace(/^act_/, '');
                await activityAPI.deleteActivity(rawId);
            }

            setPlannedTimeline(prev => prev.filter(i => i.id !== activityId));
            setPastTimeline(prev => prev.filter(i => i.id !== activityId));

            if (activity && onActivitySaved && profile?.id) {
                const actType = activity.type || activity.activityType || 'NOTE';
                onActivitySaved({ type: actType, status: 'DELETED', contactId: profile.id });
            }
        } catch (err) {
            console.error('Delete activity error:', err);
            alert('Silme işlemi başarısız.');
        }
    };

    const handleSaveReminder = async () => {
        if (!reminderForm.reminderDate || !reminderForm.assignedToId || !reminderForm.description.trim()) {
            alert('Lütfen tüm alanları doldurun.');
            return;
        }

        setReminderSaving(true);
        try {
            const startTime = new Date(reminderForm.reminderDate);
            const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 dakika sonra

            const appointmentData = {
                title: `🔔 ${profile?.name || 'Müşteri'} - Hatırlatıcı`,
                description: reminderForm.description,
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                assignedToId: reminderForm.assignedToId,
                contactName: profile?.name || '',
                contactPhone: profile?.phone || '',
                contactEmail: profile?.email || '',
                notes: reminderForm.description,
                status: 'SCHEDULED',
                color: '#f59e0b'
            };

            console.log('Creating appointment with data:', appointmentData);
            const response = await appointmentAPI.create(currentWorkspace.id, appointmentData);

            setShowReminderModal(false);
            setReminderForm({ reminderDate: '', assignedToId: '', description: '' });
            alert('✅ Hatırlatıcı oluşturuldu! Takvimde görüntüleyebilirsiniz.');
        } catch (err) {
            console.error('Reminder save error:', err);

            // Handle conflict error
            if (err.response?.status === 409) {
                const conflictData = err.response?.data;
                if (conflictData?.suggestion) {
                    const suggestion = conflictData.suggestion;
                    const suggestedTime = new Date(suggestion.startTime).toLocaleString('tr-TR');
                    const confirmMsg = `⚠️ Seçilen zaman diliminde agent meşgul.\n\nÖnerilen zaman: ${suggestedTime}\n\nBu zamanı kullanmak ister misiniz?`;

                    if (confirm(confirmMsg)) {
                        setReminderForm(prev => ({
                            ...prev,
                            reminderDate: suggestion.startTime
                        }));
                        return; // Don't close modal, let user save again
                    }
                }
                alert('⚠️ Seçilen zaman diliminde agent meşgul. Lütfen başka bir zaman seçin.');
            } else {
                alert('Hatırlatıcı kaydedilirken hata oluştu.');
            }
        } finally {
            setReminderSaving(false);
        }
    };

    const handleSaveTopic = async () => {
        if (!conversationId || !currentWorkspace) return;
        setIsSaving(true);
        try {
            await aiAPI.updateConversationAnalysis(currentWorkspace.id, conversationId, { topic, summary });
            console.log('✅ Topic saved');
        } catch (err) {
            console.error('Save topic error:', err);
            alert('Konu kaydedilemedi.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleBlockContact = async () => {
        if (!profile || !profile.id) return;
        setIsBlocking(true);
        try {
            await contactAPI.block(currentWorkspace.id, profile.id, 'Kullanıcı tarafından engellendi');
            setProfile(prev => ({ ...prev, isBlocked: true }));
            setShowBlockConfirm(false);
            alert('Kişi başarıyla engellendi. Artık bu kişiden mesaj almayacaksınız.');
        } catch (err) {
            console.error('Block error:', err);
            alert('Kişi engellenirken bir hata oluştu.');
        } finally {
            setIsBlocking(false);
        }
    };

    const handleUnblockContact = async () => {
        if (!profile || !profile.id) return;
        setIsBlocking(true);
        try {
            await contactAPI.unblock(currentWorkspace.id, profile.id);
            setProfile(prev => ({ ...prev, isBlocked: false }));
            alert('Kişinin engeli kaldırıldı.');
        } catch (err) {
            console.error('Unblock error:', err);
            alert('Engel kaldırılırken bir hata oluştu.');
        } finally {
            setIsBlocking(false);
        }
    };

    const handleDeleteContact = async () => {
        try {
            setIsDeleting(true);
            await contactAPI.delete(currentWorkspace.id, profile.id);
            setShowDeleteConfirm(false);
            // Socket event (contact_deleted) will handle removing from inbox list
            // Close sidebar and deselect conversation
            if (onClose) {
                onClose();
            } else {
                navigate('/inbox');
            }
        } catch (err) {
            console.error('Delete contact error:', err);
            alert('Kişi silinemedi: ' + (err.response?.data?.error || err.message));
        } finally {
            setIsDeleting(false);
        }
    };


    if (!isOpen) return null;

    // Helper to format locale to readable location
    const formatLocation = (locale) => {
        if (!locale) return null;
        try {
            let region = locale.split('_')[1] || locale;
            return new Intl.DisplayNames(['tr'], { type: 'region' }).of(region) || locale;
        } catch (e) {
            return locale;
        }
    };

    // Helper to format timezone
    const formatTimezone = (tz) => {
        if (tz === undefined || tz === null) return null;
        const sign = tz >= 0 ? '+' : '';
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const localTime = new Date(utc + (3600000 * tz));
        const timeString = localTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

        return `${timeString} (GMT${sign}${tz})`;
    };

    return (
        <>
            <div className="contact-sidebar">
                <div className="sidebar-content">
                    {loading ? (
                        <div className="loading-state">
                            <Loader className="spin" size={32} />
                            <p>Yükleniyor...</p>
                        </div>
                    ) : error ? (
                        <div className="error-state">
                            <p>{error}</p>
                            <button onClick={fetchProfile} className="retry-btn">Tekrar Dene</button>
                        </div>
                    ) : profile ? (
                        <>
                            {/* NEW UNIFIED PROFILE CARD */}
                            <div className="unified-profile-card">
                                <button className="unified-close-btn" onClick={() => onClose ? onClose() : navigate('/inbox')} title="Kapat">
                                    <X size={18} />
                                </button>

                                <div className="unified-profile-header">
                                    <div className="unified-profile-top">
                                        <div className="unified-avatar-wrapper">
                                            {profile.name ? profile.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '👤'}
                                        </div>
                                        {isEditingName ? (
                                            <input
                                                type="text"
                                                className="unified-name-input"
                                                value={profile.name || ''}
                                                onChange={(e) => setProfile(prev => ({ ...prev, name: e.target.value }))}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') e.target.blur();
                                                    else if (e.key === 'Escape') setIsEditingName(false);
                                                }}
                                                onBlur={async () => {
                                                    setIsEditingName(false);
                                                    if (profile.id && profile.name !== undefined) {
                                                        const trimmed = (profile.name || '').trim();
                                                        if (trimmed) {
                                                            try {
                                                                await contactAPI.update(currentWorkspace.id, profile.id, { name: trimmed });
                                                                setProfile(prev => ({ ...prev, name: trimmed }));
                                                                // Kişiler listesini güncelle
                                                                window.dispatchEvent(new CustomEvent('websocket:contact_updated', { detail: { contactId: profile.id } }));
                                                            } catch (err) { }
                                                        }
                                                    }
                                                }}
                                                autoFocus
                                            />
                                        ) : (
                                            <h2 className="unified-name-editable" onClick={() => !readOnly && setIsEditingName(true)} title={readOnly ? '' : 'Düzenlemek için tıklayın'}>
                                                {profile.name || 'İsimsiz Kişi'}
                                            </h2>
                                        )}
                                    </div>
                                    {/* İkinci Ad (Soyad) & Firma — sadece doluysa veya edit modunda göster */}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, justifyContent: 'center', padding: '0 8px' }}>
                                        {(profile.fullName || isEditingFullName) ? (
                                            isEditingFullName ? (
                                                <input
                                                    type="text"
                                                    value={profile.fullName || ''}
                                                    onChange={(e) => setProfile(prev => ({ ...prev, fullName: e.target.value }))}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); else if (e.key === 'Escape') setIsEditingFullName(false); }}
                                                    onBlur={async () => {
                                                        setIsEditingFullName(false);
                                                        const trimmed = (profile.fullName || '').trim();
                                                        try { await contactAPI.update(currentWorkspace.id, profile.id, { fullName: trimmed || null }); } catch {}
                                                    }}
                                                    placeholder="Soyad"
                                                    autoFocus
                                                    style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, border: '1px solid #e2e8f0', color: '#475569', width: 100, textAlign: 'center' }}
                                                />
                                            ) : (
                                                <span
                                                    onClick={() => !readOnly && setIsEditingFullName(true)}
                                                    title="Soyadı düzenle"
                                                    style={{ fontSize: 12, color: '#64748b', cursor: readOnly ? 'default' : 'pointer', fontWeight: 500 }}
                                                >{profile.fullName}</span>
                                            )
                                        ) : (
                                            !readOnly && <button onClick={() => setIsEditingFullName(true)} style={{ fontSize: 10, color: '#94a3b8', background: 'none', border: '1px dashed #d1d5db', borderRadius: 12, padding: '1px 8px', cursor: 'pointer' }}>+ Soyad</button>
                                        )}
                                        {(profile.company || isEditingCompany) ? (
                                            isEditingCompany ? (
                                                <input
                                                    type="text"
                                                    value={profile.company || ''}
                                                    onChange={(e) => setProfile(prev => ({ ...prev, company: e.target.value }))}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); else if (e.key === 'Escape') setIsEditingCompany(false); }}
                                                    onBlur={async () => {
                                                        setIsEditingCompany(false);
                                                        const trimmed = (profile.company || '').trim();
                                                        try { await contactAPI.update(currentWorkspace.id, profile.id, { company: trimmed || null }); } catch {}
                                                    }}
                                                    placeholder="Firma adı"
                                                    autoFocus
                                                    style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, border: '1px solid #e2e8f0', color: '#475569', width: 120, textAlign: 'center' }}
                                                />
                                            ) : (
                                                <span
                                                    onClick={() => !readOnly && setIsEditingCompany(true)}
                                                    title="Firma adını düzenle"
                                                    style={{ fontSize: 12, color: '#3b82f6', cursor: readOnly ? 'default' : 'pointer', fontWeight: 500, background: '#eff6ff', padding: '1px 8px', borderRadius: 12 }}
                                                >🏢 {profile.company}</span>
                                            )
                                        ) : (
                                            !readOnly && <button onClick={() => setIsEditingCompany(true)} style={{ fontSize: 10, color: '#94a3b8', background: 'none', border: '1px dashed #d1d5db', borderRadius: 12, padding: '1px 8px', cursor: 'pointer' }}>+ Firma</button>
                                        )}
                                        {/* Senkronizasyon veya İçe Aktarım Rozeti (Yukarıda) */}
                                        {(() => {
                                            const sync = getContactSyncInfo(profile);
                                            const imp = getContactImportInfo(profile);
                                            if (sync) {
                                                return (
                                                    <span
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: 4,
                                                            fontSize: 10.5,
                                                            fontWeight: 600,
                                                            color: sync.color,
                                                            background: sync.bg,
                                                            border: `1px solid ${sync.border}`,
                                                            borderRadius: 12,
                                                            padding: '1px 8px',
                                                            cursor: 'default'
                                                        }}
                                                        title={`Bu kişi ${sync.provider} sistemi ile senkronizedir.`}
                                                    >
                                                        <RefreshCw size={10} style={{ animation: 'spin 8s linear infinite' }} />
                                                        <span>Senkron: {sync.label}</span>
                                                    </span>
                                                );
                                            }
                                            if (imp) {
                                                return (
                                                    <span
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: 4,
                                                            fontSize: 10.5,
                                                            fontWeight: 600,
                                                            color: imp.color,
                                                            background: imp.bg,
                                                            border: `1px solid ${imp.border}`,
                                                            borderRadius: 12,
                                                            padding: '1px 8px',
                                                            cursor: 'default'
                                                        }}
                                                        title={`Bu kişi ${imp.fullLabel} ile içe aktarılmıştır.`}
                                                    >
                                                        <FileSpreadsheet size={10} />
                                                        <span>İçe Aktarım: {imp.label}</span>
                                                    </span>
                                                );
                                            }
                                            return null;
                                        })()}
                                    </div>
                                    <div className="unified-details">
                                        <div className="unified-contact-box">
                                            <div className="unified-contact-list">
                                                <div className="unified-contact-item">
                                                    <Phone size={14} className="unified-contact-icon" />
                                                    <input
                                                        type="text"
                                                        className="unified-contact-input"
                                                        value={profile.phone || ''}
                                                        onChange={(e) => setProfile(prev => ({ ...prev, phone: e.target.value }))}
                                                        onBlur={() => {
                                                            const normalized = normalizePhone(profile.phone);
                                                            setProfile(prev => ({ ...prev, phone: normalized }));
                                                            handleUpdateProfile({ phone: normalized });
                                                        }}
                                                        placeholder="Telefon Numarası"
                                                    />
                                                    <span
                                                        className="inline-action-btn inline-action-whatsapp"
                                                        title="WhatsApp"
                                                        onClick={() => {
                                                            if (!profile?.phone) return alert('Telefon numarası bulunamadı');
                                                            window.open(`https://wa.me/${profile.phone.replace(/[^0-9]/g, '')}`, '_blank');
                                                        }}
                                                    >
                                                        <svg viewBox="0 0 512 512" width="14" height="14" xmlns="http://www.w3.org/2000/svg">
                                                            <path fill="currentColor" d="M256.064,0h-0.128l0,0C114.784,0,0,114.816,0,256c0,56,18.048,107.904,48.736,150.048l-31.904,95.104l98.4-31.456C155.712,496.512,204,512,256.064,512C397.216,512,512,397.152,512,256S397.216,0,256.064,0z"></path>
                                                            <path fill="#fff" d="M405.024,361.504c-6.176,17.44-30.688,31.904-50.24,36.128c-13.376,2.848-30.848,5.12-89.664-19.264C189.888,347.2,141.44,270.752,137.664,265.792c-3.616-4.96-30.4-40.48-30.4-77.216s18.656-54.624,26.176-62.304c6.176-6.304,16.384-9.184,26.176-9.184c3.168,0,6.016,0.16,8.576,0.288c7.52,0.32,11.296,0.768,16.256,12.64c6.176,14.88,21.216,51.616,23.008,55.392c1.824,3.776,3.648,8.896,1.088,13.856c-2.4,5.12-4.512,7.392-8.288,11.744c-3.776,4.352-7.36,7.68-11.136,12.352c-3.456,4.064-7.36,8.416-3.008,15.936c4.352,7.36,19.392,31.904,41.536,51.616c28.576,25.44,51.744,33.568,60.032,37.024c6.176,2.56,13.536,1.952,18.048-2.848c5.728-6.176,12.8-16.416,20-26.496c5.12-7.232,11.584-8.128,18.368-5.568c6.912,2.4,43.488,20.48,51.008,24.224c7.52,3.776,12.48,5.568,14.304,8.736C411.2,329.152,411.2,344.032,405.024,361.504z"></path>
                                                        </svg>
                                                    </span>
                                                    <span
                                                        className="inline-action-btn inline-action-call"
                                                        title="AI Sesli Arama"
                                                        onClick={() => handleOpenAiCall(profile?.phone)}
                                                    >
                                                        <PhoneCall size={14} />
                                                    </span>
                                                </div>
                                                <div className="unified-contact-item">
                                                    <Mail size={14} className="unified-contact-icon" />
                                                    <input
                                                        type="email"
                                                        className="unified-contact-input"
                                                        value={profile.email || ''}
                                                        onChange={(e) => setProfile(prev => ({ ...prev, email: e.target.value }))}
                                                        onBlur={() => handleUpdateProfile({ email: profile.email })}
                                                        placeholder="E-posta adresi..."
                                                    />
                                                    <span
                                                        className="inline-action-btn inline-action-mail"
                                                        title="Mail Gönder"
                                                        onClick={() => {
                                                            if (!profile?.email) return alert('E-posta adresi bulunamadı');
                                                            window.open(`mailto:${profile.email}`, '_blank');
                                                        }}
                                                    >
                                                        <Mail size={14} />
                                                    </span>
                                                </div>

                                            </div>

                                            {/* Extra phones from profile.phones JSON array */}
                                            {(() => {
                                                let extraPhones = [];
                                                try { extraPhones = Array.isArray(profile.phones) ? profile.phones : JSON.parse(profile.phones || '[]'); } catch { }
                                                return extraPhones.map((ph, idx) => (
                                                    <div className="unified-contact-list" key={`extra-phone-${idx}`} style={{ marginTop: idx === 0 ? '4px' : '0' }}>
                                                        <div className="unified-contact-item">
                                                            <Phone size={14} className="unified-contact-icon" />
                                                            <input
                                                                type="text"
                                                                className="unified-contact-input"
                                                                value={ph}
                                                                onChange={(e) => {
                                                                    const updated = [...extraPhones];
                                                                    updated[idx] = e.target.value;
                                                                    setProfile(prev => ({ ...prev, phones: JSON.stringify(updated) }));
                                                                }}
                                                                onBlur={(e) => {
                                                                    const currentValue = e.target.value;
                                                                    const normalized = normalizePhone(currentValue);
                                                                    setProfile(prev => {
                                                                        let currentPhones = [];
                                                                        try { currentPhones = Array.isArray(prev.phones) ? [...prev.phones] : JSON.parse(prev.phones || '[]'); } catch { }
                                                                        currentPhones[idx] = normalized;
                                                                        const phonesStr = JSON.stringify(currentPhones);
                                                                        handleUpdateProfile({ phones: phonesStr });
                                                                        return { ...prev, phones: phonesStr };
                                                                    });
                                                                }}
                                                                placeholder={`Telefon Numarası ${idx + 2}`}
                                                            />
                                                            <span
                                                                className="inline-action-btn inline-action-whatsapp"
                                                                title="WhatsApp"
                                                                onClick={() => {
                                                                    if (!ph) return alert('Telefon numarası bulunamadı');
                                                                    window.open(`https://wa.me/${ph.replace(/[^0-9]/g, '')}`, '_blank');
                                                                }}
                                                            >
                                                                <svg viewBox="0 0 512 512" width="14" height="14" xmlns="http://www.w3.org/2000/svg">
                                                                    <path fill="currentColor" d="M256.064,0h-0.128l0,0C114.784,0,0,114.816,0,256c0,56,18.048,107.904,48.736,150.048l-31.904,95.104l98.4-31.456C155.712,496.512,204,512,256.064,512C397.216,512,512,397.152,512,256S397.216,0,256.064,0z"></path>
                                                                    <path fill="#fff" d="M405.024,361.504c-6.176,17.44-30.688,31.904-50.24,36.128c-13.376,2.848-30.848,5.12-89.664-19.264C189.888,347.2,141.44,270.752,137.664,265.792c-3.616-4.96-30.4-40.48-30.4-77.216s18.656-54.624,26.176-62.304c6.176-6.304,16.384-9.184,26.176-9.184c3.168,0,6.016,0.16,8.576,0.288c7.52,0.32,11.296,0.768,16.256,12.64c6.176,14.88,21.216,51.616,23.008,55.392c1.824,3.776,3.648,8.896,1.088,13.856c-2.4,5.12-4.512,7.392-8.288,11.744c-3.776,4.352-7.36,7.68-11.136,12.352c-3.456,4.064-7.36,8.416-3.008,15.936c4.352,7.36,19.392,31.904,41.536,51.616c28.576,25.44,51.744,33.568,60.032,37.024c6.176,2.56,13.536,1.952,18.048-2.848c5.728-6.176,12.8-16.416,20-26.496c5.12-7.232,11.584-8.128,18.368-5.568c6.912,2.4,43.488,20.48,51.008,24.224c7.52,3.776,12.48,5.568,14.304,8.736C411.2,329.152,411.2,344.032,405.024,361.504z"></path>
                                                                </svg>
                                                            </span>
                                                            <span
                                                                className="inline-action-btn inline-action-call"
                                                                title="AI Sesli Arama"
                                                                onClick={() => handleOpenAiCall(ph)}
                                                            >
                                                                <PhoneCall size={14} />
                                                            </span>
                                                            <button
                                                                className="unified-extra-remove-btn"
                                                                onClick={() => {
                                                                    const updated = extraPhones.filter((_, i) => i !== idx);
                                                                    setProfile(prev => ({ ...prev, phones: JSON.stringify(updated) }));
                                                                    handleUpdateProfile({ phones: JSON.stringify(updated) });
                                                                }}
                                                                title="Kaldır"
                                                            >×</button>
                                                        </div>
                                                    </div>
                                                ));
                                            })()}

                                            {/* Extra emails from profile.emails JSON array */}
                                            {(() => {
                                                let extraEmails = [];
                                                try { extraEmails = Array.isArray(profile.emails) ? profile.emails : JSON.parse(profile.emails || '[]'); } catch { }
                                                return extraEmails.map((em, idx) => (
                                                    <div className="unified-contact-list" key={`extra-email-${idx}`} style={{ marginTop: idx === 0 ? '4px' : '0' }}>
                                                        <div className="unified-contact-item">
                                                            <Mail size={14} className="unified-contact-icon" />
                                                            <input
                                                                type="email"
                                                                className="unified-contact-input"
                                                                value={em}
                                                                onChange={(e) => {
                                                                    const updated = [...extraEmails];
                                                                    updated[idx] = e.target.value;
                                                                    setProfile(prev => ({ ...prev, emails: JSON.stringify(updated) }));
                                                                }}
                                                                onBlur={(e) => {
                                                                    const currentValue = e.target.value;
                                                                    setProfile(prev => {
                                                                        let currentEmails = [];
                                                                        try { currentEmails = Array.isArray(prev.emails) ? [...prev.emails] : JSON.parse(prev.emails || '[]'); } catch { }
                                                                        currentEmails[idx] = currentValue;
                                                                        const emailsStr = JSON.stringify(currentEmails);
                                                                        handleUpdateProfile({ emails: emailsStr });
                                                                        return { ...prev, emails: emailsStr };
                                                                    });
                                                                }}
                                                                placeholder={`E-posta ${idx + 2}`}
                                                            />
                                                            <button
                                                                className="unified-extra-remove-btn"
                                                                onClick={() => {
                                                                    const updated = extraEmails.filter((_, i) => i !== idx);
                                                                    setProfile(prev => ({ ...prev, emails: JSON.stringify(updated) }));
                                                                    handleUpdateProfile({ emails: JSON.stringify(updated) });
                                                                }}
                                                                title="Kaldır"
                                                            >×</button>
                                                        </div>
                                                    </div>
                                                ));
                                            })()}

                                            {/* İletişim Ekle dropdown */}
                                            <div style={{ position: 'relative' }}>
                                                <button className="unified-add-contact-btn" onClick={() => setShowExtraFields(prev => !prev)}>
                                                    <Plus size={12} style={{ transform: showExtraFields ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }} /> İletişim Ekle
                                                </button>
                                                {showExtraFields && (
                                                    <div className="unified-add-contact-dropdown">
                                                        <button onClick={() => {
                                                            let phones = [];
                                                            try { phones = Array.isArray(profile.phones) ? [...profile.phones] : JSON.parse(profile.phones || '[]'); } catch { }
                                                            phones.push('');
                                                            setProfile(prev => ({ ...prev, phones: JSON.stringify(phones) }));
                                                            setShowExtraFields(false);
                                                        }}>
                                                            <Phone size={13} /> Telefon Ekle
                                                        </button>
                                                        <button onClick={() => {
                                                            let emails = [];
                                                            try { emails = Array.isArray(profile.emails) ? [...profile.emails] : JSON.parse(profile.emails || '[]'); } catch { }
                                                            emails.push('');
                                                            setProfile(prev => ({ ...prev, emails: JSON.stringify(emails) }));
                                                            setShowExtraFields(false);
                                                        }}>
                                                            <Mail size={13} /> E-posta Ekle
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Tags Row */}
                                            <div className="unified-tags-row">
                                                {/* Funnel Stage Tag */}
                                                {funnelStage ? (
                                                    <div
                                                        className="unified-tag unified-tag-blue"
                                                        style={{
                                                            backgroundColor: (funnelStage.color || '#6366f1') + '22',
                                                            color: funnelStage.color || '#6366f1'
                                                        }}
                                                    >
                                                        <Tag size={12} />
                                                        <span>{funnelStage.name}</span>
                                                    </div>
                                                ) : (() => {
                                                    const catOption = CATEGORY_OPTIONS.find(o => o.value === (profile.category || 'NEW'));
                                                    return (
                                                        <div className="unified-tag unified-tag-blue" style={{ backgroundColor: (catOption?.color || '#6b7280') + '20', color: catOption?.color || '#6b7280' }}>
                                                            <Tag size={12} />
                                                            <span>{catOption?.label || 'Yeni'}</span>
                                                        </div>
                                                    );
                                                })()}

                                                {/* Marketing Opt-Out Badge */}
                                                {profile.marketingOptOut && (
                                                    <div 
                                                        className="unified-tag" 
                                                        style={{ backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer', border: '1px solid #fecaca' }}
                                                        title="Pazarlama mesajlarından çıkmış — tıklayarak değiştirebilirsiniz"
                                                        onClick={async () => {
                                                            if (window.confirm('Kişiyi tekrar pazarlama listesine eklemek istiyor musunuz?')) {
                                                                try {
                                                                    await contactAPI.update(currentWorkspace.id, profile.id, { marketingOptOut: false, marketingOptOutAt: null });
                                                                    setProfile(prev => ({ ...prev, marketingOptOut: false, marketingOptOutAt: null }));
                                                                } catch {}
                                                            }
                                                        }}
                                                    >
                                                        <Ban size={12} />
                                                        <span>Pazarlama Kapalı</span>
                                                    </div>
                                                )}

                                                {/* Normal Tags */}
                                                {(() => {
                                                    let safeTags = profile.tags;
                                                    if (safeTags && typeof safeTags === 'string') {
                                                        try { safeTags = JSON.parse(safeTags); } catch { safeTags = []; }
                                                    }
                                                    if (!Array.isArray(safeTags)) safeTags = [];
                                                    return safeTags.map((tag, i) => (
                                                        <div key={i} className="unified-tag unified-tag-purple">
                                                            <Tag size={12} />
                                                            <span>{typeof tag === 'object' ? JSON.stringify(tag) : String(tag)}</span>
                                                            <button onClick={() => handleRemoveTag(tag)} className="remove-tag-btn" title="Sil">
                                                                <X size={10} />
                                                            </button>
                                                        </div>
                                                    ));
                                                })()}

                                                {isAddingTag ? (
                                                    <div className="unified-tag-input-wrapper">
                                                        <input
                                                            type="text"
                                                            value={newTag}
                                                            onChange={(e) => setNewTag(e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); }
                                                                else if (e.key === 'Escape') { setIsAddingTag(false); setNewTag(''); }
                                                            }}
                                                            placeholder="Etiket..."
                                                            autoFocus
                                                            onBlur={() => { setTimeout(() => { if (!newTag.trim()) setIsAddingTag(false); }, 200); }}
                                                        />
                                                    </div>
                                                ) : (
                                                    <button className="unified-tag-add-btn" onClick={() => setIsAddingTag(true)} title="Etiket Ekle">
                                                        <Plus size={12} />
                                                    </button>
                                                )}
                                            </div>

                                            {/* ── Birleşik Pill Alanı: Kaynak + Nereden + Gruplar + Segmentler ── */}
                                            <div className="unified-tags-row" style={{ borderTop: '1px solid #f3f4f6', paddingTop: 4 }}>
                                                {/* Attribution pills — mavi */}
                                                {attributions.map((attr, idx) => (
                                                    <div key={`attr-${idx}`} className="unified-tag" style={{ background: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd40' }}>
                                                        <span style={{ fontSize: 10 }}>🌐</span>
                                                        <span>{attr.source}{attr.medium ? ` / ${attr.medium}` : ''}</span>
                                                    </div>
                                                ))}

                                                {/* Lead Source — amber pill (tıklanınca dropdown) */}
                                                {profile?.leadSource ? (
                                                    <div className="unified-tag" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d40', cursor: 'pointer', position: 'relative' }}>
                                                        <span style={{ fontSize: 10 }}>📍</span>
                                                        <select
                                                            value={profile?.leadSource || ''}
                                                            onChange={async (e) => {
                                                                const val = e.target.value;
                                                                setProfile(prev => ({ ...prev, leadSource: val }));
                                                                try { await contactAPI.update(conversationData?.workspaceId || profile?.workspaceId, profile.id, { leadSource: val || null }); } catch {}
                                                            }}
                                                            style={{ appearance: 'none', background: 'transparent', border: 'none', color: 'inherit', fontSize: 11, fontWeight: 500, cursor: 'pointer', padding: 0, outline: 'none' }}
                                                        >
                                                            <option value="">Seçilmedi</option>
                                                            <option value="INBOUND">Gelen Arama</option>
                                                            <option value="SOCIAL_MEDIA">Sosyal Medya</option>
                                                            <option value="FACEBOOK">Facebook</option>
                                                            <option value="INSTAGRAM">Instagram</option>
                                                            <option value="GOOGLE">Google</option>
                                                            <option value="REFERRAL">Referans</option>
                                                            <option value="WEBSITE">Web Sitesi</option>
                                                            <option value="WALK_IN">Yüz Yüze</option>
                                                            <option value="EVENT">Etkinlik/Fuar</option>
                                                            <option value="OTHER">Diğer</option>
                                                        </select>
                                                    </div>
                                                ) : (
                                                    <select
                                                        value=""
                                                        onChange={async (e) => {
                                                            const val = e.target.value;
                                                            if (!val) return;
                                                            setProfile(prev => ({ ...prev, leadSource: val }));
                                                            try { await contactAPI.update(conversationData?.workspaceId || profile?.workspaceId, profile.id, { leadSource: val }); } catch {}
                                                        }}
                                                        style={{ appearance: 'none', background: 'transparent', border: '1px dashed #d1d5db', borderRadius: 20, color: '#9ca3af', fontSize: 10, padding: '2px 8px', cursor: 'pointer', outline: 'none' }}
                                                    >
                                                        <option value="">📍 Nereden?</option>
                                                        <option value="INBOUND">Gelen Arama</option>
                                                        <option value="SOCIAL_MEDIA">Sosyal Medya</option>
                                                        <option value="FACEBOOK">Facebook</option>
                                                        <option value="INSTAGRAM">Instagram</option>
                                                        <option value="GOOGLE">Google</option>
                                                        <option value="REFERRAL">Referans</option>
                                                        <option value="WEBSITE">Web Sitesi</option>
                                                        <option value="WALK_IN">Yüz Yüze</option>
                                                        <option value="EVENT">Etkinlik/Fuar</option>
                                                        <option value="OTHER">Diğer</option>
                                                    </select>
                                                )}

                                                {/* Grup pills — indigo */}
                                                {contactGroups.map(gid => {
                                                    const g = allGroups.find(x => x.id === gid);
                                                    if (!g) return null;
                                                    return (
                                                        <div key={`grp-${gid}`} className="unified-tag" style={{ background: (g.color || '#6366f1') + '18', color: g.color || '#6366f1', border: `1px solid ${(g.color || '#6366f1')}40` }}>
                                                            <Users size={10} />
                                                            <span>{g.name}</span>
                                                            <button disabled={groupSaving} onClick={async (e) => { e.stopPropagation(); setGroupSaving(true); try { const { default: api } = await import('../../services/api'); await api.delete(`/contact-groups/${currentWorkspace.id}/groups/${gid}/members/${profile.id}`); setContactGroups(prev => prev.filter(id => id !== gid)); } catch {} finally { setGroupSaving(false); } }} className="remove-tag-btn"><X size={10} /></button>
                                                        </div>
                                                    );
                                                })}

                                                {/* Grup ekle — mini pill dropdown */}
                                                {allGroups.length > 0 && allGroups.filter(g => !contactGroups.includes(g.id)).length > 0 && (
                                                    <select
                                                        value=""
                                                        disabled={groupSaving}
                                                        onChange={async (e) => {
                                                            const gid = e.target.value;
                                                            if (!gid || contactGroups.includes(gid)) return;
                                                            setGroupSaving(true);
                                                            try { const { default: api } = await import('../../services/api'); await api.post(`/contact-groups/${currentWorkspace.id}/groups/${gid}/members`, { contactIds: [profile.id] }); setContactGroups(prev => [...prev, gid]); } catch {} finally { setGroupSaving(false); }
                                                        }}
                                                        style={{ appearance: 'none', background: 'transparent', border: '1px dashed #d1d5db', borderRadius: 20, color: '#9ca3af', fontSize: 10, padding: '2px 8px', cursor: 'pointer', outline: 'none' }}
                                                    >
                                                        <option value="">👥 Grup+</option>
                                                        {allGroups.filter(g => !contactGroups.includes(g.id)).map(g => (<option key={g.id} value={g.id}>{g.name}</option>))}
                                                    </select>
                                                )}


                                            </div>

                                            {/* Location / Language Row */}
                                            <div className="unified-location-row">
                                                <div className="unified-loc-item">
                                                    <MapPin size={12} />
                                                    <select
                                                        className="unified-loc-select"
                                                        value={profile.country || ''}
                                                        onChange={(e) => {
                                                            setProfile(prev => ({ ...prev, country: e.target.value }));
                                                            handleUpdateProfile({ country: e.target.value });
                                                        }}
                                                    >
                                                        <option value="">Ülke</option>
                                                        <option value="Türkiye">🇹🇷 Türkiye</option>
                                                        <option value="Almanya">🇩🇪 Almanya</option>
                                                        <option value="İngiltere">🇬🇧 İngiltere</option>
                                                        <option value="Fransa">🇫🇷 Fransa</option>
                                                        <option value="ABD">🇺🇸 ABD</option>
                                                        <option value="Rusya">🇷🇺 Rusya</option>
                                                        <option value="Hollanda">🇳🇱 Hollanda</option>
                                                        <option value="Belçika">🇧🇪 Belçika</option>
                                                        <option value="İsviçre">🇨🇭 İsviçre</option>
                                                        <option value="Avusturya">🇦🇹 Avusturya</option>
                                                        <option value="İtalya">🇮🇹 İtalya</option>
                                                        <option value="İspanya">🇪🇸 İspanya</option>
                                                        <option value="Suudi Arabistan">🇸🇦 S. Arabistan</option>
                                                        <option value="BAE">🇦🇪 BAE</option>
                                                        <option value="Diğer">🌍 Diğer</option>
                                                    </select>
                                                </div>
                                                <div className="unified-loc-item">
                                                    <input
                                                        type="text"
                                                        className="unified-loc-input"
                                                        value={profile.city || ''}
                                                        onChange={(e) => setProfile(prev => ({ ...prev, city: e.target.value }))}
                                                        onBlur={() => handleUpdateProfile({ city: profile.city })}
                                                        placeholder="Şehir"
                                                    />
                                                </div>
                                                <div className="unified-loc-item">
                                                    <select
                                                        className="unified-loc-select"
                                                        value={profile.language || ''}
                                                        onChange={(e) => {
                                                            setProfile(prev => ({ ...prev, language: e.target.value }));
                                                            handleUpdateProfile({ language: e.target.value });
                                                        }}
                                                    >
                                                        <option value="">Dil</option>
                                                        <option value="tr">🇹🇷 Türkçe</option>
                                                        <option value="en">🇬🇧 English</option>
                                                        <option value="de">🇩🇪 Deutsch</option>
                                                        <option value="fr">🇫🇷 Français</option>
                                                        <option value="ar">🇸🇦 العربية</option>
                                                        <option value="ru">🇷🇺 Русский</option>
                                                        <option value="nl">🇳🇱 Nederlands</option>
                                                    </select>
                                                </div>
                                                <div className="unified-loc-item" title={profile.birthDate ? `Doğum Tarihi: ${safeFormatDate(profile.birthDate)}` : 'Doğum Tarihi Ekle'}>
                                                    <Cake size={11} style={{ color: profile.birthDate ? '#e11d48' : '#9ca3af', flexShrink: 0 }} />
                                                    <input
                                                        type="date"
                                                        className="unified-loc-input"
                                                        value={profile.birthDate ? profile.birthDate.substring(0, 10) : ''}
                                                        onChange={async (e) => {
                                                            const val = e.target.value;
                                                            const iso = val ? new Date(val).toISOString() : null;
                                                            setProfile(prev => ({ ...prev, birthDate: iso }));
                                                            await handleUpdateProfile({ birthDate: iso });
                                                        }}
                                                        style={{ fontSize: 11, cursor: 'pointer' }}
                                                    />
                                                    {profile.birthDate && (() => {
                                                        const birthYear = new Date(profile.birthDate).getFullYear();
                                                        const age = new Date().getFullYear() - birthYear;
                                                        return !isNaN(age) && age > 0 && age < 120 ? (
                                                            <span style={{ fontSize: '9.5px', color: '#e11d48', fontWeight: 600, background: '#fff1f2', padding: '0 3px', borderRadius: '3px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                                                {age}y
                                                            </span>
                                                        ) : null;
                                                    })()}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>


                            {/* ═══ BİRLEŞİK SOHBET AKIŞI SECTIONı ═══ */}
                            {/* CaseCards header'a entegre + Atama + Timeline hepsi tek section'da */}
                            {(() => {
                                // Müşterinin gerçekten farklı case'leri varsa (farklı caseNumber) hepsi alt alta açık olarak gösterilir.
                                // Aynı numaralı mükerrer kayıtlar sanitizeCases içinde tekilleştirilmiş ve birleştirilmiştir.
                                const casesToRender = distinctCases.length > 0
                                    ? distinctCases
                                    : (activeCaseInfo ? [{ ...activeCaseInfo, id: activeCaseInfo.caseId }] : [{ id: 'default', title: 'Genel', caseNumber: '' }]);

                                return casesToRender.map((c, index) => {
                                    const isExpanded = expandedCases[c.id] !== false;
                                    const matchingIds = new Set([c.id, ...(c._allIds || [])]);
                                    const caseTimeline = [...pastTimeline, ...plannedTimeline].filter(item => {
                                        if (item.caseId && matchingIds.has(item.caseId)) return true;
                                        // caseId atanmamış olaylar (örneğin profil oluşturma) aktif konuşmaya bağlı case'e veya ilk karta dahil edilir
                                        const isCurrentActive = matchingIds.has(activeCaseInfo?.caseId) || matchingIds.has(conversationData?.caseId) || index === 0;
                                        if (!item.caseId && isCurrentActive) return true;
                                        return false;
                                    });
                                    return (
                                <div key={c.id || index} className="customer-journey-timeline" style={{ marginTop: 13, marginBottom: 13, paddingBottom: isExpanded ? 14 : 6 }}>
                                    <div className="journey-header" style={{ paddingBottom: 0 }}>

                                        {/* ═══ SATIR 1: Konu Başlığı (flex: 1) — Genişletme Çentiği ═══ */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px 3px' }}>
                                            {/* Konu Başlığı */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                            {(() => {
                                                const caseInfo = (c && c.id !== 'default') ? c : activeCaseInfo;
                                                if (!caseInfo && c.id === 'default') {
                                                    const convTopic = activeConv?.aiTopic || conversationData?.aiTopic || c?.title || '';
                                                    if (!convTopic) return null;
                                                    return (
                                                        <div style={{
                                                            fontSize: '0.86rem', fontWeight: 700, color: '#1f2937',
                                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                                        }}>
                                                            {convTopic}
                                                        </div>
                                                    );
                                                }
                                                if (!caseInfo) return null;
                                                const GENERIC = ['💬 WhatsApp', '💬 Facebook', '💬 Instagram', '📧 E-posta', '📞 Telefon', '🌐 Web Widget', '📝 Form', 'Yeni İletişim', 'Yeni Case', '-', '—', ''];
                                                const rawTitle = caseInfo.title || '';
                                                const isGeneric = GENERIC.includes(rawTitle.trim()) || rawTitle.includes('━') || rawTitle.includes('═');
                                                const convTopic = activeConv?.aiTopic || conversationData?.aiTopic || '';
                                                const displayTitle = caseInfo._userEdited 
                                                    ? caseInfo.title 
                                                    : (isGeneric && convTopic ? convTopic : rawTitle);
                                                if (!displayTitle && !rawTitle) return null;
                                                return (
                                                    <input
                                                        type="text"
                                                        value={displayTitle}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setActiveCaseInfo(prev => ({ ...prev, title: val, _userEdited: true }));
                                                            setAllCases(prev => prev.map(ac => ac.id === c.id ? { ...ac, title: val, _userEdited: true } : ac));
                                                        }}
                                                        onBlur={async (e) => {
                                                            const newTitle = e.target.value.trim();
                                                            if (!newTitle || newTitle === caseInfo._savedTitle) return;
                                                            try {
                                                                await caseAPI.update(currentWorkspace.id, c.id || caseInfo.caseId, { title: newTitle });
                                                                setActiveCaseInfo(prev => ({ ...prev, title: newTitle, _savedTitle: newTitle, _userEdited: false }));
                                                                setAllCases(prev => prev.map(ac => ac.id === c.id ? { ...ac, title: newTitle, _savedTitle: newTitle, _userEdited: false } : ac));
                                                                window.dispatchEvent(new CustomEvent('case_title_updated', {
                                                                    detail: { caseId: c.id || caseInfo.caseId, title: newTitle, conversationId }
                                                                }));
                                                            } catch (err) { console.error('Title update error:', err); }
                                                        }}
                                                        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                                                        placeholder="Konu başlığı..."
                                                        style={{
                                                            fontSize: '0.86rem', fontWeight: 700, color: '#1f2937',
                                                            border: 'none', outline: 'none', background: 'transparent',
                                                            padding: 0, width: '100%', lineHeight: 1.3
                                                        }}
                                                    />
                                                );
                                            })()}
                                            </div>

                                            {/* Case ID dropdown (Kompakt hap - Başlığın yanında) */}
                                            <div style={{ position: 'relative', flexShrink: 0 }}>
                                                <button
                                                    onClick={() => { setCaseIdOpenCaseId(prev => prev === c.id ? null : c.id); setShowNewCaseInline(false); }}
                                                    style={{
                                                        background: '#ffffff',
                                                        border: '1px solid #e2e8f0',
                                                        borderRadius: 6,
                                                        padding: '1px 6px',
                                                        height: 22,
                                                        boxSizing: 'border-box',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 3,
                                                        color: '#475569',
                                                        fontSize: '0.62rem',
                                                        fontWeight: 600,
                                                        fontFamily: 'monospace',
                                                        cursor: 'pointer',
                                                        whiteSpace: 'nowrap',
                                                        transition: 'all 0.15s'
                                                    }}
                                                    onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#1e293b'; }}
                                                    onMouseLeave={e => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.color = '#475569'; }}
                                                    title={c?.caseNumber || activeCaseInfo?.caseNumber || 'Case Seç'}
                                                >
                                                    <Briefcase size={9} style={{ opacity: 0.7 }} />
                                                    <span>{(() => {
                                                        const rawNum = c?.caseNumber || activeCaseInfo?.caseNumber || 'Case';
                                                        return (rawNum.includes('-') && rawNum.length > 8) ? rawNum.split('-').pop() : rawNum;
                                                    })()}</span>
                                                    {distinctCases?.length > 1 && (
                                                        <span style={{
                                                            fontSize: '0.55rem',
                                                            background: '#eff6ff',
                                                            color: '#2563eb',
                                                            padding: '1px 5px',
                                                            borderRadius: '999px',
                                                            fontWeight: 700,
                                                            marginLeft: 2
                                                        }}>
                                                            {distinctCases.length} Case
                                                        </span>
                                                    )}
                                                    <ChevronDown size={7} style={{
                                                        transition: 'transform 0.2s',
                                                        transform: caseIdOpenCaseId === c.id ? 'rotate(180deg)' : 'none',
                                                        opacity: 0.5
                                                    }} />
                                                </button>

                                                {(caseIdOpenCaseId === c.id) && (
                                                    <>
                                                    <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => { setCaseIdOpenCaseId(null); setShowNewCaseInline(false); }} />
                                                    <div
                                                        style={{
                                                            position: 'absolute', top: '100%', right: 0, zIndex: 9999,
                                                            background: '#fff', border: '1px solid #e5e7eb',
                                                            borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                                            minWidth: 250, marginTop: 4, overflow: 'hidden',
                                                            maxHeight: 320, overflowY: 'auto'
                                                        }}
                                                        onClick={e => e.stopPropagation()}
                                                    >
                                                        <div style={{ padding: '8px 12px 4px', fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                            <span>Müşteri Case'leri</span>
                                                            {distinctCases.length > 1 && (
                                                                <span style={{ fontSize: '0.6rem', background: '#eff6ff', color: '#2563eb', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>
                                                                    Toplam {distinctCases.length}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {distinctCases.map(cc => {
                                                            const statusInfo = { ACTIVE: '🟢', CLOSED: '🔴', WON: '🏆', LOST: '❌' };
                                                            const isActiveCase = cc.id === (activeCaseInfo?.caseId || conversationData?.caseId || c.id);
                                                            return (
                                                                <div
                                                                    key={cc.id}
                                                                    onClick={async () => {
                                                                        try {
                                                                            const { default: api } = await import('../../services/api');
                                                                            await api.put(`/conversations/${currentWorkspace.id}/${conversationId}/link-case`, { caseId: cc.id });
                                                                            setActiveCaseInfo(prev => ({
                                                                                ...prev,
                                                                                ...cc,
                                                                                caseId: cc.id,
                                                                                branchId: cc.branchId || null,
                                                                                branch: cc.branch || null,
                                                                                _savedTitle: cc.title,
                                                                                _userEdited: false
                                                                            }));
                                                                            window.dispatchEvent(new CustomEvent('case_cards_refresh'));
                                                                        } catch (err) { console.error(err); }
                                                                        setCaseIdOpenCaseId(null);
                                                                    }}
                                                                    style={{
                                                                        padding: '7px 12px', cursor: 'pointer',
                                                                        display: 'flex', alignItems: 'center', gap: 6,
                                                                        fontSize: '0.72rem', fontWeight: isActiveCase ? 600 : 400,
                                                                        background: isActiveCase ? '#f5f3ff' : 'transparent',
                                                                        transition: 'background 0.1s'
                                                                    }}
                                                                    onMouseEnter={e => { if (!isActiveCase) e.currentTarget.style.background = '#fafafa'; }}
                                                                    onMouseLeave={e => { e.currentTarget.style.background = isActiveCase ? '#f5f3ff' : 'transparent'; }}
                                                                >
                                                                    <span style={{ fontSize: '0.6rem', flexShrink: 0 }}>{statusInfo[cc.status] || '⚪'}</span>
                                                                    <span style={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#6366f1', fontWeight: 600, flexShrink: 0 }}>#{cc?.caseNumber}</span>
                                                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cc.title || '—'}</span>
                                                                    {isActiveCase && <span style={{ fontSize: '0.65rem', color: '#7c3aed', marginLeft: 'auto', fontWeight: 700 }}>✓ Aktif</span>}
                                                                </div>
                                                            );
                                                        })}
                                                        {distinctCases.length > 1 && (
                                                            <div style={{ borderTop: '1px solid #f1f5f9', padding: '4px 6px' }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={async () => {
                                                                        if (!window.confirm(`${distinctCases.length} farklı case tek bir Case (#${activeCase?.caseNumber || c?.caseNumber}) altında birleştirilsin mi?\n\nTüm konuşmalar ve aktiviteler bu aktif case'e aktarılacaktır.`)) return;
                                                                        try {
                                                                            const { default: api } = await import('../../services/api');
                                                                            const targetId = activeCase.id || c.id;
                                                                            const sourceIds = distinctCases.filter(dc => dc.id !== targetId).map(dc => dc.id);
                                                                            await api.post(`/contact-cases/${currentWorkspace.id}/merge`, {
                                                                                sourceCaseId: sourceIds[0],
                                                                                caseIds: [targetId, ...sourceIds],
                                                                                targetCaseId: targetId
                                                                            });
                                                                            window.dispatchEvent(new CustomEvent('case_cards_refresh'));
                                                                        } catch (err) {
                                                                            console.error(err);
                                                                            alert('Birleştirme sırasında hata oluştu.');
                                                                        }
                                                                        setCaseIdOpenCaseId(null);
                                                                    }}
                                                                    style={{
                                                                        width: '100%',
                                                                        padding: '6px 10px',
                                                                        fontSize: '0.68rem',
                                                                        fontWeight: 600,
                                                                        color: '#2563eb',
                                                                        background: '#eff6ff',
                                                                        border: '1px solid #bfdbfe',
                                                                        borderRadius: 6,
                                                                        cursor: 'pointer',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        gap: 5
                                                                    }}
                                                                >
                                                                    <span>🔗 Tüm Case'leri Bu Case ile Birleştir</span>
                                                                </button>
                                                            </div>
                                                        )}
                                                        <div style={{ borderTop: '1px solid #f1f5f9', padding: '4px 0' }}>
                                                            {!showNewCaseInline ? (
                                                                <div
                                                                    onClick={() => setShowNewCaseInline(true)}
                                                                    style={{
                                                                        padding: '7px 12px', cursor: 'pointer',
                                                                        display: 'flex', alignItems: 'center', gap: 4,
                                                                        fontSize: '0.72rem', fontWeight: 600, color: '#8b5cf6',
                                                                        transition: 'background 0.1s'
                                                                    }}
                                                                    onMouseEnter={e => { e.currentTarget.style.background = '#faf5ff'; }}
                                                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                                                >
                                                                    <Plus size={12} /> Yeni Case
                                                                </div>
                                                            ) : (
                                                                <div style={{ padding: '6px 10px', display: 'flex', gap: 4 }}>
                                                                    <input
                                                                        type="text"
                                                                        value={newCaseTitle}
                                                                        onChange={e => setNewCaseTitle(e.target.value)}
                                                                        onKeyDown={async e => {
                                                                            if (e.key === 'Enter' && newCaseTitle.trim()) {
                                                                                setCreatingCase(true);
                                                                                try {
                                                                                    await caseAPI.create(currentWorkspace.id, profile.id, {
                                                                                        title: newCaseTitle.trim(),
                                                                                        conversationId: conversationId || null
                                                                                    });
                                                                                    setNewCaseTitle('');
                                                                                    setShowNewCaseInline(false);
                                                                                    setCaseIdOpenCaseId(null);
                                                                                    window.dispatchEvent(new CustomEvent('case_cards_refresh'));
                                                                                } catch (err) { console.error('Case create error:', err); }
                                                                                setCreatingCase(false);
                                                                            } else if (e.key === 'Escape') {
                                                                                setShowNewCaseInline(false);
                                                                                setNewCaseTitle('');
                                                                            }
                                                                        }}
                                                                        placeholder="Case başlığı..."
                                                                        autoFocus
                                                                        style={{
                                                                            flex: 1, fontSize: '0.7rem', padding: '4px 6px',
                                                                            border: '1px solid #e2e8f0', borderRadius: 5, outline: 'none',
                                                                            minWidth: 0
                                                                        }}
                                                                    />
                                                                    <button
                                                                        onClick={async () => {
                                                                            if (!newCaseTitle.trim()) return;
                                                                            setCreatingCase(true);
                                                                            try {
                                                                                await caseAPI.create(currentWorkspace.id, profile.id, {
                                                                                    title: newCaseTitle.trim(),
                                                                                    conversationId: conversationId || null
                                                                                });
                                                                                setNewCaseTitle('');
                                                                                setShowNewCaseInline(false);
                                                                                setCaseIdOpenCaseId(null);
                                                                                window.dispatchEvent(new CustomEvent('case_cards_refresh'));
                                                                            } catch (err) { console.error('Case create error:', err); }
                                                                            setCreatingCase(false);
                                                                        }}
                                                                        disabled={creatingCase || !newCaseTitle.trim()}
                                                                        style={{
                                                                            background: '#8b5cf6', color: '#fff', border: 'none',
                                                                            borderRadius: 5, padding: '4px 8px', cursor: 'pointer',
                                                                            fontSize: '0.68rem', fontWeight: 600, flexShrink: 0,
                                                                            opacity: creatingCase ? 0.6 : 1
                                                                        }}
                                                                    >
                                                                        {creatingCase ? '...' : '✓'}
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    </>
                                                )}
                                            </div>

                                            {/* Genişletme Çentiği */}
                                            <button 
                                                onClick={() => setExpandedCases(prev => ({ ...prev, [c.id]: !isExpanded }))}
                                                style={{ 
                                                    background: 'none', border: 'none', cursor: 'pointer',
                                                    color: '#9ca3af', padding: 0, width: 20, height: 20,
                                                    flexShrink: 0, transition: 'color 0.15s',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}
                                                onMouseEnter={e => { e.currentTarget.style.color = '#475569'; }}
                                                onMouseLeave={e => { e.currentTarget.style.color = '#9ca3af'; }}
                                                title={isExpanded ? 'Daralt' : 'Genişlet'}
                                            >
                                                <ChevronDown size={14} style={{
                                                    transition: 'transform 0.2s',
                                                    transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)'
                                                }} />
                                            </button>
                                        </div>

                                        {/* ═══ SATIR 2: 4 Rozet Tek Satır (Fırsat/Randevu — Kaynak — Puan — Şube) ═══ */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 12px 6px', flexWrap: 'nowrap', position: 'relative' }}>
                                            {/* Case Type Badge */}
                                            {(() => {
                                                // 1. Önce CaseType relation'ını kontrol et (yeni sistem)
                                                const caseTypeRel = activeCaseInfo?.caseType || c?.caseType;
                                                if (caseTypeRel?.name) {
                                                    const ctColor = caseTypeRel.color || '#6b7280';
                                                    return (
                                                        <span style={{
                                                            background: ctColor + '1a',
                                                            color: ctColor,
                                                            border: `1px solid ${ctColor}40`,
                                                            borderRadius: 4,
                                                            padding: '1px 5px',
                                                            fontSize: '0.58rem',
                                                            fontWeight: 700,
                                                            letterSpacing: '0.02em',
                                                            lineHeight: 1,
                                                            whiteSpace: 'nowrap',
                                                            textTransform: 'uppercase',
                                                            height: 20,
                                                            boxSizing: 'border-box',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            flexShrink: 0
                                                        }}>
                                                            {caseTypeRel.icon ? `${caseTypeRel.icon} ` : ''}{caseTypeRel.name}
                                                        </span>
                                                    );
                                                }

                                                // 2. Legacy type field'ına fallback
                                                const rawType = activeCaseInfo?.type || c?.type || 'GENEL';
                                                const typeConfig = {
                                                    GENEL:         { label: 'Genel', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
                                                    FIRSAT:        { label: 'Fırsat', bg: '#fef3c7', color: '#b45309', border: '#fcd34d' },
                                                    SIKAYET:       { label: 'Şikayet', bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' },
                                                    RANDEVU:       { label: 'Randevu', bg: '#fef3c7', color: '#b45309', border: '#fcd34d' },
                                                    DESTEK:        { label: 'Destek', bg: '#e0f2fe', color: '#0369a1', border: '#7dd3fc' },
                                                    IS_BASVURUSU:  { label: 'İş Başvurusu', bg: '#ede9fe', color: '#6d28d9', border: '#c4b5fd' },
                                                    LEAD:          { label: 'Lead', bg: '#fef3c7', color: '#b45309', border: '#fcd34d' },
                                                    SUPPORT:       { label: 'Destek', bg: '#e0f2fe', color: '#0369a1', border: '#7dd3fc' },
                                                    SALE:          { label: 'Satış', bg: '#d1fae5', color: '#047857', border: '#6ee7b7' },
                                                    PROJECT:       { label: 'Proje', bg: '#ede9fe', color: '#6d28d9', border: '#c4b5fd' },
                                                    COMPLAINT:     { label: 'Şikayet', bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' },
                                                    OTHER:         { label: 'Diğer', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
                                                };

                                                let resolvedType = rawType;
                                                if (rawType === 'GENEL') {
                                                    const title = (activeCaseInfo?.title || c?.title || '').toLowerCase();
                                                    const hasLeadKeywords = ['lead', 'talep', 'bilgi', 'başvuru', 'form', 'teklif', 'fırsat'].some(k => title.includes(k));
                                                    const hasComplaintKeywords = ['şikayet', 'sorun', 'hata', 'iade'].some(k => title.includes(k));
                                                    const hasSupportKeywords = ['destek', 'yardım', 'arıza', 'problem'].some(k => title.includes(k));

                                                    if (hasLeadKeywords) resolvedType = 'FIRSAT';
                                                    else if (hasComplaintKeywords) resolvedType = 'SIKAYET';
                                                    else if (hasSupportKeywords) resolvedType = 'DESTEK';
                                                }

                                                const cfg = typeConfig[resolvedType] || typeConfig.GENEL;
                                                return (
                                                    <span style={{
                                                        background: cfg.bg,
                                                        color: cfg.color,
                                                        border: `1px solid ${cfg.border}`,
                                                        borderRadius: 4,
                                                        padding: '1px 5px',
                                                        fontSize: '0.58rem',
                                                        fontWeight: 700,
                                                        letterSpacing: '0.02em',
                                                        lineHeight: 1,
                                                        whiteSpace: 'nowrap',
                                                        textTransform: 'uppercase',
                                                        height: 20,
                                                        boxSizing: 'border-box',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        flexShrink: 0
                                                    }}>
                                                        {cfg.label}
                                                    </span>
                                                );
                                            })()}

                                            {/* 🌟 Case Kaynağı Rozeti (Toplu Mesaj / WhatsApp / Meta Lead vb.) 🌟 */}
                                            {(() => {
                                                const isBulk = activeConv?.isBulkSend || Boolean(activeConv?.campaignId) || Boolean(activeCaseInfo?.campaignId);
                                                const campaignName = activeCaseInfo?.campaign?.name || activeConv?.campaign?.name;
                                                const rawSource = isBulk ? 'BULK' : (activeCaseInfo?.source || c?.source || activeConv?.source || activeConv?.channel || conversationData?.channel || profile?.source || 'MANUAL');

                                                const sourceConfig = {
                                                    BULK:          { icon: '📢', text: 'Toplu', bg: '#fef3c7', color: '#b45309', border: '#fde68a' },
                                                    WHATSAPP:      { icon: '💬', text: 'WhatsApp', bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
                                                    FACEBOOK_LEAD: { icon: '📋', text: 'Meta Lead', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
                                                    META_LEAD:     { icon: '📋', text: 'Meta Lead', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
                                                    LEAD:          { icon: '📋', text: 'Meta Lead', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
                                                    INSTAGRAM:     { icon: '📸', text: 'Instagram', bg: '#fdf4ff', color: '#a21caf', border: '#f0abfc' },
                                                    WEB:           { icon: '🌐', text: 'Web', bg: '#f0f9ff', color: '#0369a1', border: '#bae6fd' },
                                                    MANUAL:        { icon: '👤', text: 'Manuel', bg: '#ffffff', color: '#475569', border: '#e2e8f0' },
                                                };
                                                const srcKey = String(rawSource || '').toUpperCase();
                                                const srcCfg = sourceConfig[srcKey] || (srcKey.includes('BULK') ? sourceConfig.BULK : (srcKey.includes('INSTA') ? sourceConfig.INSTAGRAM : (srcKey.includes('WHATSAPP') ? sourceConfig.WHATSAPP : (srcKey.includes('LEAD') ? sourceConfig.FACEBOOK_LEAD : sourceConfig.MANUAL))));

                                                return (
                                                    <div
                                                        title={`Case Kaynağı: ${isBulk && campaignName ? `Toplu: ${campaignName}` : srcCfg.text}`}
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: 3,
                                                            background: srcCfg.bg, border: `1px solid ${srcCfg.border}`,
                                                            color: srcCfg.color, fontSize: '0.58rem', fontWeight: 600,
                                                            padding: '1px 5px', borderRadius: 4, height: 20,
                                                            boxSizing: 'border-box', flexShrink: 0, whiteSpace: 'nowrap'
                                                        }}
                                                    >
                                                        <span style={{ fontSize: '0.62rem' }}>{srcCfg.icon}</span>
                                                        <span>{srcCfg.text}</span>
                                                    </div>
                                                );
                                            })()}

                                            {/* Puan (Lead Score) */}
                                            {(() => {
                                                const score = activeCaseInfo?.leadScore ?? c?.leadScore;
                                                const temp = activeCaseInfo?.leadTemperature ?? c?.leadTemperature;
                                                if (score == null && !temp) return null;
                                                const scoreColorMap = { COLD: '#3b82f6', COOL: '#22c55e', WARM: '#eab308', HOT: '#f97316', FIRE: '#ef4444' };
                                                const scoreBgMap = { COLD: '#eff6ff', COOL: '#f0fdf4', WARM: '#fefce8', HOT: '#fff7ed', FIRE: '#fef2f2' };
                                                const scoreEmojiMap = { COLD: '🔵', COOL: '🟢', WARM: '🟡', HOT: '🟠', FIRE: '🔴' };
                                                const sColor = scoreColorMap[temp] || '#94a3b8';
                                                const sBg = scoreBgMap[temp] || '#f1f5f9';
                                                const sEmoji = scoreEmojiMap[temp] || '';
                                                return (
                                                    <div style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: 2.5,
                                                        padding: '1px 5px', height: 20, boxSizing: 'border-box', borderRadius: 10,
                                                        background: sBg, border: `1px solid ${sColor}25`,
                                                        fontSize: '0.58rem', fontWeight: 700, color: sColor, flexShrink: 0, whiteSpace: 'nowrap'
                                                    }}>
                                                        {sEmoji && <span style={{ fontSize: '0.5rem' }}>{sEmoji}</span>}
                                                        <span>{score ?? '—'}</span>
                                                    </div>
                                                );
                                            })()}

                                            {/* Şube dropdown */}
                                            {(() => {
                                                const matchCase = allCases.find(ac => ac.id === activeCaseInfo?.caseId);
                                                const currentBranchId = activeCaseInfo?.branchId || matchCase?.branchId || activeConv?.branchId || activeConv?.branch?.id || null;
                                                const currentBranch = availableBranches.find(b => b.id === currentBranchId) || activeCaseInfo?.branch || matchCase?.branch || activeConv?.branch || null;
                                                const branchDisplayName = currentBranch
                                                    ? currentBranch.name.replace(/\s*şubesi$/i, '').replace(/\s*şube$/i, '')
                                                    : 'Şube';

                                                return (
                                                    <>
                                                    <div style={{ position: 'relative', flexShrink: 1, minWidth: 0 }}>
                                                        <button
                                                            onClick={async () => {
                                                                if (branchOpenCaseId !== c.id && availableBranches.length === 0 && currentWorkspace?.id) {
                                                                    try {
                                                                        const res = await appointmentConfigAPI.getBranches(currentWorkspace.id);
                                                                        setAvailableBranches(res.data?.branches || []);
                                                                    } catch (e) { console.error(e); }
                                                                }
                                                                setBranchOpenCaseId(prev => prev === c.id ? null : c.id);
                                                                setBranchSearch('');
                                                            }}
                                                            style={{
                                                                background: currentBranch ? '#f0fdf4' : '#ffffff',
                                                                color: currentBranch ? '#16a34a' : '#475569',
                                                                border: `1px solid ${currentBranch ? '#bbf7d0' : '#e2e8f0'}`,
                                                                borderRadius: 4,
                                                                padding: '1px 5px',
                                                                fontSize: '0.58rem',
                                                                fontWeight: 600,
                                                                whiteSpace: 'nowrap',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: 3,
                                                                cursor: 'pointer',
                                                                transition: 'all 0.15s',
                                                                height: 20,
                                                                maxWidth: 90,
                                                                minWidth: 0,
                                                                boxSizing: 'border-box'
                                                            }}
                                                            title={currentBranch ? `Şube: ${currentBranch.name}` : 'Şube seç'}
                                                        >
                                                            <Building2 size={10} style={{ opacity: currentBranch ? 0.9 : 0.6, flexShrink: 0 }} />
                                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {branchDisplayName}
                                                            </span>
                                                            <ChevronDown size={7} style={{ opacity: 0.5, flexShrink: 0, transition: 'transform 0.2s', transform: branchOpenCaseId === c.id ? 'rotate(180deg)' : 'none' }} />
                                                        </button>
                                                    </div>

                                                    {(branchOpenCaseId === c.id) && (
                                                        <>
                                                        <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setBranchOpenCaseId(null)} />
                                                        <div
                                                            style={{
                                                                position: 'absolute',
                                                                top: '100%',
                                                                left: 12,
                                                                width: 250,
                                                                maxWidth: 'calc(100% - 24px)',
                                                                boxSizing: 'border-box',
                                                                zIndex: 9999,
                                                                background: '#fff',
                                                                border: '1px solid #e5e7eb',
                                                                borderRadius: 12,
                                                                boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
                                                                maxHeight: 320,
                                                                overflow: 'hidden',
                                                                marginTop: 4
                                                             }}
                                                            onClick={e => e.stopPropagation()}
                                                        >
                                                            <div style={{ padding: '8px' }}>
                                                                <input
                                                                    type="text"
                                                                    placeholder="Şube ara..."
                                                                    value={branchSearch}
                                                                    onChange={e => setBranchSearch(e.target.value)}
                                                                    autoFocus
                                                                    style={{
                                                                        width: '100%', padding: '6px 10px',
                                                                        border: '1px solid #e5e7eb', borderRadius: 8,
                                                                        fontSize: '0.75rem', outline: 'none',
                                                                        boxSizing: 'border-box'
                                                                    }}
                                                                />
                                                            </div>
                                                            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                                                                {currentBranch && (
                                                                    <button
                                                                        onClick={() => handleBranchSelect(null)}
                                                                        style={{
                                                                            width: '100%', padding: '7px 12px',
                                                                            background: 'none',
                                                                            border: 'none', borderBottom: '1px solid #f1f5f9',
                                                                            fontSize: '0.72rem', color: '#ef4444', cursor: 'pointer',
                                                                            textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6
                                                                        }}
                                                                    >
                                                                        <X size={12} /> Şubeyi Kaldır
                                                                    </button>
                                                                )}
                                                                {availableBranches
                                                                    .filter(b => !branchSearch || b.name.toLowerCase().includes(branchSearch.toLowerCase()))
                                                                    .map(branch => {
                                                                        const isSelected = currentBranchId === branch.id;
                                                                        return (
                                                                            <button
                                                                                key={branch.id}
                                                                                onClick={() => handleBranchSelect(branch.id)}
                                                                                style={{
                                                                                    width: '100%', padding: '6px 10px',
                                                                                    background: isSelected ? '#f0fdf4' : 'transparent',
                                                                                    border: 'none', fontSize: '0.72rem',
                                                                                    color: '#374151', cursor: 'pointer',
                                                                                    textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6,
                                                                                    transition: 'background 0.1s'
                                                                                }}
                                                                                onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                                                                                onMouseLeave={e => { e.currentTarget.style.background = isSelected ? '#f0fdf4' : 'transparent'; }}
                                                                            >
                                                                                <Building2 size={12} style={{ color: isSelected ? '#16a34a' : '#94a3b8' }} />
                                                                                <span style={{ flex: 1, fontWeight: isSelected ? 600 : 400 }}>{branch.name}</span>
                                                                                {isSelected && <Check size={12} style={{ color: '#16a34a' }} />}
                                                                            </button>
                                                                        );
                                                                    })
                                                                }
                                                                {availableBranches.filter(b => !branchSearch || b.name.toLowerCase().includes(branchSearch.toLowerCase())).length === 0 && (
                                                                    <div style={{ padding: '12px', textAlign: 'center', fontSize: '0.72rem', color: '#94a3b8' }}>
                                                                        Şube bulunamadı
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                        </>
                                                    )}
                                                    </>
                                                );
                                            })()}
                                        </div>

                                        {/* ═══ SATIR 3: Akış / Aşama — Durum (82px) ═══ */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 12px 6px' }}>
                                            {/* Akış / Aşama (CaseCards) */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                            {profile?.id && currentWorkspace?.id && (
                                                <CaseCards
                                                    workspaceId={currentWorkspace.id}
                                                    contactId={profile.id}
                                                    members={members}
                                                    teams={teams}
                                                    conversationId={conversationId}
                                                    activeCaseId={(c && c.id !== 'default') ? c.id : (conversationData?.caseId || null)}
                                                    inline={true}
                                                    showOnly="stages"
                                                    onCaseInfo={(info) => setActiveCaseInfo(prev => {
                                                        if (!prev || prev.caseId !== info.caseId) {
                                                            return { ...info, _savedTitle: info.title };
                                                        }
                                                        if (prev._userEdited) {
                                                            return { ...prev, ...info, title: prev.title, _userEdited: true };
                                                        }
                                                        return { ...prev, ...info, _savedTitle: info.title };
                                                    })}
                                                    onCasesLoaded={(cases) => setAllCases(sanitizeCases(cases))}
                                                    onStageChanged={({ funnelType, funnelStageId, stageName, stageColor }) => {
                                                        setFunnelStage({ id: funnelStageId, name: stageName, color: stageColor || '#6366f1' });
                                                        setLocalConvOverride(prev => ({
                                                            ...(prev || activeConv || conversationData || {}),
                                                            funnelStageId,
                                                            funnelType,
                                                            _effectiveStageId: funnelStageId
                                                        }));
                                                    }}
                                                />
                                            )}
                                            </div>

                                            {/* Durum (Açık/Kapalı) */}
                                            <div style={{ flexShrink: 0 }}>
                                                {(activeCaseInfo?.status || conversationData?.status) && (() => {
                                                    const currentFunnelType = c.funnelType;
                                                    const currentFunnel = currentFunnelType ? funnelOptions.find(f => f.value === currentFunnelType) : null;
                                                    const closingStages = currentFunnel?.stages
                                                        ?.filter(s => s.isClosing)
                                                        ?.map(s => ({ id: s.value, name: s.label, color: s.color, statusType: s.statusType }))
                                                        || c.closingStages || [];
                                                    const openStages = currentFunnel?.stages
                                                        ?.filter(s => !s.isClosing)
                                                        ?.map(s => ({ id: s.value, name: s.label, color: s.color }))
                                                        || c.openStages || [];
                                                    const caseStatusVal = (activeCaseInfo?.id === c.id && activeCaseInfo?.status) ? activeCaseInfo.status : c.status;
                                                    const isClosed = (caseStatusVal && caseStatusVal !== 'ACTIVE') || conversationData?.status === 'RESOLVED';

                                                    const currentOpt = isClosed
                                                        ? { label: 'Kapalı', color: '#ef4444', bg: '#fef2f2', border: '#fecaca', dotColor: '#ef4444' }
                                                        : { label: 'Açık', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', dotColor: '#22c55e' };

                                                    return (
                                                        <div style={{ position: 'relative', display: 'inline-flex' }}>
                                                            <button
                                                                onClick={() => setCaseStatusDropdownOpenCaseId(prev => prev === c.id ? null : c.id)}
                                                                style={{
                                                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                                                    width: 82, height: 28, borderRadius: 8, padding: 0,
                                                                    border: `1px solid ${currentOpt.border}`,
                                                                    background: currentOpt.bg, color: currentOpt.color,
                                                                    fontSize: '0.68rem', fontWeight: 600,
                                                                    cursor: 'pointer', whiteSpace: 'nowrap',
                                                                    boxSizing: 'border-box', flexShrink: 0,
                                                                    transition: 'all 0.15s'
                                                                }}
                                                            >
                                                                <span style={{ width: 5, height: 5, borderRadius: '50%', background: currentOpt.dotColor, flexShrink: 0 }} />
                                                                {currentOpt.label}
                                                                <ChevronDown size={8} style={{
                                                                    transition: 'transform 0.2s',
                                                                    transform: (caseStatusDropdownOpenCaseId === c.id) ? 'rotate(180deg)' : 'none',
                                                                    opacity: 0.6
                                                                }} />
                                                            </button>
                                                            {(caseStatusDropdownOpenCaseId === c.id) && (
                                                                <>
                                                                <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setCaseStatusDropdownOpenCaseId(null)} />
                                                                <div
                                                                    style={{
                                                                        position: 'absolute', top: '100%', right: 0, zIndex: 9999,
                                                                        background: '#fff', border: '1px solid #e5e7eb',
                                                                        borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                                                        minWidth: 170, marginTop: 4, overflow: 'hidden'
                                                                    }}
                                                                    onClick={e => e.stopPropagation()}
                                                                >
                                                                    {currentWorkspace?.id === 'd2f62dfb-36ba-4b8c-a4b8-938be2ad3a6f' ? (
                                                                        <div>
                                                                            <div style={{ padding: '6px 12px 3px', fontSize: '0.65rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                                                DURUM
                                                                            </div>
                                                                            <div style={{ height: 1, background: '#f3f4f6', margin: '3px 0' }} />

                                                                            {/* Açık seçeneği */}
                                                                            <div
                                                                                onClick={async () => {
                                                                                    if (!isClosed) {
                                                                                        setCaseStatusDropdownOpenCaseId(null);
                                                                                        return;
                                                                                    }
                                                                                    try {
                                                                                        const targetOpenStage = openStages.length > 0 ? openStages[0].id : null;
                                                                                        await caseAPI.update(currentWorkspace.id, c.id, {
                                                                                            status: 'ACTIVE',
                                                                                            ...(targetOpenStage ? { funnelStageId: targetOpenStage } : {})
                                                                                        });
                                                                                        setActiveCaseInfo(prev => ({
                                                                                            ...prev,
                                                                                            status: 'ACTIVE',
                                                                                            ...(targetOpenStage ? { funnelStageId: targetOpenStage } : {})
                                                                                        }));
                                                                                        window.dispatchEvent(new CustomEvent('websocket:case_updated', {
                                                                                            detail: { caseId: c.id, changes: { status: 'ACTIVE' } }
                                                                                        }));
                                                                                        window.dispatchEvent(new CustomEvent('case_cards_refresh'));
                                                                                        if (onConversationStatusChange && conversationId) {
                                                                                            onConversationStatusChange(conversationId, 'OPEN');
                                                                                        }
                                                                                    } catch (err) { console.error('Status update error:', err); }
                                                                                    setCaseStatusDropdownOpenCaseId(null);
                                                                                }}
                                                                                style={{
                                                                                    padding: '8px 12px', cursor: 'pointer',
                                                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                                                    fontSize: '0.78rem', fontWeight: !isClosed ? 700 : 500,
                                                                                    color: '#16a34a', background: !isClosed ? '#f0fdf4' : 'transparent',
                                                                                    transition: 'background 0.1s'
                                                                                }}
                                                                                onMouseEnter={e => { if (isClosed) e.currentTarget.style.background = '#f0fdf4'; }}
                                                                                onMouseLeave={e => { if (isClosed) e.currentTarget.style.background = 'transparent'; }}
                                                                            >
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                                                                                    Açık
                                                                                </div>
                                                                                {!isClosed && <span style={{ fontSize: '0.65rem', color: '#16a34a', fontWeight: 600 }}>✓ Aktif</span>}
                                                                            </div>

                                                                            {/* Kapat seçeneği */}
                                                                            <div
                                                                                onClick={async () => {
                                                                                    if (isClosed) {
                                                                                        setCaseStatusDropdownOpenCaseId(null);
                                                                                        return;
                                                                                    }
                                                                                    try {
                                                                                        const targetClosingStage = closingStages.length > 0 ? closingStages[0].id : null;
                                                                                        await caseAPI.update(currentWorkspace.id, c.id, {
                                                                                            status: 'CLOSED',
                                                                                            ...(targetClosingStage ? { funnelStageId: targetClosingStage } : {})
                                                                                        });
                                                                                        setActiveCaseInfo(prev => ({
                                                                                            ...prev,
                                                                                            status: 'CLOSED',
                                                                                            ...(targetClosingStage ? { funnelStageId: targetClosingStage } : {})
                                                                                        }));
                                                                                        window.dispatchEvent(new CustomEvent('websocket:case_updated', {
                                                                                            detail: { caseId: c.id, changes: { status: 'CLOSED' } }
                                                                                        }));
                                                                                        window.dispatchEvent(new CustomEvent('case_cards_refresh'));
                                                                                        if (onConversationStatusChange && conversationId) {
                                                                                            onConversationStatusChange(conversationId, 'RESOLVED');
                                                                                        }
                                                                                    } catch (err) { console.error('Status update error:', err); }
                                                                                    setCaseStatusDropdownOpenCaseId(null);
                                                                                }}
                                                                                style={{
                                                                                    padding: '8px 12px', cursor: 'pointer',
                                                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                                                    fontSize: '0.78rem', fontWeight: isClosed ? 700 : 500,
                                                                                    color: '#ef4444', background: isClosed ? '#fef2f2' : 'transparent',
                                                                                    transition: 'background 0.1s'
                                                                                }}
                                                                                onMouseEnter={e => { if (!isClosed) e.currentTarget.style.background = '#fef2f2'; }}
                                                                                onMouseLeave={e => { if (!isClosed) e.currentTarget.style.background = 'transparent'; }}
                                                                            >
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                                                                                    Kapat
                                                                                </div>
                                                                                {isClosed && <span style={{ fontSize: '0.65rem', color: '#ef4444', fontWeight: 600 }}>✓ Kapalı</span>}
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <>
                                                                            <div style={{ padding: '8px 14px 4px', fontSize: '0.65rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                                                {isClosed ? 'Tekrar Aç' : 'Nasıl kapandı?'}
                                                                            </div>
                                                                            <div style={{ height: 1, background: '#f3f4f6', margin: '4px 0' }} />

                                                                            {isClosed ? (
                                                                                openStages.length > 0 ? openStages.map((stage) => (
                                                                                    <div
                                                                                        key={stage.id}
                                                                                        onClick={async () => {
                                                                                            try {
                                                                                                await caseAPI.update(currentWorkspace.id, c.id, {
                                                                                                    status: 'ACTIVE',
                                                                                                    funnelStageId: stage.id
                                                                                                });
                                                                                                setActiveCaseInfo(prev => ({ ...prev, status: 'ACTIVE', funnelStageId: stage.id }));
                                                                                                window.dispatchEvent(new CustomEvent('websocket:case_updated', {
                                                                                                    detail: { caseId: c.id, changes: { status: 'ACTIVE' } }
                                                                                                }));
                                                                                                window.dispatchEvent(new CustomEvent('case_cards_refresh'));
                                                                                                if (onConversationStatusChange && conversationId) {
                                                                                                    onConversationStatusChange(conversationId, 'OPEN');
                                                                                                }
                                                                                            } catch (err) { console.error('Status update error:', err); }
                                                                                            setCaseStatusDropdownOpenCaseId(null);
                                                                                        }}
                                                                                        style={{
                                                                                            padding: '8px 14px', cursor: 'pointer',
                                                                                            display: 'flex', alignItems: 'center', gap: 8,
                                                                                            fontSize: '0.78rem', fontWeight: 500,
                                                                                            color: '#374151', background: 'transparent',
                                                                                            transition: 'background 0.1s'
                                                                                        }}
                                                                                        onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                                                                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                                                    >
                                                                                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: stage.color || '#22c55e', flexShrink: 0 }} />
                                                                                        {stage.name}
                                                                                    </div>
                                                                                )) : (
                                                                                    <div
                                                                                        onClick={async () => {
                                                                                            try {
                                                                                                await caseAPI.update(currentWorkspace.id, c.id, { status: 'ACTIVE' });
                                                                                                setActiveCaseInfo(prev => ({ ...prev, status: 'ACTIVE' }));
                                                                                                window.dispatchEvent(new CustomEvent('websocket:case_updated', {
                                                                                                    detail: { caseId: c.id, changes: { status: 'ACTIVE' } }
                                                                                                }));
                                                                                                window.dispatchEvent(new CustomEvent('case_cards_refresh'));
                                                                                                if (onConversationStatusChange && conversationId) {
                                                                                                    onConversationStatusChange(conversationId, 'OPEN');
                                                                                                }
                                                                                            } catch (err) { console.error('Status update error:', err); }
                                                                                            setCaseStatusDropdownOpenCaseId(null);
                                                                                        }}
                                                                                        style={{
                                                                                            padding: '8px 14px', cursor: 'pointer',
                                                                                            display: 'flex', alignItems: 'center', gap: 8,
                                                                                            fontSize: '0.78rem', fontWeight: 500,
                                                                                            color: '#16a34a', background: 'transparent',
                                                                                            transition: 'background 0.1s'
                                                                                        }}
                                                                                        onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'}
                                                                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                                                    >
                                                                                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                                                                                        Tekrar Aç
                                                                                    </div>
                                                                                )
                                                                            ) : (
                                                                                closingStages.length > 0 ? closingStages.map((cs) => (
                                                                                    <div
                                                                                        key={cs.id}
                                                                                        onClick={async () => {
                                                                                            try {
                                                                                                const statusType = cs.statusType || 'CLOSED';
                                                                                                await caseAPI.update(currentWorkspace.id, c.id, {
                                                                                                    status: statusType,
                                                                                                    funnelStageId: cs.id
                                                                                                });
                                                                                                setActiveCaseInfo(prev => ({ ...prev, status: statusType, funnelStageId: cs.id }));
                                                                                                window.dispatchEvent(new CustomEvent('websocket:case_updated', {
                                                                                                    detail: { caseId: c.id, changes: { status: statusType, funnelStageId: cs.id } }
                                                                                                }));
                                                                                                window.dispatchEvent(new CustomEvent('case_cards_refresh'));
                                                                                                if (onConversationStatusChange && conversationId) {
                                                                                                    onConversationStatusChange(conversationId, 'RESOLVED');
                                                                                                }
                                                                                            } catch (err) { console.error('Status update error:', err); }
                                                                                            setCaseStatusDropdownOpenCaseId(null);
                                                                                        }}
                                                                                        style={{
                                                                                            padding: '8px 14px', cursor: 'pointer',
                                                                                            display: 'flex', alignItems: 'center', gap: 8,
                                                                                            fontSize: '0.78rem', fontWeight: 500,
                                                                                            color: cs.color || '#ef4444', background: 'transparent',
                                                                                            transition: 'background 0.1s'
                                                                                        }}
                                                                                        onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                                                                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                                                    >
                                                                                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: cs.color || '#ef4444', flexShrink: 0 }} />
                                                                                        {cs.name}
                                                                                    </div>
                                                                                )) : (
                                                                                    <div
                                                                                        onClick={async () => {
                                                                                            try {
                                                                                                await caseAPI.update(currentWorkspace.id, c.id, { status: 'CLOSED' });
                                                                                                setActiveCaseInfo(prev => ({ ...prev, status: 'CLOSED' }));
                                                                                                window.dispatchEvent(new CustomEvent('websocket:case_updated', {
                                                                                                    detail: { caseId: c.id, changes: { status: 'CLOSED' } }
                                                                                                }));
                                                                                                window.dispatchEvent(new CustomEvent('case_cards_refresh'));
                                                                                                if (onConversationStatusChange && conversationId) {
                                                                                                    onConversationStatusChange(conversationId, 'RESOLVED');
                                                                                                }
                                                                                            } catch (err) { console.error('Status update error:', err); }
                                                                                            setCaseStatusDropdownOpenCaseId(null);
                                                                                        }}
                                                                                        style={{
                                                                                            padding: '8px 14px', cursor: 'pointer',
                                                                                            display: 'flex', alignItems: 'center', gap: 8,
                                                                                            fontSize: '0.78rem', fontWeight: 500,
                                                                                            color: '#ef4444', background: 'transparent',
                                                                                            transition: 'background 0.1s'
                                                                                        }}
                                                                                        onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                                                                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                                                    >
                                                                                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                                                                                        Kapat
                                                                                    </div>
                                                                                )
                                                                            )}
                                                                        </>
                                                                    )}
                                                                </div>
                                                                </>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </div>


                                        {isExpanded && (
                                            <>
                                            {/* ═══ SATIR 4: Kategori (flex: 1) — Ürün Ekle ═══ */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 12px 6px' }}>
                                                {/* Kategori etiketi */}
                                                <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                                                    {(() => {
                                                        const caseCatId = c?.categoryId || activeConv?.topicCategoryId;
                                                        const currentCaseCategory = c?.category || activeConv?.topicCategory || availableCategories.find(cat => cat.id === caseCatId) || null;

                                                        return (
                                                            <>
                                                            <button
                                                                onClick={async () => {
                                                                    if (categoryOpenCaseId !== c.id && availableCategories.length === 0) {
                                                                        try {
                                                                            const res = await getTopicCategories(currentWorkspace.id);
                                                                            setAvailableCategories(res.data || []);
                                                                        } catch (e) { console.error(e); }
                                                                    }
                                                                    setCategoryOpenCaseId(prev => prev === c.id ? null : c.id);
                                                                    setCategorySearch('');
                                                                }}
                                                                style={{
                                                                    background: currentCaseCategory?.name
                                                                        ? (currentCaseCategory.color || '#6366f1') + '18'
                                                                        : '#ffffff',
                                                                    color: currentCaseCategory?.color || '#334155',
                                                                    border: `1px solid ${currentCaseCategory?.name ? (currentCaseCategory.color || '#6366f1') + '40' : '#e2e8f0'}`,
                                                                    borderRadius: 6,
                                                                    padding: '0 8px',
                                                                    fontSize: '0.65rem',
                                                                    fontWeight: 600,
                                                                    whiteSpace: 'nowrap',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'space-between',
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.15s',
                                                                    height: 26,
                                                                    width: '100%',
                                                                    boxSizing: 'border-box'
                                                                }}
                                                            >
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                                                                    <span style={{ fontSize: '0.7rem' }}>
                                                                        {currentCaseCategory?.icon || '📁'}
                                                                    </span>
                                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                        {currentCaseCategory?.name || 'Kategori Seç'}
                                                                    </span>
                                                                </span>
                                                                <ChevronDown size={9} style={{ opacity: 0.5, flexShrink: 0, transition: 'transform 0.2s', transform: categoryOpenCaseId === c.id ? 'rotate(180deg)' : 'none' }} />
                                                            </button>

                                                            {(categoryOpenCaseId === c.id) && (
                                                                <>
                                                                <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setCategoryOpenCaseId(null)} />
                                                                <div style={{
                                                                    position: 'absolute',
                                                                    top: '100%',
                                                                    left: 0,
                                                                    zIndex: 9999,
                                                                    background: '#fff',
                                                                    border: '1px solid #e5e7eb',
                                                                    borderRadius: 12,
                                                                    boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
                                                                    width: 260,
                                                                    maxHeight: 320,
                                                                    overflow: 'hidden',
                                                                    marginTop: 4
                                                                }}
                                                                onClick={e => e.stopPropagation()}
                                                                >
                                                                    <div style={{ padding: '8px' }}>
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Kategori ara..."
                                                                            value={categorySearch}
                                                                            onChange={e => setCategorySearch(e.target.value)}
                                                                            autoFocus
                                                                            style={{
                                                                                width: '100%', padding: '6px 10px',
                                                                                border: '1px solid #e5e7eb', borderRadius: 8,
                                                                                fontSize: '0.75rem', outline: 'none'
                                                                            }}
                                                                        />
                                                                    </div>
                                                                    <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                                                                        <button
                                                                            onClick={async () => {
                                                                                try {
                                                                                    if (c?.id && c.id !== 'default') {
                                                                                        await caseAPI.update(currentWorkspace.id, c.id, { categoryId: null }).catch(() => {});
                                                                                        c.categoryId = null;
                                                                                        c.category = null;
                                                                                    }
                                                                                    if (activeConv?.id) {
                                                                                        await aiAPI.updateConversationAnalysis(currentWorkspace.id, activeConv.id, { topicCategoryId: null }).catch(() => {});
                                                                                        setLocalConvOverride(prev => ({
                                                                                            ...(prev || activeConv),
                                                                                            topicCategoryId: null,
                                                                                            topicCategory: null
                                                                                        }));
                                                                                    }
                                                                                    setCategoryOpenCaseId(null);
                                                                                } catch (e) { console.error(e); }
                                                                            }}
                                                                            style={{
                                                                                width: '100%', padding: '7px 12px',
                                                                                background: 'none',
                                                                                border: 'none', borderBottom: '1px solid #f1f5f9',
                                                                                fontSize: '0.72rem', color: '#94a3b8', cursor: 'pointer',
                                                                                textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6
                                                                            }}
                                                                        >
                                                                            <X size={12} /> Kategoriyi Kaldır
                                                                        </button>
                                                                        {availableCategories
                                                                            .filter(catItem => !categorySearch || catItem.name.toLowerCase().includes(categorySearch.toLowerCase()))
                                                                            .map(cat => {
                                                                                const isSelected = (currentCaseCategory?.id === cat.id) || (caseCatId === cat.id);
                                                                                return (
                                                                                    <button
                                                                                        key={cat.id}
                                                                                        onClick={async () => {
                                                                                            try {
                                                                                                if (c?.id && c.id !== 'default') {
                                                                                                    await caseAPI.update(currentWorkspace.id, c.id, { categoryId: cat.id }).catch(() => {});
                                                                                                    c.categoryId = cat.id;
                                                                                                    c.category = { id: cat.id, name: cat.name, icon: cat.icon, color: cat.color };
                                                                                                }
                                                                                                if (activeConv?.id) {
                                                                                                    const res = await aiAPI.updateConversationAnalysis(currentWorkspace.id, activeConv.id, { topicCategoryId: cat.id }).catch(() => {});
                                                                                                    setLocalConvOverride(prev => ({
                                                                                                        ...(prev || activeConv),
                                                                                                        topicCategoryId: cat.id,
                                                                                                        topicCategory: res?.data?.topicCategory || { id: cat.id, name: cat.name, icon: cat.icon, color: cat.color }
                                                                                                    }));
                                                                                                }
                                                                                                setCategoryOpenCaseId(null);
                                                                                            } catch (e) { console.error(e); }
                                                                                        }}
                                                                                        style={{
                                                                                            width: '100%', padding: '6px 10px',
                                                                                            background: isSelected ? '#f0fdf4' : 'transparent',
                                                                                            border: 'none', fontSize: '0.72rem',
                                                                                            color: '#374151', cursor: 'pointer',
                                                                                            textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6,
                                                                                            transition: 'background 0.1s'
                                                                                        }}
                                                                                        onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                                                                                        onMouseLeave={e => { e.currentTarget.style.background = isSelected ? '#f0fdf4' : 'transparent'; }}
                                                                                    >
                                                                                        <span style={{ fontSize: '0.75rem', width: 18, textAlign: 'center' }}>{cat.icon || '📁'}</span>
                                                                                        <span style={{ flex: 1 }}>{cat.name}</span>
                                                                                        {isSelected && <Check size={12} style={{ color: '#22c55e' }} />}
                                                                                    </button>
                                                                                );
                                                                            })
                                                                        }
                                                                    </div>
                                                                </div>
                                                                </>
                                                            )}
                                                            </>
                                                        );
                                                    })()}
                                                </div>

                                                {/* Ürün ekle butonu */}
                                                <div style={{ position: 'relative', flexShrink: 0 }}>
                                                    <button
                                                        onClick={() => {
                                                            setProductOpenCaseId(prev => prev === c.id ? null : c.id);
                                                            setProductSearchText('');
                                                        }}
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: 3,
                                                            padding: '0 8px', borderRadius: 6, height: 26,
                                                            background: '#ffffff', color: '#64748b',
                                                            border: '1px dashed #cbd5e1',
                                                            fontSize: '0.62rem', fontWeight: 600,
                                                            cursor: 'pointer', transition: 'all 0.15s',
                                                            whiteSpace: 'nowrap', boxSizing: 'border-box'
                                                        }}
                                                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#7c3aed'; e.currentTarget.style.color = '#7c3aed'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.color = '#64748b'; }}
                                                    >
                                                        <Plus size={11} /> Ürün
                                                    </button>

                                                    {(productOpenCaseId === c.id) && (
                                                        <>
                                                        <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setProductOpenCaseId(null)} />
                                                        <div
                                                            style={{
                                                                position: 'absolute',
                                                                top: '100%',
                                                                right: 0,
                                                                zIndex: 9999,
                                                                background: '#fff',
                                                                border: '1px solid #e5e7eb',
                                                                borderRadius: 12,
                                                                boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
                                                                width: 250,
                                                                maxHeight: 280,
                                                                overflow: 'hidden',
                                                                marginTop: 4
                                                            }}
                                                            onClick={e => e.stopPropagation()}
                                                        >
                                                            <div style={{ padding: '8px' }}>
                                                                <input
                                                                    type="text"
                                                                    placeholder="Ürün ara..."
                                                                    value={productSearchText}
                                                                    onChange={e => setProductSearchText(e.target.value)}
                                                                    autoFocus
                                                                    style={{
                                                                        width: '100%', padding: '6px 10px',
                                                                        border: '1px solid #e5e7eb', borderRadius: 8,
                                                                        fontSize: '0.75rem', outline: 'none',
                                                                        boxSizing: 'border-box'
                                                                    }}
                                                                />
                                                            </div>
                                                            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                                                                {catalogProducts
                                                                    .filter(p => !productSearchText || p.name?.toLowerCase().includes(productSearchText.toLowerCase()))
                                                                    .slice(0, 20)
                                                                    .map(product => {
                                                                        let existingProducts = [];
                                                                        try {
                                                                            const rawP = c.products || activeCaseInfo?.products;
                                                                            existingProducts = typeof rawP === 'string' ? JSON.parse(rawP || '[]') : rawP || [];
                                                                        } catch {}
                                                                        const isAdded = existingProducts.some(ep => ep.productId === product.id);
                                                                        return (
                                                                            <div
                                                                                key={product.id}
                                                                                onClick={async () => {
                                                                                    if (isAdded) return;
                                                                                    const caseId = c.id || activeCaseInfo?.caseId;
                                                                                    if (!caseId) return;
                                                                                    try {
                                                                                        const newProducts = [...existingProducts, {
                                                                                            productId: product.id,
                                                                                            name: product.name,
                                                                                            groupName: product.groupName || null,
                                                                                            quantity: 1,
                                                                                            unitPrice: product.price || 0
                                                                                        }];
                                                                                        await caseAPI.update(currentWorkspace.id, caseId, { products: JSON.stringify(newProducts) });
                                                                                        if (c.id === activeCaseInfo?.caseId) {
                                                                                            setActiveCaseInfo(prev => ({ ...prev, products: JSON.stringify(newProducts) }));
                                                                                        }
                                                                                        setAllCases(prev => prev.map(ac => ac.id === caseId ? { ...ac, products: JSON.stringify(newProducts) } : ac));
                                                                                        window.dispatchEvent(new CustomEvent('case_cards_refresh'));
                                                                                        setProductSearchText('');
                                                                                    } catch (err) { console.error('Ürün ekleme hatası:', err); }
                                                                                }}
                                                                                style={{
                                                                                    padding: '6px 10px', cursor: isAdded ? 'default' : 'pointer',
                                                                                    display: 'flex', alignItems: 'center', gap: 6,
                                                                                    fontSize: '0.72rem', color: isAdded ? '#94a3b8' : '#374151',
                                                                                    background: 'transparent',
                                                                                    transition: 'background 0.1s',
                                                                                    opacity: isAdded ? 0.5 : 1
                                                                                }}
                                                                                onMouseEnter={e => { if (!isAdded) e.currentTarget.style.background = '#f8fafc'; }}
                                                                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                                                            >
                                                                                <span style={{ fontSize: '0.7rem' }}>📦</span>
                                                                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</span>
                                                                                {product.price > 0 && <span style={{ fontSize: '0.6rem', color: '#94a3b8', flexShrink: 0 }}>₺{product.price}</span>}
                                                                                {isAdded && <Check size={12} style={{ color: '#22c55e', flexShrink: 0 }} />}
                                                                            </div>
                                                                        );
                                                                    })
                                                                }
                                                                {catalogProducts.filter(p => !productSearchText || p.name?.toLowerCase().includes(productSearchText.toLowerCase())).length === 0 && (
                                                                    <div style={{ padding: '12px', textAlign: 'center', fontSize: '0.72rem', color: '#94a3b8' }}>
                                                                        Ürün bulunamadı
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {/* ═══ SATIR 5: Ekli Ürünler (Varsa) ═══ */}
                                            {(() => {
                                                try {
                                                    let rawProducts = activeCaseInfo?.products;
                                                    if (!rawProducts && allCases?.length > 0 && activeCaseInfo?.caseId) {
                                                        const matchCase = allCases.find(ac => ac.id === activeCaseInfo.caseId);
                                                        rawProducts = matchCase?.products;
                                                    }
                                                    if (!rawProducts && allCases?.length > 0) {
                                                        rawProducts = allCases[0]?.products;
                                                    }
                                                    const prods = typeof rawProducts === 'string'
                                                        ? JSON.parse(rawProducts || '[]')
                                                        : rawProducts || [];
                                                    if (prods.length === 0) return null;
                                                    return (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 12px 6px', flexWrap: 'wrap' }}>
                                                            {prods.map((p, i) => (
                                                                <span key={'p' + i} style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: 3,
                                                                    padding: '2px 6px', borderRadius: 4, height: 22,
                                                                    background: '#fefce8', color: '#854d0e',
                                                                    border: '1px solid #fef08a',
                                                                    fontSize: '0.6rem', fontWeight: 600, whiteSpace: 'nowrap'
                                                                }}>
                                                                    📦 {p.name}
                                                                    <button
                                                                        onClick={async (e) => {
                                                                            e.stopPropagation();
                                                                            const caseId = activeCaseInfo?.caseId;
                                                                            if (!caseId) return;
                                                                            try {
                                                                                const newProducts = prods.filter(pp => pp.productId !== p.productId);
                                                                                await caseAPI.update(currentWorkspace.id, caseId, { products: JSON.stringify(newProducts) });
                                                                                setActiveCaseInfo(prev => ({ ...prev, products: JSON.stringify(newProducts) }));
                                                                                window.dispatchEvent(new CustomEvent('case_cards_refresh'));
                                                                            } catch (err) { console.error('Ürün silme hatası:', err); }
                                                                        }}
                                                                        style={{
                                                                            background: 'none', border: 'none', cursor: 'pointer',
                                                                            color: '#854d0e', padding: 0, display: 'flex', alignItems: 'center',
                                                                            opacity: 0.6, transition: 'opacity 0.15s'
                                                                        }}
                                                                        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                                                                        onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; }}
                                                                    >
                                                                        <X size={10} />
                                                                    </button>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    );
                                                } catch { return null; }
                                            })()}

                                        {/* ═══ SATIR 6: Takım / Kişi — Üstlen (82px) ═══ */}
                                        {!readOnly && (() => {
                                            let effectiveTeamId = null;
                                            let effectiveAgentId = null;
                                            let effectiveAgentObj = null;

                                            if (activeCaseInfo?.assignedTeamId || activeCaseInfo?.assignedToId) {
                                                effectiveTeamId = activeCaseInfo.assignedTeamId;
                                                effectiveAgentId = activeCaseInfo.assignedToId;
                                                effectiveAgentObj = activeCaseInfo.assignedTo;
                                            } else {
                                                let convTeamIds = [];
                                                try { convTeamIds = JSON.parse(activeConv?.teamIds || '[]'); } catch {}
                                                effectiveTeamId = convTeamIds[0] || activeConv?.assignedTeamId || null;
                                                effectiveAgentId = activeConv?.assignedToId || null;
                                                effectiveAgentObj = activeConv?.assignedTo || null;
                                            }

                                            const assignedTeam = effectiveTeamId ? teams.find(t => t.id === effectiveTeamId) : null;
                                            const assignedAgent = effectiveAgentObj || (effectiveAgentId ? (members.find(m => (m.user?.id || m.userId) === effectiveAgentId) || members.find(m => m.id === effectiveAgentId)) : null);

                                            let pillLabel = 'Atanmadı';
                                            const agentName = assignedAgent?.user?.name || assignedAgent?.name;
                                            if (assignedTeam && agentName) pillLabel = `${agentName} / ${assignedTeam.name}`;
                                            else if (assignedTeam) pillLabel = `${assignedTeam.name} (Havuz)`;
                                            else if (agentName) pillLabel = agentName;

                                            const canClaim = !effectiveAgentId || effectiveAgentId !== (currentUserId || user?.id);

                                            return (
                                                <div style={{ display: 'flex', gap: 6, padding: '2px 12px 6px', alignItems: 'center' }}>
                                                    <div ref={assignMegaMenuRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                                                        <button
                                                            className="stage-mega-trigger"
                                                            style={{
                                                                width: '100%', display: 'flex', justifyContent: 'space-between',
                                                                alignItems: 'center', fontSize: '0.72rem', height: 28,
                                                                padding: '0 10px', borderRadius: 8,
                                                                background: '#ffffff', border: '1px solid #e2e8f0',
                                                                fontWeight: 600, color: '#374151', cursor: 'pointer',
                                                                transition: 'all 0.15s'
                                                            }}
                                                            onClick={e => {
                                                                const rect = e.currentTarget.getBoundingClientRect();
                                                                setAssignMegaMenuPos({ top: rect.bottom + 6, left: Math.max(10, rect.right - 342) });
                                                                setAssignSelectedTeam(assignedTeam?.id || null);
                                                                setAssignMegaMenuOpenCaseId(prev => prev === c.id ? null : c.id);
                                                            }}
                                                            title="Atama"
                                                        >
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                                                                <Users size={11} style={{ flexShrink: 0 }} />
                                                                {pillLabel}
                                                            </span>
                                                            <ChevronDown size={10} style={{ flexShrink: 0 }} />
                                                        </button>

                                                        {(assignMegaMenuOpenCaseId === c.id) && (() => {
                                                            const menuTeam = assignSelectedTeam ? teams.find(t => t.id === assignSelectedTeam) : null;
                                                            const teamMembers = menuTeam?.members || [];
                                                            const ruleLabel = { POOL: 'Havuza At', ROUND_ROBIN: 'Sırayla At', LEAST_BUSY: 'En Az Yüklüye', ONLINE_ROUND_ROBIN: "Online'a Sırayla" };

                                                            return ReactDOM.createPortal(
                                                                <>
                                                                    <div
                                                                        style={{ position: 'fixed', inset: 0, zIndex: 99998 }}
                                                                        onClick={() => setAssignMegaMenuOpenCaseId(null)}
                                                                    />
                                                                    <div ref={assignMenuDivRef}
                                                                        style={{
                                                                            position: 'fixed',
                                                                            top: assignMegaMenuPos.top,
                                                                            left: assignMegaMenuPos.left,
                                                                            zIndex: 99999,
                                                                            background: '#fff',
                                                                            border: '1px solid #e2e8f0',
                                                                            borderRadius: 12,
                                                                            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                                                                            padding: 8,
                                                                            display: 'flex',
                                                                            flexDirection: 'row',
                                                                            gap: 4,
                                                                            minWidth: 340,
                                                                        }}
                                                                    >
                                                                        {/* Sol panel: Takımlar */}
                                                                        <div style={{ minWidth: 160, borderRight: '1px solid #f1f5f9', paddingRight: 8 }}>
                                                                            <div style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', padding: '4px 6px 6px' }}>Takım</div>
                                                                            <button
                                                                                onClick={() => handleAssign(null, null)}
                                                                                style={{
                                                                                    display: 'block', width: '100%', textAlign: 'left',
                                                                                    padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                                                                                    fontSize: '0.72rem', fontWeight: 500,
                                                                                    background: !assignSelectedTeam ? '#f0fdf4' : 'transparent',
                                                                                    color: !assignSelectedTeam ? '#166534' : '#374151'
                                                                                }}
                                                                            >
                                                                                🚫 Atamasız
                                                                            </button>
                                                                            {teams.map(t => (
                                                                                <button
                                                                                    key={t.id}
                                                                                    onClick={() => setAssignSelectedTeam(t.id)}
                                                                                    style={{
                                                                                        display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
                                                                                        padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                                                                                        fontSize: '0.72rem', fontWeight: 500,
                                                                                        background: assignSelectedTeam === t.id ? '#eff6ff' : 'transparent',
                                                                                        color: assignSelectedTeam === t.id ? '#1d4ed8' : '#374151'
                                                                                    }}
                                                                                >
                                                                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color || '#3b82f6', flexShrink: 0 }} />
                                                                                    {t.name}
                                                                                </button>
                                                                            ))}
                                                                        </div>

                                                                        {/* Sağ panel: Üyeler */}
                                                                        {assignSelectedTeam && (
                                                                            <div style={{ minWidth: 180 }}>
                                                                                <div style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', padding: '4px 6px 6px' }}>Atama</div>
                                                                                <button
                                                                                    onClick={() => handleAssign(assignSelectedTeam, null)}
                                                                                    style={{
                                                                                        display: 'block', width: '100%', textAlign: 'left',
                                                                                        padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                                                                                        fontSize: '0.72rem', fontWeight: 600,
                                                                                        background: '#fef3c7', color: '#92400e', marginBottom: 4
                                                                                    }}
                                                                                >
                                                                                    {ruleLabel[menuTeam?.assignmentRule] || 'Takıma At'} →
                                                                                </button>
                                                                                <div style={{ fontSize: '0.6rem', color: '#94a3b8', padding: '2px 6px 4px' }}>veya kişiye ata:</div>
                                                                                {teamMembers.length === 0 && (
                                                                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', padding: '4px 8px' }}>Üye yok</div>
                                                                                )}
                                                                                {teamMembers.map(m => {
                                                                                    const uid = m.user?.id || m.id;
                                                                                    const uname = m.user?.name || m.name || '?';
                                                                                    const uOnline = m.user?.isOnline || false;
                                                                                    return (
                                                                                        <button
                                                                                            key={uid}
                                                                                            onClick={() => handleAssign(assignSelectedTeam, uid)}
                                                                                            style={{
                                                                                                display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
                                                                                                padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                                                                                                fontSize: '0.72rem',
                                                                                                background: activeConv?.assignedToId === uid ? '#eff6ff' : 'transparent',
                                                                                                color: activeConv?.assignedToId === uid ? '#1d4ed8' : '#374151'
                                                                                            }}
                                                                                        >
                                                                                            <span style={{
                                                                                                width: 20, height: 20, borderRadius: '50%', background: '#3b82f6',
                                                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                                                fontSize: '0.6rem', color: '#fff', fontWeight: 700, flexShrink: 0
                                                                                            }}>
                                                                                                {uname[0].toUpperCase()}
                                                                                            </span>
                                                                                            {uname}
                                                                                            {uOnline && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', marginLeft: 'auto' }} />}
                                                                                            {activeConv?.assignedToId === uid && <span style={{ marginLeft: 'auto', fontSize: '0.65rem' }}>✓</span>}
                                                                                        </button>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </>,
                                                                document.body
                                                            );
                                                        })()}
                                                    </div>

                                                    {/* Üstlen butonu */}
                                                    {canClaim && (
                                                        <button
                                                            className="assign-claim-btn"
                                                            onClick={handleClaim}
                                                            disabled={takingOver}
                                                            title="Bu konuşmayı üstlen"
                                                            style={{
                                                                flexShrink: 0, whiteSpace: 'nowrap',
                                                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                                                fontSize: '0.68rem', fontWeight: 700, padding: 0,
                                                                width: 82, height: 28, borderRadius: 8,
                                                                border: '1.5px solid #ff2400', color: '#ff2400', background: '#ffffff',
                                                                boxSizing: 'border-box', cursor: 'pointer', transition: 'all 0.15s ease'
                                                            }}
                                                        >
                                                            <UserCheck size={11} />
                                                            Üstlen
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })()}

                                        {/* Hidden CaseCards for data sync */}
                                        {profile?.id && currentWorkspace?.id && (
                                            <div style={{ display: 'none' }}>
                                                <CaseCards
                                                    workspaceId={currentWorkspace.id}
                                                    contactId={profile.id}
                                                    members={members}
                                                    teams={teams}
                                                    conversationId={conversationId}
                                                    activeCaseId={(c && c.id !== 'default') ? c.id : (conversationData?.caseId || null)}
                                                    inline={true}
                                                    showOnly="actions"
                                                    onCaseInfo={(info) => setActiveCaseInfo(prev => {
                                                        if (!prev || prev.caseId !== info.caseId) {
                                                            return { ...info, _savedTitle: info.title };
                                                        }
                                                        if (prev._userEdited) {
                                                            return { ...prev, ...info, title: prev.title, _userEdited: true };
                                                        }
                                                        return { ...prev, ...info, _savedTitle: info.title };
                                                    })}
                                                    onCasesLoaded={(cases) => setAllCases(sanitizeCases(cases))}
                                                />
                                            </div>
                                        )}


                                        </>
                                        )}
                                    </div>


                                    {/* ── Timeline Steps ── */}
                                    {isExpanded && !timelineLoading && (caseTimeline.length > 0 || profile?.createdAt) && (() => {
                                        // Build journey milestones from timeline data + profile
                                        const milestones = [];

                                        // 1. Kişi kaydı oluşturuldu
                                        if (profile?.createdAt) {
                                            const isBulk = activeConv?.isBulkSend || Boolean(activeConv?.campaignId) || Boolean(activeCaseInfo?.campaignId);
                                            const campaignName = activeCaseInfo?.campaign?.name || activeConv?.campaign?.name;
                                            const sourceText = isBulk ? (campaignName ? `TOPLU MESAJ (${campaignName})` : 'TOPLU MESAJ') : (profile.source || 'MANUAL');
                                            milestones.push({
                                                icon: '📋',
                                                label: 'Kayıt Oluşturuldu',
                                                detail: `Kaynak: ${sourceText}`,
                                                date: new Date(profile.createdAt),
                                                color: '#ef4444',
                                                done: true,
                                                _type: 'RECORD'
                                            });
                                        }

                                        // 2. İlk sohbet
                                        const allTimeline = caseTimeline;
                                        const firstConv = allTimeline
                                            .filter(i => i.sourceType === 'CONVERSATION')
                                            .sort((a, b) => new Date(a.createdAt || a.date) - new Date(b.createdAt || b.date))[0];
                                        if (firstConv) {
                                            const convDetail = firstConv.aiTopic 
                                                || firstConv.lastMessageContent 
                                                || firstConv.title 
                                                || (firstConv.type === 'WHATSAPP' ? 'WhatsApp' : firstConv.type === 'INSTAGRAM' ? 'Instagram' : firstConv.type === 'FACEBOOK' ? 'Facebook' : 'Sohbet');
                                            // İlk sohbetin başlangıç tarihi: createdAt (oluşturulma), date değil (son mesaj)
                                            const convStartDate = new Date(firstConv.createdAt || firstConv.date);
                                            milestones.push({
                                                icon: '💬',
                                                label: 'İlk Sohbet Başladı',
                                                detail: convDetail,
                                                date: convStartDate,
                                                color: '#ef4444',
                                                done: true,
                                                _type: 'CONVERSATION',
                                                _sourceItems: [firstConv]
                                            });
                                        }

                                        // 3. Telefon alındı
                                        if (profile?.phone) {
                                            const isFromPhoneChannel = ['WHATSAPP', 'INSTAGRAM', 'PHONE'].includes(profile.source?.toUpperCase?.());
                                            const convStartDate = firstConv ? new Date(firstConv.createdAt || firstConv.date) : null;
                                            const phoneDate = isFromPhoneChannel
                                                ? new Date(profile.createdAt)
                                                : (convStartDate || new Date(profile.createdAt));
                                            milestones.push({
                                                icon: '📱',
                                                label: 'Telefon Alındı',
                                                detail: profile.phone,
                                                date: phoneDate,
                                                color: '#ef4444',
                                                done: true,
                                                _type: 'PHONE'
                                            });
                                        }

                                        // 4. Aramalar
                                        const calls = allTimeline.filter(i => (i.type === 'CALL' || i.type === 'REMINDER') && i.sourceType === 'ACTIVITY');
                                        const completedCalls = calls.filter(i => i.status === 'COMPLETED');
                                        const failedCalls = calls.filter(i => i.status === 'CANCELLED');

                                        const humanCompletedCalls = completedCalls.filter(call => {
                                            const isAI = call.source === 'AI' || call.source === 'RETELL' || call.assignedByType === 'AI';
                                            if (!isAI) return true;
                                            const callTime = new Date(call.completedAt || call.dueDate || call.date).getTime();
                                            const hasMatchingRetell = aiCalls.some(ac => {
                                                const retellTime = new Date(ac.createdAt).getTime();
                                                return Math.abs(callTime - retellTime) < 5 * 60 * 1000;
                                            });
                                            return !hasMatchingRetell;
                                        });

                                        humanCompletedCalls.forEach(call => {
                                            const callerName = call.assignedToName || call.completedByName || 'Bilinmeyen';
                                            const isAI = call.source === 'AI' || call.source === 'RETELL';
                                            const initials = callerName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
                                            let sentimentEmoji = '';
                                            if (call.callSentiment) {
                                                sentimentEmoji = call.callSentiment === 'Positive' ? ' 😊' : 
                                                                 call.callSentiment === 'Negative' ? ' 😞' : 
                                                                 call.callSentiment === 'WrongSend' ? ' ⚠️' : ' 😐';
                                            }
                                            milestones.push({
                                                icon: isAI ? '🤖' : '👤',
                                                label: `${isAI ? 'AI Arama' : callerName}${sentimentEmoji}`,
                                                detail: call.content || call.description || call.result || (call.callSuccessful === true ? 'Başarılı' : call.callSuccessful === false ? 'Başarısız' : 'Tamamlandı'),
                                                date: new Date(call.completedAt || call.dueDate || call.date),
                                                color: '#16a34a',
                                                done: true,
                                                _type: 'CALL',
                                                _sourceItems: [call],
                                                _callerInitials: isAI ? 'AI' : initials,
                                                _isAI: isAI
                                            });
                                        });

                                        aiCalls.forEach(aiCall => {
                                            let sentimentEmoji = '';
                                            if (aiCall.sentiment) {
                                                sentimentEmoji = aiCall.sentiment === 'Positive' ? ' 😊' : aiCall.sentiment === 'Negative' ? ' 😞' : ' 😐';
                                            }
                                            const isFailedAI = aiCall.status === 'not_connected' || aiCall.disconnectionReason === 'dial_no_answer' || aiCall.disconnectionReason?.startsWith('dial_');
                                            const isInbound = aiCall.direction === 'inbound';
                                            const dirIcon = isInbound ? '📲' : '🤖';
                                            const dirLabel = isInbound ? 'Gelen AI Arama' : 'AI Arama';
                                            if (!isFailedAI) {
                                                milestones.push({
                                                    icon: dirIcon,
                                                    label: `${dirLabel}${sentimentEmoji}`,
                                                    detail: aiCall.summary || aiCall.callTopic || (isInbound ? 'Müşteri geri aradı' : 'AI sesli arama'),
                                                    date: new Date(aiCall.createdAt),
                                                    color: isInbound ? '#0ea5e9' : '#6366f1',
                                                    done: true,
                                                    _type: 'CALL',
                                                    _sourceItems: [],
                                                    _aiCalls: [aiCall],
                                                    _callerInitials: isInbound ? '📲' : 'AI',
                                                    _isAI: true,
                                                    _isInbound: isInbound
                                                });
                                            }
                                        });

                                        const failedAiCalls = aiCalls.filter(ac =>
                                            ac.status === 'not_connected' || ac.disconnectionReason === 'dial_no_answer' || ac.disconnectionReason?.startsWith('dial_')
                                        );
                                        const allFailedEntries = [
                                            ...failedCalls.map(f => ({ date: new Date(f.dueDate || f.date), source: 'activity', item: f })),
                                            ...failedAiCalls.map(f => ({ date: new Date(f.createdAt), source: 'retell', item: f }))
                                        ].sort((a, b) => a.date - b.date);

                                        if (allFailedEntries.length > 0) {
                                            const lastFailed = allFailedEntries[allFailedEntries.length - 1];
                                            const reason = lastFailed.source === 'retell'
                                                ? `Aradı, ulaşamadı. (Sebep: ${lastFailed.item.disconnectionReason || 'cevap yok'})`
                                                : (lastFailed.item.content || 'Cevap yok');
                                            milestones.push({
                                                icon: '📵',
                                                label: `Ulaşılamadı${allFailedEntries.length > 1 ? ` (${allFailedEntries.length}x)` : ''}`,
                                                detail: reason,
                                                date: lastFailed.date,
                                                color: '#ef4444',
                                                done: true,
                                                _type: 'CALL_FAILED',
                                                _sourceItems: failedCalls
                                            });
                                        }

                                        // 5. Randevu / Görüşme
                                        const meetings = allTimeline.filter(i => i.type === 'MEETING' && i.sourceType === 'ACTIVITY');
                                        if (meetings.length > 0) {
                                            const lastMeeting = meetings.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
                                            milestones.push({
                                                icon: '📅',
                                                label: lastMeeting.status === 'COMPLETED' ? 'Randevu Tamamlandı' : lastMeeting.status === 'PLANNED' ? 'Randevu Planlandı' : 'Randevu',
                                                detail: lastMeeting.content || lastMeeting.description || null,
                                                date: new Date(lastMeeting.dueDate || lastMeeting.date),
                                                color: lastMeeting.status === 'COMPLETED' ? '#16a34a' : '#ef4444',
                                                done: lastMeeting.status === 'COMPLETED',
                                                _type: 'MEETING',
                                                _sourceItems: meetings
                                            });
                                        }

                                        // 6. Ziyaret
                                        const visits = allTimeline.filter(i => i.type === 'VISIT' && i.sourceType === 'ACTIVITY');
                                        if (visits.length > 0) {
                                            const lastVisit = visits.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
                                            milestones.push({
                                                icon: '🏢',
                                                label: 'Ziyaret',
                                                detail: lastVisit.content || null,
                                                date: new Date(lastVisit.dueDate || lastVisit.date),
                                                color: lastVisit.status === 'COMPLETED' ? '#16a34a' : '#ef4444',
                                                done: lastVisit.status === 'COMPLETED',
                                                _type: 'VISIT',
                                                _sourceItems: visits
                                            });
                                        }

                                        // 7. Teklif
                                        const proposals = allTimeline.filter(i => i.type === 'PROPOSAL' && i.sourceType === 'ACTIVITY');
                                        if (proposals.length > 0) {
                                            milestones.push({
                                                icon: '📄',
                                                label: `Teklif Verildi${proposals.length > 1 ? ` (${proposals.length}x)` : ''}`,
                                                detail: null,
                                                date: new Date(proposals[0].dueDate || proposals[0].date),
                                                color: '#ef4444',
                                                done: true,
                                                _type: 'PROPOSAL',
                                                _sourceItems: proposals
                                            });
                                        }

                                        // 8. Sipariş
                                        const orders = allTimeline.filter(i => i.type === 'ORDER' && i.sourceType === 'ACTIVITY');
                                        if (orders.length > 0) {
                                            milestones.push({
                                                icon: '🛒',
                                                label: `Sipariş${orders.length > 1 ? ` (${orders.length}x)` : ''}`,
                                                detail: null,
                                                date: new Date(orders[0].dueDate || orders[0].date),
                                                color: '#16a34a',
                                                done: true,
                                                _type: 'ORDER',
                                                _sourceItems: orders
                                            });
                                        }

                                        // 8.5 AI Aramaları — CALL milestone'a birleştirildi, ayrı entry yok

                                        // 9. Planlanmış aramalar (gelecek) - CALL
                                        const plannedCalls = plannedTimeline.filter(i => i.type === 'CALL' && i.status === 'PLANNED');
                                        if (plannedCalls.length > 0) {
                                            const nextCall = plannedCalls.sort((a, b) => new Date(a.dueDate || a.date) - new Date(b.dueDate || b.date))[0];
                                            const callDate = new Date(nextCall.dueDate || nextCall.date);
                                            const isOverdue = callDate < new Date();
                                            const hasCompletedCall = completedCalls.length > 0;
                                            milestones.push({
                                                icon: isOverdue ? '⚠️' : '📞',
                                                label: isOverdue ? 'Gecikmiş Arama' : 'Planlanan Arama',
                                                detail: (() => {
                                                    const parts = [];
                                                    if (nextCall.assignedToName) parts.push(`→ ${nextCall.assignedToName}`);
                                                    let topic = nextCall.callTopic;
                                                    if (!topic && nextCall.content) {
                                                        const match = nextCall.content.match(/Konu:\s*([^\s]+(?:\s+[^\s]+)*?)(?:\s+Numara:|\s+Kaynak:|\s*$)/i);
                                                        if (match) topic = match[1].trim();
                                                    }
                                                    if (topic) parts.push(`📋 ${topic}`);
                                                    return parts.length > 0 ? parts.join('  •  ') : null;
                                                })(),
                                                date: callDate,
                                                color: isOverdue ? '#dc2626' : '#3b82f6',
                                                done: false,
                                                overdue: isOverdue && !hasCompletedCall,
                                                _type: 'PLANNED_CALL',
                                                _sourceItems: plannedCalls
                                            });
                                        }

                                        // 9.2 Planlanmış Hatırlatıcılar (gelecek) - REMINDER
                                        const plannedReminders = plannedTimeline.filter(i => (i.type === 'REMINDER' || i.type === 'TASK') && i.status === 'PLANNED');
                                        if (plannedReminders.length > 0) {
                                            const nextRem = plannedReminders.sort((a, b) => new Date(a.dueDate || a.date) - new Date(b.dueDate || b.date))[0];
                                            const remDate = new Date(nextRem.dueDate || nextRem.date);
                                            const isOverdue = remDate < new Date();
                                            milestones.push({
                                                icon: isOverdue ? '⚠️' : '🔔',
                                                label: isOverdue ? 'Gecikmiş Hatırlatıcı' : 'Planlanan Hatırlatıcı',
                                                detail: nextRem.title || nextRem.content || null,
                                                date: remDate,
                                                color: isOverdue ? '#dc2626' : '#f59e0b',
                                                done: false,
                                                overdue: isOverdue,
                                                _type: 'PLANNED_REMINDER',
                                                _sourceItems: plannedReminders
                                            });
                                        }

                                        // 9.5 Notlar
                                        const noteItems = allTimeline.filter(i => i.type === 'NOTE' && i.sourceType === 'ACTIVITY');
                                        noteItems.forEach(note => {
                                            const noteContent = (note.content || '').replace(/<[^>]*>/g, '');
                                            const isCallNote = noteContent.startsWith('📞 Görüşme Notu:');
                                            const displayContent = isCallNote ? noteContent.replace('📞 Görüşme Notu:', '').trim() : noteContent;
                                            milestones.push({
                                                icon: isCallNote ? '📞' : '📝',
                                                label: isCallNote ? 'Arama Notu' : (note.title === 'Dahili Not' || note.id?.startsWith('inote_') ? 'Dahili Not' : 'Not Eklendi'),
                                                detail: [
                                                    note.labelName && note.labelName !== 'Kişi Notu' ? `${note.labelName}` : null,
                                                    displayContent ? (displayContent.length > 80 ? displayContent.substring(0, 80) + '...' : displayContent) : null
                                                ].filter(Boolean).join(' — ') || null,
                                                date: new Date(note.date),
                                                color: isCallNote ? '#10b981' : '#f59e0b',
                                                done: true,
                                                _type: 'NOTE',
                                                _sourceItems: [note],
                                                _noteData: note
                                            });
                                        });

                                        // 10. Conversation Events
                                        const rawEventItems = allTimeline.filter(i => i.sourceType === 'EVENT');
                                        const seenEvents = new Set();
                                        const eventItems = rawEventItems.filter(evt => {
                                            const evtTime = new Date(evt.date).getTime();
                                            const key = `${evt.title}_${Math.floor(evtTime / 60000)}`;
                                            if (seenEvents.has(key)) return false;
                                            seenEvents.add(key);
                                            return true;
                                        });
                                        eventItems.forEach(evt => {
                                            const eventType = evt.eventType || evt.type;
                                            let icon = '📌';
                                            let label = evt.title || '';
                                            let color = '#64748b';
                                            let detail = null;

                                            switch (eventType) {
                                                case 'ASSIGNED':
                                                    icon = '👤'; color = '#3b82f6';
                                                    label = evt.title || 'Agent Atandı';
                                                    break;
                                                case 'TRANSFERRED':
                                                    icon = '🔄'; color = '#8b5cf6';
                                                    label = evt.title || 'Transfer Edildi';
                                                    break;
                                                case 'STAGE_CHANGED':
                                                    icon = '🏷️'; color = '#f59e0b';
                                                    label = evt.title || 'Aşama Değişti';
                                                    if (evt.details?.fromStage && evt.details?.toStage) {
                                                        detail = `${evt.details.fromStage} → ${evt.details.toStage}`;
                                                    }
                                                    break;
                                                case 'FUNNEL_CHANGED':
                                                    icon = '📊'; color = '#6366f1';
                                                    label = evt.title || 'Akış Değişti';
                                                    if (evt.details?.funnelName) {
                                                        detail = evt.details.funnelName;
                                                    }
                                                    break;
                                                case 'CLAIMED':
                                                    icon = '✋'; color = '#10b981';
                                                    label = evt.title || 'Üstlenildi';
                                                    break;
                                                default:
                                                    break;
                                            }

                                            milestones.push({
                                                icon, label, detail,
                                                date: new Date(evt.date),
                                                color,
                                                done: true,
                                                _type: 'EVENT',
                                                _eventType: eventType
                                            });
                                        });

                                        // 11. Deals / Satış Milestones
                                        if (deals && deals.length > 0) {
                                            deals.forEach(deal => {
                                                const stageLabels = { QUOTE: 'Teklif Verildi', ORDER: 'Sipariş Oluşturuldu', INVOICE: 'Fatura Kesildi' };
                                                const stageIcons = { QUOTE: '📋', ORDER: '🛒', INVOICE: '🧾' };
                                                const stageColors = { QUOTE: '#f59e0b', ORDER: '#3b82f6', INVOICE: '#8b5cf6' };
                                                const currSymbol = deal.currency === 'TRY' ? '₺' : deal.currency === 'USD' ? '$' : deal.currency === 'EUR' ? '€' : '£';
                                                milestones.push({
                                                    icon: stageIcons[deal.stage] || '💰',
                                                    label: stageLabels[deal.stage] || 'Satış',
                                                    detail: [
                                                        deal.title,
                                                        deal.quoteNumber || deal.orderNumber || deal.invoiceNumber,
                                                        deal.amount ? `${currSymbol}${deal.amount.toLocaleString('tr-TR')}` : null
                                                    ].filter(Boolean).join(' • '),
                                                    date: new Date(deal.createdAt),
                                                    color: stageColors[deal.stage] || '#10b981',
                                                    done: true,
                                                    _type: 'DEAL',
                                                    _dealData: deal
                                                });
                                            });
                                        }

                                        // Sort by date, with type-based tiebreaker for same-second items
                                        const typePriority = {
                                            'RECORD': 0,       // Kayıt oluşturuldu (en önce)
                                            'CONVERSATION': 1,  // İlk sohbet başladı
                                            'PHONE': 2,         // Telefon alındı
                                            'EVENT': 3,         // Akış değiştirildi, aşama değişti
                                            'CALL_FAILED': 4,
                                            'CALL': 5,
                                            'NOTE': 6,
                                            'MEETING': 7,
                                            'VISIT': 8,
                                            'PROPOSAL': 9,
                                            'ORDER': 10,
                                            'DEAL': 11,
                                            'PLANNED_CALL': 99,     // Planlananlar en sona
                                            'PLANNED_REMINDER': 99
                                        };
                                        milestones.sort((a, b) => {
                                            const timeDiff = (a.date || 0) - (b.date || 0);
                                            if (timeDiff !== 0) return timeDiff;
                                            // Aynı saniyedeki items için mantıksal sıralama
                                            return (typePriority[a._type] ?? 50) - (typePriority[b._type] ?? 50);
                                        });

                                        if (milestones.length === 0) return null;

                                        return (
                                            <>
                                                <div className="journey-steps">
                                                    {milestones.map((m, idx) => {
                                                        const isClickable = m._sourceItems || m._dealData;
                                                        const handleStepClick = () => {
                                                            if (m._type === 'NOTE' && m._noteData) {
                                                                // Open note edit popup
                                                                setEditingNoteData(m._noteData);
                                                                setEditNoteText(m._noteData.content || m._noteData.description || '');
                                                            } else if (m._type === 'CALL' && m._aiCalls?.length > 0) {
                                                                setExpandedMilestone(m);
                                                            } else if (m._type === 'DEAL' && m._dealData) {
                                                                setSelectedDealDetail(m._dealData);
                                                            } else if (m._type === 'CONVERSATION' && m._sourceItems?.[0]?.conversationId) {
                                                                if (onConversationOpen) onConversationOpen(m._sourceItems[0].conversationId);
                                                                else setPopupConversationId(m._sourceItems[0].conversationId);
                                                            } else if (m._sourceItems?.length > 0) {
                                                                setExpandedMilestone(m);
                                                            }
                                                        };
                                                        return (
                                                        <div key={idx}
                                                            className={`journey-step ${m.done ? 'done' : 'pending'}${m.overdue ? ' overdue-blink' : ''}${isClickable ? ' clickable' : ''}${m._type === 'EVENT' ? ' event-step' : ''}`}
                                                            onClick={isClickable ? handleStepClick : undefined}
                                                            style={isClickable ? { cursor: 'pointer' } : {}}
                                                        >
                                                            <div className="journey-line-wrapper" style={{ position: 'relative' }}>
                                                                <div className="journey-dot" style={{ borderColor: m.color, background: m.done ? m.color : '#fff' }}>
                                                                    {m.done && <Check size={8} color="#fff" />}
                                                                </div>
                                                                {m._isAI && (
                                                                    <span className="journey-dot-ai-badge" style={{
                                                                        position: 'absolute',
                                                                        top: 10, right: -6,
                                                                        minWidth: 16, height: 16,
                                                                        borderRadius: '50%',
                                                                        background: m._isInbound ? '#0ea5e9' : '#7c3aed',
                                                                        color: '#fff',
                                                                        fontSize: '7px',
                                                                        fontWeight: 900,
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        boxShadow: '0 0 0 2px #f1f5f9',
                                                                        letterSpacing: '-0.03em',
                                                                        lineHeight: 1,
                                                                        zIndex: 2
                                                                    }}>
                                                                        AI
                                                                    </span>
                                                                )}
                                                                <div className="journey-line" style={{ background: m.done ? m.color : '#e2e8f0' }} />
                                                            </div>
                                                            <div className="journey-content">
                                                                <div className="journey-label">
                                                                    <span className="journey-emoji">{m.icon}</span>
                                                                    <span className="journey-title">{m.label}</span>
                                                                    {isClickable && (
                                                                        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }}>
                                                                            <ChevronRight size={12} color="#fff" />
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {m.detail && <div className="journey-detail">{m.detail}</div>}
                                                                {m.date && (
                                                                    <div className="journey-date">
                                                                        {m.date.toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                        );
                                                    })}

                                                    {/* '+' Hızlı Aksiyon & Popover Menü (Option A) */}
                                                    <div className="journey-step journey-action-step" style={{ position: 'relative', marginTop: 3, paddingBottom: 6 }}>
                                                        <div className="journey-line-wrapper" style={{ position: 'relative' }}>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setCaseActionMenuOpenId(caseActionMenuOpenId === c.id ? null : c.id);
                                                                }}
                                                                title="İşlem Ekle / Planla"
                                                                style={{
                                                                    width: 20,
                                                                    height: 20,
                                                                    borderRadius: '50%',
                                                                    border: '2px dashed #6366f1',
                                                                    background: '#eef2ff',
                                                                    color: '#4f46e5',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    fontSize: 12,
                                                                    fontWeight: 700,
                                                                    cursor: 'pointer',
                                                                    boxShadow: '0 0 0 3px #fff',
                                                                    zIndex: 2,
                                                                    padding: 0,
                                                                    transition: 'all 0.15s ease'
                                                                }}
                                                            >
                                                                +
                                                            </button>
                                                        </div>
                                                        <div className="journey-content" style={{ position: 'relative' }}>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setCaseActionMenuOpenId(caseActionMenuOpenId === c.id ? null : c.id);
                                                                }}
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: 5,
                                                                    padding: '4px 10px',
                                                                    fontSize: '0.73rem',
                                                                    fontWeight: 600,
                                                                    color: '#4f46e5',
                                                                    background: '#eef2ff',
                                                                    border: '1px solid #c7d2fe',
                                                                    borderRadius: 8,
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.15s ease'
                                                                }}
                                                            >
                                                                <span style={{ fontWeight: 800 }}>+</span>
                                                                <span>Arama Notu / Planla...</span>
                                                                <ChevronDown size={12} style={{ transform: caseActionMenuOpenId === c.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
                                                            </button>

                                                            {/* Dropdown Popover */}
                                                            {caseActionMenuOpenId === c.id && (
                                                                <div
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    style={{
                                                                        position: 'absolute',
                                                                        bottom: '100%',
                                                                        left: 0,
                                                                        marginBottom: 6,
                                                                        padding: 6,
                                                                        background: '#fff',
                                                                        border: '1px solid #e2e8f0',
                                                                        borderRadius: 12,
                                                                        boxShadow: '0 -10px 25px -5px rgba(0,0,0,0.15), 0 -8px 10px -6px rgba(0,0,0,0.1)',
                                                                        width: 220,
                                                                        zIndex: 50
                                                                    }}
                                                                >
                                                                    {/* 🌟 Vurgulu: Dahili Not Ekle */}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setCaseActionMenuOpenId(null);
                                                                            openInternalNoteModal(c.id);
                                                                        }}
                                                                        style={{
                                                                            width: '100%',
                                                                            textAlign: 'left',
                                                                            padding: '8px 10px',
                                                                            borderRadius: 8,
                                                                            background: '#fef3c7',
                                                                            color: '#92400e',
                                                                            border: '1px solid #fde68a',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: 8,
                                                                            marginBottom: 4,
                                                                            cursor: 'pointer'
                                                                        }}
                                                                    >
                                                                        <span style={{ width: 22, height: 22, borderRadius: 6, background: '#fde68a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>📝</span>
                                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                                            <div style={{ fontWeight: 700, fontSize: '0.74rem' }}>Dahili Not Ekle</div>
                                                                            <div style={{ fontSize: '0.64rem', color: '#b45309' }}>Timeline & Sohbete ekler</div>
                                                                        </div>
                                                                    </button>

                                                                    {/* Arama Notu */}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setCaseActionMenuOpenId(null);
                                                                            openActivityModal('NOTE', c.id);
                                                                        }}
                                                                        style={{
                                                                            width: '100%',
                                                                            textAlign: 'left',
                                                                            padding: '6px 8px',
                                                                            borderRadius: 6,
                                                                            border: 'none',
                                                                            background: 'transparent',
                                                                            color: '#334155',
                                                                            fontSize: '0.74rem',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: 8,
                                                                            cursor: 'pointer'
                                                                        }}
                                                                        onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                                                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                                    >
                                                                        <span style={{ width: 20, height: 20, borderRadius: 5, background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0 }}>📞</span>
                                                                        <span style={{ fontWeight: 500 }}>Arama Notu Gir</span>
                                                                    </button>

                                                                    {/* Arama Planla */}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setCaseActionMenuOpenId(null);
                                                                            openActivityModal('CALL', c.id);
                                                                        }}
                                                                        style={{
                                                                            width: '100%',
                                                                            textAlign: 'left',
                                                                            padding: '6px 8px',
                                                                            borderRadius: 6,
                                                                            border: 'none',
                                                                            background: 'transparent',
                                                                            color: '#334155',
                                                                            fontSize: '0.74rem',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: 8,
                                                                            cursor: 'pointer'
                                                                        }}
                                                                        onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                                                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                                    >
                                                                        <span style={{ width: 20, height: 20, borderRadius: 5, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0 }}>📞</span>
                                                                        <span style={{ fontWeight: 500 }}>Arama Planla</span>
                                                                    </button>

                                                                    {/* Görüşme Planla */}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setCaseActionMenuOpenId(null);
                                                                            openActivityModal('MEETING', c.id);
                                                                        }}
                                                                        style={{
                                                                            width: '100%',
                                                                            textAlign: 'left',
                                                                            padding: '6px 8px',
                                                                            borderRadius: 6,
                                                                            border: 'none',
                                                                            background: 'transparent',
                                                                            color: '#334155',
                                                                            fontSize: '0.74rem',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: 8,
                                                                            cursor: 'pointer'
                                                                        }}
                                                                        onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                                                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                                    >
                                                                        <span style={{ width: 20, height: 20, borderRadius: 5, background: '#f5f3ff', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0 }}>📅</span>
                                                                        <span style={{ fontWeight: 500 }}>Görüşme / Randevu Planla</span>
                                                                    </button>

                                                                    {/* Hatırlatıcı */}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setCaseActionMenuOpenId(null);
                                                                            openActivityModal('REMINDER', c.id);
                                                                        }}
                                                                        style={{
                                                                            width: '100%',
                                                                            textAlign: 'left',
                                                                            padding: '6px 8px',
                                                                            borderRadius: 6,
                                                                            border: 'none',
                                                                            background: 'transparent',
                                                                            color: '#334155',
                                                                            fontSize: '0.74rem',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: 8,
                                                                            cursor: 'pointer'
                                                                        }}
                                                                        onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                                                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                                    >
                                                                        <span style={{ width: 20, height: 20, borderRadius: 5, background: '#fff7ed', color: '#ea580c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0 }}>🔔</span>
                                                                        <span style={{ fontWeight: 500 }}>Hatırlatıcı Ekle</span>
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                                    );
                                })
                            })()}

                            {/* AI Araması Detay Modalı */}
                            {selectedAiCall && (
                                <div className="reminder-modal-overlay" onClick={() => setSelectedAiCall(null)}>
                                    <div className="reminder-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                                        <div className="reminder-modal-header">
                                            <span style={{ fontSize: '1.1rem' }}>{selectedAiCall.direction === 'inbound' ? '📲' : '🤖'}</span>
                                            <h3>{selectedAiCall.direction === 'inbound' ? 'Gelen AI Araması Detayı' : 'AI Araması Detayı'}</h3>
                                            <button className="reminder-modal-close" onClick={() => setSelectedAiCall(null)}><X size={18} /></button>
                                        </div>
                                        <div className="reminder-modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                                            {/* Stats */}
                                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                                                {/* Yön badge */}
                                                <span style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: '999px', background: selectedAiCall.direction === 'inbound' ? '#e0f2fe' : '#ede9fe', color: selectedAiCall.direction === 'inbound' ? '#0284c7' : '#7c3aed', fontWeight: 700 }}>
                                                    {selectedAiCall.direction === 'inbound' ? '📲 Gelen' : '📱 Giden'}
                                                </span>
                                                <span style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: '999px', background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
                                                    📅 {new Date(selectedAiCall.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                {selectedAiCall.duration && (
                                                    <span style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: '999px', background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
                                                        ⏱ {Math.floor(selectedAiCall.duration/60)}dk {selectedAiCall.duration%60}sn
                                                    </span>
                                                )}
                                                <span style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: '999px', background: selectedAiCall.callSuccessful ? '#dcfce7' : '#fef2f2', color: selectedAiCall.callSuccessful ? '#16a34a' : '#ef4444', fontWeight: 700 }}>
                                                    {selectedAiCall.callSuccessful ? '✓ Ulaşıldı' : '✗ Ulaşılamadı'}
                                                </span>
                                                {selectedAiCall.sentiment && (
                                                    <span style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: '999px', background: selectedAiCall.sentiment === 'Positive' ? '#dcfce7' : selectedAiCall.sentiment === 'Negative' ? '#fef2f2' : '#f3f4f6', color: selectedAiCall.sentiment === 'Positive' ? '#16a34a' : selectedAiCall.sentiment === 'Negative' ? '#ef4444' : '#6b7280', fontWeight: 600 }}>
                                                        {selectedAiCall.sentiment === 'Positive' ? '😊 Olumlu' : selectedAiCall.sentiment === 'Negative' ? '😞 Olumsuz' : '😐 Nötr'}
                                                    </span>
                                                )}
                                            </div>
                                            {/* Summary — otomatik Türkçe çeviri */}
                                            {selectedAiCall.summary && (
                                                <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '12px 14px', marginBottom: '10px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                                        <span style={{ fontWeight: 700, fontSize: '0.78rem', color: '#374151' }}>📝 Orijinal Özet</span>
                                                        {translatingSum && (
                                                            <span style={{ fontSize: '0.65rem', color: '#6366f1', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                                <Loader size={10} className="spin" /> Çevriliyor...
                                                            </span>
                                                        )}
                                                    </div>
                                                    {/* Orijinal (EN) */}
                                                    <div style={{ fontSize: '0.82rem', color: '#1e293b', lineHeight: 1.5 }}>
                                                        {selectedAiCall.summary}
                                                    </div>
                                                    {/* Türkçe Çeviri */}
                                                    <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                                            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#6366f1' }}>🇹🇷 Çevirisi</span>
                                                            {translatingSum && (
                                                                <span style={{ fontSize: '0.62rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                                    <Loader size={9} className="spin" /> Çevriliyor...
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.5, fontStyle: translatingSum ? 'italic' : 'normal' }}>
                                                            {translatingSum ? 'Çevriliyor...' : (translatedSummary || 'Çeviri bekleniyor...')}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            {/* Audio */}
                                            {selectedAiCall.recordingUrl && (
                                                <div style={{ marginBottom: '10px' }}>
                                                    <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#374151', marginBottom: '4px' }}>🎙 Ses Kaydı</div>
                                                    <audio src={selectedAiCall.recordingUrl} controls style={{ width: '100%', height: 36 }} />
                                                </div>
                                            )}
                                            {/* Transcript */}
                                            {selectedAiCall.transcript && (
                                                <div>
                                                    <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#374151', marginBottom: '6px' }}>💬 Konuşma</div>
                                                    <div style={{ maxHeight: '200px', overflowY: 'auto', background: '#f8fafc', borderRadius: '8px', padding: '8px 10px' }}>
                                                        {selectedAiCall.transcript.split('\n').filter(l => l.trim()).map((line, i) => {
                                                            const isAgent = line.startsWith('Agent:') || line.startsWith('AI:');
                                                            return (
                                                                <div key={i} style={{ marginBottom: '6px', padding: '4px 8px', borderRadius: '6px', background: isAgent ? '#eff6ff' : '#fef2f2', fontSize: '0.78rem', color: '#1e293b' }}>
                                                                    <span style={{ fontWeight: 600, color: isAgent ? '#2563eb' : '#dc2626', fontSize: '0.7rem' }}>{isAgent ? 'AI' : 'Müşteri'}:</span>{' '}
                                                                    {line.replace(/^(Agent:|AI:|User:|Customer:)\s*/i, '')}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Deal Detay Popup — Timeline'dan tıklandığında */}
                            {selectedDealDetail && (
                                <div className="reminder-modal-overlay" onClick={() => setSelectedDealDetail(null)}>
                                    <div className="reminder-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                                        <div className="reminder-modal-header">
                                            <span style={{ fontSize: '1.1rem' }}>
                                                {selectedDealDetail.stage === 'QUOTE' ? '📋' : selectedDealDetail.stage === 'ORDER' ? '🛒' : '🧾'}
                                            </span>
                                            <h3>{selectedDealDetail.stage === 'QUOTE' ? 'Teklif Detayı' : selectedDealDetail.stage === 'ORDER' ? 'Sipariş Detayı' : 'Fatura Detayı'}</h3>
                                            <button className="reminder-modal-close" onClick={() => setSelectedDealDetail(null)}><X size={18} /></button>
                                        </div>
                                        <div className="reminder-modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                                            {/* Başlık + Badge */}
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                                <span style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>{selectedDealDetail.title}</span>
                                                <span className={`deal-stage-badge ${selectedDealDetail.stage.toLowerCase()}`} style={{ fontSize: '0.7rem' }}>
                                                    {selectedDealDetail.stage === 'QUOTE' ? 'Teklif' : selectedDealDetail.stage === 'ORDER' ? 'Sipariş' : 'Fatura'}
                                                </span>
                                            </div>
                                            {/* Tutar */}
                                            <div style={{ background: '#f0fdf4', borderRadius: '10px', padding: '12px 14px', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <span style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>Toplam Tutar</span>
                                                <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#059669' }}>
                                                    {selectedDealDetail.currency === 'TRY' ? '₺' : selectedDealDetail.currency === 'USD' ? '$' : selectedDealDetail.currency === 'EUR' ? '€' : '£'}
                                                    {selectedDealDetail.amount?.toLocaleString('tr-TR')}
                                                </span>
                                            </div>
                                            {/* Belge No + Tarih */}
                                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                                {(selectedDealDetail.quoteNumber || selectedDealDetail.orderNumber || selectedDealDetail.invoiceNumber) && (
                                                    <span style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: '999px', background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
                                                        📄 {selectedDealDetail.quoteNumber || selectedDealDetail.orderNumber || selectedDealDetail.invoiceNumber}
                                                    </span>
                                                )}
                                                <span style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: '999px', background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
                                                    📅 {new Date(selectedDealDetail.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                {selectedDealDetail.status && (
                                                    <span style={{
                                                        fontSize: '0.72rem', padding: '3px 10px', borderRadius: '999px', fontWeight: 700,
                                                        background: selectedDealDetail.status === 'WON' ? '#dcfce7' : selectedDealDetail.status === 'LOST' ? '#fef2f2' : '#f3f4f6',
                                                        color: selectedDealDetail.status === 'WON' ? '#16a34a' : selectedDealDetail.status === 'LOST' ? '#ef4444' : '#6b7280'
                                                    }}>
                                                        {selectedDealDetail.status === 'WON' ? '✅ Kazanıldı' : selectedDealDetail.status === 'LOST' ? '❌ Kaybedildi' : '⏳ Açık'}
                                                    </span>
                                                )}
                                            </div>
                                            {/* Açıklama */}
                                            {selectedDealDetail.description && (
                                                <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '10px 14px', marginBottom: '10px' }}>
                                                    <div style={{ fontWeight: 700, fontSize: '0.72rem', color: '#374151', marginBottom: '4px' }}>📝 Açıklama</div>
                                                    <div style={{ fontSize: '0.82rem', color: '#1e293b', lineHeight: 1.5 }}>{selectedDealDetail.description}</div>
                                                </div>
                                            )}
                                            {/* Ürünler */}
                                            {selectedDealDetail.products && (() => {
                                                let prods = [];
                                                try { prods = typeof selectedDealDetail.products === 'string' ? JSON.parse(selectedDealDetail.products) : selectedDealDetail.products; } catch(e) {}
                                                if (!Array.isArray(prods) || prods.length === 0) return null;
                                                const currSymbol = selectedDealDetail.currency === 'TRY' ? '₺' : selectedDealDetail.currency === 'USD' ? '$' : selectedDealDetail.currency === 'EUR' ? '€' : '£';
                                                return (
                                                    <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '10px 14px', marginBottom: '10px' }}>
                                                        <div style={{ fontWeight: 700, fontSize: '0.72rem', color: '#374151', marginBottom: '6px' }}>📦 Ürünler</div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                            {prods.map((p, pi) => (
                                                                <div key={pi} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#1e293b', padding: '4px 0', borderBottom: pi < prods.length - 1 ? '1px solid #e5e7eb' : 'none' }}>
                                                                    <span>{p.name || `Ürün ${pi + 1}`}</span>
                                                                    <span style={{ fontWeight: 600, color: '#059669' }}>
                                                                        {p.quantity || 1} × {currSymbol}{(p.unitPrice || 0).toLocaleString('tr-TR')}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                            {/* Notlar */}
                                            {selectedDealDetail.notes && (
                                                <div style={{ background: '#fffbeb', borderRadius: '10px', padding: '10px 14px' }}>
                                                    <div style={{ fontWeight: 700, fontSize: '0.72rem', color: '#92400e', marginBottom: '4px' }}>💬 Notlar</div>
                                                    <div style={{ fontSize: '0.82rem', color: '#1e293b', lineHeight: 1.5 }}>{selectedDealDetail.notes}</div>
                                                </div>
                                            )}
                                            {/* Düzenle Butonu */}
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #e5e7eb' }}>
                                                <button onClick={() => {
                                                    const d = selectedDealDetail;
                                                    const prods = (() => {
                                                        try {
                                                            const p = typeof d.products === 'string' ? JSON.parse(d.products) : d.products;
                                                            return Array.isArray(p) && p.length > 0 ? p : [{ name: '', quantity: 1, unitPrice: 0 }];
                                                        } catch { return [{ name: '', quantity: 1, unitPrice: 0 }]; }
                                                    })();
                                                    setSelectedDealDetail(null);
                                                    if (d.stage === 'QUOTE') {
                                                        setQuoteFormData({ title: d.title || '', description: d.description || '', amount: d.amount || '', currency: d.currency || 'TRY', products: prods, notes: d.notes || '', caseId: d.caseId || activeCaseInfo?.id || (allCases?.length > 0 ? allCases[0].id : ''), _editId: d.id });
                                                        setShowQuoteForm(true);
                                                    } else if (d.stage === 'ORDER') {
                                                        setOrderFormData({ title: d.title || '', description: d.description || '', currency: d.currency || 'TRY', products: prods, notes: d.notes || '', caseId: d.caseId || activeCaseInfo?.id || (allCases?.length > 0 ? allCases[0].id : ''), _editId: d.id });
                                                        setShowOrderForm(true);
                                                    } else if (d.stage === 'INVOICE') {
                                                        setInvoiceFormData({ title: d.title || '', currency: d.currency || 'TRY', taxRate: d.taxRate || 20, dueDate: d.dueDate ? new Date(d.dueDate).toISOString().slice(0, 10) : '', products: prods, notes: d.notes || '', caseId: d.caseId || activeCaseInfo?.id || (allCases?.length > 0 ? allCases[0].id : ''), _editId: d.id });
                                                        setShowInvoiceForm(true);
                                                    }
                                                }}
                                                    style={{ flex: 1, background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 14px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                                                    <Pencil size={13} /> Düzenle
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Etkinlik Detay Modalı — Sohbet Akışı adımlarına tıklandığında */}
                            {expandedMilestone && expandedMilestone._sourceItems && (
                                <div className="reminder-modal-overlay" onClick={() => setExpandedMilestone(null)}>
                                    <div className="reminder-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                                        <div className="reminder-modal-header">
                                            <span style={{ fontSize: '1.1rem' }}>{expandedMilestone.icon}</span>
                                            <h3>{expandedMilestone.label}</h3>
                                            <button className="reminder-modal-close" onClick={() => setExpandedMilestone(null)}><X size={18} /></button>
                                        </div>
                                        <div className="reminder-modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                                            {expandedMilestone._type === 'CALL' && expandedMilestone._aiCalls?.length > 0 ? (
                                                /* Birleşik Arama + AI Call detayı */
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                    {expandedMilestone._aiCalls.map((ac, aci) => (
                                                        <div key={aci} style={{ background: '#f8fafc', borderRadius: '12px', padding: '14px', border: '1px solid #e5e7eb' }}>
                                                            {/* Arayan Kimliği + Yön */}
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid #e5e7eb' }}>
                                                                <span style={{ fontSize: '1rem' }}>{ac.direction === 'inbound' ? '📲' : '🤖'}</span>
                                                                <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1e293b' }}>{ac.direction === 'inbound' ? 'Müşteri Aradı' : 'AI Asistan'}</span>
                                                                <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '999px', background: ac.direction === 'inbound' ? '#e0f2fe' : '#ede9fe', color: ac.direction === 'inbound' ? '#0284c7' : '#7c3aed', fontWeight: 600, marginLeft: 'auto' }}>{ac.direction === 'inbound' ? '📲 Gelen Arama' : '📱 Giden Arama'}</span>
                                                            </div>
                                                            {/* Stats */}
                                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                                                <span style={{ fontSize: '0.72rem', padding: '3px 9px', borderRadius: '999px', background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
                                                                    📅 {safeFormatDateTime(ac.createdAt, { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                                {ac.duration && (
                                                                    <span style={{ fontSize: '0.72rem', padding: '3px 9px', borderRadius: '999px', background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
                                                                        ⏱ {Math.floor(ac.duration/60)}dk {ac.duration%60}sn
                                                                    </span>
                                                                )}
                                                                <span style={{ fontSize: '0.72rem', padding: '3px 9px', borderRadius: '999px', background: ac.callSuccessful ? '#dcfce7' : '#fef2f2', color: ac.callSuccessful ? '#16a34a' : '#ef4444', fontWeight: 700 }}>
                                                                    {ac.callSuccessful ? '✓ Ulaşıldı' : '✗ Ulaşılamadı'}
                                                                </span>
                                                                {ac.sentiment && (
                                                                    <span style={{ fontSize: '0.72rem', padding: '3px 9px', borderRadius: '999px', background: ac.sentiment === 'Positive' ? '#dcfce7' : ac.sentiment === 'Negative' ? '#fef2f2' : '#f3f4f6', color: ac.sentiment === 'Positive' ? '#16a34a' : ac.sentiment === 'Negative' ? '#ef4444' : '#6b7280', fontWeight: 600 }}>
                                                                        {ac.sentiment === 'Positive' ? '😊 Olumlu' : ac.sentiment === 'Negative' ? '😞 Olumsuz' : '😐 Nötr'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {/* Summary + Çeviri — ilk AI call için translate tetikle */}
                                                            {ac.summary && (
                                                                <div style={{ background: '#fff', borderRadius: '8px', padding: '10px 12px', marginBottom: '8px', border: '1px solid #e5e7eb' }}>
                                                                    <div style={{ fontWeight: 700, fontSize: '0.75rem', color: '#374151', marginBottom: '4px' }}>📝 Özet</div>
                                                                    <div style={{ fontSize: '0.8rem', color: '#1e293b', lineHeight: 1.5 }}>{ac.summary}</div>
                                                                    {/* Çeviri — sadece ilk AI call için (useEffect zaten tetikleniyor) */}
                                                                    {aci === 0 && (
                                                                        <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #cbd5e1' }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                                                                                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#6366f1' }}>🇹🇷 Çevirisi</span>
                                                                                {translatingSum && <Loader size={9} className="spin" style={{ color: '#6366f1' }} />}
                                                                            </div>
                                                                            <div style={{ fontSize: '0.78rem', color: '#475569', lineHeight: 1.5, fontStyle: translatingSum ? 'italic' : 'normal' }}>
                                                                                {translatingSum ? 'Çevriliyor...' : (translatedSummary || 'Çeviri bekleniyor...')}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                            {/* Audio */}
                                                            {ac.recordingUrl && (
                                                                <div style={{ marginBottom: '8px' }}>
                                                                    <div style={{ fontWeight: 700, fontSize: '0.75rem', color: '#374151', marginBottom: '4px' }}>🎙 Ses Kaydı</div>
                                                                    <audio src={ac.recordingUrl} controls style={{ width: '100%', height: 34 }} />
                                                                </div>
                                                            )}
                                                            {/* Transcript */}
                                                            {ac.transcript && (
                                                                <div>
                                                                    <div style={{ fontWeight: 700, fontSize: '0.75rem', color: '#374151', marginBottom: '4px' }}>💬 Konuşma</div>
                                                                    <div style={{ maxHeight: '180px', overflowY: 'auto', background: '#fff', borderRadius: '8px', padding: '6px 8px', border: '1px solid #e5e7eb' }}>
                                                                        {ac.transcript.split('\n').filter(l => l.trim()).map((line, i) => {
                                                                            const isAgent = line.startsWith('Agent:') || line.startsWith('AI:');
                                                                            return (
                                                                                <div key={i} style={{ marginBottom: '4px', padding: '3px 6px', borderRadius: '5px', background: isAgent ? '#eff6ff' : '#fef2f2', fontSize: '0.76rem', color: '#1e293b' }}>
                                                                                    <span style={{ fontWeight: 600, color: isAgent ? '#2563eb' : '#dc2626', fontSize: '0.68rem' }}>{isAgent ? 'AI' : 'Müşteri'}:</span>{' '}
                                                                                    {line.replace(/^(Agent:|AI:|User:|Customer:)\s*/i, '')}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                    {/* Normal aktivite kartları (scheduling bilgisi) */}
                                                    {expandedMilestone._sourceItems?.length > 0 && (
                                                        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '10px', marginTop: '2px' }}>
                                                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', marginBottom: '6px' }}>👤 Manuel Aramalar</div>
                                                            {expandedMilestone._sourceItems.map((item, ci) => {
                                                                const callerName = item.assignedToName || item.completedByName || 'Bilinmeyen';
                                                                const sentimentMap = { Positive: '😊', Neutral: '😐', Negative: '😞', WrongSend: '⚠️' };
                                                                return (
                                                                    <div key={ci} style={{ padding: '8px 10px', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', marginBottom: '4px' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1e293b' }}>👤 {callerName} — {item.title || 'Arama'}</div>
                                                                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                                                {item.callSuccessful !== undefined && item.callSuccessful !== null && (
                                                                                    <span style={{ fontSize: '0.62rem', padding: '2px 7px', borderRadius: '999px', background: item.callSuccessful ? '#dcfce7' : '#fef2f2', color: item.callSuccessful ? '#15803d' : '#ef4444', fontWeight: 700 }}>
                                                                                        {item.callSuccessful ? '✅ Başarılı' : '❌ Başarısız'}
                                                                                    </span>
                                                                                )}
                                                                                {item.callSentiment && (
                                                                                    <span style={{ fontSize: '1rem' }}>{sentimentMap[item.callSentiment] || '😐'}</span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                                                                            {(item.dueDate || item.date) && (
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.76rem' }}>
                                                                                    {/* Planlandı vs Yapıldı gösterimi */}
                                                                                    {item.dueDate && (
                                                                                        <span style={{ fontSize: 11, color: '#64748b' }}>
                                                                                            📅 {safeFormatDateTime(item.dueDate, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                                                        </span>
                                                                                    )}
                                                                                    {item.completedAt && item.dueDate && (
                                                                                        <span style={{ fontSize: 11, color: '#10b981', marginLeft: 6 }}>
                                                                                            ✅ {safeFormatDateTime(item.completedAt, { hour: '2-digit', minute: '2-digit' })}
                                                                                        </span>
                                                                                    )}
                                                                                    {!item.dueDate && item.date && (
                                                                                        <span style={{ fontSize: '0.68rem', color: '#6b7280' }}>
                                                                                            {safeFormatDateTime(item.date, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                            {item.result && (
                                                                                <span style={{ fontSize: '0.68rem', color: '#475569', fontStyle: 'italic' }}>— {item.result.substring(0, 60)}{item.result.length > 60 ? '…' : ''}</span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : expandedMilestone._type === 'PLANNED_CALL' ? (
                                                /* Planlanan aramalar — aksiyon butonlu */
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                    {expandedMilestone._sourceItems.map((item, ci) => {
                                                        const due = item.dueDate ? new Date(item.dueDate) : null;
                                                        const overdue = due && !isNaN(due.getTime()) && due < new Date();
                                                        return (
                                                        <div key={ci} style={{ padding: '12px 14px', background: overdue ? '#fef2f2' : '#f8fafc', borderRadius: '10px', border: `1px solid ${overdue ? '#fecaca' : '#e5e7eb'}` }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: overdue ? '#dc2626' : '#1e293b' }}>
                                                                    {item.title || 'Planlanan Arama'}
                                                                </span>
                                                                {overdue && <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '999px', background: '#fee2e2', color: '#dc2626', fontWeight: 700 }}>⚠️ Gecikmiş</span>}
                                                            </div>
                                                            {due && !isNaN(due.getTime()) && (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.76rem', color: '#6b7280', marginBottom: '6px' }}>
                                                                    <Clock size={12} />
                                                                    {safeFormatDateTime(due, { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                                </div>
                                                            )}
                                                            {(item.content || item.description) && (
                                                                <div style={{ fontSize: '0.82rem', color: '#374151', marginBottom: '8px', lineHeight: 1.4 }}>{item.content || item.description}</div>
                                                            )}
                                                            {item.callTopic && (
                                                                <div style={{ fontSize: '0.76rem', color: '#059669', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    📋 Konu: {item.callTopic}
                                                                </div>
                                                            )}
                                                            {item.assignedToName && (
                                                                <div style={{ fontSize: '0.72rem', color: '#6366f1', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    <User size={11} /> Atanan: {item.assignedToName}
                                                                </div>
                                                            )}
                                                            {item.assignedByName && (
                                                                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    Atayan: {item.assignedByType === 'SYSTEM' || item.assignedByType === 'AUTOMATION' ? '🤖 Otomatik' : item.assignedByName}
                                                                </div>
                                                            )}
                                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                                <button onClick={() => { setExpandedMilestone(null); setCompletingActivity(item); setCompleteResult(''); }}
                                                                    style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    <Check size={14} /> Tamamla
                                                                </button>
                                                                <button onClick={() => {
                                                                    setExpandedMilestone(null);
                                                                    setEditingActivityId(item.id);
                                                                    setActivityForm({ type: item.type || 'CALL', title: item.title || '', description: item.content || item.description || '',
                                                                        dueDate: item.dueDate ? (() => { const d = new Date(item.dueDate); const pad = n => String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; })() : '',
                                                                        assignedToId: item.assignedToId || '', teamId: item.teamId || '', funnelStageId: '', caseId: item.caseId || '' });
                                                                    setShowActivityModal(true);
                                                                }}
                                                                    style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '6px 14px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    <Pencil size={13} /> Düzenle
                                                                </button>
                                                            </div>
                                                        </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                /* Genel aktiviteler — Arama, Görüşme, Ziyaret, Teklif, Sipariş */
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                    {expandedMilestone._sourceItems.map((item, ci) => {
                                                        const statusMap = {
                                                            COMPLETED: { label: 'Tamamlandı', bg: '#dcfce7', color: '#15803d', icon: '✅' },
                                                            CANCELLED: { label: 'İptal', bg: '#f3f4f6', color: '#6b7280', icon: '❌' },
                                                            PLANNED: { label: 'Planlandı', bg: '#dbeafe', color: '#1d4ed8', icon: '🕜' },
                                                            IN_PROGRESS: { label: 'Devam Ediyor', bg: '#fef3c7', color: '#92400e', icon: '⏳' },
                                                        };
                                                        const sc = statusMap[item.status];
                                                        const typeLabels = { CALL: 'Arama', MEETING: 'Görüşme', VISIT: 'Ziyaret', TASK: 'Görev', PROPOSAL: 'Teklif', ORDER: 'Sipariş', NOTE: 'Not', REMINDER: 'Hatırlatıcı' };
                                                        return (
                                                        <div key={ci} style={{ padding: '12px 14px', background: '#fff', borderRadius: '10px', border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>
                                                                    {item.title || typeLabels[item.type] || expandedMilestone.label}
                                                                </span>
                                                                {sc && (
                                                                    <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '999px', background: sc.bg, color: sc.color, fontWeight: 700 }}>
                                                                        {sc.icon} {sc.label}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {(item.dueDate || item.date) && (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.76rem', marginBottom: '4px' }}>
                                                                    {/* Planlandı vs Yapıldı gösterimi */}
                                                                    {item.dueDate && (
                                                                        <span style={{ fontSize: 11, color: '#64748b' }}>
                                                                            📅 {new Date(item.dueDate).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                                        </span>
                                                                    )}
                                                                    {item.completedAt && item.dueDate && (
                                                                        <span style={{ fontSize: 11, color: '#10b981', marginLeft: 6 }}>
                                                                            ✅ {new Date(item.completedAt).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                                                        </span>
                                                                    )}
                                                                    {!item.dueDate && item.date && (
                                                                        <span style={{ fontSize: 11, color: '#64748b' }}>
                                                                            <Clock size={12} style={{ display: 'inline', marginRight: 4 }} />
                                                                            {new Date(item.date).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                            {item.assignedToName && (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#6366f1', marginBottom: '4px' }}>
                                                                    <User size={11} /> 👤 {item.assignedToName}
                                                                </div>
                                                            )}
                                                            {item.assignedByName && (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#94a3b8', marginBottom: '4px' }}>
                                                                    Kaydeden: {item.assignedByType === 'SYSTEM' || item.assignedByType === 'AUTOMATION' ? '🤖 Sistem' : item.assignedByName}
                                                                </div>
                                                            )}
                                                            {item.completedByName && (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#16a34a', marginBottom: '4px' }}>
                                                                    ✅ Tamamlayan: {item.completedByName}
                                                                </div>
                                                            )}
                                                            {(item.content || item.description) && (
                                                                <div style={{ fontSize: '0.82rem', color: '#374151', lineHeight: 1.5, marginTop: '4px', borderTop: '1px dashed #e5e7eb', paddingTop: '6px' }}>
                                                                    {item.content || item.description}
                                                                </div>
                                                            )}
                                                            {/* Aksiyon butonları */}
                                                            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                                                {item.status && item.status !== 'COMPLETED' && item.status !== 'CANCELLED' && (
                                                                    <button onClick={() => { setExpandedMilestone(null); setCompletingActivity(item); setCompleteResult(''); }}
                                                                        style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '5px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                                        <Check size={13} /> Tamamla
                                                                    </button>
                                                                )}
                                                                <button onClick={() => {
                                                                    setExpandedMilestone(null);
                                                                    setEditingActivityId(item.id);
                                                                    setActivityForm({ type: item.type || 'CALL', title: item.title || '', description: item.content || item.description || '',
                                                                        dueDate: item.dueDate ? (() => { const d = new Date(item.dueDate); const pad = n => String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; })() : '',
                                                                        assignedToId: item.assignedToId || '', teamId: item.teamId || '', funnelStageId: '', caseId: item.caseId || '' });
                                                                    setShowActivityModal(true);
                                                                }}
                                                                    style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '5px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                                    <Pencil size={12} /> Düzenle
                                                                </button>
                                                                <button onClick={() => { setExpandedMilestone(null); handleDeleteActivity(item.id); }}
                                                                    style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '8px', padding: '5px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                                    <Trash2 size={12} /> Sil
                                                                </button>
                                                            </div>
                                                        </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Not Düzenleme Modalı */}
                            {editingNoteData && (
                                <div className="reminder-modal-overlay" onClick={() => { setEditingNoteData(null); setEditNoteText(''); }}>
                                    <div className="reminder-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                                        <div className="reminder-modal-header">
                                            <span style={{ fontSize: '1.1rem' }}>📝</span>
                                            <h3>Not Düzenle</h3>
                                            <button className="reminder-modal-close" onClick={() => { setEditingNoteData(null); setEditNoteText(''); }}><X size={18} /></button>
                                        </div>
                                        <div className="reminder-modal-body">
                                            {/* Tarih bilgisi */}
                                            {editingNoteData.date && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', fontSize: '0.76rem', color: '#6b7280' }}>
                                                    <Clock size={13} />
                                                    {new Date(editingNoteData.date).toLocaleString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            )}
                                            {/* Kaydeden */}
                                            {(editingNoteData.assignedByName || editingNoteData.assignedToName) && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '10px', fontSize: '0.74rem', color: '#6366f1' }}>
                                                    <User size={12} />
                                                    {editingNoteData.assignedByName || editingNoteData.assignedToName}
                                                </div>
                                            )}
                                            {/* Not içeriği textarea */}
                                            <textarea
                                                value={editNoteText}
                                                onChange={(e) => setEditNoteText(e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    minHeight: '140px',
                                                    padding: '12px',
                                                    border: '1.5px solid #e5e7eb',
                                                    borderRadius: '10px',
                                                    fontSize: '0.88rem',
                                                    fontFamily: 'inherit',
                                                    lineHeight: 1.6,
                                                    resize: 'vertical',
                                                    outline: 'none',
                                                    transition: 'border-color 0.2s',
                                                    background: '#fafafa'
                                                }}
                                                onFocus={(e) => e.target.style.borderColor = '#6366f1'}
                                                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                                                placeholder="Not içeriği..."
                                                autoFocus
                                            />
                                        </div>
                                        <div className="reminder-modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', padding: '12px 16px', borderTop: '1px solid #f1f5f9' }}>
                                            <button
                                                onClick={() => { if (confirm('Bu notu silmek istediğinize emin misiniz?')) { handleDeleteActivity(editingNoteData.id); setEditingNoteData(null); setEditNoteText(''); } }}
                                                style={{
                                                    background: '#fee2e2',
                                                    color: '#ef4444',
                                                    border: 'none',
                                                    borderRadius: '8px',
                                                    padding: '8px 20px',
                                                    fontSize: '0.85rem',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    marginRight: 'auto',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}
                                            >
                                                <Trash2 size={16} />
                                                Sil
                                            </button>
                                            <button
                                                onClick={() => { setEditingNoteData(null); setEditNoteText(''); }}
                                                className="reminder-btn-cancel"
                                            >
                                                İptal
                                            </button>
                                            <button
                                                onClick={() => handleUpdateNote(editingNoteData, editNoteText)}
                                                disabled={!editNoteText.trim()}
                                                style={{
                                                    background: !editNoteText.trim() ? '#94a3b8' : '#6366f1',
                                                    color: '#fff',
                                                    border: 'none',
                                                    borderRadius: '8px',
                                                    padding: '8px 20px',
                                                    fontSize: '0.85rem',
                                                    fontWeight: 700,
                                                    cursor: !editNoteText.trim() ? 'not-allowed' : 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px'
                                                }}
                                            >
                                                <Save size={14} /> Kaydet
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}



                            {/* Activity Modal */}
                            {showActivityModal && (
                                <div className="reminder-modal-overlay" onClick={() => { setShowActivityModal(false); setEditingActivityId(null); }}>
                                    <div className="reminder-modal" onClick={e => e.stopPropagation()}>
                                        <div className="reminder-modal-header">
                                            {renderTimelineIcon(activityForm.type)}
                                            <h3>
                                                {editingActivityId ? 'Düzenle: ' : ''}
                                                {({
                                                    'NOTE': editingActivityId ? 'Görüşme Notu' : 'Görüşme Notu Ekle',
                                                    'CALL': editingActivityId ? 'Arama' : 'Arama Planla',
                                                    'MEETING': editingActivityId ? 'Görüşme' : 'Görüşme Planla',
                                                    'TASK': editingActivityId ? 'Görev' : 'Yeni Görev Ekle',
                                                    'PROPOSAL': 'Teklif Kaydı',
                                                    'ORDER': 'Sipariş Kaydı',
                                                    'INVOICE': 'Fatura Kaydı',
                                                    'PAYMENT': 'Ödeme Kaydı',
                                                })[activityForm.type] || 'Aktivite'}
                                            </h3>
                                            <button className="reminder-modal-close" onClick={() => { setShowActivityModal(false); setEditingActivityId(null); }}>
                                                <X size={18} />
                                            </button>
                                        </div>
                                        <div className="reminder-modal-body">
                                            
                                            <div className="reminder-form-group">
                                                <label><Briefcase size={14} /> İlgili Case <span style={{color: '#ef4444'}}>*</span></label>
                                                <select
                                                    value={activityForm.caseId || ''}
                                                    onChange={e => setActivityForm(prev => ({ ...prev, caseId: e.target.value }))}
                                                    style={{ borderColor: !activityForm.caseId ? '#fca5a5' : '#e5e7eb', marginBottom: '4px' }}
                                                >
                                                    <option value="">📁 Lütfen bir Case seçiniz...</option>
                                                    {(Array.isArray(distinctCases) ? distinctCases : []).map(c => (
                                                        <option key={c.id} value={c.id}>
                                                            {c?.caseNumber} {c.title ? `- ${c.title}` : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                                {!activityForm.caseId && <div style={{ fontSize: '10px', color: '#ef4444', marginBottom: '14px' }}>Bu işlem için Case seçimi zorunludur. (Açık bir case yoksa önce 'Yeni Case' oluşturun.)</div>}
                                            </div>

                                            {/* Planlanmış arama varsa — tamamla checkbox */}
                                            {activityForm.type === 'NOTE' && (
                                                <label style={{
                                                    display: 'flex', alignItems: 'center', gap: 10,
                                                    padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                                                    background: completePlannedCall ? '#eff6ff' : '#f9fafb',
                                                    border: `1.5px solid ${completePlannedCall ? '#93c5fd' : '#e5e7eb'}`,
                                                    marginBottom: 14, fontSize: '0.82rem', fontWeight: 600,
                                                    color: completePlannedCall ? '#1d4ed8' : '#6b7280',
                                                    transition: 'all 0.2s'
                                                }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={completePlannedCall}
                                                        onChange={e => setCompletePlannedCall(e.target.checked)}
                                                        style={{ width: 18, height: 18, accentColor: '#3b82f6', cursor: 'pointer' }}
                                                    />
                                                    <div>
                                                        <div>📋 Planlanmış aramayı tamamla</div>
                                                        <div style={{ fontSize: '0.7rem', fontWeight: 400, color: '#9ca3af', marginTop: 2 }}>
                                                            {existingPlannedCall?.dueDate
                                                                ? `${safeFormatDate(existingPlannedCall.dueDate)} tarihli planlı arama`
                                                                : 'Varsa açık planlı aramayı tamamla'}
                                                            {existingPlannedCall?.callTopic ? ` • ${existingPlannedCall.callTopic}` : ''}
                                                        </div>
                                                    </div>
                                                </label>
                                            )}
                                            {/* Arama Başarısı + Sentiment — NOTE tipi için */}
                                            {activityForm.type === 'NOTE' && (
                                                <>
                                                    <div style={{ marginBottom: '12px' }}>
                                                        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>📞 Arama Başarılı mı?</label>
                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => setNoteCallSuccess('SUCCESS')}
                                                                style={{
                                                                    flex: 1, padding: '10px', borderRadius: '10px', border: '2px solid',
                                                                    borderColor: noteCallSuccess === 'SUCCESS' ? '#16a34a' : '#e5e7eb',
                                                                    background: noteCallSuccess === 'SUCCESS' ? '#dcfce7' : '#fff',
                                                                    color: noteCallSuccess === 'SUCCESS' ? '#15803d' : '#6b7280',
                                                                    fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                                                                    transition: 'all 0.2s ease'
                                                                }}
                                                            >
                                                                ✅ Ulaşıldı
                                                                <div style={{ fontSize: '0.68rem', fontWeight: 400, marginTop: '2px', opacity: 0.8 }}>Görüşme sağlandı</div>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setNoteCallSuccess('FAILED')}
                                                                style={{
                                                                    flex: 1, padding: '10px', borderRadius: '10px', border: '2px solid',
                                                                    borderColor: noteCallSuccess === 'FAILED' ? '#ef4444' : '#e5e7eb',
                                                                    background: noteCallSuccess === 'FAILED' ? '#fef2f2' : '#fff',
                                                                    color: noteCallSuccess === 'FAILED' ? '#dc2626' : '#6b7280',
                                                                    fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                                                                    transition: 'all 0.2s ease'
                                                                }}
                                                            >
                                                                ❌ Ulaşılamadı
                                                                <div style={{ fontSize: '0.68rem', fontWeight: 400, marginTop: '2px', opacity: 0.8 }}>Açmadı veya meşgul</div>
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Duygu Analizi */}
                                                    {noteCallSuccess !== 'FAILED' && (
                                                    <div style={{ marginBottom: '12px' }}>
                                                        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>🎭 Görüşme Nasıl Geçti?</label>
                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                            {[
                                                                { key: 'Positive', emoji: '😊', label: 'Olumlu', color: '#16a34a', bg: '#dcfce7' },
                                                                { key: 'Neutral', emoji: '😐', label: 'Nötr', color: '#6b7280', bg: '#f3f4f6' },
                                                                { key: 'Negative', emoji: '😞', label: 'Olumsuz', color: '#ef4444', bg: '#fef2f2' }
                                                            ].map(s => (
                                                                <button
                                                                    key={s.key}
                                                                    type="button"
                                                                    onClick={() => setNoteCallSentiment(s.key)}
                                                                    style={{
                                                                        flex: 1, padding: '10px 6px', borderRadius: '10px', border: '2px solid',
                                                                        borderColor: noteCallSentiment === s.key ? s.color : '#e5e7eb',
                                                                        background: noteCallSentiment === s.key ? s.bg : '#fff',
                                                                        color: noteCallSentiment === s.key ? s.color : '#6b7280',
                                                                        fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                                                                        transition: 'all 0.2s ease', textAlign: 'center'
                                                                    }}
                                                                >
                                                                    <div style={{ fontSize: '1.4rem', marginBottom: '2px' }}>{s.emoji}</div>
                                                                    {s.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    )}
                                                </>
                                            )}
                                            {activityForm.type !== 'NOTE' && (
                                                <div className="reminder-form-group">
                                                    <label><FileText size={14} /> Başlık</label>
                                                    <input
                                                        type="text"
                                                        value={activityForm.title}
                                                        placeholder={({
                                                            'CALL': 'Müşteri geri aranacak',
                                                            'MEETING': 'Ofiste görüşme',
                                                            'TASK': 'Teklif hazırlanacak',
                                                            'PROPOSAL': '25.000₺ web sitesi teklifi',
                                                            'ORDER': 'Sipariş #1234',
                                                            'INVOICE': 'Fatura #5678',
                                                            'PAYMENT': '10.000₺ ödeme alındı',
                                                        })[activityForm.type] || 'Başlık girin...'}
                                                        onChange={e => setActivityForm(prev => ({ ...prev, title: e.target.value }))}
                                                    />
                                                </div>
                                            )}
                                            {activityForm.type !== 'NOTE' && (
                                                <div className="reminder-form-group">
                                                    <label><Clock size={14} /> Tarih / Zaman</label>
                                                    <input
                                                        type="datetime-local"
                                                        value={activityForm.dueDate}
                                                        onChange={e => setActivityForm(prev => ({ ...prev, dueDate: e.target.value }))}
                                                        min={new Date().toISOString().slice(0, 16)}
                                                    />
                                                </div>
                                            )}
                                            {activityForm.type !== 'NOTE' && (
                                                <div className="reminder-form-group">
                                                    <label><Users size={14} /> Takıma Ata (İsteğe Bağlı)</label>
                                                    <select
                                                        value={activityForm.teamId}
                                                        onChange={e => setActivityForm(prev => ({ ...prev, teamId: e.target.value, assignedToId: '' }))}
                                                    >
                                                        <option value="">Takım Seç / Tüm Ajanlar</option>
                                                        {(() => {
                                                            const renderOpts = (list, depth = 0) => list.flatMap(t => [
                                                                <option key={t.id} value={t.id}>{'\u00a0\u00a0'.repeat(depth)}{t.name}</option>,
                                                                ...(t.children ? renderOpts(t.children, depth + 1) : [])
                                                            ]);
                                                            return renderOpts(teams || []);
                                                        })()}
                                                    </select>
                                                </div>
                                            )}
                                            {activityForm.type !== 'NOTE' && (
                                                <div className="reminder-form-group">
                                                    <label><User size={14} /> Kişiye Ata (İsteğe Bağlı)</label>
                                                    <select
                                                        value={activityForm.assignedToId}
                                                        onChange={e => setActivityForm(prev => ({ ...prev, assignedToId: e.target.value }))}
                                                    >
                                                        <option value="">Atanmamış</option>
                                                        {(() => {
                                                            // Takım seçiliyse o takımın üyelerini filtrele
                                                            const selectedTeamId = activityForm.teamId;
                                                            const findTeam = (list, id) => {
                                                                for (const t of list) {
                                                                    if (t.id === id) return t;
                                                                    if (t.children) { const f = findTeam(t.children, id); if (f) return f; }
                                                                }
                                                                return null;
                                                            };
                                                            let filteredMembers = members || [];
                                                            if (selectedTeamId && teams) {
                                                                const team = findTeam(teams, selectedTeamId);
                                                                const memberIds = new Set((team?.members || []).map(m => m.userId));
                                                                filteredMembers = (members || []).filter(m => memberIds.has(m.user?.id || m.id));
                                                            }
                                                            return (Array.isArray(filteredMembers) ? filteredMembers : []).map(member => (
                                                                <option key={member.user?.id || member.id} value={member.user?.id || member.id}>
                                                                    {isUserOnline(member.user?.id || member.id, member.user) ? '🟢' : '⚪'} {member.user?.name || member.name}
                                                                </option>
                                                            ));
                                                        })()}
                                                    </select>
                                                </div>
                                            )}

                                            <div className="reminder-form-group">
                                                <label><FileText size={14} /> Açıklama {activityForm.type === 'NOTE' ? '*' : ''}</label>
                                                <textarea
                                                    value={activityForm.description}
                                                    onChange={e => setActivityForm(prev => ({ ...prev, description: e.target.value }))}
                                                    placeholder={activityForm.type === 'NOTE'
                                                        ? (callCompleted ? 'Görüşme notunu yazın...' : 'Dahili notu yazın...')
                                                        : 'Aktivite detaylarını buraya yazın...'}
                                                    rows={4}
                                                    autoFocus
                                                />
                                            </div>
                                        </div>
                                        <div className="reminder-modal-footer">
                                            <button className="reminder-btn-cancel" onClick={() => { setShowActivityModal(false); setEditingActivityId(null); }}>İptal</button>
                                            
                                            <button className="reminder-btn-save" onClick={handleSaveActivity} disabled={activitySaving}>
                                                {activitySaving ? <Loader className="spin" size={16} /> : <Save size={16} />}
                                                Kaydet
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Dahili Not Modalı (Option A & Timeline) */}
                            {showInternalNoteModal && (
                                <div className="reminder-modal-overlay" onClick={() => setShowInternalNoteModal(false)}>
                                    <div className="reminder-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                                        <div className="reminder-modal-header" style={{ borderBottom: '1px solid #fef3c7', background: '#fffbeb' }}>
                                            <span style={{ fontSize: '1.2rem' }}>📝</span>
                                            <h3 style={{ color: '#92400e', margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Dahili Not Ekle</h3>
                                            <button className="reminder-modal-close" onClick={() => setShowInternalNoteModal(false)}>
                                                <X size={18} />
                                            </button>
                                        </div>
                                        <div className="reminder-modal-body" style={{ padding: '16px 20px' }}>
                                            {/* Case Seçimi (Varsa birden fazla case arasından seçilebilir) */}
                                            {Array.isArray(distinctCases) && distinctCases.length > 1 && (
                                                <div className="reminder-form-group" style={{ marginBottom: 12 }}>
                                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#4b5563' }}><Briefcase size={13} /> İlgili Case</label>
                                                    <select
                                                        value={internalNoteCaseId || ''}
                                                        onChange={e => setInternalNoteCaseId(e.target.value)}
                                                        style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.8rem' }}
                                                    >
                                                        {distinctCases.map(c => (
                                                            <option key={c.id} value={c.id}>
                                                                {c.caseNumber ? `#${c.caseNumber} - ` : ''}{c.title || 'Case'}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}

                                            <div className="reminder-form-group" style={{ marginBottom: 8 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#92400e' }}>
                                                        İç Not İçeriği <span style={{ color: '#ef4444' }}>*</span>
                                                    </label>
                                                    <span style={{ fontSize: '0.68rem', color: '#b45309', background: '#fef3c7', padding: '2px 6px', borderRadius: 4 }}>
                                                        Müşteri görmez (Sadece ekip)
                                                    </span>
                                                </div>
                                                <textarea
                                                    value={internalNoteContent}
                                                    onChange={e => setInternalNoteContent(e.target.value)}
                                                    placeholder="Örn: Bu adamın babası çok iyi, yarın ara..."
                                                    rows={4}
                                                    autoFocus
                                                    style={{
                                                        width: '100%',
                                                        padding: '10px 12px',
                                                        borderRadius: 10,
                                                        border: '1.5px solid #fde68a',
                                                        background: '#fffdf5',
                                                        fontSize: '0.85rem',
                                                        lineHeight: 1.45,
                                                        outline: 'none',
                                                        boxSizing: 'border-box'
                                                    }}
                                                    onKeyDown={e => {
                                                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                                                            e.preventDefault();
                                                            handleSaveInternalNote();
                                                        }
                                                    }}
                                                />
                                                <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 4 }}>
                                                    İpucu: <strong>Cmd+Enter</strong> veya <strong>Ctrl+Enter</strong> ile hızlı kaydedebilirsiniz.
                                                </div>
                                            </div>
                                        </div>
                                        <div className="reminder-modal-footer" style={{ borderTop: '1px solid #f3f4f6', padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                            <button
                                                type="button"
                                                className="reminder-btn-cancel"
                                                onClick={() => setShowInternalNoteModal(false)}
                                                disabled={savingInternalNote}
                                            >
                                                İptal
                                            </button>
                                            <button
                                                type="button"
                                                className="reminder-btn-save"
                                                onClick={handleSaveInternalNote}
                                                disabled={savingInternalNote || !internalNoteContent.trim()}
                                                style={{
                                                    background: '#f59e0b',
                                                    color: '#fff',
                                                    border: 'none',
                                                    padding: '8px 16px',
                                                    borderRadius: 8,
                                                    fontWeight: 600,
                                                    fontSize: '0.82rem',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 6,
                                                    cursor: savingInternalNote || !internalNoteContent.trim() ? 'not-allowed' : 'pointer',
                                                    opacity: savingInternalNote || !internalNoteContent.trim() ? 0.6 : 1
                                                }}
                                            >
                                                {savingInternalNote ? <Loader className="spin" size={15} /> : <Save size={15} />}
                                                <span>Kaydet & Sohbete Ekle</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* TAMAMLAMA MODALI */}
                            {completingActivity && (
                                <div className="reminder-modal-overlay" onClick={() => setCompletingActivity(null)}>
                                    <div className="reminder-modal" onClick={e => e.stopPropagation()}>
                                        <div className="reminder-modal-header">
                                            <Check size={20} style={{ color: '#10b981' }} />
                                            <h3>Aktiviteyi Tamamla</h3>
                                            <button className="reminder-modal-close" onClick={() => setCompletingActivity(null)}>
                                                <X size={18} />
                                            </button>
                                        </div>
                                        <div className="reminder-modal-body">
                                            <div style={{ padding: '8px 12px', background: '#f0fdf4', borderRadius: '8px', marginBottom: '12px', fontSize: '0.82rem' }}>
                                                <strong>{renderTimelineTypeName(completingActivity.type)}</strong>
                                                {completingActivity.title && <span> — {completingActivity.title}</span>}
                                                {completingActivity.dueDate && (
                                                    <div style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '4px' }}>
                                                        <Clock size={12} /> {new Date(completingActivity.dueDate).toLocaleString('tr-TR')}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Arama sonuç bilgileri — sadece CALL/REMINDER tipi için */}
                                            {(completingActivity.type === 'CALL' || completingActivity.type === 'REMINDER') && (
                                                <>
                                                    {/* Başarılı / Başarısız */}
                                                    <div style={{ marginBottom: '12px' }}>
                                                        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>📞 Arama Başarılı mı?</label>
                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => setCompleteCallSuccess('SUCCESS')}
                                                                style={{
                                                                    flex: 1, padding: '10px', borderRadius: '10px', border: '2px solid',
                                                                    borderColor: completeCallSuccess === 'SUCCESS' ? '#16a34a' : '#e5e7eb',
                                                                    background: completeCallSuccess === 'SUCCESS' ? '#dcfce7' : '#fff',
                                                                    color: completeCallSuccess === 'SUCCESS' ? '#15803d' : '#6b7280',
                                                                    fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                                                                    transition: 'all 0.2s ease'
                                                                }}
                                                            >
                                                                ✅ Ulaşıldı
                                                                <div style={{ fontSize: '0.68rem', fontWeight: 400, marginTop: '2px', opacity: 0.8 }}>Görüşme sağlandı</div>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setCompleteCallSuccess('FAILED')}
                                                                style={{
                                                                    flex: 1, padding: '10px', borderRadius: '10px', border: '2px solid',
                                                                    borderColor: completeCallSuccess === 'FAILED' ? '#ef4444' : '#e5e7eb',
                                                                    background: completeCallSuccess === 'FAILED' ? '#fef2f2' : '#fff',
                                                                    color: completeCallSuccess === 'FAILED' ? '#dc2626' : '#6b7280',
                                                                    fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                                                                    transition: 'all 0.2s ease'
                                                                }}
                                                            >
                                                                ❌ Ulaşılamadı
                                                                <div style={{ fontSize: '0.68rem', fontWeight: 400, marginTop: '2px', opacity: 0.8 }}>Açmadı veya meşgul</div>
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Duygu Analizi */}
                                                    {completeCallSuccess !== 'FAILED' && (
                                                    <div style={{ marginBottom: '12px' }}>
                                                        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>🎭 Görüşme Nasıl Geçti?</label>
                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                            {[
                                                                { key: 'Positive', emoji: '😊', label: 'Olumlu', color: '#16a34a', bg: '#dcfce7' },
                                                                { key: 'Neutral', emoji: '😐', label: 'Nötr', color: '#6b7280', bg: '#f3f4f6' },
                                                                { key: 'Negative', emoji: '😞', label: 'Olumsuz', color: '#ef4444', bg: '#fef2f2' }
                                                            ].map(s => (
                                                                <button
                                                                    key={s.key}
                                                                    type="button"
                                                                    onClick={() => setCompleteCallSentiment(s.key)}
                                                                    style={{
                                                                        flex: 1, padding: '10px 6px', borderRadius: '10px', border: '2px solid',
                                                                        borderColor: completeCallSentiment === s.key ? s.color : '#e5e7eb',
                                                                        background: completeCallSentiment === s.key ? s.bg : '#fff',
                                                                        color: completeCallSentiment === s.key ? s.color : '#6b7280',
                                                                        fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                                                                        transition: 'all 0.2s ease', textAlign: 'center'
                                                                    }}
                                                                >
                                                                    <div style={{ fontSize: '1.4rem', marginBottom: '2px' }}>{s.emoji}</div>
                                                                    {s.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    )}
                                                </>
                                            )}

                                            <div className="reminder-form-group">
                                                <label><FileText size={14} /> Sonuç Notu</label>
                                                <textarea
                                                    value={completeResult}
                                                    onChange={e => setCompleteResult(e.target.value)}
                                                    placeholder="Görüşme sonucunu, notu veya detayları yazın..."
                                                    rows={3}
                                                    autoFocus
                                                />
                                            </div>
                                        </div>
                                        <div className="reminder-modal-footer">
                                            <button className="reminder-btn-cancel" onClick={() => setCompletingActivity(null)}>İptal</button>
                                            <button className="reminder-btn-save" onClick={handleCompleteActivity} style={{ background: '#10b981' }}>
                                                <Check size={16} />
                                                Tamamla
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Pazarlama İzinleri Row */}
                            {(() => {
                                let consents = { messaging: true, call: true, aiCall: true };
                                try {
                                    if (profile?.consentChannels) {
                                        consents = typeof profile.consentChannels === 'string'
                                            ? JSON.parse(profile.consentChannels)
                                            : profile.consentChannels;
                                    }
                                } catch {}

                                const handleConsentToggle = async (key) => {
                                    const newConsents = { ...consents, [key]: !consents[key] };
                                    const allOff = !newConsents.messaging && !newConsents.call && !newConsents.aiCall;
                                    const consentsStr = JSON.stringify(newConsents);
                                    setProfile(prev => ({ 
                                        ...prev, 
                                        consentChannels: consentsStr,
                                        marketingOptOut: allOff 
                                    }));
                                    await handleUpdateProfile({ 
                                        consentChannels: consentsStr,
                                        marketingOptOut: allOff,
                                        marketingOptOutAt: allOff ? new Date().toISOString() : null
                                    });
                                };

                                return (
                                    <div style={{ margin: '8px 0', padding: '12px 16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                                                🛡️ Pazarlama İzinleri
                                            </div>
                                            {(!consents.messaging && !consents.call && !consents.aiCall) && (
                                                <span style={{ fontSize: '10px', background: '#fef2f2', color: '#dc2626', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>Tümü Kapalı</span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {/* Messaging Toggle */}
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#334155' }}>
                                                    <MessageSquare size={14} color="#64748b" /> Mesajlaşma (SMS, WP)
                                                </div>
                                                <label className="sidebar-switch" style={{ width: '32px', height: '18px' }}>
                                                    <input type="checkbox" checked={consents.messaging !== false} onChange={() => handleConsentToggle('messaging')} />
                                                    <span className="sidebar-slider round"></span>
                                                </label>
                                            </div>
                                            {/* Call Toggle */}
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#334155' }}>
                                                    <Phone size={14} color="#64748b" /> Arama (İnsan)
                                                </div>
                                                <label className="sidebar-switch" style={{ width: '32px', height: '18px' }}>
                                                    <input type="checkbox" checked={consents.call !== false} onChange={() => handleConsentToggle('call')} />
                                                    <span className="sidebar-slider round"></span>
                                                </label>
                                            </div>
                                            {/* AI Call Toggle */}
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#334155' }}>
                                                    <Brain size={14} color="#64748b" /> AI Sesli Arama
                                                </div>
                                                <label className="sidebar-switch" style={{ width: '32px', height: '18px' }}>
                                                    <input type="checkbox" checked={consents.aiCall !== false} onChange={() => handleConsentToggle('aiCall')} />
                                                    <span className="sidebar-slider round"></span>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* ── Kayıt & Sistem Bilgileri (Eklenme Tarihi, Kaynak, Güncelleme, Sync, Import) ── */}
                            <div style={{ margin: '8px 0', padding: '12px 14px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span>📋</span>
                                        <span>Kayıt & Sistem Bilgileri</span>
                                    </div>
                                    {profile?.id && (
                                        <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 500 }}>
                                            ID: #{profile.id.slice(0, 8)}
                                        </span>
                                    )}
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {/* 1. Ne Zaman Eklendiği */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#475569', fontWeight: 500 }}>
                                            <Calendar size={13} color="#64748b" />
                                            <span>Ne Zaman Eklendi</span>
                                        </div>
                                        <span style={{ fontWeight: 600, color: '#1e293b', fontSize: '12px' }}>
                                            {profile?.createdAt ? safeFormatDateTime(profile.createdAt, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                                        </span>
                                    </div>

                                    {/* 2. Nereden Eklendiği (Kaynak) */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#475569', fontWeight: 500 }}>
                                            <MapPin size={13} color="#64748b" />
                                            <span>Nereden Eklendi</span>
                                        </div>
                                        {(() => {
                                            const src = getContactCreationSourceInfo(profile);
                                            return (
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                                    <span style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                        color: src.color,
                                                        background: src.bg,
                                                        border: `1px solid ${src.border}`,
                                                        padding: '1.5px 7px',
                                                        borderRadius: '5px'
                                                    }}>
                                                        <span>{src.icon}</span>
                                                        <span>{src.label}</span>
                                                    </span>
                                                    {profile?.leadSourceDetail && (
                                                        <span style={{ fontSize: '10px', color: '#64748b', fontStyle: 'italic', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={profile.leadSourceDetail}>
                                                            {profile.leadSourceDetail}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {/* 3. Son Güncelleme */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#475569', fontWeight: 500 }}>
                                            <Clock size={13} color="#64748b" />
                                            <span>Son Güncelleme</span>
                                        </div>
                                        <span style={{ color: '#475569', fontSize: '11.5px', fontWeight: 500 }}>
                                            {profile?.updatedAt ? safeFormatDateTime(profile.updatedAt, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                                        </span>
                                    </div>

                                    {/* 4. Sync İse Nereden Sync (Senkronizasyon) */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px', borderTop: '1px dashed #e2e8f0' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#475569', fontWeight: 500 }}>
                                            <RefreshCw size={13} color="#64748b" />
                                            <span>Senkronizasyon (Sync)</span>
                                        </div>
                                        {(() => {
                                            const sync = getContactSyncInfo(profile);
                                            if (sync) {
                                                return (
                                                    <span style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        padding: '2px 7px',
                                                        borderRadius: '5px',
                                                        background: sync.bg,
                                                        color: sync.color,
                                                        border: `1px solid ${sync.border}`,
                                                        fontSize: '11px',
                                                        fontWeight: 700
                                                    }}>
                                                        <RefreshCw size={10} style={{ animation: 'spin 8s linear infinite' }} />
                                                        <span>{sync.label} (Aktif)</span>
                                                    </span>
                                                );
                                            }
                                            return (
                                                <span style={{
                                                    fontSize: '11px',
                                                    color: '#94a3b8',
                                                    background: '#f1f5f9',
                                                    padding: '2px 7px',
                                                    borderRadius: '5px',
                                                    fontWeight: 500
                                                }}>
                                                    Senkronize Değil
                                                </span>
                                            );
                                        })()}
                                    </div>

                                    {/* 5. Import İse Nereden Import (İçe Aktarım) */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#475569', fontWeight: 500 }}>
                                            <FileSpreadsheet size={13} color="#64748b" />
                                            <span>İçe Aktarım (Import)</span>
                                        </div>
                                        {(() => {
                                            const imp = getContactImportInfo(profile);
                                            if (imp) {
                                                return (
                                                    <span style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        padding: '2px 7px',
                                                        borderRadius: '5px',
                                                        background: imp.bg,
                                                        color: imp.color,
                                                        border: `1px solid ${imp.border}`,
                                                        fontSize: '11px',
                                                        fontWeight: 700
                                                    }} title={imp.groupName ? `Grup/Dosya: ${imp.groupName}` : 'Excel Aktarımı'}>
                                                        <FileSpreadsheet size={10} />
                                                        <span>{imp.fullLabel}</span>
                                                    </span>
                                                );
                                            }
                                            return (
                                                <span style={{
                                                    fontSize: '11px',
                                                    color: '#94a3b8',
                                                    background: '#f1f5f9',
                                                    padding: '2px 7px',
                                                    borderRadius: '5px',
                                                    fontWeight: 500
                                                }}>
                                                    İçe Aktarılmadı
                                                </span>
                                            );
                                        })()}
                                    </div>

                                    {/* Son İletişim (varsa) */}
                                    {profile?.lastContactedAt && (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px', borderTop: '1px dashed #e2e8f0' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
                                                <MessageSquare size={12} color="#94a3b8" />
                                                <span>Son İletişim</span>
                                            </div>
                                            <span style={{ color: '#64748b', fontSize: '11px', fontWeight: 500 }}>
                                                {safeFormatDateTime(profile.lastContactedAt, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    )}

                                    {/* 6. Dahil Olduğu Listeler (Segmentler) */}
                                    {contactSegments.length > 0 && (
                                        <div style={{ paddingTop: '6px', borderTop: '1px dashed #e2e8f0' }}>
                                            <div
                                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: segmentsExpanded ? '6px' : 0 }}
                                                onClick={toggleSegmentsExpanded}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#475569', fontWeight: 500 }}>
                                                    <span style={{ fontSize: 13 }}>📊</span>
                                                    <span>Dahil Olduğu Listeler</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <span style={{
                                                        fontSize: '10px',
                                                        fontWeight: 700,
                                                        color: '#166534',
                                                        background: '#dcfce7',
                                                        padding: '1px 6px',
                                                        borderRadius: '8px',
                                                        border: '1px solid #bbf7d0'
                                                    }}>
                                                        {contactSegments.length}
                                                    </span>
                                                    <ChevronDown size={12} style={{ color: '#94a3b8', transition: 'transform 0.2s ease', transform: segmentsExpanded ? 'rotate(180deg)' : 'none' }} />
                                                </div>
                                            </div>
                                            {segmentsExpanded && (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                    {contactSegments.map(seg => (
                                                        <span key={`seg-${seg.id}`} style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '3px',
                                                            fontSize: '10.5px',
                                                            fontWeight: 600,
                                                            color: '#166534',
                                                            background: '#f0fdf4',
                                                            border: '1px solid #bbf7d0',
                                                            padding: '2px 7px',
                                                            borderRadius: '6px'
                                                        }}>
                                                            <span style={{ fontSize: 10 }}>{seg.icon}</span>
                                                            <span>{seg.label}</span>
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Active Deals Section */}
                            <div style={{
                                background: '#f8fafc',
                                border: '1px dashed #d1d5db',
                                borderRadius: '8px',
                                padding: '6px 10px 0',
                                marginTop: '8px',
                                marginBottom: '4px'
                            }}>
                                <div className="section-header" style={{ marginTop: 0, marginBottom: 0, paddingBottom: deals.length > 0 || dealsLoading ? '6px' : '6px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <TrendingUp size={14} style={{ color: '#10b981' }} />
                                        <h3>AKTİF SATIŞ</h3>
                                    </div>
                                </div>

                                {(dealsLoading || deals.length > 0) && (
                                    <div className="deals-list-container" style={{ paddingBottom: '6px' }}>
                                        {dealsLoading ? (
                                            <div className="summarizing-loader">
                                                <Loader className="spin" size={14} />
                                                <span>Yükleniyor...</span>
                                            </div>
                                        ) : (
                                            deals.slice(0, 5).map(deal => (
                                                <div key={deal.id} className="deal-card-mini">
                                                    <div className="deal-card-mini-header">
                                                        <span className="deal-title-mini">{deal.title}</span>
                                                        <span className={`deal-stage-badge ${deal.stage.toLowerCase()}`}>
                                                            {deal.stage === 'QUOTE' ? 'Teklif' : deal.stage === 'ORDER' ? 'Sipariş' : 'Fatura'}
                                                        </span>
                                                    </div>
                                                    <div className="deal-card-mini-footer">
                                                        <span className="deal-number-mini">{deal.quoteNumber || deal.orderNumber || deal.invoiceNumber}</span>
                                                        <span className="deal-amount-mini">
                                                            {deal.currency === 'TRY' ? '₺' : deal.currency === 'USD' ? '$' : deal.currency === 'EUR' ? '€' : '£'}
                                                            {deal.amount?.toLocaleString('tr-TR')}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>







                            {/* Block Contact Section */}
                            {!readOnly && profile.id && (
                                <div className="section-container block-section">


                                    {profile.isBlocked ? (
                                        <div className="blocked-status">
                                            <div className="blocked-badge">
                                                <Ban size={16} />
                                                <span>Bu kişi engellendi</span>
                                            </div>
                                            <button
                                                className="unblock-btn"
                                                onClick={handleUnblockContact}
                                                disabled={isBlocking}
                                            >
                                                {isBlocking ? <Loader className="spin" size={14} /> : <ShieldCheck size={14} />}
                                                Engeli Kaldır
                                            </button>
                                        </div>
                                    ) : showBlockConfirm ? (
                                        <div className="block-confirm">
                                            <p className="block-confirm-text">
                                                Bu kişiyi engellemek istediğinize emin misiniz?
                                                Engelledikten sonra bu kişiden mesaj almayacaksınız.
                                            </p>
                                            <div className="block-confirm-actions">
                                                <button
                                                    className="confirm-block-btn"
                                                    onClick={handleBlockContact}
                                                    disabled={isBlocking}
                                                >
                                                    {isBlocking ? <Loader className="spin" size={14} /> : <Ban size={14} />}
                                                    Evet, Engelle
                                                </button>
                                                <button
                                                    className="cancel-block-btn"
                                                    onClick={() => setShowBlockConfirm(false)}
                                                    disabled={isBlocking}
                                                >
                                                    İptal
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                className="block-btn"
                                                onClick={() => setShowBlockConfirm(true)}
                                                style={{ flex: 1 }}
                                            >
                                                <Ban size={14} />
                                                Bu Kişiyi Engelle
                                            </button>
                                            {user?.role === 'SUPER_ADMIN' && (
                                            <button
                                                className="block-btn"
                                                onClick={() => setShowDeleteConfirm(true)}
                                                style={{ width: 'auto', flex: 'none', padding: '8px 14px', minWidth: '44px' }}
                                                title="Bu Kişiyi Sil"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                            )}
                                        </div>
                                    )}

                                    {showDeleteConfirm && (
                                        <div className="block-confirm" style={{ marginTop: '8px' }}>
                                            <p className="block-confirm-text">
                                                Bu kişiyi ve tüm sohbetlerini silmek istediğinize emin misiniz?
                                                Bu işlem geri alınamaz.
                                            </p>
                                            <div className="block-confirm-actions">
                                                <button
                                                    className="confirm-block-btn"
                                                    onClick={handleDeleteContact}
                                                    disabled={isDeleting}
                                                    style={{ background: '#dc2626' }}
                                                >
                                                    {isDeleting ? <Loader className="spin" size={14} /> : <Trash2 size={14} />}
                                                    Evet, Sil
                                                </button>
                                                <button
                                                    className="cancel-block-btn"
                                                    onClick={() => setShowDeleteConfirm(false)}
                                                    disabled={isDeleting}
                                                >
                                                    İptal
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                        </>
                    ) : null}
                </div>
                {/* ═══ STICKY FOOTER — Aktivite & Satış Butonları ═══ */}
                {profile && (
                    <div className="sidebar-action-footer">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginBottom: 4 }}>
                            <button className="activity-btn" style={{ padding: '6px 3px', minHeight: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px' }} onClick={() => openActivityModal('NOTE')}>
                                <span style={{ position: 'relative', display: 'inline-flex', width: 24, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                                    <PhoneCall size={15} style={{ color: '#374151' }} />
                                    <span style={{ position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 1.5px #fff' }}>
                                        <Check size={7} strokeWidth={3} style={{ color: '#fff' }} />
                                    </span>
                                    <StickyNote size={8} style={{ position: 'absolute', top: -2, left: -1, color: '#f59e0b' }} />
                                </span>
                                <span style={{ fontSize: '0.55rem', color: '#6b7280', fontWeight: 500, textAlign: 'center', lineHeight: 1.1 }}>Arama Notu</span>
                            </button>
                            <button className="activity-btn" style={{ padding: '6px 3px', minHeight: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px' }} onClick={() => openActivityModal('CALL')}>
                                <PhoneCall size={15} />
                                <span style={{ fontSize: '0.55rem', color: '#6b7280', fontWeight: 500, textAlign: 'center', lineHeight: 1.1 }}>Arama Planla</span>
                            </button>
                            <button className="activity-btn" style={{ padding: '6px 3px', minHeight: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px' }} onClick={() => openActivityModal('MEETING')}>
                                <CalendarDays size={15} />
                                <span style={{ fontSize: '0.55rem', color: '#6b7280', fontWeight: 500, textAlign: 'center', lineHeight: 1.1 }}>Görüşme Planla</span>
                            </button>
                            <button className="activity-btn" style={{ padding: '6px 3px', minHeight: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px' }} onClick={() => openActivityModal('REMINDER')}>
                                <Bell size={15} />
                                <span style={{ fontSize: '0.55rem', color: '#6b7280', fontWeight: 500, textAlign: 'center', lineHeight: 1.1 }}>Hatırlatıcı</span>
                            </button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                            <button className="activity-btn" style={{ padding: '6px 3px', minHeight: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px' }} onClick={openQuoteFormHandler}>
                                <FileText size={15} style={{ color: '#10b981' }} />
                                <span style={{ fontSize: '0.55rem', color: '#6b7280', fontWeight: 500 }}>Teklif</span>
                            </button>
                            <button className="activity-btn" style={{ padding: '6px 3px', minHeight: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px' }} onClick={openOrderFormHandler}>
                                <TrendingUp size={15} style={{ color: '#3b82f6' }} />
                                <span style={{ fontSize: '0.55rem', color: '#6b7280', fontWeight: 500 }}>Sipariş</span>
                            </button>
                            <button className="activity-btn" style={{ padding: '6px 3px', minHeight: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px' }} onClick={openInvoiceFormHandler}>
                                <FileText size={15} style={{ color: '#8b5cf6' }} />
                                <span style={{ fontSize: '0.55rem', color: '#6b7280', fontWeight: 500 }}>Fatura</span>
                            </button>
                            <button className="activity-btn" style={{ padding: '6px 3px', minHeight: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px' }} onClick={() => openActivityModal('PAYMENT')}>
                                <Banknote size={15} style={{ color: '#f59e0b' }} />
                                <span style={{ fontSize: '0.55rem', color: '#6b7280', fontWeight: 500 }}>Tahsilat</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Call Popup Modal */}
            {showCallPopup && (
                <div className="call-popup-overlay" onClick={() => setShowCallPopup(false)}>
                    <div className="call-popup-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="call-popup-header">
                            <h3><PhoneCall size={18} /> AI Call</h3>
                            <button className="call-popup-close" onClick={() => setShowCallPopup(false)}>
                                <X size={16} />
                            </button>
                        </div>
                        <p className="call-popup-contact" style={{ textAlign: 'center', marginBottom: '14px' }}>
                            <span style={{ fontWeight: 700, fontSize: '15px', color: '#1e293b', display: 'block' }}>
                                {profile?.name || 'Müşteri'}
                            </span>
                            <span style={{ fontSize: '13px', color: '#4f46e5', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                <Phone size={13} /> {targetCallPhone || profile?.phone}
                            </span>
                        </p>

                        <div className="call-agent-selector" style={{ padding: '0 20px', marginBottom: '15px' }}>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase' }}>Konuşacak Agent</label>
                            <select
                                value={selectedAgentId}
                                onChange={(e) => setSelectedAgentId(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    borderRadius: '10px',
                                    border: '1px solid #e5e7eb',
                                    fontSize: '13px',
                                    background: '#f9fafb',
                                    outline: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="">Varsayılan Agent (Sistem Ayarı)</option>
                                {(Array.isArray(retellAgents) ? retellAgents : []).map(a => (
                                    <option key={a.agent_id} value={a.agent_id}>{a.agent_name || a.agent_id}</option>
                                ))}
                            </select>
                            {retellAgentsLoading && (
                                <div style={{ fontSize: '11px', color: '#6366f1', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Loader size={12} className="spin" /> Agentlar kontrol ediliyor...
                                </div>
                            )}
                        </div>

                        {/* Arama Şablonu Seçimi */}
                        <div style={{ padding: '0 20px', marginBottom: 15 }}>
                            <label style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 4, display: 'block' }}>📋 Arama Şablonu (opsiyonel)</label>
                            <select
                                value={selectedRetellTemplateId || ''}
                                onChange={e => setSelectedRetellTemplateId(e.target.value || null)}
                                style={{
                                    width: '100%', padding: '10px 12px', borderRadius: '10px',
                                    border: '1px solid #e5e7eb', fontSize: '13px', background: '#f9fafb',
                                    outline: 'none', cursor: 'pointer'
                                }}
                            >
                                <option value="">Şablon Kullanma</option>
                                {(Array.isArray(retellCallTemplates) ? retellCallTemplates : []).map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        </div>

                        {!callScheduleMode ? (
                            <div className="call-popup-options">
                                <button
                                    className="call-option-btn call-now"
                                    disabled={callingInProgress}
                                    style={{ opacity: callingInProgress ? 0.7 : 1, cursor: callingInProgress ? 'not-allowed' : 'pointer' }}
                                    onClick={async () => {
                                        try {
                                            const phoneToUse = targetCallPhone || profile?.phone;
                                            if (!phoneToUse) return alert('Telefon numarası bulunamadı');
                                            setCallingInProgress(true);
                                            await retellAPI.makeCall(currentWorkspace.id, {
                                                toNumber: phoneToUse,
                                                contactId: profile?.id,
                                                contactName: profile?.name,
                                                conversationId: conversationId || null,
                                                ...(selectedAgentId && { agentId: selectedAgentId }),
                                                ...(selectedRetellTemplateId && { retellTemplateId: selectedRetellTemplateId })
                                            });
                                            setShowCallPopup(false);
                                            setCallRefreshKey(prev => prev + 1);
                                            alert('✅ AI Sesli Araması başarıyla başlatıldı!');
                                        } catch (err) {
                                            alert(err.response?.data?.error || err.message || 'AI Araması başlatılamadı.');
                                        } finally {
                                            setCallingInProgress(false);
                                        }
                                    }}
                                >
                                    {callingInProgress ? <Loader size={20} className="spin" /> : <PhoneCall size={20} />}
                                    <span>{callingInProgress ? 'Aranıyor...' : 'Hemen Ara'}</span>
                                </button>
                                <button
                                    className="call-option-btn call-schedule"
                                    onClick={() => setCallScheduleMode(true)}
                                >
                                    <Calendar size={20} />
                                    <span>Arama Planla</span>
                                </button>
                            </div>
                        ) : (
                            <div className="call-schedule-form">
                                <label>Tarih & Saat</label>
                                <input
                                    type="datetime-local"
                                    value={scheduledDateTime}
                                    onChange={(e) => setScheduledDateTime(e.target.value)}
                                    min={new Date().toISOString().slice(0, 16)}
                                />
                                <div className="call-schedule-actions">
                                    <button
                                        className="btn-cancel"
                                        onClick={() => setCallScheduleMode(false)}
                                    >
                                        Geri
                                    </button>
                                    <button
                                        className="btn-confirm"
                                        disabled={!scheduledDateTime || schedulingCall}
                                        onClick={async () => {
                                            try {
                                                const phoneToUse = targetCallPhone || profile?.phone;
                                                if (!phoneToUse) return alert('Telefon numarası bulunamadı');
                                                setSchedulingCall(true);
                                                await retellAPI.scheduleCall(currentWorkspace.id, {
                                                    toNumber: phoneToUse,
                                                    contactId: profile?.id,
                                                    contactName: profile?.name,
                                                    scheduledAt: new Date(scheduledDateTime).toISOString(),
                                                    ...(selectedAgentId && { agentId: selectedAgentId }),
                                                    ...(selectedRetellTemplateId && { retellTemplateId: selectedRetellTemplateId })
                                                });
                                                setShowCallPopup(false);
                                                setCallScheduleMode(false);
                                                setCallRefreshKey(prev => prev + 1);
                                                alert('✅ AI Sesli Araması planlandı!');
                                            } catch (err) {
                                                alert(err.response?.data?.error || err.message || 'Planlama başarısız.');
                                            } finally {
                                                setSchedulingCall(false);
                                            }
                                        }}
                                    >
                                        {schedulingCall ? <Loader size={14} className="spin" /> : <Check size={14} />}
                                        Planla
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* Inline Quote Form Modal */}
            {showQuoteForm && (
                <div className="chat-popup-overlay" onClick={() => setShowQuoteForm(false)} style={{ zIndex: 10000 }}>
                    <div className="chat-popup-modal" onClick={e => e.stopPropagation()} style={{ width: 680, maxWidth: '94vw', maxHeight: '88vh' }}>
                        <div className="chat-popup-header" style={{ borderBottom: '2px solid #fef2f2' }}>
                            <div className="chat-popup-header-left">
                                <div className="chat-popup-avatar" style={{ background: '#fef2f2', width: 48, height: 48 }}>
                                    <TrendingUp size={22} style={{ color: '#ef4444' }} />
                                </div>
                                <div className="chat-popup-header-info">
                                    <h3 className="chat-popup-contact-name" style={{ fontSize: '17px' }}>Yeni Teklif Oluştur</h3>
                                    <span className="chat-popup-channel-badge" style={{ color: '#ef4444' }}>{profile?.name || 'Müşteri'} için</span>
                                </div>
                            </div>
                            <div className="chat-popup-header-actions">
                                <button className="chat-popup-icon-btn chat-popup-close-btn" onClick={() => setShowQuoteForm(false)}><X size={18} /></button>
                            </div>
                        </div>
                        <div style={{ padding: '20px 28px', overflowY: 'auto', flex: 1 }}>
                            <form onSubmit={async (e) => {
                                e.preventDefault();
                                if (!quoteFormData.caseId) {
                                    return alert('Lütfen bu işlem için bir Case seçiniz (Zorunlu).');
                                }
                                if (quoteSubmitting) return;
                                setQuoteSubmitting(true);
                                try {
                                    const totalAmount = quoteFormData.products.reduce((s, p) => s + (p.quantity * p.unitPrice), 0);
                                    await dealAPI.create(currentWorkspace.id, {
                                        contactId: profile?.id,
                                        title: quoteFormData.title,
                                        description: quoteFormData.description,
                                        currency: quoteFormData.currency,
                                        amount: totalAmount,
                                        products: quoteFormData.products.map(p => ({ ...p, total: p.quantity * p.unitPrice })),
                                        notes: quoteFormData.notes,
                                        assignedToId: user?.id || null,
                                        caseId: quoteFormData.caseId
                                    });
                                    setShowQuoteForm(false);
                                    setQuoteFormData({ title: '', description: '', amount: '', currency: 'TRY', products: [{ name: '', quantity: 1, unitPrice: 0 }], notes: '', caseId: '' });
                                    // Refresh deals
                                    if (profile?.id && currentWorkspace?.id) {
                                        const r = await dealAPI.getAll(currentWorkspace.id, { contactId: profile.id });
                                        setDeals(r.data.deals || []);
                                    }
                                } catch (err) {
                                    console.error('Quote create error:', err);
                                    alert('Teklif oluşturulamadı: ' + (err?.response?.data?.error || err?.message));
                                } finally {
                                    setQuoteSubmitting(false);
                                }
                            }}>
                                <div style={{ marginBottom: 16 }}>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>İlgili Case *</label>
                                    <select
                                        value={quoteFormData.caseId}
                                        onChange={e => setQuoteFormData(prev => ({ ...prev, caseId: e.target.value }))}
                                        style={{ width: '100%', padding: '10px 14px', border: '1px solid', borderColor: !quoteFormData.caseId ? '#fca5a5' : '#e2e8f0', borderRadius: 10, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
                                    >
                                        <option value="">📁 Lütfen bir Case seçiniz...</option>
                                        {distinctCases.map(c => (
                                            <option key={c.id} value={c.id}>
                                                {c?.caseNumber} {c.title ? `- ${c.title}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    {!quoteFormData.caseId && <div style={{ fontSize: '10px', color: '#ef4444', marginTop: '4px' }}>Bu işlem için Case seçimi zorunludur. (Açık bir case yoksa önce 'Yeni Case' oluşturun.)</div>}
                                </div>
                                <div style={{ marginBottom: 16 }}>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Teklif Başlığı *</label>
                                    <input type="text" required value={quoteFormData.title} onChange={e => setQuoteFormData(p => ({ ...p, title: e.target.value }))}
                                        placeholder="Örn: Web Sitesi Projesi" style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                                        onFocus={e => e.target.style.borderColor = '#fca5a5'}
                                        onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                                </div>
                                <div style={{ marginBottom: 16 }}>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Açıklama</label>
                                    <textarea value={quoteFormData.description} onChange={e => setQuoteFormData(p => ({ ...p, description: e.target.value }))}
                                        placeholder="Teklif detayları..." rows={3} style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', resize: 'vertical', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                                        onFocus={e => e.target.style.borderColor = '#fca5a5'}
                                        onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                                </div>
                                <div style={{ marginBottom: 16 }}>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Para Birimi</label>
                                    <select value={quoteFormData.currency} onChange={e => setQuoteFormData(p => ({ ...p, currency: e.target.value }))}
                                        style={{ padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', outline: 'none' }}>
                                        <option value="TRY">₺ TRY</option>
                                        <option value="USD">$ USD</option>
                                        <option value="EUR">€ EUR</option>
                                        <option value="GBP">£ GBP</option>
                                    </select>
                                </div>
                                <div style={{ marginBottom: 16 }}>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 8 }}>Ürünler / Hizmetler</label>
                                    {quoteFormData.products.map((product, idx) => (
                                        <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                                            <input type="text" placeholder="Ürün adı" value={product.name}
                                                onChange={e => { const p = [...quoteFormData.products]; p[idx].name = e.target.value; setQuoteFormData(prev => ({ ...prev, products: p })); }}
                                                style={{ flex: 2, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.85rem', outline: 'none' }} />
                                            <input type="number" placeholder="Adet" min="1" value={product.quantity}
                                                onChange={e => { const p = [...quoteFormData.products]; p[idx].quantity = parseInt(e.target.value) || 1; setQuoteFormData(prev => ({ ...prev, products: p })); }}
                                                style={{ width: 70, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.85rem', outline: 'none', textAlign: 'center' }} />
                                            <input type="number" placeholder="Birim Fiyat" min="0" value={product.unitPrice}
                                                onChange={e => { const p = [...quoteFormData.products]; p[idx].unitPrice = parseFloat(e.target.value) || 0; setQuoteFormData(prev => ({ ...prev, products: p })); }}
                                                style={{ width: 110, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.85rem', outline: 'none', textAlign: 'right' }} />
                                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ef4444', minWidth: 70, textAlign: 'right' }}>
                                                {(quoteFormData.currency === 'TRY' ? '₺' : quoteFormData.currency === 'USD' ? '$' : quoteFormData.currency === 'EUR' ? '€' : '£')}{(product.quantity * product.unitPrice).toLocaleString('tr-TR')}
                                            </span>
                                            {quoteFormData.products.length > 1 && (
                                                <button type="button" onClick={() => { const p = quoteFormData.products.filter((_, i) => i !== idx); setQuoteFormData(prev => ({ ...prev, products: p })); }}
                                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}><X size={15} /></button>
                                            )}
                                        </div>
                                    ))}
                                    <button type="button" onClick={() => setQuoteFormData(prev => ({ ...prev, products: [...prev.products, { name: '', quantity: 1, unitPrice: 0 }] }))}
                                        style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#fef2f2', border: '1px dashed #fca5a5', borderRadius: 8, padding: '6px 12px', fontSize: '0.8rem', color: '#ef4444', cursor: 'pointer', marginTop: 6, fontWeight: 500 }}>
                                        <Plus size={13} /> Ürün Ekle
                                    </button>
                                    <div style={{ textAlign: 'right', fontSize: '0.92rem', fontWeight: 700, color: '#dc2626', marginTop: 10, padding: '8px 0', borderTop: '1px solid #fef2f2' }}>
                                        Toplam: {(quoteFormData.currency === 'TRY' ? '₺' : quoteFormData.currency === 'USD' ? '$' : quoteFormData.currency === 'EUR' ? '€' : '£')}
                                        {quoteFormData.products.reduce((s, p) => s + (p.quantity * p.unitPrice), 0).toLocaleString('tr-TR')}
                                    </div>
                                </div>
                                <div style={{ marginBottom: 20 }}>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Notlar</label>
                                    <textarea value={quoteFormData.notes} onChange={e => setQuoteFormData(p => ({ ...p, notes: e.target.value }))}
                                        placeholder="Ek notlar..." rows={3} style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', resize: 'vertical', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                                        onFocus={e => e.target.style.borderColor = '#fca5a5'}
                                        onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
                                    <button type="button" onClick={() => setShowQuoteForm(false)}
                                        style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', fontSize: '0.88rem', fontWeight: 600, color: '#64748b', cursor: 'pointer', transition: 'all 0.15s' }}>İptal</button>
                                    <button type="submit" disabled={quoteSubmitting}
                                        style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: quoteSubmitting ? '#fca5a5' : '#ef4444', fontSize: '0.88rem', fontWeight: 600, color: '#fff', cursor: 'pointer', opacity: quoteSubmitting ? 0.7 : 1, transition: 'all 0.15s', boxShadow: '0 2px 8px rgba(239,68,68,0.25)' }}>
                                        {quoteSubmitting ? 'Oluşturuluyor...' : 'Teklif Oluştur'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
            {/* Inline Order Form Modal */}
            {showOrderForm && (
                <div className="modal-overlay" onClick={() => setShowOrderForm(false)} style={{ zIndex: 10000 }}>
                    <div className="modal-content deal-form" onClick={e => e.stopPropagation()} style={{ maxWidth: 680, maxHeight: '90vh', overflowY: 'auto' }}>
                        <div className="modal-header">
                            <h2>Yeni Sipariş Oluştur</h2>
                            <button className="btn-icon" onClick={() => setShowOrderForm(false)}><X size={20} /></button>
                        </div>

                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            if (orderSubmitting) return;
                            setOrderSubmitting(true);
                            try {
                                const productsWithTotal = orderFormData.products.map(p => ({
                                    ...p,
                                    total: (p.discountedPrice || p.unitPrice) * p.quantity
                                }));
                                const subtotal = productsWithTotal.reduce((sum, p) => sum + p.total, 0);
                                const totalTax = orderFormData.products.reduce((sum, p) => sum + ((p.discountedPrice || p.unitPrice) * p.quantity * (p.tax1Rate || 0) / 100), 0);

                                await dealAPI.create(currentWorkspace.id, {
                                    contactId: profile?.id,
                                    title: orderFormData.title,
                                    description: orderFormData.description,
                                    currency: orderFormData.currency,
                                    amount: subtotal,
                                    vatRate: subtotal > 0 ? (totalTax / subtotal * 100) : 0,
                                    products: productsWithTotal,
                                    notes: orderFormData.notes,
                                    stage: 'ORDER',
                                    assignedToId: orderFormData.assignedToId || user?.id || null,
                                    caseId: orderFormData.caseId || null,
                                    protocolNo: orderFormData.protocolNo || null
                                });
                                setShowOrderForm(false);
                                setOrderFormData({ title: '', description: '', currency: 'TRY', products: [{ name: '', quantity: 1, unitPrice: 0 }], notes: '', caseId: '', protocolNo: '', assignedToId: '' });
                                if (profile?.id && currentWorkspace?.id) {
                                    const r = await dealAPI.getAll(currentWorkspace.id, { contactId: profile.id });
                                    setDeals(r.data.deals || []);
                                }
                            } catch (err) {
                                console.error('Order create error:', err);
                                alert('Sipariş oluşturulamadı: ' + (err?.response?.data?.error || err?.message));
                            } finally {
                                setOrderSubmitting(false);
                            }
                        }}>
                            {/* Müşteri - pre-filled */}
                            <div className="form-group">
                                <label>Müşteri *</label>
                                <input type="text" value={profile?.name || profile?.fullName || '—'} disabled
                                    style={{ background: '#f8fafc', color: '#64748b' }} />
                            </div>

                            {/* İlgili Case */}
                            {distinctCases?.length > 0 && (
                                <div className="form-group">
                                    <label>İlgili Case</label>
                                    <select value={orderFormData.caseId}
                                        onChange={e => setOrderFormData(prev => ({ ...prev, caseId: e.target.value }))}>
                                        <option value="">Case seçiniz (opsiyonel)</option>
                                        {distinctCases.map(c => (
                                            <option key={c.id} value={c.id}>
                                                {c?.caseNumber} {c.title ? `- ${c.title}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Sipariş Başlığı */}
                            <div className="form-group">
                                <label>Sipariş Başlığı *</label>
                                <input type="text" required value={orderFormData.title}
                                    onChange={e => setOrderFormData(p => ({ ...p, title: e.target.value }))}
                                    placeholder="Örn: Aylık Hizmet Paketi" />
                            </div>

                            {/* Protokol No */}
                            <div className="form-group">
                                <label>Protokol No</label>
                                <input type="text" value={orderFormData.protocolNo}
                                    onChange={e => setOrderFormData(p => ({ ...p, protocolNo: e.target.value }))}
                                    placeholder="Örn: 320775" />
                            </div>

                            {/* Para Birimi */}
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Para Birimi</label>
                                    <select value={orderFormData.currency}
                                        onChange={e => setOrderFormData(p => ({ ...p, currency: e.target.value }))}>
                                        <option value="TRY">₺ TRY</option>
                                        <option value="USD">$ USD</option>
                                        <option value="EUR">€ EUR</option>
                                        <option value="GBP">£ GBP</option>
                                    </select>
                                </div>
                            </div>

                            {/* Ürünler / Hizmetler */}
                            <div className="form-group products-section">
                                <label>Ürünler / Hizmetler</label>
                                {orderFormData.products.map((product, idx) => {
                                    const currSymbol = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' }[orderFormData.currency] || '₺';
                                    const formatAmt = (amt) => `${currSymbol}${(amt || 0).toLocaleString('tr-TR')}`;
                                    return (
                                        <div key={idx} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', marginBottom: '10px', background: '#fafbfc' }}>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: product.description || product.tax1Rate ? '8px' : 0 }}>
                                                <div style={{ position: 'relative', flex: 2 }}>
                                                    <input type="text" placeholder="Ürün adı yazın veya seçin" value={product.name}
                                                        onChange={e => {
                                                            const newProducts = [...orderFormData.products];
                                                            newProducts[idx].name = e.target.value;
                                                            const catalogMatch = catalogProducts.find(cp => cp.name === e.target.value);
                                                            if (catalogMatch) {
                                                                const priceKey = orderFormData.currency === 'USD' ? 'priceUSD' : orderFormData.currency === 'EUR' ? 'priceEUR' : orderFormData.currency === 'GBP' ? 'priceGBP' : 'price';
                                                                newProducts[idx].unitPrice = catalogMatch[priceKey] || catalogMatch.price || 0;
                                                                if (catalogMatch.description) newProducts[idx].description = catalogMatch.description;
                                                                if (catalogMatch.discountedPrice) newProducts[idx].discountedPrice = catalogMatch.discountedPrice;
                                                                if (catalogMatch.tax1Type) newProducts[idx].tax1Type = catalogMatch.tax1Type;
                                                                newProducts[idx].tax1Rate = catalogMatch.tax1Rate || 0;
                                                            }
                                                            setOrderFormData(prev => ({ ...prev, products: newProducts }));
                                                        }}
                                                        list={`sidebar-order-product-${idx}`}
                                                        style={{ width: '100%' }} />
                                                    <datalist id={`sidebar-order-product-${idx}`}>
                                                        {catalogProducts.filter(cp => cp.name.toLowerCase().includes((product.name || '').toLowerCase())).map(cp => (
                                                            <option key={cp.id} value={cp.name} label={`${cp.name} - ₺${cp.price}`} />
                                                        ))}
                                                    </datalist>
                                                </div>
                                                <input type="number" placeholder="Adet" min="1" value={product.quantity}
                                                    onChange={e => {
                                                        const p = [...orderFormData.products]; p[idx].quantity = parseInt(e.target.value) || 1;
                                                        setOrderFormData(prev => ({ ...prev, products: p }));
                                                    }}
                                                    style={{ width: 70, textAlign: 'center' }} />
                                                <input type="number" placeholder="Birim Fiyat" min="0" value={product.unitPrice}
                                                    onChange={e => {
                                                        const p = [...orderFormData.products]; p[idx].unitPrice = parseFloat(e.target.value) || 0;
                                                        setOrderFormData(prev => ({ ...prev, products: p }));
                                                    }}
                                                    style={{ width: 100, textAlign: 'right' }} />
                                                <span style={{ minWidth: 70, textAlign: 'right', fontWeight: 700, color: '#059669', fontSize: '0.88rem' }}>
                                                    {formatAmt(product.quantity * product.unitPrice)}
                                                </span>
                                                {orderFormData.products.length > 1 && (
                                                    <button type="button" className="btn-icon-sm" onClick={() => {
                                                        setOrderFormData(prev => ({ ...prev, products: prev.products.filter((_, i) => i !== idx) }));
                                                    }}><X size={16} /></button>
                                                )}
                                            </div>
                                            {(product.description || product.discountedPrice || product.tax1Rate > 0) && (
                                                <div style={{ background: '#f1f5f9', borderRadius: '8px', padding: '10px 12px', fontSize: '0.78rem', color: '#475569' }}>
                                                    {product.description && (
                                                        <div style={{ marginBottom: '4px' }}><span style={{ fontWeight: 600, color: '#334155' }}>Açıklama:</span> {product.description}</div>
                                                    )}
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '4px' }}>
                                                        {product.discountedPrice > 0 && (
                                                            <div>
                                                                <span style={{ fontWeight: 600, color: '#334155' }}>İndirimli:</span>{' '}
                                                                <span style={{ color: '#dc2626', fontWeight: 700, textDecoration: 'line-through', marginRight: '4px' }}>{formatAmt(product.unitPrice)}</span>
                                                                <span style={{ color: '#16a34a', fontWeight: 700 }}>{formatAmt(product.discountedPrice)}</span>
                                                            </div>
                                                        )}
                                                        {product.tax1Rate > 0 && (
                                                            <div>
                                                                <span style={{ fontWeight: 600, color: '#334155' }}>KDV:</span>{' '}
                                                                <span style={{ fontWeight: 700, color: '#6366f1' }}>%{product.tax1Rate}</span>
                                                                <span style={{ marginLeft: '6px', fontWeight: 600, color: '#334155' }}>
                                                                    ({formatAmt((product.discountedPrice || product.unitPrice) * product.quantity * product.tax1Rate / 100)})
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                <button type="button" className="btn-secondary btn-sm"
                                    onClick={() => setOrderFormData(prev => ({ ...prev, products: [...prev.products, { name: '', quantity: 1, unitPrice: 0 }] }))}>
                                    <Plus size={16} /> Ürün Ekle
                                </button>
                                <div className="products-total" style={{ marginTop: '8px' }}>
                                    {(() => {
                                        const currSymbol = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' }[orderFormData.currency] || '₺';
                                        const formatAmt = (amt) => `${currSymbol}${(amt || 0).toLocaleString('tr-TR')}`;
                                        const subtotal = orderFormData.products.reduce((sum, p) => sum + ((p.discountedPrice || p.unitPrice) * p.quantity), 0);
                                        const totalTax = orderFormData.products.reduce((sum, p) => sum + ((p.discountedPrice || p.unitPrice) * p.quantity * (p.tax1Rate || 0) / 100), 0);
                                        const grandTotal = subtotal + totalTax;
                                        return (
                                            <div style={{ textAlign: 'right', fontSize: '0.85rem' }}>
                                                <div style={{ color: '#64748b' }}>Ara Toplam: {formatAmt(subtotal)}</div>
                                                {totalTax > 0 && <div style={{ color: '#6366f1' }}>KDV: {formatAmt(totalTax)}</div>}
                                                <div style={{ fontWeight: 800, fontSize: '1rem', color: '#1e293b', marginTop: '2px' }}>
                                                    Genel Toplam: {formatAmt(grandTotal)}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>

                            {/* Notlar */}
                            <div className="form-group">
                                <label>Notlar</label>
                                <textarea value={orderFormData.notes}
                                    onChange={e => setOrderFormData(p => ({ ...p, notes: e.target.value }))}
                                    placeholder="Ek notlar..." rows={2} />
                            </div>

                            <div className="form-actions">
                                <button type="button" className="btn-secondary" onClick={() => setShowOrderForm(false)}>İptal</button>
                                <button type="submit" className="btn-primary" disabled={orderSubmitting}>
                                    {orderSubmitting ? 'Oluşturuluyor...' : 'Sipariş Oluştur'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* Inline Invoice Form Modal */}
            {showInvoiceForm && (() => {
                const invSubtotal = invoiceFormData.products.reduce((s, p) => s + (p.quantity * p.unitPrice), 0);
                const invTax = invSubtotal * (invoiceFormData.taxRate / 100);
                const invTotal = invSubtotal + invTax;
                const cs = invoiceFormData.currency === 'TRY' ? '₺' : invoiceFormData.currency === 'USD' ? '$' : invoiceFormData.currency === 'EUR' ? '€' : '£';
                return (
                <div className="chat-popup-overlay" onClick={() => setShowInvoiceForm(false)} style={{ zIndex: 10000 }}>
                    <div className="chat-popup-modal" onClick={e => e.stopPropagation()} style={{ width: 680, maxWidth: '94vw', maxHeight: '88vh' }}>
                        <div className="chat-popup-header" style={{ borderBottom: '2px solid #fef2f2' }}>
                            <div className="chat-popup-header-left">
                                <div className="chat-popup-avatar" style={{ background: '#fef2f2', width: 48, height: 48 }}>
                                    <FileText size={22} style={{ color: '#ef4444' }} />
                                </div>
                                <div className="chat-popup-header-info">
                                    <h3 className="chat-popup-contact-name" style={{ fontSize: '17px' }}>Yeni Fatura Oluştur</h3>
                                    <span className="chat-popup-channel-badge" style={{ color: '#ef4444' }}>{profile?.name || 'Müşteri'} için</span>
                                </div>
                            </div>
                            <div className="chat-popup-header-actions">
                                <button className="chat-popup-icon-btn chat-popup-close-btn" onClick={() => setShowInvoiceForm(false)}><X size={18} /></button>
                            </div>
                        </div>
                        <div style={{ padding: '20px 28px', overflowY: 'auto', flex: 1 }}>
                            <form onSubmit={async (e) => {
                                e.preventDefault();
                                if (!invoiceFormData.caseId) {
                                    return alert('Lütfen bu işlem için bir Case seçiniz (Zorunlu).');
                                }
                                if (invoiceSubmitting) return;
                                setInvoiceSubmitting(true);
                                try {
                                    await dealAPI.create(currentWorkspace.id, {
                                        contactId: profile?.id,
                                        title: invoiceFormData.title,
                                        currency: invoiceFormData.currency,
                                        amount: invTotal,
                                        products: invoiceFormData.products.map(p => ({ ...p, total: p.quantity * p.unitPrice })),
                                        notes: invoiceFormData.notes,
                                        stage: 'INVOICE',
                                        metadata: { taxRate: invoiceFormData.taxRate, subtotal: invSubtotal, tax: invTax, dueDate: invoiceFormData.dueDate },
                                        assignedToId: user?.id || null,
                                        caseId: invoiceFormData.caseId
                                    });
                                    setShowInvoiceForm(false);
                                    setInvoiceFormData({ title: '', currency: 'TRY', taxRate: 20, dueDate: '', products: [{ name: '', quantity: 1, unitPrice: 0 }], notes: '', caseId: '' });
                                    if (profile?.id && currentWorkspace?.id) {
                                        const r = await dealAPI.getAll(currentWorkspace.id, { contactId: profile.id });
                                        setDeals(r.data.deals || []);
                                    }
                                } catch (err) {
                                    console.error('Invoice create error:', err);
                                    alert('Fatura oluşturulamadı: ' + (err?.response?.data?.error || err?.message));
                                } finally {
                                    setInvoiceSubmitting(false);
                                }
                            }}>
                                <div style={{ marginBottom: 16 }}>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>İlgili Case *</label>
                                    <select
                                        value={invoiceFormData.caseId}
                                        onChange={e => setInvoiceFormData(prev => ({ ...prev, caseId: e.target.value }))}
                                        style={{ width: '100%', padding: '10px 14px', border: '1px solid', borderColor: !invoiceFormData.caseId ? '#fca5a5' : '#e2e8f0', borderRadius: 10, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
                                    >
                                        <option value="">📁 Lütfen bir Case seçiniz...</option>
                                        {distinctCases.map(c => (
                                            <option key={c.id} value={c.id}>
                                                {c?.caseNumber} {c.title ? `- ${c.title}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    {!invoiceFormData.caseId && <div style={{ fontSize: '10px', color: '#ef4444', marginTop: '4px' }}>Bu işlem için Case seçimi zorunludur. (Açık bir case yoksa önce 'Yeni Case' oluşturun.)</div>}
                                </div>
                                <div style={{ marginBottom: 16 }}>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Fatura Başlığı *</label>
                                    <input type="text" required value={invoiceFormData.title} onChange={e => setInvoiceFormData(p => ({ ...p, title: e.target.value }))}
                                        placeholder="Örn: Mart 2026 Hizmet Bedeli" style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                                        onFocus={e => e.target.style.borderColor = '#fca5a5'}
                                        onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                                </div>
                                <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Para Birimi</label>
                                        <select value={invoiceFormData.currency} onChange={e => setInvoiceFormData(p => ({ ...p, currency: e.target.value }))}
                                            style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', outline: 'none' }}>
                                            <option value="TRY">₺ TRY</option>
                                            <option value="USD">$ USD</option>
                                            <option value="EUR">€ EUR</option>
                                            <option value="GBP">£ GBP</option>
                                        </select>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>KDV Oranı</label>
                                        <select value={invoiceFormData.taxRate} onChange={e => setInvoiceFormData(p => ({ ...p, taxRate: parseInt(e.target.value) }))}
                                            style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', outline: 'none' }}>
                                            <option value={0}>%0</option>
                                            <option value={1}>%1</option>
                                            <option value={10}>%10</option>
                                            <option value={20}>%20</option>
                                        </select>
                                    </div>
                                </div>
                                <div style={{ marginBottom: 16 }}>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Son Ödeme Tarihi</label>
                                    <input type="date" value={invoiceFormData.dueDate} onChange={e => setInvoiceFormData(p => ({ ...p, dueDate: e.target.value }))}
                                        style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                                <div style={{ marginBottom: 16 }}>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 8 }}>Ürünler / Hizmetler</label>
                                    {invoiceFormData.products.map((product, idx) => (
                                        <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                                            <input type="text" placeholder="Ürün / Hizmet adı" value={product.name}
                                                onChange={e => { const p = [...invoiceFormData.products]; p[idx].name = e.target.value; setInvoiceFormData(prev => ({ ...prev, products: p })); }}
                                                style={{ flex: 2, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.85rem', outline: 'none' }} />
                                            <input type="number" placeholder="Adet" min="1" value={product.quantity}
                                                onChange={e => { const p = [...invoiceFormData.products]; p[idx].quantity = parseInt(e.target.value) || 1; setInvoiceFormData(prev => ({ ...prev, products: p })); }}
                                                style={{ width: 70, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.85rem', outline: 'none', textAlign: 'center' }} />
                                            <input type="number" placeholder="Birim Fiyat" min="0" step="0.01" value={product.unitPrice}
                                                onChange={e => { const p = [...invoiceFormData.products]; p[idx].unitPrice = parseFloat(e.target.value) || 0; setInvoiceFormData(prev => ({ ...prev, products: p })); }}
                                                style={{ width: 110, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.85rem', outline: 'none', textAlign: 'right' }} />
                                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ef4444', minWidth: 80, textAlign: 'right' }}>
                                                {cs}{(product.quantity * product.unitPrice).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                            </span>
                                            {invoiceFormData.products.length > 1 && (
                                                <button type="button" onClick={() => { const p = invoiceFormData.products.filter((_, i) => i !== idx); setInvoiceFormData(prev => ({ ...prev, products: p })); }}
                                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}><X size={15} /></button>
                                            )}
                                        </div>
                                    ))}
                                    <button type="button" onClick={() => setInvoiceFormData(prev => ({ ...prev, products: [...prev.products, { name: '', quantity: 1, unitPrice: 0 }] }))}
                                        style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#fef2f2', border: '1px dashed #fca5a5', borderRadius: 8, padding: '6px 12px', fontSize: '0.8rem', color: '#ef4444', cursor: 'pointer', marginTop: 6, fontWeight: 500 }}>
                                        <Plus size={13} /> Ürün Ekle
                                    </button>
                                    <div style={{ textAlign: 'right', marginTop: 12, padding: '10px 0', borderTop: '1px solid #fef2f2' }}>
                                        <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 4 }}>Ara Toplam: {cs}{invSubtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
                                        <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 4 }}>KDV (%{invoiceFormData.taxRate}): {cs}{invTax.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
                                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#dc2626' }}>Genel Toplam: {cs}{invTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
                                    </div>
                                </div>
                                <div style={{ marginBottom: 20 }}>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Notlar</label>
                                    <textarea value={invoiceFormData.notes} onChange={e => setInvoiceFormData(p => ({ ...p, notes: e.target.value }))}
                                        placeholder="Ek notlar..." rows={3} style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', resize: 'vertical', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                                        onFocus={e => e.target.style.borderColor = '#fca5a5'}
                                        onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
                                    <button type="button" onClick={() => setShowInvoiceForm(false)}
                                        style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', fontSize: '0.88rem', fontWeight: 600, color: '#64748b', cursor: 'pointer', transition: 'all 0.15s' }}>İptal</button>
                                    <button type="submit" disabled={invoiceSubmitting}
                                        style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: invoiceSubmitting ? '#fca5a5' : '#ef4444', fontSize: '0.88rem', fontWeight: 600, color: '#fff', cursor: 'pointer', opacity: invoiceSubmitting ? 0.7 : 1, transition: 'all 0.15s', boxShadow: '0 2px 8px rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <FileText size={15} />
                                        {invoiceSubmitting ? 'Oluşturuluyor...' : 'Fatura Oluştur'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
                );
            })()}
            {/* Not Sonrası Aksiyon Paneli — Akış/Takım/Üstlen */}
            {showTakeoverModal && (
                <div className="chat-popup-overlay" onClick={() => setShowTakeoverModal(false)} style={{ zIndex: 10001 }}>
                    <div onClick={e => e.stopPropagation()} style={{
                        background: '#fff', borderRadius: 16, padding: '24px 28px', maxWidth: 440, width: '92vw',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.25)', position: 'relative'
                    }}>
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <StickyNote size={20} style={{ color: '#f59e0b' }} />
                            </div>
                            <div>
                                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1f2937', margin: 0 }}>Not Kaydedildi ✓</h3>
                                <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: 0 }}>Akış veya atamayı güncellemek ister misin?</p>
                            </div>
                            <button onClick={() => setShowTakeoverModal(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1.2rem' }}>✕</button>
                        </div>

                        {/* Akış / Aşama */}
                        <div style={{ marginBottom: 14 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                                <TrendingUp size={14} /> Akış / Aşama
                            </label>
                            <select
                                value={postNoteAction?.funnelStageId || ''}
                                onChange={async (e) => {
                                    const stageId = e.target.value;
                                    setPostNoteAction(prev => ({ ...prev, funnelStageId: stageId }));
                                    if (stageId && conversationId && currentWorkspace?.id) {
                                        try {
                                            await conversationAPI.updateFunnel(currentWorkspace.id, conversationId, { funnelStageId: stageId });
                                            // Find stage name and funnelType for UI feedback
                                            let stageName = '', stageColor = '#6366f1', funnelType = null;
                                            for (const f of activityFunnels) {
                                                const s = (f.stages || []).find(s => s.id === stageId);
                                                if (s) { stageName = s.name; stageColor = s.color || '#6366f1'; funnelType = f.id; break; }
                                            }
                                            if (stageName) setFunnelStage(prev => ({ ...prev, id: stageId, name: stageName }));
                                            // Sync contact's status field so Contacts table stays up-to-date
                                            if (profile?.id) {
                                                try { await contactAPI.update(currentWorkspace.id, profile.id, { status: stageId }); } catch (_) {}
                                            }
                                            // Notify Inbox header about the change
                                            window.dispatchEvent(new CustomEvent('websocket:funnel_stage_updated', {
                                                detail: { conversationId, funnelStageId: stageId, stageName, stageColor }
                                            }));
                                        } catch { }
                                    }
                                }}
                                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.85rem', background: '#f8fafc' }}
                            >
                                <option value="">Değiştirme</option>
                                {activityFunnels.map(funnel => (
                                    <optgroup key={funnel.id} label={`${funnel.icon || '📁'} ${funnel.name}`}>
                                        {(funnel.stages || []).map(stage => (
                                            <option key={stage.id} value={stage.id}>{stage.name}</option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                        </div>

                        {/* Takım / Kişi */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                            <div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                                    <Users size={14} /> Takım
                                </label>
                                <select
                                    value={postNoteAction?.teamId || ''}
                                    onChange={async (e) => {
                                        const teamId = e.target.value;
                                        setPostNoteAction(prev => ({ ...prev, teamId, assignedToId: '' }));
                                        if (teamId && activeConv?.id) {
                                            try { await handleAssign(teamId, undefined); } catch { }
                                        }
                                    }}
                                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.82rem', background: '#f8fafc' }}
                                >
                                    <option value="">Değiştirme</option>
                                    {(() => {
                                        const renderOpts = (list, depth = 0) => list.flatMap(t => [
                                            <option key={t.id} value={t.id}>{'\u00a0\u00a0'.repeat(depth)}{t.name}</option>,
                                            ...(t.children ? renderOpts(t.children, depth + 1) : [])
                                        ]);
                                        return renderOpts(teams || []);
                                    })()}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                                    <User size={14} /> Kişi
                                </label>
                                <select
                                    value={postNoteAction?.assignedToId || ''}
                                    onChange={async (e) => {
                                        const userId = e.target.value;
                                        setPostNoteAction(prev => ({ ...prev, assignedToId: userId }));
                                        if (userId && activeConv?.id) {
                                            try { await handleAssign(undefined, userId); } catch { }
                                        }
                                    }}
                                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.82rem', background: '#f8fafc' }}
                                >
                                    <option value="">Değiştirme</option>
                                    {(() => {
                                        const selectedTeamId = postNoteAction?.teamId;
                                        const findTeam = (list, id) => {
                                            for (const t of list) {
                                                if (t.id === id) return t;
                                                if (t.children) { const f = findTeam(t.children, id); if (f) return f; }
                                            }
                                            return null;
                                        };
                                        let filteredMembers = members || [];
                                        if (selectedTeamId && teams) {
                                            const team = findTeam(teams, selectedTeamId);
                                            const memberIds = new Set((team?.members || []).map(m => m.userId));
                                            filteredMembers = (members || []).filter(m => memberIds.has(m.user?.id || m.id));
                                        }
                                        return (Array.isArray(filteredMembers) ? filteredMembers : []).map(member => (
                                            <option key={member.user?.id || member.id} value={member.user?.id || member.id}>
                                                {isUserOnline(member.user?.id || member.id, member.user) ? '🟢' : '⚪'} {member.user?.name || member.name}
                                            </option>
                                        ));
                                    })()}
                                </select>
                            </div>
                        </div>

                        {/* Üstlen butonu */}
                        {!conversationData?.assignedToId && onTakeOver && (
                            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14, marginBottom: 4 }}>
                                <button
                                    onClick={() => { setShowTakeoverModal(false); onTakeOver && onTakeOver(); }}
                                    style={{
                                        width: '100%', padding: '10px', borderRadius: 10, border: '1px solid #e2e8f0',
                                        background: '#fff', fontSize: '0.85rem', fontWeight: 600, color: '#374151',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    <UserPlus size={16} style={{ color: '#ef4444' }} />
                                    Konuşmayı Üstlen
                                </button>
                            </div>
                        )}

                        {/* Kapat */}
                        <div style={{ textAlign: 'center', marginTop: 10 }}>
                            <button
                                onClick={() => setShowTakeoverModal(false)}
                                style={{ padding: '8px 28px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '0.82rem', fontWeight: 500, color: '#6b7280', cursor: 'pointer' }}
                            >Kapat</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Chat Popup Modal */}
            {popupConversationId && (
                <ChatPopup
                    conversationId={popupConversationId}
                    onClose={() => setPopupConversationId(null)}
                />
            )}
        </>
    );
};

const ContactSidebarWithBoundary = (props) => (
    <ErrorBoundary title="Kişi Detayı Yüklenemedi" message="Kişi kartı açılırken bir hata oluştu. Lütfen tekrar deneyin.">
        <ContactSidebar {...props} />
    </ErrorBoundary>
);

export default ContactSidebarWithBoundary;
