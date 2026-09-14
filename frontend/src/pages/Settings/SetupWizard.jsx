import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { X, ChevronRight, Check, Plus, Building, Book, MapPin, Folder, Package, Workflow, Users, CheckCircle2 } from 'lucide-react';

const AIIcon = () => (
  <span 
    style={{ 
      display:'inline-block', 
      width:14, 
      height:10, 
      background:'linear-gradient(135deg,#E63B2E,#FF4521)', 
      borderRadius:1, 
      transform:'skewX(-25deg)',
      marginRight: 4
    }} 
  />
);

const STEPS = [
  { key: 'firma', label: 'Firma', icon: <Building size={16} /> },
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

  const progress = Math.round((activeStep / (STEPS.length - 1)) * 100);

  const handleNext = () => {
    if (activeStep < STEPS.length - 1) setActiveStep(activeStep + 1);
  };

  const handlePrev = () => {
    if (activeStep > 0) setActiveStep(activeStep - 1);
  };

  const handleComplete = () => {
    navigate('/base');
  };

  const renderFirma = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '600px' }}>
      <h2>Firma Bilgileri</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={labelStyle}>Firma Adı</label>
        <input type="text" defaultValue={currentWorkspace?.name || "Instomer"} style={inputStyle} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={labelStyle}>Sektör</label>
        <select style={inputStyle}>
          <option>Emlak / Gayrimenkul</option>
          <option>Otomotiv</option>
          <option>Perakende</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: '16px' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={labelStyle}>Lokasyon</label>
          <input type="text" defaultValue="İstanbul, Türkiye" style={inputStyle} />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={labelStyle}>Web Sitesi</label>
          <input type="text" defaultValue="https://instomer.com" style={inputStyle} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={labelStyle}>Çalışma Saatleri</label>
        {['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'].map(day => (
          <div key={day} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input type="checkbox" defaultChecked style={{ cursor: 'pointer' }} />
            <span style={{ width: '80px', fontSize: '14px' }}>{day}</span>
            <input type="time" defaultValue="09:00" style={inputStyle} />
            <span>-</span>
            <input type="time" defaultValue="18:00" style={inputStyle} />
          </div>
        ))}
      </div>
    </div>
  );

  const renderKB = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '600px' }}>
      <h2>Bilgi Bankası</h2>
      <p style={{ color: '#666', marginTop: 0 }}>AI Agentlar şirketiniz ve ürünleriniz hakkındaki bilgileri buradan öğrenir.</p>
      
      <div style={{ padding: '20px', border: '1px solid #eee', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '16px' }}>Web Sitesinden Çek</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input type="url" defaultValue="https://instomer.com/hakkimizda" style={{...inputStyle, flex: 1}} />
          <button style={secondaryBtnStyle}>Tara & Çek</button>
        </div>
      </div>

      <div style={{ padding: '20px', border: '1px solid #eee', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '16px' }}>Manuel Ekle</h3>
        <textarea rows={6} placeholder="Şirket politikaları, iade şartları, sık sorulan sorular vb. buraya yazın veya yapıştırın..." style={{...inputStyle, resize: 'vertical'}} defaultValue="Şirketimiz 2010 yılından beri gayrimenkul sektöründe öncü konumdadır. Komisyon oranımız standart %2'dir."></textarea>
      </div>
    </div>
  );

  const renderSubeler = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '800px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Şubeler</h2>
        <button style={primaryBtnStyle}><Plus size={16} /> Yeni Şube Ekle</button>
      </div>
      
      <div style={{ border: '1px solid #eee', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
          <span>Kadıköy Merkez Şube</span>
          <span style={{ color: '#22c55e', fontSize: '14px', fontWeight: 'normal' }}>Aktif</span>
        </div>
        <div style={{ color: '#666', fontSize: '14px' }}>Bağdat Cad. No:123 Kadıköy/İstanbul</div>
        <div style={{ color: '#666', fontSize: '14px' }}>+90 216 123 45 67 • 09:00 - 18:00</div>
      </div>

      <div style={{ border: '1px solid #eee', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
          <span>Beşiktaş Şube</span>
          <span style={{ color: '#22c55e', fontSize: '14px', fontWeight: 'normal' }}>Aktif</span>
        </div>
        <div style={{ color: '#666', fontSize: '14px' }}>Barbaros Bulvarı No:45 Beşiktaş/İstanbul</div>
        <div style={{ color: '#666', fontSize: '14px' }}>+90 212 987 65 43 • 09:00 - 18:00</div>
      </div>
    </div>
  );

  const renderKategoriler = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '600px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Kategoriler</h2>
        <button style={primaryBtnStyle}><Plus size={16} /> Kategori Ekle</button>
      </div>

      <div style={{ border: '1px solid #eee', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontWeight: 'bold' }}>Satılık Konut</div>
        <div style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '2px solid #eee' }}>
          <div style={{ fontSize: '14px' }}>Daire (Tüm Şubeler)</div>
          <div style={{ fontSize: '14px' }}>Villa (Sadece Kadıköy Merkez)</div>
        </div>
      </div>

      <div style={{ border: '1px solid #eee', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontWeight: 'bold' }}>Kiralık Konut</div>
        <div style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '2px solid #eee' }}>
          <div style={{ fontSize: '14px' }}>Daire (Tüm Şubeler)</div>
          <div style={{ fontSize: '14px' }}>Müstakil Ev (Tüm Şubeler)</div>
        </div>
      </div>
    </div>
  );

  const renderUrunler = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '800px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Ürünler / Portföyler</h2>
        <button style={primaryBtnStyle}><Plus size={16} /> Ürün Ekle</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <label style={{ fontSize: '14px', color: '#666' }}>Para Birimi:</label>
        <select style={{ ...inputStyle, width: 'auto', padding: '6px 10px' }}>
          <option>USD ($)</option>
          <option>EUR (€)</option>
          <option>TRY (₺)</option>
          <option>GBP (£)</option>
        </select>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #eee' }}>
            <th style={{ padding: '12px 8px' }}>Ürün Adı</th>
            <th style={{ padding: '12px 8px' }}>Kategori</th>
            <th style={{ padding: '12px 8px' }}>Fiyat</th>
            <th style={{ padding: '12px 8px' }}>Şubeler</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: '12px 8px', fontWeight: '500' }}>Kadıköy 3+1 Lüks Daire</td>
            <td style={{ padding: '12px 8px', color: '#666' }}>Satılık Konut / Daire</td>
            <td style={{ padding: '12px 8px' }}>$850,000</td>
            <td style={{ padding: '12px 8px' }}>Kadıköy Merkez</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: '12px 8px', fontWeight: '500' }}>Beşiktaş Kiralık 2+1</td>
            <td style={{ padding: '12px 8px', color: '#666' }}>Kiralık Konut / Daire</td>
            <td style={{ padding: '12px 8px' }}>$2,500 / ay</td>
            <td style={{ padding: '12px 8px' }}>Beşiktaş Şube</td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  const renderAkislar = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '800px' }}>
      <h2>Akışlar</h2>
      
      <div style={{ border: '1px solid #ccc', background: '#fafafa', borderRadius: '8px', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
            Genel Akış 🔒 
          </h3>
          <span style={{ color: '#E63B2E', fontSize: '12px', fontWeight: 'bold' }}>Varsayılan</span>
        </div>
        <p style={{ color: '#666', fontSize: '14px', marginBottom: 0 }}>Gelen tüm talepler için temel karşılama, bilgi toplama ve yönlendirme süreci.</p>
      </div>

      <div style={{ border: '1px solid #eee', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '16px' }}>Satış Akışı</h3>
          <button style={{ background: 'none', border: 'none', color: '#E63B2E', cursor: 'pointer', fontWeight: 'bold' }}>Düzenle</button>
        </div>
        <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>Case Tipi: <strong>Satın Alma Talebi</strong> → Satış Takımına Yönlendir</p>
      </div>

      <button style={{...secondaryBtnStyle, alignSelf: 'flex-start'}}><Plus size={16} /> Yeni Alt Akış</button>
    </div>
  );

  const renderTakimlar = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '800px' }}>
      <h2>Takımlar</h2>

      <div style={{ border: '1px solid #eee', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '16px' }}>Satış Ekibi</h3>
          <button style={secondaryBtnStyle}>Üye Davet Et</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f9f9f9', borderRadius: '6px' }}>
            <div style={{ fontSize: '14px' }}>
              <strong>Ahmet Yılmaz</strong> <span style={{ color: '#666' }}>(ahmet@instomer.com)</span>
            </div>
            <div style={{ fontSize: '13px', color: '#666' }}>Tüm Şubeler</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f9f9f9', borderRadius: '6px' }}>
            <div style={{ fontSize: '14px' }}>
              <strong>Ayşe Demir</strong> <span style={{ color: '#666' }}>(ayse@instomer.com)</span>
            </div>
            <div style={{ fontSize: '13px', color: '#666' }}>Kadıköy Merkez Şube</div>
          </div>
        </div>
      </div>
      
      <button style={{...secondaryBtnStyle, alignSelf: 'flex-start'}}><Plus size={16} /> Yeni Takım Ekle</button>
    </div>
  );

  const renderAgentlar = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '800px' }}>
      <h2>AI Agentlar</h2>
      
      <div style={{ border: '2px solid #E63B2E', borderRadius: '8px', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', fontSize: '16px' }}>
            <AIIcon /> Müşteri Temsilcisi (Chat)
          </h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', color: '#22c55e' }}>
            <input type="checkbox" defaultChecked /> Aktif
          </label>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={labelStyle}>Agent Yetenekleri (Capabilities)</label>
            <div style={{ display: 'flex', gap: '16px', fontSize: '14px' }}>
              <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><input type="checkbox" defaultChecked /> Randevu Oluşturma</label>
              <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><input type="checkbox" defaultChecked /> Fiyat Bilgisi Verme</label>
              <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><input type="checkbox" defaultChecked /> İnsan Temsilciye Aktarma</label>
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={labelStyle}>Sistem Promptu (Kişilik & Davranış)</label>
            <textarea rows={4} style={{...inputStyle, resize: 'vertical'}} defaultValue="Sen Instomer Emlak için profesyonel bir asistansın. Müşterilere kibar davran ve konut arayışlarında yardımcı ol. Fiyatları sadece portföyde varsa söyle." />
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={labelStyle}>Kullanılacak Şubeler</label>
            <div style={{ fontSize: '14px' }}>
              <label style={{ marginRight: '16px', cursor: 'pointer' }}><input type="checkbox" defaultChecked /> Tüm Şubeler</label>
            </div>
          </div>
        </div>
      </div>

      <div style={{ border: '1px solid #eee', borderRadius: '8px', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', fontSize: '16px' }}>
            <AIIcon /> Karşılama Sekreteri (Voice)
          </h3>
          <button style={secondaryBtnStyle}>Yapılandır</button>
        </div>
      </div>
    </div>
  );

  const renderOzet = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '800px' }}>
      <div style={{ background: '#dcfce7', color: '#166534', padding: '20px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <CheckCircle2 size={32} />
        <div>
          <h2 style={{ margin: '0 0 8px 0' }}>Harika! Kurulum tamamlandı.</h2>
          <p style={{ margin: 0, fontSize: '15px' }}>Sistemi hemen kullanmaya başlayabilirsiniz. İhtiyaç halinde ayarları daha sonra değiştirebilirsiniz.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
        {[
          { label: 'Firma', val: 'Instomer Real Estate' },
          { label: 'Bilgi Bankası', val: '2 Kaynak Eklendi' },
          { label: 'Şubeler', val: '2 Şube Tanımlandı' },
          { label: 'Kategoriler', val: '2 Ana Kategori' },
          { label: 'Ürünler', val: '2 Ürün/Portföy' },
          { label: 'Akışlar', val: 'Genel + 1 Alt Akış' },
          { label: 'Takımlar', val: '1 Takım, 2 Üye' },
          { label: 'AI Agentlar', val: '1 Chat Agent Aktif' },
        ].map((item, i) => (
          <div key={i} style={{ border: '1px solid #eee', padding: '16px', borderRadius: '8px' }}>
            <div style={{ color: '#666', fontSize: '13px', marginBottom: '4px' }}>{item.label}</div>
            <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{item.val}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderContent = () => {
    switch(STEPS[activeStep].key) {
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
      <div style={{ width: '260px', background: '#f8f9fa', borderRight: '1px solid #eee', display: 'flex', flexDirection: 'column', padding: '20px 0' }}>
        <div style={{ padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Kurulum</h2>
          <button onClick={() => navigate('/base')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }} title="Kapat">
            <X size={20} color="#666" />
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
                  padding: '12px 20px', 
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
                    top: '-12px', 
                    left: '27px', 
                    width: '2px', 
                    height: '24px', 
                    background: isDone || isActive ? '#22c55e' : '#eee',
                    zIndex: 0
                  }} />
                )}

                <div style={{ 
                  width: '16px', 
                  height: '16px', 
                  borderRadius: '50%', 
                  background: isActive ? '#E63B2E' : isDone ? '#22c55e' : '#eee',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '12px',
                  zIndex: 1,
                  boxShadow: '0 0 0 4px ' + (isActive ? '#fff' : '#f8f9fa')
                }}>
                  {isDone && <Check size={10} color="#fff" strokeWidth={3} />}
                </div>

                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  color: isActive ? '#E63B2E' : isDone ? '#333' : '#999',
                  fontWeight: isActive ? '600' : 'normal',
                  fontSize: '14px'
                }}>
                  {step.icon}
                  {step.label}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ padding: '20px' }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
            <span>İlerleme</span>
            <span>{progress}%</span>
          </div>
          <div style={{ width: '100%', height: '6px', background: '#eee', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: '#22c55e', transition: 'width 0.3s ease' }} />
          </div>
        </div>
      </div>

      {/* Right Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff' }}>
        <div style={{ flex: 1, padding: '40px 60px', overflowY: 'auto' }}>
          {renderContent()}
        </div>
        
        {/* Footer Navigation */}
        <div style={{ padding: '20px 60px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
          {activeStep > 0 ? (
            <button onClick={handlePrev} style={secondaryBtnStyle}>
              ← Geri
            </button>
          ) : (
            <div></div>
          )}
          
          {activeStep < STEPS.length - 1 ? (
            <button onClick={handleNext} style={primaryBtnStyle}>
              İleri →
            </button>
          ) : (
            <button onClick={handleComplete} style={{...primaryBtnStyle, background: '#22c55e'}}>
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
  border: '1px solid #ddd',
  borderRadius: '6px',
  fontSize: '14px',
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box'
};

const labelStyle = {
  fontWeight: '600',
  fontSize: '14px',
  color: '#333'
};

const primaryBtnStyle = {
  background: '#E63B2E',
  color: '#fff',
  border: 'none',
  padding: '10px 20px',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: '600',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
};

const secondaryBtnStyle = {
  background: '#fff',
  color: '#333',
  border: '1px solid #ddd',
  padding: '10px 20px',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: '500',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
};

export default SetupWizard;
