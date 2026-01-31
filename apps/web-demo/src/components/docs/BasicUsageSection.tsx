import CodeBlock from '@/components/CodeBlock';
import { basicUsageCode } from './codeSnippets';

export default function BasicUsageSection() {
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
          <li>
            <code className="text-sm bg-slate-100 rounded px-1">attention</code> - For tracking user
            attention
          </li>
          <li>
            <code className="text-sm bg-slate-100 rounded px-1">mastery</code> - For tracking
            learning progress
          </li>
          <li>
            <code className="text-sm bg-slate-100 rounded px-1">orchestration</code> - For
            LLM-powered content adaptation
          </li>
        </ul>
      </div>

      <div className="mb-8">
        <h3 className="text-lg font-medium text-slate-900 mb-3">Configuration Options</h3>
        <p className="text-slate-700 mb-4">The SDK accepts the following configuration options:</p>
        <ul className="list-disc pl-5 text-slate-700 space-y-1 mb-4">
          <li>
            <code className="text-sm bg-slate-100 rounded px-1">apiKey</code> - Optional for core
            features, required for LLM orchestration
          </li>
          <li>
            <code className="text-sm bg-slate-100 rounded px-1">modules</code> - Array of modules to
            enable
          </li>
          <li>
            <code className="text-sm bg-slate-100 rounded px-1">debug</code> - Enable detailed
            console logging
          </li>
          <li>
            <code className="text-sm bg-slate-100 rounded px-1">attentionOptions</code> -
            Configuration for attention tracking
          </li>
          <li>
            <code className="text-sm bg-slate-100 rounded px-1">masteryOptions</code> -
            Configuration for mastery tracking
          </li>
        </ul>
      </div>
    </>
  );
}
