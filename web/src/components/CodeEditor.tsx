import { Code2, FileCode2, LockKeyhole } from 'lucide-react';
import type { ReactNode } from 'react';

// Lexer visual único, independente da linguagem. Não há detecção, grammar ID ou HTML externo.
const tokens =
  /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/.*|#.*|\b(?:const|let|var|return|function|class|public|static|void|int|using|import|from|def|for|if|else|in|do|end|fn|use|module|where|package|func|range|make|val|true|false|new)\b|\b\d+(?:\.\d+)?\b)/g;
function renderLine(line: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of line.matchAll(tokens)) {
    if (match.index! > cursor) parts.push(line.slice(cursor, match.index));
    const text = match[0];
    const kind = /^("|'|`)/.test(text)
      ? 'string'
      : /^(\/\/|#)/.test(text)
        ? 'comment'
        : /^\d/.test(text)
          ? 'number'
          : 'keyword';
    parts.push(
      <span className={`token-${kind}`} key={match.index}>
        {text}
      </span>,
    );
    cursor = match.index! + text.length;
  }
  parts.push(line.slice(cursor) || (line.length ? '' : ' '));
  return parts;
}

export function CodeEditor({ content, children }: { content?: string; children?: ReactNode }) {
  return (
    <div className="code-editor">
      <div className="editor-toolbar">
        <div className="window-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <span>
          <FileCode2 size={13} /> desafio
        </span>
        <LockKeyhole size={13} aria-label="Somente leitura" />
      </div>
      {content !== undefined ? (
        <div
          className="code-scroll"
          tabIndex={0}
          aria-label="Trecho do desafio. Área de código com rolagem horizontal."
        >
          <pre>
            <code>
              {content.split('\n').map((line, index) => (
                <span className="code-line" key={index}>
                  <span className="line-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span>{renderLine(line)}</span>
                </span>
              ))}
            </code>
          </pre>
        </div>
      ) : (
        <div className="editor-ready">
          <div className="ghost-code" aria-hidden="true">
            {[54, 76, 63, 44, 69, 35, 52].map((width, i) => (
              <span key={i} style={{ width: `${width}%`, marginLeft: i % 3 ? 32 : 0 }} />
            ))}
          </div>
          <div className="ready-content">
            <span className="ready-icon">
              <Code2 size={32} strokeWidth={1.5} />
            </span>
            {children}
          </div>
        </div>
      )}
      <div className="editor-status">
        <span>
          <i /> Somente leitura
        </span>
        <span>{content ? `${content.split('\n').length} linhas · ` : ''}UTF-8</span>
      </div>
    </div>
  );
}
