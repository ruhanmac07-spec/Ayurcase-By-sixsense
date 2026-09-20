import React, { useState, useEffect, useMemo } from 'react';
import * as api from '../../api/endpoints';
import * as T from '../../api/types';
import { Modal } from '../../components/Modal';
import {
  Users,
  UserPlus,
  KeyRound,
  Ban,
  ShieldAlert,
  Building2,
  Stethoscope,
  UserCheck,
  Search,
  ChevronDown,
  ChevronUp,
  Edit2,
  RefreshCw,
  Shield,
  Filter,
} from 'lucide-react';

export const UsersView: React.FC = () => {
  const [users, setUsers] = useState<T.UserSummary[]>([]);
  const [workspaces, setWorkspaces] = useState<T.Workspace[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'DOCTOR' | 'ASSISTANT' | 'AUTHORITY'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DEACTIVATED'>('ALL');

  // Collapsible departments state: Map<workspaceId, boolean>
  const [collapsedDepts, setCollapsedDepts] = useState<Record<string, boolean>>({});

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<T.UserSummary | null>(null);
  const [resetUser, setResetUser] = useState<T.UserSummary | null>(null);

  // Create User Form State
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<T.UserRole>('DOCTOR');
  const [workspaceId, setWorkspaceId] = useState('');
  const [phone, setPhone] = useState('');
  const [qualification, setQualification] = useState('');

  // One-time credential sheet shown after create/reset — never persisted
  const [credSheet, setCredSheet] = useState<{
    type: 'created' | 'reset';
    userName: string;
    generatedUsername?: string;
    generatedPassword: string;
  } | null>(null);

  // Edit User Form State
  const [editFullName, setEditFullName] = useState('');
  const [editRole, setEditRole] = useState<T.UserRole>('DOCTOR');
  const [editWorkspaceId, setEditWorkspaceId] = useState<string>('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'DEACTIVATED'>('ACTIVE');
  const [editQualification, setEditQualification] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [u, w] = await Promise.all([api.listUsers(), api.listWorkspaces()]);
      setUsers(u);
      setWorkspaces(w);
      if (w.length > 0 && !workspaceId) {
        setWorkspaceId(w[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load users/workspaces', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const toggleDeptCollapse = (deptId: string) => {
    setCollapsedDepts((prev) => ({
      ...prev,
      [deptId]: !prev[deptId],
    }));
  };

  // Filtered users based on search, role, status
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        u.full_name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.workspace_name && u.workspace_name.toLowerCase().includes(q));

      const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
      const matchesStatus = statusFilter === 'ALL' || u.status === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  // Group filtered users by department / workspace
  const departmentGroups = useMemo(() => {
    const map = new Map<string, { workspace?: T.Workspace; users: T.UserSummary[] }>();

    // Initialise each workspace
    workspaces.forEach((w) => {
      map.set(w.id, { workspace: w, users: [] });
    });

    // Bucket users
    const globalUsers: T.UserSummary[] = [];
    filteredUsers.forEach((u) => {
      if (u.workspace_id && map.has(u.workspace_id)) {
        map.get(u.workspace_id)!.users.push(u);
      } else {
        globalUsers.push(u);
      }
    });

    return {
      departments: Array.from(map.values()),
      global: globalUsers,
    };
  }, [workspaces, filteredUsers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !role) return;

    try {
      const res = await api.createUser({
        full_name: fullName,
        role,
        workspace_id: role === 'AUTHORITY' ? undefined : workspaceId || undefined,
        phone: phone.trim() || undefined,
        qualification: qualification.trim() || undefined,
      });

      setIsCreateOpen(false);
      setFullName('');
      setPhone('');
      setQualification('');
      setRole('DOCTOR');

      // Show one-time credential sheet
      setCredSheet({
        type: 'created',
        userName: res.user.full_name,
        generatedUsername: res.generated_username,
        generatedPassword: res.generated_password,
      });

      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to create user');
    }
  };

  const openEditModal = (u: T.UserSummary) => {
    setEditUser(u);
    setEditFullName(u.full_name);
    setEditRole(u.role);
    setEditWorkspaceId(u.workspace_id || (workspaces[0]?.id ?? ''));
    setEditStatus(u.status);
    setEditQualification(u.qualification || '');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;

    try {
      await api.updateUser(editUser.id, {
        full_name: editFullName,
        role: editRole,
        workspace_id: editRole === 'AUTHORITY' ? null : editWorkspaceId,
        status: editStatus,
        qualification: editQualification.trim() || null,
      });

      setEditUser(null);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to update user');
    }
  };

  const handleToggleStatus = async (user: T.UserSummary) => {
    const isActivating = user.status === 'DEACTIVATED';
    const confirmMsg = isActivating
      ? `Reactivate account for ${user.full_name}? User will be able to log in again.`
      : `Deactivate account for ${user.full_name}? All active sessions will be revoked immediately.`;

    if (!confirm(confirmMsg)) return;

    try {
      if (isActivating) {
        await api.updateUser(user.id, { status: 'ACTIVE' });
      } else {
        await api.deactivateUser(user.id);
      }
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to update user status');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUser) return;

    try {
      const res = await api.resetUserPassword(resetUser.id, '');
      setResetUser(null);

      // Show the one-time auto-generated password
      setCredSheet({
        type: 'reset',
        userName: resetUser.full_name,
        generatedPassword: res.generated_password,
      });
    } catch (err: any) {
      alert(err.message || 'Failed to reset password');
    }
  };

  // Helper renderer for a users table (Doctors or Assistants)
  const renderUserTable = (
    userList: T.UserSummary[],
    title: string,
    icon: React.ReactNode,
    badgeColor: string,
    emptyMessage: string
  ) => {
    return (
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-xs">
        <div className="bg-surface-base px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {icon}
            <span className="font-semibold text-xs text-charcoal">{title}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>
              {userList.length} {userList.length === 1 ? 'Account' : 'Accounts'}
            </span>
          </div>
        </div>

        {userList.length === 0 ? (
          <div className="py-6 text-center text-xs text-charcoal-muted italic">{emptyMessage}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50/50 text-charcoal-muted border-b border-gray-200 text-[11px]">
                  <th className="py-2.5 px-4 font-semibold">Full Name</th>
                  <th className="py-2.5 px-4 font-semibold">Qualification</th>
                  <th className="py-2.5 px-4 font-semibold">Username</th>
                  <th className="py-2.5 px-4 font-semibold">Role</th>
                  <th className="py-2.5 px-4 font-semibold">Status</th>
                  <th className="py-2.5 px-4 font-semibold">Last Login</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {userList.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-2.5 px-4 font-semibold text-charcoal">{u.full_name}</td>
                    <td className="py-2.5 px-4">
                      {u.qualification ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {u.qualification}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-charcoal-muted">{u.username}</td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.role === 'AUTHORITY'
                            ? 'bg-purple-100 text-purple-800'
                            : u.role === 'DOCTOR'
                            ? 'bg-brand-tint text-brand-primary'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-charcoal-muted text-[11px]">
                      {u.last_login_at ? u.last_login_at.replace('T', ' ').substring(0, 16) : 'Never'}
                    </td>
                    <td className="py-2.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        onClick={() => openEditModal(u)}
                        title="Edit User & Department"
                        className="btn-secondary text-[11px] py-1 px-2 inline-flex items-center space-x-1"
                      >
                        <Edit2 className="w-3 h-3 text-charcoal-muted" />
                        <span>Edit</span>
                      </button>

                      <button
                        onClick={() => {
                          setResetUser(u);
                        }}
                        title="Reset User Password"
                        className="btn-secondary text-[11px] py-1 px-2 inline-flex items-center space-x-1"
                      >
                        <KeyRound className="w-3 h-3 text-amber-600" />
                        <span>Password</span>
                      </button>

                      <button
                        onClick={() => handleToggleStatus(u)}
                        title={u.status === 'ACTIVE' ? 'Deactivate Account' : 'Reactivate Account'}
                        className={`text-[11px] py-1 px-2 rounded font-medium inline-flex items-center space-x-1 border transition-colors ${
                          u.status === 'ACTIVE'
                            ? 'border-rose-200 text-rose-700 bg-rose-50/50 hover:bg-rose-100'
                            : 'border-emerald-200 text-emerald-700 bg-emerald-50/50 hover:bg-emerald-100'
                        }`}
                      >
                        {u.status === 'ACTIVE' ? (
                          <>
                            <Ban className="w-3 h-3" />
                            <span>Deactivate</span>
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3 h-3" />
                            <span>Activate</span>
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // Determine departments to display based on selectedDept dropdown
  const visibleDepts = useMemo(() => {
    if (selectedDept === 'ALL') {
      return departmentGroups.departments;
    }
    if (selectedDept === 'GLOBAL') {
      return [];
    }
    return departmentGroups.departments.filter((d) => d.workspace?.id === selectedDept);
  }, [selectedDept, departmentGroups]);

  const showGlobalSection = selectedDept === 'ALL' || selectedDept === 'GLOBAL';

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-charcoal flex items-center space-x-2">
            <Users className="w-5 h-5 text-brand-primary" />
            <span>Staff &amp; Physician Organization</span>
          </h1>
          <p className="text-xs text-charcoal-muted mt-0.5">
            Manage clinical personnel organized by Department/Workspace with strictly separated Doctors &amp; Assistants.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => {
              setFullName('');
              setPhone('');
              setQualification('');
              setRole('DOCTOR');
              setIsCreateOpen(true);
            }}
            className="btn-primary text-xs flex items-center space-x-1.5 shadow-xs"
          >
            <UserPlus className="w-4 h-4" />
            <span>Register New Account</span>
          </button>
        </div>
      </div>

      {/* Control Bar: Department Selector, Search, Role & Status Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Department Selector */}
          <div className="flex items-center space-x-2 min-w-[240px]">
            <Building2 className="w-4 h-4 text-brand-primary shrink-0" />
            <div className="flex-1">
              <label
                htmlFor="dept-filter-select"
                className="block text-[10px] font-semibold uppercase tracking-wider text-charcoal-muted mb-0.5"
              >
                Department / Workspace
              </label>
              <select
                id="dept-filter-select"
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="input-base text-xs py-1.5 font-medium bg-surface-base"
              >
                <option value="ALL">All Departments ({workspaces.length})</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
                <option value="GLOBAL">Global / Authority Staff</option>
              </select>
            </div>
          </div>

          {/* Quick Search */}
          <div className="relative min-w-[200px] flex-1 sm:flex-initial">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-charcoal-muted mb-0.5">
              Quick Search
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-charcoal-muted absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, username..."
                className="input-base text-xs py-1.5 pl-8"
              />
            </div>
          </div>
        </div>

        {/* Role & Status Filter Badges */}
        <div className="flex items-center space-x-3 text-xs w-full sm:w-auto justify-end">
          <div className="flex items-center space-x-1.5">
            <Filter className="w-3.5 h-3.5 text-charcoal-muted" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
              className="input-base text-xs py-1.5 px-2 bg-surface-base"
            >
              <option value="ALL">All Roles</option>
              <option value="DOCTOR">Doctors Only</option>
              <option value="ASSISTANT">Assistants Only</option>
              <option value="AUTHORITY">Authority Only</option>
            </select>
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="input-base text-xs py-1.5 px-2 bg-surface-base"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="DEACTIVATED">Deactivated Only</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-xs text-charcoal-muted flex flex-col items-center justify-center space-y-2">
          <RefreshCw className="w-5 h-5 animate-spin text-brand-primary" />
          <span>Loading staff and physician organization...</span>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Department Cards */}
          {visibleDepts.map((deptGroup) => {
            const ws = deptGroup.workspace;
            if (!ws) return null;

            const isCollapsed = !!collapsedDepts[ws.id];
            const doctors = deptGroup.users.filter((u) => u.role === 'DOCTOR');
            const assistants = deptGroup.users.filter((u) => u.role === 'ASSISTANT');
            const otherStaff = deptGroup.users.filter((u) => u.role !== 'DOCTOR' && u.role !== 'ASSISTANT');

            return (
              <div
                key={ws.id}
                className="bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden transition-all"
              >
                {/* Department Header */}
                <div
                  onClick={() => toggleDeptCollapse(ws.id)}
                  className="px-5 py-3.5 bg-gradient-to-r from-emerald-50/70 to-slate-50 border-b border-gray-200 flex items-center justify-between cursor-pointer hover:bg-emerald-50/90 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-brand-tint rounded-lg text-brand-primary">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h2 className="text-sm font-bold text-charcoal">{ws.name}</h2>
                        <span className="font-mono text-[10px] font-bold bg-white border border-gray-200 px-2 py-0.5 rounded text-charcoal">
                          {ws.code}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            ws.status === 'ACTIVE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {ws.status}
                        </span>
                      </div>
                      {ws.description && (
                        <p className="text-[11px] text-charcoal-muted mt-0.5">{ws.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-2 text-xs">
                      <span className="inline-flex items-center space-x-1 bg-white border border-gray-200 px-2.5 py-1 rounded-md text-charcoal-medium">
                        <Stethoscope className="w-3.5 h-3.5 text-brand-primary" />
                        <span className="font-bold text-charcoal">{doctors.length}</span>
                        <span className="text-[10px] text-charcoal-muted">Physicians</span>
                      </span>

                      <span className="inline-flex items-center space-x-1 bg-white border border-gray-200 px-2.5 py-1 rounded-md text-charcoal-medium">
                        <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                        <span className="font-bold text-charcoal">{assistants.length}</span>
                        <span className="text-[10px] text-charcoal-muted">Assistants</span>
                      </span>
                    </div>

                    <button
                      type="button"
                      aria-label="Toggle section"
                      className="p-1 text-charcoal-muted hover:text-charcoal"
                    >
                      {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Collapsible Content */}
                {!isCollapsed && (
                  <div className="p-5 space-y-5 bg-surface-ground/30">
                    {/* Doctors Section */}
                    {renderUserTable(
                      doctors,
                      'Department Physicians (चिकित्सक)',
                      <Stethoscope className="w-4 h-4 text-brand-primary" />,
                      'bg-emerald-100 text-emerald-800',
                      'No physicians / doctors currently assigned to this department.'
                    )}

                    {/* Assistants Section */}
                    {renderUserTable(
                      assistants,
                      'Clinical & Intake Assistants (सहायक)',
                      <UserCheck className="w-4 h-4 text-blue-600" />,
                      'bg-blue-100 text-blue-800',
                      'No assistants currently assigned to this department.'
                    )}

                    {otherStaff.length > 0 &&
                      renderUserTable(
                        otherStaff,
                        'Other Departmental Personnel',
                        <Users className="w-4 h-4 text-purple-600" />,
                        'bg-purple-100 text-purple-800',
                        'No other personnel assigned.'
                      )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Global / Unassigned / Authority Staff Section */}
          {showGlobalSection && (
            <div className="bg-white border border-purple-200 rounded-xl shadow-xs overflow-hidden">
              <div className="px-5 py-3.5 bg-gradient-to-r from-purple-50 to-slate-50 border-b border-purple-100 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-purple-100 rounded-lg text-purple-700">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h2 className="text-sm font-bold text-purple-950">
                        Central Authority &amp; System Administration
                      </h2>
                      <span className="text-[10px] font-bold bg-purple-100 text-purple-800 px-2 py-0.5 rounded">
                        Global Scope
                      </span>
                    </div>
                    <p className="text-[11px] text-charcoal-muted mt-0.5">
                      System administrators and global overseers unassigned to a single clinical department.
                    </p>
                  </div>
                </div>

                <div className="text-xs font-semibold text-purple-800 bg-purple-100/70 px-3 py-1 rounded-md">
                  {departmentGroups.global.length} Administrator Accounts
                </div>
              </div>

              <div className="p-5">
                {renderUserTable(
                  departmentGroups.global,
                  'Authority Administrators & Supervisors',
                  <Shield className="w-4 h-4 text-purple-600" />,
                  'bg-purple-100 text-purple-800',
                  'No unassigned global users found.'
                )}
              </div>
            </div>
          )}

          {/* If No Users Match Filters */}
          {filteredUsers.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-charcoal-muted">
              <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-charcoal">No user accounts found matching current filters.</p>
              <p className="text-xs text-charcoal-muted mt-1">Try resetting the department, role, or search query.</p>
            </div>
          )}
        </div>
      )}

      {/* Edit User Modal */}
      <Modal
        isOpen={!!editUser}
        onClose={() => setEditUser(null)}
        title={`Edit User: ${editUser?.username}`}
        subtitle="Modify name, role, department assignment, and status"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-charcoal mb-1">
              Full Name *
            </label>
            <input
              type="text"
              required
              value={editFullName}
              onChange={(e) => setEditFullName(e.target.value)}
              className="input-base"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-charcoal mb-1">
              Medical Qualification
            </label>
            <input
              type="text"
              value={editQualification}
              onChange={(e) => setEditQualification(e.target.value)}
              placeholder="e.g. BAMS, MD (Ayurveda)"
              className="input-base"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1">
                Role *
              </label>
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as any)}
                className="input-base"
              >
                <option value="DOCTOR">DOCTOR</option>
                <option value="ASSISTANT">ASSISTANT</option>
                <option value="AUTHORITY">AUTHORITY</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1">
                Account Status *
              </label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as any)}
                className="input-base font-semibold"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="DEACTIVATED">DEACTIVATED</option>
              </select>
            </div>
          </div>

          {editRole !== 'AUTHORITY' ? (
            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1">
                Assigned Department / Workspace *
              </label>
              <select
                value={editWorkspaceId}
                onChange={(e) => setEditWorkspaceId(e.target.value)}
                className="input-base"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="p-2.5 bg-purple-50 border border-purple-200 rounded text-xs text-purple-900">
              Authority accounts operate with global system scope across all clinical departments.
            </div>
          )}

          <div className="pt-3 border-t border-gray-100 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={() => setEditUser(null)}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary text-xs">
              Save Changes
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Register New User Account"
        subtitle="Username and initial password are auto-generated by the server"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {/* Info notice */}
          <div className="p-3 bg-brand-tint border border-brand-sage rounded text-xs text-brand-primary">
            <strong>Automatic Credentials:</strong> The server will generate a secure username (e.g.{' '}
            <code>name@ayush.com</code>) and an initial password from the staff member's phone number.
            You will see the credentials <strong>once</strong> after creation — save them securely.
          </div>

          <div>
            <label className="block text-xs font-semibold text-charcoal mb-1">
              Full Name *
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Ayush Mani Sharma"
              className="input-base"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-charcoal mb-1">
              Qualification {role === 'DOCTOR' ? '(Recommended)' : '(Optional)'}
            </label>
            <input
              type="text"
              value={qualification}
              onChange={(e) => setQualification(e.target.value)}
              placeholder="e.g. BAMS, MD (Ayurveda), MS (Shalya)"
              className="input-base"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1">
                Role *
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className="input-base"
              >
                <option value="DOCTOR">DOCTOR</option>
                <option value="ASSISTANT">ASSISTANT</option>
                <option value="AUTHORITY">AUTHORITY</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1">
                Phone (sets initial password)
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 9876543210"
                className="input-base font-mono"
              />
            </div>
          </div>

          {role !== 'AUTHORITY' && (
            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1">
                Assign Department / Workspace *
              </label>
              <select
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                className="input-base"
              >
                <option value="">— Select Department —</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="pt-3 border-t border-gray-100 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary text-xs">
              Create Account
            </button>
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        isOpen={!!resetUser}
        onClose={() => setResetUser(null)}
        title={`Reset Password: ${resetUser?.full_name}`}
        subtitle="A new temporary password will be generated and shown once"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleResetPassword} className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-300 rounded text-xs text-amber-900 flex items-start space-x-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              All active sessions for <strong>{resetUser?.full_name}</strong> will be revoked.
              A new temporary password will be generated by the server and shown to you <strong>once</strong>.
            </div>
          </div>

          <div className="pt-3 border-t border-gray-100 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={() => setResetUser(null)}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary text-xs">
              Generate New Password
            </button>
          </div>
        </form>
      </Modal>

      {/* One-time Credential Sheet */}
      {credSheet && (
        <Modal
          isOpen={true}
          onClose={() => setCredSheet(null)}
          title={credSheet.type === 'created' ? '✅ Account Created — Save Credentials' : '🔑 Password Reset — New Temporary Password'}
          subtitle="This information will NOT be shown again. Save it securely now."
          maxWidth="max-w-sm"
        >
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 border-2 border-amber-400 rounded-lg space-y-3">
              <div className="flex items-center space-x-2 text-amber-900 text-xs font-bold uppercase tracking-wide">
                <ShieldAlert className="w-4 h-4" />
                <span>One-Time Display — Copy Now</span>
              </div>

              <div className="space-y-2">
                <div>
                  <div className="text-[10px] font-semibold text-charcoal-muted uppercase tracking-wider">Staff Member</div>
                  <div className="font-bold text-charcoal text-sm">{credSheet.userName}</div>
                </div>

                {credSheet.generatedUsername && (
                  <div>
                    <div className="text-[10px] font-semibold text-charcoal-muted uppercase tracking-wider">Login Username</div>
                    <div className="font-mono text-sm font-bold text-brand-primary bg-white border border-brand-sage px-3 py-1.5 rounded select-all">
                      {credSheet.generatedUsername}
                    </div>
                  </div>
                )}

                <div>
                  <div className="text-[10px] font-semibold text-charcoal-muted uppercase tracking-wider">Temporary Password</div>
                  <div className="font-mono text-sm font-bold text-rose-700 bg-white border border-rose-300 px-3 py-1.5 rounded select-all">
                    {credSheet.generatedPassword}
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-amber-800 border-t border-amber-300 pt-3">
                The staff member must change this password on their first login.
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setCredSheet(null)}
                className="btn-primary text-xs"
              >
                I've Saved the Credentials
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
