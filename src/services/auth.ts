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
  return { id: "demo", role: "demo" };
}
