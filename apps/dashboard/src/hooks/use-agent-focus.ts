"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentState } from "@mullion/schemas";
import { markSeen, newlyTouchedNodeKeys, type FocusNode } from "../lib/agent-focus";

// Timing half of the agent focus indicator (ADR-84). Node events arriving
// while the agent works enqueue here; a dwell queue drains them into one
// focusedNodeKey so a whole decision's burst (the 1s SSE poll delivers it in
// a single render) glides node-to-node instead of teleporting to the last.
// Focus is presentation-only and lives outside the planning reducer.

// ~100ms above the 300ms position tween so a concurrent layout glide settles
// before the indicator moves on — the node gets a real moment of stillness.
const DWELL_MS = 400;

export function useAgentFocus(nodes: FocusNode[], agentState: AgentState): string | null {
  const [focusedNodeKey, setFocusedNodeKey] = useState<string | null>(null);
  // null until the first render with data — that render seeds the seen-map
  // from the snapshot without enqueuing, so hydration (and stream replay,
  // which the snapshot's lastEventId already excludes) never re-animates
  // history.
  const seenRef = useRef<Map<string, number> | null>(null);
  const queueRef = useRef<string[]>([]);
  const timerRef = useRef<number | null>(null);
  const drainingRef = useRef(false);

  useEffect(() => {
    if (seenRef.current === null) {
      seenRef.current = new Map();
      markSeen(nodes, seenRef.current);
      return;
    }
    const touched = newlyTouchedNodeKeys(nodes, seenRef.current);
    markSeen(nodes, seenRef.current);
    // Only agent work animates. The seen-map still advances while idle, so a
    // stray out-of-band update can't replay later. The queue is deliberately
    // NOT cleared when the agent goes idle — idle's event sorts after the
    // decision's node events, so draining out reads as "finishing the last
    // few nodes, then done".
    if (agentState !== "working" || touched.length === 0) return;
    for (const key of touched) {
      if (queueRef.current[queueRef.current.length - 1] !== key) queueRef.current.push(key);
    }
    if (drainingRef.current) return;
    drainingRef.current = true;
    // The setTimeout chain keeps this closure alive across effect re-runs;
    // drainingRef guarantees only one chain exists at a time.
    const step = () => {
      const next = queueRef.current.shift();
      if (next === undefined) {
        setFocusedNodeKey(null);
        drainingRef.current = false;
        timerRef.current = null;
        return;
      }
      setFocusedNodeKey(next);
      timerRef.current = window.setTimeout(step, DWELL_MS);
    };
    step();
  }, [nodes, agentState]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return focusedNodeKey;
}
