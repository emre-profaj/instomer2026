import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { workspaceAPI, companyAPI, billingAPI } from '../../services/api';
import AIIntegrationSettings from '../../components/Settings/AIIntegrationSettings';
import WhatsAppSettings from '../../components/Settings/WhatsAppSettings';
import FlowTest from '../FlowTest/FlowTest';
import { Trash2, Shield, Bot, AlertCircle, Plus, Building2, GitBranch, MessageSquare, CreditCard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './Settings.css';

// ─── NetGSM SMS Ayarları Alt Bileşeni ─────────────────────
const NetGSMSettings = ({ workspaceId }) => {
    const [config, setConfig] = useState({ username: '', password: '', msgHeader: 'INSTOMER', enabled: false });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testPhone, setTestPhone] = useState('');
    const [testResult, setTestResult] = useState(null);
    const [balance, setBalance] = useState(null);

    useEffect(() => {
        loadConfig();
    }, [workspaceId]);

    const loadConfig = async () => {
        try {
            setLoading(true);
            const res = await workspaceAPI.getNetgsmConfig(workspaceId);
            if (res.data?.config) setConfig(res.data.config);
        } catch { } finally { setLoading(false); }
    };

    const saveConfig = async () => {
        try {
            setSaving(true);
            const res = await workspaceAPI.updateNetgsmConfig(workspaceId, config);
            if (res.data?.config) setConfig(res.data.config);
            setTestResult({ type: 'success', msg: 'Ayarlar kaydedildi ✅' });
        } catch (err) {
            setTestResult({ type: 'error', msg: err.response?.data?.error || 'Kayıt hatası' });
        } finally { setSaving(false); }
    };

    const handleTest = async () => {
        if (!testPhone) return;
        try {
            setTestResult({ type: 'info', msg: 'SMS gönderiliyor...' });
            const res = await workspaceAPI.testNetgsmSms(workspaceId, testPhone);
            setTestResult({ type: res.data?.result?.success ? 'success' : 'error', msg: res.data?.result?.success ? 'Test SMS gönderildi ✅' : `Hata: ${res.data?.result?.error}` });
        } catch (err) {
            setTestResult({ type: 'error', msg: err.response?.data?.error || 'SMS gönderilemedi' });
        }
    };

    const handleBalance = async () => {
        try {
            const res = await workspaceAPI.getNetgsmBalance(workspaceId);
            setBalance(res.data?.success ? res.data.balance : 'Sorgulama hatası');
        } catch { setBalance('Sorgulama hatası'); }
    };

    if (loading) return <div className="settings-section"><div className="loading">Yükleniyor...</div></div>;

    return (
        <div className="settings-section">
            <div className="section-header"><h2><MessageSquare size={20} /> NetGSM SMS Entegrasyonu</h2></div>
            <div className="card" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                    <label style={{ fontWeight: 600 }}>SMS Gönderim</label>
                    <button
                        className={`btn btn-sm ${config.enabled ? 'btn-success' : 'btn-secondary'}`}
                        onClick={() => setConfig(c => ({ ...c, enabled: !c.enabled }))}
                    >
                        {config.enabled ? '✅ Aktif' : '⏸️ Pasif'}
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div className="form-group">
                        <label>Kullanıcı Adı (Abone No)</label>
                        <input type="text" value={config.username || ''} onChange={e => setConfig(c => ({ ...c, username: e.target.value }))} placeholder="850XXXXXXX" />
                    </div>
                    <div className="form-group">
                        <label>API Şifresi</label>
                        <input type="password" value={config.password || ''} onChange={e => setConfig(c => ({ ...c, password: e.target.value }))} placeholder="••••••••" />
                    </div>
                    <div className="form-group">
                        <label>Mesaj Başlığı (Gönderici)</label>
                        <input type="text" value={config.msgHeader || ''} onChange={e => setConfig(c => ({ ...c, msgHeader: e.target.value }))} placeholder="INSTOMER" />
                    </div>
                    <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <button className="btn btn-primary" onClick={saveConfig} disabled={saving} style={{ width: '100%' }}>
                            {saving ? 'Kaydediliyor...' : '💾 Kaydet'}
                        </button>
                    </div>
                </div>

                {testResult && (
                    <div style={{
                        padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem',
                        background: testResult.type === 'success' ? '#dcfce7' : testResult.type === 'error' ? '#fef2f2' : '#eff6ff',
                        color: testResult.type === 'success' ? '#166534' : testResult.type === 'error' ? '#991b1b' : '#1e40af'
                    }}>
                        {testResult.msg}
                    </div>
                )}

                <div style={{ borderTop: '1px solid #eee', paddingTop: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <input type="tel" value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="05XX XXX XX XX" style={{ flex: 1, maxWidth: '200px' }} />
                    <button className="btn btn-sm btn-secondary" onClick={handleTest} disabled={!testPhone}>📱 Test SMS Gönder</button>
                    <button className="btn btn-sm btn-secondary" onClick={handleBalance}>💰 Bakiye Sorgula</button>
                    {balance !== null && <span style={{ fontSize: '0.85rem', color: '#666' }}>Bakiye: <strong>{balance}</strong> SMS</span>}
                </div>
            </div>
        </div>
    );
};

// ─── Faturalandırma Alt Bileşeni ─────────────────────
const BillingTab = () => {
    const [billingData, setBillingData] = useState(null);
    const [usage, setUsage] = useState(null);
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedCompanyId, setSelectedCompanyId] = useState(null);

    useEffect(() => {
        loadBilling();
    }, []);

    useEffect(() => {
        if (selectedCompanyId) {
            loadUsage(selectedCompanyId);
            loadInvoices(selectedCompanyId);
        }
    }, [selectedCompanyId]);

    const loadBilling = async () => {
        try {
            const res = await billingAPI.getMyBilling();
            setBillingData(res.data);
            if (res.data.companies?.length > 0) {
                setSelectedCompanyId(res.data.companies[0].id);
            }
        } catch { } finally { setLoading(false); }
    };

    const loadUsage = async (cId) => {
        try {
            const res = await billingAPI.getMyUsage(cId);
            setUsage(res.data);
        } catch { }
    };

    const loadInvoices = async (cId) => {
        try {
            const res = await billingAPI.getMyInvoices(cId);
            setInvoices(res.data.invoices || []);
        } catch { }
    };

    const typeLabels = {
        AI_CHAT: '🤖 AI Yazışma',
        AI_CALL: '☎️ AI Arama',
        WHATSAPP_TEMPLATE: '📨 WhatsApp',
        SMS: '💬 SMS',
        EMAIL: '📧 E-posta'
    };

    const statusLabels = {
        DRAFT: { text: 'Taslak', color: '#6b7280' },
        SENT: { text: 'Gönderildi', color: '#f59e0b' },
        PAID: { text: 'Ödendi', color: '#10b981' },
        OVERDUE: { text: 'Gecikmiş', color: '#ef4444' },
        CANCELLED: { text: 'İptal', color: '#6b7280' }
    };

    if (loading) return <div style={{ padding: 24, textAlign: 'center' }}>Yükleniyor...</div>;

    if (!billingData?.companies?.length) {
        return (
            <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
                <CreditCard size={48} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
                <p>Henüz faturalandırma bilgisi bulunmuyor.</p>
            </div>
        );
    }

    const company = billingData.companies.find(c => c.id === selectedCompanyId) || billingData.companies[0];
    const billing = company?.billing;

    return (
        <div className="settings-section">
            {/* Firma seçici (birden fazla firma varsa) */}
            {billingData.companies.length > 1 && (
                <div style={{ marginBottom: 16 }}>
                    <select value={selectedCompanyId} onChange={e => setSelectedCompanyId(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.9rem' }}>
                        {billingData.companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
            )}

            {/* Paket & Bakiye */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
                <div style={{ padding: 20, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 4 }}>📦 Mevcut Plan</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{billing?.plan?.name || 'Plan atanmamış'}</div>
                    {billing?.plan?.monthlyPrice > 0 && <div style={{ fontSize: '0.85rem', color: '#6366f1' }}>${billing.plan.monthlyPrice}/ay</div>}
                </div>
                <div style={{ padding: 20, background: billing?.creditBalance > 10 ? '#f0fdf4' : billing?.creditBalance > 0 ? '#fffbeb' : '#fef2f2', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 4 }}>💎 Bakiye</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>${(billing?.creditBalance || 0).toFixed(2)}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{billing?.billingType === 'PREPAID' ? 'Ön ödemeli' : 'Son ödemeli'}</div>
                </div>
                <div style={{ padding: 20, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 4 }}>📊 Bu Ay Toplam</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>${(usage?.total || 0).toFixed(2)}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{usage?.period || ''}</div>
                </div>
            </div>

            {/* Bu Ayki Kullanım */}
            {usage?.usageByType?.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 12 }}>📊 Bu Ayki Kullanım</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                                <th style={{ textAlign: 'left', padding: '8px 12px' }}>Tür</th>
                                <th style={{ textAlign: 'right', padding: '8px 12px' }}>Adet</th>
                                <th style={{ textAlign: 'right', padding: '8px 12px' }}>Tutar</th>
                            </tr>
                        </thead>
                        <tbody>
                            {usage.usageByType.map((u, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '8px 12px' }}>{typeLabels[u.type] || u.type}</td>
                                    <td style={{ textAlign: 'right', padding: '8px 12px' }}>{u._count?.toLocaleString()}</td>
                                    <td style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 500 }}>${(u._sum?.priceUsd || 0).toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Fatura Geçmişi */}
            <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 12 }}>🧾 Fatura Geçmişi</h3>
                {invoices.length === 0 ? (
                    <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>Henüz fatura bulunmuyor.</p>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                                <th style={{ textAlign: 'left', padding: '8px 12px' }}>Fatura No</th>
                                <th style={{ textAlign: 'left', padding: '8px 12px' }}>Dönem</th>
                                <th style={{ textAlign: 'right', padding: '8px 12px' }}>Tutar</th>
                                <th style={{ textAlign: 'center', padding: '8px 12px' }}>Durum</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoices.map(inv => (
                                <tr key={inv.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{inv.invoiceNumber}</td>
                                    <td style={{ padding: '8px 12px' }}>{inv.period}</td>
                                    <td style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 500 }}>${inv.totalAmount?.toFixed(2)}</td>
                                    <td style={{ textAlign: 'center', padding: '8px 12px' }}>
                                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: '0.8rem', background: statusLabels[inv.status]?.color + '20', color: statusLabels[inv.status]?.color }}>
                                            {statusLabels[inv.status]?.text || inv.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};


const Settings = () => {
    const { currentWorkspace, user, switchWorkspace } = useAuth();
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('workspaces');
    const [workspaces, setWorkspaces] = useState([]);
    const [myCompanies, setMyCompanies] = useState([]);
    const [loading, setLoading] = useState(false);

    const [isCreateWorkspaceModalOpen, setIsCreateWorkspaceModalOpen] = useState(false);
    const [selectedCompanyForWorkspace, setSelectedCompanyForWorkspace] = useState(null);
    const [newWorkspaceName, setNewWorkspaceName] = useState('');
    const [newWorkspaceDescription, setNewWorkspaceDescription] = useState('');
    const [createWorkspaceError, setCreateWorkspaceError] = useState('');
    const [creatingWorkspace, setCreatingWorkspace] = useState(false);

    const isOwner = currentWorkspace?.members?.find(m => m.userId === user?.id && m.role === 'OWNER');

    useEffect(() => {
        if (currentWorkspace && activeTab === 'workspaces') {
            loadWorkspaces();
            loadMyCompanies();
        }
    }, [currentWorkspace, activeTab]);

    const loadWorkspaces = async () => {
        try {
            setLoading(true);
            const response = await workspaceAPI.getAll();
            setWorkspaces(response.data.workspaces);
        } catch (error) {
            console.error('Error loading workspaces:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadMyCompanies = async () => {
        try {
            const response = await companyAPI.getMyCompanies();
            setMyCompanies(response.data.companies || []);
        } catch (error) {
            console.error('Error loading companies:', error);
        }
    };

    const handleCreateWorkspace = async (e) => {
        e.preventDefault();
        if (!selectedCompanyForWorkspace || !newWorkspaceName.trim()) {
            setCreateWorkspaceError(t('settings.fillAllFields'));
            return;
        }
        setCreatingWorkspace(true);
        setCreateWorkspaceError('');
        try {
            await companyAPI.createWorkspace(selectedCompanyForWorkspace.id, {
                name: newWorkspaceName.trim(),
                description: newWorkspaceDescription.trim()
            });
            setIsCreateWorkspaceModalOpen(false);
            setNewWorkspaceName('');
            setNewWorkspaceDescription('');
            setSelectedCompanyForWorkspace(null);
            loadWorkspaces();
            loadMyCompanies();
            alert(t('settings.workspaceCreated'));
        } catch (error) {
            setCreateWorkspaceError(error.response?.data?.error || t('settings.workspaceCreateError'));
        } finally {
            setCreatingWorkspace(false);
        }
    };

    const openCreateWorkspaceModal = (company) => {
        setSelectedCompanyForWorkspace(company);
        setNewWorkspaceName('');
        setNewWorkspaceDescription('');
        setCreateWorkspaceError('');
        setIsCreateWorkspaceModalOpen(true);
    };

    const handleDeleteWorkspace = async (workspaceId) => {
        if (!confirm(t('settings.deleteWorkspaceConfirm'))) return;
        const workspaceName = prompt(t('settings.deleteWorkspacePrompt'));
        const workspaceToDelete = workspaces.find(w => w.id === workspaceId);
        if (workspaceName !== workspaceToDelete.name) {
            alert(t('settings.nameMismatch'));
            return;
        }
        try {
            await workspaceAPI.delete(workspaceId);
            alert(t('settings.workspaceDeleted'));
            if (currentWorkspace.id === workspaceId) {
                window.location.reload();
            } else {
                loadWorkspaces();
            }
        } catch (error) {
            console.error('Error deleting workspace:', error);
            alert(error.response?.data?.error || t('settings.workspaceDeleteError'));
        }
    };

    if (!currentWorkspace) {
        return <div className="empty-state"><p>{t('settings.selectWorkspace')}</p></div>;
    }

    return (
        <div className="settings-page">
            <div className="settings-tabs">
                <button className={`tab-btn ${activeTab === 'workspaces' ? 'active' : ''}`} onClick={() => setActiveTab('workspaces')}>
                    <Shield size={16} /> {t('settings.businesses')}
                </button>
                <button className={`tab-btn ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => setActiveTab('ai')}>
                    <Bot size={16} /> {t('settings.aiIntegration')}
                </button>
                <button className={`tab-btn ${activeTab === 'sms' ? 'active' : ''}`} onClick={() => setActiveTab('sms')}>
                    <MessageSquare size={16} /> SMS (NetGSM)
                </button>
                <button className={`tab-btn ${activeTab === 'billing' ? 'active' : ''}`} onClick={() => setActiveTab('billing')}>
                    <CreditCard size={16} /> Faturalandırma
                </button>
                {user?.role === 'SUPER_ADMIN' && (
                    <button className={`tab-btn ${activeTab === 'flow-test' ? 'active' : ''}`} onClick={() => setActiveTab('flow-test')}>
                        <GitBranch size={16} /> Akış Test
                    </button>
                )}
            </div>

            <div className="settings-content">
                {activeTab === 'workspaces' && (
                    <div className="settings-section">
                        {myCompanies.length > 0 && (
                            <div className="companies-section">
                                <div className="section-header">
                                    <h2><Building2 size={20} /> {t('settings.myCompanies')}</h2>
                                </div>
                                <div className="companies-grid">
                                    {myCompanies.map(company => {
                                        const usedWorkspaces = company._count?.workspaces || 0;
                                        const maxWorkspaces = company.maxWorkspaces || 3;
                                        const canCreate = usedWorkspaces < maxWorkspaces;
                                        return (
                                            <div key={company.id} className="company-card-settings">
                                                <div className="company-card-header">
                                                    <h3>{company.name}</h3>
                                                    <span className={`subscription-badge ${company.aiSubscriptionType?.toLowerCase()}`}>{company.aiSubscriptionType}</span>
                                                </div>
                                                <div className="company-quota">
                                                    <span className="quota-label">{t('settings.workspaceUsage')}:</span>
                                                    <div className="quota-bar">
                                                        <div className="quota-fill" style={{ width: `${(usedWorkspaces / maxWorkspaces) * 100}%` }} />
                                                    </div>
                                                    <span className="quota-text">{usedWorkspaces} / {maxWorkspaces}</span>
                                                </div>
                                                {canCreate ? (
                                                    <button className="btn btn-primary btn-sm" onClick={() => openCreateWorkspaceModal(company)}>
                                                        <Plus size={14} /> {t('settings.newWorkspace')}
                                                    </button>
                                                ) : (
                                                    <div className="quota-exceeded">
                                                        <AlertCircle size={14} />
                                                        <span>{t('settings.workspaceLimitReached')}</span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        <div className="section-header"><h2>{t('settings.myWorkspaces')}</h2></div>
                        {loading ? (
                            <div className="loading">{t('common.loading')}</div>
                        ) : (
                            <div className="card">
                                {workspaces.map((ws) => {
                                    const wsIsOwner = ws.members?.some(m => m.role === 'OWNER' && m.userId === user.id);
                                    return (
                                        <div key={ws.id} className="workspace-item" style={{ padding: '16px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div className="member-info" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div>
                                                    <h4 style={{ margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        {ws.name}
                                                        {currentWorkspace.id === ws.id && <span className="badge badge-success" style={{ fontSize: '0.7em' }}>{t('settings.active')}</span>}
                                                    </h4>
                                                    <div className="meta-info" style={{ fontSize: '0.8rem', color: '#666' }}>
                                                        <span>{ws._count?.members || 0} {t('settings.members')}</span> • <span>{ws._count?.facebookPages || 0} {t('settings.pages')}</span> • <span>{ws._count?.conversations || 0} {t('settings.conversations')}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                {currentWorkspace.id !== ws.id && (
                                                    <button className="btn btn-sm btn-secondary" onClick={() => switchWorkspace(ws.id)}>{t('settings.switchTo')}</button>
                                                )}
                                                {wsIsOwner && (
                                                    <button className="btn-icon btn-danger" onClick={() => handleDeleteWorkspace(ws.id)} title={t('settings.deleteWorkspace')}>
                                                        <Trash2 size={18} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
                {activeTab === 'ai' && <AIIntegrationSettings />}
                {activeTab === 'sms' && <NetGSMSettings workspaceId={currentWorkspace.id} />}
                {activeTab === 'billing' && (
                    <BillingTab />
                )}

                {activeTab === 'flow-test' && user?.role === 'SUPER_ADMIN' && (
                    <div style={{ margin: '-24px', height: 'calc(100vh - 180px)', minHeight: '650px' }}>
                        <FlowTest />
                    </div>
                )}
            </div>

            {isCreateWorkspaceModalOpen && selectedCompanyForWorkspace && (
                <div className="modal-overlay" onClick={() => setIsCreateWorkspaceModalOpen(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2>{t('settings.newWorkspace')}</h2>
                        <p className="modal-subtitle"><Building2 size={16} /> {selectedCompanyForWorkspace.name}</p>
                        {createWorkspaceError && <div className="error-message">{createWorkspaceError}</div>}
                        <form onSubmit={handleCreateWorkspace}>
                            <div className="form-group">
                                <label>{t('settings.workspaceName')}</label>
                                <input type="text" value={newWorkspaceName} onChange={(e) => setNewWorkspaceName(e.target.value)} placeholder={t('settings.workspaceNamePlaceholder')} required />
                            </div>
                            <div className="form-group">
                                <label>{t('settings.workspaceDescription')}</label>
                                <textarea value={newWorkspaceDescription} onChange={(e) => setNewWorkspaceDescription(e.target.value)} placeholder={t('settings.workspaceDescriptionPlaceholder')} rows={3} />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setIsCreateWorkspaceModalOpen(false)}>{t('common.cancel')}</button>
                                <button type="submit" className="btn btn-primary" disabled={creatingWorkspace}>{creatingWorkspace ? t('settings.creating') : t('common.create')}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Settings;
