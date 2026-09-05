import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { productAPI, funnelAPI, teamAPI } from '../../services/api';
import { Plus, Search, X, Edit2, Trash2, Package, Filter, Download, Upload, ChevronDown } from 'lucide-react';

import { importFromExcel, getTopicCategories, createTopicCategory, updateTopicCategory, deleteTopicCategory } from '../../services/topicCategory.api';
import './Sales.css';

const TAX_OPTIONS = [
    { value: '', label: 'Vergi Yok', rate: 0 },
    { value: 'KDV_1', label: 'KDV %1', rate: 1 },
    { value: 'KDV_10', label: 'KDV %10', rate: 10 },
    { value: 'KDV_20', label: 'KDV %20', rate: 20 },
    { value: 'OTV_10', label: 'ÖTV %10', rate: 10 },
    { value: 'OTV_20', label: 'ÖTV %20', rate: 20 },
    { value: 'OTV_40', label: 'ÖTV %40', rate: 40 },
    { value: 'OTV_50', label: 'ÖTV %50', rate: 50 },
    { value: 'OTV_80', label: 'ÖTV %80', rate: 80 },
];

const UNIT_OPTIONS = ['Adet', 'Kg', 'Lt', 'Metre', 'M²', 'M³', 'Paket', 'Kutu', 'Saat', 'Gün', 'Ay', 'Yıl', 'Hizmet'];

