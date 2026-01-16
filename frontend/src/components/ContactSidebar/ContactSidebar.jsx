import { useEffect, useState } from 'react';
import { X, Phone, Mail, User, Clock, MapPin, Tag, Plus, ExternalLink, Loader, Trash2, StickyNote, ArrowRight, Sparkles, Brain, UserCheck, ChevronDown, Ban, ShieldCheck, FileText, TrendingUp, Save } from 'lucide-react';
import { facebookAPI, aiAPI, contactAPI, dealAPI, conversationAPI } from '../../services/api';
import TransferModal from '../TransferModal/TransferModal';
import './ContactSidebar.css';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

// Müşteri durumu seçenekleri
const CUSTOMER_STATUS_OPTIONS = [
    { value: 'POTENTIAL', label: 'Potansiyel', color: '#3b82f6' },
    { value: 'COMPLAINT', label: 'Şikayet', color: '#ef4444' },
    { value: 'INFO', label: 'Bilgi', color: '#f59e0b' },
    { value: 'UNREACHABLE', label: 'Ulaşılamadı', color: '#64748b' },
    { value: 'NEGOTIATING', label: 'Görüşme', color: '#8b5cf6' },
    { value: 'SPAM', label: 'Spam', color: '#6b7280' },
    { value: 'LOST', label: 'Kaybedildi', color: '#1f2937' }
];

