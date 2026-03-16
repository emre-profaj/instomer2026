import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { contactAPI, automationAPI, emailAPI, retellAPI } from '../../services/api';
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
    Edit2,
    Trash2,
    Plus,
    X,
    CheckSquare,
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
    Tag
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './Customers.css';
import '../../components/ContactSidebar/ContactSidebar.css';
import ConfirmModal from '../../components/ConfirmModal/ConfirmModal';

// Müşteri durumu seçenekleri
const CUSTOMER_STATUS_OPTIONS = [
    { value: 'NEW_APPLICATION', label: 'Yeni Başvuru', color: '#3b82f6', bg: '#eff6ff' },
    { value: 'OPPORTUNITY', label: 'Fırsat', color: '#f59e0b', bg: '#fffbeb' },
    { value: 'HOT_OPPORTUNITY', label: 'Sıcak Fırsat', color: '#ef4444', bg: '#fef2f2' },
    { value: 'UNREACHABLE', label: 'Ulaşılamadı', color: '#64748b', bg: '#f8fafc' },
    { value: 'CALLBACK', label: 'Tekrar Ara', color: '#0ea5e9', bg: '#f0f9ff' },
    { value: 'OFFER_GIVEN', label: 'Teklif Verildi', color: '#8b5cf6', bg: '#f5f3ff' },
    { value: 'NEGOTIATION', label: 'Pazarlık', color: '#f97316', bg: '#fff7ed' },
    { value: 'CONTRACT', label: 'Sözleşme', color: '#06b6d4', bg: '#ecfeff' },
    { value: 'SALE_COMPLETED', label: 'Satış', color: '#10b981', bg: '#ecfdf5' },
    { value: 'LOST', label: 'Kayıp', color: '#1f2937', bg: '#f9fafb' },
    { value: 'NOT_INTERESTED', label: 'İlgisiz', color: '#9ca3af', bg: '#f3f4f6' },
];


const getStatusInfo = (status) => {
    return CUSTOMER_STATUS_OPTIONS.find(s => s.value === status) || CUSTOMER_STATUS_OPTIONS[0];
};

// Kaynak seçenekleri
const SOURCE_OPTIONS = [
    { value: 'ALL', label: 'Tüm Kaynaklar', icon: Users },
    { value: 'FACEBOOK', label: 'Facebook', icon: Facebook, color: '#1877f2' },
    { value: 'INSTAGRAM', label: 'Instagram', icon: Instagram, color: '#e4405f' },
    { value: 'WHATSAPP', label: 'WhatsApp', icon: MessageCircle, color: '#25d366' },
    { value: 'WIDGET', label: 'Web Widget', icon: MessageSquare, color: '#6366f1' },
    { value: 'EMAIL', label: 'E-posta', icon: Mail, color: '#f59e0b' },
    { value: 'LEAD', label: 'Lead', icon: User, color: '#8b5cf6' },
    { value: 'MANUAL', label: 'Manuel', icon: Plus, color: '#6b7280' }
];

const getSourceInfo = (source) => {
    return SOURCE_OPTIONS.find(s => s.value === source) || SOURCE_OPTIONS[0];
};

// Kategori seçenekleri
const CATEGORY_OPTIONS = [
    { value: 'ALL', label: 'Tüm Kategoriler', icon: Users, color: '#6b7280' },
    { value: 'NEW', label: 'Yeni', icon: User, color: '#3b82f6' },
    { value: 'CUSTOMER', label: 'Müşteriler', icon: User, color: '#10b981' },
    { value: 'OPPORTUNITY', label: 'Fırsatlar', icon: User, color: '#f59e0b' },
    { value: 'VIP', label: 'VIP', icon: User, color: '#8b5cf6' },
    { value: 'PARTNER', label: 'İş Ortakları', icon: Building, color: '#3b82f6' },
    { value: 'SPAM', label: 'Spam', icon: User, color: '#ef4444' },
    { value: 'BLACKLIST', label: 'Kara Liste', icon: User, color: '#1f2937' }
];

const getCategoryInfo = (category) => {
    return CATEGORY_OPTIONS.find(c => c.value === category) || CATEGORY_OPTIONS[1];
};

