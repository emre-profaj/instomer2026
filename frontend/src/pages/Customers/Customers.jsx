import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { contactAPI, automationAPI, emailAPI, retellAPI, funnelAPI, teamAPI, workspaceAPI, conversationAPI, leadsAPI } from '../../services/api';
import * as XLSX from 'xlsx';
import {
    User,
    Users,
    Search,
    MessageSquare,
    Phone,
    Mail,
    MapPin,
    Building,
    Calendar,
    ExternalLink,
    ChevronLeft,
    ChevronRight,
    CheckCircle2,
    Bell,
    BookOpen,
    Edit2,
    Smile,
    Filter,
    Check,
    Plus,
    X,
    Trash2,
    Facebook,
    Instagram,
    MessageCircle,
    Copy,
    Archive,
    ArchiveRestore,
    StickyNote,
    Save,
    Download,
    ChevronDown,
    Send,
    PhoneCall,
    Loader,
    Upload,
    Tag,
    BarChart3,
    TrendingUp,
    PhoneOff,
    Eye,
    EyeOff,
    ArrowUpDown,
    Bot,
    UserCheck,
    CircleOff
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './Customers.css';
import '../../components/ContactSidebar/ContactSidebar.css';
import ContactSidebar from '../../components/ContactSidebar/ContactSidebar';
import ConfirmModal from '../../components/ConfirmModal/ConfirmModal';

const Customers = () => {
    const { currentWorkspace, user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useTranslation();

    // Assignment filter state (all / mine / unassigned / team_ID / user_ID)
    const [assignmentFilter, setAssignmentFilter] = useState('all');

    // Quick filter mode for stats bar buttons
    const [quickFilterMode, setQuickFilterMode] = useState('ALL');

    // Status options

    const CUSTOMER_STATUS_OPTIONS = [
        { value: 'NEW', label: t('contacts.statusNew'), color: '#3b82f6', bg: '#eff6ff' },
        { value: 'OPPORTUNITY', label: t('contacts.statusOpportunity'), color: '#f59e0b', bg: '#fffbeb' },
        { value: 'HOT_OPPORTUNITY', label: t('contacts.statusHotOpportunity'), color: '#ef4444', bg: '#fef2f2' },
        { value: 'UNREACHABLE', label: t('contacts.statusUnreachable'), color: '#64748b', bg: '#f8fafc' },
        { value: 'CALLBACK', label: t('contacts.statusCallback'), color: '#0ea5e9', bg: '#f0f9ff' },
        { value: 'OFFER_GIVEN', label: t('contacts.statusOfferGiven'), color: '#8b5cf6', bg: '#f5f3ff' },
        { value: 'APPOINTMENT_SCHEDULED', label: 'Randevu Planlandı', color: '#14b8a6', bg: '#f0fdfa' },
        { value: 'NEGOTIATION', label: t('contacts.statusNegotiation'), color: '#f97316', bg: '#fff7ed' },
        { value: 'CONTRACT', label: t('contacts.statusContract'), color: '#06b6d4', bg: '#ecfeff' },
        { value: 'SALE_COMPLETED', label: t('contacts.statusSaleCompleted'), color: '#10b981', bg: '#ecfdf5' },
        { value: 'LOST', label: t('contacts.statusLost'), color: '#1f2937', bg: '#f9fafb' },
        { value: 'NOT_INTERESTED', label: t('contacts.statusNotInterested'), color: '#9ca3af', bg: '#f3f4f6' },
    ];

    const SOURCE_OPTIONS = [
        { value: 'ALL', label: t('contacts.sourceAll'), icon: Users },
        { value: 'FACEBOOK', label: 'Facebook', icon: Facebook, color: '#1877f2' },
        { value: 'INSTAGRAM', label: 'Instagram', icon: Instagram, color: '#e4405f' },
        { value: 'WHATSAPP', label: 'WhatsApp', icon: MessageCircle, color: '#25d366' },
        { value: 'WIDGET', label: 'Web Widget', icon: MessageSquare, color: '#6366f1' },
        { value: 'EMAIL', label: t('contacts.sourceEmail'), icon: Mail, color: '#f59e0b' },
        { value: 'LEAD', label: 'Lead', icon: User, color: '#8b5cf6' },
        { value: 'MANUAL', label: t('contacts.sourceManual'), icon: Plus, color: '#6b7280' }
    ];

    const CATEGORY_OPTIONS = [
        { value: 'ALL', label: t('contacts.allCategories'), icon: Users, color: '#6b7280' },
        { value: 'NEW', label: t('contacts.categoryNew'), icon: User, color: '#3b82f6' },
        { value: 'CUSTOMER', label: t('contacts.categoryCustomer'), icon: User, color: '#10b981' },
        { value: 'OPPORTUNITY', label: t('contacts.categoryOpportunity'), icon: User, color: '#f59e0b' },
        { value: 'VIP', label: 'VIP', icon: User, color: '#8b5cf6' },
        { value: 'PARTNER', label: t('contacts.categoryPartner'), icon: Building, color: '#3b82f6' },
        { value: 'SPAM', label: 'Spam', icon: User, color: '#ef4444' },
        { value: 'BLACKLIST', label: t('contacts.categoryBlacklist'), icon: User, color: '#1f2937' }
    ];

    const getStatusInfo = (status) => CUSTOMER_STATUS_OPTIONS.find(s => s.value === status) || CUSTOMER_STATUS_OPTIONS[0];
    const getSourceInfo = (source) => SOURCE_OPTIONS.find(s => s.value === source) || SOURCE_OPTIONS[0];
    const getCategoryInfo = (category) => CATEGORY_OPTIONS.find(c => c.value === category) || CATEGORY_OPTIONS[1];
    const [contacts, setContacts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    // Funnel filter state
    const [funnelFilter, setFunnelFilter] = useState('ALL');
    const [funnelStageFilter, setFunnelStageFilter] = useState('ALL');
    const [mergedFunnelIds, setMergedFunnelIds] = useState(null); // when non-null, filter by these IDs together
    const [selectedFunnelIds, setSelectedFunnelIds] = useState([]);
    const [availableFunnels, setAvailableFunnels] = useState([]);
    const [sourceFilter, setSourceFilter] = useState('ALL');
    const [categoryFilter, setCategoryFilter] = useState('ALL');
    const [callStatusFilter, setCallStatusFilter] = useState('ALL');
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null, title: '', message: '', confirmText: '', type: 'danger' });
    const [funnelFilterOpen, setFunnelFilterOpen] = useState(false);
    const funnelFilterRef = useRef(null);
    const [dateFilterOpen, setDateFilterOpen] = useState(false);
    const [dateFilterOpenUp, setDateFilterOpenUp] = useState(false);
    const dateFilterRef = useRef(null);
    const [filtersDropdownOpen, setFiltersDropdownOpen] = useState(false);
    const filtersDropdownRef = useRef(null);
    const [onlyOpenCases, setOnlyOpenCases] = useState(true);
    const showArchived = !onlyOpenCases; // Kapalılar dahilse arşivliler de dahil
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [limit, setLimit] = useState(100);
    const [quickStats, setQuickStats] = useState({ periodCount: 0, withPhoneCount: 0, agentCalledCount: 0, aiCalledCount: 0, noActivityCount: 0, noPhoneCount: 0, totalAllTime: 0 });

    // Column sorting
    const [sortField, setSortField] = useState('createdAt');
    const [sortDir, setSortDir] = useState('desc');

    // Analytics panel
    const [showAnalytics, setShowAnalytics] = useState(false);
    const [analyticsData, setAnalyticsData] = useState(null);
    const [analyticsDays, setAnalyticsDays] = useState(30);
    const [analyticsLoading, setAnalyticsLoading] = useState(false);

    // Selected contact for sidebar
    const [selectedContact, setSelectedContact] = useState(null);
    const selectedContactRef = useRef(null);

    // Teams & members for assignment
    const [teams, setTeams] = useState([]);
    const [members, setMembers] = useState([]);
    const [noteTitle, setNoteTitle] = useState('');
    const [contactNotes, setContactNotes] = useState('');
    const [savingNotes, setSavingNotes] = useState(false);
    const [notesExpanded, setNotesExpanded] = useState(false);
    const [expandedNotes, setExpandedNotes] = useState({});

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingContact, setEditingContact] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        fullName: '',
        phones: [''],
        emails: [''],
        company: ''
    });
    const [formError, setFormError] = useState('');

    // Bulk selection state
    const [selectedIds, setSelectedIds] = useState([]);
    const [allSelectedContacts, setAllSelectedContacts] = useState([]);
    const [deleting, setDeleting] = useState(false);

    // Export modal state
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportStartDate, setExportStartDate] = useState('');
    const [exportEndDate, setExportEndDate] = useState('');
    const [exporting, setExporting] = useState(false);
    const [exportingLeads, setExportingLeads] = useState(false);

    // Bulk WhatsApp Template state
    const [showBulkWA, setShowBulkWA] = useState(false);
    const [waTemplates, setWaTemplates] = useState([]);
    const [selectedTemplate, setSelectedTemplate] = useState('');
    const [bulkWASending, setBulkWASending] = useState(false);
    const [bulkWAProgress, setBulkWAProgress] = useState({ sent: 0, total: 0, errors: 0 });

    // Bulk Email state
    const [showBulkEmail, setShowBulkEmail] = useState(false);
    const [emailChannels, setEmailChannels] = useState([]);
    const [selectedEmailChannel, setSelectedEmailChannel] = useState('');
    const [emailSubject, setEmailSubject] = useState('');
    const [emailBody, setEmailBody] = useState('');
    const [bulkEmailSending, setBulkEmailSending] = useState(false);
    const [bulkEmailProgress, setBulkEmailProgress] = useState({ sent: 0, total: 0, errors: 0 });

    // Bulk Call state
    const [showBulkCall, setShowBulkCall] = useState(false);
    const [bulkCallRunning, setBulkCallRunning] = useState(false);
    const [bulkCallProgress, setBulkCallProgress] = useState({ called: 0, total: 0, errors: 0 });
    const [retellAgents, setRetellAgents] = useState([]);
    const [selectedAgentId, setSelectedAgentId] = useState('');

    // Bulk Status Change state
    const [showBulkStatus, setShowBulkStatus] = useState(false);
    const [bulkStatusFunnel, setBulkStatusFunnel] = useState('');
    const [bulkStatusStage, setBulkStatusStage] = useState('');
    const [bulkStatusRunning, setBulkStatusRunning] = useState(false);
    const [bulkStatusProgress, setBulkStatusProgress] = useState({ done: 0, total: 0, errors: 0 });

    // Excel Import state
    const [showImportModal, setShowImportModal] = useState(false);
    const [importData, setImportData] = useState([]);
    const [importTag, setImportTag] = useState('');
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const [importFileName, setImportFileName] = useState('');

    // Tag filter state
    const [tagFilter, setTagFilter] = useState('ALL');
    const [availableTags, setAvailableTags] = useState([]);

    // Contact info filter state (phone/email)
    const [contactInfoFilter, setContactInfoFilter] = useState('ALL');

    // Import group filter state
    const [importGroupFilter, setImportGroupFilter] = useState('ALL');
    const [availableImportGroups, setAvailableImportGroups] = useState([]);

    // Date filter
    const [dateFilter, setDateFilter] = useState('ALL'); // ALL | TODAY | WEEK | MONTH | CUSTOM
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    // Inline stage change dropdown
    const [stageDropdownContactId, setStageDropdownContactId] = useState(null);
    const [hoveredFunnelId, setHoveredFunnelId] = useState(null);
    const stageDropdownRef = useRef(null);

    // Filter labels to show on the main button
    const getActiveFilterLabel = () => {
        if (mergedFunnelIds) {
            return 'Genel';
        }
        if (funnelStageFilter !== 'ALL') {
            // Find stage name
            for (const f of availableFunnels) {
                const stage = f.stages?.find(s => s.id === funnelStageFilter);
                if (stage) return stage.name;
            }
        }
        if (funnelFilter !== 'ALL') {
            const funnel = availableFunnels.find(f => f.id === funnelFilter);
            return funnel ? funnel.name : 'Akış';
        }
        return 'Tüm Durumlar';
    };

    const getActiveFilterColor = () => {
        if (mergedFunnelIds) return '#3b82f6';
        if (funnelStageFilter !== 'ALL') {
            for (const f of availableFunnels) {
                const stage = f.stages?.find(s => s.id === funnelStageFilter);
                if (stage) return stage.color;
            }
        }
        if (funnelFilter !== 'ALL') {
            const funnel = availableFunnels.find(f => f.id === funnelFilter);
            return funnel ? funnel.color : '#64748b';
        }
        return '#64748b';
    };

    // Load funnels for funnel filter dropdown
    useEffect(() => {
        if (!currentWorkspace) return;
        funnelAPI.getAll(currentWorkspace.id)
            .then(res => setAvailableFunnels(res.data.funnels || res.data || []))
            .catch(() => {});
    }, [currentWorkspace]);

    // Load teams and members for assignment sidebar
    useEffect(() => {
        if (!currentWorkspace) return;
        teamAPI.getWorkspaceTeams(currentWorkspace.id)
            .then(res => setTeams(res.data.teams || []))
            .catch(() => {});
        workspaceAPI.getMembers(currentWorkspace.id)
            .then(res => setMembers(res.data.members || []))
            .catch(() => {});
    }, [currentWorkspace]);

    // Fetch Retell agents for bulk call modal
    useEffect(() => {
        if (showBulkCall && currentWorkspace) {
            setSelectedAgentId('');
            retellAPI.getAgents(currentWorkspace.id)
                .then(res => setRetellAgents(res.data.agents || []))
                .catch(err => console.error('Error fetching Retell agents:', err));
        }
    }, [showBulkCall, currentWorkspace]);

    useEffect(() => {
        if (currentWorkspace) {
            loadContacts();
        }
    }, [currentWorkspace, page, search, statusFilter, sourceFilter, categoryFilter, callStatusFilter, tagFilter, contactInfoFilter, importGroupFilter, showArchived, onlyOpenCases, funnelFilter, funnelStageFilter, mergedFunnelIds, selectedFunnelIds, limit, dateFilter, dateFrom, dateTo, assignmentFilter, sortField, sortDir]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (funnelFilterRef.current && !funnelFilterRef.current.contains(event.target)) {
                setFunnelFilterOpen(false);
            }
            if (dateFilterRef.current && !dateFilterRef.current.contains(event.target)) {
                setDateFilterOpen(false);
            }
            if (filtersDropdownRef.current && !filtersDropdownRef.current.contains(event.target)) {
                setFiltersDropdownOpen(false);
            }
            if (stageDropdownRef.current && !stageDropdownRef.current.contains(event.target)) {
                setStageDropdownContactId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Keep selectedContactRef in sync
    useEffect(() => {
        selectedContactRef.current = selectedContact;
    }, [selectedContact]);

    // Silent reload: updates the contact list without changing the selected contact
    const silentReloadContacts = useCallback(async () => {
        if (!currentWorkspace) return;
        try {
            const response = await contactAPI.getAll(currentWorkspace.id, {
                search,
                status: statusFilter,
                source: sourceFilter,
                category: categoryFilter,
                tag: tagFilter,
                contactInfo: contactInfoFilter,
                callStatus: callStatusFilter,
                importGroup: importGroupFilter,
                funnelType: selectedFunnelIds.length > 0 ? 'ALL' : funnelFilter,
                funnelTypes: selectedFunnelIds.length > 0 ? selectedFunnelIds.join(',') : (mergedFunnelIds ? mergedFunnelIds.join(',') : undefined),
                funnelStageId: funnelStageFilter,
                showArchived: showArchived.toString(),
                onlyOpenCases: onlyOpenCases.toString(),
                assignmentFilter: assignmentFilter !== 'all' ? assignmentFilter : undefined,
                sortField,
                sortDir,
                limit,
                offset: (page - 1) * limit,
                dateFilter: dateFilter !== 'ALL' ? dateFilter : undefined,
                dateFrom: dateFilter === 'CUSTOM' && dateFrom ? dateFrom : undefined,
                dateTo: dateFilter === 'CUSTOM' && dateTo ? dateTo : undefined,
            });
            setContacts(response.data.contacts);
            setTotal(response.data.total);
            if (response.data.quickStats) setQuickStats(response.data.quickStats);

            if (response.data.allTags) {
                setAvailableTags(response.data.allTags);
            }
            if (response.data.allImportGroups) {
                setAvailableImportGroups(response.data.allImportGroups);
            }
            // NOTE: We intentionally do NOT change selectedContact here
        } catch (error) {
            console.error('Error silently reloading contacts:', error);
        }
    }, [currentWorkspace, search, statusFilter, sourceFilter, categoryFilter, tagFilter, contactInfoFilter, callStatusFilter, importGroupFilter, funnelFilter, mergedFunnelIds, selectedFunnelIds, funnelStageFilter, showArchived, onlyOpenCases, limit, page, dateFilter, dateFrom, dateTo, assignmentFilter]);

    useEffect(() => {
        const handleContactUpdate = (event) => {
            const data = event.detail;
            if (currentWorkspace && data.workspaceId === currentWorkspace.id) {
                const fields = data.updatedFields || {};
                const fieldKeys = Object.keys(fields).filter(k => fields[k] !== undefined);

                // Lokal olarak güncellenebilen alanlar (API reload gerektirmez)
                const localUpdateFields = ['notes', 'funnelStageId', 'funnelType', 'status', 'category', 'company'];
                const canUpdateLocally = data.contactId && fieldKeys.length > 0 && fieldKeys.every(k => localUpdateFields.includes(k));

                if (canUpdateLocally) {
                    // Lokal güncelleme — API'ye istek atmadan anında yansıt
                    console.log('⚡ [Customers] Local contact update:', fieldKeys.join(', '));
                    setContacts(prev => prev.map(c =>
                        c.id === data.contactId ? { ...c, ...fields } : c
                    ));
                } else {
                    console.log('🔄 [Customers] Real-time contact update received, silent reload...');
                    silentReloadContacts();
                }

                // Also update selectedContact if it matches (use ref for latest value)
                const current = selectedContactRef.current;
                if (current && data.contactId === current.id && data.updatedFields) {
                    setSelectedContact(prev => ({
                        ...prev,
                        ...data.updatedFields
                    }));
                }
            }
        };

        const handleNewConversation = (event) => {
            const data = event.detail;
            if (currentWorkspace && data.workspaceId === currentWorkspace.id) {
                console.log('🔄 [Customers] New conversation received, silent reload (preserving selection)...');
                silentReloadContacts();
            }
        };

        const handleNewMessage = (event) => {
            const data = event.detail;
            // Only reload for WIDGET channel (new web visitors)
            if (currentWorkspace && data.workspaceId === currentWorkspace.id && data.channel === 'WIDGET') {
                console.log('🔄 [Customers] New widget message received, silent reload (preserving selection)...');
                silentReloadContacts();
            }
        };

        window.addEventListener('websocket:contact_updated', handleContactUpdate);
        window.addEventListener('websocket:new_conversation', handleNewConversation);
        window.addEventListener('websocket:new_message', handleNewMessage);

        return () => {
            window.removeEventListener('websocket:contact_updated', handleContactUpdate);
            window.removeEventListener('websocket:new_conversation', handleNewConversation);
            window.removeEventListener('websocket:new_message', handleNewMessage);
        };
    }, [currentWorkspace, silentReloadContacts]);

    const loadContacts = async () => {
        try {
            setLoading(true);
            const response = await contactAPI.getAll(currentWorkspace.id, {
                search,
                status: statusFilter,
                source: sourceFilter,
                category: categoryFilter,
                tag: tagFilter,
                contactInfo: contactInfoFilter,
                callStatus: callStatusFilter,
                importGroup: importGroupFilter,
                funnelType: selectedFunnelIds.length > 0 ? 'ALL' : funnelFilter,
                funnelTypes: selectedFunnelIds.length > 0 ? selectedFunnelIds.join(',') : (mergedFunnelIds ? mergedFunnelIds.join(',') : undefined),
                funnelStageId: funnelStageFilter,
                showArchived: showArchived.toString(),
                onlyOpenCases: onlyOpenCases.toString(),
                assignmentFilter: assignmentFilter !== 'all' ? assignmentFilter : undefined,
                sortField,
                sortDir,
                limit,
                offset: (page - 1) * limit,
                // Date filter
                dateFilter: dateFilter !== 'ALL' ? dateFilter : undefined,
                dateFrom: dateFilter === 'CUSTOM' && dateFrom ? dateFrom : undefined,
                dateTo: dateFilter === 'CUSTOM' && dateTo ? dateTo : undefined,
            });
            setContacts(response.data.contacts);
            setTotal(response.data.total);
            if (response.data.quickStats) setQuickStats(response.data.quickStats);

            // Use allTags from backend response (filtered)
            if (response.data.allTags) {
                setAvailableTags(response.data.allTags);
            }
            // Use allImportGroups from backend response
            if (response.data.allImportGroups) {
                setAvailableImportGroups(response.data.allImportGroups);
            }

            // Auto-select first contact if none selected
            if (!selectedContact && response.data.contacts.length > 0) {
                setSelectedContact(response.data.contacts[0]);
            }
        } catch (error) {
            console.error('Error loading contacts:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e) => {
        setSearch(e.target.value);
        setPage(1);
    };

    const handleStatusFilter = (status) => {
        setStatusFilter(status);
        setPage(1);
    };

    const handleSelectContact = async (contact) => {
        setSelectedContact(contact);
        setNoteTitle('');
        setContactNotes(''); // Start with empty inputs for new notes
        // Fetch full contact details including conversations
        try {
            const response = await contactAPI.getById(currentWorkspace.id, contact.id);
            if (response.data.contact) {
                setSelectedContact(response.data.contact);
            }
        } catch (error) {
            console.error('Error fetching contact details:', error);
        }
    };

    const handleSaveNotes = async () => {
        if (!selectedContact || (!noteTitle.trim() && !contactNotes.trim())) return;

        // Parse existing notes (JSON format: [{timestamp, title, content}, ...])
        let existingNotes = [];
        try {
            if (selectedContact.notes) {
                existingNotes = JSON.parse(selectedContact.notes);
                if (!Array.isArray(existingNotes)) existingNotes = [];
            }
        } catch {
            existingNotes = [];
        }

        // Create new note object
        const timestamp = new Date().toLocaleString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        const newNote = {
            timestamp,
            title: noteTitle.trim(),
            content: contactNotes.trim()
        };

        // Add to beginning of array (newest first)
        const updatedNotes = [newNote, ...existingNotes];
        const updatedNotesJson = JSON.stringify(updatedNotes);

        setSavingNotes(true);
        try {
            await contactAPI.update(currentWorkspace.id, selectedContact.id, { notes: updatedNotesJson });
            setSelectedContact(prev => ({ ...prev, notes: updatedNotesJson }));
            setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, notes: updatedNotesJson } : c));
            setNoteTitle('');
            setContactNotes(''); // Clear inputs after saving
            console.log('✅ Notes saved to contact');
        } catch (error) {
            console.error('Error saving notes:', error);
        } finally {
            setSavingNotes(false);
        }
    };

    const handleDeleteNote = async (indexToDelete) => {
        if (!selectedContact || !selectedContact.notes) return;

        // Parse existing notes as JSON
        let existingNotes = [];
        try {
            existingNotes = JSON.parse(selectedContact.notes);
            if (!Array.isArray(existingNotes)) return;
        } catch {
            return;
        }

        // Remove the note at the specified index
        const updatedNotes = existingNotes.filter((_, index) => index !== indexToDelete);
        const updatedNotesJson = updatedNotes.length > 0 ? JSON.stringify(updatedNotes) : '';

        setSavingNotes(true);
        try {
            await contactAPI.update(currentWorkspace.id, selectedContact.id, { notes: updatedNotesJson });
            setSelectedContact(prev => ({ ...prev, notes: updatedNotesJson }));
            setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, notes: updatedNotesJson } : c));
            console.log('✅ Note deleted');
        } catch (error) {
            console.error('Error deleting note:', error);
        } finally {
            setSavingNotes(false);
        }
    };

    // Export Facebook Leads to CSV
    const handleExportLeads = async () => {
        setExportingLeads(true);
        try {
            const response = await leadsAPI.exportAll(currentWorkspace.id);
            const leads = response.data.leads || [];

            if (leads.length === 0) {
                alert('Dışa aktarılacak lead bulunamadı.');
                setExportingLeads(false);
                return;
            }

            // Fixed columns
            const headerRow = ['Lead Adı', 'İsim', 'E-posta', 'Telefon', 'Tercih Ettiği Konut Tipi', 'Proje Adı', 'Tarih'];

            const rows = leads.map(lead => {
                const createdAt = lead.createdAt
                    ? new Date(lead.createdAt).toLocaleDateString('tr-TR') + ' ' + new Date(lead.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                    : '';

                return [
                    lead.formName || '',
                    lead.name || '',
                    lead.email || '',
                    lead.phone || '',
                    lead.konutTipi || '',
                    lead.projeAdi || '',
                    createdAt
                ];
            });

            const csvContent = [
                headerRow.join(','),
                ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            ].join('\n');

            const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `facebook_leads_${new Date().toISOString().slice(0, 10)}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Lead export error:', error);
            alert('Lead dışa aktarma hatası: ' + (error.response?.data?.error || error.message));
        } finally {
            setExportingLeads(false);
        }
    };

    // Export to CSV
    const handleExportCSV = async () => {
        if (!exportStartDate || !exportEndDate) {
            alert('Lütfen başlangıç ve bitiş tarihlerini seçin');
            return;
        }

        setExporting(true);
        try {
            const response = await contactAPI.getAll(currentWorkspace.id, {
                page: 1,
                limit: 10000, // Get all contacts
                search,
                status: statusFilter !== 'ALL' ? statusFilter : undefined,
                source: sourceFilter !== 'ALL' ? sourceFilter : undefined,
                category: categoryFilter !== 'ALL' ? categoryFilter : undefined,
                funnelType: funnelFilter !== 'ALL' ? funnelFilter : undefined,
                funnelStageId: funnelStageFilter !== 'ALL' ? funnelStageFilter : undefined,
                tag: tagFilter !== 'ALL' ? tagFilter : undefined,
                importGroup: importGroupFilter !== 'ALL' ? importGroupFilter : undefined,
                isArchived: showArchived
            });

            // Filter by date range
            const filteredContacts = response.data.contacts.filter(contact => {
                if (!contact.firstMessageAt) return false;
                const firstMessageDate = new Date(contact.firstMessageAt);
                const startDate = new Date(exportStartDate);
                const endDate = new Date(exportEndDate);
                endDate.setHours(23, 59, 59, 999); // Include entire end date
                return firstMessageDate >= startDate && firstMessageDate <= endDate;
            });

            // Create CSV content
            const headers = ['İsim', 'Telefon', 'E-posta', 'İlk Yazma Tarihi', 'Durum', 'Kime Atandığı', 'Son Not'];

            const rows = filteredContacts.map(contact => {
                // Get last note from notes
                let lastNote = '';
                if (contact.notes) {
                    try {
                        const notesArray = JSON.parse(contact.notes);
                        if (Array.isArray(notesArray) && notesArray.length > 0) {
                            lastNote = notesArray[notesArray.length - 1].content || '';
                        }
                    } catch (e) {
                        // Notes are stored as string with format: [timestamp]\ncontent
                        const notes = contact.notes;
                        // Split by separator and get first note
                        const firstNote = notes.split('\n\n---\n\n')[0];
                        // Remove timestamp line [timestamp]
                        const contentMatch = firstNote.match(/\[.*?\]\n([\s\S]*)/);
                        if (contentMatch && contentMatch[1]) {
                            lastNote = contentMatch[1].trim();
                        } else {
                            lastNote = notes;
                        }
                    }
                }

                // Get display label from funnel stage or legacy status
                let displayLabel = 'Yeni';
                if (contact.funnelStageId && availableFunnels.length > 0) {
                    for (const funnel of availableFunnels) {
                        const s = funnel.stages?.find(x => x.id === contact.funnelStageId);
                        if (s) { displayLabel = s.name; break; }
                    }
                } else if (contact.status) {
                    displayLabel = getStatusInfo(contact.status).label;
                }

                // Get assigned agent
                let assignedTo = '---';
                if (contact.conversations && contact.conversations.length > 0 && contact.conversations[0]?.assignedTo?.name) {
                    assignedTo = contact.conversations[0].assignedTo.name;
                }

                return [
                    contact.name || '',
                    contact.phone || '',
                    contact.email || '',
                    contact.firstMessageAt ? new Date(contact.firstMessageAt).toLocaleDateString('tr-TR') : '',
                    displayLabel,
                    assignedTo,
                    lastNote
                ];
            });

            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
            ].join('\n');

            // Download CSV
            const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `kişiler_${exportStartDate}_${exportEndDate}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setShowExportModal(false);
            setExportStartDate('');
            setExportEndDate('');
        } catch (error) {
            console.error('Export error:', error);
            alert('Dışa aktarma sırasında bir hata oluştu');
        } finally {
            setExporting(false);
        }
    };

    // Bulk selection handlers
    const handleToggleSelect = (e, id) => {
        e.stopPropagation();
        setSelectedIds(prev =>
            prev.includes(id)
                ? prev.filter(i => i !== id)
                : [...prev, id]
        );
    };

    const handleSelectAll = () => {
        if (selectedIds.length === contacts.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(contacts.map(c => c.id));
        }
    };

    // Select ALL contacts across all pages
    const handleSelectAllGlobal = async () => {
        if (selectedIds.length === total) {
            setSelectedIds([]);
            setAllSelectedContacts([]);
            return;
        }
        try {
            const response = await contactAPI.getAll(currentWorkspace.id, {
                search,
                status: statusFilter,
                source: sourceFilter,
                category: categoryFilter,
                tag: tagFilter,
                callStatus: callStatusFilter,
                showArchived: showArchived.toString(),
                onlyOpenCases: onlyOpenCases.toString(),
                limit: 10000,
                offset: 0
            });
            const all = response.data.contacts || [];
            setSelectedIds(all.map(c => c.id));
            setAllSelectedContacts(all);
        } catch (err) {
            console.error('Select all error:', err);
        }
    };

    const handleDeleteSelected = async () => {
        if (selectedIds.length === 0) return;

        setConfirmModal({
            isOpen: true,
            title: 'Toplu Silme',
            message: `${selectedIds.length} kişiyi silmek istediğinize emin misiniz?`,
            confirmText: 'Evet, Sil',
            type: 'danger',
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                try {
                    setDeleting(true);
                    for (const id of selectedIds) {
                        await contactAPI.delete(currentWorkspace.id, id);
                    }
                    setSelectedIds([]);
                    if (selectedContact && selectedIds.includes(selectedContact.id)) {
                        setSelectedContact(null);
                    }
                    loadContacts();
                } catch (error) {
                    console.error('Error deleting contacts:', error);
                    alert('Bazı kişiler silinemedi');
                } finally {
                    setDeleting(false);
                }
            }
        });
    };

    // Bulk Status Change handler
    const handleBulkStatusChange = async () => {
        if (selectedIds.length === 0 || !bulkStatusStage) return;

        // Find selected funnel and stage info
        let selectedFunnelObj = null;
        let selectedStageObj = null;
        for (const f of availableFunnels) {
            const s = f.stages?.find(st => st.id === bulkStatusStage);
            if (s) {
                selectedFunnelObj = f;
                selectedStageObj = s;
                break;
            }
        }

        if (!selectedStageObj) {
            alert('Lütfen geçerli bir aşama seçin.');
            return;
        }

        setBulkStatusRunning(true);
        const total = selectedIds.length;
        setBulkStatusProgress({ done: 0, total, errors: 0 });
        let errors = 0;

        // Get full contact data to find their conversations
        const pool = allSelectedContacts.length > 0 ? allSelectedContacts : contacts;

        for (let i = 0; i < selectedIds.length; i++) {
            try {
                // 1. Update contact record
                await contactAPI.update(currentWorkspace.id, selectedIds[i], {
                    funnelStageId: selectedStageObj.id,
                    funnelType: selectedFunnelObj.id
                });

                // 2. Update all conversations of this contact
                const contact = pool.find(c => c.id === selectedIds[i]);
                if (contact?.conversations) {
                    for (const conv of contact.conversations) {
                        try {
                            await conversationAPI.updateFunnel(currentWorkspace.id, conv.id || conv, {
                                funnelStageId: selectedStageObj.id,
                                funnelType: selectedFunnelObj.id
                            });
                        } catch (convErr) {
                            // Non-fatal: conversation update failed
                            console.warn(`Conv update failed for ${conv.id || conv}:`, convErr);
                        }
                    }
                }
            } catch (e) {
                errors++;
                console.error(`Error updating contact ${selectedIds[i]}:`, e);
            }
            setBulkStatusProgress({ done: i + 1, total, errors });
        }

        setBulkStatusRunning(false);
        alert(`✅ ${total - errors} / ${total} kişinin durumu güncellendi.`);
        setShowBulkStatus(false);
        setBulkStatusFunnel('');
        setBulkStatusStage('');
        setSelectedIds([]);
        loadContacts();
    };

    const handleDeleteContact = async (id) => {
        setConfirmModal({
            isOpen: true,
            title: 'Kişi Sil',
            message: 'Bu kişiyi silmek istediğinize emin misiniz?',
            confirmText: 'Evet, Sil',
            type: 'danger',
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                try {
                    await contactAPI.delete(currentWorkspace.id, id);
                    if (selectedContact?.id === id) {
                        setSelectedContact(null);
                    }
                    loadContacts();
                } catch (error) {
                    console.error('Error deleting contact:', error);
                    alert('Kişi silinirken hata oluştu.');
                }
            }
        });
    };

    const handleCreateContact = async (e) => {
        e.preventDefault();
        setFormError('');

        if (!formData.name && !formData.fullName) {
            setFormError('İsim veya tam isim gereklidir');
            return;
        }

        // Filter out empty values
        const phones = formData.phones.filter(p => p.trim());
        const emails = formData.emails.filter(e => e.trim());

        try {
            const dataToSend = {
                name: formData.name,
                fullName: formData.fullName,
                phone: phones[0] || '',  // Primary phone
                email: emails[0] || '',  // Primary email
                phones: phones,
                emails: emails,
                company: formData.company
            };

            if (editingContact) {
                await contactAPI.update(currentWorkspace.id, editingContact.id, dataToSend);
                setIsModalOpen(false);
                setEditingContact(null);
                setFormData({ name: '', fullName: '', phones: [''], emails: [''], company: '' });
                loadContacts();
            } else {
                if (phones.length === 0 && emails.length === 0) {
                    setFormError('En az bir iletişim bilgisi (telefon veya e-posta) gereklidir');
                    return;
                }
                await contactAPI.create(currentWorkspace.id, dataToSend);
                setIsModalOpen(false);
                setFormData({ name: '', fullName: '', phones: [''], emails: [''], company: '' });
                loadContacts();
            }
        } catch (error) {
            console.error('Error saving contact:', error);
            setFormError(error.response?.data?.error || 'Kişi kaydedilirken hata oluştu');
        }
    };

    const handleEditContact = (contact) => {
        setEditingContact(contact);
        // Parse JSON strings to arrays if needed
        let phones = [''];
        let emails = [''];

        // Handle phones - could be JSON string or array
        if (contact.phones) {
            try {
                phones = typeof contact.phones === 'string' ? JSON.parse(contact.phones) : contact.phones;
            } catch (e) {
                phones = contact.phone ? [contact.phone] : [''];
            }
        } else if (contact.phone) {
            phones = [contact.phone];
        }

        // Handle emails - could be JSON string or array
        if (contact.emails) {
            try {
                emails = typeof contact.emails === 'string' ? JSON.parse(contact.emails) : contact.emails;
            } catch (e) {
                emails = contact.email ? [contact.email] : [''];
            }
        } else if (contact.email) {
            emails = [contact.email];
        }

        // Ensure at least one empty field
        if (!phones.length || (phones.length === 1 && !phones[0])) phones = [''];
        if (!emails.length || (emails.length === 1 && !emails[0])) emails = [''];

        setFormData({
            name: contact.name || '',
            fullName: contact.fullName || '',
            phones: phones,
            emails: emails,
            company: contact.company || ''
        });
        setFormError('');
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingContact(null);
        setFormData({ name: '', fullName: '', phones: [''], emails: [''], company: '' });
        setFormError('');
    };

    // Dynamic field handlers
    const addPhone = () => {
        setFormData({ ...formData, phones: [...formData.phones, ''] });
    };

    const removePhone = (index) => {
        const newPhones = formData.phones.filter((_, i) => i !== index);
        setFormData({ ...formData, phones: newPhones.length ? newPhones : [''] });
    };

    const updatePhone = (index, value) => {
        const newPhones = [...formData.phones];
        newPhones[index] = value;
        setFormData({ ...formData, phones: newPhones });
    };

    const addEmail = () => {
        setFormData({ ...formData, emails: [...formData.emails, ''] });
    };

    const removeEmail = (index) => {
        const newEmails = formData.emails.filter((_, i) => i !== index);
        setFormData({ ...formData, emails: newEmails.length ? newEmails : [''] });
    };

    const updateEmail = (index, value) => {
        const newEmails = [...formData.emails];
        newEmails[index] = value;
        setFormData({ ...formData, emails: newEmails });
    };

    const closeSidebar = () => {
        setSelectedContact(null);
    };

    // Inline stage change handler
    const handleInlineStageChange = async (contact, funnelId, stageId) => {
        setStageDropdownContactId(null);
        try {
            // Optimistic local update
            setContacts(prev => prev.map(c =>
                c.id === contact.id ? { ...c, funnelStageId: stageId, funnelType: funnelId } : c
            ));
            // 1. Update contact record
            await contactAPI.update(currentWorkspace.id, contact.id, {
                funnelStageId: stageId,
                funnelType: funnelId
            });
            // 2. Update conversations
            if (contact.conversations) {
                for (const conv of contact.conversations) {
                    try {
                        await conversationAPI.updateFunnel(currentWorkspace.id, conv.id || conv, {
                            funnelStageId: stageId,
                            funnelType: funnelId
                        });
                    } catch (convErr) {
                        console.warn('Conv update failed:', convErr);
                    }
                }
            }
        } catch (err) {
            console.error('Inline stage change error:', err);
            // Revert on error
            silentReloadContacts();
        }
    };

    // Excel Import handler
    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setImportFileName(file.name);
        setImportResult(null);

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const workbook = XLSX.read(evt.target.result, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                // Smart column detection from headers
                const headers = (jsonData[0] || []).map(h => (h || '').toString().toLowerCase().trim());

                const findCol = (keywords) => headers.findIndex(h => keywords.some(k => h.includes(k)));

                const nameCol = findCol(['adı', 'ad', 'isim', 'name', 'müşteri', 'kişi']);
                const phoneCol = findCol(['telefon', 'phone', 'cep', 'gsm', 'tel', 'numara', 'whatsapp']);
                const emailCol = findCol(['e-posta', 'email', 'mail', 'eposta']);
                const notesCol = findCol(['not', 'note', 'açıklama', 'mesaj']);
                const dateCol = findCol(['tarih', 'date', 'oluşturulma', 'created']);

                // Fallback: if no phone found in main headers, check for secondary phone columns
                const phone2Col = phoneCol >= 0 ? findCol(['ikinci', 'whatsapp', '2. telefon'].filter(k => headers.indexOf(k) !== phoneCol)) : -1;

                console.log(`📊 [Import] Column mapping: name=${nameCol}, phone=${phoneCol}, email=${emailCol}, notes=${notesCol}, date=${dateCol}`);

                const contacts = [];
                for (let i = 1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if (!row || row.length === 0) continue;
                    const name = nameCol >= 0 ? (row[nameCol] || '').toString().trim() : '';
                    const phone = phoneCol >= 0 ? (row[phoneCol] || '').toString().trim() : '';
                    const email = emailCol >= 0 ? (row[emailCol] || '').toString().trim() : '';
                    const notes = notesCol >= 0 ? (row[notesCol] || '').toString().trim() : '';
                    const createdAt = dateCol >= 0 ? (row[dateCol] || '').toString().trim() : '';
                    // Use phone2 (e.g. WhatsApp number) as fallback if primary phone is empty
                    const finalPhone = phone || (phone2Col >= 0 ? (row[phone2Col] || '').toString().trim() : '');
                    if (name || finalPhone || email) {
                        contacts.push({ name, phone: finalPhone, email, notes, createdAt });
                    }
                }
                setImportData(contacts);
            } catch (err) {
                console.error('Excel parse error:', err);
                setImportData([]);
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleImportExcel = async () => {
        if (importData.length === 0 || !importTag.trim()) return;
        setImporting(true);
        setImportResult(null);
        try {
            const res = await contactAPI.bulkImport(currentWorkspace.id, {
                contacts: importData,
                tag: importTag.trim()
            });
            setImportResult(res.data);
            // Add the group to available import groups
            setAvailableImportGroups(prev => {
                if (!prev.includes(importTag.trim())) return [...prev, importTag.trim()].sort();
                return prev;
            });
            loadContacts();
        } catch (err) {
            setImportResult({ error: err.response?.data?.error || 'İçe aktarma başarısız' });
        } finally {
            setImporting(false);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '---';
        const date = new Date(dateString);
        return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
    };

    // Get display name - prioritize profile name for social media contacts
    const getDisplayName = (contact) => {
        if (!contact) return 'İsimsiz';
        const isSocialContact = contact.facebookId || contact.instagramId || contact.whatsappId;
        if (isSocialContact) {
            return contact.name || contact.fullName || 'İsimsiz';
        }
        return contact.fullName || contact.name || 'İsimsiz';
    };

    const getAvatarUrl = (contact) => {
        if (contact.avatar) return contact.avatar;
        const name = getDisplayName(contact);
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=ef4444&color=fff&size=150`;
    };

    const getActiveTab = () => {
        if (categoryFilter === 'CUSTOMER') return 'customers';
        if (selectedFunnelIds.length === 1) return `funnel-${selectedFunnelIds[0]}`;
        if (funnelFilter !== 'ALL') return `funnel-${funnelFilter}`;
        return 'all';
    };

    const handleTabClick = (tabId, funnelId = null) => {
        if (tabId === 'all') {
            setCategoryFilter('ALL');
            setFunnelFilter('ALL');
            setFunnelStageFilter('ALL');
            setMergedFunnelIds(null);
            setSelectedFunnelIds([]);
        } else if (tabId === 'customers') {
            setCategoryFilter('CUSTOMER');
            setFunnelFilter('ALL');
            setFunnelStageFilter('ALL');
            setMergedFunnelIds(null);
            setSelectedFunnelIds([]);
        } else if (tabId.startsWith('funnel-')) {
            setCategoryFilter('ALL');
            setFunnelFilter('ALL');
            setFunnelStageFilter('ALL');
            setMergedFunnelIds(null);
            setSelectedFunnelIds(prev => {
                if (prev.includes(funnelId)) {
                    return prev.filter(id => id !== funnelId);
                } else {
                    return [...prev, funnelId];
                }
            });
        }
        setPage(1);
    };

    if (!currentWorkspace) {
        return (
            <div className="empty-state">
                <p>Lütfen bir workspace seçin</p>
            </div>
        );
    }

    return (
        <>
            <div className="contacts-page">
                {/* Main Content */}
                <div className="contacts-main">
                    {/* Header */}
                    <div className="contacts-header">
                        <h1>Kişiler</h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, maxWidth: '480px' }}>
                            <div className="contacts-search" style={{ flex: 1, maxWidth: 'none' }}>
                                <Search size={18} className="search-icon" />
                                <input
                                    type="text"
                                    placeholder="Kişi ara..."
                                    value={search}
                                    onChange={handleSearch}
                                />
                            </div>

                            {/* Filtreler Popover */}
                            <div className="contacts-filter-popover-wrapper" ref={filtersDropdownRef} style={{ position: 'relative' }}>
                                <button
                                    className={`btn-filters-toggle ${filtersDropdownOpen ? 'active' : ''} ${
                                        (funnelFilter !== 'ALL' || funnelStageFilter !== 'ALL' || mergedFunnelIds || assignmentFilter !== 'all' || sourceFilter !== 'ALL' || tagFilter !== 'ALL') ? 'has-active' : ''
                                    }`}
                                    onClick={() => setFiltersDropdownOpen(o => !o)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        height: '38px',
                                        padding: '0 12px',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: '8px',
                                        background: '#ffffff',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        color: '#475569',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    <Filter size={14} />
                                    <span>Filtreler</span>
                                    {(() => {
                                        let activeCount = 0;
                                        if (funnelFilter !== 'ALL' || funnelStageFilter !== 'ALL' || mergedFunnelIds) activeCount++;
                                        if (assignmentFilter !== 'all') activeCount++;
                                        if (sourceFilter !== 'ALL') activeCount++;
                                        if (tagFilter !== 'ALL') activeCount++;
                                        return activeCount > 0 ? (
                                            <span className="filters-badge-count" style={{
                                                background: '#ef4444',
                                                color: '#ffffff',
                                                borderRadius: '50%',
                                                width: '16px',
                                                height: '16px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '9px',
                                                fontWeight: 700,
                                                marginLeft: '2px'
                                            }}>{activeCount}</span>
                                        ) : null;
                                    })()}
                                </button>

                                {filtersDropdownOpen && (
                                    <div className="contacts-filters-dropdown" style={{
                                        position: 'absolute',
                                        top: 'calc(100% + 6px)',
                                        left: 0,
                                        zIndex: 9999,
                                        background: '#ffffff',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '10px',
                                        boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
                                        padding: '12px 14px',
                                        width: '280px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '10px'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', marginBottom: '2px' }}>
                                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b' }}>Filtreler</span>
                                            {(funnelFilter !== 'ALL' || funnelStageFilter !== 'ALL' || mergedFunnelIds || assignmentFilter !== 'all' || sourceFilter !== 'ALL' || tagFilter !== 'ALL') && (
                                                <button
                                                    onClick={() => {
                                                        setFunnelFilter('ALL');
                                                        setFunnelStageFilter('ALL');
                                                        setMergedFunnelIds(null);
                                                        setAssignmentFilter('all');
                                                        setSourceFilter('ALL');
                                                        setTagFilter('ALL');
                                                        setPage(1);
                                                        setFiltersDropdownOpen(false);
                                                    }}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: '#ef4444',
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                        padding: 0
                                                    }}
                                                >
                                                    Sıfırla
                                                </button>
                                            )}
                                        </div>

                                        {/* Durum / Huni Filtresi */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                            <label style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Durum (Huni)</label>
                                            <select
                                                value={(() => {
                                                    if (mergedFunnelIds) return 'GENEL_ALL';
                                                    if (funnelFilter === 'ALL' && funnelStageFilter === 'ALL') return 'ALL';
                                                    if (funnelStageFilter !== 'ALL') return `STAGE_${funnelStageFilter}_${funnelFilter}`;
                                                    return `FUNNEL_${funnelFilter}`;
                                                })()}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setPage(1);
                                                    if (val === 'ALL') {
                                                        setFunnelFilter('ALL');
                                                        setFunnelStageFilter('ALL');
                                                        setMergedFunnelIds(null);
                                                    } else if (val === 'GENEL_ALL') {
                                                        const MERGE_NAMES = ['genel crm (otomatik i̇şlem)', 'genel crm (otomatik işlem)', 'genel'];
                                                        const genelGroup = availableFunnels.filter(f => MERGE_NAMES.includes(f.name.toLowerCase()));
                                                        setMergedFunnelIds(genelGroup.map(f => f.id));
                                                        setFunnelFilter('ALL');
                                                        setFunnelStageFilter('ALL');
                                                    } else if (val.startsWith('FUNNEL_')) {
                                                        const fId = val.replace('FUNNEL_', '');
                                                        const funnel = availableFunnels.find(f => f.id === fId);
                                                        const matchingStage = funnel?.stages?.find(
                                                            s => s.name.toLowerCase() === funnel.name.toLowerCase()
                                                        );
                                                        setMergedFunnelIds(null);
                                                        if (matchingStage) {
                                                            setFunnelFilter(fId);
                                                            setFunnelStageFilter(matchingStage.id);
                                                        } else {
                                                            setFunnelFilter(fId);
                                                            setFunnelStageFilter('ALL');
                                                        }
                                                    } else if (val.startsWith('STAGE_')) {
                                                        const parts = val.split('_');
                                                        const stageId = parts[1];
                                                        const parentId = parts[2];
                                                        setMergedFunnelIds(null);
                                                        setFunnelFilter(parentId);
                                                        setFunnelStageFilter(stageId);
                                                    }
                                                }}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px 8px',
                                                    border: '1px solid #cbd5e1',
                                                    borderRadius: '6px',
                                                    fontSize: '11px',
                                                    color: '#334155',
                                                    background: '#ffffff',
                                                    outline: 'none'
                                                }}
                                            >
                                                <option value="ALL">Tüm Durumlar</option>
                                                {(() => {
                                                    const MERGE_NAMES = ['genel crm (otomatik i̇şlem)', 'genel crm (otomatik işlem)', 'genel'];
                                                    const genelGroup = availableFunnels.filter(f => MERGE_NAMES.includes(f.name.toLowerCase()));
                                                    const otherFunnels = availableFunnels.filter(f => !MERGE_NAMES.includes(f.name.toLowerCase()));
                                                    const options = [];

                                                    if (genelGroup.length > 0) {
                                                        options.push(<option key="genel-all" value="GENEL_ALL">Genel (Tümü)</option>);
                                                        const combinedStages = genelGroup.flatMap(f => (f.stages || []).map(s => ({ ...s, _parentId: f.id })));
                                                        combinedStages.forEach(stage => {
                                                            const sc1 = quickStats.funnelStageCounts?.[stage.id] || 0;
                                                            options.push(<option key={stage.id} value={`STAGE_${stage.id}_${stage._parentId}`}>  ↳ {stage.name} ({sc1})</option>);
                                                        });
                                                    }

                                                    otherFunnels.forEach(funnel => {
                                                        options.push(
                                                            <optgroup key={funnel.id} label={funnel.name}>
                                                                <option value={`FUNNEL_${funnel.id}`}>{funnel.name} (Tümü)</option>
                                                                {(funnel.stages || []).map(stage => (
                                                                    <option key={stage.id} value={`STAGE_${stage.id}_${funnel.id}`}>  ↳ {stage.name} ({quickStats.funnelStageCounts?.[stage.id] || 0})</option>
                                                                ))}
                                                            </optgroup>
                                                        );
                                                    });
                                                    return options;
                                                })()}
                                            </select>
                                        </div>

                                        {/* Atama Filtresi */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                            <label style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Atama</label>
                                            <select
                                                value={assignmentFilter}
                                                onChange={(e) => {
                                                    setAssignmentFilter(e.target.value);
                                                    setPage(1);
                                                }}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px 8px',
                                                    border: '1px solid #cbd5e1',
                                                    borderRadius: '6px',
                                                    fontSize: '11px',
                                                    color: '#334155',
                                                    background: '#ffffff',
                                                    outline: 'none'
                                                }}
                                            >
                                                <option value="all">Tüm Atamalar</option>
                                                <option value="unassigned">Atanmamışlar</option>
                                                {teams.map(team => {
                                                    const teamMembers = team.members || [];
                                                    return (
                                                        <optgroup key={team.id} label={team.name}>
                                                            <option value={`team_${team.id}`}>🏢 {team.name} (Tümü)</option>
                                                            {teamMembers.map(member => {
                                                                const mUser = member.user || member;
                                                                const mId = mUser.id || member.userId;
                                                                const mName = mUser.name || 'İsimsiz';
                                                                return (
                                                                    <option key={mId} value={`user_${mId}`}>👤 {mName}</option>
                                                                );
                                                            })}
                                                        </optgroup>
                                                    );
                                                })}
                                                {(() => {
                                                    const teamMemberIds = new Set();
                                                    teams.forEach(t => (t.members || []).forEach(m => {
                                                        teamMemberIds.add(m.user?.id || m.userId || m.id);
                                                    }));
                                                    const unteamedMembers = members.filter(m => {
                                                        const mId = m.user?.id || m.userId || m.id;
                                                        return !teamMemberIds.has(mId);
                                                    });
                                                    if (unteamedMembers.length === 0) return null;
                                                    return (
                                                        <optgroup label="Takımsız">
                                                            {unteamedMembers.map(m => {
                                                                const mId = m.user?.id || m.userId || m.id;
                                                                const mName = m.user?.name || m.name || 'İsimsiz';
                                                                return (
                                                                    <option key={mId} value={`user_${mId}`}>👤 {mName}</option>
                                                                );
                                                            })}
                                                        </optgroup>
                                                    );
                                                })()}
                                            </select>
                                        </div>

                                        {/* Kaynak Filtresi */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                            <label style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Kaynak</label>
                                            <select
                                                value={sourceFilter}
                                                onChange={(e) => {
                                                    setSourceFilter(e.target.value);
                                                    setPage(1);
                                                }}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px 8px',
                                                    border: '1px solid #cbd5e1',
                                                    borderRadius: '6px',
                                                    fontSize: '11px',
                                                    color: '#334155',
                                                    background: '#ffffff',
                                                    outline: 'none'
                                                }}
                                            >
                                                {SOURCE_OPTIONS.map(option => (
                                                    <option key={option.value} value={option.value}>
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Etiket Filtresi */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                            <label style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Etiket</label>
                                            <select
                                                value={tagFilter}
                                                onChange={(e) => {
                                                    setTagFilter(e.target.value);
                                                    setPage(1);
                                                }}
                                                style={{
                                                    width: '100%',
                                                    padding: '6px 8px',
                                                    border: '1px solid #cbd5e1',
                                                    borderRadius: '6px',
                                                    fontSize: '11px',
                                                    color: '#334155',
                                                    background: '#ffffff',
                                                    outline: 'none'
                                                }}
                                            >
                                                <option value="ALL">Tüm Etiketler</option>
                                                {availableTags.map(tag => (
                                                    <option key={tag} value={tag}>{tag}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        {/* Date Preset Buttons — horizontal inline */}
                        <div className="contacts-date-presets">
                            {[
                                { key: 'ALL', label: 'Tümü' },
                                { key: 'TODAY', label: 'Bugün' },
                                { key: 'YESTERDAY', label: 'Dün' },
                                { key: 'WEEK', label: 'Bu Hafta' },
                                { key: 'MONTH', label: 'Bu Ay' },
                            ].map(({ key, label }) => (
                                <button
                                    key={key}
                                    className={`date-preset-btn${dateFilter === key && dateFilter !== 'CUSTOM' ? ' active' : ''}`}
                                    onClick={() => { setDateFilter(key); setDateFrom(''); setDateTo(''); setPage(1); }}
                                >
                                    {label}
                                </button>
                            ))}
                            <div className="date-preset-custom" ref={dateFilterRef}>
                                <button
                                    className={`date-preset-btn${dateFilter === 'CUSTOM' ? ' active' : ''}`}
                                    onClick={() => setDateFilterOpen(o => !o)}
                                >
                                    <Calendar size={13} />
                                    {dateFilter === 'CUSTOM' && (dateFrom || dateTo) ? `${dateFrom || '...'} — ${dateTo || '...'}` : 'Özel'}
                                </button>
                                {dateFilterOpen && (
                                    <div className="date-preset-dropdown">
                                        <label>Başlangıç</label>
                                        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setDateFilter('CUSTOM'); setPage(1); }} />
                                        <label>Bitiş</label>
                                        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setDateFilter('CUSTOM'); setPage(1); }} />
                                        <button className="date-preset-apply" onClick={() => setDateFilterOpen(false)}>Uygula</button>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="header-right-actions">
                            <label className="active-only-check" title="İşaretlenirse sadece aktif kişiler gösterilir">
                                <input
                                    type="checkbox"
                                    checked={onlyOpenCases}
                                    onChange={() => setOnlyOpenCases(!onlyOpenCases)}
                                />
                                <span>Sadece Aktifleri Göster</span>
                            </label>
                            <button
                                className="btn-add-contact"
                                onClick={() => setIsModalOpen(true)}
                            >
                                <Plus size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Dynamic Tabs */}
                    <div className="contacts-tabs" style={{ display: 'none', gap: '8px', padding: '0 24px', marginBottom: '16px', overflowX: 'auto' }}>
                        <button 
                            style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: getActiveTab() === 'all' ? '#1f2937' : '#f3f4f6', color: getActiveTab() === 'all' ? '#fff' : '#4b5563', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}
                            onClick={() => handleTabClick('all')}
                        >
                            Tüm Kişiler
                        </button>
                        
                        {availableFunnels.map(funnel => (
                            <button 
                                key={funnel.id}
                                style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: getActiveTab() === `funnel-${funnel.id}` ? funnel.color || '#3b82f6' : '#f3f4f6', color: getActiveTab() === `funnel-${funnel.id}` ? '#fff' : '#4b5563', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}
                                onClick={() => handleTabClick(`funnel-${funnel.id}`, funnel.id)}
                            >
                                {funnel.name}
                            </button>
                        ))}

                        <button 
                            style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: getActiveTab() === 'customers' ? '#10b981' : '#f3f4f6', color: getActiveTab() === 'customers' ? '#fff' : '#4b5563', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}
                            onClick={() => handleTabClick('customers')}
                        >
                            Müşteriler
                        </button>
                    </div>



                    <div className="contacts-quick-stats" style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                        {/* Akış Seçici — Pill tarzı dropdown */}
                        <select
                            value={selectedFunnelIds.length === 1 ? selectedFunnelIds[0] : ''}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (!val) {
                                    setSelectedFunnelIds([]);
                                    setFunnelFilter('ALL');
                                    setFunnelStageFilter('ALL');
                                    setMergedFunnelIds(null);
                                } else {
                                    setSelectedFunnelIds([val]);
                                    setFunnelFilter('ALL');
                                    setFunnelStageFilter('ALL');
                                    setMergedFunnelIds(null);
                                }
                                setPage(1);
                            }}
                            style={{
                                height: '28px',
                                borderRadius: '14px',
                                border: selectedFunnelIds.length > 0 ? '1.5px solid #6366f1' : '1px solid #cbd5e1',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                padding: '0 12px',
                                cursor: 'pointer',
                                background: selectedFunnelIds.length > 0 ? '#eef2ff' : '#ffffff',
                                color: selectedFunnelIds.length > 0 ? '#4f46e5' : '#1e293b',
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
                            <option value="">Tümü ({quickStats.periodCount || 0})</option>
                            {availableFunnels.map(funnel => {
                                const fc = quickStats.funnelCounts || {};
                                const count = fc[funnel.id] || fc[funnel.name] || 0;
                                return (
                                    <option key={funnel.id} value={funnel.id}>
                                        {funnel.name} ({count})
                                    </option>
                                );
                            })}
                        </select>

                        {/* Ayırıcı Çizgi */}
                        <div style={{ width: '1px', height: '20px', background: '#cbd5e1', margin: '0 8px', flexShrink: 0 }} />

                        {/* Hızlı Filtre Pill'leri — Tümü yok, diğerleri pill */}
                        {[
                            { key: 'NO_PHONE', label: 'Numarasız Başvurular', icon: PhoneOff, count: quickStats.noPhoneCount, colorClass: 'today' },
                            { key: 'HAS_PHONE', label: 'Numaralılar', icon: Phone, count: quickStats.withPhoneCount, colorClass: 'phone' },
                            { key: 'AGENT_CALLS', label: 'Agent Aramaları', icon: PhoneCall, count: quickStats.agentCalledCount, colorClass: 'called' },
                            { key: 'NO_ACTIVITY', label: 'İletişim Yok', icon: CircleOff, count: quickStats.noActivityCount, colorClass: 'no-activity' },
                            { key: 'AI_CALLS', label: 'AI Aramaları', icon: Bot, count: quickStats.aiCalledCount, colorClass: 'ai' },
                        ].map(btn => {
                            const isActive = quickFilterMode === btn.key;
                            const IconComp = btn.icon;
                            return (
                                <div
                                    key={btn.key}
                                    className={`quick-stat-card ${isActive ? 'quick-stat-active' : ''}`}
                                    onClick={() => {
                                        const newMode = isActive ? 'ALL' : btn.key;
                                        setQuickFilterMode(newMode);
                                        setPage(1);
                                        // Reset all quick-filter-related states first
                                        setContactInfoFilter('ALL');
                                        setCallStatusFilter('ALL');
                                        setAssignmentFilter('all');
                                        // Apply the specific filter
                                        if (newMode === 'HAS_PHONE') {
                                            setContactInfoFilter('HAS_PHONE');
                                        } else if (newMode === 'AGENT_CALLS') {
                                            setCallStatusFilter('ended');
                                        } else if (newMode === 'AI_CALLS') {
                                            setCallStatusFilter('ai_called');
                                        } else if (newMode === 'NO_ACTIVITY') {
                                            setCallStatusFilter('no_call');
                                        } else if (newMode === 'NO_PHONE') {
                                            setContactInfoFilter('NO_PHONE');
                                        }
                                        // ALL → all filters already reset
                                    }}
                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                    title={btn.label}
                                >
                                    <div className={`quick-stat-icon ${btn.colorClass}`}><IconComp size={13} /></div>
                                    {btn.count !== null && <span className="quick-stat-value">{btn.count}</span>}
                                    <span className="quick-stat-label">{btn.label}</span>
                                </div>
                            );
                        })}
                    </div>


                    {/* Analytics Panel - removed */}
                    {false && (
                        <div style={{
                            background: '#fff', borderRadius: '14px', padding: '20px',
                            border: '1px solid #e5e7eb', marginBottom: '12px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}>
                            {analyticsLoading ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                                    <Loader className="spin" size={24} />
                                    <p style={{ marginTop: '8px', fontSize: '0.85rem' }}>Yükleniyor...</p>
                                </div>
                            ) : analyticsData ? (
                                <>
                                    {/* Summary Cards */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '20px' }}>
                                        <div style={{
                                            background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', borderRadius: '12px',
                                            padding: '16px', display: 'flex', alignItems: 'center', gap: '12px'
                                        }}>
                                            <div style={{ width: 42, height: 42, borderRadius: '10px', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Users size={20} color="#fff" />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Toplam Kişi</div>
                                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#312e81' }}>{analyticsData.totals?.total || 0}</div>
                                            </div>
                                        </div>
                                        <div style={{
                                            background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)', borderRadius: '12px',
                                            padding: '16px', display: 'flex', alignItems: 'center', gap: '12px'
                                        }}>
                                            <div style={{ width: 42, height: 42, borderRadius: '10px', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Phone size={20} color="#fff" />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Telefonlu</div>
                                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#064e3b' }}>{analyticsData.totals?.withPhone || 0}</div>
                                            </div>
                                        </div>
                                        <div style={{
                                            background: 'linear-gradient(135deg, #fef2f2, #fecaca)', borderRadius: '12px',
                                            padding: '16px', display: 'flex', alignItems: 'center', gap: '12px'
                                        }}>
                                            <div style={{ width: 42, height: 42, borderRadius: '10px', background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <PhoneOff size={20} color="#fff" />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Telefonsuz</div>
                                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#991b1b' }}>{analyticsData.totals?.withoutPhone || 0}</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Chart */}
                                    <div style={{ position: 'relative' }}>
                                        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b7280', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                                            <span>Günlük Gelen Kişi Sayısı</span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span style={{ width: 10, height: 3, background: '#6366f1', borderRadius: 2, display: 'inline-block' }}></span>
                                                <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Toplam</span>
                                            </span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span style={{ width: 10, height: 3, background: '#10b981', borderRadius: 2, display: 'inline-block' }}></span>
                                                <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Telefonlu</span>
                                            </span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span style={{ width: 10, height: 3, background: '#ef4444', borderRadius: 2, display: 'inline-block' }}></span>
                                                <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Telefonsuz</span>
                                            </span>
                                        </div>
                                        {(() => {
                                            const stats = analyticsData.dailyStats || [];
                                            if (!stats.length) return <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Veri yok</p>;
                                            const maxVal = Math.max(...stats.map(s => s.total), 1);
                                            const w = 900;
                                            const h = 180;
                                            const padL = 40;
                                            const padR = 10;
                                            const padT = 10;
                                            const padB = 30;
                                            const chartW = w - padL - padR;
                                            const chartH = h - padT - padB;
                                            const stepX = chartW / Math.max(stats.length - 1, 1);

                                            const makeLine = (key, color) => {
                                                return stats.map((s, i) => {
                                                    const x = padL + i * stepX;
                                                    const y = padT + chartH - (s[key] / maxVal) * chartH;
                                                    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
                                                }).join(' ');
                                            };

                                            const makeArea = (key, color) => {
                                                const line = stats.map((s, i) => {
                                                    const x = padL + i * stepX;
                                                    const y = padT + chartH - (s[key] / maxVal) * chartH;
                                                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                                                });
                                                const first = `${padL},${padT + chartH}`;
                                                const last = `${padL + (stats.length - 1) * stepX},${padT + chartH}`;
                                                return `M${first} L${line.join(' L')} L${last} Z`;
                                            };

                                            // Y axis labels
                                            const ySteps = 4;
                                            const yLabels = Array.from({ length: ySteps + 1 }, (_, i) => Math.round(maxVal * i / ySteps));

                                            // X axis labels - show every Nth
                                            const showEvery = stats.length > 30 ? 7 : stats.length > 14 ? 3 : 2;

                                            return (
                                                <div style={{ overflowX: 'auto' }}>
                                                    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', maxHeight: '220px' }}>
                                                        {/* Grid lines */}
                                                        {yLabels.map((val, i) => {
                                                            const y = padT + chartH - (val / maxVal) * chartH;
                                                            return (
                                                                <g key={i}>
                                                                    <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="#f1f5f9" strokeWidth="0.5" />
                                                                    <text x={padL - 5} y={y + 3} textAnchor="end" fill="#94a3b8" fontSize="8">{val}</text>
                                                                </g>
                                                            );
                                                        })}

                                                        {/* Area fills */}
                                                        <path d={makeArea('total', '#6366f1')} fill="#6366f120" />
                                                        <path d={makeArea('withPhone', '#10b981')} fill="#10b98115" />

                                                        {/* Lines */}
                                                        <path d={makeLine('total', '#6366f1')} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                        <path d={makeLine('withPhone', '#10b981')} fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4,2" />
                                                        <path d={makeLine('withoutPhone', '#ef4444')} fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2,2" />

                                                        {/* Data dots & X labels */}
                                                        {stats.map((s, i) => {
                                                            const x = padL + i * stepX;
                                                            const yTotal = padT + chartH - (s.total / maxVal) * chartH;
                                                            return (
                                                                <g key={i}>
                                                                    <circle cx={x} cy={yTotal} r="2.5" fill="#6366f1" />
                                                                    {/* Tooltip hover area */}
                                                                    <title>{`${s.date}
Toplam: ${s.total}
Telefonlu: ${s.withPhone}
Telefonsuz: ${s.withoutPhone}`}</title>
                                                                    {i % showEvery === 0 && (
                                                                        <text x={x} y={h - 5} textAnchor="middle" fill="#94a3b8" fontSize="7">
                                                                            {s.date.slice(5)}
                                                                        </text>
                                                                    )}
                                                                </g>
                                                            );
                                                        })}
                                                    </svg>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </>
                            ) : null}
                        </div>
                    )}

                    {/* Table */}
                    <div className="contacts-table-container">
                        {loading ? (
                            <div className="loading-container">
                                <div className="loader"></div>
                                <p>Kişiler yükleniyor...</p>
                            </div>
                        ) : contacts.length === 0 ? (
                            <div className="empty-state-list">
                                <Users size={48} className="empty-icon" />
                                <h3>Kişi Bulunamadı</h3>
                                <p>Henüz kayıtlı kişi yok veya filtrelere uygun sonuç bulunamadı.</p>
                            </div>
                        ) : (
                            <table className="contacts-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '40px' }}>
                                            <input
                                                type="checkbox"
                                                checked={contacts.length > 0 && selectedIds.length === contacts.length}
                                                onChange={handleSelectAll}
                                                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                            />
                                        </th>
                                        {[
                                            { key: 'name', label: 'KİŞİ', style: { minWidth: '220px', maxWidth: '300px' } },
                                            { key: null, label: 'KONU', style: { minWidth: '80px', maxWidth: '140px' } },
                                            { key: 'status', label: 'DURUM', style: { minWidth: '120px', maxWidth: '200px' } },
                                            { key: null, label: 'ATANAN', style: { minWidth: '80px', maxWidth: '140px' } },
                                            { key: null, label: 'AKTİVİTELER', style: { minWidth: '120px', maxWidth: '180px' } },
                                            { key: null, label: 'SON NOT', style: { minWidth: '100px', maxWidth: '160px' } },
                                            { key: 'createdAt', label: 'İLK YAZMA', style: { minWidth: '90px', maxWidth: '110px' } },
                                            { key: 'lastMessageAt', label: 'SON YAZMA', style: { minWidth: '90px', maxWidth: '110px' } },
                                        ].map(col => (
                                            <th
                                                key={col.label}
                                                style={{ ...col.style, cursor: col.key ? 'pointer' : 'default', userSelect: 'none' }}
                                                onClick={() => {
                                                    if (!col.key) return;
                                                    if (sortField === col.key) {
                                                        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                                                    } else {
                                                        setSortField(col.key);
                                                        setSortDir('desc');
                                                    }
                                                    setPage(1);
                                                }}
                                            >
                                                {col.label}
                                                {col.key && sortField === col.key && (
                                                    <span style={{ marginLeft: '4px', fontSize: '0.6rem' }}>
                                                        {sortDir === 'asc' ? '↑' : '↓'}
                                                    </span>
                                                )}
                                                {col.key && sortField !== col.key && (
                                                    <span style={{ marginLeft: '4px', fontSize: '0.6rem', opacity: 0.3 }}>⇅</span>
                                                )}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {contacts.map((contact) => {
                                        const sourceInfo = getSourceInfo(contact.source);
                                        const SourceIcon = sourceInfo.icon;
                                        return (
                                            <tr
                                                key={contact.id}
                                                className={selectedContact?.id === contact.id ? 'active' : ''}
                                                onClick={() => handleSelectContact(contact)}
                                            >
                                                <td onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIds.includes(contact.id)}
                                                        onChange={() => {
                                                            setSelectedIds(prev =>
                                                                prev.includes(contact.id)
                                                                    ? prev.filter(id => id !== contact.id)
                                                                    : [...prev, contact.id]
                                                            );
                                                        }}
                                                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                                    />
                                                </td>
                                                {/* KİŞİ: İsim + Firma + Mail + Telefon */}
                                                <td style={{ maxWidth: '300px' }}>
                                                    <div className="contact-name-cell" style={{ maxWidth: '100%', overflow: 'hidden' }}>
                                                        <div style={{ position: 'relative', flexShrink: 0, alignSelf: 'flex-start', marginTop: '2px' }}>
                                                            <img
                                                                src={getAvatarUrl(contact)}
                                                                alt={contact.name}
                                                                className="contact-avatar"
                                                                onError={(e) => {
                                                                    e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.name || 'U')}&background=ef4444&color=fff`;
                                                                }}
                                                            />
                                                            {sourceInfo.color && (
                                                                <span
                                                                    className="contact-source-badge"
                                                                    title={sourceInfo.label}
                                                                    style={{ backgroundColor: sourceInfo.color }}
                                                                >
                                                                    <SourceIcon size={10} color="#fff" />
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="contact-name-info" style={{ overflow: 'hidden', minWidth: 0, flex: 1 }}>
                                                            <span className="contact-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{getDisplayName(contact)}</span>
                                                            {contact.company && (
                                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', fontSize: '11px', color: '#6366f1', fontWeight: 500 }}>
                                                                    <Building size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} />
                                                                    {contact.company}
                                                                </span>
                                                            )}
                                                            <span className="contact-email" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{contact.email || '---'}</span>
                                                            <span className="contact-phone-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', fontSize: '10px', color: '#6b7280' }}>{contact.phone || '---'}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                {/* KONU */}
                                                <td className="contact-topic" title={contact.aiTopic || ''} style={{ maxWidth: '140px' }}>
                                                    {contact.aiTopic ? (
                                                        <span style={{
                                                            display: 'inline-block',
                                                            padding: '2px 6px',
                                                            backgroundColor: '#f0f9ff',
                                                            color: '#0369a1',
                                                            borderRadius: '4px',
                                                            fontSize: '11px',
                                                            fontWeight: 500,
                                                            maxWidth: '130px',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap'
                                                        }}>
                                                            {contact.aiTopic}
                                                        </span>
                                                    ) : <span style={{color: '#94a3b8'}}>---</span>}
                                                </td>
                                                {/* DURUM = Akış / Aşama - Tıklanabilir */}
                                                <td className="contact-status" style={{ maxWidth: '200px', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                                                    {(() => {
                                                        let funnelName = '';
                                                        let stageName = 'Yeni';
                                                        let displayColor = '#6b7280';
                                                        let displayBg = '#6b72801a';
                                                        let currentFunnelId = null;

                                                        if (contact.funnelStageId && availableFunnels.length > 0) {
                                                            for (const funnel of availableFunnels) {
                                                                const s = funnel.stages?.find(x => x.id === contact.funnelStageId);
                                                                if (s) {
                                                                    funnelName = funnel.name;
                                                                    stageName = s.name;
                                                                    displayColor = s.color || '#6366f1';
                                                                    displayBg = `${displayColor}1a`;
                                                                    currentFunnelId = funnel.id;
                                                                    break;
                                                                }
                                                            }
                                                        } else if (contact.status) {
                                                            const statusInfo = getStatusInfo(contact.status);
                                                            stageName = statusInfo.label;
                                                            displayColor = statusInfo.color;
                                                            displayBg = statusInfo.bg;
                                                        }

                                                        const isDropdownOpen = stageDropdownContactId === contact.id;

                                                        return (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', position: 'relative' }}>
                                                                {funnelName && (
                                                                    <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>
                                                                        {funnelName}
                                                                    </span>
                                                                )}
                                                                <span
                                                                    className="status-badge"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setStageDropdownContactId(isDropdownOpen ? null : contact.id);
                                                                    }}
                                                                    style={{
                                                                        backgroundColor: displayBg,
                                                                        color: displayColor,
                                                                        border: isDropdownOpen ? `2px solid ${displayColor}` : (funnelStageFilter !== 'ALL') ? `1px solid ${displayColor}30` : 'none',
                                                                        fontSize: '11px',
                                                                        padding: '2px 8px',
                                                                        cursor: 'pointer',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '4px',
                                                                        transition: 'all 0.15s'
                                                                    }}
                                                                >
                                                                    {stageName}
                                                                    <ChevronDown size={10} style={{ opacity: 0.6, transform: isDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                                                </span>
                                                                {/* Stage change dropdown - two panel */}
                                                                {isDropdownOpen && (() => {
                                                                    const activeFunnelId = hoveredFunnelId || currentFunnelId || availableFunnels[0]?.id;
                                                                    const activeFunnel = availableFunnels.find(f => f.id === activeFunnelId);
                                                                    return (
                                                                        <div
                                                                            ref={stageDropdownRef}
                                                                            style={{
                                                                                position: 'absolute',
                                                                                top: '100%',
                                                                                left: 0,
                                                                                zIndex: 1000,
                                                                                display: 'flex',
                                                                                background: '#fff',
                                                                                border: '1px solid #e5e7eb',
                                                                                borderRadius: '12px',
                                                                                boxShadow: '0 12px 36px rgba(0,0,0,0.15)',
                                                                                marginTop: '4px',
                                                                                overflow: 'hidden'
                                                                            }}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        >
                                                                            {/* Left panel: Funnels */}
                                                                            <div style={{
                                                                                minWidth: '160px',
                                                                                borderRight: '1px solid #f3f4f6',
                                                                                padding: '6px 0'
                                                                            }}>
                                                                                <div style={{
                                                                                    padding: '6px 14px 8px',
                                                                                    fontSize: '0.65rem',
                                                                                    fontWeight: 700,
                                                                                    color: '#94a3b8',
                                                                                    textTransform: 'uppercase',
                                                                                    letterSpacing: '0.5px'
                                                                                }}>AKIŞ</div>
                                                                                {availableFunnels.map(funnel => {
                                                                                    const isActive = funnel.id === activeFunnelId;
                                                                                    const funnelColor = funnel.stages?.[0]?.color || '#3b82f6';
                                                                                    return (
                                                                                        <div
                                                                                            key={funnel.id}
                                                                                            onMouseEnter={() => setHoveredFunnelId(funnel.id)}
                                                                                            style={{
                                                                                                padding: '8px 14px',
                                                                                                fontSize: '0.82rem',
                                                                                                cursor: 'pointer',
                                                                                                display: 'flex',
                                                                                                alignItems: 'center',
                                                                                                gap: '8px',
                                                                                                background: isActive ? '#f8fafc' : 'transparent',
                                                                                                fontWeight: isActive ? 600 : 400,
                                                                                                color: isActive ? '#1e293b' : '#64748b',
                                                                                                transition: 'all 0.1s'
                                                                                            }}
                                                                                        >
                                                                                            <span style={{
                                                                                                width: 9, height: 9,
                                                                                                borderRadius: '50%',
                                                                                                background: funnelColor,
                                                                                                flexShrink: 0
                                                                                            }} />
                                                                                            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{funnel.name}</span>
                                                                                            <ChevronRight size={14} style={{ opacity: isActive ? 0.7 : 0.3, flexShrink: 0 }} />
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                            {/* Right panel: Stages */}
                                                                            {activeFunnel && (
                                                                                <div style={{
                                                                                    minWidth: '180px',
                                                                                    maxHeight: '340px',
                                                                                    overflowY: 'auto',
                                                                                    padding: '6px 0'
                                                                                }}>
                                                                                    <div style={{
                                                                                        padding: '6px 14px 8px',
                                                                                        fontSize: '0.65rem',
                                                                                        fontWeight: 700,
                                                                                        color: '#94a3b8',
                                                                                        textTransform: 'uppercase',
                                                                                        letterSpacing: '0.5px',
                                                                                        whiteSpace: 'nowrap'
                                                                                    }}>{activeFunnel.name}</div>
                                                                                    {activeFunnel.stages?.map(stage => {
                                                                                        const isCurrentStage = contact.funnelStageId === stage.id;
                                                                                        const stageColor = stage.color || '#6366f1';
                                                                                        return (
                                                                                            <div
                                                                                                key={stage.id}
                                                                                                onClick={() => handleInlineStageChange(contact, activeFunnel.id, stage.id)}
                                                                                                style={{
                                                                                                    padding: '7px 14px',
                                                                                                    fontSize: '0.82rem',
                                                                                                    cursor: 'pointer',
                                                                                                    display: 'flex',
                                                                                                    alignItems: 'center',
                                                                                                    gap: '8px',
                                                                                                    background: isCurrentStage ? `${stageColor}12` : 'transparent',
                                                                                                    fontWeight: isCurrentStage ? 600 : 400,
                                                                                                    color: isCurrentStage ? stageColor : '#374151',
                                                                                                    transition: 'background 0.1s',
                                                                                                    whiteSpace: 'nowrap'
                                                                                                }}
                                                                                                onMouseEnter={(ev) => ev.currentTarget.style.background = `${stageColor}10`}
                                                                                                onMouseLeave={(ev) => ev.currentTarget.style.background = isCurrentStage ? `${stageColor}12` : 'transparent'}
                                                                                            >
                                                                                                <span style={{
                                                                                                    width: 9, height: 9,
                                                                                                    borderRadius: '50%',
                                                                                                    background: stageColor,
                                                                                                    flexShrink: 0
                                                                                                }} />
                                                                                                <span style={{ flex: 1 }}>{stage.name}</span>
                                                                                                {isCurrentStage && <Check size={14} style={{ color: stageColor, flexShrink: 0 }} />}
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </div>
                                                        );
                                                    })()}
                                                </td>

                                                {/* ATANAN */}
                                                <td className="contact-assigned" style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                                                    {(() => {
                                                        const conv = contact.conversations?.[0];
                                                        if (!conv) return '---';
                                                        const teamId = conv.assignedTeamId || (() => {
                                                            try { return JSON.parse(conv.teamIds || '[]')[0]; } catch { return null; }
                                                        })();
                                                        const team = teamId ? teams.find(t => t.id === teamId) : null;
                                                        const agentName = conv.assignedTo?.name;
                                                        if (team && agentName) return `${team.name} / ${agentName}`;
                                                        if (team) return team.name;
                                                        if (agentName) return agentName;
                                                        return '---';
                                                    })()}
                                                </td>

                                                {/* AKTİVİTELER */}
                                                <td style={{ maxWidth: '180px', padding: '4px 6px', verticalAlign: 'middle' }}>
                                                    {(() => {
                                                        const acts = contact.activities || [];
                                                        if (acts.length === 0) return <span style={{ color: '#d1d5db', fontSize: '0.72rem' }}>---</span>;
                                                        const last3 = acts.slice(0, 3);
                                                        return (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                                {last3.map((e, idx) => {
                                                                    const done = e.status === 'COMPLETED';
                                                                    const cancelled = e.status === 'CANCELLED';
                                                                    const isCall = e.type === 'CALL' || e.type === 'REMINDER';
                                                                    const isMeeting = e.type === 'MEETING';
                                                                    const isPlanned = e.status === 'PLANNED';
                                                                    let label = '';
                                                                    let color = '#6b7280';
                                                                    let bg = '#f3f4f6';
                                                                    if (isCall && done) { label = 'Arandı'; color = '#15803d'; bg = '#f0fdf4'; }
                                                                    else if (isCall && cancelled) { label = 'Ulaşılamadı'; color = '#dc2626'; bg = '#fef2f2'; }
                                                                    else if (isCall && isPlanned) { label = 'Arama Bekliyor'; color = '#d97706'; bg = '#fffbeb'; }
                                                                    else if (isMeeting && isPlanned) { label = 'Görüşme Bekliyor'; color = '#2563eb'; bg = '#eff6ff'; }
                                                                    else if (isMeeting && done) { label = 'Görüşme Yapıldı'; color = '#15803d'; bg = '#f0fdf4'; }
                                                                    else if (e.type === 'NOTE') { label = 'Not Eklendi'; color = '#6b7280'; bg = '#f9fafb'; }
                                                                    else if (e.type === 'TASK' && done) { label = 'Görev Tamamlandı'; color = '#15803d'; bg = '#f0fdf4'; }
                                                                    else if (e.type === 'TASK' && isPlanned) { label = 'Görev Bekliyor'; color = '#d97706'; bg = '#fffbeb'; }
                                                                    else if (e.type === 'VISIT' && done) { label = 'Ziyaret Edildi'; color = '#15803d'; bg = '#f0fdf4'; }
                                                                    else if (e.type === 'VISIT' && isPlanned) { label = 'Ziyaret Bekliyor'; color = '#2563eb'; bg = '#eff6ff'; }
                                                                    else {
                                                                        const typeLabels = { CALL: 'Arama', MEETING: 'Toplantı', VISIT: 'Ziyaret', TASK: 'Görev', REMINDER: 'Hatırlatıcı', NOTE: 'Not' };
                                                                        label = typeLabels[e.type] || e.type;
                                                                    }
                                                                    const dateStr = e.dueDate
                                                                        ? new Date(e.dueDate).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
                                                                        : (e.createdAt ? new Date(e.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : '');
                                                                    const isAI = e.source === 'AI' || e.source === 'RETELL' || e.assignedByType === 'AI';
                                                                    const performerName = isAI ? 'AI' : (e.assignee?.name || e.creator?.name || '');
                                                                    const shortName = performerName === 'AI' ? '🤖' : (performerName ? performerName.split(' ')[0] : '');
                                                                    return (
                                                                        <div key={idx} style={{
                                                                            display: 'flex', alignItems: 'center', gap: 4,
                                                                            padding: '1px 5px', borderRadius: 4,
                                                                            background: bg, whiteSpace: 'nowrap'
                                                                        }}>
                                                                            <span style={{
                                                                                fontSize: '0.66rem', fontWeight: 600,
                                                                                color: color, lineHeight: 1.3
                                                                            }}>
                                                                                {label}
                                                                            </span>
                                                                            {dateStr && (
                                                                                <span style={{
                                                                                    fontSize: '0.58rem', color: '#94a3b8',
                                                                                    fontWeight: 400, lineHeight: 1.3
                                                                                }}>
                                                                                    {dateStr}
                                                                                </span>
                                                                            )}
                                                                            {shortName && (
                                                                                <span style={{
                                                                                    fontSize: '0.56rem', color: isAI ? '#8b5cf6' : '#64748b',
                                                                                    fontWeight: 500, lineHeight: 1.3,
                                                                                    opacity: 0.85
                                                                                }}>
                                                                                    {shortName}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        );
                                                    })()}
                                                </td>

                                                {/* SON NOT */}
                                                <td className="contact-last-note" style={{
                                                    maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.78rem',
                                                    color: contact.lastNoteType === 'planned' ? '#f59e0b' : contact.lastNoteType === 'activity' ? '#3b82f6' : '#6b7280'
                                                }}>
                                                    {contact.lastNote || '---'}
                                                </td>
                                                {/* İLK YAZMA */}
                                                <td className="contact-created" style={{ fontSize: '0.78rem', maxWidth: '90px' }}>
                                                    {formatDate(contact.createdAt)}
                                                </td>
                                                {/* SON YAZMA */}
                                                <td className="contact-last-message" style={{ fontSize: '0.78rem', maxWidth: '90px' }}>
                                                    {formatDate(contact.lastMessageAt)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Pagination + Limit + Import/Export — tek satır */}
                    <div className="customers-footer-bar">
                        {/* Sol: Limit seçici */}
                        <div className="customers-footer-limit">
                            <span>Göster:</span>
                            {[20, 50, 100, 'Tümü'].map(val => (
                                <button
                                    key={val}
                                    className={`customers-limit-btn ${limit === (val === 'Tümü' ? 999999 : val) ? 'active' : ''}`}
                                    onClick={() => { setLimit(val === 'Tümü' ? 999999 : val); setPage(1); }}
                                >{val}</button>
                            ))}
                        </div>

                        {/* Orta: Sayfa navigasyon */}
                        <div className="customers-footer-pagination">
                            <button
                                className="pagination-btn"
                                disabled={page === 1}
                                onClick={() => setPage(p => p - 1)}
                            >
                                <ChevronLeft size={16} /> Önceki
                            </button>
                            <span className="pagination-info">
                                {page} / {Math.max(1, Math.ceil(total / limit))}
                            </span>
                            <button
                                className="pagination-btn"
                                disabled={page >= Math.ceil(total / limit)}
                                onClick={() => setPage(p => p + 1)}
                            >
                                Sonraki <ChevronRight size={16} />
                            </button>
                        </div>

                        {/* Sağ: İçe / Dışa Aktar */}
                        <div className="customers-footer-actions">
                            <button
                                className="export-csv-btn import-csv-btn"
                                onClick={() => { setShowImportModal(true); setImportData([]); setImportResult(null); setImportFileName(''); setImportTag(''); }}
                                title="Excel İçe Aktar"
                            >
                                <Upload size={14} /> İçe Aktar
                            </button>
                            <button
                                className="export-csv-btn"
                                onClick={() => setShowExportModal(true)}
                                title="CSV Dışa Aktar"
                            >
                                <Download size={14} /> Dışa Aktar
                            </button>
                            {currentWorkspace?.id === 'dbdb6e87-9769-4975-ad57-a984a1e8b995' && (
                                <button
                                    className="export-csv-btn"
                                    onClick={handleExportLeads}
                                    disabled={exportingLeads}
                                    title="Facebook Lead Dışa Aktar"
                                    style={{ background: '#7c3aed', color: '#fff' }}
                                >
                                    {exportingLeads ? <Loader size={14} className="spin" /> : <Download size={14} />} Lead Dışa Aktar
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Bulk Actions */}
                    {selectedIds.length > 0 && (
                        <div className="customers-floating-bulk-bar">
                            <div className="customers-bulk-bar-content">
                                <div className="customers-bulk-bar-left">
                                    <button className="customers-bulk-close-btn" onClick={() => setSelectedIds([])}>
                                        <X size={16} />
                                    </button>
                                    <span className="customers-bulk-count"><strong>{selectedIds.length}</strong> kişi seçildi</span>
                                </div>
                                <div className="customers-bulk-bar-actions">
                                    {selectedIds.length < total && (
                                        <button className="customers-bulk-select-all-btn" onClick={handleSelectAllGlobal}>
                                            Tümünü Seç ({total})
                                        </button>
                                    )}
                                    {selectedIds.length === total && total > contacts.length && (
                                        <button className="customers-bulk-select-all-btn" onClick={() => setSelectedIds([])}>
                                            Seçimi Kaldır ({total})
                                        </button>
                                    )}
                                    <button className="customers-bulk-action-btn customers-bulk-wa-btn" onClick={async () => {
                                        setShowBulkWA(true);
                                        try {
                                            const res = await automationAPI.getTemplates(currentWorkspace.id);
                                            setWaTemplates(res.data.templates || res.data || []);
                                        } catch (e) { console.error(e); }
                                    }}>
                                        <MessageCircle size={16} />
                                        WhatsApp
                                    </button>
                                    <button className="customers-bulk-action-btn customers-bulk-email-btn" onClick={async () => {
                                        setShowBulkEmail(true);
                                        try {
                                            const res = await emailAPI.getChannels(currentWorkspace.id);
                                            setEmailChannels(res.data.emailChannels || res.data.channels || res.data || []);
                                        } catch (e) { console.error(e); }
                                    }}>
                                        <Mail size={16} />
                                        E-posta
                                    </button>
                                    <button className="customers-bulk-action-btn customers-bulk-call-btn" onClick={() => setShowBulkCall(true)}>
                                        <PhoneCall size={16} />
                                        Ara
                                    </button>
                                    <button className="customers-bulk-action-btn customers-bulk-status-btn" onClick={() => setShowBulkStatus(true)}>
                                        <ArrowUpDown size={16} />
                                        Durum Değiştir
                                    </button>
                                    {user?.role === 'SUPER_ADMIN' && (
                                    <button className="customers-bulk-delete-btn" onClick={handleDeleteSelected} disabled={deleting}>
                                        <Trash2 size={16} />
                                        {deleting ? 'Siliniyor...' : 'Sil'}
                                    </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ========== BULK WHATSAPP TEMPLATE MODAL ========== */}
                    {showBulkWA && (
                        <div className="modal-overlay" onClick={() => !bulkWASending && setShowBulkWA(false)}>
                            <div className="modal-content bulk-modal" onClick={e => e.stopPropagation()}>
                                <button className="modal-close" onClick={() => !bulkWASending && setShowBulkWA(false)}><X size={20} /></button>
                                <div className="modal-header">
                                    <h2>📱 Toplu WhatsApp Şablon Gönderimi</h2>
                                </div>
                                <div style={{ padding: '1.5rem' }}>
                                    {(() => {
                                        const pool = allSelectedContacts.length > 0 ? allSelectedContacts : contacts;
                                        const eligibleContacts = pool.filter(c => selectedIds.includes(c.id) && (c.phone || c.phones?.[0]));
                                        return (
                                            <>
                                                <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
                                                    <strong>{eligibleContacts.length}</strong> / {selectedIds.length} kişinin telefon numarası mevcut.
                                                </p>
                                                {eligibleContacts.length === 0 ? (
                                                    <p style={{ color: '#ef4444' }}>Seçilen kişilerin telefon numarası yok.</p>
                                                ) : (
                                                    <>
                                                        <div className="form-group">
                                                            <label>Şablon Seç</label>
                                                            <select className="form-input" value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
                                                                <option value="">-- Şablon seçin --</option>
                                                                {waTemplates.filter(t => t.status === 'APPROVED').map(t => (
                                                                    <option key={t.id || t.name} value={t.name}>{t.name}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        {bulkWASending && (
                                                            <div className="customers-bulk-progress">
                                                                <div className="customers-bulk-progress-bar">
                                                                    <div className="customers-bulk-progress-fill" style={{ width: `${(bulkWAProgress.sent / bulkWAProgress.total) * 100}%` }} />
                                                                </div>
                                                                <span>{bulkWAProgress.sent} / {bulkWAProgress.total} gönderildi{bulkWAProgress.errors > 0 && ` (${bulkWAProgress.errors} hata)`}</span>
                                                            </div>
                                                        )}
                                                        <div className="modal-actions">
                                                            <button className="btn btn-outline" onClick={() => setShowBulkWA(false)} disabled={bulkWASending}>İptal</button>
                                                            <button className="btn btn-primary" disabled={!selectedTemplate || bulkWASending} onClick={async () => {
                                                                setBulkWASending(true);
                                                                const total = eligibleContacts.length;
                                                                setBulkWAProgress({ sent: 0, total, errors: 0 });
                                                                let errors = 0;
                                                                for (let i = 0; i < eligibleContacts.length; i++) {
                                                                    const c = eligibleContacts[i];
                                                                    try {
                                                                        await automationAPI.sendTemplateDynamic(currentWorkspace.id, {
                                                                            templateName: selectedTemplate,
                                                                            phoneNumber: c.phone || c.phones?.[0],
                                                                            customerName: c.name || 'Müşteri'
                                                                        });
                                                                    } catch (e) { errors++; }
                                                                    setBulkWAProgress({ sent: i + 1, total, errors });
                                                                    if (i < eligibleContacts.length - 1) await new Promise(r => setTimeout(r, 500));
                                                                }
                                                                setBulkWASending(false);
                                                                alert(`✅ ${total - errors} / ${total} kişiye şablon gönderildi.`);
                                                                setShowBulkWA(false);
                                                                setSelectedTemplate('');
                                                                setSelectedIds([]);
                                                            }}>
                                                                {bulkWASending ? <><Loader size={14} className="spin" /> Gönderiliyor...</> : <><Send size={14} /> Gönder</>}
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ========== BULK EMAIL MODAL ========== */}
                    {showBulkEmail && (
                        <div className="modal-overlay" onClick={() => !bulkEmailSending && setShowBulkEmail(false)}>
                            <div className="modal-content bulk-modal" onClick={e => e.stopPropagation()}>
                                <button className="modal-close" onClick={() => !bulkEmailSending && setShowBulkEmail(false)}><X size={20} /></button>
                                <div className="modal-header">
                                    <h2>📧 Toplu E-posta Gönderimi</h2>
                                </div>
                                <div style={{ padding: '1.5rem' }}>
                                    {(() => {
                                        const pool = allSelectedContacts.length > 0 ? allSelectedContacts : contacts;
                                        const eligibleContacts = pool.filter(c => selectedIds.includes(c.id) && (c.email || c.emails?.[0]));
                                        return (
                                            <>
                                                <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
                                                    <strong>{eligibleContacts.length}</strong> / {selectedIds.length} kişinin e-posta adresi mevcut.
                                                </p>
                                                {eligibleContacts.length === 0 ? (
                                                    <p style={{ color: '#ef4444' }}>Seçilen kişilerin e-posta adresi yok.</p>
                                                ) : (
                                                    <>
                                                        <div className="form-group">
                                                            <label>E-posta Kanalı</label>
                                                            <select className="form-input" value={selectedEmailChannel} onChange={e => setSelectedEmailChannel(e.target.value)}>
                                                                <option value="">-- Kanal seçin --</option>
                                                                {emailChannels.map(ch => (
                                                                    <option key={ch.id} value={ch.id}>{ch.emailAddress || ch.email || ch.id}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        <div className="form-group">
                                                            <label>Konu</label>
                                                            <input className="form-input" placeholder="E-posta konusu..." value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
                                                        </div>
                                                        <div className="form-group">
                                                            <label>Mesaj</label>
                                                            <textarea className="form-input" rows={5} placeholder="E-posta içeriği..." value={emailBody} onChange={e => setEmailBody(e.target.value)} style={{ resize: 'vertical', minHeight: '100px' }} />
                                                        </div>
                                                        {bulkEmailSending && (
                                                            <div className="customers-bulk-progress">
                                                                <div className="customers-bulk-progress-bar">
                                                                    <div className="customers-bulk-progress-fill" style={{ width: `${(bulkEmailProgress.sent / bulkEmailProgress.total) * 100}%` }} />
                                                                </div>
                                                                <span>{bulkEmailProgress.sent} / {bulkEmailProgress.total} gönderildi{bulkEmailProgress.errors > 0 && ` (${bulkEmailProgress.errors} hata)`}</span>
                                                            </div>
                                                        )}
                                                        <div className="modal-actions">
                                                            <button className="btn btn-outline" onClick={() => setShowBulkEmail(false)} disabled={bulkEmailSending}>İptal</button>
                                                            <button className="btn btn-primary" disabled={!selectedEmailChannel || !emailSubject.trim() || !emailBody.trim() || bulkEmailSending} onClick={async () => {
                                                                setBulkEmailSending(true);
                                                                const total = eligibleContacts.length;
                                                                setBulkEmailProgress({ sent: 0, total, errors: 0 });
                                                                let errors = 0;
                                                                for (let i = 0; i < eligibleContacts.length; i++) {
                                                                    const c = eligibleContacts[i];
                                                                    try {
                                                                        await emailAPI.sendNew(selectedEmailChannel, {
                                                                            to: c.email || c.emails?.[0],
                                                                            subject: emailSubject,
                                                                            body: emailBody
                                                                        });
                                                                    } catch (e) { errors++; }
                                                                    setBulkEmailProgress({ sent: i + 1, total, errors });
                                                                    if (i < eligibleContacts.length - 1) await new Promise(r => setTimeout(r, 300));
                                                                }
                                                                setBulkEmailSending(false);
                                                                alert(`✅ ${total - errors} / ${total} kişiye e-posta gönderildi.`);
                                                                setShowBulkEmail(false);
                                                                setEmailSubject('');
                                                                setEmailBody('');
                                                                setSelectedIds([]);
                                                            }}>
                                                                {bulkEmailSending ? <><Loader size={14} className="spin" /> Gönderiliyor...</> : <><Send size={14} /> Gönder</>}
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ========== BULK CALL MODAL ========== */}
                    {showBulkCall && (
                        <div className="modal-overlay" onClick={() => !bulkCallRunning && setShowBulkCall(false)}>
                            <div className="modal-content bulk-modal" onClick={e => e.stopPropagation()}>
                                <button className="modal-close" onClick={() => !bulkCallRunning && setShowBulkCall(false)}><X size={20} /></button>
                                <div className="modal-header">
                                    <h2>📞 Toplu Arama</h2>
                                </div>
                                <div style={{ padding: '1.5rem' }}>
                                    {(() => {
                                        const pool = allSelectedContacts.length > 0 ? allSelectedContacts : contacts;
                                        const eligibleContacts = pool.filter(c => selectedIds.includes(c.id) && (c.phone || c.phones?.[0]));
                                        return (
                                            <>
                                                <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
                                                    <strong>{eligibleContacts.length}</strong> / {selectedIds.length} kişinin telefon numarası mevcut.
                                                </p>
                                                {eligibleContacts.length === 0 ? (
                                                    <p style={{ color: '#ef4444' }}>Seçilen kişilerin telefon numarası yok.</p>
                                                ) : (
                                                    <>
                                                        <div style={{ background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: '#92400e' }}>
                                                            ⚠️ Aramalar sıralı olarak başlatılacaktır. Her arama arasında bekleme süresi olacaktır.
                                                        </div>

                                                        <div className="bulk-call-agent-selector" style={{ marginBottom: '20px' }}>
                                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#4b5563', marginBottom: '8px' }}>Konuşacak Agent</label>
                                                            <select
                                                                value={selectedAgentId}
                                                                onChange={(e) => setSelectedAgentId(e.target.value)}
                                                                style={{ 
                                                                    width: '100%', 
                                                                    padding: '10px 12px', 
                                                                    borderRadius: '8px', 
                                                                    border: '1px solid #d1d5db', 
                                                                    fontSize: '14px', 
                                                                    backgroundColor: '#fff',
                                                                    outline: 'none',
                                                                    cursor: 'pointer'
                                                                }}
                                                            >
                                                                <option value="">Varsayılan Agent</option>
                                                                {retellAgents.map(a => (
                                                                    <option key={a.agent_id} value={a.agent_id}>{a.agent_name || a.agent_id}</option>
                                                                ))}
                                                            </select>
                                                            <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                                                                Boş bırakırsanız varsayılan agent kullanılır.
                                                            </p>
                                                        </div>
                                                        <div className="customers-bulk-call-list">
                                                            {eligibleContacts.map(c => (
                                                                <div key={c.id} className="customers-bulk-call-item">
                                                                    <span>{c.name || 'İsimsiz'}</span>
                                                                    <span style={{ color: '#6b7280', fontSize: '13px' }}>{c.phone || c.phones?.[0]}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        {bulkCallRunning && (
                                                            <div className="customers-bulk-progress">
                                                                <div className="customers-bulk-progress-bar">
                                                                    <div className="customers-bulk-progress-fill" style={{ width: `${(bulkCallProgress.called / bulkCallProgress.total) * 100}%` }} />
                                                                </div>
                                                                <span>{bulkCallProgress.called} / {bulkCallProgress.total} arandı{bulkCallProgress.errors > 0 && ` (${bulkCallProgress.errors} hata)`}</span>
                                                            </div>
                                                        )}
                                                        <div className="modal-actions">
                                                            <button className="btn btn-outline" onClick={() => setShowBulkCall(false)} disabled={bulkCallRunning}>İptal</button>
                                                            <button className="btn btn-primary" disabled={bulkCallRunning} onClick={async () => {
                                                                setBulkCallRunning(true);
                                                                const total = eligibleContacts.length;
                                                                setBulkCallProgress({ called: 0, total, errors: 0 });
                                                                let errors = 0;
                                                                for (let i = 0; i < eligibleContacts.length; i++) {
                                                                    const c = eligibleContacts[i];
                                                                    try {
                                                                        await retellAPI.makeCall(currentWorkspace.id, {
                                                                            toNumber: c.phone || c.phones?.[0],
                                                                            contactId: c.id,
                                                                            contactName: c.name || 'Müşteri',
                                                                            agentId: selectedAgentId
                                                                        });
                                                                    } catch (e) { errors++; }
                                                                    setBulkCallProgress({ called: i + 1, total, errors });
                                                                    if (i < eligibleContacts.length - 1) await new Promise(r => setTimeout(r, 3000));
                                                                }
                                                                setBulkCallRunning(false);
                                                                alert(`✅ ${total - errors} / ${total} kişi arandı.`);
                                                                setShowBulkCall(false);
                                                                setSelectedIds([]);
                                                            }}>
                                                                {bulkCallRunning ? <><Loader size={14} className="spin" /> Aranıyor...</> : <><PhoneCall size={14} /> Aramaları Başlat</>}
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ========== BULK STATUS CHANGE MODAL ========== */}
                    {showBulkStatus && (
                        <div className="modal-overlay" onClick={() => !bulkStatusRunning && setShowBulkStatus(false)}>
                            <div className="modal-content bulk-modal" onClick={e => e.stopPropagation()}>
                                <button className="modal-close" onClick={() => !bulkStatusRunning && setShowBulkStatus(false)}><X size={20} /></button>
                                <div className="modal-header">
                                    <h2>🔄 Toplu Durum Değiştir</h2>
                                </div>
                                <div style={{ padding: '1.5rem' }}>
                                    <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
                                        <strong>{selectedIds.length}</strong> kişinin durumunu topluca değiştireceksiniz.
                                    </p>

                                    <div className="form-group" style={{ marginBottom: '16px' }}>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#4b5563', marginBottom: '8px' }}>Satış Akışı Seçin</label>
                                        <select
                                            className="form-input"
                                            value={bulkStatusFunnel}
                                            onChange={(e) => { setBulkStatusFunnel(e.target.value); setBulkStatusStage(''); }}
                                        >
                                            <option value="">-- Akış seçin --</option>
                                            {availableFunnels.map(f => (
                                                <option key={f.id} value={f.id}>{f.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {bulkStatusFunnel && (() => {
                                        const funnel = availableFunnels.find(f => f.id === bulkStatusFunnel);
                                        const stages = funnel?.stages || [];
                                        return (
                                            <div className="form-group" style={{ marginBottom: '16px' }}>
                                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#4b5563', marginBottom: '8px' }}>Aşama Seçin</label>
                                                <div className="bulk-status-stage-grid">
                                                    {stages.map(stage => (
                                                        <button
                                                            key={stage.id}
                                                            className={`bulk-status-stage-option ${bulkStatusStage === stage.id ? 'selected' : ''}`}
                                                            onClick={() => setBulkStatusStage(stage.id)}
                                                            style={{
                                                                '--stage-color': stage.color || '#6366f1',
                                                                '--stage-bg': (stage.color || '#6366f1') + '15',
                                                            }}
                                                        >
                                                            <span className="bulk-status-stage-dot" style={{ backgroundColor: stage.color || '#6366f1' }} />
                                                            <span>{stage.name}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {bulkStatusRunning && (
                                        <div className="customers-bulk-progress">
                                            <div className="customers-bulk-progress-bar">
                                                <div className="customers-bulk-progress-fill" style={{ width: `${(bulkStatusProgress.done / bulkStatusProgress.total) * 100}%` }} />
                                            </div>
                                            <span>{bulkStatusProgress.done} / {bulkStatusProgress.total} güncellendi{bulkStatusProgress.errors > 0 && ` (${bulkStatusProgress.errors} hata)`}</span>
                                        </div>
                                    )}

                                    <div className="modal-actions">
                                        <button className="btn btn-outline" onClick={() => setShowBulkStatus(false)} disabled={bulkStatusRunning}>İptal</button>
                                        <button className="btn btn-primary" disabled={!bulkStatusStage || bulkStatusRunning} onClick={handleBulkStatusChange}>
                                            {bulkStatusRunning ? <><Loader size={14} className="spin" /> Güncelleniyor...</> : <><ArrowUpDown size={14} /> Uygula</>}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                </div>

                {/* Right Sidebar - Shared ContactSidebar Component */}
                {selectedContact && (
                    <ContactSidebar
                        contactId={selectedContact.id}
                        isOpen={!!selectedContact}
                        onClose={() => setSelectedContact(null)}
                        members={members}
                        teams={teams}
                        isOwner={true}
                        onAssignTeam={async (convId, teamId) => {
                            try {
                                await conversationAPI.assign(currentWorkspace.id, convId, { teamId });
                            } catch (err) { console.error('Team assign error:', err); }
                        }}
                        onAssignUser={async (convId, userId) => {
                            try {
                                await conversationAPI.assign(currentWorkspace.id, convId, { assignedToId: userId || null });
                            } catch (err) { console.error('User assign error:', err); }
                        }}
                        onTakeOver={async (convId) => {
                            try {
                                await conversationAPI.takeOver(currentWorkspace.id, convId);
                            } catch (err) { console.error('TakeOver error:', err); }
                        }}
                        currentUserId={user?.id}
                    />
                )}
                {/* Create/Edit Contact Modal - Google Contacts Style */}
                {isModalOpen && (
                    <div className="contact-modal-overlay" onClick={closeModal}>
                        <div className="contact-modal-panel" onClick={(e) => e.stopPropagation()}>
                            {/* Header */}
                            <div className="contact-modal-header">
                                <button className="modal-back-btn" onClick={closeModal}>
                                    <X size={20} />
                                </button>
                                <button className="modal-save-btn" type="submit" form="contact-form">
                                    Kaydet
                                </button>
                            </div>

                            {formError && (
                                <div className="alert alert-error">{formError}</div>
                            )}

                            {/* Form */}
                            <form id="contact-form" className="contact-modal-form" onSubmit={handleCreateContact}>
                                {/* Name Row */}
                                <div className="contact-form-row">
                                    <div className="contact-form-icon">
                                        <User size={20} />
                                    </div>
                                    <div className="contact-form-fields">
                                        <input
                                            type="text"
                                            className="contact-form-input"
                                            placeholder="İsim"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        />
                                        <input
                                            type="text"
                                            className="contact-form-input"
                                            placeholder="Soyadı"
                                            value={formData.fullName}
                                            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                        />
                                    </div>
                                </div>

                                {/* Company Row */}
                                <div className="contact-form-row">
                                    <div className="contact-form-icon">
                                        <Building size={20} />
                                    </div>
                                    <div className="contact-form-fields">
                                        <input
                                            type="text"
                                            className="contact-form-input"
                                            placeholder="Şirket"
                                            value={formData.company}
                                            onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                                        />
                                    </div>
                                </div>

                                {/* Email Row - Dynamic */}
                                <div className="contact-form-row">
                                    <div className="contact-form-icon">
                                        <Mail size={20} />
                                    </div>
                                    <div className="contact-form-fields">
                                        {formData.emails.map((email, index) => (
                                            <div key={index} className="dynamic-input-row">
                                                <input
                                                    type="email"
                                                    className="contact-form-input"
                                                    placeholder="E-posta"
                                                    value={email}
                                                    onChange={(e) => updateEmail(index, e.target.value)}
                                                />
                                                {formData.emails.length > 1 && (
                                                    <button
                                                        type="button"
                                                        className="remove-field-btn"
                                                        onClick={() => removeEmail(index)}
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        <button type="button" className="add-field-btn" onClick={addEmail}>
                                            <Plus size={16} />
                                            E-posta ekle
                                        </button>
                                    </div>
                                </div>

                                {/* Phone Row - Dynamic */}
                                <div className="contact-form-row">
                                    <div className="contact-form-icon">
                                        <Phone size={20} />
                                    </div>
                                    <div className="contact-form-fields">
                                        {formData.phones.map((phone, index) => (
                                            <div key={index} className="dynamic-input-row">
                                                <input
                                                    type="tel"
                                                    className="contact-form-input"
                                                    placeholder="Telefon"
                                                    value={phone}
                                                    onChange={(e) => updatePhone(index, e.target.value)}
                                                />
                                                {formData.phones.length > 1 && (
                                                    <button
                                                        type="button"
                                                        className="remove-field-btn"
                                                        onClick={() => removePhone(index)}
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        <button type="button" className="add-field-btn" onClick={addPhone}>
                                            <Plus size={16} />
                                            Telefon ekle
                                        </button>
                                    </div>
                                </div>

                                {!editingContact && (
                                    <p className="contact-form-hint">
                                        * Yeni kişi için isim ve en az bir iletişim bilgisi gereklidir
                                    </p>
                                )}
                            </form>
                        </div>
                    </div>
                )}

                {/* Export Modal */}
                {showExportModal && (
                    <div className="modal-overlay" onClick={() => setShowExportModal(false)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>CSV Dışa Aktar</h2>
                                <button className="modal-close" onClick={() => setShowExportModal(false)}>
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="modal-body">
                                <p style={{ marginBottom: '20px', color: '#666' }}>
                                    İlk yazma tarihine göre kişileri dışa aktarın
                                </p>
                                <div className="form-group">
                                    <label>Başlangıç Tarihi</label>
                                    <input
                                        type="date"
                                        value={exportStartDate}
                                        onChange={(e) => setExportStartDate(e.target.value)}
                                        className="form-input"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Bitiş Tarihi</label>
                                    <input
                                        type="date"
                                        value={exportEndDate}
                                        onChange={(e) => setExportEndDate(e.target.value)}
                                        className="form-input"
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button
                                    className="btn-secondary"
                                    onClick={() => setShowExportModal(false)}
                                    disabled={exporting}
                                >
                                    İptal
                                </button>
                                <button
                                    className="btn-primary"
                                    onClick={handleExportCSV}
                                    disabled={exporting || !exportStartDate || !exportEndDate}
                                >
                                    {exporting ? 'Dışa Aktarılıyor...' : 'Dışa Aktar'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Excel Import Modal */}
                {showImportModal && (
                    <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
                        <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2><Upload size={20} /> Excel İçe Aktar</h2>
                                <button className="btn-icon" onClick={() => setShowImportModal(false)}>
                                    <X size={18} />
                                </button>
                            </div>
                            <div className="modal-body">
                                <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '16px' }}>
                                    Excel dosyanızdaki <strong>B</strong> (Ad Soyad), <strong>C</strong> (Cep Tel), <strong>D</strong> (Email), <strong>E</strong> (Notlar) sütunları aktarılacaktır.
                                </p>

                                {/* Tag Input */}
                                <div className="form-group" style={{ marginBottom: '16px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '13px', marginBottom: '6px' }}>
                                        <Tag size={14} /> Etiket Ekle (Zorunlu)
                                    </label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Örn: FUAR_2024 veya Müşteri Listesi"
                                        value={importTag}
                                        onChange={(e) => setImportTag(e.target.value)}
                                    />
                                    <small style={{ color: '#94a3b8', fontSize: '11px' }}>Bu etiket, içe aktarılan kişilere eklenecek ve daha sonra listeyi filtrelemenizi sağlayacaktır.</small>
                                </div>

                                {/* File Input */}
                                <div className="form-group" style={{ marginBottom: '16px' }}>
                                    <label style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px', display: 'block' }}>Dosya Seçin</label>
                                    <input
                                        type="file"
                                        accept=".xlsx,.xls,.csv"
                                        onChange={handleFileSelect}
                                        style={{ fontSize: '13px' }}
                                    />
                                    {importFileName && (
                                        <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '8px' }}>{importFileName}</span>
                                    )}
                                </div>

                                {/* Preview */}
                                {importData.length > 0 && (
                                    <div style={{ marginBottom: '16px' }}>
                                        <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: '#334155' }}>Önizleme ({importData.length} kişi)</h4>
                                        <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                                            <table className="contacts-table" style={{ fontSize: '12px' }}>
                                                <thead>
                                                    <tr>
                                                        <th>Ad Soyad</th>
                                                        <th>Telefon</th>
                                                        <th>Email</th>
                                                        <th>Notlar</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {importData.slice(0, 10).map((row, i) => (
                                                        <tr key={i}>
                                                            <td>{row.name}</td>
                                                            <td>{row.phone}</td>
                                                            <td>{row.email}</td>
                                                            <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.notes}</td>
                                                        </tr>
                                                    ))}
                                                    {importData.length > 10 && (
                                                        <tr><td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8' }}>... ve {importData.length - 10} kişi daha</td></tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Import Result */}
                                {importResult && (
                                    <div style={{
                                        padding: '12px 16px',
                                        borderRadius: '8px',
                                        background: importResult.error ? '#fef2f2' : '#f0fdf4',
                                        border: `1px solid ${importResult.error ? '#fca5a5' : '#86efac'}`,
                                        fontSize: '13px',
                                        marginBottom: '12px'
                                    }}>
                                        {importResult.error ? (
                                            <span style={{ color: '#dc2626' }}>❌ {importResult.error}</span>
                                        ) : (
                                            <span style={{ color: '#16a34a' }}>
                                                ✅ <strong>{importResult.imported}</strong> kişi aktarıldı, <strong>{importResult.skipped}</strong> kişi atlandı (zaten mevcut).
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button className="btn-secondary" onClick={() => setShowImportModal(false)}>
                                    Kapat
                                </button>
                                <button
                                    className="btn-primary"
                                    onClick={handleImportExcel}
                                    disabled={importing || importData.length === 0 || !importTag.trim()}
                                    style={{ background: '#16a34a' }}
                                >
                                    {importing ? (
                                        <><Loader size={14} className="spin" /> Aktarılıyor...</>
                                    ) : (
                                        <><Upload size={14} /> {importData.length} Kişiyi Aktar</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                confirmText={confirmModal.confirmText}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                type={confirmModal.type}
            />
        </>
    );
};

export default Customers;
