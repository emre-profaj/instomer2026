import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { appointmentAPI } from '../../services/api';
import {
    Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, X,
    Clock, User, Phone, Mail, FileText, Check, AlertCircle, Trash2
} from 'lucide-react';
import './Calendar.css';

const APPOINTMENT_STATUSES = [
    { value: 'SCHEDULED', label: 'Planlandı', color: '#3b82f6' },
    { value: 'COMPLETED', label: 'Tamamlandı', color: '#10b981' },
    { value: 'CANCELLED', label: 'İptal Edildi', color: '#ef4444' },
    { value: 'NO_SHOW', label: 'Gelmedi', color: '#f59e0b' }
];

const Calendar = () => {
    const { currentWorkspace } = useAuth();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState('month'); // 'month', 'week', 'day'
    const [appointments, setAppointments] = useState([]);
    const [upcomingAppointments, setUpcomingAppointments] = useState([]);
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedAgent, setSelectedAgent] = useState('');

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

    useEffect(() => {
        if (currentWorkspace?.id) {
            loadAppointments();
            loadAgents();
            loadUpcomingAppointments();
        }
    }, [currentWorkspace, currentDate, selectedAgent]);

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

            const response = await appointmentAPI.getAll(currentWorkspace.id, {
                startDate: lastWeek.toISOString(),
                endDate: nextWeek.toISOString()
            });

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
            return 'Bugün';
        } else if (date.toDateString() === tomorrow.toDateString()) {
            return 'Yarın';
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
        setIsCreating(true);
        setConflict(null);

        try {
            // Auto-assign color based on status
            const statusColor = APPOINTMENT_STATUSES.find(s => s.value === formData.status)?.color || '#3b82f6';
            const data = {
                ...formData,
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
            loadAppointments();
            loadUpcomingAppointments(); // Refresh upcoming sidebar
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

        try {
            await appointmentAPI.delete(currentWorkspace.id, selectedAppointment.id);
            setIsModalOpen(false);
            loadAppointments();
            loadUpcomingAppointments(); // Refresh upcoming sidebar
        } catch (error) {
            console.error('Delete appointment error:', error);
            alert('Randevu silinemedi');
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

    const monthNames = [
        'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
        'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
    ];

    const dayNames = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

    return (
        <div className="calendar-page">
            {/* Upcoming Appointments Sidebar */}
            <div className="upcoming-sidebar">
                <div className="upcoming-header">
                    <Clock size={18} />
                    <h3>Yaklaşan Randevular</h3>
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
                    {filteredUpcomingAppointments.length === 0 ? (
                        <div className="upcoming-empty">
                            <CalendarIcon size={32} />
                            <p>Yaklaşan randevu yok</p>
                        </div>
                    ) : (
                        filteredUpcomingAppointments.map(apt => (
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
                                            {apt.isPast && apt.status !== 'COMPLETED' ? 'Geçmiş' : 'Tamamlandı'}
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
                                            Agent: {apt.assignedTo.name}
                                        </span>
                                    )}
                                </div>
                                <div
                                    className="upcoming-color-bar"
                                    style={{ backgroundColor: apt.color || '#3b82f6' }}
                                />
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Main Calendar */}
            <div className="calendar-main">
                <div className="calendar-header">
                    <div className="calendar-title">
                        <CalendarIcon size={24} />
                        <h1>Takvim</h1>
                    </div>

                    <div className="calendar-controls">
                        <select
                            className="agent-filter"
                            value={selectedAgent}
                            onChange={(e) => setSelectedAgent(e.target.value)}
                        >
                            <option value="">Tüm Agentlar</option>
                            {agents.map(agent => (
                                <option key={agent.id} value={agent.id}>{agent.name}</option>
                            ))}
                        </select>

                        <div className="nav-buttons">
                            <button onClick={handlePrevMonth}><ChevronLeft size={20} /></button>
                            <button className="today-btn" onClick={handleToday}>Bugün</button>
                            <button onClick={handleNextMonth}><ChevronRight size={20} /></button>
                        </div>

                        <span className="current-month">
                            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                        </span>

                        <button className="add-appointment-btn" onClick={() => openCreateModal()}>
                            <Plus size={18} />
                            Randevu Ekle
                        </button>
                    </div>
                </div>

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
                                        return (
                                            <div
                                                key={apt.id}
                                                className="appointment-pill-wrapper"
                                            >
                                                <div
                                                    className="appointment-pill"
                                                    style={{ backgroundColor: apt.color }}
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
                                                            {status?.label || 'Planlandı'}
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
                                                                <span>Agent: {apt.assignedTo.name}</span>
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
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div> {/* End calendar-main */}

            {/* Appointment Modal */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="modal-content appointment-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{selectedAppointment ? 'Randevu Düzenle' : 'Yeni Randevu'}</h2>
                            <button className="modal-close-btn" onClick={() => setIsModalOpen(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="modal-body">
                            {/* Conflict Warning */}
                            {conflict && (
                                <div className="conflict-warning">
                                    <AlertCircle size={20} />
                                    <div className="conflict-info">
                                        <strong>{conflict.error}</strong>
                                        <p>Mevcut randevu: {conflict.conflictingAppointment?.title}</p>
                                        {conflict.suggestion && (
                                            <button
                                                type="button"
                                                className="suggestion-btn"
                                                onClick={applySuggestion}
                                            >
                                                <Check size={16} />
                                                Öneriyi Uygula: {new Date(conflict.suggestion.startTime).toLocaleString('tr-TR')}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="form-group">
                                <label><FileText size={16} /> Başlık *</label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                                    placeholder="Randevu başlığı"
                                    required
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label><Clock size={16} /> Başlangıç *</label>
                                    <input
                                        type="datetime-local"
                                        value={formData.startTime}
                                        onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label><Clock size={16} /> Bitiş *</label>
                                    <input
                                        type="datetime-local"
                                        value={formData.endTime}
                                        onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label><User size={16} /> Atanan Agent *</label>
                                <div className="custom-select-wrapper">
                                    <div className="custom-select-icon">
                                        <User size={18} />
                                    </div>
                                    <select
                                        className="custom-select"
                                        value={formData.assignedToId}
                                        onChange={(e) => setFormData(prev => ({ ...prev, assignedToId: e.target.value }))}
                                        required
                                    >
                                        <option value="">Agent Seç</option>
                                        {agents.map(agent => (
                                            <option key={agent.id} value={agent.id}>{agent.name}</option>
                                        ))}
                                    </select>
                                    <div className="custom-select-arrow">
                                        <ChevronRight size={16} style={{ transform: 'rotate(90deg)' }} />
                                    </div>
                                </div>
                            </div>

                            <div className="form-divider">Müşteri Bilgileri</div>

                            <div className="form-group">
                                <label><User size={16} /> Müşteri Adı</label>
                                <input
                                    type="text"
                                    value={formData.contactName}
                                    onChange={(e) => setFormData(prev => ({ ...prev, contactName: e.target.value }))}
                                    placeholder="Müşteri adı"
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label><Phone size={16} /> Telefon</label>
                                    <input
                                        type="tel"
                                        value={formData.contactPhone}
                                        onChange={(e) => setFormData(prev => ({ ...prev, contactPhone: e.target.value }))}
                                        placeholder="+90 555 123 4567"
                                    />
                                </div>
                                <div className="form-group">
                                    <label><Mail size={16} /> E-posta</label>
                                    <input
                                        type="email"
                                        value={formData.contactEmail}
                                        onChange={(e) => setFormData(prev => ({ ...prev, contactEmail: e.target.value }))}
                                        placeholder="ornek@email.com"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label><Check size={16} /> Durum</label>
                                <div className="custom-select-wrapper status-select">
                                    <div
                                        className="custom-select-status-dot"
                                        style={{
                                            backgroundColor: APPOINTMENT_STATUSES.find(s => s.value === formData.status)?.color || '#3b82f6'
                                        }}
                                    />
                                    <select
                                        className="custom-select"
                                        value={formData.status}
                                        onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                                    >
                                        {APPOINTMENT_STATUSES.map(status => (
                                            <option key={status.value} value={status.value}>{status.label}</option>
                                        ))}
                                    </select>
                                    <div className="custom-select-arrow">
                                        <ChevronRight size={16} style={{ transform: 'rotate(90deg)' }} />
                                    </div>
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Notlar</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                                    placeholder="Randevu notları..."
                                    rows={3}
                                />
                            </div>

                            <div className="modal-actions">
                                {selectedAppointment && (
                                    <button type="button" className="btn btn-danger" onClick={handleDelete}>
                                        <Trash2 size={16} /> Sil
                                    </button>
                                )}
                                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                                    İptal
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={isCreating}>
                                    {isCreating ? 'Kaydediliyor...' : (selectedAppointment ? 'Güncelle' : 'Oluştur')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Calendar;












