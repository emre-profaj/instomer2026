import { useEffect, useState } from 'react';
import { X, Phone, Mail, User, Clock, MapPin, Tag, Plus, ExternalLink, Loader, Trash2, StickyNote, ArrowRight, Sparkles, Brain, UserCheck, ChevronDown, Ban, ShieldCheck, FileText, TrendingUp, Save, Bell, Check, PhoneCall, MessageSquare, Zap, Calendar, History, Pencil } from 'lucide-react';
import { facebookAPI, aiAPI, contactAPI, dealAPI, conversationAPI, appointmentAPI, retellAPI, funnelAPI } from '../../services/api';
import { activityAPI } from '../../services/activity.api';
import TransferModal from '../TransferModal/TransferModal';
import CallHistory from './CallHistory';
import './ContactSidebar.css';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

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

const ContactSidebar = ({ conversationId, contactId, isOpen, members = [], onAssign, isOwner, externalProfile = null, readOnly = false, onClose, onConversationOpen }) => {
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
    const [editingActivity, setEditingActivity] = useState(null); // { id, description, title }
    const [editActivityText, setEditActivityText] = useState('');
    const [activityForm, setActivityForm] = useState({
        type: 'NOTE', // NOTE, REMINDER, MEETING, TASK
        title: '',
        description: '',
        dueDate: '',
        assignedToId: ''
    });
    const [activitySaving, setActivitySaving] = useState(false);

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
        } catch(err) {
            console.error('Fetch timeline err:', err);
        } finally {
            setTimelineLoading(false);
        }
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
                assignedToId: activityForm.assignedToId || null
            };

            await activityAPI.createActivity(profile.id, dataToSave);
            setShowActivityModal(false);
            setActivityForm({ type: 'NOTE', title: '', description: '', dueDate: '', assignedToId: '' });
            alert('Aktivite başarıyla kaydedildi.');
            fetchTimeline(profile.id); // Refresh timeline
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
        switch(type) {
            case 'WHATSAPP': return <MessageSquare size={14} />;
            case 'EMAIL': return <Mail size={14} />;
            case 'CALL': return <PhoneCall size={14} />;
            case 'NOTE': return <StickyNote size={14} />;
            case 'TASK': return <Check size={14} />;
            case 'MEETING': return <Calendar size={14} />;
            case 'REMINDER': return <Bell size={14} />;
            case 'FACEBOOK': return <MessageSquare size={14} />;
            case 'INSTAGRAM': return <MessageSquare size={14} />;
            case 'WIDGET': return <MessageSquare size={14} />;
            default: return <History size={14} />;
        }
    };

    const renderTimelineTypeName = (type) => {
        switch(type) {
            case 'WHATSAPP': return 'WhatsApp';
            case 'EMAIL': return 'E-posta';
            case 'CALL': return 'Arama';
            case 'NOTE': return 'Not';
            case 'TASK': return 'Görev';
            case 'MEETING': return 'Görüşme';
            case 'REMINDER': return 'Hatırlatıcı';
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
                                            {profile.name ? profile.name.split(' ').map(n=>n[0]).join('').slice(0, 2).toUpperCase() : '👤'}
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
                                                        try { await contactAPI.update(currentWorkspace.id, profile.id, { name: profile.name.trim() }); } catch (err) {}
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
                                            try { extraPhones = Array.isArray(profile.phones) ? profile.phones : JSON.parse(profile.phones || '[]'); } catch {}
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
                                                                    try { currentPhones = Array.isArray(prev.phones) ? [...prev.phones] : JSON.parse(prev.phones || '[]'); } catch {}
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
                                            try { extraEmails = Array.isArray(profile.emails) ? profile.emails : JSON.parse(profile.emails || '[]'); } catch {}
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
                                                                    try { currentEmails = Array.isArray(prev.emails) ? [...prev.emails] : JSON.parse(prev.emails || '[]'); } catch {}
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
                                                        try { phones = Array.isArray(profile.phones) ? [...profile.phones] : JSON.parse(profile.phones || '[]'); } catch {}
                                                        phones.push('');
                                                        setProfile(prev => ({ ...prev, phones: JSON.stringify(phones) }));
                                                        setShowExtraFields(false);
                                                    }}>
                                                        <Phone size={13} /> Telefon Ekle
                                                    </button>
                                                    <button onClick={() => {
                                                        let emails = [];
                                                        try { emails = Array.isArray(profile.emails) ? [...profile.emails] : JSON.parse(profile.emails || '[]'); } catch {}
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



                            {/* ACTION BUTTONS */}
                            <div style={{ display: 'flex', gap: '4px', padding: '8px 16px', justifyContent: 'center' }}>
                                <button className="activity-btn" style={{ flex: 1, padding: '8px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }} onClick={() => { setActivityForm({ type: 'NOTE', title: '', description: '', dueDate: '', assignedToId: '' }); setShowActivityModal(true); }}>
                                    <StickyNote size={18} />
                                    <span style={{ fontSize: '0.6rem', color: '#6b7280', fontWeight: 500 }}>Not</span>
                                </button>
                                <button className="activity-btn" style={{ flex: 1, padding: '8px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }} onClick={() => { setActivityForm({ type: 'REMINDER', title: '', description: '', dueDate: '', assignedToId: '' }); setShowActivityModal(true); }}>
                                    <PhoneCall size={18} />
                                    <span style={{ fontSize: '0.6rem', color: '#6b7280', fontWeight: 500 }}>Ara</span>
                                </button>
                                <button className="activity-btn" style={{ flex: 1, padding: '8px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }} onClick={() => { setActivityForm({ type: 'MEETING', title: '', description: '', dueDate: '', assignedToId: '' }); setShowActivityModal(true); }}>
                                    <Calendar size={18} />
                                    <span style={{ fontSize: '0.6rem', color: '#6b7280', fontWeight: 500 }}>Görüşme</span>
                                </button>
                                <button className="activity-btn" style={{ flex: 1, padding: '8px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }} onClick={() => { setActivityForm({ type: 'TASK', title: '', description: '', dueDate: '', assignedToId: '' }); setShowActivityModal(true); }}>
                                    <Check size={18} />
                                    <span style={{ fontSize: '0.6rem', color: '#6b7280', fontWeight: 500 }}>Görev</span>
                                </button>
                            </div>


                            {/* TIMELINE SECTION */}
                            <div className="activity-timeline-section">
                                <div className="timeline-title">
                                    <History size={16} /> AKTİVİTE GEÇMİŞİ
                                </div>
                                
                                {timelineLoading ? (
                                    <div className="loading-state"><Loader className="spin" size={24} /></div>
                                ) : (
                                    <div className="timeline-container">
                                        {/* PLANLANMIŞ AKTİVİTELER */}
                                        {plannedTimeline.length > 0 && (
                                            <>
                                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 0 4px', borderBottom: '1px dashed #fde68a', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Clock size={12} /> Planlanan
                                                </div>
                                                {plannedTimeline.map((item) => {
                                                    const iconClass = `timeline-icon type-${item.type.toLowerCase()}`;
                                                    return (
                                                        <div key={item.id} className="timeline-item" style={{ borderLeft: '3px solid #f59e0b', paddingLeft: '10px', background: '#fffbeb' }}>
                                                            <div className="timeline-header">
                                                                <div className="timeline-header-left">
                                                                    <div className={iconClass}>{renderTimelineIcon(item.type)}</div>
                                                                    <span className="timeline-type-name">{renderTimelineTypeName(item.type)}</span>
                                                                    <span className="timeline-author-badge">{item.labelName}</span>
                                                                </div>
                                                                <span className="timeline-time" style={{ color: '#f59e0b', fontWeight: 600 }}>
                                                                    {new Date(item.dueDate).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            </div>
                                                            {item.title && <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#92400e' }}>{item.title}</div>}
                                                            {item.content && <div className="timeline-content">{item.content}</div>}
                                                            {item.assignedToName && (
                                                                <div className="timeline-due-date" style={{ color: '#6366f1' }}>
                                                                    <User size={12} /> Atanan: {item.assignedToName}
                                                                </div>
                                                            )}
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
                                                    const isConv = item.sourceType === 'CONVERSATION';
                                                    const iconClass = `timeline-icon type-${item.type.toLowerCase()}`;
                                                    const isEditing = editingActivity?.id === item.id;
                                                    return (
                                                        <div 
                                                            key={item.id} 
                                                            className={`timeline-item ${isNote ? 'type-note' : ''}`}
                                                            style={{ position: 'relative', ...(isConv ? { cursor: 'pointer' } : {}) }}
                                                            onClick={isConv && item.conversationId ? () => {
                                                                if (onConversationOpen) {
                                                                    onConversationOpen(item.conversationId);
                                                                } else {
                                                                    navigate(`/inbox?conversationId=${item.conversationId}`);
                                                                }
                                                            } : undefined}
                                                        >
                                                            <div className="timeline-header">
                                                                <div className="timeline-header-left">
                                                                    <div className={iconClass}>{renderTimelineIcon(item.type)}</div>
                                                                    <span className="timeline-type-name">{item.title || renderTimelineTypeName(item.type)}</span>
                                                                    <span className="timeline-author-badge">{item.labelName}</span>
                                                                </div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    <span className="timeline-time">
                                                                        {new Date(item.date).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                                    </span>
                                                                    {isNote && (
                                                                        <div className="timeline-note-actions">
                                                                            <button
                                                                                title="Düzenle"
                                                                                onClick={(e) => { e.stopPropagation(); setEditingActivity(item); setEditActivityText(item.content || ''); }}
                                                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#6b7280', display: 'flex', alignItems: 'center' }}
                                                                            >
                                                                                <Pencil size={13} />
                                                                            </button>
                                                                            <button
                                                                                title="Sil"
                                                                                onClick={(e) => { e.stopPropagation(); handleDeleteActivity(item.id); }}
                                                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#ef4444', display: 'flex', alignItems: 'center' }}
                                                                            >
                                                                                <Trash2 size={13} />
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {/* Inline edit mode */}
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
                                                                    {/* Conversation: son 2 mesajı göster */}
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
                                                                        </>
                                                                    )}
                                                                </>
                                                            )}
                                                            {item.dueDate && (
                                                                <div className="timeline-due-date">
                                                                    <Clock size={12} /> Bitiş: {new Date(item.dueDate).toLocaleString('tr-TR')}
                                                                </div>
                                                            )}
                                                            {item.assignedToName && (

                                                                <div className="timeline-due-date" style={{ color: '#6366f1' }}>
                                                                    <User size={12} /> Atanan: {item.assignedToName}
                                                                </div>
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
                                <div className="reminder-modal-overlay" onClick={() => setShowActivityModal(false)}>
                                    <div className="reminder-modal" onClick={e => e.stopPropagation()}>
                                        <div className="reminder-modal-header">
                                            {activityForm.type === 'NOTE' ? <StickyNote size={20} style={{ color: '#eab308' }} /> :
                                             activityForm.type === 'TASK' ? <Check size={20} style={{ color: '#ea580c' }} /> :
                                             activityForm.type === 'MEETING' ? <Calendar size={20} style={{ color: '#2563eb' }} /> :
                                             <Bell size={20} style={{ color: '#ef4444' }} />}
                                            <h3>
                                                {activityForm.type === 'NOTE' ? 'Yeni Not Ekle' :
                                                 activityForm.type === 'TASK' ? 'Yeni Görev Ekle' :
                                                 activityForm.type === 'MEETING' ? 'Görüşme Planla' : 'Hatırlatıcı Ekle'}
                                            </h3>
                                            <button className="reminder-modal-close" onClick={() => setShowActivityModal(false)}>
                                                <X size={18} />
                                            </button>
                                        </div>
                                        <div className="reminder-modal-body">
                                            {activityForm.type !== 'NOTE' && (
                                                <div className="reminder-form-group">
                                                    <label><Clock size={14} /> Tarih / Zaman {activityForm.type === 'MEETING' ? '*' : ''}</label>
                                                    <input
                                                        type="datetime-local"
                                                        value={activityForm.dueDate}
                                                        onChange={e => setActivityForm(prev => ({ ...prev, dueDate: e.target.value }))}
                                                    />
                                                </div>
                                            )}
                                            {(activityForm.type === 'TASK' || activityForm.type === 'MEETING' || activityForm.type === 'REMINDER') && (
                                                <div className="reminder-form-group">
                                                    <label><User size={14} /> Agent'a Ata (İsteğe Bağlı)</label>
                                                    <select
                                                        value={activityForm.assignedToId}
                                                        onChange={e => setActivityForm(prev => ({ ...prev, assignedToId: e.target.value }))}
                                                    >
                                                        <option value="">Kendime / Atanmamış</option>
                                                        {members.map(member => (
                                                            <option key={member.user?.id || member.id} value={member.user?.id || member.id}>
                                                                {(onlineUsers.get(member.user?.id || member.id)?.isOnline || member.user?.isOnline) ? '🟢' : '⚪'} {member.user?.name || member.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                            {activityForm.type === 'TASK' && (
                                                <div className="reminder-form-group">
                                                    <label><FileText size={14} /> Görev Başlığı *</label>
                                                    <input
                                                        type="text"
                                                        value={activityForm.title}
                                                        placeholder="Müşteriye teklif gönderilecek vb."
                                                        onChange={e => setActivityForm(prev => ({ ...prev, title: e.target.value }))}
                                                    />
                                                </div>
                                            )}
                                            <div className="reminder-form-group">
                                                <label><FileText size={14} /> Açıklama *</label>
                                                <textarea
                                                    value={activityForm.description}
                                                    onChange={e => setActivityForm(prev => ({ ...prev, description: e.target.value }))}
                                                    placeholder="Aktivite detaylarını buraya yazın..."
                                                    rows={4}
                                                />
                                            </div>
                                        </div>
                                        <div className="reminder-modal-footer">
                                            <button className="reminder-btn-cancel" onClick={() => setShowActivityModal(false)}>İptal</button>
                                            <button className="reminder-btn-save" onClick={handleSaveActivity} disabled={activitySaving}>
                                                {activitySaving ? <Loader className="spin" size={16} /> : <Save size={16} />}
                                                Kaydet
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
                                        onClick={() => navigate('/quotes')}
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
        </>
    );
};

export default ContactSidebar;
