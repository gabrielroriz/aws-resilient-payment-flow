import type { WorkflowInputs, WorkflowName } from "@application/contracts/Workflows";

// Driven port that starts durable workflows.
// Starting a workflow again with the same input never runs it twice.
export abstract class WorkflowStarter {
  // Resolves once the workflow has started, without waiting for it to finish.
  abstract start<Workflow extends WorkflowName>(
    workflow: Workflow,
    input: WorkflowInputs[Workflow],
  ): Promise<void>;
}
