import { EventEmitter } from 'events';

/**
 * Central SSE event emitter.
 * Modules emit domain events here; SSE route listens and forwards to clients.
 */
export const sseEmitter = new EventEmitter();
sseEmitter.setMaxListeners(200); // Support many concurrent SSE clients
