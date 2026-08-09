import { db } from './lib/db.js';

async function run() {
  console.log('=== MOST IMPORTANT ADVERSARIAL TEST SUITE ===\n');

  // Find a service
  const service = await db.service.findFirst();
  if (!service) throw new Error('No service found');

  // Create a brand new incident in production environment
  const newIncident = await db.incident.create({
    data: {
      title: 'High Fraud Engine Memory Contention (Production Safety Test)',
      description: 'Production safety test incident for adversarial validation',
      serviceId: service.id,
      severity: 'P1',
      status: 'INVESTIGATING',
      environment: 'production',
      detectedAt: new Date(),
    },
  });

  console.log('1. Created New Production Incident ID:', newIncident.id);

  // 1 & 2. Propose remediation
  console.log('\n2. Proposing Action on Production Incident...');
  const propRes = await fetch('http://localhost:3001/api/v1/remediation/propose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      incidentId: newIncident.id,
      actionType: 'ROLLBACK_DEPLOYMENT',
      serviceId: service.id,
      rationale: 'Testing direct execution guard on production incident',
    }),
  });
  const propJson = await propRes.json();
  const actionId = propJson.data?.actionId;
  console.log('Action ID:', actionId);
  console.log('DB Status:', propJson.data?.status);
  console.log('Requires Approval:', propJson.data?.requiresApproval);

  // 3, 4, 5. Attempt direct /execute call WITHOUT approval
  console.log('\n3, 4, 5. Calling POST /execute WITHOUT approval (Direct Execution Attack)...');
  const directExecRes = await fetch(`http://localhost:3001/api/v1/remediation/${actionId}/execute`, {
    method: 'POST',
  });
  console.log('Direct Execution HTTP Status Code (EXPECT 403 FORBIDDEN):', directExecRes.status);
  const directExecJson = await directExecRes.json();
  console.log('Direct Execution Output:', JSON.stringify(directExecJson, null, 2));

  // Verify DB status remains AWAITING_APPROVAL
  const checkAction = await db.remediationAction.findUnique({ where: { id: actionId } });
  console.log('DB Status Post-Attack:', checkAction?.status);

  // Verify timeline events (must NOT contain REMEDIATION_EXECUTION_STARTED)
  const timelineRes = await fetch(`http://localhost:3001/api/v1/incidents/${newIncident.id}/timeline`);
  const timelineJson = await timelineRes.json();
  const execStartedEvents = timelineJson.data?.filter((e: any) => e.eventType === 'REMEDIATION_EXECUTION_STARTED');
  console.log('REMEDIATION_EXECUTION_STARTED Events Count:', execStartedEvents?.length || 0);

  // 9 & 10. Approve action via authorization endpoint
  console.log('\n9 & 10. Approving Action via Human Operator Authorization...');
  const apprRes = await fetch(`http://localhost:3001/api/v1/remediation/${actionId}/approve`, {
    method: 'POST',
  });
  const apprJson = await apprRes.json();
  console.log('Approve HTTP Status Code:', apprRes.status);
  console.log('Approve & Execute Result:', JSON.stringify(apprJson, null, 2));

  // Verify updated DB action status
  const postApprAction = await db.remediationAction.findUnique({ where: { id: actionId } });
  console.log('DB Status Post-Execution:', postApprAction?.status);

  // 11. Test RESOLVED incident propose guard
  console.log('\n11. Attempting to propose remediation on RESOLVED incident...');
  await db.incident.update({ where: { id: newIncident.id }, data: { status: 'RESOLVED' } });

  const resPropRes = await fetch('http://localhost:3001/api/v1/remediation/propose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      incidentId: newIncident.id,
      actionType: 'RESTART_SERVICE',
      serviceId: service.id,
      rationale: 'Attempt on resolved incident',
    }),
  });
  console.log('Propose on RESOLVED Incident HTTP Status Code (EXPECT 400 BAD REQUEST):', resPropRes.status);
  const resPropJson = await resPropRes.json();
  console.log('Response Output:', JSON.stringify(resPropJson, null, 2));

  await db.$disconnect();
}

run().catch(console.error);
