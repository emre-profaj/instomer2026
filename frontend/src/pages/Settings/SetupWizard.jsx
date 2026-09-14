import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast/Toast';
import {
  workspaceAPI,
  knowledgeBaseAPI,
  appointmentConfigAPI,
  productAPI,
  teamAPI,
  funnelAPI
} from '../../services/api';
import { getTopicCategories, createTopicCategory } from '../../services/topicCategory.api';
import {
  X,
  Check,
  Plus,
  Building2,
  Book,
  MapPin,
  Folder,
  Package,
  Workflow,
  Users,
  CheckCircle2,
  Loader2,
  Globe,
  AlertCircle,
  FileText,
  Trash2,
  ChevronRight,
  Sparkles
} from 'lucide-react';

const AIIcon = () => (
  <span
    style={{
      display: 'inline-block',
      width: 14,
      height: 10,
      background: 'linear-gradient(135deg,#E63B2E,#FF4521)',
      borderRadius: 1,
      transform: 'skewX(-25deg)',
      marginRight: 4
    }}
  />
);

const STEPS = [
  { key: 'firma', label: 'Firma', icon: <Building2 size={16} /> },
  { key: 'kb', label: 'Bilgi Bankası', icon: <Book size={16} /> },
  { key: 'subeler', label: 'Şubeler', icon: <MapPin size={16} /> },
  { key: 'kategoriler', label: 'Kategoriler', icon: <Folder size={16} /> },
  { key: 'urunler', label: 'Ürünler', icon: <Package size={16} /> },
  { key: 'akislar', label: 'Akışlar', icon: <Workflow size={16} /> },
  { key: 'takimlar', label: 'Takımlar', icon: <Users size={16} /> },
  { key: 'agentlar', label: 'AI Agentlar', icon: <AIIcon /> },
  { key: 'ozet', label: 'Özet', icon: <CheckCircle2 size={16} /> },
];

