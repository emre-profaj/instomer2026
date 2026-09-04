import { useTranslation } from 'react-i18next';
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { appointmentAPI, retellAPI, resourceAPI, googleCalendarAPI } from '../../services/api';
import { activityAPI } from '../../services/activity.api';
import {
    Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, X,
    Clock, User, Phone, Mail, FileText, Check, AlertCircle, Trash2,
    Layers, Edit2, Building2, List, Grid3X3, Search,
    CalendarClock, Handshake, ListTodo, PhoneCall, Bell, RefreshCw
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

    // Google Calendar integration states
    const [googleStatus, setGoogleStatus] = useState({ isConnected: false, email: null });
    const [googleLoading, setGoogleLoading] = useState(false);
    const [googleNotification, setGoogleNotification] = useState(null);
    const [isSyncing, setIsSyncing] = useState(false);

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
        doctorName: '',
        branch: '',
        contactName: '',
        contactPhone: '',
        contactEmail: '',
        notes: '',
        status: 'SCHEDULED'
    });

    // Group resources by branch (description) or unassigned
    const groupedResources = useMemo(() => {
        const groups = {};
        const unassigned = [];

        resources.forEach(r => {
            const branchName = r.description?.trim();
            if (branchName) {
                if (!groups[branchName]) groups[branchName] = [];
                groups[branchName].push(r);
            } else {
                unassigned.push(r);
            }
        });

        return { groups, unassigned };
    }, [resources]);

    // Conflict state
    const [conflict, setConflict] = useState(null);

    // Day popup — hücrede sığmayan öğeleri gösterir
    const [dayPopup, setDayPopup] = useState(null); // { date, x, y }

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
    const [showCompleted, setShowCompleted] = useState(() => {
        try { return localStorage.getItem(`cal_filter_${currentWorkspace?.id || 'default'}_${user?.id || 'u'}_showCompleted`) === 'true'; } catch { return false; }
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
        try { localStorage.setItem(lsKey('showCompleted'), showCompleted); } catch {}
    }, [showCompleted]);

    // Tüm filtreleri sıfırla
    const clearAllFilters = () => {
        setSelectedAgents(new Set());
        setSelectedResource('');
        setActiveFilters(new Set(['calls', 'appointments', 'meetings', 'tasks']));
        setShowCompleted(false);
        try {
            localStorage.removeItem(lsKey('agents'));
            localStorage.removeItem(lsKey('resource'));
            localStorage.removeItem(lsKey('activity'));
            localStorage.removeItem(lsKey('showCompleted'));
        } catch {}
    };

    const hasActiveFilters = selectedAgents.size > 0 || selectedResource !== '';

    const toggleActivityFilter = (key) => {
        setActiveFilters(prev => {
            const allKeys = ['calls', 'appointments', 'meetings', 'tasks'];
            const allActive = allKeys.every(k => prev.has(k));

            if (key === 'all') {
                return new Set(allKeys);
            }

            if (allActive) {
                return new Set([key]);
            }

            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
                if (next.size === 0) return new Set(allKeys);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    // Helper: check if a type is active in multi-select
    const isFilterActive = (key) => {
        if (key === 'all') return ['calls', 'appointments', 'meetings', 'tasks'].every(k => activeFilters.has(k));
        return activeFilters.has(key);
    };


    // List view states
    const [listFilter, setListFilter] = useState('all'); // 'all', 'appointments', 'calls'
    const [selectedContactId, setSelectedContactId] = useState(null);
    const [listSearchTerm, setListSearchTerm] = useState('');
    const [selectedActivity, setSelectedActivity] = useState(null); // Aktivite detay popup

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
    }, [currentWorkspace, currentDate, selectedAgents, selectedResource, googleStatus.isConnected]);

    // Google Calendar Status Fetch (Çalışma Alanı Bazlı)
    const fetchGoogleStatus = async () => {
        if (!currentWorkspace?.id) {
            setGoogleStatus({ isConnected: false, isWorkspaceConfigured: false, email: null });
            return;
        }
        try {
            const res = await googleCalendarAPI.getStatus(currentWorkspace.id);
            setGoogleStatus(res.data || { isConnected: false, isWorkspaceConfigured: false, email: null });
        } catch (err) {
            console.error('Google Calendar status error:', err);
            setGoogleStatus({ isConnected: false, isWorkspaceConfigured: false, email: null });
        }
    };

    // Workspace değiştiğinde veya sayfa yüklendiğinde o workspace'in Google Takvim durumunu getir
    useEffect(() => {
        if (currentWorkspace?.id) {
            fetchGoogleStatus();
        }
    }, [currentWorkspace?.id]);

    // Google Calendar OAuth redirect parametrelerini yakala
    useEffect(() => {
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.get('google_connected') === 'true') {
                const email = params.get('email');
                setGoogleNotification({
                    type: 'success',
                    message: email ? `Google Takvim başarıyla bağlandı (${email})` : 'Google Takvim başarıyla bağlandı!'
                });
                if (currentWorkspace?.id) {
                    fetchGoogleStatus();
                }
                window.history.replaceState({}, document.title, window.location.pathname);
            } else if (params.get('google_error')) {
                const errorMsg = params.get('google_error');
                setGoogleNotification({
                    type: 'error',
                    message: `Google Takvim bağlantı hatası: ${errorMsg}`
                });
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        } catch (e) {
            console.error('OAuth param parsing error:', e);
        }
    }, []);

    // Auto-dismiss Google notification banner after 6 seconds
    useEffect(() => {
        if (googleNotification) {
            const timer = setTimeout(() => setGoogleNotification(null), 6000);
            return () => clearTimeout(timer);
        }
    }, [googleNotification]);

    const handleGoogleConnect = async () => {
        if (!currentWorkspace?.id) return;
        if (googleStatus.isWorkspaceConfigured === false) {
            alert('Bu çalışma alanı için Google Takvim entegrasyonu henüz yapılandırılmamış. Lütfen Yönetici olarak sol menüden "Kanallar" sayfasına gidip Google Takvim Client ID ve Secret bilgilerini tanımlayın.');
            return;
        }
        try {
            setGoogleLoading(true);
            const res = await googleCalendarAPI.getAuthUrl(currentWorkspace.id);
            if (res.data?.url) {
                window.location.href = res.data.url;
            } else {
                alert('Google yetkilendirme adresi alınamadı.');
            }
        } catch (err) {
            console.error('Google Calendar connect error:', err);
            alert(err.response?.data?.error || 'Google Takvim bağlantısı başlatılamadı.');
        } finally {
            setGoogleLoading(false);
        }
    };

    const handleGoogleDisconnect = async (targetEmail = null) => {
        const confirmMsg = targetEmail
            ? `${targetEmail} Google Takvim hesabının bağlantısını kesmek istediğinizden emin misiniz?`
            : 'Google Takvim bağlantınızı bu çalışma alanı için kesmek istediğinizden emin misiniz?';
        if (!window.confirm(confirmMsg)) return;
        try {
            setGoogleLoading(true);
            await googleCalendarAPI.disconnect(currentWorkspace?.id, targetEmail);
            await fetchGoogleStatus();
            await loadAppointments(true);
            setGoogleNotification({
                type: 'success',
                message: targetEmail ? `${targetEmail} bağlantısı kesildi.` : 'Google Takvim bağlantısı bu çalışma alanı için kesildi.'
            });
        } catch (err) {
            console.error('Google Calendar disconnect error:', err);
            alert(err.response?.data?.error || 'Bağlantı kesilirken hata oluştu.');
        } finally {
            setGoogleLoading(false);
        }
    };

    const loadResources = async () => {
        try {
            const response = await resourceAPI.getAll(currentWorkspace.id);
            setResources(response.data.resources || []);
        } catch (error) {
            console.error('Load resources error:', error);
        }
    };

    const loadAppointments = async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const days = getDaysInMonth();
            const startOfGrid = days[0].date;
            const endOfGrid = new Date(days[days.length - 1].date);
            endOfGrid.setHours(23, 59, 59, 999);

            const params = {
                startDate: startOfGrid.toISOString(),
                endDate: endOfGrid.toISOString()
            };

            if (selectedAgents.size > 0) {
                params.assignedToId = [...selectedAgents].join(',');
            }

            if (selectedResource) {
                params.resourceId = selectedResource;
            }

            const response = await appointmentAPI.getAll(currentWorkspace.id, params);
            let aptList = response.data.appointments || [];

            // Google Takvim'deki etkinlikleri de çekip birleştir (her zaman dene)
            try {
                const googleParams = {
                    startDate: params.startDate,
                    endDate: params.endDate
                };
                if (selectedAgents.size > 0) {
                    googleParams.assignedToId = [...selectedAgents].join(',');
                }
                const googleRes = await googleCalendarAPI.getEvents(currentWorkspace.id, googleParams);
                const googleEvents = googleRes.data?.events || [];
                if (googleEvents.length > 0) {
                    aptList = [...aptList, ...googleEvents];
                }
                if (googleRes.data?.tokenExpired) {
                    setGoogleStatus(prev => ({ ...prev, isConnected: false, isExpired: true }));
                }
            } catch (gErr) {
                console.warn('Google Calendar events fetch error:', gErr);
            }

            setAppointments(aptList);
        } catch (error) {
            console.error('Load appointments error:', error);
        } finally {
            if (!silent) setLoading(false);
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

            if (selectedAgents.size > 0) {
                params.assignedToId = [...selectedAgents].join(',');
            }

            if (selectedResource) {
                params.resourceId = selectedResource;
            }

            const response = await appointmentAPI.getAll(currentWorkspace.id, params);
            let rawList = response.data.appointments || [];

            try {
                const googleParams = {
                    startDate: params.startDate,
                    endDate: params.endDate
                };
                if (selectedAgents.size > 0) {
                    googleParams.assignedToId = [...selectedAgents].join(',');
                }
                const googleRes = await googleCalendarAPI.getEvents(currentWorkspace.id, googleParams);
                const gEvents = googleRes.data?.events || [];
                if (gEvents.length > 0) {
                    rawList = [...rawList, ...gEvents];
                }
            } catch (e) {
                console.warn('Upcoming Google events error:', e);
            }

            // Process appointments - include all, mark completed ones
            const upcoming = rawList
                .map(apt => {
                    const endTime = new Date(apt.endTime || apt.startTime);
                    const isPast = endTime < now;
                    const isCompleted = apt.status === 'COMPLETED';
                    const isOverdue = !apt.isGoogleEvent && isPast && apt.status === 'SCHEDULED';

                    return {
                        ...apt,
                        isCompleted: isCompleted,
                        isOverdue: isOverdue,
                        isPast: isPast,
                        // Override color: blue for Google, green for completed, red for overdue
                        color: apt.isGoogleEvent ? '#4285F4' : (isCompleted ? '#10b981' : (isOverdue ? '#ef4444' : apt.color))
                    };
                })
                .sort((a, b) => {
                    return new Date(a.startTime) - new Date(b.startTime);
                })
                .slice(0, 15);

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
                // Limit yok — tüm aktiviteleri çek
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

    const handleManualSync = async () => {
        if (isSyncing || !currentWorkspace?.id) return;
        setIsSyncing(true);
        try {
            await Promise.all([
                loadAppointments(true),
                loadUpcomingAppointments(),
                loadScheduledCalls(),
                loadCalendarActivities(),
                fetchGoogleStatus()
            ]);
        } catch (syncErr) {
            console.error('Manual sync error:', syncErr);
        } finally {
            setTimeout(() => setIsSyncing(false), 500);
        }
    };

    // Otomatik Canlı Senkronizasyon (Sekmeye dönüldüğünde, WebSocket tetiklendiğinde veya 30 sn'de bir)
    useEffect(() => {
        if (!currentWorkspace?.id) return;

        let lastTrigger = 0;
        const triggerSilentRefresh = () => {
            const now = Date.now();
            // 3 saniye aralıkla throttle (spam engelleme)
            if (now - lastTrigger < 3000) return;
            lastTrigger = now;
            loadAppointments(true);
            loadUpcomingAppointments();
            loadScheduledCalls();
            loadCalendarActivities();
        };

        // 1. Sekmeye geri dönüldüğünde (ör. Google Takvim sekmesinden veya telefon uygulamasından dönünce)
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                triggerSilentRefresh();
            }
        };
        const handleFocus = () => {
            triggerSilentRefresh();
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibility);

        // 2. WebSocket ile gelen randevu ve aktivite bildirimleri
        const handleSocketAppointment = () => triggerSilentRefresh();
        const handleSocketActivity = () => triggerSilentRefresh();
        window.addEventListener('websocket:appointment_updated', handleSocketAppointment);
        window.addEventListener('websocket:activity_updated', handleSocketActivity);

        // 3. Ekranda açık beklerken her 30 saniyede bir otomatik sessiz yenileme (Google Takvim dahil)
        const pollInterval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                triggerSilentRefresh();
            }
        }, 30000);

        return () => {
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('websocket:appointment_updated', handleSocketAppointment);
            window.removeEventListener('websocket:activity_updated', handleSocketActivity);
            clearInterval(pollInterval);
        };
    }, [currentWorkspace?.id, currentDate, selectedAgents, selectedResource]);

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

    const filteredUpcomingAppointments = upcomingAppointments.filter(apt => {
        if (!showCompleted && apt.isCompleted) return false;
        if (apt.isGoogleEvent) {
            if (!activeFilters.has('appointments') && !activeFilters.has('meetings')) return false;
        } else if (!activeFilters.has('appointments')) {
            return false;
        }
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
            if (apt.isGoogleEvent) {
                if (!activeFilters.has('appointments') && !activeFilters.has('meetings')) return false;
            } else if (!activeFilters.has('appointments')) {
                return false;
            }
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
            return `${first.getDate()} ${monthNames[first.getMonth()]} - ${last.getDate()} ${monthNames[last.getMonth()]} ${first.getFullYear()}`;
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

    const getAppointmentsForDay = (date, ignoreTypeFilter = false) => {
        return appointments.filter(apt => {
            const aptDate = new Date(apt.startTime);
            if (aptDate.toDateString() !== date.toDateString()) return false;
            if (!ignoreTypeFilter) {
                if (apt.isGoogleEvent) {
                    if (!activeFilters.has('appointments') && !activeFilters.has('meetings')) return false;
                } else if (!activeFilters.has('appointments')) {
                    return false;
                }
            }
            // Tamamlanan filtresi
            if (apt.status === 'COMPLETED' && !showCompleted) return false;
            return true;
        });
    };

    const getScheduledCallsForDay = (date, ignoreTypeFilter = false) => {
        if (!ignoreTypeFilter && !activeFilters.has('calls')) return [];
        return scheduledCalls.filter(sc => {
            return new Date(sc.scheduledAt).toDateString() === date.toDateString();
        });
    };

    const getActivitiesForDay = (date, ignoreTypeFilter = false) => {
        // Activity type → filter key mapping
        const typeToFilterKey = { 'CALL': 'calls', 'NOTE': 'calls', 'MEETING': 'meetings', 'TASK': 'tasks', 'REMINDER': 'tasks' };

        return calendarActivities.filter(act => {
            // Tarih: dueDate yoksa createdAt kullan
            const actDate = new Date(act.dueDate || act.createdAt);
            if (actDate.toDateString() !== date.toDateString()) return false;
            // Aktivite tipi filtresi
            const filterKey = typeToFilterKey[act.type] || 'tasks';
            if (!ignoreTypeFilter && !activeFilters.has(filterKey)) return false;
            // Tamamlanan filtresi
            if ((act.status === 'COMPLETED' || act.status === 'DONE') && !showCompleted) return false;
            // Agent filtresi
            if (selectedAgents.size > 0 && act.assignedToId && !selectedAgents.has(act.assignedToId)) return false;
            return true;
        });
    };

    // Counts per activity type - ekranda görüntülenen takvim günlerine göre HESAPLANIR (Reel Sayılar)
    const activityCounts = useMemo(() => {
        const days = getDaysInMonth();
        let calls = 0;
        let appointmentsCount = 0;
        let meetings = 0;
        let tasks = 0;

        days.forEach(day => {
            // 1. Calls count
            const scForDay = getScheduledCallsForDay(day.date, true);
            const actCallsForDay = getActivitiesForDay(day.date, true).filter(a => a.type === 'CALL' || a.type === 'NOTE');
            calls += scForDay.length + actCallsForDay.length;

            // 2. Appointments count
            const aptForDay = getAppointmentsForDay(day.date, true);
            appointmentsCount += aptForDay.length;

            // 3. Meetings count
            const meetForDay = getActivitiesForDay(day.date, true).filter(a => a.type === 'MEETING');
            meetings += meetForDay.length;

            // 4. Tasks count
            const taskForDay = getActivitiesForDay(day.date, true).filter(a => a.type === 'TASK' || a.type === 'REMINDER');
            tasks += taskForDay.length;
        });

        return {
            calls,
            appointments: appointmentsCount,
            meetings,
            tasks
        };
    }, [appointments, calendarActivities, scheduledCalls, currentDate, showCompleted, selectedAgents, selectedResource]);

    const openCreateModal = (date = null, contact = null) => {
        const now = (date instanceof Date ? date : null) || new Date();
        const startTime = new Date(now);
        startTime.setHours(10, 0, 0, 0);
        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + 30);

        const initialRes = selectedResource ? resources.find(r => r.id === selectedResource) : null;

        setFormData({
            title: contact?.name ? `${contact.name} — Görüşme` : '',
            description: '',
            startTime: formatDateTimeLocal(startTime),
            endTime: formatDateTimeLocal(endTime),
            assignedToId: user?.id || agents[0]?.id || '',
            resourceId: selectedResource || '',
            doctorName: initialRes?.type === 'PERSON' ? initialRes.name : '',
            branch: initialRes?.description || '',
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

    // Kişi seçilince
    const handlePickContact = (contact) => {
        if (quickActionType?.type === 'appointments') {
            setContactPickerOpen(false);
            setQuickActionType(null);
            openCreateModal(null, contact);
            return;
        }

        const actionMap = {
            'calls':        'NOTE',
            'calls_plan':   'CALL',
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
        // En uygun doktor / kaynak eşleştirmesi
        let resolvedResId = appointment.resourceId || '';
        let resolvedDoctor = appointment.doctorName || '';
        let resolvedBranch = appointment.branch || '';

        // 1. Eğer resourceId yoksa ama doctorName varsa isme göre eşleştir
        if (!resolvedResId && resolvedDoctor) {
            const docMatch = resources.find(r => 
                r.name.toLowerCase().trim() === resolvedDoctor.toLowerCase().trim() ||
                r.name.toLowerCase().includes(resolvedDoctor.toLowerCase()) ||
                resolvedDoctor.toLowerCase().includes(r.name.toLowerCase())
            );
            if (docMatch) {
                resolvedResId = docMatch.id;
                resolvedDoctor = docMatch.name;
                if (!resolvedBranch && docMatch.description) resolvedBranch = docMatch.description;
            }
        }

        // 2. Eğer hâlâ resourceId yoksa branşa göre (description) eşleştir
        if (!resolvedResId) {
            const titleBranch = appointment.branch || appointment.title?.split('—')[0]?.trim();
            if (titleBranch) {
                const branchMatch = resources.find(r => 
                    r.description && (
                        r.description.toLowerCase().trim() === titleBranch.toLowerCase().trim() ||
                        r.description.toLowerCase().includes(titleBranch.toLowerCase()) ||
                        titleBranch.toLowerCase().includes(r.description.toLowerCase())
                    )
                );
                if (branchMatch) {
                    resolvedResId = branchMatch.id;
                    if (!resolvedDoctor && branchMatch.type === 'PERSON') resolvedDoctor = branchMatch.name;
                    if (!resolvedBranch) resolvedBranch = branchMatch.description;
                }
            }
        }

        // 3. Eğer resourceId varsa ama doctorName boşsa resource'dan al
        if (resolvedResId && !resolvedDoctor) {
            const foundRes = resources.find(r => r.id === resolvedResId);
            if (foundRes) {
                if (foundRes.type === 'PERSON') resolvedDoctor = foundRes.name;
                if (!resolvedBranch && foundRes.description) resolvedBranch = foundRes.description;
            }
        }

        setFormData({
            title: appointment.title,
            description: appointment.description || '',
            startTime: formatDateTimeLocal(new Date(appointment.startTime)),
            endTime: formatDateTimeLocal(new Date(appointment.endTime)),
            assignedToId: appointment.assignedToId || '',
            resourceId: resolvedResId,
            doctorName: resolvedDoctor,
            branch: resolvedBranch,
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
            const selectedRes = resources.find(r => r.id === formData.resourceId);

            const data = {
                ...formData,
                assignedToId: formData.assignedToId || null,
                resourceId: formData.resourceId || null,
                doctorName: selectedRes?.type === 'PERSON' ? selectedRes.name : (formData.doctorName || null),
                branch: selectedRes?.description || (formData.branch || null),
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
        if (!confirm('Bu randevuyu silmek istediğinizden emin misiniz?')) return;

        const aptId = selectedAppointment.id;
        try {
            // Optimistic update: Anında ekrandan kaldır ve modalı kapat
            setAppointments(prev => prev.filter(a => a.id !== aptId));
            setUpcomingAppointments(prev => prev.filter(a => a.id !== aptId));
            setIsModalOpen(false);
            setSelectedAppointment(null);

            await appointmentAPI.delete(currentWorkspace.id, aptId);
            await loadAppointments(true);
            await loadUpcomingAppointments();
        } catch (error) {
            console.error('Delete appointment error:', error);
            alert('Randevu silinemedi');
            loadAppointments(true);
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

                    {/* Hızlı eylem butonları ve Google Takvim */}
                    <div className="cal-quick-actions">
                        {/* Google Calendar Bağlantı Butonları / Rozetleri */}
                        {googleStatus.accounts && googleStatus.accounts.length > 0 ? (
                            <div className="google-cals-group">
                                {googleStatus.accounts.map((acc) => (
                                    <div
                                        key={acc.id || acc.email}
                                        className={`google-cal-pill connected ${acc.isExpired ? 'expired' : ''}`}
                                        title={acc.isExpired ? `Oturum süresi dolmuş: ${acc.email}. Yeniden bağlayın.` : `Bağlı Google Hesabı: ${acc.email}`}
                                        style={acc.isExpired ? { background: '#fffbeb', borderColor: '#f59e0b', color: '#b45309' } : {}}
                                    >
                                        <svg className="google-icon" viewBox="0 0 24 24" width="14" height="14">
                                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                                        </svg>
                                        <span className="google-cal-email">{acc.email}</span>
                                        {acc.isExpired && <span style={{ fontSize: '10px', fontWeight: 600, marginLeft: 2 }}>⚠️</span>}
                                        <button
                                            type="button"
                                            className="google-cal-disconnect-btn"
                                            onClick={() => handleGoogleDisconnect(acc.email)}
                                            title={`${acc.email} Hesabının Bağlantısını Kes`}
                                            disabled={googleLoading}
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    className="google-cal-add-btn"
                                    onClick={handleGoogleConnect}
                                    title="Başka bir Google Takvim Hesabı Ekle"
                                    disabled={googleLoading}
                                >
                                    <span>+ Hesap Ekle</span>
                                </button>
                            </div>
                        ) : googleStatus.isConnected && googleStatus.email ? (
                            <div className="google-cals-group">
                                <div className="google-cal-pill connected" title={`Bağlı Google Hesabı: ${googleStatus.email}`}>
                                    <svg className="google-icon" viewBox="0 0 24 24" width="14" height="14">
                                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                                    </svg>
                                    <span className="google-cal-email">{googleStatus.email}</span>
                                    <button
                                        type="button"
                                        className="google-cal-disconnect-btn"
                                        onClick={() => handleGoogleDisconnect(googleStatus.email)}
                                        title="Google Takvim Bağlantısını Kes"
                                        disabled={googleLoading}
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    className="google-cal-add-btn"
                                    onClick={handleGoogleConnect}
                                    title="Başka bir Google Takvim Hesabı Ekle"
                                    disabled={googleLoading}
                                >
                                    <span>+ Hesap Ekle</span>
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                className="google-cal-connect-btn"
                                onClick={handleGoogleConnect}
                                title="Kendi Google Takviminizi Bağlayın"
                                disabled={googleLoading}
                            >
                                <svg className="google-icon" viewBox="0 0 24 24" width="15" height="15">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                                </svg>
                                <span>{googleLoading ? 'Bağlanıyor...' : 'Google Takvimi Bağla'}</span>
                            </button>
                        )}

                        <div className="cal-quick-divider" />

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

                {/* Google Calendar Bildirim Bannerı */}
                {googleNotification && (
                    <div className={`google-cal-banner ${googleNotification.type}`}>
                        <span>{googleNotification.message}</span>
                        <button type="button" onClick={() => setGoogleNotification(null)}>✕</button>
                    </div>
                )}

                {/* SATIR 2: Agent+Kaynak seçimleri | Aktivite tip filtreleri | Status filtreleri */}
                <div className="cal-header-row cal-filters-main-row">
                    {/* Sol: Agent + Kaynak */}
                    <div className="cal-selects-group">
                        {/* Agent Multi-Select Dropdown — Takım bazlı */}
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
                            {agentDropdownOpen && (() => {
                                // Takım bazlı gruplama
                                const teamGroups = {};
                                const noTeam = [];
                                agents.forEach(agent => {
                                    if (agent.teamName) {
                                        if (!teamGroups[agent.teamName]) teamGroups[agent.teamName] = [];
                                        teamGroups[agent.teamName].push(agent);
                                    } else {
                                        noTeam.push(agent);
                                    }
                                });
                                const allChecked = selectedAgents.size === 0; // Tümü = hiçbir filtre yok = hepsi görünür

                                return (
                                    <>
                                        <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setAgentDropdownOpen(false)} />
                                        <div className="agent-multi-dropdown" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                            {/* Tümü */}
                                            <div
                                                className={`agent-multi-item ${allChecked ? 'selected' : ''}`}
                                                onClick={() => { setSelectedAgents(new Set()); }}
                                            >
                                                <span className="agent-multi-check">{allChecked ? '☑' : '☐'}</span>
                                                <strong>Tümü Agents</strong>
                                            </div>
                                            <div className="agent-multi-divider" />

                                            {/* Takım grupları */}
                                            {Object.entries(teamGroups).map(([teamName, teamAgents]) => {
                                                const teamAgentIds = teamAgents.map(a => String(a.id));
                                                const allTeamSelected = allChecked || teamAgentIds.every(id => selectedAgents.has(id));
                                                const someTeamSelected = !allTeamSelected && teamAgentIds.some(id => selectedAgents.has(id));

                                                return (
                                                    <div key={teamName}>
                                                        {/* Takım başlığı — tıklanabilir */}
                                                        <div
                                                            className={`agent-multi-item agent-team-header ${allTeamSelected ? 'selected' : ''}`}
                                                            onClick={() => {
                                                                setSelectedAgents(prev => {
                                                                    const next = new Set(prev);
                                                                    if (allTeamSelected && !allChecked) {
                                                                        teamAgentIds.forEach(id => next.delete(id));
                                                                    } else {
                                                                        teamAgentIds.forEach(id => next.add(id));
                                                                    }
                                                                    return next;
                                                                });
                                                            }}
                                                        >
                                                            <span className="agent-multi-check">
                                                                {allTeamSelected ? '☑' : someTeamSelected ? '▣' : '☐'}
                                                            </span>
                                                            <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                                👥 {teamName}
                                                            </span>
                                                        </div>
                                                        {/* Takım üyeleri */}
                                                        {teamAgents.map(agent => {
                                                            const isChecked = allChecked || selectedAgents.has(String(agent.id));
                                                            return (
                                                                <div
                                                                    key={agent.id}
                                                                    className={`agent-multi-item agent-team-member ${isChecked ? 'selected' : ''}`}
                                                                    onClick={() => {
                                                                        setSelectedAgents(prev => {
                                                                            const next = new Set(prev);
                                                                            if (allChecked) {
                                                                                // Tümü'den bireysel seçime geç: herkesi ekle, sonra bunu çıkar
                                                                                agents.forEach(a => next.add(String(a.id)));
                                                                                next.delete(String(agent.id));
                                                                            } else if (next.has(String(agent.id))) {
                                                                                next.delete(String(agent.id));
                                                                                if (next.size === 0) return new Set(); // Tümü'ye dön
                                                                            } else {
                                                                                next.add(String(agent.id));
                                                                                // Hepsi seçiliyse → Tümü'ye dön
                                                                                if (next.size === agents.length) return new Set();
                                                                            }
                                                                            return next;
                                                                        });
                                                                    }}
                                                                >
                                                                    <span className="agent-multi-check">{isChecked ? '☑' : '☐'}</span>
                                                                    <span style={{ paddingLeft: 12 }}>{agent.name}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            })}

                                            {/* Takımsız agentlar */}
                                            {noTeam.length > 0 && (
                                                <>
                                                    {Object.keys(teamGroups).length > 0 && <div className="agent-multi-divider" />}
                                                    <div className="agent-multi-item agent-team-header" style={{ opacity: 0.6 }}>
                                                        <span className="agent-multi-check" />
                                                        <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' }}>
                                                            Takımsız
                                                        </span>
                                                    </div>
                                                    {noTeam.map(agent => {
                                                        const isChecked = allChecked || selectedAgents.has(String(agent.id));
                                                        return (
                                                            <div
                                                                key={agent.id}
                                                                className={`agent-multi-item agent-team-member ${isChecked ? 'selected' : ''}`}
                                                                onClick={() => {
                                                                    setSelectedAgents(prev => {
                                                                        const next = new Set(prev);
                                                                        if (allChecked) {
                                                                            agents.forEach(a => next.add(String(a.id)));
                                                                            next.delete(String(agent.id));
                                                                        } else if (next.has(String(agent.id))) {
                                                                            next.delete(String(agent.id));
                                                                            if (next.size === 0) return new Set();
                                                                        } else {
                                                                            next.add(String(agent.id));
                                                                            if (next.size === agents.length) return new Set();
                                                                        }
                                                                        return next;
                                                                    });
                                                                }}
                                                            >
                                                                <span className="agent-multi-check">{isChecked ? '☑' : '☐'}</span>
                                                                <span style={{ paddingLeft: 12 }}>{agent.name}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </>
                                            )}
                                        </div>
                                    </>
                                );
                            })()}
                        </div>

                        {/* Kaynak / Doktor seçimi */}
                        <select
                            className="resource-filter"
                            value={selectedResource}
                            onChange={(e) => setSelectedResource(e.target.value)}
                        >
                            <option value="">{t('common.all')} Kaynaklar / Doktorlar</option>
                            {Object.entries(groupedResources.groups).map(([branchName, branchDocs]) => (
                                <optgroup key={branchName} label={`🏥 ${branchName}`}>
                                    {branchDocs.map(resource => (
                                        <option key={resource.id} value={resource.id}>
                                            {resource.type === 'PERSON' ? '👨‍⚕️' : (RESOURCE_TYPES.find(t => t.value === resource.type)?.icon || '📦')} {resource.name}
                                        </option>
                                    ))}
                                </optgroup>
                            ))}
                            {groupedResources.unassigned.length > 0 && (
                                <optgroup label={Object.keys(groupedResources.groups).length > 0 ? "Diğer Kaynaklar" : "Kaynaklar"}>
                                    {groupedResources.unassigned.map(resource => (
                                        <option key={resource.id} value={resource.id}>
                                            {RESOURCE_TYPES.find(t => t.value === resource.type)?.icon || '📦'} {resource.name}
                                        </option>
                                    ))}
                                </optgroup>
                            )}
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
                        {/* Aktivite tip butonları */}
                        <div className="cal-type-filters">
                            {[
                                { key: 'calls',        icon: <PhoneCall size={13} />, label: 'Aramalar',    count: activityCounts.calls,        color: '#f59e0b' },
                                { key: 'appointments', icon: <CalendarClock size={13} />, label: 'Randevular',  count: activityCounts.appointments,  color: '#3b82f6' },
                                { key: 'meetings',     icon: <Handshake size={13} />, label: 'Görüşmeler',  count: activityCounts.meetings,      color: '#10b981' },
                                { key: 'tasks',        icon: <ListTodo size={13} />,  label: 'Görevler',    count: activityCounts.tasks,         color: '#8b5cf6' },
                            ].map(f => (
                                <button
                                    key={f.key}
                                    className={`cal-type-btn${isFilterActive(f.key) ? ' active' : ''}`}
                                    style={{ '--type-color': f.color }}
                                    onClick={() => toggleActivityFilter(f.key)}
                                >
                                    {f.icon}
                                    <span>{f.label}</span>
                                    {f.count > 0 && <span className="cal-type-count">{f.count}</span>}
                                </button>
                            ))}
                        </div>

                        {/* Tamamlananları göster toggle */}
                        <label className="show-completed-toggle" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#64748b', userSelect: 'none' }}>
                            <div
                                className={`toggle-switch ${showCompleted ? 'active' : ''}`}
                                onClick={() => setShowCompleted(p => !p)}
                                style={{
                                    width: 36, height: 20, borderRadius: 10,
                                    background: showCompleted ? '#10b981' : '#cbd5e1',
                                    position: 'relative', transition: 'background 0.2s', flexShrink: 0
                                }}
                            >
                                <div style={{
                                    width: 16, height: 16, borderRadius: '50%', background: 'white',
                                    position: 'absolute', top: 2,
                                    left: showCompleted ? 18 : 2,
                                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                                }} />
                            </div>
                            <span>Tamamlananları göster</span>
                        </label>
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
                        // Sidebar: seçili agent'lar varsa onların, yoksa tüm takımın işlerini göster
                        const targetActivities = calendarActivities.filter(act => {
                            if (selectedAgents.size > 0) {
                                if (act.assignedToId && !selectedAgents.has(act.assignedToId)) return false;
                            }
                            return act.status === 'PLANNED' || act.status === 'IN_PROGRESS';
                        });

                        const overdueActivities = targetActivities.filter(act => {
                            const actDate = new Date(act.dueDate || act.createdAt);
                            return actDate < now;
                        }).sort((a, b) => new Date(a.dueDate || a.createdAt) - new Date(b.dueDate || b.createdAt));

                        const targetAppointments = appointments.filter(apt => {
                            if (selectedAgents.size > 0) {
                                if (apt.assignedToId && !selectedAgents.has(apt.assignedToId)) return false;
                            }
                            return apt.status === 'SCHEDULED';
                        });

                        const overdueAppointments = targetAppointments.filter(apt => {
                            const endTime = new Date(apt.endTime || apt.startTime);
                            return endTime < now;
                        });

                        const allOverdue = [
                            ...overdueActivities.map(a => ({ itemType: 'activity', data: a })),
                            ...overdueAppointments.map(a => ({ itemType: 'appointment', data: a }))
                        ];

                        const futureActivities = targetActivities.filter(act => {
                            const actDate = new Date(act.dueDate || act.createdAt);
                            return actDate >= now;
                        }).sort((a, b) => new Date(a.dueDate || a.createdAt) - new Date(b.dueDate || b.createdAt));

                        const futureAppointments = targetAppointments.filter(apt => {
                            const startTime = new Date(apt.startTime);
                            return startTime >= now;
                        });

                        const allFuture = [
                            ...futureActivities.map(a => ({ itemType: 'activity', data: a })),
                            ...futureAppointments.map(a => ({ itemType: 'appointment', data: a }))
                        ].sort((a, b) => {
                            const dateA = a.itemType === 'activity' ? new Date(a.data.dueDate || a.data.createdAt) : new Date(a.data.startTime);
                            const dateB = b.itemType === 'activity' ? new Date(b.data.dueDate || b.data.createdAt) : new Date(b.data.startTime);
                            return dateA - dateB;
                        });

                        const groupByDate = (items) => {
                            const groups = {};
                            const today = new Date();
                            const tomorrow = new Date(today);
                            tomorrow.setDate(tomorrow.getDate() + 1);
                            items.forEach(item => {
                                const itemDate = item.itemType === 'activity' ? new Date(item.data.dueDate || item.data.createdAt) : new Date(item.data.startTime);
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
                                    <div key={act.id} className="todo-item" onClick={() => setSelectedActivity(act)}>
                                        <div className="todo-icon" style={{ backgroundColor: cfg.color }}>{cfg.icon}</div>
                                        <div className="todo-content">
                                            <span className="todo-title">{act.title || cfg.label}</span>
                                            {act.contact?.name && <span className="todo-contact">{act.contact.name}</span>}
                                            {act.assignee?.name && <span className="todo-agent">👤 {act.assignee.name}</span>}
                                        </div>
                                        <div className="todo-time">
                                            {(() => {
                                                const d = new Date(act.dueDate || act.createdAt);
                                                const today = new Date();
                                                if (d.toDateString() === today.toDateString()) {
                                                    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
                                                }
                                                return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
                                            })()}
                                            {act.completedAt && (
                                                <span style={{ fontSize: 10, color: '#10b981', display: 'block' }}>
                                                    ✅ Yapıldı: {new Date(act.completedAt).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            } else {
                                const apt = item.data;
                                return (
                                    <div key={apt.id} className="todo-item" onClick={() => openEditModal(apt)}>
                                        <div className="todo-icon" style={{ backgroundColor: apt.isGoogleEvent ? '#4285F4' : (apt.color || '#3b82f6') }}>
                                            {apt.isGoogleEvent ? '🇬' : '📅'}
                                        </div>
                                        <div className="todo-content">
                                            <span className="todo-title">{apt.title}</span>
                                            {apt.contactName && <span className="todo-contact">{apt.contactName}</span>}
                                            {apt.assignedTo?.name && <span className="todo-agent">👤 {apt.assignedTo.name}</span>}
                                            {apt.isGoogleEvent && <span className="todo-agent" style={{ color: '#4285F4', fontWeight: 500 }}>Google Takvim</span>}
                                            {apt.doctorName && <span className="todo-agent" style={{ color: '#059669', fontWeight: 500 }}>🩺 {apt.doctorName}</span>}
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
                    {/* View tabs + Date nav — grid alanının üstünde */}
                    <div className="cal-grid-topbar">
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
                        <div className="calendar-header-nav">
                            <div className="nav-buttons">
                                <button onClick={handlePrevMonth}><ChevronLeft size={20} /></button>
                                <button className="today-btn" onClick={handleToday}>{t('calendar.today')}</button>
                                <button onClick={handleNextMonth}><ChevronRight size={20} /></button>
                            </div>
                            <span className="current-month">{getHeaderLabel()}</span>
                            <button
                                type="button"
                                className={`cal-sync-btn ${isSyncing ? 'spinning' : ''}`}
                                onClick={handleManualSync}
                                disabled={isSyncing}
                                title="Takvimi ve Google Takvim etkinliklerini hemen senkronize et"
                            >
                                <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                                <span>{isSyncing ? 'Yenileniyor...' : 'Yenile'}</span>
                            </button>
                        </div>
                    </div>

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
                                                    style={{ backgroundColor: apt.isGoogleEvent ? '#4285F4' : (apt.color || '#3b82f6') }}
                                                    onClick={e => { e.stopPropagation(); openEditModal(apt); }}>
                                                    <span className="week-event-time">{apt.isGoogleEvent ? '🇬 ' : ''}{formatTime(apt.startTime)}</span>
                                                    <span className="week-event-title">{apt.title}{apt.isGoogleEvent ? ` (${apt.googleEmail || apt.assignedTo?.name || 'Google'})` : ''}</span>
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
                                                style={{ backgroundColor: apt.isGoogleEvent ? '#4285F4' : (apt.color || '#3b82f6') }}
                                                onClick={e => { e.stopPropagation(); openEditModal(apt); }}>
                                                <span className="day-event-time">{apt.isGoogleEvent ? '🇬 ' : ''}{formatTime(apt.startTime)} - {formatTime(apt.endTime)}</span>
                                                <span className="day-event-title">{apt.title}{apt.isGoogleEvent ? ` (${apt.googleEmail || apt.assignedTo?.name || 'Google'})` : ''}</span>
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
                                    {(() => {
                                        const MAX_VISIBLE = viewMode === 'month' ? 3 : viewMode === 'week' ? 5 : 10;
                                        const now = new Date();
                                        const allItems = [];

                                        // 1. Randevular
                                        getAppointmentsForDay(day.date).forEach(apt => {
                                            const status = APPOINTMENT_STATUSES.find(s => s.value === apt.status);
                                            const aptResource = apt.resourceId ? resources.find(r => r.id === apt.resourceId) : null;
                                            const aptEnd = new Date(apt.endTime || apt.startTime);
                                            const isOverdue = !apt.isGoogleEvent && aptEnd < now && apt.status === 'SCHEDULED';
                                            const isCompleted = apt.status === 'COMPLETED';
                                            allItems.push({
                                                id: `apt-${apt.id}`, sortTime: new Date(apt.startTime),
                                                render: (
                                                    <div key={`apt-${apt.id}`} className="appointment-pill-wrapper">
                                                        <div
                                                            className={`appointment-pill ${isOverdue ? 'pill-overdue' : ''} ${isCompleted ? 'pill-completed' : ''} ${apt.isGoogleEvent ? 'pill-google' : ''}`}
                                                            style={{ backgroundColor: apt.isGoogleEvent ? '#4285F4' : (aptResource?.color || apt.color) }}
                                                            onClick={(e) => { e.stopPropagation(); openEditModal(apt); }}
                                                        >
                                                            {apt.isGoogleEvent && <span style={{ marginRight: 3, fontSize: 11 }}>🇬</span>}
                                                            {isOverdue && <span style={{ marginRight: 2 }}>⚠️</span>}
                                                            {isCompleted && <span style={{ marginRight: 2 }}>✓</span>}
                                                            <span className="apt-time">{formatTime(apt.startTime)}</span>
                                                            <span className="apt-title">{apt.title}{apt.isGoogleEvent ? ` (${apt.googleEmail || apt.assignedTo?.name || 'Google'})` : ''}</span>
                                                        </div>
                                                        <div className="appointment-tooltip">
                                                            <div className="tooltip-header" style={{ borderLeftColor: apt.isGoogleEvent ? '#4285F4' : apt.color }}>
                                                                <h4>{apt.isGoogleEvent ? `🇬 ${apt.title}${apt.googleEmail ? ` (${apt.googleEmail})` : ''}` : apt.title}</h4>
                                                                <span className="tooltip-status" style={{ backgroundColor: apt.isGoogleEvent ? '#4285F4' : (status?.color || '#3b82f6') }}>
                                                                    {apt.isGoogleEvent ? 'Google Takvim' : (status?.label || 'Kayıtlı')}
                                                                </span>
                                                            </div>
                                                            <div className="tooltip-body">
                                                                <div className="tooltip-row"><Clock size={14} /><span>{formatTime(apt.startTime)} - {formatTime(apt.endTime)}</span></div>
                                                                {apt.contactName && <div className="tooltip-row"><User size={14} /><span>{apt.contactName}</span></div>}
                                                                {apt.location && <div className="tooltip-row"><Building2 size={14} /><span>{apt.location}</span></div>}
                                                                {apt.contactPhone && <div className="tooltip-row"><Phone size={14} /><span>{apt.contactPhone}</span></div>}
                                                                {apt.assignedTo && <div className="tooltip-row tooltip-agent"><User size={14} /><span>Temsilci: {apt.assignedTo.name}</span></div>}
                                                                {apt.createdBy && <div className="tooltip-row" style={{ color: '#8b5cf6' }}><User size={14} /><span>Atayan: {apt.createdByBotId ? 'AI Bot' : apt.createdBy.name}</span></div>}
                                                                {apt.doctorName && <div className="tooltip-row" style={{ color: '#059669' }}><User size={14} /><span>🩺 Dr. {apt.doctorName}</span></div>}
                                                                {aptResource && <div className="tooltip-row"><Building2 size={14} /><span>{aptResource.name}</span></div>}
                                                                {apt.notes && <div className="tooltip-notes"><FileText size={14} /><span>{apt.notes}</span></div>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            });
                                        });

                                        // 2. Planlanmış aramalar
                                        if (!selectedResource) {
                                            getScheduledCallsForDay(day.date).forEach(sc => {
                                                allItems.push({
                                                    id: `sc-${sc.id}`, sortTime: new Date(sc.scheduledAt),
                                                    render: (
                                                        <div key={`sc-${sc.id}`} className="appointment-pill" style={{ backgroundColor: '#f97316', cursor: 'pointer' }}
                                                            onClick={(e) => { e.stopPropagation(); openScheduledCallModal(sc); }}
                                                        >
                                                            <span className="apt-time">📞 {new Date(sc.scheduledAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                                                            <span className="apt-title">{sc.contactName || sc.toNumber}</span>
                                                        </div>
                                                    )
                                                });
                                            });
                                        }

                                        // 3. Aktiviteler
                                        getActivitiesForDay(day.date).forEach(act => {
                                            const cfg = ACTIVITY_TYPE_CONFIG[act.type] || { icon: '📋', color: '#6b7280', label: act.type };
                                            const actDate = new Date(act.dueDate || act.createdAt);
                                            const isOverdue = actDate < now && act.status !== 'COMPLETED' && act.status !== 'DONE';
                                            const isCompleted = act.status === 'COMPLETED' || act.status === 'DONE';
                                            allItems.push({
                                                id: `act-${act.id}`, sortTime: actDate,
                                                render: (
                                                    <div key={`act-${act.id}`}
                                                        className={`appointment-pill activity-pill ${isOverdue ? 'pill-overdue' : ''} ${isCompleted ? 'pill-completed' : ''}`}
                                                        style={{ backgroundColor: cfg.color, cursor: 'pointer' }}
                                                        onClick={(e) => { e.stopPropagation(); setSelectedActivity(act); }}
                                                    >
                                                        {isOverdue && <span style={{ marginRight: 2, fontSize: 10 }}>⚠️</span>}
                                                        {isCompleted && <span style={{ marginRight: 2, fontSize: 10 }}>✓</span>}
                                                        <span className="apt-time">{cfg.icon} {act.dueDate ? new Date(act.dueDate).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                                        <span className="apt-title">{act.title || act.contact?.name || cfg.label}</span>
                                                    </div>
                                                )
                                            });
                                        });

                                        allItems.sort((a, b) => a.sortTime - b.sortTime);
                                        const visible = allItems.slice(0, MAX_VISIBLE);
                                        const hiddenCount = allItems.length - MAX_VISIBLE;

                                        return (
                                            <>
                                                {visible.map(item => item.render)}
                                                {hiddenCount > 0 && (
                                                    <div className="more-appointments" onClick={(e) => {
                                                        e.stopPropagation();
                                                        const rect = e.currentTarget.closest('.calendar-day').getBoundingClientRect();
                                                        setDayPopup({ date: day.date, x: rect.left, y: rect.bottom });
                                                    }}>
                                                        +{hiddenCount} daha
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                ) : (
                    /* ═══════ FULL-PAGE LIST VIEW ═══════ */
                    <div className="activities-list-page">
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
                                                        <span className={`activities-type-badge ${isCall ? 'type-call' : item.isGoogleEvent ? 'type-google' : 'type-appointment'}`}
                                                            style={item.isGoogleEvent ? { background: '#e8f0fe', color: '#1a73e8' } : {}}
                                                        >
                                                            {isCall ? '📞' : item.isGoogleEvent ? '🇬' : '📅'}
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
                                                                {aptResource.type === 'PERSON' ? `👨‍⚕️ ${aptResource.name}` : aptResource.name}
                                                            </span>
                                                        ) : item.doctorName ? (
                                                            <span className="activities-resource-badge" style={{ borderLeftColor: '#10b981' }}>
                                                                👨‍⚕️ {item.doctorName}
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
                        {/* Header */}
                        <div className="apt-modal-header" style={selectedAppointment?.isGoogleEvent ? { background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)' } : {}}>
                            <h2>{selectedAppointment?.isGoogleEvent ? '🇬 Google Takvim Etkinliği' : (selectedAppointment ? 'Randevu Düzenle' : 'Yeni Randevu')}</h2>
                            <button className="apt-modal-close" onClick={() => setIsModalOpen(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        {selectedAppointment?.isGoogleEvent ? (
                            /* Google Event Detail View */
                            <div className="apt-modal-body google-event-view">
                                <div className="google-event-card">
                                    <h3 className="google-event-title">{selectedAppointment.title}</h3>
                                    <div className="google-event-meta">
                                        <div className="google-event-meta-item">
                                            <Clock size={16} />
                                            <span>
                                                {selectedAppointment.isAllDay
                                                    ? `${new Date(selectedAppointment.startTime).toLocaleDateString('tr-TR')} (Tüm Gün)`
                                                    : `${new Date(selectedAppointment.startTime).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })} — ${new Date(selectedAppointment.endTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`
                                                }
                                            </span>
                                        </div>

                                        {selectedAppointment.assignedTo?.name && (
                                            <div className="google-event-meta-item">
                                                <User size={16} />
                                                <span>Temsilci: <strong>{selectedAppointment.assignedTo.name}</strong></span>
                                            </div>
                                        )}

                                        {selectedAppointment.googleEmail && (
                                            <div className="google-event-meta-item">
                                                <Mail size={16} />
                                                <span>Google Takvim: <strong>{selectedAppointment.googleEmail}</strong></span>
                                            </div>
                                        )}

                                        {selectedAppointment.contactName && (
                                            <div className="google-event-meta-item">
                                                <Mail size={16} />
                                                <span>Katılımcılar: <strong>{selectedAppointment.contactName}</strong></span>
                                            </div>
                                        )}

                                        {selectedAppointment.location && (
                                            <div className="google-event-meta-item">
                                                <Building2 size={16} />
                                                <span>Konum: {selectedAppointment.location}</span>
                                            </div>
                                        )}
                                    </div>

                                    {(selectedAppointment.description || selectedAppointment.notes) && (
                                        <div className="google-event-notes-box">
                                            <span className="google-event-notes-label">Açıklama / Detay:</span>
                                            <p>{selectedAppointment.description || selectedAppointment.notes}</p>
                                        </div>
                                    )}

                                    {selectedAppointment.googleMeetLink && (
                                        <div style={{ marginTop: 16 }}>
                                            <a
                                                href={selectedAppointment.googleMeetLink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="apt-google-meet-btn"
                                                style={{ fontSize: 13, padding: '8px 14px', borderRadius: 8 }}
                                            >
                                                📹 Google Meet Görüşmesine Katıl
                                            </a>
                                        </div>
                                    )}
                                </div>

                                <div className="google-event-notice">
                                    ℹ️ Bu etkinlik Google Takvim'den senkronize edilmiştir. Randevu saatlerinizin dolu görünmesini sağlar ve çakışmaları önler.
                                </div>

                                <div className="apt-modal-footer">
                                    <button type="button" className="apt-btn-cancel" onClick={() => setIsModalOpen(false)}>
                                        Kapat
                                    </button>
                                    {selectedAppointment.htmlLink && (
                                        <a
                                            href={selectedAppointment.htmlLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="apt-btn-save"
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', background: '#4285F4' }}
                                        >
                                            Google Takvim'de Aç ↗
                                        </a>
                                    )}
                                </div>
                            </div>
                        ) : (
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

                                {/* Google Calendar Sync Info / Google Meet Link */}
                                {selectedAppointment && (selectedAppointment.googleEventId || selectedAppointment.googleMeetLink) && (
                                    <div className="apt-google-info-box">
                                        <div className="apt-google-info-header">
                                            <svg viewBox="0 0 24 24" width="16" height="16">
                                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                                            </svg>
                                            <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>
                                                Google Takvim ile Senkronize
                                            </span>
                                        </div>
                                        {selectedAppointment.googleMeetLink && (
                                            <a
                                                href={selectedAppointment.googleMeetLink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="apt-google-meet-btn"
                                            >
                                                📹 Google Meet'e Katıl
                                            </a>
                                        )}
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
                                            <div className="apt-assign-icon resource">
                                                {(() => {
                                                    const currentRes = resources.find(r => r.id === formData.resourceId);
                                                    if (currentRes?.type === 'PERSON') return <User size={16} />;
                                                    return <Building2 size={16} />;
                                                })()}
                                            </div>
                                            <div className="apt-assign-content">
                                                <span className="apt-assign-type">
                                                    {resources.some(r => r.type === 'PERSON') ? 'Doktor / Kaynak' : 'Kaynak'}
                                                </span>
                                                <select
                                                    value={formData.resourceId}
                                                    onChange={(e) => {
                                                        const resId = e.target.value;
                                                        const selectedRes = resources.find(r => r.id === resId);
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            resourceId: resId,
                                                            doctorName: selectedRes ? selectedRes.name : '',
                                                            branch: selectedRes?.description || prev.branch
                                                        }));
                                                    }}
                                                >
                                                    <option value="">{t("channels.selectOption")}</option>
                                                    {Object.entries(groupedResources.groups).map(([branchName, branchDocs]) => (
                                                        <optgroup key={branchName} label={`🏥 ${branchName}`}>
                                                            {branchDocs.map(resource => (
                                                                <option key={resource.id} value={resource.id}>
                                                                    {resource.type === 'PERSON' ? '👨‍⚕️' : (RESOURCE_TYPES.find(t => t.value === resource.type)?.icon || '📦')} {resource.name}
                                                                </option>
                                                            ))}
                                                        </optgroup>
                                                    ))}
                                                    {groupedResources.unassigned.length > 0 && (
                                                        <optgroup label={Object.keys(groupedResources.groups).length > 0 ? "Diğer Kaynaklar" : "Kaynaklar"}>
                                                            {groupedResources.unassigned.map(resource => (
                                                                <option key={resource.id} value={resource.id}>
                                                                    {RESOURCE_TYPES.find(t => t.value === resource.type)?.icon || '📦'} {resource.name}
                                                                </option>
                                                            ))}
                                                        </optgroup>
                                                    )}
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
                        )}
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

            {/* Day Popup — hücrede sığmayan öğeleri gösterir */}
            {dayPopup && (
                <>
                    <div className="day-popup-backdrop" onClick={() => setDayPopup(null)} />
                    <div className="day-popup-panel" style={{
                        position: 'fixed',
                        left: Math.min(dayPopup.x, window.innerWidth - 340),
                        top: Math.min(dayPopup.y, window.innerHeight - 400),
                        zIndex: 1000
                    }}>
                        <div className="day-popup-header">
                            <h4>{dayPopup.date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}</h4>
                            <button className="day-popup-close" onClick={() => setDayPopup(null)}><X size={16} /></button>
                        </div>
                        <div className="day-popup-items">
                            {(() => {
                                const now = new Date();
                                const allItems = [];
                                getAppointmentsForDay(dayPopup.date).forEach(apt => {
                                    const aptResource = apt.resourceId ? resources.find(r => r.id === apt.resourceId) : null;
                                    const aptEnd = new Date(apt.endTime || apt.startTime);
                                    const isOverdue = !apt.isGoogleEvent && aptEnd < now && apt.status === 'SCHEDULED';
                                    const isCompleted = apt.status === 'COMPLETED';
                                    allItems.push({
                                        sortTime: new Date(apt.startTime),
                                        render: (
                                            <div key={`dp-apt-${apt.id}`} className={`day-popup-item ${isOverdue ? 'popup-overdue' : ''} ${isCompleted ? 'popup-completed' : ''}`}
                                                style={{ borderLeftColor: apt.isGoogleEvent ? '#4285F4' : (aptResource?.color || apt.color) }}
                                                onClick={() => { openEditModal(apt); setDayPopup(null); }}
                                            >
                                                {apt.isGoogleEvent && <span className="popup-badge google" style={{ background: '#4285F4', color: '#fff' }}>🇬 Google</span>}
                                                {isOverdue && <span className="popup-badge overdue">⚠️</span>}
                                                {isCompleted && <span className="popup-badge completed">✓</span>}
                                                <span className="popup-time">{formatTime(apt.startTime)}</span>
                                                <span className="popup-title">{apt.title}{apt.isGoogleEvent ? ` (${apt.googleEmail || apt.assignedTo?.name || 'Google'})` : ''}</span>
                                                {apt.contactName && <span className="popup-contact">{apt.contactName}</span>}
                                            </div>
                                        )
                                    });
                                });
                                if (!selectedResource) {
                                    getScheduledCallsForDay(dayPopup.date).forEach(sc => {
                                        allItems.push({
                                            sortTime: new Date(sc.scheduledAt),
                                            render: (
                                                <div key={`dp-sc-${sc.id}`} className="day-popup-item" style={{ borderLeftColor: '#f97316' }}
                                                    onClick={() => { openScheduledCallModal(sc); setDayPopup(null); }}
                                                >
                                                    <span className="popup-time">📞 {new Date(sc.scheduledAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                                                    <span className="popup-title">{sc.contactName || sc.toNumber}</span>
                                                </div>
                                            )
                                        });
                                    });
                                }
                                getActivitiesForDay(dayPopup.date).forEach(act => {
                                    const cfg = ACTIVITY_TYPE_CONFIG[act.type] || { icon: '📋', color: '#6b7280', label: act.type };
                                    const actDate = new Date(act.dueDate || act.createdAt);
                                    const isOverdue = actDate < now && act.status !== 'COMPLETED' && act.status !== 'DONE';
                                    const isCompleted = act.status === 'COMPLETED' || act.status === 'DONE';
                                    allItems.push({
                                        sortTime: actDate,
                                        render: (
                                            <div key={`dp-act-${act.id}`} className={`day-popup-item ${isOverdue ? 'popup-overdue' : ''} ${isCompleted ? 'popup-completed' : ''}`}
                                                style={{ borderLeftColor: cfg.color }}
                                                onClick={() => { setSelectedActivity(act); setDayPopup(null); }}
                                            >
                                                {isOverdue && <span className="popup-badge overdue">⚠️</span>}
                                                {isCompleted && <span className="popup-badge completed">✓</span>}
                                                <span className="popup-time">{cfg.icon} {act.dueDate ? new Date(act.dueDate).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                                <span className="popup-title">{act.title || act.contact?.name || cfg.label}</span>
                                                {act.contact?.name && <span className="popup-contact">{act.contact.name}</span>}
                                            </div>
                                        )
                                    });
                                });
                                allItems.sort((a, b) => a.sortTime - b.sortTime);
                                return allItems.map(item => item.render);
                            })()}
                        </div>
                    </div>
                </>
            )}

            {/* ─── Aktivite Detay Popup ─── */}
            {selectedActivity && (() => {
                const act = selectedActivity;
                const cfg = ACTIVITY_TYPE_CONFIG[act.type] || { icon: '📋', color: '#6b7280', label: act.type };
                const actDate = new Date(act.dueDate || act.createdAt);
                const isOverdue = actDate < new Date() && act.status !== 'COMPLETED' && act.status !== 'DONE';
                const isCompleted = act.status === 'COMPLETED' || act.status === 'DONE';
                const sentimentMap = { Positive: { emoji: '😊', label: 'Olumlu', color: '#10b981' }, Neutral: { emoji: '😐', label: 'Nötr', color: '#f59e0b' }, Negative: { emoji: '😞', label: 'Olumsuz', color: '#ef4444' } };
                const sent = sentimentMap[act.callSentiment];
                return (
                    <>
                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9998, backdropFilter: 'blur(2px)' }} onClick={() => setSelectedActivity(null)} />
                        <div style={{
                            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                            background: '#fff', borderRadius: 16, padding: 0, zIndex: 9999,
                            width: 420, maxWidth: '90vw', maxHeight: '80vh', overflow: 'auto',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.3)', animation: 'fadeInScale 0.2s ease'
                        }}>
                            {/* Header */}
                            <div style={{
                                padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9',
                                display: 'flex', alignItems: 'center', gap: 12
                            }}>
                                <div style={{
                                    width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: cfg.color + '20', fontSize: 20
                                }}>{cfg.icon}</div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{act.title || cfg.label}</div>
                                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{cfg.label}</div>
                                </div>
                                <button onClick={() => setSelectedActivity(null)} style={{
                                    background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 8,
                                    color: '#94a3b8', display: 'flex'
                                }}><X size={18} /></button>
                            </div>

                            {/* Body */}
                            <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                                {/* Durum */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{
                                        padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                                        background: isCompleted ? '#dcfce7' : isOverdue ? '#fef2f2' : '#eff6ff',
                                        color: isCompleted ? '#16a34a' : isOverdue ? '#ef4444' : '#3b82f6'
                                    }}>
                                        {isCompleted ? '✅ Tamamlandı' : isOverdue ? '⚠️ Gecikmiş' : '🔵 Planlandı'}
                                    </span>
                                    {act.priority && act.priority !== 'NORMAL' && (
                                        <span style={{
                                            padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                                            background: act.priority === 'HIGH' || act.priority === 'URGENT' ? '#fef2f2' : '#f8fafc',
                                            color: act.priority === 'HIGH' || act.priority === 'URGENT' ? '#ef4444' : '#64748b'
                                        }}>{act.priority === 'URGENT' ? '🔴 Acil' : act.priority === 'HIGH' ? '🟠 Yüksek' : act.priority === 'LOW' ? '🔵 Düşük' : act.priority}</span>
                                    )}
                                </div>

                                {/* Kişi */}
                                {act.contact?.name && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <User size={14} style={{ color: '#94a3b8' }} />
                                        <span style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>{act.contact.name}</span>
                                        {act.contact.phone && <span style={{ fontSize: 12, color: '#94a3b8' }}>• {act.contact.phone}</span>}
                                    </div>
                                )}

                                {/* Tarih */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <Clock size={14} style={{ color: '#94a3b8' }} />
                                    <span style={{ fontSize: 13, color: '#475569' }}>
                                        {actDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                        {' '}
                                        {actDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>

                                {/* Atanan */}
                                {act.assignee?.name && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <User size={14} style={{ color: '#94a3b8' }} />
                                        <span style={{ fontSize: 13, color: '#475569' }}>Atanan: <strong>{act.assignee.name}</strong></span>
                                    </div>
                                )}

                                {/* Arama Sonucu */}
                                {act.type === 'CALL' && act.callSuccessful !== undefined && act.callSuccessful !== null && (
                                    <div style={{
                                        background: '#f8fafc', borderRadius: 10, padding: '12px 14px',
                                        border: '1px solid #e2e8f0'
                                    }}>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                            📞 Arama Sonucu
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: sent ? 6 : 0 }}>
                                            <span style={{
                                                fontSize: 13, fontWeight: 600,
                                                color: act.callSuccessful ? '#10b981' : '#ef4444'
                                            }}>
                                                {act.callSuccessful ? '✅ Ulaşıldı' : '❌ Ulaşılamadı'}
                                            </span>
                                        </div>
                                        {sent && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ fontSize: 16 }}>{sent.emoji}</span>
                                                <span style={{ fontSize: 13, fontWeight: 600, color: sent.color }}>{sent.label}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Not / Açıklama */}
                                {(act.result || act.description) && (
                                    <div style={{
                                        background: '#fefce8', borderRadius: 10, padding: '12px 14px',
                                        border: '1px solid #fef08a'
                                    }}>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: '#a16207', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                            📝 Not
                                        </div>
                                        <div style={{ fontSize: 13, color: '#713f12', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                                            {act.result || act.description}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div style={{
                                padding: '14px 24px', borderTop: '1px solid #f1f5f9',
                                display: 'flex', gap: 8, justifyContent: 'flex-end'
                            }}>
                                {(act.contactId || act.contact?.id) && (
                                    <button
                                        onClick={() => { setSelectedContactId(act.contactId || act.contact?.id); setSelectedActivity(null); }}
                                        style={{
                                            padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0',
                                            background: '#fff', color: '#475569', fontSize: 13, fontWeight: 500,
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                                        }}
                                    >
                                        <User size={14} /> Kişi Profilini Aç
                                    </button>
                                )}
                                <button
                                    onClick={() => setSelectedActivity(null)}
                                    style={{
                                        padding: '8px 16px', borderRadius: 8, border: 'none',
                                        background: cfg.color, color: '#fff', fontSize: 13, fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >Kapat</button>
                            </div>
                        </div>
                    </>
                );
            })()}

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
