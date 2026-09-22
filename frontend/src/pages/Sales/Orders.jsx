import { useTranslation } from 'react-i18next';
import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { dealAPI, contactAPI, productAPI } from '../../services/api';
import { Search, ArrowRight, TrendingUp, Plus, X, Trash2, ShoppingCart, Edit2, User, Calendar } from 'lucide-react';
import ContactSidebar from '../../components/ContactSidebar/ContactSidebar';
import DealSourceSelect from '../../components/DealSourceSelect/DealSourceSelect';
import { sourceLabel, sourceIcon } from '../../utils/leadSource';
import './Sales.css';

// Helper: compute date range from preset
const getDateRange = (preset) => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (preset) {
        case 'TODAY':
            return { from: startOfDay, to: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1) };
        case 'YESTERDAY': {
            const yStart = new Date(startOfDay); yStart.setDate(yStart.getDate() - 1);
            const yEnd = new Date(yStart); yEnd.setHours(23, 59, 59, 999);
            return { from: yStart, to: yEnd };
        }
        case 'THIS_WEEK': {
            const day = now.getDay();
            const diffToMonday = day === 0 ? 6 : day - 1;
            const monday = new Date(startOfDay);
            monday.setDate(monday.getDate() - diffToMonday);
            const sunday = new Date(monday);
            sunday.setDate(sunday.getDate() + 6);
            sunday.setHours(23, 59, 59, 999);
            return { from: monday, to: sunday };
        }
        case 'THIS_MONTH': {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            return { from: firstDay, to: lastDay };
        }
        default:
            return { from: null, to: null };
    }
};

