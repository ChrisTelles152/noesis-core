/**
 * Persistence Adapter Module
 *
 * Provides interfaces and implementations for persisting engine state.
 * The core SDK remains dependency-free - adapters for specific storage
 * backends (localStorage, IndexedDB, PostgreSQL, etc.) should be
 * implemented by the consuming application.
 */

/**
 * Interface for persisting Noesis engine state.
 * Implementations can use any storage backend (memory, localStorage, DB, etc.)
 */
export interface NoesisStateStore {
  /**
   * Load state for a learner.
   * @param learnerId - The learner identifier
   * @returns JSON string from engine.exportState(), or null if not found
   */
  load(learnerId: string): Promise<string | null>;

  /**
   * Save state for a learner.
   * @param learnerId - The learner identifier
   * @param state - JSON string from engine.exportState()
   */
  save(learnerId: string, state: string): Promise<void>;
}

/**
 * In-memory state store for testing and development.
 * State is lost when the process exits.
 */
export class InMemoryStateStore implements NoesisStateStore {
  private store: Map<string, string> = new Map();

  async load(learnerId: string): Promise<string | null> {
    return this.store.get(learnerId) ?? null;
  }

  async save(learnerId: string, state: string): Promise<void> {
    this.store.set(learnerId, state);
  }

  /**
   * Clear all stored state (useful for testing)
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Check if state exists for a learner
   */
  has(learnerId: string): boolean {
    return this.store.has(learnerId);
  }

  /**
   * Get all stored learner IDs
   */
  keys(): string[] {
    return Array.from(this.store.keys());
  }
}