const Products = () => {
    const { currentWorkspace } = useAuth();
    const [activeTab, setActiveTab] = useState('products');
    const fileInputRef = useRef(null);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [groupFilter, setGroupFilter] = useState('');
    const [groups, setGroups] = useState([]);
    const [categories, setCategories] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [categoryFilter, setCategoryFilter] = useState('');
    const [funnels, setFunnels] = useState([]);
    const [teams, setTeams] = useState([]);
    
    // Category Modal State
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [editingCategory, setEditingCategory] = useState(null);
    const [categoryForm, setCategoryForm] = useState({ name: '', description: '', icon: '📁', color: '#6366f1', keywords: '', customFields: [], defaultFunnelId: '', defaultTeamId: '' });

    // Group Modal State
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [editingGroup, setEditingGroup] = useState(null);
    const [groupForm, setGroupForm] = useState({ name: '', description: '', categoryId: '' });

    const pageSize = 25;

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [saving, setSaving] = useState(false);

    // Delete confirm
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        parentId: '',
        categoryId: '',
        unit: 'Adet',
        price: '',
        priceUSD: '',
        priceEUR: '',
        priceGBP: '',
        discountedPrice: '',
        tax1Type: '',
        tax1Rate: 0,
        tax2Type: '',
        tax2Rate: 0,
        aiContext: '',
        features: [],
    });

    // Toast
    const [toast, setToast] = useState(null);
    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => {
        if (currentWorkspace?.id) {
            fetchProducts();
            fetchGroups();
            fetchCategories();
            fetchFunnels();
            fetchTeams();
        }
    }, [currentWorkspace?.id, search, groupFilter, categoryFilter, page, activeTab]);

    async function fetchFunnels() {
        try {
            const res = await funnelAPI.getAll(currentWorkspace.id);
            setFunnels(res.data.funnels || res.data || []);
        } catch (err) {
            console.error('Failed to fetch funnels:', err);
        }
    };

    async function fetchTeams() {
        try {
            const res = await teamAPI.getWorkspaceTeams(currentWorkspace.id);
            setTeams(res.data.teams || res.data || []);
        } catch (err) {
            console.error('Failed to fetch teams:', err);
        }
    };

    async function fetchCategories() {
        try {
            const res = await getTopicCategories(currentWorkspace.id);
            setCategories(res.data.categories || res.data || []);
        } catch (err) {
            console.error('Failed to fetch categories:', err);
        }
    };

    async function fetchProducts() {
        try {
            setLoading(true);
            const params = { limit: pageSize, offset: (page - 1) * pageSize };
            if (search) params.search = search;
            if (activeTab === 'productGroups') {
                params.isGroup = true;
                if (categoryFilter) params.categoryId = categoryFilter;
            } else if (activeTab === 'products') {
                params.isGroup = false;
                if (categoryFilter) params.categoryId = categoryFilter;
                if (groupFilter) params.parentId = groupFilter;
            }
            const res = await productAPI.getAll(currentWorkspace.id, params);
            setProducts(res.data.products || []);
            setTotal(res.data.pagination?.total || res.data.total || 0);
        } catch (err) {
            console.error('Failed to fetch products:', err);
        } finally {
            setLoading(false);
        }
    };

    async function fetchGroups() {
        try {
            const res = await productAPI.getAll(currentWorkspace.id, { isGroup: true, limit: 1000 });
            const raw = res.data.products || [];
            // groups could be [{groupName:'x', count:1}] or ['x','y'] — normalize to string array
            setGroups(raw);
        } catch (err) {
            console.error('Failed to fetch groups:', err);
        }
    };

    const resetForm = () => {
        setFormData({
            name: '', description: '', parentId: '', categoryId: '', unit: 'Adet',
            price: '', priceUSD: '', priceEUR: '', priceGBP: '',
            discountedPrice: '', tax1Type: '', tax1Rate: 0, tax2Type: '', tax2Rate: 0,
            aiContext: '', features: [],
        });
        setEditingProduct(null);
    };


    const handleSaveCategory = async (e) => {
        e.preventDefault();
        try {
            if (editingCategory) {
                await updateTopicCategory(currentWorkspace.id, editingCategory.id, categoryForm);
                showToast('Kategori güncellendi');
            } else {
                await createTopicCategory(currentWorkspace.id, categoryForm);
                showToast('Kategori eklendi');
            }
            setShowCategoryModal(false);
            fetchCategories();
        } catch (err) {
            console.error(err);
            showToast('Kategori kaydedilemedi', 'error');
        }
    };

    const handleDeleteCategory = async (id) => {
        if (!window.confirm('Kategoriyi silmek istediğinize emin misiniz?')) return;
        try {
            await deleteTopicCategory(currentWorkspace.id, id);
            showToast('Kategori silindi');
            fetchCategories();
        } catch (err) {
            console.error(err);
            showToast('Hata oluştu', 'error');
        }
    };

    const handleSaveGroup = async (e) => {
        e.preventDefault();
        try {
            const data = { ...groupForm, isGroup: true };
            if (editingGroup) {
                await productAPI.update(currentWorkspace.id, editingGroup.id, data);
                showToast('Grup güncellendi');
            } else {
                await productAPI.create(currentWorkspace.id, data);
                showToast('Grup eklendi');
            }
            setShowGroupModal(false);
            fetchProducts();
            fetchGroups();
        } catch (err) {
            console.error(err);
            showToast('Hata oluştu', 'error');
        }
    };

    const openAddModal = () => {
        resetForm();
        setShowModal(true);
    };

    const openEditModal = (product) => {
        setEditingProduct(product);
        setFormData({
            name: product.name || '',
            description: product.description || '',
            parentId: product.parentId || '',
            categoryId: product.categoryId || '',
            unit: product.unit || 'Adet',
            price: product.price || '',
            priceUSD: product.priceUSD || '',
            priceEUR: product.priceEUR || '',
            priceGBP: product.priceGBP || '',
            discountedPrice: product.discountedPrice || '',
            tax1Type: product.tax1Type || '',
            tax1Rate: product.tax1Rate || 0,
            tax2Type: product.tax2Type || '',
            tax2Rate: product.tax2Rate || 0,
            aiContext: product.aiContext || '',
            features: product.features || [],
        });
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            showToast('Ürün adı zorunludur.', 'error');
            return;
        }
        setSaving(true);
        try {
            const data = {
                ...formData,
                price: parseFloat(formData.price) || 0,
                priceUSD: formData.priceUSD ? parseFloat(formData.priceUSD) : null,
                priceEUR: formData.priceEUR ? parseFloat(formData.priceEUR) : null,
                priceGBP: formData.priceGBP ? parseFloat(formData.priceGBP) : null,
                discountedPrice: formData.discountedPrice ? parseFloat(formData.discountedPrice) : null,
                tax1Rate: parseFloat(formData.tax1Rate) || 0,
                tax2Rate: parseFloat(formData.tax2Rate) || 0,
                aiContext: formData.aiContext,
                features: formData.features,
            };
            if (editingProduct) {
                await productAPI.update(currentWorkspace.id, editingProduct.id, data);
                showToast('Ürün başarıyla güncellendi.');
            } else {
                await productAPI.create(currentWorkspace.id, data);
                showToast('Ürün başarıyla eklendi.');
            }
            setShowModal(false);
            resetForm();
            fetchProducts();
            fetchGroups();
        } catch (err) {
            console.error('Failed to save product:', err);
            showToast('Kayıt sırasında bir hata oluştu.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (productId) => {
        try {
            await productAPI.delete(currentWorkspace.id, productId);
            showToast('Ürün silindi.');
            setDeleteConfirm(null);
            fetchProducts();
            fetchGroups();
        } catch (err) {
            console.error('Failed to delete product:', err);
            showToast('Silme sırasında hata oluştu.', 'error');
        }
    };

    const handleTaxChange = (field, value) => {
        const tax = TAX_OPTIONS.find(t => t.value === value);
        if (field === 'tax1Type') {
            setFormData(prev => ({ ...prev, tax1Type: value, tax1Rate: tax ? tax.rate : 0 }));
        } else {
            setFormData(prev => ({ ...prev, tax2Type: value, tax2Rate: tax ? tax.rate : 0 }));
        }
    };

    const addFeature = () => {
        setFormData(prev => ({ ...prev, features: [...prev.features, { featureKey: '', featureValue: '' }] }));
    };

    const updateFeature = (index, field, value) => {
        const newFeatures = [...formData.features];
        newFeatures[index][field] = value;
        setFormData(prev => ({ ...prev, features: newFeatures }));
    };

    const removeFeature = (index) => {
        const newFeatures = [...formData.features];
        newFeatures.splice(index, 1);
        setFormData(prev => ({ ...prev, features: newFeatures }));
    };

    const totalPages = Math.ceil(total / pageSize);

    const formatCurrency = (val, symbol = '₺') => {
        if (!val && val !== 0) return '—';
        return `${symbol}${Number(val).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const getTaxLabel = (type) => {
        const tax = TAX_OPTIONS.find(t => t.value === type);
        return tax ? tax.label : '—';
    };

    const handleExportCSV = () => {
        if (products.length === 0) return;
        const headers = ['Ürün Adı', 'Açıklama', 'Grup', 'Birim', 'Fiyat (TL)', 'İndirimli Fiyat', 'Vergi 1', 'Vergi 2'];
        const rows = products.map(p => [
            p.name, p.description || '', (groups.find(g => g.id === p.parentId)?.name) || '', p.unit || '',
            p.price || 0, p.discountedPrice || '', getTaxLabel(p.tax1Type), getTaxLabel(p.tax2Type)
        ]);
        const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'urunler.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleExcelImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            setLoading(true);
            showToast('📊 Excel analiz ediliyor...', 'info');

            // Tarayıcıda Excel parse et
            const XLSX = await import('xlsx');
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);

            let textContent = '';
            for (const sheetName of workbook.SheetNames) {
                const sheet = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                textContent += `--- Sayfa: ${sheetName} ---\n`;
                if (rows[0]) textContent += `Başlıklar: ${rows[0].join(' | ')}\n`;
                textContent += rows.slice(1, 300).map(r => r.join(' | ')).join('\n') + '\n\n';
            }

            if (!textContent.trim()) {
                showToast('Dosya boş veya okunamadı.', 'error');
                return;
            }

            // Metin olarak backend'e gönder
            const res = await importFromExcel(currentWorkspace.id, textContent);
            const p = res.data.products;
            const c = res.data.categories;
            showToast(`✅ ${p.created} ürün + ${c.created} kategori oluşturuldu!`);
            fetchProducts();
            fetchGroups();
        } catch (error) {
            console.error('Excel import error:', error);
            showToast(`❌ ${error.response?.data?.error || error.message}`, 'error');
        } finally {
            setLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    if (!currentWorkspace) {
        return <div className="empty-state"><p>Lütfen bir workspace seçin</p></div>;
    }

    return (
        <div className="sales-page products-page">
            {/* Toast */}
            {toast && (
                <div style={{
                    position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
                    padding: '12px 20px', borderRadius: '10px',
                    background: toast.type === 'error' ? '#fef2f2' : '#f0fdf4',
                    color: toast.type === 'error' ? '#dc2626' : '#16a34a',
                    border: `1px solid ${toast.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
                    fontSize: '0.85rem', fontWeight: 600,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                    animation: 'slideInRight 0.3s ease'
                }}>
                    {toast.msg}
                </div>
            )}

            {/* Header */}
            <div className="sales-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
                <div>
                    <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Package size={24} style={{ color: '#6366f1' }} />
                        Ürün ve Hizmetler
                    </h1>
                    <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 0' }}>
                        {total} ürün/hizmet kayıtlı
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                        onClick={handleExportCSV}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            padding: '8px 14px', borderRadius: '8px',
                            border: '1px solid #e2e8f0', background: '#fff',
                            fontSize: '0.8rem', fontWeight: 600, color: '#475569',
                            cursor: 'pointer', transition: 'all 0.2s'
                        }}
                    >
                        <Download size={15} /> Dışa Aktar
                    </button>
                    <input
                        type="file"
                        accept=".xlsx, .xls"
                        style={{ display: 'none' }}
                        ref={fileInputRef}
                        onChange={handleExcelImport}
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            padding: '8px 14px', borderRadius: '8px',
                            border: '1px solid #e2e8f0', background: '#fff',
                            fontSize: '0.8rem', fontWeight: 600, color: '#475569',
                            cursor: 'pointer', transition: 'all 0.2s'
                        }}
                    >
                        <Upload size={15} /> İçe Aktar
                    </button>
                    <button
                        onClick={openAddModal}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            padding: '8px 16px', borderRadius: '8px',
                            border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            fontSize: '0.8rem', fontWeight: 600, color: '#fff',
                            cursor: 'pointer', transition: 'all 0.2s',
                            boxShadow: '0 2px 8px rgba(99,102,241,0.3)'
                        }}
                    >
                        <Plus size={16} /> Yeni Ürün / Hizmet
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '20px', padding: '0 24px', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
                <button
                    onClick={() => { setActiveTab('categories'); setPage(1); setSearch(''); }}
                    style={{
                        padding: '12px 0', border: 'none', background: 'none',
                        fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                        color: activeTab === 'categories' ? '#6366f1' : '#64748b',
                        borderBottom: activeTab === 'categories' ? '2px solid #6366f1' : '2px solid transparent',
                        transition: 'all 0.2s'
                    }}
                >
                    Kategoriler
                </button>
                <button
                    onClick={() => { setActiveTab('productGroups'); setPage(1); setSearch(''); setCategoryFilter(''); }}
                    style={{
                        padding: '12px 0', border: 'none', background: 'none',
                        fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                        color: activeTab === 'productGroups' ? '#6366f1' : '#64748b',
                        borderBottom: activeTab === 'productGroups' ? '2px solid #6366f1' : '2px solid transparent',
                        transition: 'all 0.2s'
                    }}
                >
                    Ürün Grupları
                </button>
                <button
                    onClick={() => { setActiveTab('products'); setPage(1); setSearch(''); setCategoryFilter(''); setGroupFilter(''); }}
                    style={{
                        padding: '12px 0', border: 'none', background: 'none',
                        fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                        color: activeTab === 'products' ? '#6366f1' : '#64748b',
                        borderBottom: activeTab === 'products' ? '2px solid #6366f1' : '2px solid transparent',
                        transition: 'all 0.2s'
                    }}
                >
                    Ürünler
                </button>
            </div>

            
            {activeTab === 'categories' && (
                <div style={{ overflow: 'auto', flex: 1, padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                        <button onClick={() => { setCategoryForm({ name: '', description: '', icon: '📁', color: '#6366f1', keywords: '', customFields: [], defaultFunnelId: '', defaultTeamId: '' }); setEditingCategory(null); setShowCategoryModal(true); }} style={{ padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                            <Plus size={16} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Yeni Kategori
                        </button>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <th style={{ padding: '12px 16px', textAlign: 'left', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Kategori</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Açıklama</th>
                                <th style={{ padding: '12px 16px', textAlign: 'center', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Renk</th>
                                <th style={{ padding: '12px 16px', textAlign: 'right', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>İşlemler</th>
                            </tr>
                        </thead>
                        <tbody>
                            {categories.map(c => (
                                <tr key={c.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                    <td style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                                        <span style={{ fontSize: '1.2rem' }}>{c.icon}</span> {c.name}
                                    </td>
                                    <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '0.85rem' }}>{c.description}</td>
                                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: c.color || '#ccc', margin: '0 auto' }}></div>
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                        <button onClick={() => { setEditingCategory(c); setCategoryForm({ ...c, customFields: c.customFields || [] }); setShowCategoryModal(true); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', marginRight: '8px' }}><Edit2 size={16} /></button>
                                        <button onClick={() => handleDeleteCategory(c.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626' }}><Trash2 size={16} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'productGroups' && (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', gap: '10px', padding: '12px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none' }}>
                            <option value="">Tüm Kategoriler</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <div style={{ flex: 1 }}></div>
                        <button onClick={() => { setGroupForm({ name: '', description: '', categoryId: categoryFilter || '' }); setEditingGroup(null); setShowGroupModal(true); }} style={{ padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                            <Plus size={16} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Yeni Grup
                        </button>
                    </div>
                    <div style={{ overflow: 'auto', flex: 1, padding: '24px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Grup Adı</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Kategori</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'right', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>İşlemler</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.map(p => (
                                    <tr key={p.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>{p.name}</td>
                                        <td style={{ padding: '12px 16px', color: '#64748b' }}>{categories.find(c => c.id === p.categoryId)?.name || '—'}</td>
                                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                            <button onClick={() => { setEditingGroup(p); setGroupForm({ name: p.name, description: p.description, categoryId: p.categoryId }); setShowGroupModal(true); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', marginRight: '8px' }}><Edit2 size={16} /></button>
                                            <button onClick={() => setDeleteConfirm(p.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626' }}><Trash2 size={16} /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'products' && (
                <>
            {/* Filters Bar */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '12px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0'
            }}>
                <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                        type="text"
                        placeholder="Ürün ara..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        style={{
                            width: '100%', padding: '8px 12px 8px 34px',
                            border: '1px solid #e2e8f0', borderRadius: '8px',
                            fontSize: '0.82rem', outline: 'none', background: '#fff'
                        }}
                    />
                </div>
                <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(1); }} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.82rem', outline: 'none', background: '#fff', color: '#334155', cursor: 'pointer' }}>
                    <option value="">Tüm Kategoriler</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={groupFilter} onChange={e => { setGroupFilter(e.target.value); setPage(1); }} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.82rem', outline: 'none', background: '#fff', color: '#334155', cursor: 'pointer' }}>
                    <option value="">Tüm Gruplar</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                {(search || groupFilter) && (
                    <button
                        onClick={() => { setSearch(''); setGroupFilter(''); setPage(1); }}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            padding: '6px 10px', borderRadius: '6px',
                            border: '1px solid #fecaca', background: '#fef2f2',
                            fontSize: '0.72rem', fontWeight: 600, color: '#dc2626',
                            cursor: 'pointer'
                        }}
                    >
                        <X size={12} /> Temizle
                    </button>
                )}
            </div>

            {/* Table */}
            <div style={{ overflow: 'auto', flex: 1 }}>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '60px 0', color: '#64748b' }}>
                        <div className="loader" style={{ marginRight: '10px' }}></div> Yükleniyor...
                    </div>
                ) : products.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
                        <Package size={48} style={{ marginBottom: '12px', opacity: 0.4 }} />
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#64748b' }}>Ürün Bulunamadı</h3>
                        <p style={{ fontSize: '0.82rem' }}>Henüz ürün/hizmet eklenmemiş veya filtrelere uygun sonuç yok.</p>
                        <button onClick={openAddModal} style={{
                            marginTop: '12px', padding: '8px 20px', borderRadius: '8px',
                            border: 'none', background: '#6366f1', color: '#fff',
                            fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer'
                        }}>
                            <Plus size={14} style={{ marginRight: '4px' }} /> İlk Ürünü Ekle
                        </button>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ürün Adı</th>
                                <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Kategori</th>
                                <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Açıklama</th>
                                <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Grup</th>
                                <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Birim</th>
                                <th style={{ padding: '10px 8px', textAlign: 'right', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fiyat</th>
                                <th style={{ padding: '10px 8px', textAlign: 'right', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>İndirimli</th>
                                <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vergi 1</th>
                                <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vergi 2</th>
                                <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>İşlem</th>
                            </tr>
                        </thead>
                        <tbody>
                            {products.map((p, idx) => (
                                <tr key={p.id} style={{
                                    borderBottom: '1px solid #f1f5f9',
                                    background: idx % 2 === 0 ? '#fff' : '#fafbfc',
                                    transition: 'background 0.15s'
                                }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f0f4ff'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafbfc'}
                                >
                                    <td style={{ padding: '10px 16px' }}>
                                        <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.82rem' }}>{p.name}</div>
                                    </td>
                                    <td style={{ padding: '10px 8px' }}>
                                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                            {categories.find(c => c.id === p.categoryId)?.name || '—'}
                                        </div>
                                    </td>
                                    <td style={{ padding: '10px 8px', maxWidth: '200px' }}>
                                        <div style={{ fontSize: '0.78rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {p.description || '—'}
                                        </div>
                                    </td>
                                    <td style={{ padding: '10px 8px' }}>
                                        {(groups.find(g => g.id === p.parentId)?.name) ? (
                                            <span style={{
                                                display: 'inline-block', padding: '2px 8px',
                                                background: '#ede9fe', color: '#7c3aed',
                                                borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600
                                            }}>
                                                {(groups.find(g => g.id === p.parentId)?.name)}
                                            </span>
                                        ) : <span style={{ color: '#cbd5e1', fontSize: '0.78rem' }}>—</span>}
                                    </td>
                                    <td style={{ padding: '10px 8px', fontSize: '0.78rem', color: '#475569' }}>
                                        {p.unit || '—'}
                                    </td>
                                    <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600, fontSize: '0.82rem', color: '#1e293b', fontFamily: 'monospace' }}>
                                        {formatCurrency(p.price)}
                                    </td>
                                    <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: '0.78rem', color: p.discountedPrice ? '#16a34a' : '#cbd5e1', fontFamily: 'monospace' }}>
                                        {p.discountedPrice ? formatCurrency(p.discountedPrice) : '—'}
                                    </td>
                                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                        {p.tax1Type ? (
                                            <span style={{
                                                display: 'inline-block', padding: '2px 6px',
                                                background: '#fef3c7', color: '#b45309',
                                                borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600
                                            }}>
                                                {getTaxLabel(p.tax1Type)}
                                            </span>
                                        ) : <span style={{ color: '#cbd5e1', fontSize: '0.72rem' }}>—</span>}
                                    </td>
                                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                        {p.tax2Type ? (
                                            <span style={{
                                                display: 'inline-block', padding: '2px 6px',
                                                background: '#fce7f3', color: '#be185d',
                                                borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600
                                            }}>
                                                {getTaxLabel(p.tax2Type)}
                                            </span>
                                        ) : <span style={{ color: '#cbd5e1', fontSize: '0.72rem' }}>—</span>}
                                    </td>
                                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                            <button
                                                onClick={() => openEditModal(p)}
                                                title="Düzenle"
                                                style={{
                                                    width: '28px', height: '28px', borderRadius: '6px',
                                                    border: '1px solid #e2e8f0', background: '#fff',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    cursor: 'pointer', transition: 'all 0.15s', color: '#64748b'
                                                }}
                                            >
                                                <Edit2 size={13} />
                                            </button>
                                            <button
                                                onClick={() => setDeleteConfirm(p.id)}
                                                title="Sil"
                                                style={{
                                                    width: '28px', height: '28px', borderRadius: '6px',
                                                    border: '1px solid #fecaca', background: '#fef2f2',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    cursor: 'pointer', transition: 'all 0.15s', color: '#dc2626'
                                                }}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: '6px', padding: '14px 24px', borderTop: '1px solid #e2e8f0'
                }}>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).slice(
                        Math.max(0, page - 3), Math.min(totalPages, page + 2)
                    ).map(p => (
                        <button
                            key={p}
                            onClick={() => setPage(p)}
                            style={{
                                width: '32px', height: '32px', borderRadius: '6px',
                                border: p === page ? 'none' : '1px solid #e2e8f0',
                                background: p === page ? '#6366f1' : '#fff',
                                color: p === page ? '#fff' : '#475569',
                                fontWeight: 600, fontSize: '0.78rem',
                                cursor: 'pointer', transition: 'all 0.15s'
                            }}
                        >
                            {p}
                        </button>
                    ))}
                </div>
            )}
                </>
            )}

            
            {/* Category Modal */}
            {showCategoryModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '400px' }}>
                        <h3>{editingCategory ? 'Kategori Düzenle' : 'Yeni Kategori'}</h3>
                        <form onSubmit={handleSaveCategory}>
                            <div style={{ marginBottom: '12px' }}>
                                <label>İkon</label>
                                <input value={categoryForm.icon} onChange={e => setCategoryForm({...categoryForm, icon: e.target.value})} style={{ width: '100%', padding: '8px' }} />
                            </div>
                            <div style={{ marginBottom: '12px' }}>
                                <label>Ad</label>
                                <input value={categoryForm.name} onChange={e => setCategoryForm({...categoryForm, name: e.target.value})} required style={{ width: '100%', padding: '8px' }} />
                            </div>
                            <div style={{ marginBottom: '12px' }}>
                                <label>Açıklama</label>
                                <input value={categoryForm.description} onChange={e => setCategoryForm({...categoryForm, description: e.target.value})} style={{ width: '100%', padding: '8px' }} />
                            </div>
                            <div style={{ marginBottom: '12px' }}>
                                <label>Renk</label>
                                <input type="color" value={categoryForm.color} onChange={e => setCategoryForm({...categoryForm, color: e.target.value})} style={{ width: '100%', padding: '8px' }} />
                            </div>
                            <div style={{ marginBottom: '12px' }}>
                                <label>Anahtar Kelimeler</label>
                                <input value={categoryForm.keywords} onChange={e => setCategoryForm({...categoryForm, keywords: e.target.value})} style={{ width: '100%', padding: '8px' }} />
                            </div>
                            <div style={{ marginBottom: '12px' }}>
                                <label>Varsayılan Huni</label>
                                <select value={categoryForm.defaultFunnelId} onChange={e => setCategoryForm({...categoryForm, defaultFunnelId: e.target.value})} style={{ width: '100%', padding: '8px' }}>
                                    <option value="">Seçiniz</option>
                                    {funnels.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                </select>
                            </div>
                            <div style={{ marginBottom: '12px' }}>
                                <label>Varsayılan Ekip</label>
                                <select value={categoryForm.defaultTeamId} onChange={e => setCategoryForm({...categoryForm, defaultTeamId: e.target.value})} style={{ width: '100%', padding: '8px' }}>
                                    <option value="">Seçiniz</option>
                                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </div>
                            <div style={{ marginBottom: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label>Özel Alanlar (Custom Fields)</label>
                                    <button type="button" onClick={() => setCategoryForm({...categoryForm, customFields: [...(categoryForm.customFields||[]), { key: '', type: 'text', required: false, options: '', unit: '' }]})}>+ Ekle</button>
                                </div>
                                {(categoryForm.customFields||[]).map((cf, idx) => (
                                    <div key={idx} style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                                        <input placeholder="Anahtar (örn: size)" value={cf.key} onChange={e => { const newCf = [...categoryForm.customFields]; newCf[idx].key = e.target.value; setCategoryForm({...categoryForm, customFields: newCf}); }} style={{ width: '80px', padding: '4px' }} />
                                        <select value={cf.type} onChange={e => { const newCf = [...categoryForm.customFields]; newCf[idx].type = e.target.value; setCategoryForm({...categoryForm, customFields: newCf}); }} style={{ width: '80px', padding: '4px' }}>
                                            <option value="text">Metin</option>
                                            <option value="number">Sayı</option>
                                            <option value="select">Seçim</option>
                                        </select>
                                        <input placeholder="Birim" value={cf.unit} onChange={e => { const newCf = [...categoryForm.customFields]; newCf[idx].unit = e.target.value; setCategoryForm({...categoryForm, customFields: newCf}); }} style={{ width: '60px', padding: '4px' }} />
                                        <label><input type="checkbox" checked={cf.required} onChange={e => { const newCf = [...categoryForm.customFields]; newCf[idx].required = e.target.checked; setCategoryForm({...categoryForm, customFields: newCf}); }} /> Zorunlu</label>
                                        <button type="button" onClick={() => { const newCf = [...categoryForm.customFields]; newCf.splice(idx, 1); setCategoryForm({...categoryForm, customFields: newCf}); }}>X</button>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                <button type="button" onClick={() => setShowCategoryModal(false)} style={{ padding: '8px 16px' }}>İptal</button>
                                <button type="submit" style={{ padding: '8px 16px', background: '#6366f1', color: '#fff' }}>Kaydet</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Group Modal */}
            {showGroupModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '400px' }}>
                        <h3>{editingGroup ? 'Grup Düzenle' : 'Yeni Grup'}</h3>
                        <form onSubmit={handleSaveGroup}>
                            <div style={{ marginBottom: '12px' }}>
                                <label>Kategori</label>
                                <select value={groupForm.categoryId} onChange={e => setGroupForm({...groupForm, categoryId: e.target.value})} required style={{ width: '100%', padding: '8px' }}>
                                    <option value="">Seçiniz</option>
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div style={{ marginBottom: '12px' }}>
                                <label>Grup Adı</label>
                                <input value={groupForm.name} onChange={e => setGroupForm({...groupForm, name: e.target.value})} required style={{ width: '100%', padding: '8px' }} />
                            </div>
                            <div style={{ marginBottom: '12px' }}>
                                <label>Açıklama</label>
                                <input value={groupForm.description} onChange={e => setGroupForm({...groupForm, description: e.target.value})} style={{ width: '100%', padding: '8px' }} />
                            </div>
                            <div style={{ marginBottom: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label>Özel Alanlar (Custom Fields)</label>
                                    <button type="button" onClick={() => setCategoryForm({...categoryForm, customFields: [...(categoryForm.customFields||[]), { key: '', type: 'text', required: false, options: '', unit: '' }]})}>+ Ekle</button>
                                </div>
                                {(categoryForm.customFields||[]).map((cf, idx) => (
                                    <div key={idx} style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                                        <input placeholder="Anahtar (örn: size)" value={cf.key} onChange={e => { const newCf = [...categoryForm.customFields]; newCf[idx].key = e.target.value; setCategoryForm({...categoryForm, customFields: newCf}); }} style={{ width: '80px', padding: '4px' }} />
                                        <select value={cf.type} onChange={e => { const newCf = [...categoryForm.customFields]; newCf[idx].type = e.target.value; setCategoryForm({...categoryForm, customFields: newCf}); }} style={{ width: '80px', padding: '4px' }}>
                                            <option value="text">Metin</option>
                                            <option value="number">Sayı</option>
                                            <option value="select">Seçim</option>
                                        </select>
                                        <input placeholder="Birim" value={cf.unit} onChange={e => { const newCf = [...categoryForm.customFields]; newCf[idx].unit = e.target.value; setCategoryForm({...categoryForm, customFields: newCf}); }} style={{ width: '60px', padding: '4px' }} />
                                        <label><input type="checkbox" checked={cf.required} onChange={e => { const newCf = [...categoryForm.customFields]; newCf[idx].required = e.target.checked; setCategoryForm({...categoryForm, customFields: newCf}); }} /> Zorunlu</label>
                                        <button type="button" onClick={() => { const newCf = [...categoryForm.customFields]; newCf.splice(idx, 1); setCategoryForm({...categoryForm, customFields: newCf}); }}>X</button>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                <button type="button" onClick={() => setShowGroupModal(false)} style={{ padding: '8px 16px' }}>İptal</button>
                                <button type="submit" style={{ padding: '8px 16px', background: '#6366f1', color: '#fff' }}>Kaydet</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirm */}
            {deleteConfirm && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.4)', zIndex: 9998,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(2px)'
                }}
                    onClick={() => setDeleteConfirm(null)}
                >
                    <div style={{
                        background: '#fff', borderRadius: '12px', padding: '24px',
                        maxWidth: '380px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)'
                    }}
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>Ürünü Sil</h3>
                        <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 20px' }}>
                            Bu ürün/hizmeti silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
                        </p>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                style={{
                                    padding: '8px 16px', borderRadius: '8px',
                                    border: '1px solid #e2e8f0', background: '#fff',
                                    fontSize: '0.82rem', fontWeight: 600, color: '#64748b', cursor: 'pointer'
                                }}
                            >
                                İptal
                            </button>
                            <button
                                onClick={() => handleDelete(deleteConfirm)}
                                style={{
                                    padding: '8px 16px', borderRadius: '8px',
                                    border: 'none', background: '#dc2626',
                                    fontSize: '0.82rem', fontWeight: 600, color: '#fff', cursor: 'pointer'
                                }}
                            >
                                Sil
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.4)', zIndex: 9998,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(2px)'
                }}
                    onClick={() => { setShowModal(false); resetForm(); }}
                >
                    <div style={{
                        background: '#fff', borderRadius: '16px', padding: '0',
                        maxWidth: '560px', width: '100%', maxHeight: '90vh', overflow: 'auto',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.2)'
                    }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '18px 24px', borderBottom: '1px solid #e2e8f0'
                        }}>
                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
                                {editingProduct ? 'Ürün / Hizmet Düzenle' : 'Yeni Ürün / Hizmet Ekle'}
                            </h2>
                            <button
                                onClick={() => { setShowModal(false); resetForm(); }}
                                style={{
                                    width: '32px', height: '32px', borderRadius: '8px',
                                    border: 'none', background: '#f1f5f9', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#64748b'
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleSubmit} style={{ padding: '20px 24px' }}>
                            {/* Ürün Adı */}
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                                    Ürün Adı <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="Ürün veya hizmet adı..."
                                    style={{
                                        width: '100%', padding: '9px 12px', borderRadius: '8px',
                                        border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
                                        transition: 'border 0.2s', boxSizing: 'border-box'
                                    }}
                                    autoFocus
                                />
                            </div>

                            {/* Açıklama */}
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                                    Açıklama
                                </label>
                                <textarea
                                    value={formData.description}
                                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                    placeholder="Ürün açıklaması..."
                                    rows={2}
                                    style={{
                                        width: '100%', padding: '9px 12px', borderRadius: '8px',
                                        border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
                                        resize: 'vertical', boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            {/* AI Satış Notları */}
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                                    🤖 AI Satış Notları <span style={{ fontWeight: 400, color: '#9ca3af' }}>(Botlara özel bilgiler)</span>
                                </label>
                                <textarea
                                    value={formData.aiContext}
                                    onChange={e => setFormData(prev => ({ ...prev, aiContext: e.target.value }))}
                                    placeholder="Yapay zekanın bu ürünü satarken bilmesi gereken kilit özellikler, itiraz karşılama taktikleri veya teknik detaylar..."
                                    rows={3}
                                    style={{
                                        width: '100%', padding: '9px 12px', borderRadius: '8px',
                                        border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
                                        resize: 'vertical', boxSizing: 'border-box',
                                        background: '#f8fafc'
                                    }}
                                />
                            </div>

                            {/* Kategori */}
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                                    📁 Kategori <span style={{ fontWeight: 400, color: '#9ca3af' }}>(Raporlarda gruplanır)</span>
                                </label>
                                <select
                                    value={formData.categoryId}
                                    onChange={e => setFormData(prev => ({ ...prev, categoryId: e.target.value }))}
                                    style={{
                                        width: '100%', padding: '9px 12px', borderRadius: '8px',
                                        border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
                                        background: '#fff', cursor: 'pointer', boxSizing: 'border-box'
                                    }}
                                >
                                    <option value="">Kategori seçin...</option>
                                    {categories.map(c => (
                                        <option key={c.id} value={c.id}>{c.icon || '📁'} {c.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Grup & Birim */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                                        Ürün/Hizmet Grubu
                                    </label>
                                    <select value={formData.parentId} onChange={e => setFormData(prev => ({ ...prev, parentId: e.target.value }))} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}>
                                        <option value="">Grup Yok</option>
                                        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                                        Birim
                                    </label>
                                    <select
                                        value={formData.unit}
                                        onChange={e => setFormData(prev => ({ ...prev, unit: e.target.value }))}
                                        style={{
                                            width: '100%', padding: '9px 12px', borderRadius: '8px',
                                            border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
                                            background: '#fff', cursor: 'pointer', boxSizing: 'border-box'
                                        }}
                                    >
                                        {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* Fiyatlar */}
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                                    Fiyat (TL) <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.price}
                                    onChange={e => setFormData(prev => ({ ...prev, price: e.target.value }))}
                                    placeholder="0.00"
                                    style={{
                                        width: '100%', padding: '9px 12px', borderRadius: '8px',
                                        border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>USD</label>
                                    <input type="number" step="0.01" value={formData.priceUSD} onChange={e => setFormData(prev => ({ ...prev, priceUSD: e.target.value }))} placeholder="—" style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>EUR</label>
                                    <input type="number" step="0.01" value={formData.priceEUR} onChange={e => setFormData(prev => ({ ...prev, priceEUR: e.target.value }))} placeholder="—" style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>GBP</label>
                                    <input type="number" step="0.01" value={formData.priceGBP} onChange={e => setFormData(prev => ({ ...prev, priceGBP: e.target.value }))} placeholder="—" style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                            </div>

                            {/* İndirimli Fiyat */}
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                                    İndirimli Fiyat (TL)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.discountedPrice}
                                    onChange={e => setFormData(prev => ({ ...prev, discountedPrice: e.target.value }))}
                                    placeholder="Opsiyonel..."
                                    style={{
                                        width: '100%', padding: '9px 12px', borderRadius: '8px',
                                        border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            {/* Vergiler */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                                        Vergi 1
                                    </label>
                                    <select
                                        value={formData.tax1Type}
                                        onChange={e => handleTaxChange('tax1Type', e.target.value)}
                                        style={{
                                            width: '100%', padding: '9px 12px', borderRadius: '8px',
                                            border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
                                            background: '#fff', cursor: 'pointer', boxSizing: 'border-box'
                                        }}
                                    >
                                        {TAX_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                                        Vergi 2
                                    </label>
                                    <select
                                        value={formData.tax2Type}
                                        onChange={e => handleTaxChange('tax2Type', e.target.value)}
                                        style={{
                                            width: '100%', padding: '9px 12px', borderRadius: '8px',
                                            border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
                                            background: '#fff', cursor: 'pointer', boxSizing: 'border-box'
                                        }}
                                    >
                                        {TAX_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* Özellikler */}
                            <div style={{ marginBottom: '24px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151' }}>
                                        Dinamik Özellikler
                                    </label>
                                    <button
                                        type="button"
                                        onClick={addFeature}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                            padding: '4px 8px', borderRadius: '6px',
                                            border: '1px solid #e2e8f0', background: '#fff',
                                            fontSize: '0.72rem', fontWeight: 600, color: '#6366f1',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <Plus size={12} /> Özellik Ekle
                                    </button>
                                </div>
                                
                                {formData.features.map((feature, index) => (
                                    <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                        <input
                                            type="text"
                                            value={feature.featureKey}
                                            onChange={e => updateFeature(index, 'featureKey', e.target.value)}
                                            placeholder="Örn: Renk, Beden, Çözünürlük"
                                            style={{
                                                flex: 1, padding: '8px 10px', borderRadius: '6px',
                                                border: '1px solid #d1d5db', fontSize: '0.8rem', outline: 'none'
                                            }}
                                        />
                                        <input
                                            type="text"
                                            value={feature.featureValue}
                                            onChange={e => updateFeature(index, 'featureValue', e.target.value)}
                                            placeholder="Örn: Kırmızı, L, 4K"
                                            style={{
                                                flex: 1, padding: '8px 10px', borderRadius: '6px',
                                                border: '1px solid #d1d5db', fontSize: '0.8rem', outline: 'none'
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeFeature(index)}
                                            style={{
                                                width: '32px', height: '32px', borderRadius: '6px',
                                                border: '1px solid #fecaca', background: '#fef2f2',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer', color: '#dc2626', flexShrink: 0
                                            }}
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                                {formData.features.length === 0 && (
                                    <div style={{ textAlign: 'center', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', fontSize: '0.78rem', color: '#64748b' }}>
                                        Bu ürün için sektöre özel özellikler ekleyebilirsiniz. (Örn: İnşaat için: <em>Ağırlık</em>, Giyim için: <em>Beden</em>)
                                    </div>
                                )}
                            </div>

                            {/* Submit */}
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    onClick={() => { setShowModal(false); resetForm(); }}
                                    style={{
                                        padding: '10px 18px', borderRadius: '8px',
                                        border: '1px solid #e2e8f0', background: '#fff',
                                        fontSize: '0.85rem', fontWeight: 600, color: '#64748b', cursor: 'pointer'
                                    }}
                                >
                                    İptal
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    style={{
                                        padding: '10px 22px', borderRadius: '8px',
                                        border: 'none', background: saving ? '#a5b4fc' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                        fontSize: '0.85rem', fontWeight: 600, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer',
                                        boxShadow: '0 2px 8px rgba(99,102,241,0.3)'
                                    }}
                                >
                                    {saving ? 'Kaydediliyor...' : (editingProduct ? 'Güncelle' : 'Kaydet')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Products;
