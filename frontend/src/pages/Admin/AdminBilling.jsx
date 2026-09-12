import React, { useState, useEffect, useCallback } from 'react';
import { billingAPI } from '../../services/api';

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
};

export default function AdminBilling() {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);

  // Overview Data
  const [overview, setOverview] = useState(null);
  const [companies, setCompanies] = useState([]);

  // Plans Data
  const [plans, setPlans] = useState([]);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planForm, setPlanForm] = useState({
    name: '', description: '', monthlyPrice: 0, includedAiCredits: 0, includedCallMins: 0, costMultiplier: 1.0, features: ''
  });
  const [editingPlanId, setEditingPlanId] = useState(null);

  // Company Detail Data
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const [companyDetail, setCompanyDetail] = useState(null);
  
  const [creditAmount, setCreditAmount] = useState('');
  const [creditNotes, setCreditNotes] = useState('');

  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'CREDIT_CARD', reference: '', invoiceId: '', notes: '' });
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  useEffect(() => {
    if (activeTab === 'overview') {
      fetchOverview();
      fetchCompanies();
    } else if (activeTab === 'plans') {
      fetchPlans();
    } else if (activeTab === 'companyDetail' && selectedCompanyId) {
      fetchCompanyDetail(selectedCompanyId);
    }
  }, [activeTab, selectedCompanyId]);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      const res = await billingAPI.getOverview();
      setOverview(res || { totalRevenue: 0, monthlyUsageCost: 0, monthlyUsagePrice: 0, unpaidTotal: 0, activeCompanies: 0 });
    } catch (err) {
      console.error(err);
      alert('Genel bakış verileri alınamadı.');
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const res = await billingAPI.getCompanies();
      setCompanies(res.companies || []);
    } catch (err) {
      console.error(err);
      alert('Şirketler alınamadı.');
    } finally {
      setLoading(false);
    }
  };

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const res = await billingAPI.getPlans();
      setPlans(res.plans || []);
    } catch (err) {
      console.error(err);
      alert('Paketler alınamadı.');
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanyDetail = async (id) => {
    try {
      setLoading(true);
      const res = await billingAPI.getCompanyDetail(id);
      setCompanyDetail(res || null);
    } catch (err) {
      console.error(err);
      alert('Şirket detayı alınamadı.');
    } finally {
      setLoading(false);
    }
  };

  const handleCompanyClick = (id) => {
    setSelectedCompanyId(id);
    setActiveTab('companyDetail');
  };

  const handleSavePlan = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      if (editingPlanId) {
        await billingAPI.updatePlan(editingPlanId, planForm);
        alert('Paket güncellendi.');
      } else {
        await billingAPI.createPlan(planForm);
        alert('Paket oluşturuldu.');
      }
      setShowPlanModal(false);
      fetchPlans();
    } catch (err) {
      console.error(err);
      alert('Paket kaydedilemedi.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePlan = async (id) => {
    if (!window.confirm('Bu paketi silmek istediğinize emin misiniz?')) return;
    try {
      setLoading(true);
      await billingAPI.deletePlan(id);
      alert('Paket silindi.');
      fetchPlans();
    } catch (err) {
      console.error(err);
      alert('Paket silinemedi, kullanımda olabilir.');
    } finally {
      setLoading(false);
    }
  };

  const openPlanModal = (plan = null) => {
    if (plan) {
      setEditingPlanId(plan.id);
      setPlanForm({
        name: plan.name, description: plan.description, monthlyPrice: plan.monthlyPrice,
        includedAiCredits: plan.includedAiCredits, includedCallMins: plan.includedCallMins,
        costMultiplier: plan.costMultiplier, features: plan.features?.join(', ') || ''
      });
    } else {
      setEditingPlanId(null);
      setPlanForm({ name: '', description: '', monthlyPrice: 0, includedAiCredits: 0, includedCallMins: 0, costMultiplier: 1.0, features: '' });
    }
    setShowPlanModal(true);
  };

  const handleUpdateCompanyBilling = async (data) => {
    try {
      setLoading(true);
      await billingAPI.updateCompanyBilling(selectedCompanyId, data);
      alert('Fatura ayarları güncellendi.');
      fetchCompanyDetail(selectedCompanyId);
    } catch (err) {
      console.error(err);
      alert('Fatura ayarları güncellenemedi.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCredit = async () => {
    if (!creditAmount) return;
    try {
      setLoading(true);
      await billingAPI.addCredit(selectedCompanyId, { amount: parseFloat(creditAmount), notes: creditNotes });
      alert('Kredi eklendi.');
      setCreditAmount('');
      setCreditNotes('');
      fetchCompanyDetail(selectedCompanyId);
    } catch (err) {
      console.error(err);
      alert('Kredi eklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInvoice = async () => {
    const period = window.prompt('Fatura dönemi (Örn: 2026-09):');
    if (!period) return;
    try {
      setLoading(true);
      await billingAPI.createInvoice(selectedCompanyId, { period });
      alert('Fatura oluşturuldu.');
      fetchCompanyDetail(selectedCompanyId);
    } catch (err) {
      console.error(err);
      alert('Fatura oluşturulamadı.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateInvoiceStatus = async (invoiceId, status) => {
    try {
      setLoading(true);
      await billingAPI.updateInvoice(invoiceId, { status });
      alert(`Fatura durumu ${status} olarak güncellendi.`);
      fetchCompanyDetail(selectedCompanyId);
    } catch (err) {
      console.error(err);
      alert('Fatura durumu güncellenemedi.');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePayment = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await billingAPI.createPayment({ companyId: selectedCompanyId, ...paymentForm });
      alert('Ödeme kaydedildi.');
      setShowPaymentModal(false);
      setPaymentForm({ amount: '', method: 'CREDIT_CARD', reference: '', invoiceId: '', notes: '' });
      fetchCompanyDetail(selectedCompanyId);
    } catch (err) {
      console.error(err);
      alert('Ödeme kaydedilemedi.');
    } finally {
      setLoading(false);
    }
  };

  const styles = {
    container: { padding: '24px', fontFamily: 'system-ui, sans-serif', color: '#1f2937', maxWidth: '1400px', margin: '0 auto' },
    header: { display: 'flex', gap: '16px', marginBottom: '24px', borderBottom: '1px solid #e5e7eb', paddingBottom: '16px' },
    tabButton: (active) => ({
      padding: '8px 16px', border: 'none', background: active ? '#6366f1' : 'transparent', color: active ? 'white' : '#4b5563',
      borderRadius: '8px', cursor: 'pointer', fontWeight: '500', fontSize: '16px', transition: 'all 0.2s'
    }),
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '32px' },
    card: { background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #f3f4f6' },
    cardTitle: { fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' },
    cardValue: { fontSize: '24px', fontWeight: 'bold', color: '#111827' },
    table: { width: '100%', borderCollapse: 'collapse', marginTop: '16px', background: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
    th: { textAlign: 'left', padding: '12px 16px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', color: '#4b5563', fontWeight: '600', fontSize: '14px' },
    td: { padding: '12px 16px', borderBottom: '1px solid #e5e7eb', fontSize: '14px', color: '#374151' },
    row: { cursor: 'pointer', transition: 'background 0.2s' },
    button: { padding: '8px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500', fontSize: '14px' },
    buttonDanger: { background: '#ef4444' },
    buttonSuccess: { background: '#10b981' },
    input: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', width: '100%', boxSizing: 'border-box', fontSize: '14px' },
    formGroup: { marginBottom: '16px' },
    label: { display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#374151' },
    modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    modalContent: { background: 'white', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' },
    modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
    badge: (color) => ({ padding: '4px 8px', borderRadius: '999px', fontSize: '12px', fontWeight: '500', background: `${color}20`, color: color }),
    flexRow: { display: 'flex', gap: '12px', alignItems: 'flex-end' },
    sectionTitle: { fontSize: '18px', fontWeight: 'bold', margin: '32px 0 16px' }
  };

  const getUsageTypeLabel = (type) => {
    const types = { AI_CHAT: '🤖 AI Yazışma', AI_CALL: '☎️ AI Arama', WHATSAPP_TEMPLATE: '📨 WhatsApp', SMS: '💬 SMS', EMAIL: '📧 E-posta' };
    return types[type] || type;
  };

  return (
    <div style={styles.container}>
      <h1 style={{ marginBottom: '24px', fontSize: '24px', fontWeight: 'bold' }}>💳 Fatura & Abonelik Yönetimi (Süper Admin)</h1>
      
      <div style={styles.header}>
        <button style={styles.tabButton(activeTab === 'overview')} onClick={() => setActiveTab('overview')}>📊 Genel Bakış</button>
        <button style={styles.tabButton(activeTab === 'plans')} onClick={() => setActiveTab('plans')}>📦 Paketler</button>
        <button style={styles.tabButton(activeTab === 'companyDetail')} disabled={!selectedCompanyId} onClick={() => selectedCompanyId && setActiveTab('companyDetail')}>🏢 Şirket Detay</button>
      </div>

      {loading && <div style={{ color: '#6b7280', marginBottom: '16px' }}>⏳ Yükleniyor...</div>}

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div>
          <div style={styles.grid}>
            <div style={styles.card}>
              <div style={styles.cardTitle}>Toplam Gelir</div>
              <div style={styles.cardValue}>{formatCurrency(overview?.totalRevenue)}</div>
            </div>
            <div style={styles.card}>
              <div style={styles.cardTitle}>Bu Ay Tüketim (Maliyet / Fiyat)</div>
              <div style={styles.cardValue}>{formatCurrency(overview?.monthlyUsageCost)} / <span style={{ color: '#10b981' }}>{formatCurrency(overview?.monthlyUsagePrice)}</span></div>
            </div>
            <div style={styles.card}>
              <div style={styles.cardTitle}>Ödenmemiş Toplam Borç</div>
              <div style={styles.cardValue}><span style={{ color: '#ef4444' }}>{formatCurrency(overview?.unpaidTotal)}</span></div>
            </div>
            <div style={styles.card}>
              <div style={styles.cardTitle}>Aktif Şirket / Müşteri</div>
              <div style={styles.cardValue}>{overview?.activeCompanies || 0}</div>
            </div>
          </div>

          <h2 style={styles.sectionTitle}>🏢 Şirketler</h2>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Şirket Adı</th>
                <th style={styles.th}>Plan & Tip</th>
                <th style={styles.th}>Kredi Bakiye</th>
                <th style={styles.th}>Maliyet (Bu Ay)</th>
                <th style={styles.th}>Fiyat (Bu Ay)</th>
                <th style={styles.th}>Kâr (Bu Ay)</th>
                <th style={styles.th}>Borç (Unpaid)</th>
              </tr>
            </thead>
            <tbody>
              {companies.map(c => {
                const profit = (c.monthlyUsagePrice || 0) - (c.monthlyUsageCost || 0);
                return (
                  <tr key={c.id} style={styles.row} onClick={() => handleCompanyClick(c.id)}>
                    <td style={styles.td}><strong>{c.name}</strong></td>
                    <td style={styles.td}>
                      <span style={styles.badge('#6366f1')}>{c.billing?.plan || 'YOK'}</span>
                      <span style={{ ...styles.badge(c.billing?.billingType === 'PREPAID' ? '#10b981' : '#f59e0b'), marginLeft: '8px' }}>{c.billing?.billingType}</span>
                    </td>
                    <td style={styles.td}>{formatCurrency(c.billing?.creditBalance)}</td>
                    <td style={styles.td}>{formatCurrency(c.monthlyUsageCost)}</td>
                    <td style={styles.td}>{formatCurrency(c.monthlyUsagePrice)}</td>
                    <td style={styles.td}><span style={{ color: profit >= 0 ? '#10b981' : '#ef4444' }}>{formatCurrency(profit)}</span></td>
                    <td style={styles.td}><span style={{ color: c.unpaidAmount > 0 ? '#ef4444' : '#10b981' }}>{formatCurrency(c.unpaidAmount)}</span></td>
                  </tr>
                );
              })}
              {companies.length === 0 && <tr><td colSpan="7" style={{ ...styles.td, textAlign: 'center' }}>Veri bulunamadı.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: PLANS */}
      {activeTab === 'plans' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>📦 Abonelik Paketleri</h2>
            <button style={styles.button} onClick={() => openPlanModal()}>+ Yeni Paket Ekle</button>
          </div>
          
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Paket Adı</th>
                <th style={styles.th}>Aylık Fiyat</th>
                <th style={styles.th}>AI Kredisi</th>
                <th style={styles.th}>Arama Dk.</th>
                <th style={styles.th}>Maliyet Çarpanı</th>
                <th style={styles.th}>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {plans.map(p => (
                <tr key={p.id}>
                  <td style={styles.td}><strong>{p.name}</strong></td>
                  <td style={styles.td}>{formatCurrency(p.monthlyPrice)}</td>
                  <td style={styles.td}>{p.includedAiCredits || 0}</td>
                  <td style={styles.td}>{p.includedCallMins || 0}</td>
                  <td style={styles.td}>x{p.costMultiplier || 1}</td>
                  <td style={styles.td}>
                    <button style={{ ...styles.button, padding: '6px 12px', fontSize: '12px', marginRight: '8px' }} onClick={() => openPlanModal(p)}>Düzenle</button>
                    <button style={{ ...styles.button, ...styles.buttonDanger, padding: '6px 12px', fontSize: '12px' }} onClick={() => handleDeletePlan(p.id)}>Sil</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: COMPANY DETAIL */}
      {activeTab === 'companyDetail' && companyDetail && (
        <div>
          <div style={{ ...styles.card, marginBottom: '24px' }}>
            <h2 style={{ fontSize: '20px', margin: '0 0 16px' }}>{companyDetail.company.name} - Fatura Profili</h2>
            
            <div style={styles.grid}>
              <div>
                <label style={styles.label}>Aktif Plan</label>
                <select style={styles.input} value={companyDetail.company.billing?.plan || ''} onChange={(e) => handleUpdateCompanyBilling({ plan: e.target.value })}>
                  <option value="">Plan Yok</option>
                  {plans.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label style={styles.label}>Fatura Tipi</label>
                <select style={styles.input} value={companyDetail.company.billing?.billingType || 'PREPAID'} onChange={(e) => handleUpdateCompanyBilling({ billingType: e.target.value })}>
                  <option value="PREPAID">Ön Ödemeli (Kredi)</option>
                  <option value="POSTPAID">Faturalı (Sonradan)</option>
                </select>
              </div>
              <div>
                <label style={styles.label}>Maliyet Çarpanı (Örn: 1.5)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="number" step="0.1" style={styles.input} defaultValue={companyDetail.company.billing?.costMultiplier || 1.0} onBlur={(e) => handleUpdateCompanyBilling({ costMultiplier: parseFloat(e.target.value) })} />
                </div>
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '20px 0' }} />
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={styles.label}>Mevcut Kredi Bakiyesi</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>{formatCurrency(companyDetail.company.billing?.creditBalance)}</div>
              </div>
              <div style={styles.flexRow}>
                <div>
                  <label style={styles.label}>Miktar ($)</label>
                  <input type="number" style={styles.input} placeholder="0.00" value={creditAmount} onChange={e => setCreditAmount(e.target.value)} />
                </div>
                <div>
                  <label style={styles.label}>Not</label>
                  <input type="text" style={styles.input} placeholder="Açıklama..." value={creditNotes} onChange={e => setCreditNotes(e.target.value)} />
                </div>
                <button style={{ ...styles.button, ...styles.buttonSuccess }} onClick={handleAddCredit}>+ Kredi Ekle / Yükle</button>
              </div>
            </div>
          </div>

          <h3 style={styles.sectionTitle}>📊 Bu Ay Tüketim Özeti</h3>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>İş Alanı (Workspace)</th>
                <th style={styles.th}>Tüketim Türü</th>
                <th style={styles.th}>Miktar</th>
                <th style={styles.th}>Maliyet (Senin)</th>
                <th style={styles.th}>Fiyat (Müşteriye)</th>
                <th style={styles.th}>Kâr</th>
              </tr>
            </thead>
            <tbody>
              {(companyDetail.usageByWorkspace || []).map((wUsage, i) => {
                const profit = wUsage.price - wUsage.cost;
                return (
                  <tr key={i}>
                    <td style={styles.td}><strong>{wUsage.workspaceName || 'Bilinmiyor'}</strong></td>
                    <td style={styles.td}>{getUsageTypeLabel(wUsage.type)}</td>
                    <td style={styles.td}>{wUsage.amount}</td>
                    <td style={styles.td}>{formatCurrency(wUsage.cost)}</td>
                    <td style={styles.td}>{formatCurrency(wUsage.price)}</td>
                    <td style={styles.td}><span style={{ color: profit >= 0 ? '#10b981' : '#ef4444' }}>{formatCurrency(profit)}</span></td>
                  </tr>
                );
              })}
              {(!companyDetail.usageByWorkspace || companyDetail.usageByWorkspace.length === 0) && (
                <tr><td colSpan="6" style={{ ...styles.td, textAlign: 'center' }}>Bu ay henüz kullanım yok.</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="3" style={{ ...styles.td, fontWeight: 'bold', background: '#f9fafb', textAlign: 'right' }}>TOPLAM:</td>
                <td style={{ ...styles.td, fontWeight: 'bold', background: '#f9fafb' }}>{formatCurrency(companyDetail.totalUsage?.cost)}</td>
                <td style={{ ...styles.td, fontWeight: 'bold', background: '#f9fafb' }}>{formatCurrency(companyDetail.totalUsage?.price)}</td>
                <td style={{ ...styles.td, fontWeight: 'bold', background: '#f9fafb', color: (companyDetail.totalUsage?.price - companyDetail.totalUsage?.cost) >= 0 ? '#10b981' : '#ef4444' }}>
                  {formatCurrency((companyDetail.totalUsage?.price || 0) - (companyDetail.totalUsage?.cost || 0))}
                </td>
              </tr>
            </tfoot>
          </table>

          <div style={{ display: 'flex', gap: '24px', marginTop: '32px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={styles.sectionTitle}>🧾 Faturalar</h3>
                <button style={{ ...styles.button, padding: '6px 12px' }} onClick={handleCreateInvoice}>+ Fatura Oluştur</button>
              </div>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Dönem</th>
                    <th style={styles.th}>Tutar</th>
                    <th style={styles.th}>Durum</th>
                    <th style={styles.th}>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {(companyDetail.invoices || []).map(inv => (
                    <tr key={inv.id}>
                      <td style={styles.td}>{inv.period}</td>
                      <td style={styles.td}>{formatCurrency(inv.totalAmount)}</td>
                      <td style={styles.td}>
                        <span style={styles.badge(inv.status === 'PAID' ? '#10b981' : inv.status === 'SENT' ? '#3b82f6' : '#6b7280')}>{inv.status}</span>
                      </td>
                      <td style={styles.td}>
                        {inv.status === 'DRAFT' && <button style={{ ...styles.button, padding: '4px 8px', fontSize: '12px' }} onClick={() => handleUpdateInvoiceStatus(inv.id, 'SENT')}>Gönder</button>}
                        {inv.status === 'SENT' && <button style={{ ...styles.button, ...styles.buttonSuccess, padding: '4px 8px', fontSize: '12px', marginLeft: '4px' }} onClick={() => handleUpdateInvoiceStatus(inv.id, 'PAID')}>Ödendi Yap</button>}
                      </td>
                    </tr>
                  ))}
                  {(!companyDetail.invoices || companyDetail.invoices.length === 0) && <tr><td colSpan="4" style={{ ...styles.td, textAlign: 'center' }}>Fatura bulunamadı.</td></tr>}
                </tbody>
              </table>
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={styles.sectionTitle}>💵 Ödemeler</h3>
                <button style={{ ...styles.button, ...styles.buttonSuccess, padding: '6px 12px' }} onClick={() => setShowPaymentModal(true)}>+ Ödeme Ekle</button>
              </div>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Tarih</th>
                    <th style={styles.th}>Tutar</th>
                    <th style={styles.th}>Yöntem</th>
                  </tr>
                </thead>
                <tbody>
                  {(companyDetail.payments || []).map(pay => (
                    <tr key={pay.id}>
                      <td style={styles.td}>{new Date(pay.createdAt || Date.now()).toLocaleDateString()}</td>
                      <td style={styles.td}><span style={{ color: '#10b981', fontWeight: 'bold' }}>{formatCurrency(pay.amount)}</span></td>
                      <td style={styles.td}>{pay.method}</td>
                    </tr>
                  ))}
                  {(!companyDetail.payments || companyDetail.payments.length === 0) && <tr><td colSpan="3" style={{ ...styles.td, textAlign: 'center' }}>Ödeme kaydı bulunamadı.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* PLAN MODAL */}
      {showPlanModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>{editingPlanId ? 'Paketi Düzenle' : 'Yeni Paket'}</h2>
              <button onClick={() => setShowPlanModal(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}>&times;</button>
            </div>
            <form onSubmit={handleSavePlan}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Paket Adı</label>
                <input required style={styles.input} value={planForm.name} onChange={e => setPlanForm({...planForm, name: e.target.value})} />
              </div>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Aylık Ücret ($)</label>
                  <input type="number" required style={styles.input} value={planForm.monthlyPrice} onChange={e => setPlanForm({...planForm, monthlyPrice: parseFloat(e.target.value)})} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Maliyet Çarpanı</label>
                  <input type="number" step="0.1" required style={styles.input} value={planForm.costMultiplier} onChange={e => setPlanForm({...planForm, costMultiplier: parseFloat(e.target.value)})} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Dahil AI Kredisi</label>
                  <input type="number" style={styles.input} value={planForm.includedAiCredits} onChange={e => setPlanForm({...planForm, includedAiCredits: parseInt(e.target.value, 10)})} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Dahil Arama (Dk)</label>
                  <input type="number" style={styles.input} value={planForm.includedCallMins} onChange={e => setPlanForm({...planForm, includedCallMins: parseInt(e.target.value, 10)})} />
                </div>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Özellikler (Virgülle ayırın)</label>
                <input style={styles.input} value={planForm.features} onChange={e => setPlanForm({...planForm, features: e.target.value})} />
              </div>
              <button type="submit" style={{ ...styles.button, width: '100%', marginTop: '16px' }}>Kaydet</button>
            </form>
          </div>
        </div>
      )}

      {/* PAYMENT MODAL */}
      {showPaymentModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>Ödeme Kaydet</h2>
              <button onClick={() => setShowPaymentModal(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}>&times;</button>
            </div>
            <form onSubmit={handleSavePayment}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Tutar ($)</label>
                <input type="number" required style={styles.input} value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: parseFloat(e.target.value)})} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Ödeme Yöntemi</label>
                <select style={styles.input} value={paymentForm.method} onChange={e => setPaymentForm({...paymentForm, method: e.target.value})}>
                  <option value="CREDIT_CARD">Kredi Kartı / Stripe</option>
                  <option value="BANK_TRANSFER">Banka Havalesi</option>
                  <option value="CASH">Nakit / Diğer</option>
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Referans No (Opsiyonel)</label>
                <input style={styles.input} value={paymentForm.reference} onChange={e => setPaymentForm({...paymentForm, reference: e.target.value})} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Notlar</label>
                <input style={styles.input} value={paymentForm.notes} onChange={e => setPaymentForm({...paymentForm, notes: e.target.value})} />
              </div>
              <button type="submit" style={{ ...styles.button, ...styles.buttonSuccess, width: '100%', marginTop: '16px' }}>Ödemeyi Kaydet</button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
