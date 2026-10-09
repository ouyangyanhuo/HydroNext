import type MarkdownIt from 'markdown-it';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';
import table from 'markdown-it/lib/rules_block/table.mjs';

// Match markdown-it's escaped-pipe handling, including optional outer pipes.
function cells(line: string): string[] {
  const result: string[] = [];
  let start = 0;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '|' && line[index - 1] !== '\\') {
      result.push(line.slice(start, index));
      start = index + 1;
    }
  }
  result.push(line.slice(start));
  if (result[0] === '') result.shift();
  if (result[result.length - 1] === '') result.pop();
  return result;
}

function lineText(state: StateBlock, line: number): string {
  return state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]).trim();
}

export function tableCompatibilityPlugin(md: MarkdownIt): void {
  md.block.ruler.at('table', (state, startLine, endLine, silent) => {
    if (table(state, startLine, endLine, silent)) return true;
    if (startLine + 2 >= endLine) return false;

    const header = lineText(state, startLine);
    if (!header.includes('|')) return false;
    const columnCount = cells(header).length;
    const separator = lineText(state, startLine + 1);
    if (/[^:|\- \t]/.test(separator) || /^-\s/.test(separator)) return false;
    const markers = cells(separator).map((cell) => cell.trim());
    if (!columnCount || markers.length <= columnCount || !markers.every((marker) => /^:?-+:?$/.test(marker))) return false;

    // Only discard surplus alignment markers when the data confirms the header
    // width. Never repair a missing header by silently dropping actual cells.
    const terminators = md.block.ruler.getRules('blockquote');
    let bodyRows = 0;
    for (let line = startLine + 2; line < endLine; line += 1) {
      if (state.sCount[line] < state.blkIndent || state.sCount[line] - state.blkIndent >= 4) break;
      if (terminators.some((rule) => rule(state, line, endLine, true))) break;
      const text = lineText(state, line);
      if (!text) break;
      const count = cells(text).length;
      if (count > columnCount || (bodyRows === 0 && count !== columnCount)) return false;
      bodyRows += 1;
    }
    if (!bodyRows) return false;

    const start = state.bMarks[startLine + 1] + state.tShift[startLine + 1];
    const end = state.eMarks[startLine + 1];
    const normalized = `|${markers.slice(0, columnCount).join('|')}|`;
    if (normalized.length > end - start) return false;
    const source = state.src;
    // Preserve offsets for following blocks, nested lists and token source maps.
    state.src = source.slice(0, start) + normalized.padEnd(end - start, ' ') + source.slice(end);
    try {
      return table(state, startLine, endLine, silent);
    } finally {
      state.src = source;
    }
  }, { alt: ['paragraph', 'reference'] });
}
