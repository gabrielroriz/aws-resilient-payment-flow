/** Tells monitoring whether an error is part of normal operation or needs someone's attention. */
export enum ErrorKind {
  /** Caused by the caller and handled as designed, such as a forged webhook. */
  EXPECTED = "expected",
  /** Points to a failure or defect to investigate, such as a provider event the system cannot read. */
  UNEXPECTED = "unexpected",
}
