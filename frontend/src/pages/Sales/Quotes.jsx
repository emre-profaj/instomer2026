import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { dealAPI, contactAPI } from '../../services/api';
import { Plus, Search, Filter, MoreVertical, ArrowRight, TrendingUp, Package, FileText, X, Trash2, Edit2, ChevronDown, User } from 'lucide-react';
import ContactSidebar from '../../components/ContactSidebar/ContactSidebar';
import './Sales.css';

const Quotes = () => {
    const { t } = useTranslation();
    const { currentWorkspace } = useAuth();
    const [deals, setDeals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedDeal, setSelectedDeal] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [stats, setStats] = useState(null);
    const [contacts, setContacts] = useState([]);
    const [users, setUsers] = useState([]);
    const [editingDeal, setEditingDeal] = useState(null);

    // Filter states
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [agentFilter, setAgentFilter] = useState('ALL');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

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
            fetchUsers();
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

    const fetchUsers = async () => {
        try {
            const response = await fetch(`/api/workspaces/${currentWorkspace.id}/members`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const data = await response.json();
            setUsers(data.members || data || []);
        } catch (error) {
            console.error('Failed to fetch users:', error);
        }
    };

    const handleSaveDeal = async (e) => {
        e.preventDefault();
        try {
            const totalAmount = formData.products.reduce((sum, p) => sum + (p.quantity * p.unitPrice), 0);
            const productsWithTotal = formData.products.map(p => ({
                ...p,
                total: p.quantity * p.unitPrice
            }));

            const payload = {
                ...formData,
                amount: totalAmount,
                products: productsWithTotal
            };

            if (editingDeal) {
                await dealAPI.update(currentWorkspace.id, editingDeal.id, payload);
            } else {
                await dealAPI.create(currentWorkspace.id, payload);
            }

            setShowForm(false);
            setEditingDeal(null);
            resetForm();
            fetchDeals();
            fetchStats();
        } catch (error) {
            console.error('Failed to save deal:', error);
            alert('Teklif kaydedilemedi');
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

    const openEditForm = (deal) => {
        setEditingDeal(deal);
        setFormData({
            contactId: deal.contactId || '',
            title: deal.title || '',
            description: deal.description || '',
            amount: deal.amount || '',
            currency: deal.currency || 'TRY',
            products: deal.products?.length ? deal.products : [{ name: '', quantity: 1, unitPrice: 0 }],
            assignedToId: deal.assignedToId || '',
            notes: deal.notes || ''
        });
        setShowForm(true);
    };

    const closeForm = () => {
        setShowForm(false);
        setEditingDeal(null);
        resetForm();
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

    // Filtered deals with all filters
    const filteredDeals = deals.filter(deal => {
        const matchesSearch = !searchQuery ||
            deal.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            deal.contact?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            deal.quoteNumber?.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesStatus = statusFilter === 'ALL' || deal.status === statusFilter;
        const matchesAgent = agentFilter === 'ALL' || deal.assignedToId === agentFilter;

        let matchesDate = true;
        if (dateFrom) {
            matchesDate = new Date(deal.createdAt) >= new Date(dateFrom);
        }
        if (dateTo && matchesDate) {
            const end = new Date(dateTo);
            end.setHours(23, 59, 59, 999);
            matchesDate = new Date(deal.createdAt) <= end;
        }

        return matchesSearch && matchesStatus && matchesAgent && matchesDate;
    });

    const quoteStats = stats?.stageStats?.find(s => s.stage === 'QUOTE') || { count: 0, totalAmount: 0 };

    // Build externalProfile for ContactSidebar from the selected deal's contact
    const sidebarProfile = selectedDeal?.contact ? {
        id: selectedDeal.contact.id,
        name: selectedDeal.contact.name || selectedDeal.contact.fullName,
        fullName: selectedDeal.contact.fullName || selectedDeal.contact.name,
        phone: selectedDeal.contact.phone,
        email: selectedDeal.contact.email,
        company: selectedDeal.contact.company,
        tags: selectedDeal.contact.tags || [],
        avatar: selectedDeal.contact.avatar || selectedDeal.contact.profilePic,
    } : null;

    return (
        <div className="sales-inbox-layout">
            {/* ── LEFT PANEL: Filters + Quote List ── */}
            <div className="sales-list-panel">
                {/* Panel Header */}
                <div className="sales-list-panel-header">
                    <div className="sales-list-panel-title">
                        <h2>Teklifler</h2>
                        <span className="sales-count">{quoteStats.count} teklif</span>
                    </div>
                    <button className="btn-primary btn-sm" onClick={() => setShowForm(true)}>
                        <Plus size={16} />
                        Yeni Teklif
                    </button>
                </div>

                {/* Filters */}
                <div className="sales-list-filters">
                    <div className="sales-list-search">
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Teklif ara..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="sales-list-filter-row">
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="sales-filter-select"
                        >
                            <option value="ALL">Tüm Durumlar</option>
                            <option value="OPEN">Açık</option>
                            <option value="WON">Kazanıldı</option>
                            <option value="LOST">Kaybedildi</option>
                        </select>
                        <select
                            value={agentFilter}
                            onChange={(e) => setAgentFilter(e.target.value)}
                            className="sales-filter-select"
                        >
                            <option value="ALL">Tüm Temsilciler</option>
                            {users.map(u => (
                                <option key={u.user?.id || u.userId} value={u.user?.id || u.userId}>
                                    {u.user?.name || u.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="sales-list-filter-row">
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="sales-filter-date"
                        />
                        <span style={{ color: '#9ca3af', fontSize: '12px' }}>—</span>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="sales-filter-date"
                        />
                    </div>
                </div>

                {/* Quote Cards List */}
                <div className="sales-list-cards">
                    {loading ? (
                        <div className="sales-list-empty">Yükleniyor...</div>
                    ) : filteredDeals.length === 0 ? (
                        <div className="sales-list-empty">
                            <FileText size={36} />
                            <h4>{t('sales.noQuotes')}</h4>
                            <p>İlk teklifinizi oluşturmak için "Yeni Teklif" butonuna tıklayın</p>
                        </div>
                    ) : (
                        filteredDeals.map(deal => (
                            <div
                                key={deal.id}
                                className={`sales-list-card ${selectedDeal?.id === deal.id ? 'selected' : ''} ${deal.status.toLowerCase()}`}
                                onClick={() => setSelectedDeal(deal)}
                            >
                                <div className="sales-list-card-top">
                                    <span className="sales-list-card-number">{deal.quoteNumber}</span>
                                    <span className={`sales-list-card-badge ${deal.status.toLowerCase()}`}>
                                        {deal.status === 'OPEN' ? 'Açık' : deal.status === 'WON' ? 'Kazanıldı' : 'Kaybedildi'}
                                    </span>
                                </div>
                                <div className="sales-list-card-title">{deal.title}</div>
                                <div className="sales-list-card-customer">{deal.contact?.name || deal.contact?.fullName}</div>
                                <div className="sales-list-card-bottom">
                                    <span className="sales-list-card-amount">{formatCurrency(deal.amount, deal.currency)}</span>
                                    <span className="sales-list-card-date">{new Date(deal.createdAt).toLocaleDateString('tr-TR')}</span>
                                </div>
                                {deal.assignedTo && (
                                    <div className="sales-list-card-agent">
                                        <User size={11} /> {deal.assignedTo.name}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* ── MIDDLE PANEL: Detail ── */}
            <div className="sales-detail-panel">
                {selectedDeal ? (
                    <>
                        {/* Stats Cards */}
                        <div className="sales-detail-stats">
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

                        {/* Detail Card */}
                        <div className="sales-detail-card">
                            <div className="detail-header">
                                <div>
                                    <span className="deal-number" style={{ marginBottom: 4, display: 'block' }}>{selectedDeal.quoteNumber}</span>
                                    <h2>{selectedDeal.title}</h2>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className={`deal-status ${selectedDeal.status.toLowerCase()}`}>
                                        {selectedDeal.status === 'OPEN' ? 'Açık' : selectedDeal.status === 'WON' ? 'Kazanıldı' : 'Kaybedildi'}
                                    </span>
                                    <button className="btn-icon" onClick={() => setSelectedDeal(null)}>
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>

                            <div className="detail-info">
                                <div className="info-row">
                                    <span className="label">Teklif No:</span>
                                    <span className="value">{selectedDeal.quoteNumber}</span>
                                </div>
                                <div className="info-row">
                                    <span className="label">{t('sales.customer')}</span>
                                    <span className="value">{selectedDeal.contact?.name || selectedDeal.contact?.fullName}</span>
                                </div>
                                <div className="info-row">
                                    <span className="label">Temsilci:</span>
                                    <span className="value">{selectedDeal.assignedTo?.name || '—'}</span>
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
                                        <option value="WON">{t('sales.won')}</option>
                                        <option value="LOST">{t('sales.lost')}</option>
                                    </select>
                                </div>
                                <div className="info-row">
                                    <span className="label">Tarih:</span>
                                    <span className="value">{new Date(selectedDeal.createdAt).toLocaleDateString('tr-TR')}</span>
                                </div>
                            </div>

                            {/* Products */}
                            <div className="detail-products">
                                <h4>{t('sales.products')}</h4>
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
                                <button
                                    className="btn-secondary"
                                    onClick={() => openEditForm(selectedDeal)}
                                >
                                    <Edit2 size={16} />
                                    Düzenle
                                </button>
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
                    </>
                ) : (
                    <div className="sales-detail-empty">
                        <FileText size={48} strokeWidth={1.2} />
                        <h3>Teklif Seçin</h3>
                        <p>Detayları görüntülemek için sol panelden bir teklif seçin</p>
                    </div>
                )}
            </div>

            {/* ── RIGHT PANEL: ContactSidebar ── */}
            {selectedDeal && sidebarProfile && (
                <div className="sales-sidebar-panel">
                    <ContactSidebar
                        externalProfile={sidebarProfile}
                        isOpen={true}
                        readOnly={true}
                        onClose={() => setSelectedDeal(null)}
                    />
                </div>
            )}

            {/* Create/Edit Form Modal */}
            {showForm && (
                <div className="modal-overlay" onClick={closeForm}>
                    <div className="modal-content deal-form" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingDeal ? 'Teklifi Düzenle' : 'Yeni Teklif Oluştur'}</h2>
                            <button className="btn-icon" onClick={closeForm}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveDeal}>
                            <div className="form-group">
                                <label>{t('sales.customerLabel')}</label>
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
                                <label>Temsilci</label>
                                <select
                                    value={formData.assignedToId}
                                    onChange={(e) => setFormData({ ...formData, assignedToId: e.target.value })}
                                >
                                    <option value="">Temsilci Seç (Opsiyonel)</option>
                                    {users.map(u => (
                                        <option key={u.user?.id || u.userId} value={u.user?.id || u.userId}>
                                            {u.user?.name || u.name}
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
                                <label>{t('teams.descriptionLabel')}</label>
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
                                <label>{t('sales.productsServices')}</label>
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
                                <button type="button" className="btn-secondary" onClick={closeForm}>
                                    İptal
                                </button>
                                <button type="submit" className="btn-primary">
                                    {editingDeal ? 'Güncelle' : 'Teklif Oluştur'}
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
