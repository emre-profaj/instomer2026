import re

with open("src/pages/Settings/CaseTypesAndTopics.jsx", "r") as f:
    content = f.read()

# Remove import TopicCategories
content = re.sub(r"import TopicCategories from '\./TopicCategories';\n", "", content)

# Change right panel
right_panel_old = """            {/* RIGHT PANEL: Topics (TopicCategory) */}
            <div className="ct-main-content">
                {selectedCaseTypeId ? (
                    <TopicCategories caseTypeId={selectedCaseTypeId} />
                ) : (
                    <div className="ct-empty-selection">
                        Sol taraftan bir vaka tipi seçin
                    </div>
                )}
            </div>"""

right_panel_new = """            {/* RIGHT PANEL: Edit Case Type */}
            <div className="ct-main-content">
                {selectedCaseTypeId ? (
                    (() => {
                        const ct = caseTypes.find(c => c.id === selectedCaseTypeId);
                        if (!ct) return <div className="ct-empty-selection">Bulunamadı</div>;
                        return (
                            <div className="ct-edit-panel" style={{ padding: '24px' }}>
                                <h3>Vaka Tipini Düzenle</h3>
                                <div className="ct-add-form" style={{ marginTop: '16px' }}>
                                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Vaka Tipi Adı</label>
                                    <input 
                                        type="text" 
                                        value={editForm.name !== undefined && editingId === ct.id ? editForm.name : ct.name}
                                        onChange={e => {
                                            if (editingId !== ct.id) {
                                                setEditingId(ct.id);
                                                setEditForm({...ct, name: e.target.value});
                                            } else {
                                                setEditForm({...editForm, name: e.target.value});
                                            }
                                        }}
                                        className="ct-input"
                                        style={{ marginBottom: '16px' }}
                                    />
                                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>İkon ve Renk</label>
                                    <div className="ct-form-row">
                                        <input 
                                            type="text" 
                                            value={editForm.icon !== undefined && editingId === ct.id ? editForm.icon : ct.icon} 
                                            onChange={e => {
                                                if (editingId !== ct.id) {
                                                    setEditingId(ct.id);
                                                    setEditForm({...ct, icon: e.target.value});
                                                } else {
                                                    setEditForm({...editForm, icon: e.target.value});
                                                }
                                            }} 
                                            className="ct-input-icon" 
                                        />
                                        <input 
                                            type="color" 
                                            value={editForm.color !== undefined && editingId === ct.id ? editForm.color : ct.color} 
                                            onChange={e => {
                                                if (editingId !== ct.id) {
                                                    setEditingId(ct.id);
                                                    setEditForm({...ct, color: e.target.value});
                                                } else {
                                                    setEditForm({...editForm, color: e.target.value});
                                                }
                                            }} 
                                            className="ct-input-color" 
                                        />
                                    </div>
                                    <div style={{ marginTop: '24px' }}>
                                        <button 
                                            onClick={() => handleUpdate(ct.id)} 
                                            className="btn-submit-ct"
                                            disabled={editingId !== ct.id}
                                            style={{ opacity: editingId !== ct.id ? 0.5 : 1 }}
                                        >
                                            Değişiklikleri Kaydet
                                        </button>
                                        {editingId === ct.id && (
                                            <button 
                                                onClick={() => setEditingId(null)} 
                                                className="btn-cancel" 
                                                style={{ marginLeft: '12px' }}
                                            >
                                                İptal
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })()
                ) : (
                    <div className="ct-empty-selection">
                        Sol taraftan bir vaka tipi seçin
                    </div>
                )}
            </div>"""

content = content.replace(right_panel_old, right_panel_new)

with open("src/pages/Settings/CaseTypesAndTopics.jsx", "w") as f:
    f.write(content)
