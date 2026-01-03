import { AttentionTracker } from '@noesis/adapters-attention-web';
import { Orchestrator } from '@noesis/adapters-llm';
import { MasteryTracker } from './policies/mastery';
import {
  NoesisSDKOptions,
  LearnerState,
  ModuleType
} from './types';

export class NoesisSDK {
  attention: AttentionTracker;
  mastery: MasteryTracker;
  orchestration: Orchestrator;
  private apiKey: string | undefined;
  private debug: boolean;
  private activeModules: Set<ModuleType>;

  constructor(options: NoesisSDKOptions = {}) {
    this.apiKey = options.apiKey || import.meta.env.VITE_OPENAI_API_KEY || undefined;
    this.debug = options.debug || false;
    const defaultModules: ModuleType[] = ['attention', 'mastery', 'orchestration'];
    this.activeModules = new Set<ModuleType>(options.modules || defaultModules);

    this.log('Initializing Noesis SDK...');

    // Initialize modules
    this.attention = new AttentionTracker(options.attentionOptions || {}, this.debug);
    this.mastery = new MasteryTracker(options.masteryOptions || {}, this.debug);
    this.orchestration = new Orchestrator(this.apiKey, this.debug);

    this.log('Noesis SDK initialized successfully');
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
   * Get the current learner state containing attention and mastery data
   */
  getLearnerState(): LearnerState {
    return {
      attention: this.isModuleActive('attention') ? this.attention.getCurrentData() : undefined,
      mastery: this.isModuleActive('mastery') ? this.mastery.getMasteryData() : undefined,
      timestamp: Date.now()
    };
  }

  /**
   * Log messages if debug mode is enabled
   */
  private log(message: string, ...args: unknown[]): void {
    if (this.debug) {
      console.log(`[NoesisSDK] ${message}`, ...args);
    }
  }
}

export default NoesisSDK;
