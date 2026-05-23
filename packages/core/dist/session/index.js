/**
 * Session Lifecycle Module
 *
 * Pure in-memory session bookkeeping. Holds in-flight session records,
 * exposes lifecycle hooks (create / show / answer / end / resume / cleanup),
 * and supports replay via serialize() / deserialize().
 */
export { SessionLifecycleManager, createSessionLifecycleManager, } from './SessionLifecycleManager.js';
//# sourceMappingURL=index.js.map