import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';

interface HeadingRange { start: number, end: number }
interface SampleGroup { start: number, headings: HeadingRange[], invalid: boolean }

/** Standalone markers only: fenced code, indented code and raw HTML remain ordinary Markdown. */
export function sampleIOPlugin(md: MarkdownIt): void {
  md.block.ruler.before('heading', 'sample_io_marker', (state, startLine, _endLine, silent) => {
    if (state.sCount[startLine] - state.blkIndent >= 4) return false;
    const start = state.bMarks[startLine] + state.tShift[startLine];
    if (state.src.charCodeAt(start) !== 0x40) return false;
    const text = state.src.slice(start, state.eMarks[startLine]).trim();
    if (text !== '@[SampleIO-Start]' && text !== '@[SampleIO-End]') return false;
    if (silent) return true;
    const token = state.push('sample_io_marker', '', 0);
    token.block = true;
    token.content = text;
    token.map = [startLine, startLine + 1];
    state.line = startLine + 1;
    return true;
  }, { alt: ['paragraph', 'reference', 'blockquote'] });

  // Incomplete/ambiguous groups stay visible rather than swallowing statement text.
  md.renderer.rules.sample_io_marker = (tokens, index) => `<p>${md.utils.escapeHtml(tokens[index].content)}</p>\n`;

  md.core.ruler.after('block', 'sample_io_layout', (state) => {
    if (!state.src.includes('@[SampleIO-Start]')) return;
    const { tokens } = state;
    const parents: SampleGroup[][] = [[]];
    const insertions = new Map<number, Token[]>();
    const consumed = new Set<number>();
    const wrapper = (className: string, nesting: 1 | -1): Token => {
      const token = new state.Token(nesting === 1 ? 'sample_io_open' : 'sample_io_close', 'div', nesting);
      token.block = true;
      if (className) token.attrSet('class', className);
      return token;
    };
    const open = (className: string) => wrapper(className, 1);
    const close = () => wrapper('', -1);

    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (token.nesting === -1) parents.pop();
      const groups = parents[parents.length - 1];
      const group = groups[groups.length - 1];
      if (token.type === 'sample_io_marker') {
        if (token.content === '@[SampleIO-Start]') {
          if (group) group.invalid = true;
          groups.push({ start: index, headings: [], invalid: !!group });
        } else if (group) {
          groups.pop();
          const [left, right] = group.headings;
          if (!group.invalid && group.headings.length === 2 && left.start === group.start + 1
            && left.end > left.start && right.end > right.start && left.end < right.start && right.end < index
            && tokens[left.start].tag === tokens[right.start].tag) {
            consumed.add(group.start);
            consumed.add(index);
            insertions.set(group.start, [open('hydro-sample-io'), open('hydro-sample-io__grid'), open('hydro-sample-io__column')]);
            insertions.set(left.end, [open('hydro-sample-io__body')]);
            insertions.set(right.start, [close(), close(), open('hydro-sample-io__column')]);
            insertions.set(right.end, [open('hydro-sample-io__body')]);
            insertions.set(index, [close(), close(), close(), close()]);
          }
        }
      } else if (group && token.type === 'heading_open') {
        group.headings.push({ start: index, end: -1 });
      } else if (group && token.type === 'heading_close') {
        group.headings[group.headings.length - 1].end = index + 1;
      }
      if (token.nesting === 1) parents.push([]);
    }

    if (!consumed.size) return;
    const result: Token[] = [];
    tokens.forEach((token, index) => {
      const inserted = insertions.get(index);
      if (inserted) result.push(...inserted);
      if (!consumed.has(index)) result.push(token);
    });
    let level = 0;
    for (const token of result) {
      if (token.nesting === -1) level -= 1;
      token.level = level;
      if (token.nesting === 1) level += 1;
    }
    state.tokens = result;
  });
}
