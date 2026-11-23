// SpacedCube core. No DOM: runs in the browser and in Node (tests).
// Public API of the core.
import { makeSet } from './case-set.js';
import { OLL_DEF } from './cases-oll.js';
import { PLL_DEF } from './cases-pll.js';

export * from './cube.js';
export * from './notation.js';
export * from './inspect.js';
export { PLL_FT_ALL } from './case-set.js';
export { SCHEMA_VERSION, NewerStateError, isNewer, migrate } from './schema.js';
export const sets = { PLL: makeSet(PLL_DEF), OLL: makeSet(OLL_DEF) };
