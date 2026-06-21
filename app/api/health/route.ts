// Unauthenticated liveness probe. Returns no mod data; safe for keep-alive and judges.
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ status: "ok", at: Date.now() });
}
