import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/Toast/Toast';
import PrivateRoute from './components/PrivateRoute';
import AdminRoute from './components/AdminRoute';
import Layout from './components/Layout/Layout';
import Login from './pages/Auth/Login';
import AdminRegister from './pages/Auth/AdminRegister';
import Inbox from './pages/Inbox/Inbox';
import Conversations from './pages/Conversations/Conversations';
import Settings from './pages/Settings/Settings';
import WorkspaceSettings from './pages/Settings/WorkspaceSettings';
// TopicCategories is now inside CaseTypesAndTopics
import CaseTypesAndTopics from './pages/Settings/CaseTypesAndTopics';
import Templates from './pages/Settings/Templates';
import Integrations from './pages/Settings/Integrations';
import Comments from './pages/Comments/Comments';
import Channels from './pages/Channels/Channels';
// Classifier artık Channels içinde birleştirildi


import Users from './pages/Users/Users';
import Teams from './pages/Teams/Teams';
import Customers from './pages/Customers/Customers';
// Deneysel liste görünümü — yalnız SUPER_ADMIN (AdminRoute ile korunuyor)
import Customers2 from './pages/Customers/Customers2';
import Leads from './pages/Leads/Leads';
import KnowledgeBase from './pages/KnowledgeBase/KnowledgeBase';
import Emails from './pages/Emails/Emails';
import AramaAnalizi from './pages/Analytics/AramaAnalizi';
import MeetingAnalytics from './pages/Analytics/MeetingAnalytics';
import AppointmentAnalytics from './pages/Analytics/AppointmentAnalytics';
import AICallAnalytics from './pages/AICallAnalytics/AICallAnalytics';
import CeoReport from './pages/CeoReport/CeoReport';
import GeneralReport from './pages/CeoReport/GeneralReport';
import TeamReport from './pages/CeoReport/TeamReport';
import FunnelReport from './pages/CeoReport/FunnelReport';
import ActivityReport from './pages/CeoReport/ActivityReport';
import AICallReport from './pages/CeoReport/AICallReport';
import SalesReport from './pages/CeoReport/SalesReport';
import RequestReport from './pages/CeoReport/RequestReport';
import AnalysisReport from './pages/CeoReport/AnalysisReport';
import Calendar from './pages/Calendar/Calendar';


import Automations from './pages/Automations/Automations';
import NotificationSettings from './pages/Settings/NotificationSettings';
import FirmSettings from './pages/Settings/FirmSettings';
// Functions page removed - merged into Integrations
import WebForms from './pages/WebForms/WebForms';
import Quotes from './pages/Sales/Quotes';
import Orders from './pages/Sales/Orders';
import Invoices from './pages/Sales/Invoices';
import Products from './pages/Sales/Products';
import Funnels from './pages/Funnels/Funnels';
import RealEstateAdmin from './pages/RealEstate/RealEstateAdmin';
import RealEstateWizard from './pages/RealEstate/RealEstateWizard';
import RealEstateOffers from './pages/RealEstate/RealEstateOffers';
import RealEstatePortfolio from './pages/RealEstate/RealEstatePortfolio';
import RealEstateCampaigns from './pages/RealEstate/RealEstateCampaigns';
import Marketing from './pages/Marketing/Marketing';
import AppNotes from './pages/AppNotes/AppNotes';
import FlowTest from './pages/FlowTest/FlowTest';
import SetupWizard from './pages/Settings/SetupWizard';
import AIAgents from './pages/AIAgents/AIAgents';
import ProfileSettings from './pages/Settings/ProfileSettings';
import './index.css';

import AdminLayout from './layouts/AdminLayout';
import SettingsLayout from './layouts/SettingsLayout';
import AdminDashboard from './pages/Admin/AdminDashboard';
import AdminSettings from './pages/Admin/AdminSettings';
import AdminActivityLog from './pages/Admin/AdminActivityLog';
import AdminFlowTemplates from './pages/Admin/AdminFlowTemplates';
import AdminMessages from './pages/Admin/AdminMessages';
import AdminBilling from './pages/Admin/AdminBilling';