const SetupWizard = () => {
  const [activeStep, setActiveStep] = useState(0);
  const navigate = useNavigate();
  const { currentWorkspace } = useAuth();
  const toast = useToast();

  const showSuccess = (msg) => toast?.showSuccess ? toast.showSuccess(msg) : alert(msg);
  const showError = (msg) => toast?.showError ? toast.showError(msg) : alert(msg);

  // 1. Firma Form State
  const [companyName, setCompanyName] = useState(currentWorkspace?.name || '');
  const [companyIndustry, setCompanyIndustry] = useState(currentWorkspace?.industry || 'Emlak / Gayrimenkul');
  const [companyAddress, setCompanyAddress] = useState(currentWorkspace?.companyAddress || '');
  const [companyWebsite, setCompanyWebsite] = useState(currentWorkspace?.companyWebsite || '');
  const [companyHours, setCompanyHours] = useState(currentWorkspace?.companyWorkingHours || 'Hafta içi 09:00 - 18:00');

  // 2. Bilgi Bankası (KB) State
  const [kbUrl, setKbUrl] = useState('');
  const [kbScraping, setKbScraping] = useState(false);
  const [kbScrapeResult, setKbScrapeResult] = useState(null);
  const [manualKbTitle, setManualKbTitle] = useState('');
  const [manualKbText, setManualKbText] = useState('');
  const [manualKbSaving, setManualKbSaving] = useState(false);
  const [kbEntries, setKbEntries] = useState([]);
  const [kbLoading, setKbLoading] = useState(false);

  // 3. Şubeler State
  const [branches, setBranches] = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [newBranch, setNewBranch] = useState({ name: '', address: '', phone: '' });
  const [savingBranch, setSavingBranch] = useState(false);

  // 4. Kategoriler State
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: '', description: '', color: '#3b82f6' });
  const [savingCategory, setSavingCategory] = useState(false);

  // 5. Ürünler State
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', price: '', categoryId: '' });
  const [savingProduct, setSavingProduct] = useState(false);

  // 6. Akışlar & Takımlar State
  const [funnels, setFunnels] = useState([]);
  const [teams, setTeams] = useState([]);

  // Load Initial Workspace Data
  useEffect(() => {
    if (!currentWorkspace?.id) return;
    const wsId = currentWorkspace.id;

    // Load KB
    setKbLoading(true);
    knowledgeBaseAPI.getAll(wsId)
      .then(res => setKbEntries(res.data?.entries || res.data || []))
      .catch(err => console.error('KB Load error:', err))
      .finally(() => setKbLoading(false));

    // Load Branches
    setBranchesLoading(true);
    appointmentConfigAPI.getLocations(wsId)
      .then(res => setBranches(res.data?.locations || res.data || []))
      .catch(err => console.error('Branches Load error:', err))
      .finally(() => setBranchesLoading(false));

    // Load Categories
    setCategoriesLoading(true);
    getTopicCategories(wsId)
      .then(res => setCategories(res.data || []))
      .catch(err => console.error('Categories Load error:', err))
      .finally(() => setCategoriesLoading(false));

    // Load Products
    setProductsLoading(true);
    productAPI.getAll(wsId)
      .then(res => setProducts(res.data?.products || res.data || []))
      .catch(err => console.error('Products Load error:', err))
      .finally(() => setProductsLoading(false));

    // Load Funnels
    funnelAPI.getAll(wsId)
      .then(res => setFunnels(res.data || []))
      .catch(err => console.error('Funnels Load error:', err));

    // Load Teams
    teamAPI.getAll(wsId)
      .then(res => setTeams(res.data || []))
      .catch(err => console.error('Teams Load error:', err));

  }, [currentWorkspace?.id]);

  const progress = Math.round((activeStep / (STEPS.length - 1)) * 100);

  const handleNext = () => {
    if (activeStep < STEPS.length - 1) setActiveStep(activeStep + 1);
  };

  const handlePrev = () => {
    if (activeStep > 0) setActiveStep(activeStep - 1);
  };

  const handleComplete = async () => {
    try {
      if (currentWorkspace?.id && companyName) {
        await workspaceAPI.update(currentWorkspace.id, {
          name: companyName,
          companyAddress,
          companyWebsite,
          companyWorkingHours: companyHours
        });
      }
      showSuccess('Kurulum adımları başarıyla tamamlandı!');
    } catch (e) {
      console.warn('Workspace update warning:', e);
    }
    navigate('/base');
  };

  // ─── KB ACTIONS ──────────────────────────────────────────────────────────
  const handleScrapeUrl = async () => {
    let url = kbUrl.trim();
    if (!url) {
      showError('Lütfen taranacak web sitesi adresini girin.');
      return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    setKbScraping(true);
    setKbScrapeResult(null);

    try {
      const res = await knowledgeBaseAPI.addUrl(currentWorkspace.id, { url });
      const entry = res.data?.entry;
      if (entry) {
        setKbEntries(prev => [entry, ...prev]);
      }
      setKbScrapeResult({
        success: true,
        title: entry?.title || url,
        snippet: entry?.content ? (entry.content.substring(0, 180) + '...') : 'İçerik başarıyla çıkarıldı.',
        message: 'Web sayfası başarıyla tarandı ve Bilgi Bankası\'na eklendi!'
      });
      showSuccess('Web sitesi başarıyla tarandı ve Bilgi Bankası\'na eklendi!');
      setKbUrl('');
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Web sitesi taranamadı.';
      setKbScrapeResult({
        success: false,
        message: errMsg
      });
      showError(errMsg);
    } finally {
      setKbScraping(false);
    }
  };

  const handleSaveManualKb = async () => {
    if (!manualKbText.trim()) {
      showError('Lütfen kaydedilecek metin içeriği girin.');
      return;
    }

    setManualKbSaving(true);
    try {
      const title = manualKbTitle.trim() || `${companyName || currentWorkspace?.name || 'Firma'} Bilgisi`;
      const res = await knowledgeBaseAPI.addText(currentWorkspace.id, {
        title,
        content: manualKbText.trim()
      });
      const entry = res.data?.entry;
      if (entry) {
        setKbEntries(prev => [entry, ...prev]);
      }
      showSuccess('Bilgi bankasına başarıyla eklendi!');
      setManualKbTitle('');
      setManualKbText('');
    } catch (err) {
      showError(err.response?.data?.error || 'Kayıt sırasında bir hata oluştu.');
    } finally {
      setManualKbSaving(false);
    }
  };

  const handleDeleteKbEntry = async (id) => {
    if (!window.confirm('Bu kaydı silmek istediğinize emin misiniz?')) return;
    try {
      await knowledgeBaseAPI.delete(currentWorkspace.id, id);
      setKbEntries(prev => prev.filter(e => e.id !== id));
      showSuccess('Kayıt silindi.');
    } catch (err) {
      showError('Silinirken hata oluştu.');
    }
  };

  // ─── BRANCH ACTIONS ──────────────────────────────────────────────────────
  const handleCreateBranch = async () => {
    if (!newBranch.name.trim()) {
      showError('Şube adı gereklidir.');
      return;
    }
    setSavingBranch(true);
    try {
      const res = await appointmentConfigAPI.createLocation(currentWorkspace.id, newBranch);
      const loc = res.data?.location || res.data;
      if (loc) setBranches(prev => [...prev, loc]);
      showSuccess('Şube başarıyla oluşturuldu!');
      setNewBranch({ name: '', address: '', phone: '' });
      setShowAddBranch(false);
    } catch (err) {
      showError(err.response?.data?.error || 'Şube eklenirken hata oluştu.');
    } finally {
      setSavingBranch(false);
    }
  };

  // ─── CATEGORY ACTIONS ────────────────────────────────────────────────────
  const handleCreateCategory = async () => {
    if (!newCategory.name.trim()) {
      showError('Kategori adı gereklidir.');
      return;
    }
    setSavingCategory(true);
    try {
      const res = await createTopicCategory(currentWorkspace.id, newCategory);
      if (res.data) setCategories(prev => [...prev, res.data]);
      showSuccess('Kategori başarıyla oluşturuldu!');
      setNewCategory({ name: '', description: '', color: '#3b82f6' });
      setShowAddCategory(false);
    } catch (err) {
      showError(err.response?.data?.error || 'Kategori eklenirken hata oluştu.');
    } finally {
      setSavingCategory(false);
    }
  };

  // ─── PRODUCT ACTIONS ─────────────────────────────────────────────────────
  const handleCreateProduct = async () => {
    if (!newProduct.name.trim()) {
      showError('Ürün adı gereklidir.');
      return;
    }
    setSavingProduct(true);
    try {
      const res = await productAPI.create(currentWorkspace.id, {
        name: newProduct.name.trim(),
        price: parseFloat(newProduct.price) || 0,
        categoryId: newProduct.categoryId || null
      });
      const prod = res.data?.product || res.data;
      if (prod) setProducts(prev => [...prev, prod]);
      showSuccess('Ürün başarıyla eklendi!');
      setNewProduct({ name: '', price: '', categoryId: '' });
      setShowAddProduct(false);
    } catch (err) {
      showError(err.response?.data?.error || 'Ürün eklenirken hata oluştu.');
    } finally {
      setSavingProduct(false);
    }
  };

  // ─── RENDERERS ───────────────────────────────────────────────────────────

  const renderFirma = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '640px' }}>
      <div>
        <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>Firma Bilgileri</h2>
        <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>İşletmenizin genel kimlik ve iletişim detaylarını yapılandırın.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={labelStyle}>Firma Adı *</label>
        <input
          type="text"
          value={companyName}
          onChange={e => setCompanyName(e.target.value)}
          placeholder="Örn: Instomer Real Estate"
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={labelStyle}>Sektör</label>
        <select value={companyIndustry} onChange={e => setCompanyIndustry(e.target.value)} style={inputStyle}>
          <option value="Emlak / Gayrimenkul">Emlak / Gayrimenkul</option>
          <option value="Otomotiv">Otomotiv</option>
          <option value="Sağlık / Klinik">Sağlık / Klinik</option>
          <option value="Turizm & Otelcilik">Turizm & Otelcilik</option>
          <option value="Perakende / E-Ticaret">Perakende / E-Ticaret</option>
          <option value="Hizmet & Danışmanlık">Hizmet & Danışmanlık</option>
        </select>
      </div>

      <div style={{ display: 'flex', gap: '16px' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={labelStyle}>Lokasyon / Adres</label>
          <input
            type="text"
            value={companyAddress}
            onChange={e => setCompanyAddress(e.target.value)}
            placeholder="Örn: Maslak, Sarıyer / İstanbul"
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={labelStyle}>Web Sitesi</label>
          <input
            type="text"
            value={companyWebsite}
            onChange={e => setCompanyWebsite(e.target.value)}
            placeholder="https://www.firma-adiniz.com"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={labelStyle}>Çalışma Saatleri</label>
        <input
          type="text"
          value={companyHours}
          onChange={e => setCompanyHours(e.target.value)}
          placeholder="Hafta içi 09:00 - 18:00, Cumartesi 10:00 - 15:00"
          style={inputStyle}
        />
      </div>
    </div>
  );

  const renderKB = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '640px' }}>
      <div>
        <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>Bilgi Bankası</h2>
        <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>AI Agentlar şirketiniz ve ürünleriniz hakkındaki bilgileri buradan öğrenir.</p>
      </div>

      {/* Web Sitesinden Çek */}
      <div style={{ padding: '20px', border: '1.5px solid #e2e8f0', borderRadius: '10px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Globe size={18} color="#3b82f6" />
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>Web Sitesinden Çek (Otomatik Tarama)</h3>
        </div>
        <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
          Web sitenizin veya hakkında sayfanızın linkini girin. İçerik otomatik taranarak yapay zeka hafızasına eklenecektir.
        </p>

        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="url"
            value={kbUrl}
            onChange={e => setKbUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleScrapeUrl(); }}
            placeholder="https://www.firma-adiniz.com/hakkimizda"
            style={{ ...inputStyle, flex: 1 }}
            disabled={kbScraping}
          />
          <button
            type="button"
            onClick={handleScrapeUrl}
            disabled={kbScraping || !kbUrl.trim()}
            style={{
              ...primaryBtnStyle,
              background: kbScraping ? '#94a3b8' : '#2563eb',
              cursor: kbScraping ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              minWidth: '130px',
              justifyContent: 'center'
            }}
          >
            {kbScraping ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Taranıyor...
              </>
            ) : (
              <>
                <Globe size={16} />
                Tara & Çek
              </>
            )}
          </button>
        </div>

        {/* Scrape Result Alert */}
        {kbScrapeResult && (
          <div
            style={{
              background: kbScrapeResult.success ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${kbScrapeResult.success ? '#bbf7d0' : '#fecaca'}`,
              borderRadius: '8px',
              padding: '12px 14px',
              fontSize: '13px',
              color: kbScrapeResult.success ? '#166534' : '#991b1b',
              marginTop: '4px'
            }}
          >
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              {kbScrapeResult.success ? <CheckCircle2 size={16} color="#16a34a" /> : <AlertCircle size={16} color="#dc2626" />}
              {kbScrapeResult.message}
            </div>
            {kbScrapeResult.title && (
              <div style={{ fontWeight: 600, color: '#0f172a', marginTop: '4px' }}>
                📄 {kbScrapeResult.title}
              </div>
            )}
            {kbScrapeResult.snippet && (
              <div style={{ color: '#475569', fontSize: '12px', marginTop: '4px', lineHeight: 1.4 }}>
                {kbScrapeResult.snippet}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manuel Ekle */}
      <div style={{ padding: '20px', border: '1.5px solid #e2e8f0', borderRadius: '10px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={18} color="#E63B2E" />
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>Manuel Ekle</h3>
        </div>
        <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
          Şirket politikaları, iade şartları, sık sorulan sorular veya ürün detaylarını buraya doğrudan yazabilir veya yapıştırabilirsiniz.
        </p>

        <input
          type="text"
          value={manualKbTitle}
          onChange={e => setManualKbTitle(e.target.value)}
          placeholder="Başlık (Örn: Sık Sorulan Sorular / Hizmet Şartları)"
          style={inputStyle}
        />

        <textarea
          rows={5}
          value={manualKbText}
          onChange={e => setManualKbText(e.target.value)}
          placeholder="İçeriği buraya yazın veya yapıştırın..."
          style={{ ...inputStyle, resize: 'vertical' }}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleSaveManualKb}
            disabled={manualKbSaving || !manualKbText.trim()}
            style={{
              ...primaryBtnStyle,
              background: '#E63B2E',
              opacity: manualKbSaving || !manualKbText.trim() ? 0.6 : 1,
              padding: '8px 16px',
              fontSize: '13px'
            }}
          >
            {manualKbSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {manualKbSaving ? 'Kaydediliyor...' : 'Bilgi Bankasına Ekle'}
          </button>
        </div>
      </div>

      {/* Eklenen Kayıtlar Listesi */}
      <div style={{ marginTop: '6px' }}>
        <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 600, color: '#334155' }}>
          Kayıtlı Bilgi Bankası Belgeleri ({kbEntries.length})
        </h4>
        {kbLoading ? (
          <div style={{ fontSize: '13px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Loader2 size={14} className="animate-spin" /> Yükleniyor...
          </div>
        ) : kbEntries.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#94a3b8', fontStyle: 'italic', padding: '12px', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center' }}>
            Henüz eklenmiş bir doküman yok. Yukarıdaki seçeneklerle web sitenizi tarayabilir veya metin ekleyebilirsiniz.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {kbEntries.map((entry) => (
              <div
                key={entry.id}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  background: '#f8fafc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1 }}>
                  {entry.sourceType === 'URL' || entry.sourceUrl ? (
                    <Globe size={15} color="#2563eb" style={{ flexShrink: 0 }} />
                  ) : (
                    <FileText size={15} color="#E63B2E" style={{ flexShrink: 0 }} />
                  )}
                  <span style={{ fontWeight: 600, fontSize: '13px', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.title || entry.sourceUrl || 'Belge'}
                  </span>
                  <span style={{ fontSize: '11px', background: '#e2e8f0', color: '#475569', padding: '2px 6px', borderRadius: '4px', flexShrink: 0 }}>
                    {entry.sourceType || 'TEXT'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteKbEntry(entry.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}
                  title="Sil"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderSubeler = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '720px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>Şubeler</h2>
          <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>Müşterilerinize hizmet verdiğiniz tüm şube ve lokasyonlar.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddBranch(!showAddBranch)}
          style={primaryBtnStyle}
        >
          <Plus size={16} /> Yeni Şube Ekle
        </button>
      </div>

      {showAddBranch && (
        <div style={{ border: '1.5px solid #E63B2E', borderRadius: '8px', padding: '16px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Yeni Şube Bilgileri</h4>
          <input
            type="text"
            placeholder="Şube Adı (Örn: Kadıköy Merkez)*"
            value={newBranch.name}
            onChange={e => setNewBranch({ ...newBranch, name: e.target.value })}
            style={inputStyle}
          />
          <input
            type="text"
            placeholder="Adres"
            value={newBranch.address}
            onChange={e => setNewBranch({ ...newBranch, address: e.target.value })}
            style={inputStyle}
          />
          <input
            type="text"
            placeholder="Telefon"
            value={newBranch.phone}
            onChange={e => setNewBranch({ ...newBranch, phone: e.target.value })}
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setShowAddBranch(false)} style={secondaryBtnStyle}>İptal</button>
            <button type="button" onClick={handleCreateBranch} disabled={savingBranch} style={primaryBtnStyle}>
              {savingBranch ? 'Kaydediliyor...' : 'Şubeyi Ekle'}
            </button>
          </div>
        </div>
      )}

      {branchesLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b' }}>
          <Loader2 size={16} className="animate-spin" /> Şubeler yükleniyor...
        </div>
      ) : branches.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#64748b' }}>
          Kayıtlı şube bulunamadı. "Yeni Şube Ekle" butonuna basarak ilk şubenizi ekleyebilirsiniz.
        </div>
      ) : (
        branches.map(branch => (
          <div key={branch.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '15px', color: '#0f172a' }}>{branch.name}</span>
              <span style={{ color: '#16a34a', fontSize: '13px', fontWeight: 600, background: '#dcfce7', padding: '2px 8px', borderRadius: '12px' }}>Aktif</span>
            </div>
            {branch.address && <div style={{ color: '#64748b', fontSize: '13px' }}>📍 {branch.address}</div>}
            {branch.phone && <div style={{ color: '#64748b', fontSize: '13px' }}>📞 {branch.phone}</div>}
          </div>
        ))
      )}
    </div>
  );

  const renderKategoriler = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '720px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>Kategoriler</h2>
          <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>Ürün ve hizmetlerinizi gruplandırmak için kategoriler tanımlayın.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddCategory(!showAddCategory)}
          style={primaryBtnStyle}
        >
          <Plus size={16} /> Kategori Ekle
        </button>
      </div>

      {showAddCategory && (
        <div style={{ border: '1.5px solid #E63B2E', borderRadius: '8px', padding: '16px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Yeni Kategori</h4>
          <input
            type="text"
            placeholder="Kategori Adı (Örn: Satılık Konut / Otomotiv)*"
            value={newCategory.name}
            onChange={e => setNewCategory({ ...newCategory, name: e.target.value })}
            style={inputStyle}
          />
          <input
            type="text"
            placeholder="Açıklama (Opsiyonel)"
            value={newCategory.description}
            onChange={e => setNewCategory({ ...newCategory, description: e.target.value })}
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setShowAddCategory(false)} style={secondaryBtnStyle}>İptal</button>
            <button type="button" onClick={handleCreateCategory} disabled={savingCategory} style={primaryBtnStyle}>
              {savingCategory ? 'Kaydediliyor...' : 'Kategoriyi Ekle'}
            </button>
          </div>
        </div>
      )}

      {categoriesLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b' }}>
          <Loader2 size={16} className="animate-spin" /> Kategoriler yükleniyor...
        </div>
      ) : categories.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#64748b' }}>
          Henüz kategori bulunamadı. "Kategori Ekle" butonuna basarak ilk kategorinizi oluşturabilirsiniz.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
          {categories.map(cat => (
            <div key={cat.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', background: '#fff', borderLeft: `4px solid ${cat.color || '#3b82f6'}` }}>
              <div style={{ fontWeight: 600, fontSize: '14px', color: '#0f172a' }}>{cat.name}</div>
              {cat.description && <div style={{ color: '#64748b', fontSize: '12px', marginTop: '4px' }}>{cat.description}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderUrunler = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '760px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>Ürünler / Portföyler</h2>
          <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>Fiyat teklifleri ve AI asistanların müşterilere sunacağı ürünler.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddProduct(!showAddProduct)}
          style={primaryBtnStyle}
        >
          <Plus size={16} /> Ürün Ekle
        </button>
      </div>

      {showAddProduct && (
        <div style={{ border: '1.5px solid #E63B2E', borderRadius: '8px', padding: '16px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Yeni Ürün Ekle</h4>
          <input
            type="text"
            placeholder="Ürün / Hizmet Adı*"
            value={newProduct.name}
            onChange={e => setNewProduct({ ...newProduct, name: e.target.value })}
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: '12px' }}>
            <input
              type="number"
              placeholder="Fiyat"
              value={newProduct.price}
              onChange={e => setNewProduct({ ...newProduct, price: e.target.value })}
              style={{ ...inputStyle, flex: 1 }}
            />
            <select
              value={newProduct.categoryId}
              onChange={e => setNewProduct({ ...newProduct, categoryId: e.target.value })}
              style={{ ...inputStyle, flex: 1 }}
            >
              <option value="">-- Kategori Seçin --</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setShowAddProduct(false)} style={secondaryBtnStyle}>İptal</button>
            <button type="button" onClick={handleCreateProduct} disabled={savingProduct} style={primaryBtnStyle}>
              {savingProduct ? 'Kaydediliyor...' : 'Ürünü Ekle'}
            </button>
          </div>
        </div>
      )}

      {productsLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b' }}>
          <Loader2 size={16} className="animate-spin" /> Ürünler yükleniyor...
        </div>
      ) : products.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#64748b' }}>
          Henüz eklenmiş ürün veya hizmet bulunamadı. "Ürün Ekle" butonu ile ekleyebilirsiniz.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
              <th style={{ padding: '10px 12px', color: '#475569' }}>Ürün / Hizmet Adı</th>
              <th style={{ padding: '10px 12px', color: '#475569' }}>Fiyat</th>
              <th style={{ padding: '10px 12px', color: '#475569' }}>Kategori</th>
            </tr>
          </thead>
          <tbody>
            {products.map(prod => (
              <tr key={prod.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1e293b' }}>{prod.name}</td>
                <td style={{ padding: '10px 12px', color: '#0f172a' }}>
                  {prod.price ? `₺${Number(prod.price).toLocaleString('tr-TR')}` : 'Fiyat Belirtilmedi'}
                </td>
                <td style={{ padding: '10px 12px', color: '#64748b' }}>
                  {prod.category?.name || categories.find(c => c.id === prod.categoryId)?.name || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  const renderAkislar = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '720px' }}>
      <div>
        <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>Akışlar (Funnels)</h2>
        <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>Müşteri taleplerinin otomatik yönlendirildiği kanban akışları.</p>
      </div>

      <div style={{ border: '1.5px solid #cbd5e1', background: '#f8fafc', borderRadius: '8px', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            Genel Müşteri Akışı 🔒
          </h3>
          <span style={{ background: '#fef2f2', color: '#E63B2E', fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px' }}>Varsayılan</span>
        </div>
        <p style={{ color: '#64748b', fontSize: '13px', margin: '6px 0 0 0' }}>Gelen tüm talepler için temel karşılama, bilgi toplama ve yönlendirme süreci.</p>
      </div>

      {funnels.filter(f => f.name !== 'Genel Akış').map(f => (
        <div key={f.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#fff', borderLeft: `4px solid ${f.color || '#3b82f6'}` }}>
          <div style={{ fontWeight: 600, fontSize: '14px', color: '#0f172a' }}>{f.icon || '💼'} {f.name}</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Aşamalar: {f.stages?.map(s => s.name).join(' → ') || 'Standart Aşamalar'}
          </div>
        </div>
      ))}
    </div>
  );

  const renderTakimlar = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '720px' }}>
      <div>
        <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>Takımlar & Ekipler</h2>
        <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>Vaka ve taleplerin atandığı departmanlar.</p>
      </div>

      {teams.length === 0 ? (
        <div style={{ padding: '20px', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#64748b', textAlign: 'center' }}>
          Takımlar listeleniyor...
        </div>
      ) : (
        teams.map(team => (
          <div key={team.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', background: '#fff' }}>
            <div style={{ fontWeight: 600, fontSize: '15px', color: '#0f172a' }}>👥 {team.name}</div>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
              {team.members?.length || 0} Üye atanmış durumda.
            </div>
          </div>
        ))
      )}
    </div>
  );

  const renderAgentlar = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '720px' }}>
      <div>
        <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>AI Asistanlar</h2>
        <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>Instomer yapay zeka asistanının yeteneklerini kontrol edin.</p>
      </div>

      <div style={{ border: '2px solid #E63B2E', borderRadius: '10px', padding: '18px', background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', fontSize: '16px', fontWeight: 600 }}>
            <AIIcon /> Müşteri Temsilcisi (Chat & Ses)
          </h3>
          <span style={{ color: '#16a34a', fontSize: '13px', fontWeight: 700, background: '#dcfce7', padding: '3px 10px', borderRadius: '12px' }}>
            ✅ Sistemde Aktif
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>Asistan Yetenekleri</label>
            <div style={{ display: 'flex', gap: '16px', fontSize: '13px', marginTop: '6px', color: '#334155' }}>
              <span>✓ Randevu Oluşturma</span>
              <span>✓ Fiyat Bilgisi Verme</span>
              <span>✓ İnsan Temsilciye Aktarma</span>
              <span>✓ Bilgi Bankasından Yanıtlama</span>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Sistem Davranışı</label>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b', lineHeight: 1.4 }}>
              Asistan, Bilgi Bankası adımında eklediğiniz tüm web sitesi ve metin verilerini kullanarak müşterilerin sorularını kurumsal dilde yanıtlar.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderOzet = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '720px' }}>
      <div style={{ background: '#dcfce7', color: '#166534', padding: '18px 20px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <CheckCircle2 size={32} />
        <div>
          <h2 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 700 }}>Harika! Kurulum hazır.</h2>
          <p style={{ margin: 0, fontSize: '14px' }}>Sistemi hemen kullanmaya başlayabilirsiniz. İhtiyaç halinde ayarları daha sonra Base menüsünden düzenleyebilirsiniz.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
        {[
          { label: 'Firma Adı', val: companyName || currentWorkspace?.name || 'Instomer' },
          { label: 'Bilgi Bankası Belgeleri', val: `${kbEntries.length} Kaynak Aktif` },
          { label: 'Şubeler', val: `${branches.length} Şube Tanımlı` },
          { label: 'Kategoriler', val: `${categories.length} Kategori` },
          { label: 'Ürünler / Portföyler', val: `${products.length} Ürün Listelendi` },
          { label: 'Akışlar', val: `${funnels.length || 1} Akış Aktif` },
          { label: 'Takımlar', val: `${teams.length || 1} Takım Aktif` },
          { label: 'AI Asistan', val: 'Chat & Voice Aktif' },
        ].map((item, i) => (
          <div key={i} style={{ border: '1px solid #e2e8f0', padding: '14px 16px', borderRadius: '8px', background: '#fff' }}>
            <div style={{ color: '#64748b', fontSize: '12px', marginBottom: '4px' }}>{item.label}</div>
            <div style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a' }}>{item.val}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderContent = () => {
    switch (STEPS[activeStep].key) {
      case 'firma': return renderFirma();
      case 'kb': return renderKB();
      case 'subeler': return renderSubeler();
      case 'kategoriler': return renderKategoriler();
      case 'urunler': return renderUrunler();
      case 'akislar': return renderAkislar();
      case 'takimlar': return renderTakimlar();
      case 'agentlar': return renderAgentlar();
      case 'ozet': return renderOzet();
      default: return null;
    }
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', width: '100%', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', overflow: 'hidden' }}>

      {/* Left Sidebar */}
      <div style={{ width: '260px', minWidth: '260px', background: '#f8fafc', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', padding: '20px 0', boxSizing: 'border-box' }}>
        <div style={{ padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} color="#E63B2E" />
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Hızlı Kurulum</h2>
          </div>
          <button onClick={() => navigate('/base')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px' }} title="Kapat">
            <X size={18} color="#64748b" />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
          {STEPS.map((step, index) => {
            const isActive = index === activeStep;
            const isDone = index < activeStep;

            return (
              <div
                key={step.key}
                onClick={() => setActiveStep(index)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 20px',
                  cursor: 'pointer',
                  position: 'relative',
                  background: isActive ? '#fff' : 'transparent',
                  borderRight: isActive ? '3px solid #E63B2E' : '3px solid transparent'
                }}
              >
                {/* Vertical line connector */}
                {index > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '-10px',
                    left: '26px',
                    width: '2px',
                    height: '20px',
                    background: isDone || isActive ? '#22c55e' : '#e2e8f0',
                    zIndex: 0
                  }} />
                )}

                <div style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  background: isActive ? '#E63B2E' : isDone ? '#22c55e' : '#cbd5e1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '12px',
                  zIndex: 1,
                  boxShadow: '0 0 0 3px ' + (isActive ? '#fff' : '#f8fafc')
                }}>
                  {isDone && <Check size={8} color="#fff" strokeWidth={3} />}
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: isActive ? '#E63B2E' : isDone ? '#0f172a' : '#64748b',
                  fontWeight: isActive ? '600' : '500',
                  fontSize: '13px'
                }}>
                  {step.icon}
                  {step.label}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
            <span>İlerleme</span>
            <span style={{ fontWeight: 600 }}>{progress}%</span>
          </div>
          <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: '#22c55e', transition: 'width 0.3s ease' }} />
          </div>
        </div>
      </div>

      {/* Right Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', minWidth: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, padding: '36px 48px', overflowY: 'auto' }}>
          {renderContent()}
        </div>

        {/* Footer Navigation */}
        <div style={{ padding: '16px 48px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa' }}>
          {activeStep > 0 ? (
            <button type="button" onClick={handlePrev} style={secondaryBtnStyle}>
              ← Geri
            </button>
          ) : (
            <div></div>
          )}

          {activeStep < STEPS.length - 1 ? (
            <button type="button" onClick={handleNext} style={primaryBtnStyle}>
              İleri <ChevronRight size={16} />
            </button>
          ) : (
            <button type="button" onClick={handleComplete} style={{ ...primaryBtnStyle, background: '#16a34a' }}>
              ✅ Tamamla & Başlat
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const inputStyle = {
  padding: '10px 12px',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  fontSize: '13px',
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
  transition: 'border-color 0.2s ease',
  background: '#fff'
};

const labelStyle = {
  fontWeight: '600',
  fontSize: '13px',
  color: '#334155'
};

const primaryBtnStyle = {
  background: '#E63B2E',
  color: '#fff',
  border: 'none',
  padding: '9px 18px',
  borderRadius: '6px',
  fontSize: '13px',
  fontWeight: '600',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
};

const secondaryBtnStyle = {
  background: '#fff',
  color: '#334155',
  border: '1px solid #cbd5e1',
  padding: '9px 18px',
  borderRadius: '6px',
  fontSize: '13px',
  fontWeight: '500',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
};

export default SetupWizard;

