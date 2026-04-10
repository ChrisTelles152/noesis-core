// Re-export all types from the canonical package sources.
// This file exists so that web-demo code can import from '@/sdk/types'
// without duplicating type definitions.
export type {
  ModuleType,
  NoesisSDKOptions,
  AttentionTrackingOptions,
  AttentionData,
  AttentionChangeCallback,
  WebcamCaptureOptions,
  MasteryOptions,
  LearningObjective,
  MasteryData,
  LearningEvent,
  MasteryUpdateCallback,
  LearnerState,
  OrchestratorRequest,
  OrchestratorResponse,
  EngagementRequest,
  EngagementResponse,
  AnalyticsEvent,
} from '@noesis/sdk-web';
