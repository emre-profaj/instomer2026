import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { formWebhookAPI } from '../../services/api';
import { getCaseTypes } from '../../services/caseType.api';
import { useAuth } from '../../context/AuthContext';
import { Plus, Trash2, Copy, Check, AlertCircle, ExternalLink, Sparkles, X } from 'lucide-react';
import './WebForms.css';

const WebForms = () => {
    const { t } = useTranslation();
    const { currentWorkspace } = useAuth();
    const [webhooks, setWebhooks] = useState([]);
    const [submissions, setSubmissions] = useState([]);
    const [caseTypes, setCaseTypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [copiedId, setCopiedId] = useState(null);
    const [activeTab, setActiveTab] = useState('webhooks');

    const [formData, setFormData] = useState({
        name: '',
        siteUrl: '',
        caseTypeId: ''
    });

    useEffect(() => {
        if (currentWorkspace) {
            loadData();
        }
    }, [currentWorkspace, activeTab]);

    const loadData = async () => {
        try {
            setLoading(true);
            const ctPromise = getCaseTypes(currentWorkspace.id).catch(() => ({ data: [] }));

            if (activeTab === 'webhooks') {
                const [webhooksRes, ctRes] = await Promise.all([
                    formWebhookAPI.getWebhooks(currentWorkspace.id),
                    ctPromise
                ]);
                setWebhooks(webhooksRes.data.webhooks || []);
                setCaseTypes(ctRes.data || []);
            } else {
                const [submissionsRes, ctRes] = await Promise.all([
                    formWebhookAPI.getSubmissions(currentWorkspace.id, { limit: 100 }),
                    ctPromise
                ]);
                setSubmissions(submissionsRes.data.submissions || []);
                setCaseTypes(ctRes.data || []);
            }
        } catch (error) {
            console.error('Load data error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        try {
            await formWebhookAPI.createWebhook(currentWorkspace.id, {
                name: formData.name,
                siteUrl: formData.siteUrl,
                caseTypeId: formData.caseTypeId || null
            });
            setShowModal(false);
            setFormData({ name: '', siteUrl: '', caseTypeId: '' });
            loadData();
        } catch (error) {
            console.error('Create error:', error);
            alert('Could not create form webhook');
        }
    };

    const handleDelete = async (webhookId) => {
        if (!confirm('Are you sure you want to delete this webhook?')) return;
        try {
            await formWebhookAPI.deleteWebhook(currentWorkspace.id, webhookId);
            loadData();
        } catch (error) {
            console.error('Delete error:', error);
            alert('Silinemedi');
        }
    };

    const handleDeleteSubmission = async (submissionId) => {
        if (!confirm('Are you sure you want to delete this form submission?')) return;
        try {
            await formWebhookAPI.deleteSubmission(currentWorkspace.id, submissionId);
            loadData();
        } catch (error) {
            console.error('Delete submission error:', error);
            alert('Could not delete form submission');
        }
    };

    const copyToClipboard = (text, id) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const getElementorInstructions = (webhook) => {
        return `📋 ELEMENTOR FORM WEBHOOK KURULUMU

🌐 Site: ${webhook.siteUrl || 'Belirtilmedi'}

1️⃣ Elementor Form Widget'ınızı açın
2️⃣ "Actions After Submit" bölümüne gidin
3️⃣ "Webhook" action'ını ekleyin
4️⃣ Webhook URL'ini girin:

${webhook.webhookUrl}

5️⃣ (Opsiyonel) Custom Headers ekleyin:
   Key: X-Webhook-Token
   Value: ${webhook.webhookToken}

✅ TAMAMLANDI!

🤖 Otomatik Field Algılama Aktif:
- Elementor'daki field adlarınız (name, email, phone, message vb.) 
  otomatik olarak CRM'e eşleştirilecek.
- Türkçe veya İngilizce field adları kullanabilirsiniz.
- Özel field'lar "Diğer Bilgiler" olarak kaydedilecek.

📝 Örnek Field Adları:
✓ form_fields[name] → İsim
✓ form_fields[email] → E-posta  
✓ form_fields[phone] → Telefon
✓ form_fields[message] → Mesaj
✓ form_fields[company] → Şirket`;
    };

    if (loading) return <div className="loading">Loading...</div>;

    return (
        <div className="web-forms-page">
            <div className="web-forms-header">
                <div className="web-forms-header-left">
                    <h1>
                        <Sparkles size={24} />
                        Web Form Entegrasyonu
                    </h1>
                    <p>{t('webForms.description')}</p>
                </div>
                <div className="header-actions">
                    <button className="btn-primary" onClick={() => setShowModal(true)}>
                        <Plus size={18} />
                        New Webhook
                    </button>
                </div>
            </div>

            <div className="web-forms-tabs">
                <button
                    className={`tab-btn ${activeTab === 'webhooks' ? 'active' : ''}`}
                    onClick={() => setActiveTab('webhooks')}
                >
                    Webhooks
                    <span className="tab-badge">{webhooks.length}</span>
                </button>
                <button
                    className={`tab-btn ${activeTab === 'submissions' ? 'active' : ''}`}
                    onClick={() => setActiveTab('submissions')}
                >
                    Form Submissions
                    <span className="tab-badge">{submissions.length}</span>
                </button>
            </div>

            <div className="web-forms-content">
                {activeTab === 'webhooks' ? (
                    <>
                        <div className="auto-mapping-info">
                            <AlertCircle size={18} />
                            <div>
                                <strong>🎨 Elementor Form Entegrasyonu</strong><br />
                                Elementor'daki form field'larınız (name, email, phone, message vb.)
                                otomatik olarak CRM'e eşleştirilir. Field ID'leri (field_1, field_2)
                                veya özel adlar kullanabilirsiniz. Webhook URL'ini Elementor'da
                                "Actions After Submit → Webhook" bölümüne yapıştırmanız yeterli!
                            </div>
                        </div>

                        {webhooks.length === 0 ? (
                            <div className="empty-state">
                                <Sparkles size={48} />
                                <h3>{t('webForms.noWebhooks')}</h3>
                                <p>{t('webForms.noWebhooksDesc')}</p>
                                <button className="btn-primary" onClick={() => setShowModal(true)}>
                                    <Plus size={18} />
                                    İlk Webhook'u Oluştur
                                </button>
                            </div>
                        ) : (
                            <div className="webhooks-grid">
                                {webhooks.map(webhook => (
                                    <div key={webhook.id} className="webhook-card">
                                        <div className="webhook-header">
                                            <div>
                                                <h3>{webhook.name}</h3>
                                                {webhook.siteUrl && (
                                                    <p className="webhook-site-url">
                                                        🌐 {webhook.siteUrl}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="webhook-actions">
                                                <button
                                                    className="btn-icon-danger"
                                                    onClick={() => handleDelete(webhook.id)}
                                                    title={t('common.delete')}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
                                            <span className="status-badge success">
                                                <Check size={14} />
                                                Auto field detection active
                                            </span>
                                            {webhook.caseType && (
                                                <span
                                                    className="status-badge"
                                                    style={{
                                                        backgroundColor: `${webhook.caseType.color || '#6366f1'}15`,
                                                        color: webhook.caseType.color || '#6366f1',
                                                        border: `1px solid ${webhook.caseType.color || '#6366f1'}40`
                                                    }}
                                                >
                                                    {webhook.caseType.icon || '🏷️'} {webhook.caseType.name}
                                                    {webhook.caseType.funnel && (
                                                        <span style={{ opacity: 0.8, marginLeft: '5px', fontSize: '11px', fontWeight: 600 }}>
                                                            ➔ {webhook.caseType.funnel.name}
                                                        </span>
                                                    )}
                                                </span>
                                            )}
                                        </div>

                                        <div className="webhook-url">
                                            <label>Webhook URL</label>
                                            <div className="copy-field">
                                                <input
                                                    type="text"
                                                    value={webhook.webhookUrl}
                                                    readOnly
                                                />
                                                <button
                                                    onClick={() => copyToClipboard(webhook.webhookUrl, `url-${webhook.id}`)}
                                                    className="btn-copy"
                                                    title="Kopyala"
                                                >
                                                    {copiedId === `url-${webhook.id}` ? <Check size={16} /> : <Copy size={16} />}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="webhook-token">
                                            <label>Token (Opsiyonel)</label>
                                            <div className="copy-field">
                                                <input
                                                    type="password"
                                                    value={webhook.webhookToken}
                                                    readOnly
                                                />
                                                <button
                                                    onClick={() => copyToClipboard(webhook.webhookToken, `token-${webhook.id}`)}
                                                    className="btn-copy"
                                                    title="Kopyala"
                                                >
                                                    {copiedId === `token-${webhook.id}` ? <Check size={16} /> : <Copy size={16} />}
                                                </button>
                                            </div>
                                        </div>

                                        <details className="integration-code">
                                            <summary>{t('webForms.setupInstructions')}</summary>
                                            <pre>{getElementorInstructions(webhook)}</pre>
                                            <button
                                                onClick={() => copyToClipboard(getElementorInstructions(webhook), `code-${webhook.id}`)}
                                                className="btn-copy-code"
                                            >
                                                {copiedId === `code-${webhook.id}` ? '✓ Kopyalandı!' : 'Talimatları Kopyala'}
                                            </button>
                                        </details>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        {submissions.length === 0 ? (
                            <div className="empty-state">
                                <AlertCircle size={48} />
                                <h3>{t('webForms.noSubmissions')}</h3>
                                <p>Web sitenizden form gönderildiğinde burada görünecek</p>
                            </div>
                        ) : (
                            <div className="submissions-table">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Form</th>
                                            <th>Name</th>
                                            <th>Email</th>
                                            <th>Phone</th>
                                            <th>{t('analytics.status')}</th>
                                            <th style={{ width: '150px' }}>{t('adminDashboard.actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {submissions.map(sub => (
                                            <tr key={sub.id}>
                                                <td>{new Date(sub.createdAt).toLocaleString('tr-TR')}</td>
                                                <td>{sub.formWebhook?.name}</td>
                                                <td>{sub.name || '-'}</td>
                                                <td>{sub.email || '-'}</td>
                                                <td>{sub.phone || '-'}</td>
                                                <td>
                                                    <select
                                                        value={sub.status}
                                                        onChange={(e) => {
                                                            formWebhookAPI.updateSubmissionStatus(
                                                                currentWorkspace.id,
                                                                sub.id,
                                                                e.target.value
                                                            ).then(loadData);
                                                        }}
                                                        className="status-select"
                                                    >
                                                        <option value="NEW">New</option>
                                                        <option value="CONTACTED">{t('leads.contacted')}</option>
                                                        <option value="CONVERTED">{t('leads.converted')}</option>
                                                        <option value="CLOSED">Closed</option>
                                                    </select>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        {sub.conversationId && (
                                                            <button
                                                                className="btn-view"
                                                                onClick={() => window.location.href = `/inbox?conversation=${sub.conversationId}`}
                                                                title="View"
                                                            >
                                                                <ExternalLink size={14} />
                                                            </button>
                                                        )}
                                                        <button
                                                            className="btn-delete"
                                                            onClick={() => handleDeleteSubmission(sub.id)}
                                                            title={t('common.delete')}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </div>

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2>New Form Webhook</h2>

                        <div className="auto-mapping-info">
                            <Sparkles size={16} />
                            <div>
                                <strong>🎨 Elementor için otomatik algılama!</strong><br />
                                Webhook URL'i app.instomer.com üzerinden oluşturulacak.
                                Elementor'da "Actions After Submit → Webhook" bölümüne yapıştırın.
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Form Name</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="İletişim Formu"
                            />
                        </div>
                        <div className="form-group">
                            <label>Site URL <span style={{ color: '#dc2626' }}>*</span></label>
                            <input
                                type="url"
                                value={formData.siteUrl}
                                onChange={e => setFormData({ ...formData, siteUrl: e.target.value })}
                                placeholder="https://egeproktoloji.com"
                                required
                            />
                            <small style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', display: 'block' }}>
                                📌 Formun bulunduğu web sitesinin tam adresi (Örnek: https://egeproktoloji.com)
                            </small>
                        </div>
                        <div className="form-group">
                            <label>Varsayılan Vaka Tipi & Akış</label>
                            <select
                                value={formData.caseTypeId}
                                onChange={e => setFormData({ ...formData, caseTypeId: e.target.value })}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid #d1d5db',
                                    fontSize: '14px',
                                    backgroundColor: '#ffffff'
                                }}
                            >
                                <option value="">Otomatik / Belirtilmemiş (Kanal Varsayılanı)</option>
                                {caseTypes.map(ct => (
                                    <option key={ct.id} value={ct.id}>
                                        {ct.icon || '🏷️'} {ct.name} {ct.funnel ? `(➔ ${ct.funnel.name})` : ''}
                                    </option>
                                ))}
                            </select>
                            <small style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', display: 'block' }}>
                                Bu form doldurulduğunda otomatik bu vaka tipi ve bağlı olduğu akışa atanır.
                            </small>
                        </div>
                        <div className="modal-actions">
                            <button className="btn-secondary" onClick={() => setShowModal(false)}>
                                Cancel
                            </button>
                            <button
                                className="btn-primary"
                                onClick={handleCreate}
                                disabled={!formData.name || !formData.siteUrl}
                            >
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WebForms;

