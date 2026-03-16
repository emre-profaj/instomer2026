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
import AgentPerformance from './pages/AgentPerformance/AgentPerformance';
import AICallAnalytics from './pages/AICallAnalytics/AICallAnalytics';
import Calendar from './pages/Calendar/Calendar';
import Automations from './pages/Automations/Automations';
import WebForms from './pages/WebForms/WebForms';
import Quotes from './pages/Sales/Quotes';
import Orders from './pages/Sales/Orders';
import Invoices from './pages/Sales/Invoices';
import Pipeline from './pages/Pipeline/Pipeline';
import './index.css';

import AdminLayout from './layouts/AdminLayout';
import AdminDashboard from './pages/Admin/AdminDashboard';
import AdminSettings from './pages/Admin/AdminSettings';

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

              <Route path="users" element={<Users />} />
              <Route path="teams" element={<Navigate to="/users" replace />} />
              <Route path="settings" element={<Settings />} />
              <Route path="knowledge-base" element={<KnowledgeBase />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="agent-performance" element={<AgentPerformance />} />
              <Route path="ai-call-analytics" element={<AICallAnalytics />} />
              <Route path="calendar" element={<Calendar />} />
              <Route path="automations" element={<Automations />} />
              <Route path="web-forms" element={<WebForms />} />
              <Route path="quotes" element={<Quotes />} />
              <Route path="orders" element={<Orders />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="pipeline" element={<Pipeline />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
