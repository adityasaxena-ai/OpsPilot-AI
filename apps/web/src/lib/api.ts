const rawApiUrl = import.meta.env.VITE_API_URL || '';
const API_BASE = (rawApiUrl ? rawApiUrl.replace(/\/$/, '') : '') + '/api/v1';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const isMutation = options?.method === 'POST' || options?.method === 'PUT' || options?.method === 'PATCH';
  const hasBody = options?.body !== undefined;

  const headers: Record<string, string> = { ...options?.headers as Record<string, string> };
  if (hasBody || isMutation) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: hasBody ? options.body : isMutation ? '{}' : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(error?.error?.message ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ─── Services ────────────────────────────────────────────────────────────────
export const api = {
  services: {
    list: () => request<{ success: boolean; data: unknown[] }>('/services'),
    get: (id: string) => request<{ success: boolean; data: unknown }>(`/services/${id}`),
    health: (id: string) => request<{ success: boolean; data: unknown }>(`/services/${id}/health`),
    dependencies: (id: string) => request<{ success: boolean; data: unknown[] }>(`/services/${id}/dependencies`),
    incidents: (id: string) => request<{ success: boolean; data: unknown[] }>(`/services/${id}/incidents`),
  },

  alerts: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<{ success: boolean; data: unknown[]; meta: unknown }>(`/alerts${qs}`);
    },
    get: (id: string) => request<{ success: boolean; data: unknown }>(`/alerts/${id}`),
    update: (id: string, body: { status: string }) =>
      request<{ success: boolean; data: unknown }>(`/alerts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },

  incidents: {
    list: (params?: Record<string, string>) => {
      const q = params ? `?${new URLSearchParams(params)}` : '';
      return request<{ success: boolean; data: unknown[]; meta: { total: number } }>(`/incidents${q}`);
    },
    get: (id: string) => request<{ success: boolean; data: unknown }>(`/incidents/${id}`),
    timeline: (id: string) => request<{ success: boolean; data: unknown[] }>(`/incidents/${id}/timeline`),
    updateStatus: (id: string, status: string) =>
      request<{ success: boolean; data: unknown }>(`/incidents/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    topology: (id: string) => request<{ success: boolean; data: unknown }>(`/incidents/${id}/topology`),
    evidence: (id: string) => request<{ success: boolean; data: unknown[] }>(`/incidents/${id}/evidence`),
    update: (id: string, body: Record<string, unknown>) =>
      request<{ success: boolean; data: unknown }>(`/incidents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },

  simulator: {
    status: () => request<{ success: boolean; data: unknown[] }>('/simulator/status'),
    scenarios: () => request<{ success: boolean; data: unknown[] }>('/simulator/scenarios'),
    injectChaos: (body: { serviceId: string; scenario: string; durationSeconds?: number }) =>
      request<{ success: boolean; data: unknown }>('/simulator', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    heal: (serviceId?: string) =>
      request<{ success: boolean; data: unknown }>('/simulator/heal', {
        method: 'POST',
        body: JSON.stringify(serviceId ? { serviceId } : {}),
      }),
    deploy: (body: { serviceId: string; isBadDeployment?: boolean; version?: string }) =>
      request<{ success: boolean; data: unknown }>('/simulator/deploy', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },

  analytics: {
    overview: () => request<{ success: boolean; data: unknown }>('/analytics/overview'),
    incidents: (days = 30) => request<{ success: boolean; data: unknown }>(`/analytics/incidents?days=${days}`),
    automation: () => request<{ success: boolean; data: unknown }>('/analytics/automation'),
  },

  audit: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<{ success: boolean; data: unknown[]; meta: unknown }>(`/audit${qs}`);
    },
  },

  events: {
    ingest: (event: unknown) =>
      request<{ success: boolean; data: unknown }>('/events', {
        method: 'POST',
        body: JSON.stringify(event),
      }),
  },

  ai: {
    triage: (incidentId: string) =>
      request<{ success: boolean; data: unknown }>('/ai/triage', {
        method: 'POST',
        body: JSON.stringify({ incidentId }),
      }),
    investigate: (incidentId: string) =>
      request<{ success: boolean; data: unknown }>('/ai/investigate', {
        method: 'POST',
        body: JSON.stringify({ incidentId }),
      }),
    rca: (incidentId: string) =>
      request<{ success: boolean; data: unknown }>('/ai/investigate', {
        method: 'POST',
        body: JSON.stringify({ incidentId }),
      }),
    postmortem: (incidentId: string) =>
      request<{ success: boolean; data: unknown }>('/ai/postmortem', {
        method: 'POST',
        body: JSON.stringify({ incidentId }),
      }),
    chat: (message: string, incidentId?: string) =>
      request<{ success: boolean; data: { reply: string; model: string; tokenUsage: unknown } }>('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message, incidentId }),
      }),
    getInvestigations: (incidentId: string) =>
      request<{ success: boolean; data: unknown[] }>(`/ai/investigations/${incidentId}`),
  },

  remediation: {
    list: () => request<{ success: boolean; data: unknown[] }>('/remediation'),
    policies: () => request<{ success: boolean; data: unknown[] }>('/remediation/policies'),
    preview: (id: string) => request<{ success: boolean; data: any }>(`/remediation/action-preview/${id}`),
    propose: (body: { incidentId: string; actionType: string; serviceId: string; rationale?: string }) =>
      request<{ success: boolean; data: unknown }>('/remediation/propose', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    approve: (id: string) =>
      request<{ success: boolean; data: unknown }>(`/remediation/${id}/approve`, {
        method: 'POST',
        headers: { 'x-operator-id': 'dev-user-admin' },
        body: JSON.stringify({}),
      }),
    reject: (id: string, reason?: string) =>
      request<{ success: boolean; data: unknown }>(`/remediation/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    execute: (id: string) =>
      request<{ success: boolean; data: unknown }>(`/remediation/${id}/execute`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
  },

  integrations: {
    get: () => request<{ success: boolean; data: Record<string, { configured: boolean; webhookUrl?: string; domain?: string }> }>('/integrations'),
    test: () => request<{ success: boolean; data: { message: string; dispatchedTo: string[] } }>('/integrations/test', { method: 'POST', body: JSON.stringify({}) }),
  },

  rules: {
    list: () => request<{ success: boolean; data: unknown[] }>('/rules'),
    create: (rule: Record<string, unknown>) =>
      request<{ success: boolean; data: unknown }>('/rules', {
        method: 'POST',
        body: JSON.stringify(rule),
      }),
    update: (id: string, rule: Record<string, unknown>) =>
      request<{ success: boolean; data: unknown }>(`/rules/${id}`, {
        method: 'PUT',
        body: JSON.stringify(rule),
      }),
    delete: (id: string) =>
      request<{ success: boolean; data: { id: string; deleted: boolean } }>(`/rules/${id}`, {
        method: 'DELETE',
      }),
  },

  telemetry: {
    status: () =>
      request<{
        success: boolean;
        data: {
          providerName: string;
          status: string;
          activeSource: string;
          isReplaying: boolean;
          isRecording: boolean;
          details?: Record<string, unknown>;
        };
      }>('/telemetry/status'),
    setProvider: (provider: 'otel' | 'mock' | 'replay') =>
      request<{ success: boolean; data: unknown }>('/telemetry/provider', {
        method: 'POST',
        body: JSON.stringify({ provider }),
      }),
    startRecord: (title?: string) =>
      request<{ success: boolean; data: unknown }>('/telemetry/record/start', {
        method: 'POST',
        body: JSON.stringify({ title }),
      }),
    stopRecord: () =>
      request<{ success: boolean; data: unknown }>('/telemetry/record/stop', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    startReplay: () =>
      request<{ success: boolean; data: unknown }>('/telemetry/replay/start', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
  },
  topology: {
    getTopology: () =>
      request<{ success: boolean; data: import('@opspilot/types').EstateTopologyResponse }>('/topology'),
    getComponentDetail: (id: string) =>
      request<{ success: boolean; data: import('@opspilot/types').ComponentDetail }>(`/topology/components/${id}`),
  },
};
