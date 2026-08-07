import crypto from 'crypto';
import type { CanonicalEvent } from '@opspilot/types';
import { db } from '../../lib/db.js';
import { redis } from '../../lib/redis.js';
import { correlateEvent } from './correlation.service.js';
import type { Severity } from '@opspilot/types';

const DEDUP_TTL_SECONDS = 900; // 15 minutes

export interface EventIngestionResult {
  eventId: string;
  isDuplicate: boolean;
  alertId?: string;
  incidentId?: string;
  action: 'deduplicated' | 'alert_created' | 'incident_updated' | 'incident_created';
}

export async function ingestEvent(event: CanonicalEvent): Promise<EventIngestionResult> {
  // 1. Check deduplication via Redis
  const dedupKey = `dedup:${event.fingerprint}`;
  const existing = await redis.get(dedupKey);

  if (existing) {
    // Increment occurrence count on the existing alert
    const existingAlert = await db.alert.findFirst({
      where: { fingerprint: event.fingerprint, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    if (existingAlert) {
      await db.alert.update({
        where: { id: existingAlert.id },
        data: { occurrenceCount: { increment: 1 }, lastSeenAt: new Date(event.timestamp) },
      });
    }

    // Store event as duplicate
    const dupEvent = await db.event.create({
      data: {
        id: event.id,
        source: event.source,
        eventType: event.eventType as never,
        severity: event.severity as never,
        serviceId: event.serviceId,
        environment: event.environment as never,
        fingerprint: event.fingerprint,
        labels: event.labels as never,
        payload: event.payload as never,
        normalizedAt: new Date(),
        isDuplicate: true,
        duplicateOfId: existing,
      },
    });

    return { eventId: dupEvent.id, isDuplicate: true, action: 'deduplicated' };
  }

  // 2. Persist the canonical event
  const storedEvent = await db.event.create({
    data: {
      id: event.id,
      source: event.source,
      eventType: event.eventType as never,
      severity: event.severity as never,
      serviceId: event.serviceId,
      environment: event.environment as never,
      fingerprint: event.fingerprint,
      labels: event.labels as never,
      payload: event.payload as never,
      rawPayload: event.payload as never,
      normalizedAt: new Date(),
      isDuplicate: false,
    },
  });

  // 3. Mark fingerprint in Redis for deduplication window
  await redis.setex(dedupKey, DEDUP_TTL_SECONDS, storedEvent.id);

  // 4. Create Alert
  const alert = await db.alert.create({
    data: {
      eventId: storedEvent.id,
      serviceId: event.serviceId,
      title: (event.payload['title'] as string | undefined) ?? `Alert: ${event.eventType} on service`,
      description:
        (event.payload['description'] as string | undefined) ??
        `${event.severity} alert from ${event.source}`,
      severity: event.severity as never,
      status: 'ACTIVE',
      fingerprint: event.fingerprint,
      labels: event.labels as never,
      firstSeenAt: new Date(event.timestamp),
      lastSeenAt: new Date(event.timestamp),
      occurrenceCount: 1,
    },
  });

  // 5. Run correlation engine
  const correlationResult = await correlateEvent(alert, event);

  return {
    eventId: storedEvent.id,
    isDuplicate: false,
    alertId: alert.id,
    incidentId: correlationResult.incidentId,
    action: correlationResult.action,
  };
}
