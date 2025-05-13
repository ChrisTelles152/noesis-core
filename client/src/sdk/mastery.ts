import { 
  MasteryOptions, 
  LearningObjective, 
  MasteryData,
  LearningEvent,
  MasteryUpdateCallback
} from './types';

export class MasteryTracker {
  private options: MasteryOptions;
  private debug: boolean;
  private objectives: LearningObjective[] = [];
  private updateCallbacks: MasteryUpdateCallback[] = [];
  
  constructor(options: MasteryOptions = {}, debug: boolean = false) {
    this.options = {
      threshold: options.threshold || 0.8,
      spacingFactor: options.spacingFactor || 2.5,
      initialObjectives: options.initialObjectives || []
    };
    this.debug = debug;
    
    // Initialize with any provided objectives
    if (this.options.initialObjectives && this.options.initialObjectives.length > 0) {
      this.initialize({ objectives: this.options.initialObjectives });
    }
    
    this.log('MasteryTracker initialized');
  }

  /**
   * Initialize the mastery tracker with learning objectives
   */
  initialize(options: { 
    objectives: { id: string, name: string }[],
    threshold?: number,
    spacingFactor?: number,
    onMasteryUpdate?: MasteryUpdateCallback
  }): void {
    // Update options
    if (options.threshold !== undefined) this.options.threshold = options.threshold;
    if (options.spacingFactor !== undefined) this.options.spacingFactor = options.spacingFactor;
    if (options.onMasteryUpdate) this.updateCallbacks.push(options.onMasteryUpdate);
    
    // Initialize objectives
    this.objectives = options.objectives.map(obj => ({
      id: obj.id,
      name: obj.name,
      progress: 0,
      attempts: 0,
      lastReviewed: null,
      nextReviewDue: null,
      isReviewDue: false,
      status: 'not-started'
    }));
    
    this.log('Mastery objectives initialized:', this.objectives);
    this.notifyCallbacks();
  }

  /**
   * Record a learning event for a specific objective
   */
  recordEvent(event: LearningEvent): void {
    const { objectiveId, result, confidence } = event;
    
    // Find the objective
    const objective = this.objectives.find(obj => obj.id === objectiveId);
    if (!objective) {
      this.log(`Warning: Objective ${objectiveId} not found`);
      return;
    }
    
    // Update objective progress
    const prevProgress = objective.progress;
    const attemptWeight = confidence !== undefined ? confidence : 1.0;
    
    // Apply spaced repetition algorithm for progress calculation
    if (objective.attempts === 0) {
      // First attempt - direct assignment with some weight
      objective.progress = result * 0.7;
    } else {
      // Weighted moving average with more weight to previous progress for stability
      objective.progress = (prevProgress * 0.7) + (result * 0.3 * attemptWeight);
    }
    
    // Constrain to 0-1 range
    objective.progress = Math.max(0, Math.min(1, objective.progress));
    
    // Update attempt count and timestamps
    objective.attempts += 1;
    objective.lastReviewed = Date.now();
    
    // Calculate next review time based on spaced repetition algorithm
    if (objective.progress < this.options.threshold) {
      // Review sooner if not mastered
      const intervalHours = Math.max(1, 24 * Math.pow(this.options.spacingFactor, objective.progress) * 0.5);
      objective.nextReviewDue = Date.now() + (intervalHours * 60 * 60 * 1000);
      objective.isReviewDue = false;
    } else {
      // Longer interval for mastered concepts
      const intervalDays = Math.max(1, 7 * Math.pow(this.options.spacingFactor, objective.progress - 0.7));
      objective.nextReviewDue = Date.now() + (intervalDays * 24 * 60 * 60 * 1000);
      objective.isReviewDue = false;
    }
    
    // Update status
    if (objective.progress >= this.options.threshold) {
      objective.status = 'mastered';
    } else if (objective.progress > 0) {
      objective.status = 'in-progress';
    } else {
      objective.status = 'not-started';
    }
    
    this.log(`Updated objective ${objectiveId}:`, objective);
    this.notifyCallbacks();
  }

  /**
   * Get recommendations for what to review next
   */
  getReviewRecommendations(): LearningObjective[] {
    const now = Date.now();
    
    // Update isReviewDue flag for all objectives
    this.objectives.forEach(obj => {
      if (obj.nextReviewDue && obj.nextReviewDue <= now) {
        obj.isReviewDue = true;
      }
    });
    
    // First priority: concepts due for review
    const dueForReview = this.objectives.filter(obj => obj.isReviewDue);
    if (dueForReview.length > 0) {
      return dueForReview.sort((a, b) => (a.nextReviewDue || 0) - (b.nextReviewDue || 0));
    }
    
    // Second priority: in-progress concepts not yet mastered
    const inProgress = this.objectives.filter(
      obj => obj.status === 'in-progress' && obj.progress < this.options.threshold
    );
    if (inProgress.length > 0) {
      return inProgress.sort((a, b) => b.progress - a.progress);
    }
    
    // Third priority: not-started concepts
    const notStarted = this.objectives.filter(obj => obj.status === 'not-started');
    if (notStarted.length > 0) {
      return notStarted;
    }
    
    // Fallback: suggest reviewing mastered concepts
    return this.objectives
      .filter(obj => obj.status === 'mastered')
      .sort((a, b) => (a.lastReviewed || 0) - (b.lastReviewed || 0));
  }

  /**
   * Register a callback for mastery data changes
   */
  onMasteryUpdate(callback: MasteryUpdateCallback): void {
    this.updateCallbacks.push(callback);
  }

  /**
   * Get all mastery data
   */
  getMasteryData(): MasteryData {
    return [...this.objectives];
  }

  /**
   * Get mastery progress for a specific objective
   */
  getObjectiveProgress(objectiveId: string): number | null {
    const objective = this.objectives.find(obj => obj.id === objectiveId);
    return objective ? objective.progress : null;
  }

  /**
   * Notify all registered callbacks with updated mastery data
   */
  private notifyCallbacks(): void {
    const data = this.getMasteryData();
    this.updateCallbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        this.log('Error in mastery update callback:', error);
      }
    });
  }

  /**
   * Log messages if debug mode is enabled
   */
  private log(message: string, ...args: any[]): void {
    if (this.debug) {
      console.log(`[MasteryTracker] ${message}`, ...args);
    }
  }
}
