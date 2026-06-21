import type { ConsentEventType, ConsentStatus } from "./types";

/** Derive the current consent status from a consent event type. Pure. */
export function nextConsentStatus(eventType: ConsentEventType): ConsentStatus {
  return eventType === "GRANT" ? "GRANTED" : "REVOKED";
}
