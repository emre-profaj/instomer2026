import React from 'react';
import ActivityListAnalytics from './ActivityListAnalytics';
import { Users } from 'lucide-react';

const MeetingAnalytics = () => {
    return <ActivityListAnalytics type="MEETING" title="Görüşme Analizi" subtitle="Temsilcilerin gerçekleştirdiği müşteri görüşmeleri (yüzyüze vb.)" icon={Users} />;
};

export default MeetingAnalytics;
