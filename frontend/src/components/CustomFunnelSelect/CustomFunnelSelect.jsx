import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import './CustomFunnelSelect.css';

const CustomFunnelSelect = ({ funnels, value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [menuStyle, setMenuStyle] = useState({});
    const dropdownRef = useRef(null);
    const menuRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && dropdownRef.current.contains(event.target)) {
                return;
            }
            if (menuRef.current && menuRef.current.contains(event.target)) {
                return;
            }
            setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOpen = () => {
        if (!isOpen && dropdownRef.current) {
            const rect = dropdownRef.current.getBoundingClientRect();
            setMenuStyle({
                top: rect.bottom + window.scrollY + 4,
                left: rect.left + window.scrollX,
                width: 220
            });
        }
        setIsOpen(!isOpen);
    };

    const handleSelect = (val) => {
        onChange(val);
        setIsOpen(false);
    };

    const getSelectedLabel = () => {
        if (!value) return 'Akış seçin';
        const [fId, sId] = value.split('|');
        const f = funnels.find(funnel => funnel.id === fId);
        if (!f) return 'Akış seçin';
        if (!sId) return `${f.icon || '📁'} ${f.name} (Varsayılan)`;
        const s = f.stages?.find(stage => stage.id === sId);
        if (!s) return `${f.icon || '📁'} ${f.name}`;
        return `${f.icon || '📁'} ${f.name} › ${s.name}`;
    };

    const menuContent = (
        <div className="custom-funnel-select-menu" style={menuStyle} ref={menuRef}>
            <div className="menu-item clear-item" onClick={() => handleSelect('')}>
                Seçimi Temizle
            </div>
            {funnels.map(f => (
                <div key={f.id} className="funnel-group">
                    <div className="funnel-group-header" onClick={() => handleSelect(`${f.id}|`)}>
                        <span className="funnel-title">
                            {f.icon || '📁'} {f.name}
                        </span>
                        {f.stages?.length > 0 && (
                            <span className="expand-icon">
                                <ChevronRight size={14} />
                            </span>
                        )}
                    </div>
                    
                    {f.stages?.length > 0 && (
                        <div className="funnel-submenu">
                            <div 
                                className={`menu-item stage-item ${value === `${f.id}|` ? 'selected' : ''}`}
                                onClick={() => handleSelect(`${f.id}|`)}
                            >
                                İlk Aşama (Varsayılan)
                            </div>
                            {f.stages?.slice().sort((a, b) => a.order - b.order).map(s => {
                                const val = `${f.id}|${s.id}`;
                                return (
                                    <div 
                                        key={s.id} 
                                        className={`menu-item stage-item ${value === val ? 'selected' : ''}`}
                                        onClick={() => handleSelect(val)}
                                    >
                                        {s.name}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );

    return (
        <div className="custom-funnel-select-container" ref={dropdownRef}>
            <div className="custom-funnel-select-trigger" onClick={toggleOpen}>
                <span className="trigger-label">{getSelectedLabel()}</span>
                <ChevronDown size={14} className={`trigger-icon ${isOpen ? 'open' : ''}`} />
            </div>
            {isOpen && createPortal(menuContent, document.body)}
        </div>
    );
};

export default CustomFunnelSelect;
