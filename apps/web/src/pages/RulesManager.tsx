import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sliders, Plus, Trash2, CheckCircle, AlertTriangle, Shield } from 'lucide-react';
import { api } from '@/lib/api';

interface ThresholdRule {
  id: string;
  name: string;
  metric: string;
  operator: string;
  threshold: number;
  durationSec: number;
  severity: string;
  isEnabled: boolean;
  service?: { name: string; slug: string };
}

export function RulesManager() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRule, setNewRule] = useState({
    name: '',
    metric: 'errorRatePercent',
    operator: 'GT',
    threshold: 10,
    severity: 'P2',
  });

  const { data: rulesData, isLoading } = useQuery({
    queryKey: ['rules', 'list'],
    queryFn: () => api.rules.list(),
  });

  const createRuleMutation = useMutation({
    mutationFn: (rule: typeof newRule) => api.rules.create(rule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      setShowCreateModal(false);
      setNewRule({ name: '', metric: 'errorRatePercent', operator: 'GT', threshold: 10, severity: 'P2' });
    },
  });

  const toggleRuleMutation = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      api.rules.update(id, { isEnabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rules'] }),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => api.rules.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rules'] }),
  });

  const rules = Array.isArray(rulesData?.data) ? (rulesData.data as ThresholdRule[]) : [];


  return (
    <div className="space-y-6 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2" style={{ color: 'hsl(var(--text-primary))' }}>
            <Sliders className="w-5 h-5 text-indigo-400" />
            Telemetry Threshold Rules Manager
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--text-tertiary))' }}>
            Configure operational alert rules evaluated against live OpenTelemetry metric streams.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-xs text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-sm"
        >
          <Plus className="w-4 h-4" />
          New Threshold Rule
        </button>
      </div>

      {/* Rules Table */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
      >
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'hsl(var(--border))' }}>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--text-secondary))' }}>
            Active Rules ({rules.length})
          </span>
          <span className="text-xs text-slate-400">Evaluated every 10 seconds</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading detection rules...</div>
        ) : rules.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">No threshold rules configured. Click "New Threshold Rule" to add one.</div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
            {rules.map((rule) => (
              <div key={rule.id} className="p-4 flex items-center justify-between hover:bg-slate-800/30 transition-all">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleRuleMutation.mutate({ id: rule.id, isEnabled: !rule.isEnabled })}
                    className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${
                      rule.isEnabled ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-500'
                    }`}
                  >
                    {rule.isEnabled && <CheckCircle className="w-3.5 h-3.5" />}
                  </button>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>
                        {rule.name}
                      </span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-bold"
                        style={{
                          background: rule.severity === 'P1' ? 'hsl(0 85% 60% / 0.15)' : 'hsl(38 92% 50% / 0.15)',
                          color: rule.severity === 'P1' ? 'hsl(0 85% 65%)' : 'hsl(38 92% 55%)',
                        }}
                      >
                        {rule.severity}
                      </span>
                      {rule.service && (
                        <span className="text-xs px-2 py-0.5 rounded border border-slate-700 text-slate-300">
                          {rule.service.name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5 text-slate-400 font-mono">
                      WHEN <span className="text-indigo-300 font-semibold">{rule.metric}</span> {rule.operator} <span className="text-emerald-300 font-semibold">{rule.threshold}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-medium ${
                      rule.isEnabled ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-500 bg-slate-800'
                    }`}
                  >
                    {rule.isEnabled ? 'Active' : 'Disabled'}
                  </span>

                  <button
                    onClick={() => deleteRuleMutation.mutate(rule.id)}
                    className="p-1.5 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Rule Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            className="w-full max-w-md rounded-xl border p-6 space-y-4 fade-in"
            style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
          >
            <h3 className="text-base font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>
              Create Threshold Rule
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Rule Name</label>
                <input
                  type="text"
                  placeholder="e.g. High Error Rate Alert"
                  value={newRule.name}
                  onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border bg-slate-900 text-slate-200 border-slate-700 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Metric</label>
                  <select
                    value={newRule.metric}
                    onChange={(e) => setNewRule({ ...newRule, metric: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border bg-slate-900 text-slate-200 border-slate-700 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="errorRatePercent">Error Rate (%)</option>
                    <option value="latencyP99Ms">P99 Latency (ms)</option>
                    <option value="cpuPercent">CPU (%)</option>
                    <option value="memoryPercent">Memory (%)</option>
                    <option value="dbConnectionsActive">DB Connections</option>
                    <option value="queueDepth">Queue Depth</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Operator</label>
                  <select
                    value={newRule.operator}
                    onChange={(e) => setNewRule({ ...newRule, operator: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border bg-slate-900 text-slate-200 border-slate-700 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="GT">&gt; (Greater Than)</option>
                    <option value="GTE">&gt;= (Greater or Equal)</option>
                    <option value="LT">&lt; (Less Than)</option>
                    <option value="LTE">&lt;= (Less or Equal)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Threshold Value</label>
                  <input
                    type="number"
                    value={newRule.threshold}
                    onChange={(e) => setNewRule({ ...newRule, threshold: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border bg-slate-900 text-slate-200 border-slate-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Severity</label>
                  <select
                    value={newRule.severity}
                    onChange={(e) => setNewRule({ ...newRule, severity: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border bg-slate-900 text-slate-200 border-slate-700 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="P1">P1 (Critical)</option>
                    <option value="P2">P2 (High)</option>
                    <option value="P3">P3 (Medium)</option>
                    <option value="P4">P4 (Low)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 text-xs hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => createRuleMutation.mutate(newRule)}
                disabled={!newRule.name}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                Save Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
