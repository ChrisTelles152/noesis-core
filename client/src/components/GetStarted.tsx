import { Button } from "@/components/ui/button";
import CodeBlock from "@/components/CodeBlock";

export default function GetStarted() {
  const installCode = "npm install @noesis/core";
  
  const configCode = `import { NoesisSDK } from '@noesis/core';

const noesis = new NoesisSDK({
  apiKey: 'YOUR_API_KEY', // Optional for core
  modules: ['attention', 'mastery'],
  debug: true
});`;

  const trackingCode = `// Start attention tracking
await noesis.attention.startTracking({
  element: '#learning-content',
  webcam: true
});

// Set up learning objectives
noesis.mastery.initialize({
  objectives: [
    { id: 'concept_1', name: 'Basic Concepts' },
    { id: 'concept_2', name: 'Advanced Topics' }
  ]
});`;

  const adaptiveCode = `// Listen for attention changes
noesis.attention.onAttentionChange(data => {
  if (data.score < 0.3) {
    // Low attention detected
    showEngagementPrompt();
  }
});

// Get next content recommendation
const recommendation = await noesis.orchestration.getNextStep({
  learnerState: noesis.getLearnerState()
});`;

  return (
    <section id="getstarted" className="py-20 bg-white border-t border-slate-200">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900">Get Started with Noesis SDK</h2>
            <p className="mt-4 text-lg text-slate-600">
              Follow these steps to integrate adaptive learning into your application
            </p>
          </div>
          
          <div className="space-y-12">
            {/* Step 1 */}
            <div className="flex flex-col md:flex-row gap-8">
              <div className="md:w-64 shrink-0 flex items-start">
                <div className="bg-primary-100 rounded-full w-12 h-12 flex items-center justify-center text-primary-600 font-bold text-xl">
                  1
                </div>
                <h3 className="ml-4 text-xl font-semibold text-slate-900">Installation</h3>
              </div>
              <div className="flex-1">
                <p className="text-slate-700 mb-4">
                  Install the Noesis SDK from npm or yarn.
                </p>
                <CodeBlock code={installCode} language="bash" />
              </div>
            </div>
            
            {/* Step 2 */}
            <div className="flex flex-col md:flex-row gap-8">
              <div className="md:w-64 shrink-0 flex items-start">
                <div className="bg-primary-100 rounded-full w-12 h-12 flex items-center justify-center text-primary-600 font-bold text-xl">
                  2
                </div>
                <h3 className="ml-4 text-xl font-semibold text-slate-900">Configuration</h3>
              </div>
              <div className="flex-1">
                <p className="text-slate-700 mb-4">
                  Initialize the SDK with your desired modules and settings.
                </p>
                <CodeBlock code={configCode} language="javascript" />
              </div>
            </div>
            
            {/* Step 3 */}
            <div className="flex flex-col md:flex-row gap-8">
              <div className="md:w-64 shrink-0 flex items-start">
                <div className="bg-primary-100 rounded-full w-12 h-12 flex items-center justify-center text-primary-600 font-bold text-xl">
                  3
                </div>
                <h3 className="ml-4 text-xl font-semibold text-slate-900">Setup Tracking</h3>
              </div>
              <div className="flex-1">
                <p className="text-slate-700 mb-4">
                  Start tracking attention and configure learning objectives.
                </p>
                <CodeBlock code={trackingCode} language="javascript" />
              </div>
            </div>
            
            {/* Step 4 */}
            <div className="flex flex-col md:flex-row gap-8">
              <div className="md:w-64 shrink-0 flex items-start">
                <div className="bg-primary-100 rounded-full w-12 h-12 flex items-center justify-center text-primary-600 font-bold text-xl">
                  4
                </div>
                <h3 className="ml-4 text-xl font-semibold text-slate-900">Adaptive Learning</h3>
              </div>
              <div className="flex-1">
                <p className="text-slate-700 mb-4">
                  Use the SDK to adapt content based on attention and mastery.
                </p>
                <CodeBlock code={adaptiveCode} language="javascript" />
              </div>
            </div>
          </div>
          
          <div className="mt-16 text-center">
            <Button variant="ghost" className="font-medium" asChild>
              <a 
                href="https://github.com/noesis-sdk" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center"
              >
                <i className="fab fa-github text-lg mr-2"></i>
                View full documentation on GitHub
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
