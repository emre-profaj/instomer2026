import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { appointmentAPI, retellAPI, resourceAPI } from '../../services/api';
import { activityAPI } from '../../services/activity.api';
import {
    Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, X,
    Clock, User, Phone, Mail, FileText, Check, AlertCircle, Trash2,
    Layers, Edit2, Building2, List, Grid3X3, Search,
    CalendarClock, Handshake, ListTodo, PhoneCall, Bell
} from 'lucide-react';
import ContactSidebar from '../../components/ContactSidebar/ContactSidebar';
import '../../components/ContactSidebar/ContactSidebar.css';
import { contactAPI, conversationAPI } from '../../services/api';
import QuickActivityModal from './QuickActivityModal';
import './Calendar.css';

const APPOINTMENT_STATUSES = [
    { value: 'SCHEDULED', label: 'Planlandı', color: '#3b82f6' },
    { value: 'COMPLETED', label: 'Tamamlandı', color: '#10b981' },
    { value: 'CANCELLED', label: 'İptal Edildi', color: '#ef4444' },
    { value: 'NO_SHOW', label: 'Gelmedi', color: '#f59e0b' }
];

const RESOURCE_TYPES = [
    { value: 'ROOM', label: 'Room', icon: '🏠' },
    { value: 'PERSON', label: 'Person', icon: '👤' },
    { value: 'EQUIPMENT', label: 'Equipment', icon: '🔧' },
    { value: 'OTHER', label: 'Other', icon: '📦' }
];


