import { defineConfig } from 'vitest/config';

// Force DATABASE_URL to use TEST_DATABASE_URL during Vitest runs
const testDbUrl =
  process.env['TEST_DATABASE_URL'] ||
  'postgresql://opspilot:opspilot@localhost:5432/opspilot_test?sslmode=disable';

process.env['DATABASE_URL'] = testDbUrl;
process.env['ENABLE_GOVERNANCE_CONTROL_CENTER'] = 'true';
process.env['ENABLE_DRIFT_MONITORING'] = 'true';
process.env['ENABLE_AI_INCIDENT_MGMT'] = 'true';
process.env['ENABLE_REPORTING'] = 'true';
process.env['ENABLE_REMEDIATION_V2'] = 'true';
process.env['ENABLE_PREDICTIVE_INTELLIGENCE'] = 'true';
process.env['ENABLE_RAG'] = 'true';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    fileParallelism: false,
  },
});
