import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getCaseTypes, createCaseType, updateCaseType, deleteCaseType } from '../../services/caseType.api';
import TopicCategories from './TopicCategories';
import './CaseTypesAndTopics.css';

const CaseTypesAndTopics = () => {
    const { currentWorkspace } = useAuth();
    const workspaceId = currentWorkspace?.id;

    const [caseTypes, setCaseTypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedCaseTypeId, setSelectedCaseTypeId] = useState(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newCaseType, setNewCaseType] = useState({ name: '', color: '#3b82f6', icon: '📋' });
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});

    useEffect(() => {
        if (workspaceId) {
            fetchCaseTypes();
        }
    }, [workspaceId]);

    const fetchCaseTypes = async () => {
        try {
            const res = await getCaseTypes(workspaceId);
            setCaseTypes(res.data || []);
            if (res.data?.length > 0 && !selectedCaseTypeId) {
                setSelectedCaseTypeId(res.data[0].id);
            }
            setLoading(false);
        } catch (error) {
            console.error('Error fetching case types:', error);
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!newCaseType.name) return;
        try {
            const res = await createCaseType(workspaceId, newCaseType);
            setCaseTypes([...caseTypes, res.data]);
            setNewCaseType({ name: '', color: '#3b82f6', icon: '📋' });
            setShowAddForm(false);
            if (!selectedCaseTypeId) setSelectedCaseTypeId(res.data.id);
        } catch (err) {
            console.error(err);
        }
    };

    const handleUpdate = async (id) => {
        try {
            const res = await updateCaseType(workspaceId, id, editForm);
            setCaseTypes(caseTypes.map(c => c.id === id ? res.data : c));
            setEditingId(null);
        } catch (err) {
            console.error(err);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Bu vaka tipini silmek istediğinize emin misiniz? Altındaki vakalar etkilenebilir.')) return;
        try {
            await deleteCaseType(workspaceId, id);
            setCaseTypes(caseTypes.filter(c => c.id !== id));
            if (selectedCaseTypeId === id) setSelectedCaseTypeId(null);
        } catch (err) {
            console.error(err);
        }
    };

    if (loading) return <div className="ct-empty-selection">Yükleniyor...</div>;

    return (
        <div className="case-types-container">
            {/* LEFT PANEL: Case Types */}
            <div className="case-types-sidebar">
                <div className="ct-sidebar-header">
                    <h2>Vaka Tipleri</h2>
                    <button onClick={() => setShowAddForm(!showAddForm)} className="btn-add-ct">
                        {showAddForm ? '✕' : '+'}
                    </button>
                </div>
                
                {showAddForm && (
                    <div className="ct-add-form">
                        <input 
                            type="text" 
                            placeholder="Vaka Tipi Adı (Örn. Fırsat)" 
                            value={newCaseType.name}
                            onChange={e => setNewCaseType({...newCaseType, name: e.target.value})}
                            className="ct-input"
                        />
                        <div className="ct-form-row">
                            <input 
                                type="text" 
                                placeholder="İkon" 
                                value={newCaseType.icon}
                                onChange={e => setNewCaseType({...newCaseType, icon: e.target.value})}
                                className="ct-input-icon"
                            />
                            <input 
                                type="color" 
                                value={newCaseType.color}
                                onChange={e => setNewCaseType({...newCaseType, color: e.target.value})}
                                className="ct-input-color"
                            />
                            <button onClick={handleCreate} className="btn-submit-ct">Ekle</button>
                        </div>
                    </div>
                )}

                <div className="ct-list">
                    {caseTypes.map(ct => (
                        <div 
                            key={ct.id} 
                            onClick={() => setSelectedCaseTypeId(ct.id)}
                            className={`ct-item ${selectedCaseTypeId === ct.id ? 'active' : ''}`}
                        >
                            {editingId === ct.id ? (
                                <div className="ct-add-form" onClick={e => e.stopPropagation()}>
                                    <input 
                                        type="text" 
                                        value={editForm.name}
                                        onChange={e => setEditForm({...editForm, name: e.target.value})}
                                        className="ct-input"
                                    />
                                    <div className="ct-form-row">
                                        <input type="text" value={editForm.icon} onChange={e => setEditForm({...editForm, icon: e.target.value})} className="ct-input-icon" />
                                        <input type="color" value={editForm.color} onChange={e => setEditForm({...editForm, color: e.target.value})} className="ct-input-color" />
                                        <button onClick={() => handleUpdate(ct.id)} className="btn-submit-ct">Kaydet</button>
                                        <button onClick={() => setEditingId(null)} className="btn-cancel">İptal</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="ct-item-content">
                                        <span className="ct-icon-badge" style={{ backgroundColor: ct.color }}>
                                            {ct.icon}
                                        </span>
                                        <div>
                                            <div className="ct-title">{ct.name}</div>
                                            {ct.systemCode && <div className="ct-subtitle">Sistem: {ct.systemCode}</div>}
                                        </div>
                                    </div>
                                    <div className="ct-actions">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setEditingId(ct.id); setEditForm(ct); }}
                                            className="icon-btn"
                                        >
                                            ✏️
                                        </button>
                                        {!ct.systemCode && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleDelete(ct.id); }}
                                                className="icon-btn"
                                            >
                                                🗑️
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                    {caseTypes.length === 0 && !showAddForm && (
                        <div className="ct-empty-selection">
                            Henüz vaka tipi tanımlanmamış.
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT PANEL: Topics (TopicCategory) */}
            <div className="ct-main-content">
                {selectedCaseTypeId ? (
                    <TopicCategories caseTypeId={selectedCaseTypeId} />
                ) : (
                    <div className="ct-empty-selection">
                        Sol taraftan bir vaka tipi seçin
                    </div>
                )}
            </div>
        </div>
    );
};

export default CaseTypesAndTopics;
