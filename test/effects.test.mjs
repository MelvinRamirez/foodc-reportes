import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store.js';
import { initialState } from '../js/actions.js';
import { loadPin, clearPin } from '../js/pin.js';
import { PIN_SESSION_KEY } from '../js/config.js';
import * as effects from '../js/effects.js';

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
    _data: data,
  };
}

// pin.js keeps a module-level in-memory fallback (so a session survives a
// throwing storage); reset it before every test here so an earlier test's
// savePin doesn't leak into a later test's "stores nothing" assertion.
function resetPinFallback() {
  clearPin(fakeStorage());
}

function fakeApi({ verifyResult }) {
  const calls = [];
  return {
    calls,
    async verifyCajaPin(pin) {
      calls.push(pin);
      return typeof verifyResult === 'function' ? verifyResult(pin) : verifyResult;
    },
  };
}

function makeCtx({ verifyResult, pinStorage = fakeStorage() } = {}) {
  const store = createStore(initialState());
  return { store, api: fakeApi({ verifyResult }), pinStorage };
}

// --- task 9.1: with no stored PIN, only the locked state exists; nothing
// in this ctx ever calls getSalesHistory while locked (there is no such
// wiring at all in work unit R1's main.js/effects.js) ---

test('initialState with no stored PIN starts locked, with no getSalesHistory capability exercised', () => {
  const state = initialState({ hasPin: false });
  assert.equal(state.auth.status, 'locked');
  assert.equal(state.auth.error, null);
});

test('initialState with a stored PIN present starts unlocked (loadPin resolved it before store creation)', () => {
  const state = initialState({ hasPin: true });
  assert.equal(state.auth.status, 'unlocked');
});

// --- task 9.2: successful verifyCajaPin stores the PIN under
// foodc.reportes.pin and transitions to unlocked ---

test('unlock: a successful verifyCajaPin stores the PIN and transitions to unlocked', async () => {
  resetPinFallback();
  const pinStorage = fakeStorage();
  const ctx = makeCtx({
    verifyResult: { kind: 'success', data: { valid: true }, meta: null },
    pinStorage,
  });

  await effects.unlock(ctx, '123456');

  assert.equal(ctx.store.getState().auth.status, 'unlocked');
  assert.equal(ctx.store.getState().auth.error, null);
  assert.equal(loadPin(pinStorage), '123456');
  assert.equal(pinStorage._data[PIN_SESSION_KEY], '123456');
});

// --- task 9.2: UNAUTHORIZED (wrong PIN or the kitchen PIN by mistake)
// stores nothing and keeps the locked state; both handled identically ---

test('unlock: UNAUTHORIZED (wrong PIN) stores no PIN and stays locked', async () => {
  resetPinFallback();
  const pinStorage = fakeStorage();
  const ctx = makeCtx({
    verifyResult: { kind: 'definitive', code: 'UNAUTHORIZED', message: '', details: null },
    pinStorage,
  });

  await effects.unlock(ctx, '000000');

  assert.equal(ctx.store.getState().auth.status, 'locked');
  assert.equal(ctx.store.getState().auth.error, 'wrong_pin');
  assert.equal(loadPin(pinStorage), null);
});

test('unlock: UNAUTHORIZED from submitting the kitchen PIN by mistake is handled identically to any wrong PIN', async () => {
  resetPinFallback();
  const pinStorage = fakeStorage();
  const ctx = makeCtx({
    // requireCajaPin_ rejects the kitchen PIN with the same UNAUTHORIZED
    // code as any other wrong PIN (design Decision 4) — the client makes
    // no distinction, same assertion either way.
    verifyResult: { kind: 'definitive', code: 'UNAUTHORIZED', message: '', details: null },
    pinStorage,
  });

  await effects.unlock(ctx, '999999'); // the kitchen PIN, submitted by mistake

  assert.equal(ctx.store.getState().auth.status, 'locked');
  assert.equal(ctx.store.getState().auth.error, 'wrong_pin');
  assert.equal(loadPin(pinStorage), null);
});

