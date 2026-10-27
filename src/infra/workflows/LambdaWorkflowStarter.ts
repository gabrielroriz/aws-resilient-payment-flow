import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import type { WorkflowInputs, WorkflowName } from "@application/contracts/Workflows";
import { WorkflowStarter } from "@application/ports/workflows/WorkflowStarter";
import { Injectable } from "@kernel/decorators/injectable";
import { digest } from "@kernel/utils/crypto";
import { snakeCaseKeys } from "@kernel/utils/json";

// Starts each workflow as a Lambda durable execution named after its input.
// Lambda returns the existing execution for a name it knows, so repeats never rerun.
@Injectable()
export class LambdaWorkflowStarter implements WorkflowStarter {
  // The region comes from the Lambda environment, and locally so does the endpoint.
  readonly lambda = new LambdaClient({});

  async start<Workflow extends WorkflowName>(
    workflow: Workflow,
    input: WorkflowInputs[Workflow],
  ): Promise<void> {
    // Workflows receive their contract as snake_case JSON.
    const payload = JSON.stringify(snakeCaseKeys(input));
    await this.lambda.send(
      new InvokeCommand({
        // Each workflow runs in `wf_<workflow>`, started through its `live` alias.
        FunctionName: `wf_${workflow}:live`,
        // Asynchronous, so the caller waits for the start, not for the workflow.
        InvocationType: "Event",
        // A digest fits the name's 64 characters and the characters names allow.
        DurableExecutionName: digest([workflow, payload]),
        Payload: payload,
      }),
    );
  }
}
