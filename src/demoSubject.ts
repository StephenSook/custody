/**
 * The single synthetic subject the live demo watches. Shared by the control-room UI and the
 * seed script so a fresh `pnpm seed` populates exactly what the app reads on load. No real
 * minor: this is a fixed synthetic UUID used only for the demo. In production the subject is
 * derived from the authenticated session, never a constant.
 */
export const DEMO_SUBJECT_ID = "00000000-0000-4000-8000-000000000abc";
