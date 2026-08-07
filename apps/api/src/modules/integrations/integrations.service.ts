export interface WebhookPayload {
  event: 'INCIDENT_CREATED' | 'APPROVAL_REQUESTED' | 'REMEDIATION_EXECUTED' | 'INCIDENT_RESOLVED';
  incidentId: string;
  title: string;
  severity: string;
  serviceName: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export class IntegrationService {
  private static instance: IntegrationService;

  static getInstance(): IntegrationService {
    if (!this.instance) {
      this.instance = new IntegrationService();
    }
    return this.instance;
  }

  async dispatchEvent(payload: WebhookPayload): Promise<{ success: boolean; dispatchedTo: string[] }> {
    const dispatchedTo: string[] = [];

    // 1. Dispatch Slack Webhook (if configured)
    const slackUrl = process.env['SLACK_WEBHOOK_URL'];
    if (slackUrl) {
      try {
        await this.sendSlackNotification(slackUrl, payload);
        dispatchedTo.push('Slack');
      } catch (err) {
        console.error('[IntegrationService] Slack dispatch error:', err);
      }
    } else {
      // Log mock dispatch for development
      console.log(`[IntegrationService MOCK] [Slack] ${payload.event}: ${payload.title} (${payload.severity})`);
      dispatchedTo.push('Slack (Mock)');
    }

    // 2. Dispatch PagerDuty (if configured)
    const pdRoutingKey = process.env['PAGERDUTY_ROUTING_KEY'];
    if (pdRoutingKey) {
      try {
        await this.sendPagerDutyEvent(pdRoutingKey, payload);
        dispatchedTo.push('PagerDuty');
      } catch (err) {
        console.error('[IntegrationService] PagerDuty dispatch error:', err);
      }
    } else {
      console.log(`[IntegrationService MOCK] [PagerDuty] Triggered event for ${payload.serviceName}`);
      dispatchedTo.push('PagerDuty (Mock)');
    }

    // 3. Dispatch Jira ITSM Ticket (if configured)
    const jiraDomain = process.env['JIRA_DOMAIN'];
    if (jiraDomain) {
      try {
        await this.createJiraIssue(jiraDomain, payload);
        dispatchedTo.push('Jira ITSM');
      } catch (err) {
        console.error('[IntegrationService] Jira dispatch error:', err);
      }
    } else {
      console.log(`[IntegrationService MOCK] [Jira ITSM] Created OPS-${Math.floor(Math.random() * 9000 + 1000)} for ${payload.title}`);
      dispatchedTo.push('Jira (Mock)');
    }

    return { success: true, dispatchedTo };
  }

  private async sendSlackNotification(url: string, p: WebhookPayload): Promise<void> {
    const color = p.severity === 'P1' ? '#ef4444' : p.severity === 'P2' ? '#f97316' : '#3b82f6';

    const body = {
      text: `[OpsPilot AI] ${p.event}: ${p.title}`,
      attachments: [
        {
          color,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*OpsPilot AI Alert: ${p.event}*\n*${p.title}*\nSeverity: \`${p.severity}\` | Service: \`${p.serviceName}\``,
              },
            },
            {
              type: 'context',
              elements: [
                { type: 'mrkdwn', text: `Incident ID: \`${p.incidentId}\` | Time: ${p.timestamp}` },
              ],
            },
          ],
        },
      ],
    };

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async sendPagerDutyEvent(routingKey: string, p: WebhookPayload): Promise<void> {
    const action = p.event === 'INCIDENT_RESOLVED' ? 'resolve' : 'trigger';

    const body = {
      routing_key: routingKey,
      event_action: action,
      dedup_key: `opspilot-${p.incidentId}`,
      payload: {
        summary: `[${p.severity}] ${p.title} on ${p.serviceName}`,
        source: 'OpsPilot-AI',
        severity: p.severity === 'P1' ? 'critical' : 'warning',
        custom_details: p.details,
      },
    };

    await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async createJiraIssue(domain: string, p: WebhookPayload): Promise<void> {
    const auth = Buffer.from(`${process.env['JIRA_EMAIL']}:${process.env['JIRA_API_TOKEN']}`).toString('base64');

    const body = {
      fields: {
        project: { key: process.env['JIRA_PROJECT_KEY'] ?? 'OPS' },
        summary: `[OpsPilot] ${p.severity} - ${p.title}`,
        description: `Incident ID: ${p.incidentId}\nService: ${p.serviceName}\nEvent: ${p.event}\nTimestamp: ${p.timestamp}`,
        issuetype: { name: 'Incident' },
      },
    };

    await fetch(`https://${domain}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }
}
