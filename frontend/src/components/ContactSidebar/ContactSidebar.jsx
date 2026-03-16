import { useEffect, useState } from 'react';
import { X, Phone, Mail, User, Clock, MapPin, Tag, Plus, ExternalLink, Loader, Trash2, StickyNote, ArrowRight, Sparkles, Brain, UserCheck, ChevronDown, Ban, ShieldCheck, FileText, TrendingUp, Save, Bell, Check, PhoneCall, MessageSquare, Zap, Calendar, History } from 'lucide-react';
import { facebookAPI, aiAPI, contactAPI, dealAPI, conversationAPI, appointmentAPI, retellAPI } from '../../services/api';
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

const ContactSidebar = ({ conversationId, isOpen, members = [], onAssign, isOwner, externalProfile = null, readOnly = false }) => {
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
    const [deals, setDeals] = useState([]);
    const [dealsLoading, setDealsLoading] = useState(false);
    const [contactConversations, setContactConversations] = useState([]);
    const [newNote, setNewNote] = useState('');
    const [savingNote, setSavingNote] = useState(false);
    const [notesExpanded, setNotesExpanded] = useState(false);
    const [expandedNotes, setExpandedNotes] = useState({});
    const [isEditingName, setIsEditingName] = useState(false);

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
        if (isOpen && conversationId && !externalProfile) {
            fetchProfile();
        }
        // Clear analysis when conversation changes
        setSummary('');
        setTopic('');
    }, [isOpen, conversationId, externalProfile]);

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

            // Fetch deals for this contact
            if (response.data.profile.id && currentWorkspace?.id) {
                fetchDeals(response.data.profile.id);
                fetchContactConversations(response.data.profile.id);
            }
        } catch (err) {
            console.error('Error fetching contact profile:', err);
            setError('Profil bilgileri alınamadı.');
        } finally {
            setLoading(false);
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
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return 'Bugün';
        if (diffDays === 1) return 'Dün';
        if (diffDays < 7) return `${diffDays} gün önce`;
        return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
    };

    const handleAddTag = async () => {
        if (!newTag.trim()) return;
        try {
            const response = await facebookAPI.addContactTag(conversationId, newTag.trim());
            setProfile(prev => ({ ...prev, tags: response.data.tags }));
            setNewTag('');
            setIsAddingTag(false);
        } catch (err) {
            console.error('Add tag error:', err);
            alert('Etiket eklenirken hata oluştu: ' + (err.response?.data?.error || err.message));
        }
    };

    const handleRemoveTag = async (tagToDelete) => {
        try {
            const response = await facebookAPI.removeContactTag(conversationId, tagToDelete);
            setProfile(prev => ({ ...prev, tags: response.data.tags }));
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

            // 1. Clear conversation aiTopic/aiSummary (since we're moving it to notes)
            await aiAPI.updateConversationAnalysis(currentWorkspace.id, conversationId, {
                topic: '',
                summary: ''
            });

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
                notes: `Conversation ID: ${conversationId}`,
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
                            {/* Profile Header — compact horizontal */}
                            <div className="profile-header-section">
                                <div className="profile-image-container">
                                    <img
                                        src={profile.profile_pic || profile.profilePic || profile.avatar || profile.profile_pic_fallback || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || 'User')}&background=ef4444&color=fff&size=80`}
                                        alt={profile.name}
                                        className="profile-img"
                                        onError={(e) => {
                                            e.target.onerror = null;
                                            e.target.src = profile.profile_pic_fallback || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || 'User')}&background=ef4444&color=fff&size=80`;
                                        }}
                                    />
                                    <span className="status-indicator"></span>
                                </div>

                                {/* Name + Status column */}
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', minWidth: 0 }}>
                                    {isEditingName ? (
                                        <input
                                            type="text"
                                            className="profile-name-input"
                                            value={profile.name || ''}
                                            onChange={(e) => setProfile(prev => ({ ...prev, name: e.target.value }))}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.target.blur();
                                                } else if (e.key === 'Escape') {
                                                    setIsEditingName(false);
                                                }
                                            }}
                                            onBlur={async () => {
                                                setIsEditingName(false);
                                                if (profile.id && profile.name?.trim()) {
                                                    try {
                                                        await contactAPI.update(currentWorkspace.id, profile.id, { name: profile.name.trim() });
                                                    } catch (err) {
                                                        console.error('Name update error:', err);
                                                    }
                                                }
                                            }}
                                            autoFocus
                                        />
                                    ) : (
                                        <h2
                                            className="profile-name editable"
                                            onClick={() => !readOnly && setIsEditingName(true)}
                                            title={readOnly ? '' : 'Düzenlemek için tıklayın'}
                                        >
                                            {profile.name}
                                        </h2>
                                    )}

                                    {/* Customer Category Select */}
                                    <div className="customer-status-wrapper">
                                        <span
                                            className="status-dot"
                                            style={{
                                                backgroundColor: CATEGORY_OPTIONS.find(o => o.value === (profile.category || 'NEW'))?.color || '#3b82f6'
                                            }}
                                        />
                                        <span className="status-label">
                                            {CATEGORY_OPTIONS.find(o => o.value === (profile.category || 'NEW'))?.label || 'Yeni'}
                                        </span>
                                        <ChevronDown size={12} className="select-arrow" />
                                        <select
                                            className="customer-status-select"
                                            value={profile.category || 'NEW'}
                                            onChange={(e) => handleStatusChange(e.target.value)}
                                        >
                                            {CATEGORY_OPTIONS.map(option => (
                                                <option key={option.value} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>


                            {/* Contact Info Section */}
                            <div className="section-container">
                                <h3 className="section-title">İLETİŞİM BİLGİLERİ</h3>
                                <div className="meta-list">
                                    <div className="meta-item">
                                        <div className="meta-icon">
                                            <Phone size={16} />
                                        </div>
                                        <div className="meta-content" style={{ flex: 1 }}>
                                            <span className="meta-label">Telefon</span>
                                            <input
                                                type="text"
                                                className="meta-input"
                                                value={profile.phone || ''}
                                                onChange={(e) => setProfile(prev => ({ ...prev, phone: e.target.value }))}
                                                onBlur={() => {
                                                    const normalized = normalizePhone(profile.phone);
                                                    setProfile(prev => ({ ...prev, phone: normalized }));
                                                    handleUpdateProfile({ phone: normalized });
                                                }}
                                                placeholder="Telefon numarası..."
                                            />
                                        </div>
                                        {profile.phone && (
                                            <button
                                                className="retell-call-btn"
                                                title="Sesli Arama"
                                                onClick={() => {
                                                    setCallScheduleMode(false);
                                                    setScheduledDateTime('');
                                                    setSelectedAgentId('');
                                                    setShowCallPopup(true);
                                                    retellAPI.getAgents(currentWorkspace.id).then(res => setRetellAgents(res.data.agents || [])).catch(() => { });
                                                }}
                                            >
                                                <PhoneCall size={14} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="meta-item">
                                        <div className="meta-icon">
                                            <Mail size={16} />
                                        </div>
                                        <div className="meta-content">
                                            <span className="meta-label">E-posta</span>
                                            <input
                                                type="email"
                                                className="meta-input"
                                                value={profile.email || ''}
                                                onChange={(e) => setProfile(prev => ({ ...prev, email: e.target.value }))}
                                                onBlur={() => handleUpdateProfile({ email: profile.email })}
                                                placeholder="E-posta adresi..."
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>


                            {/* Aksiyonlar Section */}
                            <div className="sidebar-actions">
                                <div className="section-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <svg id="fi_2774012" enableBackground="new 0 0 512 512" height="18" viewBox="0 0 512 512" width="18" xmlns="http://www.w3.org/2000/svg" fill="#10b981"><g><g><path d="m510.379 335.728-83.56-105.476c-1.466-1.849-3.688-2.925-6.077-2.84l-45.192 1.197c.329-.849.52-1.758.52-2.701v-144.413c0-.005.001-.009.001-.014 0-2.841-1.605-5.438-4.146-6.708l-60.075-30.037c-3.707-1.855-8.211-.351-10.062 3.354-1.853 3.705-.351 8.21 3.354 10.062l46.659 23.329-103.587 51.793-103.587-51.793 103.586-51.793 25.547 12.772c3.707 1.855 8.211.351 10.062-3.354 1.853-3.705.351-8.21-3.354-10.062l-28.901-14.45c-2.111-1.057-4.597-1.057-6.708 0l-120.356 60.179c-2.541 1.271-4.146 3.867-4.146 6.708 0 .014.003.028.003.042v139.75l-116.214 58.106c-2.541 1.271-4.146 3.867-4.146 6.708v.001 41.78c0 4.143 3.358 7.5 7.5 7.5s7.5-3.357 7.5-7.5v-29.646l105.357 52.679v127.66l-105.357-52.678v-62.938c0-4.143-3.358-7.5-7.5-7.5s-7.5 3.357-7.5 7.5v67.573c0 2.841 1.605 5.438 4.146 6.708l120.36 60.181c1.056.528 2.205.792 3.354.792s2.299-.264 3.354-.792l120.35-60.181c2.541-1.271 4.146-3.867 4.146-6.708v-10.708l47.247 59.639c1.425 1.799 3.592 2.843 5.879 2.843.065 0 .132-.001.198-.003l134.516-3.562c2.84-.075 5.394-1.748 6.597-4.321l18.07-38.666c1.753-3.753.133-8.217-3.619-9.971-3.754-1.752-8.217-.134-9.971 3.619l-16.107 34.467-117.75 3.118 54.048-115.652 117.75-3.118-23.087 49.402c-1.753 3.753-.133 8.217 3.619 9.971 1.027.479 2.107.707 3.171.707 2.822 0 5.525-1.602 6.8-4.326l28.225-60.396c1.201-2.574.847-5.607-.917-7.833zm-149.309-242.112v127.657l-16.295 8.151-58.549 1.551c-.018 0-.029.006-.046.007-2.732.091-5.314 1.669-6.551 4.314l-16.28 34.837-7.636 3.818v-127.657zm-120.356 52.678v127.658l-105.354-52.678v-127.657zm-112.857 88 103.584 51.794-103.584 51.793-103.586-51.794zm112.853 191.589-105.353 52.681v-127.663l105.353-52.677v20.353l-22.228 47.564c-1.203 2.574-.848 5.606.916 7.833l21.312 26.902zm66.469 34.74-73.145-92.331 54.048-115.651 73.145 92.33zm66.355-124.272-71.916-90.778 115.772-3.066 71.916 90.778z"></path><circle cx="334.793" cy="192.358" r="8.081"></circle><circle cx="334.793" cy="161.043" r="8.081"></circle><circle cx="303.478" cy="203.47" r="8.081"></circle></g></g></svg>
                                        <h3>AKSİYONLAR</h3>
                                    </div>
                                </div>
                                <div className="actions-grid">
                                    <span
                                        className="action-link action-ai-call"
                                        onClick={() => {
                                            if (!profile?.phone) return alert('Telefon numarası bulunamadı');
                                            setCallScheduleMode(false);
                                            setScheduledDateTime('');
                                            setSelectedAgentId('');
                                            setShowCallPopup(true);
                                            retellAPI.getAgents(currentWorkspace.id).then(res => setRetellAgents(res.data.agents || [])).catch(() => { });
                                        }}
                                    >
                                        <PhoneCall size={12} /> AI Call
                                    </span>
                                    <span className="action-link action-whatsapp" onClick={() => {
                                        if (!profile?.phone) return alert('Telefon numarası bulunamadı');
                                        window.open(`https://wa.me/${profile.phone.replace(/[^0-9]/g, '')}`, '_blank');
                                    }}>
                                        <svg viewBox="0 0 512 512" width="12" height="12" style={{ minWidth: '12px', minHeight: '12px' }} id="fi_733585" xmlns="http://www.w3.org/2000/svg">
                                            <path fill="currentColor" d="M256.064,0h-0.128l0,0C114.784,0,0,114.816,0,256c0,56,18.048,107.904,48.736,150.048l-31.904,95.104l98.4-31.456C155.712,496.512,204,512,256.064,512C397.216,512,512,397.152,512,256S397.216,0,256.064,0z"></path>
                                            <path fill="#fff" d="M405.024,361.504c-6.176,17.44-30.688,31.904-50.24,36.128c-13.376,2.848-30.848,5.12-89.664-19.264C189.888,347.2,141.44,270.752,137.664,265.792c-3.616-4.96-30.4-40.48-30.4-77.216s18.656-54.624,26.176-62.304c6.176-6.304,16.384-9.184,26.176-9.184c3.168,0,6.016,0.16,8.576,0.288c7.52,0.32,11.296,0.768,16.256,12.64c6.176,14.88,21.216,51.616,23.008,55.392c1.824,3.776,3.648,8.896,1.088,13.856c-2.4,5.12-4.512,7.392-8.288,11.744c-3.776,4.352-7.36,7.68-11.136,12.352c-3.456,4.064-7.36,8.416-3.008,15.936c4.352,7.36,19.392,31.904,41.536,51.616c28.576,25.44,51.744,33.568,60.032,37.024c6.176,2.56,13.536,1.952,18.048-2.848c5.728-6.176,12.8-16.416,20-26.496c5.12-7.232,11.584-8.128,18.368-5.568c6.912,2.4,43.488,20.48,51.008,24.224c7.52,3.776,12.48,5.568,14.304,8.736C411.2,329.152,411.2,344.032,405.024,361.504z"></path>
                                        </svg> WhatsApp
                                    </span>
                                    <span className="action-link action-mail" onClick={() => {
                                        if (!profile?.email) return alert('E-posta adresi bulunamadı');
                                        window.open(`mailto:${profile.email}`, '_blank');
                                    }}>
                                        <Mail size={12} /> Mail
                                    </span>
                                    <span className="action-link action-sms disabled" title="Yakında eklenecek">
                                        <MessageSquare size={12} /> SMS
                                    </span>
                                </div>
                            </div>

                            {/* Görüşme Geçmişi - Arama + Sohbet (birleşik) */}
                            <div className="call-history-section">
                                <div className="section-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <History size={18} style={{ color: '#6366f1' }} />
                                        <h3>GÖRÜŞME GEÇMİŞİ</h3>
                                    </div>
                                </div>

                                {/* Sesli Aramalar */}
                                {profile && currentWorkspace?.id && (
                                    <CallHistory
                                        workspaceId={currentWorkspace.id}
                                        contactId={profile.id}
                                        refreshKey={callRefreshKey}
                                    />
                                )}

                                {/* Sohbet Geçmişi */}
                                {contactConversations.length > 0 && (
                                    <div className="conversation-history-list" style={{ marginTop: 8 }}>
                                        {contactConversations.map(conv => (
                                            <div
                                                key={conv.id}
                                                className={`conversation-history-item ${conv.id === conversationId ? 'current' : ''}`}
                                                onClick={() => {
                                                    if (conv.id !== conversationId) {
                                                        navigate(`/inbox?conversationId=${conv.id}`);
                                                    }
                                                }}
                                                style={{ cursor: conv.id === conversationId ? 'default' : 'pointer' }}
                                            >
                                                <div className="conversation-history-info">
                                                    <span className="conversation-history-channel">
                                                        {conv.channel === 'WHATSAPP' ? '📱 WhatsApp' :
                                                            conv.channel === 'FACEBOOK' ? '💬 Facebook' :
                                                                conv.channel === 'INSTAGRAM' ? '📸 Instagram' :
                                                                    conv.channel === 'EMAIL' ? '📧 E-posta' :
                                                                        conv.channel === 'FORM' ? '📝 Web Form' :
                                                                            conv.channel === 'PHONE' ? '📞 Sesli Arama' : '💬 Sohbet'}
                                                    </span>
                                                    <span className="conversation-history-date">
                                                        {formatConversationDate(conv.lastMessageAt || conv.createdAt)}
                                                    </span>
                                                </div>
                                                <p className="conversation-history-preview">
                                                    {conv.id === conversationId ? '← Mevcut sohbet' :
                                                        conv.messages?.[0]?.content?.substring(0, 50) || 'Sohbete gitmek için tıklayın...'}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Reminder Section */}
                            <div className="section-container reminder-section">
                                <div className="section-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Bell size={14} style={{ color: '#ef4444' }} />
                                        <h3>HATIRLATICI</h3>
                                    </div>
                                    <button
                                        className="reminder-add-btn"
                                        onClick={() => {
                                            const now = new Date();
                                            now.setHours(now.getHours() + 1);
                                            now.setMinutes(0);
                                            const formatted = now.toISOString().slice(0, 16);
                                            setReminderForm(prev => ({ ...prev, reminderDate: formatted }));
                                            setShowReminderModal(true);
                                        }}
                                        title="Hatırlatıcı Ekle"
                                    >
                                        <Plus size={16} />
                                    </button>
                                </div>

                                {/* Reminder List - Contact's upcoming reminders */}
                                {profile && (
                                    <ReminderList
                                        workspaceId={currentWorkspace?.id}
                                        contactName={profile.name}
                                        contactPhone={profile.phone}
                                    />
                                )}
                            </div>

                            {/* Reminder Modal */}
                            {showReminderModal && (
                                <div className="reminder-modal-overlay" onClick={() => setShowReminderModal(false)}>
                                    <div className="reminder-modal" onClick={e => e.stopPropagation()}>
                                        <div className="reminder-modal-header">
                                            <Bell size={20} style={{ color: '#f59e0b' }} />
                                            <h3>Hatırlatıcı Oluştur</h3>
                                            <button className="reminder-modal-close" onClick={() => setShowReminderModal(false)}>
                                                <X size={18} />
                                            </button>
                                        </div>
                                        <div className="reminder-modal-body">
                                            <div className="reminder-form-group">
                                                <label><Clock size={14} /> Hatırlatma Tarihi *</label>
                                                <input
                                                    type="datetime-local"
                                                    value={reminderForm.reminderDate}
                                                    onChange={e => setReminderForm(prev => ({ ...prev, reminderDate: e.target.value }))}
                                                />
                                            </div>
                                            <div className="reminder-form-group">
                                                <label><User size={14} /> Agent Seç *</label>
                                                <select
                                                    value={reminderForm.assignedToId}
                                                    onChange={e => setReminderForm(prev => ({ ...prev, assignedToId: e.target.value }))}
                                                >
                                                    <option value="">Agent Seç</option>
                                                    {members.map(member => (
                                                        <option key={member.user?.id || member.id} value={member.user?.id || member.id}>
                                                            {(onlineUsers.get(member.user?.id || member.id)?.isOnline || member.user?.isOnline) ? '🟢' : '⚪'} {member.user?.name || member.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="reminder-form-group">
                                                <label><FileText size={14} /> Açıklama *</label>
                                                <textarea
                                                    value={reminderForm.description}
                                                    onChange={e => setReminderForm(prev => ({ ...prev, description: e.target.value }))}
                                                    placeholder="Hatırlatıcı açıklaması..."
                                                    rows={3}
                                                />
                                            </div>
                                        </div>
                                        <div className="reminder-modal-footer">
                                            <button className="btn-cancel" onClick={() => setShowReminderModal(false)}>
                                                İptal
                                            </button>
                                            <button
                                                className="btn-save"
                                                onClick={handleSaveReminder}
                                                disabled={reminderSaving}
                                            >
                                                {reminderSaving ? 'Kaydediliyor...' : 'Kaydet'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Notes Section - Compact Design */}
                            <div className="section-container notes-section">
                                <div className="section-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <StickyNote size={14} style={{ color: '#f59e0b' }} />
                                        <h3>NOTLAR</h3>
                                    </div>
                                    {!summarizing && (
                                        <button
                                            className="ai-action-btn"
                                            onClick={() => {
                                                handleGenerateSummary();
                                                setNotesExpanded(true);
                                            }}
                                            title="Yapay zeka ile analiz et"
                                        >
                                            <Sparkles size={14} color="#ffffff" className="btn-icon-white" />
                                            Analiz Et
                                        </button>
                                    )}
                                </div>

                                {/* Saved Notes List - Always Visible */}
                                {profile && profile.notes && (() => {
                                    try {
                                        const notes = JSON.parse(profile.notes);
                                        if (Array.isArray(notes) && notes.length > 0) {
                                            return (
                                                <div className="saved-notes-list" style={{ marginTop: '12px' }}>
                                                    {notes.map((note, index) => {
                                                        const lines = note.content.split('\n').filter(l => l.trim());
                                                        const title = lines[0]?.replace(/^\*\*|\*\*$/g, '') || 'Not';
                                                        const firstLine = lines[1] || '';
                                                        const hasMoreContent = lines.length > 2 || (firstLine && firstLine.length > 60);
                                                        const isExpanded = expandedNotes[index];

                                                        return (
                                                            <div
                                                                key={index}
                                                                className={`saved-note-item ${isExpanded ? 'expanded' : ''}`}
                                                                onClick={() => hasMoreContent && setExpandedNotes(prev => ({ ...prev, [index]: !prev[index] }))}
                                                                style={{ cursor: hasMoreContent ? 'pointer' : 'default' }}
                                                            >
                                                                <div className="note-header">
                                                                    <span className="note-timestamp">{note.timestamp}</span>
                                                                    <button
                                                                        className="delete-note-btn"
                                                                        onClick={(e) => { e.stopPropagation(); handleDeleteNote(index); }}
                                                                        disabled={savingNote}
                                                                        title="Bu notu sil"
                                                                    >
                                                                        <Trash2 size={12} />
                                                                    </button>
                                                                </div>
                                                                <div className="note-title">{title}</div>
                                                                {!isExpanded ? (
                                                                    <div className="note-preview">
                                                                        {firstLine.substring(0, 40)}{hasMoreContent ? ' - Tıklayın' : ''}
                                                                    </div>
                                                                ) : (
                                                                    <div className="note-content">
                                                                        {lines.slice(1).map((line, i) => (
                                                                            <p key={i}>{line}</p>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        }
                                    } catch (e) {
                                        console.error('Error parsing notes:', e);
                                    }
                                    return null;
                                })()}

                                {/* Add Note Button / Collapsible Form */}
                                {!notesExpanded ? (
                                    <button
                                        className="add-note-btn"
                                        onClick={() => setNotesExpanded(true)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            width: '100%',
                                            padding: '7px 10px',
                                            marginTop: '8px',
                                            background: '#f8fafc',
                                            border: '1px dashed #d1d5db',
                                            borderRadius: '8px',
                                            color: '#6b7280',
                                            fontSize: '0.8125rem',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <Plus size={14} />
                                        Not Ekle
                                    </button>
                                ) : (
                                    <div className="summary-content-wrapper" style={{ marginTop: '12px' }}>
                                        {summarizing ? (
                                            <div className="summarizing-loader">
                                                <Loader className="spin" size={16} />
                                                <span>Yapay zeka konuşmayı analiz ediyor...</span>
                                            </div>
                                        ) : (
                                            <>
                                                {/* Topic/Note Title */}
                                                <div className="topic-card">
                                                    <span className="topic-label">NOT BAŞLIĞI</span>
                                                    <input
                                                        type="text"
                                                        className="topic-input"
                                                        value={topic}
                                                        onChange={(e) => setTopic(e.target.value)}
                                                        placeholder="Not başlığı giriniz..."
                                                    />
                                                </div>

                                                {/* Note Content */}
                                                <div className="summary-text-card">
                                                    <span className="summary-label">İÇERİK</span>
                                                    <textarea
                                                        className="summary-textarea"
                                                        value={summary}
                                                        onChange={(e) => setSummary(e.target.value)}
                                                        placeholder="Not içeriği..."
                                                        rows={3}
                                                    />
                                                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                                        <button
                                                            className="save-note-btn"
                                                            onClick={() => {
                                                                handleSaveNote();
                                                                setNotesExpanded(false);
                                                            }}
                                                            disabled={savingNote || (!topic.trim() && !summary.trim())}
                                                            style={{ flex: 1 }}
                                                        >
                                                            {savingNote ? (
                                                                <>
                                                                    <Loader className="spin" size={14} />
                                                                    Kaydediliyor...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Save size={14} />
                                                                    Kaydet
                                                                </>
                                                            )}
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setNotesExpanded(false);
                                                                setTopic('');
                                                                setSummary('');
                                                            }}
                                                            style={{
                                                                padding: '8px 12px',
                                                                background: '#f3f4f6',
                                                                border: 'none',
                                                                borderRadius: '6px',
                                                                color: '#6b7280',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>


                            {/* Active Deals Section */}
                            <div className="section-container deals-section">
                                <div className="section-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <TrendingUp size={14} style={{ color: '#10b981' }} />
                                        <h3>AKTİF SATIŞ</h3>
                                    </div>
                                    <button
                                        className="ai-action-btn"
                                        onClick={() => navigate('/quotes')}
                                        title="Yeni teklif oluştur"
                                    >
                                        <Plus size={14} color="#ffffff" className="btn-icon-white" />
                                        Teklif
                                    </button>
                                </div>

                                <div className="deals-list-container">
                                    {dealsLoading ? (
                                        <div className="summarizing-loader">
                                            <Loader className="spin" size={14} />
                                            <span>Yükleniyor...</span>
                                        </div>
                                    ) : deals.length > 0 ? (
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
                                    ) : (
                                        <p className="summary-placeholder">
                                            Bu kişiye ait aktif satış yok.
                                        </p>
                                    )}
                                </div>
                            </div>




                            {/* Tags Section */}
                            <div className="section-container">
                                <h3 className="section-title">ETIKETLER</h3>
                                <div className="tags-list">
                                    {profile.tags && profile.tags.map((tag, i) => (
                                        <div key={i} className="tag-chip group">
                                            <Tag size={14} />
                                            <span>{tag}</span>
                                            <button
                                                onClick={() => handleRemoveTag(tag)}
                                                className="remove-tag-btn"
                                                title="Sil"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}

                                    {isAddingTag ? (
                                        <div className="add-tag-input-container">
                                            <input
                                                type="text"
                                                value={newTag}
                                                onChange={(e) => setNewTag(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        handleAddTag();
                                                    } else if (e.key === 'Escape') {
                                                        setIsAddingTag(false);
                                                        setNewTag('');
                                                    }
                                                }}
                                                placeholder="Etiket..."
                                                autoFocus
                                                onBlur={() => {
                                                    if (!newTag.trim()) setIsAddingTag(false);
                                                }}
                                            />
                                        </div>
                                    ) : (
                                        <button className="add-tag-btn" onClick={() => setIsAddingTag(true)}>
                                            <Plus size={14} />
                                            <span>Ekle</span>
                                        </button>
                                    )}
                                </div>
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
                                        <button
                                            className="block-btn"
                                            onClick={() => setShowBlockConfirm(true)}
                                        >
                                            <Ban size={14} />
                                            Bu Kişiyi Engelle
                                        </button>
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
                                {retellAgents.length > 0 && (
                                    <>
                                        <label style={{ marginTop: 12 }}>Agent</label>
                                        <select
                                            value={selectedAgentId}
                                            onChange={(e) => setSelectedAgentId(e.target.value)}
                                            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.85rem', background: '#fff' }}
                                        >
                                            <option value="">Varsayılan Agent</option>
                                            {retellAgents.map(a => (
                                                <option key={a.agent_id} value={a.agent_id}>{a.agent_name || a.agent_id}</option>
                                            ))}
                                        </select>
                                    </>
                                )}
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
