import re

with open("src/pages/KnowledgeBase/KnowledgeBase.jsx", "r") as f:
    content = f.read()

# 1. Update imports
import_old = "import { workspaceAPI, knowledgeBaseAPI, retellAPI, productAPI, appointmentConfigAPI } from '../../services/api';"
import_new = "import { workspaceAPI, knowledgeBaseAPI, retellAPI, productAPI, appointmentConfigAPI, teamAPI, funnelAPI } from '../../services/api';"
content = content.replace(import_old, import_new)

# 2. Add states for teams, funnels and branch dropdowns
state_hook_target = "    const [newBranchName, setNewBranchName] = useState('');"
state_hook_add = """    const [teams, setTeams] = useState([]);
    const [funnels, setFunnels] = useState([]);
    const [newBranchTeamId, setNewBranchTeamId] = useState('');
    const [newBranchFunnelId, setNewBranchFunnelId] = useState('');
    const [editBranchTeamId, setEditBranchTeamId] = useState('');
    const [editBranchFunnelId, setEditBranchFunnelId] = useState('');
    const [newBranchName, setNewBranchName] = useState('');"""
content = content.replace(state_hook_target, state_hook_add)

# 3. Add loadTeams and loadFunnels inside useEffect
use_effect_target = """            loadProductGroups();
            loadBranches();
        }
    }, [currentWorkspace]);"""
use_effect_new = """            loadProductGroups();
            loadBranches();
            loadTeams();
            loadFunnels();
        }
    }, [currentWorkspace]);

    const loadTeams = async () => {
        try {
            const res = await teamAPI.getWorkspaceTeams(currentWorkspace.id);
            setTeams(res.data?.teams || []);
        } catch (err) { console.error('Error loading teams:', err); }
    };

    const loadFunnels = async () => {
        try {
            const res = await funnelAPI.getAll(currentWorkspace.id);
            setFunnels(res.data?.funnels || []);
        } catch (err) { console.error('Error loading funnels:', err); }
    };"""
content = content.replace(use_effect_target, use_effect_new)

# 4. Update edit form click to populate new fields
# Wait, I am writing the UI, so I will handle editing branch there. But wait, `editBranchName` state is populated somewhere?
# No, `editingBranch` is only set to null right now. The UI doesn't exist, so there is no `setEditingBranch(branch)` logic to update!
# I will just write the whole branches tab UI.

# 5. Update handleCreateBranch
create_branch_old = """            await appointmentConfigAPI.createBranch(currentWorkspace.id, {
                name: newBranchName.trim(),
                address: newBranchAddress.trim(),
                phone: newBranchPhone.trim()
            });
            setNewBranchName('');
            setNewBranchAddress('');
            setNewBranchPhone('');
            loadBranches();"""
create_branch_new = """            await appointmentConfigAPI.createBranch(currentWorkspace.id, {
                name: newBranchName.trim(),
                address: newBranchAddress.trim(),
                phone: newBranchPhone.trim(),
                defaultTeamId: newBranchTeamId || null,
                defaultFunnelId: newBranchFunnelId || null
            });
            setNewBranchName('');
            setNewBranchAddress('');
            setNewBranchPhone('');
            setNewBranchTeamId('');
            setNewBranchFunnelId('');
            loadBranches();"""
content = content.replace(create_branch_old, create_branch_new)

# 6. Update handleUpdateBranch
update_branch_old = """            await appointmentConfigAPI.updateBranch(currentWorkspace.id, id, {
                name: editBranchName.trim(),
                address: editBranchAddress.trim(),
                phone: editBranchPhone.trim()
            });
            setEditingBranch(null);
            loadBranches();"""
update_branch_new = """            await appointmentConfigAPI.updateBranch(currentWorkspace.id, id, {
                name: editBranchName.trim(),
                address: editBranchAddress.trim(),
                phone: editBranchPhone.trim(),
                defaultTeamId: editBranchTeamId || null,
                defaultFunnelId: editBranchFunnelId || null
            });
            setEditingBranch(null);
            loadBranches();"""
content = content.replace(update_branch_old, update_branch_new)

