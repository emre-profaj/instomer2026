import React, { useState, useEffect } from 'react';
import FlowBuilder from '../Automations/FlowBuilder';
import { adminAPI } from '../../services/api';
import './AdminSettings.css'; // Reuse some basic styles, or inline styles for modal

export default function AdminFlowTemplates() {
    const [workspaces, setWorkspaces] = useState([]);
    const [importModal, setImportModal] = useState({ open: false, template: null });
    const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
    const [importing, setImporting] = useState(false);

    useEffect(() => {
        // Load workspaces for the import dropdown
        adminAPI.getWorkspaces()
            .then(res => {
                setWorkspaces(res.data.workspaces || []);
            })
            .catch(err => console.error('Failed to load workspaces:', err));
    }, []);

    const handleImportClick = (template) => {
        setImportModal({ open: true, template });
        setSelectedWorkspaceId('');
    };

    const confirmImport = async () => {
        if (!selectedWorkspaceId) {
            alert('Lütfen bir workspace seçin');
            return;
        }

        setImporting(true);
        try {
            await adminAPI.importFlowTemplate(importModal.template.id, selectedWorkspaceId);
            alert('Şablon başarıyla aktarıldı!');
            setImportModal({ open: false, template: null });
        } catch (error) {
            console.error('Import error:', error);
            alert(error.response?.data?.error || 'Aktarım başarısız oldu');
        } finally {
            setImporting(false);
        }
    };

    const generateHospitalTemplate = async () => {
        if (!confirm('Hazır Hastane Şablonunu oluşturmak istiyor musunuz?')) return;
        try {
            // 1. Create empty template
            const res = await adminAPI.createFlowTemplate({
                name: 'Hastane / Klinik Randevu Akışı',
                description: 'Instagram/Inbox randevu yönlendirme şablonu',
                trigger: 'FIRST_MSG'
            });
            
            const templateId = res.data.template.id;

            // 2. Define steps
            const hospitalSteps = [
                {
                    id: "step_1_" + Date.now(),
                    type: "SEND_MESSAGE",
                    config: { message: "Merhabalar. Size nasıl yardımcı olabilirim?" }
                },
                {
                    id: "step_2_" + Date.now(),
                    type: "CONDITION",
                    config: {
                        condition: "MSG_CONTAINS",
                        keywords: "randevu",
                        matchMode: "any",
                        yesBranch: [
                            {
                                id: "step_3_" + Date.now(),
                                type: "SEND_MESSAGE",
                                config: { message: "Ameliyat randevusu mu muayene randevusu mu?" }
                            },
                            {
                                id: "step_4_" + Date.now(),
                                type: "CONDITION",
                                config: {
                                    condition: "MSG_CONTAINS",
                                    keywords: "muayene",
                                    matchMode: "any",
                                    yesBranch: [
                                        {
                                            id: "step_5_" + Date.now(),
                                            type: "SEND_MESSAGE",
                                            config: { message: "Hemen randevu asistanına sizi yönlendiriyorum." }
                                        },
                                        {
                                            id: "step_6_" + Date.now(),
                                            type: "SWITCH_FLOW",
                                            config: { flowId: "" } // Doldurulacak
                                        },
                                        {
                                            id: "step_7_" + Date.now(),
                                            type: "CONVERT_TO_OPP",
                                            config: { detail: "Randevu talebi alındı" }
                                        },
                                        {
                                            id: "step_8_" + Date.now(),
                                            type: "SEND_MESSAGE",
                                            config: { message: "Hangi bölümden randevu istersiniz?" }
                                        },
                                        {
                                            id: "step_9_" + Date.now(),
                                            type: "WAIT",
                                            config: { amount: 1, unit: "dakika" }
                                        },
                                        {
                                            id: "step_10_" + Date.now(),
                                            type: "SEND_MESSAGE",
                                            config: { message: "Tarih önerisi: Lütfen uygun bir tarih seçiniz." }
                                        },
                                        {
                                            id: "step_11_" + Date.now(),
                                            type: "WAIT",
                                            config: { amount: 1, unit: "dakika" }
                                        },
                                        {
                                            id: "step_12_" + Date.now(),
                                            type: "SEND_MESSAGE",
                                            config: { message: "Lütfen iletişim bilgilerinizi giriniz." }
                                        },
                                        {
                                            id: "step_13_" + Date.now(),
                                            type: "CONDITION",
                                            config: {
                                                condition: "HAS_PHONE",
                                                keywords: "",
                                                matchMode: "any",
                                                yesBranch: [
                                                    {
                                                        id: "step_14_" + Date.now(),
                                                        type: "SEND_MESSAGE",
                                                        config: { message: "Randevunuz oluşturuldu." }
                                                    },
                                                    {
                                                        id: "step_15_" + Date.now(),
                                                        type: "CONVERT_TO_OPP",
                                                        config: { detail: "Randevu verildi" }
                                                    },
                                                    {
                                                        id: "step_16_" + Date.now(),
                                                        type: "SEND_MESSAGE",
                                                        config: { message: "Randevu bilgilerinizi WhatsApp'tan gönderdik. Hastanemizin konumu: https://maps.google.com/..." }
                                                    }
                                                ],
                                                noBranch: []
                                            }
                                        }
                                    ],
                                    noBranch: []
                                }
                            }
                        ],
                        noBranch: []
                    }
                }
            ];

            // 3. Update template with steps
            await adminAPI.updateFlowTemplate(templateId, { steps: hospitalSteps });
            
            alert('Hastane şablonu başarıyla oluşturuldu! Sayfayı yenileyerek görebilirsiniz.');
            window.location.reload();
        } catch (error) {
            console.error('Generate template error:', error);
            alert('Şablon oluşturulurken hata oluştu');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div style={{ padding: '20px', backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0, color: '#111827' }}>Akış Şablonları</h1>
                    <p style={{ color: '#6b7280', margin: '4px 0 0 0' }}>
                        Burada oluşturduğunuz akışları müşterilerin çalışma alanlarına tek tıkla aktarabilirsiniz.
                    </p>
                </div>
                <button 
                    onClick={generateHospitalTemplate}
                    style={{ 
                        backgroundColor: '#10b981', color: '#fff', padding: '8px 16px', 
                        border: 'none', borderRadius: '6px', fontWeight: 500, cursor: 'pointer' 
                    }}
                >
                    + Hazır Hastane Şablonu Üret
                </button>
            </div>

            <div style={{ flex: 1, position: 'relative' }}>
                <FlowBuilder isTemplateMode={true} onImportTemplate={handleImportClick} />
            </div>

            {/* Aktarım Modalı */}
            {importModal.open && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{
                        backgroundColor: '#fff', padding: '24px', borderRadius: '8px',
                        width: '400px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}>
                        <h2 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>
                            "{importModal.template?.name}" Şablonunu Aktar
                        </h2>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Hedef Workspace Seçin</label>
                            <select
                                value={selectedWorkspaceId}
                                onChange={e => setSelectedWorkspaceId(e.target.value)}
                                style={{
                                    width: '100%', padding: '8px', border: '1px solid #d1d5db',
                                    borderRadius: '4px', outline: 'none'
                                }}
                            >
                                <option value="">Workspace seçin...</option>
                                {workspaces.map(w => (
                                    <option key={w.id} value={w.id}>{w.name}</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button
                                onClick={() => setImportModal({ open: false, template: null })}
                                style={{ padding: '8px 16px', background: '#f3f4f6', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                İptal
                            </button>
                            <button
                                onClick={confirmImport}
                                disabled={importing}
                                style={{ padding: '8px 16px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                {importing ? 'Aktarılıyor...' : 'Aktar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
