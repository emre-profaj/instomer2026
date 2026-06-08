import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import Assistants from './pages/Assistants/Assistants';
import Comments from './pages/Comments/Comments';
import Channels from './pages/Channels/Channels';

import Users from './pages/Users/Users';
import Teams from './pages/Teams/Teams';
import Customers from './pages/Customers/Customers';
import Leads from './pages/Leads/Leads';
import KnowledgeBase from './pages/KnowledgeBase/KnowledgeBase';
import Emails from './pages/Emails/Emails';
import Analytics from './pages/Analytics/Analytics';
import AramaAnalizi from './pages/Analytics/AramaAnalizi';
import AgentPerformance from './pages/AgentPerformance/AgentPerformance';
import AICallAnalytics from './pages/AICallAnalytics/AICallAnalytics';
import CeoReport from './pages/CeoReport/CeoReport';
import Calendar from './pages/Calendar/Calendar';
import Activities from './pages/Activities/Activities';
import Automations from './pages/Automations/Automations';
import Functions from './pages/Automations/Functions';
import WebForms from './pages/WebForms/WebForms';
import Quotes from './pages/Sales/Quotes';
import Orders from './pages/Sales/Orders';
import Invoices from './pages/Sales/Invoices';
import Funnels from './pages/Funnels/Funnels';
import RealEstateAdmin from './pages/RealEstate/RealEstateAdmin';
import RealEstateWizard from './pages/RealEstate/RealEstateWizard';
import RealEstateOffers from './pages/RealEstate/RealEstateOffers';
import RealEstatePortfolio from './pages/RealEstate/RealEstatePortfolio';
import RealEstateCampaigns from './pages/RealEstate/RealEstateCampaigns';
import './index.css';

import AdminLayout from './layouts/AdminLayout';
import AdminDashboard from './pages/Admin/AdminDashboard';
import AdminSettings from './pages/Admin/AdminSettings';
import AdminActivityLog from './pages/Admin/AdminActivityLog';
import AdminFlowTemplates from './pages/Admin/AdminFlowTemplates';

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
              <Route path="assistants" element={<Assistants />} />
              <Route path="channels" element={<Channels />} />

              <Route path="teams" element={<Users />} />
              <Route path="users" element={<Navigate to="/teams" replace />} />
              <Route path="settings" element={<Settings />} />
              <Route path="knowledge-base" element={<KnowledgeBase />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="ceo-report" element={<CeoReport />} />
              <Route path="call-analytics" element={<AramaAnalizi />} />
              <Route path="agent-performance" element={<AgentPerformance />} />
              <Route path="ai-call-analytics" element={<AICallAnalytics />} />
              <Route path="calendar" element={<Navigate to="/activities/calendar" replace />} />
              <Route path="activities/calendar" element={<Calendar />} />
              <Route path="activities/calls" element={<Activities />} />
              <Route path="activities/meetings" element={<Activities />} />
              <Route path="activities/tasks" element={<Activities />} />
              <Route path="activities/appointments" element={<Activities />} />
              <Route path="automations" element={<Automations />} />
              <Route path="functions" element={<Functions />} />
              <Route path="web-forms" element={<WebForms />} />
              <Route path="quotes" element={<Quotes />} />
              <Route path="orders" element={<Orders />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="pipeline" element={<Navigate to="/inbox" replace />} />
              <Route path="funnels" element={<Funnels />} />
              <Route path="real-estate" element={<RealEstateAdmin />} />
              <Route path="real-estate/wizard" element={<RealEstateWizard />} />
              <Route path="real-estate/offers" element={<RealEstateOffers />} />
              <Route path="real-estate/portfolio" element={<RealEstatePortfolio />} />
              <Route path="real-estate/campaigns" element={<RealEstateCampaigns />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
