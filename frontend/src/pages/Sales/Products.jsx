import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { productAPI, funnelAPI, teamAPI, appointmentConfigAPI, woocommerceAPI } from '../../services/api';
import { Plus, Search, X, Edit2, Trash2, Package, Filter, Download, Upload, ChevronDown, Folder, Layers, Tag, Sparkles, Check, ShoppingCart, Users, AlertTriangle } from 'lucide-react';

import WooCommerceModal from '../../components/Sales/WooCommerceModal';
import { importFromExcel, getTopicCategories, createTopicCategory, updateTopicCategory, deleteTopicCategory, bulkDeleteTopicCategories } from '../../services/topicCategory.api';
import { getSectorLabels } from '../../utils/sectorLabels';
import './Sales.css';
import './Categories.css';

const catInitials = (name) => {
    const words = (name || '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
};

// branchIds ve keywords hem dizi hem JSON metni olarak gelebiliyor;
// keywords ayrıca virgüllü düz metin de olabiliyor (form onu öyle yazıyor).
const parseJsonList = (raw) => {
    if (Array.isArray(raw)) return raw;
    if (typeof raw !== 'string' || !raw.trim()) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const parseKeywordList = (raw) => {
    if (Array.isArray(raw)) return raw.filter(Boolean);
    if (typeof raw !== 'string' || !raw.trim()) return [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch { /* virgüllü metin olabilir */ }
    return raw.split(',').map(k => k.trim()).filter(Boolean);
};

const TAX_OPTIONS = [
    { value: '', label: 'Vergi Yok', rate: 0 },
    { value: 'KDV_1', label: 'KDV %1', rate: 1 },
    { value: 'KDV_10', label: 'KDV %10', rate: 10 },
    { value: 'KDV_20', label: 'KDV %20', rate: 20 },
    { value: 'OTV_10', label: 'ÖTV %10', rate: 10 },
    { value: 'OTV_20', label: 'ÖTV %20', rate: 20 },
    { value: 'OTV_40', label: 'ÖTV %40', rate: 40 },
    { value: 'OTV_50', label: 'ÖTV %50', rate: 50 },
    { value: 'OTV_80', label: 'ÖTV %80', rate: 80 },
];

const UNIT_OPTIONS = ['Adet', 'Kg', 'Lt', 'Metre', 'M²', 'M³', 'Paket', 'Kutu', 'Saat', 'Gün', 'Ay', 'Yıl', 'Hizmet'];

const Products = ({ embedded = false, activeTab: propActiveTab, onTabChange }) => {
    const { currentWorkspace } = useAuth();
    const labels = getSectorLabels(currentWorkspace?.industry);
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTabState, setActiveTabState] = useState(propActiveTab || searchParams.get('tab') || 'categories');

    useEffect(() => {
        if (propActiveTab && propActiveTab !== activeTabState) {
            setActiveTabState(propActiveTab);
            setPage(1);
            setSearch('');
        }
    }, [propActiveTab]);

    const activeTab = propActiveTab || activeTabState;

    const handleTabChange = (newTab) => {
        setActiveTabState(newTab);
        if (onTabChange) {
            onTabChange(newTab);
        }
        if (!embedded) {
            setSearchParams({ tab: newTab });
        }
    };
    const fileInputRef = useRef(null);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [groupFilter, setGroupFilter] = useState('');
    const [groups, setGroups] = useState([]);
    const [categories, setCategories] = useState([]);
    const [categoriesLoading, setCategoriesLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [categoryFilter, setCategoryFilter] = useState('');
    const [funnels, setFunnels] = useState([]);
    const [teams, setTeams] = useState([]);
    const [branches, setBranches] = useState([]);
    const [branchFilter, setBranchFilter] = useState('');
    
    // Category Modal State
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [editingCategory, setEditingCategory] = useState(null);
    const [categoryForm, setCategoryForm] = useState({ name: '', description: '', icon: '', color: '#6366f1', keywords: '', customFields: [], defaultFunnelId: '', defaultTeamId: '', branchIds: [] });
    const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
    const branchDropdownRef = useRef(null);

    // Group Modal State
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [editingGroup, setEditingGroup] = useState(null);
    const [groupForm, setGroupForm] = useState({ name: '', description: '', categoryId: '' });

    // WooCommerce Modal State
    const [showWooModal, setShowWooModal] = useState(false);
    const [wooConfig, setWooConfig] = useState(null);

    const pageSize = 25;

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [saving, setSaving] = useState(false);

    // Delete confirm & Bulk selections
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [selectedProductIds, setSelectedProductIds] = useState([]);
    const [selectedCategoryIds, setSelectedCategoryIds] = useState([]);
    const [expandedCategoryId, setExpandedCategoryId] = useState(null);
    const [expandedGroupId, setExpandedGroupId] = useState(null);
    const [selectedGroupIds, setSelectedGroupIds] = useState([]);
    const [bulkActionLoading, setBulkActionLoading] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        parentId: '',
        categoryId: '',
        unit: 'Adet',
        price: '',
        priceUSD: '',
        priceEUR: '',
        priceGBP: '',
        discountedPrice: '',
        tax1Type: '',
        tax1Rate: 0,
        tax2Type: '',
        tax2Rate: 0,
        aiContext: '',
        features: [],
        allBranches: true,
        productBranches: [],
    });

    // Toast
    const [toast, setToast] = useState(null);
    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => {
        if (currentWorkspace?.id) {
            fetchProducts();
            fetchGroups();
            fetchCategories();
            fetchFunnels();
            fetchTeams();
            fetchBranches();
            fetchWooConfig();
        }
    }, [currentWorkspace?.id, search, groupFilter, categoryFilter, page, activeTab]);

    useEffect(() => {
        setSelectedProductIds([]);
        setSelectedCategoryIds([]);
        setSelectedGroupIds([]);
    }, [activeTab, page, categoryFilter, groupFilter, search, branchFilter]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (branchDropdownRef.current && !branchDropdownRef.current.contains(e.target)) {
                setBranchDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    async function fetchBranches() {
        try {
            const res = await appointmentConfigAPI.getBranches(currentWorkspace.id);
            setBranches(res.data?.branches || []);
        } catch (err) {
            console.error('Failed to fetch branches:', err);
        }
    };

    async function fetchFunnels() {
        try {
            const res = await funnelAPI.getAll(currentWorkspace.id);
            setFunnels(res.data.funnels || res.data || []);
        } catch (err) {
            console.error('Failed to fetch funnels:', err);
        }
    };

    async function fetchTeams() {
        try {
            const res = await teamAPI.getWorkspaceTeams(currentWorkspace.id);
            setTeams(res.data.teams || res.data || []);
        } catch (err) {
            console.error('Failed to fetch teams:', err);
        }
    };

    async function fetchWooConfig() {
        if (!currentWorkspace?.id) return;
        try {
            const res = await woocommerceAPI.getConfig(currentWorkspace.id);
            if (res.data?.success) {
                setWooConfig(res.data.data);
            }
        } catch (err) {
            // Silently catch
        }
    };

    async function fetchCategories() {
        try {
            setCategoriesLoading(true);
            const res = await getTopicCategories(currentWorkspace.id);
            setCategories(res.data.categories || res.data || []);
        } catch (err) {
            console.error('Failed to fetch categories:', err);
        } finally {
            setCategoriesLoading(false);
        }
    };

    async function fetchProducts() {
        try {
            setLoading(true);
            const params = { limit: pageSize, page, offset: (page - 1) * pageSize };
            if (search) params.search = search;
            if (activeTab === 'productGroups') {
                params.isGroup = true;
                if (categoryFilter) params.categoryId = categoryFilter;
            } else if (activeTab === 'products') {
                params.isGroup = false;
                if (categoryFilter) params.categoryId = categoryFilter;
                if (groupFilter) params.parentId = groupFilter;
            }
            const res = await productAPI.getAll(currentWorkspace.id, params);
            setProducts(res.data.products || []);
            setTotal(res.data.pagination?.total || res.data.total || 0);
        } catch (err) {
            console.error('Failed to fetch products:', err);
        } finally {
            setLoading(false);
        }
    };

    async function fetchGroups() {
        try {
            const res = await productAPI.getAll(currentWorkspace.id, { isGroup: true, limit: 1000 });
            const raw = res.data.products || [];
            // groups could be [{groupName:'x', count:1}] or ['x','y'] — normalize to string array
            setGroups(raw);
        } catch (err) {
            console.error('Failed to fetch groups:', err);
        }
    };

    const resetForm = () => {
        setFormData({
            name: '', description: '', parentId: '', categoryId: '', unit: 'Adet',
            price: '', priceUSD: '', priceEUR: '', priceGBP: '',
            discountedPrice: '', tax1Type: '', tax1Rate: 0, tax2Type: '', tax2Rate: 0,
            aiContext: '', features: [],
            allBranches: true,
            productBranches: branches.map(b => ({
                branchId: b.id,
                branchName: b.name,
                isAvailable: true,
                price: ''
            }))
        });
        setEditingProduct(null);
    };


    const openAddCategory = () => {
        setEditingCategory(null);
        setCategoryForm({
            name: '',
            description: '',
            icon: '',
            color: '#6366f1',
            keywords: '',
            customFields: [],
            defaultFunnelId: '',
            defaultTeamId: '',
            branchIds: branchFilter ? [branchFilter] : []
        });
        setBranchDropdownOpen(false);
        setShowCategoryModal(true);
    };

    const openEditCategory = (c) => {
        setEditingCategory(c);

        // Safe branchIds parsing
        let parsedBranchIds = [];
        if (c.branchIds) {
            if (Array.isArray(c.branchIds)) {
                parsedBranchIds = c.branchIds;
            } else if (typeof c.branchIds === 'string') {
                try {
                    const parsed = JSON.parse(c.branchIds);
                    parsedBranchIds = Array.isArray(parsed) ? parsed : [];
                } catch {
                    parsedBranchIds = [];
                }
            }
        }

        // Safe customFields parsing
        let parsedCustomFields = [];
        if (c.customFields) {
            if (Array.isArray(c.customFields)) {
                parsedCustomFields = c.customFields;
            } else if (typeof c.customFields === 'string') {
                try {
                    const parsed = JSON.parse(c.customFields);
                    parsedCustomFields = Array.isArray(parsed) ? parsed : [];
                } catch {
                    parsedCustomFields = [];
                }
            }
        }

        // Safe keywords parsing (show as comma-separated string)
        let parsedKeywords = '';
        if (c.keywords) {
            if (Array.isArray(c.keywords)) {
                parsedKeywords = c.keywords.join(', ');
            } else if (typeof c.keywords === 'string') {
                try {
                    const parsed = JSON.parse(c.keywords);
                    parsedKeywords = Array.isArray(parsed) ? parsed.join(', ') : (parsed || '');
                } catch {
                    parsedKeywords = c.keywords;
                }
            }
        }

        setCategoryForm({
            name: c.name || '',
            description: c.description || '',
            icon: c.icon || '',
            color: c.color || '#6366f1',
            keywords: parsedKeywords,
            customFields: parsedCustomFields,
            defaultFunnelId: c.defaultFunnelId || '',
            defaultTeamId: c.defaultTeamId || '',
            branchIds: parsedBranchIds
        });
        setBranchDropdownOpen(false);
        setShowCategoryModal(true);
    };

    const getCategoryBranchLabel = (cat) => {
        if (!cat?.branchIds) return '';
        try {
            const bIds = typeof cat.branchIds === 'string' ? JSON.parse(cat.branchIds) : cat.branchIds;
            if (Array.isArray(bIds) && bIds.length > 0) {
                const matched = branches.filter(b => bIds.includes(b.id)).map(b => b.name);
                if (matched.length > 0) {
                    return ` (${matched.join(', ')})`;
                }
            }
        } catch {}
        return '';
    };

    const handleSaveCategory = async (e) => {
        e.preventDefault();
        try {
            const rawKeywords = categoryForm.keywords || '';
            const keywordList = typeof rawKeywords === 'string'
                ? rawKeywords.split(',').map(k => k.trim()).filter(Boolean)
                : (Array.isArray(rawKeywords) ? rawKeywords : []);

            const validCustomFields = Array.isArray(categoryForm.customFields)
                ? categoryForm.customFields.filter(cf => cf && cf.key && cf.key.trim() !== '')
                : [];

            const validBranchIds = Array.isArray(categoryForm.branchIds)
                ? categoryForm.branchIds
                : [];

            const payload = {
                name: (categoryForm.name || '').trim(),
                description: categoryForm.description || '',
                color: categoryForm.color || '#6366f1',
                keywords: keywordList,
                customFields: validCustomFields,
                defaultFunnelId: categoryForm.defaultFunnelId || null,
                defaultTeamId: categoryForm.defaultTeamId || null,
                branchIds: validBranchIds
            };

            if (editingCategory) {
                await updateTopicCategory(currentWorkspace.id, editingCategory.id, payload);
                showToast('Kategori güncellendi');
            } else {
                await createTopicCategory(currentWorkspace.id, payload);
                showToast('Kategori eklendi');
            }
            setShowCategoryModal(false);
            fetchCategories();
        } catch (err) {
            console.error(err);
            showToast('Kategori kaydedilemedi', 'error');
        }
    };

    const handleDeleteCategory = async (id) => {
        if (!window.confirm('Kategoriyi silmek istediğinize emin misiniz?')) return;
        try {
            await deleteTopicCategory(currentWorkspace.id, id);
            showToast('Kategori silindi');
            fetchCategories();
        } catch (err) {
            console.error(err);
            showToast('Hata oluştu', 'error');
        }
    };

    const handleSaveGroup = async (e) => {
        e.preventDefault();
        try {
            const data = { ...groupForm, isGroup: true };
            if (editingGroup) {
                await productAPI.update(currentWorkspace.id, editingGroup.id, data);
                showToast('Grup güncellendi');
            } else {
                await productAPI.create(currentWorkspace.id, data);
                showToast('Grup eklendi');
            }
            setShowGroupModal(false);
            fetchProducts();
            fetchGroups();
        } catch (err) {
            console.error(err);
            showToast('Hata oluştu', 'error');
        }
    };

    const openAddModal = () => {
        resetForm();
        setShowModal(true);
    };

    const openEditModal = (product) => {
        setEditingProduct(product);
        const hasSpecificBranches = Array.isArray(product.productBranches) && product.productBranches.length > 0;
        const pbList = branches.map(b => {
            const match = product.productBranches?.find(pb => pb.branchId === b.id);
            return {
                branchId: b.id,
                branchName: b.name,
                isAvailable: match ? match.isAvailable : !hasSpecificBranches,
                price: match && match.price !== null && match.price !== undefined ? match.price : ''
            };
        });

        setFormData({
            name: product.name || '',
            description: product.description || '',
            parentId: product.parentId || '',
            categoryId: product.categoryId || '',
            unit: product.unit || 'Adet',
            price: product.price ?? '',
            priceUSD: product.priceUSD ?? '',
            priceEUR: product.priceEUR ?? '',
            priceGBP: product.priceGBP ?? '',
            discountedPrice: product.discountedPrice ?? '',
            tax1Type: product.tax1Type || '',
            tax1Rate: product.tax1Rate || 0,
            tax2Type: product.tax2Type || '',
            tax2Rate: product.tax2Rate || 0,
            aiContext: product.aiContext || '',
            features: product.features || [],
            allBranches: !hasSpecificBranches,
            productBranches: pbList
        });
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            showToast('Ürün adı zorunludur.', 'error');
            return;
        }
        setSaving(true);
        try {
            let formattedBranches = [];
            if (!formData.allBranches) {
                formattedBranches = formData.productBranches.map(pb => ({
                    branchId: pb.branchId,
                    isAvailable: Boolean(pb.isAvailable),
                    price: pb.price !== '' && pb.price !== null && pb.price !== undefined ? parseFloat(pb.price) : null
                }));
            }

            const data = {
                ...formData,
                isGroup: false,
                price: parseFloat(formData.price) || 0,
                priceUSD: formData.priceUSD ? parseFloat(formData.priceUSD) : null,
                priceEUR: formData.priceEUR ? parseFloat(formData.priceEUR) : null,
                priceGBP: formData.priceGBP ? parseFloat(formData.priceGBP) : null,
                discountedPrice: formData.discountedPrice ? parseFloat(formData.discountedPrice) : null,
                tax1Rate: parseFloat(formData.tax1Rate) || 0,
                tax2Rate: parseFloat(formData.tax2Rate) || 0,
                aiContext: formData.aiContext,
                features: formData.features,
                productBranches: formattedBranches
            };
            if (editingProduct) {
                await productAPI.update(currentWorkspace.id, editingProduct.id, data);
                showToast('Ürün başarıyla güncellendi.');
            } else {
                await productAPI.create(currentWorkspace.id, data);
                showToast('Ürün başarıyla eklendi.');
            }
            setShowModal(false);
            resetForm();
            fetchProducts();
            fetchGroups();
        } catch (err) {
            console.error('Failed to save product:', err);
            showToast('Kayıt sırasında bir hata oluştu.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (productId) => {
        try {
            await productAPI.delete(currentWorkspace.id, productId);
            showToast('Ürün silindi.');
            setDeleteConfirm(null);
            fetchProducts();
            fetchGroups();
        } catch (err) {
            console.error('Failed to delete product:', err);
            showToast('Silme sırasında hata oluştu.', 'error');
        }
    };

    const toggleSelectAll = (items = products) => {
        if (items.length === 0) return;
        const allSelected = items.every(p => selectedProductIds.includes(p.id));
        if (allSelected) {
            const currentIds = new Set(items.map(p => p.id));
            setSelectedProductIds(prev => prev.filter(id => !currentIds.has(id)));
        } else {
            const currentIds = items.map(p => p.id);
            setSelectedProductIds(prev => Array.from(new Set([...prev, ...currentIds])));
        }
    };

    const toggleSelectProduct = (productId) => {
        setSelectedProductIds(prev =>
            prev.includes(productId) ? prev.filter(id => id !== productId) : [...prev, productId]
        );
    };

    const executeBulkDelete = async () => {
        if (!selectedProductIds.length) return;
        try {
            setBulkActionLoading(true);
            const count = selectedProductIds.length;
            await productAPI.bulkDelete(currentWorkspace.id, selectedProductIds);
            showToast(`${count} ürün başarıyla silindi.`);
            setSelectedProductIds([]);
            setDeleteConfirm(null);
            fetchProducts();
            fetchGroups();
        } catch (err) {
            console.error('Failed to bulk delete products:', err);
            showToast(err.response?.data?.error || 'Toplu silme sırasında hata oluştu.', 'error');
        } finally {
            setBulkActionLoading(false);
        }
    };

    const handleBulkUpdateCategory = async (targetCategoryId) => {
        if (!selectedProductIds.length) return;
        try {
            setBulkActionLoading(true);
            const count = selectedProductIds.length;
            await productAPI.bulkUpdate(currentWorkspace.id, {
                productIds: selectedProductIds,
                categoryId: targetCategoryId === 'NONE' ? null : targetCategoryId
            });
            showToast(`${count} ürünün kategorisi güncellendi.`);
            setSelectedProductIds([]);
            fetchProducts();
        } catch (err) {
            console.error('Failed to bulk update category:', err);
            showToast(err.response?.data?.error || 'Kategori güncellenirken hata oluştu.', 'error');
        } finally {
            setBulkActionLoading(false);
        }
    };

    const handleBulkUpdateGroup = async (targetGroupId) => {
        if (!selectedProductIds.length) return;
        try {
            setBulkActionLoading(true);
            const count = selectedProductIds.length;
            await productAPI.bulkUpdate(currentWorkspace.id, {
                productIds: selectedProductIds,
                parentId: targetGroupId === 'NONE' ? null : targetGroupId
            });
            showToast(`${count} ürünün grubu güncellendi.`);
            setSelectedProductIds([]);
            fetchProducts();
            fetchGroups();
        } catch (err) {
            console.error('Failed to bulk update group:', err);
            showToast(err.response?.data?.error || 'Grup güncellenirken hata oluştu.', 'error');
        } finally {
            setBulkActionLoading(false);
        }
    };

    // ─── Kategori / Proje Toplu İşlemleri ──────────────────────────
    const toggleSelectAllCategories = (displayedCategories) => {
        if (!displayedCategories || displayedCategories.length === 0) return;
        const allSelected = displayedCategories.every(c => selectedCategoryIds.includes(c.id));
        if (allSelected) {
            const currentIds = new Set(displayedCategories.map(c => c.id));
            setSelectedCategoryIds(prev => prev.filter(id => !currentIds.has(id)));
        } else {
            const currentIds = displayedCategories.map(c => c.id);
            setSelectedCategoryIds(prev => Array.from(new Set([...prev, ...currentIds])));
        }
    };

    const toggleSelectCategory = (categoryId) => {
        setSelectedCategoryIds(prev =>
            prev.includes(categoryId) ? prev.filter(id => id !== categoryId) : [...prev, categoryId]
        );
    };

    const executeBulkDeleteCategories = async () => {
        if (!selectedCategoryIds.length) return;
        try {
            setBulkActionLoading(true);
            const count = selectedCategoryIds.length;
            await bulkDeleteTopicCategories(currentWorkspace.id, selectedCategoryIds);
            showToast(`${count} ${labels.categorySingle.toLowerCase()} başarıyla silindi.`);
            setSelectedCategoryIds([]);
            setDeleteConfirm(null);
            fetchCategories();
            fetchProducts();
            fetchGroups();
        } catch (err) {
            console.error('Failed to bulk delete categories:', err);
            showToast(err.response?.data?.error || 'Toplu silme sırasında hata oluştu.', 'error');
        } finally {
            setBulkActionLoading(false);
        }
    };

    // ─── Ürün Grubu / Daire Tipi Toplu İşlemleri ───────────────────
    const toggleSelectAllGroups = () => {
        if (products.length === 0) return;
        const allSelected = products.every(p => selectedGroupIds.includes(p.id));
        if (allSelected) {
            const currentIds = new Set(products.map(p => p.id));
            setSelectedGroupIds(prev => prev.filter(id => !currentIds.has(id)));
        } else {
            const currentIds = products.map(p => p.id);
            setSelectedGroupIds(prev => Array.from(new Set([...prev, ...currentIds])));
        }
    };

    const toggleSelectGroup = (groupId) => {
        setSelectedGroupIds(prev =>
            prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
        );
    };

    const executeBulkDeleteGroups = async () => {
        if (!selectedGroupIds.length) return;
        try {
            setBulkActionLoading(true);
            const count = selectedGroupIds.length;
            await productAPI.bulkDelete(currentWorkspace.id, selectedGroupIds);
            showToast(`${count} ${labels.groupSingle.toLowerCase()} başarıyla silindi.`);
            setSelectedGroupIds([]);
            setDeleteConfirm(null);
            fetchGroups();
            fetchProducts();
        } catch (err) {
            console.error('Failed to bulk delete groups:', err);
            showToast(err.response?.data?.error || 'Toplu silme sırasında hata oluştu.', 'error');
        } finally {
            setBulkActionLoading(false);
        }
    };

    const handleBulkUpdateGroupCategory = async (targetCategoryId) => {
        if (!selectedGroupIds.length) return;
        try {
            setBulkActionLoading(true);
            const count = selectedGroupIds.length;
            await productAPI.bulkUpdate(currentWorkspace.id, {
                productIds: selectedGroupIds,
                categoryId: targetCategoryId === 'NONE' ? null : targetCategoryId
            });
            showToast(`${count} ${labels.groupSingle.toLowerCase()} kategorisi güncellendi.`);
            setSelectedGroupIds([]);
            fetchProducts();
            fetchGroups();
        } catch (err) {
            console.error('Failed to bulk update group category:', err);
            showToast(err.response?.data?.error || 'Kategori güncellenirken hata oluştu.', 'error');
        } finally {
            setBulkActionLoading(false);
        }
    };

    const handleTaxChange = (field, value) => {
        const tax = TAX_OPTIONS.find(t => t.value === value);
        if (field === 'tax1Type') {
            setFormData(prev => ({ ...prev, tax1Type: value, tax1Rate: tax ? tax.rate : 0 }));
        } else {
            setFormData(prev => ({ ...prev, tax2Type: value, tax2Rate: tax ? tax.rate : 0 }));
        }
    };

    const addFeature = () => {
        setFormData(prev => ({ ...prev, features: [...prev.features, { featureKey: '', featureValue: '' }] }));
    };

    const updateFeature = (index, field, value) => {
        const newFeatures = [...formData.features];
        newFeatures[index][field] = value;
        setFormData(prev => ({ ...prev, features: newFeatures }));
    };

    const removeFeature = (index) => {
        const newFeatures = [...formData.features];
        newFeatures.splice(index, 1);
        setFormData(prev => ({ ...prev, features: newFeatures }));
    };

    const totalPages = Math.ceil(total / pageSize);

    const formatCurrency = (val, symbol = '₺') => {
        if (!val && val !== 0) return '—';
        return `${symbol}${Number(val).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const getTaxLabel = (type) => {
        const tax = TAX_OPTIONS.find(t => t.value === type);
        return tax ? tax.label : '—';
    };

    const handleExportCSV = () => {
        if (products.length === 0) return;
        const headers = ['Ürün Adı', 'Açıklama', 'Grup', 'Birim', 'Fiyat (TL)', 'İndirimli Fiyat', 'Vergi 1', 'Vergi 2'];
        const rows = products.map(p => [
            p.name, p.description || '', (groups.find(g => g.id === p.parentId)?.name) || '', p.unit || '',
            p.price || 0, p.discountedPrice || '', getTaxLabel(p.tax1Type), getTaxLabel(p.tax2Type)
        ]);
        const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'urunler.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleExcelImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            setLoading(true);
            showToast('📊 Excel analiz ediliyor...', 'info');

            // Tarayıcıda Excel parse et
            const XLSX = await import('xlsx');
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);

            let textContent = '';
            for (const sheetName of workbook.SheetNames) {
                const sheet = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                textContent += `--- Sayfa: ${sheetName} ---\n`;
                if (rows[0]) textContent += `Başlıklar: ${rows[0].join(' | ')}\n`;
                textContent += rows.slice(1, 300).map(r => r.join(' | ')).join('\n') + '\n\n';
            }

            if (!textContent.trim()) {
                showToast('Dosya boş veya okunamadı.', 'error');
                return;
            }

            // Metin olarak backend'e gönder
            const res = await importFromExcel(currentWorkspace.id, textContent);
            const p = res.data.products;
            const c = res.data.categories;
            showToast(`✅ ${p.created} ürün + ${c.created} kategori oluşturuldu!`);
            fetchProducts();
            fetchGroups();
        } catch (error) {
            console.error('Excel import error:', error);
            showToast(`❌ ${error.response?.data?.error || error.message}`, 'error');
        } finally {
            setLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    if (!currentWorkspace) {
        return <div className="empty-state"><p>Lütfen bir workspace seçin</p></div>;
    }

    return (
        <div
            className={`sales-page products-page ${embedded ? 'embedded' : ''}`}
            style={embedded ? (
                // Bölümler ve Gruplar sekmeleri kendi gri zeminini kuruyor;
                // beyaz kart çerçevesi içinde kalırsa zemin kutuya sıkışıyor
                // ve kenarlara uzanmasını sağlayan negatif kenar boşlukları
                // `overflow: hidden` ile kırpılıyor.
                (activeTab === 'categories' || activeTab === 'productGroups') ? {
                    // Gri zemin sayfanın kendisinde değil BURADA duruyor.
                    // Sebep: .base-content 24px 28px dolgulu ve sayfa bu
                    // sarmalayıcının içinde; negatif kenar boşluğunu sayfaya
                    // verince flex düzeninde dolgunun üzerine taşmıyor ve
                    // altta beyaz şerit kalıyordu. Sarmalayıcı dolguyu dört
                    // yandan iptal ediyor, min-height ikisini telafi ediyor.
                    padding: 0,
                    background: '#fafafb',
                    // ÜST dolgu bilerek iptal edilmiyor: sekme şeridi en üste
                    // yapışıyor ve üçüncü sekmeye geçildiğinde sayfa zıplıyor.
                    margin: '0 -28px -24px',
                    minHeight: 'calc(100% + 24px)',
                    display: 'flex',
                    flexDirection: 'column'
                } : {
                    padding: 0,
                    background: '#ffffff',
                    minHeight: 'auto',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }
            ) : undefined}
        >
            {/* Toast */}
            {toast && (
                <div style={{
                    position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
                    padding: '12px 20px', borderRadius: '10px',
                    background: toast.type === 'error' ? '#fef2f2' : '#f0fdf4',
                    color: toast.type === 'error' ? '#dc2626' : '#16a34a',
                    border: `1px solid ${toast.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
                    fontSize: '0.85rem', fontWeight: 600,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                    animation: 'slideInRight 0.3s ease'
                }}>
                    {toast.msg}
                </div>
            )}

            {/* Header */}
            {!embedded && (
                <div className="sales-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
                    <div>
                        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Package size={24} style={{ color: '#6366f1' }} />
                            {activeTab === 'categories' ? labels.categoriesTab : activeTab === 'productGroups' ? labels.productGroupsTab : labels.productsTab}
                        </h1>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 0' }}>
                            {activeTab === 'categories' ? `${categories.length} ${labels.categorySingle.toLowerCase()} kayıtlı` : activeTab === 'productGroups' ? `${groups.length} ${labels.groupSingle.toLowerCase()} kayıtlı` : `${total} ${labels.productSingle.toLowerCase()} kayıtlı`}
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {activeTab === 'categories' && (
                            <button
                                onClick={openAddCategory}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    padding: '8px 16px', borderRadius: '8px',
                                    border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                    fontSize: '0.8rem', fontWeight: 600, color: '#fff',
                                    cursor: 'pointer', transition: 'all 0.2s',
                                    boxShadow: '0 2px 8px rgba(99,102,241,0.3)'
                                }}
                            >
                                <Plus size={16} /> {labels.newCategory}
                            </button>
                        )}
                        {activeTab === 'productGroups' && (
                            <button
                                onClick={() => { setGroupForm({ name: '', description: '', categoryId: categoryFilter || '' }); setEditingGroup(null); setShowGroupModal(true); }}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    padding: '8px 16px', borderRadius: '8px',
                                    border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                    fontSize: '0.8rem', fontWeight: 600, color: '#fff',
                                    cursor: 'pointer', transition: 'all 0.2s',
                                    boxShadow: '0 2px 8px rgba(99,102,241,0.3)'
                                }}
                            >
                                <Plus size={16} /> {labels.newGroup}
                            </button>
                        )}
                        {activeTab === 'products' && (
                            <>
                                <button
                                    onClick={() => setShowWooModal(true)}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        padding: '8px 14px', borderRadius: '8px',
                                        border: '1px solid #ddd6fe', background: '#faf5ff',
                                        fontSize: '0.8rem', fontWeight: 600, color: '#7c3aed',
                                        cursor: 'pointer', transition: 'all 0.2s',
                                        boxShadow: '0 1px 2px rgba(124, 58, 237, 0.05)'
                                    }}
                                    title="WooCommerce REST API Entegrasyonu"
                                >
                                    <ShoppingCart size={15} /> WooCommerce
                                    {wooConfig?.isConfigured && (
                                        <span
                                            style={{
                                                width: '7px', height: '7px', borderRadius: '50%',
                                                background: wooConfig.isActive ? '#22c55e' : '#94a3b8',
                                                display: 'inline-block', marginLeft: '2px'
                                            }}
                                            title={wooConfig.isActive ? 'WooCommerce Bağlı & Aktif' : 'WooCommerce Devre Dışı'}
                                        />
                                    )}
                                </button>
                                <button
                                    onClick={handleExportCSV}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        padding: '8px 14px', borderRadius: '8px',
                                        border: '1px solid #e2e8f0', background: '#fff',
                                        fontSize: '0.8rem', fontWeight: 600, color: '#475569',
                                        cursor: 'pointer', transition: 'all 0.2s'
                                    }}
                                >
                                    <Download size={15} /> Dışa Aktar
                                </button>
                                <input
                                    type="file"
                                    accept=".xlsx, .xls"
                                    style={{ display: 'none' }}
                                    ref={fileInputRef}
                                    onChange={handleExcelImport}
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        padding: '8px 14px', borderRadius: '8px',
                                        border: '1px solid #e2e8f0', background: '#fff',
                                        fontSize: '0.8rem', fontWeight: 600, color: '#475569',
                                        cursor: 'pointer', transition: 'all 0.2s'
                                    }}
                                >
                                    <Upload size={15} /> İçe Aktar
                                </button>
                                <button
                                    onClick={openAddModal}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        padding: '8px 16px', borderRadius: '8px',
                                        border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                        fontSize: '0.8rem', fontWeight: 600, color: '#fff',
                                        cursor: 'pointer', transition: 'all 0.2s',
                                        boxShadow: '0 2px 8px rgba(99,102,241,0.3)'
                                    }}
                                >
                                    <Plus size={16} /> {labels.newProduct}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '20px', padding: '0 24px', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
                <button
                    onClick={() => { handleTabChange('categories'); setPage(1); setSearch(''); }}
                    style={{
                        padding: '12px 0', border: 'none', background: 'none',
                        fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                        color: activeTab === 'categories' ? '#6366f1' : '#64748b',
                        borderBottom: activeTab === 'categories' ? '2px solid #6366f1' : '2px solid transparent',
                        transition: 'all 0.2s'
                    }}
                >
                    {labels.categoriesTab}
                </button>
                <button
                    onClick={() => { handleTabChange('productGroups'); setPage(1); setSearch(''); setCategoryFilter(''); }}
                    style={{
                        padding: '12px 0', border: 'none', background: 'none',
                        fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                        color: activeTab === 'productGroups' ? '#6366f1' : '#64748b',
                        borderBottom: activeTab === 'productGroups' ? '2px solid #6366f1' : '2px solid transparent',
                        transition: 'all 0.2s'
                    }}
                >
                    {labels.productGroupsTab}
                </button>
                <button
                    onClick={() => { handleTabChange('products'); setPage(1); setSearch(''); setCategoryFilter(''); setGroupFilter(''); }}
                    style={{
                        padding: '12px 0', border: 'none', background: 'none',
                        fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                        color: activeTab === 'products' ? '#6366f1' : '#64748b',
                        borderBottom: activeTab === 'products' ? '2px solid #6366f1' : '2px solid transparent',
                        transition: 'all 0.2s'
                    }}
                >
                    {labels.productsTab}
                </button>
            </div>

            {activeTab === 'categories' && (
                <div className={`ct-page ${embedded ? 'embedded' : ''}`}>
                    {embedded && (
                        <div className="ct-head">
                            <div className="ct-eyebrow">Ayarlar · Firma &amp; Bilgi Bankası</div>
                            <h1>{labels.categoriesTab}</h1>
                            <p>{labels.categoriesDesc}</p>
                        </div>
                    )}

                    <div className="ct-filters">
                        <select
                            className="ct-select"
                            aria-label={`${labels.branchSingle || 'Şube'} süzgeci`}
                            value={branchFilter}
                            onChange={e => setBranchFilter(e.target.value)}
                        >
                            <option value="">{labels.allBranches || 'Tüm Şubeler'}</option>
                            {branches.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                        {branchFilter && (
                            <button type="button" className="ct-btn" onClick={() => setBranchFilter('')}>
                                <X size={13} /> Temizle
                            </button>
                        )}
                        <div className="ct-spacer"></div>
                        <button type="button" className="ct-btn ct-btn-primary" onClick={openAddCategory}>
                            <Plus size={14} /> {labels.newCategory}
                        </button>
                    </div>

                    <div className="ct-surface">
                        {categoriesLoading ? (
                            <div className="ct-empty"><p>Yükleniyor…</p></div>
                        ) : (() => {
                            const displayedCategories = categories.filter(c => {
                                if (!branchFilter) return true;
                                const bIds = parseJsonList(c.branchIds);
                                if (bIds.length === 0) return true;
                                return bIds.includes(branchFilter);
                            });

                            if (categories.length === 0) {
                                return (
                                    <div className="ct-empty">
                                        <div className="ct-empty-ico"><Layers size={24} /></div>
                                        <h3>Henüz {labels.categorySingle.toLowerCase()} eklenmemiş</h3>
                                        <p>{labels.categoriesDesc} Her {labels.categorySingle.toLowerCase()} için anahtar kelime tanımlayınca gelen mesajlar doğru ekibe düşer.</p>
                                        <button type="button" className="ct-btn ct-btn-primary" onClick={openAddCategory}>
                                            <Plus size={14} /> {labels.newCategory}
                                        </button>
                                    </div>
                                );
                            }

                            if (displayedCategories.length === 0) {
                                return (
                                    <div className="ct-empty">
                                        <div className="ct-empty-ico"><Layers size={24} /></div>
                                        <h3>Bu {(labels.branchSingle || 'şube').toLowerCase()} için kayıt yok</h3>
                                        <p>Süzgeci temizleyerek tüm kayıtları görebilirsiniz.</p>
                                        <button type="button" className="ct-btn" onClick={() => setBranchFilter('')}>
                                            <X size={13} /> Süzgeci temizle
                                        </button>
                                    </div>
                                );
                            }

                            const allSelected = displayedCategories.every(c => selectedCategoryIds.includes(c.id));

                            return (
                                <>
                                    {selectedCategoryIds.length > 0 && (
                                        <div className="ct-bulk">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                                <span className="ct-bulk-count">
                                                    <i></i>
                                                    {selectedCategoryIds.length} {labels.categorySingle.toLowerCase()} seçildi
                                                </span>
                                                <button type="button" className="ct-bulk-clear" onClick={() => setSelectedCategoryIds([])}>
                                                    Seçimi temizle
                                                </button>
                                            </div>
                                            <button
                                                type="button"
                                                className="ct-btn ct-btn-primary"
                                                disabled={bulkActionLoading}
                                                onClick={() => setDeleteConfirm('bulkCategories')}
                                            >
                                                <Trash2 size={13} /> Seçilenleri sil ({selectedCategoryIds.length})
                                            </button>
                                        </div>
                                    )}

                                    <div className="ct-list-head">
                                        <h2>
                                            {labels.categoriesTab}
                                            <span className="ct-count">{displayedCategories.length} kayıt</span>
                                        </h2>
                                    </div>

                                    <div className="ct-cols">
                                        <div>
                                            <input
                                                type="checkbox"
                                                className="ct-check"
                                                aria-label="Tümünü seç"
                                                checked={allSelected}
                                                onChange={() => toggleSelectAllCategories(displayedCategories)}
                                            />
                                        </div>
                                        <span></span>
                                        <span>{labels.categorySingle}</span>
                                        <span>{labels.branchSingle || 'Şube'}</span>
                                        <span>Anahtar kelimeler</span>
                                        <span>Yönlendirme</span>
                                        <span>Durum</span>
                                        <span></span>
                                    </div>

                                    {displayedCategories.map(c => {
                                        const isOpen = expandedCategoryId === c.id;
                                        const isPicked = selectedCategoryIds.includes(c.id);
                                        const keywords = parseKeywordList(c.keywords);
                                        const bIds = parseJsonList(c.branchIds);
                                        const branchNames = bIds.length > 0
                                            ? branches.filter(b => bIds.includes(b.id)).map(b => b.name)
                                            : [];
                                        const linkedProducts = c.products || [];
                                        const teamName = c.defaultTeamId ? (teams.find(t => t.id === c.defaultTeamId)?.name || null) : null;
                                        const funnelName = c.defaultFunnelId ? (funnels.find(f => f.id === c.defaultFunnelId)?.name || null) : null;
                                        const isActive = c.isActive !== false;

                                        return (
                                            <div key={c.id}>
                                                <div className={`ct-row ${isOpen ? 'open' : ''} ${isPicked ? 'picked' : ''}`}>
                                                    <div>
                                                        <input
                                                            type="checkbox"
                                                            className="ct-check"
                                                            aria-label={`${c.name} seç`}
                                                            checked={isPicked}
                                                            onChange={() => toggleSelectCategory(c.id)}
                                                        />
                                                    </div>
                                                    <div className={`ct-av ${isActive ? '' : 'muted'}`}>{catInitials(c.name)}</div>
                                                    <div>
                                                        <button
                                                            type="button"
                                                            className="ct-name"
                                                            aria-expanded={isOpen}
                                                            onClick={() => setExpandedCategoryId(isOpen ? null : c.id)}
                                                        >
                                                            {c.name}
                                                        </button>
                                                        {c.description && <div className="ct-sub">{c.description}</div>}
                                                    </div>
                                                    <div className="ct-chips">
                                                        {branchNames.length > 0
                                                            ? branchNames.map(n => <span key={n} className="ct-chip-branch">{n}</span>)
                                                            : <span className="ct-none">{labels.allBranches || 'Tümü'}</span>}
                                                    </div>
                                                    <div className="ct-chips">
                                                        {keywords.length > 0 ? (
                                                            <>
                                                                {keywords.slice(0, 3).map(k => <span key={k} className="ct-chip-kw">{k}</span>)}
                                                                {keywords.length > 3 && <span className="ct-more">+{keywords.length - 3}</span>}
                                                            </>
                                                        ) : (
                                                            <span className="ct-none">Kelime tanımlı değil</span>
                                                        )}
                                                    </div>
                                                    {/* Sorumlu takım ve akış: satırı açmadan görünmeli,
                                                        kullanıcı seçimini listede doğrulayabilsin. */}
                                                    <div className="ct-route">
                                                        {teamName && (
                                                            <span className="ct-chip-team" title={`Sorumlu takım: ${teamName}`}>
                                                                <Users size={11} />{teamName}
                                                            </span>
                                                        )}
                                                        {funnelName && (
                                                            <span className="ct-chip-funnel" title={`Varsayılan akış: ${funnelName}`}>
                                                                <Layers size={11} />{funnelName}
                                                            </span>
                                                        )}
                                                        {!teamName && !funnelName && <span className="ct-none">Atanmadı</span>}
                                                    </div>
                                                    <div className={`ct-status ${isActive ? 'on' : 'off'}`}>
                                                        <i></i>{isActive ? 'Aktif' : 'Pasif'}
                                                    </div>
                                                    <div className="ct-acts">
                                                        <button
                                                            type="button"
                                                            className="ct-ico"
                                                            aria-label={`${c.name} düzenle`}
                                                            onClick={() => openEditCategory(c)}
                                                        >
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="ct-ico danger"
                                                            aria-label={`${c.name} sil`}
                                                            onClick={() => handleDeleteCategory(c.id)}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {isOpen && (
                                                    <div className="ct-detail">
                                                        <div className="ct-dsec">
                                                            <span className="ct-dsec-name">Anahtar kelimeler</span>
                                                            <span className="ct-dsec-rule"></span>
                                                            <span className="ct-dsec-count">{keywords.length}</span>
                                                        </div>
                                                        {keywords.length > 0 ? (
                                                            <div className="ct-dchips">
                                                                {keywords.map(k => <span key={k} className="ct-dchip">{k}</span>)}
                                                            </div>
                                                        ) : (
                                                            <div className="ct-dnone">
                                                                Kelime tanımlı değil — bu {labels.categorySingle.toLowerCase()} yalnızca adıyla eşleşir.
                                                            </div>
                                                        )}

                                                        <div className="ct-dsec">
                                                            <span className="ct-dsec-name">Bağlı {labels.productsTab}</span>
                                                            <span className="ct-dsec-rule"></span>
                                                            <span className="ct-dsec-count">{linkedProducts.length}</span>
                                                        </div>
                                                        {linkedProducts.length > 0 ? (
                                                            <div className="ct-dchips">
                                                                {linkedProducts.map(p => <span key={p.id} className="ct-dchip">{p.name}</span>)}
                                                            </div>
                                                        ) : (
                                                            <div className="ct-dnone">Bağlı kayıt yok.</div>
                                                        )}

                                                        {(teamName || funnelName) && (
                                                            <>
                                                                <div className="ct-dsec">
                                                                    <span className="ct-dsec-name">Varsayılan yönlendirme</span>
                                                                    <span className="ct-dsec-rule"></span>
                                                                </div>
                                                                <div className="ct-routing">
                                                                    {teamName && (
                                                                        <div>
                                                                            <Users size={14} />
                                                                            <span className="k">Takım</span>
                                                                            <span className="v">{teamName}</span>
                                                                        </div>
                                                                    )}
                                                                    {funnelName && (
                                                                        <div>
                                                                            <Layers size={14} />
                                                                            <span className="k">Akış</span>
                                                                            <span className="v">{funnelName}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}

            {activeTab === 'productGroups' && (
                <div className={`ct-page ${embedded ? 'embedded' : ''}`}>
                    {embedded && (
                        <div className="ct-head">
                            <div className="ct-eyebrow">Ayarlar · Firma &amp; Bilgi Bankası</div>
                            <h1>{labels.productGroupsTab}</h1>
                            <p>{labels.groupPlural} bir {labels.categorySingle.toLowerCase()}e bağlanır; {labels.categorySingle.toLowerCase()} de mesajın hangi ekibe düşeceğini belirler.</p>
                        </div>
                    )}

                    <div className="ct-filters">
                        <select
                            className="ct-select"
                            aria-label={`${labels.categorySingle} süzgeci`}
                            value={categoryFilter}
                            onChange={e => { setCategoryFilter(e.target.value); setPage(1); }}
                        >
                            <option value="">{labels.allCategories}</option>
                            {categories.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                        {categoryFilter && (
                            <button type="button" className="ct-btn" onClick={() => { setCategoryFilter(''); setPage(1); }}>
                                <X size={13} /> Temizle
                            </button>
                        )}
                        <div className="ct-spacer"></div>
                        <button
                            type="button"
                            className="ct-btn ct-btn-primary"
                            onClick={() => { setGroupForm({ name: '', description: '', categoryId: categoryFilter || '' }); setEditingGroup(null); setShowGroupModal(true); }}
                        >
                            <Plus size={14} /> {labels.newGroup}
                        </button>
                    </div>

                    <div className="ct-surface">
                        {loading ? (
                            <div className="ct-empty"><p>Yükleniyor…</p></div>
                        ) : products.length === 0 ? (
                            <div className="ct-empty">
                                <div className="ct-empty-ico"><Folder size={24} /></div>
                                <h3>{labels.emptyGroupsTitle}</h3>
                                <p>{labels.emptyGroupsDesc}</p>
                                <button
                                    type="button"
                                    className="ct-btn ct-btn-primary"
                                    onClick={() => { setGroupForm({ name: '', description: '', categoryId: categoryFilter || '' }); setEditingGroup(null); setShowGroupModal(true); }}
                                >
                                    <Plus size={14} /> {labels.newGroup}
                                </button>
                            </div>
                        ) : (
                            <>
                                {selectedGroupIds.length > 0 && (
                                    <div className="ct-bulk">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                            <span className="ct-bulk-count">
                                                <i></i>
                                                {selectedGroupIds.length} {labels.groupSingle.toLowerCase()} seçildi
                                            </span>
                                            <button type="button" className="ct-bulk-clear" onClick={() => setSelectedGroupIds([])}>
                                                Seçimi temizle
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            <div className="ct-assign">
                                                <label htmlFor="ct-bulk-cat">{labels.categorySingle} ata:</label>
                                                <select
                                                    id="ct-bulk-cat"
                                                    className="ct-select-sm"
                                                    defaultValue=""
                                                    disabled={bulkActionLoading}
                                                    onChange={e => { if (e.target.value) { handleBulkUpdateGroupCategory(e.target.value); e.target.value = ''; } }}
                                                >
                                                    <option value="" disabled>{labels.selectCategory}</option>
                                                    <option value="NONE">— {labels.uncategorized} yap —</option>
                                                    {categories.map(c => (
                                                        <option key={c.id} value={c.id}>{c.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <button
                                                type="button"
                                                className="ct-btn ct-btn-primary"
                                                disabled={bulkActionLoading}
                                                onClick={() => setDeleteConfirm('bulkGroups')}
                                            >
                                                <Trash2 size={13} /> Seçilenleri sil ({selectedGroupIds.length})
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="ct-list-head">
                                    <h2>
                                        {labels.groupPlural}
                                        <span className="ct-count">{products.length} kayıt</span>
                                    </h2>
                                </div>

                                <div className="ct-cols g">
                                    <div>
                                        <input
                                            type="checkbox"
                                            className="ct-check"
                                            aria-label="Tümünü seç"
                                            checked={products.length > 0 && products.every(p => selectedGroupIds.includes(p.id))}
                                            onChange={toggleSelectAllGroups}
                                        />
                                    </div>
                                    <span></span>
                                    <span>{labels.groupSingle}</span>
                                    <span>{labels.categorySingle}</span>
                                    <span>Adet</span>
                                    <span>Durum</span>
                                    <span></span>
                                </div>

                                {products.map(p => {
                                    const isOpen = expandedGroupId === p.id;
                                    const isPicked = selectedGroupIds.includes(p.id);
                                    const categoryName = p.category?.name || categories.find(c => c.id === p.categoryId)?.name || null;
                                    const members = p.children || [];
                                    const bIds = (p.productBranches || []).map(pb => pb.branchId);
                                    const branchNames = bIds.length > 0
                                        ? branches.filter(b => bIds.includes(b.id)).map(b => b.name)
                                        : [];
                                    const isActive = p.isActive !== false;

                                    return (
                                        <div key={p.id}>
                                            <div className={`ct-row g ${isOpen ? 'open' : ''} ${isPicked ? 'picked' : ''}`}>
                                                <div>
                                                    <input
                                                        type="checkbox"
                                                        className="ct-check"
                                                        aria-label={`${p.name} seç`}
                                                        checked={isPicked}
                                                        onChange={() => toggleSelectGroup(p.id)}
                                                    />
                                                </div>
                                                <div className={`ct-av ${isActive ? '' : 'muted'}`}><Folder size={18} /></div>
                                                <div>
                                                    <button
                                                        type="button"
                                                        className="ct-name"
                                                        aria-expanded={isOpen}
                                                        onClick={() => setExpandedGroupId(isOpen ? null : p.id)}
                                                    >
                                                        {p.name}
                                                    </button>
                                                    {p.description && <div className="ct-sub">{p.description}</div>}
                                                </div>
                                                <div>
                                                    {categoryName ? (
                                                        <span className="ct-chip-branch">{categoryName}</span>
                                                    ) : (
                                                        <span className="ct-chip-warn">
                                                            <AlertTriangle size={11} /> {labels.uncategorized}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className={`ct-num ${members.length === 0 ? 'zero' : ''}`}>{members.length}</div>
                                                <div className={`ct-status ${isActive ? 'on' : 'off'}`}>
                                                    <i></i>{isActive ? 'Aktif' : 'Pasif'}
                                                </div>
                                                <div className="ct-acts">
                                                    <button
                                                        type="button"
                                                        className="ct-ico"
                                                        aria-label={`${p.name} düzenle`}
                                                        onClick={() => { setEditingGroup(p); setGroupForm({ name: p.name, description: p.description || '', categoryId: p.categoryId || '' }); setShowGroupModal(true); }}
                                                    >
                                                        <Edit2 size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="ct-ico danger"
                                                        aria-label={`${p.name} sil`}
                                                        onClick={() => setDeleteConfirm(p.id)}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>

                                            {isOpen && (
                                                <div className="ct-detail">
                                                    <div className="ct-dsec">
                                                        <span className="ct-dsec-name">Gruptaki {labels.productsTab}</span>
                                                        <span className="ct-dsec-rule"></span>
                                                        <span className="ct-dsec-count">{members.length}</span>
                                                    </div>
                                                    {members.length > 0 ? (
                                                        <div className="ct-dchips">
                                                            {members.map(m => <span key={m.id} className="ct-dchip">{m.name}</span>)}
                                                        </div>
                                                    ) : (
                                                        <div className="ct-dnone">
                                                            Bu {labels.groupSingle.toLowerCase()} boş — içine {labels.productSingle.toLowerCase()} eklenmediği için bot da bir şey sunamaz.
                                                        </div>
                                                    )}

                                                    {branchNames.length > 0 && (
                                                        <>
                                                            <div className="ct-dsec">
                                                                <span className="ct-dsec-name">Hizmet verilen {labels.branchPlural || 'şubeler'}</span>
                                                                <span className="ct-dsec-rule"></span>
                                                                <span className="ct-dsec-count">{branchNames.length}</span>
                                                            </div>
                                                            <div className="ct-dchips">
                                                                {branchNames.map(n => <span key={n} className="ct-dchip">{n}</span>)}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'products' && (
                <>
            {/* Filters Bar */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                padding: '12px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '280px', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', width: '220px' }}>
                        <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                        <input
                            type="text"
                            placeholder={labels.searchPlaceholder}
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                            style={{
                                width: '100%', padding: '8px 12px 8px 34px',
                                border: '1px solid #e2e8f0', borderRadius: '8px',
                                fontSize: '0.82rem', outline: 'none', background: '#fff'
                            }}
                        />
                    </div>
                    <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(1); }} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.82rem', outline: 'none', background: '#fff', color: '#334155', cursor: 'pointer' }}>
                        <option value="">{labels.allCategories}</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}{getCategoryBranchLabel(c)}</option>)}
                    </select>
                    <select value={groupFilter} onChange={e => { setGroupFilter(e.target.value); setPage(1); }} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.82rem', outline: 'none', background: '#fff', color: '#334155', cursor: 'pointer' }}>
                        <option value="">{labels.allGroups}</option>
                        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                    <select value={branchFilter} onChange={e => { setBranchFilter(e.target.value); setPage(1); }} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.82rem', outline: 'none', background: '#fff', color: '#334155', cursor: 'pointer' }}>
                        <option value="">{labels.allBranches || 'Tüm Şubeler'}</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    {(search || groupFilter || categoryFilter || branchFilter) && (
                        <button
                            onClick={() => { setSearch(''); setGroupFilter(''); setCategoryFilter(''); setBranchFilter(''); setPage(1); }}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                padding: '6px 10px', borderRadius: '6px',
                                border: '1px solid #fecaca', background: '#fef2f2',
                                fontSize: '0.72rem', fontWeight: 600, color: '#dc2626',
                                cursor: 'pointer'
                            }}
                        >
                            <X size={12} /> Temizle
                        </button>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
                    <button
                        onClick={() => setShowWooModal(true)}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            padding: '8px 14px', borderRadius: '8px',
                            border: '1px solid #ddd6fe', background: '#faf5ff',
                            fontSize: '0.8rem', fontWeight: 600, color: '#7c3aed',
                            cursor: 'pointer', transition: 'all 0.2s',
                            boxShadow: '0 1px 2px rgba(124, 58, 237, 0.05)'
                        }}
                        title="WooCommerce REST API Entegrasyonu"
                    >
                        <ShoppingCart size={15} /> WooCommerce
                        {wooConfig?.isConfigured && (
                            <span
                                style={{
                                    width: '7px', height: '7px', borderRadius: '50%',
                                    background: wooConfig.isActive ? '#22c55e' : '#94a3b8',
                                    display: 'inline-block', marginLeft: '2px'
                                }}
                                title={wooConfig.isActive ? 'WooCommerce Bağlı & Aktif' : 'WooCommerce Devre Dışı'}
                            />
                        )}
                    </button>
                    <button
                        onClick={handleExportCSV}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            padding: '8px 12px', borderRadius: '8px',
                            border: '1px solid #e2e8f0', background: '#fff',
                            fontSize: '0.8rem', fontWeight: 600, color: '#475569',
                            cursor: 'pointer', transition: 'all 0.2s'
                        }}
                    >
                        <Download size={14} /> Dışa Aktar
                    </button>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            padding: '8px 12px', borderRadius: '8px',
                            border: '1px solid #e2e8f0', background: '#fff',
                            fontSize: '0.8rem', fontWeight: 600, color: '#475569',
                            cursor: 'pointer', transition: 'all 0.2s'
                        }}
                    >
                        <Upload size={14} /> İçe Aktar
                    </button>
                    <button
                        onClick={openAddModal}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            padding: '8px 16px', borderRadius: '8px',
                            border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            fontSize: '0.8rem', fontWeight: 600, color: '#fff',
                            cursor: 'pointer', transition: 'all 0.2s',
                            boxShadow: '0 2px 8px rgba(99,102,241,0.3)'
                        }}
                    >
                        <Plus size={16} /> {labels.newProduct}
                    </button>
                </div>
            </div>

            {/* Bulk Actions Bar */}
            {selectedProductIds.length > 0 && (
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
                    gap: '12px', padding: '10px 24px', background: '#eff6ff', borderBottom: '1px solid #bfdbfe'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            background: '#2563eb', color: '#fff', fontSize: '0.78rem', fontWeight: 600,
                            padding: '4px 12px', borderRadius: '20px'
                        }}>
                            <Check size={14} /> {selectedProductIds.length} {labels.productSingle.toLowerCase()} seçildi
                        </span>
                        <button
                            onClick={() => setSelectedProductIds([])}
                            style={{
                                background: 'transparent', border: 'none', color: '#2563eb',
                                fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline'
                            }}
                        >
                            Seçimi Temizle
                        </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {/* Kategori Değiştir */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.75rem', color: '#1e40af', fontWeight: 600 }}>{labels.categorySingle} Ata:</span>
                            <select
                                defaultValue=""
                                onChange={(e) => {
                                    if (e.target.value) {
                                        handleBulkUpdateCategory(e.target.value);
                                        e.target.value = '';
                                    }
                                }}
                                disabled={bulkActionLoading}
                                style={{
                                    padding: '5px 10px', borderRadius: '6px', border: '1px solid #bfdbfe',
                                    background: '#fff', fontSize: '0.78rem', color: '#334155', cursor: 'pointer'
                                }}
                            >
                                <option value="" disabled>{labels.selectCategory}</option>
                                <option value="NONE">— {labels.uncategorized} Yap —</option>
                                {categories.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Grup Değiştir */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.75rem', color: '#1e40af', fontWeight: 600 }}>{labels.groupSingle} Ata:</span>
                            <select
                                defaultValue=""
                                onChange={(e) => {
                                    if (e.target.value) {
                                        handleBulkUpdateGroup(e.target.value);
                                        e.target.value = '';
                                    }
                                }}
                                disabled={bulkActionLoading}
                                style={{
                                    padding: '5px 10px', borderRadius: '6px', border: '1px solid #bfdbfe',
                                    background: '#fff', fontSize: '0.78rem', color: '#334155', cursor: 'pointer'
                                }}
                            >
                                <option value="" disabled>{labels.selectGroup}</option>
                                <option value="NONE">— {labels.ungrouped} Yap —</option>
                                {groups.map(g => (
                                    <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Seçilenleri Sil */}
                        <button
                            onClick={() => setDeleteConfirm('bulk')}
                            disabled={bulkActionLoading}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                padding: '6px 14px', borderRadius: '6px',
                                border: 'none', background: '#dc2626', color: '#fff',
                                fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                                transition: 'background 0.15s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#b91c1c'}
                            onMouseLeave={e => e.currentTarget.style.background = '#dc2626'}
                        >
                            <Trash2 size={13} />
                            Seçilenleri Sil ({selectedProductIds.length})
                        </button>
                    </div>
                </div>
            )}

            {/* Table */}
            {(() => {
                const displayedProducts = products.filter(p => {
                    if (!branchFilter) return true;
                    if (p.allBranches) return true;
                    return p.productBranches && p.productBranches.some(pb => pb.branchId === branchFilter && pb.isAvailable);
                });

                return (
                    <div style={{ overflow: 'auto', flex: 1 }}>
                        {loading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '60px 0', color: '#64748b' }}>
                                <div className="loader" style={{ marginRight: '10px' }}></div> Yükleniyor...
                            </div>
                        ) : displayedProducts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
                                <Package size={48} style={{ marginBottom: '12px', opacity: 0.4 }} />
                                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#64748b' }}>{labels.emptyProductsTitle}</h3>
                                <p style={{ fontSize: '0.82rem' }}>{labels.emptyProductsDesc}</p>
                                <button onClick={openAddModal} style={{
                                    marginTop: '12px', padding: '8px 20px', borderRadius: '8px',
                                    border: 'none', background: '#6366f1', color: '#fff',
                                    fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer'
                                }}>
                                    <Plus size={14} style={{ marginRight: '4px' }} /> {labels.newProduct}
                                </button>
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <th style={{ width: '56px', padding: '10px 16px 10px 24px', textAlign: 'left' }}>
                                            <input
                                                type="checkbox"
                                                checked={displayedProducts.length > 0 && displayedProducts.every(p => selectedProductIds.includes(p.id))}
                                                onChange={() => toggleSelectAll(displayedProducts)}
                                                style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#6366f1', verticalAlign: 'middle' }}
                                                title="Tümünü Seç / Kaldır"
                                            />
                                        </th>
                                        <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{labels.productName}</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{labels.categorySingle}</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Açıklama</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{labels.groupSingle}</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Birim</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{labels.branchSingle || 'Şube'}</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'right', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fiyat</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'right', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>İndirimli</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vergi 1</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vergi 2</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>İşlem</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {displayedProducts.map((p, idx) => (
                                <tr key={p.id} style={{
                                    borderBottom: '1px solid #f1f5f9',
                                    background: selectedProductIds.includes(p.id) ? '#eff6ff' : (idx % 2 === 0 ? '#fff' : '#fafbfc'),
                                    transition: 'background 0.15s'
                                }}
                                    onMouseEnter={(e) => {
                                        if (!selectedProductIds.includes(p.id)) e.currentTarget.style.background = '#f0f4ff';
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!selectedProductIds.includes(p.id)) e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafbfc';
                                    }}
                                >
                                    <td style={{ width: '56px', padding: '10px 16px 10px 24px', textAlign: 'left' }} onClick={e => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            checked={selectedProductIds.includes(p.id)}
                                            onChange={() => toggleSelectProduct(p.id)}
                                            style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#6366f1', verticalAlign: 'middle' }}
                                        />
                                    </td>
                                    <td style={{ padding: '10px 16px' }}>
                                        <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.82rem' }}>{p.name}</div>
                                    </td>
                                    <td style={{ padding: '10px 8px' }}>
                                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                            {categories.find(c => c.id === p.categoryId)?.name || '—'}
                                        </div>
                                    </td>
                                    <td style={{ padding: '10px 8px', maxWidth: '200px' }}>
                                        <div style={{ fontSize: '0.78rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {p.description || '—'}
                                        </div>
                                    </td>
                                    <td style={{ padding: '10px 8px' }}>
                                        {(groups.find(g => g.id === p.parentId)?.name) ? (
                                            <span style={{
                                                display: 'inline-block', padding: '2px 8px',
                                                background: '#ede9fe', color: '#7c3aed',
                                                borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600
                                            }}>
                                                {(groups.find(g => g.id === p.parentId)?.name)}
                                            </span>
                                        ) : <span style={{ color: '#cbd5e1', fontSize: '0.78rem' }}>—</span>}
                                    </td>
                                    <td style={{ padding: '10px 8px', fontSize: '0.78rem', color: '#475569' }}>
                                        {p.unit || '—'}
                                    </td>
                                    <td style={{ padding: '10px 8px' }}>
                                        {(() => {
                                            if (!p.productBranches || p.productBranches.length === 0) {
                                                return (
                                                    <span style={{ fontSize: '0.72rem', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px', whiteSpace: 'nowrap' }}>
                                                        {labels.allBranches || 'Tüm Şubeler'}
                                                    </span>
                                                );
                                            }
                                            const available = p.productBranches.filter(pb => pb.isAvailable);
                                            if (available.length === 0) {
                                                return (
                                                    <span style={{ fontSize: '0.72rem', color: '#ef4444', background: '#fef2f2', padding: '2px 8px', borderRadius: '6px', whiteSpace: 'nowrap' }}>
                                                        {labels.branchSingle ? `${labels.branchSingle} Yok` : 'Şube Yok'}
                                                    </span>
                                                );
                                            }
                                            const names = available.map(pb => pb.branch?.name || branches.find(b => b.id === pb.branchId)?.name || (labels.branchSingle || 'Şube')).join(', ');
                                            const hasCustomPrice = available.some(pb => pb.price !== null && pb.price !== undefined);
                                            return (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <span style={{
                                                        fontSize: '0.72rem', color: '#0369a1', background: '#e0f2fe',
                                                        padding: '2px 8px', borderRadius: '6px', fontWeight: 500,
                                                        maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                                    }} title={names}>
                                                        {names}
                                                    </span>
                                                    {hasCustomPrice && (
                                                        <span style={{ fontSize: '0.65rem', color: '#059669', fontWeight: 600 }}>
                                                            Özel Fiyatlı
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </td>
                                    <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600, fontSize: '0.82rem', color: '#1e293b', fontFamily: 'monospace' }}>
                                        {formatCurrency(p.price)}
                                    </td>
                                    <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: '0.78rem', color: p.discountedPrice ? '#16a34a' : '#cbd5e1', fontFamily: 'monospace' }}>
                                        {p.discountedPrice ? formatCurrency(p.discountedPrice) : '—'}
                                    </td>
                                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                        {p.tax1Type ? (
                                            <span style={{
                                                display: 'inline-block', padding: '2px 6px',
                                                background: '#fef3c7', color: '#b45309',
                                                borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600
                                            }}>
                                                {getTaxLabel(p.tax1Type)}
                                            </span>
                                        ) : <span style={{ color: '#cbd5e1', fontSize: '0.72rem' }}>—</span>}
                                    </td>
                                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                        {p.tax2Type ? (
                                            <span style={{
                                                display: 'inline-block', padding: '2px 6px',
                                                background: '#fce7f3', color: '#be185d',
                                                borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600
                                            }}>
                                                {getTaxLabel(p.tax2Type)}
                                            </span>
                                        ) : <span style={{ color: '#cbd5e1', fontSize: '0.72rem' }}>—</span>}
                                    </td>
                                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                            <button
                                                onClick={() => openEditModal(p)}
                                                title="Düzenle"
                                                style={{
                                                    width: '28px', height: '28px', borderRadius: '6px',
                                                    border: '1px solid #e2e8f0', background: '#fff',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    cursor: 'pointer', transition: 'all 0.15s', color: '#64748b'
                                                }}
                                            >
                                                <Edit2 size={13} />
                                            </button>
                                            <button
                                                onClick={() => setDeleteConfirm(p.id)}
                                                title="Sil"
                                                style={{
                                                    width: '28px', height: '28px', borderRadius: '6px',
                                                    border: '1px solid #fecaca', background: '#fef2f2',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    cursor: 'pointer', transition: 'all 0.15s', color: '#dc2626'
                                                }}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                        )}
                    </div>
                );
            })()}

            {/* Pagination */}
            {totalPages > 1 && (
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: '6px', padding: '14px 24px', borderTop: '1px solid #e2e8f0'
                }}>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).slice(
                        Math.max(0, page - 3), Math.min(totalPages, page + 2)
                    ).map(p => (
                        <button
                            key={p}
                            onClick={() => setPage(p)}
                            style={{
                                width: '32px', height: '32px', borderRadius: '6px',
                                border: p === page ? 'none' : '1px solid #e2e8f0',
                                background: p === page ? '#6366f1' : '#fff',
                                color: p === page ? '#fff' : '#475569',
                                fontWeight: 600, fontSize: '0.78rem',
                                cursor: 'pointer', transition: 'all 0.15s'
                            }}
                        >
                            {p}
                        </button>
                    ))}
                </div>
            )}
                </>
            )}


            
            {/* Category Modal */}
            {showCategoryModal && (
                <div
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(15, 23, 42, 0.5)', zIndex: 9998,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backdropFilter: 'blur(5px)', padding: '16px'
                    }}
                    onClick={() => setShowCategoryModal(false)}
                >
                    <div
                        style={{
                            background: '#fff', borderRadius: '16px', maxWidth: '540px', width: '100%',
                            maxHeight: '90vh', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                            display: 'flex', flexDirection: 'column'
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '18px 24px', borderBottom: '1px solid #f1f5f9'
                        }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                                    {editingCategory ? `${labels.categorySingle} Düzenle` : labels.newCategory}
                                </h2>
                                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                                    {labels.productPlural}ı sınıflandırın ve akış/ekip atamalarını yapın.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowCategoryModal(false)}
                                style={{
                                    width: '32px', height: '32px', borderRadius: '8px',
                                    border: 'none', background: '#f1f5f9', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#64748b', transition: 'all 0.15s'
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Body */}
                        <form onSubmit={handleSaveCategory} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 'calc(90vh - 140px)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                
                                {/* Kategori Adı */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                                        {labels.categorySingle} Adı <span style={{ color: '#ef4444' }}>*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={categoryForm.name}
                                        onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })}
                                        placeholder={`Örn: ${labels.categorySingle} adı...`}
                                        required
                                        autoFocus
                                        style={{
                                            width: '100%', padding: '10px 14px', borderRadius: '10px',
                                            border: '1px solid #d1d5db', fontSize: '0.86rem', outline: 'none',
                                            background: '#f8fafc', boxSizing: 'border-box'
                                        }}
                                    />
                                </div>

                                {/* Bağlı Şube */}
                                <div style={{ position: 'relative' }} ref={branchDropdownRef}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                        <label style={{ margin: 0, fontSize: '0.78rem', fontWeight: 600, color: '#334155' }}>
                                            Bağlı {labels.branchSingle || 'Şube'}
                                        </label>
                                        <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                            Bilgi Bankası {labels.branchesTab || 'Şubeleri'}
                                        </span>
                                    </div>

                                    {/* Multi-select Trigger Box */}
                                    <div
                                        onClick={() => setBranchDropdownOpen(prev => !prev)}
                                        style={{
                                            minHeight: '42px', padding: '6px 12px', borderRadius: '10px',
                                            border: branchDropdownOpen ? '1.5px solid #6366f1' : '1px solid #d1d5db',
                                            background: '#f8fafc', boxSizing: 'border-box', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            boxShadow: branchDropdownOpen ? '0 0 0 3px rgba(99, 102, 241, 0.1)' : 'none',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', flex: 1, paddingRight: '8px' }}>
                                            {(!categoryForm.branchIds || categoryForm.branchIds.length === 0) ? (
                                                <span style={{ fontSize: '0.86rem', color: '#475569' }}>
                                                    {labels.allBranches || 'Tüm Şubeler'} (Genel)
                                                </span>
                                            ) : (
                                                categoryForm.branchIds.map(bId => {
                                                    const branch = branches.find(b => b.id === bId);
                                                    if (!branch) return null;
                                                    return (
                                                        <span
                                                            key={bId}
                                                            style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                background: '#eef2ff', color: '#6366f1',
                                                                border: '1px solid #c7d2fe',
                                                                padding: '3px 8px', borderRadius: '6px',
                                                                fontSize: '0.76rem', fontWeight: 600
                                                            }}
                                                        >
                                                            {branch.name}
                                                            <span
                                                                role="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const next = (categoryForm.branchIds || []).filter(id => id !== bId);
                                                                    setCategoryForm({ ...categoryForm, branchIds: next });
                                                                }}
                                                                style={{
                                                                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                                                                    color: '#818cf8', marginLeft: '2px'
                                                                }}
                                                                title="Kaldır"
                                                            >
                                                                <X size={12} />
                                                            </span>
                                                        </span>
                                                    );
                                                })
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            {categoryForm.branchIds && categoryForm.branchIds.length > 0 && (
                                                <span
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setCategoryForm({ ...categoryForm, branchIds: [] });
                                                    }}
                                                    style={{
                                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                        width: '18px', height: '18px', borderRadius: '50%',
                                                        background: '#e2e8f0', color: '#64748b', cursor: 'pointer'
                                                    }}
                                                    title="Tümünü Temizle"
                                                >
                                                    <X size={11} />
                                                </span>
                                            )}
                                            <ChevronDown
                                                size={16}
                                                style={{
                                                    color: '#64748b',
                                                    transform: branchDropdownOpen ? 'rotate(180deg)' : 'none',
                                                    transition: 'transform 0.2s ease',
                                                    flexShrink: 0
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* Multi-select Dropdown Popover */}
                                    {branchDropdownOpen && (
                                        <div
                                            style={{
                                                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                                                zIndex: 60, background: '#fff', borderRadius: '10px',
                                                border: '1px solid #e2e8f0',
                                                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.06)',
                                                maxHeight: '220px', overflowY: 'auto', padding: '6px'
                                            }}
                                        >
                                            {/* Tüm Şubeler (Genel) Seçeneği */}
                                            <div
                                                onClick={() => setCategoryForm({ ...categoryForm, branchIds: [] })}
                                                style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    padding: '8px 12px', borderRadius: '8px', cursor: 'pointer',
                                                    fontSize: '0.84rem',
                                                    fontWeight: (!categoryForm.branchIds || categoryForm.branchIds.length === 0) ? 600 : 400,
                                                    background: (!categoryForm.branchIds || categoryForm.branchIds.length === 0) ? '#eef2ff' : '#fff',
                                                    color: (!categoryForm.branchIds || categoryForm.branchIds.length === 0) ? '#6366f1' : '#334155'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={!categoryForm.branchIds || categoryForm.branchIds.length === 0}
                                                        readOnly
                                                        style={{ accentColor: '#6366f1', cursor: 'pointer', pointerEvents: 'none' }}
                                                    />
                                                    <span>{labels.allBranches || 'Tüm Şubeler'} (Genel)</span>
                                                </div>
                                                {(!categoryForm.branchIds || categoryForm.branchIds.length === 0) && (
                                                    <Check size={15} color="#6366f1" />
                                                )}
                                            </div>

                                            {branches.length > 0 && <div style={{ height: '1px', background: '#f1f5f9', margin: '4px 0' }} />}

                                            {/* Şubeler */}
                                            {branches.map(b => {
                                                const isSelected = (categoryForm.branchIds || []).includes(b.id);
                                                return (
                                                    <div
                                                        key={b.id}
                                                        onClick={() => {
                                                            const current = categoryForm.branchIds || [];
                                                            const next = isSelected ? current.filter(id => id !== b.id) : [...current, b.id];
                                                            setCategoryForm({ ...categoryForm, branchIds: next });
                                                        }}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                            padding: '8px 12px', borderRadius: '8px', cursor: 'pointer',
                                                            fontSize: '0.84rem',
                                                            fontWeight: isSelected ? 600 : 400,
                                                            background: isSelected ? '#f8fafc' : '#fff',
                                                            color: isSelected ? '#1e293b' : '#475569'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={isSelected}
                                                                readOnly
                                                                style={{ accentColor: '#6366f1', cursor: 'pointer', pointerEvents: 'none' }}
                                                            />
                                                            <span>{b.name}</span>
                                                        </div>
                                                        {isSelected && <Check size={15} color="#6366f1" />}
                                                    </div>
                                                );
                                            })}

                                            {branches.length === 0 && (
                                                <div style={{ padding: '10px 12px', textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem' }}>
                                                    Kayıtlı {labels.branchSingle?.toLowerCase() || 'şube'} bulunamadı. Bilgi Bankası &gt; {labels.branchesTab || 'Şubeler'} sekmesinden ekleyebilirsiniz.
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Description */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                                        Açıklama
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={categoryForm.description || ''}
                                        onChange={e => setCategoryForm({ ...categoryForm, description: e.target.value })}
                                        placeholder="Kategori hakkında kısa bir açıklama..."
                                        style={{
                                            width: '100%', padding: '10px 14px', borderRadius: '10px',
                                            border: '1px solid #d1d5db', fontSize: '0.86rem', outline: 'none',
                                            background: '#f8fafc', boxSizing: 'border-box', resize: 'vertical'
                                        }}
                                    />
                                </div>

                                {/* Anahtar Kelimeler */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                                        Anahtar Kelimeler
                                    </label>
                                    <input
                                        type="text"
                                        value={categoryForm.keywords || ''}
                                        onChange={e => setCategoryForm({ ...categoryForm, keywords: e.target.value })}
                                        placeholder="Örn: masaj, cilt bakımı, epilasyon (virgülle ayırın)"
                                        style={{
                                            width: '100%', padding: '10px 14px', borderRadius: '10px',
                                            border: '1px solid #d1d5db', fontSize: '0.86rem', outline: 'none',
                                            background: '#f8fafc', boxSizing: 'border-box'
                                        }}
                                    />
                                    <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>
                                        AI asistanın müşteri mesajlarında bu kategoriyi otomatik tanımasını sağlar.
                                    </p>
                                </div>

                                {/* Varsayılan yönlendirme — kategori eşleşince konuşma buraya gider */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                                            Sorumlu Takım
                                        </label>
                                        <select
                                            value={categoryForm.defaultTeamId || ''}
                                            onChange={e => setCategoryForm({ ...categoryForm, defaultTeamId: e.target.value })}
                                            style={{
                                                width: '100%', padding: '10px 14px', borderRadius: '10px',
                                                border: '1px solid #d1d5db', fontSize: '0.86rem', outline: 'none',
                                                background: '#f8fafc', boxSizing: 'border-box', cursor: 'pointer'
                                            }}
                                        >
                                            <option value="">— Takım seçilmedi —</option>
                                            {(teams || []).map(t => (
                                                <option key={t.id} value={t.id}>{t.name}</option>
                                            ))}
                                        </select>
                                        <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>
                                            Müşteri bu kategoriyle ilgilenirse konuşma bu takıma atanır.
                                        </p>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                                            Varsayılan Akış
                                        </label>
                                        <select
                                            value={categoryForm.defaultFunnelId || ''}
                                            onChange={e => setCategoryForm({ ...categoryForm, defaultFunnelId: e.target.value })}
                                            style={{
                                                width: '100%', padding: '10px 14px', borderRadius: '10px',
                                                border: '1px solid #d1d5db', fontSize: '0.86rem', outline: 'none',
                                                background: '#f8fafc', boxSizing: 'border-box', cursor: 'pointer'
                                            }}
                                        >
                                            <option value="">— Akış seçilmedi —</option>
                                            {(funnels || []).map(f => (
                                                <option key={f.id} value={f.id}>{f.name}</option>
                                            ))}
                                        </select>
                                        <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>
                                            Kanal kuralı bir akış vermediyse bu akış kullanılır.
                                        </p>
                                    </div>
                                </div>

                            </div>

                            {/* Footer */}
                            <div style={{
                                display: 'flex', justifyContent: 'flex-end', gap: '10px',
                                padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc'
                            }}>
                                <button
                                    type="button"
                                    onClick={() => setShowCategoryModal(false)}
                                    style={{
                                        padding: '9px 18px', borderRadius: '10px', border: '1px solid #e2e8f0',
                                        background: '#fff', fontSize: '0.84rem', fontWeight: 600, color: '#64748b', cursor: 'pointer'
                                    }}
                                >
                                    İptal
                                </button>
                                <button
                                    type="submit"
                                    style={{
                                        padding: '9px 22px', borderRadius: '10px', border: 'none',
                                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                        fontSize: '0.84rem', fontWeight: 600, color: '#fff', cursor: 'pointer',
                                        boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)'
                                    }}
                                >
                                    {editingCategory ? 'Güncelle' : 'Kaydet'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Group Modal */}
            {showGroupModal && (
                <div
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(15, 23, 42, 0.5)', zIndex: 9998,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backdropFilter: 'blur(5px)', padding: '16px'
                    }}
                    onClick={() => setShowGroupModal(false)}
                >
                    <div
                        style={{
                            background: '#fff', borderRadius: '16px', maxWidth: '480px', width: '100%',
                            maxHeight: '90vh', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                            display: 'flex', flexDirection: 'column'
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '18px 24px', borderBottom: '1px solid #f1f5f9'
                        }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                                    {editingGroup ? `${labels.groupSingle} Düzenle` : labels.newGroup}
                                </h2>
                                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                                    {labels.productPlural}ı alt gruplara ayırarak düzenleyin.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowGroupModal(false)}
                                style={{
                                    width: '32px', height: '32px', borderRadius: '8px',
                                    border: 'none', background: '#f1f5f9', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#64748b', transition: 'all 0.15s'
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Body */}
                        <form onSubmit={handleSaveGroup} style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                
                                {/* Kategori */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                                        Bağlı {labels.categorySingle} <span style={{ color: '#ef4444' }}>*</span>
                                    </label>
                                    <select
                                        value={groupForm.categoryId || ''}
                                        onChange={e => setGroupForm({ ...groupForm, categoryId: e.target.value })}
                                        required
                                        style={{
                                            width: '100%', padding: '10px 14px', borderRadius: '10px',
                                            border: '1px solid #d1d5db', fontSize: '0.86rem', outline: 'none',
                                            background: '#f8fafc', boxSizing: 'border-box', color: '#334155', cursor: 'pointer'
                                        }}
                                    >
                                        <option value="">{labels.selectCategory}</option>
                                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}{getCategoryBranchLabel(c)}</option>)}
                                    </select>
                                </div>

                                {/* Grup Adı */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                                        {labels.groupSingle} Adı <span style={{ color: '#ef4444' }}>*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={groupForm.name}
                                        onChange={e => setGroupForm({ ...groupForm, name: e.target.value })}
                                        placeholder={`Örn: ${labels.groupSingle} adı...`}
                                        required
                                        style={{
                                            width: '100%', padding: '10px 14px', borderRadius: '10px',
                                            border: '1px solid #d1d5db', fontSize: '0.86rem', outline: 'none',
                                            background: '#f8fafc', boxSizing: 'border-box'
                                        }}
                                        autoFocus
                                    />
                                </div>

                                {/* Açıklama */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                                        Açıklama
                                    </label>
                                    <textarea
                                        rows={3}
                                        value={groupForm.description || ''}
                                        onChange={e => setGroupForm({ ...groupForm, description: e.target.value })}
                                        placeholder="Ürün grubu hakkında kısa açıklama..."
                                        style={{
                                            width: '100%', padding: '10px 14px', borderRadius: '10px',
                                            border: '1px solid #d1d5db', fontSize: '0.86rem', outline: 'none',
                                            background: '#f8fafc', boxSizing: 'border-box', resize: 'vertical'
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Footer */}
                            <div style={{
                                display: 'flex', justifyContent: 'flex-end', gap: '10px',
                                padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc'
                            }}>
                                <button
                                    type="button"
                                    onClick={() => setShowGroupModal(false)}
                                    style={{
                                        padding: '9px 18px', borderRadius: '10px', border: '1px solid #e2e8f0',
                                        background: '#fff', fontSize: '0.84rem', fontWeight: 600, color: '#64748b', cursor: 'pointer'
                                    }}
                                >
                                    İptal
                                </button>
                                <button
                                    type="submit"
                                    style={{
                                        padding: '9px 22px', borderRadius: '10px', border: 'none',
                                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                        fontSize: '0.84rem', fontWeight: 600, color: '#fff', cursor: 'pointer',
                                        boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)'
                                    }}
                                >
                                    {editingGroup ? 'Güncelle' : 'Kaydet'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirm */}
            {deleteConfirm && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.4)', zIndex: 9998,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(2px)'
                }}
                    onClick={() => !bulkActionLoading && setDeleteConfirm(null)}
                >
                    <div style={{
                        background: '#fff', borderRadius: '12px', padding: '24px',
                        maxWidth: '380px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.15)'
                    }}
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
                            {deleteConfirm === 'bulk' && `Seçilen ${labels.productPlural}ı Sil`}
                            {deleteConfirm === 'bulkCategories' && `Seçilen ${labels.categoryPlural}ı Sil`}
                            {deleteConfirm === 'bulkGroups' && `Seçilen ${labels.groupPlural}ı Sil`}
                            {deleteConfirm !== 'bulk' && deleteConfirm !== 'bulkCategories' && deleteConfirm !== 'bulkGroups' && 'Silme Onayı'}
                        </h3>
                        <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 20px' }}>
                            {deleteConfirm === 'bulk' && `Seçilen ${selectedProductIds.length} ${labels.productSingle.toLowerCase()} silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`}
                            {deleteConfirm === 'bulkCategories' && `Seçilen ${selectedCategoryIds.length} ${labels.categorySingle.toLowerCase()} silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`}
                            {deleteConfirm === 'bulkGroups' && `Seçilen ${selectedGroupIds.length} ${labels.groupSingle.toLowerCase()} silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`}
                            {deleteConfirm !== 'bulk' && deleteConfirm !== 'bulkCategories' && deleteConfirm !== 'bulkGroups' && 'Bu kaydı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.'}
                        </p>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                                disabled={bulkActionLoading}
                                onClick={() => setDeleteConfirm(null)}
                                style={{
                                    padding: '8px 16px', borderRadius: '8px',
                                    border: '1px solid #e2e8f0', background: '#fff',
                                    fontSize: '0.82rem', fontWeight: 600, color: '#64748b', cursor: 'pointer'
                                }}
                            >
                                İptal
                            </button>
                            <button
                                disabled={bulkActionLoading}
                                onClick={() => {
                                    if (deleteConfirm === 'bulk') {
                                        executeBulkDelete();
                                    } else if (deleteConfirm === 'bulkCategories') {
                                        executeBulkDeleteCategories();
                                    } else if (deleteConfirm === 'bulkGroups') {
                                        executeBulkDeleteGroups();
                                    } else {
                                        handleDelete(deleteConfirm);
                                    }
                                }}
                                style={{
                                    padding: '8px 16px', borderRadius: '8px',
                                    border: 'none', background: '#dc2626',
                                    fontSize: '0.82rem', fontWeight: 600, color: '#fff', cursor: 'pointer',
                                    opacity: bulkActionLoading ? 0.7 : 1
                                }}
                            >
                                {bulkActionLoading ? 'Siliniyor...' : 'Sil'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.4)', zIndex: 9998,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(2px)'
                }}
                    onClick={() => { setShowModal(false); resetForm(); }}
                >
                    <div style={{
                        background: '#fff', borderRadius: '16px', padding: '0',
                        maxWidth: '560px', width: '100%', maxHeight: '90vh', overflow: 'auto',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.2)'
                    }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '18px 24px', borderBottom: '1px solid #e2e8f0'
                        }}>
                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
                                {editingProduct ? `${labels.productSingle} Düzenle` : labels.newProduct}
                            </h2>
                            <button
                                onClick={() => { setShowModal(false); resetForm(); }}
                                style={{
                                    width: '32px', height: '32px', borderRadius: '8px',
                                    border: 'none', background: '#f1f5f9', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#64748b'
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleSubmit} style={{ padding: '20px 24px' }}>
                            {/* Ürün Adı */}
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                                    {labels.productName} <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder={`${labels.productSingle} adı...`}
                                    style={{
                                        width: '100%', padding: '9px 12px', borderRadius: '8px',
                                        border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
                                        transition: 'border 0.2s', boxSizing: 'border-box'
                                    }}
                                    autoFocus
                                />
                            </div>

                            {/* Açıklama */}
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                                    Açıklama
                                </label>
                                <textarea
                                    value={formData.description}
                                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                    placeholder={`${labels.productSingle} açıklaması...`}
                                    rows={2}
                                    style={{
                                        width: '100%', padding: '9px 12px', borderRadius: '8px',
                                        border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
                                        resize: 'vertical', boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            {/* AI Satış Notları */}
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                                    🤖 AI Satış Notları <span style={{ fontWeight: 400, color: '#9ca3af' }}>(Botlara özel bilgiler)</span>
                                </label>
                                <textarea
                                    value={formData.aiContext}
                                    onChange={e => setFormData(prev => ({ ...prev, aiContext: e.target.value }))}
                                    placeholder="Yapay zekanın bu ürünü/hizmeti sunarken bilmesi gereken kilit özellikler, itiraz karşılama taktikleri veya teknik detaylar..."
                                    rows={3}
                                    style={{
                                        width: '100%', padding: '9px 12px', borderRadius: '8px',
                                        border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
                                        resize: 'vertical', boxSizing: 'border-box',
                                        background: '#f8fafc'
                                    }}
                                />
                            </div>

                            {/* Kategori */}
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                                    📁 {labels.categorySingle} <span style={{ fontWeight: 400, color: '#9ca3af' }}>(Raporlarda gruplanır)</span>
                                </label>
                                <select
                                    value={formData.categoryId}
                                    onChange={e => setFormData(prev => ({ ...prev, categoryId: e.target.value }))}
                                    style={{
                                        width: '100%', padding: '9px 12px', borderRadius: '8px',
                                        border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
                                        background: '#fff', cursor: 'pointer', boxSizing: 'border-box'
                                    }}
                                >
                                    <option value="">{labels.selectCategory}...</option>
                                    {categories.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}{getCategoryBranchLabel(c)}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Grup & Birim */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                                        {labels.groupSingle}
                                    </label>
                                    <select value={formData.parentId} onChange={e => setFormData(prev => ({ ...prev, parentId: e.target.value }))} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}>
                                        <option value="">— {labels.ungrouped} —</option>
                                        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                                        Birim
                                    </label>
                                    <select
                                        value={formData.unit}
                                        onChange={e => setFormData(prev => ({ ...prev, unit: e.target.value }))}
                                        style={{
                                            width: '100%', padding: '9px 12px', borderRadius: '8px',
                                            border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
                                            background: '#fff', cursor: 'pointer', boxSizing: 'border-box'
                                        }}
                                    >
                                        {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* Fiyatlar */}
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                                    Fiyat (TL) <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.price}
                                    onChange={e => setFormData(prev => ({ ...prev, price: e.target.value }))}
                                    placeholder="0.00"
                                    style={{
                                        width: '100%', padding: '9px 12px', borderRadius: '8px',
                                        border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>USD</label>
                                    <input type="number" step="0.01" value={formData.priceUSD} onChange={e => setFormData(prev => ({ ...prev, priceUSD: e.target.value }))} placeholder="—" style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>EUR</label>
                                    <input type="number" step="0.01" value={formData.priceEUR} onChange={e => setFormData(prev => ({ ...prev, priceEUR: e.target.value }))} placeholder="—" style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>GBP</label>
                                    <input type="number" step="0.01" value={formData.priceGBP} onChange={e => setFormData(prev => ({ ...prev, priceGBP: e.target.value }))} placeholder="—" style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                            </div>

                            {/* İndirimli Fiyat */}
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                                    İndirimli Fiyat (TL)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.discountedPrice}
                                    onChange={e => setFormData(prev => ({ ...prev, discountedPrice: e.target.value }))}
                                    placeholder="Opsiyonel..."
                                    style={{
                                        width: '100%', padding: '9px 12px', borderRadius: '8px',
                                        border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            {/* Vergiler */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                                        Vergi 1
                                    </label>
                                    <select
                                        value={formData.tax1Type}
                                        onChange={e => handleTaxChange('tax1Type', e.target.value)}
                                        style={{
                                            width: '100%', padding: '9px 12px', borderRadius: '8px',
                                            border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
                                            background: '#fff', cursor: 'pointer', boxSizing: 'border-box'
                                        }}
                                    >
                                        {TAX_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                                        Vergi 2
                                    </label>
                                    <select
                                        value={formData.tax2Type}
                                        onChange={e => handleTaxChange('tax2Type', e.target.value)}
                                        style={{
                                            width: '100%', padding: '9px 12px', borderRadius: '8px',
                                            border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
                                            background: '#fff', cursor: 'pointer', boxSizing: 'border-box'
                                        }}
                                    >
                                        {TAX_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* Şube Bulunurluğu & Fiyat Yönetimi */}
                            <div style={{ marginBottom: '20px', padding: '14px 16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                <div style={{ marginBottom: '10px' }}>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', marginBottom: '2px' }}>
                                        {labels.branchSingle || 'Şube'} Bulunurluğu & Fiyat Yönetimi
                                    </label>
                                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                        {labels.productSingle || 'Ürün'}ün hangi {labels.branchesTab?.toLowerCase() || 'şubelerde'} sunulacağını ve {labels.branchSingle?.toLowerCase() || 'şubeye'} özel fiyatını belirleyin
                                    </span>
                                </div>

                                {/* Seçenek Butonları: Tüm Şubeler vs Şubeye Özel */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, allBranches: true }))}
                                        style={{
                                            padding: '8px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600,
                                            border: formData.allBranches ? '2px solid #6366f1' : '1px solid #e2e8f0',
                                            background: formData.allBranches ? '#eff6ff' : '#fff',
                                            color: formData.allBranches ? '#4338ca' : '#64748b',
                                            cursor: 'pointer', textAlign: 'center'
                                        }}
                                    >
                                        {labels.allBranches || 'Tüm Şubeler'}de Geçerli
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFormData(prev => {
                                                const currentPB = (prev.productBranches && prev.productBranches.length > 0)
                                                    ? prev.productBranches
                                                    : branches.map(b => ({
                                                        branchId: b.id,
                                                        branchName: b.name,
                                                        isAvailable: true,
                                                        price: ''
                                                    }));
                                                return { ...prev, allBranches: false, productBranches: currentPB };
                                            });
                                        }}
                                        style={{
                                            padding: '8px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600,
                                            border: !formData.allBranches ? '2px solid #6366f1' : '1px solid #e2e8f0',
                                            background: !formData.allBranches ? '#eff6ff' : '#fff',
                                            color: !formData.allBranches ? '#4338ca' : '#64748b',
                                            cursor: 'pointer', textAlign: 'center'
                                        }}
                                    >
                                        {labels.branchSingle || 'Şube'}ye Göre Özelleştir
                                    </button>
                                </div>

                                {!formData.allBranches && (
                                    <div style={{ marginTop: '10px' }}>
                                        {branches.length === 0 ? (
                                            <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic', padding: '8px 0' }}>
                                                Tanımlı {labels.branchSingle?.toLowerCase() || 'şube'} bulunmuyor (Bilgi Bankası &gt; {labels.branchesTab || 'Şubeler'} sekmesinden ekleyebilirsiniz).
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {formData.productBranches.map((pb, idx) => (
                                                    <div key={pb.branchId || idx} style={{
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                        padding: '8px 12px', background: pb.isAvailable ? '#fff' : '#f1f5f9',
                                                        borderRadius: '8px', border: '1px solid #e2e8f0'
                                                    }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flex: 1, margin: 0 }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={pb.isAvailable}
                                                                onChange={e => {
                                                                    const checked = e.target.checked;
                                                                    setFormData(prev => {
                                                                        const updated = [...prev.productBranches];
                                                                        updated[idx] = { ...updated[idx], isAvailable: checked };
                                                                        return { ...prev, productBranches: updated };
                                                                    });
                                                                }}
                                                                style={{ width: '15px', height: '15px', accentColor: '#6366f1', cursor: 'pointer' }}
                                                            />
                                                            <span style={{
                                                                fontSize: '0.8rem', fontWeight: pb.isAvailable ? 600 : 400,
                                                                color: pb.isAvailable ? '#1e293b' : '#94a3b8',
                                                                textDecoration: pb.isAvailable ? 'none' : 'line-through'
                                                            }}>
                                                                {pb.branchName || branches.find(b => b.id === pb.branchId)?.name || (labels.branchSingle || 'Şube')}
                                                            </span>
                                                        </label>

                                                        {pb.isAvailable ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Özel Fiyat:</span>
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    placeholder={`Genel (${formData.price || '0'} ₺)`}
                                                                    value={pb.price}
                                                                    onChange={e => {
                                                                        const val = e.target.value;
                                                                        setFormData(prev => {
                                                                            const updated = [...prev.productBranches];
                                                                            updated[idx] = { ...updated[idx], price: val };
                                                                            return { ...prev, productBranches: updated };
                                                                        });
                                                                    }}
                                                                    style={{
                                                                        width: '130px', padding: '6px 8px', borderRadius: '6px',
                                                                        border: '1px solid #cbd5e1', fontSize: '0.78rem', outline: 'none',
                                                                        textAlign: 'right'
                                                                    }}
                                                                />
                                                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>₺</span>
                                                            </div>
                                                        ) : (
                                                            <span style={{ fontSize: '0.72rem', color: '#ef4444', background: '#fef2f2', padding: '2px 8px', borderRadius: '4px' }}>
                                                                Bu {labels.branchSingle?.toLowerCase() || 'şube'}de yok
                                                            </span>
                                                        )}
                                                    </div>
                                                ))}
                                                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                                                    * Özel fiyat boş bırakılırsa ürünün genel fiyatı ({formData.price || '0'} ₺) geçerli olur.
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Özellikler */}
                            <div style={{ marginBottom: '24px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151' }}>
                                        Dinamik Özellikler
                                    </label>
                                    <button
                                        type="button"
                                        onClick={addFeature}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                            padding: '4px 8px', borderRadius: '6px',
                                            border: '1px solid #e2e8f0', background: '#fff',
                                            fontSize: '0.72rem', fontWeight: 600, color: '#6366f1',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <Plus size={12} /> Özellik Ekle
                                    </button>
                                </div>
                                
                                {formData.features.map((feature, index) => (
                                    <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                        <input
                                            type="text"
                                            value={feature.featureKey}
                                            onChange={e => updateFeature(index, 'featureKey', e.target.value)}
                                            placeholder="Örn: Renk, Beden, Çözünürlük"
                                            style={{
                                                flex: 1, padding: '8px 10px', borderRadius: '6px',
                                                border: '1px solid #d1d5db', fontSize: '0.8rem', outline: 'none'
                                            }}
                                        />
                                        <input
                                            type="text"
                                            value={feature.featureValue}
                                            onChange={e => updateFeature(index, 'featureValue', e.target.value)}
                                            placeholder="Örn: Kırmızı, L, 4K"
                                            style={{
                                                flex: 1, padding: '8px 10px', borderRadius: '6px',
                                                border: '1px solid #d1d5db', fontSize: '0.8rem', outline: 'none'
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeFeature(index)}
                                            style={{
                                                width: '32px', height: '32px', borderRadius: '6px',
                                                border: '1px solid #fecaca', background: '#fef2f2',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer', color: '#dc2626', flexShrink: 0
                                            }}
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                                {formData.features.length === 0 && (
                                    <div style={{ textAlign: 'center', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', fontSize: '0.78rem', color: '#64748b' }}>
                                        Bu ürün için sektöre özel özellikler ekleyebilirsiniz. (Örn: İnşaat için: <em>Ağırlık</em>, Giyim için: <em>Beden</em>)
                                    </div>
                                )}
                            </div>

                            {/* Submit */}
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    onClick={() => { setShowModal(false); resetForm(); }}
                                    style={{
                                        padding: '10px 18px', borderRadius: '8px',
                                        border: '1px solid #e2e8f0', background: '#fff',
                                        fontSize: '0.85rem', fontWeight: 600, color: '#64748b', cursor: 'pointer'
                                    }}
                                >
                                    İptal
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    style={{
                                        padding: '10px 22px', borderRadius: '8px',
                                        border: 'none', background: saving ? '#a5b4fc' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                        fontSize: '0.85rem', fontWeight: 600, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer',
                                        boxShadow: '0 2px 8px rgba(99,102,241,0.3)'
                                    }}
                                >
                                    {saving ? 'Kaydediliyor...' : (editingProduct ? 'Güncelle' : 'Kaydet')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* WooCommerce Modal */}
            <WooCommerceModal
                isOpen={showWooModal}
                onClose={() => {
                    setShowWooModal(false);
                    fetchWooConfig();
                }}
                workspaceId={currentWorkspace?.id}
                onSyncComplete={() => {
                    fetchProducts();
                    fetchCategories();
                    fetchGroups();
                }}
            />
        </div>
    );
};

export default Products;
