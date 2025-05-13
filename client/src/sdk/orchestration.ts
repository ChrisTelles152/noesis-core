import { 
  OrchestratorRequest, 
  OrchestratorResponse,
  EngagementRequest,
  EngagementResponse,
  LearnerState 
} from './types';

export class Orchestrator {
  private apiKey: string | undefined;
  private debug: boolean;
  private apiEndpoint: string = '/api/orchestration';
  
  constructor(apiKey: string | undefined, debug: boolean = false) {
    this.apiKey = apiKey;
    this.debug = debug;
    this.log('Orchestrator initialized');
  }

  /**
   * Get next step recommendation based on learner state
   */
  async getNextStep(request: OrchestratorRequest): Promise<OrchestratorResponse> {
    this.log('Getting next step recommendation', request);
    
    try {
      // Check if API key is available
      if (!this.apiKey) {
        this.log('Warning: No API key provided for orchestration');
        return this.getLocalRecommendation(request);
      }
      
      // Make API request
      const response = await fetch(`${this.apiEndpoint}/next-step`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(request)
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      this.log('Received recommendation:', data);
      
      return data;
    } catch (error) {
      this.log('Error getting next step:', error);
      
      // Fallback to local recommendation if API fails
      return this.getLocalRecommendation(request);
    }
  }

  /**
   * Get engagement suggestion when attention is low
   */
  async suggestEngagement(request: EngagementRequest = {}): Promise<EngagementResponse> {
    this.log('Getting engagement suggestion', request);
    
    try {
      // Check if API key is available
      if (!this.apiKey) {
        this.log('Warning: No API key provided for orchestration');
        return this.getLocalEngagementSuggestion();
      }
      
      // Make API request
      const response = await fetch(`${this.apiEndpoint}/engagement`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(request)
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      this.log('Received engagement suggestion:', data);
      
      return data;
    } catch (error) {
      this.log('Error getting engagement suggestion:', error);
      
      // Fallback to local suggestion if API fails
      return this.getLocalEngagementSuggestion();
    }
  }

  /**
   * Generate a local recommendation without API
   * This is a fallback when no API key is provided or API request fails
   */
  private getLocalRecommendation(request: OrchestratorRequest): OrchestratorResponse {
    const { learnerState, context } = request;
    
    // Get attention level
    const attentionLevel = learnerState.attention ? learnerState.attention.score : 0.5;
    
    // Get mastery data if available
    const mastery = learnerState.mastery || [];
    
    let suggestion = '';
    let explanation = '';
    
    // Generate recommendation based on attention and context
    if (attentionLevel < 0.3) {
      suggestion = "Let's try a more interactive approach. Would you like to see a visual example?";
      explanation = "Low attention detected. Suggesting a modality change to re-engage the learner.";
    } else if (context && context.includes('struggling')) {
      suggestion = "Let's break this down into smaller steps and work through each one.";
      explanation = "Learner is struggling. Suggesting a scaffold approach to build understanding progressively.";
    } else if (mastery.some(m => m.isReviewDue)) {
      suggestion = "Before moving on, let's quickly review a concept that's due for practice.";
      explanation = "Spaced repetition algorithm indicates a review is due to reinforce learning.";
    } else {
      suggestion = "Based on your progress, you're ready to move on to the next concept.";
      explanation = "Good progress detected. Recommending advancement to maintain engagement.";
    }
    
    return {
      suggestion,
      explanation,
      resourceLinks: [],
      type: 'local-fallback'
    };
  }

  /**
   * Generate a local engagement suggestion without API
   */
  private getLocalEngagementSuggestion(): EngagementResponse {
    // Simple rotation of engagement suggestions
    const suggestions = [
      "Would you like to take a quick 30-second break to refresh?",
      "Let's try a different approach to this concept. How about a visual example?",
      "Would it help to see a real-world application of this concept?",
      "Let's make this more interactive. Can you try solving a simple version of this problem?",
      "Sometimes a change of pace helps. Would you like to switch to a related topic and come back to this later?"
    ];
    
    const randomIndex = Math.floor(Math.random() * suggestions.length);
    
    return {
      message: suggestions[randomIndex],
      type: 'attention-prompt',
      source: 'local-fallback'
    };
  }

  /**
   * Log messages if debug mode is enabled
   */
  private log(message: string, ...args: any[]): void {
    if (this.debug) {
      console.log(`[Orchestrator] ${message}`, ...args);
    }
  }
}
