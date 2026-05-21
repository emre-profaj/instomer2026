import { useEffect, useState } from 'react';
import { X, Phone, Mail, User, Users, Clock, MapPin, Tag, Plus, ExternalLink, Loader, Trash2, StickyNote, ArrowRight, Sparkles, Brain, UserCheck, ChevronDown, Ban, ShieldCheck, FileText, TrendingUp, Save, Bell, Check, PhoneCall, MessageSquare, Zap, Calendar, CalendarDays, History, Pencil, UserPlus, Banknote } from 'lucide-react';
import { facebookAPI, aiAPI, contactAPI, dealAPI, conversationAPI, appointmentAPI, retellAPI, funnelAPI } from '../../services/api';
import { activityAPI } from '../../services/activity.api';
import TransferModal from '../TransferModal/TransferModal';
import ChatPopup from '../ChatPopup/ChatPopup';
import CallHistory from './CallHistory';
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

const ContactSidebar = ({ conversationId, contactId, isOpen, members = [], onAssign, isOwner, externalProfile = null, readOnly = false, onClose, onConversationOpen, teams = [], onAssignTeam, onAssignUser, onTakeOver, conversationData = null, currentUserId = null, onActivitySaved = null }) => {
    const { currentWorkspace, onlineUsers } = useAuth();
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
        if (conversationData) {
            const tid = conversationData.teamIds ? (JSON.parse(conversationData.teamIds)[0] || '') : '';
            setLocalTeamId(tid);
            setLocalAgentId(conversationData.assignedToId || '');
        }
    }, [conversationData?.teamIds, conversationData?.assignedToId]);

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
        const effectiveConv = conversationData || (contactConversations.length > 0 ? contactConversations[0] : null);
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
        setShowActivityModal(true);
    };

    const handleSaveActivity = async () => {
        if (!profile || !profile.id) return;
        if (!activityForm.type) return;

        // Validation based on type
        if (activityForm.type === 'NOTE' && !activityForm.description.trim()) {
            return alert('Not içeriği boş olamaz.');
        }
        if ((activityForm.type === 'REMINDER' || activityForm.type === 'MEETING') && (!activityForm.dueDate || !activityForm.description.trim())) {
            return alert('Tarih ve açıklama girmelisiniz.');
        }
        if (activityForm.type === 'TASK' && (!activityForm.title.trim() || !activityForm.assignedToId)) {
            return alert('Görev başlığı ve atanacak kişi zorunludur.');
        }

        setActivitySaving(true);
        try {
            const dataToSave = {
                workspaceId: currentWorkspace.id,
                type: activityForm.type,
                title: activityForm.title || (activityForm.type === 'NOTE' ? 'Not' : activityForm.type === 'REMINDER' ? 'Hatırlatıcı' : 'Aktivite'),
                description: activityForm.description,
                dueDate: activityForm.dueDate || null,
                assignedToId: activityForm.assignedToId || null,
                teamId: activityForm.teamId || null
            };

            if (editingActivityId) {
                // Update existing activity
                const rawId = editingActivityId.replace(/^act_/, '');
                await activityAPI.updateActivity(rawId, dataToSave);
            } else {
                // Create new activity
                await activityAPI.createActivity(profile.id, dataToSave);
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
            if (onActivitySaved) onActivitySaved({ type: activityForm.type, status: 'PLANNED', contactId: profile.id });

            // Not kaydedildi — konuşma kimseye atanmamışsa üstlenme sorusu sor
            if (activityForm.type === 'NOTE' && conversationData && !conversationData.assignedToId && onTakeOver) {
                setTimeout(() => {
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

    const handleDeleteActivity = async (activityId) => {
        if (!confirm('Bu aktiviteyi silmek istediğinize emin misiniz?')) return;
        try {
            const rawId = activityId.replace(/^act_/, '');
            await activityAPI.deleteActivity(rawId);
            setPlannedTimeline(prev => prev.filter(i => i.id !== activityId));
            setPastTimeline(prev => prev.filter(i => i.id !== activityId));
        } catch (err) {
            console.error('Delete activity error:', err);
            alert('Silme işlemi başarısız.');
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
            navigate('/inbox');
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
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Atama artık Inbox üst çubuğundan yapılmaktadır */}




                            {/* ACTION BUTTONS — Row 1: Aktiviteler */}
                            <div style={{ display: 'flex', gap: '4px', padding: '8px 16px 4px', justifyContent: 'center' }}>
                                <button className="activity-btn" style={{ flex: 1, padding: '10px 4px', minHeight: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onClick={() => openActivityModal('NOTE')}>
                                    <StickyNote size={18} />
                                    <span style={{ fontSize: '0.6rem', color: '#6b7280', fontWeight: 500, textAlign: 'center', lineHeight: 1.2 }}>Not</span>
                                </button>
                                <button className="activity-btn" style={{ flex: 1, padding: '10px 4px', minHeight: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onClick={() => openActivityModal('CALL')}>
                                    <PhoneCall size={18} />
                                    <span style={{ fontSize: '0.6rem', color: '#6b7280', fontWeight: 500, textAlign: 'center', lineHeight: 1.2 }}>Arama{' '}Planla</span>
                                </button>
                                <button className="activity-btn" style={{ flex: 1, padding: '10px 4px', minHeight: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onClick={() => openActivityModal('MEETING')}>
                                    <CalendarDays size={18} />
                                    <span style={{ fontSize: '0.6rem', color: '#6b7280', fontWeight: 500, textAlign: 'center', lineHeight: 1.2 }}>Görüşme{' '}Planla</span>
                                </button>
                                <button className="activity-btn" style={{ flex: 1, padding: '10px 4px', minHeight: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onClick={() => openActivityModal('REMINDER')}>
                                    <Bell size={18} />
                                    <span style={{ fontSize: '0.6rem', color: '#6b7280', fontWeight: 500, textAlign: 'center', lineHeight: 1.2 }}>Görev{' '}Hatırlatıcı</span>
                                </button>
                            </div>
                            {/* ACTION BUTTONS — Row 2: Satış */}
                            <div style={{ display: 'flex', gap: '4px', padding: '0 16px 8px', justifyContent: 'center' }}>
                                <button className="activity-btn" style={{ flex: 1, padding: '8px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }} onClick={() => setShowQuoteForm(true)}>
                                    <FileText size={18} style={{ color: '#10b981' }} />
                                    <span style={{ fontSize: '0.6rem', color: '#6b7280', fontWeight: 500 }}>Teklif</span>
                                </button>
                                <button className="activity-btn" style={{ flex: 1, padding: '8px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }} onClick={() => setShowOrderForm(true)}>
                                    <TrendingUp size={18} style={{ color: '#3b82f6' }} />
                                    <span style={{ fontSize: '0.6rem', color: '#6b7280', fontWeight: 500 }}>Sipariş</span>
                                </button>
                                <button className="activity-btn" style={{ flex: 1, padding: '8px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }} onClick={() => setShowInvoiceForm(true)}>
                                    <FileText size={18} style={{ color: '#8b5cf6' }} />
                                    <span style={{ fontSize: '0.6rem', color: '#6b7280', fontWeight: 500 }}>Fatura</span>
                                </button>
                                <button className="activity-btn" style={{ flex: 1, padding: '8px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }} onClick={() => openActivityModal('PAYMENT')}>
                                    <Banknote size={18} style={{ color: '#f59e0b' }} />
                                    <span style={{ fontSize: '0.6rem', color: '#6b7280', fontWeight: 500 }}>Tahsilat</span>
                                </button>
                            </div>

                            {/* TIMELINE SECTION */}
                            <div className="activity-timeline-section">
                                {/* Başlık ve çizgi kaldırıldı — alan kazanmak için */}

                                {timelineLoading ? (
                                    <div className="loading-state"><Loader className="spin" size={24} /></div>
                                ) : (
                                    <div className="timeline-container">
                                        {/* PLANLANMIŞ AKTİVİTELER */}
                                        {plannedTimeline.length > 0 && (
                                            <>
                                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '6px 0 6px', borderBottom: '2px solid #dbeafe', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <CalendarDays size={13} />
                                                    Yaklaşan Etkinlikler
                                                    <span style={{ marginLeft: 'auto', background: '#2563eb', color: '#fff', borderRadius: '999px', padding: '0 7px', fontSize: '0.65rem', fontWeight: 800 }}>{plannedTimeline.length}</span>
                                                </div>
                                                {plannedTimeline.map((item) => {
                                                    const typeConfig = {
                                                        CALL:     { lucide: <PhoneCall size={16}/>,    label: 'Arama Planlandı',    accent: '#3b82f6', accentBg: '#eff6ff', accentLight: '#dbeafe' },
                                                        MEETING:  { lucide: <CalendarDays size={16}/>, label: 'Görüşme Planlandı', accent: '#10b981', accentBg: '#f0fdf4', accentLight: '#dcfce7' },
                                                        REMINDER: { lucide: <Bell size={16}/>,         label: 'Hatırlatıcı',        accent: '#f97316', accentBg: '#fff7ed', accentLight: '#ffedd5' },
                                                        TASK:     { lucide: <Bell size={16}/>,         label: 'Görev',              accent: '#8b5cf6', accentBg: '#faf5ff', accentLight: '#ede9fe' },
                                                        VISIT:    { lucide: <MapPin size={16}/>,        label: 'Ziyaret',            accent: '#a855f7', accentBg: '#fdf4ff', accentLight: '#f3e8ff' },
                                                    };
                                                    const cfg = typeConfig[item.type] || { lucide: <Bell size={16}/>, label: item.type, accent: '#f59e0b', accentBg: '#fffbeb', accentLight: '#fef3c7' };
                                                    const now = new Date();
                                                    const due = item.dueDate ? new Date(item.dueDate) : null;
                                                    const overdue = due && due < now;
                                                    const diffMs = due ? due - now : null;
                                                    const diffMins = diffMs ? Math.round(diffMs / 60000) : null;
                                                    let countdown = '';
                                                    if (diffMins !== null) {
                                                        if (overdue) {
                                                            const overMins = Math.abs(diffMins);
                                                            countdown = overMins < 60 ? `${overMins} dk gecikti` : overMins < 1440 ? `${Math.round(overMins/60)} saat gecikti` : `${Math.round(overMins/1440)} gün gecikti`;
                                                        } else {
                                                            countdown = diffMins < 60 ? `${diffMins} dk sonra` : diffMins < 1440 ? `${Math.round(diffMins/60)} saat sonra` : `${Math.round(diffMins/1440)} gün sonra`;
                                                        }
                                                    }
                                                    return (
                                                        <div
                                                            key={item.id}
                                                            style={{ background: '#fff', borderRadius: '12px', marginBottom: '8px', boxShadow: '0 1px 6px rgba(0,0,0,0.08)', overflow: 'hidden', border: `1px solid ${overdue ? '#fecaca' : '#e5e7eb'}`, cursor: 'default', transition: 'box-shadow 0.15s' }}
                                                            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.12)'}
                                                            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 6px rgba(0,0,0,0.08)'}
                                                        >
                                                            {/* Colored top stripe */}
                                                            <div style={{ height: '3px', background: overdue ? '#ef4444' : cfg.accent, borderRadius: '12px 12px 0 0' }} />
                                                            <div style={{ padding: '10px 12px' }}>
                                                                {/* Header row */}
                                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                                                    {/* Icon box */}
                                                                    <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: overdue ? '#fff7ed' : cfg.accentLight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: overdue ? '#f97316' : cfg.accent, flexShrink: 0, marginTop: '1px' }}>
                                                                        {cfg.lucide}
                                                                    </div>
                                                                    {/* Content */}
                                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                                            <span style={{ fontWeight: 700, fontSize: '0.83rem', color: '#111827' }}>{cfg.label}</span>
                                                                            <span style={{ fontSize: '0.61rem', fontWeight: 700, padding: '1px 8px', borderRadius: '999px',
                                                                                background: overdue ? '#fee2e2' : '#fef3c7',
                                                                                color: overdue ? '#dc2626' : '#92400e',
                                                                                border: `1px solid ${overdue ? '#fca5a5' : '#fde68a'}`
                                                                            }}>
                                                                                {overdue ? `⚠️ ${countdown}` : `⏰ ${countdown || 'Yaklaşan'}`}
                                                                            </span>
                                                                        </div>
                                                                        {item.title && item.title !== cfg.label && (
                                                                            <div style={{ fontSize: '0.76rem', color: '#374151', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                                                                        )}
                                                                        {/* Date/time row */}
                                                                        {due && (
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '5px', fontSize: '0.72rem', color: overdue ? '#dc2626' : '#4b5563', fontWeight: 500 }}>
                                                                                <Clock size={11} />
                                                                                {due.toLocaleString('tr-TR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                                            </div>
                                                                        )}
                                                                        {/* Assignee */}
                                                                        {item.assignedToName && (
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', fontSize: '0.7rem', color: '#6366f1' }}>
                                                                                <User size={10} /> {item.assignedToName}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    {/* Action buttons */}
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); setCompletingActivity(item); setCompleteResult(''); }}
                                                                            title="Tamamlandı — Not gir"
                                                                            style={{ background: '#10b981', border: 'none', borderRadius: '6px', padding: '5px 8px', cursor: 'pointer', color: '#fff', fontWeight: 700, fontSize: '0.63rem', display: 'flex', alignItems: 'center', gap: '3px', lineHeight: 1.2 }}
                                                                        >
                                                                            <Check size={12} />
                                                                            <span>Tamamla</span>
                                                                        </button>
                                                                        <div style={{ display: 'flex', gap: '3px' }}>
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setEditingActivityId(item.id);
                                                                                    setActivityForm({
                                                                                        type: item.type || 'CALL',
                                                                                        title: item.title || '',
                                                                                        description: item.content || item.description || '',
                                                                                        dueDate: item.dueDate ? new Date(item.dueDate).toISOString().slice(0, 16) : '',
                                                                                        assignedToId: item.assignedToId || '',
                                                                                        teamId: item.teamId || '',
                                                                                        funnelStageId: ''
                                                                                    });
                                                                                    setShowActivityModal(true);
                                                                                }}
                                                                                title="Düzenle"
                                                                                style={{ flex: 1, background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '5px', padding: '4px', cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                                            >
                                                                                <Pencil size={11} />
                                                                            </button>
                                                                            <button
                                                                                onClick={(e) => { e.stopPropagation(); handleDeleteActivity(item.id); }}
                                                                                title="Sil"
                                                                                style={{ flex: 1, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '5px', padding: '4px', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                                            >
                                                                                <Trash2 size={11} />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                {/* Description text */}
                                                                {(item.content || item.description) && (
                                                                    <div style={{ marginTop: '6px', fontSize: '0.78rem', color: '#4b5563', lineHeight: 1.4, borderTop: '1px dashed #e5e7eb', paddingTop: '6px' }}>
                                                                        {item.content || item.description}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </>
                                        )}


                                        {/* GEÇMİŞ AKTİVİTELER */}
                                        {pastTimeline.length > 0 && (
                                            <>
                                                {plannedTimeline.length > 0 && (
                                                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 0 4px', borderBottom: '1px dashed #e5e7eb', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <History size={12} /> Geçmiş
                                                    </div>
                                                )}
                                                {pastTimeline.map((item) => {
                                                    const isNote = item.type === 'NOTE' && item.sourceType === 'ACTIVITY';
                                                    const isActivity = item.sourceType === 'ACTIVITY';
                                                    const isConv = item.sourceType === 'CONVERSATION';
                                                    const isEditing = editingActivity?.id === item.id;
                                                    const statusConfig = {
                                                        COMPLETED: { emoji: '✅', label: 'Tamamlandı', bg: '#dcfce7', color: '#15803d', border: '#86efac' },
                                                        CANCELLED: { emoji: '❌', label: 'İptal', bg: '#f3f4f6', color: '#6b7280', border: '#d1d5db' },
                                                        PLANNED:   { emoji: '🕜', label: 'Planlandı', bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' },
                                                    };
                                                    const sc = isActivity ? statusConfig[item.status] : null;

                                                    return (
                                                        <div
                                                            key={item.id}
                                                            className={`timeline-item ${isNote ? 'type-note' : ''}`}
                                                            style={{ position: 'relative', ...(isConv ? { cursor: 'pointer' } : {}) }}
                                                            onClick={isConv && item.conversationId ? () => {
                                                                if (onConversationOpen) {
                                                                    onConversationOpen(item.conversationId);
                                                                } else {
                                                                    setPopupConversationId(item.conversationId);
                                                                }
                                                            } : undefined}
                                                        >
                                                            {/* Row 1: Icon + Title + Status | Date + Actions */}
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                                                                    <div className={`timeline-icon type-${item.type.toLowerCase()}`}>{renderTimelineIcon(item.type)}</div>
                                                                    <span className="timeline-type-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                        {item.title || renderTimelineTypeName(item.type)}
                                                                    </span>
                                                                    {sc && (
                                                                        <span style={{ fontSize: '0.58rem', background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, borderRadius: '999px', padding: '1px 6px', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                                                            {sc.emoji} {sc.label}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                                                    <span className="timeline-time" style={{ whiteSpace: 'nowrap' }}>
                                                                        {new Date(item.date).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                                    </span>
                                                                    {isNote && (
                                                                        <div style={{ display: 'inline-flex', gap: '2px' }}>
                                                                            <button
                                                                                title="Düzenle"
                                                                                onClick={(e) => { e.stopPropagation(); setEditingActivity(item); setEditActivityText(item.content || ''); }}
                                                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#6b7280', display: 'flex', alignItems: 'center' }}
                                                                            >
                                                                                <Pencil size={12} />
                                                                            </button>
                                                                            <button
                                                                                title="Sil"
                                                                                onClick={(e) => { e.stopPropagation(); handleDeleteActivity(item.id); }}
                                                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#ef4444', display: 'flex', alignItems: 'center' }}
                                                                            >
                                                                                <Trash2 size={12} />
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Row 2: Author + Due Date + Assignee */}
                                                            {(item.labelName || item.dueDate || item.assignedToName) && (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                                                                    {item.labelName && (
                                                                        <span style={{ fontSize: '0.65rem', color: '#6b7280', background: '#f3f4f6', borderRadius: '4px', padding: '1px 5px', fontWeight: 500 }}>
                                                                            {item.labelName}
                                                                        </span>
                                                                    )}
                                                                    {item.dueDate && (
                                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.65rem', color: '#6b7280' }}>
                                                                            <Clock size={9} />
                                                                            {new Date(item.dueDate).toLocaleString('tr-TR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                                        </span>
                                                                    )}
                                                                    {item.assignedToName && (
                                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.63rem', color: '#6366f1', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '999px', padding: '1px 7px', fontWeight: 500 }}>
                                                                            <User size={8} /> {item.assignedToName}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {/* Content / Inline Edit */}
                                                            {isEditing ? (
                                                                <div style={{ marginTop: '6px' }} onClick={e => e.stopPropagation()}>
                                                                    <textarea
                                                                        value={editActivityText}
                                                                        onChange={e => setEditActivityText(e.target.value)}
                                                                        rows={3}
                                                                        style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '6px', padding: '6px 8px', fontSize: '0.82rem', resize: 'vertical', boxSizing: 'border-box' }}
                                                                        autoFocus
                                                                    />
                                                                    <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                                                                        <button onClick={handleUpdateActivity} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '5px', padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer' }}>
                                                                            <Save size={12} style={{ marginRight: '3px' }} />Kaydet
                                                                        </button>
                                                                        <button onClick={() => { setEditingActivity(null); setEditActivityText(''); }} style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '5px', padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer' }}>
                                                                            İptal
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    {isConv && item.recentMessages?.length > 0 ? (
                                                                        <div style={{ fontSize: '0.78rem', color: '#4b5563', marginTop: '4px' }}>
                                                                            {item.recentMessages.map((msg, idx) => (
                                                                                <div key={idx} style={{ display: 'flex', gap: '4px', marginBottom: '2px', lineHeight: 1.3 }}>
                                                                                    <span style={{ fontWeight: 600, color: msg.isFromContact ? '#dc2626' : '#2563eb', flexShrink: 0, fontSize: '0.72rem' }}>
                                                                                        {msg.senderName}:
                                                                                    </span>
                                                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                                        {msg.content}
                                                                                    </span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    ) : (
                                                                        <>
                                                                            {item.content && <div className="timeline-content">{item.content}</div>}
                                                                            {isNote && item.content && (() => {
                                                                                const { hasIntent, suggestedDueDate, title } = detectCallIntent(item.content);
                                                                                if (!hasIntent) return null;
                                                                                return (
                                                                                    <button
                                                                                        onClick={e => {
                                                                                            e.stopPropagation();
                                                                                            setActivityForm({
                                                                                                type: 'CALL',
                                                                                                title,
                                                                                                description: '',
                                                                                                dueDate: suggestedDueDate,
                                                                                                assignedToId: ''
                                                                                            });
                                                                                            setShowActivityModal(true);
                                                                                        }}
                                                                                        style={{ marginTop: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', borderRadius: '6px', padding: '3px 9px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}
                                                                                    >
                                                                                        📞 Arama Planla{suggestedDueDate ? ` (${new Date(suggestedDueDate).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })})` : ''}
                                                                                    </button>
                                                                                );
                                                                            })()}
                                                                        </>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </>
                                        )}

                                        {plannedTimeline.length === 0 && pastTimeline.length === 0 && !timelineLoading && (
                                            <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem', padding: '12px 0' }}>Henüz aktivite bulunmuyor.</div>
                                        )}

                                        {/* Sesli Arama Geçmişi */}
                                        {profile && currentWorkspace?.id && (
                                            <CallHistory
                                                workspaceId={currentWorkspace.id}
                                                contactId={profile.id}
                                                refreshKey={callRefreshKey}
                                            />
                                        )}
                                    </div>
                                )}
                            </div>





                            {/* Activity Modal */}
                            {showActivityModal && (
                                <div className="reminder-modal-overlay" onClick={() => { setShowActivityModal(false); setEditingActivityId(null); }}>
                                    <div className="reminder-modal" onClick={e => e.stopPropagation()}>
                                        <div className="reminder-modal-header">
                                            {renderTimelineIcon(activityForm.type)}
                                            <h3>
                                                {editingActivityId ? 'Düzenle: ' : ''}
                                                {({
                                                    'NOTE': editingActivityId ? 'Not' : 'Yeni Not Ekle',
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
                                                    placeholder="Aktivite detaylarını buraya yazın..."
                                                    rows={4}
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
                                    <button
                                        className="reminder-add-btn"
                                        onClick={() => setShowQuoteForm(true)}
                                        title="Yeni teklif oluştur"
                                    >
                                        <Plus size={16} />
                                    </button>
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
                                    <h3 className="section-title" style={{ marginBottom: 8, display: 'block' }}>KİŞİ İŞLEMLERİ</h3>

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
                                            <button
                                                className="block-btn"
                                                onClick={() => setShowDeleteConfirm(true)}
                                                style={{ width: 'auto', flex: 'none', padding: '8px 14px', minWidth: '44px' }}
                                                title="Bu Kişiyi Sil"
                                            >
                                                <Trash2 size={14} />
                                            </button>
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
                                        notes: quoteFormData.notes
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
                                        stage: 'ORDER'
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
                                        metadata: { taxRate: invoiceFormData.taxRate, subtotal: invSubtotal, tax: invTax, dueDate: invoiceFormData.dueDate }
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
            {/* Takeover Confirmation Popup */}
            {showTakeoverModal && (
                <div className="chat-popup-overlay" onClick={() => setShowTakeoverModal(false)} style={{ zIndex: 10001 }}>
                    <div onClick={e => e.stopPropagation()} style={{
                        background: '#fff', borderRadius: 16, padding: '28px 32px', maxWidth: 420, width: '90vw',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.25)', textAlign: 'center', position: 'relative'
                    }}>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                            <UserPlus size={26} style={{ color: '#ef4444' }} />
                        </div>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1f2937', marginBottom: 8 }}>Konuşmayı Üstlen</h3>
                        <p style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.6, marginBottom: 24 }}>
                            Bu konuşma henüz kimseye atanmamış.<br />Bu konuşmayı üstlenmek istiyor musunuz?
                        </p>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                            <button onClick={() => setShowTakeoverModal(false)}
                                style={{ padding: '10px 24px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', fontSize: '0.88rem', fontWeight: 600, color: '#64748b', cursor: 'pointer', transition: 'all 0.15s' }}>Hayır</button>
                            <button onClick={() => { setShowTakeoverModal(false); onTakeOver && onTakeOver(); }}
                                style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: '#ef4444', fontSize: '0.88rem', fontWeight: 600, color: '#fff', cursor: 'pointer', transition: 'all 0.15s', boxShadow: '0 2px 8px rgba(239,68,68,0.25)' }}>Evet, Üstlen</button>
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
