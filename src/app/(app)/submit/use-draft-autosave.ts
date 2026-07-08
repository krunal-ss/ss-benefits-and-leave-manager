"use client";

import { useEffect, useRef, useState } from "react";
import { saveDraftAction } from "@/server/actions/draft-expense";

const AUTOSAVE_DEBOUNCE_MS = 1500;

/**
 * KAN-125 draft save/autosave/resume state machine, extracted out of
 * SubmitForm so the form component only wires it to its own field values.
 * `draftIdRef` is the source of truth read by every server call; `draftId`
 * state only drives rendering. Autosave calls are serialized through an
 * internal chain, and `settleAutosave` (called by an explicit Save/Submit)
 * always cancels any pending debounce timer and awaits the chain first —
 * otherwise a slow autosave whose response hasn't landed yet (stale
 * `draftId` closure) can create a SECOND draft row instead of updating the
 * first one. Pass `enabled: false` in resubmit mode — a resubmission is
 * never a draft, so it has nothing to autosave.
 */
export function useDraftAutosave({
  enabled,
  hasContent,
  buildFormData,
  deps,
  initialDraftId,
}: {
  enabled: boolean;
  hasContent: boolean;
  buildFormData: (draftId: string | null) => FormData;
  /** The values that should re-trigger the debounced autosave when they change. */
  deps: readonly unknown[];
  initialDraftId: string | null;
}) {
  const [draftId, setDraftId] = useState<string | null>(initialDraftId);
  const draftIdRef = useRef<string | null>(initialDraftId);
  const [autosavedAt, setAutosavedAt] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const skipNextAutosave = useRef(true); // don't autosave on initial mount
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveChain = useRef<Promise<void>>(Promise.resolve());

  function setDraftIdBoth(id: string | null) {
    draftIdRef.current = id;
    setDraftId(id);
  }

  useEffect(() => {
    if (!enabled) return;
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return;
    }
    if (!hasContent) return;

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      autosaveChain.current = autosaveChain.current.then(async () => {
        try {
          const res = await saveDraftAction(buildFormData(draftIdRef.current));
          if (res.ok) {
            if (res.draftId) setDraftIdBoth(res.draftId);
            setAutosavedAt("just now");
          }
        } catch {
          // best-effort — autosave failures shouldn't interrupt typing
        }
      });
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hasContent, ...deps]);

  /** Cancel any pending debounce and wait for an in-flight autosave to finish, so an explicit Save/Submit always sees the true current draft id. */
  async function settleAutosave() {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    await autosaveChain.current;
  }

  function resetAutosave() {
    setDraftIdBoth(null);
    setAutosavedAt(null);
    skipNextAutosave.current = true;
  }

  return {
    draftId,
    draftIdRef,
    autosavedAt,
    savingDraft,
    setSavingDraft,
    setDraftIdBoth,
    settleAutosave,
    resetAutosave,
  };
}
