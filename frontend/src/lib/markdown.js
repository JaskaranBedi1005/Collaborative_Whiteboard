// Turns the Markdown that Gemini replies with ("## Heading", "**bold**",
// "* item") into simple blocks, so the summary panel can show real headings,
// lists and bold text instead of the raw symbols.
//
// Deliberately small: only what an AI summary uses. Nothing is ever inserted
// as HTML, and links are shown as plain text (the reply is not trusted).

const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const BULLET = /^(\s*)[-*•+]\s+(.*)$/;
const NUMBERED = /^(\s*)(\d{1,3})[.)]\s+(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
// A line that is only bold text, e.g. "**Main idea:**", reads as a heading.
const BOLD_LINE = /^\s*(\*\*|__)(.+?)\1\s*:?\s*$/;

function cleanLine(line) {
  return line
    .replace(/^\s*>\s?/, '') // quotes
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'); // links -> their text
}

// -> [{ type: 'heading', text } | { type: 'paragraph', text }
//     | { type: 'list', ordered, items: [{ text, indent }] }]
export function parseMarkdown(source) {
  const blocks = [];
  let paragraph = null;
  let list = null;

  const endParagraph = () => {
    if (paragraph) blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
    paragraph = null;
  };
  const endList = () => {
    if (list) blocks.push(list);
    list = null;
  };

  for (const raw of String(source ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = cleanLine(raw);

    if (!line.trim() || RULE.test(line)) {
      endParagraph();
      endList();
      continue;
    }

    const heading = HEADING.exec(line) ?? BOLD_LINE.exec(line);
    if (heading) {
      endParagraph();
      endList();
      const text = heading[2].replace(/:$/, '').trim();
      if (text) blocks.push({ type: 'heading', text });
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      endParagraph();
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) {
        endList();
        list = { type: 'list', ordered, items: [] };
      }
      const indent = (bullet ?? numbered)[1].length >= 2 ? 1 : 0;
      list.items.push({ text: (bullet ? bullet[2] : numbered[3]).trim(), indent });
      continue;
    }

    // A plain line right after a list item continues that item.
    if (list && /^\s{2,}/.test(raw)) {
      list.items.at(-1).text += ` ${line.trim()}`;
      continue;
    }

    endList();
    paragraph = paragraph ?? [];
    paragraph.push(line.trim());
  }

  endParagraph();
  endList();
  return blocks;
}

// Inline marks -> [{ text, bold?, italic?, code? }]
const INLINE =
  /(\*\*|__)(.+?)\1|`([^`]+)`|(?<![\w*])\*(?![\s*])(.+?)(?<![\s*])\*(?![\w*])|(?<![\w_])_(?![\s_])(.+?)(?<![\s_])_(?![\w_])/g;

// Stray marks left over after matching (e.g. an unclosed "**") are dropped.
const stray = (text) => text.replace(/\*\*|__/g, '').replace(/(^|\s)\*(?=\s|$)/g, '$1');

export function parseInline(text) {
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) parts.push({ text: stray(text.slice(last, match.index)) });
    if (match[2] !== undefined) parts.push({ text: stray(match[2]), bold: true });
    else if (match[3] !== undefined) parts.push({ text: match[3], code: true });
    else parts.push({ text: stray(match[4] ?? match[5]), italic: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: stray(text.slice(last)) });
  return parts.filter((p) => p.text);
}

// Clean plain text, for the Copy button.
export function toPlainText(source) {
  const plain = (text) => parseInline(text).map((p) => p.text).join('');
  return parseMarkdown(source)
    .map((block) => {
      if (block.type === 'list') {
        return block.items
          .map((item, i) => `${'  '.repeat(item.indent)}${block.ordered ? `${i + 1}.` : '•'} ${plain(item.text)}`)
          .join('\n');
      }
      return plain(block.text);
    })
    .join('\n\n');
}