const RESOURCE_COLORS = [
    '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

const ACTIVITY_TYPE_CONFIG = {
    CALL: { icon: '📞', color: '#f59e0b', label: 'Arama' },
    MEETING: { icon: '🤝', color: '#3b82f6', label: 'Görüşme' },
    TASK: { icon: '✅', color: '#8b5cf6', label: 'Görev' },
    REMINDER: { icon: '🔔', color: '#06b6d4', label: 'Hatırlatıcı' },
    NOTE: { icon: '📝', color: '#6b7280', label: 'Not' },
    PROPOSAL: { icon: '📋', color: '#10b981', label: 'Teklif' },
    ORDER: { icon: '🛒', color: '#ec4899', label: 'Sipariş' },
    INVOICE: { icon: '🧾', color: '#f97316', label: 'Fatura' },
    PAYMENT: { icon: '💰', color: '#22c55e', label: 'Tahsilat' },
};

const Calendar = () => {
    const { t } = useTranslation();
    const { currentWorkspace, user } = useAuth();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState('month'); // 'month', 'week', 'day'
    const [appointments, setAppointments] = useState([]);
    const [upcomingAppointments, setUpcomingAppointments] = useState([]);
    const [scheduledCalls, setScheduledCalls] = useState([]);
    const [calendarActivities, setCalendarActivities] = useState([]);
    const [layoutMode, setLayoutMode] = useState('grid'); // 'grid' | 'list'
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(true);

    // localStorage anahtar yardımcısı — her workspace/user için ayrı
    const lsKey = (k) => `cal_filter_${currentWorkspace?.id || 'default'}_${user?.id || 'u'}_${k}`;

    const [selectedAgents, setSelectedAgents] = useState(() => {
        try {
            const saved = localStorage.getItem(`cal_filter_${currentWorkspace?.id || 'default'}_${user?.id || 'u'}_agents`);
            return saved ? new Set(JSON.parse(saved)) : new Set();
        } catch { return new Set(); }
    });
    const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
    const [cancellingCallId, setCancellingCallId] = useState(null);

    // Scheduled call edit modal
    const [selectedScheduledCall, setSelectedScheduledCall] = useState(null);
    const [rescheduleDate, setRescheduleDate] = useState('');
    const [rescheduling, setRescheduling] = useState(false);

    // Resource states
    const [resources, setResources] = useState([]);
    const [selectedResource, setSelectedResource] = useState(() => {
        try { return localStorage.getItem(`cal_filter_${currentWorkspace?.id || 'default'}_${user?.id || 'u'}_resource`) || ''; } catch { return ''; }
    });
    const [isResourceModalOpen, setIsResourceModalOpen] = useState(false);
    const [editingResource, setEditingResource] = useState(null);
    const [resourceForm, setResourceForm] = useState({
        name: '', description: '', type: 'ROOM', color: '#8b5cf6',
        availableStart: '09:00', availableEnd: '18:00',
        availableDays: '[1,2,3,4,5]'
    });

    // Modal states
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedAppointment, setSelectedAppointment] = useState(null);
    const [isCreating, setIsCreating] = useState(false);

    // Form states
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        startTime: '',
        endTime: '',
        assignedToId: '',
        resourceId: '',
        contactName: '',
        contactPhone: '',
        contactEmail: '',
        notes: '',
        status: 'SCHEDULED'
    });

    // Conflict state
    const [conflict, setConflict] = useState(null);

    // Toggle for completed appointments
    const [showCompleted, setShowCompleted] = useState(true);

    // Sidebar pagination
    const [sidebarPage, setSidebarPage] = useState(1);
    const SIDEBAR_PAGE_SIZE = 8;

    // Activity type filter (multi-select)
    const [activeFilters, setActiveFilters] = useState(() => {
        try {
            const saved = localStorage.getItem(`cal_filter_${currentWorkspace?.id || 'default'}_${user?.id || 'u'}_activity`);
            return saved ? new Set(JSON.parse(saved)) : new Set(['calls', 'appointments', 'meetings', 'tasks']);
        } catch { return new Set(['calls', 'appointments', 'meetings', 'tasks']); }
    });
    const [statusFilter, setStatusFilter] = useState(() => {
        try { return localStorage.getItem(`cal_filter_${currentWorkspace?.id || 'default'}_${user?.id || 'u'}_status`) || 'all'; } catch { return 'all'; }
    });

    // localStorage'a filtre kaydet
    useEffect(() => {
        try { localStorage.setItem(lsKey('agents'), JSON.stringify([...selectedAgents])); } catch {}
    }, [selectedAgents]);
    useEffect(() => {
        try { localStorage.setItem(lsKey('resource'), selectedResource); } catch {}
    }, [selectedResource]);
    useEffect(() => {
        try { localStorage.setItem(lsKey('activity'), JSON.stringify([...activeFilters])); } catch {}
    }, [activeFilters]);
    useEffect(() => {
        try { localStorage.setItem(lsKey('status'), statusFilter); } catch {}
    }, [statusFilter]);

    // Tüm filtreleri sıfırla
    const clearAllFilters = () => {
        setSelectedAgents(new Set());
        setSelectedResource('');
        setActiveFilters(new Set(['calls', 'appointments', 'meetings', 'tasks']));
        setStatusFilter('all');
        try {
            localStorage.removeItem(lsKey('agents'));
            localStorage.removeItem(lsKey('resource'));
            localStorage.removeItem(lsKey('activity'));
            localStorage.removeItem(lsKey('status'));
        } catch {}
    };

    const hasActiveFilters = selectedAgents.size > 0 || selectedResource !== '' || statusFilter !== 'all';

    const toggleActivityFilter = (key) => {
        setActiveFilters(prev => {
            const allKeys = ['calls', 'appointments', 'meetings', 'tasks'];
            const allActive = allKeys.every(k => prev.has(k));

            if (key === 'all') {
                // "Tümü" tıklandı → hepsini seç
                return new Set(allKeys);
            }

            // Tümü aktifken bireysel butona tıklayınca → sadece o tipi seç
            if (allActive) {
                return new Set([key]);
            }

            // Bireysel modda toggle
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
                // Hiçbiri kalmadıysa → Tümü'ye dön
                if (next.size === 0) return new Set(allKeys);
            } else {
                next.add(key);
            }
            return next;
        });
        setStatusFilter('all');
    };

    // Helper: check if a type is active in multi-select
    const isFilterActive = (key) => {
        if (key === 'all') return ['calls', 'appointments', 'meetings', 'tasks'].every(k => activeFilters.has(k));
        return activeFilters.has(key);
    };

    // Counts per activity type
    const activityCounts = {
        calls: scheduledCalls.length + calendarActivities.filter(a => a.type === 'CALL').length,
        appointments: upcomingAppointments.filter(a => !a.isCompleted).length,
        meetings: calendarActivities.filter(a => a.type === 'MEETING').length,
        tasks: calendarActivities.filter(a => a.type === 'TASK' || a.type === 'REMINDER').length
    };

    // List view states
    const [listFilter, setListFilter] = useState('all'); // 'all', 'appointments', 'calls'
    const [selectedContactId, setSelectedContactId] = useState(null);
    const [listSearchTerm, setListSearchTerm] = useState('');

    // Quick-action kişi seçme modal state
    const [quickActionType, setQuickActionType] = useState(null); // { label, type, subtype }
    const [contactPickerOpen, setContactPickerOpen] = useState(false);
    const [contactSearch, setContactSearch] = useState('');
    const [contactResults, setContactResults] = useState([]);
    const [contactLoading, setContactLoading] = useState(false);
    // Seçilen kişi + action — QuickActivityModal açmak için
    const [quickActionContact, setQuickActionContact] = useState(null); // { id, name, phone, email }
    const [quickActionInitialAction, setQuickActionInitialAction] = useState(null);

    useEffect(() => {
        if (currentWorkspace?.id) {
            loadAppointments();
            loadAgents();
            loadUpcomingAppointments();
            loadScheduledCalls();
            loadResources();
            loadCalendarActivities();
        }
    }, [currentWorkspace, currentDate, selectedAgents, selectedResource]);

    const loadResources = async () => {
        try {
            const response = await resourceAPI.getAll(currentWorkspace.id);
            setResources(response.data.resources || []);
        } catch (error) {
            console.error('Load resources error:', error);
        }
    };

    const loadAppointments = async () => {
        try {
            setLoading(true);
            const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            // End of month should be the last day at 23:59:59
            const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);

            const params = {
                startDate: startOfMonth.toISOString(),
                endDate: endOfMonth.toISOString()
            };

            if (selectedAgents.size > 0) {
                params.assignedToId = [...selectedAgents].join(',');
            }

            if (selectedResource) {
                params.resourceId = selectedResource;
            }

            const response = await appointmentAPI.getAll(currentWorkspace.id, params);
            // Filter out completed appointments
            const activeAppointments = (response.data.appointments || []).filter(apt => apt.status !== 'COMPLETED');
            setAppointments(activeAppointments);
        } catch (error) {
            console.error('Load appointments error:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadAgents = async () => {
        try {
            const response = await appointmentAPI.getAgents(currentWorkspace.id);
            setAgents(response.data.agents || []);
        } catch (error) {
            console.error('Load agents error:', error);
        }
    };

    const loadUpcomingAppointments = async () => {
        try {
            const now = new Date();
            const lastWeek = new Date();
            lastWeek.setDate(lastWeek.getDate() - 7); // Include past week for completed
            const nextWeek = new Date();
            nextWeek.setDate(nextWeek.getDate() + 7);

            const params = {
                startDate: lastWeek.toISOString(),
                endDate: nextWeek.toISOString()
            };

            if (selectedResource) {
                params.resourceId = selectedResource;
            }

            const response = await appointmentAPI.getAll(currentWorkspace.id, params);

            // Process appointments - include all, mark completed ones
            const upcoming = (response.data.appointments || [])
                .map(apt => {
                    // Check if appointment is overdue (past end time but not completed)
                    const endTime = new Date(apt.endTime);
                    const isPast = endTime < now;
                    const isCompleted = apt.status === 'COMPLETED';
                    const isOverdue = isPast && apt.status === 'SCHEDULED';

                    return {
                        ...apt,
                        isCompleted: isCompleted,
                        isOverdue: isOverdue,
                        isPast: isPast,
                        // Override color: green for completed, red for overdue
                        color: isCompleted ? '#10b981' : (isOverdue ? '#ef4444' : apt.color)
                    };
                })
                .sort((a, b) => {
                    // Sort by date: oldest first (ascending)
                    return new Date(a.startTime) - new Date(b.startTime);
                })
                .slice(0, 15); // Show max 15

            setUpcomingAppointments(upcoming);
        } catch (error) {
            console.error('Load upcoming appointments error:', error);
        }
    };

    const loadScheduledCalls = async () => {
        try {
            const response = await retellAPI.getScheduledCalls(currentWorkspace.id);
            setScheduledCalls((response.data.scheduledCalls || []).filter(sc => sc.status === 'PENDING'));
        } catch (e) {
            console.error('Load scheduled calls error:', e);
        }
    };

    const loadCalendarActivities = async () => {
        try {
            // Geciken görevler için 90 gün geriye, gelecek görevler için ay sonuna kadar çek
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
            ninetyDaysAgo.setHours(0, 0, 0, 0);
            const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
            // En az 14 gün sonrasına kadar çek (gelecek görevler sidebar için)
            const twoWeeksLater = new Date();
            twoWeeksLater.setDate(twoWeeksLater.getDate() + 14);
            const dateTo = endOfMonth > twoWeeksLater ? endOfMonth : twoWeeksLater;

            const filters = {
                dateFrom: ninetyDaysAgo.toISOString(),
                dateTo: dateTo.toISOString(),
                status: 'PLANNED,IN_PROGRESS',
                limit: 500
            };
            // Agent filtresi burada UYGULANMIYOR — tüm workspace aktiviteleri çekilir.
            // Grid'de selectedAgents ile filtrelenir, sidebar'da user.id ile filtrelenir.
            const response = await activityAPI.getWorkspaceActivities(currentWorkspace.id, filters);
            console.log('📋 [Calendar] Activities loaded:', response.activities?.length, 'items', response.summary);
            setCalendarActivities(response.activities || []);
        } catch (error) {
            console.error('Load calendar activities error:', error);
        }
    };

    const handleCancelScheduledCall = async (sc) => {
        if (!confirm(`${sc.contactName || sc.toNumber} için planlanmış aramayı iptal etmek istiyor musunuz?`)) return;
        try {
            setCancellingCallId(sc.id);
            await retellAPI.cancelScheduledCall(currentWorkspace.id, sc.id);
            setScheduledCalls(prev => prev.filter(c => c.id !== sc.id));
            setSelectedScheduledCall(null);
        } catch (e) {
            alert('Could not cancel');
        } finally {
            setCancellingCallId(null);
        }
    };

    const openScheduledCallModal = (sc) => {
        setSelectedScheduledCall(sc);
        // Pre-fill with current scheduled time
        const d = new Date(sc.scheduledAt);
        const offset = d.getTimezoneOffset();
        const local = new Date(d.getTime() - (offset * 60 * 1000));
        setRescheduleDate(local.toISOString().slice(0, 16));
    };

    const handleRescheduleCall = async () => {
        if (!selectedScheduledCall || !rescheduleDate) return;
        const newDate = new Date(rescheduleDate);
        if (newDate <= new Date()) {
            alert('Planlanan saat gelecekte olmalı');
            return;
        }
        setRescheduling(true);
        try {
            await retellAPI.updateScheduledCall(currentWorkspace.id, selectedScheduledCall.id, {
                scheduledAt: newDate.toISOString()
            });
            // Update local state
            setScheduledCalls(prev => prev.map(sc =>
                sc.id === selectedScheduledCall.id ? { ...sc, scheduledAt: newDate.toISOString() } : sc
            ));
            setSelectedScheduledCall(null);
        } catch (e) {
            alert(e.response?.data?.error || 'Arama güncellenemedi');
        } finally {
            setRescheduling(false);
        }
    };

    // Filter upcoming appointments based on showCompleted toggle
    const filteredUpcomingAppointments = upcomingAppointments.filter(apt => {
        if (!showCompleted && apt.isCompleted) return false;
        // Activity type filter — hide appointments if not selected
        if (!activeFilters.has('appointments')) return false;
        // Status filter
        if (statusFilter === 'pending' && (apt.isCompleted || apt.isOverdue)) return false;
        if (statusFilter === 'completed' && !apt.isCompleted) return false;
        if (statusFilter === 'overdue' && !apt.isOverdue) return false;
        return true;
    });

    const formatUpcomingDate = (dateStr) => {
        const date = new Date(dateStr);
        const today = new Date();
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        if (date.toDateString() === today.toDateString()) {
            return t('common.today');
        } else if (date.toDateString() === tomorrow.toDateString()) {
            return 'Tomorrow';
        } else {
            return date.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' });
        }
    };

    const handlePrevMonth = () => {
        if (viewMode === 'week') {
            const d = new Date(currentDate);
            d.setDate(d.getDate() - 7);
            setCurrentDate(d);
        } else if (viewMode === 'day') {
            const d = new Date(currentDate);
            d.setDate(d.getDate() - 1);
            setCurrentDate(d);
        } else {
            setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
        }
    };

    const handleNextMonth = () => {
        if (viewMode === 'week') {
            const d = new Date(currentDate);
            d.setDate(d.getDate() + 7);
            setCurrentDate(d);
        } else if (viewMode === 'day') {
            const d = new Date(currentDate);
            d.setDate(d.getDate() + 1);
            setCurrentDate(d);
        } else {
            setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
        }
    };

    const handleToday = () => {
        setCurrentDate(new Date());
    };

    // Returns the 7 days of the week containing currentDate (Sunday-based)
    const getWeekDays = () => {
        const date = new Date(currentDate);
        // ISO week: start from Monday (1). Sunday(0) treated as 7.
        const day = date.getDay() === 0 ? 7 : date.getDay();
        const start = new Date(date);
        start.setDate(date.getDate() - (day - 1));
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            return d;
        });
    };

    // Hours to show in week/day view
    const HOURS = Array.from({ length: 12 }, (_, i) => i + 9); // 09:00 - 20:00

    // Get appointments for a specific hour slot in a specific day
    const getEventsForSlot = (date, hour) => {
        const dateStr = date.toDateString();
        const apts = appointments.filter(apt => {
            const start = new Date(apt.startTime);
            if (start.toDateString() !== dateStr) return false;
            if (start.getHours() !== hour) return false;
            if (!activeFilters.has('appointments')) return false;
            return true;
        });
        const calls = (!selectedResource && activeFilters.has('calls'))
            ? scheduledCalls.filter(sc => {
                const start = new Date(sc.scheduledAt);
                return start.toDateString() === dateStr && start.getHours() === hour;
            })
            : [];
        return { apts, calls };
    };

    // Format header label based on viewMode
    const getHeaderLabel = () => {
        if (viewMode === 'month') {
            return `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
        } else if (viewMode === 'week') {
            const days = getWeekDays();
            const first = days[0];
            const last = days[6];
            if (first.getMonth() === last.getMonth()) {
                return `${first.getDate()} - ${last.getDate()} ${monthNames[first.getMonth()]} ${first.getFullYear()}`;
            }
            return `${first.getDate()} ${monthNames[first.getMonth()]} - ${last.getDate()} ${monthNames[last.getMonth()]} ${last.getFullYear()}`;
        } else {
            return currentDate.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        }
    };

    const getDaysInMonth = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        // ISO week: Monday=0 offset. Sunday(0) → offset 6, Monday(1) → 0, …
        const rawDay = firstDay.getDay();
        const startOffset = rawDay === 0 ? 6 : rawDay - 1;

        const days = [];

        // Previous month days
        const prevMonth = new Date(year, month, 0);
        for (let i = startOffset - 1; i >= 0; i--) {
            days.push({
                date: new Date(year, month - 1, prevMonth.getDate() - i),
                isCurrentMonth: false
            });
        }

        // Current month days
        for (let i = 1; i <= daysInMonth; i++) {
            days.push({
                date: new Date(year, month, i),
                isCurrentMonth: true
            });
        }

        // Next month days
        const remainingDays = 42 - days.length;
        for (let i = 1; i <= remainingDays; i++) {
            days.push({
                date: new Date(year, month + 1, i),
                isCurrentMonth: false
            });
        }

        return days;
    };

    const getAppointmentsForDay = (date) => {
        return appointments.filter(apt => {
            const aptDate = new Date(apt.startTime);
            const aptEndDate = new Date(apt.endTime);
            const now = new Date();
            if (aptDate.toDateString() !== date.toDateString()) return false;
            // Activity type filter
            if (!activeFilters.has('appointments')) return false;
            // Status filter
            const isCompleted = apt.status === 'COMPLETED';
            const isOverdue = aptEndDate < now && apt.status === 'SCHEDULED';
            if (statusFilter === 'pending' && (isCompleted || isOverdue)) return false;
            if (statusFilter === 'completed' && !isCompleted) return false;
            if (statusFilter === 'overdue' && !isOverdue) return false;
            return true;
        });
    };

    const getScheduledCallsForDay = (date) => {
        if (!activeFilters.has('calls')) return [];
        // Status filter for calls: only 'pending' calls exist (scheduled calls are always pending)
        if (statusFilter === 'completed' || statusFilter === 'overdue') return [];
        return scheduledCalls.filter(sc => {
            return new Date(sc.scheduledAt).toDateString() === date.toDateString();
        });
    };

    const getActivitiesForDay = (date) => {
        return calendarActivities.filter(act => {
            if (!act.dueDate) return false;
            const actDate = new Date(act.dueDate);
            if (actDate.toDateString() !== date.toDateString()) return false;
            // Agent filtresi: grid için selectedAgents uygulanır
            if (selectedAgents.size > 0 && act.assignedToId && !selectedAgents.has(act.assignedToId)) return false;
            return true;
        });
    };

    const openCreateModal = (date = null, contact = null) => {
        const now = (date instanceof Date ? date : null) || new Date();
        const startTime = new Date(now);
        startTime.setHours(10, 0, 0, 0);
        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + 30);

        setFormData({
            title: '',
            description: '',
            startTime: formatDateTimeLocal(startTime),
            endTime: formatDateTimeLocal(endTime),
            assignedToId: agents[0]?.id || '',
            resourceId: selectedResource || '',
            contactName: contact?.name || '',
            contactPhone: contact?.phone || contact?.phoneNumber || '',
            contactEmail: contact?.email || '',
            notes: '',
            status: 'SCHEDULED'
        });
        setSelectedAppointment(null);
        setConflict(null);
        setIsModalOpen(true);
    };

    // Hızlı eylem butonuna tıklanınca — kişi seçme modal'ını aç
    const openQuickAction = (actionType) => {
        setQuickActionType(actionType);
        setContactSearch('');
        setContactResults([]);
        setContactPickerOpen(true);
    };

    // Kişi arama
    const searchContacts = async (query) => {
        if (!currentWorkspace?.id) return;
        setContactLoading(true);
        try {
            const res = await contactAPI.getAll(currentWorkspace.id, { search: query, limit: 20 });
            const list = res.data?.contacts || res.data || [];
            setContactResults(Array.isArray(list) ? list : []);
        } catch (e) {
            setContactResults([]);
        } finally {
            setContactLoading(false);
        }
    };

    // Kişi seçilince — QuickActivityModal aç
    const handlePickContact = (contact) => {
        const actionMap = {
            'calls':        'NOTE',
            'calls_plan':   'CALL',
            'appointments': 'MEETING',
            'tasks':        'REMINDER',
        };
        let actionKey = quickActionType?.type || 'calls';
        if (quickActionType?.subtype === 'planned') actionKey = 'calls_plan';
        const initialAction = actionMap[actionKey] || 'NOTE';

        setContactPickerOpen(false);
        setQuickActionType(null);
        setQuickActionInitialAction(initialAction);
        setQuickActionContact(contact); // tüm contact nesnesini sakla
    };

    // Kişisiz devam et
    const handlePickNoContact = () => {
        setContactPickerOpen(false);
        setQuickActionType(null);
        openCreateModal();
    };

    const openEditModal = (appointment) => {
        setFormData({
            title: appointment.title,
            description: appointment.description || '',
            startTime: formatDateTimeLocal(new Date(appointment.startTime)),
            endTime: formatDateTimeLocal(new Date(appointment.endTime)),
            assignedToId: appointment.assignedToId,
            resourceId: appointment.resourceId || '',
            contactName: appointment.contactName || '',
            contactPhone: appointment.contactPhone || '',
            contactEmail: appointment.contactEmail || '',
            notes: appointment.notes || '',
            status: appointment.status || 'SCHEDULED'
        });
        setSelectedAppointment(appointment);
        setConflict(null);
        setIsModalOpen(true);
    };

    const formatDateTimeLocal = (date) => {
        const d = new Date(date);
        const offset = d.getTimezoneOffset();
        const localDate = new Date(d.getTime() - (offset * 60 * 1000));
        return localDate.toISOString().slice(0, 16);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // En az biri seçilmeli
        if (!formData.assignedToId && !formData.resourceId) {
            alert('Lütfen bir Agent veya Kaynak seçiniz.');
            return;
        }

        setIsCreating(true);
        setConflict(null);

        try {
            // Auto-assign color based on status
            const statusColor = APPOINTMENT_STATUSES.find(s => s.value === formData.status)?.color || '#3b82f6';
            const data = {
                ...formData,
                assignedToId: formData.assignedToId || null,
                resourceId: formData.resourceId || null,
                color: statusColor,
                startTime: new Date(formData.startTime).toISOString(),
                endTime: new Date(formData.endTime).toISOString()
            };

            if (selectedAppointment) {
                await appointmentAPI.update(currentWorkspace.id, selectedAppointment.id, data);
            } else {
                await appointmentAPI.create(currentWorkspace.id, data);
            }

            setIsModalOpen(false);
            await loadAppointments();
            await loadUpcomingAppointments();
        } catch (error) {
            console.error('Save appointment error:', error);
            if (error.response?.data?.conflict) {
                setConflict(error.response.data);
            } else {
                alert(error.response?.data?.error || 'Randevu kaydedilemedi');
            }
        } finally {
            setIsCreating(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedAppointment) return;
        if (!confirm('Are you sure you want to delete this appointment?')) return;

        try {
            await appointmentAPI.delete(currentWorkspace.id, selectedAppointment.id);
            setIsModalOpen(false);
            await loadAppointments();
            await loadUpcomingAppointments();
        } catch (error) {
            console.error('Delete appointment error:', error);
            alert('Could not delete appointment');
        }
    };

    const applySuggestion = () => {
        if (!conflict?.suggestion) return;
        setFormData(prev => ({
            ...prev,
            startTime: formatDateTimeLocal(new Date(conflict.suggestion.startTime)),
            endTime: formatDateTimeLocal(new Date(conflict.suggestion.endTime))
        }));
        setConflict(null);
    };

    const formatTime = (dateStr) => {
        return new Date(dateStr).toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const isToday = (date) => {
        const today = new Date();
        return date.toDateString() === today.toDateString();
    };

    // ─── Resource CRUD ───
    const openResourceModal = (resource = null) => {
        if (resource) {
            setEditingResource(resource);
            setResourceForm({
                name: resource.name,
                description: resource.description || '',
                type: resource.type,
                color: resource.color,
                availableStart: resource.availableStart || '09:00',
                availableEnd: resource.availableEnd || '18:00',
                availableDays: resource.availableDays || '[1,2,3,4,5]'
            });
        } else {
            setEditingResource(null);
            setResourceForm({
                name: '', description: '', type: 'ROOM', color: '#8b5cf6',
                availableStart: '09:00', availableEnd: '18:00',
                availableDays: '[1,2,3,4,5]'
            });
        }
        setIsResourceModalOpen(true);
    };

    const handleResourceSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingResource) {
                await resourceAPI.update(currentWorkspace.id, editingResource.id, resourceForm);
            } else {
                await resourceAPI.create(currentWorkspace.id, resourceForm);
            }
            setIsResourceModalOpen(false);
            loadResources();
        } catch (error) {
            console.error('Save resource error:', error);
            alert(error.response?.data?.error || 'Kaynak kaydedilemedi');
        }
    };

    const handleResourceDelete = async (resourceId) => {
        if (!confirm('Are you sure you want to delete this resource?')) return;
        try {
            await resourceAPI.delete(currentWorkspace.id, resourceId);
            if (selectedResource === resourceId) setSelectedResource('');
            loadResources();
        } catch (error) {
            alert('Could not delete resource');
        }
    };

    const monthNames = [
        'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
        'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
    ];

    // Monday-first week order
    const dayNames = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
    // Map getDay() (0=Sun…6=Sat) → Monday-first index for dayNames
    const getDayName = (date) => {
        const d = date.getDay();
        return dayNames[d === 0 ? 6 : d - 1];
    };

    const getResourceName = (resourceId) => {
        const r = resources.find(r => r.id === resourceId);
        return r ? r.name : '';
    };

    return (
        <div className={`calendar-page ${layoutMode === 'list' ? 'calendar-page-list-mode' : ''}`}>
            {/* Full-width Header */}
            <div className="calendar-header">

                {/* SATIR 1: Başlık (sol) + Hızlı eylem butonları (sağ) */}
                <div className="cal-header-row cal-title-row" style={{ justifyContent: 'space-between' }}>
                    <div className="calendar-title">
                        <CalendarIcon size={24} />
                        <h1>Aktiviteler</h1>
                    </div>

                    {/* Hızlı eylem butonları */}
                    <div className="cal-quick-actions">
                        {[
                            { label: 'Arama Notu',        icon: PhoneCall,     type: 'calls',        subtype: 'note'     },
                            { label: 'Arama Planla',      icon: PhoneCall,     type: 'calls',        subtype: 'planned'  },
                            { label: 'Görüşme Planla',    icon: CalendarClock, type: 'appointments', subtype: 'meeting'  },
                            { label: 'Görev Hatırlatıcı', icon: Bell,          type: 'tasks',        subtype: 'reminder' },
                        ].map((btn) => (
                            <button
                                key={btn.label}
                                className="cal-quick-btn"
                                onClick={() => openQuickAction(btn)}
                                title={btn.label}
                            >
                                <btn.icon size={20} />
                                <span>{btn.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* SATIR 2: Agent+Kaynak seçimleri | Aktivite tip filtreleri | Status filtreleri */}
                <div className="cal-header-row cal-filters-main-row">
                    {/* Sol: Agent + Kaynak */}
                    <div className="cal-selects-group">
                        {/* Agent Multi-Select Dropdown */}
                        <div className="agent-multi-select" style={{ position: 'relative' }}>
                            <button
                                className="agent-filter"
                                onClick={() => setAgentDropdownOpen(o => !o)}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', minWidth: 140 }}
                            >
                                <span style={{ flex: 1, textAlign: 'left', fontSize: 13, color: '#374151' }}>
                                    {selectedAgents.size === 0
                                        ? 'Tümü Agents'
                                        : selectedAgents.size === 1
                                            ? agents.find(a => selectedAgents.has(String(a.id)))?.name || 'Agent'
                                            : `${selectedAgents.size} Agent seçili`}
                                </span>
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}>
                                    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </button>
                            {agentDropdownOpen && (
                                <>
                                    <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setAgentDropdownOpen(false)} />
                                    <div className="agent-multi-dropdown">
                                        <div
                                            className={`agent-multi-item ${selectedAgents.size === 0 ? 'selected' : ''}`}
                                            onClick={() => { setSelectedAgents(new Set()); setAgentDropdownOpen(false); }}
                                        >
                                            <span className="agent-multi-check">{selectedAgents.size === 0 ? '✓' : ''}</span>
                                            Tümü Agents
                                        </div>
                                        <div className="agent-multi-divider" />
                                        {agents.map(agent => {
                                            const isChecked = selectedAgents.has(String(agent.id));
                                            return (
                                                <div
                                                    key={agent.id}
                                                    className={`agent-multi-item ${isChecked ? 'selected' : ''}`}
                                                    onClick={() => {
                                                        setSelectedAgents(prev => {
                                                            const next = new Set(prev);
                                                            if (next.has(String(agent.id))) next.delete(String(agent.id));
                                                            else next.add(String(agent.id));
                                                            return next;
                                                        });
                                                    }}
                                                >
                                                    <span className="agent-multi-check">{isChecked ? '✓' : ''}</span>
                                                    {agent.name}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Kaynak seçimi */}
                        <select
                            className="resource-filter"
                            value={selectedResource}
                            onChange={(e) => setSelectedResource(e.target.value)}
                        >
                            <option value="">{t('common.all')} Kaynaklar</option>
                            {resources.map(resource => (
                                <option key={resource.id} value={resource.id}>
                                    {RESOURCE_TYPES.find(t => t.value === resource.type)?.icon} {resource.name}
                                </option>
                            ))}
                        </select>

                        {/* Filtreleri Kaldır */}
                        {hasActiveFilters && (
                            <button className="clear-filters-btn" onClick={clearAllFilters} title="Tüm filtreleri sıfırla">
                                <X size={13} />
                                Filtreleri Kaldır
                            </button>
                        )}
                    </div>

                    {/* Orta+Sağ: Aktivite tip filtreleri + Status filtreleri yan yana */}
                    <div className="cal-activity-filters-group">
                        {/* Aktivite tip filtreleri */}
                        <div className="activity-type-filters">
                            {[
                                { key: 'all',          label: 'Tümü',       icon: Layers,        colorClass: 'cal-all' },
                                { key: 'calls',        label: 'Aramalar',   icon: PhoneCall,     colorClass: 'cal-calls' },
                                { key: 'appointments', label: 'Randevular', icon: CalendarClock, colorClass: 'cal-apts' },
                                { key: 'meetings',     label: 'Görüşmeler', icon: Handshake,     colorClass: 'cal-meetings' },
                                { key: 'tasks',        label: 'Görevler',   icon: ListTodo,      colorClass: 'cal-tasks' },
                            ].map(f => (
                                <div
                                    key={f.key}
                                    className={`quick-stat-card ${isFilterActive(f.key) ? 'quick-stat-active' : ''}`}
                                    onClick={() => toggleActivityFilter(f.key)}
                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                >
                                    <div className={`quick-stat-icon ${f.colorClass}`}><f.icon size={13} /></div>
                                    {f.key !== 'all' && <span className="quick-stat-value">{activityCounts[f.key] || 0}</span>}
                                    <span className="quick-stat-label">{f.label}</span>
                                </div>
                            ))}
                        </div>

                        {/* Status filtreleri */}
                        <div className="status-sub-filters">
                            {[
                                { key: 'all',       label: 'Tümü',       color: '#64748b' },
                                { key: 'pending',   label: 'Bekleyen',   color: '#f59e0b' },
                                { key: 'completed', label: 'Tamamlanan', color: '#10b981' },
                                { key: 'overdue',   label: 'Geciken',    color: '#ef4444' },
                            ].map(s => (
                                <button
                                    key={s.key}
                                    className={`status-filter-btn ${statusFilter === s.key ? 'active' : ''}`}
                                    onClick={() => setStatusFilter(s.key)}
                                    style={statusFilter === s.key ? { '--status-color': s.color } : {}}
                                >
                                    <span className="status-dot" style={{ backgroundColor: s.color }} />
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* SATIR 3: View switcher (solda/takvim hizası) + Tarih nav (sağda) */}
                <div className="cal-header-row cal-actions-row">
                    {/* View switcher */}
                    <div className="view-mode-toggle" style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
                        {[
                            { key: 'month', label: 'Takvim' },
                            { key: 'week',  label: 'Haftalık' },
                            { key: 'day',   label: 'Günlük' },
                        ].map(v => (
                            <button
                                key={v.key}
                                onClick={() => { setViewMode(v.key); setLayoutMode('grid'); }}
                                style={{
                                    padding: '6px 12px', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 500,
                                    background: layoutMode === 'grid' && viewMode === v.key ? 'white' : 'transparent',
                                    color: layoutMode === 'grid' && viewMode === v.key ? '#3b82f6' : '#64748b',
                                    boxShadow: layoutMode === 'grid' && viewMode === v.key ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                                    cursor: 'pointer', transition: 'all 0.2s'
                                }}
                            >{v.label}</button>
                        ))}
                        <button
                            onClick={() => setLayoutMode('list')}
                            style={{
                                padding: '6px 12px', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 500,
                                background: layoutMode === 'list' ? 'white' : 'transparent',
                                color: layoutMode === 'list' ? '#3b82f6' : '#64748b',
                                boxShadow: layoutMode === 'list' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                                cursor: 'pointer', transition: 'all 0.2s'
                            }}
                        >Liste</button>
                    </div>


                    {/* Tarih navigasyonu */}
                    <div className="calendar-header-nav">
                        <div className="nav-buttons">
                            <button onClick={handlePrevMonth}><ChevronLeft size={20} /></button>
                            <button className="today-btn" onClick={handleToday}>{t('calendar.today')}</button>
                            <button onClick={handleNextMonth}><ChevronRight size={20} /></button>
                        </div>
                        <span className="current-month">{getHeaderLabel()}</span>
                    </div>
                </div>

            </div>{/* /calendar-header */}

            {/* Content: Sidebar + Calendar */}
            <div className="calendar-content">
                {/* Upcoming Appointments Sidebar — always visible */}
                <div className="upcoming-sidebar">
                    <div className="upcoming-header">
                        <ListTodo size={18} />
                        <h3>İş Listesi</h3>
                    </div>

                    {(() => {
                        const now = new Date();
                        // Sidebar: bana atanmış VEYA benim oluşturup başkasına atamadığım görevler
                        const myActivities = calendarActivities.filter(act => 
                            act.assignedToId === user?.id || 
                            (!act.assignedToId && act.createdBy === user?.id)
                        );
                        const overdueActivities = myActivities.filter(act => {
                            if (!act.dueDate) return false;
                            return new Date(act.dueDate) < now && (act.status === 'PLANNED' || act.status === 'IN_PROGRESS');
                        }).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

                        const overdueAppointments = upcomingAppointments.filter(apt => {
                            const endTime = new Date(apt.endTime || apt.startTime);
                            return endTime < now && apt.status === 'SCHEDULED' && apt.assignedTo?.id === user?.id;
                        });

                        const allOverdue = [
                            ...overdueActivities.map(a => ({ itemType: 'activity', data: a })),
                            ...overdueAppointments.map(a => ({ itemType: 'appointment', data: a }))
                        ];

                        const futureActivities = myActivities.filter(act => {
                            if (!act.dueDate) return false;
                            return new Date(act.dueDate) >= now && (act.status === 'PLANNED' || act.status === 'IN_PROGRESS');
                        }).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

                        const futureAppointments = upcomingAppointments.filter(apt => {
                            const startTime = new Date(apt.startTime);
                            return startTime >= now && apt.status === 'SCHEDULED' && apt.assignedTo?.id === user?.id;
                        });

                        const allFuture = [
                            ...futureActivities.map(a => ({ itemType: 'activity', data: a })),
                            ...futureAppointments.map(a => ({ itemType: 'appointment', data: a }))
                        ].sort((a, b) => {
                            const dateA = a.itemType === 'activity' ? new Date(a.data.dueDate) : new Date(a.data.startTime);
                            const dateB = b.itemType === 'activity' ? new Date(b.data.dueDate) : new Date(b.data.startTime);
                            return dateA - dateB;
                        });

                        const groupByDate = (items) => {
                            const groups = {};
                            const today = new Date();
                            const tomorrow = new Date(today);
                            tomorrow.setDate(tomorrow.getDate() + 1);
                            items.forEach(item => {
                                const itemDate = item.itemType === 'activity' ? new Date(item.data.dueDate) : new Date(item.data.startTime);
                                let label;
                                if (itemDate.toDateString() === today.toDateString()) label = 'Bugün';
                                else if (itemDate.toDateString() === tomorrow.toDateString()) label = 'Yarın';
                                else label = itemDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
                                if (!groups[label]) groups[label] = [];
                                groups[label].push(item);
                            });
                            return groups;
                        };

                        const futureGroups = groupByDate(allFuture);

                        const renderTodoItem = (item) => {
                            if (item.itemType === 'activity') {
                                const act = item.data;
                                const cfg = ACTIVITY_TYPE_CONFIG[act.type] || { icon: '📋', color: '#6b7280', label: act.type };
                                return (
                                    <div key={act.id} className="todo-item" onClick={() => { if (act.contactId) setSelectedContactId(act.contactId); }}>
                                        <div className="todo-icon" style={{ backgroundColor: cfg.color }}>{cfg.icon}</div>
                                        <div className="todo-content">
                                            <span className="todo-title">{act.title || cfg.label}</span>
                                            {act.contact?.name && <span className="todo-contact">{act.contact.name}</span>}
                                            {act.assignee?.name && <span className="todo-agent">👤 {act.assignee.name}</span>}
                                        </div>
                                        <div className="todo-time">
                                            {act.dueDate ? new Date(act.dueDate).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''}
                                        </div>
                                    </div>
                                );
                            } else {
                                const apt = item.data;
                                return (
                                    <div key={apt.id} className="todo-item" onClick={() => openEditModal(apt)}>
                                        <div className="todo-icon" style={{ backgroundColor: apt.color || '#3b82f6' }}>📅</div>
                                        <div className="todo-content">
                                            <span className="todo-title">{apt.title}</span>
                                            {apt.contactName && <span className="todo-contact">{apt.contactName}</span>}
                                            {apt.assignedTo?.name && <span className="todo-agent">👤 {apt.assignedTo.name}</span>}
                                        </div>
                                        <div className="todo-time">{formatTime(apt.startTime)}</div>
                                    </div>
                                );
                            }
                        };

                        return (
                            <>
                                {allOverdue.length > 0 && (
                                    <div className="todo-section">
                                        <div className="todo-section-header overdue">
                                            <AlertCircle size={14} />
                                            <span>Geciken Görevler ({allOverdue.length})</span>
                                        </div>
                                        <div className="todo-section-list todo-scrollable">
                                            {allOverdue.map(renderTodoItem)}
                                        </div>
                                    </div>
                                )}

                                <div className="todo-section">
                                    <div className="todo-section-header upcoming">
                                        <CalendarClock size={14} />
                                        <span>Gelecek Görevler</span>
                                    </div>
                                    <div className="todo-section-list todo-scrollable">
                                        {Object.keys(futureGroups).length === 0 && allOverdue.length === 0 && (
                                            <div className="upcoming-empty">
                                                <CalendarIcon size={32} />
                                                <p>Planlanmış görev yok</p>
                                            </div>
                                        )}
                                        {Object.entries(futureGroups).map(([dateLabel, items]) => (
                                            <div key={dateLabel} className="todo-date-group">
                                                <div className="todo-date-label">📌 {dateLabel}</div>
                                                {items.map(renderTodoItem)}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        );
                    })()}
                </div>

                {/* Main Calendar */}
                <div className="calendar-main">

                {layoutMode === 'grid' && viewMode === 'week' ? (
                /* ═══════ WEEKLY VIEW ═══════ */
                <div className="calendar-week-view">
                    <div className="week-time-col week-header-row">
                        <div className="week-time-label" />
                        {getWeekDays().map((d, i) => (
                            <div key={i} className={`week-day-header ${isToday(d) ? 'today' : ''}`}>
                                <span className="week-day-name">{getDayName(d)}</span>
                                <span className={`week-day-number ${isToday(d) ? 'today-badge' : ''}`}>{d.getDate()}</span>
                            </div>
                        ))}
                    </div>
                    <div className="week-scroll-body">
                        {HOURS.map(hour => (
                            <div key={hour} className="week-hour-row">
                                <div className="week-time-label">{String(hour).padStart(2,'0')}:00</div>
                                {getWeekDays().map((d, di) => {
                                    const { apts, calls } = getEventsForSlot(d, hour);
                                    return (
                                        <div
                                            key={di}
                                            className={`week-hour-cell ${isToday(d) ? 'today-col' : ''}`}
                                            onClick={() => { const dt = new Date(d); dt.setHours(hour,0,0,0); openCreateModal(dt); }}
                                        >
                                            {apts.map(apt => (
                                                <div key={apt.id} className="week-event"
                                                    style={{ backgroundColor: apt.color || '#3b82f6' }}
                                                    onClick={e => { e.stopPropagation(); openEditModal(apt); }}>
                                                    <span className="week-event-time">{formatTime(apt.startTime)}</span>
                                                    <span className="week-event-title">{apt.title}</span>
                                                </div>
                                            ))}
                                            {calls.map(sc => (
                                                <div key={sc.id} className="week-event"
                                                    style={{ backgroundColor: '#f97316' }}
                                                    onClick={e => { e.stopPropagation(); openScheduledCallModal(sc); }}>
                                                    <span className="week-event-time">📞 {formatTime(sc.scheduledAt)}</span>
                                                    <span className="week-event-title">{sc.contactName || sc.toNumber}</span>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
                ) : layoutMode === 'grid' && viewMode === 'day' ? (
                /* ═══════ DAILY VIEW ═══════ */
                <div className="calendar-day-view">
                    <div className="day-view-header">
                        <span className={`day-view-title ${isToday(currentDate) ? 'today' : ''}`}>
                            {currentDate.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </span>
                    </div>
                    <div className="day-scroll-body">
                        {HOURS.map(hour => {
                            const { apts, calls } = getEventsForSlot(currentDate, hour);
                            return (
                                <div key={hour} className="day-hour-row">
                                    <div className="day-time-label">{String(hour).padStart(2,'0')}:00</div>
                                    <div className="day-hour-cell"
                                        onClick={() => { const dt = new Date(currentDate); dt.setHours(hour,0,0,0); openCreateModal(dt); }}>
                                        {apts.map(apt => (
                                            <div key={apt.id} className="day-event"
                                                style={{ backgroundColor: apt.color || '#3b82f6' }}
                                                onClick={e => { e.stopPropagation(); openEditModal(apt); }}>
                                                <span className="day-event-time">{formatTime(apt.startTime)} - {formatTime(apt.endTime)}</span>
                                                <span className="day-event-title">{apt.title}</span>
                                                {apt.contactName && <span className="day-event-contact">👤 {apt.contactName}</span>}
                                            </div>
                                        ))}
                                        {calls.map(sc => (
                                            <div key={sc.id} className="day-event"
                                                style={{ backgroundColor: '#f97316' }}
                                                onClick={e => { e.stopPropagation(); openScheduledCallModal(sc); }}>
                                                <span className="day-event-time">📞 {formatTime(sc.scheduledAt)}</span>
                                                <span className="day-event-title">{sc.contactName || sc.toNumber}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                ) : layoutMode === 'grid' ? (
                <div className="calendar-grid">
                    <div className="calendar-weekdays">
                        {dayNames.map(day => (
                            <div key={day} className="weekday">{day}</div>
                        ))}
                    </div>

                    <div className="calendar-days">
                        {getDaysInMonth().map((day, index) => (
                            <div
                                key={index}
                                className={`calendar-day ${!day.isCurrentMonth ? 'other-month' : ''} ${isToday(day.date) ? 'today' : ''}`}
                                onClick={() => openCreateModal(day.date)}
                            >
                                <span className="day-number">{day.date.getDate()}</span>
                                <div className="day-appointments">
                                    {getAppointmentsForDay(day.date).slice(0, 3).map(apt => {
                                        const status = APPOINTMENT_STATUSES.find(s => s.value === apt.status);
                                        const aptResource = apt.resourceId ? resources.find(r => r.id === apt.resourceId) : null;
                                        return (
                                            <div
                                                key={apt.id}
                                                className="appointment-pill-wrapper"
                                            >
                                                <div
                                                    className="appointment-pill"
                                                    style={{ backgroundColor: aptResource?.color || apt.color }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openEditModal(apt);
                                                    }}
                                                >
                                                    <span className="apt-time">{formatTime(apt.startTime)}</span>
                                                    <span className="apt-title">{apt.title}</span>
                                                </div>
                                                <div className="appointment-tooltip">
                                                    <div className="tooltip-header" style={{ borderLeftColor: apt.color }}>
                                                        <h4>{apt.title}</h4>
                                                        <span className="tooltip-status" style={{ backgroundColor: status?.color || '#3b82f6' }}>
                                                            {status?.label || t('calendar.save')}
                                                        </span>
                                                    </div>
                                                    <div className="tooltip-body">
                                                        <div className="tooltip-row">
                                                            <Clock size={14} />
                                                            <span>{formatTime(apt.startTime)} - {formatTime(apt.endTime)}</span>
                                                        </div>
                                                        {apt.contactName && (
                                                            <div className="tooltip-row">
                                                                <User size={14} />
                                                                <span>{apt.contactName}</span>
                                                            </div>
                                                        )}
                                                        {apt.contactPhone && (
                                                            <div className="tooltip-row">
                                                                <Phone size={14} />
                                                                <span>{apt.contactPhone}</span>
                                                            </div>
                                                        )}
                                                        {apt.assignedTo && (
                                                            <div className="tooltip-row tooltip-agent">
                                                                <User size={14} />
                                                                <span>Temsilci: {apt.assignedTo.name}</span>
                                                            </div>
                                                        )}
                                                        {apt.createdBy && (
                                                            <div className="tooltip-row" style={{ color: '#8b5cf6' }}>
                                                                <User size={14} />
                                                                <span>Atayan: {apt.createdByBotId ? 'AI Bot' : apt.createdBy.name}</span>
                                                            </div>
                                                        )}
                                                        {apt.doctorName && (
                                                            <div className="tooltip-row" style={{ color: '#059669' }}>
                                                                <User size={14} />
                                                                <span>🩺 Dr. {apt.doctorName}</span>
                                                            </div>
                                                        )}
                                                        {aptResource && (
                                                            <div className="tooltip-row">
                                                                <Building2 size={14} />
                                                                <span>{aptResource.name}</span>
                                                            </div>
                                                        )}
                                                        {apt.notes && (
                                                            <div className="tooltip-notes">
                                                                <FileText size={14} />
                                                                <span>{apt.notes}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {getAppointmentsForDay(day.date).length > 3 && (
                                        <div className="more-appointments">
                                            +{getAppointmentsForDay(day.date).length - 3} daha
                                        </div>
                                    )}
                                    {/* Scheduled Auto-Calls - hide when resource filter is active */}
                                    {!selectedResource && getScheduledCallsForDay(day.date).map(sc => (
                                        <div
                                            key={sc.id}
                                            className="appointment-pill"
                                            style={{ backgroundColor: '#f97316', cursor: 'pointer' }}
                                            title={`Planlanmış Arama: ${sc.contactName || sc.toNumber}\nSaat: ${new Date(sc.scheduledAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}\nDüzenle / İptal et`}
                                            onClick={(e) => { e.stopPropagation(); openScheduledCallModal(sc); }}
                                        >
                                            <span className="apt-time">📞 {new Date(sc.scheduledAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                                            <span className="apt-title">{sc.contactName || sc.toNumber}</span>
                                        </div>
                                    ))}
                                    {/* ContactActivity pills */}
                                    {getActivitiesForDay(day.date).slice(0, 2).map(act => {
                                        const cfg = ACTIVITY_TYPE_CONFIG[act.type] || { icon: '📋', color: '#6b7280', label: act.type };
                                        return (
                                            <div
                                                key={act.id}
                                                className="appointment-pill activity-pill"
                                                style={{ backgroundColor: cfg.color, cursor: 'pointer' }}
                                                title={`${cfg.label}: ${act.title || act.contact?.name || ''}\n${act.dueDate ? new Date(act.dueDate).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (act.contactId) setSelectedContactId(act.contactId);
                                                }}
                                            >
                                                <span className="apt-time">{cfg.icon} {act.dueDate ? new Date(act.dueDate).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                                <span className="apt-title">{act.title || act.contact?.name || cfg.label}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                ) : (
                    /* ═══════ FULL-PAGE LIST VIEW ═══════ */
                    <div className="activities-list-page">
                        {/* Filter Tabs */}
                        <div className="activities-list-tabs">
                            <button
                                className={`activities-tab ${listFilter === 'all' ? 'active' : ''}`}
                                onClick={() => setListFilter('all')}
                            >
                                Tümü
                            </button>
                            <button
                                className={`activities-tab ${listFilter === 'appointments' ? 'active' : ''}`}
                                onClick={() => setListFilter('appointments')}
                            >
                                📅 Randevular
                            </button>
                            <button
                                className={`activities-tab ${listFilter === 'calls' ? 'active' : ''}`}
                                onClick={() => setListFilter('calls')}
                            >
                                📞 Aramalar
                            </button>
                        </div>

                        {/* Search Bar */}
                        <div className="activities-list-search">
                            <Search size={16} />
                            <input
                                type="text"
                                placeholder="Kişi adı, telefon veya başlık ara..."
                                value={listSearchTerm}
                                onChange={(e) => setListSearchTerm(e.target.value)}
                            />
                        </div>

                        {/* Table */}
                        <div className="activities-table-wrapper">
                            <table className="activities-table">
                                <thead>
                                    <tr>
                                        <th>Tür</th>
                                        <th>Tarih / Saat</th>
                                        <th>Başlık</th>
                                        <th>Kişi</th>
                                        <th>Telefon</th>
                                        <th>Temsilci</th>
                                        <th>Kaynak</th>
                                        <th>Durum</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(() => {
                                        // Combine appointments + scheduled calls based on filter
                                        let items = [];

                                        if (listFilter === 'all' || listFilter === 'appointments') {
                                            items.push(...appointments.map(apt => ({ ...apt, _type: 'appointment' })));
                                        }
                                        if (listFilter === 'all' || listFilter === 'calls') {
                                            items.push(...scheduledCalls.map(sc => ({
                                                id: sc.id,
                                                _type: 'call',
                                                title: 'Planlanmış Arama',
                                                contactName: sc.contactName || '',
                                                contactPhone: sc.toNumber || '',
                                                startTime: sc.scheduledAt,
                                                endTime: sc.scheduledAt,
                                                status: sc.status || 'PENDING',
                                                assignedTo: null,
                                                resourceId: null,
                                                color: '#f97316'
                                            })));
                                        }

                                        // Search filter
                                        if (listSearchTerm.trim()) {
                                            const q = listSearchTerm.toLowerCase();
                                            items = items.filter(item =>
                                                (item.title || '').toLowerCase().includes(q) ||
                                                (item.contactName || '').toLowerCase().includes(q) ||
                                                (item.contactPhone || '').includes(q)
                                            );
                                        }

                                        // Sort by date
                                        items.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

                                        if (items.length === 0) {
                                            return (
                                                <tr>
                                                    <td colSpan="8" style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>
                                                        Bu dönemde aktivite bulunmuyor.
                                                    </td>
                                                </tr>
                                            );
                                        }

                                        return items.map(item => {
                                            const status = APPOINTMENT_STATUSES.find(s => s.value === item.status);
                                            const aptResource = item.resourceId ? resources.find(r => r.id === item.resourceId) : null;
                                            const isCall = item._type === 'call';
                                            const isPast = new Date(item.endTime) < new Date();

                                            return (
                                                <tr
                                                    key={item.id}
                                                    className={`activities-row ${isPast && item.status !== 'COMPLETED' ? 'activities-row-overdue' : ''} ${item.status === 'COMPLETED' ? 'activities-row-completed' : ''}`}
                                                    onClick={() => {
                                                        if (isCall) {
                                                            // Open scheduled call modal
                                                            const sc = scheduledCalls.find(s => s.id === item.id);
                                                            if (sc) openScheduledCallModal(sc);
                                                        } else {
                                                            openEditModal(item);
                                                        }
                                                    }}
                                                >
                                                    <td>
                                                        <span className={`activities-type-badge ${isCall ? 'type-call' : 'type-appointment'}`}>
                                                            {isCall ? '📞' : '📅'}
                                                        </span>
                                                    </td>
                                                    <td className="activities-date-cell">
                                                        <div className="activities-date-main">
                                                            {new Date(item.startTime).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                        </div>
                                                        <div className="activities-date-time">
                                                            {formatTime(item.startTime)}
                                                            {!isCall && item.endTime && ` - ${formatTime(item.endTime)}`}
                                                        </div>
                                                    </td>
                                                    <td className="activities-title-cell">
                                                        <span className="activities-title-text">{item.title}</span>
                                                        {item.notes && <span className="activities-notes-preview" title={item.notes}>{item.notes}</span>}
                                                    </td>
                                                    <td>
                                                        {item.contactName ? (
                                                            <button
                                                                className="activities-contact-link"
                                                                onClick={async (e) => {
                                                                    e.stopPropagation();
                                                                    // Search contact by phone or name
                                                                    if (item.contactPhone && currentWorkspace?.id) {
                                                                        try {
                                                                            const res = await contactAPI.getAll(currentWorkspace.id, { search: item.contactPhone, limit: 1 });
                                                                            const contacts = res.data.contacts || [];
                                                                            if (contacts.length > 0) {
                                                                                setSelectedContactId(contacts[0].id);
                                                                                return;
                                                                            }
                                                                        } catch {}
                                                                    }
                                                                    if (item.contactName && currentWorkspace?.id) {
                                                                        try {
                                                                            const res = await contactAPI.getAll(currentWorkspace.id, { search: item.contactName, limit: 1 });
                                                                            const contacts = res.data.contacts || [];
                                                                            if (contacts.length > 0) {
                                                                                setSelectedContactId(contacts[0].id);
                                                                                return;
                                                                            }
                                                                        } catch {}
                                                                    }
                                                                    alert('Bu kişi rehberde bulunamadı.');
                                                                }}
                                                            >
                                                                <User size={13} />
                                                                {item.contactName}
                                                            </button>
                                                        ) : (
                                                            <span className="activities-empty">—</span>
                                                        )}
                                                    </td>
                                                    <td className="activities-phone-cell">
                                                        {item.contactPhone || <span className="activities-empty">—</span>}
                                                    </td>
                                                    <td>
                                                        {item.assignedTo ? (
                                                            <span className="activities-agent-badge">{item.assignedTo.name}</span>
                                                        ) : (
                                                            <span className="activities-empty">—</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {aptResource ? (
                                                            <span className="activities-resource-badge" style={{ borderLeftColor: aptResource.color }}>
                                                                {aptResource.name}
                                                            </span>
                                                        ) : (
                                                            <span className="activities-empty">—</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <span
                                                            className="activities-status-pill"
                                                            style={{
                                                                backgroundColor: (status?.color || (isCall ? '#f97316' : '#94a3b8')) + '18',
                                                                color: status?.color || (isCall ? '#f97316' : '#94a3b8')
                                                            }}
                                                        >
                                                            {isCall ? (item.status === 'PENDING' ? 'Bekliyor' : item.status) : (status?.label || '—')}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        });
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div> {/* End calendar-main */}
            </div> {/* End calendar-content */}

            {/* Appointment Modal */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="apt-modal" onClick={e => e.stopPropagation()}>
                        {/* Dark Header */}
                        <div className="apt-modal-header">
                            <h2>{selectedAppointment ? 'Randevu Düzenle' : 'Yeni Randevu'}</h2>
                            <button className="apt-modal-close" onClick={() => setIsModalOpen(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="apt-modal-body">
                            {/* Conflict Warning */}
                            {conflict && (
                                <div className="conflict-warning">
                                    <AlertCircle size={20} />
                                    <div className="conflict-info">
                                        <strong>{conflict.error}</strong>
                                        <p>Mevcut randevu: {conflict.conflictingAppointment?.title}</p>
                                        {conflict.suggestion && (
                                            <button type="button" className="suggestion-btn" onClick={applySuggestion}>
                                                <Check size={16} />
                                                Öneriyi Uygula: {new Date(conflict.suggestion.startTime).toLocaleString('tr-TR')}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Title */}
                            <div className="apt-field">
                                <input
                                    type="text"
                                    className="apt-title-input"
                                    value={formData.title}
                                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                                    placeholder="Randevu başlığı girin..."
                                    required
                                />
                            </div>

                            {/* Date & Time Row */}
                            <div className="apt-section">
                                <div className="apt-dt-row">
                                    <div className="apt-dt-field">
                                        <span className="apt-dt-label">{t('calendar.start')}</span>
                                        <input
                                            type="datetime-local"
                                            value={formData.startTime}
                                            onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                                            required
                                        />
                                    </div>
                                    <div className="apt-dt-sep">→</div>
                                    <div className="apt-dt-field">
                                        <span className="apt-dt-label">{t('calendar.end')}</span>
                                        <input
                                            type="datetime-local"
                                            value={formData.endTime}
                                            onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                                            required
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Assignment Cards */}
                            <div className="apt-section">
                                <span className="apt-section-label">Atama</span>
                                <div className="apt-assign-row">
                                    <div className={`apt-assign-card ${formData.assignedToId ? 'selected' : ''}`}>
                                        <div className="apt-assign-icon"><User size={16} /></div>
                                        <div className="apt-assign-content">
                                            <span className="apt-assign-type">Temsilci</span>
                                            <select
                                                value={formData.assignedToId}
                                                onChange={(e) => setFormData(prev => ({ ...prev, assignedToId: e.target.value }))}
                                            >
                                                <option value="">{t("channels.selectOption")}</option>
                                                {agents.map(agent => (
                                                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className={`apt-assign-card ${formData.resourceId ? 'selected' : ''}`}>
                                        <div className="apt-assign-icon resource"><Building2 size={16} /></div>
                                        <div className="apt-assign-content">
                                            <span className="apt-assign-type">Kaynak</span>
                                            <select
                                                value={formData.resourceId}
                                                onChange={(e) => setFormData(prev => ({ ...prev, resourceId: e.target.value }))}
                                            >
                                                <option value="">{t("channels.selectOption")}</option>
                                                {resources.map(resource => (
                                                    <option key={resource.id} value={resource.id}>
                                                        {RESOURCE_TYPES.find(t => t.value === resource.type)?.icon} {resource.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Customer Info - Compact */}
                            <div className="apt-section">
                                <span className="apt-section-label">{t('calendar.customerInfo')}</span>
                                <div className="apt-customer-row">
                                    <div className="apt-customer-field">
                                        <User size={14} />
                                        <input
                                            type="text"
                                            value={formData.contactName}
                                            onChange={(e) => setFormData(prev => ({ ...prev, contactName: e.target.value }))}
                                            placeholder="Ad Soyad"
                                        />
                                    </div>
                                    <div className="apt-customer-field">
                                        <Phone size={14} />
                                        <input
                                            type="tel"
                                            value={formData.contactPhone}
                                            onChange={(e) => setFormData(prev => ({ ...prev, contactPhone: e.target.value }))}
                                            placeholder="Telefon"
                                        />
                                    </div>
                                    <div className="apt-customer-field">
                                        <Mail size={14} />
                                        <input
                                            type="email"
                                            value={formData.contactEmail}
                                            onChange={(e) => setFormData(prev => ({ ...prev, contactEmail: e.target.value }))}
                                            placeholder="E-posta"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Status Pills */}
                            <div className="apt-section">
                                <span className="apt-section-label">Durum</span>
                                <div className="apt-status-pills">
                                    {APPOINTMENT_STATUSES.map(status => (
                                        <button
                                            key={status.value}
                                            type="button"
                                            className={`apt-status-pill ${formData.status === status.value ? 'active' : ''}`}
                                            style={formData.status === status.value ? { background: status.color, borderColor: status.color } : {}}
                                            onClick={() => setFormData(prev => ({ ...prev, status: status.value }))}
                                        >
                                            {status.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Notes */}
                            <div className="apt-section">
                                <textarea
                                    className="apt-notes"
                                    value={formData.notes}
                                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                                    placeholder="Not ekle..."
                                    rows={2}
                                />
                            </div>

                            {/* Footer */}
                            <div className="apt-modal-footer">
                                {selectedAppointment && (
                                    <button type="button" className="apt-btn-delete" onClick={handleDelete}>
                                        <Trash2 size={15} /> Sil
                                    </button>
                                )}
                                <div className="apt-footer-right">
                                    <button type="button" className="apt-btn-cancel" onClick={() => setIsModalOpen(false)}>
                                        İptal
                                    </button>
                                    <button type="submit" className="apt-btn-save" disabled={isCreating}>
                                        {isCreating ? 'Kaydediliyor...' : (selectedAppointment ? 'Güncelle' : 'Oluştur')}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Resource Modal */}
            {isResourceModalOpen && (
                <div className="modal-overlay" onClick={() => setIsResourceModalOpen(false)}>
                    <div className="modal-content resource-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingResource ? 'Kaynak Düzenle' : 'Yeni Kaynak'}</h2>
                            <button className="modal-close-btn" onClick={() => setIsResourceModalOpen(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleResourceSubmit} className="modal-body">
                            <div className="form-group">
                                <label><FileText size={16} /> Kaynak Adı *</label>
                                <input
                                    type="text"
                                    value={resourceForm.name}
                                    onChange={(e) => setResourceForm(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="Ör: Oda A, Dr. Ahmet Kaya, Yıkama Bölümü"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>{t('teams.descriptionLabel')}</label>
                                <input
                                    type="text"
                                    value={resourceForm.description}
                                    onChange={(e) => setResourceForm(prev => ({ ...prev, description: e.target.value }))}
                                    placeholder="Kısa açıklama (opsiyonel)"
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label><Layers size={16} /> Tür</label>
                                    <select
                                        className="custom-select"
                                        value={resourceForm.type}
                                        onChange={(e) => setResourceForm(prev => ({ ...prev, type: e.target.value }))}
                                    >
                                        {RESOURCE_TYPES.map(t => (
                                            <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label>Renk</label>
                                    <div className="color-palette">
                                        {RESOURCE_COLORS.map(color => (
                                            <button
                                                key={color}
                                                type="button"
                                                className={`color-swatch ${resourceForm.color === color ? 'selected' : ''}`}
                                                style={{ backgroundColor: color }}
                                                onClick={() => setResourceForm(prev => ({ ...prev, color }))}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="form-divider">Müsaitlik Saatleri</div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label><Clock size={16} /> Başlangıç</label>
                                    <input
                                        type="time"
                                        value={resourceForm.availableStart}
                                        onChange={(e) => setResourceForm(prev => ({ ...prev, availableStart: e.target.value }))}
                                    />
                                </div>
                                <div className="form-group">
                                    <label><Clock size={16} /> Bitiş</label>
                                    <input
                                        type="time"
                                        value={resourceForm.availableEnd}
                                        onChange={(e) => setResourceForm(prev => ({ ...prev, availableEnd: e.target.value }))}
                                    />
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setIsResourceModalOpen(false)}>
                                    İptal
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {editingResource ? 'Güncelle' : 'Oluştur'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Scheduled Call Edit Modal */}
            {selectedScheduledCall && (
                <div className="modal-overlay" onClick={() => setSelectedScheduledCall(null)}>
                    <div className="apt-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
                        <div className="apt-modal-header">
                            <h2>📞 Planlanmış Arama</h2>
                            <button className="apt-modal-close" onClick={() => setSelectedScheduledCall(null)} style={{ color: '#ffffff' }}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="apt-modal-body" style={{ padding: '20px' }}>
                            {/* Contact Info */}
                            <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                    <User size={16} style={{ color: '#64748b' }} />
                                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{selectedScheduledCall.contactName || 'İsimsiz'}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Phone size={16} style={{ color: '#64748b' }} />
                                    <span style={{ color: '#475569' }}>{selectedScheduledCall.toNumber}</span>
                                </div>
                            </div>

                            {/* Current Time */}
                            <div style={{ marginBottom: 16, padding: '10px 16px', background: '#fff7ed', borderRadius: 8, border: '1px solid #fed7aa' }}>
                                <div style={{ fontSize: 12, color: '#9a3412', fontWeight: 600, marginBottom: 4 }}>Mevcut Planlanan Saat</div>
                                <div style={{ fontSize: 15, color: '#c2410c', fontWeight: 600 }}>
                                    <Clock size={14} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
                                    {new Date(selectedScheduledCall.scheduledAt).toLocaleString('tr-TR', {
                                        day: '2-digit', month: '2-digit', year: 'numeric',
                                        hour: '2-digit', minute: '2-digit'
                                    })}
                                </div>
                            </div>

                            {/* Reschedule Date */}
                            <div style={{ marginBottom: 20 }}>
                                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                                    Yeni Tarih / Saat
                                </label>
                                <input
                                    type="datetime-local"
                                    value={rescheduleDate}
                                    onChange={(e) => setRescheduleDate(e.target.value)}
                                    style={{
                                        width: '100%', padding: '10px 12px', border: '1.5px solid #d1d5db',
                                        borderRadius: 8, fontSize: 14, outline: 'none',
                                        transition: 'border-color 0.2s'
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = '#f97316'}
                                    onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                                />
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="apt-modal-footer">
                            <button
                                type="button"
                                className="apt-btn-delete"
                                onClick={() => handleCancelScheduledCall(selectedScheduledCall)}
                                disabled={cancellingCallId === selectedScheduledCall.id}
                            >
                                <Trash2 size={15} />
                                {cancellingCallId === selectedScheduledCall.id ? 'İptal ediliyor...' : 'Aramayı İptal Et'}
                            </button>
                            <div className="apt-footer-right">
                                <button
                                    type="button"
                                    className="apt-btn-cancel"
                                    onClick={() => setSelectedScheduledCall(null)}
                                >
                                    Kapat
                                </button>
                                <button
                                    type="button"
                                    className="apt-btn-save"
                                    onClick={handleRescheduleCall}
                                    disabled={rescheduling}
                                >
                                    {rescheduling ? 'Güncelleniyor...' : 'Saati Güncelle'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ContactSidebar — opens from list view */}
            {selectedContactId && (
                <ContactSidebar
                    contactId={selectedContactId}
                    isOpen={!!selectedContactId}
                    onClose={() => setSelectedContactId(null)}
                    members={agents}
                    teams={[]}
                    isOwner={true}
                    currentUserId={null}
                />
            )}

            {/* ContactSidebar — hızlı eylem butonlarından açılır, initialAction ile */}
            {/* QuickActivityModal — hızlı eylem butonlarından açılır, tam sayfa değil popup */}
            {quickActionContact && quickActionInitialAction && (
                <QuickActivityModal
                    actionType={quickActionInitialAction}
                    contact={quickActionContact}
                    agents={agents}
                    onClose={() => { setQuickActionContact(null); setQuickActionInitialAction(null); }}
                    onSaved={() => { loadAppointments(); loadScheduledCalls(); }}
                />
            )}

            {/* Kişi Seçme Modal — hızlı eylem butonlarından açılır */}
            {contactPickerOpen && (
                <>
                    {/* Backdrop */}
                    <div className="contact-picker-backdrop" onClick={() => setContactPickerOpen(false)} />
                    <div className="contact-picker-modal">
                        <div className="contact-picker-header">
                            <div className="contact-picker-title">
                                {quickActionType?.label && (
                                    <span className="contact-picker-action-label">{quickActionType.label}</span>
                                )}
                                <h3>Kişi Seç</h3>
                            </div>
                            <button className="contact-picker-close" onClick={() => setContactPickerOpen(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        {/* Arama */}
                        <div className="contact-picker-search">
                            <Search size={16} />
                            <input
                                autoFocus
                                type="text"
                                placeholder="Ad, telefon veya e-posta ile ara..."
                                value={contactSearch}
                                onChange={(e) => {
                                    setContactSearch(e.target.value);
                                    if (e.target.value.length >= 1) {
                                        searchContacts(e.target.value);
                                    } else {
                                        setContactResults([]);
                                    }
                                }}
                            />
                            {contactLoading && <div className="contact-picker-spinner" />}
                        </div>

                        {/* Sonuçlar */}
                        <div className="contact-picker-results">
                            {contactResults.length === 0 && contactSearch.length > 0 && !contactLoading && (
                                <div className="contact-picker-empty">Kişi bulunamadı</div>
                            )}
                            {contactResults.length === 0 && contactSearch.length === 0 && (
                                <div className="contact-picker-hint">Aramak için yazmaya başlayın</div>
                            )}
                            {contactResults.map(c => (
                                <button
                                    key={c.id}
                                    className="contact-picker-item"
                                    onClick={() => handlePickContact(c)}
                                >
                                    <div className="contact-picker-avatar">
                                        {(c.name || c.phone || '?')[0].toUpperCase()}
                                    </div>
                                    <div className="contact-picker-info">
                                        <span className="contact-picker-name">{c.name || '—'}</span>
                                        <span className="contact-picker-sub">{c.phone || c.email || ''}</span>
                                    </div>
                                </button>
                            ))}
                        </div>

                        {/* Kişisiz devam */}
                        <div className="contact-picker-footer">
                            <button className="contact-picker-skip" onClick={handlePickNoContact}>
                                Kişi seçmeden devam et
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default Calendar;
