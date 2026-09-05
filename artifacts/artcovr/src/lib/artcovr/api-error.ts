export class ArtcovrApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ArtcovrApiError";
    this.status = status;
    this.code = code;
  }
}

export { shouldRotateCheckoutIdempotencyKey } from "./checkout-errors.ts";
