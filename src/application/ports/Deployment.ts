// Driven port for facts about the running deployment.
export abstract class Deployment {
  // The deployed code's version, which sorts in deploy order and names its commit.
  abstract codeVersion(): string;
}
