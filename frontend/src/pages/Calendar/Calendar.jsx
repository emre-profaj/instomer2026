import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { appointmentAPI, retellAPI, resourceAPI } from '../../services/api';
import {
    Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, X,
    Clock, User, Phone, Mail, FileText, Check, AlertCircle, Trash2,
    Layers, Edit2, Building2, List, Grid3X3, Search
} from 'lucide-react';
import ContactSidebar from '../../components/ContactSidebar/ContactSidebar';
import '../../components/ContactSidebar/ContactSidebar.css';
import { contactAPI, conversationAPI } from '../../services/api';
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

const Calendar = () => {
    const { t } = useTranslation();
    const { currentWorkspace } = useAuth();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState('month'); // 'month', 'week', 'day'
    const [appointments, setAppointments] = useState([]);
    const [upcomingAppointments, setUpcomingAppointments] = useState([]);
    const [scheduledCalls, setScheduledCalls] = useState([]);
    const [layoutMode, setLayoutMode] = useState('grid'); // 'grid' | 'list'
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedAgent, setSelectedAgent] = useState('');
    const [cancellingCallId, setCancellingCallId] = useState(null);

    // Scheduled call edit modal
    const [selectedScheduledCall, setSelectedScheduledCall] = useState(null);
    const [rescheduleDate, setRescheduleDate] = useState('');
    const [rescheduling, setRescheduling] = useState(false);

    // Resource states
    const [resources, setResources] = useState([]);
    const [selectedResource, setSelectedResource] = useState('');
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

    // List view states
    const [listFilter, setListFilter] = useState('all'); // 'all', 'appointments', 'calls'
    const [selectedContactId, setSelectedContactId] = useState(null);
    const [listSearchTerm, setListSearchTerm] = useState('');

    useEffect(() => {
        if (currentWorkspace?.id) {
            loadAppointments();
            loadAgents();
            loadUpcomingAppointments();
            loadScheduledCalls();
            loadResources();
        }
    }, [currentWorkspace, currentDate, selectedAgent, selectedResource]);

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

            if (selectedAgent) {
                params.assignedToId = selectedAgent;
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
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const handleToday = () => {
        setCurrentDate(new Date());
    };

    const getDaysInMonth = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startDayOfWeek = firstDay.getDay();

        const days = [];

        // Previous month days
        const prevMonth = new Date(year, month, 0);
        for (let i = startDayOfWeek - 1; i >= 0; i--) {
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
        const now = new Date();
        return appointments.filter(apt => {
            const aptDate = new Date(apt.startTime);
            const aptEndDate = new Date(apt.endTime);
            // Hide past appointments (end time has passed)
            if (aptEndDate < now) return false;
            return aptDate.toDateString() === date.toDateString();
        });
    };

    const getScheduledCallsForDay = (date) => {
        return scheduledCalls.filter(sc => {
            return new Date(sc.scheduledAt).toDateString() === date.toDateString();
        });
    };


    const openCreateModal = (date = null) => {
        const now = date || new Date();
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
            contactName: '',
            contactPhone: '',
            contactEmail: '',
            notes: '',
            status: 'SCHEDULED'
        });
        setSelectedAppointment(null);
        setConflict(null);
        setIsModalOpen(true);
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

    const dayNames = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

    const getResourceName = (resourceId) => {
        const r = resources.find(r => r.id === resourceId);
        return r ? r.name : '';
    };

    return (
        <div className={`calendar-page ${layoutMode === 'list' ? 'calendar-page-list-mode' : ''}`}>
            {/* Upcoming Appointments Sidebar — only in calendar mode */}
            {layoutMode === 'grid' && (
            <div className="upcoming-sidebar">
                <div className="upcoming-header">
                    <Clock size={18} />
                    <h3>{t('calendar.title')}</h3>
                </div>
                <div className="upcoming-toggle">
                    <label className="toggle-label">
                        <input
                            type="checkbox"
                            checked={showCompleted}
                            onChange={(e) => setShowCompleted(e.target.checked)}
                        />
                        <span className="toggle-slider"></span>
                        <span className="toggle-text">Tamamlananları Göster</span>
                    </label>
                </div>
                <div className="upcoming-list">
                    {filteredUpcomingAppointments.length === 0 && (selectedResource || scheduledCalls.length === 0) ? (
                        <div className="upcoming-empty">
                            <CalendarIcon size={32} />
                            <p>No upcoming appointments</p>
                        </div>
                    ) : (
                        <>
                        {filteredUpcomingAppointments.map(apt => (
                            <div
                                key={apt.id}
                                className={`upcoming-item ${apt.isCompleted ? 'completed' : ''}`}
                                onClick={() => openEditModal(apt)}
                            >
                                <div className="upcoming-date-badge">
                                    <span className="upcoming-day">{formatUpcomingDate(apt.startTime)}</span>
                                    <span className="upcoming-time">{formatTime(apt.startTime)}</span>
                                </div>
                                <div className="upcoming-info">
                                    <h4>{apt.title}</h4>
                                    {apt.isCompleted && (
                                        <span className="upcoming-status completed">
                                            <Check size={12} />
                                            {apt.isPast && apt.status !== 'COMPLETED' ? 'Geçmiş' : 'Completed'}
                                        </span>
                                    )}
                                    {apt.contactName && (
                                        <span className="upcoming-contact">
                                            <User size={12} />
                                            {apt.contactName}
                                        </span>
                                    )}
                                    {apt.assignedTo && (
                                        <span className="upcoming-agent">
                                            Temsilci: {apt.assignedTo.name}
                                        </span>
                                    )}
                                    {apt.resourceId && (
                                        <span className="upcoming-resource">
                                            <Building2 size={12} />
                                            {getResourceName(apt.resourceId)}
                                        </span>
                                    )}
                                </div>
                                <div
                                    className="upcoming-color-bar"
                                    style={{ backgroundColor: apt.color || '#3b82f6' }}
                                />
                            </div>
                        ))}
                        {!selectedResource && scheduledCalls.slice(0, 8).map(sc => (
                            <div
                                key={sc.id}
                                className="upcoming-item"
                                onClick={() => openScheduledCallModal(sc)}
                                title="Düzenle / İptal et"
                            >
                                <div className="upcoming-date-badge">
                                    <span className="upcoming-day">{new Date(sc.scheduledAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
                                    <span className="upcoming-time">{formatTime(sc.scheduledAt)}</span>
                                </div>
                                <div className="upcoming-info" style={{ minWidth: 0 }}>
                                    <h4 style={{ color: '#ea580c' }}>📞 Oto. Arama</h4>
                                    <span style={{ fontSize: '12px', color: '#6b7280', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', display: 'block' }}>
                                        {sc.contactName || sc.toNumber}
                                    </span>
                                </div>
                                <div className="upcoming-color-bar" style={{ backgroundColor: '#f97316' }} />
                            </div>
                        ))}
                        </>
                    )}
                </div>

                {/* ─── Resources Section ─── */}
                <div className="resources-section">
                    <div className="resources-header">
                        <div className="resources-title">
                            <Layers size={16} />
                            <h4>Kaynaklar</h4>
                        </div>
                        <button className="resource-add-btn" onClick={() => openResourceModal()} title="Kaynak Ekle">
                            <Plus size={14} />
                        </button>
                    </div>

                    {resources.length === 0 ? (
                        <div className="resources-empty">
                            <p>Henüz kaynak yok</p>
                            <button className="resource-create-link" onClick={() => openResourceModal()}>
                                <Plus size={12} /> Kaynak Oluştur
                            </button>
                        </div>
                    ) : (
                        <div className="resources-list">
                            <div
                                className={`resource-item ${selectedResource === '' ? 'active' : ''}`}
                                onClick={() => setSelectedResource('')}
                            >
                                <div className="resource-dot" style={{ backgroundColor: '#6b7280' }} />
                                <span className="resource-name">{t('common.all')}</span>
                            </div>
                            {resources.map(resource => (
                                <div
                                    key={resource.id}
                                    className={`resource-item ${selectedResource === resource.id ? 'active' : ''}`}
                                    onClick={() => setSelectedResource(selectedResource === resource.id ? '' : resource.id)}
                                >
                                    <div className="resource-dot" style={{ backgroundColor: resource.color }} />
                                    <span className="resource-name">
                                        {RESOURCE_TYPES.find(t => t.value === resource.type)?.icon || '📦'} {resource.name}
                                    </span>
                                    <div className="resource-actions">
                                        <button
                                            className="resource-action-btn"
                                            onClick={(e) => { e.stopPropagation(); openResourceModal(resource); }}
                                            title={t('common.edit')}
                                        >
                                            <Edit2 size={12} />
                                        </button>
                                        <button
                                            className="resource-action-btn delete"
                                            onClick={(e) => { e.stopPropagation(); handleResourceDelete(resource.id); }}
                                            title={t('common.delete')}
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </div>
            )}

            {/* Main Calendar */}
            <div className="calendar-main">
                <div className="calendar-header">
                    <div className="calendar-title">
                        <CalendarIcon size={24} />
                        <h1>Aktiviteler</h1>
                    </div>

                    <div className="calendar-controls">
                        <select
                            className="agent-filter"
                            value={selectedAgent}
                            onChange={(e) => setSelectedAgent(e.target.value)}
                        >
                            <option value="">{t('common.all')} Agents</option>
                            {agents.map(agent => (
                                <option key={agent.id} value={agent.id}>{agent.name}</option>
                            ))}
                        </select>

                        {resources.length > 0 && (
                            <select
                                className="resource-filter"
                                value={selectedResource}
                                onChange={(e) => setSelectedResource(e.target.value)}
                            >
                                <option value="">{t('common.all')}</option>
                                {resources.map(resource => (
                                    <option key={resource.id} value={resource.id}>
                                        {RESOURCE_TYPES.find(t => t.value === resource.type)?.icon} {resource.name}
                                    </option>
                                ))}
                            </select>
                        )}

                        <div className="nav-buttons">
                            <button onClick={handlePrevMonth}><ChevronLeft size={20} /></button>
                            <button className="today-btn" onClick={handleToday}>{t('calendar.today')}</button>
                            <button onClick={handleNextMonth}><ChevronRight size={20} /></button>
                        </div>

                        <span className="current-month">
                            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                        </span>

                        <div className="view-mode-toggle" style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
                            <button
                                onClick={() => setLayoutMode('grid')}
                                style={{
                                    padding: '6px 12px', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 500,
                                    background: layoutMode === 'grid' ? 'white' : 'transparent',
                                    color: layoutMode === 'grid' ? '#3b82f6' : '#64748b',
                                    boxShadow: layoutMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                                    cursor: 'pointer', transition: 'all 0.2s'
                                }}
                            >Takvim</button>
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

                        <button className="add-appointment-btn" onClick={() => openCreateModal()}>
                            <Plus size={18} />
                            {t('calendar.newAppointment')}
                        </button>
                    </div>
                </div>

                {layoutMode === 'grid' ? (
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
        </div>
    );
};

export default Calendar;
