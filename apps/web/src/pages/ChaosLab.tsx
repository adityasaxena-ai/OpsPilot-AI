import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Zap, CheckCircle, AlertTriangle, Play, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';

interface Scenario {
  id: string;
  label: string;
  description: string;
  icon: string;
  alertCount: number;
}

interface SimService {
  serviceId: string;
  isHealthy: boolean;
  failureScenario: string | null;
  cpuPercent: number;
  errorRatePercent: number;
  latencyP99Ms: number;
  service: { id: string; name: string; tier: string };
}

export function ChaosLab() {
  const queryClient = useQueryClient();
  const [selectedService, setSelectedService] = useState('');
  const [selectedScenario, setSelectedScenario] = useState('');
  const [lastResult, setLastResult] = useState<string | null>(null);

  const { data: scenariosData } = useQuery({
    queryKey: ['simulator', 'scenarios'],
    queryFn: () => api.simulator.scenarios(),
  });

  const { data: statusData, refetch: refetchStatus } = useQuery({
    queryKey: ['simulator', 'status'],
    queryFn: () => api.simulator.status(),
    refetchInterval: 5_000,
  });

  const injectMutation = useMutation({
    mutationFn: () =>
      api.simulator.injectChaos({ serviceId: selectedService, scenario: selectedScenario, durationSeconds: 300 }),
    onSuccess: (data) => {
      setLastResult(`✅ Chaos injected: ${selectedScenario} on service. Active incident created in DB.`);
      queryClient.invalidateQueries({ queryKey: ['simulator'] });
      queryClient.invalidateQueries({ queryKey: ['topology'] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      refetchStatus();
    },
    onError: (err: Error) => {
      setLastResult(`❌ Error: ${err.message}`);
    },
  });

  const healMutation = useMutation({
    mutationFn: (serviceId?: string) => api.simulator.heal(serviceId),
    onSuccess: () => {
      setLastResult('✅ Service(s) healed — alerts resolved, metrics restored');
      queryClient.invalidateQueries({ queryKey: ['simulator'] });
      queryClient.invalidateQueries({ queryKey: ['topology'] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      refetchStatus();
    },
    onError: (err: any) => {
      setLastResult(`❌ Healing Error: ${err?.message || err?.error?.message || 'Failed to heal service'}`);
    },
  });

  const scenarios = Array.isArray(scenariosData?.data) ? (scenariosData.data as Scenario[]) : [];
  const simServices = Array.isArray(statusData?.data) ? (statusData.data as SimService[]) : [];

  const unhealthyServices = simServices.filter((s) => !s.isHealthy);
  const degradedCount = unhealthyServices.length;

  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2" style={{ color: 'hsl(var(--text-primary))' }}>
            <Zap size={18} style={{ color: 'hsl(48 95% 58%)' }} />
            Chaos Lab
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--text-tertiary))' }}>
            Inject realistic failure scenarios to test OpsPilot's detection and triage pipeline
          </p>
        </div>

        {degradedCount > 0 && (
          <button
            onClick={() => healMutation.mutate(undefined)}
            disabled={healMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all hover:opacity-80"
            style={{
              background: 'hsl(142 72% 45% / 0.1)',
              borderColor: 'hsl(142 72% 45% / 0.3)',
              color: 'hsl(142 72% 55%)',
            }}
          >
            <RefreshCw size={14} />
            Heal All Services ({degradedCount} degraded {degradedCount === 1 ? 'service' : 'services'})
          </button>
        )}
      </div>

      {/* Main panel */}
      <div className="grid grid-cols-5 gap-4">
        {/* Injection Controls — 3 cols */}
        <div
          className="col-span-3 rounded-xl border p-5 space-y-5"
          style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
        >
          <h2 className="text-sm font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>
            Inject Failure Scenario
          </h2>

          {/* Target service */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'hsl(var(--text-secondary))' }}>
              Target Service
            </label>
            <div className="grid grid-cols-3 gap-2">
              {simServices.map((sim) => (
                <button
                  key={sim.serviceId}
                  onClick={() => setSelectedService(sim.serviceId)}
                  className="p-3 rounded-lg border text-left transition-all hover:opacity-80"
                  style={{
                    background: selectedService === sim.serviceId
                      ? 'hsl(220 90% 56% / 0.15)'
                      : 'hsl(var(--bg-surface-2))',
                    borderColor: selectedService === sim.serviceId
                      ? 'hsl(220 90% 56% / 0.4)'
                      : 'hsl(var(--border))',
                  }}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: sim.isHealthy ? 'hsl(142 72% 45%)' : 'hsl(0 85% 60%)' }}
                    />
                    <span className="text-xs font-medium" style={{ color: 'hsl(var(--text-primary))' }}>
                      {sim.service.name}
                    </span>
                  </div>
                  <span className="text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>
                    {sim.service.tier}
                    {sim.failureScenario && ` · ${sim.failureScenario.replace(/_/g, ' ')}`}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Scenario selector */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'hsl(var(--text-secondary))' }}>
              Failure Scenario
            </label>
            <div className="grid grid-cols-2 gap-2">
              {scenarios.map((scenario) => (
                <button
                  key={scenario.id}
                  onClick={() => setSelectedScenario(scenario.id)}
                  className="p-3 rounded-lg border text-left transition-all hover:opacity-80"
                  style={{
                    background: selectedScenario === scenario.id
                      ? 'hsl(48 95% 53% / 0.1)'
                      : 'hsl(var(--bg-surface-2))',
                    borderColor: selectedScenario === scenario.id
                      ? 'hsl(48 95% 53% / 0.4)'
                      : 'hsl(var(--border))',
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">{scenario.icon}</span>
                    <span className="text-xs font-medium" style={{ color: 'hsl(var(--text-primary))' }}>
                      {scenario.label}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>
                    {scenario.description}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'hsl(48 95% 58%)' }}>
                    ~{scenario.alertCount} alert{scenario.alertCount !== 1 ? 's' : ''}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Inject button */}
          <button
            onClick={() => injectMutation.mutate()}
            disabled={!selectedService || !selectedScenario || injectMutation.isPending}
            className="w-full py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all"
            style={{
              background: selectedService && selectedScenario
                ? 'hsl(0 85% 55%)'
                : 'hsl(var(--bg-surface-3))',
              color: selectedService && selectedScenario
                ? 'white'
                : 'hsl(var(--text-tertiary))',
              cursor: selectedService && selectedScenario ? 'pointer' : 'not-allowed',
            }}
          >
            {injectMutation.isPending ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            Inject Chaos
          </button>

          {/* Result */}
          {lastResult && (
            <div
              className="text-xs p-3 rounded-lg border"
              style={{
                background: lastResult.startsWith('✅')
                  ? 'hsl(142 72% 45% / 0.1)'
                  : 'hsl(0 85% 55% / 0.1)',
                borderColor: lastResult.startsWith('✅')
                  ? 'hsl(142 72% 45% / 0.3)'
                  : 'hsl(0 85% 55% / 0.3)',
                color: lastResult.startsWith('✅')
                  ? 'hsl(142 72% 55%)'
                  : 'hsl(0 85% 65%)',
              }}
            >
              {lastResult}
            </div>
          )}
        </div>

        {/* Current Service Health — 2 cols */}
        <div
          className="col-span-2 rounded-xl border p-5"
          style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
        >
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'hsl(var(--text-primary))' }}>
            Current Service Status
          </h2>
          <div className="space-y-2">
            {simServices.map((sim) => (
              <div
                key={sim.serviceId}
                className="p-3 rounded-lg border"
                style={{ background: 'hsl(var(--bg-surface-2))', borderColor: 'hsl(var(--border))' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {sim.isHealthy
                      ? <CheckCircle size={12} style={{ color: 'hsl(142 72% 45%)' }} />
                      : <AlertTriangle size={12} style={{ color: 'hsl(0 85% 65%)' }} />
                    }
                    <span className="text-xs font-medium" style={{ color: 'hsl(var(--text-primary))' }}>
                      {sim.service.name}
                    </span>
                  </div>
                  {!sim.isHealthy && (
                    <button
                      onClick={() => healMutation.mutate(sim.serviceId)}
                      className="text-xs px-2 py-0.5 rounded border transition-all hover:opacity-70"
                      style={{
                        background: 'hsl(142 72% 45% / 0.1)',
                        borderColor: 'hsl(142 72% 45% / 0.3)',
                        color: 'hsl(142 72% 55%)',
                      }}
                    >
                      Heal
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { l: 'CPU', v: `${Math.round(sim.cpuPercent)}%` },
                    { l: 'ERR', v: `${sim.errorRatePercent.toFixed(1)}%` },
                    { l: 'P99', v: `${Math.round(sim.latencyP99Ms)}ms` },
                  ].map((m) => (
                    <div key={m.l} className="text-center">
                      <div className="text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>{m.l}</div>
                      <div className="text-xs font-medium" style={{ fontFamily: 'var(--font-mono)', color: 'hsl(var(--text-secondary))' }}>
                        {m.v}
                      </div>
                    </div>
                  ))}
                </div>
                {sim.failureScenario && (
                  <div
                    className="text-xs mt-2 px-2 py-0.5 rounded text-center"
                    style={{ background: 'hsl(0 85% 60% / 0.1)', color: 'hsl(0 85% 70%)' }}
                  >
                    {sim.failureScenario.replace(/_/g, ' ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
