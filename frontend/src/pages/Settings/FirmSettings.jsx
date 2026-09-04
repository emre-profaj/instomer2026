import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { appointmentConfigAPI } from '../../services/api';
import { 
    Stethoscope, Plus, Edit2, Trash2, Sparkles, Clock, Calendar, 
    UserCheck, ShieldAlert, X, Check, Search, Filter, Users, 
    Layers, ChevronRight, CheckCircle2, AlertCircle, RefreshCw,
    Activity, Hospital, Building2, MapPin, Phone
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
    const [activeTab, setActiveTab] = useState('doctors'); // 'doctors' | 'branches' | 'locations'

    const [locations, setLocations] = useState([]);
    const [branches, setBranches] = useState([]);
    const [workspaceUsers, setWorkspaceUsers] = useState([]);

    // Search & Filter State
    const [doctorSearchQuery, setDoctorSearchQuery] = useState('');
    const [selectedBranchFilter, setSelectedBranchFilter] = useState('ALL');
    const [selectedLocationFilter, setSelectedLocationFilter] = useState('ALL');
    const [selectedUserFilter, setSelectedUserFilter] = useState('ALL');

    const [branchSearchQuery, setBranchSearchQuery] = useState('');
    const [locationSearchQuery, setLocationSearchQuery] = useState('');

    // Location Modal State
    const [locationModalOpen, setLocationModalOpen] = useState(false);
    const [editingLocation, setEditingLocation] = useState(null);
    const [locationForm, setLocationForm] = useState({
        name: '',
        address: '',
        phone: '',
        isActive: true
    });

    // Branch Modal State
    const [branchModalOpen, setBranchModalOpen] = useState(false);
    const [editingBranch, setEditingBranch] = useState(null);
    const [branchName, setBranchName] = useState('');

    // Doctor Modal State
    const [doctorModalOpen, setDoctorModalOpen] = useState(false);
    const [editingDoctor, setEditingDoctor] = useState(null);
    const [doctorForm, setDoctorForm] = useState({
        branchId: '',
        locationId: '',
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
                setLocations(res.data.locations || []);
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
        if (!confirm('Sağlık sektörü için hazır şubeler, branşlar ve hekim kadrosu örneği eklensin mi?')) return;
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

    // ─── LOCATION (ŞUBE) HANDLERS ───
    const openCreateLocationModal = () => {
        setEditingLocation(null);
        setLocationForm({
            name: '',
            address: '',
            phone: '',
            isActive: true
        });
        setLocationModalOpen(true);
    };

    const openEditLocationModal = (loc) => {
        setEditingLocation(loc);
        setLocationForm({
            name: loc.name || '',
            address: loc.address || '',
            phone: loc.phone || '',
            isActive: loc.isActive ?? true
        });
        setLocationModalOpen(true);
    };

    const handleSaveLocation = async (e) => {
        e.preventDefault();
        if (!locationForm.name.trim()) {
            showToast('Lütfen şube adını girin', 'error');
            return;
        }

        try {
            if (editingLocation) {
                await appointmentConfigAPI.updateLocation(currentWorkspace.id, editingLocation.id, locationForm);
                showToast('Şube bilgileri güncellendi.');
            } else {
                await appointmentConfigAPI.createLocation(currentWorkspace.id, locationForm);
                showToast('Yeni klinik şubesi oluşturuldu.');
            }
            setLocationModalOpen(false);
            loadSettings();
        } catch (err) {
            showToast(err.response?.data?.error || 'Şube kaydedilemedi', 'error');
        }
    };

    const handleDeleteLocation = async (locId, locName) => {
        if (!confirm(`"${locName}" şubesini silmek istediğinize emin misiniz?`)) return;
        try {
            await appointmentConfigAPI.deleteLocation(currentWorkspace.id, locId);
            showToast('Şube silindi.');
            loadSettings();
        } catch (err) {
            showToast('Silme işlemi başarısız', 'error');
        }
    };

    // ─── BRANCH (BRANŞ) HANDLERS ───
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
        if (!confirm(`"${bName}" branşını ve altındaki hekim eşleşmelerini silmek istediğinize emin misiniz?`)) return;
        try {
            await appointmentConfigAPI.deleteBranch(currentWorkspace.id, branchId);
            showToast('Branş silindi.');
            loadSettings();
        } catch (err) {
            showToast('Silme işlemi başarısız', 'error');
        }
    };

    // ─── DOCTOR (HEKİM) HANDLERS ───
    const openCreateDoctorModal = (preselected = {}) => {
        setEditingDoctor(null);
        setDoctorForm({
            branchId: preselected.branchId || (branches[0]?.id || ''),
            locationId: preselected.locationId || (locations[0]?.id || ''),
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
            branchId: doctor.branchId || '',
            locationId: doctor.locationId || (locations[0]?.id || ''),
            name: doctor.name || '',
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
            showToast('Lütfen hekim adı ve tıbbi branşını eksiksiz doldurun', 'error');
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
        return branches.flatMap(b => (b.doctors || []).map(d => ({
            ...d,
            branchName: b.name
        })));
    }, [branches]);

    // KPI Metrics
    const activeDoctorsCount = allDoctors.filter(d => d.isActive).length;
    const assignedDoctorsCount = allDoctors.filter(d => d.userId).length;
    const unassignedDoctorsCount = allDoctors.length - assignedDoctorsCount;

    // Filtered Doctors
    const filteredDoctors = useMemo(() => {
        return allDoctors.filter(doc => {
            const matchSearch = doctorSearchQuery === '' || 
                doc.name?.toLowerCase().includes(doctorSearchQuery.toLowerCase()) ||
                doc.title?.toLowerCase().includes(doctorSearchQuery.toLowerCase()) ||
                doc.branchName?.toLowerCase().includes(doctorSearchQuery.toLowerCase()) ||
                doc.locationName?.toLowerCase().includes(doctorSearchQuery.toLowerCase());

            const matchBranch = selectedBranchFilter === 'ALL' || doc.branchId === selectedBranchFilter;
            const matchLocation = selectedLocationFilter === 'ALL' || doc.locationId === selectedLocationFilter;

            let matchUser = true;
            if (selectedUserFilter === 'ASSIGNED') {
                matchUser = !!doc.userId;
            } else if (selectedUserFilter === 'UNASSIGNED') {
                matchUser = !doc.userId;
            }

            return matchSearch && matchBranch && matchLocation && matchUser;
        });
    }, [allDoctors, doctorSearchQuery, selectedBranchFilter, selectedLocationFilter, selectedUserFilter]);

    // Filtered Branches
    const filteredBranches = useMemo(() => {
        if (!branchSearchQuery) return branches;
        return branches.filter(b => b.name?.toLowerCase().includes(branchSearchQuery.toLowerCase()));
    }, [branches, branchSearchQuery]);

    // Filtered Locations
    const filteredLocations = useMemo(() => {
        if (!locationSearchQuery) return locations;
        return locations.filter(l => 
            l.name?.toLowerCase().includes(locationSearchQuery.toLowerCase()) ||
            l.address?.toLowerCase().includes(locationSearchQuery.toLowerCase())
        );
    }, [locations, locationSearchQuery]);

    return (
        <div className="firm-settings-page">
            {/* 1. Header Banner */}
            <div className="firm-header">
                <div className="firm-header-left">
                    <div className="firm-badge-row">
                        <span className="firm-tag-pill">
                            <Hospital size={13} />
                            Sağlık & Klinik Randevu Modülü
                        </span>
                        <span className="super-admin-badge">
                            Super Admin
                        </span>
                    </div>
                    <h1 className="firm-page-title">
                        Sağlık & Klinik Yönetimi
                    </h1>
                    <p className="firm-page-desc">
                        Klinik şubelerini, tıbbi branşları, hekim kadrosunu ve çalışma saatlerini ayrı bölümler halinde yapılandırın.
                    </p>
                </div>

                <div className="firm-header-actions">
                    <button 
                        className="btn-seed-demo" 
                        onClick={handleSeedHealthDemo}
                        disabled={seeding}
                        title="Hazır şubeler, tıbbi branşlar ve hekim kadrosu örneğini otomatik yükler"
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
                <div className="firm-stat-card" onClick={() => setActiveTab('locations')} style={{ cursor: 'pointer' }}>
                    <div className="stat-icon-box stat-purple">
                        <Building2 size={22} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">Klinik Şubeleri</span>
                        <div className="stat-val-group">
                            <span className="stat-value">{locations.length}</span>
                            <span className="stat-sub">Lokasyon</span>
                        </div>
                    </div>
                </div>

                <div className="firm-stat-card" onClick={() => setActiveTab('branches')} style={{ cursor: 'pointer' }}>
                    <div className="stat-icon-box stat-blue">
                        <Layers size={22} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">Tıbbi Branşlar</span>
                        <div className="stat-val-group">
                            <span className="stat-value">{branches.length}</span>
                            <span className="stat-sub">Bölüm / Servis</span>
                        </div>
                    </div>
                </div>

                <div className="firm-stat-card" onClick={() => setActiveTab('doctors')} style={{ cursor: 'pointer' }}>
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
                    <div className="stat-icon-box stat-amber">
                        <UserCheck size={22} />
                    </div>
                    <div className="stat-content">
                        <span className="stat-label">Temsilci Eşleşmesi</span>
                        <div className="stat-val-group">
                            <span className="stat-value">{assignedDoctorsCount} / {allDoctors.length}</span>
                            <span className="stat-sub">
                                {unassignedDoctorsCount > 0 ? `${unassignedDoctorsCount} havuzda` : 'Tamamı eşleşti'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. 3-Tier Segmented Tab Bar: Şubeler / Branşlar / Doktorlar */}
            <div className="firm-tabs-wrapper">
                <div className="firm-segmented-nav">
                    <button 
                        className={`firm-segment-btn ${activeTab === 'doctors' ? 'active' : ''}`}
                        onClick={() => setActiveTab('doctors')}
                    >
                        <UserCheck size={17} />
                        Doktorlar & Uzmanlar
                        <span className="segment-counter">{allDoctors.length}</span>
                    </button>

                    <button 
                        className={`firm-segment-btn ${activeTab === 'branches' ? 'active' : ''}`}
                        onClick={() => setActiveTab('branches')}
                    >
                        <Stethoscope size={17} />
                        Tıbbi Branşlar
                        <span className="segment-counter">{branches.length}</span>
                    </button>

                    <button 
                        className={`firm-segment-btn ${activeTab === 'locations' ? 'active' : ''}`}
                        onClick={() => setActiveTab('locations')}
                    >
                        <Building2 size={17} />
                        Şubeler & Lokasyonlar
                        <span className="segment-counter">{locations.length}</span>
                    </button>
                </div>

                <div className="firm-tabs-action">
                    {activeTab === 'doctors' && (
                        <button className="btn-secondary-action" onClick={() => openCreateDoctorModal()}>
                            <Plus size={15} /> Yeni Hekim Ekle
                        </button>
                    )}
                    {activeTab === 'branches' && (
                        <button className="btn-secondary-action" onClick={openCreateBranchModal}>
                            <Plus size={15} /> Yeni Branş Ekle
                        </button>
                    )}
                    {activeTab === 'locations' && (
                        <button className="btn-secondary-action" onClick={openCreateLocationModal}>
                            <Plus size={15} /> Yeni Şube Ekle
                        </button>
                    )}
                </div>
            </div>

            {/* 4. Tab Content Panels */}
            <div className="firm-main-panel">

                {/* ────────────────── 1. DOKTORLAR SEKMESİ ────────────────── */}
                {activeTab === 'doctors' && (
                    <div className="firm-panel-body">
                        {/* Search & Filters Toolbar */}
                        <div className="firm-toolbar">
                            <div className="firm-search-input-box">
                                <Search size={16} className="search-icon" />
                                <input 
                                    type="text" 
                                    placeholder="Hekim adı, unvan, şube veya branş ara..."
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
                                {/* Şube Filtresi */}
                                <div className="firm-select-wrapper">
                                    <Building2 size={14} className="filter-icon" />
                                    <select 
                                        className="firm-filter-select"
                                        value={selectedLocationFilter}
                                        onChange={e => setSelectedLocationFilter(e.target.value)}
                                    >
                                        <option value="ALL">Tüm Şubeler ({locations.length})</option>
                                        {locations.map(l => (
                                            <option key={l.id} value={l.id}>{l.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Branş Filtresi */}
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

                                {/* Temsilci Filtresi */}
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
                                        ? 'Randevu dağıtımının çalışabilmesi için hekim kadronuzu, çalıştığı şube ve branşı belirleyin.'
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
                                        onClick={() => { setDoctorSearchQuery(''); setSelectedBranchFilter('ALL'); setSelectedLocationFilter('ALL'); setSelectedUserFilter('ALL'); }}
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
                                            <th>Şube (Lokasyon)</th>
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

                                                    {/* Location (Şube) */}
                                                    <td>
                                                        <span className="location-pill-badge">
                                                            <Building2 size={12} />
                                                            {doc.locationName || 'Merkez Şube'}
                                                        </span>
                                                    </td>

                                                    {/* Branch (Branş) */}
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

                {/* ────────────────── 2. BRANŞLAR SEKMESİ ────────────────── */}
                {activeTab === 'branches' && (
                    <div className="firm-panel-body">
                        <div className="firm-toolbar">
                            <div className="firm-search-input-box" style={{ maxWidth: '360px' }}>
                                <Search size={16} className="search-icon" />
                                <input 
                                    type="text" 
                                    placeholder="Tıbbi branş veya bölüm ara..."
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
                                <h3>{branches.length === 0 ? 'Henüz Tıbbi Branş Tanımlanmadı' : 'Aradığınız Kriterde Branş Yok'}</h3>
                                <p>
                                    {branches.length === 0 
                                        ? 'Klinik branşlarınızı (Ağız ve Diş Sağlığı, Kardiyoloji, Göz vb.) oluşturarak hekimlerinizi bu branşlara bağlayın.'
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
                                                <span className="roster-heading">Bu Branştaki Hekimler:</span>
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
                                                                {doc.locationName && (
                                                                    <span className="doc-chip-loc">
                                                                        ({doc.locationName})
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Card Footer CTA */}
                                            <div className="branch-card-footer">
                                                <button 
                                                    className="btn-add-doc-to-branch"
                                                    onClick={() => openCreateDoctorModal({ branchId: branch.id })}
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

                {/* ────────────────── 3. ŞUBELER SEKMESİ ────────────────── */}
                {activeTab === 'locations' && (
                    <div className="firm-panel-body">
                        <div className="firm-toolbar">
                            <div className="firm-search-input-box" style={{ maxWidth: '360px' }}>
                                <Search size={16} className="search-icon" />
                                <input 
                                    type="text" 
                                    placeholder="Klinik şubesi veya adres ara..."
                                    value={locationSearchQuery}
                                    onChange={e => setLocationSearchQuery(e.target.value)}
                                    className="firm-search-field"
                                />
                                {locationSearchQuery && (
                                    <button className="search-clear-btn" onClick={() => setLocationSearchQuery('')}>
                                        <X size={14} />
                                    </button>
                                )}
                            </div>

                            <button className="btn-primary-action" onClick={openCreateLocationModal}>
                                <Plus size={16} /> Yeni Şube Ekle
                            </button>
                        </div>

                        {filteredLocations.length === 0 ? (
                            <div className="firm-empty-state">
                                <div className="empty-icon-box">
                                    <Building2 size={36} />
                                </div>
                                <h3>{locations.length === 0 ? 'Henüz Şube Tanımlanmadı' : 'Aradığınız Kriterde Şube Yok'}</h3>
                                <p>
                                    {locations.length === 0 
                                        ? 'Hastane veya klinik şubelerinizi (Örn: Kadıköy Şubesi, Nişantaşı Kliniği) tanımlayın.'
                                        : 'Arama teriminizi kontrol edin.'}
                                </p>
                                {locations.length === 0 && (
                                    <div className="empty-actions">
                                        <button className="btn-primary-action" onClick={openCreateLocationModal}>
                                            <Plus size={16} /> İlk Şubeyi Ekle
                                        </button>
                                        <button className="btn-seed-demo" onClick={handleSeedHealthDemo}>
                                            <Sparkles size={16} /> Örnek Şubeleri Yükle
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="pro-branches-grid">
                                {filteredLocations.map(loc => {
                                    const locDoctors = allDoctors.filter(d => d.locationId === loc.id);
                                    return (
                                        <div key={loc.id} className="pro-branch-card location-card-border">
                                            <div className="branch-card-top">
                                                <div className="branch-icon-badge loc-icon-theme">
                                                    <Building2 size={18} />
                                                </div>
                                                <div className="branch-meta-info">
                                                    <h3 className="branch-card-title">{loc.name}</h3>
                                                    <span className="branch-card-count">
                                                        {locDoctors.length} Görevli Hekim
                                                    </span>
                                                </div>
                                                <div className="branch-card-actions">
                                                    <button 
                                                        className="btn-pro-action edit"
                                                        onClick={() => openEditLocationModal(loc)}
                                                        title="Şubeyi Düzenle"
                                                    >
                                                        <Edit2 size={13} />
                                                    </button>
                                                    <button 
                                                        className="btn-pro-action delete"
                                                        onClick={() => handleDeleteLocation(loc.id, loc.name)}
                                                        title="Şubeyi Sil"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Address & Phone details */}
                                            <div className="location-details-box">
                                                {loc.address && (
                                                    <div className="loc-info-row">
                                                        <MapPin size={13} className="loc-info-icon" />
                                                        <span>{loc.address}</span>
                                                    </div>
                                                )}
                                                {loc.phone && (
                                                    <div className="loc-info-row">
                                                        <Phone size={13} className="loc-info-icon" />
                                                        <span>{loc.phone}</span>
                                                    </div>
                                                )}
                                                {!loc.address && !loc.phone && (
                                                    <span className="no-docs-hint">Adres ve telefon henüz belirtilmemiş.</span>
                                                )}
                                            </div>

                                            {/* Doctors assigned to this location */}
                                            <div className="branch-card-roster">
                                                <span className="roster-heading">Bu Şubedeki Hekimler:</span>
                                                {locDoctors.length === 0 ? (
                                                    <p className="no-docs-hint">Bu şubeye henüz hekim atanmadı.</p>
                                                ) : (
                                                    <div className="branch-doctor-chips-wrap">
                                                        {locDoctors.map(doc => (
                                                            <div key={doc.id} className="branch-doc-chip">
                                                                <span className="doc-chip-initial">
                                                                    {(doc.name || 'D').charAt(0)}
                                                                </span>
                                                                <span className="doc-chip-name">
                                                                    {doc.title ? `${doc.title} ` : ''}{doc.name}
                                                                </span>
                                                                <span className="doc-chip-branch-badge">
                                                                    {doc.branchName}
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
                                                    onClick={() => openCreateDoctorModal({ locationId: loc.id })}
                                                >
                                                    <Plus size={14} /> Bu Şubeye Hekim Ekle
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

            {/* ────────────────── 1. LOCATION MODAL (ŞUBE) ────────────────── */}
            {locationModalOpen && (
                <div className="firm-modal-backdrop" onClick={() => setLocationModalOpen(false)}>
                    <div className="firm-modal-container" onClick={e => e.stopPropagation()}>
                        <div className="firm-modal-header">
                            <div className="modal-title-wrap">
                                <div className="modal-title-icon loc-icon-theme">
                                    <Building2 size={20} />
                                </div>
                                <div>
                                    <h3>{editingLocation ? 'Klinik Şubesini Düzenle' : 'Yeni Klinik Şubesi / Lokasyon'}</h3>
                                    <p className="modal-subtitle">Hastane veya poliklinik şubenizin iletişim ve adres bilgilerini girin.</p>
                                </div>
                            </div>
                            <button className="firm-modal-close" onClick={() => setLocationModalOpen(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveLocation}>
                            <div className="firm-modal-body">
                                <div className="firm-form-group">
                                    <label>Şube / Lokasyon Adı <span className="req-star">*</span></label>
                                    <input 
                                        type="text" 
                                        className="firm-form-input"
                                        placeholder="Örn: Merkez Poliklinik (Kadıköy), Nişantaşı Şubesi"
                                        value={locationForm.name}
                                        onChange={e => setLocationForm({ ...locationForm, name: e.target.value })}
                                        required
                                        autoFocus
                                    />
                                </div>

                                <div className="firm-form-group">
                                    <label>Şube İletişim Telefonu</label>
                                    <input 
                                        type="text" 
                                        className="firm-form-input"
                                        placeholder="+90 216 444 0 100"
                                        value={locationForm.phone}
                                        onChange={e => setLocationForm({ ...locationForm, phone: e.target.value })}
                                    />
                                </div>

                                <div className="firm-form-group">
                                    <label>Şube Adresi & Lokasyon</label>
                                    <textarea 
                                        rows={2}
                                        className="firm-form-input"
                                        placeholder="Bağdat Cad. No: 124 Kadıköy / İstanbul"
                                        value={locationForm.address}
                                        onChange={e => setLocationForm({ ...locationForm, address: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="firm-modal-footer">
                                <button type="button" className="btn-modal-cancel" onClick={() => setLocationModalOpen(false)}>
                                    İptal
                                </button>
                                <button type="submit" className="btn-modal-submit">
                                    <Check size={16} />
                                    {editingLocation ? 'Değişiklikleri Kaydet' : 'Şubeyi Oluştur'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ────────────────── 2. BRANCH MODAL (BRANŞ) ────────────────── */}
            {branchModalOpen && (
                <div className="firm-modal-backdrop" onClick={() => setBranchModalOpen(false)}>
                    <div className="firm-modal-container" onClick={e => e.stopPropagation()}>
                        <div className="firm-modal-header">
                            <div className="modal-title-wrap">
                                <div className="modal-title-icon">
                                    <Layers size={20} />
                                </div>
                                <div>
                                    <h3>{editingBranch ? 'Tıbbi Branşı Düzenle' : 'Yeni Tıbbi Branş / Poliklinik'}</h3>
                                    <p className="modal-subtitle">Tıbbi uzmanlık veya poliklinik adını girin.</p>
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
                                        placeholder="Örn: Ağız ve Diş Sağlığı, Kardiyoloji, Göz Hastalıkları..."
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

            {/* ────────────────── 3. DOCTOR MODAL (DOKTOR) ────────────────── */}
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
                                    <p className="modal-subtitle">Şube, branş, mesai saatleri ve CRM temsilci eşleşmesini yapılandırın.</p>
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
                                        <label>Tıbbi Unvan</label>
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
                                            placeholder="Örn: Ahmet Yılmaz"
                                            value={doctorForm.name}
                                            onChange={e => setDoctorForm({ ...doctorForm, name: e.target.value })}
                                            required
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                {/* Şube & Branş Seçimleri */}
                                <div className="firm-form-row">
                                    <div className="firm-form-group" style={{ flex: 1 }}>
                                        <label>Görev Yaptığı Şube <span className="req-star">*</span></label>
                                        <select 
                                            className="firm-form-select"
                                            value={doctorForm.locationId}
                                            onChange={e => setDoctorForm({ ...doctorForm, locationId: e.target.value })}
                                        >
                                            {locations.length === 0 ? (
                                                <option value="">Merkez Şube</option>
                                            ) : (
                                                locations.map(loc => (
                                                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                                                ))
                                            )}
                                        </select>
                                    </div>

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
                                </div>

                                {/* CRM User */}
                                <div className="firm-form-group">
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
                                        Bu hekime alınan randevular, seçilen temsilcinin CRM bildirimlerine ve Google Takvimine otomatik işlenir.
                                    </span>
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
