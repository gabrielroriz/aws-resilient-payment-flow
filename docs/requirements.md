# Payment Event Reliability on AWS

## 1. Context

A subscription platform sells memberships and recurring plans to customers in multiple countries. External payment providers process payments and report changes through HTTP webhooks, such as `payment.succeeded`, `payment.failed`, `subscription.renewed`, `refund.created`, and `chargeback.opened`.

These events affect subscription status, customer access, financial records, and customer notifications. Incorrect handling can grant access without payment, credit a customer twice, lose a refund, or leave financial records inconsistent.

The platform must support multiple payment gateways, currencies, and country-specific payment methods. Providers differ in authentication, payload formats, event names, delivery behavior, and available historical data.

## 2. Problem

Webhook delivery is unreliable, but the resulting business outcomes must be reliable. Providers may deliver an event more than once, deliver events out of order, or retry when an acknowledgment takes too long. Internal services may also fail after only part of an event's business consequences have been completed.

The platform must produce correct, auditable outcomes despite these conditions. Repeated delivery or reprocessing must not repeat a business effect that has already completed.

## 3. Scope and constraints

### In scope

- Deployment on AWS.
- Payment and subscription event handling across multiple gateways.
- Customer access changes, financial records, and notifications resulting from those events.
- Multiple currencies, country-specific pricing, and country-specific payment methods.
- Backend localization of customer notifications.
- Reproducible infrastructure provisioning.
- Simulated provider behavior, load tests, and failure scenarios.
- Operational investigation and reprocessing of affected events.

### Out of scope

- Real financial transactions and handling or storing card data.
- Tax and VAT calculation.
- Currency conversion for charging or settlement; conversion is for reporting only.
- Customer-facing or administrative graphical interfaces.
- Translated frontends and frontend locale formatting.
- Proprietary data or implementation details from current or past employers.

## 4. Functional requirements

### Event receipt and authenticity

- Accept events from supported payment providers and verify their authenticity according to each provider's requirements.
- Reject forged requests without applying business effects.
- Retain sufficient original event information for audit, investigation, and reprocessing.
- An acknowledged valid event must not be lost if processing is interrupted afterward.
- Identify malformed payloads and unsupported event types, and make their disposition visible to operators.

### Business correctness

- Update payment records, subscription status, customer access, financial records, and notifications as required by the event's business meaning.
- Apply each intended business effect at most once, including during duplicate delivery, recovery, and reprocessing.
- Keep unrelated events distinct even when different gateways use the same event identifier.
- Produce correct final business state regardless of event arrival order.
- Prevent an older event from incorrectly reversing a more recent business outcome.
- Recover from partial completion without silently leaving inconsistent business state or repeating completed effects.
- Make permanently incomplete business operations visible, including what completed and what remains unresolved.

### Recovery and reprocessing

- Recover automatically from transient downstream failures.
- Ensure repeatedly failing or invalid events do not prevent unrelated valid events from being handled.
- Allow operators to identify and safely reprocess events affected by a defect or failure.
- Preserve the history of processing attempts and outcomes.
- Detect and resolve discrepancies caused by missing provider events, subject to the historical information each provider makes available.

### Multiple gateways

- Demonstrate support for at least three gateways: Stripe in test mode, a Brazil-oriented gateway in a non-production environment, and a simulated gateway.
- Include differences in authentication, event vocabulary, payload structure, amount representation, and delivery behavior in the demonstration.
- Apply consistent business rules across equivalent events from different providers.
- Allow additional gateways without changing existing business rules.
- Prevent one gateway's failures or traffic bursts from blocking processing for other gateways.
- Protect gateway credentials and support their rotation.

### Money and currencies

- Preserve monetary values exactly, without rounding errors caused by their internal representation.
- Associate every monetary amount with an unambiguous currency.
- Support currencies with different decimal precision, including JPY, BRL, KWD, and USD.
- Distinguish the currency charged to the customer from the currency settled by the provider.
- Maintain and reconcile financial records separately for each currency.
- Use exchange rates only for reporting. Historical reports must remain reproducible using the rate applicable at the event's time.

