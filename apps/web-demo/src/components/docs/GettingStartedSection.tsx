import CodeBlock from "@/components/CodeBlock";
import { installCode, basicUsageCode, attentionTrackingCode } from "./codeSnippets";

export default function GettingStartedSection() {
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
}
