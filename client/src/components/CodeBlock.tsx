import { useState } from "react";
import { Button } from "@/components/ui/button";

interface CodeBlockProps {
  code: string;
  language: string;
  filename?: string;
}

export default function CodeBlock({ code, language, filename }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatCode = (code: string) => {
    switch (language) {
      case "javascript":
        return code
          .replace(/\/\/(.*)/g, '<span class="syntax-highlight comment">// $1</span>')
          .replace(/import\s|from\s|const\s|let\s|var\s|await\s|async\s|function\s|return\s|if\s|else\s|try\s|catch\s|new\s|true|false/g, match => 
            `<span class="syntax-highlight keyword">${match}</span>`)
          .replace(/('.*?'|".*?"|`.*?`)/g, match => 
            `<span class="syntax-highlight string">${match}</span>`)
          .replace(/\b(\w+)\s*(?=\()/g, match => 
            `<span class="syntax-highlight function">${match}</span>`)
          .replace(/(\.[a-zA-Z_]\w*)/g, match => 
            `<span class="syntax-highlight property">${match}</span>`);
      
      case "bash":
        return code
          .replace(/(#.*)/g, '<span class="syntax-highlight comment">$1</span>')
          .replace(/npm|yarn/g, match => 
            `<span class="syntax-highlight keyword">${match}</span>`)
          .replace(/install|add/g, match => 
            `<span class="syntax-highlight function">${match}</span>`)
          .replace(/(@[\w\/-]+)/g, match => 
            `<span class="syntax-highlight variable">${match}</span>`);
      
      case "html":
        return code
          .replace(/(&lt;.*?&gt;|<.*?>)/g, match => 
            `<span class="syntax-highlight keyword">${match}</span>`)
          .replace(/".*?"/g, match => 
            `<span class="syntax-highlight string">${match}</span>`)
          .replace(/(&lt;!--.*?--&gt;|<!--.*?-->)/g, match => 
            `<span class="syntax-highlight comment">${match}</span>`);
          
      default:
        return code;
    }
  };

  // Escape the HTML in the code
  const escapedCode = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Then apply syntax highlighting
  const highlightedCode = formatCode(escapedCode);

  return (
    <div className="bg-slate-800 rounded-lg overflow-hidden">
      {filename && (
        <div className="flex items-center px-4 py-2 border-b border-slate-700">
          <div className="flex space-x-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>
          <div className="ml-4 text-slate-400 text-xs">{filename}</div>
        </div>
      )}
      <div className="relative">
        <pre className="p-4 overflow-x-auto text-sm text-slate-300 font-mono hide-scrollbar">
          <div dangerouslySetInnerHTML={{ __html: highlightedCode }} />
        </pre>
        <div className="absolute top-2 right-2">
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-8 text-slate-400 hover:text-white hover:bg-slate-700"
            onClick={copyToClipboard}
          >
            {copied ? (
              <i className="fas fa-check text-green-500 mr-1"></i>
            ) : (
              <i className="far fa-copy mr-1"></i>
            )}
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
      </div>
    </div>
  );
}
