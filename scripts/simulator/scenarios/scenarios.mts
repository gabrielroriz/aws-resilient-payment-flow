import type { Scenario } from '../engine/runner.types.mts';
import { concurrentBurst } from './concurrent-burst.mts';
import { duplicateDelivery } from './duplicate-delivery.mts';
import { forgedRequest } from './forged-request.mts';
import { malformedEvent } from './malformed-event.mts';
import { occurrenceOrder } from './occurrence-order.mts';
import { orderIndependence } from './order-independence.mts';
import { outOfOrder } from './out-of-order.mts';
import { overlappingIds } from './overlapping-ids.mts';
import { overlappingPaymentIds } from './overlapping-payment-ids.mts';
import { precedenceOverTime } from './precedence-over-time.mts';
import { providerRetry } from './provider-retry.mts';
import { sameSecond } from './same-second.mts';
import { subscriptionRenewal } from './subscription-renewal.mts';

// In run order: receipt, event ordering, rejected requests, then optional scenarios.
export const scenarios: Scenario[] = [
  duplicateDelivery,
  providerRetry,
  overlappingIds,
  outOfOrder,
  occurrenceOrder,
  precedenceOverTime,
  sameSecond,
  overlappingPaymentIds,
  orderIndependence,
  subscriptionRenewal,
  forgedRequest,
  malformedEvent,
  concurrentBurst,
];
