import type * as z from 'zod/mini';
import type { acknowledgedReply } from './replies.mts';

// The body of an acknowledged reply, as the contract declares it.
export type AcknowledgedReply = z.output<typeof acknowledgedReply>;
