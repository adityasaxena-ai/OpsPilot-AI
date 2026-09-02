import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Bell,
  Shield,
  Sliders,
  Send,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Lock,
  Layers,
} from 'lucide-react';
import { api } from '../lib/api';

export function Settings() {
  const [activeTab, setActiveTab] = useState<'integrations' | 'policies' | 'rbac'>('integrations');
  const [testResult, setTestResult] = useState<{ message: string; dispatchedTo: string[] } | null>(null);

  const { data: integrationsData, isLoading: loadingIntegrations } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => api.integrations.get(),
  });

  const { data: policiesData, isLoading: loadingPolicies } = useQuery({
    queryKey: ['policies'],
    queryFn: () => api.remediation.policies(),
  });

  const testMutation = useMutation({
    mutationFn: () => api.integrations.test(),
    onSuccess: (res) => {
      setTestResult(res.data);
    },
    onError: (err: any) => {
      setTestResult({
        message: `Integration test failed: ${err?.message || err?.error?.message || 'Error'}`,
        dispatchedTo: [],
      });
    },
  });

  const integrations = integrationsData?.data ?? {};
  const policies = (policiesData?.data as Array<Record<string, unknown>>) ?? [];

  return (
    <div className="space-y-6 fade-in">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'hsl(var(--text-primary))' }}>
          Settings & Enterprise Governance
        </h1>
        <p className="text-xs mt-1" style={{ color: 'hsl(var(--text-secondary))' }}>
          Configure enterprise integrations, governance policies, and RBAC security settings.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-3" style={{ borderColor: 'hsl(var(--border))' }}>
        {[
          { id: 'integrations', label: 'Enterprise Integrations', icon: Bell },
          { id: 'policies', label: 'Governance Policies', icon: Sliders },
          { id: 'rbac', label: 'RBAC & Security', icon: Shield },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as never)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: isActive ? 'hsl(var(--accent-primary) / 0.15)' : 'transparent',
                color: isActive ? 'hsl(var(--accent-primary))' : 'hsl(var(--text-secondary))',
                border: isActive ? '1px solid hsl(var(--accent-primary) / 0.3)' : '1px solid transparent',
              }}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Enterprise Integrations */}
      {activeTab === 'integrations' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs" style={{ color: 'hsl(var(--text-secondary))' }}>
              OpsPilot AI integrates with your enterprise incident response and ITSM stack.
            </p>

            <button
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
              style={{ background: 'hsl(var(--accent-primary))', color: 'white' }}
            >
              {testMutation.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
              Send Test Notifications
            </button>
          </div>

          {testResult && (
            <div className="p-3 rounded-lg border text-xs fade-in" style={{ background: 'hsl(142 72% 45% / 0.1)', borderColor: 'hsl(142 72% 45% / 0.3)', color: 'hsl(142 72% 55%)' }}>
              <div className="font-semibold">{testResult.message}</div>
              <div className="mt-1">Dispatched to: {testResult.dispatchedTo.join(', ')}</div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            {/* Slack Card */}
            <div className="p-5 rounded-xl border space-y-3" style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}>
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm" style={{ color: 'hsl(var(--text-primary))' }}>Slack Webhooks</div>
                <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: integrations['slack']?.configured ? 'hsl(142 72% 45% / 0.15)' : 'hsl(38 92% 50% / 0.15)', color: integrations['slack']?.configured ? 'hsl(142 72% 55%)' : 'hsl(38 92% 60%)' }}>
                  {integrations['slack']?.configured ? 'Active' : 'Mock Mode'}
                </span>
              </div>
              <p className="text-xs" style={{ color: 'hsl(var(--text-secondary))' }}>
                Sends real-time Slack Block Kit alerts on incident creation, triage, and postmortem generation.
              </p>
              <div className="text-xs font-mono p-2 rounded" style={{ background: 'hsl(var(--bg-surface-2))', color: 'hsl(var(--text-tertiary))' }}>
                SLACK_WEBHOOK_URL
              </div>
            </div>

            {/* PagerDuty Card */}
            <div className="p-5 rounded-xl border space-y-3" style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}>
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm" style={{ color: 'hsl(var(--text-primary))' }}>PagerDuty V2 API</div>
                <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: integrations['pagerduty']?.configured ? 'hsl(142 72% 45% / 0.15)' : 'hsl(38 92% 50% / 0.15)', color: integrations['pagerduty']?.configured ? 'hsl(142 72% 55%)' : 'hsl(38 92% 60%)' }}>
                  {integrations['pagerduty']?.configured ? 'Active' : 'Mock Mode'}
                </span>
              </div>
              <p className="text-xs" style={{ color: 'hsl(var(--text-secondary))' }}>
                Triggers, acknowledges, and resolves PagerDuty incidents automatically.
              </p>
              <div className="text-xs font-mono p-2 rounded" style={{ background: 'hsl(var(--bg-surface-2))', color: 'hsl(var(--text-tertiary))' }}>
                PAGERDUTY_ROUTING_KEY
              </div>
            </div>

            {/* Jira ITSM Card */}
            <div className="p-5 rounded-xl border space-y-3" style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}>
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm" style={{ color: 'hsl(var(--text-primary))' }}>Jira Service Desk</div>
                <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: integrations['jira']?.configured ? 'hsl(142 72% 45% / 0.15)' : 'hsl(38 92% 50% / 0.15)', color: integrations['jira']?.configured ? 'hsl(142 72% 55%)' : 'hsl(38 92% 60%)' }}>
                  {integrations['jira']?.configured ? 'Active' : 'Mock Mode'}
                </span>
              </div>
              <p className="text-xs" style={{ color: 'hsl(var(--text-secondary))' }}>
                Auto-creates Jira tickets for P1/P2 incidents and links postmortem documents.
              </p>
              <div className="text-xs font-mono p-2 rounded" style={{ background: 'hsl(var(--bg-surface-2))', color: 'hsl(var(--text-tertiary))' }}>
                JIRA_DOMAIN
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Governance Policies */}
      {activeTab === 'policies' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>
                Active Remediation Policies
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--text-secondary))' }}>
                Policy Engine rules evaluated by the Remediation Executor prior to execution.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {policies.map((policy) => (
              <div
                key={policy['id'] as string}
                className="p-4 rounded-xl border flex items-center justify-between"
                style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold" style={{ color: 'hsl(var(--text-primary))' }}>
                      {policy['name'] as string}
                    </span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: 'hsl(var(--bg-surface-2))', color: 'hsl(var(--text-secondary))' }}>
                      {policy['actionType'] as string}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: 'hsl(var(--text-secondary))' }}>
                    Environment: <strong className="uppercase">{policy['environment'] as string}</strong> | Service Tier: <strong>{policy['serviceTier'] as string}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>Max Autonomous Risk</div>
                    <div className="text-sm font-bold font-mono" style={{ color: 'hsl(var(--accent-primary))' }}>
                      {policy['maxRiskScore'] as number}/100
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: policy['requiresApproval'] ? 'hsl(38 92% 50% / 0.15)' : 'hsl(142 72% 45% / 0.15)', color: policy['requiresApproval'] ? 'hsl(38 92% 60%)' : 'hsl(142 72% 55%)' }}>
                    {policy['requiresApproval'] ? <Lock size={13} /> : <CheckCircle size={13} />}
                    {policy['requiresApproval'] ? 'Requires Approval' : 'Autonomous'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: RBAC & Security */}
      {activeTab === 'rbac' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border space-y-3" style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>
              Role-Based Access Control (RBAC) Hierarchy
            </h2>
            <p className="text-xs" style={{ color: 'hsl(var(--text-secondary))' }}>
              OpsPilot AI enforces fine-grained permission controls across operational actions.
            </p>

            <div className="grid grid-cols-4 gap-3 pt-2">
              {[
                { role: 'ADMIN', color: 'hsl(0 85% 60%)', perms: ['Policy Management', 'Chaos Lab Trigger', 'Full Approval Override', 'Audit Export'] },
                { role: 'SRE_LEAD', color: 'hsl(265 85% 65%)', perms: ['High-Risk Approvals', 'Runbook Management', 'AI Pipeline Trigger'] },
                { role: 'OPERATOR', color: 'hsl(220 90% 60%)', perms: ['Low/Med Risk Approvals', 'Incident Ack', 'AI Chat Copilot'] },
                { role: 'READ_ONLY', color: 'hsl(var(--text-tertiary))', perms: ['Dashboard View', 'Audit Log View', 'Metrics Stream'] },
              ].map((r) => (
                <div key={r.role} className="p-3 rounded-lg border space-y-2" style={{ background: 'hsl(var(--bg-surface-2))', borderColor: 'hsl(var(--border))' }}>
                  <span className="text-xs font-bold px-2 py-0.5 rounded font-mono" style={{ background: `${r.color}20`, color: r.color }}>
                    {r.role}
                  </span>
                  <ul className="text-xs space-y-1 pt-1" style={{ color: 'hsl(var(--text-secondary))' }}>
                    {r.perms.map((p) => (
                      <li key={p} className="flex items-center gap-1">
                        <CheckCircle size={10} style={{ color: r.color }} />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
