/**
 * An expected request failure with an HTTP status and a machine code. Routes
 * throw it; the request handler turns it into a JSON error instead of logging a
 * 500. Anything else that escapes a route is a real defect.
 */
export class ApiFailure extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code = "bad_request") {
    super(message);
    this.name = "ApiFailure";
    this.status = status;
    this.code = code;
  }
}
