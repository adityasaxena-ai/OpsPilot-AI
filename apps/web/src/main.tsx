import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { CommandCenter } from './pages/CommandCenter';
import { IncidentList } from './pages/IncidentList';
import { IncidentDetail } from './pages/IncidentDetail';
import { AlertFeed } from './pages/AlertFeed';
import { ServicesPage } from './pages/ServicesPage';
import { ServiceDetail } from './pages/ServiceDetail';
import { ChaosLab } from './pages/ChaosLab';
import { AnalyticsDashboard } from './pages/AnalyticsDashboard';
import { AuditLog } from './pages/AuditLog';
import { Settings } from './pages/Settings';
import { RulesManager } from './pages/RulesManager';
import { NotFound } from './pages/NotFound';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,        // 15 seconds — aligns with simulator tick
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <CommandCenter /> },
      { path: 'incidents', element: <IncidentList /> },
      { path: 'incidents/:id', element: <IncidentDetail /> },
      { path: 'alerts', element: <AlertFeed /> },
      { path: 'services', element: <ServicesPage /> },
      { path: 'services/:id', element: <ServiceDetail /> },
      { path: 'chaos', element: <ChaosLab /> },
      { path: 'analytics', element: <AnalyticsDashboard /> },
      { path: 'audit', element: <AuditLog /> },
      { path: 'settings', element: <Settings /> },
      { path: 'rules', element: <RulesManager /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

const root = document.getElementById('root');
if (!root) throw new Error('No #root element found');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
