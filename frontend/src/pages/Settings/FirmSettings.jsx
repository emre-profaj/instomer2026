import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { appointmentConfigAPI } from '../../services/api';
import { 
    Stethoscope, Plus, Edit2, Trash2, Sparkles, Clock, Calendar, 
    UserCheck, ShieldAlert, X, Check, Search, Filter, Users, 
    Layers, ChevronRight, CheckCircle2, AlertCircle, RefreshCw,
    Activity, Hospital, Building2, MapPin, Phone, UserPlus
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
    const [teams, setTeams] = useState([]);

    // Search & Filter State
    const [doctorSearchQuery, setDoctorSearchQuery] = useState('');
    const [selectedBranchFilter, setSelectedBranchFilter] = useState('ALL');
    const [selectedLocationFilter, setSelectedLocationFilter] = useState('ALL');
    const [selectedUserFilter, setSelectedUserFilter] = useState('ALL');

    const [branchSearchQuery, setBranchSearchQuery] = useState('');
    const [selectedBranchLocationFilter, setSelectedBranchLocationFilter] = useState('ALL');
    const [selectedBranchDoctorFilter, setSelectedBranchDoctorFilter] = useState('ALL');

    const [locationSearchQuery, setLocationSearchQuery] = useState('');
    const [selectedLocationDoctorFilter, setSelectedLocationDoctorFilter] = useState('ALL');

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
    const [googleCalendars, setGoogleCalendars] = useState([]);
    const [doctorForm, setDoctorForm] = useState({
        branchId: '',
        locationId: '',
        name: '',
        title: 'Uzm. Dr.',
        assignmentType: 'UNASSIGNED', // 'UNASSIGNED' | 'TEAM' | 'USER'
        teamId: '',
        userId: '',
        calendarEmail: '',
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
                setTeams(res.data.teams || []);
                setGoogleCalendars(res.data.googleCalendars || []);
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
            assignmentType: 'UNASSIGNED',
            teamId: '',
            userId: '',
            calendarEmail: '',
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

        const initialAssignmentType = doctor.teamId ? 'TEAM' : (doctor.userId ? 'USER' : 'UNASSIGNED');

        setDoctorForm({
            branchId: doctor.branchId || '',
            locationId: doctor.locationId || (locations[0]?.id || ''),
            name: doctor.name || '',
            title: doctor.title || 'Uzm. Dr.',
            assignmentType: initialAssignmentType,
            teamId: doctor.teamId || '',
            userId: doctor.userId || '',
            calendarEmail: doctor.calendarEmail || '',
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

        const payload = {
            ...doctorForm,
            teamId: doctorForm.assignmentType === 'TEAM' ? (doctorForm.teamId || null) : null,
            userId: (doctorForm.assignmentType === 'USER' || (doctorForm.assignmentType === 'TEAM' && doctorForm.userId)) ? (doctorForm.userId || null) : null,
            calendarEmail: doctorForm.calendarEmail || null
        };

        try {
            if (editingDoctor) {
                await appointmentConfigAPI.updateDoctor(currentWorkspace.id, editingDoctor.id, payload);
                showToast('Hekim bilgileri güncellendi.');
            } else {
                await appointmentConfigAPI.createDoctor(currentWorkspace.id, payload);
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
    const assignedDoctorsCount = allDoctors.filter(d => d.userId || d.teamId).length;

    // Selected Team Helpers for Doctor Modal
    const selectedTeam = useMemo(() => {
        if (!doctorForm.teamId) return null;
        return teams.find(t => t.id === doctorForm.teamId) || null;
    }, [doctorForm.teamId, teams]);

    const selectedTeamMembers = useMemo(() => {
        if (!selectedTeam) return [];
        return selectedTeam.members || [];
    }, [selectedTeam]);

    // Filtered Doctors
    const filteredDoctors = useMemo(() => {
        return allDoctors.filter(doc => {
            const fullName = `${doc.title || ''} ${doc.name || ''}`.toLowerCase();
            const teamName = doc.team?.name?.toLowerCase() || '';
            const matchSearch = doctorSearchQuery === '' || 
                fullName.includes(doctorSearchQuery.toLowerCase()) ||
                doc.branchName?.toLowerCase().includes(doctorSearchQuery.toLowerCase()) ||
                doc.locationName?.toLowerCase().includes(doctorSearchQuery.toLowerCase()) ||
                teamName.includes(doctorSearchQuery.toLowerCase());

            const matchBranch = selectedBranchFilter === 'ALL' || doc.branchId === selectedBranchFilter;
            const matchLocation = selectedLocationFilter === 'ALL' || doc.locationId === selectedLocationFilter;

            let matchUser = true;
            if (selectedUserFilter === 'ASSIGNED') {
                matchUser = !!doc.userId || !!doc.teamId;
            } else if (selectedUserFilter === 'UNASSIGNED') {
                matchUser = !doc.userId && !doc.teamId;
            } else if (selectedUserFilter.startsWith('TEAM_')) {
                const targetTeamId = selectedUserFilter.replace('TEAM_', '');
                matchUser = doc.teamId === targetTeamId;
            } else if (selectedUserFilter.startsWith('USER_')) {
                const targetUserId = selectedUserFilter.replace('USER_', '');
                matchUser = doc.userId === targetUserId;
            }

            return matchSearch && matchBranch && matchLocation && matchUser;
        });
    }, [allDoctors, doctorSearchQuery, selectedBranchFilter, selectedLocationFilter, selectedUserFilter]);

    // Filtered Branches
    const filteredBranches = useMemo(() => {
        return branches.filter(b => {
            const matchesSearch = !branchSearchQuery || 
                b.name?.toLowerCase().includes(branchSearchQuery.toLowerCase());
            
            const docs = b.doctors || [];
            
            let matchesLocation = true;
            if (selectedBranchLocationFilter !== 'ALL') {
                matchesLocation = docs.some(d => d.locationId === selectedBranchLocationFilter);
            }

            let matchesDocStatus = true;
            if (selectedBranchDoctorFilter === 'WITH_DOC') {
                matchesDocStatus = docs.length > 0;
            } else if (selectedBranchDoctorFilter === 'EMPTY') {
                matchesDocStatus = docs.length === 0;
            }

            return matchesSearch && matchesLocation && matchesDocStatus;
        });
    }, [branches, branchSearchQuery, selectedBranchLocationFilter, selectedBranchDoctorFilter]);

    // Filtered Locations
    const filteredLocations = useMemo(() => {
        return locations.filter(l => {
            const matchesSearch = !locationSearchQuery || 
                l.name?.toLowerCase().includes(locationSearchQuery.toLowerCase()) ||
                l.address?.toLowerCase().includes(locationSearchQuery.toLowerCase()) ||
                l.phone?.toLowerCase().includes(locationSearchQuery.toLowerCase());
            
            const locDoctors = allDoctors.filter(d => d.locationId === l.id);

            let matchesDocStatus = true;
            if (selectedLocationDoctorFilter === 'WITH_DOC') {
                matchesDocStatus = locDoctors.length > 0;
            } else if (selectedLocationDoctorFilter === 'EMPTY') {
                matchesDocStatus = locDoctors.length === 0;
            }

            return matchesSearch && matchesDocStatus;
        });
    }, [locations, locationSearchQuery, selectedLocationDoctorFilter, allDoctors]);

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
                    {activeTab === 'doctors' && (
                        <button className="fs-btn-primary" onClick={() => openCreateDoctorModal()}>
                            <Plus size={15} /> Yeni Hekim
                        </button>
                    )}
                    {activeTab === 'branches' && (
                        <button className="fs-btn-primary" onClick={openCreateBranchModal}>
                            <Plus size={15} /> Yeni Branş
                        </button>
                    )}
                    {activeTab === 'locations' && (
                        <button className="fs-btn-primary" onClick={openCreateLocationModal}>
                            <Plus size={15} /> Yeni Şube
                        </button>
                    )}
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

            {/* Standard Navigation Tabs */}
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

            {/* Standard Unified Content Panel */}
            <div className="fs-content-panel">

                {/* ══════════════════════════════════════════════════
                   1. DOKTORLAR TABLOSU
                   ══════════════════════════════════════════════════ */}
                {activeTab === 'doctors' && (
                    <div>
                        {/* Standard Toolbar */}
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
                                    <option value="ALL">Tüm Sorumlular</option>
                                    {teams.length > 0 && (
                                        <optgroup label="🏢 Takımlar (Ekipler)">
                                            {teams.map(t => (
                                                <option key={t.id} value={`TEAM_${t.id}`}>
                                                    🏢 {t.name} ({t.membersCount || t.members?.length || 0} Üye)
                                                </option>
                                            ))}
                                        </optgroup>
                                    )}
                                    <optgroup label="👤 Bireysel Temsilciler">
                                        {workspaceUsers.map(u => (
                                            <option key={u.id} value={`USER_${u.id}`}>
                                                👤 {u.name}
                                            </option>
                                        ))}
                                    </optgroup>
                                    <option value="ASSIGNED">Atanmış Olanlar (Tümü)</option>
                                    <option value="UNASSIGNED">Genel Havuz (Atanmamış)</option>
                                </select>
                            </div>
                        </div>

                        {/* Standard Doctors Table */}
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
                                            <th style={{ minWidth: '190px' }}>Hekim Bilgisi</th>
                                            <th>Şube</th>
                                            <th>Tıbbi Branş</th>
                                            <th>Sorumlu Takım / Temsilci</th>
                                            <th>Mesai / Seans</th>
                                            <th>Çalışma Günleri</th>
                                            <th>Durum</th>
                                            <th style={{ textAlign: 'right', minWidth: '80px', width: '80px' }}>İşlem</th>
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
                                                    <td>
                                                        <div className="fs-doctor-cell">
                                                            <div className="fs-avatar">
                                                                {initial}
                                                                <span className={`fs-dot ${doc.isActive ? 'online' : 'offline'}`} />
                                                            </div>
                                                            <div className="fs-doctor-meta">
                                                                <span className="fs-doc-name">{fullDoctorName}</span>
                                                                <div className="fs-doc-sub-row">
                                                                    <span className="fs-doc-sub">
                                                                        {doc.isActive ? 'Randevuya Açık' : 'Randevuya Kapalı'}
                                                                    </span>
                                                                    {doc.calendarEmail && (
                                                                        <span className="fs-cal-badge" title={`Google Takvim: ${doc.calendarEmail}`}>
                                                                            <Calendar size={10} /> {doc.calendarEmail}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className="fs-tag-neutral">
                                                            <Building2 size={12} />
                                                            {doc.locationName || 'Merkez Şube'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span className="fs-tag-branch">
                                                            {doc.branchName}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        {doc.team ? (
                                                            <div className="fs-user-pill team" title={doc.team.members?.map(m => m.name || m.email).join(', ')}>
                                                                <Building2 size={12} className="text-blue" />
                                                                <span>{doc.team.name}</span>
                                                                <span className="fs-team-count-badge">{doc.team.membersCount || doc.team.members?.length || 0}</span>
                                                                {assignedUser && <span className="fs-team-specific-user">→ {assignedUser.name}</span>}
                                                            </div>
                                                        ) : assignedUser ? (
                                                            <div className="fs-user-pill" title={assignedUser.email}>
                                                                <UserCheck size={13} className="text-emerald" />
                                                                <span>{assignedUser.name}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="fs-text-muted">Genel Havuz</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <div className="fs-timing">
                                                            <span className="fs-time-text">
                                                                <Clock size={12} />
                                                                {doc.workStart || '09:00'} - {doc.workEnd || '17:00'}
                                                            </span>
                                                            <span className="fs-slot-pill">{doc.slotMinutes || 30} dk</span>
                                                        </div>
                                                    </td>
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
                                                    <td>
                                                        <span className={`fs-status-pill ${doc.isActive ? 'active' : 'inactive'}`}>
                                                            {doc.isActive ? 'Aktif' : 'Pasif'}
                                                        </span>
                                                    </td>
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

                {/* ══════════════════════════════════════════════════
                   2. TIBBİ BRANŞLAR TABLOSU (STANDART GÖRÜNÜM)
                   ══════════════════════════════════════════════════ */}
                {activeTab === 'branches' && (
                    <div>
                        {/* Standard Toolbar */}
                        <div className="fs-toolbar">
                            <div className="fs-search">
                                <Search size={15} className="fs-search-icon" />
                                <input 
                                    type="text" 
                                    placeholder="Tıbbi branş veya poliklinik ara..."
                                    value={branchSearchQuery}
                                    onChange={e => setBranchSearchQuery(e.target.value)}
                                />
                                {branchSearchQuery && (
                                    <button className="fs-clear-search" onClick={() => setBranchSearchQuery('')}>
                                        <X size={13} />
                                    </button>
                                )}
                            </div>

                            <div className="fs-filters">
                                <select 
                                    className="fs-select"
                                    value={selectedBranchLocationFilter}
                                    onChange={e => setSelectedBranchLocationFilter(e.target.value)}
                                >
                                    <option value="ALL">Tüm Şubeler ({locations.length})</option>
                                    {locations.map(l => (
                                        <option key={l.id} value={l.id}>{l.name}</option>
                                    ))}
                                </select>

                                <select 
                                    className="fs-select"
                                    value={selectedBranchDoctorFilter}
                                    onChange={e => setSelectedBranchDoctorFilter(e.target.value)}
                                >
                                    <option value="ALL">Tüm Kadrolar</option>
                                    <option value="WITH_DOC">Hekimi Olan Branşlar</option>
                                    <option value="EMPTY">Henüz Hekim Atanmayanlar</option>
                                </select>
                            </div>
                        </div>

                        {/* Standard Branches Table */}
                        {filteredBranches.length === 0 ? (
                            <div className="fs-empty">
                                <Layers size={36} className="fs-empty-icon" />
                                <h3>Branş Bulunamadı</h3>
                                <p>Arama teriminizi kontrol edin veya yeni bir tıbbi branş ekleyin.</p>
                                <button className="fs-btn-primary" onClick={openCreateBranchModal}>
                                    <Plus size={14} /> Yeni Branş Ekle
                                </button>
                            </div>
                        ) : (
                            <div className="fs-table-wrap">
                                <table className="fs-table">
                                    <thead>
                                        <tr>
                                            <th style={{ minWidth: '190px' }}>Tıbbi Branş / Poliklinik</th>
                                            <th>Hizmet Verilen Şubeler</th>
                                            <th style={{ minWidth: '220px' }}>Bağlı Hekim Kadrosu</th>
                                            <th>Hekim Sayısı</th>
                                            <th>Durum</th>
                                            <th style={{ textAlign: 'right', minWidth: '100px', width: '100px' }}>İşlem</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredBranches.map(branch => {
                                            const docs = branch.doctors || [];
                                            // Unique locations where this branch operates
                                            const branchLocationNames = Array.from(new Set(docs.map(d => d.locationName).filter(Boolean)));

                                            return (
                                                <tr key={branch.id}>
                                                    {/* Branş Adı */}
                                                    <td>
                                                        <div className="fs-doctor-cell">
                                                            <div className="fs-avatar branch-avatar">
                                                                <Stethoscope size={15} />
                                                            </div>
                                                            <div className="fs-doctor-meta">
                                                                <span className="fs-doc-name">{branch.name}</span>
                                                                <span className="fs-doc-sub">
                                                                    {docs.length > 0 ? `${docs.length} Görevli Hekim` : 'Henüz Hekim Atanmadı'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Şubeler */}
                                                    <td>
                                                        {branchLocationNames.length === 0 ? (
                                                            <span className="fs-text-muted">—</span>
                                                        ) : (
                                                            <div className="fs-table-chips">
                                                                {branchLocationNames.map((locName, idx) => (
                                                                    <span key={idx} className="fs-tag-location">
                                                                        <Building2 size={11} />
                                                                        {locName}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </td>

                                                    {/* Hekimler */}
                                                    <td>
                                                        {docs.length === 0 ? (
                                                            <span className="fs-text-muted">Henüz hekim atanmadı</span>
                                                        ) : (
                                                            <div className="fs-table-chips">
                                                                {docs.map(doc => (
                                                                    <span key={doc.id} className="fs-cell-chip">
                                                                        {doc.title ? `${doc.title} ` : ''}{doc.name}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </td>

                                                    {/* Hekim Sayısı */}
                                                    <td>
                                                        <span className="fs-tag-neutral">
                                                            {docs.length} Hekim
                                                        </span>
                                                    </td>

                                                    {/* Durum */}
                                                    <td>
                                                        <span className="fs-status-pill active">
                                                            Aktif
                                                        </span>
                                                    </td>

                                                    {/* İşlemler */}
                                                    <td>
                                                        <div className="fs-row-actions">
                                                            <button 
                                                                className="fs-icon-btn" 
                                                                onClick={() => openCreateDoctorModal({ branchId: branch.id })}
                                                                title="Bu Branşa Hekim Ekle"
                                                            >
                                                                <UserPlus size={13} />
                                                            </button>
                                                            <button 
                                                                className="fs-icon-btn" 
                                                                onClick={() => openEditBranchModal(branch)}
                                                                title="Branşı Düzenle"
                                                            >
                                                                <Edit2 size={13} />
                                                            </button>
                                                            <button 
                                                                className="fs-icon-btn danger" 
                                                                onClick={() => handleDeleteBranch(branch.id, branch.name)}
                                                                title="Branşı Sil"
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

                {/* ══════════════════════════════════════════════════
                   3. ŞUBELER TABLOSU (STANDART GÖRÜNÜM)
                   ══════════════════════════════════════════════════ */}
                {activeTab === 'locations' && (
                    <div>
                        {/* Standard Toolbar */}
                        <div className="fs-toolbar">
                            <div className="fs-search">
                                <Search size={15} className="fs-search-icon" />
                                <input 
                                    type="text" 
                                    placeholder="Şube adı, adres veya telefon ara..."
                                    value={locationSearchQuery}
                                    onChange={e => setLocationSearchQuery(e.target.value)}
                                />
                                {locationSearchQuery && (
                                    <button className="fs-clear-search" onClick={() => setLocationSearchQuery('')}>
                                        <X size={13} />
                                    </button>
                                )}
                            </div>

                            <div className="fs-filters">
                                <select 
                                    className="fs-select"
                                    value={selectedLocationDoctorFilter}
                                    onChange={e => setSelectedLocationDoctorFilter(e.target.value)}
                                >
                                    <option value="ALL">Tüm Şubeler ({locations.length})</option>
                                    <option value="WITH_DOC">Hekim Görevde Olanlar</option>
                                    <option value="EMPTY">Henüz Hekim Atanmayanlar</option>
                                </select>
                            </div>
                        </div>

                        {/* Standard Locations Table */}
                        {filteredLocations.length === 0 ? (
                            <div className="fs-empty">
                                <Building2 size={36} className="fs-empty-icon" />
                                <h3>Şube Bulunamadı</h3>
                                <p>Arama teriminizi kontrol edin veya yeni bir şube ekleyin.</p>
                                <button className="fs-btn-primary" onClick={openCreateLocationModal}>
                                    <Plus size={14} /> Yeni Şube Ekle
                                </button>
                            </div>
                        ) : (
                            <div className="fs-table-wrap">
                                <table className="fs-table">
                                    <thead>
                                        <tr>
                                            <th style={{ minWidth: '190px' }}>Şube / Lokasyon</th>
                                            <th>İletişim Telefonu</th>
                                            <th style={{ minWidth: '190px' }}>Adres & Lokasyon</th>
                                            <th style={{ minWidth: '200px' }}>Görevli Hekimler</th>
                                            <th>Hekim Sayısı</th>
                                            <th>Durum</th>
                                            <th style={{ textAlign: 'right', minWidth: '100px', width: '100px' }}>İşlem</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredLocations.map(loc => {
                                            const locDoctors = allDoctors.filter(d => d.locationId === loc.id);

                                            return (
                                                <tr key={loc.id}>
                                                    {/* Şube Adı */}
                                                    <td>
                                                        <div className="fs-doctor-cell">
                                                            <div className="fs-avatar location-avatar">
                                                                <Building2 size={15} />
                                                            </div>
                                                            <div className="fs-doctor-meta">
                                                                <span className="fs-doc-name">{loc.name}</span>
                                                                <span className="fs-doc-sub">Klinik Şubesi</span>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Telefon */}
                                                    <td>
                                                        {loc.phone ? (
                                                            <span className="fs-time-text">
                                                                <Phone size={12} className="text-muted-icon" />
                                                                {loc.phone}
                                                            </span>
                                                        ) : (
                                                            <span className="fs-text-muted">—</span>
                                                        )}
                                                    </td>

                                                    {/* Adres */}
                                                    <td>
                                                        {loc.address ? (
                                                            <span className="fs-address-cell" title={loc.address}>
                                                                <MapPin size={12} className="text-muted-icon" />
                                                                <span>{loc.address}</span>
                                                            </span>
                                                        ) : (
                                                            <span className="fs-text-muted">—</span>
                                                        )}
                                                    </td>

                                                    {/* Görevli Hekimler */}
                                                    <td>
                                                        {locDoctors.length === 0 ? (
                                                            <span className="fs-text-muted">Bu şubede hekim yok</span>
                                                        ) : (
                                                            <div className="fs-table-chips">
                                                                {locDoctors.map(doc => (
                                                                    <span key={doc.id} className="fs-cell-chip">
                                                                        {doc.title ? `${doc.title} ` : ''}{doc.name}
                                                                        <small className="fs-chip-branch">{doc.branchName}</small>
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </td>

                                                    {/* Hekim Sayısı */}
                                                    <td>
                                                        <span className="fs-tag-neutral">
                                                            {locDoctors.length} Hekim
                                                        </span>
                                                    </td>

                                                    {/* Durum */}
                                                    <td>
                                                        <span className="fs-status-pill active">
                                                            Aktif
                                                        </span>
                                                    </td>

                                                    {/* İşlemler */}
                                                    <td>
                                                        <div className="fs-row-actions">
                                                            <button 
                                                                className="fs-icon-btn" 
                                                                onClick={() => openCreateDoctorModal({ locationId: loc.id })}
                                                                title="Bu Şubeye Hekim Ekle"
                                                            >
                                                                <UserPlus size={13} />
                                                            </button>
                                                            <button 
                                                                className="fs-icon-btn" 
                                                                onClick={() => openEditLocationModal(loc)}
                                                                title="Şubeyi Düzenle"
                                                            >
                                                                <Edit2 size={13} />
                                                            </button>
                                                            <button 
                                                                className="fs-icon-btn danger" 
                                                                onClick={() => handleDeleteLocation(loc.id, loc.name)}
                                                                title="Şubeyi Sil"
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

                                {/* ── Sorumlu Atama (Takım / Bireysel / Havuz) ── */}
                                <div className="fs-assignment-box">
                                    <div className="fs-assignment-head">
                                        <label className="fs-assignment-label">
                                            <Users size={14} />
                                            <span>Randevu Sorumlusu & Havuz Dağıtımı</span>
                                        </label>
                                        <p className="fs-assignment-desc">
                                            Bu hekime alınan randevuları hangi takımın veya temsilcinin görüp yöneteceğini belirleyin.
                                        </p>
                                    </div>

                                    {/* Segmented Selector */}
                                    <div className="fs-segment-group">
                                        <button
                                            type="button"
                                            className={`fs-segment-btn ${doctorForm.assignmentType === 'TEAM' ? 'active' : ''}`}
                                            onClick={() => setDoctorForm(prev => ({ ...prev, assignmentType: 'TEAM' }))}
                                        >
                                            <Building2 size={13} />
                                            <span>Takım / Ekip</span>
                                        </button>
                                        <button
                                            type="button"
                                            className={`fs-segment-btn ${doctorForm.assignmentType === 'USER' ? 'active' : ''}`}
                                            onClick={() => setDoctorForm(prev => ({ ...prev, assignmentType: 'USER', teamId: '' }))}
                                        >
                                            <UserCheck size={13} />
                                            <span>Bireysel Temsilci</span>
                                        </button>
                                        <button
                                            type="button"
                                            className={`fs-segment-btn ${doctorForm.assignmentType === 'UNASSIGNED' ? 'active' : ''}`}
                                            onClick={() => setDoctorForm(prev => ({ ...prev, assignmentType: 'UNASSIGNED', teamId: '', userId: '' }))}
                                        >
                                            <span>Genel Havuz (Atamasız)</span>
                                        </button>
                                    </div>

                                    {/* Option 1: Takım Seçimi */}
                                    {doctorForm.assignmentType === 'TEAM' && (
                                        <div className="fs-assignment-body">
                                            <div className="fs-row-2">
                                                <div className="fs-field" style={{ flex: 1 }}>
                                                    <label>Sorumlu Takım <span className="req">*</span></label>
                                                    <select 
                                                        className="fs-input"
                                                        value={doctorForm.teamId}
                                                        onChange={e => setDoctorForm(prev => ({ ...prev, teamId: e.target.value, userId: '' }))}
                                                    >
                                                        <option value="">Takım Seçiniz ({teams.length} Takım)...</option>
                                                        {teams.map(team => (
                                                            <option key={team.id} value={team.id}>
                                                                🏢 {team.name} ({team.membersCount || team.members?.length || 0} Üye)
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div className="fs-field" style={{ flex: 1 }}>
                                                    <label>Takım İçi Özel Sorumlu <span className="fs-optional">(Opsiyonel)</span></label>
                                                    <select 
                                                        className="fs-input"
                                                        value={doctorForm.userId}
                                                        onChange={e => setDoctorForm(prev => ({ ...prev, userId: e.target.value }))}
                                                        disabled={!doctorForm.teamId}
                                                    >
                                                        <option value="">Tüm Takım Havuzu (Herkes Görsün)</option>
                                                        {selectedTeamMembers.map(member => (
                                                            <option key={member.id} value={member.id}>
                                                                👤 {member.name || member.email}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                            {selectedTeam ? (
                                                <div className="fs-team-banner">
                                                    <div className="fs-team-banner-header">
                                                        <Users size={14} className="text-blue" />
                                                        <strong>{selectedTeam.name} Takımı</strong>
                                                        <span className="fs-team-badge">{selectedTeam.membersCount || selectedTeam.members?.length || 0} Üye</span>
                                                    </div>
                                                    <div className="fs-team-members-list">
                                                        {selectedTeam.members && selectedTeam.members.length > 0 ? (
                                                            selectedTeam.members.map(m => (
                                                                <span key={m.id} className="fs-member-chip">
                                                                    {m.name || m.email}
                                                                </span>
                                                            ))
                                                        ) : (
                                                            <span className="fs-text-muted">Bu takımda henüz kayıtlı üye bulunmuyor.</span>
                                                        )}
                                                    </div>
                                                    <p className="fs-team-note">
                                                        ✓ Takımdaki tüm üyeler bu hekime açılan randevuları otomatik olarak görebilir ve yönetebilir.
                                                    </p>
                                                </div>
                                            ) : teams.length === 0 ? (
                                                <div className="fs-unassigned-note warning">
                                                    Henüz bir takımınız bulunmuyor. Sol menüden <strong>Ayarlar &gt; Takımlar</strong> bölümünden yeni bir takım oluşturabilirsiniz.
                                                </div>
                                            ) : null}
                                        </div>
                                    )}

                                    {/* Option 2: Bireysel Temsilci */}
                                    {doctorForm.assignmentType === 'USER' && (
                                        <div className="fs-assignment-body">
                                            <div className="fs-field">
                                                <label>Sorumlu CRM Temsilcisi <span className="req">*</span></label>
                                                <select 
                                                    className="fs-input"
                                                    value={doctorForm.userId}
                                                    onChange={e => setDoctorForm(prev => ({ ...prev, userId: e.target.value, teamId: '' }))}
                                                >
                                                    <option value="">Temsilci Seçiniz ({workspaceUsers.length} Kullanıcı)...</option>
                                                    {workspaceUsers.map(u => (
                                                        <option key={u.id} value={u.id}>👤 {u.name} ({u.email})</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <p className="fs-field-hint">
                                                Bu hekime randevu alındığında yalnızca bu kullanıcıya bildirim ve görev oluşturulur.
                                            </p>
                                        </div>
                                    )}

                                    {/* Option 3: Genel Havuz */}
                                    {doctorForm.assignmentType === 'UNASSIGNED' && (
                                        <div className="fs-unassigned-note">
                                            <span className="fs-pool-icon">🌐</span>
                                            <div>
                                                <strong>Genel Randevu Havuzu</strong>
                                                <p>Hekim herhangi bir takıma veya temsilciye atanmaz. Randevular genel havuzda listelenir ve yetkili tüm temsilciler görebilir.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* ── Google Takvim Entegrasyonu ── */}
                                <div className="fs-calendar-box">
                                    <div className="fs-calendar-head">
                                        <label className="fs-calendar-label">
                                            <Calendar size={14} className="text-blue" />
                                            <span>Google Takvim Entegrasyonu</span>
                                        </label>
                                        <p className="fs-calendar-desc">
                                            Bu hekime alınan randevuların otomatik işleneceği Google Takvim hesabını belirleyin.
                                        </p>
                                    </div>

                                    <div className="fs-field" style={{ marginBottom: doctorForm.calendarEmail || googleCalendars.length === 0 ? 8 : 0 }}>
                                        <select 
                                            className="fs-input"
                                            value={doctorForm.calendarEmail}
                                            onChange={e => setDoctorForm(prev => ({ ...prev, calendarEmail: e.target.value }))}
                                        >
                                            <option value="">🌐 Takvim Senkronizasyonu Yok (Sadece CRM)</option>
                                            {googleCalendars.map(cal => (
                                                <option key={cal.id} value={cal.googleEmail}>
                                                    📅 {cal.googleEmail} ({cal.user?.name ? `${cal.user.name} - ` : ''}Bağlı Hesap)
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {doctorForm.calendarEmail ? (
                                        <div className="fs-calendar-active-note">
                                            <CheckCircle2 size={13} className="text-emerald" />
                                            <span>
                                                Randevular otomatik olarak <strong>{doctorForm.calendarEmail}</strong> Google Takvimi'ne yazılacak ve Google Meet bağlantısı üretilecektir.
                                            </span>
                                        </div>
                                    ) : googleCalendars.length === 0 ? (
                                        <div className="fs-calendar-warning-note">
                                            <span>ℹ️ Bu çalışma alanına bağlı aktif bir Google Takvim bulunamadı. Sol menüden <strong>Ayarlar &gt; Entegrasyonlar</strong> sayfasından Google Takvim bağlayabilirsiniz.</span>
                                        </div>
                                    ) : null}
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
