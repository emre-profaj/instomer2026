import { useState, useEffect } from 'react';
import { appointmentConfigAPI } from '../../services/api';
import { Plus, Trash2, Edit2, Save, X, Clock, Stethoscope, User } from 'lucide-react';
import ConfirmModal from '../ConfirmModal/ConfirmModal';

const DAYS_OF_WEEK = [
    { key: 'monday', label: 'Pzt' },
    { key: 'tuesday', label: 'Sal' },
    { key: 'wednesday', label: 'Çar' },
    { key: 'thursday', label: 'Per' },
    { key: 'friday', label: 'Cum' },
    { key: 'saturday', label: 'Cmt' },
    { key: 'sunday', label: 'Paz' }
];

const AppointmentBotConfig = ({ workspaceId }) => {
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(false);
    const [newBranchName, setNewBranchName] = useState('');
    const [showAddBranch, setShowAddBranch] = useState(false);
    const [expandedBranch, setExpandedBranch] = useState(null);
    const [editingBranch, setEditingBranch] = useState(null);
    const [editBranchName, setEditBranchName] = useState('');

    // Doctor form state
    const [showAddDoctor, setShowAddDoctor] = useState(null); // branchId
    const [newDoctor, setNewDoctor] = useState({
        name: '', title: '', workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        workStart: '09:00', workEnd: '17:00', slotMinutes: 30
    });
    const [editingDoctor, setEditingDoctor] = useState(null);

    const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null, title: '', message: '' });

    useEffect(() => {
        if (workspaceId) loadBranches();
    }, [workspaceId]);

    const loadBranches = async () => {
        try {
            setLoading(true);
            const res = await appointmentConfigAPI.getBranches(workspaceId);
            setBranches(res.data.branches || []);
        } catch (error) {
            console.error('Load branches error:', error);
        } finally {
            setLoading(false);
        }
    };

    // ─── BRANCH Operations ──────────────────────────────────

    const handleCreateBranch = async () => {
        if (!newBranchName.trim()) return;
        try {
            await appointmentConfigAPI.createBranch(workspaceId, { name: newBranchName.trim() });
            setNewBranchName('');
            setShowAddBranch(false);
            loadBranches();
        } catch (error) {
            console.error('Create branch error:', error);
            alert('Branş oluşturulamadı.');
        }
    };

    const handleUpdateBranch = async (id) => {
        if (!editBranchName.trim()) return;
        try {
            await appointmentConfigAPI.updateBranch(workspaceId, id, { name: editBranchName.trim() });
            setEditingBranch(null);
            loadBranches();
        } catch (error) {
            console.error('Update branch error:', error);
        }
    };

    const handleDeleteBranch = (id, name) => {
        setConfirmModal({
            isOpen: true,
            title: 'Branş Sil',
            message: `"${name}" branşını ve altındaki tüm doktorları silmek istediğinize emin misiniz?`,
            confirmText: 'Sil',
            type: 'danger',
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                try {
                    await appointmentConfigAPI.deleteBranch(workspaceId, id);
                    loadBranches();
                } catch (error) {
                    console.error('Delete branch error:', error);
                }
            }
        });
    };

    // ─── DOCTOR Operations ──────────────────────────────────

    const handleCreateDoctor = async (branchId) => {
        if (!newDoctor.name.trim()) return;
        try {
            await appointmentConfigAPI.createDoctor(workspaceId, {
                branchId,
                name: newDoctor.name.trim(),
                title: newDoctor.title || null,
                workingDays: newDoctor.workingDays,
                workStart: newDoctor.workStart,
                workEnd: newDoctor.workEnd,
                slotMinutes: newDoctor.slotMinutes
            });
            setNewDoctor({
                name: '', title: '', workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
                workStart: '09:00', workEnd: '17:00', slotMinutes: 30
            });
            setShowAddDoctor(null);
            loadBranches();
        } catch (error) {
            console.error('Create doctor error:', error);
            alert('Doktor eklenemedi.');
        }
    };

    const handleUpdateDoctor = async (id) => {
        if (!editingDoctor) return;
        try {
            await appointmentConfigAPI.updateDoctor(workspaceId, id, {
                name: editingDoctor.name,
                title: editingDoctor.title,
                workingDays: editingDoctor.workingDays,
                workStart: editingDoctor.workStart,
                workEnd: editingDoctor.workEnd,
                slotMinutes: editingDoctor.slotMinutes,
                isActive: editingDoctor.isActive
            });
            setEditingDoctor(null);
            loadBranches();
        } catch (error) {
            console.error('Update doctor error:', error);
        }
    };

    const handleDeleteDoctor = (id, name) => {
        setConfirmModal({
            isOpen: true,
            title: 'Doktor Sil',
            message: `"${name}" doktorunu silmek istediğinize emin misiniz?`,
            confirmText: 'Sil',
            type: 'danger',
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                try {
                    await appointmentConfigAPI.deleteDoctor(workspaceId, id);
                    loadBranches();
                } catch (error) {
                    console.error('Delete doctor error:', error);
                }
            }
        });
    };

    const toggleDoctorDay = (dayKey, isNew = false) => {
        if (isNew) {
            setNewDoctor(prev => ({
                ...prev,
                workingDays: prev.workingDays.includes(dayKey)
                    ? prev.workingDays.filter(d => d !== dayKey)
                    : [...prev.workingDays, dayKey]
            }));
        } else if (editingDoctor) {
            setEditingDoctor(prev => ({
                ...prev,
                workingDays: prev.workingDays.includes(dayKey)
                    ? prev.workingDays.filter(d => d !== dayKey)
                    : [...prev.workingDays, dayKey]
            }));
        }
    };

    // ─── RENDER ─────────────────────────────────────────────

    const renderDoctorForm = (doctor, branchId, isEditing = false) => {
        const data = isEditing ? editingDoctor : newDoctor;
        const setData = isEditing
            ? (fn) => setEditingDoctor(prev => ({ ...prev, ...fn(prev) }))
            : (fn) => setNewDoctor(prev => ({ ...prev, ...fn(prev) }));

        return (
            <div className="doctor-form" style={{
                background: 'rgba(99, 102, 241, 0.05)',
                border: '1px solid rgba(99, 102, 241, 0.2)',
                borderRadius: '8px',
                padding: '12px',
                marginTop: '8px'
            }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '8px', marginBottom: '8px' }}>
                    <input
                        type="text"
                        className="input-modern input-sm"
                        placeholder="Doktor adı (ör: Ahmet Yılmaz)"
                        value={data.name}
                        onChange={(e) => isEditing ? setEditingDoctor(prev => ({ ...prev, name: e.target.value })) : setNewDoctor(prev => ({ ...prev, name: e.target.value }))}
                    />
                    <input
                        type="text"
                        className="input-modern input-sm"
                        placeholder="Ünvan"
                        value={data.title || ''}
                        onChange={(e) => isEditing ? setEditingDoctor(prev => ({ ...prev, title: e.target.value })) : setNewDoctor(prev => ({ ...prev, title: e.target.value }))}
                    />
                </div>

                <div style={{ marginBottom: '8px' }}>
                    <label className="form-label-sm" style={{ fontSize: '11px', marginBottom: '4px', display: 'block' }}>Çalışma Günleri</label>
                    <div className="days-selector" style={{ gap: '4px' }}>
                        {DAYS_OF_WEEK.map(day => (
                            <button
                                key={day.key}
                                type="button"
                                className={`day-btn ${data.workingDays?.includes(day.key) ? 'active' : ''}`}
                                onClick={() => toggleDoctorDay(day.key, !isEditing)}
                                style={{ padding: '2px 8px', fontSize: '11px' }}
                            >
                                {day.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: '8px', marginBottom: '8px' }}>
                    <div>
                        <label className="form-label-sm" style={{ fontSize: '11px' }}>Başlangıç</label>
                        <input type="time" className="input-modern input-sm" value={data.workStart || '09:00'}
                            onChange={(e) => isEditing ? setEditingDoctor(prev => ({ ...prev, workStart: e.target.value })) : setNewDoctor(prev => ({ ...prev, workStart: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="form-label-sm" style={{ fontSize: '11px' }}>Bitiş</label>
                        <input type="time" className="input-modern input-sm" value={data.workEnd || '17:00'}
                            onChange={(e) => isEditing ? setEditingDoctor(prev => ({ ...prev, workEnd: e.target.value })) : setNewDoctor(prev => ({ ...prev, workEnd: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="form-label-sm" style={{ fontSize: '11px' }}>Süre (dk)</label>
                        <input type="number" className="input-modern input-sm" min="10" max="120" value={data.slotMinutes || 30}
                            onChange={(e) => isEditing ? setEditingDoctor(prev => ({ ...prev, slotMinutes: parseInt(e.target.value) || 30 })) : setNewDoctor(prev => ({ ...prev, slotMinutes: parseInt(e.target.value) || 30 }))}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button className="btn-modern btn-outline-secondary" style={{ fontSize: '11px', padding: '4px 12px' }}
                        onClick={() => isEditing ? setEditingDoctor(null) : setShowAddDoctor(null)}>
                        <X size={12} /> İptal
                    </button>
                    <button className="btn-modern btn-primary" style={{ fontSize: '11px', padding: '4px 12px' }}
                        onClick={() => isEditing ? handleUpdateDoctor(editingDoctor.id) : handleCreateDoctor(branchId)}>
                        <Save size={12} /> {isEditing ? 'Güncelle' : 'Ekle'}
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="bot-settings-section">
            <div className="section-header-toggle">
                <div className="section-title-group">
                    <Stethoscope size={18} />
                    <span>Branş & Doktor Yapılandırması</span>
                </div>
            </div>
            <div className="section-content">
                <p className="section-description">
                    Randevu asistanının sunacağı branşları ve doktorları tanımlayın. Bot bu bilgileri kullanarak müşterilere uygun randevu seçenekleri sunar.
                </p>

                {loading ? (
                    <p className="text-muted text-sm">Yükleniyor...</p>
                ) : (
                    <>
                        {/* Branch List */}
                        {branches.map(branch => (
                            <div key={branch.id} style={{
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: '8px',
                                marginBottom: '8px',
                                overflow: 'hidden'
                            }}>
                                {/* Branch Header */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '10px 12px',
                                    background: 'rgba(99, 102, 241, 0.08)',
                                    cursor: 'pointer'
                                }}
                                    onClick={() => setExpandedBranch(expandedBranch === branch.id ? null : branch.id)}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Stethoscope size={16} style={{ color: '#6366f1' }} />
                                        {editingBranch === branch.id ? (
                                            <input
                                                type="text"
                                                className="input-modern input-sm"
                                                value={editBranchName}
                                                onChange={(e) => setEditBranchName(e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                                onKeyDown={(e) => e.key === 'Enter' && handleUpdateBranch(branch.id)}
                                                autoFocus
                                                style={{ width: '160px' }}
                                            />
                                        ) : (
                                            <span style={{ fontWeight: 500, fontSize: '13px' }}>{branch.name}</span>
                                        )}
                                        <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                                            ({branch.doctors?.length || 0} doktor)
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                                        {editingBranch === branch.id ? (
                                            <>
                                                <button className="btn-modern btn-primary" style={{ padding: '4px 8px', fontSize: '11px' }}
                                                    onClick={() => handleUpdateBranch(branch.id)}>
                                                    <Save size={12} />
                                                </button>
                                                <button className="btn-modern btn-outline-secondary" style={{ padding: '4px 8px', fontSize: '11px' }}
                                                    onClick={() => setEditingBranch(null)}>
                                                    <X size={12} />
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button className="btn-modern btn-outline-primary" style={{ padding: '4px 8px' }}
                                                    onClick={() => { setEditingBranch(branch.id); setEditBranchName(branch.name); }}>
                                                    <Edit2 size={12} />
                                                </button>
                                                <button className="btn-modern btn-outline-danger" style={{ padding: '4px 8px' }}
                                                    onClick={() => handleDeleteBranch(branch.id, branch.name)}>
                                                    <Trash2 size={12} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Doctors List (Expanded) */}
                                {expandedBranch === branch.id && (
                                    <div style={{ padding: '8px 12px' }}>
                                        {branch.doctors?.length > 0 ? (
                                            branch.doctors.map(doc => (
                                                <div key={doc.id} style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    padding: '8px',
                                                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                                                    fontSize: '12px'
                                                }}>
                                                    {editingDoctor?.id === doc.id ? (
                                                        renderDoctorForm(doc, branch.id, true)
                                                    ) : (
                                                        <>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <User size={14} style={{ color: doc.isActive ? '#10b981' : '#6b7280' }} />
                                                                <span>{doc.title ? `${doc.title} ` : ''}{doc.name}</span>
                                                                <span style={{ color: '#6b7280', fontSize: '11px' }}>
                                                                    <Clock size={10} style={{ display: 'inline', marginRight: '2px' }} />
                                                                    {doc.workStart || '09:00'}-{doc.workEnd || '17:00'} | {doc.slotMinutes || 30}dk
                                                                </span>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                                <button className="btn-modern btn-outline-primary" style={{ padding: '2px 6px' }}
                                                                    onClick={() => {
                                                                        let wd = [];
                                                                        try { wd = JSON.parse(doc.workingDays || '[]'); } catch (e) { }
                                                                        setEditingDoctor({
                                                                            id: doc.id, name: doc.name, title: doc.title || '',
                                                                            workingDays: wd, workStart: doc.workStart || '09:00',
                                                                            workEnd: doc.workEnd || '17:00', slotMinutes: doc.slotMinutes || 30,
                                                                            isActive: doc.isActive
                                                                        });
                                                                    }}>
                                                                    <Edit2 size={11} />
                                                                </button>
                                                                <button className="btn-modern btn-outline-danger" style={{ padding: '2px 6px' }}
                                                                    onClick={() => handleDeleteDoctor(doc.id, doc.name)}>
                                                                    <Trash2 size={11} />
                                                                </button>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-muted" style={{ fontSize: '12px', margin: '8px 0' }}>
                                                Bu branşta henüz doktor yok. Aşağıdaki butona tıklayarak ekleyin.
                                            </p>
                                        )}

                                        {/* Add Doctor */}
                                        {showAddDoctor === branch.id ? (
                                            renderDoctorForm(null, branch.id, false)
                                        ) : (
                                            <button
                                                className="btn-modern btn-outline-primary"
                                                style={{ fontSize: '11px', padding: '4px 12px', marginTop: '8px' }}
                                                onClick={() => setShowAddDoctor(branch.id)}
                                            >
                                                <Plus size={12} /> Doktor Ekle
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Add Branch */}
                        {showAddBranch ? (
                            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                <input
                                    type="text"
                                    className="input-modern input-sm"
                                    placeholder="Branş adı (ör: Dahiliye)"
                                    value={newBranchName}
                                    onChange={(e) => setNewBranchName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleCreateBranch()}
                                    autoFocus
                                    style={{ flex: 1 }}
                                />
                                <button className="btn-modern btn-primary" style={{ fontSize: '12px', padding: '4px 12px' }}
                                    onClick={handleCreateBranch}>
                                    <Save size={14} /> Kaydet
                                </button>
                                <button className="btn-modern btn-outline-secondary" style={{ fontSize: '12px', padding: '4px 12px' }}
                                    onClick={() => { setShowAddBranch(false); setNewBranchName(''); }}>
                                    <X size={14} />
                                </button>
                            </div>
                        ) : (
                            <button
                                className="btn-modern btn-outline-primary"
                                style={{ fontSize: '12px', padding: '6px 14px', marginTop: '8px' }}
                                onClick={() => setShowAddBranch(true)}
                            >
                                <Plus size={14} /> Yeni Branş Ekle
                            </button>
                        )}
                    </>
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
        </div>
    );
};

export default AppointmentBotConfig;
