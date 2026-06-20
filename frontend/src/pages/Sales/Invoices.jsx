import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { dealAPI, contactAPI, workspaceAPI } from '../../services/api';
import {
    Search, TrendingUp, FileText, X, Trash2, Receipt,
    Download, Plus, AlertCircle, CheckCircle, Clock, CreditCard
} from 'lucide-react';
import './Sales.css';

const Invoices = () => {
    const { t } = useTranslation();
    const { currentWorkspace } = useAuth();
    const [deals, setDeals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedDeal, setSelectedDeal] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [stats, setStats] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [editingDeal, setEditingDeal] = useState(null);
    const [contacts, setContacts] = useState([]);
    const [activeTab, setActiveTab] = useState('invoices'); // 'invoices' | 'settings'
    const [companyInfo, setCompanyInfo] = useState(null);
    const [settingsForm, setSettingsForm] = useState({
        companyName: '', companyAddress: '', companyPhone: '',
        companyEmail: '', companyWebsite: '',
        invoiceTaxOffice: '', invoiceTaxNumber: '', invoiceIban: ''
    });
    const [settingsSaving, setSettingsSaving] = useState(false);

    // Payment modal
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentForm, setPaymentForm] = useState({ paidAmount: '', paymentDate: new Date().toISOString().split('T')[0], notes: '' });
    const [paymentLoading, setPaymentLoading] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        contactId: '',
        title: '',
        description: '',
        currency: 'TRY',
        vatRate: 20,
        dueDate: '',
        products: [{ name: '', quantity: 1, unitPrice: 0 }],
        notes: ''
    });

    useEffect(() => {
        if (currentWorkspace?.id) {
            fetchDeals();
            fetchStats();
            fetchContacts();
            fetchCompanyInfo();
        }
    }, [currentWorkspace?.id]);

    const fetchDeals = async () => {
        try {
            setLoading(true);
            const response = await dealAPI.getAll(currentWorkspace.id, { stage: 'INVOICE', limit: 9999 });
            setDeals(response.data.deals || []);
        } catch (error) {
            console.error('Failed to fetch invoices:', error);
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

    const fetchCompanyInfo = async () => {
        try {
            const response = await workspaceAPI.getCompanyInfo(currentWorkspace.id);
            const info = response.data.companyInfo || {};
            setCompanyInfo(info);
            setSettingsForm({
                companyName: info.companyName || '',
                companyAddress: info.companyAddress || '',
                companyPhone: info.companyPhone || '',
                companyEmail: info.companyEmail || '',
                companyWebsite: info.companyWebsite || '',
                invoiceTaxOffice: info.invoiceTaxOffice || '',
                invoiceTaxNumber: info.invoiceTaxNumber || '',
                invoiceIban: info.invoiceIban || ''
            });
        } catch (err) {
            console.error('Failed to fetch company info:', err);
        }
    };

    const handleSaveSettings = async (e) => {
        e.preventDefault();
        setSettingsSaving(true);
        try {
            const response = await workspaceAPI.updateCompanyInfo(currentWorkspace.id, settingsForm);
            const info = response.data.companyInfo;
            setCompanyInfo(info);
            alert('✅ Fatura ayarları kaydedildi.');
        } catch (err) {
            console.error('Failed to save settings:', err);
            alert('Ayarlar kaydedilemedi.');
        } finally {
            setSettingsSaving(false);
        }
    };

    const handleLogoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new window.FormData();
        formData.append('logo', file);
        try {
            const response = await workspaceAPI.uploadCompanyLogo(currentWorkspace.id, formData);
            const info = response.data.companyInfo;
            setCompanyInfo(prev => ({ ...prev, companyLogo: info.companyLogo }));
            alert('✅ Logo yüklendi.');
        } catch (err) {
            console.error('Logo upload error:', err);
            alert('Logo yüklenemedi.');
        }
    };

    const handleCreateInvoice = async (e) => {
        e.preventDefault();
        try {
            const baseAmount = formData.products.reduce((sum, p) => sum + (p.quantity * p.unitPrice), 0);
            const productsWithTotal = formData.products.map(p => ({
                ...p,
                total: p.quantity * p.unitPrice
            }));

            await dealAPI.create(currentWorkspace.id, {
                ...formData,
                amount: baseAmount,
                products: productsWithTotal,
                stage: 'INVOICE',
                vatRate: parseFloat(formData.vatRate) || 0,
                dueDate: formData.dueDate || null
            });

            setShowForm(false);
            resetForm();
            fetchDeals();
            fetchStats();
        } catch (error) {
            console.error('Failed to create invoice:', error);
            alert('Error creating invoice');
        }
    };

    const handleUpdateInvoice = async (e) => {
        e.preventDefault();
        if (!editingDeal) return;
        try {
            const baseAmount = formData.products.reduce((sum, p) => sum + (p.quantity * p.unitPrice), 0);
            const productsWithTotal = formData.products.map(p => ({
                ...p,
                total: p.quantity * p.unitPrice
            }));
            const updated = await dealAPI.update(currentWorkspace.id, editingDeal.id, {
                ...formData,
                amount: baseAmount,
                products: productsWithTotal,
                vatRate: parseFloat(formData.vatRate) || 0,
                dueDate: formData.dueDate || null
            });
            setShowForm(false);
            setEditingDeal(null);
            resetForm();
            fetchDeals();
            fetchStats();
            // Refresh selectedDeal if it was the one edited
            if (selectedDeal?.id === editingDeal.id) {
                setSelectedDeal(updated.data?.deal || null);
            }
        } catch (error) {
            console.error('Failed to update invoice:', error);
            alert('Fatura güncellenemedi');
        }
    };

    const openEditForm = (deal) => {
        const products = deal.products?.length > 0
            ? deal.products.map(p => ({ name: p.name || '', quantity: p.quantity || 1, unitPrice: p.unitPrice || 0 }))
            : [{ name: '', quantity: 1, unitPrice: 0 }];
        setFormData({
            contactId: deal.contactId || deal.contact?.id || '',
            title: deal.title || '',
            description: deal.description || '',
            currency: deal.currency || 'TRY',
            vatRate: deal.vatRate ?? 20,
            dueDate: deal.dueDate ? new Date(deal.dueDate).toISOString().split('T')[0] : '',
            products,
            notes: deal.notes || ''
        });
        setEditingDeal(deal);
        setShowForm(true);
    };

    const handleDeleteDeal = async (dealId) => {
        if (!confirm('Bu faturayı silmek istediğinize emin misiniz?')) return;
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
            // Update selected deal too
            setSelectedDeal(prev => prev?.id === dealId ? { ...prev, status, effectiveStatus: status } : prev);
        } catch (error) {
            console.error('Failed to update status:', error);
        }
    };

    const handleRecordPayment = async (e) => {
        e.preventDefault();
        if (!selectedDeal) return;
        setPaymentLoading(true);
        try {
            const response = await dealAPI.recordPayment(currentWorkspace.id, selectedDeal.id, {
                paidAmount: parseFloat(paymentForm.paidAmount),
                paymentDate: paymentForm.paymentDate,
                notes: paymentForm.notes
            });
            const { deal, isFullyPaid, remainingAmount } = response.data;
            setShowPaymentModal(false);
            setPaymentForm({ paidAmount: '', paymentDate: new Date().toISOString().split('T')[0], notes: '' });
            fetchDeals();
            fetchStats();
            setSelectedDeal(deal);
            if (isFullyPaid) {
                alert(`✅ Fatura tamamen ödendi!`);
            } else {
                alert(`✅ Ödeme kaydedildi. Kalan: ${formatCurrency(remainingAmount, deal.currency)}`);
            }
        } catch (error) {
            console.error('Payment error:', error);
            alert('Ödeme kaydedilemedi');
        } finally {
            setPaymentLoading(false);
        }
    };

    const handlePrint = (deal) => {
        const printWindow = window.open('', '_blank');
        const products = deal.products || [];
        const base = deal.amount;
        const vatAmount = base * ((deal.vatRate || 0) / 100) / (1 + (deal.vatRate || 0) / 100);
        const subtotal = base - vatAmount;
        const apiBase = import.meta.env.VITE_API_URL?.startsWith('http') 
            ? import.meta.env.VITE_API_URL 
            : window.location.origin + '/api';
        const logoUrl = companyInfo?.companyLogo ? `${apiBase}${companyInfo.companyLogo}` : null;
        const coName = companyInfo?.companyName || 'Instomer';
        const coAddress = companyInfo?.companyAddress || '';
        const coPhone = companyInfo?.companyPhone || '';
        const coEmail = companyInfo?.companyEmail || '';
        const taxOffice = companyInfo?.invoiceTaxOffice || '';
        const taxNumber = companyInfo?.invoiceTaxNumber || '';
        const iban = companyInfo?.invoiceIban || '';

        printWindow.document.write(`
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Fatura - ${deal.invoiceNumber}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #1a1a1a; }
    .header { display: flex; justify-content: space-between; margin-bottom: 40px; border-bottom: 2px solid #3b82f6; padding-bottom: 20px; }
    .company { font-size: 24px; font-weight: bold; color: #3b82f6; }
    .invoice-info { text-align: right; }
    .invoice-title { font-size: 28px; font-weight: bold; color: #1a1a1a; }
    .invoice-number { color: #6b7280; font-size: 14px; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .party h4 { color: #6b7280; font-size: 12px; text-transform: uppercase; margin-bottom: 5px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #f3f4f6; padding: 10px; text-align: left; font-size: 12px; text-transform: uppercase; }
    td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
    .totals { margin-left: auto; width: 300px; }
    .total-row { display: flex; justify-content: space-between; padding: 5px 0; }
    .total-final { font-weight: bold; font-size: 18px; border-top: 2px solid #1a1a1a; padding-top: 8px; margin-top: 8px; }
    .status-paid { color: #10b981; font-weight: bold; font-size: 20px; text-align: right; margin-top: 10px; }
    .due-date { margin-top: 20px; padding: 10px; background: #fef3c7; border-radius: 6px; font-size: 12px; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    ${logoUrl ? `<img src="${logoUrl}" alt="Logo" style="max-height:70px;max-width:200px;object-fit:contain;">` : `<div class="company">${coName}</div>`}
    <div class="invoice-info">
      <div class="invoice-title">FATURA</div>
      <div class="invoice-number">${deal.invoiceNumber}</div>
      <div style="margin-top:5px;font-size:12px;color:#6b7280">
        Tarih: ${new Date(deal.invoiceCreatedAt || deal.createdAt).toLocaleDateString('tr-TR')}
      </div>
    </div>
  </div>
  <div class="parties">
    <div class="party">
      <h4>Gönderen</h4>
      <strong>${coName}</strong><br/>
      ${coAddress ? `<span>${coAddress}</span><br/>` : ''}
      ${coPhone ? `<span>${coPhone}</span><br/>` : ''}
      ${coEmail ? `<span>${coEmail}</span><br/>` : ''}
      ${taxOffice ? `<span>Vergi Dairesi: ${taxOffice}</span><br/>` : ''}
      ${taxNumber ? `<span>Vergi No: ${taxNumber}</span><br/>` : ''}
    </div>
    <div class="party" style="text-align:right">
      <h4>Faturalandırılan</h4>
      <strong>${deal.contact?.name || deal.contact?.fullName || '-'}</strong><br/>
      ${deal.contact?.email ? `<span>${deal.contact.email}</span><br/>` : ''}
      ${deal.contact?.phone ? `<span>${deal.contact.phone}</span>` : ''}
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Ürün / Hizmet</th>
        <th style="text-align:center">Adet</th>
        <th style="text-align:right">Birim Fiyat</th>
        <th style="text-align:right">Toplam</th>
      </tr>
    </thead>
    <tbody>
      ${products.map(p => `
        <tr>
          <td>${p.name}</td>
          <td style="text-align:center">${p.quantity}</td>
          <td style="text-align:right">${formatCurrency(p.unitPrice, deal.currency)}</td>
          <td style="text-align:right">${formatCurrency(p.total || p.quantity * p.unitPrice, deal.currency)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <div class="totals">
    ${deal.vatRate > 0 ? `
    <div class="total-row"><span>Ara Toplam:</span><span>${formatCurrency(subtotal, deal.currency)}</span></div>
    <div class="total-row"><span>KDV (%${deal.vatRate}):</span><span>${formatCurrency(vatAmount, deal.currency)}</span></div>
    ` : ''}
    <div class="total-row total-final"><span>GENEL TOPLAM:</span><span>${formatCurrency(base, deal.currency)}</span></div>
    ${deal.paidAmount > 0 ? `<div class="total-row" style="color:#10b981"><span>Ödenen:</span><span>${formatCurrency(deal.paidAmount, deal.currency)}</span></div>` : ''}
  </div>
  ${deal.status === 'WON' ? '<div class="status-paid">✅ ÖDENDİ</div>' : ''}
  ${deal.dueDate ? `<div class="due-date">⏰ Son Ödeme Tarihi: <strong>${new Date(deal.dueDate).toLocaleDateString('tr-TR')}</strong></div>` : ''}
  ${iban ? `<div style="margin-top:15px;padding:10px;background:#f0f9ff;border-radius:6px;font-size:12px"><strong>IBAN:</strong> ${iban}</div>` : ''}
  ${deal.notes ? `<div style="margin-top:20px;font-size:12px;color:#6b7280"><strong>Notlar:</strong> ${deal.notes}</div>` : ''}
</body>
</html>`);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 500);
    };

    const resetForm = () => {
        setFormData({
            contactId: '',
            title: '',
            description: '',
            currency: 'TRY',
            vatRate: 20,
            dueDate: '',
            products: [{ name: '', quantity: 1, unitPrice: 0 }],
            notes: ''
        });
    };

    const addProduct = () => {
        setFormData({ ...formData, products: [...formData.products, { name: '', quantity: 1, unitPrice: 0 }] });
    };

    const removeProduct = (index) => {
        setFormData({ ...formData, products: formData.products.filter((_, i) => i !== index) });
    };

    const updateProduct = (index, field, value) => {
        const newProducts = [...formData.products];
        newProducts[index][field] = field === 'quantity' || field === 'unitPrice' ? parseFloat(value) || 0 : value;
        setFormData({ ...formData, products: newProducts });
    };

    const formatCurrency = (amount, currency = 'TRY') => {
        const symbols = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' };
        return `${symbols[currency] || ''}${(amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const getEffectiveStatus = (deal) => {
        if (deal.effectiveStatus) return deal.effectiveStatus;
        if (deal.status === 'WON' || deal.status === 'LOST') return deal.status;
        if (deal.dueDate && new Date(deal.dueDate) < new Date() && deal.status === 'OPEN') return 'OVERDUE';
        return deal.status;
    };

    const getStatusBadge = (deal) => {
        const eff = getEffectiveStatus(deal);
        if (eff === 'WON') return <span className="deal-status won"><CheckCircle size={12} /> Ödendi</span>;
        if (eff === 'OVERDUE') return <span className="deal-status overdue"><AlertCircle size={12} /> Gecikmiş</span>;
        if (eff === 'LOST') return <span className="deal-status lost"><X size={12} /> İptal</span>;
        return <span className="deal-status open"><Clock size={12} /> Bekliyor</span>;
    };

    const baseAmount = formData.products.reduce((sum, p) => sum + (p.quantity * p.unitPrice), 0);
    const vatAmount = baseAmount * ((formData.vatRate || 0) / 100);
    const totalWithVat = baseAmount + vatAmount;

    const filteredDeals = deals.filter(deal =>
        deal.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        deal.contact?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        deal.invoiceNumber?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const invoiceStats = stats?.stageStats?.find(s => s.stage === 'INVOICE') || { count: 0, totalAmount: 0 };

    return (
        <div className="sales-page">
            {/* Header */}
            <div className="sales-header">
                <div className="sales-header-left">
                    <h1>Faturalar</h1>
                    <span className="sales-count">{invoiceStats.count} fatura</span>
                </div>
                <div className="sales-header-right">
                    <button className="btn-primary" onClick={() => setShowForm(true)}>
                        <Plus size={18} />
                        Yeni Fatura
                    </button>
                </div>
            </div>

            {/* Tab Bar */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #e5e7eb', paddingBottom: 0 }}>
                <button
                    onClick={() => setActiveTab('invoices')}
                    style={{ padding: '8px 18px', background: 'none', border: 'none', borderBottom: activeTab === 'invoices' ? '2px solid #3b82f6' : '2px solid transparent', fontWeight: activeTab === 'invoices' ? 700 : 400, color: activeTab === 'invoices' ? '#3b82f6' : '#6b7280', cursor: 'pointer', marginBottom: -2 }}
                >
                    Faturalar
                </button>
                <button
                    onClick={() => setActiveTab('settings')}
                    style={{ padding: '8px 18px', background: 'none', border: 'none', borderBottom: activeTab === 'settings' ? '2px solid #3b82f6' : '2px solid transparent', fontWeight: activeTab === 'settings' ? 700 : 400, color: activeTab === 'settings' ? '#3b82f6' : '#6b7280', cursor: 'pointer', marginBottom: -2 }}
                >
                    ⚙️ Fatura Ayarları
                </button>
            </div>
            {activeTab === 'invoices' && (
            <>
            <div className="sales-stats">
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
                        <Receipt size={20} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-value">{invoiceStats.count}</span>
                        <span className="stat-label">Toplam Fatura</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                        <CheckCircle size={20} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-value">{formatCurrency(stats?.paidTotal || 0)}</span>
                        <span className="stat-label">Tahsil Edilen</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                        <AlertCircle size={20} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-value">{stats?.overdueCount || 0}</span>
                        <span className="stat-label">Gecikmiş Fatura</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon amount"><TrendingUp size={20} /></div>
                    <div className="stat-info">
                        <span className="stat-value">{formatCurrency(invoiceStats.totalAmount)}</span>
                        <span className="stat-label">Toplam Tutar</span>
                    </div>
                </div>
            </div>

            {/* Search */}
            <div className="sales-toolbar">
                <div className="search-box">
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder="Fatura, müşteri veya numara ara..."
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
                            <Receipt size={48} />
                            <h3>Henüz fatura yok</h3>
                            <p>Yeni fatura oluşturmak için "Yeni Fatura" butonuna tıklayın</p>
                        </div>
                    ) : (
                        filteredDeals.map(deal => {
                            const eff = getEffectiveStatus(deal);
                            return (
                                <div
                                    key={deal.id}
                                    className={`deal-card ${selectedDeal?.id === deal.id ? 'selected' : ''} ${eff.toLowerCase()}`}
                                    onClick={() => setSelectedDeal(deal)}
                                >
                                    <div className="deal-card-header">
                                        <span className="deal-number">{deal.invoiceNumber}</span>
                                        {getStatusBadge(deal)}
                                    </div>
                                    <h3 className="deal-title">{deal.title}</h3>
                                    <p className="deal-contact">{deal.contact?.name || deal.contact?.fullName}</p>
                                    <div className="deal-footer">
                                        <span className="deal-amount">{formatCurrency(deal.amount, deal.currency)}</span>
                                        {deal.dueDate && (
                                            <span className={`deal-due-date ${eff === 'OVERDUE' ? 'overdue' : ''}`}>
                                                {eff === 'OVERDUE' ? '⚠️' : '📅'} {new Date(deal.dueDate).toLocaleDateString('tr-TR')}
                                            </span>
                                        )}
                                    </div>
                                    {deal.paidAmount > 0 && deal.status !== 'WON' && (
                                        <div className="deal-partial-payment">
                                            <div className="payment-progress">
                                                <div
                                                    className="payment-bar"
                                                    style={{ width: `${Math.min(100, (deal.paidAmount / deal.amount) * 100)}%` }}
                                                />
                                            </div>
                                            <span>{formatCurrency(deal.paidAmount)} / {formatCurrency(deal.amount)}</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })
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
                                <span className="label">Fatura No:</span>
                                <span className="value">{selectedDeal.invoiceNumber}</span>
                            </div>
                            <div className="info-row">
                                <span className="label">Müşteri:</span>
                                <span className="value">{selectedDeal.contact?.name || selectedDeal.contact?.fullName}</span>
                            </div>
                            <div className="info-row">
                                <span className="label">Toplam:</span>
                                <span className="value amount">{formatCurrency(selectedDeal.amount, selectedDeal.currency)}</span>
                            </div>
                            {selectedDeal.vatRate > 0 && (
                                <div className="info-row">
                                    <span className="label">KDV (%{selectedDeal.vatRate}):</span>
                                    <span className="value">Dahil</span>
                                </div>
                            )}
                            <div className="info-row">
                                <span className="label">Ödenen:</span>
                                <span className="value" style={{ color: '#10b981', fontWeight: '600' }}>
                                    {formatCurrency(selectedDeal.paidAmount || 0, selectedDeal.currency)}
                                </span>
                            </div>
                            {selectedDeal.dueDate && (
                                <div className="info-row">
                                    <span className="label">Son Ödeme:</span>
                                    <span className={`value ${getEffectiveStatus(selectedDeal) === 'OVERDUE' ? 'text-danger' : ''}`}>
                                        {new Date(selectedDeal.dueDate).toLocaleDateString('tr-TR')}
                                        {getEffectiveStatus(selectedDeal) === 'OVERDUE' && ' ⚠️ Gecikmiş'}
                                    </span>
                                </div>
                            )}
                            <div className="info-row">
                                <span className="label">Durum:</span>
                                <select
                                    value={selectedDeal.status}
                                    onChange={(e) => handleStatusChange(selectedDeal.id, e.target.value)}
                                    className="status-select"
                                >
                                    <option value="OPEN">Bekliyor</option>
                                    <option value="WON">Ödendi</option>
                                    <option value="LOST">İptal</option>
                                </select>
                            </div>
                        </div>

                        {/* Products */}
                        <div className="detail-products">
                            <h4>Ürünler / Hizmetler</h4>
                            <div className="products-table">
                                {selectedDeal.products?.map((product, i) => (
                                    <div key={i} className="product-row">
                                        <span className="product-name">{product.name}</span>
                                        <span className="product-qty">{product.quantity} adet</span>
                                        <span className="product-price">{formatCurrency(product.total || product.unitPrice * product.quantity, selectedDeal.currency)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="detail-actions">
                            {selectedDeal.status !== 'WON' && (
                                <button
                                    className="btn-success"
                                    onClick={() => {
                                        setPaymentForm({
                                            paidAmount: selectedDeal.amount - (selectedDeal.paidAmount || 0),
                                            paymentDate: new Date().toISOString().split('T')[0],
                                            notes: ''
                                        });
                                        setShowPaymentModal(true);
                                    }}
                                >
                                    <CreditCard size={16} />
                                    Ödeme Kaydet
                                </button>
                            )}
                            <button className="btn-secondary" onClick={() => openEditForm(selectedDeal)}>
                                ✏️ Düzenle
                            </button>
                            <button className="btn-secondary" onClick={() => handlePrint(selectedDeal)}>
                                <Download size={16} />
                                PDF / Yazdır
                            </button>
                            <button className="btn-danger" onClick={() => handleDeleteDeal(selectedDeal.id)}>
                                <Trash2 size={16} />
                                Sil
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Payment Modal */}
            {showPaymentModal && (
                <div className="modal-overlay" onClick={() => setShowPaymentModal(false)}>
                    <div className="modal-content deal-form" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 450 }}>
                        <div className="modal-header">
                            <h2><CreditCard size={18} /> Ödeme Kaydet</h2>
                            <button className="btn-icon" onClick={() => setShowPaymentModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleRecordPayment}>
                            <div className="form-group">
                                <label>Ödenen Tutar ({selectedDeal?.currency})</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max={selectedDeal?.amount}
                                    value={paymentForm.paidAmount}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, paidAmount: e.target.value })}
                                    placeholder={`Maks: ${selectedDeal?.amount}`}
                                    required
                                />
                                <small style={{ color: '#6b7280' }}>
                                    Toplam: {formatCurrency(selectedDeal?.amount, selectedDeal?.currency)} |
                                    Kalan: {formatCurrency((selectedDeal?.amount || 0) - (selectedDeal?.paidAmount || 0), selectedDeal?.currency)}
                                </small>
                            </div>
                            <div className="form-group">
                                <label>Ödeme Tarihi</label>
                                <input
                                    type="date"
                                    value={paymentForm.paymentDate}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Not (isteğe bağlı)</label>
                                <textarea
                                    value={paymentForm.notes}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                                    rows={2}
                                    placeholder="Havale, nakit, kart vb."
                                />
                            </div>
                            <div className="form-actions">
                                <button type="button" className="btn-secondary" onClick={() => setShowPaymentModal(false)}>İptal</button>
                                <button type="submit" className="btn-success" disabled={paymentLoading}>
                                    {paymentLoading ? 'Kaydediliyor...' : 'Ödemeyi Kaydet'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Create / Edit Form Modal */}
            {showForm && (
                <div className="modal-overlay" onClick={() => { setShowForm(false); setEditingDeal(null); resetForm(); }}>
                    <div className="modal-content deal-form" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingDeal ? '✏️ Faturası Düzenle' : 'Yeni Fatura Oluştur'}</h2>
                            <button className="btn-icon" onClick={() => { setShowForm(false); setEditingDeal(null); resetForm(); }}><X size={20} /></button>
                        </div>

                        <form onSubmit={editingDeal ? handleUpdateInvoice : handleCreateInvoice}>
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
                                <label>Fatura Başlığı *</label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    placeholder="Örn: Mart 2026 Hizmet Bedeli"
                                    required
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
                                <div className="form-group">
                                    <label>KDV Oranı</label>
                                    <select
                                        value={formData.vatRate}
                                        onChange={(e) => setFormData({ ...formData, vatRate: parseFloat(e.target.value) })}
                                    >
                                        <option value={0}>%0 (KDV Yok)</option>
                                        <option value={10}>%10</option>
                                        <option value={20}>%20</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Son Ödeme Tarihi</label>
                                    <input
                                        type="date"
                                        value={formData.dueDate}
                                        onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                                        min={new Date().toISOString().split('T')[0]}
                                    />
                                </div>
                            </div>

                            {/* Products */}
                            <div className="form-group products-section">
                                <label>Ürünler / Hizmetler</label>
                                {formData.products.map((product, index) => (
                                    <div key={index} className="product-input-row">
                                        <input
                                            type="text"
                                            placeholder="Ürün / Hizmet adı"
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
                                {/* Total summary */}
                                <div className="products-total">
                                    <div>Ara Toplam: {formatCurrency(baseAmount, formData.currency)}</div>
                                    {formData.vatRate > 0 && (
                                        <div>KDV (%{formData.vatRate}): {formatCurrency(vatAmount, formData.currency)}</div>
                                    )}
                                    <div style={{ fontWeight: '700', fontSize: '16px', marginTop: 4 }}>
                                        Genel Toplam: {formatCurrency(totalWithVat, formData.currency)}
                                    </div>
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
                                <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setEditingDeal(null); resetForm(); }}>İptal</button>
                                <button type="submit" className="btn-primary">
                                    <Receipt size={16} /> {editingDeal ? 'Güncelle' : 'Fatura Oluştur'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            </>
            )}

            {/* ======================== SETTINGS TAB ======================== */}
            {activeTab === 'settings' && (
                <div style={{ maxWidth: 600 }}>
                    <h3 style={{ marginBottom: 20, color: '#1f2937' }}>Fatura Şirket Bilgileri</h3>
                    <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 20 }}>Bu bilgiler fatura PDF\'lerinde görünür.</p>

                    {/* Logo Upload */}
                    <div className="form-group" style={{ marginBottom: 20 }}>
                        <label style={{ fontWeight: 600, display: 'block', marginBottom: 8 }}>Firma Logosu</label>
                        {companyInfo?.companyLogo && (
                            <div style={{ marginBottom: 8 }}>
                                <img src={`${import.meta.env.VITE_API_URL || ''}${companyInfo.companyLogo}`} alt="Logo" style={{ maxHeight: 70, maxWidth: 200, objectFit: 'contain', border: '1px solid #e5e7eb', borderRadius: 6, padding: 4 }} />
                            </div>
                        )}
                        <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ fontSize: 13 }} />
                        <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>PNG, JPG, SVG (maks 5MB)</p>
                    </div>

                    <form onSubmit={handleSaveSettings}>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Firma Adı</label>
                                <input type="text" value={settingsForm.companyName} onChange={e => setSettingsForm({...settingsForm, companyName: e.target.value})} placeholder="Örn: Acme Ltd. Şti." />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Adres</label>
                            <textarea rows={2} value={settingsForm.companyAddress} onChange={e => setSettingsForm({...settingsForm, companyAddress: e.target.value})} placeholder="Sokak, Mahalle, İlçe / İl" />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Telefon</label>
                                <input type="text" value={settingsForm.companyPhone} onChange={e => setSettingsForm({...settingsForm, companyPhone: e.target.value})} placeholder="+90 xxx xxx xx xx" />
                            </div>
                            <div className="form-group">
                                <label>E-posta</label>
                                <input type="email" value={settingsForm.companyEmail} onChange={e => setSettingsForm({...settingsForm, companyEmail: e.target.value})} placeholder="info@firma.com" />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Vergi Dairesi</label>
                                <input type="text" value={settingsForm.invoiceTaxOffice} onChange={e => setSettingsForm({...settingsForm, invoiceTaxOffice: e.target.value})} placeholder="Örn: Kadıköy VD" />
                            </div>
                            <div className="form-group">
                                <label>Vergi Numarası</label>
                                <input type="text" value={settingsForm.invoiceTaxNumber} onChange={e => setSettingsForm({...settingsForm, invoiceTaxNumber: e.target.value})} placeholder="1234567890" />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>IBAN</label>
                            <input type="text" value={settingsForm.invoiceIban} onChange={e => setSettingsForm({...settingsForm, invoiceIban: e.target.value})} placeholder="TR00 0000 0000 0000 0000 0000 00" />
                        </div>
                        <div className="form-actions" style={{ marginTop: 24 }}>
                            <button type="submit" className="btn-primary" disabled={settingsSaving}>
                                {settingsSaving ? 'Kaydediliyor...' : '✅ Kaydet'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default Invoices;
