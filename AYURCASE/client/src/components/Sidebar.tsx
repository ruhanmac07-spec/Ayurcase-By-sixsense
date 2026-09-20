import React from 'react';
import { useAuth } from '../state/AuthContext';
import {
  Activity,
  BookOpen,
  Building2,
  Clock,
  FileText,
  HardDrive,
  ListOrdered,
  Pill,
  Search,
  ShieldCheck,
  Stethoscope,
  Users,
} from 'lucide-react';

export type ActiveTab =
  // Authority
  | 'authority_dashboard'
  | 'authority_workspaces'
  | 'authority_users'
  | 'authority_diagnosis'
  | 'authority_medicines'
  | 'authority_rules'
  | 'authority_master_data'
  | 'authority_backups'
  | 'authority_audit'
  // Doctor
  | 'doctor_queue'
  | 'doctor_consultation'
  | 'doctor_patients'
  // Assistant
  | 'assistant_home'
  | 'assistant_queue';

interface SidebarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  hasActiveConsultation: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  hasActiveConsultation,
}) => {
  const { user } = useAuth();

  if (!user) return null;

  const renderNavButton = (
    tab: ActiveTab,
    label: string,
    Icon: React.ComponentType<{ className?: string }>,
    badge?: number | string
  ) => {
    const isActive = activeTab === tab;
    return (
      <button
        onClick={() => onSelectTab(tab)}
        className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-md transition-colors ${
          isActive
            ? 'bg-brand-primary text-white shadow-sm'
            : 'text-charcoal-medium hover:bg-gray-100 hover:text-charcoal'
        }`}
      >
        <div className="flex items-center space-x-2.5">
          <Icon className={`w-4 h-4 ${isActive ? 'text-brand-tint' : 'text-gray-500'}`} />
          <span>{label}</span>
        </div>
        {badge !== undefined && (
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              isActive
                ? 'bg-brand-medium text-brand-tint'
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside className="w-60 bg-surface-panel border-r border-gray-200 p-3 flex flex-col justify-between shrink-0 select-none">
      <div className="space-y-4">
        {/* Authority Navigation */}
        {user.role === 'AUTHORITY' && (
          <div className="space-y-1">
            <div className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-charcoal-muted">
              System Administration
            </div>
            {renderNavButton('authority_dashboard', 'Dashboard', Activity)}
            {renderNavButton('authority_workspaces', 'Departments / Units', Building2)}
            {renderNavButton('authority_users', 'Staff & Doctors', Users)}
            {renderNavButton('authority_diagnosis', 'Diagnosis Master', BookOpen)}
            {renderNavButton('authority_medicines', 'Medicine Master', Pill)}
            {renderNavButton('authority_rules', 'Clinical Rules', ShieldCheck)}
            {renderNavButton('authority_backups', 'Backups & Recovery', HardDrive)}
            {renderNavButton('authority_audit', 'Security Audit Logs', FileText)}
          </div>
        )}

        {/* Doctor Navigation */}
        {user.role === 'DOCTOR' && (
          <div className="space-y-1">
            <div className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-charcoal-muted">
              Clinical Workspace
            </div>
            {renderNavButton('doctor_queue', 'My Active Queue', Clock)}
            {hasActiveConsultation &&
              renderNavButton('doctor_consultation', 'Current Encounter', Stethoscope, 'Active')}
            {renderNavButton('doctor_patients', 'Patient Directory', Users)}
          </div>
        )}

        {/* Assistant / Reception Navigation */}
        {user.role === 'ASSISTANT' && (
          <div className="space-y-1">
            <div className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-charcoal-muted">
              Patient Intake
            </div>
            {renderNavButton('assistant_home', 'Search & Registration', Search)}
            {renderNavButton('doctor_patients', 'Patient Directory', Users)}
            {renderNavButton('assistant_queue', "Today's Intake Queue", ListOrdered)}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="pt-3 border-t border-gray-100 text-[11px] text-charcoal-muted px-2">
        <div className="flex items-center justify-between">
          <span>LAN Mode</span>
          <span className="font-semibold text-brand-primary">v1.0.0</span>
        </div>
        <div className="text-[10px] text-gray-400 mt-0.5">
          Local SQLite • Zero Cloud
        </div>
      </div>
    </aside>
  );
};
