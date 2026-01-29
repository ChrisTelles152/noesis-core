import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";

interface CodeBlockProps {
  code: string;
  language: string;
  filename?: string;
}

/**
 * Token types for syntax highlighting
 */
type TokenType = 'keyword' | 'string' | 'comment' | 'function' | 'property' | 'plain';

interface Token {
  type: TokenType;
  text: string;
}

/**
 * Tokenize code for safe rendering without dangerouslySetInnerHTML
 *
 * SECURITY: This approach avoids XSS by never using innerHTML.
 * All text content is rendered as React text nodes, which are
 * automatically escaped by React.
 */
function tokenizeCode(code: string, language: string): Token[] {
  const tokens: Token[] = [];

  // Simple tokenizer - splits code into highlighted segments
  // For production, consider using a proper lexer like Prism.js or highlight.js
  switch (language) {
    case "javascript":
    case "typescript": {
      // Pattern to match tokens in order of precedence
      const patterns: Array<{ type: TokenType; regex: RegExp }> = [
        { type: 'comment', regex: /^\/\/.*/ },
        { type: 'string', regex: /^(['"`])(?:(?!\1)[^\\]|\\.)*\1/ },
        { type: 'keyword', regex: /^(?:import|from|const|let|var|await|async|function|return|if|else|try|catch|new|true|false|export|default|class|extends|interface|type)\b/ },
        { type: 'function', regex: /^[a-zA-Z_]\w*(?=\s*\()/ },
        { type: 'property', regex: /^\.[a-zA-Z_]\w*/ },
        { type: 'plain', regex: /^[^\s]+/ },
        { type: 'plain', regex: /^\s+/ },
      ];

      let remaining = code;
      while (remaining.length > 0) {
        let matched = false;
        for (const { type, regex } of patterns) {
          const match = remaining.match(regex);
          if (match) {
            tokens.push({ type, text: match[0] });
            remaining = remaining.slice(match[0].length);
            matched = true;
            break;
          }
        }
        if (!matched) {
          // Fallback: consume one character
          tokens.push({ type: 'plain', text: remaining[0] });
          remaining = remaining.slice(1);
        }
      }
      break;
    }

    case "bash": {
      const patterns: Array<{ type: TokenType; regex: RegExp }> = [
        { type: 'comment', regex: /^#.*/ },
        { type: 'keyword', regex: /^(?:npm|yarn|git|cd|mkdir|rm|cp|mv|cat|echo|export)\b/ },
        { type: 'function', regex: /^(?:install|add|init|run|build|test|start)\b/ },
        { type: 'string', regex: /^@[\w\/-]+/ },
        { type: 'plain', regex: /^[^\s]+/ },
        { type: 'plain', regex: /^\s+/ },
      ];

      let remaining = code;
      while (remaining.length > 0) {
        let matched = false;
        for (const { type, regex } of patterns) {
          const match = remaining.match(regex);
          if (match) {
            tokens.push({ type, text: match[0] });
            remaining = remaining.slice(match[0].length);
            matched = true;
            break;
          }
        }
        if (!matched) {
          tokens.push({ type: 'plain', text: remaining[0] });
          remaining = remaining.slice(1);
        }
      }
      break;
    }

    default:
      // No highlighting for unknown languages
      tokens.push({ type: 'plain', text: code });
  }

  return tokens;
}

/**
 * Get CSS class for token type
 */
function getTokenClass(type: TokenType): string {
  switch (type) {
    case 'keyword': return 'text-purple-400';
    case 'string': return 'text-green-400';
    case 'comment': return 'text-slate-500 italic';
    case 'function': return 'text-blue-400';
    case 'property': return 'text-cyan-400';
    default: return '';
  }
}

export default function CodeBlock({ code, language, filename }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Tokenize code for safe rendering (memoized for performance)
  const tokens = useMemo(() => tokenizeCode(code, language), [code, language]);

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
          <code>
            {tokens.map((token, index) => (
              <span key={index} className={getTokenClass(token.type)}>
                {token.text}
              </span>
            ))}
          </code>
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
