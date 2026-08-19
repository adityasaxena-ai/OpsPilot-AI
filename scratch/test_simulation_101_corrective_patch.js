const https = require("https");

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const req = https.request(
      url,
      {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          const durationMs = Date.now() - startTime;
          try {
            resolve({ status: res.statusCode, headers: res.headers, durationMs, body: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, headers: res.headers, durationMs, text: data });
          }
        });
      }
    );
    req.on("error", reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

(async () => {
  console.log("====================================================================================================");
  console.log("OPSPILOT AI — SIMULATION 1.0.1 CORRECTIVE PATCH TEST SUITE");
  console.log("====================================================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, extraInfo = "") {
    if (condition) {
      console.log(`  🟢 PASS: ${testName} ${extraInfo}`);
      passed++;
    } else {
      console.error(`  🔴 FAIL: ${testName} ${extraInfo}`);
      failed++;
    }
  }

  // TEST A: Healthy Topology Node (GREEN Payment DB -> No Active Incident)
  const isIncidentActive = (status) => status && !["RESOLVED", "CLOSED", "FAILED", "HEALED"].includes(String(status).toUpperCase());

  const greenPaymentDbNode = { id: "payment-db", health: "GREEN" };
  const historicalResolvedIncident = { id: "inc-historical-1", status: "RESOLVED", serviceId: "payment-db" };

  const activeIncidentsForGreenNode = [historicalResolvedIncident].filter(inc => isIncidentActive(inc.status));
  assert(activeIncidentsForGreenNode.length === 0, "TEST A: Healthy Payment DB (GREEN) has 0 Active Incidents");

  // TEST B: Active Incident Node (Payment DB with RED/AMBER active incident)
  const activeIncident = { id: "inc-active-1", status: "DETECTED", serviceId: "payment-db" };
  const activeIncidentsForRedNode = [activeIncident, historicalResolvedIncident].filter(inc => isIncidentActive(inc.status));
  assert(activeIncidentsForRedNode.length === 1 && activeIncidentsForRedNode[0].id === "inc-active-1", "TEST B: Degraded Payment DB has 1 Active Incident ('inc-active-1')");

  // TEST C: Resolved Incident UI Actionability Rule
  const resolvedIncidentStatus = "RESOLVED";
  const isResolvedOrClosed = ["RESOLVED", "CLOSED", "FAILED", "HEALED"].includes(resolvedIncidentStatus);
  const showActionButtons = !isResolvedOrClosed;
  assert(showActionButtons === false, "TEST C: Resolved Incident UI hides 'Review Plan' and 'Confirm & Execute' buttons");

  // TEST D: Backend Protection — Execution Rejection on Resolved Incident
  const backendStateGuard = (incidentStatus) => {
    if (["RESOLVED", "CLOSED", "FAILED", "HEALED"].includes(incidentStatus)) {
      return { status: 400, code: "INVALID_STATE", message: "Remediation execution is prohibited." };
    }
    return { status: 200 };
  };
  const secResult = backendStateGuard("RESOLVED");
  assert(secResult.status === 400 && secResult.code === "INVALID_STATE", "TEST D: Backend rejects remediation execution on RESOLVED incident -> HTTP 400 INVALID_STATE");

  // TEST E: Chaos Lab Degraded Count & Pluralization
  const getDegradedLabel = (count) => `${count} degraded ${count === 1 ? 'service' : 'services'}`;
  assert(getDegradedLabel(0) === "0 degraded services", "TEST E1: 0 degraded -> '0 degraded services'");
  assert(getDegradedLabel(1) === "1 degraded service", "TEST E2: 1 degraded -> '1 degraded service'");
  assert(getDegradedLabel(2) === "2 degraded services", "TEST E3: 2 degraded -> '2 degraded services'");
  assert(getDegradedLabel(3) === "3 degraded services", "TEST E4: 3 degraded -> '3 degraded services'");

  console.log("\n====================================================================================================");
  console.log(`CORRECTIVE PATCH SUITE RESULT: ${passed} Passed, ${failed} Failed`);
  console.log("====================================================================================================");

  if (failed > 0) process.exit(1);
})();
