import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import { useToast } from '../../components/Toast/Toast';
import { useAuth } from '../../context/AuthContext';
import {
    Building2,
    Users,
    FolderGit2,
    BookOpen,
    Sparkles,
    ChevronLeft,
    ChevronRight,
    Plus,
    Trash2,
    Check,
    Loader2,
    Eye,
    GitBranch
} from 'lucide-react';
import './QuickSetup.css';

const STEPS = [
    { id: 1, name: 'İşletme Profili', icon: <Building2 size={18} /> },
    { id: 2, name: 'Takımlar', icon: <FolderGit2 size={18} /> },
    { id: 3, name: 'Kullanıcılar', icon: <Users size={18} /> },
    { id: 4, name: 'Bilgi Bankası', icon: <BookOpen size={18} /> },
    { id: 5, name: 'AI Asistanı', icon: <Sparkles size={18} /> },
    { id: 6, name: 'Akış Yönetimi', icon: <GitBranch size={18} /> },
    { id: 7, name: 'Kurulum & Özet', icon: <Check size={18} /> }
];

const DEFAULT_FUNNEL_TEMPLATES = [
    {
        name: 'Randevu',
        icon: '📅',
        color: '#06b6d4',
        stages: ['Yeni Başvuru', 'Randevu Verildi', 'Randevu Tamamlandı', 'Randevu İptal']
    },
    {
        name: 'Satış Akışı',
        icon: '💰',
        color: '#3b82f6',
        stages: ['Yeni Başvuru', 'Fırsat', 'Bilgi Verildi', 'Sıcak Fırsat', 'Görüşme Planlandı', 'Teklif Aşaması', 'Satış', 'Ulaşılamadı', 'Kayıp']
    },
    {
        name: 'İş ve Taşeron',
        icon: '👔',
        color: '#10b981',
        stages: ['Yeni Başvuru', 'Değerlendirmede', 'Mülakat', 'İşe Alındı', 'Red']
    },
    {
        name: 'Destek',
        icon: '🎧',
        color: '#f59e0b',
        stages: ['Yeni Talep', 'İnceleniyor', 'İşlemde', 'Çözüldü', 'Kapandı']
    }
];

const PROMPT_TEMPLATES = {
    sales: {
        role: 'Satış Danışmanı',
        prompt: `Sen şirketimizin profesyonel ve samimi Satış Danışmanı yapay zeka asistanısın.
Görevlerin:
1. Müşterilerimizi sıcak bir şekilde karşılamak.
2. Sorularını şirket bilgilerimiz ve bilgi bankamız doğrultusunda yanıtlamak.
3. Potansiyel müşterilerin iletişim bilgilerini (ad, e-posta, telefon) ve ilgilendikleri ürünleri alarak lider (lead) kaydetmek.
4. Müşterilere fiyat teklifi veya randevu süreçlerinde yardımcı olmak.

İletişim Kuralların:
- Kibar, çözüm odaklı ve kurumsal bir dil kullan.
- Bilmediğin konularda uydurma cevaplar verme, müşteriyi ilgili ekibe aktaracağını belirt.`
    },
    support: {
        role: 'Müşteri Destek Temsilcisi',
        prompt: `Sen şirketimizin yardımsever Müşteri Destek Temsilcisi yapay zeka asistanısın.
Görevlerin:
1. Müşterilerin yaşadığı teknik sorunları veya şikayetleri dinlemek.
2. Bilgi bankamızdaki teknik yönergeler, SSS ve rehberler doğrultusunda adımları anlatmak.
3. Sorunun çözülmemesi durumunda müşterinin bilgilerini alarak teknik destek ekibimiz için bir talep oluşturmak.

İletişim Kuralların:
- Empati kurarak konuş, anlayışlı ve sabırlı ol.
- Teknik adımları tane tane, anlaşılır şekilde açıkla.`
    },
    realestate: {
        role: 'Gayrimenkul Asistanı',
        prompt: `Sen şirketimizin uzman Gayrimenkul Yatırım Danışmanı yapay zeka asistanısın.
Görevlerin:
1. Müşterilerin aradığı gayrimenkul kriterlerini (oda sayısı, bütçe, lokasyon, yatırım/oturum amacı) öğrenmek.
2. Bilgi bankamızdaki portföy bilgileri ve projeler doğrultusunda müşteriye en uygun daireleri önermek.
3. Projelerimiz, ödeme planları ve taksit seçenekleri hakkında detaylı bilgi vermek.
4. Daireyi yerinde görmek isteyen müşteriler için satış ofisimizle randevu ayarlamak.

İletişim Kuralların:
- Yatırım fırsatlarını vurgulayan, güven veren ve ikna edici bir üslup benimse.
- Sorulara portföy dışına çıkmadan net rakamlar ve bilgilerle cevap ver.`
    }
};

