import { z } from 'zod';

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:3001'),

  // Database
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // AI Provider
  AI_PROVIDER: z.enum(['mock', 'gemini', 'upstage', 'openai', 'anthropic']).default('mock'),
  AI_MODEL: z.string().default('gemini-3.6-flash'),
  AI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
  AI_MAX_TOKENS: z.coerce.number().int().default(4096),
  GEMINI_API_KEY: z.string().optional(),
  UPSTAGE_API_KEY: z.string().optional(),
  UPSTAGE_MODEL: z.string().default('solar-mini'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),

  // Simulation
  SIMULATION_MODE: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  SIMULATOR_TICK_INTERVAL_MS: z.coerce.number().int().default(15000),

  // Safety
  ENABLE_AUTONOMOUS_REMEDIATION: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  APPROVAL_EXPIRY_MINUTES: z.coerce.number().int().default(15),
  MAX_REMEDIATION_RISK_AUTONOMOUS: z.coerce.number().int().default(30),

  // Observability
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),

  // Phase 4 — optional
  PROMETHEUS_URL: z.string().optional(),
  GRAFANA_URL: z.string().optional(),
  GRAFANA_API_TOKEN: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  PAGERDUTY_API_KEY: z.string().optional(),
  SLACK_BOT_TOKEN: z.string().optional(),
  SERVICENOW_URL: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (_config) return _config;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment configuration:');
    for (const [key, issues] of Object.entries(result.error.flatten().fieldErrors)) {
      console.error(`  ${key}: ${issues?.join(', ')}`);
    }
    process.exit(1);
  }

  const config = result.data;
  _config = config;
  return config;
}

export function resetConfig(): void {
  _config = null;
}
