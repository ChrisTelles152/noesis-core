import { AttentionTracker } from './attention';
import { MasteryTracker } from './mastery';
import { Orchestrator } from './orchestration';
import { 
  NoesisSDKOptions, 
  AttentionTrackingOptions, 
  MasteryOptions,
  LearnerState,
  ModuleType
} from './types';

export class NoesisSDK {
  attention: AttentionTracker;
  mastery: MasteryTracker;
  orchestration: Orchestrator;
  private apiKey: string | undefined;
  private debug: boolean;
  private activeModules: ModuleType[];

  constructor(options: NoesisSDKOptions = {}) {
    this.apiKey = options.apiKey || import.meta.env.VITE_OPENAI_API_KEY || undefined;
    this.debug = options.debug || false;
    this.activeModules = options.modules || ['attention', 'mastery'];
    
    this.log('Initializing Noesis SDK...');
    
    // Initialize modules
    this.attention = new AttentionTracker(options.attentionOptions || {}, this.debug);
    this.mastery = new MasteryTracker(options.masteryOptions || {}, this.debug);
    this.orchestration = new Orchestrator(this.apiKey, this.debug);

    this.log('Noesis SDK initialized successfully');
  }

  /**
   * Get the current learner state containing attention and mastery data
   */
  getLearnerState(): LearnerState {
    return {
      attention: this.attention.getCurrentData(),
      mastery: this.mastery.getMasteryData(),
      timestamp: Date.now()
    };
  }

  /**
   * Log messages if debug mode is enabled
   */
  private log(message: string, ...args: any[]): void {
    if (this.debug) {
      console.log(`[NoesisSDK] ${message}`, ...args);
    }
  }
}

export default NoesisSDK;
