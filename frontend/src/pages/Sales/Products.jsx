import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { productAPI } from '../../services/api';
import { Plus, Search, X, Edit2, Trash2, Package, Filter, Download, Upload, ChevronDown } from 'lucide-react';
import TopicCategories from '../Settings/TopicCategories';
import { importFromExcel } from '../../services/topicCategory.api';
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
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
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
        groupName: '',
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
        }
    }, [currentWorkspace?.id, search, groupFilter, page]);

    const fetchProducts = async () => {
        try {
            setLoading(true);
            const params = { limit: pageSize, offset: (page - 1) * pageSize };
            if (search) params.search = search;
            if (groupFilter) params.group = groupFilter;
            const res = await productAPI.getAll(currentWorkspace.id, params);
            setProducts(res.data.products || []);
            setTotal(res.data.pagination?.total || res.data.total || 0);
        } catch (err) {
            console.error('Failed to fetch products:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchGroups = async () => {
        try {
            const res = await productAPI.getGroups(currentWorkspace.id);
            const raw = res.data.groups || res.data.data || [];
            // groups could be [{groupName:'x', count:1}] or ['x','y'] — normalize to string array
            setGroups(raw.map(g => typeof g === 'string' ? g : (g.groupName || g.name || '')).filter(Boolean));
        } catch (err) {
            console.error('Failed to fetch groups:', err);
        }
    };

    const resetForm = () => {
        setFormData({
            name: '', description: '', groupName: '', unit: 'Adet',
            price: '', priceUSD: '', priceEUR: '', priceGBP: '',
            discountedPrice: '', tax1Type: '', tax1Rate: 0, tax2Type: '', tax2Rate: 0,
        });
        setEditingProduct(null);
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
            groupName: product.groupName || '',
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
            p.name, p.description || '', p.groupName || '', p.unit || '',
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
                    onClick={() => setActiveTab('products')}
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
                <button
                    onClick={() => setActiveTab('categories')}
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
            </div>

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
                <select
                    value={groupFilter}
                    onChange={(e) => { setGroupFilter(e.target.value); setPage(1); }}
                    style={{
                        padding: '8px 12px', border: '1px solid #e2e8f0',
                        borderRadius: '8px', fontSize: '0.82rem', outline: 'none',
                        background: '#fff', color: '#334155', cursor: 'pointer'
                    }}
                >
                    <option value="">Tüm Gruplar</option>
                    {groups.map((g, i) => { const label = typeof g === 'string' ? g : (g?.groupName || g?.name || ''); return label ? <option key={label + i} value={label}>{label}</option> : null; })}
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
                                    <td style={{ padding: '10px 8px', maxWidth: '200px' }}>
                                        <div style={{ fontSize: '0.78rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {p.description || '—'}
                                        </div>
                                    </td>
                                    <td style={{ padding: '10px 8px' }}>
                                        {p.groupName ? (
                                            <span style={{
                                                display: 'inline-block', padding: '2px 8px',
                                                background: '#ede9fe', color: '#7c3aed',
                                                borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600
                                            }}>
                                                {p.groupName}
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

            {activeTab === 'categories' && (
                <TopicCategories />
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

                            {/* Grup & Birim */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                                        Ürün/Hizmet Grubu
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.groupName}
                                        onChange={e => setFormData(prev => ({ ...prev, groupName: e.target.value }))}
                                        placeholder="Grup adı..."
                                        list="group-suggestions"
                                        style={{
                                            width: '100%', padding: '9px 12px', borderRadius: '8px',
                                            border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
                                            boxSizing: 'border-box'
                                        }}
                                    />
                                    <datalist id="group-suggestions">
                                        {groups.map((g, i) => { const v = typeof g === 'string' ? g : (g?.groupName || g?.name || ''); return v ? <option key={v + i} value={v} /> : null; })}
                                    </datalist>
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