### Countries and localization

- Support pricing for the same subscription plan in at least three countries, with prices defined by country and currency.
- Support country-specific payment methods, including PIX and boleto in Brazil, SEPA in applicable European markets, and cards where supported.
- Respect the customer's locale and timezone in notifications.
- Provide localized notification content and stable machine-readable error codes.

## 5. Non-functional requirements

- **Acknowledgment latency:** target a webhook acknowledgment p99 below one second under the declared test load.
- **Durability:** no acknowledged valid events may be lost in the tested failure scenarios.
- **Correctness:** duplicate delivery and reprocessing must produce zero duplicate business effects.
- **Availability and recovery:** recover from a two-hour downstream outage without manual intervention once the dependency becomes available.
- **Capacity:** declare and demonstrate sustained and burst throughput, including test duration and workload characteristics. The exact required rate remains to be defined; 500–1,000 events per second is an initial candidate target.
- **Traceability:** operators must be able to trace a provider event through its processing attempts and resulting business effects.
- **Monitoring:** expose processing delays, outstanding work, failures, unresolved events, and recovery progress, with alerts for conditions that require attention.
- **Cost visibility:** provide an estimated AWS cost per million events and document workload assumptions.
- **Reproducibility:** another developer must be able to provision the environment and run the documented scenario suite.

## 6. Acceptance scenarios

| Scenario | Required observable outcome |
|---|---|
| Duplicate delivery | Delivering the same event multiple times produces the same business result as delivering it once. |
| Overlapping gateway identifiers | Events from different gateways with identical identifiers are handled independently. |
| Out-of-order delivery | A refund arriving before the corresponding payment event eventually produces the correct financial and access state. |
| Traffic burst | The declared load is handled without losing acknowledged events, and acknowledgment latency and processing delay are reported. |
| Malformed or unsupported event | The event's disposition is visible and unrelated valid events continue processing. |
| Partial failure | A notification failure after payment recording and access changes can be recovered without repeating completed effects. |
| Downstream outage | After a two-hour outage, outstanding work completes automatically when the dependency recovers. |
| Forged request | An unauthenticated or incorrectly authenticated request produces no business effects. |
| Provider timeout and retry | Retried delivery does not cause duplicate business effects. |
| Defect recovery | A selected set of mishandled events can be reprocessed safely, with corrected outcomes and an audit history. |
| Missing event | A discrepancy with available provider history is detected and resolved. |
| Gateway disruption | Other gateways continue processing during one gateway's failures or traffic spike. |
| Currency precision | JPY, BRL, KWD, and USD events produce exact amounts and reconciled records for each currency. |
| Historical reporting | Re-running a historical report preserves the exchange-rate basis originally applicable. |
| Country pricing and localization | The same plan uses the correct country and currency price in at least three countries, and notifications respect customer locale and timezone. |

## 7. Business requirements to clarify

- Which events grant, suspend, restore, or revoke customer access?
- How should refunds, partial refunds, chargebacks, and failed renewals affect subscriptions and financial records?
- What should happen when an event conflicts with existing business state or cannot be completed permanently?
- Which source is authoritative when provider records and internal records disagree?
- Which gateways, countries, currencies, locales, and payment methods are required for the initial release?
- What sustained load, burst duration, maximum processing delay, and recovery completion time are required?
- How long must event data and processing history be retained, and who may inspect or reprocess them?

## 8. Evidence of completion

The repository must document the supported business rules, assumptions, setup instructions, and acceptance results. A reviewer should be able to run the scenario suite with one documented command after completing the stated prerequisites.

Results must include the tested load, acknowledgment latency, processing delay, failure recovery behavior, correctness checks, and cost assumptions. Unresolved business requirements and limitations must be explicit.
