import { ZodError } from "zod";

export function isValidationError(err: unknown): err is ZodError {
  return err instanceof ZodError;
}

/**
 * Map any thrown error to a safe, client-facing message. A validation error becomes a
 * generic "Invalid request." (never a schema dump); everything else returns the caller's
 * fallback so internal or DSQL detail never reaches the client.
 */
export function publicErrorMessage(err: unknown, fallback: string): string {
  return isValidationError(err) ? "Invalid request." : fallback;
}
