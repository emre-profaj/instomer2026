import React from 'react';
import ActivityListAnalytics from './ActivityListAnalytics';
import { Calendar } from 'lucide-react';

const AppointmentAnalytics = () => {
    return <ActivityListAnalytics type="APPOINTMENT" title="Randevu Analizi" subtitle="Oluşturulan ve bekleyen randevu takibi" icon={Calendar} />;
};

export default AppointmentAnalytics;
