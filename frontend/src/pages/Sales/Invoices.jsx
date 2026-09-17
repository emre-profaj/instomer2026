import { useTranslation } from 'react-i18next';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { dealAPI, contactAPI, workspaceAPI } from '../../services/api';
import {
    Search, TrendingUp, FileText, X, Trash2, Receipt,
    Download, Plus, AlertCircle, CheckCircle, Clock, CreditCard,
    User, Calendar, Edit2
} from 'lucide-react';
import ContactSidebar from '../../components/ContactSidebar/ContactSidebar';
import DealSourceSelect from '../../components/DealSourceSelect/DealSourceSelect';
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

    // Filters
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [datePreset, setDatePreset] = useState('THIS_MONTH');
    const [customDateFrom, setCustomDateFrom] = useState('');
    const [customDateTo, setCustomDateTo] = useState('');

    // Payment modal
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentForm, setPaymentForm] = useState({ paidAmount: '', paymentDate: new Date().toISOString().split('T')[0], notes: '' });
    const [paymentLoading, setPaymentLoading] = useState(false);

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
        const formPayload = new window.FormData();
        formPayload.append('logo', file);
        try {
            const response = await workspaceAPI.uploadCompanyLogo(currentWorkspace.id, formPayload);
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
            const baseAmt = formData.products.reduce((sum, p) => sum + (p.quantity * p.unitPrice), 0);
            const productsWithTotal = formData.products.map(p => ({
                ...p,
                total: p.quantity * p.unitPrice
            }));

            await dealAPI.create(currentWorkspace.id, {
                ...formData,
                amount: baseAmt,
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
            const baseAmt = formData.products.reduce((sum, p) => sum + (p.quantity * p.unitPrice), 0);
            const productsWithTotal = formData.products.map(p => ({
                ...p,
                total: p.quantity * p.unitPrice
            }));
            const updated = await dealAPI.update(currentWorkspace.id, editingDeal.id, {
                ...formData,
                amount: baseAmt,
                products: productsWithTotal,
                vatRate: parseFloat(formData.vatRate) || 0,
                dueDate: formData.dueDate || null
            });
            setShowForm(false);
            setEditingDeal(null);
            resetForm();
            fetchDeals();
            fetchStats();
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
        const vatVal = base * ((deal.vatRate || 0) / 100) / (1 + (deal.vatRate || 0) / 100);
        const subtotal = base - vatVal;
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
    <div class="total-row"><span>KDV (%${deal.vatRate}):</span><span>${formatCurrency(vatVal, deal.currency)}</span></div>
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
        if (eff === 'WON') return <span className="sales-list-card-badge won"><CheckCircle size={11} /> Ödendi</span>;
        if (eff === 'OVERDUE') return <span className="sales-list-card-badge overdue"><AlertCircle size={11} /> Gecikmiş</span>;
        if (eff === 'LOST') return <span className="sales-list-card-badge lost"><X size={11} /> İptal</span>;
        return <span className="sales-list-card-badge open"><Clock size={11} /> Bekliyor</span>;
    };

    const baseAmount = formData.products.reduce((sum, p) => sum + (p.quantity * p.unitPrice), 0);
    const vatAmount = baseAmount * ((formData.vatRate || 0) / 100);
    const totalWithVat = baseAmount + vatAmount;

    const filteredDeals = deals.filter(deal => {
        // Search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const matches =
                deal.title?.toLowerCase().includes(q) ||
                deal.contact?.name?.toLowerCase().includes(q) ||
                deal.contact?.fullName?.toLowerCase().includes(q) ||
                deal.invoiceNumber?.toLowerCase().includes(q) ||
                (deal.protocolNo && String(deal.protocolNo).toLowerCase().includes(q));
            if (!matches) return false;
        }

        // Status
        const eff = getEffectiveStatus(deal);
        if (statusFilter !== 'ALL') {
            if (statusFilter === 'OVERDUE') {
                if (eff !== 'OVERDUE') return false;
            } else if (eff !== statusFilter) {
                return false;
            }
        }

        // Date
        const dealDate = new Date(deal.createdAt || deal.invoiceCreatedAt);
        if (datePreset === 'CUSTOM') {
            if (customDateFrom && dealDate < new Date(customDateFrom)) return false;
            if (customDateTo) {
                const to = new Date(customDateTo);
                to.setHours(23, 59, 59, 999);
                if (dealDate > to) return false;
            }
        } else if (datePreset !== 'ALL') {
            const { from, to } = getDateRange(datePreset);
            if (from && dealDate < from) return false;
            if (to && dealDate > to) return false;
        }

        return true;
    });

    const filteredStats = {
        count: filteredDeals.length,
        totalAmount: filteredDeals.reduce((sum, d) => sum + (d.amount || 0), 0),
        paidTotal: filteredDeals.reduce((sum, d) => sum + (d.paidAmount || (d.status === 'WON' ? d.amount : 0) || 0), 0),
        overdueCount: filteredDeals.filter(d => getEffectiveStatus(d) === 'OVERDUE').length
    };

    // Build externalProfile for ContactSidebar
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
        <div className="sales-inbox-layout" ref={layoutRef}>
            {/* ── LEFT PANEL: Invoices List ── */}
            <div className="sales-list-panel" style={{ width: `${panelWidth}px` }}>
                <div className="sales-list-panel-header">
                    <div className="sales-list-panel-header-row">
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <button
                                type="button"
                                className={`sales-date-preset-btn ${activeTab === 'invoices' ? 'active' : ''}`}
                                style={{ fontWeight: 600, fontSize: '13px', padding: '5px 12px' }}
                                onClick={() => setActiveTab('invoices')}
                            >
                                Faturalar <span className="sales-count" style={{ marginLeft: 4 }}>{filteredStats.count}</span>
                            </button>
                            <button
                                type="button"
                                className={`sales-date-preset-btn ${activeTab === 'settings' ? 'active' : ''}`}
                                style={{ fontWeight: 600, fontSize: '13px', padding: '5px 12px' }}
                                onClick={() => setActiveTab('settings')}
                            >
                                ⚙️ Ayarlar
                            </button>
                        </div>
                        {activeTab === 'invoices' && (
                            <button className="btn-primary btn-sm" onClick={() => { resetForm(); setShowForm(true); }}>
                                <Plus size={15} /> Yeni
                            </button>
                        )}
                    </div>

                    {/* Search */}
                    <div className="sales-list-panel-search">
                        <Search size={15} />
                        <input
                            type="text"
                            placeholder="Fatura, müşteri veya numara ara..."
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
                                <option value="OPEN">Bekliyor</option>
                                <option value="WON">Ödendi</option>
                                <option value="OVERDUE">Gecikmiş</option>
                                <option value="LOST">İptal</option>
                            </select>
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

                        {/* Stats Row */}
                        <div className="sales-list-stats">
                            <div className="sales-list-stat">
                                <span className="sls-value">{filteredStats.count}</span>
                                <span className="sls-label">FATURA</span>
                            </div>
                            <div className="sales-list-stat">
                                <span className="sls-value">{formatCurrency(filteredStats.totalAmount)}</span>
                                <span className="sls-label">TOPLAM</span>
                            </div>
                            <div className="sales-list-stat">
                                <span className="sls-value" style={{ color: '#10b981' }}>{formatCurrency(filteredStats.paidTotal)}</span>
                                <span className="sls-label">TAHSİLAT</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Invoices List Body */}
                <div className="sales-list-panel-body">
                    {loading ? (
                        <div className="loading-state">Yükleniyor...</div>
                    ) : filteredDeals.length === 0 ? (
                        <div className="empty-state">
                            <Receipt size={40} />
                            <h3>Henüz fatura yok</h3>
                            <p>Yeni fatura oluşturmak için "Yeni" butonuna tıklayın</p>
                        </div>
                    ) : (
                        filteredDeals.map(deal => {
                            const eff = getEffectiveStatus(deal);
                            return (
                                <div
                                    key={deal.id}
                                    className={`sales-list-card ${selectedDeal?.id === deal.id && activeTab === 'invoices' ? 'selected' : ''} ${eff.toLowerCase()}`}
                                    onClick={() => { setSelectedDeal(deal); setActiveTab('invoices'); }}
                                >
                                    <div className="sales-list-card-top">
                                        <span className="sales-list-card-number">{deal.invoiceNumber}</span>
                                        {getStatusBadge(deal)}
                                    </div>
                                    {deal.protocolNo && (
                                        <div className="sales-list-card-protocol">
                                            📁 Protokol: {deal.protocolNo}
                                        </div>
                                    )}
                                    <div className="sales-list-card-title">{deal.title}</div>
                                    <div className="sales-list-card-customer">👤 {deal.contact?.name || deal.contact?.fullName || '-'}</div>
                                    <div className="sales-list-card-bottom">
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            <span className="sales-list-card-amount">{formatCurrency(deal.amount, deal.currency)}</span>
                                            {deal.assignedTo && (
                                                <span className="sales-list-card-agent">
                                                    <User size={11} /> {deal.assignedTo.name}
                                                </span>
                                            )}
                                        </div>
                                        <span className="sales-list-card-date">
                                            {deal.dueDate ? (
                                                <span className={eff === 'OVERDUE' ? 'text-danger' : ''} style={{ fontSize: '11px', fontWeight: eff === 'OVERDUE' ? 600 : 400 }}>
                                                    {eff === 'OVERDUE' ? '⚠️ ' : 'Son: '}{new Date(deal.dueDate).toLocaleDateString('tr-TR')}
                                                </span>
                                            ) : (
                                                new Date(deal.createdAt || deal.invoiceCreatedAt).toLocaleDateString('tr-TR')
                                            )}
                                        </span>
                                    </div>
                                    {deal.paidAmount > 0 && deal.status !== 'WON' && (
                                        <div className="deal-partial-payment" style={{ marginTop: 6 }}>
                                            <div className="payment-progress">
                                                <div
                                                    className="payment-bar"
                                                    style={{ width: `${Math.min(100, (deal.paidAmount / deal.amount) * 100)}%` }}
                                                />
                                            </div>
                                            <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 600 }}>
                                                {formatCurrency(deal.paidAmount, deal.currency)} / {formatCurrency(deal.amount, deal.currency)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Sürüklenebilir Kenarlık */}
            <div
                className="sales-resizer"
                onMouseDown={handleMouseDown}
                title="Genişliği ayarlamak için sürükleyin"
            />

            {/* ── MIDDLE PANEL: Invoice Detail OR Settings ── */}
            <div className="sales-detail-panel">
                {activeTab === 'settings' ? (
                    <div className="sales-detail-card" style={{ maxWidth: 640 }}>
                        <div className="detail-header" style={{ marginBottom: 20 }}>
                            <div>
                                <h2 style={{ fontSize: '18px' }}>⚙️ Fatura Şirket Bilgileri</h2>
                                <p style={{ color: '#6b7280', fontSize: '13px', margin: '4px 0 0' }}>Bu bilgiler fatura PDF'lerinde ve yazdırma şablonlarında görünür.</p>
                            </div>
                            <button className="btn-icon" onClick={() => setActiveTab('invoices')}>
                                <X size={20} />
                            </button>
                        </div>

                        {/* Logo Upload */}
                        <div className="form-group" style={{ marginBottom: 20 }}>
                            <label style={{ fontWeight: 600, display: 'block', marginBottom: 8 }}>Firma Logosu</label>
                            {companyInfo?.companyLogo && (
                                <div style={{ marginBottom: 8 }}>
                                    <img
                                        src={`${import.meta.env.VITE_API_URL || ''}${companyInfo.companyLogo}`}
                                        alt="Logo"
                                        style={{ maxHeight: 70, maxWidth: 200, objectFit: 'contain', border: '1px solid #e5e7eb', borderRadius: 6, padding: 4 }}
                                    />
                                </div>
                            )}
                            <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ fontSize: 13 }} />
                            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>PNG, JPG, SVG (maks 5MB)</p>
                        </div>

                        <form onSubmit={handleSaveSettings}>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Firma Adı</label>
                                    <input
                                        type="text"
                                        value={settingsForm.companyName}
                                        onChange={e => setSettingsForm({ ...settingsForm, companyName: e.target.value })}
                                        placeholder="Örn: Acme Ltd. Şti."
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Adres</label>
                                <textarea
                                    rows={2}
                                    value={settingsForm.companyAddress}
                                    onChange={e => setSettingsForm({ ...settingsForm, companyAddress: e.target.value })}
                                    placeholder="Sokak, Mahalle, İlçe / İl"
                                />
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Telefon</label>
                                    <input
                                        type="text"
                                        value={settingsForm.companyPhone}
                                        onChange={e => setSettingsForm({ ...settingsForm, companyPhone: e.target.value })}
                                        placeholder="+90 xxx xxx xx xx"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>E-posta</label>
                                    <input
                                        type="email"
                                        value={settingsForm.companyEmail}
                                        onChange={e => setSettingsForm({ ...settingsForm, companyEmail: e.target.value })}
                                        placeholder="info@firma.com"
                                    />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Vergi Dairesi</label>
                                    <input
                                        type="text"
                                        value={settingsForm.invoiceTaxOffice}
                                        onChange={e => setSettingsForm({ ...settingsForm, invoiceTaxOffice: e.target.value })}
                                        placeholder="Örn: Kadıköy VD"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Vergi Numarası</label>
                                    <input
                                        type="text"
                                        value={settingsForm.invoiceTaxNumber}
                                        onChange={e => setSettingsForm({ ...settingsForm, invoiceTaxNumber: e.target.value })}
                                        placeholder="1234567890"
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>IBAN</label>
                                <input
                                    type="text"
                                    value={settingsForm.invoiceIban}
                                    onChange={e => setSettingsForm({ ...settingsForm, invoiceIban: e.target.value })}
                                    placeholder="TR00 0000 0000 0000 0000 0000 00"
                                />
                            </div>
                            <div className="form-actions" style={{ marginTop: 24 }}>
                                <button type="submit" className="btn-primary" disabled={settingsSaving}>
                                    {settingsSaving ? 'Kaydediliyor...' : '✅ Kaydet'}
                                </button>
                            </div>
                        </form>
                    </div>
                ) : selectedDeal ? (
                    <div className="sales-detail-card">
                        <div className="detail-header">
                            <div>
                                <span className="deal-number" style={{ marginBottom: 4, display: 'block' }}>{selectedDeal.invoiceNumber}</span>
                                <h2>{selectedDeal.title}</h2>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                                {getStatusBadge(selectedDeal)}
                                <button className="btn-icon" onClick={() => setSelectedDeal(null)}>
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        <div className="detail-info">
                            <div className="info-row">
                                <span className="label">Fatura No:</span>
                                <span className="value">{selectedDeal.invoiceNumber}</span>
                            </div>
                            <div className="info-row">
                                <span className="label">Müşteri:</span>
                                <span className="value">{selectedDeal.contact?.name || selectedDeal.contact?.fullName || '-'}</span>
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
                            {/* Kaynak — fatura, siparişin devamı olan aynı kayıt. Buraya da
                                konuldu, yoksa faturaya dönüşen bir satışın kaynağı bir daha
                                hiçbir ekrandan düzeltilemiyordu. */}
                            <div className="info-row">
                                <span className="label">Kaynak:</span>
                                <DealSourceSelect
                                    workspaceId={currentWorkspace.id}
                                    deal={selectedDeal}
                                    onChange={(channel) => {
                                        setSelectedDeal(prev => ({ ...prev, channel }));
                                        setDeals(prev => prev.map(d => d.id === selectedDeal.id ? { ...d, channel } : d));
                                    }}
                                />
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
                                <Edit2 size={15} /> Düzenle
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
                ) : (
                    <div className="sales-detail-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 350, textAlign: 'center', color: '#64748b' }}>
                        <Receipt size={48} style={{ color: '#94a3b8', marginBottom: 16 }} />
                        <h3 style={{ margin: '0 0 8px 0', color: '#1e293b' }}>Fatura Seçilmedi</h3>
                        <p style={{ margin: 0, fontSize: '14px', maxWidth: 320 }}>Detayları görüntülemek, ödeme kaydetmek veya yazdırmak için listeden bir fatura seçin.</p>
                    </div>
                )}
            </div>

            {/* ── RIGHT PANEL: Customer Sidebar ── */}
            {showRightSidebar && sidebarProfile && (
                <div className="sales-sidebar-panel">
                    <ContactSidebar externalProfile={sidebarProfile} />
                </div>
            )}

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
                                <small style={{ color: '#6b7280', display: 'block', marginTop: 4 }}>
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
                            <h2>{editingDeal ? '✏️ Faturayı Düzenle' : 'Yeni Fatura Oluştur'}</h2>
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
        </div>
    );
};

export default Invoices;
