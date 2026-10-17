// Tells monitoring whether an error is normal operation or needs attention.
export enum ErrorKind {
  // Caused by the caller and handled as designed, such as a forged webhook.
  EXPECTED = "expected",
  // A failure or defect to investigate, such as an unreadable provider event.
  UNEXPECTED = "unexpected",
}
