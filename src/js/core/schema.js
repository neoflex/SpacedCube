// SpacedCube core. No DOM: runs in the browser and in Node (tests).
// Version of the saved state (local storage, sync rows, backup codes) and the steps that upgrade it.
//
// To change the format: bump SCHEMA_VERSION and add STEPS[old] that turns a version-old state
// into a version-old+1 state. Never edit a step once released: old backups still go through it.

export const SCHEMA_VERSION = 1;

/** @type {Record<number, (s: any) => any>} */
const STEPS = {
  // 1: (s) => ({ ...s, newField: defaultValue }),
};

/** A state written by a newer version of the app: this version must not read or overwrite it. */
export class NewerStateError extends Error {
  /** @param {number} version */
  constructor(version) {
    super(`Saved by a newer version of SpacedCube (format ${version}, this app reads up to ${SCHEMA_VERSION}).`);
    this.name = 'NewerStateError';
    this.version = version;
  }
}

/** @param {any} raw */
export const isNewer = (raw) => !!raw && typeof raw === 'object' && Number(raw.v) > SCHEMA_VERSION;

/**
 * Upgrades a saved state to SCHEMA_VERSION. States without a version are version 1.
 * @param {any} raw
 */
export function migrate(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  let v = Number(raw.v) || 1;
  if (v > SCHEMA_VERSION) throw new NewerStateError(v);
  let s = { ...raw };
  while (v < SCHEMA_VERSION) {
    s = STEPS[v](s);
    v += 1;
  }
  s.v = SCHEMA_VERSION;
  return s;
}
