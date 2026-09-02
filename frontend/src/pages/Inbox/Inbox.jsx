import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { conversationAPI, facebookAPI, emailAPI, leadsAPI, workspaceAPI, aiAPI, teamAPI, automationAPI, dealAPI, appointmentAPI, contactAPI, quickReplyAPI, retellAPI, funnelAPI, caseAPI, mediaAPI } from '../../services/api';
import { activityAPI } from '../../services/activity.api';
import { io } from 'socket.io-client';
import DOMPurify from 'dompurify';
import {
    MessageSquare, MessageCircle, Facebook, Instagram, Mail, UserCheck,
    Search, User, Users, Bot, Trash2, Send, StickyNote, RefreshCw,
    Check, CheckCheck, Phone, PhoneCall, Calendar, CalendarDays, Tag, FileText, TrendingUp,
    Clock, Star, Plus, X, ExternalLink, ChevronDown, Filter,
    Inbox as InboxIcon, Image as ImageIcon, AlertCircle, Sparkles, Loader, Zap, Globe,
    UserRoundPlus, CheckCircle2, Circle, Bell, BookOpen, Edit2, Smile, KanbanSquare, MessageSquareDot, UserPlus, MapPin, Target, Briefcase, Link2, SlidersHorizontal, Paperclip
} from 'lucide-react';
import ContactSidebar from '../../components/ContactSidebar/ContactSidebar';
import ConversationPopup from '../../components/ConversationPopup/ConversationPopup';
import notificationService from '../../services/notificationService';
import { useToast } from '../../components/Toast/Toast';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useTranslation } from 'react-i18next';
import './Inbox.css';
import PipelineView from '../Pipeline/Pipeline';
import NewConversationModal from '../../components/NewConversationModal/NewConversationModal';
import OnlineUsersWidget from '../../components/OnlineUsersWidget/OnlineUsersWidget';

// Inbox item types
const INBOX_TYPES = {
    MESSAGE: 'message',
    COMMENT: 'comment',
    EMAIL: 'email'
};

// Helper to check if content is HTML
const isHtmlContent = (content) => {
    if (!content) return false;
    return /<[a-z][\s\S]*>/i.test(content);
};

// Sanitize and prepare HTML content for safe rendering
const sanitizeHtml = (html) => {
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'a', 'ul', 'ol', 'li', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img', 'blockquote', 'pre', 'code', 'hr'],
        ALLOWED_ATTR: ['href', 'target', 'src', 'alt', 'style', 'class', 'width', 'height'],
        ADD_ATTR: ['target'], // All links open in new tab
        ALLOW_DATA_ATTR: false
    });
};

// Helper function to check if message is from FORM channel
const isFormMessage = (msg, channel) => {
    return channel === 'FORM' && msg.isFromContact && msg.content?.includes('📋');
};

// Helpers to detect field types for icon assignment
const getFieldIcon = (label) => {
    const l = label.toLowerCase();
    if (l.includes('isim') || l.includes('ad') || l.includes('full name') || l.includes('name')) return '👤';
    if (l.includes('e-posta') || l.includes('email') || l.includes('mail')) return '✉️';
    if (l.includes('telefon') || l.includes('tel') || l.includes('phone') || l.includes('gsm')) return '📞';
    return null;
};

const isPrimaryField = (label) => !!getFieldIcon(label);

const isEmailValue = (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val?.trim());