# 7. Add branches UI
branches_ui = """            {/* Branches Tab */}
            {activeTab === 'branches' && (
                <div className="card" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                        <MapPin size={24} style={{ color: '#6366f1' }} />
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>Şubeler</h3>
                            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b' }}>Klinik şubelerinizi ve lokasyonlarınızı yönetin.</p>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>
                        <div>
                            {branchesLoading ? (
                                <div className="loading">Yükleniyor...</div>
                            ) : branches.length === 0 ? (
                                <div className="empty-state">Henüz şube eklenmemiş.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {branches.map(branch => (
                                        <div key={branch.id} style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div>
                                                <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem', color: '#1e293b' }}>{branch.name}</h4>
                                                {branch.address && <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '4px' }}>📍 {branch.address}</div>}
                                                {branch.phone && <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '4px' }}>📞 {branch.phone}</div>}
                                                {branch.defaultTeamId && <div style={{ fontSize: '0.8rem', color: '#6366f1', marginTop: '8px' }}>Takım: {teams.find(t => t.id === branch.defaultTeamId)?.name || 'Bilinmiyor'}</div>}
                                                {branch.defaultFunnelId && <div style={{ fontSize: '0.8rem', color: '#6366f1' }}>Akış: {funnels.find(f => f.id === branch.defaultFunnelId)?.name || 'Bilinmiyor'}</div>}
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button className="btn-icon" onClick={() => {
                                                    setEditingBranch(branch.id);
                                                    setEditBranchName(branch.name);
                                                    setEditBranchAddress(branch.address || '');
                                                    setEditBranchPhone(branch.phone || '');
                                                    setEditBranchTeamId(branch.defaultTeamId || '');
                                                    setEditBranchFunnelId(branch.defaultFunnelId || '');
                                                }}><Pencil size={16} /></button>
                                                <button className="btn-icon btn-danger" onClick={() => handleDeleteBranch(branch.id, branch.name)}><Trash2 size={16} /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', position: 'sticky', top: '24px' }}>
                                <h4 style={{ margin: '0 0 16px 0', color: '#1e293b' }}>{editingBranch ? 'Şubeyi Düzenle' : 'Yeni Şube Ekle'}</h4>
                                
                                <div className="form-group" style={{ marginBottom: '12px' }}>
                                    <label>Şube Adı *</label>
                                    <input type="text" className="input" value={editingBranch ? editBranchName : newBranchName} onChange={e => editingBranch ? setEditBranchName(e.target.value) : setNewBranchName(e.target.value)} placeholder="Örn: Merkez Şube" />
                                </div>
                                <div className="form-group" style={{ marginBottom: '12px' }}>
                                    <label>Adres</label>
                                    <textarea className="input" rows="2" value={editingBranch ? editBranchAddress : newBranchAddress} onChange={e => editingBranch ? setEditBranchAddress(e.target.value) : setNewBranchAddress(e.target.value)} placeholder="Açık adres..." />
                                </div>
                                <div className="form-group" style={{ marginBottom: '12px' }}>
                                    <label>Telefon</label>
                                    <input type="text" className="input" value={editingBranch ? editBranchPhone : newBranchPhone} onChange={e => editingBranch ? setEditBranchPhone(e.target.value) : setNewBranchPhone(e.target.value)} placeholder="+90..." />
                                </div>
                                
                                <div className="form-group" style={{ marginBottom: '12px' }}>
                                    <label>Varsayılan Takım</label>
                                    <select className="input" value={editingBranch ? editBranchTeamId : newBranchTeamId} onChange={e => editingBranch ? setEditBranchTeamId(e.target.value) : setNewBranchTeamId(e.target.value)}>
                                        <option value="">-- Seçiniz --</option>
                                        {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group" style={{ marginBottom: '16px' }}>
                                    <label>Varsayılan Akış</label>
                                    <select className="input" value={editingBranch ? editBranchFunnelId : newBranchFunnelId} onChange={e => editingBranch ? setEditBranchFunnelId(e.target.value) : setNewBranchFunnelId(e.target.value)}>
                                        <option value="">-- Seçiniz --</option>
                                        {funnels.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                    </select>
                                </div>

                                {editingBranch ? (
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => handleUpdateBranch(editingBranch)}>Kaydet</button>
                                        <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setEditingBranch(null)}>İptal</button>
                                    </div>
                                ) : (
                                    <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleCreateBranch} disabled={!newBranchName.trim()}>Şube Ekle</button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* List Tab */}"""
content = content.replace("            {/* List Tab */}", branches_ui)

with open("src/pages/KnowledgeBase/KnowledgeBase.jsx", "w") as f:
    f.write(content)
