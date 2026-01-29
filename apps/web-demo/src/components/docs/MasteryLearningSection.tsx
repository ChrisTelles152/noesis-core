import CodeBlock from "@/components/CodeBlock";
import { masteryTrackingCode } from "./codeSnippets";

export default function MasteryLearningSection() {
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
}
