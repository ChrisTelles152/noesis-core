import CodeBlock from "@/components/CodeBlock";

export default function APIReferenceSection() {
  return (
    <>
      <h2 className="text-2xl font-semibold text-slate-900 mb-4">API Reference</h2>
      <p className="text-slate-700 mb-6">
        Complete API documentation for the Noesis SDK classes and methods.
      </p>

      <div className="mb-8">
        <h3 className="text-lg font-medium text-slate-900 mb-3">NoesisSDK</h3>
        <p className="text-slate-700 mb-4">Main SDK class that coordinates all modules.</p>
        <CodeBlock
          code={`class NoesisSDK {
  attention: AttentionTracker;
  mastery: MasteryTracker;
  orchestration: Orchestrator;

  constructor(options?: NoesisSDKOptions);
  getLearnerState(): LearnerState;
  isModuleActive(module: ModuleType): boolean;
}`}
          language="typescript"
        />
      </div>

      <div className="mb-8">
        <h3 className="text-lg font-medium text-slate-900 mb-3">AttentionTracker</h3>
        <p className="text-slate-700 mb-4">Handles webcam-based attention tracking.</p>
        <CodeBlock
          code={`class AttentionTracker {
  startTracking(targetElement: HTMLElement, options?: AttentionTrackingOptions): Promise<boolean>;
  stopTracking(): Promise<void>;
  getCurrentData(): AttentionData;
  onAttentionChange(callback: AttentionChangeCallback): void;
}

interface AttentionData {
  score: number;           // 0-1, overall attention level
  focusStability: number;  // 0-1, variance-based stability
  cognitiveLoad: number;   // 0-1, estimated cognitive burden
  gazePoint: { x: number; y: number };
  timestamp: number;
  status: 'inactive' | 'tracking' | 'error';
}`}
          language="typescript"
        />
      </div>

      <div className="mb-8">
        <h3 className="text-lg font-medium text-slate-900 mb-3">MasteryTracker</h3>
        <p className="text-slate-700 mb-4">Implements spaced repetition for learning progress.</p>
        <CodeBlock
          code={`class MasteryTracker {
  initialize(options: MasteryInitOptions): void;
  recordEvent(event: LearningEvent): void;
  getMasteryData(): MasteryData;
  getObjectiveProgress(objectiveId: string): number | null;
  getReviewRecommendations(): LearningObjective[];
  onMasteryUpdate(callback: MasteryUpdateCallback): void;
}

interface LearningObjective {
  id: string;
  name: string;
  progress: number;        // 0-1
  attempts: number;
  lastReviewed: number | null;
  nextReviewDue: number | null;
  isReviewDue: boolean;
  status: 'not-started' | 'in-progress' | 'mastered';
}`}
          language="typescript"
        />
      </div>

      <div className="mb-8">
        <h3 className="text-lg font-medium text-slate-900 mb-3">Orchestrator</h3>
        <p className="text-slate-700 mb-4">Provides LLM-powered adaptive recommendations.</p>
        <CodeBlock
          code={`class Orchestrator {
  getNextStep(request: OrchestratorRequest): Promise<OrchestratorResponse>;
  suggestEngagement(request?: EngagementRequest): Promise<EngagementResponse>;
}

interface OrchestratorResponse {
  suggestion: string;
  explanation?: string;
  resourceLinks?: string[];
  type: 'llm-generated' | 'local-fallback';
}

interface EngagementResponse {
  message: string;
  type: 'attention-prompt' | 'interactive-element' | 'modality-change' | 'micro-break' | 'social-engagement';
  source: 'llm-generated' | 'local-fallback';
}`}
          language="typescript"
        />
      </div>
    </>
  );
}
