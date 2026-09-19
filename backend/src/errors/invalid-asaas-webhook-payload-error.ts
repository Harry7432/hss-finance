export class InvalidAsaasWebhookPayloadError extends Error {
  constructor() {
    super('Asaas webhook payload is missing required fields');
    this.name = 'InvalidAsaasWebhookPayloadError';
  }
}
