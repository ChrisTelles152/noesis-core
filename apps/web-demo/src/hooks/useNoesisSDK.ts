import { useState, useEffect } from 'react';
import NoesisSDK from '@/sdk/NoesisSDK';
import { httpTransport } from '@noesis/sdk-web';

// Singleton pattern to ensure we only have one SDK instance across the app.
// `persistenceWired` ensures we install persistTo only once, even if the hook
// is mounted from multiple components.
let sdkInstance: NoesisSDK | null = null;
let persistenceWired = false;

/**
 * Test-only — reset the singleton so each test gets a fresh SDK + persistence
 * wire-up. Not part of the public hook contract.
 */
export function _resetSdkInstanceForTesting(): void {
  sdkInstance = null;
  persistenceWired = false;
}

/** Read the CSRF token directly from the XSRF-TOKEN cookie. */
function readCsrfTokenFromCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/);
  return match && match[1] ? decodeURIComponent(match[1]) : undefined;
}

export const useNoesisSDK = () => {
  const [sdk, setSdk] = useState<NoesisSDK | null>(null);

  useEffect(() => {
    // Create the SDK instance only once if it doesn't exist
    if (!sdkInstance) {
      // Only pass API key if it's actually configured
      const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
      sdkInstance = new NoesisSDK({
        apiKey: apiKey || undefined, // Don't pass a fake key
        modules: ['attention', 'mastery', 'orchestration'],
        debug: import.meta.env.DEV,
        attentionOptions: {
          trackingInterval: 500, // Update every 500ms
          historySize: 20, // Keep 20 samples for stability calculation
        },
        masteryOptions: {
          threshold: 0.8, // 80% mastery required
          spacingFactor: 2.5, // For spaced repetition algorithm
        },
        // Initialize the core engine so persistence (Phase B2) has something
        // to wire up. Skill graph starts empty and will be populated later
        // when the consumer loads a curriculum via sdk.updateSkillGraph(...).
        coreConfig: {
          learnerId: 'demo-learner',
          skills: [],
        },
      });
    }

    setSdk(sdkInstance);

    // Wire engine-state persistence to the server (Phase B2). This must happen
    // exactly once per process — guard with `persistenceWired`.
    //
    // Flow:
    //   1. hydrate from GET /api/engine/state — restores prior session if any.
    //   2. persistTo with PUT /api/engine/state, debounced at 1000 ms — every
    //      mutation in the engine triggers an autosave within ~1 second.
    //   3. beforeunload → flush() — force a final save before the tab dies.
    //
    // Errors are non-fatal: the demo app keeps working with a transient
    // engine state if persistence is unavailable.
    if (!persistenceWired && sdkInstance.core) {
      persistenceWired = true;

      // CSRF token snapshot at wire time. Acceptable for the pilot demo where
      // the token rarely rotates within a session. A future hardening pass
      // would plumb a token-getter through httpTransport so save() always
      // sees the freshest token.
      const csrfToken = readCsrfTokenFromCookie();
      const transport = httpTransport('/api/engine/state', { csrfToken });

      sdkInstance.core.hydrate(transport).catch((err) => {
        console.warn('[useNoesisSDK] hydrate failed:', err);
      });
      sdkInstance.core.persistTo(transport, {
        autosaveDebounceMs: 1000,
        onError: (err) => console.warn('[useNoesisSDK] autosave failed:', err),
      });

      const onUnload = () => {
        // Best-effort sync on tab close. flush() is async; some browsers will
        // kill the request mid-flight, but this maximises the chance of a
        // durable save without blocking the unload.
        void sdkInstance?.core?.flush().catch(() => {
          /* swallow — page is unloading */
        });
      };
      if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', onUnload);
      }
    }
  }, []);

  // Ensure we have a valid SDK to return
  if (!sdk) {
    // This should only happen on the first render
    // Return a minimal placeholder until the real SDK is initialized
    // Create a stub SDK to use until the real one is initialized
    const stubSDK = new NoesisSDK({
      debug: false,
      modules: ['attention', 'mastery', 'orchestration'],
    });

    return stubSDK;
  }

  return sdk;
};
