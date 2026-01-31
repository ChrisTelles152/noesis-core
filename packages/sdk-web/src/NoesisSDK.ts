import { AttentionTracker } from '@noesis/adapters-attention-web';
import { Orchestrator } from '@noesis/adapters-llm';
import { MasteryTracker } from './policies/mastery';
import { CoreEngineAdapter, type CoreAdapterConfig } from './core';
import type { Skill, NoesisEvent, SessionAction } from '@noesis-edu/core';
import {
  NoesisSDKOptions,
  LearnerState,
  ModuleType
} from './types';

export class NoesisSDK {
  attention: AttentionTracker;
  mastery: MasteryTracker;
  orchestration: Orchestrator;

  /**
   * Core engine adapter for access to the @noesis-edu/core learning engine.
   * Provides deterministic session planning, BKT-based mastery tracking,
   * and canonical event emission.
   */
  core: CoreEngineAdapter | null = null;

  // =========================================================================
  // UNIMPLEMENTED: Voice Interface
  // =========================================================================
  // Voice interface is planned for future releases. It will provide:
  // - Voice commands for hands-free learning interaction
  // - Text-to-speech for audio feedback and content narration
  // - Speech-to-text for verbal responses in assessments
  //
  // Placeholder: voice: VoiceInterface | null = null;
  //
  // See: https://github.com/noesis-edu/noesis-core/issues/TBD
  // =========================================================================

  // =========================================================================
  // UNIMPLEMENTED: XR Support (Quest/Vision Pro)
  // =========================================================================
  // XR support is planned for future releases. It will provide:
  // - Hand tracking for gesture-based interaction
  // - Spatial anchoring for 3D learning environments
  // - Eye tracking integration with XR headsets (Quest Pro, Vision Pro)
  // - Passthrough mode for AR learning experiences
  //
  // Placeholder: xr: XRAdapter | null = null;
  //
  // See: https://github.com/noesis-edu/noesis-core/issues/TBD
  // =========================================================================

  private apiKey: string | undefined;
  private debug: boolean;
  private activeModules: Set<ModuleType>;

  constructor(options: NoesisSDKOptions = {}) {
    this.apiKey = options.apiKey;
    this.debug = options.debug || false;
    const defaultModules: ModuleType[] = ['attention', 'mastery', 'orchestration'];
    this.activeModules = new Set<ModuleType>(options.modules || defaultModules);

    this.log('Initializing Noesis SDK...');

    // Initialize modules
    this.attention = new AttentionTracker(options.attentionOptions || {}, this.debug);
    this.mastery = new MasteryTracker(options.masteryOptions || {}, this.debug);
    this.orchestration = new Orchestrator(this.apiKey, this.debug);

    // Initialize core engine if configured
    if (options.coreConfig) {
      this.initializeCore(options.coreConfig);
    }

    this.log('Noesis SDK initialized successfully');
  }

  /**
   * Initialize the core learning engine with skill graph and configuration.
   * This enables access to BKT-based mastery tracking, FSRS scheduling,
   * and deterministic session planning.
   */
  initializeCore(config: Omit<CoreAdapterConfig, 'debug'>): void {
    this.core = new CoreEngineAdapter({
      ...config,
      debug: this.debug,
    });
    this.activeModules.add('core');
    this.log('Core engine initialized');
  }

  /**
   * Record a practice event through the core engine.
   * Emits a canonical PracticeEvent and updates the learner model.
   */
  recordPractice(
    skillId: string,
    itemId: string,
    correct: boolean,
    responseTimeMs: number,
    options?: { confidence?: number; errorCategory?: string }
  ): NoesisEvent | null {
    if (!this.core) {
      this.log('Warning: Core engine not initialized, practice not recorded');
      return null;
    }
    return this.core.recordPractice(skillId, itemId, correct, responseTimeMs, options);
  }

  /**
   * Get the next recommended learning action from the core planner.
   */
  getNextAction(): SessionAction | null {
    if (!this.core) {
      this.log('Warning: Core engine not initialized');
      return null;
    }
    return this.core.getNextAction();
  }

  /**
   * Get the event log from the core engine.
   * Contains all canonical events emitted during this session.
   */
  getEventLog(): NoesisEvent[] {
    return this.core?.getEventLog() ?? [];
  }

  /**
   * Export event log as JSON for analysis or replay.
   */
  exportEventLog(): string {
    return this.core?.exportEventLog() ?? '[]';
  }

  /**
   * Update the skill graph used by the core engine.
   */
  updateSkillGraph(skills: Skill[]): void {
    if (!this.core) {
      this.log('Warning: Core engine not initialized');
      return;
    }
    this.core.updateSkillGraph(skills);
  }

  /**
   * Check if SDK is initialized
   */
  isInitialized(): boolean {
    return true; // SDK is initialized in constructor
  }

  /**
   * Get list of active modules
   */
  getActiveModules(): ModuleType[] {
    return Array.from(this.activeModules);
  }

  /**
   * Check if a specific module is active
   */
  isModuleActive(module: ModuleType): boolean {
    return this.activeModules.has(module);
  }

  /**
   * Check if core engine is initialized
   */
  isCoreInitialized(): boolean {
    return this.core !== null;
  }

  /**
   * Get the current learner state containing attention and mastery data
   */
  getLearnerState(): LearnerState {
    return {
      attention: this.isModuleActive('attention') ? this.attention.getCurrentData() : undefined,
      mastery: this.isModuleActive('mastery') ? this.mastery.getMasteryData() : undefined,
      coreProgress: this.core?.getLearnerProgress(),
      timestamp: Date.now()
    };
  }

  /**
   * Log messages if debug mode is enabled
   */
  private log(message: string, ...args: unknown[]): void {
    if (this.debug) {
      // eslint-disable-next-line no-console
      console.log(`[NoesisSDK] ${message}`, ...args);
    }
  }
}

export default NoesisSDK;
