import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

const ResourceSettings = () => {
    const { currentWorkspace } = useAuth();
    const [branches, setBranches] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    const [newBranchName, setNewBranchName] = useState('');
    const [newResourceName, setNewResourceName] = useState('');
    const [newResourceTitle, setNewResourceTitle] = useState('');
    const [newResourceUserId, setNewResourceUserId] = useState('');
    const [selectedBranchId, setSelectedBranchId] = useState('');
    const [assignmentMode, setAssignmentMode] = useState('round_robin');
    const [specificResourceId, setSpecificResourceId] = useState('');

    useEffect(() => {
        if (currentWorkspace?.id) {
            fetchData();
        }
    }, [currentWorkspace?.id]);

    const fetchData = async () => {
        try {
            const [branchRes, teamRes] = await Promise.all([
                api.get(`/appointment-config/${currentWorkspace.id}/branches`),
                api.get(`/teams/${currentWorkspace.id}`) // Assuming there's a way to get workspace users
            ]);
            setBranches(branchRes.data.branches || []);
            // Extract unique users from teams or fetch workspace members
            // For now, we'll try to get them from teams
            const allUsers = [];
            if (teamRes.data.teams) {
                teamRes.data.teams.forEach(team => {
                    team.members.forEach(member => {
                        if (!allUsers.find(u => u.id === member.user.id)) {
                            allUsers.push(member.user);
                        }
                    });
                });
            }
            setUsers(allUsers);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateBranch = async (e) => {
        e.preventDefault();
        if (!newBranchName.trim()) return;
        try {
            await api.post(`/appointment-config/${currentWorkspace.id}/branches`, { name: newBranchName });
            setNewBranchName('');
            fetchData();
        } catch (error) {
            console.error(error);
            alert('Grup oluşturulamadı');
        }
    };

    const handleCreateResource = async (e) => {
        e.preventDefault();
        if (!newResourceName.trim() || !selectedBranchId) return;
        try {
            await api.post(`/appointment-config/${currentWorkspace.id}/doctors`, {
                branchId: selectedBranchId,
                name: newResourceName,
                title: newResourceTitle,
                userId: newResourceUserId || null
            });
            setNewResourceName('');
            setNewResourceTitle('');
            setNewResourceUserId('');
            fetchData();
        } catch (error) {
            console.error(error);
            alert('Kaynak oluşturulamadı');
        }
    };

    const handleDeleteResource = async (id) => {
        if (!window.confirm('Bu kaynağı silmek istediğinize emin misiniz?')) return;
        try {
            await api.delete(`/appointment-config/${currentWorkspace.id}/doctors/${id}`);
            fetchData();
        } catch (error) {
            console.error(error);
        }
    };

    const handleDeleteBranch = async (id) => {
        if (!window.confirm('Bu grubu ve içindeki tüm kaynakları silmek istediğinize emin misiniz?')) return;
        try {
            await api.delete(`/appointment-config/${currentWorkspace.id}/branches/${id}`);
            fetchData();
        } catch (error) {
            console.error(error);
        }
    };

    if (loading) return <div style={{ padding: '20px' }}>Yükleniyor...</div>;

    return (
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '30px' }}>
            
            <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap' }}>
                {/* Gruplar (Branşlar) */}
                <div style={{ flex: 1, minWidth: '300px', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '20px', background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '15px' }}>Departmanlar / Gruplar</h2>
                <form onSubmit={handleCreateBranch} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                    <input 
                        type="text" 
                        value={newBranchName}
                        onChange={e => setNewBranchName(e.target.value)}
                        placeholder="Örn: Güzellik Uzmanları, Doktorlar..." 
                        style={{ flex: 1, padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                    />
                    <button type="submit" style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px' }}>
                        Ekle
                    </button>
                </form>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {branches.map(branch => (
                        <div key={branch.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
                            <span style={{ fontWeight: '500' }}>{branch.name}</span>
                            <button onClick={() => handleDeleteBranch(branch.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>Sil</button>
                        </div>
                    ))}
                    {branches.length === 0 && <div style={{ color: '#6b7280', fontSize: '14px' }}>Henüz grup eklenmemiş.</div>}
                </div>
            </div>

            {/* Kaynaklar (Kişiler/Doktorlar) */}
            <div style={{ flex: 2, minWidth: '500px', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '20px', background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '15px' }}>Kaynaklar / Personeller</h2>
                <form onSubmit={handleCreateResource} style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                    <select 
                        value={selectedBranchId}
                        onChange={e => setSelectedBranchId(e.target.value)}
                        style={{ padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', flex: 1, minWidth: '150px' }}
                        required
                    >
                        <option value="">-- Grup Seçin --</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>

                    <input 
                        type="text" 
                        value={newResourceName}
                        onChange={e => setNewResourceName(e.target.value)}
                        placeholder="Kaynak Adı (Örn: Ayşe Hanım)" 
                        style={{ flex: 1, padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', minWidth: '150px' }}
                        required
                    />

                    <input 
                        type="text" 
                        value={newResourceTitle}
                        onChange={e => setNewResourceTitle(e.target.value)}
                        placeholder="Branş / Alan / Unvan (Opsiyonel)" 
                        style={{ flex: 1, padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', minWidth: '150px' }}
                    />

                    <select 
                        value={newResourceUserId}
                        onChange={e => setNewResourceUserId(e.target.value)}
                        style={{ padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', flex: 1, minWidth: '150px' }}
                    >
                        <option value="">-- Sistem Kullanıcısı Bağla (Opsiyonel) --</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>

                    <button type="submit" style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px' }}>
                        Kaynak Ekle
                    </button>
                </form>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                        <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                            <th style={{ padding: '10px', borderBottom: '1px solid #e5e7eb' }}>Grup</th>
                            <th style={{ padding: '10px', borderBottom: '1px solid #e5e7eb' }}>Kaynak Adı</th>
                            <th style={{ padding: '10px', borderBottom: '1px solid #e5e7eb' }}>Branş / Alan</th>
                            <th style={{ padding: '10px', borderBottom: '1px solid #e5e7eb' }}>Bağlı Kullanıcı</th>
                            <th style={{ padding: '10px', borderBottom: '1px solid #e5e7eb' }}>İşlem</th>
                        </tr>
                    </thead>
                    <tbody>
                        {branches.flatMap(b => b.doctors.map(d => ({ ...d, branchName: b.name }))).map(resource => (
                            <tr key={resource.id}>
                                <td style={{ padding: '10px', borderBottom: '1px solid #e5e7eb' }}>{resource.branchName}</td>
                                <td style={{ padding: '10px', borderBottom: '1px solid #e5e7eb', fontWeight: '500' }}>{resource.name}</td>
                                <td style={{ padding: '10px', borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>{resource.title || '-'}</td>
                                <td style={{ padding: '10px', borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>
                                    {resource.userId ? users.find(u => u.id === resource.userId)?.name || 'Bilinmiyor' : '-'}
                                </td>
                                <td style={{ padding: '10px', borderBottom: '1px solid #e5e7eb' }}>
                                    <button onClick={() => handleDeleteResource(resource.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>Sil</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            </div> {/* End of Top Row */}

            {/* Retell Dağıtım Ayarları */}
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '20px', background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '15px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                    Yapay Zeka (Retell) Randevu Dağıtım Kuralları
                </h2>
                <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>
                    Yapay zeka asistanının randevuları hangi personele/kaynağa nasıl atayacağını buradan belirleyebilirsiniz.
                </p>

                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '300px' }}>
                        <label style={{ display: 'block', fontWeight: '500', color: '#334155', marginBottom: '8px', fontSize: '14px' }}>Dağıtım Modu</label>
                        <select 
                            value={assignmentMode}
                            onChange={(e) => setAssignmentMode(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', outline: 'none', background: '#f8fafc', color: '#0f172a', fontSize: '14px' }}
                        >
                            <option value="round_robin">Sırayla Atama (Round Robin)</option>
                            <option value="first_available">İlk Boş Olana Atama</option>
                            <option value="specific_resource">Sadece Belirli Kaynağa Atama</option>
                            <option value="manual_approval">Manuel Onay Bekle (Havuz)</option>
                        </select>
                        <p style={{ marginTop: '8px', fontSize: '13px', color: '#64748b' }}>
                            {assignmentMode === 'round_robin' && "Gelen randevular tüm uygun kaynaklara sırayla eşit olarak dağıtılır."}
                            {assignmentMode === 'first_available' && "Gelen randevu o saatte uygun olan ilk kaynağa atanır."}
                            {assignmentMode === 'specific_resource' && "Gelen tüm randevular seçilen kaynağın takvimine yazılır."}
                            {assignmentMode === 'manual_approval' && "Randevular taslak olarak havuza düşer, sizin atama yapmanız beklenir."}
                        </p>
                    </div>

                    {assignmentMode === 'specific_resource' && (
                        <div style={{ flex: 1, minWidth: '300px' }}>
                            <label style={{ display: 'block', fontWeight: '500', color: '#334155', marginBottom: '8px', fontSize: '14px' }}>Atanacak Kaynak (Personel)</label>
                            <select 
                                value={specificResourceId}
                                onChange={(e) => setSpecificResourceId(e.target.value)}
                                style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', outline: 'none', background: '#f8fafc', color: '#0f172a', fontSize: '14px' }}
                            >
                                <option value="">-- Kaynak Seçin --</option>
                                {branches.flatMap(b => b.doctors).map(r => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button style={{ padding: '10px 24px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 2px 4px rgba(59,130,246,0.3)' }}>
                        Ayarları Kaydet
                    </button>
                </div>
            </div>

        </div>
    );
};

export default ResourceSettings;
