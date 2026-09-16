import React from 'react';
import { Outlet } from 'react-router-dom';
import SettingsNav from '../components/SettingsNav/SettingsNav';
import './SettingsLayout.css';

const SettingsLayout = () => {
    return (
        <div className="settings-layout-wrapper">
            <SettingsNav />
            <main className="settings-layout-content custom-scroll">
                <Outlet />
            </main>
        </div>
    );
};

export default SettingsLayout;
