import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { appointmentConfigAPI } from '../../services/api';
import { 
    Stethoscope, Plus, Edit2, Trash2, Sparkles, Clock, Calendar, 
    UserCheck, ShieldAlert, X, Check, Search, Filter, Users, 
    Layers, ChevronRight, CheckCircle2, AlertCircle, RefreshCw,
    Activity, Hospital
} from 'lucide-react';
import './FirmSettings.css';

const TURKISH_DAYS = [
    { key: 'monday', label: 'Pazartesi', short: 'Pzt' },
    { key: 'tuesday', label: 'Salı', short: 'Sal' },
    { key: 'wednesday', label: 'Çarşamba', short: 'Çar' },
    { key: 'thursday', label: 'Perşembe', short: 'Per' },
    { key: 'friday', label: 'Cuma', short: 'Cum' },
    { key: 'saturday', label: 'Cumartesi', short: 'Cmt' },
    { key: 'sunday', label: 'Pazar', short: 'Paz' }
];

export default function FirmSettings() {
    const { currentWorkspace, user } = useAuth();

    // Super Admin Guard
    if (user?.role !== 'SUPER_ADMIN') {
        return (
            <div className="firm-access-denied">
                <div className="firm-denied-icon">
                    <ShieldAlert size={40} />
                </div>
                <h2>Yetkisiz Erişim</h2>
                <p>Klinik & Hekim Yapılandırması alanına yalnızca <strong>Süper Yöneticiler (Super Admin)</strong> erişebilir.</p>
            </div>
        );
    }

    const [loading, setLoading] = useState(true);
    const [seeding, setSeeding] = useState(false);
    const [activeTab, setActiveTab] = useState('doctors'); // 'doctors' | 'branches'

    const [branches, setBranches] = useState([]);
    const [workspaceUsers, setWorkspaceUsers] = useState([]);

    // Search & Filter State
    const [doctorSearchQuery, setDoctorSearchQuery] = useState('');
    const [selectedBranchFilter, setSelectedBranchFilter] = useState('ALL');
    const [selectedUserFilter, setSelectedUserFilter] = useState('ALL');
    const [branchSearchQuery, setBranchSearchQuery] = useState('');

    // Branch Modal
    const [branchModalOpen, setBranchModalOpen] = useState(false);
    const [editingBranch, setEditingBranch] = useState(null);
    const [branchName, setBranchName] = useState('');

    // Doctor Modal
    const [doctorModalOpen, setDoctorModalOpen] = useState(false);
    const [editingDoctor, setEditingDoctor] = useState(null);
    const [doctorForm, setDoctorForm] = useState({
        branchId: '',
        name: '',
        title: 'Uzm. Dr.',
        userId: '',
        workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        workStart: '09:00',
        workEnd: '17:00',
        slotMinutes: 30,
        isActive: true
    });

    const [toastMessage, setToastMessage] = useState(null);

    const showToast = (msg, type = 'success') => {
        setToastMessage({ text: msg, type });
        setTimeout(() => setToastMessage(null), 4000);
    };

    const loadSettings = async () => {
        if (!currentWorkspace?.id) return;
        try {
            setLoading(true);
            const res = await appointmentConfigAPI.getFirmSettings(currentWorkspace.id);
            if (res.data) {
                setBranches(res.data.branches || []);
                setWorkspaceUsers(res.data.users || []);
            }
        } catch (err) {
            console.error('loadSettings error:', err);
            showToast('Klinik ayarları yüklenirken hata oluştu', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSettings();
    }, [currentWorkspace?.id]);

    // Seed Demo Health Data
    const handleSeedHealthDemo = async () => {
        if (!confirm('Sağlık sektörü için hazır branş ve hekim kadrosu örneği eklensin mi?')) return;
        try {
            setSeeding(true);
            const res = await appointmentConfigAPI.seedHealthDemo(currentWorkspace.id);
            showToast(res.data.message || 'Örnek sağlık verileri başarıyla yüklendi!');
            await loadSettings();
        } catch (err) {
            console.error(err);
            showToast('Örnek veriler yüklenirken hata oluştu', 'error');
        } finally {
            setSeeding(false);
        }
    };

    // Branch Handlers
    const openCreateBranchModal = () => {
        setEditingBranch(null);
        setBranchName('');
        setBranchModalOpen(true);
    };

    const openEditBranchModal = (branch) => {
        setEditingBranch(branch);
        setBranchName(branch.name);
        setBranchModalOpen(true);
    };

    const handleSaveBranch = async (e) => {
        e.preventDefault();
        if (!branchName.trim()) return;

        try {
            if (editingBranch) {
                await appointmentConfigAPI.updateBranch(currentWorkspace.id, editingBranch.id, { name: branchName.trim() });
                showToast('Branş başarıyla güncellendi.');
            } else {
                await appointmentConfigAPI.createBranch(currentWorkspace.id, { name: branchName.trim() });
                showToast('Yeni tıbbi branş oluşturuldu.');
            }
            setBranchModalOpen(false);
            loadSettings();
        } catch (err) {
            showToast(err.response?.data?.error || 'İşlem başarısız', 'error');
        }
    };

    const handleDeleteBranch = async (branchId, bName) => {
        if (!confirm(`"${bName}" branşını ve altındaki tüm hekimleri silmek istediğinize emin misiniz?`)) return;
        try {
            await appointmentConfigAPI.deleteBranch(currentWorkspace.id, branchId);
            showToast('Branş silindi.');
            loadSettings();
        } catch (err) {
            showToast('Silme işlemi başarısız', 'error');
        }
    };

    // Doctor Handlers
    const openCreateDoctorModal = (preselectedBranchId = '') => {
        setEditingDoctor(null);
        setDoctorForm({
            branchId: preselectedBranchId || (branches[0]?.id || ''),
            name: '',
            title: 'Uzm. Dr.',
            userId: '',
            workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
            workStart: '09:00',
            workEnd: '17:00',
            slotMinutes: 30,
            isActive: true
        });
        setDoctorModalOpen(true);
    };

    const openEditDoctorModal = (doctor) => {
        setEditingDoctor(doctor);
        let parsedDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
        try {
            if (doctor.workingDays) parsedDays = JSON.parse(doctor.workingDays);
        } catch (_) {}

        setDoctorForm({
            branchId: doctor.branchId,
            name: doctor.name,
            title: doctor.title || 'Uzm. Dr.',
            userId: doctor.userId || '',
            workingDays: parsedDays,
            workStart: doctor.workStart || '09:00',
            workEnd: doctor.workEnd || '17:00',
            slotMinutes: doctor.slotMinutes || 30,
            isActive: doctor.isActive ?? true
        });
        setDoctorModalOpen(true);
    };

    const handleSaveDoctor = async (e) => {
        e.preventDefault();
        if (!doctorForm.name.trim() || !doctorForm.branchId) {
            showToast('Lütfen hekim adı ve branşını eksiksiz doldurun', 'error');
            return;
        }

        try {
            if (editingDoctor) {
                await appointmentConfigAPI.updateDoctor(currentWorkspace.id, editingDoctor.id, doctorForm);
                showToast('Hekim bilgileri güncellendi.');
            } else {
                await appointmentConfigAPI.createDoctor(currentWorkspace.id, doctorForm);
                showToast('Yeni hekim kadroya eklendi.');
            }
            setDoctorModalOpen(false);
            loadSettings();
        } catch (err) {
            showToast(err.response?.data?.error || 'Hekim kaydedilemedi', 'error');
        }
    };

    const handleDeleteDoctor = async (doctorId, docName) => {
        if (!confirm(`"${docName}" hekimini sistemden silmek istediğinize emin misiniz?`)) return;
        try {
            await appointmentConfigAPI.deleteDoctor(currentWorkspace.id, doctorId);
            showToast('Hekim silindi.');
            loadSettings();
        } catch (err) {
            showToast('Hekim silinemedi', 'error');
        }
    };

    // Toggle working day
    const toggleDay = (dayKey) => {
        setDoctorForm(prev => {
            const exists = prev.workingDays.includes(dayKey);
            const nextDays = exists ? prev.workingDays.filter(d => d !== dayKey) : [...prev.workingDays, dayKey];
            return { ...prev, workingDays: nextDays };
        });
    };

    // Quick select presets
    const setWeekdayPreset = () => {
        setDoctorForm(prev => ({
            ...prev,
            workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
        }));
    };

    const setFullWeekPreset = () => {
        setDoctorForm(prev => ({
            ...prev,
            workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
        }));
    };

    // All doctors flat list
    const allDoctors = useMemo(() => {
        return branches.flatMap(b => (b.doctors || []).map(d => ({ ...d, branchName: b.name })));
    }, [branches]);

    // KPI Metrics
    const activeDoctorsCount = allDoctors.filter(d => d.isActive).length;
    const assignedDoctorsCount = allDoctors.filter(d => d.userId).length;
    const unassignedDoctorsCount = allDoctors.length - assignedDoctorsCount;

    // Filtered Doctors
    const filteredDoctors = useMemo(() => {
        return allDoctors.filter(doc => {
            // Search query
            const matchSearch = doctorSearchQuery === '' || 
                doc.name?.toLowerCase().includes(doctorSearchQuery.toLowerCase()) ||
                doc.title?.toLowerCase().includes(doctorSearchQuery.toLowerCase()) ||
                doc.branchName?.toLowerCase().includes(doctorSearchQuery.toLowerCase());

            // Branch filter
            const matchBranch = selectedBranchFilter === 'ALL' || doc.branchId === selectedBranchFilter;

            // User Assignment filter
            let matchUser = true;
            if (selectedUserFilter === 'ASSIGNED') {
                matchUser = !!doc.userId;
            } else if (selectedUserFilter === 'UNASSIGNED') {
                matchUser = !doc.userId;
            }

            return matchSearch && matchBranch && matchUser;
        });
    }, [allDoctors, doctorSearchQuery, selectedBranchFilter, selectedUserFilter]);

    // Filtered Branches
    const filteredBranches = useMemo(() => {
        if (!branchSearchQuery) return branches;
        return branches.filter(b => b.name?.toLowerCase().includes(branchSearchQuery.toLowerCase()));
    }, [branches, branchSearchQuery]);

    return (
        <div className="firm-settings-page">
            {/* 1. Header Banner */}
            <div className="firm-header">
                <div className="firm-header-left">
                    <div className="firm-badge-row">
                        <span className="firm-tag-pill">
                            <Hospital size={13} />
                            Sağlık & Klinik Randevu Yönetimi
                        </span>
                        <span className="super-admin-badge">
                            Super Admin
                        </span>
                    </div>
                    <h1 className="firm-page-title">
                        Klinik & Hekim Kadrosu Yönetimi
                    </h1>
                    <p className="firm-page-desc">
                        Klinik polikliniklerini, hekim kadrolarını, haftalık mesai saatlerini ve CRM temsilci eşleşmelerini yapılandırın.
                    </p>
                </div>

                <div className="firm-header-actions">
                    <button 
                        className="btn-seed-demo" 
                        onClick={handleSeedHealthDemo}
                        disabled={seeding}
                        title="Hazır sağlık branşları ve hekim örneklerini otomatik yükler"
                    >
                        <Sparkles size={16} />
                        {seeding ? 'Oluşturuluyor...' : 'Örnek Sağlık Verisi Yükle'}
                    </button>
                    <button className="btn-primary-header" onClick={() => openCreateDoctorModal()}>
                        <Plus size={16} />
                        Yeni Hekim Ekle
                    </button>
                </div>
            </div>

            {/* Toast Feedback */}
            {toastMessage && (
                <div className={`firm-toast ${toastMessage.type === 'error' ? 'toast-error' : 'toast-success'}`}>
                    {toastMessage.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
                    <span>{toastMessage.text}</span>
                </div>
            )}

            {/* 2. Executive KPI Summary Cards */}
            <div className="firm-stats-grid">
                <div className="firm-stat-card">
                    <div className="stat-icon-box stat-blue">
                        <Layers size={22} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">Tıbbi Branşlar</span>
                        <div className="stat-val-group">
                            <span className="stat-value">{branches.length}</span>
                            <span className="stat-sub">Poliklinik</span>
                        </div>
                    </div>
                </div>

                <div className="firm-stat-card">
                    <div className="stat-icon-box stat-emerald">
                        <Stethoscope size={22} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">Hekim Kadrosu</span>
                        <div className="stat-val-group">
                            <span className="stat-value">{allDoctors.length}</span>
                            <span className="stat-sub">({activeDoctorsCount} aktif)</span>
                        </div>
                    </div>
                </div>

                <div className="firm-stat-card">
                    <div className="stat-icon-box stat-purple">
                        <UserCheck size={22} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">Temsilci Eşleşmesi</span>
                        <div className="stat-val-group">
                            <span className="stat-value">{assignedDoctorsCount} / {allDoctors.length}</span>
                            <span className="stat-sub">
                                {unassignedDoctorsCount > 0 ? `${unassignedDoctorsCount} hekim havuzda` : 'Tamamı eşleşti'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="firm-stat-card">
                    <div className="stat-icon-box stat-amber">
                        <Clock size={22} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">Randevu Seansı</span>
                        <div className="stat-val-group">
                            <span className="stat-value">30 Dk</span>
                            <span className="stat-sub">Standart slot</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. Modern Segmented Tab Bar */}
            <div className="firm-tabs-wrapper">
                <div className="firm-segmented-nav">
                    <button 
                        className={`firm-segment-btn ${activeTab === 'doctors' ? 'active' : ''}`}
                        onClick={() => setActiveTab('doctors')}
                    >
                        <UserCheck size={17} />
                        Hekimler & Çalışma Saatleri
                        <span className="segment-counter">{allDoctors.length}</span>
                    </button>
                    <button 
                        className={`firm-segment-btn ${activeTab === 'branches' ? 'active' : ''}`}
                        onClick={() => setActiveTab('branches')}
                    >
                        <Stethoscope size={17} />
                        Tıbbi Branşlar & Poliklinikler
                        <span className="segment-counter">{branches.length}</span>
                    </button>
                </div>

                <div className="firm-tabs-action">
                    {activeTab === 'doctors' ? (
                        <button className="btn-secondary-action" onClick={() => openCreateDoctorModal()}>
                            <Plus size={15} /> Hekim Ekle
                        </button>
                    ) : (
                        <button className="btn-secondary-action" onClick={openCreateBranchModal}>
                            <Plus size={15} /> Branş Ekle
                        </button>
                    )}
                </div>
            </div>

            {/* 4. Tab Content Panels */}
            <div className="firm-main-panel">
                {/* ────────────────── HEKİMLER TAB ────────────────── */}
                {activeTab === 'doctors' && (
                    <div className="firm-panel-body">
                        {/* Search & Filters Toolbar */}
                        <div className="firm-toolbar">
                            <div className="firm-search-input-box">
                                <Search size={16} className="search-icon" />
                                <input 
                                    type="text" 
                                    placeholder="Hekim adı, unvan veya branş ara..."
                                    value={doctorSearchQuery}
                                    onChange={e => setDoctorSearchQuery(e.target.value)}
                                    className="firm-search-field"
                                />
                                {doctorSearchQuery && (
                                    <button className="search-clear-btn" onClick={() => setDoctorSearchQuery('')}>
                                        <X size={14} />
                                    </button>
                                )}
                            </div>

                            <div className="firm-filter-group">
                                <div className="firm-select-wrapper">
                                    <Filter size={14} className="filter-icon" />
                                    <select 
                                        className="firm-filter-select"
                                        value={selectedBranchFilter}
                                        onChange={e => setSelectedBranchFilter(e.target.value)}
                                    >
                                        <option value="ALL">Tüm Branşlar ({branches.length})</option>
                                        {branches.map(b => (
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="firm-select-wrapper">
                                    <UserCheck size={14} className="filter-icon" />
                                    <select 
                                        className="firm-filter-select"
                                        value={selectedUserFilter}
                                        onChange={e => setSelectedUserFilter(e.target.value)}
                                    >
                                        <option value="ALL">Tüm Temsilciler</option>
                                        <option value="ASSIGNED">Temsilciye Bağlı ({assignedDoctorsCount})</option>
                                        <option value="UNASSIGNED">Genel Havuz ({unassignedDoctorsCount})</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Doctors Data Table */}
                        {filteredDoctors.length === 0 ? (
                            <div className="firm-empty-state">
                                <div className="empty-icon-box">
                                    <Stethoscope size={36} />
                                </div>
                                <h3>{allDoctors.length === 0 ? 'Henüz Hekim Tanımlanmadı' : 'Aramaya Uygun Hekim Bulunamadı'}</h3>
                                <p>
                                    {allDoctors.length === 0 
                                        ? 'Randevu dağıtımının çalışabilmesi için hekim kadronuzu ve haftalık mesai saatlerini tanımlayın.'
                                        : 'Arama kriterlerinizi değiştirin veya filtreleri temizleyin.'}
                                </p>
                                {allDoctors.length === 0 ? (
                                    <div className="empty-actions">
                                        <button className="btn-primary-action" onClick={() => openCreateDoctorModal()}>
                                            <Plus size={16} /> İlk Hekimi Ekle
                                        </button>
                                        <button className="btn-seed-demo" onClick={handleSeedHealthDemo}>
                                            <Sparkles size={16} /> Örnek Kadroyu Yükle
                                        </button>
                                    </div>
                                ) : (
                                    <button 
                                        className="btn-modal-cancel" 
                                        onClick={() => { setDoctorSearchQuery(''); setSelectedBranchFilter('ALL'); setSelectedUserFilter('ALL'); }}
                                    >
                                        Filtreleri Temizle
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="firm-table-container">
                                <table className="firm-pro-table">
                                    <thead>
                                        <tr>
                                            <th>Hekim Bilgisi</th>
                                            <th>Tıbbi Branş</th>
                                            <th>Bağlı CRM Temsilcisi</th>
                                            <th>Mesai & Seans</th>
                                            <th>Çalışma Günleri</th>
                                            <th>Durum</th>
                                            <th className="th-actions">İşlemler</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredDoctors.map(doc => {
                                            const assignedUser = workspaceUsers.find(u => u.id === doc.userId);
                                            let workingDaysArr = [];
                                            try {
                                                if (doc.workingDays) workingDaysArr = JSON.parse(doc.workingDays);
                                            } catch (_) {}

                                            const doctorInitial = (doc.name || 'D').trim().charAt(0).toUpperCase();

                                            return (
                                                <tr key={doc.id} className={!doc.isActive ? 'row-inactive' : ''}>
                                                    {/* Doctor Info */}
                                                    <td>
                                                        <div className="pro-doctor-cell">
                                                            <div className="doctor-pro-avatar">
                                                                <span>{doctorInitial}</span>
                                                                <span className={`status-dot ${doc.isActive ? 'active' : 'inactive'}`} />
                                                            </div>
                                                            <div className="doctor-cell-meta">
                                                                <div className="doctor-cell-name">
                                                                    {doc.title && <span className="doctor-title-prefix">{doc.title}</span>}
                                                                    <strong>{doc.name}</strong>
                                                                </div>
                                                                <span className="doctor-cell-sub">
                                                                    {doc.isActive ? 'Aktif Randevu Alabilir' : 'Randevuya Kapalı'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Branch */}
                                                    <td>
                                                        <span className="branch-pill-badge">
                                                            {doc.branchName}
                                                        </span>
                                                    </td>

                                                    {/* CRM User */}
                                                    <td>
                                                        {assignedUser ? (
                                                            <div className="pro-assigned-user-badge">
                                                                <UserCheck size={14} className="user-icon-check" />
                                                                <div className="assigned-user-meta">
                                                                    <span className="user-name">{assignedUser.name}</span>
                                                                    <span className="user-email">{assignedUser.email}</span>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <span className="pool-user-badge">
                                                                <Users size={13} />
                                                                Genel Havuz (Atanmadı)
                                                            </span>
                                                        )}
                                                    </td>

                                                    {/* Work Hours & Slot */}
                                                    <td>
                                                        <div className="timing-cell">
                                                            <div className="timing-hours">
                                                                <Clock size={13} />
                                                                <span>{doc.workStart || '09:00'} – {doc.workEnd || '17:00'}</span>
                                                            </div>
                                                            <span className="slot-badge">
                                                                {doc.slotMinutes || 30} dk / seans
                                                            </span>
                                                        </div>
                                                    </td>

                                                    {/* Working Days */}
                                                    <td>
                                                        <div className="days-strip">
                                                            {TURKISH_DAYS.map(day => {
                                                                const isWorking = workingDaysArr.includes(day.key);
                                                                return (
                                                                    <span 
                                                                        key={day.key} 
                                                                        className={`day-strip-pill ${isWorking ? 'active' : 'inactive'}`}
                                                                        title={day.label}
                                                                    >
                                                                        {day.short}
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    </td>

                                                    {/* Status Badge */}
                                                    <td>
                                                        <span className={`pro-status-badge ${doc.isActive ? 'badge-active' : 'badge-inactive'}`}>
                                                            {doc.isActive ? 'Aktif' : 'Pasif'}
                                                        </span>
                                                    </td>

                                                    {/* Actions */}
                                                    <td className="td-actions">
                                                        <div className="action-buttons-group">
                                                            <button 
                                                                className="btn-pro-action edit" 
                                                                onClick={() => openEditDoctorModal(doc)}
                                                                title="Hekim Bilgilerini Düzenle"
                                                            >
                                                                <Edit2 size={14} />
                                                            </button>
                                                            <button 
                                                                className="btn-pro-action delete" 
                                                                onClick={() => handleDeleteDoctor(doc.id, doc.name)}
                                                                title="Hekimi Sil"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* ────────────────── BRANŞLAR TAB ────────────────── */}
                {activeTab === 'branches' && (
                    <div className="firm-panel-body">
                        {/* Branch Toolbar */}
                        <div className="firm-toolbar">
                            <div className="firm-search-input-box" style={{ maxWidth: '360px' }}>
                                <Search size={16} className="search-icon" />
                                <input 
                                    type="text" 
                                    placeholder="Branş veya poliklinik ara..."
                                    value={branchSearchQuery}
                                    onChange={e => setBranchSearchQuery(e.target.value)}
                                    className="firm-search-field"
                                />
                                {branchSearchQuery && (
                                    <button className="search-clear-btn" onClick={() => setBranchSearchQuery('')}>
                                        <X size={14} />
                                    </button>
                                )}
                            </div>

                            <button className="btn-primary-action" onClick={openCreateBranchModal}>
                                <Plus size={16} /> Yeni Branş Ekle
                            </button>
                        </div>

                        {filteredBranches.length === 0 ? (
                            <div className="firm-empty-state">
                                <div className="empty-icon-box">
                                    <Layers size={36} />
                                </div>
                                <h3>{branches.length === 0 ? 'Henüz Branş Tanımlanmadı' : 'Aradığınız Kriterde Branş Yok'}</h3>
                                <p>
                                    {branches.length === 0 
                                        ? 'Klinik bölümlerinizi (Ağız ve Diş, Kardiyoloji, Göz vb.) oluşturarak hekimlerinizi bu branşlara bağlayın.'
                                        : 'Arama teriminizi kontrol edin.'}
                                </p>
                                {branches.length === 0 && (
                                    <div className="empty-actions">
                                        <button className="btn-primary-action" onClick={openCreateBranchModal}>
                                            <Plus size={16} /> Branş Oluştur
                                        </button>
                                        <button className="btn-seed-demo" onClick={handleSeedHealthDemo}>
                                            <Sparkles size={16} /> Örnek Branşları Yükle
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="pro-branches-grid">
                                {filteredBranches.map(branch => {
                                    const docs = branch.doctors || [];
                                    return (
                                        <div key={branch.id} className="pro-branch-card">
                                            {/* Card Top */}
                                            <div className="branch-card-top">
                                                <div className="branch-icon-badge">
                                                    <Stethoscope size={18} />
                                                </div>
                                                <div className="branch-meta-info">
                                                    <h3 className="branch-card-title">{branch.name}</h3>
                                                    <span className="branch-card-count">
                                                        {docs.length} Tanımlı Hekim
                                                    </span>
                                                </div>
                                                <div className="branch-card-actions">
                                                    <button 
                                                        className="btn-pro-action edit"
                                                        onClick={() => openEditBranchModal(branch)}
                                                        title="Branşı Düzenle"
                                                    >
                                                        <Edit2 size={13} />
                                                    </button>
                                                    <button 
                                                        className="btn-pro-action delete"
                                                        onClick={() => handleDeleteBranch(branch.id, branch.name)}
                                                        title="Branşı Sil"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Doctor Roster in Branch */}
                                            <div className="branch-card-roster">
                                                <span className="roster-heading">Kadro:</span>
                                                {docs.length === 0 ? (
                                                    <p className="no-docs-hint">Bu branşta henüz hekim bulunmuyor.</p>
                                                ) : (
                                                    <div className="branch-doctor-chips-wrap">
                                                        {docs.map(doc => (
                                                            <div key={doc.id} className="branch-doc-chip">
                                                                <span className="doc-chip-initial">
                                                                    {(doc.name || 'D').charAt(0)}
                                                                </span>
                                                                <span className="doc-chip-name">
                                                                    {doc.title ? `${doc.title} ` : ''}{doc.name}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Card Footer CTA */}
                                            <div className="branch-card-footer">
                                                <button 
                                                    className="btn-add-doc-to-branch"
                                                    onClick={() => openCreateDoctorModal(branch.id)}
                                                >
                                                    <Plus size={14} /> Bu Branşa Hekim Ekle
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ────────────────── BRANCH MODAL ────────────────── */}
            {branchModalOpen && (
                <div className="firm-modal-backdrop" onClick={() => setBranchModalOpen(false)}>
                    <div className="firm-modal-container" onClick={e => e.stopPropagation()}>
                        <div className="firm-modal-header">
                            <div className="modal-title-wrap">
                                <div className="modal-title-icon">
                                    <Layers size={20} />
                                </div>
                                <div>
                                    <h3>{editingBranch ? 'Branşı Düzenle' : 'Yeni Tıbbi Branş / Poliklinik'}</h3>
                                    <p className="modal-subtitle">Klinik biriminizin adını girin.</p>
                                </div>
                            </div>
                            <button className="firm-modal-close" onClick={() => setBranchModalOpen(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveBranch}>
                            <div className="firm-modal-body">
                                <div className="firm-form-group">
                                    <label>Branş / Poliklinik Adı <span className="req-star">*</span></label>
                                    <input 
                                        type="text" 
                                        className="firm-form-input"
                                        placeholder="Örn: Ağız ve Diş Sağlığı, Kardiyoloji, Göz vb."
                                        value={branchName}
                                        onChange={e => setBranchName(e.target.value)}
                                        required
                                        autoFocus
                                    />
                                    <span className="field-hint">
                                        WhatsApp ve web botları, hasta talebini bu branş isimleriyle eşleştirir.
                                    </span>
                                </div>
                            </div>
                            <div className="firm-modal-footer">
                                <button type="button" className="btn-modal-cancel" onClick={() => setBranchModalOpen(false)}>
                                    İptal
                                </button>
                                <button type="submit" className="btn-modal-submit">
                                    <Check size={16} />
                                    {editingBranch ? 'Değişiklikleri Kaydet' : 'Branşı Oluştur'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ────────────────── DOCTOR MODAL ────────────────── */}
            {doctorModalOpen && (
                <div className="firm-modal-backdrop" onClick={() => setDoctorModalOpen(false)}>
                    <div className="firm-modal-container doctor-modal-width" onClick={e => e.stopPropagation()}>
                        <div className="firm-modal-header">
                            <div className="modal-title-wrap">
                                <div className="modal-title-icon doc-icon-color">
                                    <Stethoscope size={20} />
                                </div>
                                <div>
                                    <h3>{editingDoctor ? 'Hekim Bilgilerini Düzenle' : 'Yeni Hekim / Uzman Tanımla'}</h3>
                                    <p className="modal-subtitle">Mesai saatleri, seans süresi ve CRM temsilci eşleşmesini yapılandırın.</p>
                                </div>
                            </div>
                            <button className="firm-modal-close" onClick={() => setDoctorModalOpen(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveDoctor}>
                            <div className="firm-modal-body">
                                {/* Title & Name */}
                                <div className="firm-form-row">
                                    <div className="firm-form-group" style={{ flex: '0 0 160px' }}>
                                        <label>Unvan</label>
                                        <select 
                                            className="firm-form-select"
                                            value={doctorForm.title}
                                            onChange={e => setDoctorForm({ ...doctorForm, title: e.target.value })}
                                        >
                                            <option value="Prof. Dr.">Prof. Dr.</option>
                                            <option value="Doç. Dr.">Doç. Dr.</option>
                                            <option value="Uzm. Dr.">Uzm. Dr.</option>
                                            <option value="Op. Dr.">Op. Dr.</option>
                                            <option value="Dt.">Dt. (Diş Hekimi)</option>
                                            <option value="Uzm. Dt.">Uzm. Dt.</option>
                                            <option value="Dr.">Dr.</option>
                                            <option value="Fzt.">Fzt. (Fizyoterapist)</option>
                                            <option value="Dyt.">Dyt. (Diyetisyen)</option>
                                            <option value="Psk.">Psk. (Psikolog)</option>
                                        </select>
                                    </div>
                                    <div className="firm-form-group" style={{ flex: 1 }}>
                                        <label>Hekim Adı Soyadı <span className="req-star">*</span></label>
                                        <input 
                                            type="text" 
                                            className="firm-form-input"
                                            placeholder="Örn: Mehmet Özkan"
                                            value={doctorForm.name}
                                            onChange={e => setDoctorForm({ ...doctorForm, name: e.target.value })}
                                            required
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                {/* Branch & Assigned CRM User */}
                                <div className="firm-form-row">
                                    <div className="firm-form-group" style={{ flex: 1 }}>
                                        <label>Bağlı Tıbbi Branş <span className="req-star">*</span></label>
                                        <select 
                                            className="firm-form-select"
                                            value={doctorForm.branchId}
                                            onChange={e => setDoctorForm({ ...doctorForm, branchId: e.target.value })}
                                            required
                                        >
                                            <option value="">Branş Seçin...</option>
                                            {branches.map(b => (
                                                <option key={b.id} value={b.id}>{b.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="firm-form-group" style={{ flex: 1 }}>
                                        <label>Sistem Temsilcisi (CRM Kullanıcısı)</label>
                                        <select 
                                            className="firm-form-select"
                                            value={doctorForm.userId}
                                            onChange={e => setDoctorForm({ ...doctorForm, userId: e.target.value })}
                                        >
                                            <option value="">Kullanıcıya Bağlama (Genel Havuz)</option>
                                            {workspaceUsers.map(u => (
                                                <option key={u.id} value={u.id}>
                                                    {u.name} ({u.email})
                                                </option>
                                            ))}
                                        </select>
                                        <span className="field-hint">
                                            Bu hekime alınan randevular, seçilen personelin takvimine ve bildirimlerine yansır.
                                        </span>
                                    </div>
                                </div>

                                {/* Hours & Slot */}
                                <div className="firm-form-row">
                                    <div className="firm-form-group" style={{ flex: 1 }}>
                                        <label>Mesai Başlangıç</label>
                                        <input 
                                            type="time" 
                                            className="firm-form-input"
                                            value={doctorForm.workStart}
                                            onChange={e => setDoctorForm({ ...doctorForm, workStart: e.target.value })}
                                        />
                                    </div>
                                    <div className="firm-form-group" style={{ flex: 1 }}>
                                        <label>Mesai Bitiş</label>
                                        <input 
                                            type="time" 
                                            className="firm-form-input"
                                            value={doctorForm.workEnd}
                                            onChange={e => setDoctorForm({ ...doctorForm, workEnd: e.target.value })}
                                        />
                                    </div>
                                    <div className="firm-form-group" style={{ flex: 1 }}>
                                        <label>Seans Süresi</label>
                                        <select 
                                            className="firm-form-select"
                                            value={doctorForm.slotMinutes}
                                            onChange={e => setDoctorForm({ ...doctorForm, slotMinutes: parseInt(e.target.value) })}
                                        >
                                            <option value={15}>15 Dakika</option>
                                            <option value={20}>20 Dakika</option>
                                            <option value={30}>30 Dakika (Standart)</option>
                                            <option value={45}>45 Dakika</option>
                                            <option value={60}>60 Dakika (1 Saat)</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Working Days Button Selector */}
                                <div className="firm-form-group">
                                    <div className="label-with-presets">
                                        <label>Çalışma Günleri</label>
                                        <div className="preset-buttons">
                                            <button type="button" className="preset-link-btn" onClick={setWeekdayPreset}>
                                                Haftaiçi (Pzt-Cum)
                                            </button>
                                            <span>•</span>
                                            <button type="button" className="preset-link-btn" onClick={setFullWeekPreset}>
                                                Pzt-Cmt
                                            </button>
                                        </div>
                                    </div>
                                    <div className="days-toggle-grid">
                                        {TURKISH_DAYS.map(day => {
                                            const isSelected = doctorForm.workingDays.includes(day.key);
                                            return (
                                                <button
                                                    type="button"
                                                    key={day.key}
                                                    className={`day-toggle-card ${isSelected ? 'selected' : ''}`}
                                                    onClick={() => toggleDay(day.key)}
                                                >
                                                    <div className="day-check-indicator">
                                                        {isSelected && <Check size={12} />}
                                                    </div>
                                                    <span className="day-toggle-name">{day.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Active Toggle */}
                                <div className="firm-form-group status-toggle-box">
                                    <label className="toggle-switch-label">
                                        <input 
                                            type="checkbox"
                                            checked={doctorForm.isActive}
                                            onChange={e => setDoctorForm({ ...doctorForm, isActive: e.target.checked })}
                                            className="native-toggle-input"
                                        />
                                        <span className="toggle-slider" />
                                        <div className="toggle-label-meta">
                                            <strong>Hekim Randevuya Açık</strong>
                                            <span>Pasife alındığında hastalara bu hekim için yeni randevu önerilmez.</span>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            <div className="firm-modal-footer">
                                <button type="button" className="btn-modal-cancel" onClick={() => setDoctorModalOpen(false)}>
                                    İptal
                                </button>
                                <button type="submit" className="btn-modal-submit">
                                    <Check size={16} />
                                    {editingDoctor ? 'Hekim Bilgilerini Kaydet' : 'Hekimi Kadroya Ekle'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
