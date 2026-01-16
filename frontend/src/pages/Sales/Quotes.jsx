import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { dealAPI, contactAPI } from '../../services/api';
import { Plus, Search, Filter, MoreVertical, ArrowRight, TrendingUp, Package, FileText, X, Trash2, Edit2, ChevronDown } from 'lucide-react';
import './Sales.css';

const Quotes = () => {
    const { currentWorkspace } = useAuth();
    const [deals, setDeals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedDeal, setSelectedDeal] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [stats, setStats] = useState(null);
    const [contacts, setContacts] = useState([]);
    const [users, setUsers] = useState([]);

    // Form state
    const [formData, setFormData] = useState({
        contactId: '',
        title: '',
        description: '',
        amount: '',
        currency: 'TRY',
        products: [{ name: '', quantity: 1, unitPrice: 0 }],
        assignedToId: '',
        notes: ''
    });

    useEffect(() => {
        if (currentWorkspace?.id) {
            fetchDeals();
            fetchStats();
            fetchContacts();
        }
    }, [currentWorkspace?.id]);

    const fetchDeals = async () => {
        try {
            setLoading(true);
            const response = await dealAPI.getAll(currentWorkspace.id, { stage: 'QUOTE' });
            setDeals(response.data.deals || []);
        } catch (error) {
            console.error('Failed to fetch deals:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const response = await dealAPI.getStats(currentWorkspace.id);
            setStats(response.data);
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        }
    };

    const fetchContacts = async () => {
        try {
            const response = await contactAPI.getAll(currentWorkspace.id, { limit: 500 });
            setContacts(response.data.contacts || []);
        } catch (error) {
            console.error('Failed to fetch contacts:', error);
        }
    };

    const handleCreateDeal = async (e) => {
        e.preventDefault();
        try {
            const totalAmount = formData.products.reduce((sum, p) => sum + (p.quantity * p.unitPrice), 0);
            const productsWithTotal = formData.products.map(p => ({
                ...p,
                total: p.quantity * p.unitPrice
            }));

            await dealAPI.create(currentWorkspace.id, {
                ...formData,
                amount: totalAmount,
                products: productsWithTotal
            });

            setShowForm(false);
            resetForm();
            fetchDeals();
            fetchStats();
        } catch (error) {
            console.error('Failed to create deal:', error);
            alert('Teklif oluşturulurken hata oluştu');
        }
    };

    const handleConvertToOrder = async (dealId) => {
        if (!confirm('Bu teklifi siparişe dönüştürmek istiyor musunuz?')) return;
        try {
            await dealAPI.convert(currentWorkspace.id, dealId, 'ORDER');
            fetchDeals();
            fetchStats();
            setSelectedDeal(null);
        } catch (error) {
            console.error('Failed to convert deal:', error);
            alert('Dönüştürme başarısız');
        }
    };

    const handleDeleteDeal = async (dealId) => {
        if (!confirm('Bu teklifi silmek istiyor musunuz?')) return;
        try {
            await dealAPI.delete(currentWorkspace.id, dealId);
            fetchDeals();
            fetchStats();
            setSelectedDeal(null);
        } catch (error) {
            console.error('Failed to delete deal:', error);
        }
    };

    const handleStatusChange = async (dealId, status, lostReason = null) => {
        try {
            await dealAPI.update(currentWorkspace.id, dealId, { status, lostReason });
            fetchDeals();
            fetchStats();
        } catch (error) {
            console.error('Failed to update status:', error);
        }
    };

    const resetForm = () => {
        setFormData({
            contactId: '',
            title: '',
            description: '',
            amount: '',
            currency: 'TRY',
            products: [{ name: '', quantity: 1, unitPrice: 0 }],
            assignedToId: '',
            notes: ''
        });
    };

    const addProduct = () => {
        setFormData({
            ...formData,
            products: [...formData.products, { name: '', quantity: 1, unitPrice: 0 }]
        });
    };

    const removeProduct = (index) => {
        setFormData({
            ...formData,
            products: formData.products.filter((_, i) => i !== index)
        });
    };

    const updateProduct = (index, field, value) => {
        const newProducts = [...formData.products];
        newProducts[index][field] = field === 'quantity' || field === 'unitPrice' ? parseFloat(value) || 0 : value;
        setFormData({ ...formData, products: newProducts });
    };

    const formatCurrency = (amount, currency = 'TRY') => {
        const symbols = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' };
        return `${symbols[currency] || ''}${amount?.toLocaleString('tr-TR') || 0}`;
    };

    const filteredDeals = deals.filter(deal =>
        deal.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        deal.contact?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        deal.quoteNumber?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const quoteStats = stats?.stageStats?.find(s => s.stage === 'QUOTE') || { count: 0, totalAmount: 0 };

    return (
        <div className="sales-page">
            {/* Header */}
            <div className="sales-header">
                <div className="sales-header-left">
                    <h1>Teklifler</h1>
                    <span className="sales-count">{quoteStats.count} teklif</span>
                </div>
                <div className="sales-header-right">
                    <button className="btn-primary" onClick={() => setShowForm(true)}>
                        <Plus size={18} />
                        Yeni Teklif
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="sales-stats">
                <div className="stat-card">
                    <div className="stat-icon quote"><FileText size={20} /></div>
                    <div className="stat-info">
                        <span className="stat-value">{quoteStats.count}</span>
                        <span className="stat-label">Toplam Teklif</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon amount"><TrendingUp size={20} /></div>
                    <div className="stat-info">
                        <span className="stat-value">{formatCurrency(quoteStats.totalAmount)}</span>
                        <span className="stat-label">Toplam Tutar</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon conversion"><ArrowRight size={20} /></div>
                    <div className="stat-info">
                        <span className="stat-value">{stats?.conversionRates?.quoteToOrder || 0}%</span>
                        <span className="stat-label">Siparişe Dönüşüm</span>
                    </div>
                </div>
            </div>

            {/* Search */}
            <div className="sales-toolbar">
                <div className="search-box">
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder="Teklif ara..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* Content */}
            <div className="sales-content">
                {/* Deals List */}
                <div className="deals-list">
                    {loading ? (
                        <div className="loading-state">Yükleniyor...</div>
                    ) : filteredDeals.length === 0 ? (
                        <div className="empty-state">
                            <FileText size={48} />
                            <h3>Henüz teklif yok</h3>
                            <p>İlk teklifinizi oluşturmak için "Yeni Teklif" butonuna tıklayın</p>
                        </div>
                    ) : (
                        filteredDeals.map(deal => (
                            <div
                                key={deal.id}
                                className={`deal-card ${selectedDeal?.id === deal.id ? 'selected' : ''} ${deal.status.toLowerCase()}`}
                                onClick={() => setSelectedDeal(deal)}
                            >
                                <div className="deal-card-header">
                                    <span className="deal-number">{deal.quoteNumber}</span>
                                    <span className={`deal-status ${deal.status.toLowerCase()}`}>
                                        {deal.status === 'OPEN' ? 'Açık' : deal.status === 'WON' ? 'Kazanıldı' : 'Kaybedildi'}
                                    </span>
                                </div>
                                <h3 className="deal-title">{deal.title}</h3>
                                <p className="deal-contact">{deal.contact?.name || deal.contact?.fullName}</p>
                                <div className="deal-footer">
                                    <span className="deal-amount">{formatCurrency(deal.amount, deal.currency)}</span>
                                    <span className="deal-date">{new Date(deal.createdAt).toLocaleDateString('tr-TR')}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Detail Panel */}
                {selectedDeal && (
                    <div className="deal-detail-panel">
                        <div className="detail-header">
                            <h2>{selectedDeal.title}</h2>
                            <button className="btn-icon" onClick={() => setSelectedDeal(null)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="detail-info">
                            <div className="info-row">
                                <span className="label">Teklif No:</span>
                                <span className="value">{selectedDeal.quoteNumber}</span>
                            </div>
                            <div className="info-row">
                                <span className="label">Müşteri:</span>
                                <span className="value">{selectedDeal.contact?.name || selectedDeal.contact?.fullName}</span>
                            </div>
                            <div className="info-row">
                                <span className="label">Tutar:</span>
                                <span className="value amount">{formatCurrency(selectedDeal.amount, selectedDeal.currency)}</span>
                            </div>
                            <div className="info-row">
                                <span className="label">Durum:</span>
                                <select
                                    value={selectedDeal.status}
                                    onChange={(e) => handleStatusChange(selectedDeal.id, e.target.value)}
                                    className="status-select"
                                >
                                    <option value="OPEN">Açık</option>
                                    <option value="WON">Kazanıldı</option>
                                    <option value="LOST">Kaybedildi</option>
                                </select>
                            </div>
                        </div>

                        {/* Products */}
                        <div className="detail-products">
                            <h4>Ürünler</h4>
                            <div className="products-table">
                                {selectedDeal.products?.map((product, i) => (
                                    <div key={i} className="product-row">
                                        <span className="product-name">{product.name}</span>
                                        <span className="product-qty">{product.quantity} adet</span>
                                        <span className="product-price">{formatCurrency(product.total, selectedDeal.currency)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Notes */}
                        {selectedDeal.notes && (
                            <div className="detail-notes">
                                <h4>Notlar</h4>
                                <p>{selectedDeal.notes}</p>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="detail-actions">
                            {selectedDeal.status === 'OPEN' && (
                                <button
                                    className="btn-primary"
                                    onClick={() => handleConvertToOrder(selectedDeal.id)}
                                >
                                    <ArrowRight size={16} />
                                    Siparişe Dönüştür
                                </button>
                            )}
                            <button
                                className="btn-danger"
                                onClick={() => handleDeleteDeal(selectedDeal.id)}
                            >
                                <Trash2 size={16} />
                                Sil
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Create Form Modal */}
            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal-content deal-form" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Yeni Teklif Oluştur</h2>
                            <button className="btn-icon" onClick={() => setShowForm(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateDeal}>
                            <div className="form-group">
                                <label>Müşteri *</label>
                                <select
                                    value={formData.contactId}
                                    onChange={(e) => setFormData({ ...formData, contactId: e.target.value })}
                                    required
                                >
                                    <option value="">Müşteri Seç</option>
                                    {contacts.map(c => (
                                        <option key={c.id} value={c.id}>
                                            {c.name || c.fullName || c.email || c.phone}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Teklif Başlığı *</label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    placeholder="Örn: Web Sitesi Projesi"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Açıklama</label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Teklif detayları..."
                                    rows={3}
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Para Birimi</label>
                                    <select
                                        value={formData.currency}
                                        onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                                    >
                                        <option value="TRY">₺ TRY</option>
                                        <option value="USD">$ USD</option>
                                        <option value="EUR">€ EUR</option>
                                        <option value="GBP">£ GBP</option>
                                    </select>
                                </div>
                            </div>

                            {/* Products */}
                            <div className="form-group products-section">
                                <label>Ürünler / Hizmetler</label>
                                {formData.products.map((product, index) => (
                                    <div key={index} className="product-input-row">
                                        <input
                                            type="text"
                                            placeholder="Ürün adı"
                                            value={product.name}
                                            onChange={(e) => updateProduct(index, 'name', e.target.value)}
                                        />
                                        <input
                                            type="number"
                                            placeholder="Adet"
                                            value={product.quantity}
                                            onChange={(e) => updateProduct(index, 'quantity', e.target.value)}
                                            min="1"
                                        />
                                        <input
                                            type="number"
                                            placeholder="Birim Fiyat"
                                            value={product.unitPrice}
                                            onChange={(e) => updateProduct(index, 'unitPrice', e.target.value)}
                                            min="0"
                                        />
                                        <span className="product-total">
                                            {formatCurrency(product.quantity * product.unitPrice, formData.currency)}
                                        </span>
                                        {formData.products.length > 1 && (
                                            <button type="button" className="btn-icon-sm" onClick={() => removeProduct(index)}>
                                                <X size={16} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                <button type="button" className="btn-secondary btn-sm" onClick={addProduct}>
                                    <Plus size={16} /> Ürün Ekle
                                </button>
                                <div className="products-total">
                                    Toplam: {formatCurrency(
                                        formData.products.reduce((sum, p) => sum + (p.quantity * p.unitPrice), 0),
                                        formData.currency
                                    )}
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Notlar</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    placeholder="Ek notlar..."
                                    rows={2}
                                />
                            </div>

                            <div className="form-actions">
                                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
                                    İptal
                                </button>
                                <button type="submit" className="btn-primary">
                                    Teklif Oluştur
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Quotes;