const QuickSetup = () => {
    const { showSuccess, showError, showInfo } = useToast();
    const navigate = useNavigate();
    const { switchWorkspace } = useAuth();
    const [activeStep, setActiveStep] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const [setupResult, setSetupResult] = useState(null);
    const [funnels, setFunnels] = useState(
        DEFAULT_FUNNEL_TEMPLATES.map((t, idx) => ({
            id: (idx + 1).toString(),
            name: t.name,
            icon: t.icon,
            color: t.color,
            stages: t.stages,
            checked: true
        }))
    );

    const [customFunnelName, setCustomFunnelName] = useState('');
    const [customFunnelStages, setCustomFunnelStages] = useState('');

    // Form States
    const [workspaceData, setWorkspaceData] = useState({
        name: '',
        description: '',
        companyName: '',
        companyDescription: '',
        companyAddress: '',
        companyPhone: '',
        companyEmail: '',
        companyWebsite: '',
        companyWorkingHours: 'Hafta içi 09:00 - 18:00',
        logoBase64: ''
    });

    const [teams, setTeams] = useState([
        { id: '1', name: 'Satış', description: 'Potansiyel müşteri takibi ve ürün tanıtımı', checked: true },
        { id: '2', name: 'Destek', description: 'Müşteri sorunları ve teknik destek', checked: true },
        { id: '3', name: 'Operasyon', description: 'Süreç yönetimi ve teslimatlar', checked: false }
    ]);
    const [customTeamName, setCustomTeamName] = useState('');
    const [customTeamDesc, setCustomTeamDesc] = useState('');

    const [users, setUsers] = useState([
        { id: '1', name: '', email: '', password: '', role: 'OWNER' }
    ]);

    const [knowledgeBase, setKnowledgeBase] = useState([
        { id: '1', title: 'Genel Şirket Kuralları', content: 'Şirketimiz müşteri memnuniyetini en üst düzeyde tutmayı hedefler. Çalışma saatlerimiz hafta içi 09:00 - 18:00 arasındadır.' }
    ]);
    const [newKbTitle, setNewKbTitle] = useState('');
    const [newKbContent, setNewKbContent] = useState('');

    const [aiBot, setAiBot] = useState({
        name: 'Arya',
        role: 'Satış Danışmanı',
        prompt: PROMPT_TEMPLATES.sales.prompt
    });

    // Handle Logo Change
    const handleLogoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                showError('Logo boyutu 2MB\'den büyük olamaz.');
                return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                setWorkspaceData(prev => ({ ...prev, logoBase64: reader.result }));
            };
            reader.readAsDataURL(file);
        }
    };

    // Dynamic Team Management
    const toggleTeam = (id) => {
        setTeams(prev => prev.map(t => t.id === id ? { ...t, checked: !t.checked } : t));
    };

    const addCustomTeam = () => {
        if (!customTeamName.trim()) {
            showInfo('Takım adı boş bırakılamaz.');
            return;
        }
        setTeams(prev => [
            ...prev,
            {
                id: Date.now().toString(),
                name: customTeamName.trim(),
                description: customTeamDesc.trim(),
                checked: true
            }
        ]);
        setCustomTeamName('');
        setCustomTeamDesc('');
    };

    const removeTeam = (id) => {
        setTeams(prev => prev.filter(t => t.id !== id));
    };

    // Dynamic User Management
    const handleUserChange = (id, field, value) => {
        setUsers(prev => prev.map(u => u.id === id ? { ...u, [field]: value } : u));
    };

    const addUserRow = () => {
        setUsers(prev => [
            ...prev,
            { id: Date.now().toString(), name: '', email: '', password: '', role: 'AGENT' }
        ]);
    };

    const removeUserRow = (id) => {
        if (users.length === 1) {
            showInfo('En az bir kullanıcı eklemelisiniz.');
            return;
        }
        setUsers(prev => prev.filter(u => u.id !== id));
    };

    // Dynamic Knowledge Base Management
    const addKbEntry = () => {
        if (!newKbTitle.trim() || !newKbContent.trim()) {
            showInfo('Başlık ve İçerik alanları zorunludur.');
            return;
        }
        setKnowledgeBase(prev => [
            ...prev,
            {
                id: Date.now().toString(),
                title: newKbTitle.trim(),
                content: newKbContent.trim()
            }
        ]);
        setNewKbTitle('');
        setNewKbContent('');
    };

    const removeKbEntry = (id) => {
        setKnowledgeBase(prev => prev.filter(k => k.id !== id));
    };

    // Toggle funnel checked state
    const toggleFunnelChecked = (id) => {
        setFunnels(prev =>
            prev.map(f => f.id === id ? { ...f, checked: !f.checked } : f)
        );
    };

    // Add custom funnel template
    const addCustomFunnel = () => {
        if (!customFunnelName.trim()) {
            showInfo('Akış adı boş bırakılamaz.');
            return;
        }
        if (!customFunnelStages.trim()) {
            showInfo('En az bir aşama girmelisiniz.');
            return;
        }
        const stagesArray = customFunnelStages
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);

        if (stagesArray.length === 0) {
            showInfo('Geçerli aşamalar girilmelidir.');
            return;
        }

        setFunnels(prev => [
            ...prev,
            {
                id: Date.now().toString(),
                name: customFunnelName.trim(),
                icon: '📊',
                color: '#6366f1',
                stages: stagesArray,
                checked: true
            }
        ]);

        setCustomFunnelName('');
        setCustomFunnelStages('');
        showSuccess('Özel akış şablonu eklendi.');
    };

    // Remove funnel template
    const removeFunnel = (id) => {
        setFunnels(prev => prev.filter(f => f.id !== id));
    };

    // AI Bot Prompt Templates
    const applyPromptTemplate = (type) => {
        const template = PROMPT_TEMPLATES[type];
        if (template) {
            setAiBot(prev => ({
                ...prev,
                role: template.role,
                prompt: template.prompt
            }));
            showSuccess('Şablon başarıyla uygulandı.');
        }
    };

    // Navigation and Validations
    const handleNext = () => {
        if (activeStep === 1) {
            if (!workspaceData.name.trim()) {
                showError('Workspace adı zorunludur.');
                return;
            }
        } else if (activeStep === 3) {
            // Validate user emails and names
            const invalidUser = users.find(u => !u.name.trim() || !u.email.trim());
            if (invalidUser) {
                showError('Lütfen tüm kullanıcıların isim ve e-posta bilgilerini doldurun.');
                return;
            }
            const hasOwner = users.some(u => u.role === 'OWNER');
            if (!hasOwner) {
                showError('En az bir kullanıcının rolü OWNER (Yönetici) olmalıdır.');
                return;
            }
        } else if (activeStep === 5) {
            if (!aiBot.name.trim() || !aiBot.prompt.trim()) {
                showError('Asistan adı ve prompt talimatları boş bırakılamaz.');
                return;
            }
        }
        setActiveStep(prev => prev + 1);
    };

    const handleBack = () => {
        setActiveStep(prev => prev - 1);
    };

    // Final Setup Creation
    const handleFinishSetup = async () => {
        setSubmitting(true);
        try {
            const payload = {
                workspace: workspaceData,
                users: users.map(u => ({ name: u.name, email: u.email, password: u.password, role: u.role })),
                teams: teams.filter(t => t.checked).map(t => ({ name: t.name, description: t.description })),
                knowledgeBase: knowledgeBase.map(kb => ({ title: kb.title, content: kb.content })),
                aiBot: aiBot,
                funnels: funnels
                    .filter(f => f.checked)
                    .map(f => ({
                        name: f.name,
                        icon: f.icon,
                        color: f.color,
                        stages: f.stages
                    }))
            };

            const response = await adminAPI.quickSetup(payload);
            setSetupResult(response.data.data);
            showSuccess('Hızlı Kurulum Başarıyla Tamamlandı!');
            setActiveStep(8); // Show success view (Step 8)
        } catch (error) {
            console.error('Setup failed:', error);
            showError(error.response?.data?.error || 'Kurulum sırasında bir hata oluştu.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSwitchToWorkspace = (workspace) => {
        switchWorkspace(workspace);
        navigate('/'); // Go to client dashboard
    };

    return (
        <div className="quick-setup-container">
            {/* Stepper Sidebar */}
            {activeStep <= 7 && (
                <div className="setup-sidebar">
                    <div className="sidebar-title">
                        <Sparkles size={20} className="glow-icon" />
                        <h3>Hızlı Kurulum Sihirbazı</h3>
                    </div>
                    <div className="stepper-list">
                        {STEPS.map((s) => {
                            const isCompleted = activeStep > s.id;
                            const isActive = activeStep === s.id;
                            return (
                                <div key={s.id} className={`stepper-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                                    <div className="step-badge">
                                        {isCompleted ? <Check size={14} /> : s.icon}
                                    </div>
                                    <span className="step-name">{s.name}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Main Setup Content */}
            <div className={`setup-content-card ${activeStep === 8 ? 'full-width' : ''}`}>
                
                {/* STEP 1: İşletme Profili */}
                {activeStep === 1 && (
                    <div className="setup-step-view animate-fade-in">
                        <div className="step-header">
                            <h2>İşletme & Workspace Profili</h2>
                            <p>Oluşturmak istediğiniz yeni workspace'e ait şirket temel bilgilerini girin.</p>
                        </div>

                        <div className="form-grid">
                            <div className="form-group full-width">
                                <label>Workspace Adı <span className="required">*</span></label>
                                <input
                                    type="text"
                                    placeholder="Örn: Gürkayalar İnşaat"
                                    value={workspaceData.name}
                                    onChange={(e) => setWorkspaceData(prev => ({ ...prev, name: e.target.value }))}
                                    required
                                />
                            </div>

                            <div className="form-group full-width">
                                <label>Kısa Açıklama</label>
                                <textarea
                                    placeholder="Workspace hakkında kısa bilgi..."
                                    rows={2}
                                    value={workspaceData.description}
                                    onChange={(e) => setWorkspaceData(prev => ({ ...prev, description: e.target.value }))}
                                />
                            </div>

                            <div className="form-group full-width logo-upload-group">
                                <label>Şirket Logosu</label>
                                <div className="logo-upload-wrapper">
                                    {workspaceData.logoBase64 ? (
                                        <div className="logo-preview-box">
                                            <img src={workspaceData.logoBase64} alt="Logo Önizleme" />
                                            <button
                                                type="button"
                                                className="remove-logo-btn"
                                                onClick={() => setWorkspaceData(prev => ({ ...prev, logoBase64: '' }))}
                                            >
                                                Kaldır
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="logo-dropzone">
                                            <Building2 size={32} />
                                            <p>Dosya seçmek için tıklayın</p>
                                            <span>Maksimum 2MB (PNG, JPG, WebP)</span>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handleLogoChange}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Resmi Şirket Adı</label>
                                <input
                                    type="text"
                                    placeholder="Gürkayalar İnş. San. Tic. Ltd. Şti."
                                    value={workspaceData.companyName}
                                    onChange={(e) => setWorkspaceData(prev => ({ ...prev, companyName: e.target.value }))}
                                />
                            </div>

                            <div className="form-group">
                                <label>Çalışma Saatleri</label>
                                <input
                                    type="text"
                                    placeholder="Örn: Hafta içi 09:00 - 18:00"
                                    value={workspaceData.companyWorkingHours}
                                    onChange={(e) => setWorkspaceData(prev => ({ ...prev, companyWorkingHours: e.target.value }))}
                                />
                            </div>

                            <div className="form-group">
                                <label>Şirket Telefonu</label>
                                <input
                                    type="tel"
                                    placeholder="0212XXXXXXX"
                                    value={workspaceData.companyPhone}
                                    onChange={(e) => setWorkspaceData(prev => ({ ...prev, companyPhone: e.target.value }))}
                                />
                            </div>

                            <div className="form-group">
                                <label>Şirket E-postası</label>
                                <input
                                    type="email"
                                    placeholder="info@gurkayalarnet.com"
                                    value={workspaceData.companyEmail}
                                    onChange={(e) => setWorkspaceData(prev => ({ ...prev, companyEmail: e.target.value }))}
                                />
                            </div>

                            <div className="form-group">
                                <label>Web Sitesi</label>
                                <input
                                    type="url"
                                    placeholder="https://www.gurkayalarinsaat.com"
                                    value={workspaceData.companyWebsite}
                                    onChange={(e) => setWorkspaceData(prev => ({ ...prev, companyWebsite: e.target.value }))}
                                />
                            </div>

                            <div className="form-group full-width">
                                <label>Şirket Adresi</label>
                                <input
                                    type="text"
                                    placeholder="Mahalle, Sokak, No, İlçe/İl"
                                    value={workspaceData.companyAddress}
                                    onChange={(e) => setWorkspaceData(prev => ({ ...prev, companyAddress: e.target.value }))}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* STEP 2: Takımlar */}
                {activeStep === 2 && (
                    <div className="setup-step-view animate-fade-in">
                        <div className="step-header">
                            <h2>Takım Yapılandırması</h2>
                            <p>Müşteri görüşmelerini ve işleri dağıtmak için varsayılan veya özel takımlar seçin.</p>
                        </div>

                        <div className="teams-selection-list">
                            {teams.map((t) => (
                                <div key={t.id} className={`team-item-card ${t.checked ? 'selected' : ''}`} onClick={() => toggleTeam(t.id)}>
                                    <div className="checkbox-box">
                                        <div className={`checkbox-custom ${t.checked ? 'checked' : ''}`}>
                                            {t.checked && <Check size={14} />}
                                        </div>
                                    </div>
                                    <div className="team-details">
                                        <h4>{t.name}</h4>
                                        <p>{t.description}</p>
                                    </div>
                                    {t.id !== '1' && t.id !== '2' && (
                                        <button
                                            type="button"
                                            className="delete-team-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removeTeam(t.id);
                                            }}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="add-team-section">
                            <h3>Yeni Özel Takım Ekle</h3>
                            <div className="add-team-inputs">
                                <input
                                    type="text"
                                    placeholder="Takım Adı (örn: Muhasebe)"
                                    value={customTeamName}
                                    onChange={(e) => setCustomTeamName(e.target.value)}
                                />
                                <input
                                    type="text"
                                    placeholder="Kısa Açıklama"
                                    value={customTeamDesc}
                                    onChange={(e) => setCustomTeamDesc(e.target.value)}
                                />
                                <button type="button" className="btn btn-secondary" onClick={addCustomTeam}>
                                    <Plus size={16} /> Ekle
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* STEP 3: Kullanıcılar */}
                {activeStep === 3 && (
                    <div className="setup-step-view animate-fade-in">
                        <div className="step-header">
                            <h2>Kullanıcı Davetleri ve Ekleme</h2>
                            <p>Workspace içerisine atanacak olan ekip üyelerini tanımlayın. İlk kullanıcı Yönetici (OWNER) olmalıdır.</p>
                        </div>

                        <div className="users-table-container">
                            <table className="users-setup-table">
                                <thead>
                                    <tr>
                                        <th>İsim Soyisim</th>
                                        <th>E-posta</th>
                                        <th>Geçici Şifre</th>
                                        <th>Rol</th>
                                        <th>İşlem</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((u) => (
                                        <tr key={u.id}>
                                            <td>
                                                <input
                                                    type="text"
                                                    placeholder="Örn: Ahmet Yılmaz"
                                                    value={u.name}
                                                    onChange={(e) => handleUserChange(u.id, 'name', e.target.value)}
                                                    required
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="email"
                                                    placeholder="ahmet@sirket.com"
                                                    value={u.email}
                                                    onChange={(e) => handleUserChange(u.id, 'email', e.target.value)}
                                                    required
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="text"
                                                    placeholder="Boş kalırsa: 123456"
                                                    value={u.password}
                                                    onChange={(e) => handleUserChange(u.id, 'password', e.target.value)}
                                                />
                                            </td>
                                            <td>
                                                <select
                                                    value={u.role}
                                                    onChange={(e) => handleUserChange(u.id, 'role', e.target.value)}
                                                >
                                                    <option value="OWNER">Owner (Yönetici)</option>
                                                    <option value="ADMIN">Admin (Yönetici Yrd)</option>
                                                    <option value="AGENT">Agent (Temsilci)</option>
                                                </select>
                                            </td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="delete-user-row-btn"
                                                    onClick={() => removeUserRow(u.id)}
                                                    disabled={users.length === 1}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <button type="button" className="add-user-row-btn" onClick={addUserRow}>
                                <Plus size={16} /> Yeni Kullanıcı Satırı Ekle
                            </button>
                        </div>
                    </div>
                )}

                {/* STEP 4: Bilgi Bankası */}
                {activeStep === 4 && (
                    <div className="setup-step-view animate-fade-in">
                        <div className="step-header">
                            <h2>Bilgi Bankası İçerikleri</h2>
                            <p>Yapay zeka asistanının sorulara doğru cevap verebilmesi için şirket bilgilerini, kurallarını veya SSS içeriklerini girin.</p>
                        </div>

                        <div className="kb-list">
                            {knowledgeBase.map((k) => (
                                <div key={k.id} className="kb-item-card">
                                    <div className="kb-item-header">
                                        <h4>{k.title}</h4>
                                        <button type="button" className="btn-icon delete" onClick={() => removeKbEntry(k.id)}>
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                    <p className="kb-item-content-preview">{k.content}</p>
                                </div>
                            ))}
                        </div>

                        <div className="add-kb-section">
                            <h3>Yeni Bilgi / Doküman Ekle</h3>
                            <div className="form-group full-width">
                                <label>Bilgi Başlığı</label>
                                <input
                                    type="text"
                                    placeholder="Örn: İade Politikası, Adres Tarifi vb."
                                    value={newKbTitle}
                                    onChange={(e) => setNewKbTitle(e.target.value)}
                                />
                            </div>
                            <div className="form-group full-width">
                                <label>Bilgi İçeriği</label>
                                <textarea
                                    placeholder="Yapay zekanın bu başlıkta bilmesi gereken tüm detaylı metni yazın..."
                                    rows={4}
                                    value={newKbContent}
                                    onChange={(e) => setNewKbContent(e.target.value)}
                                />
                            </div>
                            <button type="button" className="btn btn-secondary" onClick={addKbEntry}>
                                <Plus size={16} /> Bilgi Ekle
                            </button>
                        </div>
                    </div>
                )}

                {/* STEP 5: AI Asistanı */}
                {activeStep === 5 && (
                    <div className="setup-step-view animate-fade-in">
                        <div className="step-header">
                            <h2>Yapay Zeka Asistanı Yapılandırması</h2>
                            <p>Müşterileri karşılayacak olan yapay zeka asistanının kimliğini ve talimatlarını tanımlayın.</p>
                        </div>

                        <div className="prompt-template-selector-bar">
                            <span className="selector-label">Hızlı Rol Şablonları:</span>
                            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => applyPromptTemplate('sales')}>
                                Satış Danışmanı
                            </button>
                            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => applyPromptTemplate('support')}>
                                Müşteri Destek
                            </button>
                            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => applyPromptTemplate('realestate')}>
                                Gayrimenkul Yatırım
                            </button>
                        </div>

                        <div className="form-grid">
                            <div className="form-group">
                                <label>Yapay Zeka Adı</label>
                                <input
                                    type="text"
                                    placeholder="Örn: Arya, Can vb."
                                    value={aiBot.name}
                                    onChange={(e) => setAiBot(prev => ({ ...prev, name: e.target.value }))}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Yapay Zeka Rolü</label>
                                <input
                                    type="text"
                                    placeholder="Örn: Satış Temsilcisi"
                                    value={aiBot.role}
                                    onChange={(e) => setAiBot(prev => ({ ...prev, role: e.target.value }))}
                                />
                            </div>

                            <div className="form-group full-width">
                                <label>Yapay Zeka Prompt Talimatları (System Instructions)</label>
                                <textarea
                                    placeholder="Yapay zekanın müşterilerle konuşurken izleyeceği kuralları yazın..."
                                    rows={8}
                                    value={aiBot.prompt}
                                    onChange={(e) => setAiBot(prev => ({ ...prev, prompt: e.target.value }))}
                                    required
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* STEP 6: Akış Yönetimi (Funnels) */}
                {activeStep === 6 && (
                    <div className="setup-step-view animate-fade-in">
                        <div className="step-header">
                            <h2>Akış Yönetimi Şablonları (Funnels)</h2>
                            <p>Sistem kurulurken otomatik olarak aktifleşmesini istediğiniz akış şablonlarını ve aşamalarını (stages) seçin.</p>
                        </div>

                        <div className="flow-templates-selection-list">
                            <div className="flow-templates-grid">
                                {funnels.map((temp) => {
                                    const isSelected = temp.checked;
                                    return (
                                        <div
                                            key={temp.id}
                                            className={`flow-template-card ${isSelected ? 'selected' : ''}`}
                                            onClick={() => toggleFunnelChecked(temp.id)}
                                            style={{ cursor: 'pointer', borderLeft: `5px solid ${temp.color}`, position: 'relative' }}
                                        >
                                            <div className="checkbox-box">
                                                <div className={`checkbox-custom ${isSelected ? 'checked' : ''}`}>
                                                    {isSelected && <Check size={14} />}
                                                </div>
                                            </div>
                                            <div className="template-details" style={{ paddingRight: '24px' }}>
                                                <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span>{temp.icon}</span>
                                                    <span>{temp.name}</span>
                                                </h4>
                                                <div className="stage-badges-preview" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
                                                    {temp.stages.map(stage => (
                                                        <span
                                                            key={stage}
                                                            style={{
                                                                fontSize: '10px',
                                                                padding: '2px 6px',
                                                                background: '#f1f5f9',
                                                                borderRadius: '4px',
                                                                color: '#475569',
                                                                fontWeight: 500
                                                            }}
                                                        >
                                                            {stage}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                className="btn-icon delete"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeFunnel(temp.id);
                                                }}
                                                style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 10 }}
                                                title="Sil"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="add-team-section" style={{ marginTop: '32px' }}>
                            <h3>Yeni Özel Akış Şablonu (Funnel) Ekle</h3>
                            <div className="add-funnel-inputs-row" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                <div style={{ flex: '1 1 250px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Akış Adı</label>
                                    <input
                                        type="text"
                                        placeholder="Örn: Emlak Satış"
                                        value={customFunnelName}
                                        onChange={(e) => setCustomFunnelName(e.target.value)}
                                        style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                                    />
                                </div>
                                <div style={{ flex: '2 1 350px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Aşamalar (Virgülle Ayırın)</label>
                                    <input
                                        type="text"
                                        placeholder="Yeni, Görüşüldü, Satıldı, Kapandı"
                                        value={customFunnelStages}
                                        onChange={(e) => setCustomFunnelStages(e.target.value)}
                                        style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                                    />
                                </div>
                                <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'flex-end' }}>
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={addCustomFunnel}
                                        style={{ height: '38px', display: 'flex', alignItems: 'center', gap: '6px' }}
                                    >
                                        <Plus size={16} /> Ekle
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* STEP 7: Özet & Kurulum */}
                {activeStep === 7 && (
                    <div className="setup-step-view animate-fade-in">
                        <div className="step-header">
                            <h2>Son İnceleme ve Kurulum</h2>
                            <p>Girdiğiniz tüm bilgileri inceleyin. "Sistemi Kur" butonuna tıkladığınızda tüm modüller otomatik yapılandırılacaktır.</p>
                        </div>

                        <div className="summary-boxes-container">
                            <div className="summary-section-box">
                                <h3><Building2 size={16} /> İşletme & Workspace</h3>
                                <table>
                                    <tbody>
                                        <tr>
                                            <th>Workspace:</th>
                                            <td>{workspaceData.name}</td>
                                        </tr>
                                        <tr>
                                            <th>Şirket Adı:</th>
                                            <td>{workspaceData.companyName || 'Belirtilmedi'}</td>
                                        </tr>
                                        <tr>
                                            <th>Çalışma Saatleri:</th>
                                            <td>{workspaceData.companyWorkingHours}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <div className="summary-section-box">
                                <h3><FolderGit2 size={16} /> Kurulacak Takımlar</h3>
                                <div className="summary-tags">
                                    {teams.filter(t => t.checked).map(t => (
                                        <span key={t.id} className="summary-tag">{t.name}</span>
                                    ))}
                                </div>
                            </div>

                            <div className="summary-section-box">
                                <h3><Users size={16} /> Eklenecek Kullanıcılar ({users.length})</h3>
                                <div className="summary-tags">
                                    {users.map(u => (
                                        <span key={u.id} className="summary-tag user-tag">
                                            {u.name || 'İsimsiz'} ({u.role})
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className="summary-section-box">
                                <h3><BookOpen size={16} /> Bilgi Bankası Belgeleri ({knowledgeBase.length})</h3>
                                <div className="summary-tags">
                                    {knowledgeBase.map(kb => (
                                        <span key={kb.id} className="summary-tag doc-tag">{kb.title}</span>
                                    ))}
                                </div>
                            </div>

                            <div className="summary-section-box">
                                <h3><Sparkles size={16} /> Yapay Zeka Asistanı</h3>
                                <table>
                                    <tbody>
                                        <tr>
                                            <th>Asistan Adı:</th>
                                            <td>{aiBot.name}</td>
                                        </tr>
                                        <tr>
                                            <th>Asistan Rolü:</th>
                                            <td>{aiBot.role}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <div className="summary-section-box">
                                <h3><GitBranch size={16} /> Kurulacak Akış Hunileri (Funnels)</h3>
                                <div className="summary-tags">
                                    {funnels.filter(f => f.checked).length === 0 ? (
                                        <span className="no-selection-label">Seçilmedi</span>
                                    ) : (
                                        funnels.filter(f => f.checked).map(f => (
                                            <span
                                                key={f.id}
                                                className="summary-tag flow-tag"
                                                style={{ borderLeft: `3px solid ${f.color || '#cbd5e1'}` }}
                                            >
                                                {f.icon} {f.name}
                                            </span>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* STEP 8: Başarı Ekranı */}
                {activeStep === 8 && setupResult && (
                    <div className="setup-success-view animate-fade-in">
                        <div className="success-icon-badge">
                            <Check size={48} />
                        </div>
                        <h2>Hızlı Kurulum Başarıyla Tamamlandı!</h2>
                        <p className="success-subtitle">
                            <strong>{setupResult.workspace.name}</strong> workspace'i ve tüm bağlı servisler başarıyla oluşturuldu.
                        </p>

                        <div className="result-details-card">
                            <h3>Kurulum Detayları:</h3>
                            <ul className="details-list">
                                <li>
                                    <span className="dot active"></span>
                                    <strong>Workspace Slug:</strong> {setupResult.workspace.slug}
                                </li>
                                <li>
                                    <span className="dot"></span>
                                    <strong>Oluşturulan Takım Sayısı:</strong> {setupResult.teams.length}
                                </li>
                                <li>
                                    <span className="dot"></span>
                                    <strong>Kullanıcı Sayısı:</strong> {setupResult.users.length}
                                </li>
                                <li>
                                    <span className="dot"></span>
                                    <strong>Bilgi Bankası Dokümanı:</strong> {setupResult.knowledgeBase.length}
                                </li>
                                <li>
                                    <span className="dot"></span>
                                    <strong>Aktif Akış Hunisi (Funnel):</strong> {setupResult.funnels?.length || 0}
                                </li>
                                <li>
                                    <span className="dot active"></span>
                                    <strong>Aktif AI Asistanı:</strong> {setupResult.aiBot?.name} ({setupResult.aiBot?.role})
                                </li>
                            </ul>
                        </div>

                        <div className="success-action-buttons">
                            <button
                                type="button"
                                className="btn btn-primary btn-lg"
                                onClick={() => handleSwitchToWorkspace(setupResult.workspace)}
                            >
                                <Eye size={18} /> Workspace'e Git (Giriş Yap)
                            </button>
                            <button
                                type="button"
                                className="btn btn-outline-secondary btn-lg"
                                onClick={() => {
                                    setSetupResult(null);
                                    setActiveStep(1);
                                    setFunnels(
                                        DEFAULT_FUNNEL_TEMPLATES.map((t, idx) => ({
                                            id: (idx + 1).toString(),
                                            name: t.name,
                                            icon: t.icon,
                                            color: t.color,
                                            stages: t.stages,
                                            checked: true
                                        }))
                                    );
                                    setWorkspaceData({
                                        name: '',
                                        description: '',
                                        companyName: '',
                                        companyDescription: '',
                                        companyAddress: '',
                                        companyPhone: '',
                                        companyEmail: '',
                                        companyWebsite: '',
                                        companyWorkingHours: 'Hafta içi 09:00 - 18:00',
                                        logoBase64: ''
                                    });
                                }}
                            >
                                Yeni Bir Kurulum Yap
                            </button>
                        </div>
                    </div>
                )}

                {/* Wizard Footer Navigation */}
                {activeStep <= 7 && (
                    <div className="setup-footer-nav">
                        <button
                            type="button"
                            className="btn btn-secondary btn-nav-back"
                            onClick={handleBack}
                            disabled={activeStep === 1}
                        >
                            <ChevronLeft size={18} /> Geri
                        </button>

                        {activeStep < 7 ? (
                            <button
                                type="button"
                                className="btn btn-primary btn-nav-next"
                                onClick={handleNext}
                            >
                                İleri <ChevronRight size={18} />
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="btn btn-primary btn-nav-finish btn-glow"
                                onClick={handleFinishSetup}
                                disabled={submitting}
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" /> Kuruluyor...
                                    </>
                                ) : (
                                    <>
                                        Sistemi Kur <Sparkles size={16} />
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default QuickSetup;
