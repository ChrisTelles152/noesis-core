import CodeBlock from '@/components/CodeBlock';
import { attentionTrackingCode } from './codeSnippets';

export default function AttentionTrackingSection() {
  return (
    <>
      <h2 className="text-2xl font-semibold text-slate-900 mb-4">Attention Tracking</h2>
      <p className="text-slate-700 mb-6">
        Learn how to use the attention tracking module to monitor learner engagement.
      </p>

      <div className="mb-8">
        <h3 className="text-lg font-medium text-slate-900 mb-3">Starting Attention Tracking</h3>
        <p className="text-slate-700 mb-4">To begin tracking user attention using the webcam:</p>
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
        <p className="text-slate-700 mb-4">When you're done tracking attention:</p>
        <CodeBlock code={`await noesis.attention.stopTracking();`} language="javascript" />
      </div>
    </>
  );
}
