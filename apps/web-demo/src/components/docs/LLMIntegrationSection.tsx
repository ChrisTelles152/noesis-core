import CodeBlock from '@/components/CodeBlock';

export default function LLMIntegrationSection() {
  return (
    <>
      <h2 className="text-2xl font-semibold text-slate-900 mb-4">LLM Integration</h2>
      <p className="text-slate-700 mb-6">
        Learn how to use the orchestration module to get adaptive learning recommendations from
        LLMs.
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
        <h3 className="text-lg font-medium text-slate-900 mb-3">
          Getting Adaptive Recommendations
        </h3>
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
        <h3 className="text-lg font-medium text-slate-900 mb-3">
          Requesting Engagement Interventions
        </h3>
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
}