test('unlock: PIN_NOT_CONFIGURED stores no PIN and surfaces a distinct error', async () => {
  resetPinFallback();
  const pinStorage = fakeStorage();
  const ctx = makeCtx({
    verifyResult: { kind: 'definitive', code: 'PIN_NOT_CONFIGURED', message: '', details: null },
    pinStorage,
  });

  await effects.unlock(ctx, '123456');

  assert.equal(ctx.store.getState().auth.status, 'locked');
  assert.equal(ctx.store.getState().auth.error, 'not_configured');
  assert.equal(loadPin(pinStorage), null);
});

// --- task 9.3: ambiguous (network/timeout) failure is distinct from
// UNAUTHORIZED, stores no PIN, leaves submission retryable (status returns
// to 'locked', not stuck in 'verifying') ---

test('unlock: a network/timeout ambiguous failure classifies distinctly from wrong_pin and is retryable', async () => {
  resetPinFallback();
  const pinStorage = fakeStorage();
  const ctx = makeCtx({
    verifyResult: { kind: 'ambiguous', reason: 'network' },
    pinStorage,
  });

  await effects.unlock(ctx, '123456');

  assert.equal(ctx.store.getState().auth.status, 'locked');
  assert.equal(ctx.store.getState().auth.error, 'offline');
  assert.notEqual(ctx.store.getState().auth.error, 'wrong_pin');
  assert.equal(loadPin(pinStorage), null);

  // Retryable: calling unlock again (e.g. the owner presses submit once
  // more) is not blocked by any leftover 'verifying' state.
  const ctx2 = { ...ctx };
  ctx2.api = fakeApi({ verifyResult: { kind: 'success', data: { valid: true }, meta: null } });
  await effects.unlock(ctx2, '123456');
  assert.equal(ctx.store.getState().auth.status, 'unlocked');
});

test('unlock: an ambiguous(timeout) failure also stores no PIN and is distinct from wrong_pin', async () => {
  resetPinFallback();
  const pinStorage = fakeStorage();
  const ctx = makeCtx({
    verifyResult: { kind: 'ambiguous', reason: 'timeout' },
    pinStorage,
  });

  await effects.unlock(ctx, '123456');

  assert.equal(ctx.store.getState().auth.status, 'locked');
  assert.equal(ctx.store.getState().auth.error, 'offline');
  assert.equal(loadPin(pinStorage), null);
});

// --- transient 'verifying' status while the call is in flight ---

test('unlock: dispatches a verifying status before the verifyCajaPin promise resolves', async () => {
  let resolveVerify;
  const ctx = {
    store: createStore(initialState()),
    api: {
      async verifyCajaPin() {
        return new Promise((resolve) => {
          resolveVerify = resolve;
        });
      },
    },
    pinStorage: fakeStorage(),
  };

  const pending = effects.unlock(ctx, '123456');
  assert.equal(ctx.store.getState().auth.status, 'verifying');

  resolveVerify({ kind: 'success', data: { valid: true }, meta: null });
  await pending;
  assert.equal(ctx.store.getState().auth.status, 'unlocked');
});

// --- task 9.5: UNAUTHORIZED on getSalesHistory clears the stored PIN and
// signals relock (effects.relock); a subsequent successful verifyCajaPin
// makes the app usable again ---

test('relock: clears the stored PIN and transitions to locked', () => {
  resetPinFallback();
  const pinStorage = fakeStorage();
  const store = createStore(initialState({ hasPin: true }));
  const ctx = { store, pinStorage };

  effects.relock(ctx, 'rotated');

  assert.equal(store.getState().auth.status, 'locked');
  assert.equal(loadPin(pinStorage), null);
});

test('relock: after relock, a successful verifyCajaPin unlocks again (resuming after a PIN rotation)', async () => {
  resetPinFallback();
  const pinStorage = fakeStorage({ [PIN_SESSION_KEY]: '111111' });
  const store = createStore(initialState({ hasPin: true }));
  const ctx = { store, pinStorage };

  effects.relock(ctx, 'rotated');
  assert.equal(store.getState().auth.status, 'locked');
  assert.equal(loadPin(pinStorage), null);

  ctx.api = fakeApi({ verifyResult: { kind: 'success', data: { valid: true }, meta: null } });
  await effects.unlock(ctx, '222222'); // the new, rotated PIN

  assert.equal(store.getState().auth.status, 'unlocked');
  assert.equal(loadPin(pinStorage), '222222');
});
