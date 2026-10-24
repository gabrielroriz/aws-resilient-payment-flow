// Driven port that parks a queue message that can never succeed.
// Its group then moves on, and operators send it back once its cause is fixed.
export abstract class DeadLetterQueue {
  abstract park(message: DeadLetterQueue.Message): Promise<void>;
}

export namespace DeadLetterQueue {
  export type Message = {
    // The body exactly as received.
    body: string;
    // Keeps the message in its group when it is sent back to its queue.
    groupId: string;
    // Code of the failure that parked it.
    errorCode: string;
    // Deliveries before it was parked.
    receiveCount: number;
  };
}
