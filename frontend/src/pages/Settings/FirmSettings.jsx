import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { appointmentConfigAPI } from '../../services/api';
import { 
    Building2, Stethoscope, HardHat, Briefcase, Plus, Edit2, Trash2, 
    CheckCircle2, Sparkles, Clock, Calendar, UserCheck, ShieldAlert, 
    X, Check, AlertCircle, RefreshCw
} from 'lucide-react';
import './FirmSettings.css';

const TURKISH_DAYS = [
    { key: 'monday', label: 'Pazartesi' },
    { key: 'tuesday', label: 'Salı' },
    { key: 'wednesday', label: 'Çarşamba' },
    { key: 'thursday', label: 'Perşembe' },
    { key: 'friday', label: 'Cuma' },
    { key: 'saturday', label: 'Cumartesi' },
    { key: 'sunday', label: 'Pazar' }
];

export default function FirmSettings() {
    const { currentWorkspace, user } = useAuth();

    // Super Admin Guard
    if (user?.role !== 'SUPER_ADMIN') {
        return (
            <div className="firm-access-denied">
                <ShieldAlert size={52} color="#ea580c" />
                <h2>Yetkisiz Erişim</h2>
                <p>Firma Ayarları ve Sektörel Yapılandırma alanına yalnızca Süper Yöneticiler (Super Admin) erişebilir.</p>
            </div>
        );
    }

    const [loading, setLoading] = useState(true);
    const [seeding, setSeeding] = useState(false);
    const [activeTab, setActiveTab] = useState('branches'); // 'branches' | 'doctors' | 'company'
    const [sector, setSector] = useState('HEALTH');

    const [branches, setBranches] = useState([]);
    const [workspaceUsers, setWorkspaceUsers] = useState([]);
    const [companyInfo, setCompanyInfo] = useState({
        companyName: '',
        companyPhone: '',
        companyEmail: '',
        companyAddress: '',
        companyWorkingHours: ''
    });

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
                setSector(res.data.sector || 'HEALTH');
                setBranches(res.data.branches || []);
                setWorkspaceUsers(res.data.users || []);
                if (res.data.workspace) {
                    setCompanyInfo({
                        companyName: res.data.workspace.companyName || res.data.workspace.name || '',
                        companyPhone: res.data.workspace.companyPhone || '',
                        companyEmail: res.data.workspace.companyEmail || '',
                        companyAddress: res.data.workspace.companyAddress || '',
                        companyWorkingHours: res.data.workspace.companyWorkingHours || '09:00 - 18:00'
                    });
                }
            }
        } catch (err) {
            console.error('loadSettings error:', err);
            showToast('Firma ayarları yüklenirken hata oluştu', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSettings();
    }, [currentWorkspace?.id]);

    // Handle Sector Switch
    const handleSectorChange = async (newSector) => {
        setSector(newSector);
        try {
            await appointmentConfigAPI.updateFirmSettings(currentWorkspace.id, { sector: newSector });
            showToast(`Sektör "${newSector === 'HEALTH' ? 'Sağlık & Klinik' : newSector === 'REAL_ESTATE' ? 'İnşaat & Gayrimenkul' : 'Genel'}" olarak güncellendi.`);
        } catch (err) {
            showToast('Sektör güncellenirken hata oluştu', 'error');
        }
    };

    // Seed Demo Health Data
    const handleSeedHealthDemo = async () => {
        if (!confirm('Sağlık sektörü için örnek şubeler, branşlar ve hekimler eklensin mi?')) return;
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
                showToast('Branş güncellendi.');
            } else {
                await appointmentConfigAPI.createBranch(currentWorkspace.id, { name: branchName.trim() });
                showToast('Yeni branş eklendi.');
            }
            setBranchModalOpen(false);
            loadSettings();
        } catch (err) {
            showToast(err.response?.data?.error || 'İşlem başarısız', 'error');
        }
    };

    const handleDeleteBranch = async (branchId, branchName) => {
        if (!confirm(`"${branchName}" branşını ve altındaki tüm hekimleri silmek istediğinize emin misiniz?`)) return;
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
            showToast('Lütfen doktor adı ve branşını seçin', 'error');
            return;
        }

        try {
            if (editingDoctor) {
                await appointmentConfigAPI.updateDoctor(currentWorkspace.id, editingDoctor.id, doctorForm);
                showToast('Hekim bilgileri güncellendi.');
            } else {
                await appointmentConfigAPI.createDoctor(currentWorkspace.id, doctorForm);
                showToast('Yeni hekim başarıyla eklendi.');
            }
            setDoctorModalOpen(false);
            loadSettings();
        } catch (err) {
            showToast(err.response?.data?.error || 'Hekim kaydedilemedi', 'error');
        }
    };

    const handleDeleteDoctor = async (doctorId, doctorName) => {
        if (!confirm(`"${doctorName}" hekimini silmek istediğinize emin misiniz?`)) return;
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

    // Save Company Info
    const handleSaveCompanyInfo = async (e) => {
        e.preventDefault();
        try {
            await appointmentConfigAPI.updateFirmSettings(currentWorkspace.id, companyInfo);
            showToast('Kurumsal bilgiler kaydedildi.');
        } catch (err) {
            showToast('Kaydetme hatası', 'error');
        }
    };

    // All doctors flat list
    const allDoctors = branches.flatMap(b => (b.doctors || []).map(d => ({ ...d, branchName: b.name })));

    return (
        <div className="firm-settings-page">
            {/* Header */}
            <div className="firm-header">
                <div className="firm-title-group">
                    <h1>
                        <Building2 size={26} color="#2563eb" />
                        Firma & Sektör Ayarları
                        <span className="super-admin-badge">Super Admin</span>
                    </h1>
                    <p className="firm-subtitle">
                        İşletmenizin sektörel profilini, uzman kadrosunu ve randevu dağıtım kurallarını tek merkezden yönetin.
                    </p>
                </div>
                <div className="firm-header-actions">
                    <button 
                        className="btn-seed-demo" 
                        onClick={handleSeedHealthDemo}
                        disabled={seeding}
                        title="Sağlık sektörü için hazır branş ve hekim örneklerini otomatik oluşturur"
                    >
                        <Sparkles size={16} />
                        {seeding ? 'Oluşturuluyor...' : 'Örnek Sağlık Verisi Yükle'}
                    </button>
                </div>
            </div>

            {/* Feedback Toast */}
            {toastMessage && (
                <div style={{
                    padding: '12px 18px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    fontWeight: '500',
                    fontSize: '0.9rem',
                    background: toastMessage.type === 'error' ? '#fee2e2' : '#dcfce7',
                    color: toastMessage.type === 'error' ? '#991b1b' : '#166534',
                    border: `1px solid ${toastMessage.type === 'error' ? '#fca5a5' : '#86efac'}`
                }}>
                    {toastMessage.text}
                </div>
            )}

            {/* Sektör Seçim Kartları */}
            <div className="sector-selection-card">
                <div className="sector-section-title">
                    <span>🏢 Workspace Sektör Profili</span>
                </div>
                <div className="sector-cards-grid">
                    {/* Sağlık */}
                    <div 
                        className={`sector-card ${sector === 'HEALTH' ? 'active' : ''}`}
                        onClick={() => handleSectorChange('HEALTH')}
                    >
                        <div className="sector-card-icon">🏥</div>
                        <div className="sector-card-info">
                            <h3>
                                Sağlık & Klinik
                                <span className="sector-badge active-badge">Seçili</span>
                            </h3>
                            <p>Hastaneler, klinikler ve poliklinikler için şube, branş, hekim ve seans randevu yönetimi.</p>
                        </div>
                    </div>

                    {/* İnşaat */}
                    <div 
                        className={`sector-card ${sector === 'REAL_ESTATE' ? 'active' : ''}`}
                        onClick={() => handleSectorChange('REAL_ESTATE')}
                    >
                        <div className="sector-card-icon">🏗️</div>
                        <div className="sector-card-info">
                            <h3>
                                İnşaat & Gayrimenkul
                                <span className="sector-badge upcoming-badge">Kullanılabilir</span>
                            </h3>
                            <p>Konut ve ticari projeler için proje sorumlusu, örnek daire randevusu ve satış danışmanı ataması.</p>
                        </div>
                    </div>

                    {/* Genel / Kurumsal */}
                    <div 
                        className={`sector-card ${sector === 'GENERAL' ? 'active' : ''}`}
                        onClick={() => handleSectorChange('GENERAL')}
                    >
                        <div className="sector-card-icon">💼</div>
                        <div className="sector-card-info">
                            <h3>
                                Genel / Danışmanlık
                                <span className="sector-badge upcoming-badge">Kullanılabilir</span>
                            </h3>
                            <p>Hizmet, hukuk, danışmanlık ve B2B şirketleri için toplantı ve danışman randevuları.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="firm-tabs-nav">
                <button 
                    className={`firm-tab-btn ${activeTab === 'branches' ? 'active' : ''}`}
                    onClick={() => setActiveTab('branches')}
                >
                    <Stethoscope size={18} />
                    Branşlar & Poliklinikler
                    <span className="firm-tab-badge">{branches.length}</span>
                </button>
                <button 
                    className={`firm-tab-btn ${activeTab === 'doctors' ? 'active' : ''}`}
                    onClick={() => setActiveTab('doctors')}
                >
                    <UserCheck size={18} />
                    Hekimler & Uzmanlar
                    <span className="firm-tab-badge">{allDoctors.length}</span>
                </button>
                <button 
                    className={`firm-tab-btn ${activeTab === 'company' ? 'active' : ''}`}
                    onClick={() => setActiveTab('company')}
                >
                    <Building2 size={18} />
                    Kurumsal Bilgiler
                </button>
            </div>

            {/* Content Body */}
            <div className="firm-content-card">
                {/* 1. BRANŞLAR SEKMESİ */}
                {activeTab === 'branches' && (
                    <div>
                        <div className="section-top-bar">
                            <h2>
                                <Stethoscope size={20} color="#2563eb" />
                                Tıbbi Branşlar & Bölümler
                            </h2>
                            <button className="btn-primary-action" onClick={openCreateBranchModal}>
                                <Plus size={16} /> Yeni Branş Ekle
                            </button>
                        </div>

                        {branches.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                                <p>Henüz tanımlı bir branş bulunmuyor.</p>
                                <button className="btn-seed-demo" onClick={handleSeedHealthDemo} style={{ marginTop: '10px' }}>
                                    <Sparkles size={16} /> Örnek Sağlık Verilerini Otomatik Ekle
                                </button>
                            </div>
                        ) : (
                            <div className="branches-grid">
                                {branches.map(branch => (
                                    <div key={branch.id} className="branch-card">
                                        <div>
                                            <div className="branch-card-header">
                                                <div>
                                                    <h3 className="branch-name">{branch.name}</h3>
                                                    <span className="branch-doctor-count">
                                                        {(branch.doctors || []).length} hekim tanımlı
                                                    </span>
                                                </div>
                                                <div className="branch-actions">
                                                    <button className="btn-icon-action" onClick={() => openEditBranchModal(branch)} title="Düzenle">
                                                        <Edit2 size={14} />
                                                    </button>
                                                    <button className="btn-icon-action danger" onClick={() => handleDeleteBranch(branch.id, branch.name)} title="Sil">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Hekim mini çipleri */}
                                            <div className="branch-doctors-list">
                                                {(branch.doctors || []).map(doc => (
                                                    <span key={doc.id} className="doctor-mini-chip">
                                                        {doc.title ? `${doc.title} ` : ''}{doc.name}
                                                    </span>
                                                ))}
                                                {(!branch.doctors || branch.doctors.length === 0) && (
                                                    <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                                        Henüz hekim eklenmedi
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <button 
                                            style={{
                                                marginTop: '14px',
                                                padding: '6px 10px',
                                                background: '#f8fafc',
                                                border: '1px dashed #cbd5e1',
                                                borderRadius: '6px',
                                                fontSize: '0.8rem',
                                                color: '#2563eb',
                                                fontWeight: '600',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px'
                                            }}
                                            onClick={() => openCreateDoctorModal(branch.id)}
                                        >
                                            <Plus size={14} /> Bu Branşa Hekim Ekle
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* 2. DOKTORLAR SEKMESİ */}
                {activeTab === 'doctors' && (
                    <div>
                        <div className="section-top-bar">
                            <h2>
                                <UserCheck size={20} color="#2563eb" />
                                Hekim Kadrosu & Çalışma Saatleri
                            </h2>
                            <button className="btn-primary-action" onClick={() => openCreateDoctorModal()}>
                                <Plus size={16} /> Yeni Hekim Ekle
                            </button>
                        </div>

                        {allDoctors.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                                <p>Henüz tanımlı hekim bulunmuyor. Önce branş ekleyin veya örnek verileri yükleyin.</p>
                            </div>
                        ) : (
                            <div className="doctors-table-wrapper">
                                <table className="doctors-table">
                                    <thead>
                                        <tr>
                                            <th>Hekim Bilgisi</th>
                                            <th>Branş</th>
                                            <th>Bağlı Sistem Temsilcisi (User)</th>
                                            <th>Mesai Saatleri</th>
                                            <th>Çalışma Günleri</th>
                                            <th>Seans</th>
                                            <th>İşlemler</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allDoctors.map(doc => {
                                            const assignedUser = workspaceUsers.find(u => u.id === doc.userId);
                                            let workingDaysArr = [];
                                            try {
                                                if (doc.workingDays) workingDaysArr = JSON.parse(doc.workingDays);
                                            } catch (_) {}

                                            return (
                                                <tr key={doc.id}>
                                                    <td>
                                                        <div className="doctor-name-col">
                                                            <div className="doctor-avatar">
                                                                {doc.name.charAt(0)}
                                                            </div>
                                                            <div className="doctor-info-text">
                                                                <strong>{doc.title ? `${doc.title} ` : ''}{doc.name}</strong>
                                                                <span className="doctor-title-tag">{doc.isActive ? 'Aktif Görevde' : 'Pasif'}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span style={{ fontWeight: '500', color: '#334155' }}>
                                                            {doc.branchName}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        {assignedUser ? (
                                                            <span className="assigned-user-chip">
                                                                <UserCheck size={14} />
                                                                {assignedUser.name}
                                                            </span>
                                                        ) : (
                                                            <span className="no-assigned-user">Atanmadı (Havuz)</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#334155', fontWeight: '500' }}>
                                                            <Clock size={14} color="#64748b" />
                                                            {doc.workStart || '09:00'} - {doc.workEnd || '17:00'}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="working-days-chips">
                                                            {workingDaysArr.map(dKey => {
                                                                const dayObj = TURKISH_DAYS.find(t => t.key === dKey);
                                                                return (
                                                                    <span key={dKey} className="day-badge">
                                                                        {dayObj ? dayObj.label.slice(0, 3) : dKey}
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span style={{ fontWeight: '600', color: '#0f172a' }}>
                                                            {doc.slotMinutes || 30} dk
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', gap: '6px' }}>
                                                            <button className="btn-icon-action" onClick={() => openEditDoctorModal(doc)} title="Düzenle">
                                                                <Edit2 size={14} />
                                                            </button>
                                                            <button className="btn-icon-action danger" onClick={() => handleDeleteDoctor(doc.id, doc.name)} title="Sil">
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

                {/* 3. KURUMSAL BİLGİLER */}
                {activeTab === 'company' && (
                    <form onSubmit={handleSaveCompanyInfo} style={{ maxWidth: '600px' }}>
                        <div className="section-top-bar">
                            <h2>
                                <Building2 size={20} color="#2563eb" />
                                Kurum / Hastane Genel Bilgileri
                            </h2>
                        </div>

                        <div className="firm-form-group">
                            <label>Kurum / Klinik Adı</label>
                            <input 
                                type="text" 
                                className="firm-form-input" 
                                value={companyInfo.companyName}
                                onChange={e => setCompanyInfo({ ...companyInfo, companyName: e.target.value })}
                                placeholder="Örn: Özel Medipol Sağlık Grubu"
                            />
                        </div>

                        <div className="firm-form-row">
                            <div className="firm-form-group">
                                <label>İletişim Telefonu</label>
                                <input 
                                    type="text" 
                                    className="firm-form-input" 
                                    value={companyInfo.companyPhone}
                                    onChange={e => setCompanyInfo({ ...companyInfo, companyPhone: e.target.value })}
                                    placeholder="+90 212 ..."
                                />
                            </div>
                            <div className="firm-form-group">
                                <label>Resmi E-Posta</label>
                                <input 
                                    type="email" 
                                    className="firm-form-input" 
                                    value={companyInfo.companyEmail}
                                    onChange={e => setCompanyInfo({ ...companyInfo, companyEmail: e.target.value })}
                                    placeholder="randevu@hastane.com"
                                />
                            </div>
                        </div>

                        <div className="firm-form-group">
                            <label>Genel Mesai Saatleri</label>
                            <input 
                                type="text" 
                                className="firm-form-input" 
                                value={companyInfo.companyWorkingHours}
                                onChange={e => setCompanyInfo({ ...companyInfo, companyWorkingHours: e.target.value })}
                                placeholder="Haftaiçi 09:00 - 18:00, Cumartesi 09:00 - 14:00"
                            />
                        </div>

                        <div className="firm-form-group">
                            <label>Adres & Lokasyon</label>
                            <textarea 
                                rows={3}
                                className="firm-form-input" 
                                value={companyInfo.companyAddress}
                                onChange={e => setCompanyInfo({ ...companyInfo, companyAddress: e.target.value })}
                                placeholder="Bağdat Cad. No: 124 Kadıköy / İstanbul"
                            />
                        </div>

                        <button type="submit" className="btn-modal-submit" style={{ marginTop: '10px' }}>
                            Bilgileri Kaydet
                        </button>
                    </form>
                )}
            </div>

            {/* BRANCH MODAL */}
            {branchModalOpen && (
                <div className="firm-modal-backdrop" onClick={() => setBranchModalOpen(false)}>
                    <div className="firm-modal-container" onClick={e => e.stopPropagation()}>
                        <div className="firm-modal-header">
                            <h3>{editingBranch ? 'Branşı Düzenle' : 'Yeni Tıbbi Branş Ekle'}</h3>
                            <button className="firm-modal-close" onClick={() => setBranchModalOpen(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveBranch}>
                            <div className="firm-modal-body">
                                <div className="firm-form-group">
                                    <label>Branş Adı *</label>
                                    <input 
                                        type="text" 
                                        className="firm-form-input"
                                        placeholder="Örn: Ağız ve Diş Sağlığı, Dermatoloji, Göz..."
                                        value={branchName}
                                        onChange={e => setBranchName(e.target.value)}
                                        required
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div className="firm-modal-footer">
                                <button type="button" className="btn-modal-cancel" onClick={() => setBranchModalOpen(false)}>
                                    İptal
                                </button>
                                <button type="submit" className="btn-modal-submit">
                                    {editingBranch ? 'Güncelle' : 'Kaydet'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* DOCTOR MODAL */}
            {doctorModalOpen && (
                <div className="firm-modal-backdrop" onClick={() => setDoctorModalOpen(false)}>
                    <div className="firm-modal-container" style={{ maxWidth: '620px' }} onClick={e => e.stopPropagation()}>
                        <div className="firm-modal-header">
                            <h3>{editingDoctor ? 'Hekim Bilgilerini Düzenle' : 'Yeni Hekim Tanımla'}</h3>
                            <button className="firm-modal-close" onClick={() => setDoctorModalOpen(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveDoctor}>
                            <div className="firm-modal-body">
                                <div className="firm-form-row">
                                    <div className="firm-form-group">
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
                                    <div className="firm-form-group">
                                        <label>Hekim Adı Soyadı *</label>
                                        <input 
                                            type="text" 
                                            className="firm-form-input"
                                            placeholder="Örn: Ahmet Yılmaz"
                                            value={doctorForm.name}
                                            onChange={e => setDoctorForm({ ...doctorForm, name: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="firm-form-row">
                                    <div className="firm-form-group">
                                        <label>Bağlı Olduğu Branş *</label>
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
                                    <div className="firm-form-group">
                                        <label>Sistem Temsilcisi (Atanacak Kullanıcı)</label>
                                        <select 
                                            className="firm-form-select"
                                            value={doctorForm.userId}
                                            onChange={e => setDoctorForm({ ...doctorForm, userId: e.target.value })}
                                        >
                                            <option value="">Kullanıcıya Bağlama (Havuz)</option>
                                            {workspaceUsers.map(u => (
                                                <option key={u.id} value={u.id}>
                                                    {u.name} ({u.email})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="firm-form-row">
                                    <div className="firm-form-group">
                                        <label>Mesai Başlangıç</label>
                                        <input 
                                            type="time" 
                                            className="firm-form-input"
                                            value={doctorForm.workStart}
                                            onChange={e => setDoctorForm({ ...doctorForm, workStart: e.target.value })}
                                        />
                                    </div>
                                    <div className="firm-form-group">
                                        <label>Mesai Bitiş</label>
                                        <input 
                                            type="time" 
                                            className="firm-form-input"
                                            value={doctorForm.workEnd}
                                            onChange={e => setDoctorForm({ ...doctorForm, workEnd: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="firm-form-group">
                                    <label>Randevu Seans Süresi (Dakika)</label>
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

                                <div className="firm-form-group">
                                    <label>Çalışma Günleri</label>
                                    <div className="days-checkboxes-grid">
                                        {TURKISH_DAYS.map(day => (
                                            <label key={day.key} className="day-checkbox-label">
                                                <input 
                                                    type="checkbox"
                                                    checked={doctorForm.workingDays.includes(day.key)}
                                                    onChange={() => toggleDay(day.key)}
                                                />
                                                {day.label}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="firm-modal-footer">
                                <button type="button" className="btn-modal-cancel" onClick={() => setDoctorModalOpen(false)}>
                                    İptal
                                </button>
                                <button type="submit" className="btn-modal-submit">
                                    {editingDoctor ? 'Güncelle' : 'Kaydet'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
