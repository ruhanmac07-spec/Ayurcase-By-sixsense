import React, { useState, useEffect } from 'react';
import { useAuth } from './state/AuthContext';
import { TopBar } from './components/TopBar';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { ReconnectBanner } from './components/ReconnectBanner';
import { LoginScreen } from './features/auth/LoginScreen';
import { ForceChangePasswordScreen } from './features/auth/ForceChangePasswordScreen';
import { ServerSettingsModal } from './features/auth/ServerSettingsModal';
import { ErrorBoundary } from './components/ErrorBoundary';

// Authority views
import { AuthorityDashboard } from './features/authority/AuthorityDashboard';
import { WorkspacesView } from './features/authority/WorkspacesView';
import { UsersView } from './features/authority/UsersView';
import { MasterDataView } from './features/authority/MasterDataView';
import { BackupsView } from './features/authority/BackupsView';
import { AuditLogsView } from './features/authority/AuditLogsView';

// Doctor views
import { DoctorQueueView } from './features/doctor/DoctorQueueView';
import { ConsultationWorkspace } from './features/doctor/ConsultationWorkspace';
import { DoctorPatientsView } from './features/doctor/DoctorPatientsView';

// Assistant views
import { AssistantHome } from './features/assistant/AssistantHome';
import { AssistantQueueView } from './features/assistant/AssistantQueueView';

export const App: React.FC = () => {
  const { user, isLoading, mustChangePassword } = useAuth();

  const [activeTab, setActiveTab] = useState<ActiveTab>('doctor_queue');
  const [activeVisitId, setActiveVisitId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Set default tab on login or role change
  useEffect(() => {
    if (user) {
      if (user.role === 'AUTHORITY') {
        setActiveTab('authority_dashboard');
      } else if (user.role === 'DOCTOR') {
        setActiveTab('doctor_queue');
      } else if (user.role === 'ASSISTANT') {
        setActiveTab('assistant_home');
      }
    }
  }, [user?.role]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-base flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-3 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-xs font-semibold text-charcoal">Initializing AYURCASE Workstation...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  // Authority using the default bootstrap password must set a new one before accessing the app.
  if (mustChangePassword) {
    return <ForceChangePasswordScreen />;
  }

  const renderContent = () => {
    switch (activeTab) {
      // Authority
      case 'authority_dashboard':
        return <AuthorityDashboard onNavigate={(t) => setActiveTab(t)} />;
      case 'authority_workspaces':
        return <WorkspacesView />;
      case 'authority_users':
        return <UsersView />;
      case 'authority_diagnosis':
        return <MasterDataView initialTab="diagnoses" />;
      case 'authority_medicines':
        return <MasterDataView initialTab="medicines" />;
      case 'authority_rules':
        return <MasterDataView initialTab="rules" />;
      case 'authority_master_data':
        return <MasterDataView />;
      case 'authority_backups':
        return <BackupsView />;
      case 'authority_audit':
        return <AuditLogsView />;

      // Doctor
      case 'doctor_queue':
        return (
          <DoctorQueueView
            onStartConsultation={(visitId) => {
              setActiveVisitId(visitId);
              setActiveTab('doctor_consultation');
            }}
          />
        );
      case 'doctor_consultation':
        if (!activeVisitId) {
          return (
            <div className="p-12 text-center text-xs text-charcoal-muted">
              No active consultation encounter selected. Return to{' '}
              <button
                onClick={() => setActiveTab('doctor_queue')}
                className="text-brand-primary font-bold underline"
              >
                My Queue
              </button>{' '}
              to start an encounter.
            </div>
          );
        }
        return (
          <ConsultationWorkspace
            visitId={activeVisitId}
            onBack={() => {
              setActiveVisitId(null);
              setActiveTab('doctor_queue');
            }}
          />
        );
      case 'doctor_patients':
        return (
          <DoctorPatientsView
            onStartConsultationForVisit={(visitId) => {
              setActiveVisitId(visitId);
              setActiveTab('doctor_consultation');
            }}
            onNewVisitForPatient={(_patient) => {
              if (user.role === 'ASSISTANT') {
                setActiveTab('assistant_home');
              }
            }}
          />
        );

      // Assistant
      case 'assistant_home':
        return <AssistantHome />;
      case 'assistant_queue':
        return <AssistantQueueView />;

      default:
        return <div className="p-6 text-xs text-charcoal-muted">Select a module from the sidebar.</div>;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-surface-base overflow-hidden">
      {/* Network outage & reconnect banner */}
      <ReconnectBanner />

      {/* Top Application Bar */}
      <TopBar onOpenSettings={() => setIsSettingsOpen(true)} />

      {/* Main Workspace Body: Sidebar + Dynamic Panel */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={(tab) => setActiveTab(tab)}
          hasActiveConsultation={!!activeVisitId}
        />

        <main className="flex-1 overflow-y-auto bg-surface-base">
          <ErrorBoundary fallbackTitle="Active Workspace Module Recovery">
            {renderContent()}
          </ErrorBoundary>
        </main>
      </div>

      {/* Server LAN Settings Modal */}
      <ServerSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
};
export default App;
