import CodeBlock from "@/components/CodeBlock";

export default function ExamplesSection() {
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
}
