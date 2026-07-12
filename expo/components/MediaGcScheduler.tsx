/**
 * Runs one orphan-media GC sweep per app launch, well after startup so it
 * never competes with hydration or the first interactive paint. Native only
 * — runMediaGc already no-ops on web, but the guard here also skips
 * scheduling the timer at all.
 */

import { useEffect, useRef } from "react";
import { Platform } from "react-native";

import { runMediaGc } from "@/lib/mediaRegistry";
import { useAppStore } from "@/providers/AppStore";

const STARTUP_GC_DELAY_MS = 5000;

export function MediaGcScheduler() {
  const { hydrated, db, settings } = useAppStore();
  const ranRef = useRef(false);
  // Refs so the timer always reads the latest db/settings without making
  // routine mutations re-trigger (and cancel-then-drop) the effect below.
  const dbRef = useRef(db);
  const settingsRef = useRef(settings);
  dbRef.current = db;
  settingsRef.current = settings;

  useEffect(() => {
    if (!hydrated || ranRef.current) return;
    ranRef.current = true;
    if (Platform.OS === "web") {
      console.log("[media-gc] startup sweep skipped (web)");
      return;
    }
    const timer = setTimeout(() => {
      runMediaGc(dbRef.current, settingsRef.current)
        .then((result) => {
          console.log("[media-gc] startup sweep:", result);
        })
        .catch((e) => {
          console.log("[media-gc] startup sweep failed", e);
        });
    }, STARTUP_GC_DELAY_MS);
    return () => clearTimeout(timer);
    // Intentionally depends on `hydrated` only — see refs above.
  }, [hydrated]);

  return null;
}
