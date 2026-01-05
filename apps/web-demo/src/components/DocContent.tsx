import { Button } from "@/components/ui/button";
import CodeBlock from "@/components/CodeBlock";

interface DocContentProps {
  activeSection: string;
}

export default function DocContent({ activeSection }: DocContentProps) {
  const installCode = `# Using npm
npm install @noesis-edu/core

# Using yarn
yarn add @noesis-edu/core`;

  const basicUsageCode = `import { NoesisSDK } from '@noesis-edu/core';

const noesis = new NoesisSDK({
  apiKey: 'YOUR_API_KEY', // Optional for core features
  modules: ['attention', 'mastery'],
  debug: true
});`;

  const attentionTrackingCode = `async function startAttentionTracking() {
  try {
    await noesis.attention.startTracking({
      element: '#learning-content',
      webcam: true,
      trackingInterval: 500, // ms
      onAttentionChange: data => {
        console.log('Attention score:', data.score);
        
        // Update UI or adapt content based on attention
        updateUIWithAttentionData(data);
      }
    });
  } catch (error) {
    console.error('Error starting attention tracking:', error);
  }
}`;

  const masteryTrackingCode = `// Define learning objectives
const objectives = [
  { id: 'concept_a', name: 'Basic Principles' },
  { id: 'concept_b', name: 'Applied Knowledge' },
  { id: 'concept_c', name: 'Advanced Application' }
];

// Initialize mastery tracking
noesis.mastery.initialize({
  objectives,
  threshold: 0.8, // 80% mastery required
  spacingFactor: 2.5, // For spaced repetition
  onMasteryUpdate: data => {
    console.log('Mastery updated:', data);
    updateProgressUI(data);
  }
});

// Later, when user completes an assessment or task:
noesis.mastery.recordEvent({
  objectiveId: 'concept_a',
  result: 0.75, // 75% correct
  confidence: 0.6 // User's self-reported confidence
});`;

  const renderContent = () => {
    switch (activeSection) {
      case "getting-started":
        return (
          <>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">Getting Started</h2>
            <p className="text-slate-700 mb-6">
              Welcome to the Noesis SDK documentation. This guide will help you get up and running with the Noesis Adaptive Learning SDK in your application.
            </p>
            
            <div className="mb-8">
              <h3 className="text-lg font-medium text-slate-900 mb-3">Installation</h3>
              <CodeBlock code={installCode} language="bash" />
            </div>
            
            <div className="mb-8">
              <h3 className="text-lg font-medium text-slate-900 mb-3">Basic Usage</h3>
              <p className="text-slate-700 mb-4">
                Import and initialize the SDK in your application:
              </p>
              <CodeBlock code={basicUsageCode} language="javascript" />
            </div>
            
            <div className="mb-8">
              <h3 className="text-lg font-medium text-slate-900 mb-3">Setting Up Attention Tracking</h3>
              <p className="text-slate-700 mb-4">
                To start tracking user attention using webcam-based detection:
              </p>
              <CodeBlock code={attentionTrackingCode} language="javascript" />
            </div>
          </>
        );
        
      case "installation":
        return (
          <>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">Installation</h2>
            <p className="text-slate-700 mb-6">
              Noesis SDK can be installed using npm or yarn. It's compatible with modern JavaScript and TypeScript projects.
            </p>
            
            <div className="mb-8">
              <h3 className="text-lg font-medium text-slate-900 mb-3">Prerequisites</h3>
              <p className="text-slate-700 mb-4">
                Before installing, make sure you have:
              </p>
              <ul className="list-disc pl-5 text-slate-700 space-y-1 mb-4">
                <li>Node.js 14.x or higher</li>
                <li>npm 6.x or higher</li>
                <li>Modern browser with webcam access (for attention tracking features)</li>
              </ul>
            </div>
            
            <div className="mb-8">
              <h3 className="text-lg font-medium text-slate-900 mb-3">Installation Steps</h3>
              <CodeBlock code={installCode} language="bash" />
              <p className="text-slate-700 mt-4">
                For TypeScript projects, type definitions are included in the package.
              </p>
            </div>
            
            <div className="mb-8">
              <h3 className="text-lg font-medium text-slate-900 mb-3">CDN Usage</h3>
              <p className="text-slate-700 mb-4">
                You can also include Noesis SDK directly from a CDN:
              </p>
              <CodeBlock 
                code={`<script src="https://cdn.jsdelivr.net/npm/@noesis-edu/core@latest/dist/noesis.min.js"></script>`} 
                language="html" 
              />
            </div>
          </>
        );
        
      case "basic-usage":
        return (
          <>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">Basic Usage</h2>
            <p className="text-slate-700 mb-6">
              This guide covers the core concepts of using the Noesis SDK in your application.
            </p>
            
            <div className="mb-8">
              <h3 className="text-lg font-medium text-slate-900 mb-3">Initializing the SDK</h3>
              <p className="text-slate-700 mb-4">
                Start by importing and initializing the SDK with your desired configuration:
              </p>
              <CodeBlock code={basicUsageCode} language="javascript" />
            </div>
            
            <div className="mb-8">
              <h3 className="text-lg font-medium text-slate-900 mb-3">Core Modules</h3>
              <p className="text-slate-700 mb-4">
                Noesis SDK consists of several modules that can be enabled as needed:
              </p>
              <ul className="list-disc pl-5 text-slate-700 space-y-1 mb-4">
                <li><code className="text-sm bg-slate-100 rounded px-1">attention</code> - For tracking user attention</li>
                <li><code className="text-sm bg-slate-100 rounded px-1">mastery</code> - For tracking learning progress</li>
                <li><code className="text-sm bg-slate-100 rounded px-1">orchestration</code> - For LLM-powered content adaptation</li>
              </ul>
            </div>
            
            <div className="mb-8">
              <h3 className="text-lg font-medium text-slate-900 mb-3">Configuration Options</h3>
              <p className="text-slate-700 mb-4">
                The SDK accepts the following configuration options:
              </p>
              <ul className="list-disc pl-5 text-slate-700 space-y-1 mb-4">
                <li><code className="text-sm bg-slate-100 rounded px-1">apiKey</code> - Optional for core features, required for LLM orchestration</li>
                <li><code className="text-sm bg-slate-100 rounded px-1">modules</code> - Array of modules to enable</li>
                <li><code className="text-sm bg-slate-100 rounded px-1">debug</code> - Enable detailed console logging</li>
                <li><code className="text-sm bg-slate-100 rounded px-1">attentionOptions</code> - Configuration for attention tracking</li>
                <li><code className="text-sm bg-slate-100 rounded px-1">masteryOptions</code> - Configuration for mastery tracking</li>
              </ul>
            </div>
          </>
        );
        
      case "attention-tracking":
        return (
          <>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">Attention Tracking</h2>
            <p className="text-slate-700 mb-6">
              Learn how to use the attention tracking module to monitor learner engagement.
            </p>
            
            <div className="mb-8">
              <h3 className="text-lg font-medium text-slate-900 mb-3">Starting Attention Tracking</h3>
              <p className="text-slate-700 mb-4">
                To begin tracking user attention using the webcam:
              </p>
              <CodeBlock code={attentionTrackingCode} language="javascript" />
            </div>
            
            <div className="mb-8">
              <h3 className="text-lg font-medium text-slate-900 mb-3">Attention Data Structure</h3>
              <p className="text-slate-700 mb-4">
                The attention tracking module provides the following data:
              </p>
              <CodeBlock 
                code={`{
  score: 0.85,         // Overall attention score (0-1)
  focusStability: 0.7, // How stable the focus is (0-1)
  cognitiveLoad: 0.4,  // Estimated cognitive load (0-1)
  gazePoint: { x: 512, y: 384 }, // Estimated gaze coordinates
  timestamp: 1622548800000,      // Timestamp of the measurement
  status: 'tracking'   // Current tracking status
}`} 
                language="javascript" 
              />
            </div>
            
            <div className="mb-8">
              <h3 className="text-lg font-medium text-slate-900 mb-3">Stopping Tracking</h3>
              <p className="text-slate-700 mb-4">
                When you're done tracking attention:
              </p>
              <CodeBlock 
                code={`await noesis.attention.stopTracking();`} 
                language="javascript" 
              />
            </div>
          </>
        );
      
      case "mastery-learning":
        return (
          <>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">Mastery Learning</h2>
            <p className="text-slate-700 mb-6">
              The mastery module helps track learning progress using spaced repetition algorithms.
            </p>
            
            <div className="mb-8">
              <h3 className="text-lg font-medium text-slate-900 mb-3">Tracking Learning Mastery</h3>
              <p className="text-slate-700 mb-4">
                To track learning progress and mastery of concepts:
              </p>
              <CodeBlock code={masteryTrackingCode} language="javascript" />
            </div>
            
            <div className="mb-8">
              <h3 className="text-lg font-medium text-slate-900 mb-3">Mastery Data Structure</h3>
              <p className="text-slate-700 mb-4">
                The mastery module returns data in the following format:
              </p>
              <CodeBlock 
                code={`[
  {
    id: 'concept_a',
    name: 'Basic Principles',
    progress: 0.75,      // Current mastery level (0-1)
    attempts: 3,         // Number of learning attempts
    lastReviewed: 1622548800000, // Last review timestamp
    nextReviewDue: 1622635200000, // When to review next
    isReviewDue: false,  // Whether review is currently due
    status: 'in-progress' // 'not-started', 'in-progress', or 'mastered'
  },
  // More objectives...
]`} 
                language="javascript" 
              />
            </div>
            
            <div className="mb-8">
              <h3 className="text-lg font-medium text-slate-900 mb-3">Getting Review Recommendations</h3>
              <p className="text-slate-700 mb-4">
                To get a list of concepts that need review:
              </p>
              <CodeBlock 
                code={`const reviewRecommendations = noesis.mastery.getReviewRecommendations();
console.log('Concepts to review:', reviewRecommendations);`} 
                language="javascript" 
              />
            </div>
          </>
        );
                
      case "llm-integration":
        return (
          <>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">LLM Integration</h2>
            <p className="text-slate-700 mb-6">
              Learn how to use the orchestration module to get adaptive learning recommendations from LLMs.
            </p>

            <div className="mb-8">
              <h3 className="text-lg font-medium text-slate-900 mb-3">Setting Up LLM Orchestration</h3>
              <p className="text-slate-700 mb-4">
                Initialize the orchestration module with your API key:
              </p>
              <CodeBlock
                code={`const noesis = new NoesisSDK({
  apiKey: 'YOUR_API_KEY', // Required for orchestration
  modules: ['attention', 'mastery', 'orchestration']
});`}
                language="javascript"
              />
            </div>

            <div className="mb-8">
              <h3 className="text-lg font-medium text-slate-900 mb-3">Getting Adaptive Recommendations</h3>
              <p className="text-slate-700 mb-4">
                Request personalized learning recommendations based on the learner's state:
              </p>
              <CodeBlock
                code={`// Get the current learner state
const learnerState = noesis.getLearnerState();

// Request a recommendation
const response = await noesis.orchestration.getNextStep({
  learnerState,
  context: 'struggling with concept_b',
  options: {
    detail: 'high',  // 'low', 'medium', or 'high'
    format: 'text'   // 'text' or 'json'
  }
});

console.log('Suggested next step:', response.suggestion);
console.log('Explanation:', response.explanation);`}
                language="javascript"
              />
            </div>

            <div className="mb-8">
              <h3 className="text-lg font-medium text-slate-900 mb-3">Requesting Engagement Interventions</h3>
              <p className="text-slate-700 mb-4">
                When attention is low, request an engagement intervention:
              </p>
              <CodeBlock
                code={`noesis.attention.onAttentionChange(data => {
  if (data.score < 0.3) {
    // Request an engagement suggestion
    noesis.orchestration.suggestEngagement()
      .then(suggestion => {
        showEngagementPrompt(suggestion.message);
      });
  }
});`}
                language="javascript"
              />
            </div>
          </>
        );

      case "api-reference":
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

      case "examples":
        return (
          <>
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">Examples</h2>
            <p className="text-slate-700 mb-6">
              Complete examples showing how to integrate Noesis SDK in real applications.
            </p>

            <div className="mb-8">
              <h3 className="text-lg font-medium text-slate-900 mb-3">React Integration</h3>
              <p className="text-slate-700 mb-4">
                Using the SDK with React hooks:
              </p>
              <CodeBlock
                code={`import { useEffect, useState, useRef } from 'react';
import { NoesisSDK, AttentionData, MasteryData } from '@noesis-edu/core';

// Create SDK singleton
const sdk = new NoesisSDK({
  modules: ['attention', 'mastery', 'orchestration'],
  debug: process.env.NODE_ENV === 'development'
});

function LearningModule() {
  const contentRef = useRef<HTMLDivElement>(null);
  const [attention, setAttention] = useState<AttentionData | null>(null);
  const [mastery, setMastery] = useState<MasteryData>([]);

  useEffect(() => {
    // Initialize mastery tracking
    sdk.mastery.initialize({
      objectives: [
        { id: 'intro', name: 'Introduction' },
        { id: 'basics', name: 'Basic Concepts' },
        { id: 'advanced', name: 'Advanced Topics' }
      ],
      onMasteryUpdate: setMastery
    });

    // Start attention tracking
    if (contentRef.current) {
      sdk.attention.startTracking(contentRef.current, {
        trackingInterval: 500,
        onAttentionChange: setAttention
      });
    }

    return () => {
      sdk.attention.stopTracking();
    };
  }, []);

  return (
    <div ref={contentRef}>
      <h1>Learning Content</h1>
      {attention && (
        <p>Attention: {Math.round(attention.score * 100)}%</p>
      )}
      <ul>
        {mastery.map(obj => (
          <li key={obj.id}>
            {obj.name}: {Math.round(obj.progress * 100)}% mastered
          </li>
        ))}
      </ul>
    </div>
  );
}`}
                language="typescript"
              />
            </div>

            <div className="mb-8">
              <h3 className="text-lg font-medium text-slate-900 mb-3">Adaptive Content Switching</h3>
              <p className="text-slate-700 mb-4">
                Automatically adapting content based on attention and mastery:
              </p>
              <CodeBlock
                code={`async function adaptContent(sdk: NoesisSDK) {
  const learnerState = sdk.getLearnerState();

  // Check if attention is low
  if (learnerState.attention?.score < 0.3) {
    const engagement = await sdk.orchestration.suggestEngagement({
      attentionScore: learnerState.attention.score,
      context: 'reading technical documentation'
    });

    showNotification(engagement.message);
    return;
  }

  // Check for concepts due for review
  const recommendations = sdk.mastery.getReviewRecommendations();
  if (recommendations.length > 0 && recommendations[0].isReviewDue) {
    showReviewCard(recommendations[0]);
    return;
  }

  // Get next step recommendation
  const nextStep = await sdk.orchestration.getNextStep({
    learnerState,
    context: 'completed current section'
  });

  displayRecommendation(nextStep.suggestion);
}`}
                language="typescript"
              />
            </div>

            <div className="mb-8">
              <h3 className="text-lg font-medium text-slate-900 mb-3">Quiz Integration</h3>
              <p className="text-slate-700 mb-4">
                Recording quiz results for mastery tracking:
              </p>
              <CodeBlock
                code={`function handleQuizSubmit(
  sdk: NoesisSDK,
  answers: { questionId: string; correct: boolean; confidence: number }[]
) {
  // Group questions by learning objective
  const byObjective = groupBy(answers, 'questionId');

  for (const [objectiveId, responses] of Object.entries(byObjective)) {
    // Calculate average result for this objective
    const correctCount = responses.filter(r => r.correct).length;
    const result = correctCount / responses.length;

    // Calculate average confidence
    const avgConfidence = average(responses.map(r => r.confidence));

    // Record the learning event
    sdk.mastery.recordEvent({
      objectiveId,
      result,
      confidence: avgConfidence
    });
  }

  // Check progress and show appropriate feedback
  const mastery = sdk.mastery.getMasteryData();
  const masteredCount = mastery.filter(m => m.status === 'mastered').length;

  if (masteredCount === mastery.length) {
    showCompletionCelebration();
  } else {
    const nextToReview = sdk.mastery.getReviewRecommendations()[0];
    suggestNextLesson(nextToReview);
  }
}`}
                language="typescript"
              />
            </div>
          </>
        );

      default:
        return (
          <div className="p-6 text-center">
            <p className="text-slate-600">Select a section from the sidebar to view documentation.</p>
          </div>
        );
    }
  };

  return (
    <div className="flex-1 bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6">
        {renderContent()}
        
        <div className="flex justify-between mt-8 pt-4 border-t border-slate-200">
          <Button variant="ghost" className="text-primary-600 hover:text-primary-700 font-medium text-sm" asChild>
            <a href="#">← Installation</a>
          </Button>
          <Button variant="ghost" className="text-primary-600 hover:text-primary-700 font-medium text-sm" asChild>
            <a href="#">LLM Integration →</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