const ContactSidebar = ({ conversationId, isOpen, members = [], onAssign, isOwner, externalProfile = null, readOnly = false }) => {
    const { currentWorkspace } = useAuth();
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
    const [newNote, setNewNote] = useState('');
    const [savingNote, setSavingNote] = useState(false);

    // If external profile is provided (e.g., for comments), use it directly
    useEffect(() => {
        if (externalProfile) {
            setProfile(externalProfile);
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
            setProfile(response.data.profile);
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

    const handleStatusChange = async (newStatus) => {
        if (!profile || !profile.id) return;
        try {
            await contactAPI.update(currentWorkspace.id, profile.id, { status: newStatus });
            setProfile(prev => ({ ...prev, status: newStatus }));
        } catch (err) {
            console.error('Status update error:', err);
            alert('Durum güncellenirken bir hata oluştu.');
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
                    {/* Profile Header */}
                    <div className="profile-header-section">
                        <div className="profile-image-container">
                            <img
                                src={profile.profile_pic || profile.profilePic || profile.avatar || profile.profile_pic_fallback || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || 'User')}&background=ef4444&color=fff&size=150`}
                                alt={profile.name}
                                className="profile-img"
                                onError={(e) => {
                                    e.target.onerror = null;
                                    // Use backend-provided fallback or generate one
                                    e.target.src = profile.profile_pic_fallback || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || 'User')}&background=ef4444&color=fff&size=150`;
                                }}
                            />
                            {/* Online indicator dummy */}
                            <span className="status-indicator"></span>
                        </div>
                        <h2 className="profile-name">{profile.name}</h2>

                        {/* Customer Status Select */}
                        <div className="customer-status-wrapper">
                            <span
                                className="status-dot"
                                style={{
                                    backgroundColor: CUSTOMER_STATUS_OPTIONS.find(o => o.value === (profile.status || 'POTENTIAL'))?.color || '#3b82f6'
                                }}
                            />
                            <span className="status-label">
                                {CUSTOMER_STATUS_OPTIONS.find(o => o.value === (profile.status || 'POTENTIAL'))?.label || 'Potansiyel'}
                            </span>
                            <ChevronDown size={14} className="select-arrow" />
                            <select
                                className="customer-status-select"
                                value={profile.status || 'POTENTIAL'}
                                onChange={(e) => handleStatusChange(e.target.value)}
                            >
                                {CUSTOMER_STATUS_OPTIONS.map(option => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="divider"></div>

                    {/* Contact Info Section */}
                    <div className="section-container">
                        <h3 className="section-title">İLETİŞİM BİLGİLERİ</h3>
                        <div className="meta-list">
                            <div className="meta-item">
                                <div className="meta-icon">
                                    <Phone size={16} />
                                </div>
                                <div className="meta-content">
                                    <span className="meta-label">Telefon</span>
                                    <input
                                        type="text"
                                        className="meta-input"
                                        value={profile.phone || ''}
                                        onChange={(e) => setProfile(prev => ({ ...prev, phone: e.target.value }))}
                                        onBlur={() => handleUpdateProfile({ phone: profile.phone })}
                                        placeholder="Telefon numarası..."
                                    />
                                </div>
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

                    <div className="divider"></div>

                    {/* Notes Section with AI Analysis */}
                    <div className="section-container ai-summary-section">
                        <div className="section-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <StickyNote size={18} style={{ color: '#f59e0b' }} />
                                <h3>NOTLAR</h3>
                            </div>
                            {!summarizing && (
                                <button
                                    className="ai-action-btn"
                                    onClick={handleGenerateSummary}
                                    title="Yapay zeka ile analiz et"
                                >
                                    <Sparkles size={14} />
                                    {summary ? 'Yenile' : 'Analiz Et'}
                                </button>
                            )}
                        </div>

                        <div className="summary-content-wrapper">
                            {/* Topic/Note Title - Always visible */}
                            <div className="topic-card">
                                <span className="topic-label">NOT BAŞLIĞI</span>
                                <input
                                    type="text"
                                    className="topic-input"
                                    value={topic}
                                    onChange={(e) => setTopic(e.target.value)}
                                    onBlur={handleSaveTopic}
                                    placeholder="Not başlığı giriniz..."
                                />
                            </div>

                            {/* AI Analysis Section - Editable textarea */}
                            {summarizing ? (
                                <div className="summarizing-loader">
                                    <Loader className="spin" size={16} />
                                    <span>Yapay zeka konuşmayı analiz ediyor...</span>
                                </div>
                            ) : (
                                <div className="summary-text-card">
                                    <span className="summary-label">Analiz</span>
                                    <textarea
                                        className="summary-textarea"
                                        value={summary}
                                        onChange={(e) => setSummary(e.target.value)}
                                        placeholder="Analiz metni veya manuel not giriniz..."
                                        rows={5}
                                    />
                                    <button
                                        className="save-note-btn"
                                        onClick={handleSaveNote}
                                        disabled={savingNote || (!topic.trim() && !summary.trim())}
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
                                </div>
                            )}


                            {/* Saved Notes List */}
                            {profile && profile.notes && (() => {
                                try {
                                    const notes = JSON.parse(profile.notes);
                                    if (Array.isArray(notes) && notes.length > 0) {
                                        return (
                                            <div className="saved-notes-list">
                                                <div className="notes-list-header">
                                                    <span>Kaydedilen Notlar</span>
                                                </div>
                                                {notes.map((note, index) => (
                                                    <div key={index} className="saved-note-item">
                                                        <button
                                                            className="delete-note-btn"
                                                            onClick={() => handleDeleteNote(index)}
                                                            disabled={savingNote}
                                                            title="Bu notu sil"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                        <div className="note-timestamp">{note.timestamp}</div>
                                                        <div className="note-content">
                                                            {note.content.split('\n').map((line, i) => {
                                                                // Bold text for **text**
                                                                if (line.startsWith('**') && line.endsWith('**')) {
                                                                    return <strong key={i}>{line.slice(2, -2)}</strong>;
                                                                }
                                                                return <p key={i}>{line}</p>;
                                                            })}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    }
                                } catch (e) {
                                    console.error('Error parsing notes:', e);
                                }
                                return null;
                            })()}
                        </div>
                    </div>

                    <div className="divider"></div>

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
                                            // Only close if empty, otherwise let user keep typing or click 'Add' (if we had a button)
                                            // Actually, better to just close on blur to be simple, but maybe delay it?
                                            // For now, keep it simple but careful.
                                            // If we are submitting, we don't want to kill it? 
                                            // But submission doesn't depend on this state being true strictly for logic.
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

                    <div className="divider"></div>

                    {/* Active Deals Section */}
                    <div className="section-container deals-section">
                        <div className="section-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <TrendingUp size={18} style={{ color: '#10b981' }} />
                                <h3>AKTİF SATIŞ</h3>
                            </div>
                            <button
                                className="ai-action-btn"
                                onClick={() => navigate('/quotes')}
                                title="Yeni teklif oluştur"
                            >
                                <Plus size={14} />
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

                    <div className="divider"></div>

                    {/* Block Contact Section */}
                    {!readOnly && profile.id && (
                        <div className="section-container block-section">
                            <h3 className="section-title">KİŞİ İŞLEMLERİ</h3>

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
    );
};

export default ContactSidebar;
