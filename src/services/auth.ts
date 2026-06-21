export interface Actor {
  id: string;
  role: "demo";
}

/**
 * Authorization seam. The public demo operates on synthetic data with no parent login, so
 * this returns a synthetic actor. In production this reads the session and verifies the
 * caller's authority over the target minor BEFORE any mutation runs. Wired-or-cut: the
 * pitch must not claim authentication that is not built. This function is the single place
 * real auth plugs in.
 */
export function requireActor(): Actor {
  // Fail loud if the stub is ever reached in production: a real deploy must wire auth, or
  // explicitly opt into the synthetic-data demo with DEMO_MODE=true. This prevents the
  // no-op from silently passing as authorization.
  const isProduction =
    process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
  if (isProduction && process.env.DEMO_MODE !== "true") {
    throw new Error(
      "auth seam: the demo actor stub must not run in production. Wire real authentication, " +
        "or set DEMO_MODE=true to run the synthetic-data demo deliberately.",
    );
  }
  return { id: "demo", role: "demo" };
}
