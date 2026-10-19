import { actions } from './actions.js';
import * as pin from './pin.js';

/**
 * Internal engine. `ctx` is created once by `main.js` (the composition
 * root) and shared across every effect call for the life of the page:
 *
 *   ctx.store       - the app's createStore instance
 *   ctx.api         - a createReportesApiClient instance
 *   ctx.pinStorage  - the injected sessionStorage-like object (or null)
 *
 * Trimmed from foodc-caja/js/effects.js: no polling loop, no payment
 * runner, no day-close orchestration (design Decision 7). Only the auth
 * slice's effects survive into work unit R1; report-fetching effects are
 * added in work unit R2.
 */

// Codes that indicate a contract bug in the request itself (never a
// data-state mismatch): mirrors foodc-caja's POLL_CONTRACT_ERROR_CODES.
const CONTRACT_ERROR_CODES = new Set(['UNKNOWN_ACTION', 'INVALID_JSON', 'VALIDATION_ERROR']);

// --- re-lock ----------------------------------------------------------

/**
 * Shared re-lock path for "any protected call -> UNAUTHORIZED -> relock"
 * (`reportes-access` "UNAUTHORIZED Response Re-Locks the Screen"): clears
 * the stored PIN and dispatches `actions.relock`. In R1 nothing calls this
 * on a successful getSalesHistory path yet (there is no report fetch
 * wired up until R2); it is exercised directly here against a fake ctx,
 * and against `isRelock` classifying a getSalesHistory UNAUTHORIZED result
 * (task 9.5), since R2's `main.js` wiring is what calls it from a live
 * response.
 *
 * @param {object} ctx
 * @param {string|null} [reason]
 */
export function relock(ctx, reason = null) {
  pin.clearPin(ctx.pinStorage);
  ctx.store.setState((s) => actions.relock(s, { reason }));
}

// --- unlock -------------------------------------------------------------

/**
 * @param {object} ctx
 * @param {string} pinValue
 */
export async function unlock(ctx, pinValue) {
  ctx.store.setState((s) => actions.unlockStarted(s));
  const result = await ctx.api.verifyCajaPin(pinValue);

  if (result.kind === 'success') {
    pin.savePin(ctx.pinStorage, pinValue);
    ctx.store.setState((s) => actions.unlockSucceeded(s));
    return;
  }

  let error;
  if (result.kind === 'definitive' && result.code === 'UNAUTHORIZED') {
    // Covers both an incorrect PIN and the kitchen PIN submitted by
    // mistake: `requireCajaPin_` rejects both identically with
    // UNAUTHORIZED, and this client makes no distinction either (task
    // 9.2, `reportes-access` "Submitting the kitchen PIN is rejected
    // like any other wrong PIN").
    error = 'wrong_pin';
  } else if (result.kind === 'definitive' && result.code === 'PIN_NOT_CONFIGURED') {
    error = 'not_configured';
  } else if (result.kind === 'definitive' && CONTRACT_ERROR_CODES.has(result.code)) {
    error = 'contract';
  } else {
    // 'ambiguous' (network/timeout/invalid_response): task 9.3, distinct
    // from 'wrong_pin', retryable, stores no PIN.
    error = 'offline';
  }
  ctx.store.setState((s) => actions.unlockFailed(s, { error }));
}
