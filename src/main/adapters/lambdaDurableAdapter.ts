import { MessageHandler } from "@application/contracts/MessageHandler";
import { errorLogFields } from "@application/errors/errorLogFields";
import { ErrorWorkflowInvalidInput } from "@application/errors/workflow/ErrorWorkflowInvalidInput";
import { Logger } from "@application/ports/Logger";
import { withDurableExecution, type DurableContext } from "@aws/durable-execution-sdk-js";
import { LambdaDurableExecution } from "@infra/workflows/LambdaDurableExecution";
import { validatePayload } from "@kernel/decorators/schema";

// Runs a workflow's handler on its Lambda durable execution.
// The handler receives only input that passes its schema.
export function lambdaDurableAdapter(
  handler: MessageHandler,
  logger: Logger,
  durableExecution: LambdaDurableExecution,
) {
  return withDurableExecution(async (input: unknown, context: DurableContext) => {
    const { lambdaContext, executionContext } = context;
    await durableExecution.withContext(context, () =>
      logger.withContext(
        {
          lambdaRequestId: lambdaContext.awsRequestId,
          durableExecutionArn: executionContext.durableExecutionArn,
        },
        async () => {
          // Thrown outside any step, so the execution fails without retrying.
          const validated = validatePayload(handler, input);
          if (!validated.success) {
            const error = new ErrorWorkflowInvalidInput(validated.issues);
            logger.error("workflow_input_error", errorLogFields(error));
            throw error;
          }
          await handler.handle(validated.data);
        },
      ),
    );
  });
}