const Customers = () => {
    const { currentWorkspace } = useAuth();
    const navigate = useNavigate();
    const [contacts, setContacts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [sourceFilter, setSourceFilter] = useState('ALL');
    const [categoryFilter, setCategoryFilter] = useState('ALL');
    const [callStatusFilter, setCallStatusFilter] = useState('ALL');
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null, title: '', message: '', confirmText: '', type: 'danger' });
    const [showArchived, setShowArchived] = useState(false);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const limit = 15;

    // Selected contact for sidebar
    const [selectedContact, setSelectedContact] = useState(null);
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

    // Import group filter state
    const [importGroupFilter, setImportGroupFilter] = useState('ALL');
    const [availableImportGroups, setAvailableImportGroups] = useState([]);

    useEffect(() => {
        if (currentWorkspace) {
            loadContacts();
        }
    }, [currentWorkspace, page, search, statusFilter, sourceFilter, categoryFilter, callStatusFilter, tagFilter, importGroupFilter, showArchived]);

    // Real-time update listener
    useEffect(() => {
        const handleContactUpdate = (event) => {
            const data = event.detail;
            if (currentWorkspace && data.workspaceId === currentWorkspace.id) {
                console.log('🔄 [Customers] Real-time contact update received, reloading...');
                loadContacts();

                // Also update selectedContact if it matches
                if (selectedContact && data.contactId === selectedContact.id && data.updatedFields) {
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
                console.log('🔄 [Customers] New conversation received, reloading contacts...');
                loadContacts();
            }
        };

        const handleNewMessage = (event) => {
            const data = event.detail;
            // Only reload for WIDGET channel (new web visitors)
            if (currentWorkspace && data.workspaceId === currentWorkspace.id && data.channel === 'WIDGET') {
                console.log('🔄 [Customers] New widget message received, reloading contacts...');
                loadContacts();
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
    }, [currentWorkspace]);

    const loadContacts = async () => {
        try {
            setLoading(true);
            const response = await contactAPI.getAll(currentWorkspace.id, {
                search,
                status: statusFilter,
                source: sourceFilter,
                category: categoryFilter,
                tag: tagFilter,
                callStatus: callStatusFilter,
                importGroup: importGroupFilter,
                showArchived: showArchived.toString(),
                limit,
                offset: (page - 1) * limit
            });
            setContacts(response.data.contacts);
            setTotal(response.data.total);

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
            const headers = ['İsim', 'Telefon', 'E-posta', 'İlk Yazma Tarihi', 'Durum', 'Son Not'];

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

                return [
                    contact.name || '',
                    contact.phone || '',
                    contact.email || '',
                    contact.firstMessageAt ? new Date(contact.firstMessageAt).toLocaleDateString('tr-TR') : '',
                    getStatusInfo(contact.status).label,
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

                // Fallback: if no phone found in main headers, check for secondary phone columns
                const phone2Col = phoneCol >= 0 ? findCol(['ikinci', 'whatsapp', '2. telefon'].filter(k => headers.indexOf(k) !== phoneCol)) : -1;

                console.log(`📊 [Import] Column mapping: name=${nameCol}, phone=${phoneCol}, email=${emailCol}, notes=${notesCol}`);

                const contacts = [];
                for (let i = 1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if (!row || row.length === 0) continue;
                    const name = nameCol >= 0 ? (row[nameCol] || '').toString().trim() : '';
                    const phone = phoneCol >= 0 ? (row[phoneCol] || '').toString().trim() : '';
                    const email = emailCol >= 0 ? (row[emailCol] || '').toString().trim() : '';
                    const notes = notesCol >= 0 ? (row[notesCol] || '').toString().trim() : '';
                    // Use phone2 (e.g. WhatsApp number) as fallback if primary phone is empty
                    const finalPhone = phone || (phone2Col >= 0 ? (row[phone2Col] || '').toString().trim() : '');
                    if (name || finalPhone || email) {
                        contacts.push({ name, phone: finalPhone, email, notes });
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
        const now = new Date();
        const diff = now - date;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days === 0) return 'Bugün';
        if (days === 1) return 'Dün';
        if (days < 7) return `${days} gün önce`;
        if (days < 30) return `${Math.floor(days / 7)} hafta önce`;
        if (days < 365) return `${Math.floor(days / 30)} ay önce`;
        return `${Math.floor(days / 365)} yıl önce`;
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
                        <div className="contacts-search">
                            <Search size={18} className="search-icon" />
                            <input
                                type="text"
                                placeholder="Kişi ara..."
                                value={search}
                                onChange={handleSearch}
                            />
                        </div>
                        <div className="header-right-actions">
                            <button
                                className={`btn-archive-toggle ${showArchived ? 'active' : ''}`}
                                onClick={() => setShowArchived(!showArchived)}
                                title={showArchived ? 'Arşivlileri Gizle' : 'Arşivlileri Göster'}
                            >
                                <Archive size={18} />
                                {showArchived ? 'Arşivlileri Gizle' : 'Arşivlileri Göster'}
                            </button>
                            <button
                                className="btn-add-contact"
                                onClick={() => setIsModalOpen(true)}
                            >
                                <Plus size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Compact Filter Dropdowns */}
                    <div className="contacts-filters">
                        <div className="filter-dropdowns-row">
                            {/* Source Dropdown */}
                            <div className="filter-dropdown-item">
                                <label>Kaynak</label>
                                <select
                                    value={sourceFilter}
                                    onChange={(e) => {
                                        setSourceFilter(e.target.value);
                                        setPage(1);
                                    }}
                                    className="filter-select"
                                >
                                    {SOURCE_OPTIONS.map(option => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Status Dropdown */}
                            <div className="filter-dropdown-item">
                                <label>Durum</label>
                                <select
                                    value={statusFilter}
                                    onChange={(e) => handleStatusFilter(e.target.value)}
                                    className="filter-select"
                                >
                                    <option value="ALL">Tüm Durumlar</option>
                                    {CUSTOMER_STATUS_OPTIONS.map(option => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Category Dropdown */}
                            <div className="filter-dropdown-item">
                                <label>Kategori</label>
                                <select
                                    value={categoryFilter}
                                    onChange={(e) => {
                                        setCategoryFilter(e.target.value);
                                        setPage(1);
                                    }}
                                    className="filter-select"
                                >
                                    {CATEGORY_OPTIONS.map(option => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* AI Call Status Filter */}
                            <div className="filter-dropdown-item">
                                <label><PhoneCall size={12} /> AI Arama</label>
                                <select
                                    value={callStatusFilter}
                                    onChange={(e) => {
                                        setCallStatusFilter(e.target.value);
                                        setPage(1);
                                    }}
                                    className="filter-select"
                                >
                                    <option value="ALL">Tüm Aramalar</option>
                                    <option value="ended">Araması Yapılanlar</option>
                                    <option value="not_connected">Ulaşılamayanlar</option>
                                    <option value="positive">Olumlu Sonuç</option>
                                    <option value="negative">Olumsuz Sonuç</option>
                                    <option value="no_call">Aranmamış</option>
                                </select>
                            </div>

                            {/* Import Group Filter */}
                            {availableImportGroups.length > 0 && (
                                <div className="filter-dropdown-item">
                                    <label><Tag size={12} /> İçe Aktarma Grubu</label>
                                    <select
                                        value={importGroupFilter}
                                        onChange={(e) => {
                                            setImportGroupFilter(e.target.value);
                                            setPage(1);
                                        }}
                                        className="filter-select"
                                    >
                                        <option value="ALL">Tüm Gruplar</option>
                                        {availableImportGroups.map(group => (
                                            <option key={group} value={group}>{group}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Import Button - red, next to Export */}
                            <button
                                className="export-csv-btn import-csv-btn"
                                onClick={() => { setShowImportModal(true); setImportData([]); setImportResult(null); setImportFileName(''); setImportTag(''); }}
                                title="Excel İçe Aktar"
                            >
                                <Upload size={16} />
                                İçe Aktar
                            </button>

                            {/* Export Button */}
                            <button
                                className="export-csv-btn"
                                onClick={() => setShowExportModal(true)}
                                title="CSV Dışa Aktar"
                            >
                                <Download size={16} />
                                Dışa Aktar
                            </button>
                        </div>
                    </div>

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
                                        <th>İSİM</th>
                                        <th>KAYNAK</th>
                                        <th>ATANAN</th>
                                        <th>TELEFON</th>
                                        <th>FİRMA</th>
                                        <th>DURUM</th>
                                        <th>SOHBETLER</th>
                                        <th>İLK YAZMA</th>
                                        <th>SON YAZMA</th>
                                        <th>SON NOT</th>
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
                                                <td>
                                                    <div className="contact-name-cell">
                                                        <img
                                                            src={getAvatarUrl(contact)}
                                                            alt={contact.name}
                                                            className="contact-avatar"
                                                            onError={(e) => {
                                                                e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.name || 'U')}&background=ef4444&color=fff`;
                                                            }}
                                                        />
                                                        <div className="contact-name-info">
                                                            <span className="contact-name">{getDisplayName(contact)}</span>
                                                            <span className="contact-email">{contact.email || '---'}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="contact-source">
                                                    <div
                                                        className="source-badge"
                                                        style={{
                                                            backgroundColor: sourceInfo.color ? `${sourceInfo.color}15` : '#f3f4f6',
                                                            color: sourceInfo.color || '#6b7280'
                                                        }}
                                                    >
                                                        <SourceIcon size={12} />
                                                        <span>{sourceInfo.label}</span>
                                                    </div>
                                                </td>
                                                <td className="contact-assigned">
                                                    {contact.conversations?.[0]?.assignedTo?.name || '---'}
                                                </td>
                                                <td className="contact-phone">
                                                    {contact.phone || '---'}
                                                </td>
                                                <td className="contact-company">
                                                    {contact.company || '---'}
                                                </td>
                                                <td className="contact-status">
                                                    {(() => {
                                                        const statusInfo = getStatusInfo(contact.status);
                                                        return (
                                                            <span
                                                                className="status-badge"
                                                                style={{
                                                                    backgroundColor: statusInfo.bg,
                                                                    color: statusInfo.color
                                                                }}
                                                            >
                                                                {statusInfo.label}
                                                            </span>
                                                        );
                                                    })()}
                                                </td>
                                                <td className="contact-conversations">
                                                    {contact._count?.conversations || 0}
                                                </td>
                                                <td className="contact-first-message">
                                                    {formatDate(contact.firstMessageAt)}
                                                </td>
                                                <td className="contact-last-message">
                                                    {formatDate(contact.lastMessageAt)}
                                                </td>
                                                <td className="contact-last-note">
                                                    {(() => {
                                                        if (!contact.notes) return '---';
                                                        try {
                                                            const notesArray = JSON.parse(contact.notes);
                                                            if (Array.isArray(notesArray) && notesArray.length > 0) {
                                                                const lastNote = notesArray[notesArray.length - 1].content || '';
                                                                return lastNote.length > 50 ? lastNote.substring(0, 50) + '...' : lastNote;
                                                            }
                                                        } catch (e) {
                                                            // Notes are stored as string with format: [timestamp]\ncontent
                                                            const notes = contact.notes;
                                                            // Split by separator and get first note
                                                            const firstNote = notes.split('\n\n---\n\n')[0];
                                                            // Remove timestamp line [timestamp]
                                                            const contentMatch = firstNote.match(/\[.*?\]\n([\s\S]*)/);
                                                            if (contentMatch && contentMatch[1]) {
                                                                const content = contentMatch[1].trim();
                                                                return content.length > 50 ? content.substring(0, 50) + '...' : content;
                                                            }
                                                            // Fallback: show as is if format doesn't match
                                                            return notes.length > 50 ? notes.substring(0, 50) + '...' : notes;
                                                        }
                                                        return '---';
                                                    })()}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Pagination */}
                    {total > limit && (
                        <div className="contacts-pagination">
                            <button
                                className="pagination-btn"
                                disabled={page === 1}
                                onClick={() => setPage(p => p - 1)}
                            >
                                <ChevronLeft size={16} />
                                Önceki
                            </button>
                            <span className="pagination-info">
                                {page} / {Math.ceil(total / limit)}
                            </span>
                            <button
                                className="pagination-btn"
                                disabled={page >= Math.ceil(total / limit)}
                                onClick={() => setPage(p => p + 1)}
                            >
                                Sonraki
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    )}

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
                                    <button className="customers-bulk-delete-btn" onClick={handleDeleteSelected} disabled={deleting}>
                                        <Trash2 size={16} />
                                        {deleting ? 'Siliniyor...' : 'Sil'}
                                    </button>
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
                                                                            contactName: c.name || 'Müşteri'
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

                </div>

                {/* Right Sidebar - Contact Profile */}
                {selectedContact && (
                    <div className="contact-sidebar" style={{ height: 'calc(100vh - 60px)', minHeight: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>
                        <button className="sidebar-close" onClick={closeSidebar}>
                            <X size={20} />
                        </button>

                        {/* Profile Header */}
                        <div className="sidebar-profile-header">
                            <img
                                src={getAvatarUrl(selectedContact)}
                                alt={selectedContact.name}
                                className="sidebar-avatar"
                                onError={(e) => {
                                    e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedContact.name || 'U')}&background=ef4444&color=fff&size=150`;
                                }}
                            />
                            <h2 className="sidebar-name">{getDisplayName(selectedContact)}</h2>
                            {selectedContact.title && (
                                <p className="sidebar-title">{selectedContact.title}</p>
                            )}

                            {/* Social Links - Only show if data exists */}
                            {(selectedContact.facebookId || selectedContact.instagramUsername) && (
                                <div className="sidebar-social-links">
                                    {selectedContact.facebookId && (
                                        <a href={`https://facebook.com/${selectedContact.facebookId}`} target="_blank" rel="noopener noreferrer" className="social-link facebook">
                                            <Facebook size={16} />
                                        </a>
                                    )}
                                    {selectedContact.instagramUsername && (
                                        <a href={`https://instagram.com/${selectedContact.instagramUsername}`} target="_blank" rel="noopener noreferrer" className="social-link instagram">
                                            <Instagram size={16} />
                                        </a>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Category Selector */}
                        <div className="sidebar-category-section">
                            <h3>Kategori</h3>
                            <select
                                className="category-select"
                                value={selectedContact.category || 'CUSTOMER'}
                                onChange={async (e) => {
                                    const newCategory = e.target.value;
                                    try {
                                        await contactAPI.update(currentWorkspace.id, selectedContact.id, { category: newCategory });
                                        setSelectedContact(prev => ({ ...prev, category: newCategory }));
                                        setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, category: newCategory } : c));
                                    } catch (err) {
                                        console.error('Category update error:', err);
                                    }
                                }}
                                style={{
                                    borderColor: getCategoryInfo(selectedContact.category).color,
                                    backgroundColor: `${getCategoryInfo(selectedContact.category).color}15`
                                }}
                            >
                                {CATEGORY_OPTIONS.filter(c => c.value !== 'ALL').map(cat => (
                                    <option key={cat.value} value={cat.value}>
                                        {cat.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Contact Info Section - Multi-phone, Multi-email, Company */}
                        <div className="section-container">
                            <h3 className="section-title">İLETİŞİM BİLGİLERİ</h3>
                            <div className="meta-list">
                                {/* Company - Always visible */}
                                <div className="meta-item">
                                    <div className="meta-icon">
                                        <Building size={16} />
                                    </div>
                                    <div className="meta-content">
                                        <span className="meta-label">Şirket</span>
                                        <input
                                            type="text"
                                            className="meta-input"
                                            value={selectedContact.company || ''}
                                            onChange={(e) => setSelectedContact(prev => ({ ...prev, company: e.target.value }))}
                                            onBlur={async () => {
                                                try {
                                                    await contactAPI.update(currentWorkspace.id, selectedContact.id, { company: selectedContact.company });
                                                    setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, company: selectedContact.company } : c));
                                                } catch (err) { console.error('Company update error:', err); }
                                            }}
                                            placeholder="Şirket adı..."
                                        />
                                    </div>
                                </div>

                                {/* Phones - Multiple */}
                                {(() => {
                                    let phones = selectedContact.phones;
                                    if (!Array.isArray(phones)) {
                                        phones = selectedContact.phone ? [selectedContact.phone] : [''];
                                    }
                                    if (phones.length === 0) phones = [''];
                                    return phones.map((phone, index) => (
                                        <div key={`phone-${index}`} className="meta-item">
                                            <div className="meta-icon">
                                                <Phone size={16} />
                                            </div>
                                            <div className="meta-content">
                                                <span className="meta-label">Telefon {phones.length > 1 ? index + 1 : ''}</span>
                                                <div className="meta-input-row">
                                                    <input
                                                        type="text"
                                                        className="meta-input"
                                                        value={phone}
                                                        onChange={(e) => {
                                                            const newPhones = [...phones];
                                                            newPhones[index] = e.target.value;
                                                            setSelectedContact(prev => ({ ...prev, phones: newPhones, phone: newPhones[0] }));
                                                        }}
                                                        onBlur={async () => {
                                                            try {
                                                                const newPhones = phones.filter(p => p.trim());
                                                                await contactAPI.update(currentWorkspace.id, selectedContact.id, {
                                                                    phones: newPhones,
                                                                    phone: newPhones[0] || ''
                                                                });
                                                                setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, phones: newPhones, phone: newPhones[0] || '' } : c));
                                                            } catch (err) { console.error('Phone update error:', err); }
                                                        }}
                                                        placeholder="Telefon numarası..."
                                                    />
                                                    {phones.length > 1 && (
                                                        <button
                                                            className="meta-remove-btn"
                                                            onClick={async () => {
                                                                const newPhones = phones.filter((_, i) => i !== index);
                                                                setSelectedContact(prev => ({ ...prev, phones: newPhones, phone: newPhones[0] || '' }));
                                                                try {
                                                                    await contactAPI.update(currentWorkspace.id, selectedContact.id, { phones: newPhones, phone: newPhones[0] || '' });
                                                                    setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, phones: newPhones, phone: newPhones[0] || '' } : c));
                                                                } catch (err) { console.error('Phone remove error:', err); }
                                                            }}
                                                            title="Telefonu sil"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ));
                                })()}
                                <button
                                    className="meta-add-btn"
                                    onClick={() => {
                                        let phones = selectedContact.phones;
                                        if (!Array.isArray(phones)) {
                                            phones = selectedContact.phone ? [selectedContact.phone] : [''];
                                        }
                                        setSelectedContact(prev => ({ ...prev, phones: [...phones, ''] }));
                                    }}
                                >
                                    <Plus size={14} />
                                    Telefon ekle
                                </button>

                                {/* Emails - Multiple */}
                                {(() => {
                                    let emails = selectedContact.emails;
                                    if (!Array.isArray(emails)) {
                                        emails = selectedContact.email ? [selectedContact.email] : [''];
                                    }
                                    if (emails.length === 0) emails = [''];
                                    return emails.map((email, index) => (
                                        <div key={`email-${index}`} className="meta-item">
                                            <div className="meta-icon">
                                                <Mail size={16} />
                                            </div>
                                            <div className="meta-content">
                                                <span className="meta-label">E-posta {emails.length > 1 ? index + 1 : ''}</span>
                                                <div className="meta-input-row">
                                                    <input
                                                        type="email"
                                                        className="meta-input"
                                                        value={email}
                                                        onChange={(e) => {
                                                            const newEmails = [...emails];
                                                            newEmails[index] = e.target.value;
                                                            setSelectedContact(prev => ({ ...prev, emails: newEmails, email: newEmails[0] }));
                                                        }}
                                                        onBlur={async () => {
                                                            try {
                                                                const newEmails = emails.filter(e => e.trim());
                                                                await contactAPI.update(currentWorkspace.id, selectedContact.id, {
                                                                    emails: newEmails,
                                                                    email: newEmails[0] || ''
                                                                });
                                                                setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, emails: newEmails, email: newEmails[0] || '' } : c));
                                                            } catch (err) { console.error('Email update error:', err); }
                                                        }}
                                                        placeholder="E-posta adresi..."
                                                    />
                                                    {emails.length > 1 && (
                                                        <button
                                                            className="meta-remove-btn"
                                                            onClick={async () => {
                                                                const newEmails = emails.filter((_, i) => i !== index);
                                                                setSelectedContact(prev => ({ ...prev, emails: newEmails, email: newEmails[0] || '' }));
                                                                try {
                                                                    await contactAPI.update(currentWorkspace.id, selectedContact.id, { emails: newEmails, email: newEmails[0] || '' });
                                                                    setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, emails: newEmails, email: newEmails[0] || '' } : c));
                                                                } catch (err) { console.error('Email remove error:', err); }
                                                            }}
                                                            title="E-postayı sil"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ));
                                })()}
                                <button
                                    className="meta-add-btn"
                                    onClick={() => {
                                        let emails = selectedContact.emails;
                                        if (!Array.isArray(emails)) {
                                            emails = selectedContact.email ? [selectedContact.email] : [''];
                                        }
                                        setSelectedContact(prev => ({ ...prev, emails: [...emails, ''] }));
                                    }}
                                >
                                    <Plus size={14} />
                                    E-posta ekle
                                </button>

                                {selectedContact.location && (
                                    <div className="meta-item">
                                        <div className="meta-icon">
                                            <MapPin size={16} />
                                        </div>
                                        <div className="meta-content">
                                            <span className="meta-label">Konum</span>
                                            <span className="meta-value">{selectedContact.location}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="divider"></div>

                        {/* Notes Section - Compact Design */}
                        <div className="section-container ai-summary-section" style={{ margin: '10px' }}>
                            <div className="section-header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <StickyNote size={18} style={{ color: '#f59e0b' }} />
                                    <h3>NOTLAR</h3>
                                </div>
                            </div>

                            {/* Saved Notes List - Always Visible */}
                            {selectedContact.notes && (() => {
                                try {
                                    const notes = JSON.parse(selectedContact.notes);
                                    if (Array.isArray(notes) && notes.length > 0) {
                                        return (
                                            <div className="saved-notes-list" style={{ marginTop: '12px' }}>
                                                {notes.map((note, index) => {
                                                    const title = note.title || 'Not';
                                                    const content = note.content || '';
                                                    const hasMoreContent = content && content.length > 60;
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
                                                                    disabled={savingNotes}
                                                                    title="Bu notu sil"
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            </div>
                                                            <div className="note-title">{title}</div>
                                                            {!isExpanded ? (
                                                                <div className="note-preview">
                                                                    {content.substring(0, 40)}{hasMoreContent ? ' - Tıklayın' : ''}
                                                                </div>
                                                            ) : (
                                                                <div className="note-content">
                                                                    <p>{content}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    }
                                } catch (e) {
                                    return null;
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
                                        padding: '10px 12px',
                                        marginTop: '12px',
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
                                    {/* Topic/Note Title */}
                                    <div className="topic-card">
                                        <span className="topic-label">NOT BAŞLIĞI</span>
                                        <input
                                            type="text"
                                            className="topic-input"
                                            value={noteTitle}
                                            onChange={(e) => setNoteTitle(e.target.value)}
                                            placeholder="Not başlığı giriniz..."
                                        />
                                    </div>

                                    {/* Note Content */}
                                    <div className="summary-text-card">
                                        <span className="summary-label">İÇERİK</span>
                                        <textarea
                                            className="summary-textarea"
                                            value={contactNotes}
                                            onChange={(e) => setContactNotes(e.target.value)}
                                            placeholder="Not içeriği..."
                                            rows={3}
                                        />
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                            <button
                                                className="save-note-btn"
                                                onClick={() => {
                                                    handleSaveNotes();
                                                    setNotesExpanded(false);
                                                }}
                                                disabled={savingNotes || (!noteTitle.trim() && !contactNotes.trim())}
                                                style={{ flex: 1 }}
                                            >
                                                <Save size={14} />
                                                {savingNotes ? 'Kaydediliyor...' : 'Kaydet'}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setNotesExpanded(false);
                                                    setNoteTitle('');
                                                    setContactNotes('');
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
                                </div>
                            )}
                        </div>

                        {/* Previous Conversations */}
                        <div className="sidebar-conversations">
                            <h3>
                                <MessageSquare size={16} />
                                Sohbet Geçmişi
                            </h3>
                            {selectedContact.conversations && selectedContact.conversations.length > 0 ? (
                                <div className="conversation-list">
                                    {selectedContact.conversations.map(conv => (
                                        <div
                                            key={conv.id}
                                            className="conversation-item"
                                            onClick={() => navigate(`/inbox?conversationId=${conv.id}`)}
                                        >
                                            <div className="conversation-info">
                                                <span className="conversation-name">
                                                    {conv.channel === 'WHATSAPP' ? '📱 WhatsApp' :
                                                        conv.channel === 'FACEBOOK' ? '💬 Facebook' :
                                                            conv.channel === 'INSTAGRAM' ? '📸 Instagram' :
                                                                conv.channel === 'EMAIL' ? '📧 E-posta' :
                                                                    conv.channel === 'FORM' ? '📝 Web Form' : '💬 Sohbet'}
                                                </span>
                                                <span className="conversation-date">{formatDate(conv.lastMessageAt || conv.createdAt)}</span>
                                            </div>
                                            <p className="conversation-preview">
                                                {conv.messages?.[0]?.content?.substring(0, 50) || 'Sohbete gitmek için tıklayın...'}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            ) : selectedContact._count?.conversations > 0 ? (
                                <div className="conversation-list">
                                    <div className="conversation-item" onClick={() => navigate(`/inbox?contactId=${selectedContact.id}`)}>
                                        <div className="conversation-info">
                                            <span className="conversation-name">{getDisplayName(selectedContact)}</span>
                                            <span className="conversation-date">{formatDate(selectedContact.updatedAt)}</span>
                                        </div>
                                        <p className="conversation-preview">{selectedContact._count.conversations} sohbet - Tıklayın</p>
                                    </div>
                                </div>
                            ) : (
                                <p className="no-conversations">Henüz sohbet yok</p>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className="sidebar-actions" style={{
                            padding: '16px',
                            borderTop: '1px solid #e5e7eb',
                            display: 'flex',
                            gap: '8px',
                            marginTop: 'auto'
                        }}>
                            <button
                                className="action-btn edit-btn"
                                onClick={() => handleEditContact(selectedContact)}
                                style={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    padding: '10px',
                                    background: '#f0f9ff',
                                    border: '1px solid #bae6fd',
                                    borderRadius: '8px',
                                    color: '#0284c7',
                                    fontSize: '0.8125rem',
                                    fontWeight: 500,
                                    cursor: 'pointer'
                                }}
                            >
                                <Edit2 size={16} />
                                Düzenle
                            </button>
                            <button
                                className={`action-btn archive-btn ${selectedContact.isArchived ? 'archived' : ''}`}
                                onClick={async () => {
                                    try {
                                        if (selectedContact.isArchived) {
                                            await contactAPI.unarchive(currentWorkspace.id, selectedContact.id);
                                            setSelectedContact(prev => ({ ...prev, isArchived: false }));
                                            setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, isArchived: false } : c));
                                        } else {
                                            await contactAPI.archive(currentWorkspace.id, selectedContact.id);
                                            setSelectedContact(prev => ({ ...prev, isArchived: true }));
                                            if (!showArchived) {
                                                setContacts(prev => prev.filter(c => c.id !== selectedContact.id));
                                                setSelectedContact(null);
                                            } else {
                                                setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, isArchived: true } : c));
                                            }
                                        }
                                    } catch (err) {
                                        console.error('Archive error:', err);
                                    }
                                }}
                                style={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    padding: '10px',
                                    background: selectedContact.isArchived ? '#fef3c7' : '#f3f4f6',
                                    border: `1px solid ${selectedContact.isArchived ? '#fcd34d' : '#d1d5db'}`,
                                    borderRadius: '8px',
                                    color: selectedContact.isArchived ? '#92400e' : '#6b7280',
                                    fontSize: '0.8125rem',
                                    fontWeight: 500,
                                    cursor: 'pointer'
                                }}
                            >
                                {selectedContact.isArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                                {selectedContact.isArchived ? 'Çıkar' : 'Arşivle'}
                            </button>
                            <button
                                className="action-btn delete-btn"
                                onClick={() => {
                                    handleDeleteContact(selectedContact.id);
                                }}
                                style={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    padding: '10px',
                                    background: '#fef2f2',
                                    border: '1px solid #fecaca',
                                    borderRadius: '8px',
                                    color: '#dc2626',
                                    fontSize: '0.8125rem',
                                    fontWeight: 500,
                                    cursor: 'pointer'
                                }}
                            >
                                <Trash2 size={16} />
                                Sil
                            </button>
                        </div>
                    </div>
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
                                        <Tag size={14} /> Grup Adı (Zorunlu)
                                    </label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Örn: Mirnas Müşterileri"
                                        value={importTag}
                                        onChange={(e) => setImportTag(e.target.value)}
                                    />
                                    <small style={{ color: '#94a3b8', fontSize: '11px' }}>Bu grup adı, aktarılan kişileri filtrelemek için kullanılacaktır.</small>
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
