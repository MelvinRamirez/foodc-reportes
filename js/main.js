import { API_URL, VERIFY_TIMEOUT_MS, REPORT_TIMEOUT_MS } from './config.js';
import { createStore, select } from './store.js';
import { initialState } from './actions.js';
import { createReportesApiClient } from './api.js';
import { loadPin } from './pin.js';
import * as effects from './effects.js';
import { mountPinView } from './views/pin-view.js';

/**
 * Reads `sessionStorage` defensively: some private-browsing modes throw on
 * accessing the global object itself, not only on reading/writing a key.
 * Same pattern as `foodc-caja/js/main.js`.
 *
 * @returns {Storage|null}
 */
function getBrowserSessionStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Minimal composition root for work unit R1: wires only the PIN gate
 * (`reportes-access`). No date picker, no results view, no request
 * sequencing — that wiring, plus the `getSalesHistory` UNAUTHORIZED ->
 * `effects.relock` handoff on a live report fetch, is work unit R2 (design
 * Decision 7; "File Changes" new-repo row).
 */
function main() {
  const sessionStorageRef = getBrowserSessionStorage();
  const storedPin = loadPin(sessionStorageRef);

  const store = createStore(initialState({ hasPin: storedPin !== null }));

  const ctx = {
    store,
    api: createReportesApiClient({
      baseUrl: API_URL,
      getPin: () => loadPin(sessionStorageRef),
      timeouts: { verify: VERIFY_TIMEOUT_MS, report: REPORT_TIMEOUT_MS },
    }),
    pinStorage: sessionStorageRef,
  };

  const handlers = {
    onUnlock: (pin) => effects.unlock(ctx, pin),
  };

  const pinRoot = document.getElementById('pin-root');
  mountPinView(pinRoot, store, handlers);

  // Visibility of the PIN screen vs. everything else is main.js's call
  // (views render unconditionally, pure given state). In R1 there is no
  // "everything else" to show yet; R2 adds the date picker / results root
  // and extends this function.
  function syncVisibility(status) {
    pinRoot.hidden = status === 'unlocked';
  }
  syncVisibility(store.getState().auth.status);
  select(store, (state) => state.auth.status, syncVisibility);
}

main();
