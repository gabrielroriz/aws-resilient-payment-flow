import type { Scenario } from '../engine/runner.types.mts';
import { duplicateDelivery } from './duplicate-delivery.mts';
import { forgedRequest } from './forged-request.mts';
import { malformedEvent } from './malformed-event.mts';
import { outOfOrder } from './out-of-order.mts';
import { overlappingIds } from './overlapping-ids.mts';
import { providerRetry } from './provider-retry.mts';

// In run order: receipt, then rejected requests.
export const scenarios: Scenario[] = [
  duplicateDelivery,
  providerRetry,
  overlappingIds,
  outOfOrder,
  forgedRequest,
  malformedEvent,
];