function CalendarRedirect() {
  const location = useLocation();
  return <Navigate to={`/activities/calendar${location.search}`} replace />;
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>

            <Route path="/login" element={<Login />} />
            <Route path="/admin-secret-access" element={<AdminRegister />} />

            {/* Admin Routes - Only SUPER_ADMIN */}
            <Route path="/admin" element={
              <AdminRoute>
                <AdminLayout />
              </AdminRoute>
            }>
              <Route index element={<AdminDashboard />} />
              <Route path="settings" element={<AdminSettings />} />
              <Route path="activity-log" element={<AdminActivityLog />} />
              <Route path="flow-templates" element={<AdminFlowTemplates />} />
              <Route path="messages" element={<AdminMessages />} />
              <Route path="billing" element={<AdminBilling />} />
              <Route path="company/:companyId" element={<AdminDashboard />} />
              <Route path="company/:companyId/workspace/:workspaceId" element={<AdminDashboard />} />
              <Route path="workspace/:workspaceId" element={<AdminDashboard />} />
            </Route>

            {/* Main App Routes */}
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <Layout />
                </PrivateRoute>
              }
            >
              <Route index element={<Navigate to="/inbox" replace />} />
              <Route path="inbox" element={<Inbox />} />
              <Route path="conversations" element={<Navigate to="/inbox" replace />} />
              <Route path="comments" element={<Navigate to="/inbox" replace />} />
              <Route path="emails" element={<Navigate to="/inbox" replace />} />
              <Route path="leads" element={<Navigate to="/inbox" replace />} />
              <Route path="customers" element={<Customers />} />
              <Route path="customers-2" element={<AdminRoute><Customers2 /></AdminRoute>} />
              {/* Settings Hub with Unified Middle Panel */}
              <Route element={<SettingsLayout />}>
                <Route path="base" element={<KnowledgeBase hideSidebar={true} />} />
                <Route path="settings" element={<Navigate to="/base?tab=company" replace />} />
                <Route path="firm-settings" element={<Navigate to="/base?tab=company" replace />} />
                <Route path="channels" element={<Channels />} />
                <Route path="funnels" element={<Funnels />} />
                <Route path="teams" element={<Users />} />
                <Route path="ai-agents" element={<AIAgents />} />
                <Route path="templates" element={<Templates />} />
                {/* Otomasyonlar ve Akış Oluşturucu artık ARAÇLAR menüsünde
                    ayrı maddeler. Eskiden OtomasyonlarHub'ın alt sekmeleriydi;
                    hub kaldırıldı (bkz. aşağıdaki yönlendirme). */}
                {/* key ZORUNLU: ikisi de aynı bileşeni render ediyor, React örneği
                    yeniden kullanıyor ve Automations'daki useState(initialTab)
                    yalnızca ilk render'da okunduğu için sekme değişmiyordu. */}
                <Route path="automations" element={<Automations key="tab-automations" initialTab="automations" />} />
                <Route path="flow-builder" element={<Automations key="tab-flows" initialTab="flows" />} />
                <Route path="integrations" element={<Integrations />} />
                <Route path="notification-settings" element={<NotificationSettings />} />
                <Route path="profile" element={<ProfileSettings />} />
                <Route path="workspace-settings" element={<WorkspaceSettings />} />
              </Route>

              {/* Redirects & Aliases */}
              <Route path="classifier" element={<Navigate to="/channels" replace />} />
              <Route path="users" element={<Navigate to="/teams" replace />} />
              <Route path="agents" element={<Navigate to="/ai-agents" replace />} />
              <Route path="assistants" element={<Navigate to="/ai-agents" replace />} />
              <Route path="topic-categories" element={<Navigate to="/funnels?tab=casetypes" replace />} />
              <Route path="casetypes" element={<Navigate to="/funnels?tab=casetypes" replace />} />
              <Route path="knowledge-base" element={<Navigate to="/base" replace />} />
              {/* Eski bağlantılar ve yer imleri bozulmasın */}
              <Route path="automations-hub" element={<Navigate to="/automations" replace />} />
              <Route path="profile-settings" element={<Navigate to="/profile" replace />} />

              <Route path="setup-wizard" element={<SetupWizard />} />
              <Route path="ayarlar/wizard" element={<SetupWizard />} />
              <Route path="base/wizard" element={<SetupWizard />} />

              <Route path="general-report" element={<CeoReport />} />
              <Route path="general-report/general" element={<GeneralReport />} />
              <Route path="general-report/team" element={<TeamReport />} />
              <Route path="general-report/funnel" element={<FunnelReport />} />
              <Route path="general-report/activities" element={<ActivityReport />} />
              <Route path="general-report/ai-calls" element={<AICallReport />} />
              <Route path="general-report/sales" element={<SalesReport />} />
              <Route path="general-report/requests" element={<RequestReport />} />
              <Route path="general-report/analysis" element={<AnalysisReport />} />
              <Route path="call-analytics" element={<AramaAnalizi />} />
              <Route path="meeting-analytics" element={<MeetingAnalytics />} />
              <Route path="appointment-analytics" element={<AppointmentAnalytics />} />
              <Route path="ai-call-analytics" element={<AICallAnalytics />} />
              <Route path="calendar" element={<CalendarRedirect />} />
              <Route path="activities/calendar" element={<Calendar />} />

              {/* Functions route removed - merged into Integrations */}
              <Route path="web-forms" element={<WebForms />} />
              <Route path="quotes" element={<Quotes />} />
              <Route path="orders" element={<Orders />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="products" element={<Products />} />
              <Route path="pipeline" element={<Navigate to="/inbox" replace />} />
              <Route path="real-estate" element={<RealEstateAdmin />} />
              <Route path="real-estate/wizard" element={<RealEstateWizard />} />
              <Route path="real-estate/offers" element={<RealEstateOffers />} />
              <Route path="real-estate/portfolio" element={<RealEstatePortfolio />} />
              <Route path="real-estate/campaigns" element={<RealEstateCampaigns />} />
              <Route path="marketing" element={<Marketing />} />
              <Route path="app-notes" element={<AppNotes />} />
              <Route path="flow-test" element={<FlowTest />} />
              <Route path="settings/flow-test" element={<FlowTest />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
