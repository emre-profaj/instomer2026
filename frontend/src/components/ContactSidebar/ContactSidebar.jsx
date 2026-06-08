import { useEffect, useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import { X, Phone, Mail, User, Users, Clock, MapPin, Tag, Plus, ExternalLink, Loader, Trash2, StickyNote, ArrowRight, Sparkles, Brain, UserCheck, ChevronDown, ChevronRight, Ban, ShieldCheck, FileText, TrendingUp, Save, Bell, Check, PhoneCall, MessageSquare, Zap, Calendar, CalendarDays, History, Pencil, UserPlus, Banknote } from 'lucide-react';
import { facebookAPI, aiAPI, contactAPI, dealAPI, conversationAPI, appointmentAPI, retellAPI, funnelAPI } from '../../services/api';
import { activityAPI } from '../../services/activity.api';
import TransferModal from '../TransferModal/TransferModal';
import ChatPopup from '../ChatPopup/ChatPopup';
import './ContactSidebar.css';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { detectCallIntent } from '../../utils/callIntentDetector';

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

const ContactSidebar = ({ conversationId, contactId, isOpen, members = [], onAssign, isOwner, externalProfile = null, readOnly = false, onClose, onConversationOpen, teams = [], onAssignTeam, onAssignUser, onTakeOver, conversationData = null, currentUserId = null, onActivitySaved = null, onOpenConversationPopup = null }) => {
    const { currentWorkspace, onlineUsers, user } = useAuth();
    const navigate = useNavigate();
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

    // Sync localConvOverride when conversationData prop changes from parent (e.g. assignment from Inbox header)
    useEffect(() => {
        if (conversationData && localConvOverride) {
            const changed =
                conversationData.assignedToId !== localConvOverride.assignedToId ||
                conversationData.teamIds !== localConvOverride.teamIds;
            if (changed) {
                setLocalConvOverride(prev => ({
                    ...prev,
                    assignedToId: conversationData.assignedToId,
                    assignedTo: conversationData.assignedTo,
                    teamIds: conversationData.teamIds
                }));
            }
        }
    }, [conversationData?.assignedToId, conversationData?.teamIds]);

    const [newNote, setNewNote] = useState('');
    const [savingNote, setSavingNote] = useState(false);
    const [notesExpanded, setNotesExpanded] = useState(false);
    const [expandedNotes, setExpandedNotes] = useState({});
    const [isEditingName, setIsEditingName] = useState(false);
    const [funnelStage, setFunnelStage] = useState(null); // { name, color } of the current funnel stage
    const [showExtraFields, setShowExtraFields] = useState(false);

    // Reminder states
    const [showReminderModal, setShowReminderModal] = useState(false);
    const [reminderSaving, setReminderSaving] = useState(false);

    // Call popup states
    const [showCallPopup, setShowCallPopup] = useState(false);
    const [callScheduleMode, setCallScheduleMode] = useState(false);
    const [scheduledDateTime, setScheduledDateTime] = useState('');
    const [schedulingCall, setSchedulingCall] = useState(false);
    const [callRefreshKey, setCallRefreshKey] = useState(0);
    const [retellAgents, setRetellAgents] = useState([]);
    const [selectedAgentId, setSelectedAgentId] = useState('');
    const [reminderForm, setReminderForm] = useState({
        reminderDate: '',
        assignedToId: '',
        description: ''
    });

    // New Activity Timeline States
    const [plannedTimeline, setPlannedTimeline] = useState([]);
    const [pastTimeline, setPastTimeline] = useState([]);
    const [timelineLoading, setTimelineLoading] = useState(false);
    const [showActivityModal, setShowActivityModal] = useState(false);
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
        type: 'NOTE',
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
    const [activityFunnels, setActivityFunnels] = useState([]); // stage seçici için
    const [popupConversationId, setPopupConversationId] = useState(null); // Chat popup state
    const [callCompleted, setCallCompleted] = useState(true); // Arama tamamlandı mı? checkbox
    const [postNoteAction, setPostNoteAction] = useState(null); // { funnelStageId, teamId, assignedToId } — not sonrası aksiyon
    const [expandedMilestone, setExpandedMilestone] = useState(null); // Sohbet akışı popup
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
        notes: ''
    });
    const [quoteSubmitting, setQuoteSubmitting] = useState(false);

    // Inline Order Form State
    const [showOrderForm, setShowOrderForm] = useState(false);
    const [orderFormData, setOrderFormData] = useState({
        title: '',
        description: '',
        currency: 'TRY',
        products: [{ name: '', quantity: 1, unitPrice: 0 }],
        notes: ''
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
        notes: ''
    });
    const [invoiceSubmitting, setInvoiceSubmitting] = useState(false);

    // Deal detail popup (from timeline click)
    const [selectedDealDetail, setSelectedDealDetail] = useState(null);

    // Takeover confirmation popup
    const [showTakeoverModal, setShowTakeoverModal] = useState(false);

    // If external profile is provided (e.g., for comments), use it directly
    useEffect(() => {
        if (externalProfile) {
            const normalized = { ...externalProfile };
            if (normalized.phone) normalized.phone = normalizePhone(normalized.phone);
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
    useEffect(() => {
        if (!selectedAiCall?.summary || !currentWorkspace?.id) {
            setTranslatedSummary('');
            return;
        }
        const summary = selectedAiCall.summary;
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
        aiAPI.instoBotChat(currentWorkspace.id,
            `Aşağıdaki metni Türkçeye çevir. Sadece çeviriyi yaz, başka bir şey ekleme:\n\n"${summary}"`,
            []
        ).then(res => {
            const tr = (res.data?.response || res.data?.message || summary).replace(/^"|"$/g, '');
            translationCache.current[summary] = tr;
            setTranslatedSummary(tr);
        }).catch(() => {
            setTranslatedSummary(summary);
        }).finally(() => setTranslatingSum(false));
    }, [selectedAiCall?.summary, currentWorkspace?.id]);

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

    const fetchProfile = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await facebookAPI.getContactProfile(conversationId);
            const profileData = response.data.profile;
            if (profileData?.phone) profileData.phone = normalizePhone(profileData.phone);
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

    // Aktivite modalını konuşmanın mevcut atamasıyla aç
    const openActivityModal = (type) => {
        const effectiveConv = activeConv;
        const defaultAssigneeId = effectiveConv?.assignedToId || '';
        const defaultTeamId = effectiveConv?.teamIds
            ? ((() => { try { return JSON.parse(effectiveConv.teamIds)[0] || ''; } catch { return ''; } })())
            : '';
        setActivityForm({
            type,
            title: '',
            description: '',
            dueDate: '',
            assignedToId: defaultAssigneeId,
            teamId: defaultTeamId,
            funnelStageId: ''
        });
        setCallCompleted(true); // Reset checkbox
        setShowActivityModal(true);
    };

    const handleSaveActivity = async () => {
        if (!profile || !profile.id) return;
        if (!activityForm.type) return;

        // Validation based on type
        if (activityForm.type === 'NOTE' && !activityForm.description.trim()) {
            return alert('Görüşme notu boş olamaz.');
        }
        if ((activityForm.type === 'REMINDER' || activityForm.type === 'MEETING') && (!activityForm.dueDate || !activityForm.description.trim())) {
            return alert('Tarih ve açıklama girmelisiniz.');
        }
        if (activityForm.type === 'TASK' && (!activityForm.title.trim() || !activityForm.assignedToId)) {
            return alert('Görev başlığı ve atanacak kişi zorunludur.');
        }

        setActivitySaving(true);
        try {
            // NOTE tipi → callCompleted true ise Arama Notu (CALL+COMPLETED), false ise Dahili Not (NOTE+COMPLETED)
            const isNoteType = activityForm.type === 'NOTE';
            const isCallNote = isNoteType && callCompleted;
            const isInternalNote = isNoteType && !callCompleted;
            const dataToSave = {
                workspaceId: currentWorkspace.id,
                type: isCallNote ? 'CALL' : (isInternalNote ? 'NOTE' : activityForm.type),
                title: isCallNote ? 'Telefon Görüşmesi' : (isInternalNote ? 'Dahili Not' : (activityForm.title || (activityForm.type === 'REMINDER' ? 'Hatırlatıcı' : 'Aktivite'))),
                description: activityForm.description,
                dueDate: isNoteType ? new Date().toISOString() : (activityForm.dueDate ? new Date(activityForm.dueDate).toISOString() : null),
                assignedToId: activityForm.assignedToId || null,
                teamId: activityForm.teamId || null,
                ...(isNoteType && { status: 'COMPLETED', completedAt: new Date().toISOString() })
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
            if ((activityForm.type === 'CALL' || activityForm.type === 'MEETING') && activityForm.dueDate) {
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
                    } catch { }
                }
            }

            setShowActivityModal(false);
            setEditingActivityId(null);
            setActivityForm({ type: 'NOTE', title: '', description: '', dueDate: '', assignedToId: '', funnelStageId: '' });
            fetchTimeline(profile.id);
            // Inbox list'teki badge'leri hemen güncelle
            if (onActivitySaved) {
                const wasCallNote = isCallNote;
                onActivitySaved({
                    type: wasCallNote ? 'CALL' : (isInternalNote ? 'NOTE' : activityForm.type),
                    status: isNoteType ? 'COMPLETED' : 'PLANNED',
                    contactId: profile.id,
                    dueDate: activityForm.dueDate
                });
            }

            // Not kaydedildi — Akış/Takım/Üstlen panelini göster
            if (activityForm.type === 'NOTE') {
                // Funnelleri yükle (akış seçici için)
                loadActivityFunnels();
                setTimeout(() => {
                    setPostNoteAction({ funnelStageId: '', teamId: '', assignedToId: '' });
                    setShowTakeoverModal(true);
                }, 300);
            }
        } catch (err) {
            console.error('Save activity err:', err);
            alert('Aktivite kaydedilirken hata oluştu.');
        } finally {
            setActivitySaving(false);
        }
    };



    const handleCompleteActivity = async () => {
        if (!completingActivity) return;
        try {
            const rawId = completingActivity.id.replace(/^act_/, '');
            await activityAPI.completeActivity(rawId, completeResult);
            // Planned'dan kaldır, past'a ekle
            const completedItem = { ...completingActivity, isCompleted: true, isPlanned: false, status: 'COMPLETED', content: completeResult || completingActivity.content };
            setPlannedTimeline(prev => prev.filter(i => i.id !== completingActivity.id));
            setPastTimeline(prev => [completedItem, ...prev]);
            setCompletingActivity(null);
            setCompleteResult('');

            // Inbox'taki aktivite badge'ini anında yeşile çevir
            if (onActivitySaved && profile?.id) {
                const actType = completingActivity.type || completingActivity.activityType || 'CALL';
                onActivitySaved({ type: actType, status: 'COMPLETED', contactId: profile.id });
            }
        } catch (err) {
            console.error('Complete activity error:', err);
            alert('Tamamlama başarısız.');
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
            case 'REMINDER': return <PhoneCall size={14} />;
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
            case 'REMINDER': return 'Arama';
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

    const activeConv = localConvOverride || conversationData || (contactConversations.length > 0 ? contactConversations[0] : null);

    const handleAssign = async (teamId, userId) => {
        if (!activeConv) return;
        setAssignMegaMenuOpen(false);
        try {
            // Her zaman teamId + userId birlikte gönder
            const payload = {};
            if (teamId !== undefined) payload.teamId = teamId || null;
            if (userId !== undefined) payload.userId = userId || null;

            if (userId !== undefined && onAssignUser) {
                await onAssignUser(activeConv.id, userId);
            } else if (userId === undefined && onAssignTeam) {
                await onAssignTeam(activeConv.id, teamId);
            } else {
                await conversationAPI.assign(currentWorkspace.id, activeConv.id, payload);
            }

            // Local state güncelle - sidebar anında yansıtsın
            const foundMember = userId ? (members.find(m => (m.user?.id || m.userId) === userId) || members.find(m => m.id === userId)) : null;
            const assignedToObj = foundMember ? { id: userId, name: foundMember.user?.name || foundMember.name || 'Agent' } : (userId ? { id: userId, name: 'Agent' } : null);
            const updatedData = {
                teamIds: teamId !== undefined ? (teamId ? JSON.stringify([teamId]) : '[]') : (activeConv.teamIds || '[]'),
                assignedTeamId: teamId !== undefined ? (teamId || null) : activeConv.assignedTeamId,
                assignedToId: userId !== undefined ? (userId || null) : activeConv.assignedToId,
                assignedTo: userId !== undefined ? assignedToObj : activeConv.assignedTo
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
                                                    if (profile.id && profile.name?.trim()) {
                                                        try { await contactAPI.update(currentWorkspace.id, profile.id, { name: profile.name.trim() }); } catch (err) { }
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
                                                        title="AI Call"
                                                        onClick={() => {
                                                            if (!profile?.phone) return alert('Telefon numarası bulunamadı');
                                                            setCallScheduleMode(false);
                                                            setScheduledDateTime('');
                                                            setSelectedAgentId('');
                                                            setShowCallPopup(true);
                                                            retellAPI.getAgents(currentWorkspace.id).then(res => setRetellAgents(res.data.agents || [])).catch(() => { });
                                                        }}
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

                                                {/* Normal Tags */}
                                                {profile.tags && profile.tags.map((tag, i) => (
                                                    <div key={i} className="unified-tag unified-tag-purple">
                                                        <Tag size={12} />
                                                        <span>{tag}</span>
                                                        <button onClick={() => handleRemoveTag(tag)} className="remove-tag-btn" title="Sil">
                                                            <X size={10} />
                                                        </button>
                                                    </div>
                                                ))}

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
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>


                            {/* Atama / Üstlen Widget */}
                            {!readOnly && activeConv && (
                                <div style={{ display: 'flex', gap: '8px', padding: '20px 0 10px', alignItems: 'center' }}>
                                    {/* ── Atama Pill Widget ── */}
                                    {(() => {
                                        let convTeamIds = [];
                                        try { convTeamIds = JSON.parse(activeConv.teamIds || '[]'); } catch {}
                                        const assignedTeam = convTeamIds.length > 0 ? teams.find(t => t.id === convTeamIds[0]) : null;
                                        const assignedAgent = activeConv.assignedTo || (activeConv.assignedToId ? (members.find(m => (m.user?.id || m.userId) === activeConv.assignedToId) || members.find(m => m.id === activeConv.assignedToId)) : null);

                                        let pillLabel = 'Atanmadı';
                                        const agentName = assignedAgent?.user?.name || assignedAgent?.name;
                                        if (assignedTeam && agentName) pillLabel = `${assignedTeam.name} / ${agentName}`;
                                        else if (assignedTeam) pillLabel = `${assignedTeam.name} (Havuz)`;
                                        else if (agentName) pillLabel = agentName;

                                        const canClaim = !activeConv.assignedToId || activeConv.assignedToId !== (currentUserId || user?.id);

                                        return (
                                            <>
                                                <div ref={assignMegaMenuRef} style={{ position: 'relative', flex: 1 }}>
                                                    <button
                                                        className="stage-mega-trigger"
                                                        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                                        onClick={e => {
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            setAssignMegaMenuPos({ top: rect.bottom + 6, left: Math.max(10, rect.right - 342) });
                                                            setAssignSelectedTeam(assignedTeam?.id || null);
                                                            setAssignMegaMenuOpen(o => !o);
                                                        }}
                                                        title="Atama"
                                                    >
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            <Users size={12} style={{ flexShrink: 0 }} />
                                                            {pillLabel}
                                                        </span>
                                                        <ChevronDown size={10} style={{ flexShrink: 0 }} />
                                                    </button>

                                                    {assignMegaMenuOpen && (() => {
                                                        const menuTeam = assignSelectedTeam ? teams.find(t => t.id === assignSelectedTeam) : null;
                                                        const teamMembers = menuTeam?.members || [];
                                                        const ruleLabel = { POOL: 'Havuza At', ROUND_ROBIN: 'Sırayla At', LEAST_BUSY: 'En Az Yüklüye', ONLINE_ROUND_ROBIN: "Online'a Sırayla" };

                                                        return ReactDOM.createPortal(
                                                            <>
                                                                <div
                                                                    style={{ position: 'fixed', inset: 0, zIndex: 99998 }}
                                                                    onClick={() => setAssignMegaMenuOpen(false)}
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
                                                                                            background: activeConv.assignedToId === uid ? '#eff6ff' : 'transparent',
                                                                                            color: activeConv.assignedToId === uid ? '#1d4ed8' : '#374151'
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
                                                                                        {activeConv.assignedToId === uid && <span style={{ marginLeft: 'auto', fontSize: '0.65rem' }}>✓</span>}
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
                                                    >
                                                        <UserCheck size={12} />
                                                        Üstlen
                                                    </button>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            )}




                            {/* ACTION BUTTONS — Row 1: Aktiviteler */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', padding: '8px 0 2px' }}>
                                <button className="activity-btn" style={{ padding: '8px 4px', minHeight: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onClick={() => openActivityModal('NOTE')}>
                                    <span style={{ position: 'relative', display: 'inline-flex', width: 28, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                                        <PhoneCall size={17} style={{ color: '#374151' }} />
                                        <span style={{
                                            position: 'absolute', bottom: -3, right: -2,
                                            width: 14, height: 14, borderRadius: '50%',
                                            background: '#10b981', display: 'flex',
                                            alignItems: 'center', justifyContent: 'center',
                                            boxShadow: '0 0 0 2px #fff'
                                        }}>
                                            <Check size={9} strokeWidth={3} style={{ color: '#fff' }} />
                                        </span>
                                        <StickyNote size={10} style={{
                                            position: 'absolute', top: -3, left: -2,
                                            color: '#f59e0b'
                                        }} />
                                    </span>
                                    <span style={{ fontSize: '0.6rem', color: '#6b7280', fontWeight: 500, textAlign: 'center', lineHeight: 1.2 }}>Arama{' '}Notu</span>
                                </button>
                                <button className="activity-btn" style={{ padding: '8px 4px', minHeight: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onClick={() => openActivityModal('CALL')}>
                                    <PhoneCall size={18} />
                                    <span style={{ fontSize: '0.6rem', color: '#6b7280', fontWeight: 500, textAlign: 'center', lineHeight: 1.2 }}>Arama{' '}Planla</span>
                                </button>
                                <button className="activity-btn" style={{ padding: '8px 4px', minHeight: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onClick={() => openActivityModal('MEETING')}>
                                    <CalendarDays size={18} />
                                    <span style={{ fontSize: '0.6rem', color: '#6b7280', fontWeight: 500, textAlign: 'center', lineHeight: 1.2 }}>Görüşme{' '}Planla</span>
                                </button>
                                <button className="activity-btn" style={{ padding: '8px 4px', minHeight: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onClick={() => openActivityModal('REMINDER')}>
                                    <Bell size={18} />
                                    <span style={{ fontSize: '0.6rem', color: '#6b7280', fontWeight: 500, textAlign: 'center', lineHeight: 1.2 }}>Görev{' '}Hatırlatıcı</span>
                                </button>
                            </div>
                            {/* ACTION BUTTONS — Row 2: Satış */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', padding: '2px 0 8px' }}>
                                <button className="activity-btn" style={{ padding: '8px 4px', minHeight: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onClick={() => setShowQuoteForm(true)}>
                                    <FileText size={18} style={{ color: '#10b981' }} />
                                    <span style={{ fontSize: '0.6rem', color: '#6b7280', fontWeight: 500 }}>Teklif</span>
                                </button>
                                <button className="activity-btn" style={{ padding: '8px 4px', minHeight: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onClick={() => setShowOrderForm(true)}>
                                    <TrendingUp size={18} style={{ color: '#3b82f6' }} />
                                    <span style={{ fontSize: '0.6rem', color: '#6b7280', fontWeight: 500 }}>Sipariş</span>
                                </button>
                                <button className="activity-btn" style={{ padding: '8px 4px', minHeight: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onClick={() => setShowInvoiceForm(true)}>
                                    <FileText size={18} style={{ color: '#8b5cf6' }} />
                                    <span style={{ fontSize: '0.6rem', color: '#6b7280', fontWeight: 500 }}>Fatura</span>
                                </button>
                                <button className="activity-btn" style={{ padding: '8px 4px', minHeight: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onClick={() => openActivityModal('PAYMENT')}>
                                    <Banknote size={18} style={{ color: '#f59e0b' }} />
                                    <span style={{ fontSize: '0.6rem', color: '#6b7280', fontWeight: 500 }}>Tahsilat</span>
                                </button>
                            </div>

                            {/* MÜŞTERİ YOLCULUĞU TIMELINE */}
                            {!timelineLoading && (pastTimeline.length > 0 || plannedTimeline.length > 0 || profile?.createdAt) && (() => {
                                // Build journey milestones from timeline data + profile
                                const milestones = [];

                                // 1. Kişi kaydı oluşturuldu
                                if (profile?.createdAt) {
                                    milestones.push({
                                        icon: '📋',
                                        label: 'Kayıt Oluşturuldu',
                                        detail: profile.source ? `Kaynak: ${profile.source}` : null,
                                        date: new Date(profile.createdAt),
                                        color: '#ef4444',
                                        done: true,
                                        _type: 'RECORD'
                                    });
                                }

                                // 2. İlk sohbet
                                const allTimeline = [...pastTimeline, ...plannedTimeline];
                                const firstConv = allTimeline
                                    .filter(i => i.sourceType === 'CONVERSATION')
                                    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
                                if (firstConv) {
                                    // Prefer aiTopic > lastMessageContent > channel name
                                    const convDetail = firstConv.aiTopic 
                                        || firstConv.lastMessageContent 
                                        || firstConv.title 
                                        || (firstConv.type === 'WHATSAPP' ? 'WhatsApp' : firstConv.type === 'INSTAGRAM' ? 'Instagram' : firstConv.type === 'FACEBOOK' ? 'Facebook' : 'Sohbet');
                                    milestones.push({
                                        icon: '💬',
                                        label: 'İlk Sohbet Başladı',
                                        detail: convDetail,
                                        date: new Date(firstConv.date),
                                        color: '#ef4444',
                                        done: true,
                                        _type: 'CONVERSATION',
                                        _sourceItems: [firstConv]
                                    });
                                }

                                // 3. Telefon alındı (contact has phone)
                                if (profile?.phone) {
                                    const phoneDate = firstConv ? new Date(firstConv.date) : (profile?.createdAt ? new Date(profile.createdAt) : null);
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

                                // 4. Aramalar (tamamlanan)
                                const calls = allTimeline.filter(i => (i.type === 'CALL' || i.type === 'REMINDER') && i.sourceType === 'ACTIVITY');
                                const completedCalls = calls.filter(i => i.status === 'COMPLETED');
                                const failedCalls = calls.filter(i => i.status === 'CANCELLED');
                                if (completedCalls.length > 0) {
                                    const lastCall = completedCalls.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
                                    // Arama sonuç notundan duygu analizi
                                    const callResult = (lastCall.content || lastCall.description || lastCall.result || '').toLowerCase();
                                    let callSentiment = '📞';
                                    const positiveKeywords = ['bilgi verildi', 'ilgili', 'randevu', 'olumlu', 'başarılı', 'tamamlandı', 'satış', 'anlaştık', 'gelecek', 'kabul', 'onaylandı', 'memnun', 'teşekkür'];
                                    const negativeKeywords = ['ulaşılamadı', 'ilgisiz', 'olumsuz', 'başarısız', 'iptal', 'ret', 'reddetti', 'cevap yok', 'meşgul', 'kapalı', 'yanlış numara', 'ilgilenmiyor', 'vazgeçti'];
                                    if (positiveKeywords.some(k => callResult.includes(k))) callSentiment = '😊';
                                    else if (negativeKeywords.some(k => callResult.includes(k))) callSentiment = '😞';
                                    else if (callResult.length > 0) callSentiment = '😐';
                                    milestones.push({
                                        icon: '📞',
                                        label: `Arama Yapıldı${completedCalls.length > 1 ? ` (${completedCalls.length}x)` : ''} ${callSentiment}`,
                                        detail: [
                                            lastCall.assignedToName ? `→ ${lastCall.assignedToName}` : null,
                                            lastCall.content || lastCall.description || 'Tamamlandı'
                                        ].filter(Boolean).join('  •  '),
                                        date: new Date(lastCall.dueDate || lastCall.date),
                                        color: '#16a34a',
                                        done: true,
                                        _type: 'CALL',
                                        _sourceItems: completedCalls
                                    });
                                }
                                if (failedCalls.length > 0) {
                                    const lastFailed = failedCalls.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
                                    milestones.push({
                                        icon: '📵',
                                        label: `Ulaşılamadı${failedCalls.length > 1 ? ` (${failedCalls.length}x)` : ''}`,
                                        detail: lastFailed.content || 'Cevap yok',
                                        date: new Date(lastFailed.dueDate || lastFailed.date),
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

                                // 8.5 AI Aramaları
                                if (aiCalls.length > 0) {
                                    const lastAiCall = aiCalls[0];
                                    // Retell sentiment → emoji
                                    const sentimentEmoji = lastAiCall.sentiment === 'Positive' ? '😊' 
                                        : lastAiCall.sentiment === 'Negative' ? '😞' 
                                        : lastAiCall.sentiment === 'Neutral' ? '😐' : '';
                                    const successText = lastAiCall.callSuccessful ? '✅ Başarılı' : '❌ Başarısız';
                                    milestones.push({
                                        icon: '🤖',
                                        label: `AI Araması${aiCalls.length > 1 ? ` (${aiCalls.length}x)` : ''} ${sentimentEmoji}`,
                                        detail: [
                                            successText,
                                            lastAiCall.summary ? lastAiCall.summary.substring(0, 50) : null
                                        ].filter(Boolean).join(' — '),
                                        date: new Date(lastAiCall.createdAt),
                                        color: lastAiCall.callSuccessful ? '#16a34a' : '#ef4444',
                                        done: true,
                                        _type: 'AI_CALL',
                                        _sourceItems: aiCalls
                                    });
                                }

                                // 9. Planlanmış aramalar (gelecek)
                                const plannedCalls = plannedTimeline.filter(i => (i.type === 'CALL' || i.type === 'REMINDER') && i.status === 'PLANNED');
                                if (plannedCalls.length > 0) {
                                    const nextCall = plannedCalls.sort((a, b) => new Date(a.dueDate || a.date) - new Date(b.dueDate || b.date))[0];
                                    const callDate = new Date(nextCall.dueDate || nextCall.date);
                                    const isOverdue = callDate < new Date();
                                    const hasCompletedCall = completedCalls.length > 0;
                                    milestones.push({
                                        icon: isOverdue ? '⚠️' : '🔔',
                                        label: isOverdue ? 'Gecikmiş Arama' : 'Planlanan Arama',
                                        detail: (() => {
                                            const parts = [];
                                            if (nextCall.assignedToName) parts.push(`→ ${nextCall.assignedToName}`);
                                            // Konu: callTopic alanından veya content içinden parse et
                                            let topic = nextCall.callTopic;
                                            if (!topic && nextCall.content) {
                                                const match = nextCall.content.match(/Konu:\s*([^\s]+(?:\s+[^\s]+)*?)(?:\s+Numara:|\s+Kaynak:|\s*$)/i);
                                                if (match) topic = match[1].trim();
                                            }
                                            if (topic) parts.push(`📋 ${topic}`);
                                            return parts.length > 0 ? parts.join('  •  ') : null;
                                        })(),
                                        date: callDate,
                                        color: isOverdue ? '#dc2626' : '#f87171',
                                        done: false,
                                        overdue: isOverdue && !hasCompletedCall,
                                        _type: 'PLANNED_CALL',
                                        _sourceItems: plannedCalls
                                    });
                                }

                                // 9.5 Notlar (Internal Notes + Contact Notes)
                                const noteItems = allTimeline.filter(i => i.type === 'NOTE' && i.sourceType === 'ACTIVITY');
                                noteItems.forEach(note => {
                                    const noteContent = (note.content || '').replace(/<[^>]*>/g, '').substring(0, 60);
                                    milestones.push({
                                        icon: '📝',
                                        label: 'Not Eklendi',
                                        detail: [
                                            note.labelName && note.labelName !== 'Kişi Notu' ? `${note.labelName}` : null,
                                            noteContent || null
                                        ].filter(Boolean).join(' — ') || null,
                                        date: new Date(note.date),
                                        color: '#eab308',
                                        done: true,
                                        _type: 'NOTE'
                                    });
                                });

                                // 10. Conversation Events (Atama, Transfer, Aşama Değişikliği)
                                const rawEventItems = allTimeline.filter(i => i.sourceType === 'EVENT');
                                // Aynı başlık + yakın zaman (60sn) olanları deduplicate et
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
                                            icon = '👤';
                                            color = '#3b82f6';
                                            label = evt.title || 'Agent Atandı';
                                            break;
                                        case 'TRANSFERRED':
                                            icon = '🔄';
                                            color = '#8b5cf6';
                                            label = evt.title || 'Transfer Edildi';
                                            break;
                                        case 'STAGE_CHANGED':
                                            icon = '🏷️';
                                            color = '#f59e0b';
                                            label = evt.title || 'Aşama Değişti';
                                            if (evt.details?.fromStage && evt.details?.toStage) {
                                                detail = `${evt.details.fromStage} → ${evt.details.toStage}`;
                                            }
                                            break;
                                        case 'FUNNEL_CHANGED':
                                            icon = '📊';
                                            color = '#6366f1';
                                            label = evt.title || 'Akış Değişti';
                                            if (evt.details?.funnelName) {
                                                detail = evt.details.funnelName;
                                            }
                                            break;
                                        case 'CLAIMED':
                                            icon = '✋';
                                            color = '#10b981';
                                            label = evt.title || 'Üstlenildi';
                                            break;
                                        default:
                                            break;
                                    }

                                    milestones.push({
                                        icon,
                                        label,
                                        detail,
                                        date: new Date(evt.date),
                                        color,
                                        done: true,
                                        _type: 'EVENT',
                                        _eventType: eventType
                                    });
                                });

                                // 11. Deals / Satış Milestones (Teklif, Sipariş, Fatura)
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

                                // Sort by date — eskiden yeniye
                                milestones.sort((a, b) => (a.date || 0) - (b.date || 0));

                                if (milestones.length === 0) return null;

                                return (
                                    <div className="customer-journey-timeline">
                                        <div className="journey-header">
                                            <TrendingUp size={13} />
                                            <span>Sohbet Akışı</span>
                                            <span className="journey-count">{milestones.length} adım</span>
                                        </div>
                                        <div className="journey-steps">
                                            {milestones.map((m, idx) => {
                                                const isClickable = m._sourceItems || m._dealData;
                                                const handleStepClick = () => {
                                                    if (m._type === 'AI_CALL' && m._sourceItems?.length > 0) {
                                                        setSelectedAiCall(m._sourceItems[0]);
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
                                                    style={isClickable ? {
                                                        cursor: 'pointer',
                                                        background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                                                        borderRadius: '10px',
                                                        padding: '8px 10px',
                                                        margin: '2px -6px',
                                                        border: '1px solid #93c5fd',
                                                        borderLeft: '4px solid #3b82f6',
                                                        boxShadow: '0 2px 8px rgba(59, 130, 246, 0.12)',
                                                        transition: 'all 0.2s ease'
                                                    } : {}}
                                                >
                                                    <div className="journey-line-wrapper">
                                                        <div className="journey-dot" style={{ borderColor: m.color, background: m.done ? m.color : '#fff' }}>
                                                            {m.done && <Check size={8} color="#fff" />}
                                                        </div>
                                                        {idx < milestones.length - 1 && (
                                                            <div className="journey-line" style={{ background: m.done ? m.color : '#e2e8f0' }} />
                                                        )}
                                                    </div>
                                                    <div className="journey-content">
                                                        <div className="journey-label">
                                                            <span className="journey-emoji">{m.icon}</span>
                                                            <span className="journey-title" style={isClickable ? { color: '#1d4ed8', fontWeight: 700 } : {}}>{m.label}</span>
                                                            {isClickable && (
                                                                <span style={{
                                                                    marginLeft: 'auto',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    width: 22,
                                                                    height: 22,
                                                                    borderRadius: '50%',
                                                                    background: '#3b82f6',
                                                                    flexShrink: 0
                                                                }}>
                                                                    <ChevronRight size={14} color="#fff" />
                                                                </span>
                                                            )}
                                                        </div>
                                                        {m.detail && <div className="journey-detail" style={isClickable ? { color: '#2563eb' } : {}}>{m.detail}</div>}
                                                        {m.date && (
                                                            <div className="journey-date" style={isClickable ? { color: '#60a5fa' } : {}}>
                                                                {m.date.toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* AI Araması Detay Modalı */}
                            {selectedAiCall && (
                                <div className="reminder-modal-overlay" onClick={() => setSelectedAiCall(null)}>
                                    <div className="reminder-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                                        <div className="reminder-modal-header">
                                            <span style={{ fontSize: '1.1rem' }}>🤖</span>
                                            <h3>AI Araması Detayı</h3>
                                            <button className="reminder-modal-close" onClick={() => setSelectedAiCall(null)}><X size={18} /></button>
                                        </div>
                                        <div className="reminder-modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                                            {/* Stats */}
                                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                                                <span style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: '999px', background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
                                                    📅 {new Date(selectedAiCall.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                {selectedAiCall.duration && (
                                                    <span style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: '999px', background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
                                                        ⏱ {Math.floor(selectedAiCall.duration/60)}dk {selectedAiCall.duration%60}sn
                                                    </span>
                                                )}
                                                <span style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: '999px', background: selectedAiCall.callSuccessful ? '#dcfce7' : '#fef2f2', color: selectedAiCall.callSuccessful ? '#16a34a' : '#ef4444', fontWeight: 700 }}>
                                                    {selectedAiCall.callSuccessful ? '✓ Başarılı' : '✗ Başarısız'}
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
                                                        <span style={{ fontWeight: 700, fontSize: '0.78rem', color: '#374151' }}>📝 Özet</span>
                                                        {translatingSum && (
                                                            <span style={{ fontSize: '0.65rem', color: '#6366f1', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                                <Loader size={10} className="spin" /> Çevriliyor...
                                                            </span>
                                                    </div>
                                                    {/* Orijinal (EN) */}
                                                    <div style={{ fontSize: '0.82rem', color: '#1e293b', lineHeight: 1.5 }}>
                                                        {selectedAiCall.summary}
                                                    </div>
                                                    {/* Türkçe Çeviri */}
                                                    <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                                            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#6366f1' }}>🇹🇷 Türkçe</span>
                                                            {translatingSum && (
                                                                <span style={{ fontSize: '0.62rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                                    <Loader size={9} className="spin" /> Çevriliyor...
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.5, fontStyle: translatingSum ? 'italic' : 'normal' }}>
                                                            {translatingSum ? 'Çevriliyor...' : (translatedSummary || selectedAiCall.summary)}
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
                                                        setQuoteFormData({ title: d.title || '', description: d.description || '', amount: d.amount || '', currency: d.currency || 'TRY', products: prods, notes: d.notes || '', _editId: d.id });
                                                        setShowQuoteForm(true);
                                                    } else if (d.stage === 'ORDER') {
                                                        setOrderFormData({ title: d.title || '', description: d.description || '', currency: d.currency || 'TRY', products: prods, notes: d.notes || '', _editId: d.id });
                                                        setShowOrderForm(true);
                                                    } else if (d.stage === 'INVOICE') {
                                                        setInvoiceFormData({ title: d.title || '', currency: d.currency || 'TRY', taxRate: d.taxRate || 20, dueDate: d.dueDate ? new Date(d.dueDate).toISOString().slice(0, 10) : '', products: prods, notes: d.notes || '', _editId: d.id });
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
                                            {expandedMilestone._type === 'PLANNED_CALL' ? (
                                                /* Planlanan aramalar — aksiyon butonlu */
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                    {expandedMilestone._sourceItems.map((item, ci) => {
                                                        const due = item.dueDate ? new Date(item.dueDate) : null;
                                                        const overdue = due && due < new Date();
                                                        return (
                                                        <div key={ci} style={{ padding: '12px 14px', background: overdue ? '#fef2f2' : '#f8fafc', borderRadius: '10px', border: `1px solid ${overdue ? '#fecaca' : '#e5e7eb'}` }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: overdue ? '#dc2626' : '#1e293b' }}>
                                                                    {item.title || 'Planlanan Arama'}
                                                                </span>
                                                                {overdue && <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '999px', background: '#fee2e2', color: '#dc2626', fontWeight: 700 }}>⚠️ Gecikmiş</span>}
                                                            </div>
                                                            {due && (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.76rem', color: '#6b7280', marginBottom: '6px' }}>
                                                                    <Clock size={12} />
                                                                    {due.toLocaleString('tr-TR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
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
                                                                        assignedToId: item.assignedToId || '', teamId: item.teamId || '', funnelStageId: '' });
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
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.76rem', color: '#6b7280', marginBottom: '4px' }}>
                                                                    <Clock size={12} />
                                                                    {new Date(item.dueDate || item.date).toLocaleString('tr-TR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
                                                                        assignedToId: item.assignedToId || '', teamId: item.teamId || '', funnelStageId: '' });
                                                                    setShowActivityModal(true);
                                                                }}
                                                                    style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '5px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                                    <Pencil size={12} /> Düzenle
                                                                </button>
                                                                {item.status && item.status !== 'COMPLETED' && item.status !== 'CANCELLED' && (
                                                                    <button onClick={() => { setExpandedMilestone(null); handleDeleteActivity(item.id); }}
                                                                        style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '8px', padding: '5px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                                        <Trash2 size={12} /> Sil
                                                                    </button>
                                                                )}
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
                                            {/* Arama tamamlandı mı? checkbox — sadece NOTE tipi için */}
                                            {activityForm.type === 'NOTE' && (
                                                <label style={{
                                                    display: 'flex', alignItems: 'center', gap: 8,
                                                    padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                                                    background: callCompleted ? '#f0fdf4' : '#fefce8',
                                                    border: `1px solid ${callCompleted ? '#bbf7d0' : '#fde68a'}`,
                                                    marginBottom: 12, fontSize: '0.85rem', fontWeight: 600,
                                                    color: callCompleted ? '#166534' : '#92400e',
                                                    transition: 'all 0.2s'
                                                }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={callCompleted}
                                                        onChange={e => setCallCompleted(e.target.checked)}
                                                        style={{ width: 18, height: 18, accentColor: callCompleted ? '#16a34a' : '#f59e0b', cursor: 'pointer' }}
                                                    />
                                                    <div>
                                                        <div>{callCompleted ? '✅ Arama tamamlandı' : '📝 Dahili not olarak kaydet'}</div>
                                                        <div style={{ fontSize: '0.72rem', fontWeight: 400, color: '#6b7280', marginTop: 2 }}>
                                                            {callCompleted ? 'Tamamlanmış arama notu olarak kaydedilir' : 'Sadece ekip görebilir, arama kaydı oluşmaz'}
                                                        </div>
                                                    </div>
                                                </label>
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
                                                            let filteredMembers = members;
                                                            if (selectedTeamId && teams) {
                                                                const team = findTeam(teams, selectedTeamId);
                                                                const memberIds = new Set((team?.members || []).map(m => m.userId));
                                                                filteredMembers = members.filter(m => memberIds.has(m.user?.id || m.id));
                                                            }
                                                            return filteredMembers.map(member => (
                                                                <option key={member.user?.id || member.id} value={member.user?.id || member.id}>
                                                                    {(onlineUsers.get(member.user?.id || member.id)?.isOnline || member.user?.isOnline) ? '🟢' : '⚪'} {member.user?.name || member.name}
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
                                            <div className="reminder-form-group">
                                                <label><FileText size={14} /> Sonuç Notu</label>
                                                <textarea
                                                    value={completeResult}
                                                    onChange={e => setCompleteResult(e.target.value)}
                                                    placeholder="Görüşme sonucunu, notu veya detayları yazın..."
                                                    rows={4}
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
                        <p className="call-popup-contact">
                            {profile?.name || profile?.phone}
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
                                <option value="">Varsayılan Agent</option>
                                {retellAgents.map(a => (
                                    <option key={a.agent_id} value={a.agent_id}>{a.agent_name || a.agent_id}</option>
                                ))}
                            </select>
                        </div>

                        {!callScheduleMode ? (
                            <div className="call-popup-options">
                                <button
                                    className="call-option-btn call-now"
                                    onClick={async () => {
                                        try {
                                            await retellAPI.makeCall(currentWorkspace.id, {
                                                toNumber: profile.phone,
                                                contactId: profile.id,
                                                contactName: profile.name,
                                                conversationId: conversationId || null,
                                                ...(selectedAgentId && { agentId: selectedAgentId })
                                            });
                                            setShowCallPopup(false);
                                            alert('✅ Arama başlatıldı!');
                                        } catch (err) {
                                            alert(err.response?.data?.error || 'Arama başlatılamadı.');
                                        }
                                    }}
                                >
                                    <PhoneCall size={20} />
                                    <span>Hemen Ara</span>
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
                                                setSchedulingCall(true);
                                                await retellAPI.scheduleCall(currentWorkspace.id, {
                                                    toNumber: profile.phone,
                                                    contactId: profile.id,
                                                    contactName: profile.name,
                                                    scheduledAt: new Date(scheduledDateTime).toISOString(),
                                                    ...(selectedAgentId && { agentId: selectedAgentId })
                                                });
                                                setShowCallPopup(false);
                                                setCallScheduleMode(false);
                                                setCallRefreshKey(prev => prev + 1);
                                                alert('✅ Arama planlandı!');
                                            } catch (err) {
                                                alert(err.response?.data?.error || 'Planlama başarısız.');
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
                                        assignedToId: user?.id || null
                                    });
                                    setShowQuoteForm(false);
                                    setQuoteFormData({ title: '', description: '', amount: '', currency: 'TRY', products: [{ name: '', quantity: 1, unitPrice: 0 }], notes: '' });
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
                <div className="chat-popup-overlay" onClick={() => setShowOrderForm(false)} style={{ zIndex: 10000 }}>
                    <div className="chat-popup-modal" onClick={e => e.stopPropagation()} style={{ width: 680, maxWidth: '94vw', maxHeight: '88vh' }}>
                        <div className="chat-popup-header" style={{ borderBottom: '2px solid #fef2f2' }}>
                            <div className="chat-popup-header-left">
                                <div className="chat-popup-avatar" style={{ background: '#fef2f2', width: 48, height: 48 }}>
                                    <TrendingUp size={22} style={{ color: '#ef4444' }} />
                                </div>
                                <div className="chat-popup-header-info">
                                    <h3 className="chat-popup-contact-name" style={{ fontSize: '17px' }}>Yeni Sipariş Oluştur</h3>
                                    <span className="chat-popup-channel-badge" style={{ color: '#ef4444' }}>{profile?.name || 'Müşteri'} için</span>
                                </div>
                            </div>
                            <div className="chat-popup-header-actions">
                                <button className="chat-popup-icon-btn chat-popup-close-btn" onClick={() => setShowOrderForm(false)}><X size={18} /></button>
                            </div>
                        </div>
                        <div style={{ padding: '20px 28px', overflowY: 'auto', flex: 1 }}>
                            <form onSubmit={async (e) => {
                                e.preventDefault();
                                if (orderSubmitting) return;
                                setOrderSubmitting(true);
                                try {
                                    const totalAmount = orderFormData.products.reduce((s, p) => s + (p.quantity * p.unitPrice), 0);
                                    await dealAPI.create(currentWorkspace.id, {
                                        contactId: profile?.id,
                                        title: orderFormData.title,
                                        description: orderFormData.description,
                                        currency: orderFormData.currency,
                                        amount: totalAmount,
                                        products: orderFormData.products.map(p => ({ ...p, total: p.quantity * p.unitPrice })),
                                        notes: orderFormData.notes,
                                        stage: 'ORDER',
                                        assignedToId: user?.id || null
                                    });
                                    setShowOrderForm(false);
                                    setOrderFormData({ title: '', description: '', currency: 'TRY', products: [{ name: '', quantity: 1, unitPrice: 0 }], notes: '' });
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
                                <div style={{ marginBottom: 16 }}>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Sipariş Başlığı *</label>
                                    <input type="text" required value={orderFormData.title} onChange={e => setOrderFormData(p => ({ ...p, title: e.target.value }))}
                                        placeholder="Örn: Aylık Hizmet Paketi" style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                                        onFocus={e => e.target.style.borderColor = '#fca5a5'}
                                        onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                                </div>
                                <div style={{ marginBottom: 16 }}>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Para Birimi</label>
                                    <select value={orderFormData.currency} onChange={e => setOrderFormData(p => ({ ...p, currency: e.target.value }))}
                                        style={{ padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', outline: 'none' }}>
                                        <option value="TRY">₺ TRY</option>
                                        <option value="USD">$ USD</option>
                                        <option value="EUR">€ EUR</option>
                                        <option value="GBP">£ GBP</option>
                                    </select>
                                </div>
                                <div style={{ marginBottom: 16 }}>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 8 }}>Ürünler / Hizmetler</label>
                                    {orderFormData.products.map((product, idx) => (
                                        <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                                            <input type="text" placeholder="Ürün adı" value={product.name}
                                                onChange={e => { const p = [...orderFormData.products]; p[idx].name = e.target.value; setOrderFormData(prev => ({ ...prev, products: p })); }}
                                                style={{ flex: 2, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.85rem', outline: 'none' }} />
                                            <input type="number" placeholder="Adet" min="1" value={product.quantity}
                                                onChange={e => { const p = [...orderFormData.products]; p[idx].quantity = parseInt(e.target.value) || 1; setOrderFormData(prev => ({ ...prev, products: p })); }}
                                                style={{ width: 70, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.85rem', outline: 'none', textAlign: 'center' }} />
                                            <input type="number" placeholder="Birim Fiyat" min="0" value={product.unitPrice}
                                                onChange={e => { const p = [...orderFormData.products]; p[idx].unitPrice = parseFloat(e.target.value) || 0; setOrderFormData(prev => ({ ...prev, products: p })); }}
                                                style={{ width: 110, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.85rem', outline: 'none', textAlign: 'right' }} />
                                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ef4444', minWidth: 70, textAlign: 'right' }}>
                                                {(orderFormData.currency === 'TRY' ? '₺' : orderFormData.currency === 'USD' ? '$' : orderFormData.currency === 'EUR' ? '€' : '£')}{(product.quantity * product.unitPrice).toLocaleString('tr-TR')}
                                            </span>
                                            {orderFormData.products.length > 1 && (
                                                <button type="button" onClick={() => { const p = orderFormData.products.filter((_, i) => i !== idx); setOrderFormData(prev => ({ ...prev, products: p })); }}
                                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}><X size={15} /></button>
                                            )}
                                        </div>
                                    ))}
                                    <button type="button" onClick={() => setOrderFormData(prev => ({ ...prev, products: [...prev.products, { name: '', quantity: 1, unitPrice: 0 }] }))}
                                        style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#fef2f2', border: '1px dashed #fca5a5', borderRadius: 8, padding: '6px 12px', fontSize: '0.8rem', color: '#ef4444', cursor: 'pointer', marginTop: 6, fontWeight: 500 }}>
                                        <Plus size={13} /> Ürün Ekle
                                    </button>
                                    <div style={{ textAlign: 'right', fontSize: '0.92rem', fontWeight: 700, color: '#dc2626', marginTop: 10, padding: '8px 0', borderTop: '1px solid #fef2f2' }}>
                                        Toplam: {(orderFormData.currency === 'TRY' ? '₺' : orderFormData.currency === 'USD' ? '$' : orderFormData.currency === 'EUR' ? '€' : '£')}
                                        {orderFormData.products.reduce((s, p) => s + (p.quantity * p.unitPrice), 0).toLocaleString('tr-TR')}
                                    </div>
                                </div>
                                <div style={{ marginBottom: 20 }}>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Notlar</label>
                                    <textarea value={orderFormData.notes} onChange={e => setOrderFormData(p => ({ ...p, notes: e.target.value }))}
                                        placeholder="Ek notlar..." rows={3} style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: '0.9rem', resize: 'vertical', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                                        onFocus={e => e.target.style.borderColor = '#fca5a5'}
                                        onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
                                    <button type="button" onClick={() => setShowOrderForm(false)}
                                        style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', fontSize: '0.88rem', fontWeight: 600, color: '#64748b', cursor: 'pointer', transition: 'all 0.15s' }}>İptal</button>
                                    <button type="submit" disabled={orderSubmitting}
                                        style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: orderSubmitting ? '#fca5a5' : '#ef4444', fontSize: '0.88rem', fontWeight: 600, color: '#fff', cursor: 'pointer', opacity: orderSubmitting ? 0.7 : 1, transition: 'all 0.15s', boxShadow: '0 2px 8px rgba(239,68,68,0.25)' }}>
                                        {orderSubmitting ? 'Oluşturuluyor...' : 'Sipariş Oluştur'}
                                    </button>
                                </div>
                            </form>
                        </div>
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
                                        assignedToId: user?.id || null
                                    });
                                    setShowInvoiceForm(false);
                                    setInvoiceFormData({ title: '', currency: 'TRY', taxRate: 20, dueDate: '', products: [{ name: '', quantity: 1, unitPrice: 0 }], notes: '' });
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
                                            // Find stage name for UI feedback
                                            let stageName = '';
                                            for (const f of activityFunnels) {
                                                const s = (f.stages || []).find(s => s.id === stageId);
                                                if (s) { stageName = s.name; break; }
                                            }
                                            if (stageName) setFunnelStage(prev => ({ ...prev, id: stageId, name: stageName }));
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
                                        let filteredMembers = members;
                                        if (selectedTeamId && teams) {
                                            const team = findTeam(teams, selectedTeamId);
                                            const memberIds = new Set((team?.members || []).map(m => m.userId));
                                            filteredMembers = members.filter(m => memberIds.has(m.user?.id || m.id));
                                        }
                                        return filteredMembers.map(member => (
                                            <option key={member.user?.id || member.id} value={member.user?.id || member.id}>
                                                {(onlineUsers.get(member.user?.id || member.id)?.isOnline || member.user?.isOnline) ? '🟢' : '⚪'} {member.user?.name || member.name}
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

export default ContactSidebar;
