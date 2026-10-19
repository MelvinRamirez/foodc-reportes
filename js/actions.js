/**
 * Store state shape (Reportes), trimmed from foodc-caja/js/actions.js: only
 * the `auth` slice survives work unit R1 (design Decision 7, "Client =
 * foodc-caja skeleton minus polling and queues"). The `report` slice
 * (request sequencing, loading/ready/empty/error/blocked/contract/unknown
 * status, per js/report.js's classifyReportResult) is added in work unit R2.
 *
 * {
 *   auth: { status: 'locked'|'verifying'|'unlocked',
 *           error: null|'wrong_pin'|'offline'|'not_configured'|'contract' },
 * }
 *
 * @param {{ hasPin?: boolean }} [hydrated]
 */
export function initialState({ hasPin = false } = {}) {
  return {
    auth: { status: hasPin ? 'unlocked' : 'locked', error: null },
  };
}

export const actions = {
  unlockStarted(state) {
    return { ...state, auth: { status: 'verifying', error: null } };
  },

  unlockSucceeded(state) {
    return { ...state, auth: { status: 'unlocked', error: null } };
  },

  unlockFailed(state, { error }) {
    return { ...state, auth: { status: 'locked', error } };
  },

  // Re-lock (on a getSalesHistory UNAUTHORIZED, `reportes-access` "UNAUTHORIZED
  // Response Re-Locks the Screen") never needs a dedicated error banner text:
  // the owner is simply returned to a plain PIN screen, same posture as the
  // kitchen-PIN rejection case, so `reason` is accepted but not required to
  // map to a message in js/messages.js.
  relock(state, { reason = null } = {}) {
    return { ...state, auth: { status: 'locked', error: reason } };
  },
};
