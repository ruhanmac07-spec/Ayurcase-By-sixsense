import React, { useState, useEffect } from 'react';
import * as api from '../../api/endpoints';
import * as T from '../../api/types';
import { Modal } from '../../components/Modal';
import { Building2, Plus, Edit2, Ban, RotateCcw } from 'lucide-react';

export const WorkspacesView: React.FC = () => {
  const [workspaces, setWorkspaces] = useState<T.Workspace[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editWorkspace, setEditWorkspace] = useState<T.Workspace | null>(null);

  // Form fields
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const loadWorkspaces = async () => {
    setLoading(true);
    try {
      const data = await api.listWorkspaces();
      setWorkspaces(data);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name) return;

    try {
      await api.createWorkspace({ code, name, description: description || undefined });
      setIsCreateOpen(false);
      setCode('');
      setName('');
      setDescription('');
      loadWorkspaces();
    } catch (err: any) {
      alert(err.message || 'Failed to create workspace');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editWorkspace) return;

    try {
      await api.updateWorkspace(editWorkspace.id, {
        name,
        description: description || undefined,
      });
      setEditWorkspace(null);
      loadWorkspaces();
    } catch (err: any) {
      alert(err.message || 'Failed to update workspace');
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('Deactivate this workspace? Historical patient and visit records will remain strictly preserved.')) {
      return;
    }
    try {
      await api.deactivateWorkspace(id);
      loadWorkspaces();
    } catch (err: any) {
      alert(err.message || 'Failed to deactivate workspace');
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await api.restoreWorkspace(id);
      loadWorkspaces();
    } catch (err: any) {
      alert(err.message || 'Failed to restore workspace');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-charcoal flex items-center space-x-2">
            <Building2 className="w-5 h-5 text-brand-primary" />
            <span>Workspaces &amp; Clinical Units</span>
          </h1>
          <p className="text-xs text-charcoal-muted">
            Manage departmental scopes. Workspace isolation is enforced server-side. Deletion is soft-delete.
          </p>
        </div>

        <button
          onClick={() => {
            setCode('');
            setName('');
            setDescription('');
            setIsCreateOpen(true);
          }}
          className="btn-primary text-xs flex items-center space-x-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>New Workspace</span>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-xs text-charcoal-muted">Loading workspaces...</div>
      ) : (
      <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-surface-base text-charcoal-muted border-b border-gray-200">
              <th className="py-3 px-4 font-semibold">Code</th>
              <th className="py-3 px-4 font-semibold">Department Name</th>
              <th className="py-3 px-4 font-semibold">Description</th>
              <th className="py-3 px-4 font-semibold">Status</th>
              <th className="py-3 px-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {workspaces.map((ws) => (
              <tr key={ws.id} className="hover:bg-gray-50 transition-colors">
                <td className="py-3 px-4 font-mono font-bold text-brand-primary">{ws.code}</td>
                <td className="py-3 px-4 font-bold text-charcoal">{ws.name}</td>
                <td className="py-3 px-4 text-charcoal-muted">{ws.description || '-'}</td>
                <td className="py-3 px-4">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                      ws.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-gray-100 text-gray-700 border border-gray-300'
                    }`}
                  >
                    {ws.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-right space-x-2">
                  <button
                    onClick={() => {
                      setEditWorkspace(ws);
                      setName(ws.name);
                      setDescription(ws.description || '');
                    }}
                    className="btn-secondary text-xs py-1 px-2 inline-flex items-center space-x-1"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>Edit</span>
                  </button>

                  {ws.status === 'ACTIVE' ? (
                    <button
                      onClick={() => handleDeactivate(ws.id)}
                      className="btn-secondary text-xs py-1 px-2 text-rose-700 hover:bg-rose-50 inline-flex items-center space-x-1"
                    >
                      <Ban className="w-3 h-3" />
                      <span>Deactivate</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleRestore(ws.id)}
                      className="btn-secondary text-xs py-1 px-2 text-emerald-700 hover:bg-emerald-50 inline-flex items-center space-x-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Restore</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create New Clinical Workspace"
        subtitle="Department boundaries isolate patient encounters and queue records"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-charcoal mb-1">
              Workspace Code * (Unique uppercase, e.g. SHALYA)
            </label>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. PANCHA"
              className="input-base font-mono uppercase"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-charcoal mb-1">
              Department Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Panchakarma Therapy Unit"
              className="input-base"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-charcoal mb-1">
              Description (Optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Scope and specialty details"
              className="input-base"
            />
          </div>

          <div className="pt-3 border-t border-gray-100 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary text-xs">
              Create Workspace
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={!!editWorkspace}
        onClose={() => setEditWorkspace(null)}
        title={`Edit Workspace: ${editWorkspace?.code}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-charcoal mb-1">
              Department Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-base"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-charcoal mb-1">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-base"
            />
          </div>

          <div className="pt-3 border-t border-gray-100 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={() => setEditWorkspace(null)}
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
    </div>
  );
};