const Orders = () => {
    const { t } = useTranslation();
    const { currentWorkspace, user } = useAuth();
    const [deals, setDeals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedDeal, setSelectedDeal] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [stats, setStats] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [contacts, setContacts] = useState([]);
    const [catalogProducts, setCatalogProducts] = useState([]);
    const [users, setUsers] = useState([]);
    const [editingDeal, setEditingDeal] = useState(null);
    const [contactSearch, setContactSearch] = useState('');
    const [showContactDropdown, setShowContactDropdown] = useState(false);

    // Determine workspace-level role
    const workspaceMemberRole = currentWorkspace?.members?.find(m => m.userId === user?.id)?.role;
    const userRole = workspaceMemberRole || user?.role;
    const isAgent = userRole === 'AGENT';
    const PROTOCOL_WORKSPACE_ID = '2d4305d2-1c7f-4f11-88d1-78afd844be42';
    const showProtocolNo = currentWorkspace?.id === PROTOCOL_WORKSPACE_ID;

    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const initialView = searchParams.get('view');

    // Filter states
    const [statusFilter, setStatusFilter] = useState('ALL');
    // AGENT users always see only their own deals (backend enforces this too)
    const [agentFilter, setAgentFilter] = useState(isAgent ? user?.id : (initialView === 'mine' && user?.id ? user.id : 'ALL'));
    const [datePreset, setDatePreset] = useState('THIS_MONTH');
    const [customDateFrom, setCustomDateFrom] = useState('');
    const [customDateTo, setCustomDateTo] = useState('');

    // Resizable panel width (default 450px, saved in localStorage)
    const [panelWidth, setPanelWidth] = useState(() => {
        const saved = localStorage.getItem('sales-panel-width');
        return saved ? Math.max(360, Math.min(650, parseInt(saved, 10))) : 450;
    });
    const [showRightSidebar, setShowRightSidebar] = useState(true);
    const layoutRef = useRef(null);
    const isDraggingRef = useRef(false);

    const handleMouseDown = (e) => {
        e.preventDefault();
        isDraggingRef.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const handleMouseMove = (moveEvent) => {
            if (!isDraggingRef.current) return;
            const containerLeft = layoutRef.current?.getBoundingClientRect().left || 0;
            const newWidth = Math.max(360, Math.min(650, moveEvent.clientX - containerLeft));
            setPanelWidth(newWidth);
        };

        const handleMouseUp = () => {
            if (isDraggingRef.current) {
                isDraggingRef.current = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
                setPanelWidth((curr) => {
                    localStorage.setItem('sales-panel-width', curr);
                    return curr;
                });
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    // Form state
    const [formData, setFormData] = useState({
        contactId: '',
        title: '',
        description: '',
        currency: 'TRY',
        products: [{ name: '', quantity: 1, unitPrice: 0 }],
        assignedToId: user?.id || '',
        notes: '',
        protocolNo: ''
    });

    useEffect(() => {
        if (currentWorkspace?.id) {
            fetchDeals();
            fetchStats();
            fetchContacts();
            fetchUsers();
            fetchCatalogProducts();
        }
    }, [currentWorkspace?.id]);

    const fetchDeals = async () => {
        try {
            setLoading(true);
            // limit=9999: Tüm siparişleri çek, client-side filtreleme doğru çalışsın
            const response = await dealAPI.getAll(currentWorkspace.id, { stage: 'ORDER', limit: 9999 });
            setDeals(response.data.deals || []);
        } catch (error) {
            console.error('Failed to fetch orders:', error);
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

    const fetchCatalogProducts = async () => {
        try {
            const res = await productAPI.getAll(currentWorkspace.id, { isGroup: false, limit: 500 });
            setCatalogProducts(res.data.products || []);
        } catch (err) {
            console.error('Failed to fetch catalog products:', err);
        }
    };

    const handleSaveOrder = async (e) => {
        e.preventDefault();
        try {
            const productsWithTotal = formData.products.map(p => ({
                ...p,
                total: (p.discountedPrice || p.unitPrice) * p.quantity
            }));
            const subtotal = productsWithTotal.reduce((sum, p) => sum + p.total, 0);
            const totalTax = formData.products.reduce((sum, p) => sum + ((p.discountedPrice || p.unitPrice) * p.quantity * (p.tax1Rate || 0) / 100), 0);

            const payload = {
                ...formData,
                amount: subtotal,
                vatRate: subtotal > 0 ? (totalTax / subtotal * 100) : 0,
                products: productsWithTotal,
                stage: 'ORDER'
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
            console.error('Failed to save order:', error?.response?.data || error);
            alert('Sipariş kaydedilemedi: ' + (error?.response?.data?.error || error.message || 'Bilinmeyen hata'));
        }
    };

    const handleConvertToInvoice = async (dealId) => {
        if (!confirm('Bu siparişi faturaya dönüştürmek istiyor musunuz?')) return;
        try {
            await dealAPI.convert(currentWorkspace.id, dealId, 'INVOICE');
            fetchDeals();
            fetchStats();
            setSelectedDeal(null);
        } catch (error) {
            console.error('Failed to convert deal:', error);
            alert('Dönüştürme başarısız');
        }
    };

    const handleDeleteDeal = async (dealId) => {
        if (!confirm('Bu siparişi silmek istiyor musunuz?')) return;
        try {
            await dealAPI.delete(currentWorkspace.id, dealId);
            fetchDeals();
            fetchStats();
            setSelectedDeal(null);
        } catch (error) {
            console.error('Failed to delete deal:', error);
        }
    };

    const handleStatusChange = async (dealId, status) => {
        try {
            await dealAPI.update(currentWorkspace.id, dealId, { status });
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
            currency: deal.currency || 'TRY',
            products: deal.products?.length ? deal.products : [{ name: '', quantity: 1, unitPrice: 0 }],
            assignedToId: deal.assignedToId || '',
            notes: deal.notes || '',
            protocolNo: deal.protocolNo || ''
        });
        const existingContact = contacts.find(c => c.id === deal.contactId);
        setContactSearch(existingContact ? (existingContact.name || existingContact.fullName || existingContact.email || existingContact.phone || '') : '');
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
            currency: 'TRY',
            products: [{ name: '', quantity: 1, unitPrice: 0 }],
            assignedToId: user?.id || '',
            notes: '',
            protocolNo: ''
        });
        setContactSearch('');
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
        if (field === 'name') {
            newProducts[index].name = value;
            const catalogMatch = catalogProducts.find(cp => cp.name === value);
            if (catalogMatch) {
                const priceKey = formData.currency === 'USD' ? 'priceUSD' : formData.currency === 'EUR' ? 'priceEUR' : formData.currency === 'GBP' ? 'priceGBP' : 'price';
                newProducts[index].unitPrice = catalogMatch[priceKey] || catalogMatch.price || 0;
                if (catalogMatch.groupName) newProducts[index].group = catalogMatch.groupName;
                if (catalogMatch.description) newProducts[index].description = catalogMatch.description;
                if (catalogMatch.discountedPrice) newProducts[index].discountedPrice = catalogMatch.discountedPrice;
                if (catalogMatch.tax1Type) newProducts[index].tax1Type = catalogMatch.tax1Type;
                newProducts[index].tax1Rate = catalogMatch.tax1Rate || 0;
                if (catalogMatch.tax2Type) newProducts[index].tax2Type = catalogMatch.tax2Type;
                newProducts[index].tax2Rate = catalogMatch.tax2Rate || 0;
                if (catalogMatch.unit) newProducts[index].unit = catalogMatch.unit;
            }
        } else {
            newProducts[index][field] = field === 'quantity' || field === 'unitPrice' ? parseFloat(value) || 0 : value;
        }
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
            deal.orderNumber?.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesStatus = statusFilter === 'ALL' || deal.status === statusFilter;
        const matchesAgent = agentFilter === 'ALL' || deal.assignedToId === agentFilter;

        let matchesDate = true;
        if (datePreset !== 'ALL') {
            const dealDate = new Date(deal.createdAt);
            if (datePreset === 'CUSTOM') {
                if (customDateFrom) {
                    matchesDate = dealDate >= new Date(customDateFrom);
                }
                if (customDateTo && matchesDate) {
                    const end = new Date(customDateTo);
                    end.setHours(23, 59, 59, 999);
                    matchesDate = dealDate <= end;
                }
            } else {
                const range = getDateRange(datePreset);
                if (range.from && range.to) {
                    matchesDate = dealDate >= range.from && dealDate <= range.to;
                }
            }
        }

        return matchesSearch && matchesStatus && matchesAgent && matchesDate;
    });

    // Dynamic stats computed from filtered results
    const filteredStats = {
        count: filteredDeals.length,
        totalAmount: filteredDeals.reduce((sum, d) => sum + (d.amount || 0), 0),
        wonCount: filteredDeals.filter(d => d.status === 'WON').length,
    };
    const conversionRate = filteredDeals.length > 0
        ? ((filteredStats.wonCount / filteredDeals.length) * 100).toFixed(1)
        : 0;

    // Build externalProfile for ContactSidebar
    const sidebarProfile = selectedDeal?.contact ? {
        id: selectedDeal.contact.id,
        name: selectedDeal.contact.name || selectedDeal.contact.fullName,
        email: selectedDeal.contact.email,
        phone: selectedDeal.contact.phone,
        company: selectedDeal.contact.company,
        tags: selectedDeal.contact.tags || [],
    } : null;

    return (
        <div className="sales-inbox-layout" ref={layoutRef}>
            {/* ── LEFT PANEL: Order List ── */}
            <div className="sales-list-panel" style={{ width: `${panelWidth}px` }}>
                <div className="sales-list-panel-header">
                    <div className="sales-list-panel-header-row">
                        <h2>Siparişler <span className="sales-count">{filteredStats.count}</span></h2>
                        <button className="btn-primary btn-sm" onClick={() => { resetForm(); setShowForm(true); }}>
                            <Plus size={15} /> Yeni
                        </button>
                    </div>

                    {/* Search */}
                    <div className="sales-list-panel-search">
                        <Search size={15} />
                        <input
                            type="text"
                            placeholder="Sipariş, müşteri veya protokol ara..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Filters */}
                    <div className="sales-list-panel-filters">
                        <div className="sales-list-panel-filter-row">
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                            >
                                <option value="ALL">Tüm Durumlar</option>
                                <option value="OPEN">Açık</option>
                                <option value="WON">Tamamlandı</option>
                                <option value="LOST">İptal</option>
                            </select>
                            {!isAgent && (
                                <select
                                    value={agentFilter}
                                    onChange={(e) => setAgentFilter(e.target.value)}
                                >
                                    <option value="ALL">Tüm Temsilciler</option>
                                    {users.map(u => (
                                        <option key={u.user?.id || u.userId} value={u.user?.id || u.userId}>
                                            {u.user?.name || u.name}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                        <div className="sales-date-presets">
                            {[
                                { key: 'ALL', label: 'Tümü' },
                                { key: 'TODAY', label: 'Bugün' },
                                { key: 'YESTERDAY', label: 'Dün' },
                                { key: 'THIS_WEEK', label: 'Bu Hafta' },
                                { key: 'THIS_MONTH', label: 'Bu Ay' },
                                { key: 'CUSTOM', label: 'Özel' },
                            ].map(p => (
                                <button
                                    key={p.key}
                                    className={`sales-date-preset-btn ${datePreset === p.key ? 'active' : ''}`}
                                    onClick={() => { setDatePreset(p.key); if (p.key !== 'CUSTOM') { setCustomDateFrom(''); setCustomDateTo(''); } }}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                        {datePreset === 'CUSTOM' && (
                            <div className="sales-custom-date-row">
                                <input
                                    type="date"
                                    value={customDateFrom}
                                    onChange={(e) => setCustomDateFrom(e.target.value)}
                                    className="sales-filter-date"
                                />
                                <span className="sales-date-sep">—</span>
                                <input
                                    type="date"
                                    value={customDateTo}
                                    onChange={(e) => setCustomDateTo(e.target.value)}
                                    className="sales-filter-date"
                                />
                            </div>
                        )}

                        {/* Stats Row - after filters, updates dynamically */}
                        <div className="sales-list-stats">
                            <div className="sales-list-stat">
                                <span className="sls-value">{filteredStats.count}</span>
                                <span className="sls-label">SİPARİŞ</span>
                            </div>
                            <div className="sales-list-stat">
                                <span className="sls-value">{formatCurrency(filteredStats.totalAmount)}</span>
                                <span className="sls-label">TUTAR</span>
                            </div>
                            <div className="sales-list-stat">
                                <span className="sls-value">{conversionRate}%</span>
                                <span className="sls-label">DÖNÜŞÜM</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Card List */}
                <div className="sales-list-panel-body">
                    {loading ? (
                        <div className="loading-state">Yükleniyor...</div>
                    ) : filteredDeals.length === 0 ? (
                        <div className="empty-state">
                            <ShoppingCart size={40} />
                            <h3>{t('sales.noOrders')}</h3>
                            <p>"Yeni" butonuna tıklayarak sipariş oluşturabilirsiniz</p>
                        </div>
                    ) : (
                        filteredDeals.map(deal => (
                            <div
                                key={deal.id}
                                className={`sales-list-card ${selectedDeal?.id === deal.id ? 'selected' : ''} ${(deal.status || '').toLowerCase()}`}
                                onClick={() => setSelectedDeal(deal)}
                            >
                                <div className="sales-list-card-top">
                                    <span className="sales-list-card-number">{deal.orderNumber}</span>
                                    <span className={`sales-list-card-badge ${(deal.status || '').toLowerCase()}`}>
                                        {deal.status === 'OPEN' ? 'Açık' : deal.status === 'WON' ? 'Tamamlandı' : 'İptal'}
                                    </span>
                                </div>
                                {deal.protocolNo && (
                                    <div className="sales-list-card-protocol">
                                        📁 Protokol: {deal.protocolNo}
                                    </div>
                                )}
                                <div className="sales-list-card-title">{deal.title}</div>
                                <div className="sales-list-card-customer">👤 {deal.contact?.name || deal.contact?.fullName}</div>
                                <div className="sales-list-card-bottom">
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        <span className="sales-list-card-amount">{formatCurrency(deal.amount, deal.currency)}</span>
                                        {deal.assignedTo && (
                                            <span className="sales-list-card-agent">
                                                <User size={11} /> {deal.assignedTo.name}
                                            </span>
                                        )}
                                    </div>
                                    <span className="sales-list-card-date">{new Date(deal.orderCreatedAt || deal.createdAt).toLocaleDateString('tr-TR')}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Sürüklenebilir Kenarlık */}
            <div
                className="sales-resizer"
                onMouseDown={handleMouseDown}
                title="Genişliği ayarlamak için sürükleyin"
            />

            {/* ── MIDDLE PANEL: Detail ── */}
            <div className="sales-detail-panel">
                {/* Detail content or empty state */}
                {!selectedDeal ? (
                    <div className="sales-detail-empty">
                        <ShoppingCart size={56} />
                        <h3>Sipariş Seçin</h3>
                        <p>Detayları görüntülemek için soldan bir sipariş seçin</p>
                    </div>
                ) : (
                    <>
                        {/* Order Header Card */}
                        <div className="sales-detail-card">
                            <div className="detail-header">
                                <h2>{selectedDeal.title}</h2>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <button
                                        type="button"
                                        className="btn-outline btn-sm"
                                        style={{ fontSize: '11px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        onClick={() => setShowRightSidebar(!showRightSidebar)}
                                        title={showRightSidebar ? 'Kişi Panelini Gizle' : 'Kişi Panelini Göster'}
                                    >
                                        <User size={13} />
                                        {showRightSidebar ? 'Kişiyi Gizle ❯' : '❮ Kişiyi Göster'}
                                    </button>
                                    <button className="btn-icon" onClick={() => setSelectedDeal(null)}>
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>

                            <div className="detail-info">
                                <div className="info-row">
                                    <span className="label">{t('sales.orderNo')}</span>
                                    <span className="value">{selectedDeal.orderNumber}</span>
                                </div>
                                {selectedDeal.quoteNumber && (
                                    <div className="info-row">
                                        <span className="label">Teklif No:</span>
                                        <span className="value">{selectedDeal.quoteNumber}</span>
                                    </div>
                                )}
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
                                        <option value="WON">Tamamlandı</option>
                                        <option value="LOST">İptal</option>
                                    </select>
                                </div>
                                <div className="info-row">
                                    <span className="label">Tarih:</span>
                                    <span className="value">{new Date(selectedDeal.orderCreatedAt || selectedDeal.createdAt).toLocaleDateString('tr-TR')}</span>
                                </div>
                                {/* Kaynak: Case'den veya kişiden otomatik devralınır — değiştirilemez */}
                                <div className="info-row">
                                    <span className="label">Kaynak:</span>
                                    <DealSourceSelect deal={selectedDeal} />
                                </div>
                                {selectedDeal.sourceNote && (
                                    <div className="info-row">
                                        <span className="label">Kaynak Detayı:</span>
                                        <span className="value" style={{ fontSize: '0.82rem', color: '#64748b' }}>{selectedDeal.sourceNote}</span>
                                    </div>
                                )}
                                {/* Kişinin ilk kaynağı — her zaman gösterilir */}
                                {selectedDeal.contact?.source && (
                                    <div className="info-row" style={{ opacity: 0.55 }}>
                                        <span className="label">Kişi İlk Kaynağı:</span>
                                        <span className="value" style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                            {sourceIcon(selectedDeal.contact.source)} {sourceLabel(selectedDeal.contact.source)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Products Card */}
                        <div className="sales-detail-card">
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
                        </div>

                        {/* Notes Card */}
                        {selectedDeal.notes && (
                            <div className="sales-detail-card">
                                <div className="detail-notes">
                                    <h4>Notlar</h4>
                                    <p>{selectedDeal.notes}</p>
                                </div>
                            </div>
                        )}

                        {/* Actions Card */}
                        <div className="sales-detail-card">
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
                                        onClick={() => handleConvertToInvoice(selectedDeal.id)}
                                    >
                                        <ArrowRight size={16} />
                                        Faturaya Dönüştür
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
                )}


            </div>

            {/* ── RIGHT PANEL: Contact Sidebar ── */}
            {showRightSidebar && (
                <div className="sales-sidebar-panel">
                    {sidebarProfile ? (
                        <ContactSidebar
                            externalProfile={sidebarProfile}
                            isOpen={true}
                            readOnly={true}
                        />
                    ) : (
                        <div className="sales-detail-empty" style={{ padding: '40px 20px' }}>
                            <User size={40} />
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Müşteri bilgisi görüntülemek için bir sipariş seçin</p>
                        </div>
                    )}
                </div>
            )}

            {/* Create/Edit Form Modal */}
            {showForm && (
                <div className="modal-overlay" onClick={closeForm}>
                    <div className="modal-content deal-form" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingDeal ? 'Siparişi Düzenle' : 'Yeni Sipariş Oluştur'}</h2>
                            <button className="btn-icon" onClick={closeForm}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveOrder}>
                            <div className="form-group" style={{ position: 'relative' }}>
                                <label>{t('sales.customerLabel')}</label>
                                <input
                                    type="text"
                                    placeholder="Müşteri adı, telefon veya e-posta ile ara..."
                                    value={contactSearch}
                                    onChange={(e) => {
                                        setContactSearch(e.target.value);
                                        setShowContactDropdown(true);
                                        if (!e.target.value) setFormData({ ...formData, contactId: '' });
                                    }}
                                    onFocus={() => setShowContactDropdown(true)}
                                    autoComplete="off"
                                    style={{ borderColor: formData.contactId ? '#10b981' : undefined }}
                                />
                                {formData.contactId && (
                                    <span style={{ position: 'absolute', right: 12, top: 38, fontSize: '13px', color: '#10b981', pointerEvents: 'none' }}>✓</span>
                                )}
                                <input type="hidden" required value={formData.contactId} />
                                {showContactDropdown && contactSearch.length > 0 && (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                                        background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0 0 10px 10px',
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto'
                                    }}>
                                        {contacts
                                            .filter(c => {
                                                const q = contactSearch.toLowerCase();
                                                return (c.name || '').toLowerCase().includes(q) ||
                                                    (c.fullName || '').toLowerCase().includes(q) ||
                                                    (c.email || '').toLowerCase().includes(q) ||
                                                    (c.phone || '').includes(q);
                                            })
                                            .slice(0, 20)
                                            .map(c => (
                                                <div
                                                    key={c.id}
                                                    onClick={() => {
                                                        setFormData({ ...formData, contactId: c.id });
                                                        setContactSearch(c.name || c.fullName || c.email || c.phone);
                                                        setShowContactDropdown(false);
                                                    }}
                                                    style={{
                                                        padding: '10px 14px', cursor: 'pointer', fontSize: '0.88rem',
                                                        borderBottom: '1px solid #f1f5f9',
                                                        background: formData.contactId === c.id ? '#f0fdf4' : '#fff',
                                                        transition: 'background 0.1s'
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                    onMouseLeave={e => e.currentTarget.style.background = formData.contactId === c.id ? '#f0fdf4' : '#fff'}
                                                >
                                                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{c.name || c.fullName || '—'}</div>
                                                    <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: 2 }}>
                                                        {c.phone && <span>{c.phone}</span>}
                                                        {c.phone && c.email && <span> · </span>}
                                                        {c.email && <span>{c.email}</span>}
                                                    </div>
                                                </div>
                                            ))
                                        }
                                        {contacts.filter(c => {
                                            const q = contactSearch.toLowerCase();
                                            return (c.name || '').toLowerCase().includes(q) ||
                                                (c.fullName || '').toLowerCase().includes(q) ||
                                                (c.email || '').toLowerCase().includes(q) ||
                                                (c.phone || '').includes(q);
                                        }).length === 0 && (
                                            <div style={{ padding: '14px', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>
                                                Sonuç bulunamadı
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {!isAgent && (
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
                            )}

                            <div className="form-group">
                                <label>Sipariş Başlığı *</label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    placeholder="Örn: Aylık Hizmet Paketi"
                                    required
                                />
                            </div>

                            {showProtocolNo && (
                                <div className="form-group">
                                    <label>Protokol No</label>
                                    <input
                                        type="text"
                                        value={formData.protocolNo}
                                        onChange={(e) => setFormData({ ...formData, protocolNo: e.target.value })}
                                        placeholder="Örn: 320775"
                                    />
                                </div>
                            )}

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
                                    <div key={index} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', marginBottom: '10px', background: '#fafbfc' }}>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: product.description || product.tax1Rate ? '8px' : 0 }}>
                                            <div style={{ position: 'relative', flex: 2 }}>
                                                <input
                                                    type="text"
                                                    placeholder="Ürün adı yazın veya seçin"
                                                    value={product.name}
                                                    onChange={(e) => updateProduct(index, 'name', e.target.value)}
                                                    list={`order-product-list-${index}`}
                                                    style={{ width: '100%' }}
                                                />
                                                <datalist id={`order-product-list-${index}`}>
                                                    {catalogProducts.filter(cp => cp.name.toLowerCase().includes((product.name || '').toLowerCase())).map(cp => (
                                                        <option key={cp.id} value={cp.name} label={`${cp.name} - ₺${cp.price}`} />
                                                    ))}
                                                </datalist>
                                            </div>
                                            <input
                                                type="number"
                                                placeholder="Adet"
                                                value={product.quantity}
                                                onChange={(e) => updateProduct(index, 'quantity', e.target.value)}
                                                min="1"
                                                style={{ width: '70px' }}
                                            />
                                            <input
                                                type="number"
                                                placeholder="Birim Fiyat"
                                                value={product.unitPrice}
                                                onChange={(e) => updateProduct(index, 'unitPrice', e.target.value)}
                                                min="0"
                                                style={{ width: '100px' }}
                                            />
                                            <span className="product-total" style={{ minWidth: '70px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                                                {formatCurrency(product.quantity * product.unitPrice, formData.currency)}
                                            </span>
                                            {formData.products.length > 1 && (
                                                <button type="button" className="btn-icon-sm" onClick={() => removeProduct(index)}>
                                                    <X size={16} />
                                                </button>
                                            )}
                                        </div>
                                        {(product.description || product.discountedPrice || product.tax1Rate > 0) && (
                                            <div style={{ background: '#f1f5f9', borderRadius: '8px', padding: '10px 12px', fontSize: '0.78rem', color: '#475569' }}>
                                                {product.description && (
                                                    <div style={{ marginBottom: '4px' }}><span style={{ fontWeight: 600, color: '#334155' }}>Açıklama:</span> {product.description}</div>
                                                )}
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '4px' }}>
                                                    {product.discountedPrice > 0 && (
                                                        <div>
                                                            <span style={{ fontWeight: 600, color: '#334155' }}>İndirimli:</span>{' '}
                                                            <span style={{ color: '#dc2626', fontWeight: 700, textDecoration: 'line-through', marginRight: '4px' }}>
                                                                {formatCurrency(product.unitPrice, formData.currency)}
                                                            </span>
                                                            <span style={{ color: '#16a34a', fontWeight: 700 }}>
                                                                {formatCurrency(product.discountedPrice, formData.currency)}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {product.tax1Rate > 0 && (
                                                        <div>
                                                            <span style={{ fontWeight: 600, color: '#334155' }}>KDV:</span>{' '}
                                                            <span style={{ fontWeight: 700, color: '#6366f1' }}>%{product.tax1Rate}</span>
                                                            <span style={{ marginLeft: '6px', fontWeight: 600, color: '#334155' }}>
                                                                ({formatCurrency((product.discountedPrice || product.unitPrice) * product.quantity * product.tax1Rate / 100, formData.currency)})
                                                            </span>
                                                        </div>
                                                    )}
                                                    {product.tax1Rate > 0 && (
                                                        <div>
                                                            <span style={{ fontWeight: 600, color: '#334155' }}>KDV Dahil:</span>{' '}
                                                            <span style={{ fontWeight: 800, color: '#059669' }}>
                                                                {formatCurrency(
                                                                    (product.discountedPrice || product.unitPrice) * product.quantity * (1 + product.tax1Rate / 100),
                                                                    formData.currency
                                                                )}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                <button type="button" className="btn-secondary btn-sm" onClick={addProduct}>
                                    <Plus size={16} /> Ürün Ekle
                                </button>
                                <div className="products-total" style={{ marginTop: '8px' }}>
                                    {(() => {
                                        const subtotal = formData.products.reduce((sum, p) => sum + ((p.discountedPrice || p.unitPrice) * p.quantity), 0);
                                        const totalTax = formData.products.reduce((sum, p) => sum + ((p.discountedPrice || p.unitPrice) * p.quantity * (p.tax1Rate || 0) / 100), 0);
                                        const grandTotal = subtotal + totalTax;
                                        return (
                                            <div style={{ textAlign: 'right', fontSize: '0.85rem' }}>
                                                <div style={{ color: '#64748b' }}>Ara Toplam: {formatCurrency(subtotal, formData.currency)}</div>
                                                {totalTax > 0 && <div style={{ color: '#6366f1' }}>KDV: {formatCurrency(totalTax, formData.currency)}</div>}
                                                <div style={{ fontWeight: 800, fontSize: '1rem', color: '#1e293b', marginTop: '2px' }}>
                                                    Genel Toplam: {formatCurrency(grandTotal, formData.currency)}
                                                </div>
                                            </div>
                                        );
                                    })()}
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
                                    {editingDeal ? 'Güncelle' : 'Sipariş Oluştur'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Orders;
