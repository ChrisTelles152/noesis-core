/**
 * Orchestration Types
 *
 * Types for the client-side LLM orchestration API.
 */

export interface AttentionData {
  score: number;
  focusStability: number;
  cognitiveLoad: number;
  gazePoint?: { x: number; y: number };
  timestamp: number;
  status: 'inactive' | 'tracking' | 'error';
}

export interface MasteryObjective {
  id: string;
  name: string;
  progress: number;
  attempts: number;
  lastReviewed: number | null;
  nextReviewDue: number | null;
  isReviewDue: boolean;
  status: 'not-started' | 'in-progress' | 'mastered';
}

export type MasteryData = MasteryObjective[];

export interface LearnerState {
  attention?: AttentionData;
  mastery?: MasteryData;
  timestamp: number;
}

export interface OrchestratorRequest {
  learnerState: LearnerState;
  context?: string;
  options?: {
    detail?: 'low' | 'medium' | 'high';
    format?: 'text' | 'json';
  };
}

export interface OrchestratorResponse {
  suggestion: string;
  explanation?: string;
  resourceLinks?: string[];
  type?: string;
}

export interface EngagementRequest {
  attentionScore?: number;
  context?: string;
  previousInterventions?: string[];
}

export interface EngagementResponse {
  message: string;
  type: string;
  source?: string;
}
