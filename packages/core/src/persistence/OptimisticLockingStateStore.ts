/**
 * OptimisticLockingStateStore — version-checked persistence with retry
 *
 * Generic interface for state stores where many writers may update the same
 * key concurrently and silent overwrites are unacceptable. Each value
 * carries an integer `version`; writes succeed only if the caller's
 * expected version matches the stored version.
 *
 * The pattern was forced into noesis-eng by a real production race —
 * migrations 014 (`bkt_state.version`) and 015 (`fsrs_state.version`)
 * added the column specifically because two answer submissions on the
 * same (skill, channel) were silently overwriting each other. The retry
 * semantics (one retry, then surface a typed conflict error) are
 * deliberate — a retry covers the common case of two writes landing in
 * the same millisecond; if a second conflict is seen, the caller almost
 * certainly has stale state and needs to decide what to do.
 *
 * Per decision #4 (locked), core ships the interface + an in-memory
 * implementation only. A Postgres adapter lives in noesis-app or in a
 * separate @noesis-edu/persistence-postgres package later — keeps core
 * dependency-free per CORE_SDK_CONSTITUTION.
 *
 * Replaces the BKTConflictError / FSRSConflictError pattern from eng with
 * one generic OptimisticLockConflictError carrying the key + kind.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Versioned value envelope. Any read returns this; any write supplies the
 * expected version.
 */
export interface VersionedValue<TValue> {
  value: TValue;
  /** Monotonically increasing per key. Starts at 0 on first write. */
  version: number;
}

/**
 * Generic optimistic-lock-aware key/value store.
 */
export interface OptimisticLockingStore<TKey, TValue> {
  /**
   * Read the current value + version. Returns null if the key has never
   * been written.
   */
  load(key: TKey): Promise<VersionedValue<TValue> | null>;

  /**
   * Attempt a version-guarded write.
   *
   * @param key              The key to write.
   * @param value            New value.
   * @param expectedVersion  Version the caller observed at load time.
   *                         Use 0 for a "create if not exists" write.
   * @returns                The post-write VersionedValue (with version =
   *                         expectedVersion + 1) on success; null on
   *                         version conflict.
   */
  tryWrite(
    key: TKey,
    value: TValue,
    expectedVersion: number
  ): Promise<VersionedValue<TValue> | null>;

  /**
   * Best-effort delete. Returns true if a value existed.
   * Used by tests + cleanup paths; not version-guarded.
   */
  remove(key: TKey): Promise<boolean>;
}

/**
 * Thrown when an optimistic write fails after all retries.
 *
 * `kind` lets callers distinguish error categories at the catch site
 * (e.g. "bkt", "fsrs", "session_state") without needing a separate error
 * class per state type — the generic shape from eng's BKTConflictError +
 * FSRSConflictError pattern.
 */
export class OptimisticLockConflictError extends Error {
  constructor(
    public readonly key: unknown,
    public readonly expectedVersion: number,
    public readonly kind: string = 'state'
  ) {
    super(
      `Optimistic lock conflict on ${kind} key=${stringifyKey(key)} expectedVersion=${expectedVersion}`
    );
    this.name = 'OptimisticLockConflictError';
  }
}

function stringifyKey(key: unknown): string {
  if (typeof key === 'string') return key;
  try {
    return JSON.stringify(key);
  } catch {
    return String(key);
  }
}

// =============================================================================
// Update helper with retry semantics
// =============================================================================

export interface UpdateWithRetryOptions {
  /** Number of retries on conflict (default: 1, matches eng semantics). */
  maxRetries?: number;
  /** Tag for OptimisticLockConflictError (default: "state"). */
  kind?: string;
}

/**
 * Read–mutate–write with optimistic-lock retry.
 *
 * The mutator runs against the freshly-loaded value+version on each
 * attempt — so concurrent updates from other writers are reflected when
 * we retry. After `maxRetries + 1` total attempts, throws
 * OptimisticLockConflictError carrying the conflicting key.
 *
 * @param store        The store to update.
 * @param key          The key to update.
 * @param mutate       Function producing the new value from current state.
 *                     Receives null + version 0 if the key is new.
 * @param options.maxRetries  Default 1 (matches eng's single-retry semantics).
 * @param options.kind        For typed conflict errors (e.g., "bkt", "fsrs").
 */
export async function updateWithRetry<TKey, TValue>(
  store: OptimisticLockingStore<TKey, TValue>,
  key: TKey,
  mutate: (current: TValue | null, currentVersion: number) => TValue,
  options: UpdateWithRetryOptions = {}
): Promise<VersionedValue<TValue>> {
  const maxRetries = options.maxRetries ?? 1;
  const kind = options.kind ?? 'state';
  let attempts = 0;
  let lastExpected = 0;

  while (attempts <= maxRetries) {
    const current = await store.load(key);
    const value = current ? current.value : null;
    const version = current ? current.version : 0;
    const next = mutate(value, version);
    lastExpected = version;
    const written = await store.tryWrite(key, next, version);
    if (written !== null) return written;
    attempts++;
  }
  throw new OptimisticLockConflictError(key, lastExpected, kind);
}

// =============================================================================
// In-memory implementation
// =============================================================================

/**
 * In-memory store. Keys serialize to JSON for hashing; same shape ↔ same key.
 *
 * Suitable for tests, dev, and replay harnesses. Production deployments
 * use a database-backed adapter (lives outside core).
 */
export class InMemoryOptimisticStore<TKey, TValue> implements OptimisticLockingStore<TKey, TValue> {
  private readonly data: Map<string, VersionedValue<TValue>> = new Map();

  async load(key: TKey): Promise<VersionedValue<TValue> | null> {
    const k = stringifyKey(key);
    const found = this.data.get(k);
    return found ? { value: found.value, version: found.version } : null;
  }

  async tryWrite(
    key: TKey,
    value: TValue,
    expectedVersion: number
  ): Promise<VersionedValue<TValue> | null> {
    const k = stringifyKey(key);
    const existing = this.data.get(k);
    const currentVersion = existing ? existing.version : 0;
    if (currentVersion !== expectedVersion) return null;
    const next: VersionedValue<TValue> = { value, version: expectedVersion + 1 };
    this.data.set(k, next);
    return { ...next };
  }

  async remove(key: TKey): Promise<boolean> {
    return this.data.delete(stringifyKey(key));
  }

  /** Test/dev helper: drop everything. */
  clear(): void {
    this.data.clear();
  }

  /** Test/dev helper: enumerate keys (as their stringified forms). */
  keys(): string[] {
    return Array.from(this.data.keys());
  }

  /** Test/dev helper: total entry count. */
  size(): number {
    return this.data.size;
  }
}

/**
 * Factory.
 */
export function createInMemoryOptimisticStore<TKey, TValue>(): InMemoryOptimisticStore<
  TKey,
  TValue
> {
  return new InMemoryOptimisticStore<TKey, TValue>();
}
