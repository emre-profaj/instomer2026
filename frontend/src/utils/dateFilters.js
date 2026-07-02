export const getDateRangeLogic = (dateFilter, startDate, endDate) => {
    const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const now = new Date();
    
    if (dateFilter === 'today') return { startDate: toDateStr(now), endDate: toDateStr(now) };
    if (dateFilter === 'yesterday') { 
        const y = new Date(now); y.setDate(now.getDate()-1); 
        return { startDate: toDateStr(y), endDate: toDateStr(y) }; 
    }
    if (dateFilter === 'thisWeek') { 
        const day = now.getDay(); const diff = day === 0 ? 6 : day - 1; 
        const mon = new Date(now); mon.setDate(now.getDate()-diff); 
        const sun = new Date(mon); sun.setDate(sun.getDate()+6); 
        return { startDate: toDateStr(mon), endDate: toDateStr(sun) }; 
    }
    if (dateFilter === 'lastWeek') { 
        const day = now.getDay(); const diff = day === 0 ? 6 : day - 1; 
        const lastMon = new Date(now); lastMon.setDate(now.getDate()-diff-7); 
        const lastSun = new Date(lastMon); lastSun.setDate(lastSun.getDate()+6); 
        return { startDate: toDateStr(lastMon), endDate: toDateStr(lastSun) }; 
    }
    if (dateFilter === 'thisMonth') { 
        const first = new Date(now.getFullYear(), now.getMonth(), 1); 
        const last = new Date(now.getFullYear(), now.getMonth()+1, 0); 
        return { startDate: toDateStr(first), endDate: toDateStr(last) }; 
    }
    if (dateFilter === 'lastMonth') { 
        const first = new Date(now.getFullYear(), now.getMonth()-1, 1); 
        const last = new Date(now.getFullYear(), now.getMonth(), 0); 
        return { startDate: toDateStr(first), endDate: toDateStr(last) }; 
    }
    if (dateFilter === 'thisYear') { 
        const first = new Date(now.getFullYear(), 0, 1); 
        const last = new Date(now.getFullYear(), 11, 31); 
        return { startDate: toDateStr(first), endDate: toDateStr(last) }; 
    }
    if (dateFilter === 'lastYear') { 
        const first = new Date(now.getFullYear()-1, 0, 1); 
        const last = new Date(now.getFullYear()-1, 11, 31); 
        return { startDate: toDateStr(first), endDate: toDateStr(last) }; 
    }
    if (dateFilter === 'custom' && startDate) return { startDate, endDate };
    return {}; // 'all' or default
};

export const dateFilterOptions = [
    { key: 'today', label: 'Bugün' },
    { key: 'yesterday', label: 'Dün' },
    { key: 'thisWeek', label: 'Bu Hafta' },
    { key: 'lastWeek', label: 'Geçen Hafta' },
    { key: 'thisMonth', label: 'Bu Ay' },
    { key: 'lastMonth', label: 'Geçen Ay' },
    { key: 'thisYear', label: 'Bu Yıl' },
    { key: 'lastYear', label: 'Geçen Yıl' },
    { key: 'all', label: 'Tümü' },
    { key: 'custom', label: '📅 Özel' }
];
