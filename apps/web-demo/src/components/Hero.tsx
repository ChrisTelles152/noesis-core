import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import CodeBlock from "@/components/CodeBlock";

export default function Hero() {
  const codeExample = `// Initialize Noesis SDK with default configuration
import { NoesisSDK } from '@noesis/core';

const noesis = new NoesisSDK({
  apiKey: 'YOUR_API_KEY',
  modules: ['attention', 'mastery', 'orchestration'],
  debug: true
});

// Start tracking learner attention
await noesis.attention.startTracking({
  element: '#learning-content',
  webcam: true,
  onAttentionChange: attentionData => {
    console.log('Attention score:', attentionData.score);
    
    // Adapt learning experience based on attention
    if (attentionData.score < 0.3) {
      noesis.orchestration.suggestEngagement();
    }
  }
});

// Track mastery of learning objectives
noesis.mastery.trackProgress({
  objectives: ['concept_a', 'concept_b', 'application'],
  threshold: 0.8,
  onMasteryUpdate: masteryData => {
    updateUI(masteryData);
  }
});

// Connect to LLM for adaptive feedback
const response = await noesis.orchestration.getNextStep({
  learnerState: noesis.getLearnerState(),
  context: 'struggling with concept_b'
});

console.log('Suggested next step:', response.suggestion);`;

  return (
    <section className="py-12 md:py-20 bg-gradient-to-b from-white to-slate-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary-600 to-secondary-500">Adaptive Learning</span> for Every Platform
          </h1>
          <p className="mt-6 text-xl text-slate-600 max-w-3xl mx-auto">
            The universal infrastructure layer for attention-aware, personalized learning experiences. Open-source SDK that makes any app smarter about how people learn.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row justify-center items-center space-y-4 sm:space-y-0 sm:space-x-4">
            <Button size="lg" asChild>
              <Link href="/#getstarted">
                <a className="w-full sm:w-auto">
                  Get Started
                  <i className="fas fa-arrow-right ml-2"></i>
                </a>
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/documentation">
                <a className="w-full sm:w-auto">View Documentation</a>
              </Link>
            </Button>
          </div>
          
          <div className="mt-12 text-sm flex items-center justify-center text-slate-600">
            <span className="mr-4">Open Source</span>
            <div className="w-px h-4 bg-slate-300"></div>
            <span className="mx-4">MIT License</span>
            <div className="w-px h-4 bg-slate-300"></div>
            <span className="ml-4">Cross-Platform</span>
          </div>
        </div>
        
        <div className="mt-16 max-w-4xl mx-auto bg-white p-4 rounded-xl shadow-md border border-slate-200">
          <CodeBlock code={codeExample} language="javascript" filename="noesis-sdk-demo.js" />
        </div>
      </div>
    </section>
  );
}
