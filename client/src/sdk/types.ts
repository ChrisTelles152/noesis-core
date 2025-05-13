// SDK Configuration Types

export type ModuleType = 'attention' | 'mastery' | 'orchestration';

export interface NoesisSDKOptions {
  apiKey?: string;
  modules?: ModuleType[];
  debug?: boolean;
  attentionOptions?: AttentionTrackingOptions;
  masteryOptions?: MasteryOptions;
}

// Attention Tracking Types

export interface WebcamCaptureOptions {
  width?: number;
  height?: number;
  facingMode?: string;
}

export interface AttentionTrackingOptions {
  webcam?: boolean;
  trackingInterval?: number;
  webcamOptions?: WebcamCaptureOptions;
  onAttentionChange?: AttentionChangeCallback;
  attentionThreshold?: number;
  historySize?: number;
}

export interface AttentionData {
  score: number;
  focusStability: number;
  cognitiveLoad: number;
  gazePoint: { x: number, y: number };
  timestamp: number;
  status: 'inactive' | 'tracking' | 'error';
}

export type AttentionChangeCallback = (data: AttentionData) => void;

// Mastery Learning Types

export interface MasteryOptions {
  threshold?: number;
  spacingFactor?: number;
  initialObjectives?: { id: string, name: string }[];
}

export interface LearningObjective {
  id: string;
  name: string;
  progress: number;
  attempts: number;
  lastReviewed: number | null;
  nextReviewDue: number | null;
  isReviewDue: boolean;
  status: 'not-started' | 'in-progress' | 'mastered';
}

export type MasteryData = LearningObjective[];

export interface LearningEvent {
  objectiveId: string;
  result: number;
  confidence?: number;
}

export type MasteryUpdateCallback = (data: MasteryData) => void;

// Orchestration Types

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
