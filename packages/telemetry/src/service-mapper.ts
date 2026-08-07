export interface ServiceMappingRule {
  otelServiceName: string;
  opspilotServiceName: string;
  opspilotServiceSlug: string;
}

export class ServiceMapper {
  private mappings = new Map<string, ServiceMappingRule>();

  constructor(customMappings?: ServiceMappingRule[]) {
    this.initDefaultMappings();
    if (customMappings) {
      customMappings.forEach((m) => this.mappings.set(m.otelServiceName.toLowerCase(), m));
    }
  }

  mapOtelToOpsPilot(otelName: string): ServiceMappingRule | undefined {
    return this.mappings.get(otelName.toLowerCase());
  }

  getRegisteredOtelServices(): string[] {
    return Array.from(this.mappings.keys());
  }

  private initDefaultMappings(): void {
    const defaults: ServiceMappingRule[] = [
      { otelServiceName: 'frontend', opspilotServiceName: 'API Gateway', opspilotServiceSlug: 'api-gateway' },
      { otelServiceName: 'checkoutservice', opspilotServiceName: 'Payments API', opspilotServiceSlug: 'payments-api' },
      { otelServiceName: 'paymentservice', opspilotServiceName: 'Payment DB', opspilotServiceSlug: 'payment-db' },
      { otelServiceName: 'cartservice', opspilotServiceName: 'Redis Cache', opspilotServiceSlug: 'redis-cache' },
      { otelServiceName: 'shippingservice', opspilotServiceName: 'Notification Service', opspilotServiceSlug: 'notification-service' },
      { otelServiceName: 'emailservice', opspilotServiceName: 'Customer API', opspilotServiceSlug: 'customer-api' },
      { otelServiceName: 'productcatalogservice', opspilotServiceName: 'Fraud Engine', opspilotServiceSlug: 'fraud-engine' },
      { otelServiceName: 'recommendationservice', opspilotServiceName: 'Auth Service', opspilotServiceSlug: 'auth-service' },
      { otelServiceName: 'adservice', opspilotServiceName: 'Message Queue', opspilotServiceSlug: 'message-queue' },
    ];

    defaults.forEach((m) => this.mappings.set(m.otelServiceName.toLowerCase(), m));
  }
}
