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

    if (loading) return <div className="p-8 text-center text-gray-500">Yükleniyor...</div>;

    return (
        <div className="case-types-container flex h-full h-[calc(100vh-64px)] overflow-hidden bg-gray-50">
            {/* LEFT PANEL: Case Types */}
            <div className="w-1/3 min-w-[300px] border-r border-gray-200 bg-white flex flex-col h-full overflow-y-auto">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 sticky top-0 z-10">
                    <h2 className="text-lg font-semibold text-gray-800">Vaka Tipleri</h2>
                    <button onClick={() => setShowAddForm(!showAddForm)} className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center hover:bg-blue-700 transition">
                        {showAddForm ? '✕' : '+'}
                    </button>
                </div>
                
                {showAddForm && (
                    <div className="p-4 bg-blue-50 border-b border-blue-100 flex flex-col gap-2">
                        <input 
                            type="text" 
                            placeholder="Vaka Tipi Adı (Örn. Fırsat)" 
                            value={newCaseType.name}
                            onChange={e => setNewCaseType({...newCaseType, name: e.target.value})}
                            className="p-2 border rounded border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                placeholder="İkon (Örn. 💼)" 
                                value={newCaseType.icon}
                                onChange={e => setNewCaseType({...newCaseType, icon: e.target.value})}
                                className="p-2 border rounded w-16 text-center"
                            />
                            <input 
                                type="color" 
                                value={newCaseType.color}
                                onChange={e => setNewCaseType({...newCaseType, color: e.target.value})}
                                className="p-1 border rounded w-12 h-10"
                            />
                            <button onClick={handleCreate} className="bg-blue-600 text-white px-4 py-2 rounded flex-1">Ekle</button>
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto">
                    {caseTypes.map(ct => (
                        <div 
                            key={ct.id} 
                            onClick={() => setSelectedCaseTypeId(ct.id)}
                            className={`p-4 border-b border-gray-100 cursor-pointer flex items-center justify-between group transition ${selectedCaseTypeId === ct.id ? 'bg-blue-50 border-l-4 border-blue-500' : 'hover:bg-gray-50 border-l-4 border-transparent'}`}
                        >
                            {editingId === ct.id ? (
                                <div className="flex flex-col gap-2 w-full" onClick={e => e.stopPropagation()}>
                                    <input 
                                        type="text" 
                                        value={editForm.name}
                                        onChange={e => setEditForm({...editForm, name: e.target.value})}
                                        className="p-1 border rounded"
                                    />
                                    <div className="flex gap-2">
                                        <input type="text" value={editForm.icon} onChange={e => setEditForm({...editForm, icon: e.target.value})} className="w-10 p-1 border rounded" />
                                        <input type="color" value={editForm.color} onChange={e => setEditForm({...editForm, color: e.target.value})} className="w-8 h-8 p-0 border-0" />
                                        <button onClick={() => handleUpdate(ct.id)} className="text-xs bg-green-500 text-white px-2 rounded">Kaydet</button>
                                        <button onClick={() => setEditingId(null)} className="text-xs bg-gray-300 px-2 rounded">İptal</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center gap-3">
                                        <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm" style={{ backgroundColor: ct.color }}>
                                            {ct.icon}
                                        </span>
                                        <div>
                                            <div className="font-medium text-gray-800">{ct.name}</div>
                                            {ct.systemCode && <div className="text-xs text-gray-400">Sistem: {ct.systemCode}</div>}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setEditingId(ct.id); setEditForm(ct); }}
                                            className="text-gray-400 hover:text-blue-600"
                                        >
                                            ✏️
                                        </button>
                                        {!ct.systemCode && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleDelete(ct.id); }}
                                                className="text-gray-400 hover:text-red-600"
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
                        <div className="p-8 text-center text-gray-500 text-sm">
                            Henüz vaka tipi tanımlanmamış.
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT PANEL: Topics (TopicCategory) */}
            <div className="w-2/3 h-full bg-white relative">
                {selectedCaseTypeId ? (
                    <TopicCategories caseTypeId={selectedCaseTypeId} />
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                        Sol taraftan bir vaka tipi seçin
                    </div>
                )}
            </div>
        </div>
    );
};

export default CaseTypesAndTopics;
