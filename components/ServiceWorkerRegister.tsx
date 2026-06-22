"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in production only (skipped in dev to avoid cache surprises).
 * The worker itself is deliberately conservative: it never caches /api or live consistency
 * state, so a returning installed user always sees fresh cross-region data. updateViaCache
 * "none" keeps the worker script itself out of the HTTP cache so updates always propagate.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .catch((err) => console.error("service worker registration failed", err));
    };
    // If the window already finished loading before this effect ran (common with hydration),
    // register immediately; otherwise wait for load so registration never gets missed.
    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad);
    }
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
