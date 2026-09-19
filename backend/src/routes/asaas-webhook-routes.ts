import { Router } from 'express';

import { asaasWebhookController } from '../controllers/asaas-webhook-controller.js';
import type { AsaasWebhookRepository } from '../repositories/asaas-webhook-repository.js';
import { ProcessAsaasWebhookService } from '../services/process-asaas-webhook-service.js';

// Public endpoint — deliberately outside the household router and the JWT authenticate
// middleware. Authentication here is exclusively the asaas-access-token header, checked in
// asaasWebhookController; there is no household/user context for an inbound provider webhook.
export function createAsaasWebhookRouter(
  webhookRepository: AsaasWebhookRepository,
  webhookToken: string | undefined,
): Router {
  const router = Router();
  const service = new ProcessAsaasWebhookService(webhookRepository);

  router.post('/', asaasWebhookController(webhookToken, service));

  return router;
}