const renderFormMessage = (msg, onSchedule, schedulingId) => {
    const lines = msg.content.split('\n').filter(line => line.trim());
    const formName = lines[0]?.replace(/^📋\s*/, '').replace(/\*\*/g, '').trim();
    const dataLines = lines.slice(1).filter(line => line.includes('|'));

    const fields = dataLines.map(line => {
        const idx = line.indexOf('|');
        return {
            label: line.slice(0, idx).trim(),
            value: line.slice(idx + 1).trim(),
        };
    });

    const primaryFields = fields.filter(f => isPrimaryField(f.label));
    const extraFields   = fields.filter(f => !isPrimaryField(f.label));

    return (
        <div className="lead-card-modern">
            {/* Header */}
            <div className="lead-card-header">
                <span className="lead-card-header-icon">📋</span>
                <span className="lead-card-header-label">New Lead Form</span>
            </div>

            {/* Form name */}
            {formName && (
                <div className="lead-card-form-name">
                    <span className="lead-card-form-name-icon">📄</span>
                    <span>{formName}</span>
                </div>
            )}

            {/* Primary fields */}
            {primaryFields.length > 0 && (
                <div className="lead-card-primary-fields">
                    {primaryFields.map((f, i) => (
                        <div key={i} className="lead-card-field-row">
                            <span className="lead-card-field-icon">{getFieldIcon(f.label)}</span>
                            <span className="lead-card-field-label">{f.label}:</span>
                            {isEmailValue(f.value) ? (
                                <a href={`mailto:${f.value}`} className="lead-card-email-link">{f.value}</a>
                            ) : (
                                <span className="lead-card-field-value">{f.value}</span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Extra / EK BİLGİLER */}
            {extraFields.length > 0 && (
                <div className="lead-card-extra">
                    <div className="lead-card-extra-title">
                        <span className="lead-card-extra-icon">📄</span>
                        EK BİLGİLER
                    </div>
                    {extraFields.map((f, i) => (
                        <div key={i} className="lead-card-extra-row">
                            <span className="lead-card-extra-field">{f.label}: <span className="lead-card-extra-value">{f.value}</span></span>
                        </div>
                    ))}
                </div>
            )}

            {/* Footer */}
            <div className="lead-card-footer">
                <span className="lead-card-footer-time">
                    🕐 {new Date(msg.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })} {new Date(msg.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                {parseFormPreferredTime(msg.content) && (
                    <button
                        className="lead-card-schedule-btn"
                        onClick={() => onSchedule(msg)}
                        disabled={schedulingId === msg.id}
                    >
                        📞 {schedulingId === msg.id ? 'Planlanıyor...' : 'Aramayı Planla'}
                    </button>
                )}
            </div>
        </div>
    );
};

// Parse emoji-based lead messages (from Meta/Facebook leads)
const renderLeadMessage = (msg, onSchedule, schedulingId) => {
    const lines = msg.content.split('\n');

    let formName = '';
    const primaryFields = [];   // {icon, label, value}
    const extraFields = [];     // {label, value}
    let leadDate = '';
    let inExtra = false;

    // Helper: strip WhatsApp bold markers (*text* → text)
    const stripBold = (s) => s.replace(/\*/g, '').trim();

    for (const raw of lines) {
        const line = raw.trim();
        // Skip separator lines
        if (/^[━─]{4,}/.test(line) || line === '') continue;
        // Header — skip (we render our own)
        if (line.includes('YENİ LEAD FORMU') || line.includes('YENİ LEAD') || line.includes('Manuel Kayıt')) continue;
        // Form name
        if (line.startsWith('📋')) { formName = stripBold(line.replace(/^📋\s*/, '')); continue; }
        // Primary fields
        if (line.startsWith('👤')) {
            const val = stripBold(line.replace(/^👤\s*/, '').replace(/^(\*?)(İsim|Ad Soyad):\s*(\*?)/i, ''));
            primaryFields.push({ icon: '👤', label: 'İsim', value: val });
            continue;
        }
        if (line.startsWith('📧')) {
            const val = stripBold(line.replace(/^📧\s*/, '').replace(/^(\*?)(E-posta):\s*(\*?)/i, ''));
            primaryFields.push({ icon: '✉️', label: 'E-posta', value: val });
            continue;
        }
        if (line.startsWith('📞')) {
            const val = stripBold(line.replace(/^📞\s*/, '').replace(/^(\*?)(Telefon):\s*(\*?)/i, ''));
            primaryFields.push({ icon: '📞', label: 'Telefon', value: val });
            continue;
        }
        // Topic / Subject field (Manuel Kayıt)
        if (line.startsWith('🏷️') || line.startsWith('🏷')) {
            const val = stripBold(line.replace(/^🏷️?\s*/, '').replace(/^(\*?)(Konu):\s*(\*?)/i, ''));
            primaryFields.push({ icon: '🏷️', label: 'Konu', value: val });
            continue;
        }
        // Message field (Manuel Kayıt)
        if (line.startsWith('💬')) {
            const val = stripBold(line.replace(/^💬\s*/, '').replace(/^(\*?)(Mesaj):\s*(\*?)/i, ''));
            extraFields.push({ label: 'Mesaj', value: val });
            continue;
        }
        // Ek Bilgiler header
        if (line.includes('Ek Bilgiler') || line.includes('EK BİLGİLER')) { inExtra = true; continue; }
        // Extra field lines
        if (inExtra && (line.startsWith('▸') || line.startsWith('•') || line.startsWith('-'))) {
            const text = line.replace(/^[▸•\-]\s*/, '').trim();
            const colonIdx = text.indexOf(':');
            if (colonIdx > 0) {
                extraFields.push({ label: text.slice(0, colonIdx).trim(), value: text.slice(colonIdx + 1).trim() });
            } else {
                extraFields.push({ label: text, value: '' });
            }
            continue;
        }
        // Timestamp (both 🕐 and 📅 formats)
        if (line.startsWith('🕐') || line.startsWith('📅')) { leadDate = stripBold(line.replace(/^[🕐📅]\s*/, '')); continue; }
    }

    return (
        <div className="lead-card-modern">
            {/* Header */}
            <div className="lead-card-header">
                <span className="lead-card-header-icon">{msg.content?.includes('Manuel Kayıt') ? '📝' : '📋'}</span>
                <span className="lead-card-header-label">{msg.content?.includes('Manuel Kayıt') ? 'Manuel Kayıt' : 'New Lead Form'}</span>
            </div>

            {/* Form name */}
            {formName && (
                <div className="lead-card-form-name">
                    <span className="lead-card-form-name-icon">📄</span>
                    <span>{formName}</span>
                </div>
            )}

            {/* Primary fields */}
            {primaryFields.length > 0 && (
                <div className="lead-card-primary-fields">
                    {primaryFields.map((f, i) => (
                        <div key={i} className="lead-card-field-row">
                            <span className="lead-card-field-icon">{f.icon}</span>
                            <span className="lead-card-field-label">{f.label}:</span>
                            {isEmailValue(f.value) ? (
                                <a href={`mailto:${f.value}`} className="lead-card-email-link">{f.value}</a>
                            ) : (
                                <span className="lead-card-field-value">{f.value}</span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* EK BİLGİLER */}
            {extraFields.length > 0 && (
                <div className="lead-card-extra">
                    <div className="lead-card-extra-title">
                        <span className="lead-card-extra-icon">📄</span>
                        EK BİLGİLER
                    </div>
                    {extraFields.map((f, i) => (
                        <div key={i} className="lead-card-extra-row">
                            <span className="lead-card-extra-field">
                                {f.label}{f.value ? ': ' : ''}
                                <span className="lead-card-extra-value">{f.value}</span>
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Footer with date & schedule button */}
            <div className="lead-card-footer">
                <span className="lead-card-footer-time"></span>
                {parseFormPreferredTime(msg.content) && (
                    <button
                        className="lead-card-schedule-btn"
                        onClick={() => onSchedule(msg)}
                        disabled={schedulingId === msg.id}
                    >
                        📞 {schedulingId === msg.id ? 'Planlanıyor...' : 'Aramayı Planla'}
                    </button>
                )}
            </div>
        </div>
    );
};

// Extract preferred call time from form content (e.g. "09:00-12:00")
const parseFormPreferredTime = (content) => {
    if (!content) return null;
    const match = content.match(/(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})/);
    if (!match) return null;
    return { startH: parseInt(match[1]), startM: parseInt(match[2]), endH: parseInt(match[3]), endM: parseInt(match[4]) };
};

// Lead status options
const LEAD_STATUS_OPTIONS = [
    { value: 'NEW', label: 'New', color: '#6b7280', bg: '#f3f4f6' },
    { value: 'CONTACTED', label: 'Contacted', color: '#3b82f6', bg: '#eff6ff' },
    { value: 'QUALIFIED', label: 'Qualified', color: '#8b5cf6', bg: '#f5f3ff' },
    { value: 'CONVERTED', label: 'Converted', color: '#10b981', bg: '#ecfdf5' },
    { value: 'LOST', label: 'Lost', color: '#ef4444', bg: '#fef2f2' }
];

// Conversation status options
const CONVERSATION_STATUS_OPTIONS = [
    { value: 'OPEN', label: 'Açık', color: '#3b82f6', bg: '#eff6ff', icon: '🔵' },
    { value: 'PENDING', label: 'Beklemede', color: '#f59e0b', bg: '#fffbeb', icon: '🟡' },
    { value: 'RESOLVED', label: 'Çözüldü', color: '#10b981', bg: '#ecfdf5', icon: '✅' }
];

// Customer status options
const CUSTOMER_STATUS_OPTIONS = [
    { value: 'NEW_APPLICATION', label: 'Yeni Başvuru', color: '#3b82f6' },
    { value: 'INFO_GIVEN', label: 'Bilgi Verildi', color: '#06b6d4' },
    { value: 'OPPORTUNITY', label: 'Fırsat', color: '#f59e0b' },
    { value: 'HOT_OPPORTUNITY', label: 'Sıcak Fırsat', color: '#ef4444' },
    { value: 'UNREACHABLE', label: 'Ulaşılamadı', color: '#64748b' },
    { value: 'CALLBACK', label: 'Tekrar Ara', color: '#0ea5e9' },
    { value: 'OFFER_GIVEN', label: 'Teklif Verildi', color: '#8b5cf6' },
    { value: 'APPOINTMENT_SCHEDULED', label: 'Randevu Planlandı', color: '#14b8a6' },
    { value: 'NEGOTIATION', label: 'Pazarlık', color: '#f97316' },
    { value: 'CONTRACT', label: 'Sözleşme', color: '#06b6d4' },
    { value: 'SALE_COMPLETED', label: 'Satış', color: '#10b981' },
    { value: 'LOST', label: 'Kayıp', color: '#1f2937' },
    { value: 'NOT_INTERESTED', label: 'İlgisiz', color: '#9ca3af' },
];


// Funnel tipi seçenekleri — dinamik olarak API'den yüklenir (bkz. useFunnels)
// Bu sabit boş bir fallback'tir; gerçek liste Inbox bileşeni içinde state'e yüklenir.
const FUNNEL_TYPE_OPTIONS_DEFAULT = [
    { value: '', label: 'Genel Akış', color: '#9ca3af' },
];

// Customer category options (synced with Customers page)
const CATEGORY_OPTIONS = [
    { value: 'NEW', label: 'Yeni', color: '#3b82f6' },
    { value: 'CUSTOMER', label: 'Müşteriler', color: '#10b981' },
    { value: 'OPPORTUNITY', label: 'Fırsatlar', color: '#f59e0b' },
    { value: 'VIP', label: 'VIP', color: '#8b5cf6' },
    { value: 'PARTNER', label: 'İş Ortakları', color: '#3b82f6' },
    { value: 'SPAM', label: 'Spam', color: '#ef4444' },
    { value: 'BLACKLIST', label: 'Kara Liste', color: '#1f2937' }
];

const getCategoryInfo = (category) => {
    return CATEGORY_OPTIONS.find(c => c.value === category) || CATEGORY_OPTIONS[0];
};

const getStatusInfo = (status) => {
    return LEAD_STATUS_OPTIONS.find(s => s.value === status) || LEAD_STATUS_OPTIONS[0];
};

const getConversationStatusInfo = (status) => {
    return CONVERSATION_STATUS_OPTIONS.find(s => s.value === status) || CONVERSATION_STATUS_OPTIONS[0];
};

const Inbox = () => {
    const { currentWorkspace, user, setUnreadCount, onlineUsers } = useAuth();
    const { t } = useTranslation();
    const [searchParams, setSearchParams] = useSearchParams();

    const { showAssignment } = useToast();

    // Filter states - All channels selected by default (uncheck to hide)
    const allFilters = ['whatsapp', 'facebook', 'instagram', 'web_widget', 'web_form', 'emails', 'leads', 'phone_calls', 'notes', 'fb_comments', 'ig_comments'];
    const [viewMode, setViewMode] = useState('chat'); // 'chat' | 'pipeline'
    const [activeFilters, setActiveFilters] = useState(allFilters); // All filters active by default
    const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
    const [activeChannel, setActiveChannel] = useState(null); // null, 'WHATSAPP', 'FACEBOOK', 'INSTAGRAM'
    const [searchTerm, setSearchTerm] = useState('');
    // Map sidebar URL ?tab= param to assignmentTab values
    const mapTabToAssignment = (tab) => {
        if (!tab || tab === 'all') return 'ALL';
        if (tab === 'pool') return 'MINE_OR_UNASSIGNED';
        if (tab === 'mine') return 'MINE';
        if (tab === 'unassigned') return 'PENDING';
        if (tab.startsWith('team:')) return `TEAM:${tab.split(':')[1]}`;
        return 'ALL';
    };
    
    const [assignmentTab, setAssignmentTab] = useState(() => mapTabToAssignment(searchParams.get('tab'))); // 'ALL', 'MINE_OR_UNASSIGNED', 'MINE', 'PENDING'

    // Sync URL ?tab= param to assignmentTab when sidebar navigation changes
    useEffect(() => {
        const urlTab = searchParams.get('tab');
        const mapped = mapTabToAssignment(urlTab);
        setAssignmentTab(mapped);
    }, [searchParams]);

    const [showResolved, setShowResolved] = useState(() => {
        try {
            return localStorage.getItem('inbox_showResolved') === 'true';
        } catch {
            return false;
        }
    });

    const [showArchived, setShowArchived] = useState(() => {
        try { return localStorage.getItem('inbox_showArchived') === 'true'; } catch { return false; }
    }); // Hide resolved conversations by default
    
    // Persist showResolved to localStorage when it changes
    useEffect(() => {
        try {
            localStorage.setItem('inbox_showResolved', showResolved);
        } catch (e) {
            console.error('Error saving showResolved state', e);
        }
    }, [showResolved]);

    useEffect(() => {
        localStorage.setItem('inbox_showArchived', showArchived);
    }, [showArchived]);

    // Cevapsızları gizle — müşteri hiç mesaj yazmamış conversation'ları filtrele
    const [hideUnanswered, setHideUnanswered] = useState(() => {
        try { return localStorage.getItem('inbox_hideUnanswered') === 'true'; } catch { return false; }
    });
    useEffect(() => {
        localStorage.setItem('inbox_hideUnanswered', hideUnanswered);
    }, [hideUnanswered]);
    // Toplu gönderimlerden gelen sohbetleri göster/gizle
    const [showBulk, setShowBulk] = useState(false);
    useEffect(() => {
        localStorage.setItem('inbox_showBulk', showBulk);
    }, [showBulk]);
    // Resolved post IDs (Facebook/Instagram comments) — persisted in localStorage per workspace
    const [resolvedPostIds, setResolvedPostIds] = useState(() => {
        try {
            const ws = JSON.parse(localStorage.getItem('currentWorkspace') || '{}');
            const stored = localStorage.getItem(`resolvedPosts_${ws.id}`);
            return stored ? new Set(JSON.parse(stored)) : new Set();
        } catch { return new Set(); }
    });
    const [showOnlyAssigned, setShowOnlyAssigned] = useState(false); // Filter to show only UNassigned conversations
    const [showAssignedToMe, setShowAssignedToMe] = useState(false); // Filter to show only conversations assigned to me
    const [statusFilter, setStatusFilter] = useState(null); // null = All, stage ID = filter by stage
    const [stageFilterOpen, setStageFilterOpen] = useState(false);
    const stageFilterRef = useRef(null);
    const [funnelFilter, setFunnelFilter] = useState(null); // null = All, funnel ID = filter by funnel type
    const [funnelFilterOpen, setFunnelFilterOpen] = useState(false);
    const funnelFilterRef = useRef(null);
    const [stageMegaMenuOpen, setStageMegaMenuOpen] = useState(false);
    const stageMegaMenuRef = useRef(null);
    const stageMenuDivRef = useRef(null); // fixed menü div ref
    const [stageMegaMenuPos, setStageMegaMenuPos] = useState({ top: 0, left: 0 });
    const [stageMegaMenuHoverFunnel, setStageMegaMenuHoverFunnel] = useState(null);
    const [assignMegaMenuOpen, setAssignMegaMenuOpen] = useState(false);
    const assignMegaMenuRef = useRef(null);
    const assignMenuDivRef = useRef(null); // fixed menü div ref
    const [assignMegaMenuPos, setAssignMegaMenuPos] = useState({ top: 0, left: 0 });
    const [assignSelectedTeam, setAssignSelectedTeam] = useState(null);
    const [agentFilter, setAgentFilter] = useState(null); // null = All, user ID = filter by assigned agent
    const [agentFilterOpen, setAgentFilterOpen] = useState(false);
    const agentFilterRef = useRef(null);
    const [quickFilter, setQuickFilter] = useState(null); // 'today' | 'week' | 'month' | 'unread'
    const [quickFilterOpen, setQuickFilterOpen] = useState(false);
    const quickFilterRef = useRef(null);
    const [filterPanelOpen, setFilterPanelOpen] = useState(false);
    const filterPanelRef = useRef(null);
    const [customDateStart, setCustomDateStart] = useState(null);
    const [customDateEnd, setCustomDateEnd] = useState(null);
    const [closingDropdownOpen, setClosingDropdownOpen] = useState(false);
    const closingDropdownRef = useRef(null);
    const caseLinkDropdownRef = useRef(null);

    // Funnel options — loaded dynamically from API
    const [funnelOptions, setFunnelOptions] = useState(FUNNEL_TYPE_OPTIONS_DEFAULT);
    useEffect(() => {
        if (!currentWorkspace) return;

        // Stage presets based on funnel name keywords
        const getDefaultStagesForFunnel = (name) => {
            const n = (name || '').toLowerCase();
            if (n.includes('iş baş') || n.includes('is bas') || n.includes('kariyer') || n.includes('cv') || n.includes('insan') || n.includes('başvuru')) {
                return [
                    { value: 'CV_RECEIVED', label: 'CV Alındı', color: '#3b82f6' },
                    { value: 'CV_REVIEW', label: 'CV İnceleniyor', color: '#06b6d4' },
                    { value: 'PRE_INTERVIEW', label: 'Ön Görüşme', color: '#8b5cf6' },
                    { value: 'INTERVIEW', label: 'Mülakat', color: '#f59e0b' },
                    { value: 'TECHNICAL_EVAL', label: 'Teknik Değerlendirme', color: '#f97316' },
                    { value: 'REFERENCE_CHECK', label: 'Referans Kontrolü', color: '#ec4899' },
                    { value: 'OFFER_GIVEN', label: 'Teklif Yapıldı', color: '#0ea5e9' },
                    { value: 'HIRED', label: 'İşe Alındı', color: '#10b981' },
                    { value: 'REJECTED', label: 'Reddedildi', color: '#ef4444' },
                    { value: 'WITHDREW', label: 'Vazgeçti', color: '#94a3b8' },
                ];
            }
            if (n.includes('destek') || n.includes('şikayet') || n.includes('sikayet') || n.includes('support') || n.includes('ticket')) {
                return [
                    { value: 'NEW_TICKET', label: 'Yeni Talep', color: '#3b82f6' },
                    { value: 'IN_PROGRESS', label: 'İşleniyor', color: '#f59e0b' },
                    { value: 'WAITING_CUSTOMER', label: 'Müşteri Bekleniyor', color: '#8b5cf6' },
                    { value: 'ESCALATED', label: 'Eskalasyon', color: '#ef4444' },
                    { value: 'RESOLVED', label: 'Çözüldü', color: '#10b981' },
                    { value: 'CLOSED', label: 'Kapatıldı', color: '#6b7280' },
                ];
            }
            // Default: Sales/Opportunity funnel — with Bilgi Verildi added
            return [
                { value: 'NEW_APPLICATION', label: 'Yeni Başvuru', color: '#3b82f6' },
                { value: 'INFO_GIVEN', label: 'Bilgi Verildi', color: '#06b6d4' },
                { value: 'OPPORTUNITY', label: 'Fırsat', color: '#f59e0b' },
                { value: 'HOT_OPPORTUNITY', label: 'Sıcak Fırsat', color: '#ef4444' },
                { value: 'UNREACHABLE', label: 'Ulaşılamadı', color: '#64748b' },
                { value: 'CALLBACK', label: 'Tekrar Ara', color: '#0ea5e9' },
                { value: 'OFFER_GIVEN', label: 'Teklif Verildi', color: '#8b5cf6' },
                { value: 'APPOINTMENT_SCHEDULED', label: 'Randevu Planlandı', color: '#14b8a6' },
                { value: 'NEGOTIATION', label: 'Pazarlık', color: '#f97316' },
                { value: 'CONTRACT', label: 'Sözleşme', color: '#06b6d4' },
                { value: 'SALE_COMPLETED', label: 'Satış', color: '#10b981' },
                { value: 'LOST', label: 'Kayıp', color: '#1f2937' },
                { value: 'NOT_INTERESTED', label: 'İlgisiz', color: '#9ca3af' },
            ];
        };

        funnelAPI.getAll(currentWorkspace.id).then(res => {
            const list = res.data.funnels || [];
            setFunnelOptions([
                { value: '', label: 'Genel Akış', color: '#9ca3af', stages: null, assignedTeamId: null },
                ...list.map(f => ({
                    value: f.id,
                    label: f.name,
                    color: f.color,
                    icon: f.icon,
                    assignedTeamId: f.assignedTeamId || null,
                    stages: (f.stages && f.stages.length > 0)
                        ? f.stages.map(s => ({ value: s.id, label: s.name, color: s.color, isClosing: s.isClosing || false, statusType: s.statusType || null }))
                        : getDefaultStagesForFunnel(f.name)
                }))
            ]);
        }).catch(() => {});
    }, [currentWorkspace]);

    const [appointments, setAppointments] = useState([]); // For reminder indicators
    const [totalItems, setTotalItems] = useState(0); // Total filtered items from backend
    const filterDropdownRef = useRef(null);

    const filterLabels = {
        whatsapp: 'WhatsApp',
        facebook: 'Facebook',
        instagram: 'Instagram',
        web_widget: 'Web Widget',
        web_form: 'Web Formları',
        fb_comments: 'FB Yorumları',
        ig_comments: 'IG Yorumları',
        emails: 'E-postalar',
        leads: 'Leads'
    };

    // Toggle filter function
    const toggleFilter = (filter) => {
        setActiveFilters(prev => {
            if (prev.includes(filter)) {
                return prev.filter(f => f !== filter);
            } else {
                return [...prev, filter];
            }
        });
    };



    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
                setFilterDropdownOpen(false);
            }
            if (stageFilterRef.current && !stageFilterRef.current.contains(event.target)) {
                setStageFilterOpen(false);
            }
            if (funnelFilterRef.current && !funnelFilterRef.current.contains(event.target)) {
                setFunnelFilterOpen(false);
            }
            // Koordinat bazlı outside-click — stage/assign menü backdrop ile yönetiliyor, buraya gerek yok
            if (agentFilterRef.current && !agentFilterRef.current.contains(event.target)) {
                setAgentFilterOpen(false);
            }
            if (filterPanelRef.current && !filterPanelRef.current.contains(event.target)) {
                setFilterPanelOpen(false);
            }
            if (closingDropdownRef.current && !closingDropdownRef.current.contains(event.target)) {
                setClosingDropdownOpen(false);
            }
            if (caseLinkDropdownRef.current && !caseLinkDropdownRef.current.contains(event.target)) {
                setCaseLinkDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Data states
    const [inboxItems, setInboxItems] = useState([]);

    // Local search filter applied on top of loaded inboxItems
    const displayedItems = useMemo(() => {
        let items = inboxItems;

        // Apply quick date/unread filter
        if (quickFilter) {
            const now = new Date();
            items = items.filter(item => {
                const itemDate = new Date(item.lastMessageAt || item.sortDate || item.createdAt);
                if (quickFilter === 'today') {
                    const start = new Date(now); start.setHours(0, 0, 0, 0);
                    return itemDate >= start;
                } else if (quickFilter === 'yesterday') {
                    const start = new Date(now); start.setDate(now.getDate() - 1); start.setHours(0, 0, 0, 0);
                    const end = new Date(now); end.setDate(now.getDate() - 1); end.setHours(23, 59, 59, 999);
                    return itemDate >= start && itemDate <= end;
                } else if (quickFilter === 'week') {
                    // Monday to Sunday (ISO week)
                    const day = now.getDay();
                    const diffToMonday = day === 0 ? 6 : day - 1;
                    const start = new Date(now);
                    start.setDate(now.getDate() - diffToMonday);
                    start.setHours(0, 0, 0, 0);
                    const end = new Date(start);
                    end.setDate(start.getDate() + 6);
                    end.setHours(23, 59, 59, 999);
                    return itemDate >= start && itemDate <= end;
                } else if (quickFilter === 'month') {
                    const start = new Date(now.getFullYear(), now.getMonth(), 1);
                    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
                    return itemDate >= start && itemDate <= end;
                } else if (quickFilter === 'unread') {
                    return item.unreadCount > 0;
                } else if (quickFilter === 'custom') {
                    if (customDateStart) {
                        const start = new Date(customDateStart); start.setHours(0, 0, 0, 0);
                        if (itemDate < start) return false;
                    }
                    if (customDateEnd) {
                        const end = new Date(customDateEnd); end.setHours(23, 59, 59, 999);
                        if (itemDate > end) return false;
                    }
                    return true;
                }
                return true;
            });
        }

        // Apply search term filter
        if (!searchTerm) return items;
        const term = searchTerm.toLocaleLowerCase('tr-TR');
        const trLower = (str) => (str || '').toLocaleLowerCase('tr-TR');
        return items.filter(item => {
            if (item.inboxType === INBOX_TYPES.MESSAGE || item.inboxType === INBOX_TYPES.EMAIL) {
                return trLower(item.contact?.name).includes(term) ||
                    trLower(item.contact?.fullName).includes(term) ||
                    trLower(item.contact?.email).includes(term) ||
                    (item.contact?.phone || '').includes(term) ||
                    trLower(item.contact?.instagramUsername).includes(term) ||
                    trLower(item.contact?.company).includes(term) ||
                    trLower(item.messages?.[0]?.content).includes(term);
            } else if (item.inboxType === INBOX_TYPES.COMMENT) {
                return trLower(item.message).includes(term) ||
                    trLower(item.from?.name).includes(term);
            } else if (item.inboxType === INBOX_TYPES.LEAD) {
                return trLower(item.name).includes(term) ||
                    trLower(item.email).includes(term) ||
                    (item.phone || '').includes(term);
            }
            return true;
        });
    }, [inboxItems, searchTerm, quickFilter, customDateStart, customDateEnd]);

    const [selectedItem, setSelectedItem] = useState(null);
    const [selectedItemType, setSelectedItemType] = useState(null);
    const [showContactSidebar, setShowContactSidebar] = useState(() => window.innerWidth > 768);
    const [convPopup, setConvPopup] = useState(null); // { conversationId, channel }
    const [plannedActivityMap, setPlannedActivityMap] = useState({});
    const [myCallsPopupOpen, setMyCallsPopupOpen] = useState(false);
    const [myCallsList, setMyCallsList] = useState([]);
    const [myCallsLoading, setMyCallsLoading] = useState(false);
    const [myCallsTab, setMyCallsTab] = useState('pool'); // 'pool' | 'mine'
    const [loading, setLoading] = useState(true);
    const [markingAllRead, setMarkingAllRead] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const currentPageRef = useRef(1); // Track current page with ref for immediate access

    // Bulk selection states
    const [selectedItems, setSelectedItems] = useState([]);
    const [bulkSelectMode, setBulkSelectMode] = useState(false);
    const [bulkAssigning, setBulkAssigning] = useState(false);

    // Message conversation states
    const [messages, setMessages] = useState([]);
    const [selectedActivityPopup, setSelectedActivityPopup] = useState(null);
    const [newMessage, setNewMessage] = useState('');
    const [mentionQuery, setMentionQuery] = useState('');
    const [showMentionDropdown, setShowMentionDropdown] = useState(false);
    const [mentionCursorPos, setMentionCursorPos] = useState(0);
    const [ownershipWarning, setOwnershipWarning] = useState(null);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const emojiPickerRef = useRef(null);
    const textareaRef = useRef(null);
    const [isInternalNoteMode, setIsInternalNoteMode] = useState(false);
    const [replyChannel, setReplyChannel] = useState(null); // null = use conversation's native channel, 'WHATSAPP', 'EMAIL', 'MESSENGER'
    const [showChannelMenu, setShowChannelMenu] = useState(false);
    const channelMenuRef = useRef(null);
    const [isCallNote, setIsCallNote] = useState(false);

    // Channel menu dışına tıklayınca kapat
    useEffect(() => {
        if (!showChannelMenu) return;
        const handler = (e) => {
            if (channelMenuRef.current && !channelMenuRef.current.contains(e.target)) {
                setShowChannelMenu(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showChannelMenu]);

    // AI Suggestion states
    const [aiSuggestions, setAiSuggestions] = useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Close emoji picker on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) {
                setShowEmojiPicker(false);
            }
        };
        if (showEmojiPicker) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showEmojiPicker]);


    // Comment states
    const [comments, setComments] = useState([]);
    const [posts, setPosts] = useState([]);
    const [selectedPost, setSelectedPost] = useState(null);
    const [replyText, setReplyText] = useState('');

    // Email reply states
    const [emailReplyMode, setEmailReplyMode] = useState('reply'); // 'reply' or 'note'
    const [emailCc, setEmailCc] = useState('');
    const [emailBcc, setEmailBcc] = useState('');
    const [showBcc, setShowBcc] = useState(false);

    // Shared states
    const [members, setMembers] = useState([]);
    const [teams, setTeams] = useState([]);
    const [bots, setBots] = useState([]);
    const [pages, setPages] = useState([]);


    // Bot toggle state for current conversation
    const [botEnabled, setBotEnabled] = useState(true);
    const [togglingBot, setTogglingBot] = useState(false);

    // Take over state
    const [takingOver, setTakingOver] = useState(false);

    // WhatsApp Template states
    const [templates, setTemplates] = useState([]);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [templateVariables, setTemplateVariables] = useState([]);
    const [sendingTemplate, setSendingTemplate] = useState(false);
    const [headerMediaUrl, setHeaderMediaUrl] = useState('');

    // New Conversation Modal states
    const [showNewConversationModal, setShowNewConversationModal] = useState(false);

    // Quick Reply (Hazır Mesaj) states
    const [quickReplies, setQuickReplies] = useState([]);
    const [showQuickReplyDropdown, setShowQuickReplyDropdown] = useState(false);
    const [showQuickReplyModal, setShowQuickReplyModal] = useState(false);
    const [editingQuickReply, setEditingQuickReply] = useState(null);
    const [quickReplyForm, setQuickReplyForm] = useState({ content: '' });
    const [savingQuickReply, setSavingQuickReply] = useState(false);
    // Topic Dropdown
    const [topicDropdownOpen, setTopicDropdownOpen] = useState(false);
    const [topicDropdownPos, setTopicDropdownPos] = useState({ top: 0, left: 0, width: 0 });
    // Case linking from topic
    const [caseLinkDropdownOpen, setCaseLinkDropdownOpen] = useState(false);
    const [contactCases, setContactCases] = useState([]);
    const [caseLinkLoading, setCaseLinkLoading] = useState(false);
    const [newCaseTitle, setNewCaseTitle] = useState('');
    const quickReplyDropdownRef = useRef(null);

    const messagesContainerRef = useRef(null);
    const socketRef = useRef(null);
    const loadRequestIdRef = useRef(0); // Race condition prevention for loadInboxItems
    const loadInboxItemsRef = useRef(null); // Always points to latest loadInboxItems to avoid stale closure in socket
    const selectedItemRef = useRef(null); // Always points to latest selectedItem (avoids stale closure in socket)
    const selectedItemTypeRef = useRef(null); // Always points to latest selectedItemType

    // Keep loadInboxItemsRef always pointing to the latest loadInboxItems
    useEffect(() => {
        loadInboxItemsRef.current = loadInboxItems;
    });

    // Get workspace member role - check both members array and global user role
    const workspaceMemberRole = currentWorkspace?.members?.find(m => m.userId === user?.id)?.role;
    const globalUserRole = user?.role;
    // Use workspace role first, fallback to global role (for SUPER_ADMIN who might not be in members)
    const isOwner = ['OWNER', 'SUPER_ADMIN'].includes(workspaceMemberRole) || globalUserRole === 'SUPER_ADMIN';

    // Scroll to bottom for messages
    const scrollToBottom = () => {
        if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Load support data first (pages needed for comments)
    useEffect(() => {
        if (currentWorkspace) {
            loadSupportData();
        }
    }, [currentWorkspace]);

    // Load inbox items after pages are loaded
    useEffect(() => {
        if (!currentWorkspace) return;
        // Reset to page 1 when filters change
        setCurrentPage(1);
        currentPageRef.current = 1;
        loadInboxItems(true);
    }, [currentWorkspace, activeFilters, activeChannel, assignmentTab, pages, showResolved, showArchived, showOnlyAssigned, showAssignedToMe, statusFilter, funnelFilter, agentFilter, quickFilter, hideUnanswered, showBulk]);

    // Debounced server-side search: when searchTerm changes, reload from API after 400ms
    useEffect(() => {
        if (!currentWorkspace) return;
        const debounce = setTimeout(() => {
            setCurrentPage(1);
            currentPageRef.current = 1;
            loadInboxItems();
        }, 400);
        return () => clearTimeout(debounce);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchTerm]);

    // Listen for new conversation created event
    useEffect(() => {
        const handleNewConversation = () => {
            loadInboxItems();
        };

        window.addEventListener('newConversationCreated', handleNewConversation);
        return () => window.removeEventListener('newConversationCreated', handleNewConversation);
    }, [currentWorkspace]);

    // Listen for funnel stage changes from ContactSidebar/CaseCards (right panel → left panel sync)
    useEffect(() => {
        const handleFunnelStageUpdate = (e) => {
            const { conversationId: updatedConvId, funnelStageId, stageName, stageColor } = e.detail || {};
            if (!updatedConvId || !funnelStageId) return;

            // Find which funnelType this stage belongs to
            let detectedFunnelType = null;
            for (const f of (funnelOptions || [])) {
                if ((f.stages || []).some(s => s.value === funnelStageId)) {
                    detectedFunnelType = f.value;
                    break;
                }
            }

            // Update selectedItem if it matches
            setSelectedItem(prev => {
                if (!prev || prev.id !== updatedConvId) return prev;
                return {
                    ...prev,
                    funnelStageId,
                    _effectiveStageId: funnelStageId,
                    ...(detectedFunnelType ? { funnelType: detectedFunnelType } : {})
                };
            });

            // Update inboxItems list
            setInboxItems(prev => prev.map(item =>
                item.id === updatedConvId
                    ? {
                        ...item,
                        funnelStageId,
                        _effectiveStageId: funnelStageId,
                        ...(detectedFunnelType ? { funnelType: detectedFunnelType } : {})
                    }
                    : item
            ));
        };

        window.addEventListener('websocket:funnel_stage_updated', handleFunnelStageUpdate);
        return () => window.removeEventListener('websocket:funnel_stage_updated', handleFunnelStageUpdate);
    }, [funnelOptions]);

    // Case title sidebar'dan değiştiğinde Inbox topic'ini de güncelle
    useEffect(() => {
        const handler = (e) => {
            const { conversationId: convId, title } = e.detail || {};
            if (!convId || !title) return;
            setSelectedItem(prev => prev?.id === convId ? { ...prev, aiTopic: title } : prev);
            setInboxItems(prev => prev.map(item => item.id === convId ? { ...item, aiTopic: title } : item));
        };
        window.addEventListener('case_title_updated', handler);
        return () => window.removeEventListener('case_title_updated', handler);
    }, []);

    // Case updated from sidebar — sync status/assignment/funnel to conversation header
    useEffect(() => {
        const handleCaseUpdated = (e) => {
            const { caseId, changes } = e.detail || {};
            if (!caseId || !changes) return;

            // Build updates for conversation fields AND embedded case object
            const buildUpdates = (item) => {
                const updates = {};
                if (changes.funnelType !== undefined) updates.funnelType = changes.funnelType;
                if (changes.funnelStageId !== undefined) {
                    updates.funnelStageId = changes.funnelStageId;
                    updates._effectiveStageId = changes.funnelStageId;
                }
                if (changes.title !== undefined) updates.aiTopic = changes.title;
                if (changes.status === 'CLOSED' || changes.status === 'WON' || changes.status === 'LOST') {
                    updates.status = 'RESOLVED';
                    updates.closingStatus = changes.status; // WON/LOST/CLOSED — Case'ten gelen durum
                } else if (changes.status === 'ACTIVE') {
                    updates.status = 'OPEN';
                    updates.closingStatus = null; // Yeniden açıldı, kapanış durumu temizlendi
                }
                // Sync the embedded case object so UI always reflects latest case state
                if (item.case) {
                    updates.case = { ...item.case, ...changes };
                }
                return updates;
            };

            // Update all conversations linked to this case
            setInboxItems(prev => prev.map(item => {
                if (item.caseId !== caseId) return item;
                const updates = buildUpdates(item);
                return Object.keys(updates).length > 0 ? { ...item, ...updates } : item;
            }));

            // Update selected item if linked to this case
            setSelectedItem(prev => {
                if (!prev || prev.caseId !== caseId) return prev;
                const updates = buildUpdates(prev);
                return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
            });
        };

        const handleCaseAssignment = (e) => {
            const { caseId, assignedToId, assignedTeamId, assignedToName } = e.detail || {};
            if (!caseId) return;

            const buildAssignUpdates = () => {
                const updates = {};
                if (assignedToId !== undefined) {
                    updates.assignedToId = assignedToId;
                    if (assignedToName) {
                        updates.assignedTo = { name: assignedToName };
                    }
                }
                if (assignedTeamId !== undefined) {
                    updates.assignedTeamId = assignedTeamId;
                    updates.teamIds = assignedTeamId ? JSON.stringify([assignedTeamId]) : '[]';
                }
                return updates;
            };

            setInboxItems(prev => prev.map(item => {
                if (item.caseId !== caseId) return item;
                const updates = buildAssignUpdates();
                // Nested case objesini de güncelle (header linkedCase'den okuyor)
                if (item.case) {
                    updates.case = {
                        ...item.case,
                        assignedToId: assignedToId !== undefined ? assignedToId : item.case.assignedToId,
                        assignedTeamId: assignedTeamId !== undefined ? assignedTeamId : item.case?.assignedTeamId,
                        ...(assignedToName ? { assignedTo: { ...(item.case.assignedTo || {}), name: assignedToName } } : {})
                    };
                }
                return Object.keys(updates).length > 0 ? { ...item, ...updates } : item;
            }));

            setSelectedItem(prev => {
                if (!prev || prev.caseId !== caseId) return prev;
                const updates = buildAssignUpdates();
                // Nested case objesini de güncelle
                if (prev.case) {
                    updates.case = {
                        ...prev.case,
                        assignedToId: assignedToId !== undefined ? assignedToId : prev.case.assignedToId,
                        assignedTeamId: assignedTeamId !== undefined ? assignedTeamId : prev.case?.assignedTeamId,
                        ...(assignedToName ? { assignedTo: { ...(prev.case.assignedTo || {}), name: assignedToName } } : {})
                    };
                }
                return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
            });
        };

        window.addEventListener('websocket:case_updated', handleCaseUpdated);
        window.addEventListener('websocket:case_assignment_updated', handleCaseAssignment);
        return () => {
            window.removeEventListener('websocket:case_updated', handleCaseUpdated);
            window.removeEventListener('websocket:case_assignment_updated', handleCaseAssignment);
        };
    }, []);

    // URL ?tab= parametresinden assignment tab'ı oku ve set et
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (!tab || tab === 'all') {
            setAssignmentTab('ALL');
        } else if (tab === 'mine') {
            setAssignmentTab('MINE');
        } else if (tab === 'unassigned') {
            setAssignmentTab('PENDING');
        } else if (tab === 'pool') {
            setAssignmentTab('MINE_OR_UNASSIGNED');
        } else if (tab.startsWith('team:')) {
            setAssignmentTab(tab.toUpperCase()); // 'TEAM:xxx-id'
        }
    }, [searchParams]);

    // Handle conversationId from URL query params
    const inboxItemsRef = useRef(inboxItems);
    inboxItemsRef.current = inboxItems;

    useEffect(() => {
        const conversationId = searchParams.get('conversationId');
        const contactId = searchParams.get('contactId');
        if (!conversationId && !contactId) return;

        if (conversationId && currentWorkspace) {
            // Force switch to chat mode to ensure the UI becomes visible (e.g., when navigated from pipeline view)
            setViewMode('chat');
            
            // First check if it's already in loaded items
            const targetItem = inboxItemsRef.current.find(item => item.id === conversationId);
            if (targetItem) {
                handleSelectItem(targetItem);
                setSearchParams({}, { replace: true });
            } else {
                // Conversation not in loaded list — fetch it directly from API
                (async () => {
                    try {
                        const response = await conversationAPI.getById(currentWorkspace.id, conversationId);
                        const conv = response.data?.conversation || response.data;
                        if (conv && conv.id) {
                            const itemType = conv.channel === 'EMAIL' ? INBOX_TYPES.EMAIL : INBOX_TYPES.MESSAGE;
                            const injectedItem = {
                                ...conv,
                                inboxType: itemType,
                            };
                            setInboxItems(prev => {
                                if (prev.some(i => i.id === injectedItem.id)) return prev;
                                return [injectedItem, ...prev];
                            });
                            
                            // Let the standard handler take care of fetching messages, setting sidebar, and updating types
                            handleSelectItem(injectedItem);
                            setSearchParams({}, { replace: true });
                        }
                    } catch (err) {
                        console.error('Error fetching conversation by ID:', err);
                    }
                })();
            }
        } else if (contactId && inboxItemsRef.current.length > 0) {
            // Find the first conversation for this contact
            const targetItem = inboxItemsRef.current.find(item => item.contactId === contactId || item.contact?.id === contactId);
            if (targetItem) {
                handleSelectItem(targetItem);
                setSearchParams({}, { replace: true });
            }
        }
    }, [searchParams, currentWorkspace]);

    // Separate effect for contactId deep-link: needs to wait until inboxItems are loaded
    useEffect(() => {
        const contactId = searchParams.get('contactId');
        if (!contactId || inboxItems.length === 0) return;
        const targetItem = inboxItems.find(item => item.contactId === contactId || item.contact?.id === contactId);
        if (targetItem) {
            handleSelectItem(targetItem);
            setSearchParams({}, { replace: true }); // Clears contactId → effect won't re-fire
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inboxItems.length, searchParams]);




    // Load quick replies
    useEffect(() => {
        const loadQuickReplies = async () => {
            if (!currentWorkspace) return;
            try {
                const res = await quickReplyAPI.getAll(currentWorkspace.id);
                setQuickReplies(res.data);
            } catch (err) {
                console.error('Error loading quick replies:', err);
            }
        };
        loadQuickReplies();
    }, [currentWorkspace]);

    // Close quick reply dropdown on outside click
    useEffect(() => {
        const handleClickOutsideQR = (e) => {
            if (quickReplyDropdownRef.current && !quickReplyDropdownRef.current.contains(e.target)) {
                setShowQuickReplyDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutsideQR);
        return () => document.removeEventListener('mousedown', handleClickOutsideQR);
    }, []);

    // Load appointments for reminder indicators
    useEffect(() => {
        const loadAppointments = async () => {
            if (!currentWorkspace) return;
            try {
                const now = new Date();
                const pastDate = new Date();
                pastDate.setDate(pastDate.getDate() - 30); // Include past 30 days for overdue reminders
                const futureDate = new Date();
                futureDate.setMonth(futureDate.getMonth() + 3);

                const response = await appointmentAPI.getAll(currentWorkspace.id, {
                    startDate: pastDate.toISOString(), // Include past appointments
                    endDate: futureDate.toISOString()
                });
                // Filter out completed and cancelled appointments
                const activeAppointments = (response.data.appointments || []).filter(apt => apt.status === 'SCHEDULED');
                setAppointments(activeAppointments);
            } catch (err) {
                console.error('Load appointments error:', err);
            }
        };
        loadAppointments();
    }, [currentWorkspace]);


    // =====================================================================
    // CHAT CALL DETECTION — frontend-driven, no server webhook needed
    // Detects "beni ara", "saat 15:00 de ara" etc. in incoming contact messages
    // NOT triggered by form data (e.g. "Sizi Ne Zaman Arayalım?: 12:00-15:00")
    // =====================================================================
    const detectCallIntentFrontend = useCallback((text) => {
        if (!text || typeof text !== 'string') return null;
        const t = text.toLowerCase().trim();
        const now = new Date();

        // === SKIP STRUCTURED FORM DATA ===
        // Form messages have multiple "Label?: value" lines — not real call requests
        const formLineCount = (text.match(/[a-zA-ZçğıöşüÇĞİÖŞÜ\s]+\?:\s/g) || []).length;
        if (formLineCount >= 2) return null;

        let scheduledAt = null;

        // === CHECK FOR SPECIFIC TIME FIRST ===
        const timeMatch = t.match(/(?:saat\s+)?(\d{1,2})[:\.](\d{2})(?:\s*(?:de|da|te|ta|'de|'da|'te|'ta))?/);
        if (timeMatch) {
            const h = parseInt(timeMatch[1]), m = parseInt(timeMatch[2]);
            if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
                const target = new Date();
                target.setHours(h, m, 0, 0);
                if (target <= now) target.setDate(target.getDate() + 1);
                if (t.includes('yarın')) target.setDate(now.getDate() + 1);
                scheduledAt = target;
            }
        }
        if (!scheduledAt) {
            const hourOnly = t.match(/(?:saat\s+)(\d{1,2})(?:'[a-zçğıöşü]+|\s+de|\s+da|\s+te|\s+ta)/);
            if (hourOnly) {
                const h = parseInt(hourOnly[1]);
                if (h >= 0 && h <= 23) {
                    const target = new Date();
                    target.setHours(h, 0, 0, 0);
                    if (target <= now) target.setDate(target.getDate() + 1);
                    if (t.includes('yarın')) target.setDate(now.getDate() + 1);
                    scheduledAt = target;
                }
            }
        }

        // For scheduled calls: require an EXPLICIT directed request (not passive "arayalım")
        const hasExplicitCallRequest = /\bbeni\s+ara\b|\bbeni\s+arayın\b|\barayın\b|\barar\s+mısınız\b|\barar\s+mısın\b|\barayabilir\s+misiniz\b|\barayabilir\s+misin\b|\bcall\s+me\b|\bplease\s+call\b/.test(t);
        if (scheduledAt && hasExplicitCallRequest) return { type: 'scheduled', scheduledAt };

        // === IMMEDIATE CALL KEYWORDS (no time found) ===
        const immediatePatterns = [
            /\bbeni\s+ara\b/, /\bbeni\s+arayın\b/, /\bbeni\s+arar\s+mısınız\b/, /\bbeni\s+arar\s+mısın\b/,
            /\bbeni\s+arayabilir\s+misiniz\b/, /\bbeni\s+arayabilir\s+misin\b/,
            /\bhemen\s+ara\b/, /\bhemen\s+arayın\b/, /\bşimdi\s+ara\b/, /\bşimdi\s+arayın\b/,
            /\blütfen\s+ara\b/, /\blütfen\s+arayın\b/, /\blütfen\s+arar\s+mısınız\b/,
            /\barayabilir\s+misiniz\b/, /\barayabilir\s+misin\b/,
            /\barar\s+mısınız\b/, /\barar\s+mısın\b/, /\barar\s+misiniz\b/,
            /\baramı\s+bekle\b/, /\baramı\s+bekleyin\b/,
            /\btelefon\s+et\b/, /\btelefon\s+eder\s+misiniz\b/, /\btelefon\s+eder\s+misin\b/,
            /\btelefon\s+açar\s+mısınız\b/, /\btelefon\s+açar\s+mısın\b/,
            /\btelefonla\s+ara\b/, /\btelefonla\s+arayın\b/,
            /\bcall\s+me\b/, /\bcall\s+now\b/, /\bplease\s+call\b/, /\bgive\s+me\s+a\s+call\b/,
            /\bcan\s+you\s+call\b/, /\bcould\s+you\s+call\b/, /\bphone\s+me\b/,
        ];
        for (const p of immediatePatterns) { if (p.test(t)) return { type: 'immediate' }; }
        return null;
    }, []);

    // WebSocket for real-time updates
    useEffect(() => {
        if (!currentWorkspace) return;

        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5008';
        const socketUrl = API_URL.replace('/api', '');

        const socket = io(socketUrl, {
            transports: ['polling', 'websocket'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('✅ Inbox WebSocket connected, workspace:', currentWorkspace?.id);
            // Join workspace room to receive workspace-specific events
            if (currentWorkspace?.id) {
                socket.emit('join_workspace', currentWorkspace.id);
                console.log('🚪 Inbox joined workspace room:', currentWorkspace.id);
            }
            // Join user room for personal notifications
            if (user?.id) {
                socket.emit('join_user', user.id);
                console.log('👤 Inbox joined user room:', user.id);
            }
        });

        // Listen for new conversations (e.g., from Widget)
        socket.on('new_conversation', (data) => {
            console.log('📥 new_conversation event received:', data);
            if (currentWorkspace && data.workspaceId === currentWorkspace.id) {
                console.log('✅ new_conversation - reloading inbox items');
                if (loadInboxItemsRef.current) loadInboxItemsRef.current(false);
            }
        });

        socket.on('new_message', (data) => {
            console.log('📥 new_message event received:', data);
            if (currentWorkspace && data.workspaceId === currentWorkspace.id) {
                console.log('✅ new_message - workspace match, reloading');
                if (loadInboxItemsRef.current) loadInboxItemsRef.current(false);

                // Add message to chat if conversation is open (use refs to avoid stale closure)
                const currentSelectedItem = selectedItemRef.current;
                const currentSelectedItemType = selectedItemTypeRef.current;
                if (currentSelectedItem?.id === data.conversationId && currentSelectedItemType === INBOX_TYPES.MESSAGE) {
                    // Add message if it's from contact OR if it's a bot/system message OR if it's from another agent
                    if (data.message?.isFromContact || !data.message?.senderId || data.message?.senderId !== user?.id) {
                        setMessages(prev => {
                            if (prev.some(m => m.id === data.message.id)) return prev;
                            return [...prev, data.message];
                        });

                        // Only decrement unread for incoming messages
                        if (data.message?.isFromContact) {
                            setUnreadCount(prev => Math.max(0, prev - 1));
                        }
                    }
                }

                // Browser notifications are now handled globally in ToastProvider (Toast.jsx)


            } else {
                console.log('⚠️ new_message - workspace mismatch:', data.workspaceId, 'vs', currentWorkspace?.id);
            }
        });

        socket.on('new_comment', (data) => {
            if (currentWorkspace && data.workspaceId === currentWorkspace.id) {
                if (loadInboxItemsRef.current) loadInboxItemsRef.current(false);

                // Show browser notification for new comments (only for admins/owners)
                const isManager = ['OWNER', 'ADMIN', 'SUPER_ADMIN'].includes(workspaceMemberRole) || user?.role === 'SUPER_ADMIN';
                if (document.hidden && isManager) {
                    notificationService.showNotification('💬 Yeni Yorum', {
                        body: data.comment?.message?.substring(0, 100) || 'Yeni bir yorum geldi',
                        tag: `comment-${data.comment?.id}`,
                        data: { url: '/inbox' }
                    });
                }
            }
        });

        socket.on('new_lead', (data) => {
            if (currentWorkspace && data.workspaceId === currentWorkspace.id) {
                if (loadInboxItemsRef.current) loadInboxItemsRef.current(false);

                // Show browser notification for new leads (only for admins/owners or assigned agent)
                const isManager = ['OWNER', 'ADMIN', 'SUPER_ADMIN'].includes(workspaceMemberRole) || user?.role === 'SUPER_ADMIN';
                const isAssigned = data.assignedToId === user?.id;
                if (document.hidden && (isManager || isAssigned)) {
                    notificationService.showNotification('🎯 Yeni Lead', {
                        body: data.lead?.name || 'Yeni bir potansiyel müşteri',
                        tag: `lead-${data.lead?.id}`,
                        data: { url: '/inbox' }
                    });
                }
            }
        });

        socket.on('new_email', (data) => {
            if (currentWorkspace && data.workspaceId === currentWorkspace.id) {
                if (loadInboxItemsRef.current) loadInboxItemsRef.current(false);

                // Show browser notification for new emails (only for admins/owners or assigned agent)
                const isManager = ['OWNER', 'ADMIN', 'SUPER_ADMIN'].includes(workspaceMemberRole) || user?.role === 'SUPER_ADMIN';
                const isAssigned = data.assignedToId === user?.id;
                if (document.hidden && (isManager || isAssigned)) {
                    notificationService.showNotification('📧 Yeni E-posta', {
                        body: data.email?.subject || 'Yeni bir e-posta geldi',
                        tag: `email-${data.email?.id}`,
                        data: { url: '/inbox' }
                    });
                }
            }
        });

        // Listen for message status updates (delivered, read)
        socket.on('message_status', (data) => {
            console.log('📊 Message status update:', data);
            const { messageId, dbMessageId, conversationId, status } = data;

            // Only update if this is for the currently selected conversation
            if (selectedItem?.id === conversationId) {
                setMessages(prev => prev.map(msg => {
                    // Match by database ID, WhatsApp message ID, or Facebook message ID
                    if (msg.id === dbMessageId ||
                        msg.whatsappMessageId === messageId ||
                        msg.facebookMessageId === messageId) {
                        console.log(`✅ Updating message ${msg.id} status to ${status}`);
                        return { ...msg, status };
                    }
                    return msg;
                }));
            }
        });

        // Listen for conversation takeover events
        socket.on('conversation_taken_over', (data) => {
            console.log('👤 Conversation taken over:', data);
            const { conversationId, assignedToId, assignedToName, botEnabled } = data;

            // Bu konuşma artık başka birine atandı - listeden çıkar veya güncelle
            setInboxItems(prev => prev.map(item =>
                item.id === conversationId
                    ? {
                        ...item,
                        assignedToId,
                        assignedTo: { id: assignedToId, name: assignedToName },
                        botEnabled
                    }
                    : item
            ));

            // Eğer şu an bu konuşma seçiliyse ve başka biri üstlendiyse
            if (selectedItem?.id === conversationId && assignedToId !== user?.id) {
                setBotEnabled(botEnabled);
                setSelectedItem(prev => ({
                    ...prev,
                    assignedToId,
                    assignedTo: { id: assignedToId, name: assignedToName },
                    botEnabled
                }));
            }
        });

        // Listen for channel routing applied
        socket.on('conversation_routing_applied', (data) => {
            console.log('📡 Routing applied:', data);
            // Ekip ataması yapıldığında inbox'ı yenile
            if (loadInboxItemsRef.current) loadInboxItemsRef.current(false);
        });

        // Listen for new conversation assigned to team
        socket.on('new_conversation_assigned', (data) => {
            console.log('📥 New conversation assigned:', data);
            // Eğer bu kullanıcı atanan ekipte ise, inbox'ı yenile
            if (loadInboxItemsRef.current) loadInboxItemsRef.current(false);
        });

        // Listen for conversation assigned to current user - refresh inbox
        socket.on('conversation_assigned_to_you', (data) => {
            console.log('📬 Conversation assigned to you:', data);
            // Inbox'ı yenile ama tab değiştirme — kullanıcı hangi tab'taysa orda kalsın
            // (Toast ve browser bildirimleri ToastProvider tarafından merkezi yönetilir)
            if (loadInboxItemsRef.current) loadInboxItemsRef.current(false);
        });

        // Listen for general conversation assignment updates
        socket.on('conversation_assigned', (data) => {
            console.log('📋 Conversation assigned:', data);
            const { conversationId, assignedToId, assignedToName, botEnabled, teamIds, funnelType, funnelStageId, status } = data;
            let firstTeamId = null;
            try {
                if (teamIds) firstTeamId = JSON.parse(teamIds)[0] || null;
            } catch {}

            // Update local state instead of reloading to preserve pagination
            setInboxItems(prev => prev.map(item =>
                item.id === conversationId
                    ? {
                        ...item,
                        assignedToId,
                        teamIds: teamIds !== undefined ? teamIds : item.teamIds,
                        assignedTo: assignedToId ? { id: assignedToId, name: assignedToName } : null,
                        case: item.case ? {
                            ...item.case,
                            assignedToId,
                            assignedTo: assignedToId ? { id: assignedToId, name: assignedToName } : null,
                            ...(firstTeamId !== null ? { assignedTeamId: firstTeamId } : {})
                        } : item.case,
                        ...(botEnabled !== undefined ? { botEnabled } : {}),
                        ...(funnelType !== undefined ? { funnelType } : {}),
                        ...(funnelStageId !== undefined ? { funnelStageId, _effectiveStageId: funnelStageId } : {}),
                        ...(status !== undefined ? { status } : {})
                    }
                    : item
            ));

            // Seçili konuşmayı güncelle
            if (selectedItemRef.current?.id === conversationId) {
                setSelectedItem(prev => ({
                    ...prev,
                    assignedToId,
                    teamIds: teamIds !== undefined ? teamIds : prev.teamIds,
                    assignedTo: assignedToId ? { id: assignedToId, name: assignedToName } : null,
                    case: prev.case ? {
                        ...prev.case,
                        assignedToId,
                        assignedTo: assignedToId ? { id: assignedToId, name: assignedToName } : null,
                        ...(firstTeamId !== null ? { assignedTeamId: firstTeamId } : {})
                    } : prev.case,
                    ...(botEnabled !== undefined ? { botEnabled } : {}),
                    ...(funnelType !== undefined ? { funnelType } : {}),
                    ...(funnelStageId !== undefined ? { funnelStageId, _effectiveStageId: funnelStageId } : {}),
                    ...(status !== undefined ? { status } : {})
                }));
                if (botEnabled !== undefined) setBotEnabled(botEnabled);
            }
        });

        socket.on('case_assignment_updated', (data) => {
            console.log('📋 Case assignment updated via socket:', data);
            window.dispatchEvent(new CustomEvent('websocket:case_assignment_updated', { detail: data }));
        });


        // Listen for bot handoff - when bot can't answer and escalates to team
        socket.on('bot_handoff', (data) => {
            console.log('🔄 Bot handoff received:', data);
            const { conversationId, botName } = data;

            // Update local state instead of reloading to preserve pagination
            setInboxItems(prev => prev.map(item =>
                item.id === conversationId
                    ? { ...item, botEnabled: false }
                    : item
            ));

            // Update selected conversation if it's the one being handed off
            if (selectedItem?.id === conversationId) {
                setSelectedItem(prev => ({
                    ...prev,
                    botEnabled: false
                }));
                setBotEnabled(false);
            }

            // Show notification only if assigned to current user, or if admin/owner
            const isAssignedToMe = data.assignedToId === user?.id;
            const isManager = ['OWNER', 'ADMIN', 'SUPER_ADMIN'].includes(workspaceMemberRole) || user?.role === 'SUPER_ADMIN';
            if ((isAssignedToMe || (isManager && !data.assignedToId)) && Notification.permission === 'granted') {
                new Notification('Bot Yönlendirmesi', {
                    body: data.message || `${botName} müşteriye yardımcı olamadı. Sohbet aktarıldı.`,
                    icon: '/favicon.ico'
                });
            }
        });

        // Listen for real-time system events (assign, status, funnel change, etc.)
        socket.on('conversation_event', (data) => {
            const { conversationId, event } = data;
            // Only add to timeline if this conversation is currently open
            if (selectedItemRef.current?.id === conversationId && event) {
                setMessages(prev => {
                    // Prevent duplicate events
                    if (prev.some(m => m.id === event.id)) return prev;
                    return [...prev, {
                        id: event.id,
                        createdAt: event.createdAt,
                        isSystemEvent: true,
                        eventType: event.eventType,
                        title: event.title,
                        actorType: event.actorType,
                        actorId: event.actorId,
                        details: event.details
                    }];
                });
            }
        });

        // Listen for backend-created activities (auto call planning, etc.)
        // Updates the inbox badge icons in real-time without page refresh
        socket.on('activity_created', (data) => {
            const labels = { CALL: '📞 Arama notu', TASK: '✅ Görev', MEETING: '🤝 Görüşme', NOTE: '📝 Not', REMINDER: '🔔 Hatırlatıcı' };
            const label = labels[data.type] || '📋 Aktivite';
            console.log(`🔔 [Aktivite] ${label}: ${data.createdByName} → ${data.contactName}`);

            const { contactId, type, status, dueDate } = data;
            if (!contactId || !type) return;
            setPlannedActivityMap(prev => {
                const existing = prev[contactId] || [];
                const alreadyExists = existing.find(e => e.type === type);
                if (alreadyExists) {
                    return {
                        ...prev,
                        [contactId]: existing.map(e =>
                            e.type === type ? { ...e, status: status || 'PLANNED', dueDate: dueDate || e.dueDate } : e
                        )
                    };
                }
                return {
                    ...prev,
                    [contactId]: [...existing, { type, status: status || 'PLANNED', dueDate }]
                };
            });
        });

        socket.on('activity_assigned', (data) => {
            if (data.assignedToId === user?.id) {
                console.log(`🔔 [Atama] ${data.assignedByName} size görev atadı: ${data.contactName}`);
            }
        });

        socket.on('activity_completed', (data) => {
            console.log(`✅ [Tamamlandı] ${data.completedByName}: ${data.type}`);
        });

        socket.on('conversation_archived', (data) => {
            if (!showArchived) {
                loadInboxItems(false);
            }
        });

        socket.on('conversation_unarchived', (data) => {
            loadInboxItems(false);
        });

        // Listen for contact deletion - remove from inbox immediately (no page refresh needed)
        socket.on('contact_deleted', (data) => {
            const { contactId } = data;
            if (!contactId) return;
            console.log('🗑️ contact_deleted event received:', contactId);

            // Remove all inbox items for this contact
            setInboxItems(prev => prev.filter(item => item.contactId !== contactId));

            // If the deleted contact's conversation is currently selected, deselect it
            if (selectedItemRef.current?.contactId === contactId) {
                setSelectedItem(null);
                setMessages([]);
            }

            // Clean up activity badges
            setPlannedActivityMap(prev => {
                const next = { ...prev };
                delete next[contactId];
                return next;
            });
        });

        return () => {
            socket.off('activity_created');
            socket.off('activity_assigned');
            socket.off('activity_completed');
            socket.off('conversation_archived');
            socket.off('conversation_unarchived');
            socket.disconnect();
        };
    }, [currentWorkspace, user, showArchived]); // NOTE: selectedItem/selectedItemType are accessed via refs to prevent socket reconnection on every conversation change

    // Keep selectedItem/selectedItemType refs in sync with state (must be after the socket useEffect)
    useEffect(() => {
        selectedItemRef.current = selectedItem;
    }, [selectedItem]);
    useEffect(() => {
        selectedItemTypeRef.current = selectedItemType;
    }, [selectedItemType]);


    const loadSupportData = async () => {
        try {
            const [membersRes, teamsRes, botsRes, pagesRes, templatesRes] = await Promise.all([
                // Tüm kullanıcılar üye listesini görebilmeli (üstlenen kişi başka birine atayabilmek için)
                workspaceAPI.getMembers(currentWorkspace.id).catch(() => ({ data: { members: [] } })),
                teamAPI.getWorkspaceTeams(currentWorkspace.id),
                aiAPI.getBots(currentWorkspace.id),
                facebookAPI.getPages(currentWorkspace.id),
                automationAPI.getTemplates(currentWorkspace.id).catch(() => ({ data: { templates: [] } }))
            ]);

            setMembers(membersRes.data.members || []);
            setTeams(teamsRes.data.teams || []);
            setBots(botsRes.data.bots || []);
            setPages(pagesRes.data.pages || []);
            setTemplates(templatesRes.data.templates || []);

            // Planned activity badges
            activityAPI.getPlannedActivities(currentWorkspace.id)
                .then(data => {
                    const acts = Array.isArray(data) ? data : (data?.data || []);
                    const map = {};
                    acts.forEach(act => {
                        if (!act.contact?.id) return;
                        const cid = act.contact.id;
                        if (!map[cid]) map[cid] = [];
                        map[cid].push({
                            type: act.type,
                            status: act.status,
                            dueDate: act.dueDate,
                            assigneeName: act.assignee?.name || act.creator?.name || null,
                            assignedByType: act.assignedByType || null,
                            source: act.source || null
                        });
                    });
                    setPlannedActivityMap(map);
                })
                .catch(err => console.warn('⚠️ [ActivityBadges] loadSupportData fetch failed:', err?.message || err));
        } catch (error) {
            console.error('Error loading support data:', error);
        }
    };

    // Aktivite kaydedilince inbox badge'lerini anında güncelle (sayfa yenileme gerekmez)
    const handleActivitySaved = ({ type, status = 'PLANNED', contactId, dueDate }) => {
        if (!contactId) return;
        setPlannedActivityMap(prev => {
            const existing = prev[contactId] || [];
            if (status === 'DELETED') {
                return {
                    ...prev,
                    [contactId]: existing.filter(e => e.type !== type)
                };
            }
            const alreadyExists = existing.find(e => e.type === type);
            if (alreadyExists) {
                return {
                    ...prev,
                    [contactId]: existing.map(e =>
                        e.type === type ? { ...e, status, dueDate: dueDate || e.dueDate } : e
                    )
                };
            }
            return {
                ...prev,
                [contactId]: [...existing, { type, status, dueDate }]
            };
        });
    };
    // Load more conversations - wrapped in useCallback to prevent stale closure
    const loadMoreItems = useCallback(async () => {
        if (!hasMore || loadingMore) return;

        try {
            setLoadingMore(true);
            const params = { limit: 100, page: currentPage + 1 };
            
            // Set assignment filter
            if (assignmentTab === 'MINE') params.assignedToId = 'mine';
            else if (assignmentTab === 'PENDING') params.assignedToId = 'unassigned';
            else if (assignmentTab === 'MINE_OR_UNASSIGNED') params.assignedToId = 'mine_or_unassigned';
            else if (assignmentTab.startsWith('TEAM:')) params.teamId = assignmentTab.split(':')[1];
            
            // Admin/Owner Agent Filter overrides assignment tab
            if (agentFilter) {
                params.assignedToId = agentFilter === '__unassigned__' ? 'unassigned' : agentFilter;
            }

            if (funnelFilter) params.funnelType = funnelFilter;
            if (statusFilter) {
                params.funnelStageId = statusFilter;
            }
            if (searchTerm && searchTerm.trim()) params.search = searchTerm.trim();
            if (hideUnanswered) params.hideUnanswered = 'true';
            if (showBulk) params.showBulk = 'true';

            const response = await conversationAPI.getAll(currentWorkspace.id, params);
            const moreConversations = response.data.conversations || [];
            const pagination = response.data.pagination;

            // Use same filtering logic as loadInboxItems
            const channelFilters = ['whatsapp', 'facebook', 'instagram', 'web_widget', 'web_form', 'emails', 'leads', 'phone_calls', 'notes'];
            const loadAll = activeFilters.length === allFilters.length;
            const hasChannelFilter = channelFilters.some(f => activeFilters.includes(f));

            // --- Ghost Lead Suppression (Deduplication) ---
            const realContactIds = new Set();
            moreConversations.forEach(c => {
                if (c.channel !== 'LEAD' || c.facebookPageId) {
                    realContactIds.add(c.contactId);
                }
            });

            // Filter and add new conversations to existing items
            const newItems = moreConversations
                .filter(conv => {
                    // Suppress dummy leads if the contact has a real channel
                    if (conv.channel === 'LEAD' && !conv.facebookPageId && realContactIds.has(conv.contactId)) {
                        return false;
                    }
                    // Check if resolved filter applies
                    if (!showResolved && conv.status === 'RESOLVED') {
                        return false;
                    }
                    if (!showArchived && conv.isArchived) {
                        return false;
                    }

                    // Check if "only unassigned" filter applies
                    const isAssigned = (conv.assignedToId && conv.assignedToId !== '') || conv.assignedTo;
                    if (showOnlyAssigned && isAssigned) {
                        return false;
                    }

                    // Check if "assigned to me" filter applies
                    if (showAssignedToMe && conv.assignedToId !== user?.id) {
                        return false;
                    }

                    // Check activeChannel filter (top buttons: Tümü, WhatsApp, Facebook, Instagram)
                    if (activeChannel && conv.channel !== activeChannel) {
                        return false;
                    }



                    let channelMatch = false;
                    if (loadAll) {
                        channelMatch = true;
                    } else if (hasChannelFilter) {
                        channelMatch =
                            (activeFilters.includes('whatsapp') && (conv.channel === 'WHATSAPP' || conv.whatsappPhoneNumberId)) ||
                            (activeFilters.includes('facebook') && conv.channel === 'FACEBOOK') ||
                            (activeFilters.includes('instagram') && conv.channel === 'INSTAGRAM') ||
                            (activeFilters.includes('web_widget') && conv.channel === 'WIDGET') ||
                            (activeFilters.includes('web_form') && conv.channel === 'FORM') ||
                            (activeFilters.includes('emails') && conv.channel === 'EMAIL') ||
                            (activeFilters.includes('leads') && conv.channel === 'LEAD') ||
                            (activeFilters.includes('phone_calls') && conv.channel === 'PHONE') ||
                            (activeFilters.includes('notes') && (conv.channel === 'INTERNAL' || conv.channel === 'MANUAL'));
                    }
                    if (!channelMatch) return false;

                    // Apply quick filter
                    if (quickFilter) {
                        const convDate = new Date(conv.lastMessageAt || conv.createdAt);
                        const now = new Date();
                        if (quickFilter === 'today') {
                            const start = new Date(now); start.setHours(0,0,0,0);
                            if (convDate < start) return false;
                        } else if (quickFilter === 'yesterday') {
                            const start = new Date(now); start.setDate(now.getDate() - 1); start.setHours(0,0,0,0);
                            const end = new Date(now); end.setDate(now.getDate() - 1); end.setHours(23,59,59,999);
                            if (convDate < start || convDate > end) return false;
                        } else if (quickFilter === 'week') {
                            const day = now.getDay();
                            const diffToMonday = day === 0 ? 6 : day - 1;
                            const start = new Date(now); start.setDate(now.getDate() - diffToMonday); start.setHours(0,0,0,0);
                            const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
                            if (convDate < start || convDate > end) return false;
                        } else if (quickFilter === 'month') {
                            const start = new Date(now.getFullYear(), now.getMonth(), 1);
                            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
                            if (convDate < start || convDate > end) return false;
                        } else if (quickFilter === 'unread') {
                            if (conv.unreadCount === 0 || !conv.unreadCount) return false;
                        }
                    }

                    return true;
                })
                .map(conv => ({
                    ...conv,
                    inboxType: conv.channel === 'EMAIL' ? INBOX_TYPES.EMAIL : INBOX_TYPES.MESSAGE,
                    sortDate: new Date(conv.lastMessageAt || conv.createdAt)
                }));

            setInboxItems(prev => [...prev, ...newItems]);

            if (pagination) {
                const morePages = pagination.page < pagination.totalPages;
                setCurrentPage(pagination.page);
                currentPageRef.current = pagination.page;
                setTotalItems(pagination.total || 0);

                // If filtered results are empty but backend has more pages,
                // automatically try loading the next page (max 5 auto-retries)
                if (newItems.length === 0 && morePages) {
                    // Check retry count to prevent infinite loop
                    const retryCount = (window.__loadMoreRetryCount || 0) + 1;
                    window.__loadMoreRetryCount = retryCount;

                    if (retryCount <= 5) {
                        // Auto-load next page after short delay
                        setTimeout(() => {
                            loadMoreItems();
                        }, 100);
                        return; // Don't set hasMore yet, we're auto-continuing
                    } else {
                        // Max retries reached, no more matching items
                        setHasMore(false);
                        window.__loadMoreRetryCount = 0;
                    }
                } else {
                    // Got some items or no more pages
                    setHasMore(morePages);
                    window.__loadMoreRetryCount = 0;
                }
            }
        } catch (error) {
            console.error('Error loading more items:', error);
        } finally {
            setLoadingMore(false);
        }
    }, [hasMore, loadingMore, currentPage, assignmentTab, currentWorkspace, activeFilters, allFilters, showResolved, showArchived, showOnlyAssigned, showAssignedToMe, activeChannel, statusFilter, funnelFilter, agentFilter, quickFilter, hideUnanswered, showBulk]);

    // Mark all conversations as read
    const handleMarkAllAsRead = async () => {
        if (!currentWorkspace?.id) return;

        try {
            setMarkingAllRead(true);
            const response = await conversationAPI.markAllAsRead(currentWorkspace.id);

            // Update local state - set all unread counts to 0
            setInboxItems(prevItems =>
                prevItems.map(item => ({
                    ...item,
                    unreadCount: 0
                }))
            );

            // Update global unread count
            if (setUnreadCount) {
                setUnreadCount(0);
            }

            console.log(`✅ ${response.data.markedCount} sohbet okundu olarak işaretlendi`);
        } catch (error) {
            console.error('Error marking all as read:', error);
            alert('Tümünü okundu yapma başarısız oldu.');
        } finally {
            setMarkingAllRead(false);
        }
    };

    // Delete ALL conversations with confirmation
    const handleDeleteAllConversations = async () => {
        if (!currentWorkspace?.id) return;

        const confirmMessage = `DİKKAT: Bu işlem TÜM sohbetleri silecek!\n\nSilmek istediğinize emin misiniz?\n\nBu işlem geri alınamaz!`;
        if (!confirm(confirmMessage)) return;

        const doubleConfirm = prompt('Silmek için "SİL" yazın:');
        if (doubleConfirm !== 'SİL') {
            alert('İşlem iptal edildi.');
            return;
        }

        try {
            setLoading(true);
            const response = await conversationAPI.deleteAll(currentWorkspace.id);

            // Clear all inbox items
            setInboxItems([]);
            setSelectedItem(null);
            setMessages([]);

            alert(response.data.message);
            console.log(`✅ ${response.data.deletedCount} sohbet silindi`);
        } catch (error) {
            console.error('Error deleting all conversations:', error);
            alert(error.response?.data?.error || 'Sohbetler silinirken hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    const loadInboxItems = async (showLoading = true) => {
        const requestId = ++loadRequestIdRef.current;
        let safetyTimer = null;
        try {
            if (showLoading) {
                setLoading(true);
                // Failsafe: if the API hangs or the interceptor swallows the error, clear spinner after 10s
                safetyTimer = setTimeout(() => setLoading(false), 10000);
            }

            // Refresh activity badges on every inbox load (real-time icon updates)
            activityAPI.getPlannedActivities(currentWorkspace.id)
                .then(data => {
                    const acts = Array.isArray(data) ? data : (data?.data || []);
                    const map = {};
                    acts.forEach(act => {
                        if (!act.contact?.id) return;
                        const cid = act.contact.id;
                        if (!map[cid]) map[cid] = [];
                        map[cid].push({
                            type: act.type,
                            status: act.status,
                            dueDate: act.dueDate,
                            assigneeName: act.assignee?.name || act.creator?.name || null,
                            assignedByType: act.assignedByType || null,
                            source: act.source || null
                        });
                    });
                    setPlannedActivityMap(map);
                })
                .catch(err => console.warn('⚠️ [ActivityBadges] Failed to fetch planned activities:', err?.message || err));

            let items = [];

            // Load based on active filters (if all are selected = show all, unchecked = hide)
            const channelFilters = ['whatsapp', 'facebook', 'instagram', 'web_widget', 'web_form', 'emails', 'leads', 'phone_calls', 'notes'];
            const commentFilters = ['fb_comments', 'ig_comments'];

            // loadAll only when ALL filters are active (nothing hidden)
            const loadAll = activeFilters.length === allFilters.length;

            // Check which channel filters are still active
            const hasChannelFilter = channelFilters.some(f => activeFilters.includes(f));

            // Check which comment filters are still active
            const hasCommentFilter = commentFilters.some(f => activeFilters.includes(f));

            // Determine what to load:
            // - If no filter selected (loadAll): load everything
            // - If channel filter selected: load only those channels, NOT comments (unless comment filter also selected)
            // - If comment filter selected: load only those comments, NOT channels (unless channel filter also selected)

            // Yorumları sadece şu durumlarda yükle:
            // 1. Tüm filtreler seçili (loadAll) - her şeyi göster
            // 2. İlgili yorum filtresi açıkça seçili (fb_comments veya ig_comments)
            // NOT: Channel filtresi (whatsapp, facebook, vb.) seçiliyse yorumları YÜKLEME
            const shouldLoadFbComments = (loadAll || activeFilters.includes('fb_comments')) && !activeChannel && !statusFilter;
            const shouldLoadIgComments = (loadAll || activeFilters.includes('ig_comments')) && !activeChannel && !statusFilter;

            const loadConversations = loadAll || hasChannelFilter || activeChannel;

            // Load all conversations in one API call to avoid duplicates
            if (loadConversations) {
                // Always use current page from ref (preserves pagination)
                const pageToLoad = currentPageRef.current;
                const params = { limit: 100, page: pageToLoad };
                
                // Set assignment filter
                if (assignmentTab === 'MINE') params.assignedToId = 'mine';
                else if (assignmentTab === 'PENDING') params.assignedToId = 'unassigned';
                else if (assignmentTab === 'MINE_OR_UNASSIGNED') params.assignedToId = 'mine_or_unassigned';
                else if (assignmentTab.startsWith('TEAM:')) params.teamId = assignmentTab.split(':')[1];
                
                // Admin/Owner Agent Filter overrides assignment tab
                if (agentFilter) {
                    params.assignedToId = agentFilter === '__unassigned__' ? 'unassigned' : agentFilter;
                }

                if (funnelFilter) params.funnelType = funnelFilter;
                if (statusFilter) {
                    params.funnelStageId = statusFilter;
                }
                if (searchTerm && searchTerm.trim()) params.search = searchTerm.trim();
                if (hideUnanswered) params.hideUnanswered = 'true';
                if (showBulk) params.showBulk = 'true';
                if (showArchived) params.showArchived = 'true';

                // Advanced Single-Channel Push to Backend (Prevents Filter Pagination Paradox)
                if (activeChannel) {
                    params.channel = activeChannel;
                } else if (activeFilters.length === 1) {
                    const onlyFilter = activeFilters[0];
                    if (onlyFilter === 'phone_calls') params.channel = 'PHONE';
                    else if (onlyFilter === 'whatsapp') params.channel = 'WHATSAPP';
                    else if (onlyFilter === 'facebook') params.channel = 'FACEBOOK';
                    else if (onlyFilter === 'instagram') params.channel = 'INSTAGRAM';
                    else if (onlyFilter === 'web_widget') params.channel = 'WIDGET';
                    else if (onlyFilter === 'emails') params.channel = 'EMAIL';
                }

                const response = await conversationAPI.getAll(currentWorkspace.id, params);
                const allConversations = response.data.conversations || [];
                const pagination = response.data.pagination;

                // Enrich each conversation with _effectiveStageId for consistent filtering
                allConversations.forEach(conv => {
                    // Use explicit funnelStageId first, then contact's funnelStageId
                    conv._effectiveStageId = conv.funnelStageId || conv.contact?.funnelStageId || null;

                    // ── Case as Source of Truth ──
                    // When conversation is linked to a case, inherit ALL case properties
                    if (conv.case) {
                        conv._caseNumber = conv.case.caseNumber;
                        conv._caseTitle = conv.case.title;
                        conv._caseStatus = conv.case.status; // ACTIVE, WON, LOST, CLOSED

                        // Case'i ana veri kaynağı olarak kullan
                        if (conv.case.title) conv.aiTopic = conv.case.title;
                        if (conv.case.funnelType) conv.funnelType = conv.case.funnelType;
                        if (conv.case.funnelStageId) {
                            conv.funnelStageId = conv.case.funnelStageId;
                            conv._effectiveStageId = conv.case.funnelStageId;
                        }
                        if (conv.case.assignedToId) {
                            conv.assignedToId = conv.case.assignedToId;
                            conv.assignedTo = conv.case.assignedTo || conv.assignedTo;
                        }
                        if (conv.case?.assignedTeamId) {
                            conv.assignedTeamId = conv.case?.assignedTeamId;
                        }

                        // Case statusünü closingStatus olarak kullan
                        if (conv.status === 'RESOLVED' && conv.case.status && conv.case.status !== 'ACTIVE') {
                            conv.closingStatus = conv.case.status; // WON, LOST, CLOSED
                        }
                    }

                    // --- Internal Chat Contact Swapping ---
                    if (conv.isInternalChat && conv.participantIds) {
                        try {
                            const pIds = JSON.parse(conv.participantIds);
                            const otherId = pIds.find(id => id !== user.id);
                            if (otherId) {
                                const otherMember = members.find(m => m.userId === otherId);
                                if (otherMember && otherMember.user) {
                                    conv.contact = {
                                        ...conv.contact,
                                        id: otherMember.user.id,
                                        name: otherMember.user.name || otherMember.user.email,
                                        fullName: otherMember.user.name || otherMember.user.email,
                                        avatar: otherMember.user.avatar,
                                        email: otherMember.user.email,
                                        status: 'INTERNAL_AGENT'
                                    };
                                }
                            }
                        } catch (e) {
                            console.error('Error parsing participantIds', e);
                        }
                    }
                    // ----------------------------------------
                });

                // Check if there are more pages
                if (pagination) {
                    setHasMore(pagination.page < pagination.totalPages);
                    setCurrentPage(pagination.page);
                    currentPageRef.current = pagination.page;
                    setTotalItems(pagination.total || 0);
                }

                // --- Ghost Lead Suppression (Deduplication) ---
                const realContactIds = new Set();
                allConversations.forEach(c => {
                    if (c.channel !== 'LEAD' || c.facebookPageId) {
                        realContactIds.add(c.contactId);
                    }
                });

                // 🔍 DEBUG: WhatsApp frontend filtering
                const waConvs = allConversations.filter(c => c.channel === 'WHATSAPP');
                console.warn(`🔍 [Inbox] API: ${allConversations.length} total, ${waConvs.length} WA, loadAll=${loadAll}`);

                // Filter conversations based on channel and resolved status
                allConversations.forEach(conv => {
                    // Suppress dummy leads if the contact has a real channel
                    if (conv.channel === 'LEAD' && !conv.facebookPageId && realContactIds.has(conv.contactId)) {
                        return; // Skip this duplicate artifact
                    }

                    // Check if resolved filter applies
                    if (!showResolved && conv.status === 'RESOLVED') {
                        return; // Skip resolved conversations if showResolved is false
                    }

                    // Check if "only unassigned" filter applies
                    // A conversation is considered "assigned" if it has either assignedToId or assignedTo object
                    const isAssigned = (conv.assignedToId && conv.assignedToId !== '') || conv.assignedTo;
                    if (showOnlyAssigned && isAssigned) {
                        return; // Skip assigned conversations if showOnlyAssigned is true (show only unassigned)
                    }

                    // Check if "assigned to me" filter applies
                    if (showAssignedToMe && conv.assignedToId !== user?.id) {
                        return; // Skip conversations not assigned to me
                    }

                    // Check activeChannel filter (top buttons: Tümü, WhatsApp, Facebook, Instagram)
                    if (activeChannel && conv.channel !== activeChannel) {
                        return; // Skip if channel doesn't match the active channel button
                    }

                    // Check dropdown channel filter
                    // If no channel filter is selected (loadAll), show all conversation channels
                    // If specific channel filters are selected, only show matching channels


                    let channelMatch = false;

                    if (loadAll) {
                        channelMatch = true;
                    } else if (hasChannelFilter) {
                        channelMatch =
                            (activeFilters.includes('whatsapp') && (conv.channel === 'WHATSAPP' || conv.whatsappPhoneNumberId)) ||
                            (activeFilters.includes('facebook') && conv.channel === 'FACEBOOK') ||
                            (activeFilters.includes('instagram') && conv.channel === 'INSTAGRAM') ||
                            (activeFilters.includes('web_widget') && conv.channel === 'WIDGET') ||
                            (activeFilters.includes('web_form') && conv.channel === 'FORM') ||
                            (activeFilters.includes('emails') && conv.channel === 'EMAIL') ||
                            (activeFilters.includes('leads') && conv.channel === 'LEAD') ||
                            (activeFilters.includes('phone_calls') && conv.channel === 'PHONE') ||
                            (activeFilters.includes('notes') && (conv.channel === 'INTERNAL' || conv.channel === 'MANUAL'));
                    } else {
                        channelMatch = false;
                    }

                    // 🔍 DEBUG: WhatsApp channelMatch
                    if (conv.channel === 'WHATSAPP' && !channelMatch) {
                        console.log(`🔍 [Inbox Frontend] WA conv FILTERED OUT: id=${conv.id}, loadAll=${loadAll}, hasChannelFilter=${hasChannelFilter}, whatsappInFilters=${activeFilters.includes('whatsapp')}`);
                    }

                    if (channelMatch) {
                        // Apply quick filter
                        if (quickFilter) {
                            const convDate = new Date(conv.lastMessageAt || conv.createdAt);
                            const now = new Date();
                            if (quickFilter === 'today') {
                                const start = new Date(now); start.setHours(0,0,0,0);
                                if (convDate < start) return;
                            } else if (quickFilter === 'yesterday') {
                                const start = new Date(now); start.setDate(now.getDate() - 1); start.setHours(0,0,0,0);
                                const end = new Date(now); end.setDate(now.getDate() - 1); end.setHours(23,59,59,999);
                                if (convDate < start || convDate > end) return;
                            } else if (quickFilter === 'week') {
                                const day = now.getDay();
                                const diffToMonday = day === 0 ? 6 : day - 1;
                                const start = new Date(now); start.setDate(now.getDate() - diffToMonday); start.setHours(0,0,0,0);
                                const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
                                if (convDate < start || convDate > end) return;
                            } else if (quickFilter === 'month') {
                                const start = new Date(now.getFullYear(), now.getMonth(), 1);
                                const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
                                if (convDate < start || convDate > end) return;
                            } else if (quickFilter === 'unread') {
                                if (conv.unreadCount === 0 || !conv.unreadCount) return;
                            }
                        }

                        items.push({
                            ...conv,
                            inboxType: conv.channel === 'EMAIL' ? INBOX_TYPES.EMAIL : INBOX_TYPES.MESSAGE,
                            sortDate: new Date(conv.lastMessageAt || conv.createdAt)
                        });
                    }
                });
            }

            // Race condition check: discard stale requests before slow Meta API calls
            if (requestId !== loadRequestIdRef.current) {
                console.log('🔄 [Race] Stale request discarded before comments:', requestId, 'current:', loadRequestIdRef.current);
                return;
            }

            // Skip comments when status filter is active (comments don't have contact status)
            if (shouldLoadFbComments && !statusFilter) {
                // For Facebook comments, we load posts which contain comments
                if (pages.length > 0) {
                    const postsPromises = pages.map(page =>
                        facebookAPI.getPosts(page.pageId).catch(() => ({ data: { posts: [] } }))
                    );
                    const postsResponses = await Promise.all(postsPromises);
                    const allPosts = postsResponses.flatMap((res, idx) =>
                        (res.data.posts || []).map(post => ({
                            ...post,
                            pageId: pages[idx].pageId,
                            pageName: pages[idx].pageName,
                            inboxType: INBOX_TYPES.COMMENT,
                            platform: 'FACEBOOK',
                            sortDate: new Date(post.created_time)
                        }))
                    ).filter(post => showResolved || !resolvedPostIds.has(post.id));
                    items = [...items, ...allPosts];
                }
            }

            if (shouldLoadIgComments && !statusFilter) {
                // For Instagram comments, we load Instagram posts which contain comments
                if (pages.length > 0) {
                    const instagramPages = pages.filter(p => p.instagramBusinessId);
                    const igPostsPromises = instagramPages.map(page =>
                        facebookAPI.getInstagramPosts(page.instagramBusinessId, currentWorkspace.id).catch(() => ({ data: { posts: [] } }))
                    );
                    const igPostsResponses = await Promise.all(igPostsPromises);
                    const allIgPosts = igPostsResponses.flatMap((res, idx) =>
                        (res.data.posts || []).map(post => ({
                            ...post,
                            pageId: instagramPages[idx].pageId,
                            pageName: instagramPages[idx].instagramUsername ? `@${instagramPages[idx].instagramUsername}` : instagramPages[idx].pageName,
                            instagramBusinessId: instagramPages[idx].instagramBusinessId,
                            inboxType: INBOX_TYPES.COMMENT,
                            platform: 'INSTAGRAM',
                            sortDate: new Date(post.created_time)
                        }))
                    ).filter(post => showResolved || !resolvedPostIds.has(post.id));
                    items = [...items, ...allIgPosts];
                }
            }


            // Race condition check: discard stale requests before updating state
            if (requestId !== loadRequestIdRef.current) {
                console.log('🔄 [Race] Stale request discarded before setState:', requestId, 'current:', loadRequestIdRef.current);
                return;
            }

            // Sort by date (most recent first)
            items.sort((a, b) => b.sortDate - a.sortDate);

            setInboxItems(items);
        } catch (error) {
            console.error('Error loading inbox items:', error);
        } finally {
            if (safetyTimer) clearTimeout(safetyTimer);
            // Only clear loading if this is still the latest request
            if (requestId === loadRequestIdRef.current) {
                setLoading(false);
            }
        }
    };

    const handleSelectItem = async (item) => {
        setSelectedItem(item);
        setSelectedItemType(item.inboxType);
        setShowContactSidebar(true);
        setReplyChannel(null);

        if (item.inboxType === INBOX_TYPES.MESSAGE || item.inboxType === INBOX_TYPES.EMAIL) {
            await loadConversationDetails(item.id);
        } else if (item.inboxType === INBOX_TYPES.COMMENT) {
            setSelectedPost(item);
            await loadComments(item.id, item);
        }
        // For leads, data is already in the item
    };

    const loadConversationDetails = async (conversationId) => {
        try {
            // First, get the unread count BEFORE marking as read
            const currentItem = inboxItems.find(i => i.id === conversationId);
            const unreadForThis = currentItem?.unreadCount || 0;

            // Call API - this marks conversation as read in backend
            const response = await conversationAPI.getById(currentWorkspace.id, conversationId);
            const conv = response.data.conversation;

            // --- Internal Chat Contact Swapping ---
            if (conv.isInternalChat && conv.participantIds) {
                try {
                    const pIds = JSON.parse(conv.participantIds);
                    const otherId = pIds.find(id => id !== user.id);
                    if (otherId) {
                        const otherMember = members.find(m => m.userId === otherId);
                        if (otherMember && otherMember.user) {
                            conv.contact = {
                                ...conv.contact,
                                id: otherMember.user.id,
                                name: otherMember.user.name || otherMember.user.email,
                                fullName: otherMember.user.name || otherMember.user.email,
                                avatar: otherMember.user.avatar,
                                email: otherMember.user.email,
                                status: 'INTERNAL_AGENT'
                            };
                        }
                    }
                } catch (e) {
                    console.error('Error parsing participantIds', e);
                }
            }

            setSelectedItem(conv);

            // Set botEnabled state from conversation data
            setBotEnabled(response.data.conversation.botEnabled !== false);

            // Update local inbox items to show 0 unread
            setInboxItems(prev => prev.map(i =>
                i.id === conversationId ? { ...i, unreadCount: 0 } : i
            ));

            // Decrease global unread count only for message channels
            const messageChannels = ['FACEBOOK', 'INSTAGRAM', 'WHATSAPP', 'PHONE'];
            if (unreadForThis > 0 && messageChannels.includes(currentItem?.channel)) {
                setUnreadCount(prev => Math.max(0, prev - unreadForThis));
            }

            let msgs = response.data.conversation.messages || [];
            
            // Filter out legacy redundant activity system messages (they are rendered properly by the Activity Timeline now)
            msgs = msgs.filter(m => {
                if (m.isInternal && m.messageType === 'SYSTEM') {
                    const c = m.content || '';
                    if (c.includes('Arama:') || c.includes('Görev:') || c.includes('Görüşme:') || 
                        c.includes('Not:') || c.includes('Hatırlatıcı:') || c.includes('Aktivite:')) {
                        return false;
                    }
                }
                return true;
            });

            const notes = response.data.conversation.internalNotes || [];
            const events = response.data.conversation.events || [];

            const formattedNotes = notes.map(n => ({
                ...n,
                isInternalNote: true,
                messageType: 'NOTE',
                sender: n.user,
                isFromContact: false
            }));

            const formattedEvents = events.map(e => ({
                id: e.id,
                createdAt: e.createdAt,
                isSystemEvent: true,
                eventType: e.eventType,
                title: e.title,
                actorType: e.actorType,
                actorId: e.actorId,
                details: e.details
            }));

            // Load activities for this contact and merge into timeline
            let formattedActivities = [];
            const contactId = response.data.conversation.contactId;
            if (contactId && currentWorkspace?.id) {
                try {
                    const actRes = await activityAPI.getTimeline(contactId, currentWorkspace.id);
                    // API returns { planned: [...], past: [...] }
                    // Each item: { id: 'act_123', sourceType: 'ACTIVITY', type, title, content, date, dueDate, status, isCompleted, result, labelName, assignedToName, raw }
                    const allActivities = [
                        ...(actRes?.planned || []),
                        ...(actRes?.past || [])
                    ];
                    formattedActivities = allActivities
                        .filter(a => a.sourceType === 'ACTIVITY' && a.type !== 'NOTE')
                        .map(a => ({
                            id: `activity-${a.id}`,
                            createdAt: a.date || a.dueDate || a.raw?.createdAt,
                            isActivity: true,
                            activityId: a.raw?.id || a.id,
                            activityType: a.type,
                            activityStatus: a.status || (a.isCompleted ? 'COMPLETED' : 'PLANNED'),
                            activityTitle: a.title,
                            activityContent: a.content || '',
                            activityResult: a.result || a.raw?.result || '',
                            activityDueDate: a.dueDate,
                            activityAssignedTo: a.assignedToName || a.labelName || '',
                            activityTeam: a.raw?.team?.name || '',
                            activityCreatedBy: a.labelName || '',
                        }));
                    console.log(`📋 [Timeline] Loaded ${formattedActivities.length} activities for contact ${contactId}`);
                } catch (e) {
                    console.warn('Activities load failed:', e.message);
                }
            }

            const combined = [...msgs, ...formattedNotes, ...formattedEvents, ...formattedActivities].sort((a, b) =>
                new Date(a.createdAt) - new Date(b.createdAt)
            );
            setMessages(combined);
        } catch (error) {
            console.error('Error loading conversation:', error);
        }
    };

    const loadComments = async (postId, item = null) => {
        try {
            const targetItem = item || selectedPost;
            const page = pages.find(p => p.pageId === targetItem?.pageId) || pages[0];
            // For Instagram posts, pass instagramBusinessId
            const instagramBusinessId = targetItem?.instagramBusinessId || targetItem?.platform === 'INSTAGRAM' ? page?.instagramBusinessId : null;
            const response = await facebookAPI.getPostComments(postId, currentWorkspace.id, page?.pageId, instagramBusinessId);
            setComments(response.data.comments || []);
        } catch (error) {
            console.error('Error loading comments:', error);
        }
    };

    // Fetch AI suggested replies
    const fetchAiSuggestions = async () => {
        if (!selectedItem || !currentWorkspace) return;

        setLoadingSuggestions(true);
        setShowSuggestions(true);

        try {
            const response = await aiAPI.getSuggestedReplies(currentWorkspace.id, selectedItem.id);
            setAiSuggestions(response.data.suggestions || []);
        } catch (error) {
            console.error('AI suggestions error:', error);
            setAiSuggestions([]);
        } finally {
            setLoadingSuggestions(false);
        }
    };

    // Apply suggestion to input
    const applySuggestion = (suggestion) => {
        setNewMessage(suggestion.text);
        setShowSuggestions(false);
        setAiSuggestions([]);
    };

    const [schedulingMsgId, setSchedulingMsgId] = useState(null);

    const handleScheduleFromForm = async (msg) => {
        const phone = selectedItem?.contact?.phone;
        if (!phone) { alert('Bu lead için telefon numarası bulunamadı.'); return; }
        const pref = parseFormPreferredTime(msg.content);
        if (!pref) { alert('Form içinde saat bilgisi bulunamadı.'); return; }

        const now = new Date();
        const curMin = now.getHours() * 60 + now.getMinutes();
        const startMin = pref.startH * 60 + pref.startM;
        const endMin = pref.endH * 60 + pref.endM;

        let target = new Date(now);

        if (curMin < startMin) {
            // Belirtilen saat gelmediyse bugün o saatte ara
            target.setHours(pref.startH, pref.startM, 0, 0);
        } else if (curMin < endMin) {
            // Şu an belirtilen aralık içindeysek HEMEN ARA
            target = new Date(now);
        } else {
            // Saat geçtiyse YARIN o saatte ara
            target.setDate(target.getDate() + 1);
            target.setHours(pref.startH, pref.startM, 0, 0);
        }

        const contactName = selectedItem?.contact?.name || selectedItem?.contact?.phone || 'Lead';
        try {
            setSchedulingMsgId(msg.id);
            const res = await retellAPI.scheduleCall(currentWorkspace.id, {
                toNumber: phone,
                scheduledAt: target.toISOString(),
                contactName,
                contactId: selectedItem?.contact?.id || null,
            });
            const finalTime = res.data?.scheduledCall?.scheduledAt
                ? new Date(res.data.scheduledCall.scheduledAt).toLocaleString('tr-TR')
                : target.toLocaleString('tr-TR');
            alert(`📅 Arama planlandı!\n${contactName} — ${finalTime}`);

        } catch (e) {
            alert('Planlama başarısız: ' + (e.response?.data?.error || e.message));
        } finally {
            setSchedulingMsgId(null);
        }
    };

    // --- File Attachment State & Handlers ---
    const fileInputRef = useRef(null);
    const [pendingFile, setPendingFile] = useState(null); // { file, preview, mediaType }
    const [fileUploading, setFileUploading] = useState(false);

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const mimeType = file.type || '';
        let mediaType = 'document';
        if (mimeType.startsWith('image/')) mediaType = 'image';
        else if (mimeType.startsWith('video/')) mediaType = 'video';
        else if (mimeType.startsWith('audio/')) mediaType = 'audio';
        const preview = mediaType === 'image' ? URL.createObjectURL(file) : null;
        setPendingFile({ file, preview, mediaType, name: file.name, size: file.size });
        e.target.value = ''; // Reset input
    };

    const cancelFileAttachment = () => {
        if (pendingFile?.preview) URL.revokeObjectURL(pendingFile.preview);
        setPendingFile(null);
    };

    const handleSendMessage = async (e) => {

        e.preventDefault();
        if (!newMessage.trim() && !pendingFile && !selectedItem) return;
        if (!selectedItem) return;

        try {
            // Check if this is an internal note
            const shouldSendNote = isInternalNoteMode;

            if (shouldSendNote) {
                const response = await conversationAPI.addNote(
                    currentWorkspace.id,
                    selectedItem.id,
                    { content: newMessage, isCallNote }
                );
                // Görüşme notu gönderildiyse resetle
                if (isCallNote) setIsCallNote(false);
                const newNote = {
                    ...response.data.note,
                    isInternalNote: true,
                    messageType: 'NOTE',
                    sender: user,
                    isFromContact: false
                };
                setMessages([...messages, newNote]);

                // 🤖 Otomatik aksiyonlar varsa bildir
                const aa = response.data.autoActivity;
                const sc = response.data.stageChange;
                if (aa || sc) {
                    let msg = '🤖 Akıllı Algılama\n\n';
                    if (aa) msg += `${aa.summary}\n`;
                    if (sc) msg += `${sc.summary}\n`;
                    msg += '\nOtomatik işlem yapıldı!';
                    setTimeout(() => alert(msg), 200);

                    // Aşama değiştiyse inbox listesini güncelle
                    if (sc) {
                        setConversations(prev => prev.map(c =>
                            c.id === selectedItem.id
                                ? { ...c, funnelStageId: sc.stageId, funnelStageName: sc.stageName, funnelStageColor: sc.stageColor }
                                : c
                        ));
                    }
                }

                // If no one is assigned to this conversation, ask if they want to claim it
                if (!selectedItem.assignedToId) {
                    setTimeout(() => {
                        if (window.confirm('Bu konuşma henüz kimseye atanmamış. Bu konuşmayı üstlenmek istiyor musunuz?')) {
                            handleClaimConversation();
                        }
                    }, 300);
                }
            } else {
                // For email, include CC/BCC
                const messageData = { content: newMessage };
                if (selectedItemType === INBOX_TYPES.EMAIL) {
                    if (emailCc.trim()) messageData.cc = emailCc.trim();
                    if (emailBcc.trim()) messageData.bcc = emailBcc.trim();
                }

                // 📎 Dosya varsa önce upload et
                if (pendingFile) {
                    try {
                        setFileUploading(true);
                        const uploadRes = await mediaAPI.upload(currentWorkspace.id, pendingFile.file);
                        const { url, mediaType, filename } = uploadRes.data;
                        messageData.mediaUrl = url;
                        messageData.mediaType = mediaType;
                        messageData.fileName = pendingFile.name || filename;
                        if (!messageData.content) messageData.content = pendingFile.name || 'Dosya';
                    } catch (uploadErr) {
                        console.error('❌ File upload error:', uploadErr);
                        alert('Dosya yüklenemedi: ' + (uploadErr.response?.data?.error || uploadErr.message));
                        setFileUploading(false);
                        return;
                    } finally {
                        setFileUploading(false);
                    }
                }

                const response = await conversationAPI.sendMessage(
                    currentWorkspace.id,
                    selectedItem.id,
                    messageData
                );
                // Only add if not a duplicate
                if (!response.data.duplicate) {
                    setMessages(prev => {
                        // Extra check to prevent duplicates
                        if (prev.some(m => m.id === response.data.message.id)) return prev;
                        return [...prev, response.data.message];
                    });
                }

                // Clear CC/BCC after sending
                if (selectedItemType === INBOX_TYPES.EMAIL) {
                    setEmailCc('');
                    setEmailBcc('');
                    setShowBcc(false);
                }
            }
            setNewMessage('');
            cancelFileAttachment();
        } catch (error) {
            console.error('Error sending message:', error);
            alert('Mesaj gönderilemedi.');
        }
    };

    const handleSendComment = async () => {
        if (!replyText.trim() || !selectedPost) return;

        try {
            await facebookAPI.createComment(selectedPost.id, {
                message: replyText,
                workspaceId: currentWorkspace.id,
                pageId: selectedPost.pageId
            });
            setReplyText('');
            loadComments(selectedPost.id, selectedPost);
        } catch (error) {
            console.error('Error sending comment:', error);
            alert('Could not send comment.');
        }
    };

    const handleAssignUser = async (conversationId, userId) => {
        try {
            console.log('🔄 [handleAssignUser] conversationId:', conversationId, 'userId:', userId, 'type:', typeof userId);
            const response = await conversationAPI.assign(currentWorkspace.id, conversationId, { userId: userId || null });

            // Update local state instead of reloading
            setInboxItems(prev => prev.map(item =>
                item.id === conversationId
                    ? { ...item, assignedToId: userId || null, assignedTo: response.data.conversation?.assignedTo || null }
                    : item
            ));

            // Update selectedItem with new assignment
            if (selectedItem?.id === conversationId) {
                setSelectedItem(prev => ({
                    ...prev,
                    assignedToId: userId || null,
                    assignedTo: response.data.conversation?.assignedTo || null
                }));
            }
        } catch (error) {
            console.error('Assign user error:', error);
        }
    };

    // WhatsApp Template functions
    const openTemplateModal = (template) => {
        setSelectedTemplate(template);
        // Parse variables from template body
        const matches = template.bodyText?.match(/\{\{(\d+)\}\}/g) || [];
        const uniqueVars = [...new Set(matches)].map((v) => ({
            placeholder: v,
            value: ''
        }));
        setTemplateVariables(uniqueVars);
        // Reset header media URL
        setHeaderMediaUrl(template.headerContent || '');
        setShowTemplateModal(true);
    };


    const handleSendTemplate = async () => {
        if (!selectedItem?.contact?.phone) {
            alert('Bu kişinin telefon numarası yok');
            return;
        }

        // Check if header media is required but not provided
        const needsHeaderMedia = selectedTemplate?.headerType &&
            ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(selectedTemplate.headerType);
        if (needsHeaderMedia && !headerMediaUrl) {
            alert('Bu şablon için medya URL\'si gereklidir');
            return;
        }

        setSendingTemplate(true);
        try {
            const variables = templateVariables.map(v => v.value);
            await automationAPI.sendTemplate(currentWorkspace.id, {
                templateId: selectedTemplate.id,
                contactId: selectedItem.contact?.id,
                variables: variables.length > 0 ? variables : undefined,
                headerMediaUrl: needsHeaderMedia ? headerMediaUrl : undefined
            });
            alert('Template message sent!');
            setShowTemplateModal(false);
            setSelectedTemplate(null);
            setHeaderMediaUrl('');
            // Reload messages
            loadConversationDetails(selectedItem.id);
        } catch (error) {
            console.error('Send template error:', error);
            alert(error.response?.data?.error || 'Mesaj gönderilemedi');
        } finally {
            setSendingTemplate(false);
        }
    };

    const handleAssignTeam = async (conversationId, teamId) => {
        try {
            // Sadece takım değişikliği gönder, agent atamasına dokunma
            // Agent ataması ayrı bir işlem olarak handleAssignUser ile yapılır
            const assignData = { teamId: teamId || null };

            await conversationAPI.assign(currentWorkspace.id, conversationId, assignData);

            // Update local state instead of reloading
            setInboxItems(prev => prev.map(item =>
                item.id === conversationId
                    ? { ...item, teamIds: teamId ? JSON.stringify([teamId]) : '[]' }
                    : item
            ));

            // Update selectedItem with new team assignment
            if (selectedItem?.id === conversationId) {
                setSelectedItem(prev => ({
                    ...prev,
                    teamIds: teamId ? JSON.stringify([teamId]) : '[]'
                    // Agent atamasına dokunma - mevcut atamayı koru
                }));
            }
        } catch (error) {
            console.error('Assign team error:', error);
        }
    };

    const handleAssignBot = async (conversationId, botId) => {
        try {
            const response = await conversationAPI.assign(currentWorkspace.id, conversationId, { botId: botId || null });

            // Update local state instead of reloading
            setInboxItems(prev => prev.map(item =>
                item.id === conversationId
                    ? {
                        ...item,
                        assignedBotId: botId || null,
                        assignedBot: response.data.conversation?.assignedBot || null,
                        assignedToId: botId ? null : item.assignedToId,
                        assignedTo: botId ? null : item.assignedTo
                    }
                    : item
            ));

            // Update selectedItem with new bot assignment
            if (selectedItem?.id === conversationId) {
                setSelectedItem(prev => ({
                    ...prev,
                    assignedBotId: botId || null,
                    assignedBot: response.data.conversation?.assignedBot || null,
                    // Bot assignment clears user assignment
                    assignedToId: botId ? null : prev.assignedToId,
                    assignedTo: botId ? null : prev.assignedTo
                }));
            }
        } catch (error) {
            console.error('Assign bot error:', error);
        }
    };

    // Bulk selection functions
    const handleToggleSelect = (itemId, checked) => {
        if (checked) {
            setSelectedItems(prev => [...prev, itemId]);
        } else {
            setSelectedItems(prev => prev.filter(id => id !== itemId));
        }
    };

    const handleSelectAll = (checked) => {
        if (checked) {
            const visibleItems = inboxItems.filter(item => {
                if (!showResolved && item.inboxType === INBOX_TYPES.MESSAGE && item.status === 'RESOLVED') {
                    return false;
                }
                return true;
            });
            setSelectedItems(visibleItems.map(item => item.id));
        } else {
            setSelectedItems([]);
        }
    };

    const handleBulkAssign = async (userId) => {
        if (selectedItems.length === 0 || !userId) return;

        try {
            setBulkAssigning(true);
            await Promise.all(
                selectedItems.map(convId =>
                    conversationAPI.assign(currentWorkspace.id, convId, { userId: userId || null })
                )
            );

            // Update local state for all assigned conversations
            const assignedUser = members.find(m => m.userId === userId);
            setInboxItems(prev => prev.map(item =>
                selectedItems.includes(item.id)
                    ? { ...item, assignedToId: userId, assignedTo: assignedUser?.user || null }
                    : item
            ));

            setSelectedItems([]);
            setBulkSelectMode(false);
        } catch (error) {
            console.error('Bulk assign error:', error);
            alert('Toplu atama sırasında hata oluştu.');
        } finally {
            setBulkAssigning(false);
        }
    };

    const handleBulkResolve = async () => {
        if (selectedItems.length === 0) return;
        try {
            setBulkAssigning(true);
            await Promise.all(
                selectedItems.map(convId =>
                    conversationAPI.updateStatus(currentWorkspace.id, convId, { status: 'RESOLVED' })
                )
            );
            setInboxItems(prev => prev.map(item =>
                selectedItems.includes(item.id) ? { ...item, status: 'RESOLVED' } : item
            ));
            setSelectedItems([]);
            setBulkSelectMode(false);
        } catch (error) {
            console.error('Bulk resolve error:', error);
            alert('Toplu çözme sırasında hata oluştu.');
        } finally {
            setBulkAssigning(false);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedItems.length === 0) return;
        if (!window.confirm(`${selectedItems.length} sohbeti silmek istediğinize emin misiniz?`)) return;
        try {
            setBulkAssigning(true);
            await Promise.all(
                selectedItems.map(convId =>
                    conversationAPI.delete(currentWorkspace.id, convId)
                )
            );
            setInboxItems(prev => prev.filter(item => !selectedItems.includes(item.id)));
            if (selectedItems.includes(selectedItem?.id)) setSelectedItem(null);
            setSelectedItems([]);
            setBulkSelectMode(false);
        } catch (error) {
            console.error('Bulk delete error:', error);
            alert('Toplu silme sırasında hata oluştu.');
        } finally {
            setBulkAssigning(false);
        }
    };

    const handleLeadStatusChange = async (leadId, newStatus) => {
        try {
            await leadsAPI.updateStatus(leadId, { status: newStatus });
            setInboxItems(prev => prev.map(i =>
                i.id === leadId ? { ...i, status: newStatus } : i
            ));
            if (selectedItem?.id === leadId) {
                setSelectedItem(prev => ({ ...prev, status: newStatus }));
            }
        } catch (error) {
            console.error('Error updating lead status:', error);
        }
    };

    // Toggle bot enabled/disabled for current conversation
    const handleBotToggle = async () => {
        if (!selectedItem || togglingBot) return;

        const newValue = !botEnabled;
        setTogglingBot(true);

        try {
            const response = await conversationAPI.toggleBot(currentWorkspace.id, selectedItem.id, newValue);
            setBotEnabled(newValue);
            console.log(`🤖 Bot ${newValue ? 'enabled' : 'disabled'} for conversation ${selectedItem.id}`);

            // Bot aktif edildiğinde assignedToId null olacak, UI'ı güncelle
            if (newValue && response.data?.assignedToId === null) {
                setSelectedItem(prev => ({
                    ...prev,
                    botEnabled: true,
                    assignedToId: null,
                    assignedTo: null
                }));
                // Inbox listesini de güncelle
                setInboxItems(prev => prev.map(item =>
                    item.id === selectedItem.id
                        ? { ...item, botEnabled: true, assignedToId: null, assignedTo: null }
                        : item
                ));
            }
        } catch (error) {
            console.error('Error toggling bot:', error);
            // Revert on error
            setBotEnabled(!newValue);
        } finally {
            setTogglingBot(false);
        }
    };
    // Quick Reply (Hazır Mesaj) functions
    const handleSaveQuickReply = async () => {
        if (!quickReplyForm.content) return;
        setSavingQuickReply(true);
        const payload = { ...quickReplyForm, title: quickReplyForm.content.substring(0, 30) };
        try {
            if (editingQuickReply) {
                await quickReplyAPI.update(currentWorkspace.id, editingQuickReply.id, payload);
            } else {
                await quickReplyAPI.create(currentWorkspace.id, payload);
            }
            const res = await quickReplyAPI.getAll(currentWorkspace.id);
            setQuickReplies(res.data);
            setEditingQuickReply(null);
            setQuickReplyForm({ content: '' });
        } catch (err) {
            console.error('Error saving quick reply:', err);
            alert('Hazır mesaj kaydedilemedi');
        } finally {
            setSavingQuickReply(false);
        }
    };

    const handleDeleteQuickReply = async (id) => {
        if (!confirm('Bu hazır mesajı silmek istediğinize emin misiniz?')) return;
        try {
            await quickReplyAPI.delete(currentWorkspace.id, id);
            setQuickReplies(prev => prev.filter(qr => qr.id !== id));
        } catch (err) {
            console.error('Error deleting quick reply:', err);
        }
    };

    const handleEditQuickReply = (qr) => {
        setEditingQuickReply(qr);
        setQuickReplyForm({ content: qr.content });
    };

    const handleSelectQuickReply = (qr) => {
        setNewMessage(qr.content);
        setShowQuickReplyDropdown(false);
    };

    // Konuşmayı üstlenme fonksiyonu
    const handleMessageChange = (e) => {
        const value = e.target.value;
        setNewMessage(value);
        
        if (isInternalNoteMode) {
            const cursorPos = e.target.selectionStart;
            const textBeforeCursor = value.substring(0, cursorPos);
            const atMatch = textBeforeCursor.match(/@(\w*)$/);
            if (atMatch) {
                setMentionQuery(atMatch[1].toLowerCase());
                setShowMentionDropdown(true);
                setMentionCursorPos(cursorPos);
            } else {
                setShowMentionDropdown(false);
            }
        } else {
            setShowMentionDropdown(false);
        }
    };

    const handleTakeOver = async () => {
        if (!selectedItem || takingOver) return;

        setTakingOver(true);

        try {
            const response = await conversationAPI.takeOver(currentWorkspace.id, selectedItem.id);
            if (response.data?.requiresConfirmation) {
                setOwnershipWarning({
                    ...response.data,
                    conversationId: selectedItem.id
                });
                return;
            }
            console.log(`👤 Conversation ${selectedItem.id} taken over by ${user.name}`);

            // UI'ı güncelle
            setBotEnabled(false); // Bot devre dışı
            setSelectedItem(prev => ({
                ...prev,
                assignedToId: user.id,
                assignedTo: { id: user.id, name: user.name, avatar: user.avatar },
                botEnabled: false,
                botDelayedUntil: null
            }));

            // Inbox listesini de güncelle
            setInboxItems(prev => prev.map(item =>
                item.id === selectedItem.id
                    ? {
                        ...item,
                        assignedToId: user.id,
                        assignedTo: { id: user.id, name: user.name },
                        botEnabled: false
                    }
                    : item
            ));

        } catch (error) {
            console.error('Error taking over conversation:', error);
            alert(error.response?.data?.error || 'Konuşma üstlenilirken hata oluştu');
        } finally {
            setTakingOver(false);
        }
    };

    // Konuşmayı takıma veya kişiye ata (atama kuralı destekli)
    const handleAssignConversation = async (teamId, agentId) => {
        if (!selectedItem) return;
        setAssignMegaMenuOpen(false); // Her durumda kapat
        try {
            const res = await conversationAPI.assignNew(currentWorkspace.id, selectedItem.id, { teamId, agentId });
            const conv = res.data.conversation;
            const agentName = conv.assignedTo?.name || members.find(m => (m.user?.id || m.userId || m.id) === agentId)?.user?.name || null;
            const updateFn = item => item.id === selectedItem.id
                ? {
                    ...item,
                    assignedToId: conv.assignedToId,
                    assignedTo: conv.assignedTo,
                    teamIds: conv.teamIds,
                    // Nested case objesini de güncelle
                    ...(item.case ? {
                        case: {
                            ...item.case,
                            assignedToId: agentId || item.case.assignedToId,
                            assignedTeamId: teamId || item.case?.assignedTeamId,
                            ...(conv.assignedTo ? { assignedTo: conv.assignedTo } : {})
                        }
                    } : {})
                }
                : item;
            setSelectedItem(prev => ({
                ...prev,
                assignedToId: conv.assignedToId,
                assignedTo: conv.assignedTo,
                teamIds: conv.teamIds,
                ...(prev.case ? {
                    case: {
                        ...prev.case,
                        assignedToId: agentId || prev.case.assignedToId,
                        assignedTeamId: teamId || prev.case?.assignedTeamId,
                        ...(conv.assignedTo ? { assignedTo: conv.assignedTo } : {})
                    }
                } : {})
            }));
            setInboxItems(prev => prev.map(updateFn));

            // Linked case varsa case atamasını da güncelle
            const linkedCaseId = selectedItem.caseId;
            if (linkedCaseId) {
                try {
                    await caseAPI.assign(currentWorkspace.id, linkedCaseId, {
                        assignedToId: agentId,
                        assignedTeamId: teamId
                    });
                } catch (_) {}
            }

            // Sidebar'ı bilgilendir — case assignment event
            window.dispatchEvent(new CustomEvent('websocket:case_assignment_updated', {
                detail: {
                    caseId: linkedCaseId,
                    assignedToId: agentId,
                    assignedTeamId: teamId,
                    assignedToName: agentName
                }
            }));
            window.dispatchEvent(new CustomEvent('case_cards_refresh'));
        } catch (e) {
            console.error('Assign error:', e);
            alert('Atama yapılamadı: ' + (e?.response?.data?.error || e?.message || 'Bilinmeyen hata'));
        }
    };

    // Üstlen — havuzdaki konuşmayı kendine al
    const handleClaimConversation = async () => {
        if (!selectedItem || takingOver) return;
        setTakingOver(true);
        try {
            const res = await conversationAPI.claim(currentWorkspace.id, selectedItem.id);
            if (res.data?.requiresConfirmation) {
                setOwnershipWarning({
                    ...res.data,
                    conversationId: selectedItem.id
                });
                return;
            }
            const conv = res.data.conversation;
            const assignData = { assignedToId: user.id, assignedTo: { id: user.id, name: user.name } };
            setSelectedItem(prev => ({
                ...prev,
                ...assignData,
                ...(prev.case ? { case: { ...prev.case, ...assignData } } : {})
            }));
            setInboxItems(prev => prev.map(item => item.id === selectedItem.id
                ? {
                    ...item,
                    ...assignData,
                    ...(item.case ? { case: { ...item.case, ...assignData } } : {})
                }
                : item));

            // Linked case varsa case atamasını da güncelle
            const linkedCaseId = selectedItem.caseId;
            if (linkedCaseId) {
                try {
                    await caseAPI.assign(currentWorkspace.id, linkedCaseId, {
                        assignedToId: user.id
                    });
                } catch (_) {}
            }

            // Sidebar'ı bilgilendir
            window.dispatchEvent(new CustomEvent('websocket:case_assignment_updated', {
                detail: {
                    caseId: linkedCaseId,
                    assignedToId: user.id,
                    assignedToName: user.name
                }
            }));
            window.dispatchEvent(new CustomEvent('case_cards_refresh'));
        } catch (e) {
            console.error('Claim error:', e);
        } finally {
            setTakingOver(false);
        }
    };

    const handleConversationStatusChange = async (conversationId, newStatus, closingStageId = null) => {
        console.log(`🔄 Attempting to update conversation ${conversationId} to status: ${newStatus}${closingStageId ? ` (closingStage: ${closingStageId})` : ''}`);
        console.log(`📌 Workspace ID: ${currentWorkspace?.id}`);
        try {
            // Capture caseId BEFORE state updates to avoid stale reference
            const currentItem = selectedItem?.id === conversationId ? selectedItem : inboxItems.find(i => i.id === conversationId);
            const linkedCaseId = currentItem?.caseId;

            const payload = { status: newStatus };
            if (closingStageId) payload.closingStageId = closingStageId;
            const response = await conversationAPI.updateStatus(currentWorkspace.id, conversationId, payload);
            console.log('📡 API Response:', response);

            // Backend returns closingStage.statusType (WON/LOST/CLOSED) — use this for closingStatus
            // When closingStageId is a direct status string (WON/LOST/CLOSED), backend returns closingStage=null
            // In that case, use closingStageId itself as the status type
            const directStatusValues = ['WON', 'LOST', 'CLOSED'];
            const isDirectStatus = closingStageId && directStatusValues.includes(closingStageId);
            const closingStatusType = response?.data?.closingStage?.statusType || (isDirectStatus ? closingStageId : null);

            // Only set funnelStageId when closingStageId is a real UUID (not a status string)
            const funnelStageUpdate = (closingStageId && !isDirectStatus) ? { funnelStageId: closingStageId } : {};

            setInboxItems(prev => prev.map(i =>
                i.id === conversationId ? { ...i, status: newStatus, closingStatus: closingStatusType, ...funnelStageUpdate } : i
            ));
            if (selectedItem?.id === conversationId) {
                setSelectedItem(prev => ({ ...prev, status: newStatus, closingStatus: closingStatusType, ...funnelStageUpdate }));
            }
            setClosingDropdownOpen(false);

            // Backend zaten case status'unu cascade ile güncelliyor + socket event gönderiyor
            // Burada sadece anında sidebar UI güncellemesi için local event dispatch ediyoruz
            if (linkedCaseId) {
                // Use the actual statusType (WON/LOST/CLOSED), whether from backend closingStage or direct status
                const caseStatus = (newStatus === 'RESOLVED')
                    ? (closingStatusType || 'CLOSED')
                    : 'ACTIVE';
                window.dispatchEvent(new CustomEvent('websocket:case_updated', {
                    detail: { caseId: linkedCaseId, changes: { status: caseStatus } }
                }));
                console.log(`✅ Case ${linkedCaseId} status dispatched locally: ${caseStatus}`);
            }

            loadInboxItems(false);
            console.log(`✅ Conversation ${conversationId} status updated to ${newStatus}`);
        } catch (error) {
            console.error('❌ Error updating conversation status:', error);
            console.error('Error details:', error.response?.data || error.message);
            alert('Sohbet durumu güncellenemedi: ' + (error.response?.data?.error || error.message));
        }
    };


    // Handle status change for FB/IG post-comment items (no DB — persisted in localStorage)
    const handleCommentStatusChange = (postId, newStatus) => {
        if (!currentWorkspace?.id || !postId) return;
        const key = `resolvedPosts_${currentWorkspace.id}`;
        setResolvedPostIds(prev => {
            const next = new Set(prev);
            if (newStatus === 'RESOLVED') {
                next.add(postId);
            } else {
                next.delete(postId);
            }
            try { localStorage.setItem(key, JSON.stringify([...next])); } catch (_) {}
            return next;
        });
        if (newStatus === 'RESOLVED' && !showResolved) {
            setInboxItems(prev => prev.filter(i => i.id !== postId));
            if (selectedItem?.id === postId) {
                setSelectedItem(null);
                setSelectedItemType(null);
            }
        }
    };


    const handleDeleteItem = async (item) => {
        if (!confirm('Bu öğeyi silmek istediğinize emin misiniz?')) return;

        try {
            console.log('🗑️ Deleting item:', item.id, 'Type:', item.inboxType, 'Channel:', item.channel);

            // Comments are not deletable
            if (item.inboxType === INBOX_TYPES.COMMENT) {
                alert('Yorumlar silinemez.');
                return;
            }

            // All conversations (MESSAGE, EMAIL, LEAD channel) - use conversation delete API
            const response = await conversationAPI.delete(currentWorkspace.id, item.id);
            console.log('✅ Delete response:', response.data);

            // Clear selection if deleted item was selected
            if (selectedItem?.id === item.id) {
                setSelectedItem(null);
                setSelectedItemType(null);
                setMessages([]);
            }

            // Remove from local state immediately for better UX
            setInboxItems(prev => prev.filter(i => i.id !== item.id));

        } catch (error) {
            console.error('❌ Error deleting item:', error);
            alert('Silme işlemi başarısız: ' + (error.response?.data?.error || error.message));
        }
    };

    const handleArchiveConversation = async (conversationId, archive = true) => {
        try {
            if (archive) {
                await conversationAPI.archive(currentWorkspace.id, conversationId);
            } else {
                await conversationAPI.unarchive(currentWorkspace.id, conversationId);
            }
            loadInboxItems(false);
            if (typeof setContextMenu === 'function') setContextMenu(null);
        } catch (error) {
            console.error('Archive error:', error);
        }
    };

    const formatTime = (date) => {
        if (!date) return '';
        const d = new Date(date);
        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();

        if (isToday) {
            return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        } else {
            return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        }
    };

    const hasReminder = (item) => {
        if (!item.contact?.id && !item.contactId) return false;
        const cid = item.contact?.id || item.contactId;

        return appointments.some(apt => {
            // Primary: match by contactId (exact)
            if (apt.contactId && apt.contactId === cid) return true;
            // Fallback: match by phone only (name matching causes false positives with generic names)
            if (apt.contactPhone && item.contact?.phone && apt.contactPhone.trim() === item.contact.phone.trim()) return true;
            return false;
        });
    };

    const getItemIcon = (item) => {
        if (item.inboxType === INBOX_TYPES.EMAIL || item.channel === 'EMAIL') {
            return <Mail size={14} className="item-type-icon email" />;
        } else if (item.inboxType === INBOX_TYPES.COMMENT && item.platform === 'INSTAGRAM') {
            return <Instagram size={14} className="item-type-icon instagram" />;
        } else if (item.inboxType === INBOX_TYPES.COMMENT) {
            return <Facebook size={14} className="item-type-icon facebook" />;
        } else if (item.channel === 'WHATSAPP' || item.whatsappPhoneNumberId) {
            return <MessageCircle size={14} className="item-type-icon whatsapp" />;
        } else if (item.channel === 'INSTAGRAM' || item.instagramBusinessId) {
            return <Instagram size={14} className="item-type-icon instagram" />;
        } else if (item.channel === 'WIDGET' || item.channel === 'FORM') {
            return <Globe size={14} className="item-type-icon widget" />;
        } else if (item.channel === 'FACEBOOK' || item.facebookPageId || item.channel === 'LEAD') {
            return <Facebook size={14} className="item-type-icon facebook" />;
        } else {
            return <MessageSquare size={14} className="item-type-icon" />;
        }
    };

    const getItemName = (item) => {
        if (item.inboxType === INBOX_TYPES.COMMENT) {
            return item.message?.substring(0, 40) || 'Gönderi';
        } else {
            return item.contact?.name || item.contact?.email?.split('@')[0] || 'Bilinmeyen';
        }
    };

    const getItemPreview = (item) => {
        if (item.inboxType === INBOX_TYPES.COMMENT) {
            return `${item.comments?.summary?.total_count || 0} yorum`;
        } else {
            return item.messages?.[0]?.content?.substring(0, 60) || 'Mesaj yok';
        }
    };

    const getFilterCounts = () => {
        const counts = {
            all: inboxItems.length,
            messages: inboxItems.filter(i => i.inboxType === INBOX_TYPES.MESSAGE).length,
            comments: inboxItems.filter(i => i.inboxType === INBOX_TYPES.COMMENT).length,
            emails: inboxItems.filter(i => i.inboxType === INBOX_TYPES.EMAIL).length,
            leads: inboxItems.filter(i => i.channel === 'LEAD').length // Count by channel, not inboxType
        };
        return counts;
    };

    if (!currentWorkspace) {
        return (
            <div className="inbox-empty-state">
                <InboxIcon size={48} />
                <p>{t('common.selectWorkspace')}</p>
            </div>
        );
    }

    return (
        <div className={`inbox-page${selectedItem ? ' has-selected' : ''}`}>
            {/* Left Panel - Inbox List */}
            <div className={`inbox-list-panel${viewMode === 'pipeline' ? ' pipeline-mode' : ''}`}>
                <div className="inbox-header">
                    <div className="inbox-header-top">
                        <div className="inbox-header-left">
                            <h2>
                                <InboxIcon size={20} />
                                Inbox
                            </h2>
                            <button
                                className="new-conversation-btn"
                                onClick={() => {
                                    setShowNewConversationModal(true);
                                }}
                                title="Yeni Görüşme Başlat"
                            >
                                <Plus size={14} />
                                <span>{t('inbox.newConversation')}</span>
                            </button>
                            <button
                                className="inbox-refresh-btn"
                                onClick={() => loadInboxItems()}
                                disabled={loading}
                                title="Yenile"
                            >
                                <RefreshCw size={16} className={loading ? 'spin' : ''} />
                            </button>
                            <button
                                className={`inbox-view-toggle-btn ${viewMode === 'pipeline' ? 'active' : ''}`}
                                onClick={() => setViewMode(v => v === 'chat' ? 'pipeline' : 'chat')}
                                title={viewMode === 'chat' ? 'Pipeline Görünümüne Geç' : 'Sohbet Görünümüne Geç'}
                            >
                                {viewMode === 'chat'
                                    ? <KanbanSquare size={16} />
                                    : <MessageSquareDot size={16} />}
                            </button>
                        </div>
                    </div>
                </div>
                {viewMode === 'pipeline' && (
                    <div className="inbox-pipeline-embed">
                        <PipelineView />
                    </div>
                )}
                {/* ── Compact Bar: Search + Filtreler ── */}
                <div className={`inbox-compact-bar${viewMode === 'pipeline' ? ' hidden-in-pipeline' : ''}`}>
                    <div className="inbox-compact-search">
                        <Search size={15} className="search-icon" />
                        <input
                            type="text"
                            placeholder="Ara..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="inbox-compact-actions" ref={filterPanelRef}>
                        <button
                            className={`inbox-filter-toggle-btn ${filterPanelOpen ? 'active' : ''}`}
                            onClick={() => setFilterPanelOpen(prev => !prev)}
                        >
                            <SlidersHorizontal size={15} />
                            <span>Filtreler</span>
                            {(() => {
                                let count = 0;
                                if (activeFilters.length < allFilters.length) count += (allFilters.length - activeFilters.length);
                                if (showResolved) count++;
                                if (showOnlyAssigned) count++;
                                if (showAssignedToMe) count++;
                                if (statusFilter) count++;
                                if (agentFilter) count++;
                                if (quickFilter) count++;
                                return count > 0 ? <span className="fp-badge">{count}</span> : null;
                            })()}
                        </button>

                        {/* ── Filter Panel (açılır) ── */}
                        {filterPanelOpen && (
                            <div className="inbox-filter-panel">
                                {/* Kanal Filtreleri */}
                                <div className="fp-section">
                                    <div className="fp-section-title">
                                        Kanallar
                                        <button
                                            className="fp-toggle-all"
                                            onClick={() => {
                                                const channelFilters = ['whatsapp', 'facebook', 'instagram', 'web_widget', 'web_form', 'emails', 'leads', 'phone_calls', 'notes'];
                                                const allChecked = channelFilters.every(f => activeFilters.includes(f));
                                                if (allChecked) {
                                                    setActiveFilters(prev => prev.filter(f => !channelFilters.includes(f)));
                                                } else {
                                                    setActiveFilters(prev => [...new Set([...prev, ...channelFilters])]);
                                                }
                                            }}
                                        >
                                            {['whatsapp', 'facebook', 'instagram', 'web_widget', 'web_form', 'emails', 'leads', 'phone_calls', 'notes'].every(f => activeFilters.includes(f)) ? 'Kaldır' : 'Seç'}
                                        </button>
                                    </div>
                                    <div className="fp-chips">
                                        {[
                                            { key: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle size={13} className="icon-whatsapp" /> },
                                            { key: 'facebook', label: 'Facebook', icon: <Facebook size={13} className="icon-facebook" /> },
                                            { key: 'instagram', label: 'Instagram', icon: <Instagram size={13} className="icon-instagram" /> },
                                            { key: 'web_widget', label: 'Widget', icon: <MessageSquare size={13} className="icon-widget" /> },
                                            { key: 'web_form', label: 'Form', icon: <FileText size={13} className="icon-form" /> },
                                            { key: 'emails', label: 'E-posta', icon: <Mail size={13} className="icon-email" /> },
                                            { key: 'leads', label: 'Leads', icon: <UserCheck size={13} className="icon-leads" /> },
                                            { key: 'phone_calls', label: 'Arama', icon: <Phone size={13} className="icon-phone" /> },
                                        ].map(ch => (
                                            <button
                                                key={ch.key}
                                                className={`fp-chip ${activeFilters.includes(ch.key) ? 'active' : ''}`}
                                                onClick={() => toggleFilter(ch.key)}
                                            >
                                                {ch.icon}
                                                <span>{ch.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Yorum Filtreleri */}
                                <div className="fp-section">
                                    <div className="fp-section-title">Yorumlar</div>
                                    <div className="fp-chips">
                                        {[
                                            { key: 'fb_comments', label: 'FB Yorum', icon: <Facebook size={13} className="icon-facebook" /> },
                                            { key: 'ig_comments', label: 'IG Yorum', icon: <Instagram size={13} className="icon-instagram" /> },
                                        ].map(ch => (
                                            <button
                                                key={ch.key}
                                                className={`fp-chip ${activeFilters.includes(ch.key) ? 'active' : ''}`}
                                                onClick={() => toggleFilter(ch.key)}
                                            >
                                                {ch.icon}
                                                <span>{ch.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="fp-divider" />

                                {/* Toggle'lar */}
                                <div className="fp-section">
                                    <div className="fp-toggles">
                                        <label className="fp-toggle-item">
                                            <input type="checkbox" checked={showResolved} onChange={() => setShowResolved(!showResolved)} />
                                            <span>Kapatılanları Göster</span>
                                        </label>
                                        <label className="fp-toggle-item" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#64748b' }}>
                                            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                                            <span>Arşivlenenler</span>
                                        </label>
                                        <label className="fp-toggle-item">
                                            <input type="checkbox" checked={showOnlyAssigned} onChange={() => setShowOnlyAssigned(!showOnlyAssigned)} />
                                            <span>Atanmayanları Göster</span>
                                        </label>
                                        <label className="fp-toggle-item">
                                            <input type="checkbox" checked={showAssignedToMe} onChange={() => setShowAssignedToMe(!showAssignedToMe)} />
                                            <span>Bana Atananlar</span>
                                        </label>
                                        <label className="fp-toggle-item" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#64748b' }}>
                                            <input type="checkbox" checked={hideUnanswered} onChange={(e) => setHideUnanswered(e.target.checked)} />
                                            <span>🔇 Cevapsızları Gizle</span>
                                        </label>
                                        <label className="fp-toggle-item" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#64748b' }}>
                                            <input type="checkbox" checked={showBulk} onChange={(e) => setShowBulk(e.target.checked)} />
                                            <span>📢 Toplu Gönderimler</span>
                                        </label>
                                    </div>
                                </div>

                                <div className="fp-divider" />

                                {/* Temsilci Filtresi (sadece OWNER) */}
                                {isOwner && members.length > 0 && (
                                    <div className="fp-section">
                                        <div className="fp-section-title">Temsilci</div>
                                        <select
                                            className="fp-select"
                                            value={agentFilter || ''}
                                            onChange={(e) => setAgentFilter(e.target.value || null)}
                                        >
                                            <option value="">Tüm Temsilciler</option>
                                            <option value="__unassigned__">Atanmamış</option>
                                            {members.map(m => (
                                                <option key={m.user?.id} value={m.user?.id}>{m.user?.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Durum Filtresi */}
                                <div className="fp-section">
                                    <div className="fp-section-title">Durum / Aşama</div>
                                    <select
                                        className="fp-select"
                                        value={statusFilter ? `${funnelFilter || ''}::${statusFilter}` : ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (!val) {
                                                setStatusFilter(null);
                                                setFunnelFilter(null);
                                            } else {
                                                const [fv, sv] = val.split('::');
                                                setFunnelFilter(fv || null);
                                                setStatusFilter(sv);
                                            }
                                            currentPageRef.current = 1;
                                            setCurrentPage(1);
                                        }}
                                    >
                                        <option value="">Tüm Durumlar</option>
                                        {funnelOptions.filter(f => f.value && f.stages).map(funnel => (
                                            <optgroup key={funnel.value} label={funnel.label}>
                                                {funnel.stages.map(stage => (
                                                    <option key={stage.value} value={`${funnel.value}::${stage.value}`}>
                                                        {stage.label}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        ))}
                                    </select>
                                </div>

                                <div className="fp-divider" />

                                {/* Tarih */}
                                <div className="fp-section">
                                    <div className="fp-section-title">Tarih</div>
                                    <div className="fp-chips">
                                        {[
                                            { key: null, label: 'Tümü' },
                                            { key: 'today', label: 'Bugün' },
                                            { key: 'yesterday', label: 'Dün' },
                                            { key: 'week', label: 'Bu Hafta' },
                                            { key: 'month', label: 'Bu Ay' },
                                            { key: 'unread', label: 'Okunmamış' },
                                            { key: 'custom', label: 'Özel Tarih' },
                                        ].map(p => (
                                            <button
                                                key={p.key || 'ALL'}
                                                className={`fp-chip ${quickFilter === p.key ? 'active' : ''}`}
                                                onClick={() => {
                                                    setQuickFilter(quickFilter === p.key ? null : p.key);
                                                    if (p.key !== 'custom') {
                                                        setCustomDateStart(null);
                                                        setCustomDateEnd(null);
                                                    }
                                                }}
                                            >
                                                <span>{p.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                    {quickFilter === 'custom' && (
                                        <div className="fp-custom-dates" style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                                            <DatePicker
                                                selected={customDateStart}
                                                onChange={(date) => setCustomDateStart(date)}
                                                placeholderText="Başlangıç"
                                                dateFormat="dd/MM/yyyy"
                                                className="fp-date-input"
                                                isClearable
                                            />
                                            <span style={{ color: '#94a3b8', fontSize: 12 }}>→</span>
                                            <DatePicker
                                                selected={customDateEnd}
                                                onChange={(date) => setCustomDateEnd(date)}
                                                placeholderText="Bitiş"
                                                dateFormat="dd/MM/yyyy"
                                                className="fp-date-input"
                                                isClearable
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="fp-divider" />

                                {/* Sıfırla */}
                                <div className="fp-section">
                                    <button
                                        className="fp-reset-btn"
                                        onClick={() => {
                                            setActiveFilters(allFilters);
                                            setShowResolved(false);
                                            setShowOnlyAssigned(false);
                                            setShowAssignedToMe(false);
                                            setStatusFilter(null);
                                            setFunnelFilter(null);
                                            setAgentFilter(null);
                                            setQuickFilter(null);
                                            setCustomDateStart(null);
                                            setCustomDateEnd(null);
                                            setSearchTerm('');
                                            setFilterPanelOpen(false);
                                        }}
                                    >
                                        Filtreleri Sıfırla
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Bulk Selection Toolbar */}
                <div className={`bulk-selection-toolbar${viewMode === 'pipeline' ? ' hidden-in-pipeline' : ''}`}>
                    <div className="toolbar-row">

                        {/* Toplu Seç butonu + açılan dropdown */}
                        <div className="bulk-toggle-wrapper">
                            <button
                                className={`bulk-select-toggle ${bulkSelectMode ? 'active' : ''}`}
                                onClick={() => {
                                    setBulkSelectMode(!bulkSelectMode);
                                    if (bulkSelectMode) setSelectedItems([]);
                                }}
                            >
                                <CheckCircle2 size={14} />
                                {bulkSelectMode
                                    ? (selectedItems.length > 0 ? `${selectedItems.length} seçili ▾` : 'İptal')
                                    : 'Toplu Seç'}
                            </button>

                            {bulkSelectMode && (
                                <div className="bulk-dropdown-panel">
                                    <label className="bdp-row select-all-row">
                                        <input
                                            type="checkbox"
                                            checked={selectedItems.length === inboxItems.filter(item => !(!showResolved && item.status === 'RESOLVED')).length && selectedItems.length > 0}
                                            onChange={(e) => handleSelectAll(e.target.checked)}
                                        />
                                        <span>Tümünü Seç</span>
                                        {selectedItems.length > 0 && <span className="bdp-count">{selectedItems.length}</span>}
                                    </label>

                                    {selectedItems.length > 0 && (
                                        <>
                                            <div className="bdp-divider" />
                                            <div className="bdp-row">
                                                <select
                                                    className="bdp-assign-select"
                                                    onChange={(e) => handleBulkAssign(e.target.value)}
                                                    disabled={bulkAssigning}
                                                    value=""
                                                >
                                                    <option value="">👤 Temsilci ata...</option>
                                                    {members.map(m => (
                                                        <option key={m.userId} value={m.userId}>
                                                            {(onlineUsers.get(m.userId)?.isOnline || m.user?.isOnline) ? '🟢' : '⚪'} {m.user?.name || m.user?.email}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="bdp-row bdp-actions">
                                                <button
                                                    className="bdp-btn resolve"
                                                    onClick={handleBulkResolve}
                                                    disabled={bulkAssigning}
                                                >
                                                    {bulkAssigning ? <Loader size={13} className="spin" /> : <CheckCircle2 size={13} />}
                                                    Çözüldü
                                                </button>
                                                <button
                                                    className="bdp-btn delete"
                                                    onClick={handleBulkDelete}
                                                    disabled={bulkAssigning}
                                                >
                                                    <Trash2 size={13} />
                                                    Sil
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Takım/Akış Seçici */}
                        <select
                            value={funnelFilter || ''}
                            onChange={(e) => {
                                setFunnelFilter(e.target.value || null);
                                setStatusFilter(null);
                                setCurrentPage(1);
                                if (currentPageRef) currentPageRef.current = 1;
                            }}
                            style={{
                                height: '28px',
                                borderRadius: '14px',
                                border: funnelFilter ? '1.5px solid #6366f1' : '1px solid #cbd5e1',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                padding: '0 12px',
                                cursor: 'pointer',
                                background: funnelFilter ? '#eef2ff' : '#ffffff',
                                color: funnelFilter ? '#4f46e5' : '#1e293b',
                                minWidth: '150px',
                                flexShrink: 0,
                                appearance: 'none',
                                WebkitAppearance: 'none',
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                                backgroundRepeat: 'no-repeat',
                                backgroundPosition: 'right 8px center',
                                paddingRight: '24px'
                            }}
                        >
                            <option value="">Tümü</option>
                            {funnelOptions.filter(f => f.value).map(funnel => {
                                const count = inboxItems.filter(item => item.contact?.funnelType === funnel.value).length;
                                return (
                                    <option key={funnel.value} value={funnel.value}>
                                        {funnel.label} {count > 0 ? `(${count})` : ''}
                                    </option>
                                );
                            })}
                        </select>
                    </div>
                </div>

                {/* Inbox Items List */}
                <div className={`inbox-items${viewMode === 'pipeline' ? ' hidden-in-pipeline' : ''}`}>
                    {loading ? (
                        <div className="inbox-loading">
                            <RefreshCw size={24} className="spin" />
                            <p>{t('common.loading')}</p>
                        </div>
                    ) : displayedItems.filter(item => {
                        // Hide resolved conversations unless showResolved is true
                        if (!showResolved && item.inboxType === INBOX_TYPES.MESSAGE && item.status === 'RESOLVED') {
                            return false;
                        }
                        if (!showArchived && item.isArchived) {
                            return false; // Skip archived conversations
                        }
                        // Hide assigned conversations if showOnlyAssigned is true (show only unassigned)
                        if (showOnlyAssigned) {
                            const isAssigned = (item.assignedToId && item.assignedToId !== '') || item.assignedTo;
                            if (isAssigned) {
                                return false;
                            }
                        }
                        // Show only my assigned conversations
                        if (showAssignedToMe && item.assignedToId !== user?.id) {
                            return false;
                        }
                        return true;
                    }).length === 0 ? (
                        <div className="inbox-empty">
                            <InboxIcon size={40} />
                            <p>Öğe bulunamadı</p>
                            {!showResolved && (
                                <button
                                    className="show-resolved-btn"
                                    onClick={() => setShowResolved(true)}
                                >
                                    Kapatılanları Göster
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            {displayedItems.filter((item, index, allItems) => {
                                // Hide resolved conversations unless showResolved is true
                                if (!showResolved && item.inboxType === INBOX_TYPES.MESSAGE && item.status === 'RESOLVED') {
                                    return false;
                                }
                                if (!showArchived && item.isArchived) {
                                    return false; // Skip archived conversations
                                }
                                // Hide assigned conversations if showOnlyAssigned is true (show only unassigned)
                                if (showOnlyAssigned) {
                                    const isAssigned = (item.assignedToId && item.assignedToId !== '') || item.assignedTo;
                                    if (isAssigned) {
                                        return false;
                                    }
                                }
                                // Show only my assigned conversations
                                if (showAssignedToMe && item.assignedToId !== user?.id) {
                                    return false;
                                }

                                // Hide duplicate Instagram leads if Facebook lead exists with same phone/email
                                if (item.inboxType === INBOX_TYPES.LEAD && item.channel === 'INSTAGRAM') {
                                    // Get phone and email from lead data
                                    const itemPhone = item.phone || item.leadData?.phone_number || item.leadData?.telefon_numarasi;
                                    const itemEmail = item.email || item.leadData?.email || item.leadData?.e_posta;

                                    // Check if there's a Facebook lead with same phone or email
                                    const hasFacebookDuplicate = allItems.some(otherItem =>
                                        otherItem.inboxType === INBOX_TYPES.LEAD &&
                                        otherItem.channel === 'FACEBOOK' &&
                                        otherItem.id !== item.id &&
                                        (
                                            (itemPhone && (otherItem.phone === itemPhone || otherItem.leadData?.phone_number === itemPhone || otherItem.leadData?.telefon_numarasi === itemPhone)) ||
                                            (itemEmail && (otherItem.email === itemEmail || otherItem.leadData?.email === itemEmail || otherItem.leadData?.e_posta === itemEmail))
                                        )
                                    );

                                    if (hasFacebookDuplicate) {
                                        return false; // Hide Instagram lead if Facebook duplicate exists
                                    }
                                }

                                return true;
                            }).map((item) => {
                                // Pre-compute values for the card
                                let funnel = item.funnelType ? funnelOptions.find(f => f.value === item.funnelType) : null;
                                let funnelName = funnel?.label || 'Genel';
                                let funnelColor = funnel?.color || '#94a3b8';
                                let funnelIcon = funnel?.icon || '📋';

                                // Stage name resolution
                                let stageName = null;
                                const effectiveStageId = item.funnelStageId || item._effectiveStageId || item.contact?.funnelStageId;
                                if (effectiveStageId && funnel?.stages) {
                                    const stage = funnel.stages.find(s => s.value === effectiveStageId || s.id === effectiveStageId);
                                    stageName = stage?.label || stage?.name || null;
                                }
                                if (!stageName && effectiveStageId) {
                                    for (const f of funnelOptions) {
                                        if (!f.stages) continue;
                                        const s = f.stages.find(s => s.value === effectiveStageId || s.id === effectiveStageId);
                                        if (s) {
                                            stageName = s.label || s.name;
                                            // funnelType null veya yanlışsa → stage'den bulunan akış bilgilerini kullan
                                            if (!funnel || !funnel.stages?.some(fs => (fs.value || fs.id) === effectiveStageId)) {
                                                funnel = f;
                                                funnelName = f.label || 'Genel';
                                                funnelColor = f.color || '#94a3b8';
                                                funnelIcon = f.icon || '📋';
                                            }
                                            break;
                                        }
                                    }
                                }

                                // Team name
                                let teamName = null;
                                if (item.teamIds && item.teamIds !== '[]') {
                                    try {
                                        const teamIdList = JSON.parse(item.teamIds);
                                        if (teamIdList.length > 0) {
                                            const findTeamById = (list, id) => {
                                                for (const t of list) {
                                                    if (t.id === id) return t;
                                                    if (t.children) { const found = findTeamById(t.children, id); if (found) return found; }
                                                }
                                                return null;
                                            };
                                            const team = findTeamById(teams, teamIdList[0]);
                                            teamName = team?.name || null;
                                        }
                                    } catch (e) {}
                                }

                                // Contact tags - robust parsing
                                let contactTags = [];
                                try {
                                    const raw = item.contact?.tags;
                                    if (raw && raw !== '[]' && raw !== '') {
                                        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                                        contactTags = Array.isArray(parsed) ? parsed : [];
                                    }
                                } catch (e) {
                                    console.warn('[Tags] Parse error for contact:', item.contact?.name, 'raw:', item.contact?.tags, e);
                                }

                                // Subject line
                                const subject = item.emailSubject || item.contact?.notes?.substring(0, 50) || '';

                                // Activity entries: prefer plannedActivityMap, fallback to backend's hasPlannedCall/hasPlannedMeeting
                                const cid = item.contactId || item.contact?.id;
                                let activityEntries = cid ? (plannedActivityMap[cid] || []) : [];
                                // Fallback: if map is empty for this contact, use backend conversation flags
                                if (activityEntries.length === 0) {
                                    const fallback = [];
                                    if (item.hasPlannedCall) fallback.push({ type: 'CALL', status: 'PLANNED', dueDate: item.nextActivityDate });
                                    if (item.hasPlannedMeeting) fallback.push({ type: 'MEETING', status: 'PLANNED', dueDate: item.nextActivityDate });
                                    if (item.hasPlannedAppointment) fallback.push({ type: 'APPOINTMENT', status: 'PLANNED', dueDate: item.nextActivityDate });
                                    activityEntries = fallback;
                                }
                                const hasApt = hasReminder(item);

                                return (
                                <div
                                    key={`${item.inboxType}-${item.id}`}
                                    className={`inbox-item ${selectedItem?.id === item.id ? 'active' : ''} ${item.unreadCount > 0 ? 'unread' : ''} ${selectedItems.includes(item.id) ? 'bulk-selected' : ''}`}
                                    onClick={() => bulkSelectMode ? handleToggleSelect(item.id, !selectedItems.includes(item.id)) : handleSelectItem(item)}
                                >
                                    {bulkSelectMode && (
                                        <div className="bulk-select-checkbox" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={selectedItems.includes(item.id)}
                                                onChange={(e) => handleToggleSelect(item.id, e.target.checked)}
                                            />
                                        </div>
                                    )}
                                    {/* Avatar + Kanal Overlay */}
                                    <div className="inbox-item-avatar">
                                        {item.inboxType === INBOX_TYPES.COMMENT && item.full_picture ? (
                                            <img src={item.full_picture} alt="post" className="post-thumb" />
                                        ) : (
                                            <User size={18} />
                                        )}
                                        <span className="inbox-avatar-channel">
                                            {getItemIcon(item)}
                                        </span>
                                        {item.channel === 'LEAD' && (
                                            <span style={{
                                                fontSize: '0.5rem', fontWeight: 700, color: '#6366f1',
                                                background: '#eef2ff', border: '1px solid #c7d2fe',
                                                borderRadius: 3, padding: '0px 3px', marginTop: 2,
                                                display: 'block', textAlign: 'center', lineHeight: 1.4
                                            }}>LEAD</span>
                                        )}
                                    </div>
                                    <div className="inbox-item-content">
                                        {/* ── Row 1: Name + Time + Unread Count ── */}
                                        <div className="inbox-item-header">
                                            <span className="inbox-item-name">
                                                {getItemName(item)}
                                                {item.isArchived && <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 4 }}>📥</span>}
                                            </span>
                                            <div className="inbox-item-header-right">
                                                {(item.unreadCount || 0) > 0 && (
                                                    <span className="unread-badge">{item.unreadCount}</span>
                                                )}
                                                <span className="inbox-item-time">
                                                    {formatTime(item.sortDate)}
                                                </span>
                                            </div>
                                        </div>

                                        {/* ── Row 2: Last message preview ── */}
                                        <div className="inbox-item-preview">
                                            {getItemPreview(item)}
                                        </div>

                                        {/* ── Row 3: Flow/Stage | Team/Person ── */}
                                        <div className="inbox-item-footer" style={{ gap: 3 }}>
                                            <div className="inbox-footer-left" style={{ gap: 3, flexWrap: 'nowrap', overflow: 'hidden' }}>
                                                {/* Akış + Aşama (compact) */}
                                                <span className="classification-badge" title={`${funnelName}${stageName ? ' / ' + stageName : ''}`} style={{
                                                    background: `${funnelColor}15`,
                                                    color: funnelColor,
                                                    border: `1px solid ${funnelColor}30`,
                                                    fontSize: '0.58rem', padding: '1px 5px', borderRadius: 4, maxWidth: 130,
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                    display: 'inline-flex', alignItems: 'center', gap: 2, lineHeight: 1.3
                                                }}>
                                                    <Target size={9} style={{ flexShrink: 0 }} /> {funnelName}{stageName ? ` / ${stageName}` : ''}
                                                </span>

                                                {/* Takım + Atanan (compact icon style) */}
                                                {(teamName || item.assignedTo) && (
                                                    <span className="team-assign-badge" title={`${teamName || 'Havuz'} / ${item.assignedTo?.name || 'Havuz'}`} style={{
                                                        fontSize: '0.58rem', padding: '1px 5px', borderRadius: 4, maxWidth: 120,
                                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                        display: 'inline-flex', alignItems: 'center', gap: 2, lineHeight: 1.3
                                                    }}>
                                                        <Users size={9} style={{ flexShrink: 0 }} /> {teamName || ''}{item.assignedTo?.name ? ` / ${item.assignedTo.name.split(' ')[0]}` : ' / Havuz'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* ── Row 4: Tiny Contact Tags ── */}
                                        {contactTags.length > 0 && (
                                            <div className="inbox-item-tags">
                                                {contactTags.slice(0, 4).map((tag, i) => (
                                                    <span key={i} className="inbox-micro-tag">{typeof tag === 'string' ? tag : tag.name || tag.label || ''}</span>
                                                ))}
                                                {contactTags.length > 4 && (
                                                    <span className="inbox-micro-tag more">+{contactTags.length - 4}</span>
                                                )}
                                            </div>
                                        )}

                                        {/* ── Row 4b: Topic/Subject under tags ── */}
                                        {item.aiTopic && (
                                            <div style={{
                                                fontSize: '0.68rem', color: '#6b7280', fontWeight: 500,
                                                padding: '0 2px', marginTop: 1, overflow: 'hidden',
                                                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                display: 'flex', alignItems: 'center', gap: 3
                                            }}>
                                                {item.aiTopic}
                                            </div>
                                        )}

                                        {/* ── Row 5: Phone + Activity Icons (en alt) ── */}
                                        {(item.contact?.phone || item.contact?.email || activityEntries.length > 0 || hasApt) && (
                                            <div className="inbox-item-sub-row">
                                                <div className="inbox-sub-row-left">
                                                    {item.contact?.phone && (
                                                        <span className="inbox-item-phone">📱 {item.contact.phone}</span>
                                                    )}
                                                    {item.contact?.email && !item.contact?.phone && (
                                                        <span className="inbox-item-phone">✉ {item.contact.email}</span>
                                                    )}
                                                </div>
                                                {/* Activity Icons - sağ taraf */}
                                                {(() => {
                                                    if (activityEntries.length === 0 && !hasApt) return null;
                                                    const iconMap = (done, isOverdue) => {
                                                        // Yeşil=yapıldı, Turuncu=açık, Kırmızı=gecikti
                                                        const c = done ? '#10b981' : (isOverdue ? '#ef4444' : '#f97316');
                                                        return {
                                                            NOTE:        <StickyNote size={13} color={c} />,
                                                            CALL:        <PhoneCall size={13} color={c} />,
                                                            MEETING:     <CalendarDays size={13} color={c} />,
                                                            APPOINTMENT: <CalendarDays size={13} color={c} />,
                                                            REMINDER:    <Bell size={13} color={c} />,
                                                            TASK:        <Bell size={13} color={c} />,
                                                            VISIT:       <MapPin size={13} color={c} />,
                                                        };
                                                    };
                                                    return (
                                                        <span className="planned-activity-badges"
                                                            onClick={e => { e.stopPropagation(); setSelectedItem(item); setShowContactSidebar(true); }}
                                                            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                                                            title="Aktiviteleri gör"
                                                        >
                                                            {activityEntries.map((e, idx) => {
                                                                const done = e.status === 'COMPLETED';
                                                                const isOverdue = !done && e.dueDate && new Date(e.dueDate) < new Date();
                                                                // Yeşil=yapıldı, Turuncu=açık, Kırmızı=gecikti
                                                                const bg = done ? '#dcfce7' : (isOverdue ? '#fee2e2' : '#fff7ed');
                                                                const brd = `1px solid ${done ? '#86efac' : (isOverdue ? '#fca5a5' : '#fdba74')}`;
                                                                // AI/İnsan göstergesi
                                                                const isAI = e.source === 'AI' || e.source === 'RETELL' || e.assignedByType === 'AI';
                                                                const callerLabel = isAI ? '🤖' : (e.assigneeName ? e.assigneeName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase() : '');
                                                                return (
                                                                    <span key={idx}
                                                                        className={`activity-badge-icon ${done ? 'done' : 'planned'}`}
                                                                        title={`${e.type} - ${done ? 'Tamamlandı' : (isOverdue ? 'Gecikti' : 'Planlandı')}${e.assigneeName ? ' • ' + e.assigneeName : ''}${isAI ? ' • AI' : ''}`}
                                                                        style={{
                                                                            display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                                                            minWidth: 22, height: callerLabel ? 30 : 22, borderRadius: callerLabel ? 11 : '50%',
                                                                            background: bg, border: brd, padding: callerLabel ? '1px 3px' : 0, gap: 0
                                                                        }}
                                                                    >
                                                                        {iconMap(done, isOverdue)[e.type] || <Bell size={13} color={done ? '#10b981' : (isOverdue ? '#ef4444' : '#f97316')} />}
                                                                        {callerLabel && (
                                                                            <span style={{ fontSize: '0.45rem', lineHeight: 1, fontWeight: 700, color: isAI ? '#6366f1' : '#374151', marginTop: -1 }}>
                                                                                {callerLabel}
                                                                            </span>
                                                                        )}
                                                                    </span>
                                                                );
                                                            })}
                                                            {hasApt && (
                                                                <span className="reminder-indicator" title="Hatırlatıcı var"
                                                                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: '#fee2e2', border: '1px solid #fca5a5' }}
                                                                >
                                                                    <Bell size={13} color="#ef4444" />
                                                                </span>
                                                            )}
                                                        </span>
                                                    );
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                );
                            })}

                            {/* Load More Button */}
                            {hasMore && inboxItems.length > 0 && (
                                <button
                                    className="load-more-btn"
                                    onClick={loadMoreItems}
                                    disabled={loadingMore}
                                >
                                    {loadingMore ? (
                                        <>
                                            <RefreshCw size={16} className="spin" />
                                            Yükleniyor...
                                        </>
                                    ) : (
                                        <>
                                            Daha Fazla Yükle
                                        </>
                                    )}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Middle Panel - Detail View */}
            <div className={`inbox-detail-panel${viewMode === 'pipeline' ? ' hidden-in-pipeline' : ''}${showContactSidebar && selectedItem && viewMode !== 'pipeline' ? ' sidebar-open' : ''}`}>
                {selectedItem ? (
                    <>
                        {/* Message/Email Detail View */}
                        {(selectedItemType === INBOX_TYPES.MESSAGE || selectedItemType === INBOX_TYPES.EMAIL) && (
                            <>
                                <div className="detail-header">
                                    {/* Profile Bar */}
                                    <div className="profile-bar">
                                        <button
                                            className="mobile-back-btn"
                                            onClick={() => setSelectedItem(null)}
                                            title="Geri"
                                        >
                                            ←
                                        </button>
                                        <div className="profile-bar-left">
                                            <div
                                                className="detail-avatar mobile-avatar-trigger"
                                                onClick={() => setShowContactSidebar(true)}
                                                title="Profili Görüntüle"
                                            >
                                                {selectedItem.contact?.avatar ? (
                                                    <img src={selectedItem.contact.avatar} alt={selectedItem.contact.name} />
                                                ) : (
                                                    <User size={24} />
                                                )}
                                            </div>
                                            <div className="profile-info">
                                                <h3>{selectedItem.contact?.name || 'Bilinmeyen'}</h3>
                                                {/* İlk / Son Yazma */}
                                                {(() => {
                                                    const cm = selectedItem.messages?.filter(m => m.isFromContact) || [];
                                                    const fmt = (d) => d ? new Date(d).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '---';
                                                    return (
                                                        <div className="profile-dates-row">
                                                            <span>İlk: {fmt(cm[0]?.createdAt)}</span>
                                                            <span className="profile-dates-sep">•</span>
                                                            <span>Son: {fmt(cm[cm.length - 1]?.createdAt)}</span>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </div>

                                        <div className="profile-bar-actions">
                                            {/* Case Numarası Badge */}
                                            {selectedItem?._caseNumber && (
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 3,
                                                    padding: '2px 7px', borderRadius: 6,
                                                    background: '#f0f9ff', border: '1px solid #bae6fd',
                                                    color: '#0369a1', fontSize: '0.65rem', fontWeight: 700,
                                                    whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: '0.3px'
                                                }}>
                                                    📋 {selectedItem?._caseNumber}
                                                </span>
                                            )}
                                            {/* Konu Başlığı Input with Fixed Dropdown */}
                                            {(selectedItemType === INBOX_TYPES.MESSAGE || selectedItemType === INBOX_TYPES.EMAIL) && (() => {
                                                const contactId = selectedItem.contact?.id;
                                                const pastTopics = contactId
                                                    ? [...new Set(
                                                        inboxItems
                                                            .filter(it => it.contact?.id === contactId && it.id !== selectedItem.id && it.aiTopic?.trim())
                                                            .map(it => it.aiTopic.trim())
                                                      )]
                                                    : [];
                                                return (
                                                    <div className="topic-input-wrapper">
                                                        <input
                                                            className="topic-input-compact"
                                                            type="text"
                                                            placeholder="Konu başlığı..."
                                                            value={selectedItem.aiTopic || ''}
                                                            onChange={(e) => {
                                                                setSelectedItem(prev => ({ ...prev, aiTopic: e.target.value }));
                                                            }}
                                                            onFocus={(e) => {
                                                                if (pastTopics.length > 0) {
                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                    setTopicDropdownPos({
                                                                        top: rect.bottom + window.scrollY + 4,
                                                                        left: rect.left + window.scrollX,
                                                                        width: Math.max(rect.width, 220)
                                                                    });
                                                                    setTopicDropdownOpen(true);
                                                                }
                                                            }}
                                                            onBlur={async (e) => {
                                                                setTimeout(() => setTopicDropdownOpen(false), 150);
                                                                const newTopic = e.target.value;
                                                                try {
                                                                    await conversationAPI.updateTopic(currentWorkspace.id, selectedItem.id, newTopic);
                                                                    // Sol listedeki inboxItems'ı da güncelle
                                                                    setInboxItems(prev => prev.map(item =>
                                                                        item.id === selectedItem.id ? { ...item, aiTopic: newTopic } : item
                                                                    ));
                                                                    // Case title'ı da senkronize et (Yazışma konusu = Case konusu)
                                                                    if (selectedItem.caseId) {
                                                                        await caseAPI.update(currentWorkspace.id, selectedItem.caseId, { title: newTopic });
                                                                    }
                                                                } catch (err) { console.error('Topic update error:', err); }
                                                            }}
                                                        />
                                                        {/* Fixed-position dropdown rendered via portal logic */}
                                                        {topicDropdownOpen && pastTopics.length > 0 && ReactDOM.createPortal(
                                                            <div
                                                                className="topic-dropdown-fixed"
                                                                style={{
                                                                    position: 'fixed',
                                                                    top: topicDropdownPos.top,
                                                                    left: topicDropdownPos.left,
                                                                    minWidth: topicDropdownPos.width,
                                                                }}
                                                            >
                                                                {pastTopics.map((topic, i) => (
                                                                    <div
                                                                        key={i}
                                                                        className="topic-dropdown-item"
                                                                        onMouseDown={async (e) => {
                                                                            e.preventDefault();
                                                                            setSelectedItem(prev => ({ ...prev, aiTopic: topic }));
                                                                            setTopicDropdownOpen(false);
                                                                            try {
                                                                                await conversationAPI.updateTopic(currentWorkspace.id, selectedItem.id, topic);
                                                                                setInboxItems(prev => prev.map(item =>
                                                                                    item.id === selectedItem.id ? { ...item, aiTopic: topic } : item
                                                                                ));
                                                                                // Case title'ı da senkronize et (Yazışma konusu = Case konusu)
                                                                                if (selectedItem.caseId) {
                                                                                    await caseAPI.update(currentWorkspace.id, selectedItem.caseId, { title: topic });
                                                                                }
                                                                            } catch (err) { console.error('Topic update error:', err); }
                                                                        }}
                                                                    >
                                                                        {topic}
                                                                    </div>
                                                                ))}
                                                            </div>,
                                                            document.body
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                            {/* Case Bağlama Butonu — Konu başlığının yanında */}
                                            {(selectedItemType === INBOX_TYPES.MESSAGE || selectedItemType === INBOX_TYPES.EMAIL) && selectedItem.contact?.id && (() => {
                                                const currentCaseId = selectedItem.caseId;
                                                const linkedCase = currentCaseId
                                                    ? (contactCases.find(c => c.id === currentCaseId) || selectedItem.case || null)
                                                    : null;
                                                const displayCaseNumber = linkedCase?.caseNumber || (currentCaseId ? `CSE-...` : null);

                                                return (
                                                    <div ref={caseLinkDropdownRef} style={{ position: 'relative', display: 'inline-flex' }}>
                                                        <button
                                                            className="case-link-btn"
                                                            title={linkedCase ? `Bağlı: ${linkedCase.title || ''}` : 'Case\'e bağla'}
                                                            onClick={async () => {
                                                                if (caseLinkDropdownOpen) {
                                                                    setCaseLinkDropdownOpen(false);
                                                                    return;
                                                                }
                                                                setCaseLinkLoading(true);
                                                                setCaseLinkDropdownOpen(true);
                                                                try {
                                                                    const res = await caseAPI.getByContact(currentWorkspace.id, selectedItem.contact.id);
                                                                    setContactCases(res.data || []);
                                                                } catch (err) {
                                                                    console.error('Case fetch error:', err);
                                                                    setContactCases([]);
                                                                } finally {
                                                                    setCaseLinkLoading(false);
                                                                }
                                                            }}
                                                            style={{
                                                                background: currentCaseId ? '#f5f3ff' : 'transparent',
                                                                border: currentCaseId ? '1px solid #c4b5fd' : '1px solid transparent',
                                                                borderRadius: 6, padding: '3px 6px', cursor: 'pointer',
                                                                display: 'flex', alignItems: 'center', gap: 4,
                                                                color: currentCaseId ? '#7c3aed' : '#9ca3af',
                                                                fontSize: '0.72rem', fontWeight: 500,
                                                                transition: 'all 0.15s', whiteSpace: 'nowrap'
                                                            }}
                                                        >
                                                            <Briefcase size={13} />
                                                            {displayCaseNumber && (
                                                                <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                    {displayCaseNumber}
                                                                </span>
                                                            )}
                                                        </button>

                                                        {/* Case Link Dropdown */}
                                                        {caseLinkDropdownOpen && ReactDOM.createPortal(
                                                            <div
                                                                style={{
                                                                    position: 'fixed',
                                                                    top: (caseLinkDropdownRef.current?.getBoundingClientRect?.().bottom + 4) || 0,
                                                                    left: (caseLinkDropdownRef.current?.getBoundingClientRect?.().right - 280) || 0,
                                                                    zIndex: 99999,
                                                                    background: '#fff', border: '1px solid #e5e7eb',
                                                                    borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                                                    width: 280, maxHeight: 360, overflow: 'auto',
                                                                }}
                                                                onClick={e => e.stopPropagation()}
                                                            >
                                                                {/* Header */}
                                                                <div style={{
                                                                    padding: '10px 14px', borderBottom: '1px solid #f3f4f6',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                                                }}>
                                                                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>
                                                                        Case'e Bağla
                                                                    </span>
                                                                    <button
                                                                        onClick={() => setCaseLinkDropdownOpen(false)}
                                                                        style={{
                                                                            background: 'none', border: 'none', cursor: 'pointer',
                                                                            color: '#9ca3af', padding: 2
                                                                        }}
                                                                    ><X size={14} /></button>
                                                                </div>

                                                                {caseLinkLoading ? (
                                                                    <div style={{ padding: 16, textAlign: 'center', color: '#9ca3af', fontSize: '0.8rem' }}>
                                                                        Yükleniyor...
                                                                    </div>
                                                                ) : (
                                                                    <>
                                                                        {/* Linked case info */}
                                                                        {linkedCase && (
                                                                            <div style={{
                                                                                padding: '8px 14px', background: '#f5f3ff',
                                                                                borderBottom: '1px solid #ede9fe',
                                                                                display: 'flex', alignItems: 'center', gap: 8
                                                                            }}>
                                                                                <div style={{ flex: 1 }}>
                                                                                    <div style={{ fontSize: '0.68rem', color: '#a78bfa', fontFamily: 'monospace', fontWeight: 600 }}>
                                                                                        {linkedCase?.caseNumber}
                                                                                    </div>
                                                                                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#5b21b6' }}>
                                                                                        {linkedCase.title}
                                                                                    </div>
                                                                                </div>
                                                                                <button
                                                                                    onClick={async () => {
                                                                                        try {
                                                                                            await caseAPI.unlinkConversation(currentWorkspace.id, linkedCase.id, selectedItem.id);
                                                                                            setSelectedItem(prev => ({ ...prev, caseId: null }));
                                                                                            setInboxItems(prev => prev.map(item =>
                                                                                                item.id === selectedItem.id ? { ...item, caseId: null } : item
                                                                                            ));
                                                                                            setContactCases(prev => prev.map(c =>
                                                                                                c.id === linkedCase.id
                                                                                                    ? { ...c, conversations: (c.conversations || []).filter(cv => cv.id !== selectedItem.id) }
                                                                                                    : c
                                                                                            ));
                                                                                        } catch (err) { console.error('Unlink error:', err); }
                                                                                    }}
                                                                                    title="Bağlantıyı kaldır"
                                                                                    style={{
                                                                                        background: '#fef2f2', border: '1px solid #fecaca',
                                                                                        borderRadius: 5, padding: '3px 8px', cursor: 'pointer',
                                                                                        color: '#ef4444', fontSize: '0.7rem', fontWeight: 500
                                                                                    }}
                                                                                >Çıkar</button>
                                                                            </div>
                                                                        )}

                                                                        {/* Existing active cases */}
                                                                        {contactCases.filter(c => c.status === 'ACTIVE' && c.id !== currentCaseId).length > 0 && (
                                                                            <div style={{ padding: '6px 14px' }}>
                                                                                <div style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>
                                                                                    Mevcut Case'ler
                                                                                </div>
                                                                                {contactCases.filter(c => c.status === 'ACTIVE' && c.id !== currentCaseId).map(c => (
                                                                                    <div
                                                                                        key={c.id}
                                                                                        onClick={async () => {
                                                                                            try {
                                                                                                // If already linked to another case, unlink first
                                                                                                if (currentCaseId) {
                                                                                                    await caseAPI.unlinkConversation(currentWorkspace.id, currentCaseId, selectedItem.id);
                                                                                                }
                                                                                                await caseAPI.linkConversation(currentWorkspace.id, c.id, selectedItem.id);
                                                                                                setSelectedItem(prev => ({ ...prev, caseId: c.id }));
                                                                                                setInboxItems(prev => prev.map(item =>
                                                                                                    item.id === selectedItem.id ? { ...item, caseId: c.id } : item
                                                                                                ));
                                                                                                setCaseLinkDropdownOpen(false);
                                                                                            } catch (err) { console.error('Link error:', err); }
                                                                                        }}
                                                                                        style={{
                                                                                            padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                                                                                            display: 'flex', alignItems: 'center', gap: 8,
                                                                                            marginBottom: 2, transition: 'background 0.1s'
                                                                                        }}
                                                                                        onMouseEnter={e => e.currentTarget.style.background = '#f5f3ff'}
                                                                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                                                    >
                                                                                        <Link2 size={12} style={{ color: '#8b5cf6', flexShrink: 0 }} />
                                                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                                                            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                                                {c.title}
                                                                                            </div>
                                                                                            <div style={{ fontSize: '0.65rem', color: '#9ca3af' }}>
                                                                                                {c?.caseNumber} · 💬{c._conversationCount || 0}
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}

                                                                        {/* Create new case */}
                                                                        <div style={{
                                                                            padding: '8px 14px', borderTop: '1px solid #f3f4f6'
                                                                        }}>
                                                                            <div style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>
                                                                                Yeni Case Oluştur
                                                                            </div>
                                                                            <div style={{ display: 'flex', gap: 4 }}>
                                                                                <input
                                                                                    value={newCaseTitle}
                                                                                    onChange={e => setNewCaseTitle(e.target.value)}
                                                                                    placeholder={selectedItem.aiTopic || 'Case başlığı...'}
                                                                                    onKeyDown={async e => {
                                                                                        if (e.key === 'Enter' && (newCaseTitle.trim() || selectedItem.aiTopic?.trim())) {
                                                                                            const title = newCaseTitle.trim() || selectedItem.aiTopic.trim();
                                                                                            try {
                                                                                                const res = await caseAPI.create(currentWorkspace.id, selectedItem.contact.id, {
                                                                                                    title,
                                                                                                    conversationId: selectedItem.id
                                                                                                });
                                                                                                setSelectedItem(prev => ({ ...prev, caseId: res.data.id }));
                                                                                                setInboxItems(prev => prev.map(item =>
                                                                                                    item.id === selectedItem.id ? { ...item, caseId: res.data.id } : item
                                                                                                ));
                                                                                                setNewCaseTitle('');
                                                                                                setCaseLinkDropdownOpen(false);
                                                                                            } catch (err) { console.error('Create case error:', err); }
                                                                                        }
                                                                                    }}
                                                                                    style={{
                                                                                        flex: 1, padding: '6px 10px', border: '1px solid #e5e7eb',
                                                                                        borderRadius: 6, fontSize: '0.78rem', outline: 'none',
                                                                                        background: '#faf5ff'
                                                                                    }}
                                                                                />
                                                                                <button
                                                                                    onClick={async () => {
                                                                                        const title = newCaseTitle.trim() || selectedItem.aiTopic?.trim();
                                                                                        if (!title) return;
                                                                                        try {
                                                                                            const res = await caseAPI.create(currentWorkspace.id, selectedItem.contact.id, {
                                                                                                title,
                                                                                                conversationId: selectedItem.id
                                                                                            });
                                                                                            setSelectedItem(prev => ({ ...prev, caseId: res.data.id }));
                                                                                            setInboxItems(prev => prev.map(item =>
                                                                                                item.id === selectedItem.id ? { ...item, caseId: res.data.id } : item
                                                                                            ));
                                                                                            setNewCaseTitle('');
                                                                                            setCaseLinkDropdownOpen(false);
                                                                                        } catch (err) { console.error('Create case error:', err); }
                                                                                    }}
                                                                                    style={{
                                                                                        background: '#8b5cf6', border: 'none', borderRadius: 6,
                                                                                        color: '#fff', padding: '0 10px', cursor: 'pointer',
                                                                                        fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap'
                                                                                    }}
                                                                                >
                                                                                    <Plus size={14} />
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    </>
                                                                )}
                                                            </div>,
                                                            document.body
                                                        )}
                                                    </div>
                                                );
                                            })()}

                                            {/* Konuşma Durumu — Açık/Kapalı toggle with dynamic funnel stages */}
                                            {(selectedItemType === INBOX_TYPES.MESSAGE || selectedItemType === INBOX_TYPES.EMAIL) && (
                                                <>
                                                    <div className="closing-dropdown-wrapper" ref={closingDropdownRef} style={{ position: 'relative', display: 'inline-flex' }}>
                                                        {(() => {
                                                            const isResolved = selectedItem.status === 'RESOLVED';
                                                            const isClosed = isResolved;
                                                            const pillStyle = isClosed
                                                                ? { bg: '#fef2f2', color: '#ef4444', border: '#fecaca', dotColor: '#ef4444' }
                                                                : { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0', dotColor: '#22c55e' };
                                                            const label = isClosed ? 'Kapalı' : 'Açık';

                                                            // Mevcut akışın aşamalarını bul
                                                            const currentFunnelId = selectedItem.funnelType;
                                                            const currentFunnel = currentFunnelId ? funnelOptions.find(f => f.value === currentFunnelId) : null;
                                                            const allStages = currentFunnel?.stages || [];
                                                            const closingStages = allStages.filter(s => s.isClosing);
                                                            const openStages = allStages.filter(s => !s.isClosing);

                                                            return (
                                                                <>
                                                                    <button
                                                                        onClick={() => setClosingDropdownOpen(prev => !prev)}
                                                                        style={{
                                                                            display: 'inline-flex', alignItems: 'center', gap: 6,
                                                                            padding: '5px 12px', borderRadius: 8,
                                                                            border: `1.5px solid ${pillStyle.border}`,
                                                                            background: pillStyle.bg, color: pillStyle.color,
                                                                            fontSize: '0.78rem', fontWeight: 700,
                                                                            cursor: 'pointer', whiteSpace: 'nowrap',
                                                                            transition: 'all 0.15s'
                                                                        }}
                                                                    >
                                                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: pillStyle.dotColor, flexShrink: 0 }} />
                                                                        {label}
                                                                        <ChevronDown size={13} style={{
                                                                            transition: 'transform 0.2s',
                                                                            transform: closingDropdownOpen ? 'rotate(180deg)' : 'none',
                                                                            opacity: 0.6
                                                                        }} />
                                                                    </button>
                                                                    {closingDropdownOpen && ReactDOM.createPortal(
                                                                        <div
                                                                            style={{
                                                                                position: 'fixed',
                                                                                top: closingDropdownRef.current?.getBoundingClientRect?.().bottom + 4 || 0,
                                                                                left: closingDropdownRef.current?.getBoundingClientRect?.().left || 0,
                                                                                zIndex: 99999,
                                                                                background: '#fff', border: '1px solid #e5e7eb',
                                                                                borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                                                                minWidth: 200, overflow: 'hidden', padding: '4px 0'
                                                                            }}
                                                                            onClick={e => e.stopPropagation()}
                                                                        >
                                                                            {/* Başlık */}
                                                                            <div style={{ padding: '8px 14px 4px', fontSize: '0.72rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                                                {isClosed ? 'Tekrar Aç' : 'Nasıl kapandı?'}
                                                                            </div>
                                                                            <div style={{ height: 1, background: '#f3f4f6', margin: '4px 0' }} />

                                                                            {isClosed ? (
                                                                                /* KAPALI → Açık aşamaları göster */
                                                                                openStages.length > 0 ? openStages.map(stage => (
                                                                                    <div
                                                                                        key={stage.value}
                                                                                        onClick={async () => {
                                                                                            try {
                                                                                                // Case'i güncelle: ACTIVE + seçilen açık aşama
                                                                                                if (selectedItem.caseId) {
                                                                                                    await caseAPI.update(currentWorkspace.id, selectedItem.caseId, {
                                                                                                        status: 'ACTIVE',
                                                                                                        funnelStageId: stage.value
                                                                                                    });
                                                                                                }
                                                                                                // Conversation'ı aç
                                                                                                await conversationAPI.updateStatus(currentWorkspace.id, selectedItem.id, { status: 'OPEN' });
                                                                                                // Conversation funnelStageId güncelle
                                                                                                await conversationAPI.updateFunnel(currentWorkspace.id, selectedItem.id, {
                                                                                                    funnelStageId: stage.value,
                                                                                                    funnelType: currentFunnelId,
                                                                                                    confirmAssignmentUpdate: false
                                                                                                }).catch(() => {});
                                                                                                // Local state güncelle
                                                                                                setSelectedItem(prev => ({ ...prev, status: 'OPEN', closingStatus: null, funnelStageId: stage.value }));
                                                                                                setInboxItems(prev => prev.map(i =>
                                                                                                    i.id === selectedItem.id ? { ...i, status: 'OPEN', closingStatus: null, funnelStageId: stage.value } : i
                                                                                                ));
                                                                                                // Senkron event'ler
                                                                                                window.dispatchEvent(new CustomEvent('websocket:case_updated', {
                                                                                                    detail: { caseId: selectedItem.caseId, changes: { status: 'ACTIVE', funnelStageId: stage.value } }
                                                                                                }));
                                                                                                window.dispatchEvent(new CustomEvent('case_cards_refresh'));
                                                                                                window.dispatchEvent(new CustomEvent('websocket:funnel_stage_updated', {
                                                                                                    detail: { conversationId: selectedItem.id, funnelStageId: stage.value, stageName: stage.label, stageColor: stage.color }
                                                                                                }));
                                                                                            } catch (err) { console.error('Status update error:', err); }
                                                                                            setClosingDropdownOpen(false);
                                                                                        }}
                                                                                        style={{
                                                                                            padding: '10px 14px', cursor: 'pointer',
                                                                                            display: 'flex', alignItems: 'center', gap: 8,
                                                                                            fontSize: '0.82rem', fontWeight: 600,
                                                                                            color: '#374151', background: 'transparent',
                                                                                            transition: 'background 0.1s'
                                                                                        }}
                                                                                        onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                                                                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                                                    >
                                                                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color || '#22c55e', flexShrink: 0 }} />
                                                                                        {stage.label}
                                                                                    </div>
                                                                                )) : (
                                                                                    <div
                                                                                        onClick={async () => {
                                                                                            try {
                                                                                                if (selectedItem.caseId) {
                                                                                                    await caseAPI.update(currentWorkspace.id, selectedItem.caseId, { status: 'ACTIVE' });
                                                                                                }
                                                                                                await conversationAPI.updateStatus(currentWorkspace.id, selectedItem.id, { status: 'OPEN' });
                                                                                                setSelectedItem(prev => ({ ...prev, status: 'OPEN', closingStatus: null }));
                                                                                                setInboxItems(prev => prev.map(i =>
                                                                                                    i.id === selectedItem.id ? { ...i, status: 'OPEN', closingStatus: null } : i
                                                                                                ));
                                                                                                window.dispatchEvent(new CustomEvent('websocket:case_updated', {
                                                                                                    detail: { caseId: selectedItem.caseId, changes: { status: 'ACTIVE' } }
                                                                                                }));
                                                                                                window.dispatchEvent(new CustomEvent('case_cards_refresh'));
                                                                                            } catch (err) { console.error('Status update error:', err); }
                                                                                            setClosingDropdownOpen(false);
                                                                                        }}
                                                                                        style={{
                                                                                            padding: '10px 14px', cursor: 'pointer',
                                                                                            display: 'flex', alignItems: 'center', gap: 8,
                                                                                            fontSize: '0.82rem', fontWeight: 600,
                                                                                            color: '#16a34a', background: 'transparent',
                                                                                            transition: 'background 0.1s'
                                                                                        }}
                                                                                        onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'}
                                                                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                                                    >
                                                                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                                                                                        Tekrar Aç
                                                                                    </div>
                                                                                )
                                                                            ) : (
                                                                                /* AÇIK → Kapanış aşamalarını göster */
                                                                                closingStages.length > 0 ? closingStages.map(stage => (
                                                                                    <div
                                                                                        key={stage.value}
                                                                                        onClick={async () => {
                                                                                            try {
                                                                                                const newCaseStatus = stage.statusType || 'CLOSED';
                                                                                                // Case'i güncelle: kapanış status + kapanış aşaması
                                                                                                if (selectedItem.caseId) {
                                                                                                    await caseAPI.update(currentWorkspace.id, selectedItem.caseId, {
                                                                                                        status: newCaseStatus,
                                                                                                        funnelStageId: stage.value
                                                                                                    });
                                                                                                }
                                                                                                // Conversation'ı kapat
                                                                                                await conversationAPI.updateStatus(currentWorkspace.id, selectedItem.id, {
                                                                                                    status: 'RESOLVED',
                                                                                                    closingStageId: stage.value
                                                                                                });
                                                                                                // Conversation funnelStageId güncelle
                                                                                                await conversationAPI.updateFunnel(currentWorkspace.id, selectedItem.id, {
                                                                                                    funnelStageId: stage.value,
                                                                                                    funnelType: currentFunnelId,
                                                                                                    confirmAssignmentUpdate: false
                                                                                                }).catch(() => {});
                                                                                                // Local state güncelle
                                                                                                setSelectedItem(prev => ({
                                                                                                    ...prev,
                                                                                                    status: 'RESOLVED',
                                                                                                    closingStatus: newCaseStatus,
                                                                                                    funnelStageId: stage.value
                                                                                                }));
                                                                                                setInboxItems(prev => prev.map(i =>
                                                                                                    i.id === selectedItem.id ? { ...i, status: 'RESOLVED', closingStatus: newCaseStatus, funnelStageId: stage.value } : i
                                                                                                ));
                                                                                                // Senkron event'ler
                                                                                                window.dispatchEvent(new CustomEvent('websocket:case_updated', {
                                                                                                    detail: { caseId: selectedItem.caseId, changes: { status: newCaseStatus, funnelStageId: stage.value } }
                                                                                                }));
                                                                                                window.dispatchEvent(new CustomEvent('case_cards_refresh'));
                                                                                                window.dispatchEvent(new CustomEvent('websocket:funnel_stage_updated', {
                                                                                                    detail: { conversationId: selectedItem.id, funnelStageId: stage.value, stageName: stage.label, stageColor: stage.color }
                                                                                                }));
                                                                                                loadInboxItems(false);
                                                                                            } catch (err) { console.error('Status update error:', err); }
                                                                                            setClosingDropdownOpen(false);
                                                                                        }}
                                                                                        style={{
                                                                                            padding: '10px 14px', cursor: 'pointer',
                                                                                            display: 'flex', alignItems: 'center', gap: 8,
                                                                                            fontSize: '0.82rem', fontWeight: 600,
                                                                                            color: stage.color || '#ef4444', background: 'transparent',
                                                                                            transition: 'background 0.1s'
                                                                                        }}
                                                                                        onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                                                                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                                                    >
                                                                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color || '#ef4444', flexShrink: 0 }} />
                                                                                        {stage.label}
                                                                                    </div>
                                                                                )) : (
                                                                                    /* Kapanış aşaması tanımlı değilse fallback */
                                                                                    <div
                                                                                        onClick={async () => {
                                                                                            try {
                                                                                                if (selectedItem.caseId) {
                                                                                                    await caseAPI.update(currentWorkspace.id, selectedItem.caseId, { status: 'CLOSED' });
                                                                                                }
                                                                                                await conversationAPI.updateStatus(currentWorkspace.id, selectedItem.id, { status: 'RESOLVED' });
                                                                                                setSelectedItem(prev => ({ ...prev, status: 'RESOLVED', closingStatus: 'CLOSED' }));
                                                                                                setInboxItems(prev => prev.map(i =>
                                                                                                    i.id === selectedItem.id ? { ...i, status: 'RESOLVED', closingStatus: 'CLOSED' } : i
                                                                                                ));
                                                                                                window.dispatchEvent(new CustomEvent('websocket:case_updated', {
                                                                                                    detail: { caseId: selectedItem.caseId, changes: { status: 'CLOSED' } }
                                                                                                }));
                                                                                                window.dispatchEvent(new CustomEvent('case_cards_refresh'));
                                                                                                loadInboxItems(false);
                                                                                            } catch (err) { console.error('Status update error:', err); }
                                                                                            setClosingDropdownOpen(false);
                                                                                        }}
                                                                                        style={{
                                                                                            padding: '10px 14px', cursor: 'pointer',
                                                                                            display: 'flex', alignItems: 'center', gap: 8,
                                                                                            fontSize: '0.82rem', fontWeight: 600,
                                                                                            color: '#ef4444', background: 'transparent',
                                                                                            transition: 'background 0.1s'
                                                                                        }}
                                                                                        onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                                                                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                                                    >
                                                                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                                                                                        Kapat
                                                                                    </div>
                                                                                )
                                                                            )}
                                                                        </div>,
                                                                        document.body
                                                                    )}
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                    <button
                                                        className="profile-action-btn archive"
                                                        onClick={() => handleArchiveConversation(selectedItem.id, !selectedItem.isArchived)}
                                                        title={selectedItem.isArchived ? "Arşivden Çıkar" : "Arşivle"}
                                                    >
                                                        {selectedItem.isArchived ? '📤' : '📥'}
                                                    </button>
                                                    <button
                                                        className="profile-action-btn delete"
                                                        onClick={() => handleDeleteItem(selectedItem)}
                                                        title="Sohbeti Sil"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </>
                                            )}

                                        </div>
                                    </div>

                                    {/* Assignment Bar */}
                                    <div className="assignment-bar">
                                        {/* Left Group: Akış Seç + Müşteri Durumu */}
                                        <div className="assignment-left-group">
                                            {(selectedItemType === INBOX_TYPES.MESSAGE || selectedItemType === INBOX_TYPES.EMAIL) && selectedItem.contact && (() => {
                                                // Get active funnel's stages — case varsa case'den oku
                                                const caseForFunnel = selectedItem.case;
                                                const effectiveFunnelType = caseForFunnel?.funnelType || selectedItem.funnelType || '';
                                                const effectiveFunnelStageId = caseForFunnel?.funnelStageId || selectedItem._effectiveStageId || selectedItem.funnelStageId || selectedItem.contact?.funnelStageId;
                                                const activeFunnel = funnelOptions.find(o => o.value === effectiveFunnelType);
                                                const stageOptions = (activeFunnel && activeFunnel.stages && activeFunnel.stages.length > 0)
                                                    ? activeFunnel.stages
                                                    : CUSTOMER_STATUS_OPTIONS;
                                                const activeStageVal = effectiveFunnelStageId || stageOptions[0]?.value;
                                                const currentStageColor = stageOptions.find(o => o.value === activeStageVal)?.color || '#3b82f6';
                                                // Seçili aşamanın adını bul (tüm funnel'lardan)
                                                const activeStageLabel = (() => {
                                                    for (const f of funnelOptions) {
                                                        const stages = (f.stages && f.stages.length > 0) ? f.stages : (f.value === '' ? CUSTOMER_STATUS_OPTIONS : []);
                                                        const found = stages.find(s => s.value === activeStageVal);
                                                        if (found) return found.label || found.name;
                                                    }
                                                    return activeStageVal;
                                                })();
                                                const handleStageSelect = async (newFunnel, newStage, changedStage) => {
                                                    setStageMegaMenuOpen(false);
                                                    try {
                                                        const isClosingStage = changedStage?.isClosing === true;
                                                        const newCaseStatus = isClosingStage ? (changedStage.statusType || 'CLOSED') : 'ACTIVE';
                                                        const newConvStatus = isClosingStage ? 'RESOLVED' : 'OPEN';

                                                        // Always send funnelType so backend can detect funnel changes
                                                        // and trigger team auto-assignment
                                                        const updatePayload = { funnelStageId: newStage, funnelType: newFunnel };
                                                        await contactAPI.update(currentWorkspace.id, selectedItem.contact.id, { status: newStage });
                                                        
                                                        let res = await conversationAPI.updateFunnel(currentWorkspace.id, selectedItem.id, updatePayload);
                                                        
                                                        if (res.data?.needsConfirmation) {
                                                            const msg = `Bu konuşma ${res.data.currentAssignee.name} kullanıcısına atanmış. Yeni aşama bu konuşmayı ${res.data.suggestedAssignee.name} kullanıcısına atamayı öneriyor. Atamayı değiştirmek ister misiniz?`;
                                                            const confirmUpdate = window.confirm(msg);
                                                            res = await conversationAPI.updateFunnel(currentWorkspace.id, selectedItem.id, {
                                                                ...updatePayload,
                                                                confirmAssignmentUpdate: confirmUpdate
                                                            });
                                                        }

                                                        // Kapanış adımına geçtiyse case ve conversation statusunu güncelle
                                                        if (isClosingStage && selectedItem.caseId) {
                                                            try {
                                                                await caseAPI.update(currentWorkspace.id, selectedItem.caseId, {
                                                                    status: newCaseStatus,
                                                                    funnelStageId: newStage
                                                                });
                                                            } catch (_) {}
                                                            // Conversation status da RESOLVED yap
                                                            try {
                                                                await conversationAPI.updateStatus(currentWorkspace.id, selectedItem.id, {
                                                                    status: newConvStatus,
                                                                    closingStageId: newStage
                                                                });
                                                            } catch (_) {}
                                                        } else if (!isClosingStage && selectedItem.caseId) {
                                                            // Açık aşamaya geçtiyse case'i ACTIVE yap
                                                            const wasClosing = selectedItem.status === 'RESOLVED' || selectedItem.closingStatus;
                                                            if (wasClosing) {
                                                                try {
                                                                    await caseAPI.update(currentWorkspace.id, selectedItem.caseId, {
                                                                        status: 'ACTIVE',
                                                                        funnelStageId: newStage
                                                                    });
                                                                    await conversationAPI.updateStatus(currentWorkspace.id, selectedItem.id, {
                                                                        status: 'OPEN'
                                                                    });
                                                                } catch (_) {}
                                                            }
                                                        }

                                                        const responseData = res.data;
                                                        setSelectedItem(prev => ({ 
                                                            ...prev, 
                                                            funnelType: newFunnel, 
                                                            contact: { ...prev.contact, status: newStage }, 
                                                            funnelStageId: newStage, 
                                                            _effectiveStageId: newStage,
                                                            status: isClosingStage ? 'RESOLVED' : (prev.status === 'RESOLVED' ? 'OPEN' : prev.status),
                                                            closingStatus: isClosingStage ? newCaseStatus : null,
                                                            assignedTeamId: responseData.assignedTeamId || prev.assignedTeamId,
                                                            assignedToId: responseData.assignedToId || prev.assignedToId,
                                                            assignedTo: responseData.assignedToName ? { name: responseData.assignedToName } : prev.assignedTo,
                                                            teamIds: responseData.teamIds || prev.teamIds
                                                        }));
                                                        setInboxItems(prevItems => prevItems.map(item =>
                                                            item.id === selectedItem.id ? { 
                                                                ...item, 
                                                                funnelType: newFunnel, 
                                                                funnelStageId: newStage, 
                                                                _effectiveStageId: newStage,
                                                                status: isClosingStage ? 'RESOLVED' : (item.status === 'RESOLVED' ? 'OPEN' : item.status),
                                                                closingStatus: isClosingStage ? newCaseStatus : null,
                                                                assignedTeamId: responseData.assignedTeamId || item.assignedTeamId,
                                                                assignedToId: responseData.assignedToId || item.assignedToId,
                                                                assignedTo: responseData.assignedToName ? { name: responseData.assignedToName } : item.assignedTo,
                                                                teamIds: responseData.teamIds || item.teamIds
                                                            } : item
                                                        ));
                                                        // Nested case objesini de güncelle
                                                        setSelectedItem(prev => {
                                                            if (!prev?.case) return prev;
                                                            return {
                                                                ...prev,
                                                                case: {
                                                                    ...prev.case,
                                                                    funnelType: newFunnel,
                                                                    funnelStageId: newStage,
                                                                    status: isClosingStage ? newCaseStatus : (prev.case.status !== 'ACTIVE' ? 'ACTIVE' : prev.case.status),
                                                                    assignedTeamId: responseData.assignedTeamId || prev.case?.assignedTeamId,
                                                                    assignedToId: responseData.assignedToId || prev.case.assignedToId,
                                                                    assignedTo: responseData.assignedToName ? { name: responseData.assignedToName } : prev.case.assignedTo
                                                                }
                                                            };
                                                        });
                                                        window.dispatchEvent(new CustomEvent('websocket:funnel_stage_updated', {
                                                            detail: { conversationId: selectedItem.id, funnelStageId: newStage, stageName: changedStage?.label || changedStage?.name || newStage, stageColor: changedStage?.color || '#6366f1' }
                                                        }));
                                                        // Sidebar'ın activeCaseInfo'sunu güncelle
                                                        if (selectedItem.caseId) {
                                                            window.dispatchEvent(new CustomEvent('websocket:case_updated', {
                                                                detail: {
                                                                    caseId: selectedItem.caseId,
                                                                    changes: {
                                                                        funnelType: newFunnel,
                                                                        funnelStageId: newStage,
                                                                        status: isClosingStage ? newCaseStatus : 'ACTIVE',
                                                                        assignedToId: responseData.assignedToId,
                                                                        assignedTeamId: responseData.assignedTeamId,
                                                                        assignedTo: responseData.assignedToName ? { name: responseData.assignedToName } : undefined
                                                                    }
                                                                }
                                                            }));
                                                        }
                                                        // Sidebar CaseCards'ı bilgilendir
                                                        window.dispatchEvent(new CustomEvent('case_cards_refresh'));

                                                        // Safety fallback re-fetch (delayed) to catch any async updates
                                                        setTimeout(async () => {
                                                            try {
                                                                const res = await conversationAPI.getById(currentWorkspace.id, selectedItem.id);
                                                                const conv = res.data.conversation || res.data;
                                                                if (conv) {
                                                                    setSelectedItem(prev => prev?.id === conv.id ? {
                                                                        ...prev,
                                                                        teamIds: conv.teamIds || prev.teamIds,
                                                                        teamId: conv.teamId || prev.teamId,
                                                                        assignedToId: conv.assignedToId || prev.assignedToId,
                                                                        assignedTo: conv.assignedTo || prev.assignedTo,
                                                                        botEnabled: conv.botEnabled ?? prev.botEnabled
                                                                    } : prev);
                                                                    setInboxItems(prevItems => prevItems.map(item =>
                                                                        item.id === conv.id ? { ...item, teamIds: conv.teamIds || item.teamIds, assignedToId: conv.assignedToId || item.assignedToId, assignedTo: conv.assignedTo || item.assignedTo } : item
                                                                    ));
                                                                }
                                                            } catch (_) {}
                                                        }, 2000);
                                                    } catch (err) { console.error('Stage update error:', err); }
                                                };
                                                // Compute stage & funnel conversation counts from inboxItems
                                                const stageCounts = {};
                                                const funnelCountMap = {};
                                                (inboxItems || []).forEach(item => {
                                                    const sid = item._effectiveStageId || item.funnelStageId || item.contact?.funnelStageId;
                                                    const fid = item.funnelType || '';
                                                    if (sid) stageCounts[sid] = (stageCounts[sid] || 0) + 1;
                                                    if (fid) funnelCountMap[fid] = (funnelCountMap[fid] || 0) + 1;
                                                });
                                                return (
                                                    <>
                                                        {/* Tek Kutucuk: Mega Menü Trigger */}
                                                        <div ref={stageMegaMenuRef} style={{ position: 'relative' }}>
                                                            <button
                                                                onClick={(e) => {
                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                    setStageMegaMenuPos({ top: rect.bottom + 4, left: rect.left });
                                                                    setStageMegaMenuOpen(v => !v);
                                                                }}
                                                                style={{
                                                                    display: 'flex', alignItems: 'center', gap: '6px',
                                                                    background: '#f8fafc', border: '1px solid #e2e8f0',
                                                                    borderRadius: '8px', padding: '4px 10px',
                                                                    cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: '#374151',
                                                                    whiteSpace: 'nowrap', maxWidth: '200px'
                                                                }}
                                                            >
                                                                <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: currentStageColor }} />
                                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>
                                                                    {activeFunnel ? (
                                                                        <><span style={{ color: '#94a3b8', fontWeight: 500 }}>{activeFunnel.label}</span><span style={{ color: '#94a3b8', margin: '0 3px' }}>/</span><span>{activeStageLabel || 'Aşama Seç'}</span></>
                                                                    ) : (activeStageLabel || 'Aşama Seç')}
                                                                </span>
                                                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ marginLeft: 2, flexShrink: 0 }}><path d="M2 3.5L5 6.5L8 3.5" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                                            </button>

                                                            {/* Stage menu backdrop + panel */}
                                                            {stageMegaMenuOpen && ReactDOM.createPortal(
                                                                <>
                                                                    {/* Backdrop: dışarıya tıklayınca kapat */}
                                                                    <div
                                                                        style={{ position: 'fixed', inset: 0, zIndex: 99998 }}
                                                                        onClick={() => { setStageMegaMenuOpen(false); setStageMegaMenuHoverFunnel(null); }}
                                                                    />
                                                                    <div ref={stageMenuDivRef} style={{
                                                                        position: 'fixed',
                                                                        top: stageMegaMenuPos.top,
                                                                        left: stageMegaMenuPos.left,
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
                                                                }}>
                                                                    {/* Sol panel: Akışlar */}
                                                                    <div style={{ minWidth: 170, borderRight: '1px solid #f1f5f9', paddingRight: 8 }}>
                                                                        <div style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', padding: '4px 6px 6px' }}>Akış</div>
                                                                        {funnelOptions.filter(f => f.value !== '').map(funnel => {
                                                                            const isActiveFunnel = (selectedItem.funnelType || '') === funnel.value;
                                                                            const isHovered = stageMegaMenuHoverFunnel === funnel.value;
                                                                            const isHighlighted = isActiveFunnel || isHovered;
                                                                            return (
                                                                                <button
                                                                                    key={funnel.value}
                                                                                    onMouseEnter={() => setStageMegaMenuHoverFunnel(funnel.value)}
                                                                                    style={{
                                                                                        display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                                                                                        padding: '7px 8px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                                                                        fontSize: '0.8rem', fontWeight: isActiveFunnel ? 700 : 500,
                                                                                        background: isHighlighted ? '#eff6ff' : 'transparent',
                                                                                        color: isHighlighted ? '#1d4ed8' : '#374151',
                                                                                        transition: 'background 0.1s'
                                                                                    }}
                                                                                >
                                                                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: funnel.color || '#6366f1', flexShrink: 0 }} />
                                                                                    {funnel.label}
                                                                                    {funnelCountMap[funnel.value] > 0 && (
                                                                                        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#94a3b8', marginLeft: 2 }}>
                                                                                            {funnelCountMap[funnel.value]}
                                                                                        </span>
                                                                                    )}
                                                                                    <svg width="12" height="12" viewBox="0 0 12 12" style={{ marginLeft: 'auto', opacity: 0.4 }}><path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
                                                                                </button>
                                                                            );
                                                                        })}
                                                                    </div>

                                                                    {/* Sağ panel: Hover/aktif akışın aşamaları */}
                                                                    {(() => {
                                                                        const displayFunnelVal = stageMegaMenuHoverFunnel !== null 
                                                                            ? stageMegaMenuHoverFunnel 
                                                                            : ((selectedItem.funnelType !== undefined && selectedItem.funnelType !== null) 
                                                                                ? selectedItem.funnelType 
                                                                                : (funnelOptions.filter(f => f.value !== '')[0]?.value || ''));
                                                                        const displayFunnel = funnelOptions.find(f => f.value === displayFunnelVal);
                                                                        if (!displayFunnel) return null;
                                                                        const stages = (displayFunnel.stages && displayFunnel.stages.length > 0) ? displayFunnel.stages : CUSTOMER_STATUS_OPTIONS;
                                                                        const isActiveFunnel = (selectedItem.funnelType || '') === displayFunnel.value;
                                                                        return (
                                                                            <div style={{ minWidth: 190 }}>
                                                                                <div style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', padding: '4px 6px 6px' }}>{displayFunnel.label}</div>
                                                                                {stages.map(stage => {
                                                                                    const isActive = activeStageVal === stage.value && isActiveFunnel;
                                                                                    return (
                                                                                        <button
                                                                                            key={stage.value}
                                                                                            onClick={() => handleStageSelect(displayFunnel.value, stage.value, stage)}
                                                                                            style={{
                                                                                                display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                                                                                                padding: '7px 8px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                                                                                fontSize: '0.8rem', fontWeight: isActive ? 700 : 400,
                                                                                                background: isActive ? (stage.color || '#6366f1') + '18' : 'transparent',
                                                                                                color: isActive ? (stage.color || '#6366f1') : '#374151',
                                                                                                transition: 'background 0.1s'
                                                                                            }}
                                                                                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f8fafc'; }}
                                                                                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? (stage.color || '#6366f1') + '18' : 'transparent'; }}
                                                                                        >
                                                                                            <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: stage.color || '#6366f1' }} />
                                                                                            {stage.label || stage.name}
                                                                                            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                                                {stageCounts[stage.value] > 0 && (
                                                                                                    <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#94a3b8', background: '#f1f5f9', borderRadius: 6, padding: '1px 5px', minWidth: 18, textAlign: 'center' }}>
                                                                                                        {stageCounts[stage.value]}
                                                                                                    </span>
                                                                                                )}
                                                                                                {isActive && <span style={{ fontSize: '0.7rem', color: stage.color || '#6366f1' }}>✓</span>}
                                                                                            </span>
                                                                                        </button>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        );
                                                                    })()}
                                                                </div>
                                                                </>,
                                                                document.body
                                                            )}
                                                        </div>
                                                    </>
                                                );
                                            })()}

                                            {/* ── Atama Pill Widget ── */}
                                            {(selectedItemType === INBOX_TYPES.MESSAGE || selectedItemType === INBOX_TYPES.EMAIL) && (() => {
                                                // Case varsa case'den oku, yoksa konuşmadan fallback
                                                const linkedCase = selectedItem.case;
                                                let convTeamIds = [];
                                                try { convTeamIds = JSON.parse(selectedItem.teamIds || '[]'); } catch {}

                                                const effectiveTeamId = linkedCase?.assignedTeamId || (convTeamIds.length > 0 ? convTeamIds[0] : null);
                                                const effectiveAgentId = linkedCase?.assignedToId || selectedItem.assignedToId;
                                                const assignedTeam = effectiveTeamId ? teams.find(t => t.id === effectiveTeamId) : null;
                                                const assignedAgent = linkedCase?.assignedTo
                                                    || selectedItem.assignedTo
                                                    || (effectiveAgentId ? members.find(m => m.userId === effectiveAgentId || m.user?.id === effectiveAgentId) : null);

                                                // Pill label
                                                let pillLabel = 'Atanmadı';
                                                const agentName = assignedAgent?.name || assignedAgent?.user?.name;
                                                if (assignedTeam && agentName) pillLabel = `${agentName} / ${assignedTeam.name}`;
                                                else if (assignedTeam) pillLabel = `${assignedTeam.name} (Havuz)`;
                                                else if (agentName) pillLabel = agentName;

                                                // Üstlen butonu: case'deki atamaya göre
                                                const canClaim = !effectiveAgentId || effectiveAgentId !== user?.id;

                                                return (
                                                    <>
                                                        <div ref={assignMegaMenuRef} style={{ position: 'relative' }}>
                                                            <button
                                                                className="stage-mega-trigger"
                                                                onClick={e => {
                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                    setAssignMegaMenuPos({ top: rect.bottom + 6, left: rect.left });
                                                                    setAssignSelectedTeam(assignedTeam?.id || null);
                                                                    setAssignMegaMenuOpen(o => !o);
                                                                }}
                                                                title="Atama"
                                                            >
                                                                <Users size={12} style={{ marginRight: 4 }} />
                                                                {pillLabel}
                                                                <ChevronDown size={10} style={{ marginLeft: 4 }} />
                                                            </button>

                                                            {assignMegaMenuOpen && (() => {
                                                                // Seçili takımın üyelerini bul
                                                                const menuTeam = assignSelectedTeam ? teams.find(t => t.id === assignSelectedTeam) : null;
                                                                // teams API zaten members[] içeriyor: { id, user: { id, name, avatar } }
                                                                const teamMembers = menuTeam?.members || [];

                                                                const ruleLabel = { POOL: 'Havuza At', ROUND_ROBIN: 'Sırayla At', LEAST_BUSY: 'En Az Yüklüye', ONLINE_ROUND_ROBIN: "Online'a Sırayla" };

                                                                return ReactDOM.createPortal(
                                                                    <>
                                                                        {/* Backdrop */}
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
                                                                            {/* Takımsız seçenek */}
                                                                            <button
                                                                                onClick={() => handleAssignConversation(null, null)}
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

                                                                        {/* Sağ panel: Seçili takım üyeleri + kural */}
                                                                        {assignSelectedTeam && (
                                                                            <div style={{ minWidth: 180 }}>
                                                                                <div style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', padding: '4px 6px 6px' }}>Atama</div>
                                                                                {/* Takıma at (kural uygula) */}
                                                                                <button
                                                                                    onClick={() => handleAssignConversation(assignSelectedTeam, null)}
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
                                                                                {teamMembers.filter(m => m.user?.id).map(m => {
                                                                                    const uid = m.user?.id || m.id;
                                                                                    const uname = m.user?.name || m.name || '?';
                                                                                    const uOnline = m.user?.isOnline || false;
                                                                                    return (
                                                                                    <button
                                                                                        key={uid}
                                                                                        onClick={() => handleAssignConversation(assignSelectedTeam, uid)}
                                                                                        style={{
                                                                                            display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
                                                                                            padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                                                                                            fontSize: '0.72rem',
                                                                                            background: selectedItem.assignedToId === uid ? '#eff6ff' : 'transparent',
                                                                                            color: selectedItem.assignedToId === uid ? '#1d4ed8' : '#374151'
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
                                                                                        {selectedItem.assignedToId === uid && <span style={{ marginLeft: 'auto', fontSize: '0.65rem' }}>✓</span>}
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
                                                                onClick={handleClaimConversation}
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

                                        {/* Right Group — boş, butonlar üst bara taşındı */}
                                        <div className="assignment-right-group" />
                                    </div>

                                </div>

                                <div className="messages-container" ref={messagesContainerRef}>
                                    {messages.map((msg) => {
                                        // ── System Event (inline log) ──
                                        if (msg.isSystemEvent) {
                                            const evtTime = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
                                            const actorName = (() => {
                                                if (msg.actorType === 'SYSTEM') return 'Sistem';
                                                if (msg.actorType === 'BOT') return 'Bot';
                                                if (msg.actorType === 'AUTOMATION') return 'Otomasyon';
                                                if (msg.actorId && members?.length) {
                                                    const m = members.find(u => u.id === msg.actorId || u.userId === msg.actorId);
                                                    if (m) return m.name || m.user?.name || 'Kullanıcı';
                                                }
                                                return msg.actorType === 'USER' ? 'Kullanıcı' : '';
                                            })();
                                            return (
                                                <div key={msg.id} style={{
                                                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                                                    padding: '4px 16px', margin: '2px 0'
                                                }}>
                                                    <span style={{
                                                        fontSize: '0.75rem', color: '#9ca3af', fontWeight: 400,
                                                        background: 'transparent', padding: '0',
                                                        letterSpacing: '0.01em', lineHeight: 1.5,
                                                        textAlign: 'center'
                                                    }}>
                                                        {evtTime && <span style={{ marginRight: '6px', color: '#b0b8c4', fontWeight: 500, fontSize: '0.7rem' }}>{evtTime}</span>}
                                                        <span dangerouslySetInnerHTML={{ __html: msg.title }} />
                                                        {actorName && <span style={{ marginLeft: '6px', color: '#b0b8c4', fontStyle: 'italic', fontSize: '0.7rem' }}>— {actorName}</span>}
                                                    </span>
                                                </div>
                                            );
                                        }

                                        // ── Activity Card (inline) ──
                                        if (msg.isActivity) {
                                            const actTypeConfig = {
                                                CALL:     { icon: '📞', label: 'Arama', accent: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' },
                                                NOTE:     { icon: '📝', label: 'Not', accent: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
                                                MEETING:  { icon: '📅', label: 'Görüşme', accent: '#10b981', bg: '#f0fdf4', border: '#a7f3d0' },
                                                REMINDER: { icon: '🔔', label: 'Hatırlatıcı', accent: '#f97316', bg: '#fff7ed', border: '#fed7aa' },
                                                TASK:     { icon: '✅', label: 'Görev', accent: '#8b5cf6', bg: '#faf5ff', border: '#ddd6fe' },
                                                VISIT:    { icon: '📍', label: 'Ziyaret', accent: '#a855f7', bg: '#fdf4ff', border: '#e9d5ff' },
                                                PAYMENT:  { icon: '💰', label: 'Tahsilat', accent: '#eab308', bg: '#fefce8', border: '#fef08a' },
                                            };
                                            const actStatusConfig = {
                                                COMPLETED: { emoji: '✅', label: 'Tamamlandı', bg: '#dcfce7', color: '#15803d' },
                                                PLANNED:   { emoji: '🕐', label: 'Planlandı', bg: '#dbeafe', color: '#1d4ed8' },
                                                CANCELLED: { emoji: '❌', label: 'İptal', bg: '#f3f4f6', color: '#6b7280' },
                                            };
                                            const cfg = actTypeConfig[msg.activityType] || actTypeConfig.NOTE;
                                            const sc = actStatusConfig[msg.activityStatus] || actStatusConfig.PLANNED;
                                            const actDate = msg.createdAt ? new Date(msg.createdAt) : null;
                                            const displayText = msg.activityResult || msg.activityContent || msg.activityTitle || '';

                                            return (
                                                <div key={msg.id} style={{
                                                    display: 'flex', justifyContent: 'center',
                                                    padding: '6px 40px', margin: '4px 0'
                                                }}>
                                                    <div
                                                        onClick={() => setSelectedActivityPopup(msg)}
                                                        style={{
                                                            background: cfg.bg, border: `1px solid ${cfg.border}`,
                                                            borderRadius: 10, padding: '8px 14px', maxWidth: 420, width: '100%',
                                                            cursor: 'pointer', transition: 'box-shadow 0.15s',
                                                        }}
                                                        onMouseEnter={e => e.currentTarget.style.boxShadow = '0 3px 12px rgba(0,0,0,0.1)'}
                                                        onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                            <span style={{ fontSize: '1rem' }}>{cfg.icon}</span>
                                                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: cfg.accent }}>{cfg.label}</span>
                                                            <span style={{
                                                                fontSize: '0.6rem', fontWeight: 700, padding: '1px 7px', borderRadius: 999,
                                                                background: sc.bg, color: sc.color,
                                                            }}>{sc.emoji} {sc.label}</span>
                                                            <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: '#9ca3af' }}>
                                                                {actDate ? actDate.toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                                                            </span>
                                                        </div>
                                                        {msg.activityAssignedTo && (
                                                            <div style={{ fontSize: '0.68rem', color: '#6b7280', marginBottom: 3 }}>
                                                                👤 {msg.activityAssignedTo} {msg.activityTeam ? `(${msg.activityTeam})` : ''}
                                                            </div>
                                                        )}
                                                        {displayText && (
                                                            <div style={{
                                                                fontSize: '0.78rem', color: '#374151', lineHeight: 1.4,
                                                                overflow: 'hidden', textOverflow: 'ellipsis',
                                                                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'
                                                            }}>
                                                                {displayText}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        }

                                        // Check if this is a lead form message
                                        const isLeadMessage = msg.content?.includes('YENİ LEAD FORMU') || msg.content?.includes('YENİ LEAD') || msg.content?.includes('Yeni Facebook Lead') || msg.content?.includes('Manuel Kayıt') || msg.content?.includes('📋 Yeni kayıt:');
                                        const isImportedLead = msg.content?.includes('İçe aktarılan lead bilgileri:') || msg.content?.includes('📥 Yeni lead:') || msg.sender === 'SYSTEM';

                                        // Check for handoff messages
                                        const isHandoffAsk = !msg.isFromContact && (
                                            msg.content?.includes('temsilcimize aktarmamı ister misiniz') ||
                                            msg.content?.includes('yönlendirmemi ister misiniz')
                                        );
                                        const isHandoffConfirmed = !msg.isFromContact && (
                                            msg.content?.includes('temsilcimize aktarıyorum') ||
                                            msg.content?.includes('En kısa sürede size dönüş yapacağız')
                                        );

                                        // Determine message class
                                        let messageClass = 'message ';
                                        const isCallSystem = msg.messageType === 'CALL_TRANSCRIPT' && (msg.content?.startsWith('📞') || msg.content?.startsWith('📲'));
                                        if (msg.isInternalNote) {
                                            messageClass += 'internal-note';
                                        } else if (isCallSystem) {
                                            messageClass += 'call-system-message';
                                        } else if (msg.isFromContact) {
                                            messageClass += 'incoming';
                                        } else {
                                            messageClass += 'outgoing';
                                        }
                                        if (msg.messageType === 'CALL_TRANSCRIPT' && !isCallSystem) messageClass += ' call-transcript-bubble';
                                        if (isLeadMessage || isImportedLead) messageClass += ' lead-message';

                                        return (
                                            <div key={msg.id} className={messageClass}>
                                                <div className="message-content">
                                                    {/* Media content */}
                                                    {msg.mediaUrl && (
                                                        <div className="message-media">
                                                            {msg.mediaType === 'image' || msg.mediaType === 'sticker' ? (
                                                                <img
                                                                    src={msg.mediaUrl}
                                                                    alt="Fotoğraf"
                                                                    className="message-media-image"
                                                                    onClick={() => window.open(msg.mediaUrl, '_blank')}
                                                                    loading="lazy"
                                                                />
                                                            ) : msg.mediaType === 'video' ? (
                                                                <video controls className="message-media-video">
                                                                    <source src={msg.mediaUrl} />
                                                                </video>
                                                            ) : msg.mediaType === 'audio' ? (
                                                                <audio controls className="message-media-audio">
                                                                    <source src={msg.mediaUrl} />
                                                                </audio>
                                                            ) : msg.mediaType === 'document' ? (
                                                                <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="message-media-doc">
                                                                    📄 Dosyayı İndir
                                                                </a>
                                                            ) : null}
                                                        </div>
                                                    )}
                                                    {/* Text content */}
                                                    {isHtmlContent(msg.content) ? (
                                                        <div
                                                            className="email-html-content"
                                                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(msg.content) }}
                                                        />
                                                    ) : isFormMessage(msg, selectedItem?.channel) ? (
                                                        renderFormMessage(msg, handleScheduleFromForm, schedulingMsgId)
                                                    ) : isLeadMessage ? (
                                                        renderLeadMessage(msg, handleScheduleFromForm, schedulingMsgId)
                                                    ) : isImportedLead ? (
                                                        (() => {
                                                            const lines = msg.content.split('\n').filter(l => l.trim());
                                                            const name = lines.find(l => !l.includes('📞') && !l.includes('✉️') && !l.includes('📝') && !l.includes('📥'))?.trim() || '';
                                                            const phoneLine = lines.find(l => l.includes('📞'));
                                                            const emailLine = lines.find(l => l.includes('✉️'));
                                                            const phone = phoneLine ? phoneLine.replace('📞', '').trim() : '';
                                                            const email = emailLine ? emailLine.replace('✉️', '').trim() : '';
                                                            const fields = [];
                                                            if (name) fields.push({ icon: '👤', label: 'İsim', value: name });
                                                            if (phone) fields.push({ icon: '📞', label: 'Telefon', value: phone });
                                                            if (email) fields.push({ icon: '✉️', label: 'E-Posta', value: email });
                                                            return (
                                                                <div className="lead-card-modern">
                                                                    <div className="lead-card-header">
                                                                        <span className="lead-card-header-icon">📋</span>
                                                                        <span className="lead-card-header-label">İçe Aktarılan Lead</span>
                                                                    </div>
                                                                    <div className="lead-card-form-name">
                                                                        <span className="lead-card-form-name-icon">📄</span>
                                                                        <span>Excel / CSV İçe Aktarma</span>
                                                                    </div>
                                                                    {fields.length > 0 && (
                                                                        <div className="lead-card-primary-fields">
                                                                            {fields.map((f, i) => (
                                                                                <div key={i} className="lead-card-field-row">
                                                                                    <span className="lead-card-field-icon">{f.icon}</span>
                                                                                    <span className="lead-card-field-label">{f.label}:</span>
                                                                                    {isEmailValue(f.value) ? (
                                                                                        <a href={`mailto:${f.value}`} className="lead-card-email-link">{f.value}</a>
                                                                                    ) : (
                                                                                        <span className="lead-card-field-value">{f.value}</span>
                                                                                    )}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                    <div className="lead-card-footer">
                                                                        <span className="lead-card-footer-time">
                                                                            🕐 {new Date(msg.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })} {new Date(msg.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()
                                                    ) : isCallSystem ? (
                                                        (() => {
                                                            // Parse call message: extract summary and recording URL
                                                            const rawContent = msg.content || '';
                                                            const recordingMatch = rawContent.match(/\[recording:(.*?)\]/);
                                                            const recordingUrl = recordingMatch ? recordingMatch[1] : null;
                                                            const summaryMatch = rawContent.match(/📋\s*(.+?)(?:\n\[recording:|$)/s);
                                                            const summary = summaryMatch ? summaryMatch[1].trim() : null;
                                                            // Clean content: remove recording tag and summary for header
                                                            const headerContent = rawContent
                                                                .replace(/\n\n📋\s*.+$/s, '')
                                                                .replace(/\n\[recording:.*?\]/, '')
                                                                .trim();
                                                            const headerLines = headerContent.split('\n');
                                                            const titleLine = headerLines[0] || '';
                                                            const detailLine = headerLines[1] || '';
                                                            const isInbound = titleLine.includes('Gelen');
                                                            return (
                                                                <div className="call-card">
                                                                    <div className="call-card-header">
                                                                        <div className="call-card-icon-wrap" style={{ background: isInbound ? '#dcfce7' : '#dbeafe' }}>
                                                                            <span style={{ fontSize: '1.2rem' }}>{isInbound ? '📲' : '📞'}</span>
                                                                        </div>
                                                                        <div className="call-card-info">
                                                                            <div className="call-card-title">{isInbound ? 'Gelen Arama' : 'Giden Arama'}</div>
                                                                            <div className="call-card-detail">{detailLine}</div>
                                                                        </div>
                                                                        <div className="call-card-status">
                                                                            {titleLine.includes('Tamamlandı') ? (
                                                                                <span className="call-card-badge completed">✓ Tamamlandı</span>
                                                                            ) : titleLine.includes('devam') ? (
                                                                                <span className="call-card-badge ongoing">● Devam Ediyor</span>
                                                                            ) : (
                                                                                <span className="call-card-badge">{titleLine.includes('Sona Erdi') ? '✓ Sona Erdi' : ''}</span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    {summary && (
                                                                        <div className="call-card-summary">
                                                                            <div className="call-card-summary-label">📋 Arama Özeti</div>
                                                                            <div className="call-card-summary-text">{summary}</div>
                                                                        </div>
                                                                    )}
                                                                    {recordingUrl && (
                                                                        <div className="call-card-recording">
                                                                            <div className="call-card-recording-label">🎙️ Kayıt Dinle</div>
                                                                            <audio controls preload="none" style={{ width: '100%', height: 36, borderRadius: 8 }}>
                                                                                <source src={recordingUrl} />
                                                                            </audio>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()
                                                    ) : (
                                                        <p>{msg.content}</p>
                                                    )}
                                                    <div className="message-meta">
                                                        <span className="message-time">{formatTime(msg.createdAt)}</span>
                                                        {!msg.isFromContact && !msg.isInternalNote && (
                                                            <>
                                                                <span className="message-channel-tag">
                                                                    {(() => {
                                                                        const ch = selectedItem?.channel;
                                                                        if (ch === 'WHATSAPP') return '💬 WhatsApp';
                                                                        if (ch === 'FACEBOOK') return '📘 Facebook';
                                                                        if (ch === 'INSTAGRAM') return '📸 Instagram';
                                                                        if (ch === 'FACEBOOK_COMMENT') return '💬 FB Yorum';
                                                                        if (ch === 'EMAIL') return '✉️ E-posta';
                                                                        if (ch === 'WIDGET') return '🌐 Web';
                                                                        if (ch === 'PHONE') return '📞 Telefon';
                                                                        if (ch === 'FORM' || ch === 'LEAD') return '📋 Form';
                                                                        return ch || '';
                                                                    })()}
                                                                </span>
                                                                <span className="message-sender-tag">
                                                                    {msg.senderId
                                                                        ? `👤 ${msg.sender?.name || 'Agent'}`
                                                                        : '🤖 AI Bot'}
                                                                </span>
                                                                <span className={`message-status ${msg.status?.toLowerCase() || 'sent'}`}>
                                                                    {msg.status === 'READ' ? (
                                                                        <CheckCheck size={14} className="status-read" title="Okundu" />
                                                                    ) : msg.status === 'DELIVERED' ? (
                                                                        <CheckCheck size={14} className="status-delivered" title="İletildi" />
                                                                    ) : msg.status === 'FAILED' ? (
                                                                        <AlertCircle size={14} className="status-failed" title="Gönderilemedi" />
                                                                    ) : (
                                                                        <Check size={14} className="status-sent" title="Gönderildi" />
                                                                    )}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                    {msg.isInternalNote && (
                                                        <div className="note-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <StickyNote size={10} />
                                                                Dahili Not ({msg.sender?.name || 'Gizli'})
                                                            </span>
                                                            <button
                                                                onClick={async (e) => {
                                                                    e.stopPropagation();
                                                                    if (!confirm('Bu dahili notu silmek istediğinize emin misiniz?')) return;
                                                                    try {
                                                                        await conversationAPI.deleteNote(currentWorkspace.id, selectedItem.id, msg.id);
                                                                        setMessages(prev => prev.filter(m => m.id !== msg.id));
                                                                    } catch (err) {
                                                                        console.error('Delete note error:', err);
                                                                        alert('Not silinemedi.');
                                                                    }
                                                                }}
                                                                title="Notu Sil"
                                                                style={{
                                                                    background: 'transparent',
                                                                    border: 'none',
                                                                    color: '#ef4444',
                                                                    cursor: 'pointer',
                                                                    padding: '2px 4px',
                                                                    borderRadius: '4px',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    opacity: 0.6,
                                                                    transition: 'opacity 0.2s'
                                                                }}
                                                                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                                                onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Email Reply Form */}
                                {selectedItemType === INBOX_TYPES.EMAIL ? (
                                    <form onSubmit={handleSendMessage} className="email-reply-form">
                                        {/* AI Suggestions Panel */}
                                        {showSuggestions && (
                                            <div className="ai-suggestions-panel">
                                                <div className="ai-suggestions-header">
                                                    <Sparkles size={14} />
                                                    <span>AI Yanıt Önerileri</span>
                                                    <button
                                                        type="button"
                                                        className="close-suggestions"
                                                        onClick={() => setShowSuggestions(false)}
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                                {loadingSuggestions ? (
                                                    <div className="suggestions-loading">
                                                        <Loader size={16} className="spin" />
                                                        <span>Öneriler hazırlanıyor...</span>
                                                    </div>
                                                ) : aiSuggestions.length > 0 ? (
                                                    <div className="suggestions-list">
                                                        {aiSuggestions.map((suggestion) => (
                                                            <button
                                                                key={suggestion.id}
                                                                type="button"
                                                                className="suggestion-item"
                                                                onClick={() => applySuggestion(suggestion)}
                                                            >
                                                                <span className="suggestion-tone">{suggestion.tone}</span>
                                                                <span className="suggestion-text">{suggestion.text}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="suggestions-empty">
                                                        <span>Öneri bulunamadı</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="email-reply-input-container">
                                            <textarea
                                                value={newMessage}
                                                onChange={(e) => setNewMessage(e.target.value)}
                                                placeholder="Yanıtınızı yazın..."
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                        e.preventDefault();
                                                        handleSendMessage(e);
                                                    }
                                                }}
                                                className="email-reply-textarea"
                                            />
                                            <div className="email-reply-actions">
                                                {/* Oto Pilot Toggle */}
                                                <div
                                                    className={`autopilot-toggle ${botEnabled ? 'active' : 'inactive'}`}
                                                    onClick={handleBotToggle}
                                                    title={botEnabled ? 'Oto Pilot Aktif - Kapatmak için tıklayın' : 'Oto Pilot Kapalı - Açmak için tıklayın'}
                                                >
                                                    <Bot size={14} />
                                                    <span>{botEnabled ? 'Oto Pilot Açık' : 'Oto Pilot Kapalı'}</span>
                                                    {togglingBot && <Loader size={12} className="spin" />}
                                                </div>
                                                {/* Template Button for emails */}
                                                {templates.length > 0 && (
                                                    <div className="template-dropdown">
                                                        <button
                                                            type="button"
                                                            className="template-btn"
                                                            title="Şablon Gönder"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                const dropdown = e.currentTarget.nextElementSibling;
                                                                dropdown.classList.toggle('show');
                                                            }}
                                                        >
                                                            <Zap size={14} />
                                                            Şablon
                                                        </button>
                                                        <div className="template-dropdown-menu">
                                                            {templates.filter(t => t.status === 'APPROVED').map(template => (
                                                                <div
                                                                    key={template.id}
                                                                    className="template-dropdown-item"
                                                                    onClick={() => {
                                                                        setNewMessage(template.content || '');
                                                                        document.querySelector('.template-dropdown-menu.show')?.classList.remove('show');
                                                                    }}
                                                                >
                                                                    <span className="template-item-name">{template.name}</span>
                                                                    <span className="template-item-category">{template.category}</span>
                                                                </div>
                                                            ))}
                                                            {templates.filter(t => t.status === 'APPROVED').length === 0 && (
                                                                <div className="template-dropdown-empty">
                                                                    Onaylı şablon yok
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                                {/* Hazır Mesaj Button */}
                                                <div className="quick-reply-dropdown-container" ref={quickReplyDropdownRef}>
                                                    <button
                                                        type="button"
                                                        className="quick-reply-btn"
                                                        title="Hazır Mesajlar"
                                                        onClick={() => setShowQuickReplyDropdown(!showQuickReplyDropdown)}
                                                    >
                                                        <BookOpen size={14} />
                                                        Hazır Mesaj
                                                    </button>
                                                    {showQuickReplyDropdown && (
                                                        <div className="quick-reply-dropdown-menu">
                                                            <div className="quick-reply-dropdown-header">
                                                                <span>Hazır Mesajlar</span>
                                                                <button type="button" onClick={() => { setShowQuickReplyModal(true); setShowQuickReplyDropdown(false); }}>
                                                                    <Plus size={14} /> Yönet
                                                                </button>
                                                            </div>
                                                            {quickReplies.length > 0 ? (
                                                                quickReplies.map(qr => (
                                                                    <div
                                                                        key={qr.id}
                                                                        className="quick-reply-dropdown-item"
                                                                        onClick={() => handleSelectQuickReply(qr)}
                                                                    >
                                                                        <span className="qr-title">{qr.content.substring(0, 30)}</span>
                                                                        <span className="qr-preview">{qr.content.substring(30, 90)}...</span>
                                                                    </div>
                                                                ))
                                                            ) : (
                                                                <div className="quick-reply-dropdown-empty">
                                                                    Henüz hazır mesaj yok
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                <button
                                                    type="button"
                                                    className="ai-suggest-btn"
                                                    onClick={fetchAiSuggestions}
                                                    disabled={loadingSuggestions}
                                                    title="AI Yanıt Önerileri"
                                                >
                                                    {loadingSuggestions ? (
                                                        <Loader size={14} className="spin" />
                                                    ) : (
                                                        <Sparkles size={14} />
                                                    )}
                                                    AI
                                                </button>
                                                <button type="submit" className="send-btn">
                                                    <Send size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    </form>
                                ) : (
                                    /* Regular Message Form */
                                    <form onSubmit={handleSendMessage} className="message-input-form">
                                        {/* AI Suggestions Panel */}
                                        {showSuggestions && (
                                            <div className="ai-suggestions-panel">
                                                <div className="ai-suggestions-header">
                                                    <Sparkles size={14} />
                                                    <span>AI Yanıt Önerileri</span>
                                                    <button
                                                        type="button"
                                                        className="close-suggestions"
                                                        onClick={() => setShowSuggestions(false)}
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                                {loadingSuggestions ? (
                                                    <div className="suggestions-loading">
                                                        <Loader size={16} className="spin" />
                                                        <span>Öneriler hazırlanıyor...</span>
                                                    </div>
                                                ) : aiSuggestions.length > 0 ? (
                                                    <div className="suggestions-list">
                                                        {aiSuggestions.map((suggestion) => (
                                                            <button
                                                                key={suggestion.id}
                                                                type="button"
                                                                className="suggestion-item"
                                                                onClick={() => applySuggestion(suggestion)}
                                                            >
                                                                <span className="suggestion-tone">{suggestion.tone}</span>
                                                                <span className="suggestion-text">{suggestion.text}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="no-suggestions">
                                                        Öneri bulunamadı
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="message-input-container" style={isInternalNoteMode ? { border: '2px solid #fbbf24', borderRadius: 12, background: '#fffbeb' } : {}}>
                                            {/* Dahili Not Modu Banner */}
                                            {isInternalNoteMode && (
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    padding: '6px 14px', background: '#fef3c7', borderBottom: '1px solid #fde68a',
                                                    borderRadius: '10px 10px 0 0', fontSize: '0.78rem', fontWeight: 600, color: '#92400e'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <StickyNote size={14} />
                                                        <span>Dahili Not — sadece ekip görebilir</span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsInternalNoteMode(false)}
                                                        style={{
                                                            background: 'none', border: 'none', cursor: 'pointer',
                                                            color: '#92400e', fontSize: '1rem', fontWeight: 700,
                                                            padding: '0 4px', lineHeight: 1
                                                        }}
                                                    >✕</button>
                                                </div>
                                            )}
                                            <div className="textarea-wrapper">
                                                {showMentionDropdown && isInternalNoteMode && (
                                                    <div style={{
                                                        position: 'absolute', bottom: '100%', left: 0, right: 0,
                                                        background: 'white', border: '1px solid #e2e8f0', borderRadius: 8,
                                                        boxShadow: '0 -4px 12px rgba(0,0,0,0.1)', maxHeight: 200, overflowY: 'auto',
                                                        zIndex: 100, marginBottom: 4
                                                    }}>
                                                        {(members || []).filter(m => {
                                                            const name = m.user?.name || m.name || '';
                                                            const email = m.user?.email || m.email || '';
                                                            return name.toLowerCase().includes(mentionQuery) || email.toLowerCase().includes(mentionQuery);
                                                        }).slice(0, 5).map(member => {
                                                            const memberName = member.user?.name || member.name || 'Bilinmiyor';
                                                            const memberId = member.user?.id || member.userId || member.id;
                                                            return (
                                                                <button key={memberId}
                                                                    onClick={() => {
                                                                        const before = newMessage.substring(0, mentionCursorPos).replace(/@\w*$/, '');
                                                                        const after = newMessage.substring(mentionCursorPos);
                                                                        setNewMessage(`${before}@${memberName} ${after}`);
                                                                        setShowMentionDropdown(false);
                                                                    }}
                                                                    style={{
                                                                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                                                                        width: '100%', border: 'none', background: 'none', cursor: 'pointer',
                                                                        fontSize: 13, textAlign: 'left'
                                                                    }}
                                                                    onMouseEnter={(e) => e.target.style.background = '#f1f5f9'}
                                                                    onMouseLeave={(e) => e.target.style.background = 'none'}
                                                                >
                                                                    <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#4f46e5' }}>
                                                                        {memberName.charAt(0).toUpperCase()}
                                                                    </span>
                                                                    <span>{memberName}</span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                                {/* 📎 Dosya Önizleme Bandı */}
                                                {pendingFile && (
                                                    <div style={{
                                                        display: 'flex', alignItems: 'center', gap: 8,
                                                        padding: '6px 12px', background: '#f0f9ff', borderBottom: '1px solid #bae6fd',
                                                        fontSize: '0.78rem', color: '#0369a1'
                                                    }}>
                                                        {pendingFile.preview ? (
                                                            <img src={pendingFile.preview} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover' }} />
                                                        ) : (
                                                            <FileText size={16} style={{ color: '#0284c7' }} />
                                                        )}
                                                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {pendingFile.name} <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>({(pendingFile.size / 1024).toFixed(0)} KB)</span>
                                                        </span>
                                                        <button type="button" onClick={cancelFileAttachment}
                                                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}>
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                )}
                                                <textarea
                                                    ref={textareaRef}
                                                    value={newMessage}
                                                    onChange={handleMessageChange}
                                                    placeholder={pendingFile ? '📎 Dosya seçildi, mesaj ekleyebilirsiniz...' : (isInternalNoteMode ? '📝 Dahili not yazın...' : 'Yanıtınızı yazın...')}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' && !e.shiftKey) {
                                                            e.preventDefault();
                                                            handleSendMessage(e);
                                                        }
                                                    }}
                                                    style={isInternalNoteMode ? { background: '#fffbeb' } : {}}
                                                />
                                                <div className="emoji-picker-wrapper" ref={emojiPickerRef}>
                                                    <button
                                                        type="button"
                                                        className={`emoji-toggle-btn ${showEmojiPicker ? 'active' : ''}`}
                                                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                                        title="Emoji ekle"
                                                    >
                                                        <Smile size={18} />
                                                    </button>
                                                    {showEmojiPicker && (
                                                        <div className="emoji-picker-panel">
                                                            {[
                                                                { label: 'Sık Kullanılan', emojis: ['😀', '😂', '❤️', '👍', '🙏', '😍', '🔥', '✅', '😊', '🎉', '💪', '😎', '🤝', '⭐', '💯'] },
                                                                { label: 'Gülen Yüzler', emojis: ['😃', '😄', '😁', '😆', '🤣', '😅', '😇', '🙂', '😉', '😌', '😋', '🤗', '🤔', '🤫', '🤭', '😏', '😒', '🙄', '😤', '😢', '😭', '😱', '🤯', '😴', '🤢', '🤮'] },
                                                                { label: 'Jestler', emojis: ['👋', '🤚', '✋', '🖐️', '👌', '🤌', '✌️', '🤞', '🤟', '🤙', '👏', '👆', '👇', '👉', '👈', '💅', '🙌', '🤲'] },
                                                                { label: 'Kalpler', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '❣️', '💕', '💗', '💖', '💝'] },
                                                                { label: 'Hayvanlar', emojis: ['🐶', '🐱', '🐭', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🐔', '🐧', '🐦', '🦋'] },
                                                                { label: 'Yemek', emojis: ['☕', '🍵', '🧃', '🍺', '🍕', '🍔', '🌮', '🍩', '🎂', '🍎', '🍇', '🍉', '🍌', '🥑'] },
                                                                { label: 'Semboller', emojis: ['✨', '🌟', '💫', '⚡', '🔔', '🎵', '🎶', '💬', '💡', '📌', '📎', '✏️', '📱', '💻', '🏆', '🎯', '🚀'] }
                                                            ].map(group => (
                                                                <div key={group.label} className="emoji-group">
                                                                    <div className="emoji-group-label">{group.label}</div>
                                                                    <div className="emoji-grid">
                                                                        {group.emojis.map((emoji, i) => (
                                                                            <button
                                                                                key={i}
                                                                                type="button"
                                                                                className="emoji-btn"
                                                                                onClick={() => {
                                                                                    const ta = textareaRef.current;
                                                                                    if (ta) {
                                                                                        const start = ta.selectionStart;
                                                                                        const end = ta.selectionEnd;
                                                                                        const newVal = newMessage.substring(0, start) + emoji + newMessage.substring(end);
                                                                                        setNewMessage(newVal);
                                                                                        setTimeout(() => {
                                                                                            ta.focus();
                                                                                            ta.selectionStart = ta.selectionEnd = start + emoji.length;
                                                                                        }, 10);
                                                                                    } else {
                                                                                        setNewMessage(prev => prev + emoji);
                                                                                    }
                                                                                }}
                                                                            >
                                                                                {emoji}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="input-actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 10px', borderTop: '1px solid #e8eaed', background: '#fafbfc', borderRadius: '0 0 12px 12px', minHeight: 38 }}>
                                                {/* LEFT: Channel Selector */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                                                    <div style={{ position: 'relative' }} ref={channelMenuRef}>
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowChannelMenu(prev => !prev)}
                                                            style={{
                                                                display: 'flex', alignItems: 'center', gap: 5,
                                                                padding: '4px 10px', border: 'none', borderRadius: 6,
                                                                background: 'transparent',
                                                                cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500,
                                                                color: '#4b5563',
                                                                transition: 'all 0.15s'
                                                            }}
                                                        >
                                                            <span style={{ fontSize: '0.85rem' }}>
                                                                {replyChannel === 'WHATSAPP' ? '💬' :
                                                                 replyChannel === 'EMAIL' ? '✉️' :
                                                                 replyChannel === 'MESSENGER' ? '📘' :
                                                                 selectedItem?.channel === 'WHATSAPP' ? '💬' :
                                                                 selectedItem?.channel === 'INSTAGRAM' ? '📸' :
                                                                 selectedItem?.channel === 'FACEBOOK' ? '📘' :
                                                                 selectedItem?.channel === 'FACEBOOK_COMMENT' ? '💬' :
                                                                 selectedItem?.channel === 'EMAIL' ? '✉️' :
                                                                 selectedItem?.channel === 'WIDGET' ? '🌐' :
                                                                 selectedItem?.channel === 'PHONE' ? '📞' : '💬'}
                                                            </span>
                                                            <span>{replyChannel === 'WHATSAPP' ? 'WhatsApp Şablon' :
                                                             replyChannel === 'EMAIL' ? 'E-posta' :
                                                             replyChannel === 'MESSENGER' ? 'Messenger' :
                                                             selectedItem?.channel === 'WHATSAPP' ? 'WhatsApp' :
                                                             selectedItem?.channel === 'INSTAGRAM' ? 'Instagram' :
                                                             selectedItem?.channel === 'FACEBOOK' ? 'Messenger' :
                                                             selectedItem?.channel === 'FACEBOOK_COMMENT' ? 'FB Yorum' :
                                                             selectedItem?.channel === 'EMAIL' ? 'E-posta' :
                                                             selectedItem?.channel === 'WIDGET' ? 'Web Widget' :
                                                             selectedItem?.channel === 'PHONE' ? 'Telefon' :
                                                             selectedItem?.channel || 'Mesaj'}</span>
                                                            <ChevronDown size={12} style={{ color: '#9ca3af' }} />
                                                        </button>
                                                        {showChannelMenu && (
                                                        <div
                                                            style={{
                                                                position: 'absolute', bottom: '100%', left: 0,
                                                                minWidth: 180, marginBottom: 4, zIndex: 100,
                                                                background: '#fff', borderRadius: 10,
                                                                boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                                                                border: '1px solid #e5e7eb', overflow: 'hidden'
                                                            }}
                                                        >
                                                            {/* Current channel - always shown */}
                                                            {selectedItem?.channel && (
                                                                <div
                                                                    style={{
                                                                        padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8,
                                                                        fontSize: '0.83rem', color: '#374151', cursor: 'pointer',
                                                                        background: !replyChannel ? '#f0f9ff' : '#fff',
                                                                        fontWeight: !replyChannel ? 600 : 400
                                                                    }}
                                                                    onClick={() => {
                                                                        setReplyChannel(null);
                                                                        setShowChannelMenu(false);
                                                                    }}
                                                                >
                                                                    <span>
                                                                        {selectedItem.channel === 'WHATSAPP' ? '💬' :
                                                                         selectedItem.channel === 'INSTAGRAM' ? '📸' :
                                                                         selectedItem.channel === 'FACEBOOK' ? '📘' :
                                                                         selectedItem.channel === 'LEAD' ? '📋' :
                                                                         selectedItem.channel === 'EMAIL' ? '✉️' :
                                                                         selectedItem.channel === 'WIDGET' ? '🌐' : '💬'}
                                                                    </span>
                                                                    {selectedItem.channel === 'WHATSAPP' ? 'WhatsApp' :
                                                                     selectedItem.channel === 'INSTAGRAM' ? 'Instagram' :
                                                                     selectedItem.channel === 'FACEBOOK' ? 'Messenger' :
                                                                     selectedItem.channel === 'LEAD' ? 'LEAD' :
                                                                     selectedItem.channel === 'EMAIL' ? 'E-posta' :
                                                                     selectedItem.channel === 'WIDGET' ? 'Web Widget' :
                                                                     selectedItem.channel}
                                                                    {!replyChannel && <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#3b82f6' }}>✓</span>}
                                                                </div>
                                                            )}
                                                            {/* WhatsApp */}
                                                            {selectedItem?.contact?.phone && selectedItem?.channel !== 'WHATSAPP' && (
                                                                <div
                                                                    style={{
                                                                        padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8,
                                                                        fontSize: '0.83rem', cursor: 'pointer',
                                                                        color: replyChannel === 'WHATSAPP' ? '#16a34a' : '#374151',
                                                                        background: replyChannel === 'WHATSAPP' ? '#f0fdf4' : '#fff',
                                                                        fontWeight: replyChannel === 'WHATSAPP' ? 600 : 400,
                                                                        borderTop: '1px solid #f3f4f6'
                                                                    }}
                                                                    onClick={() => {
                                                                        setReplyChannel('WHATSAPP');
                                                                        setShowChannelMenu(false);
                                                                    }}
                                                                >
                                                                    <span>💬</span>
                                                                    WhatsApp Şablon
                                                                    {replyChannel === 'WHATSAPP' && <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#16a34a' }}>✓</span>}
                                                                </div>
                                                            )}
                                                            {/* Email */}
                                                            {selectedItem?.contact?.email && selectedItem?.channel !== 'EMAIL' && (
                                                                <div
                                                                    style={{
                                                                        padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8,
                                                                        fontSize: '0.83rem', cursor: 'pointer',
                                                                        color: replyChannel === 'EMAIL' ? '#dc2626' : '#374151',
                                                                        background: replyChannel === 'EMAIL' ? '#fef2f2' : '#fff',
                                                                        fontWeight: replyChannel === 'EMAIL' ? 600 : 400,
                                                                        borderTop: '1px solid #f3f4f6'
                                                                    }}
                                                                    onClick={() => {
                                                                        setReplyChannel('EMAIL');
                                                                        setShowChannelMenu(false);
                                                                    }}
                                                                >
                                                                    <span>✉️</span>
                                                                    E-posta
                                                                    {replyChannel === 'EMAIL' && <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#dc2626' }}>✓</span>}
                                                                </div>
                                                            )}
                                                            {/* Messenger */}
                                                            {selectedItem?.channel === 'LEAD' && selectedItem?.facebookPageId && (
                                                                <div
                                                                    style={{
                                                                        padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8,
                                                                        fontSize: '0.83rem', cursor: 'pointer',
                                                                        color: replyChannel === 'MESSENGER' ? '#1d4ed8' : '#374151',
                                                                        background: replyChannel === 'MESSENGER' ? '#eff6ff' : '#fff',
                                                                        fontWeight: replyChannel === 'MESSENGER' ? 600 : 400,
                                                                        borderTop: '1px solid #f3f4f6'
                                                                    }}
                                                                    onClick={() => {
                                                                        setReplyChannel('MESSENGER');
                                                                        setShowChannelMenu(false);
                                                                    }}
                                                                >
                                                                    <span>📘</span>
                                                                    Messenger
                                                                    {replyChannel === 'MESSENGER' && <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#1d4ed8' }}>✓</span>}
                                                                </div>
                                                            )}
                                                        </div>
                                                        )}
                                                    </div>

                                                    {/* Dahili Not — toggle ikon */}
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsInternalNoteMode(!isInternalNoteMode)}
                                                        title={isInternalNoteMode ? 'Not modundan çık' : 'Dahili not yaz'}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 4,
                                                            padding: '4px 8px', border: 'none', borderRadius: 6,
                                                            background: isInternalNoteMode ? '#fbbf24' : '#f1f5f9',
                                                            cursor: 'pointer', fontSize: '0.75rem', fontWeight: 500,
                                                            color: isInternalNoteMode ? '#1f2937' : '#9ca3af',
                                                            transition: 'all 0.15s'
                                                        }}
                                                    >
                                                        <StickyNote size={14} />
                                                        <span>Not</span>
                                                    </button>

                                                    {/* Oto Pilot - minimal icon */}
                                                    <button
                                                        type="button"
                                                        onClick={handleBotToggle}
                                                        title={botEnabled ? 'Oto Pilot Aktif — kapat' : 'Oto Pilot Kapalı — aç'}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 4,
                                                            padding: '4px 8px', border: 'none', borderRadius: 6,
                                                            background: botEnabled ? '#dcfce7' : 'transparent',
                                                            cursor: 'pointer', fontSize: '0.75rem', fontWeight: 500,
                                                            color: botEnabled ? '#16a34a' : '#9ca3af',
                                                            transition: 'all 0.15s'
                                                        }}
                                                    >
                                                        <Bot size={14} />
                                                        {togglingBot && <Loader size={11} className="spin" />}
                                                    </button>
                                                </div>

                                                {/* CENTER: hint text */}
                                                <span style={{ fontSize: '0.7rem', color: '#c0c5cc', userSelect: 'none', flex: 1, textAlign: 'center', display: window.innerWidth < 768 ? 'none' : 'block' }}>
                                                    Enter ile gönder
                                                </span>

                                                {/* RIGHT: Action icons + AI Assist + Send */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                    {/* Template icon */}
                                                    {(selectedItem?.channel === 'LEAD' || selectedItem?.channel === 'WHATSAPP' || replyChannel === 'WHATSAPP') && templates.length > 0 && (
                                                        <div className="template-dropdown">
                                                            <button
                                                                type="button"
                                                                className="template-btn"
                                                                title="WhatsApp Şablon Gönder"
                                                                style={{ fontSize: '0.75rem', padding: '4px 6px', border: 'none', background: 'transparent', color: '#6b7280', cursor: 'pointer', borderRadius: 6, display: 'flex', alignItems: 'center' }}
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    const dropdown = e.currentTarget.nextElementSibling;
                                                                    dropdown.classList.toggle('show');
                                                                }}
                                                            >
                                                                <Zap size={15} />
                                                            </button>
                                                            <div className="template-dropdown-menu">
                                                                {templates.filter(t => t.status === 'APPROVED').map(template => (
                                                                    <div
                                                                        key={template.id}
                                                                        className="template-dropdown-item"
                                                                        onClick={() => {
                                                                            openTemplateModal(template);
                                                                            document.querySelector('.template-dropdown-menu.show')?.classList.remove('show');
                                                                        }}
                                                                    >
                                                                        <span className="template-item-name">{template.name}</span>
                                                                        <span className="template-item-category">{template.category}</span>
                                                                    </div>
                                                                ))}
                                                                {templates.filter(t => t.status === 'APPROVED').length === 0 && (
                                                                    <div className="template-dropdown-empty">
                                                                        Onaylı şablon yok
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {/* Quick Reply icon */}
                                                    <div className="quick-reply-dropdown-container" ref={quickReplyDropdownRef}>
                                                        <button
                                                            type="button"
                                                            title="Hazır Mesajlar"
                                                            style={{ padding: '4px 6px', border: 'none', background: 'transparent', color: '#6b7280', cursor: 'pointer', borderRadius: 6, display: 'flex', alignItems: 'center' }}
                                                            onClick={() => setShowQuickReplyDropdown(!showQuickReplyDropdown)}
                                                        >
                                                            <BookOpen size={15} />
                                                        </button>
                                                        {showQuickReplyDropdown && (
                                                            <div className="quick-reply-dropdown-menu">
                                                                <div className="quick-reply-dropdown-header">
                                                                    <span>Hazır Mesajlar</span>
                                                                    <button type="button" onClick={() => { setShowQuickReplyModal(true); setShowQuickReplyDropdown(false); }}>
                                                                        <Plus size={14} /> Yönet
                                                                    </button>
                                                                </div>
                                                                {quickReplies.length > 0 ? (
                                                                    quickReplies.map(qr => (
                                                                        <div
                                                                            key={qr.id}
                                                                            className="quick-reply-dropdown-item"
                                                                            onClick={() => handleSelectQuickReply(qr)}
                                                                        >
                                                                            <span className="qr-title">{qr.content.substring(0, 30)}</span>
                                                                            <span className="qr-preview">{qr.content.substring(30, 90)}...</span>
                                                                        </div>
                                                                    ))
                                                                ) : (
                                                                    <div className="quick-reply-dropdown-empty">
                                                                        Henüz hazır mesaj yok
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* 📎 Dosya Ekle */}
                                                    <input type="file" ref={fileInputRef} onChange={handleFileSelect} style={{ display: 'none' }}
                                                        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.csv,.txt" />
                                                    <button
                                                        type="button"
                                                        onClick={() => fileInputRef.current?.click()}
                                                        disabled={fileUploading}
                                                        title="Dosya Ekle"
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 4,
                                                            padding: '4px 6px', border: 'none', borderRadius: 6,
                                                            background: pendingFile ? '#dbeafe' : 'transparent',
                                                            cursor: 'pointer', color: pendingFile ? '#1d4ed8' : '#6b7280',
                                                            transition: 'all 0.15s'
                                                        }}
                                                    >
                                                        {fileUploading ? <Loader size={15} className="spin" /> : <Paperclip size={15} />}
                                                    </button>

                                                    {/* Separator */}
                                                    <div style={{ width: 1, height: 18, background: '#e5e7eb', margin: '0 4px' }} />

                                                    {/* AI Assist */}
                                                    <button
                                                        type="button"
                                                        onClick={fetchAiSuggestions}
                                                        disabled={loadingSuggestions}
                                                        title="AI Yanıt Önerileri"
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 4,
                                                            padding: '4px 10px', border: 'none', borderRadius: 6,
                                                            background: 'transparent', cursor: 'pointer',
                                                            fontSize: '0.78rem', fontWeight: 500, color: '#7c3aed',
                                                            transition: 'all 0.15s'
                                                        }}
                                                    >
                                                        {loadingSuggestions ? <Loader size={13} className="spin" /> : <Sparkles size={14} />}
                                                        <span>AI Assist</span>
                                                    </button>

                                                    {/* Send */}
                                                    <button type="submit" className="send-btn" style={{
                                                        padding: '5px 8px', borderRadius: 8, marginLeft: 2,
                                                        ...(isInternalNoteMode ? { background: '#f59e0b' } : {})
                                                    }}>
                                                        {isInternalNoteMode ? <StickyNote size={16} /> : <Send size={16} />}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </form>
                                )}
                            </>
                        )}

                        {/* Comment Detail View */}
                        {selectedItemType === INBOX_TYPES.COMMENT && (
                            <>
                                <div className="detail-header">
                                    {/* Profile Bar - SAME as MESSAGE view */}
                                    <div className="profile-bar">
                                        <div className="profile-bar-left">
                                            <div className="detail-avatar">
                                                {comments[0]?.from?.profile_picture_url ? (
                                                    <img src={comments[0].from.profile_picture_url} alt={comments[0].from?.name} />
                                                ) : (
                                                    <User size={24} />
                                                )}
                                            </div>
                                            <div className="profile-info">
                                                <h3>{comments[0]?.from?.name || comments[0]?.from?.username || 'Bilinmeyen'}</h3>
                                                <div className="detail-channel-info">
                                                    {selectedPost?.platform === 'INSTAGRAM' ? (
                                                        <Instagram size={12} style={{ color: '#E4405F' }} />
                                                    ) : (
                                                        <Facebook size={12} style={{ color: '#1877F2' }} />
                                                    )}
                                                    <span>
                                                        {selectedPost?.platform === 'INSTAGRAM' ? 'Instagram' : 'Facebook'}
                                                    </span>
                                                    <span className="page-source">
                                                        • {selectedPost?.pageName}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="profile-bar-actions">
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginRight: '16px', fontSize: '11px', color: '#6b7280', alignItems: 'flex-end' }}>
                                                <span>İlk Yazma: {comments[0]?.created_time ? new Date(comments[0].created_time).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '---'}</span>
                                                <span>Son Yazma: {comments[comments.length - 1]?.created_time ? new Date(comments[comments.length - 1].created_time).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '---'}</span>
                                            </div>
                                            {/* Status Toggle - Açık / Çözüldü */}
                                            {(() => {
                                                const isResolved = resolvedPostIds.has(selectedItem?.id);
                                                return (
                                                    <button
                                                        className={`conv-status-toggle ${isResolved ? 'resolved' : 'open'}`}
                                                        onClick={() => handleCommentStatusChange(selectedItem?.id, isResolved ? 'OPEN' : 'RESOLVED')}
                                                        title={isResolved ? 'Açık olarak işaretle' : 'Çözüldü olarak işaretle'}
                                                    >
                                                        <span className="conv-status-toggle-track">
                                                            <span className="conv-status-toggle-thumb">
                                                                {isResolved ? <CheckCircle2 size={11} /> : <Circle size={11} />}
                                                            </span>
                                                        </span>
                                                        <span className="conv-status-toggle-label">
                                                            {isResolved ? 'Çözüldü' : 'Açık'}
                                                        </span>
                                                    </button>
                                                );
                                            })()}
                                            {selectedPost?.permalink_url && (
                                                <a
                                                    href={selectedPost.permalink_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="profile-action-btn"
                                                    title="Gönderiye Git"
                                                    style={{ marginLeft: '8px' }}
                                                >
                                                    <ExternalLink size={16} />
                                                </a>
                                            )}
                                        </div>
                                    </div>

                                    {/* Assignment Bar - SAME as MESSAGE view */}
                                    <div className="assignment-bar">
                                        <div className="assignment-left-group">
                                            {isOwner && (
                                                <>
                                                    {/* Team Selection */}
                                                    <div className="assignment-item">
                                                        <Users size={14} />
                                                        <select defaultValue="">
                                                            <option value="">Takım Seç</option>
                                                            {(() => {
                                                                const renderTeamOptions = (teamList, depth = 0) => {
                                                                    const options = [];
                                                                    for (const t of teamList) {
                                                                        const prefix = depth > 0 ? '↳'.repeat(depth) + ' ' : '';
                                                                        const suffix = t.children && t.children.length > 0 && depth === 0 ? ' (Ana Takım)' : '';
                                                                        options.push(
                                                                            <option key={t.id} value={t.id}>{prefix}{t.name}{suffix}</option>
                                                                        );
                                                                        if (t.children && t.children.length > 0) {
                                                                            options.push(...renderTeamOptions(t.children, depth + 1));
                                                                        }
                                                                    }
                                                                    return options;
                                                                };
                                                                return renderTeamOptions(teams);
                                                            })()}
                                                        </select>
                                                    </div>
                                                    {/* Agent Selection */}
                                                    <div className="assignment-item">
                                                        <User size={14} />
                                                        <select defaultValue="">
                                                            <option value="">Agent Seç</option>
                                                            {members.map(m => (
                                                                <option key={m.id} value={m.user.id}>{(onlineUsers.get(m.user.id)?.isOnline || m.user?.isOnline) ? '🟢' : '⚪'} {m.user.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        {/* Right Group: Contact Status */}
                                        <div className="assignment-right-group">
                                            <div className="assignment-item contact-status-item">
                                                <span className="status-dot" style={{ backgroundColor: '#3b82f6' }} />
                                                <select defaultValue="NEW_APPLICATION">
                                                    {CUSTOMER_STATUS_OPTIONS.map(opt => (
                                                        <option key={opt.value} value={opt.value}>
                                                            {opt.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Post Image + Caption Banner */}
                                {selectedPost?.full_picture && (
                                    <div className="comment-post-preview">
                                        <img
                                            src={selectedPost.full_picture}
                                            alt="Post"
                                            className="comment-post-image"
                                            onClick={() => selectedPost.permalink_url && window.open(selectedPost.permalink_url, '_blank')}
                                        />
                                        {selectedPost.message && (
                                            <p className="comment-post-caption">
                                                {selectedPost.message.length > 120
                                                    ? selectedPost.message.substring(0, 120) + '...'
                                                    : selectedPost.message}
                                            </p>
                                        )}
                                    </div>
                                )}

                                <div className="messages-container" ref={messagesContainerRef}>
                                    {comments.map((comment) => {
                                        const isPageComment = comment.from?.id === selectedPost?.pageId;
                                        // FB: backend returns from.picture.url | IG: from.profile_picture_url
                                        const avatar =
                                            comment.from?.picture?.url ||
                                            comment.from?.profile_picture_url ||
                                            null;
                                        const username = comment.from?.name || comment.from?.username || 'Bilinmeyen';
                                        const timeAgo = (ts) => {
                                            if (!ts) return '';
                                            const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
                                            if (diff < 60) return `${diff}sn`;
                                            if (diff < 3600) return `${Math.floor(diff / 60)}dk`;
                                            if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
                                            return `${Math.floor(diff / 86400)}g`;
                                        };

                                        return (
                                            <React.Fragment key={comment.id}>
                                                {/* Main comment */}
                                                <div className={`ig-comment-row${isPageComment ? ' page-comment' : ''}`}>
                                                    <div className="ig-comment-avatar">
                                                        {avatar
                                                            ? <img src={avatar} alt={username} />
                                                            : <span>{username[0]?.toUpperCase()}</span>}
                                                    </div>
                                                    <div className="ig-comment-body">
                                                        <div className="ig-comment-bubble">
                                                            <span className="ig-comment-username">
                                                                {username}
                                                                {isPageComment && (
                                                                    selectedPost?.platform === 'INSTAGRAM'
                                                                        ? <Instagram size={11} className="ig-verified-icon" />
                                                                        : <Facebook size={11} className="ig-verified-icon fb" />
                                                                )}
                                                            </span>
                                                            <span className="ig-comment-text">{comment.message}</span>
                                                        </div>
                                                        <div className="ig-comment-actions">
                                                            <span className="ig-comment-time">{timeAgo(comment.created_time)}</span>
                                                            <button className="ig-reply-btn">Yanıtla</button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Replies (page replies as sub-comments) */}
                                                {comment.comments?.data?.length > 0 && (
                                                    <div className="ig-replies-block">
                                                        <div className="ig-replies-toggle">
                                                            <span className="ig-replies-line" />
                                                            <span className="ig-replies-label">Tüm yanıtları gizle</span>
                                                        </div>
                                                        {comment.comments.data.map(reply => {
                                                            const replyAvatar =
                                                                reply.from?.picture?.url ||
                                                                reply.from?.profile_picture_url ||
                                                                null;
                                                            const replyUsername = reply.from?.name || reply.from?.username || selectedPost?.pageName || 'Sayfa';
                                                            return (
                                                                <div key={reply.id} className="ig-comment-row reply page-comment">
                                                                    <div className="ig-comment-avatar">
                                                                        {replyAvatar
                                                                            ? <img src={replyAvatar} alt={replyUsername} />
                                                                            : <span>{replyUsername[0]?.toUpperCase()}</span>}
                                                                    </div>
                                                                    <div className="ig-comment-body">
                                                                        <div className="ig-comment-bubble">
                                                                            <span className="ig-comment-username">
                                                                                {replyUsername}
                                                                                {selectedPost?.platform === 'INSTAGRAM'
                                                                                    ? <Instagram size={11} className="ig-verified-icon" />
                                                                                    : <Facebook size={11} className="ig-verified-icon fb" />}
                                                                            </span>
                                                                            <span className="ig-comment-text">{reply.message}</span>
                                                                        </div>
                                                                        <div className="ig-comment-actions">
                                                                            <span className="ig-comment-time">{timeAgo(reply.created_time)}</span>
                                                                            <button className="ig-reply-btn">Yanıtla</button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </div>

                                <form onSubmit={(e) => { e.preventDefault(); handleSendComment(); }} className="message-input-form">
                                    <div className="message-input-container">
                                        <textarea
                                            value={replyText}
                                            onChange={(e) => setReplyText(e.target.value)}
                                            placeholder="Yanıtınızı yazın..."
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleSendComment();
                                                }
                                            }}
                                        />
                                        <div className="input-actions">
                                            {/* Oto Pilot Toggle */}
                                            <div
                                                className={`autopilot-toggle ${botEnabled ? 'active' : 'inactive'}`}
                                                onClick={handleBotToggle}
                                                title={botEnabled ? 'Oto Pilot Aktif - Kapatmak için tıklayın' : 'Oto Pilot Kapalı - Açmak için tıklayın'}
                                            >
                                                <Bot size={14} />
                                                <span>{botEnabled ? 'Oto Pilot Açık' : 'Oto Pilot Kapalı'}</span>
                                                {togglingBot && <Loader size={12} className="spin" />}
                                            </div>

                                            <button
                                                type="button"
                                                className="ai-suggest-btn"
                                                onClick={fetchAiSuggestions}
                                                disabled={loadingSuggestions}
                                                title="AI Yanıt Önerileri"
                                            >
                                                {loadingSuggestions ? (
                                                    <Loader size={14} className="spin" />
                                                ) : (
                                                    <Sparkles size={14} />
                                                )}
                                                AI
                                            </button>
                                            <button type="submit" className="send-btn">
                                                <Send size={18} />
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            </>
                        )}

                    </>
                ) : (
                    <div className="inbox-detail-empty">
                        <InboxIcon size={48} />
                        <h3>Öğe Seçin</h3>
                        <p>Detayları görüntülemek için soldan bir öğe seçin</p>
                    </div>
                )}
            </div>

            {/* Right Panel - Contact Sidebar */}
            {selectedItem && showContactSidebar && viewMode !== 'pipeline' && (
                <div style={{
                    position: 'fixed', top: 0, right: 0,
                    width: 320, height: '100vh',
                    zIndex: 1499, overflowY: 'auto',
                    boxShadow: '-4px 0 24px rgba(0,0,0,0.12)'
                }}>
                    <ContactSidebar
                        key={selectedItem.id}
                        conversationId={selectedItem.id}
                        conversationData={selectedItem}
                        isOpen={true}
                        members={members}
                        teams={teams}
                        onAssign={userId => handleAssignUser(selectedItem.id, userId)}
                        onAssignTeam={async (convId, teamId) => {
                            try {
                                await conversationAPI.assign(currentWorkspace.id, selectedItem.id, { teamId: teamId || null });
                                const newTeamIds = teamId ? JSON.stringify([teamId]) : '[]';
                                setSelectedItem(prev => prev ? { ...prev, teamIds: newTeamIds } : prev);
                                setInboxItems(prev => prev.map(item =>
                                    item.id === selectedItem.id ? { ...item, teamIds: newTeamIds } : item
                                ));
                            } catch(e) {
                                console.error('[Inbox] Team assign error:', e?.response?.data || e);
                                alert('Takım ataması başarısız: ' + (e?.response?.data?.error || e.message));
                            }
                        }}
                        onAssignUser={async (convId, userId) => {
                            try {
                                const res = await conversationAPI.assign(currentWorkspace.id, selectedItem.id, { userId: userId || null });
                                const assignedMember = userId ? members.find(m => m.id === userId) : null;
                                const assignedTo = assignedMember ? { id: assignedMember.id, name: assignedMember.name, avatar: assignedMember.avatar } : null;
                                const newTeamIds = res?.data?.conversation?.teamIds || selectedItem.teamIds;
                                setSelectedItem(prev => prev ? { ...prev, assignedToId: userId || null, assignedTo, teamIds: newTeamIds } : prev);
                                setInboxItems(prev => prev.map(item =>
                                    item.id === selectedItem.id ? { ...item, assignedToId: userId || null, assignedTo, teamIds: newTeamIds } : item
                                ));
                            } catch(e) {
                                console.error('[Inbox] User assign error:', e?.response?.data || e);
                                alert('Agent ataması başarısız: ' + (e?.response?.data?.error || e.message));
                            }
                        }}
                        onTakeOver={async () => {
                            try {
                                const response = await conversationAPI.claim(currentWorkspace.id, selectedItem.id);
                                const myId = user?.id || null;
                                const myInfo = { id: myId, name: user?.name || 'Ben' };
                                // Update from server response if available
                                const updated = response?.data?.conversation;
                                const newTeamIds = updated?.teamIds || selectedItem.teamIds;
                                setSelectedItem(prev => prev ? { ...prev, assignedToId: myId, assignedTo: myInfo, teamIds: newTeamIds } : prev);
                                setInboxItems(prev => prev.map(item =>
                                    item.id === selectedItem.id ? { ...item, assignedToId: myId, assignedTo: myInfo, teamIds: newTeamIds } : item
                                ));
                            } catch(e) {
                                console.error('[TakeOver/Claim] Error:', e);
                                alert('Üstlenme başarısız: ' + (e?.response?.data?.error || e.message));
                            }
                        }}
                        isOwner={isOwner}
                        currentUserId={user?.id}
                        onActivitySaved={handleActivitySaved}
                        onClose={() => setShowContactSidebar(false)}
                        onOpenConversationPopup={(convId, channel) => setConvPopup({ conversationId: convId, channel })}
                        onConversationStatusChange={handleConversationStatusChange}
                        funnelOptions={funnelOptions}
                    />
                </div>
            )}

            {/* Right Panel - Contact Sidebar for Comments */}
            {selectedItemType === INBOX_TYPES.COMMENT && selectedPost && (
                <div className="inbox-contact-sidebar-wrapper">
                    <ContactSidebar
                        isOpen={true}
                        members={members}
                        isOwner={isOwner}
                        readOnly={true}
                        onClose={() => setShowContactSidebar(false)}
                        externalProfile={{
                            name: selectedPost.from?.name || 'Facebook Kullanıcısı',
                            profilePic: selectedPost.from?.id
                                ? `https://graph.facebook.com/${selectedPost.from.id}/picture?type=large`
                                : null,
                            facebookId: selectedPost.from?.id,
                            channel: 'FACEBOOK',
                            tags: [],
                            // Post info
                            postMessage: selectedPost.message?.substring(0, 100),
                            postDate: selectedPost.created_time
                        }}
                    />
                </div>
            )}

            {/* WhatsApp Template Send Modal */}
            {showTemplateModal && selectedTemplate && (
                <div className="modal-overlay" onClick={() => setShowTemplateModal(false)}>
                    <div className="template-send-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>📨 WhatsApp Şablon Gönder</h3>
                            <button className="modal-close" onClick={() => setShowTemplateModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="template-info">
                                <span className="template-name">{selectedTemplate.name}</span>
                                <span className="template-category">{selectedTemplate.category}</span>
                            </div>
                            <div className="template-preview">
                                <p>{selectedTemplate.bodyText}</p>
                            </div>

                            {selectedItem?.contact?.phone ? (
                                <div className="recipient-info">
                                    <Phone size={16} />
                                    <span>Alıcı: {selectedItem.contact.name} ({selectedItem.contact.phone})</span>
                                </div>
                            ) : (
                                <div className="recipient-warning">
                                    <AlertCircle size={16} />
                                    <span>Bu kişinin telefon numarası yok!</span>
                                </div>
                            )}

                            {/* Header Media URL for IMAGE/VIDEO/DOCUMENT templates */}
                            {selectedTemplate?.headerType && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(selectedTemplate.headerType) && (
                                <div className="template-header-media">
                                    <h4>
                                        {selectedTemplate.headerType === 'IMAGE' && '🖼️ Resim URL\'si'}
                                        {selectedTemplate.headerType === 'VIDEO' && '🎬 Video URL\'si'}
                                        {selectedTemplate.headerType === 'DOCUMENT' && '📄 Döküman URL\'si'}
                                        <span className="required">*</span>
                                    </h4>
                                    <input
                                        type="url"
                                        value={headerMediaUrl}
                                        onChange={(e) => setHeaderMediaUrl(e.target.value)}
                                        placeholder={`https://example.com/${selectedTemplate.headerType.toLowerCase()}.${selectedTemplate.headerType === 'IMAGE' ? 'jpg' : selectedTemplate.headerType === 'VIDEO' ? 'mp4' : 'pdf'}`}
                                    />
                                    <p className="hint">Herkese açık bir URL olmalıdır</p>
                                </div>
                            )}

                            {templateVariables.length > 0 && (
                                <div className="template-variables">
                                    <h4>Değişkenler</h4>
                                    {templateVariables.map((v, idx) => (
                                        <div key={idx} className="variable-input">
                                            <label>{v.placeholder}</label>
                                            <input
                                                type="text"
                                                value={v.value}
                                                onChange={(e) => {
                                                    const newVars = [...templateVariables];
                                                    newVars[idx].value = e.target.value;
                                                    setTemplateVariables(newVars);
                                                }}
                                                placeholder={`Değer ${idx + 1}`}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn-cancel" onClick={() => setShowTemplateModal(false)}>
                                İptal
                            </button>
                            <button
                                className="btn-send-template"
                                onClick={handleSendTemplate}
                                disabled={sendingTemplate || !selectedItem?.contact?.phone}
                            >
                                {sendingTemplate ? <Loader className="spinning" size={16} /> : <Send size={16} />}
                                {sendingTemplate ? 'Gönderiliyor...' : 'Gönder'}
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {/* New Conversation Modal */}
            {ownershipWarning && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', zIndex: 10000
                }} onClick={() => setOwnershipWarning(null)}>
                    <div style={{
                        background: 'white', borderRadius: 16, padding: 24, maxWidth: 440,
                        width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)'
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ fontSize: 20, marginBottom: 8 }}>⚠️ Bu Kişiyle Zaten İlgileniliyor</div>
                        <p style={{ color: '#64748b', fontSize: 14, margin: '8px 0 16px' }}>
                            <strong>{ownershipWarning.activeAgent}</strong> bu kişi için çalışıyor
                            ({ownershipWarning.openTasks} açık görev, {ownershipWarning.recentNotes} son not)
                        </p>
                        
                        {ownershipWarning.openTaskList?.length > 0 && (
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Açık Görevler:</div>
                                {ownershipWarning.openTaskList.map(task => (
                                    <div key={task.id} style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        padding: '6px 10px', background: '#f8fafc', borderRadius: 8,
                                        fontSize: 12, marginBottom: 4
                                    }}>
                                        <span>{task.type === 'CALL' ? '📞' : task.type === 'MEETING' ? '🤝' : task.type === 'TASK' ? '✅' : '📋'}</span>
                                        <span style={{ flex: 1 }}>{task.title || 'Görev'}</span>
                                        {task.dueDate && <span style={{ color: '#94a3b8' }}>{new Date(task.dueDate).toLocaleDateString('tr-TR')}</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                        
                        {ownershipWarning.openTasks > 0 && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#eff6ff', borderRadius: 8, cursor: 'pointer', fontSize: 13, marginBottom: 16 }}>
                                <input type="checkbox" id="takeOverTasks" defaultChecked />
                                Açık görevleri de devral ({ownershipWarning.openTasks} görev)
                            </label>
                        )}
                        
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button onClick={() => setOwnershipWarning(null)}
                                style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 13 }}>
                                Vazgeç
                            </button>
                            <button onClick={async () => {
                                const takeOverTasks = document.getElementById('takeOverTasks')?.checked ?? false;
                                try {
                                    await conversationAPI.takeOver(currentWorkspace.id, ownershipWarning.conversationId, { force: true, takeOverTasks });
                                    setOwnershipWarning(null);
                                    loadInboxItems(false);
                                } catch (err) {
                                    console.error('Force take over error:', err);
                                }
                            }}
                                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#f59e0b', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                                Devral
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <NewConversationModal
                workspaceId={currentWorkspace?.id}
                isOpen={showNewConversationModal}
                onClose={() => setShowNewConversationModal(false)}
                onSuccess={(conversation) => {
                    loadInboxItems();
                    if (conversation?.id) {
                        setSelectedItem(conversation);
                        setSelectedItemType('message');
                    }
                }}
            />

            {/* Quick Reply Management Modal */}
            {showQuickReplyModal && (
                <div className="modal-overlay" onClick={() => { setShowQuickReplyModal(false); setEditingQuickReply(null); setQuickReplyForm({ content: '' }); }}>
                    <div className="modal-content quick-reply-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3><BookOpen size={18} /> Hazır Mesajları Yönet</h3>
                            <button className="modal-close" onClick={() => { setShowQuickReplyModal(false); setEditingQuickReply(null); setQuickReplyForm({ content: '' }); }}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="modal-body">
                            {/* Add/Edit Form */}
                            <div className="qr-form">
                                <h4>{editingQuickReply ? 'Düzenle' : 'Yeni Hazır Mesaj'}</h4>
                                <div className="form-group">
                                    <textarea
                                        placeholder="Hazır mesaj içeriğini yazın..."
                                        value={quickReplyForm.content}
                                        onChange={(e) => setQuickReplyForm({ content: e.target.value })}
                                        rows={4}
                                    />
                                </div>
                                <div className="qr-form-actions">
                                    {editingQuickReply && (
                                        <button className="btn-cancel" onClick={() => { setEditingQuickReply(null); setQuickReplyForm({ content: '' }); }}>{t('common.cancel')}</button>
                                    )}
                                    <button
                                        className="btn-submit"
                                        onClick={handleSaveQuickReply}
                                        disabled={!quickReplyForm.content || savingQuickReply}
                                    >
                                        {savingQuickReply ? 'Kaydediliyor...' : (editingQuickReply ? 'Güncelle' : 'Kaydet')}
                                    </button>
                                </div>
                            </div>

                            {/* Existing Quick Replies List */}
                            <div className="qr-list">
                                <h4>Mevcut Hazır Mesajlar ({quickReplies.length})</h4>
                                {quickReplies.length === 0 ? (
                                    <div className="qr-empty">
                                        <BookOpen size={32} style={{ opacity: 0.3 }} />
                                        <p>Henüz hazır mesaj oluşturmadınız</p>
                                    </div>
                                ) : (
                                    quickReplies.map(qr => (
                                        <div key={qr.id} className={`qr-list-item ${editingQuickReply?.id === qr.id ? 'editing' : ''}`}>
                                            <div className="qr-list-item-content">
                                                <p>{qr.content}</p>
                                            </div>
                                            <div className="qr-list-item-actions">
                                                <button onClick={() => handleEditQuickReply(qr)} title={t('common.edit')}>
                                                    <Edit2 size={14} />
                                                </button>
                                                <button onClick={() => handleDeleteQuickReply(qr.id)} title={t('common.delete')} className="danger">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}


            {/* Kanal Yazışma Popup */}
            {convPopup && (
                <ConversationPopup
                    workspaceId={currentWorkspace?.id}
                    conversationId={convPopup.conversationId}
                    channel={convPopup.channel}
                    onClose={() => setConvPopup(null)}
                />
            )}

            {/* ── Activity Detail Popup ── */}
            {selectedActivityPopup && ReactDOM.createPortal(
                <>
                    <div onClick={() => setSelectedActivityPopup(null)} style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 99998
                    }} />
                    <div style={{
                        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        zIndex: 99999, background: '#fff', borderRadius: 16, padding: '24px 28px',
                        minWidth: 380, maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
                    }}>
                        {(() => {
                            const a = selectedActivityPopup;
                            const typeLabels = { CALL: '📞 Arama', NOTE: '📝 Not', MEETING: '📅 Görüşme', REMINDER: '🔔 Hatırlatıcı', TASK: '✅ Görev', VISIT: '📍 Ziyaret', PAYMENT: '💰 Tahsilat' };
                            const statusLabels = { COMPLETED: { emoji: '✅', label: 'Tamamlandı', color: '#15803d', bg: '#dcfce7' }, PLANNED: { emoji: '🕐', label: 'Planlandı', color: '#1d4ed8', bg: '#dbeafe' }, CANCELLED: { emoji: '❌', label: 'İptal', color: '#6b7280', bg: '#f3f4f6' } };
                            const sc = statusLabels[a.activityStatus] || statusLabels.PLANNED;
                            return (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>
                                            {typeLabels[a.activityType] || a.activityType}
                                        </span>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: sc.bg, color: sc.color }}>
                                            {sc.emoji} {sc.label}
                                        </span>
                                    </div>
                                    {a.activityTitle && (
                                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151', marginBottom: 10 }}>
                                            {a.activityTitle}
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {a.activityAssignedTo && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: '#4b5563' }}>
                                                <span style={{ fontWeight: 600, color: '#6b7280', minWidth: 70 }}>Atanan:</span>
                                                <span>{a.activityAssignedTo} {a.activityTeam ? `(${a.activityTeam})` : ''}</span>
                                            </div>
                                        )}
                                        {a.activityDueDate && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: '#4b5563' }}>
                                                <span style={{ fontWeight: 600, color: '#6b7280', minWidth: 70 }}>Tarih:</span>
                                                <span>{new Date(a.activityDueDate).toLocaleString('tr-TR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                        )}
                                        {a.activityCreatedBy && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: '#4b5563' }}>
                                                <span style={{ fontWeight: 600, color: '#6b7280', minWidth: 70 }}>Oluşturan:</span>
                                                <span>{a.activityCreatedBy}</span>
                                            </div>
                                        )}
                                    </div>
                                    {a.activityContent && (
                                        <div style={{ marginTop: 14, padding: '10px 14px', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb' }}>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 }}>Açıklama</div>
                                            <div style={{ fontSize: '0.85rem', color: '#374151', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{a.activityContent}</div>
                                        </div>
                                    )}
                                    {a.activityResult && (
                                        <div style={{ marginTop: 10, padding: '10px 14px', background: '#f0fdf4', borderRadius: 10, border: '1px solid #a7f3d0' }}>
                                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase', marginBottom: 4 }}>Sonuç</div>
                                            <div style={{ fontSize: '0.85rem', color: '#374151', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{a.activityResult}</div>
                                        </div>
                                    )}
                                    <button
                                        onClick={() => setSelectedActivityPopup(null)}
                                        style={{ marginTop: 18, width: '100%', padding: '10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: '0.85rem', fontWeight: 600, color: '#374151', cursor: 'pointer' }}
                                    >
                                        Kapat
                                    </button>
                                </>
                            );
                        })()}
                    </div>
                </>,
                document.body
            )}

        </div>
    );
};

export default Inbox;

