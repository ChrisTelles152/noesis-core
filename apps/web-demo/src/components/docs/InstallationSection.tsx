import CodeBlock from '@/components/CodeBlock';
import { installCode } from './codeSnippets';

export default function InstallationSection() {
  return (
    <>
      <h2 className="text-2xl font-semibold text-slate-900 mb-4">Installation</h2>
      <p className="text-slate-700 mb-6">
        Noesis SDK can be installed using npm or yarn. It's compatible with modern JavaScript and
        TypeScript projects.
      </p>

      <div className="mb-8">
        <h3 className="text-lg font-medium text-slate-900 mb-3">Prerequisites</h3>
        <p className="text-slate-700 mb-4">Before installing, make sure you have:</p>
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
        <p className="text-slate-700 mb-4">You can also include Noesis SDK directly from a CDN:</p>
        <CodeBlock
          code={`<script src="https://cdn.jsdelivr.net/npm/@noesis-edu/core@latest/dist/noesis.min.js"></script>`}
          language="html"
        />
      </div>
    </>
  );
}
