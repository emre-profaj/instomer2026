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
    { key: 'monday', label: 'Pazartesi', letter: 'P', short: 'Pzt' },
    { key: 'tuesday', label: 'Salı', letter: 'S', short: 'Sal' },
    { key: 'wednesday', label: 'Çarşamba', letter: 'Ç', short: 'Çar' },
    { key: 'thursday', label: 'Perşembe', letter: 'P', short: 'Per' },
    { key: 'friday', label: 'Cuma', letter: 'C', short: 'Cum' },
    { key: 'saturday', label: 'Cumartesi', letter: 'C', short: 'Cmt' },
    { key: 'sunday', label: 'Pazar', letter: 'P', short: 'Paz' }
];

export default function FirmSettings() {
    const { currentWorkspace, user } = useAuth();

    // Super Admin Guard
    if (user?.role !== 'SUPER_ADMIN') {
        return (
            <div className="fs-access-denied">
                <div className="fs-denied-icon">
                    <ShieldAlert size={32} />
                </div>
                <h2>Yetkisiz Erişim</h2>
                <p>Bu alana yalnızca <strong>Süper Yöneticiler (Super Admin)</strong> erişebilir.</p>
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
        setTimeout(() => setToastMessage(null), 3500);
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
        if (!confirm('Örnek sağlık kadrosu (şubeler, tıbbi branşlar ve hekimler) yüklensin mi?')) return;
        try {
            setSeeding(true);
            const res = await appointmentConfigAPI.seedHealthDemo(currentWorkspace.id);
            showToast(res.data.message || 'Örnek veriler başarıyla yüklendi!');
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
        setLocationForm({ name: '', address: '', phone: '', isActive: true });
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
        if (!locationForm.name.trim()) return;

        try {
            if (editingLocation) {
                await appointmentConfigAPI.updateLocation(currentWorkspace.id, editingLocation.id, locationForm);
                showToast('Şube güncellendi.');
            } else {
                await appointmentConfigAPI.createLocation(currentWorkspace.id, locationForm);
                showToast('Yeni şube eklendi.');
            }
            setLocationModalOpen(false);
            loadSettings();
        } catch (err) {
            showToast(err.response?.data?.error || 'İşlem başarısız', 'error');
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
                showToast('Branş güncellendi.');
            } else {
                await appointmentConfigAPI.createBranch(currentWorkspace.id, { name: branchName.trim() });
                showToast('Yeni branş oluşturuldu.');
            }
            setBranchModalOpen(false);
            loadSettings();
        } catch (err) {
            showToast(err.response?.data?.error || 'İşlem başarısız', 'error');
        }
    };

    const handleDeleteBranch = async (branchId, bName) => {
        if (!confirm(`"${bName}" branşını silmek istediğinize emin misiniz?`)) return;
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
            showToast('Lütfen doktor adı ve branşını doldurun', 'error');
            return;
        }

        try {
            if (editingDoctor) {
                await appointmentConfigAPI.updateDoctor(currentWorkspace.id, editingDoctor.id, doctorForm);
                showToast('Hekim bilgileri güncellendi.');
            } else {
                await appointmentConfigAPI.createDoctor(currentWorkspace.id, doctorForm);
                showToast('Yeni hekim eklendi.');
            }
            setDoctorModalOpen(false);
            loadSettings();
        } catch (err) {
            showToast(err.response?.data?.error || 'Hekim kaydedilemedi', 'error');
        }
    };

    const handleDeleteDoctor = async (doctorId, docName) => {
        if (!confirm(`"${docName}" hekimini silmek istediğinize emin misiniz?`)) return;
        try {
            await appointmentConfigAPI.deleteDoctor(currentWorkspace.id, doctorId);
            showToast('Hekim silindi.');
            loadSettings();
        } catch (err) {
            showToast('Hekim silinemedi', 'error');
        }
    };

    const toggleDay = (dayKey) => {
        setDoctorForm(prev => {
            const exists = prev.workingDays.includes(dayKey);
            const nextDays = exists ? prev.workingDays.filter(d => d !== dayKey) : [...prev.workingDays, dayKey];
            return { ...prev, workingDays: nextDays };
        });
    };

    // Flatten all doctors
    const allDoctors = useMemo(() => {
        return branches.flatMap(b => (b.doctors || []).map(d => ({
            ...d,
            branchName: b.name
        })));
    }, [branches]);

    const activeDoctorsCount = allDoctors.filter(d => d.isActive).length;
    const assignedDoctorsCount = allDoctors.filter(d => d.userId).length;

    // Filtered Doctors
    const filteredDoctors = useMemo(() => {
        return allDoctors.filter(doc => {
            const fullName = `${doc.title || ''} ${doc.name || ''}`.toLowerCase();
            const matchSearch = doctorSearchQuery === '' || 
                fullName.includes(doctorSearchQuery.toLowerCase()) ||
                doc.branchName?.toLowerCase().includes(doctorSearchQuery.toLowerCase()) ||
                doc.locationName?.toLowerCase().includes(doctorSearchQuery.toLowerCase());

            const matchBranch = selectedBranchFilter === 'ALL' || doc.branchId === selectedBranchFilter;
            const matchLocation = selectedLocationFilter === 'ALL' || doc.locationId === selectedLocationFilter;

            let matchUser = true;
            if (selectedUserFilter === 'ASSIGNED') matchUser = !!doc.userId;
            else if (selectedUserFilter === 'UNASSIGNED') matchUser = !doc.userId;

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
        <div className="fs-container">
            {/* Header */}
            <div className="fs-header">
                <div className="fs-header-meta">
                    <div className="fs-category">
                        <span>Ayarlar</span>
                        <span className="fs-sep">/</span>
                        <span className="fs-active-cat">Sağlık & Klinik Yönetimi</span>
                        <span className="fs-role-pill">Super Admin</span>
                    </div>
                    <h1 className="fs-title">Klinik & Hekim Yapılandırması</h1>
                    <p className="fs-desc">
                        Klinik şubelerinizi, tıbbi uzmanlık branşlarınızı ve hekim kadronuzu tek merkezden yapılandırın.
                    </p>
                </div>

                <div className="fs-actions">
                    <button 
                        className="fs-btn-ghost" 
                        onClick={handleSeedHealthDemo}
                        disabled={seeding}
                    >
                        <Sparkles size={14} />
                        {seeding ? 'Yükleniyor...' : 'Örnek Kadroyu Yükle'}
                    </button>
                    <button 
                        className="fs-btn-primary" 
                        onClick={() => openCreateDoctorModal()}
                    >
                        <Plus size={15} />
                        Yeni Hekim
                    </button>
                </div>
            </div>

            {/* Toast */}
            {toastMessage && (
                <div className={`fs-toast ${toastMessage.type === 'error' ? 'err' : 'ok'}`}>
                    {toastMessage.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                    <span>{toastMessage.text}</span>
                </div>
            )}

            {/* KPI Summary Bar */}
            <div className="fs-kpi-bar">
                <div className={`fs-kpi-item ${activeTab === 'doctors' ? 'highlight' : ''}`} onClick={() => setActiveTab('doctors')}>
                    <span className="fs-kpi-label">Hekim Kadrosu</span>
                    <div className="fs-kpi-value-row">
                        <span className="fs-kpi-num">{allDoctors.length}</span>
                        <span className="fs-kpi-sub">({activeDoctorsCount} aktif)</span>
                    </div>
                </div>
                <div className="fs-kpi-divider" />
                <div className={`fs-kpi-item ${activeTab === 'branches' ? 'highlight' : ''}`} onClick={() => setActiveTab('branches')}>
                    <span className="fs-kpi-label">Tıbbi Branşlar</span>
                    <div className="fs-kpi-value-row">
                        <span className="fs-kpi-num">{branches.length}</span>
                        <span className="fs-kpi-sub">bölüm</span>
                    </div>
                </div>
                <div className="fs-kpi-divider" />
                <div className={`fs-kpi-item ${activeTab === 'locations' ? 'highlight' : ''}`} onClick={() => setActiveTab('locations')}>
                    <span className="fs-kpi-label">Klinik Şubeleri</span>
                    <div className="fs-kpi-value-row">
                        <span className="fs-kpi-num">{locations.length}</span>
                        <span className="fs-kpi-sub">lokasyon</span>
                    </div>
                </div>
                <div className="fs-kpi-divider" />
                <div className="fs-kpi-item">
                    <span className="fs-kpi-label">Temsilci Eşleşmesi</span>
                    <div className="fs-kpi-value-row">
                        <span className="fs-kpi-num">{assignedDoctorsCount} / {allDoctors.length}</span>
                        <span className="fs-kpi-sub">eşleşen</span>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="fs-tabs-nav">
                <div className="fs-tabs-group">
                    <button 
                        className={`fs-tab ${activeTab === 'doctors' ? 'active' : ''}`}
                        onClick={() => setActiveTab('doctors')}
                    >
                        <UserCheck size={16} />
                        <span>Hekimler & Uzmanlar</span>
                        <span className="fs-badge">{allDoctors.length}</span>
                    </button>
                    <button 
                        className={`fs-tab ${activeTab === 'branches' ? 'active' : ''}`}
                        onClick={() => setActiveTab('branches')}
                    >
                        <Stethoscope size={16} />
                        <span>Tıbbi Branşlar</span>
                        <span className="fs-badge">{branches.length}</span>
                    </button>
                    <button 
                        className={`fs-tab ${activeTab === 'locations' ? 'active' : ''}`}
                        onClick={() => setActiveTab('locations')}
                    >
                        <Building2 size={16} />
                        <span>Şubeler & Lokasyonlar</span>
                        <span className="fs-badge">{locations.length}</span>
                    </button>
                </div>

                <div className="fs-tabs-quick-action">
                    {activeTab === 'doctors' && (
                        <button className="fs-btn-secondary" onClick={() => openCreateDoctorModal()}>
                            <Plus size={14} /> Hekim Ekle
                        </button>
                    )}
                    {activeTab === 'branches' && (
                        <button className="fs-btn-secondary" onClick={openCreateBranchModal}>
                            <Plus size={14} /> Branş Ekle
                        </button>
                    )}
                    {activeTab === 'locations' && (
                        <button className="fs-btn-secondary" onClick={openCreateLocationModal}>
                            <Plus size={14} /> Şube Ekle
                        </button>
                    )}
                </div>
            </div>

            {/* Tab Body */}
            <div className="fs-content-panel">

                {/* 1. DOKTORLAR TAB */}
                {activeTab === 'doctors' && (
                    <div>
                        {/* Toolbar */}
                        <div className="fs-toolbar">
                            <div className="fs-search">
                                <Search size={15} className="fs-search-icon" />
                                <input 
                                    type="text" 
                                    placeholder="Hekim, şube veya branş ara..."
                                    value={doctorSearchQuery}
                                    onChange={e => setDoctorSearchQuery(e.target.value)}
                                />
                                {doctorSearchQuery && (
                                    <button className="fs-clear-search" onClick={() => setDoctorSearchQuery('')}>
                                        <X size={13} />
                                    </button>
                                )}
                            </div>

                            <div className="fs-filters">
                                <select 
                                    className="fs-select"
                                    value={selectedLocationFilter}
                                    onChange={e => setSelectedLocationFilter(e.target.value)}
                                >
                                    <option value="ALL">Tüm Şubeler ({locations.length})</option>
                                    {locations.map(l => (
                                        <option key={l.id} value={l.id}>{l.name}</option>
                                    ))}
                                </select>

                                <select 
                                    className="fs-select"
                                    value={selectedBranchFilter}
                                    onChange={e => setSelectedBranchFilter(e.target.value)}
                                >
                                    <option value="ALL">Tüm Branşlar ({branches.length})</option>
                                    {branches.map(b => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                </select>

                                <select 
                                    className="fs-select"
                                    value={selectedUserFilter}
                                    onChange={e => setSelectedUserFilter(e.target.value)}
                                >
                                    <option value="ALL">Tüm Temsilciler</option>
                                    <option value="ASSIGNED">Temsilciye Bağlı ({assignedDoctorsCount})</option>
                                    <option value="UNASSIGNED">Genel Havuz</option>
                                </select>
                            </div>
                        </div>

                        {/* Doctors Table */}
                        {filteredDoctors.length === 0 ? (
                            <div className="fs-empty">
                                <Stethoscope size={36} className="fs-empty-icon" />
                                <h3>Hekim Bulunamadı</h3>
                                <p>Arama kriterlerinizi değiştirebilir veya yeni bir hekim ekleyebilirsiniz.</p>
                                <button className="fs-btn-primary" onClick={() => openCreateDoctorModal()}>
                                    <Plus size={14} /> Yeni Hekim Ekle
                                </button>
                            </div>
                        ) : (
                            <div className="fs-table-wrap">
                                <table className="fs-table">
                                    <thead>
                                        <tr>
                                            <th style={{ minWidth: '220px' }}>Hekim Bilgisi</th>
                                            <th>Şube</th>
                                            <th>Tıbbi Branş</th>
                                            <th>Bağlı Temsilci</th>
                                            <th>Mesai / Seans</th>
                                            <th>Çalışma Günleri</th>
                                            <th>Durum</th>
                                            <th style={{ textAlign: 'right', width: '80px' }}>İşlem</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredDoctors.map(doc => {
                                            const assignedUser = workspaceUsers.find(u => u.id === doc.userId);
                                            let workingDaysArr = [];
                                            try {
                                                if (doc.workingDays) workingDaysArr = JSON.parse(doc.workingDays);
                                            } catch (_) {}

                                            const initial = (doc.name || 'D').trim().charAt(0).toUpperCase();
                                            const fullDoctorName = `${doc.title ? `${doc.title} ` : ''}${doc.name}`;

                                            return (
                                                <tr key={doc.id} className={!doc.isActive ? 'is-inactive' : ''}>
                                                    {/* Hekim Adı */}
                                                    <td>
                                                        <div className="fs-doctor-cell">
                                                            <div className="fs-avatar">
                                                                {initial}
                                                                <span className={`fs-dot ${doc.isActive ? 'online' : 'offline'}`} />
                                                            </div>
                                                            <div className="fs-doctor-meta">
                                                                <span className="fs-doc-name">{fullDoctorName}</span>
                                                                <span className="fs-doc-sub">
                                                                    {doc.isActive ? 'Randevuya Açık' : 'Randevuya Kapalı'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Şube */}
                                                    <td>
                                                        <span className="fs-tag-neutral">
                                                            <Building2 size={12} />
                                                            {doc.locationName || 'Merkez Şube'}
                                                        </span>
                                                    </td>

                                                    {/* Branş */}
                                                    <td>
                                                        <span className="fs-tag-branch">
                                                            {doc.branchName}
                                                        </span>
                                                    </td>

                                                    {/* CRM Temsilcisi */}
                                                    <td>
                                                        {assignedUser ? (
                                                            <div className="fs-user-pill" title={assignedUser.email}>
                                                                <UserCheck size={13} className="text-emerald" />
                                                                <span>{assignedUser.name}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="fs-text-muted">Genel Havuz</span>
                                                        )}
                                                    </td>

                                                    {/* Mesai & Seans */}
                                                    <td>
                                                        <div className="fs-timing">
                                                            <span className="fs-time-text">
                                                                <Clock size={12} />
                                                                {doc.workStart || '09:00'} - {doc.workEnd || '17:00'}
                                                            </span>
                                                            <span className="fs-slot-pill">{doc.slotMinutes || 30} dk</span>
                                                        </div>
                                                    </td>

                                                    {/* Günler */}
                                                    <td>
                                                        <div className="fs-days-row">
                                                            {TURKISH_DAYS.map(d => {
                                                                const isWork = workingDaysArr.includes(d.key);
                                                                return (
                                                                    <span 
                                                                        key={d.key} 
                                                                        className={`fs-day-dot ${isWork ? 'on' : 'off'}`}
                                                                        title={d.label}
                                                                    >
                                                                        {d.letter}
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    </td>

                                                    {/* Durum */}
                                                    <td>
                                                        <span className={`fs-status-pill ${doc.isActive ? 'active' : 'inactive'}`}>
                                                            {doc.isActive ? 'Aktif' : 'Pasif'}
                                                        </span>
                                                    </td>

                                                    {/* İşlemler */}
                                                    <td>
                                                        <div className="fs-row-actions">
                                                            <button 
                                                                className="fs-icon-btn" 
                                                                onClick={() => openEditDoctorModal(doc)}
                                                                title="Düzenle"
                                                            >
                                                                <Edit2 size={13} />
                                                            </button>
                                                            <button 
                                                                className="fs-icon-btn danger" 
                                                                onClick={() => handleDeleteDoctor(doc.id, doc.name)}
                                                                title="Sil"
                                                            >
                                                                <Trash2 size={13} />
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

                {/* 2. BRANŞLAR TAB */}
                {activeTab === 'branches' && (
                    <div>
                        <div className="fs-toolbar">
                            <div className="fs-search">
                                <Search size={15} className="fs-search-icon" />
                                <input 
                                    type="text" 
                                    placeholder="Tıbbi branş ara..."
                                    value={branchSearchQuery}
                                    onChange={e => setBranchSearchQuery(e.target.value)}
                                />
                            </div>

                            <button className="fs-btn-primary" onClick={openCreateBranchModal}>
                                <Plus size={14} /> Yeni Branş Ekle
                            </button>
                        </div>

                        {filteredBranches.length === 0 ? (
                            <div className="fs-empty">
                                <Layers size={36} className="fs-empty-icon" />
                                <h3>Branş Bulunamadı</h3>
                                <p>Arama teriminizi kontrol edin veya yeni bir tıbbi branş ekleyin.</p>
                            </div>
                        ) : (
                            <div className="fs-cards-grid">
                                {filteredBranches.map(branch => {
                                    const docs = branch.doctors || [];
                                    return (
                                        <div key={branch.id} className="fs-card">
                                            <div className="fs-card-head">
                                                <div className="fs-card-icon branch">
                                                    <Stethoscope size={18} />
                                                </div>
                                                <div className="fs-card-title-meta">
                                                    <h3>{branch.name}</h3>
                                                    <span className="fs-card-subtitle">{docs.length} hekim tanımlı</span>
                                                </div>
                                                <div className="fs-card-actions">
                                                    <button className="fs-icon-btn" onClick={() => openEditBranchModal(branch)} title="Düzenle">
                                                        <Edit2 size={13} />
                                                    </button>
                                                    <button className="fs-icon-btn danger" onClick={() => handleDeleteBranch(branch.id, branch.name)} title="Sil">
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="fs-card-body">
                                                <span className="fs-chip-group-label">Kadro:</span>
                                                {docs.length === 0 ? (
                                                    <span className="fs-text-muted">Bu branşta hekim bulunmuyor.</span>
                                                ) : (
                                                    <div className="fs-chip-wrap">
                                                        {docs.map(doc => (
                                                            <span key={doc.id} className="fs-chip">
                                                                {doc.title ? `${doc.title} ` : ''}{doc.name}
                                                                {doc.locationName && <small>({doc.locationName})</small>}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="fs-card-foot">
                                                <button 
                                                    className="fs-btn-card-add" 
                                                    onClick={() => openCreateDoctorModal({ branchId: branch.id })}
                                                >
                                                    <Plus size={13} /> Bu Branşa Hekim Ekle
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* 3. ŞUBELER TAB */}
                {activeTab === 'locations' && (
                    <div>
                        <div className="fs-toolbar">
                            <div className="fs-search">
                                <Search size={15} className="fs-search-icon" />
                                <input 
                                    type="text" 
                                    placeholder="Şube veya adres ara..."
                                    value={locationSearchQuery}
                                    onChange={e => setLocationSearchQuery(e.target.value)}
                                />
                            </div>

                            <button className="fs-btn-primary" onClick={openCreateLocationModal}>
                                <Plus size={14} /> Yeni Şube Ekle
                            </button>
                        </div>

                        {filteredLocations.length === 0 ? (
                            <div className="fs-empty">
                                <Building2 size={36} className="fs-empty-icon" />
                                <h3>Şube Bulunamadı</h3>
                                <p>Arama teriminizi kontrol edin veya yeni bir şube ekleyin.</p>
                            </div>
                        ) : (
                            <div className="fs-cards-grid">
                                {filteredLocations.map(loc => {
                                    const locDoctors = allDoctors.filter(d => d.locationId === loc.id);
                                    return (
                                        <div key={loc.id} className="fs-card">
                                            <div className="fs-card-head">
                                                <div className="fs-card-icon location">
                                                    <Building2 size={18} />
                                                </div>
                                                <div className="fs-card-title-meta">
                                                    <h3>{loc.name}</h3>
                                                    <span className="fs-card-subtitle">{locDoctors.length} hekim görevde</span>
                                                </div>
                                                <div className="fs-card-actions">
                                                    <button className="fs-icon-btn" onClick={() => openEditLocationModal(loc)} title="Düzenle">
                                                        <Edit2 size={13} />
                                                    </button>
                                                    <button className="fs-icon-btn danger" onClick={() => handleDeleteLocation(loc.id, loc.name)} title="Sil">
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="fs-loc-info">
                                                {loc.address && (
                                                    <div className="fs-loc-row">
                                                        <MapPin size={13} className="fs-loc-icon" />
                                                        <span>{loc.address}</span>
                                                    </div>
                                                )}
                                                {loc.phone && (
                                                    <div className="fs-loc-row">
                                                        <Phone size={13} className="fs-loc-icon" />
                                                        <span>{loc.phone}</span>
                                                    </div>
                                                )}
                                                {!loc.address && !loc.phone && (
                                                    <span className="fs-text-muted">Adres ve telefon henüz eklenmedi.</span>
                                                )}
                                            </div>

                                            <div className="fs-card-body">
                                                <span className="fs-chip-group-label">Görevli Hekimler:</span>
                                                {locDoctors.length === 0 ? (
                                                    <span className="fs-text-muted">Bu şubeye atanmış hekim yok.</span>
                                                ) : (
                                                    <div className="fs-chip-wrap">
                                                        {locDoctors.map(doc => (
                                                            <span key={doc.id} className="fs-chip">
                                                                {doc.title ? `${doc.title} ` : ''}{doc.name}
                                                                <small className="fs-chip-branch">{doc.branchName}</small>
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="fs-card-foot">
                                                <button 
                                                    className="fs-btn-card-add" 
                                                    onClick={() => openCreateDoctorModal({ locationId: loc.id })}
                                                >
                                                    <Plus size={13} /> Bu Şubeye Hekim Ekle
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

            {/* ── LOCATION MODAL ── */}
            {locationModalOpen && (
                <div className="fs-modal-backdrop" onClick={() => setLocationModalOpen(false)}>
                    <div className="fs-modal" onClick={e => e.stopPropagation()}>
                        <div className="fs-modal-head">
                            <div className="fs-modal-title-group">
                                <h3>{editingLocation ? 'Şubeyi Düzenle' : 'Yeni Klinik Şubesi'}</h3>
                                <p>Hastane veya klinik poliklinik şubenizi tanımlayın.</p>
                            </div>
                            <button className="fs-close-btn" onClick={() => setLocationModalOpen(false)}>
                                <X size={16} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveLocation}>
                            <div className="fs-modal-body">
                                <div className="fs-field">
                                    <label>Şube Adı <span className="req">*</span></label>
                                    <input 
                                        type="text" 
                                        className="fs-input"
                                        placeholder="Örn: Merkez Şube (Kadıköy)"
                                        value={locationForm.name}
                                        onChange={e => setLocationForm({ ...locationForm, name: e.target.value })}
                                        required
                                        autoFocus
                                    />
                                </div>
                                <div className="fs-field">
                                    <label>Telefon</label>
                                    <input 
                                        type="text" 
                                        className="fs-input"
                                        placeholder="+90 216 ..."
                                        value={locationForm.phone}
                                        onChange={e => setLocationForm({ ...locationForm, phone: e.target.value })}
                                    />
                                </div>
                                <div className="fs-field">
                                    <label>Adres</label>
                                    <textarea 
                                        rows={2}
                                        className="fs-input"
                                        placeholder="Şube lokasyonu ve açık adres..."
                                        value={locationForm.address}
                                        onChange={e => setLocationForm({ ...locationForm, address: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="fs-modal-foot">
                                <button type="button" className="fs-btn-cancel" onClick={() => setLocationModalOpen(false)}>
                                    İptal
                                </button>
                                <button type="submit" className="fs-btn-submit">
                                    {editingLocation ? 'Güncelle' : 'Kaydet'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── BRANCH MODAL ── */}
            {branchModalOpen && (
                <div className="fs-modal-backdrop" onClick={() => setBranchModalOpen(false)}>
                    <div className="fs-modal" onClick={e => e.stopPropagation()}>
                        <div className="fs-modal-head">
                            <div className="fs-modal-title-group">
                                <h3>{editingBranch ? 'Branşı Düzenle' : 'Yeni Tıbbi Branş'}</h3>
                                <p>Klinik departman veya uzmanlık dalını belirleyin.</p>
                            </div>
                            <button className="fs-close-btn" onClick={() => setBranchModalOpen(false)}>
                                <X size={16} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveBranch}>
                            <div className="fs-modal-body">
                                <div className="fs-field">
                                    <label>Branş Adı <span className="req">*</span></label>
                                    <input 
                                        type="text" 
                                        className="fs-input"
                                        placeholder="Örn: Ağız ve Diş Sağlığı, Kardiyoloji, Göz..."
                                        value={branchName}
                                        onChange={e => setBranchName(e.target.value)}
                                        required
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div className="fs-modal-foot">
                                <button type="button" className="fs-btn-cancel" onClick={() => setBranchModalOpen(false)}>
                                    İptal
                                </button>
                                <button type="submit" className="fs-btn-submit">
                                    {editingBranch ? 'Güncelle' : 'Kaydet'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── DOCTOR MODAL ── */}
            {doctorModalOpen && (
                <div className="fs-modal-backdrop" onClick={() => setDoctorModalOpen(false)}>
                    <div className="fs-modal doc-modal-size" onClick={e => e.stopPropagation()}>
                        <div className="fs-modal-head">
                            <div className="fs-modal-title-group">
                                <h3>{editingDoctor ? 'Hekim Bilgilerini Düzenle' : 'Yeni Hekim Ekle'}</h3>
                                <p>Hekimin unvanı, şubesi, branşı, mesai ve seans sürelerini belirleyin.</p>
                            </div>
                            <button className="fs-close-btn" onClick={() => setDoctorModalOpen(false)}>
                                <X size={16} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveDoctor}>
                            <div className="fs-modal-body">
                                <div className="fs-row-2">
                                    <div className="fs-field" style={{ flex: '0 0 140px' }}>
                                        <label>Unvan</label>
                                        <select 
                                            className="fs-input"
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
                                    <div className="fs-field" style={{ flex: 1 }}>
                                        <label>Ad Soyad <span className="req">*</span></label>
                                        <input 
                                            type="text" 
                                            className="fs-input"
                                            placeholder="Örn: Ahmet Yılmaz"
                                            value={doctorForm.name}
                                            onChange={e => setDoctorForm({ ...doctorForm, name: e.target.value })}
                                            required
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                <div className="fs-row-2">
                                    <div className="fs-field" style={{ flex: 1 }}>
                                        <label>Şube <span className="req">*</span></label>
                                        <select 
                                            className="fs-input"
                                            value={doctorForm.locationId}
                                            onChange={e => setDoctorForm({ ...doctorForm, locationId: e.target.value })}
                                        >
                                            {locations.map(loc => (
                                                <option key={loc.id} value={loc.id}>{loc.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="fs-field" style={{ flex: 1 }}>
                                        <label>Tıbbi Branş <span className="req">*</span></label>
                                        <select 
                                            className="fs-input"
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

                                <div className="fs-field">
                                    <label>Sistem Temsilcisi (CRM Kullanıcısı)</label>
                                    <select 
                                        className="fs-input"
                                        value={doctorForm.userId}
                                        onChange={e => setDoctorForm({ ...doctorForm, userId: e.target.value })}
                                    >
                                        <option value="">Kullanıcıya Bağlama (Genel Havuz)</option>
                                        {workspaceUsers.map(u => (
                                            <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="fs-row-3">
                                    <div className="fs-field">
                                        <label>Mesai Başlangıç</label>
                                        <input 
                                            type="time" 
                                            className="fs-input"
                                            value={doctorForm.workStart}
                                            onChange={e => setDoctorForm({ ...doctorForm, workStart: e.target.value })}
                                        />
                                    </div>
                                    <div className="fs-field">
                                        <label>Mesai Bitiş</label>
                                        <input 
                                            type="time" 
                                            className="fs-input"
                                            value={doctorForm.workEnd}
                                            onChange={e => setDoctorForm({ ...doctorForm, workEnd: e.target.value })}
                                        />
                                    </div>
                                    <div className="fs-field">
                                        <label>Seans Süresi</label>
                                        <select 
                                            className="fs-input"
                                            value={doctorForm.slotMinutes}
                                            onChange={e => setDoctorForm({ ...doctorForm, slotMinutes: parseInt(e.target.value) })}
                                        >
                                            <option value={15}>15 dk</option>
                                            <option value={20}>20 dk</option>
                                            <option value={30}>30 dk</option>
                                            <option value={45}>45 dk</option>
                                            <option value={60}>60 dk</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Çalışma Günleri */}
                                <div className="fs-field">
                                    <label>Çalışma Günleri</label>
                                    <div className="fs-days-picker">
                                        {TURKISH_DAYS.map(day => {
                                            const isSelected = doctorForm.workingDays.includes(day.key);
                                            return (
                                                <button
                                                    key={day.key}
                                                    type="button"
                                                    className={`fs-day-toggle ${isSelected ? 'selected' : ''}`}
                                                    onClick={() => toggleDay(day.key)}
                                                >
                                                    {day.short}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Aktif Anahtarı */}
                                <div className="fs-switch-row">
                                    <label className="fs-switch-label">
                                        <input 
                                            type="checkbox"
                                            checked={doctorForm.isActive}
                                            onChange={e => setDoctorForm({ ...doctorForm, isActive: e.target.checked })}
                                        />
                                        <span className="fs-switch-track" />
                                        <span className="fs-switch-text">Hekim Randevuya Açık</span>
                                    </label>
                                </div>
                            </div>
                            <div className="fs-modal-foot">
                                <button type="button" className="fs-btn-cancel" onClick={() => setDoctorModalOpen(false)}>
                                    İptal
                                </button>
                                <button type="submit" className="fs-btn-submit">
                                    {editingDoctor ? 'Değişiklikleri Kaydet' : 'Hekimi Ekle'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
