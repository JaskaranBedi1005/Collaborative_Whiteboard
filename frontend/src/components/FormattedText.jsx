import { parseInline, parseMarkdown } from '../lib/markdown.js';

function Inline({ text }) {
  return parseInline(text).map((part, i) => {
    if (part.bold) return <strong key={i}>{part.text}</strong>;
    if (part.italic) return <em key={i}>{part.text}</em>;
    if (part.code) return <code key={i}>{part.text}</code>;
    return <span key={i}>{part.text}</span>;
  });
}

// Shows an AI reply with real headings, lists and bold text (no # or * symbols).
export default function FormattedText({ text }) {
  const blocks = parseMarkdown(text);

  return (
    <div className="formatted">
      {blocks.map((block, i) => {
        if (block.type === 'heading') {
          return (
            <h3 key={i} className="formatted-heading">
              <Inline text={block.text} />
            </h3>
          );
        }
        if (block.type === 'list') {
          const List = block.ordered ? 'ol' : 'ul';
          return (
            <List key={i} className="formatted-list">
              {block.items.map((item, j) => (
                <li key={j} className={item.indent ? 'is-nested' : undefined}>
                  <Inline text={item.text} />
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={i}>
            <Inline text={block.text} />
          </p>
        );
      })}
    </div>
  );
}
