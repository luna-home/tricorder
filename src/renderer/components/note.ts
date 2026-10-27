/**
 * Free text with Spiegelstriche, as the logbuch stores it: plain text, one line per row. A line
 * that starts with `- ` (also `* ` or `• `) is a list item, every other non-empty line a
 * paragraph. Nothing else is markup, so old entries and the CLI read the same text.
 */
export type NoteBlock = { kind: 'paragraph'; text: string } | { kind: 'list'; items: string[] }

/** A list line; a bare marker is an empty item and is dropped. */
const BULLET = /^\s*[-*•](?:\s+(.*))?$/
/** A line being typed: indent, marker, then the rest (may be empty). */
const TYPED_BULLET = /^(\s*)([-*•]) (.*)$/

export function parseNote(text: string): NoteBlock[] {
  const blocks: NoteBlock[] = []
  let list: string[] | undefined
  for (const line of text.split(/\r?\n/)) {
    const bullet = BULLET.exec(line)
    if (bullet) {
      const item = bullet[1]?.trim()
      if (!item) continue
      if (!list) blocks.push({ kind: 'list', items: (list = []) })
      list.push(item)
    } else if (line.trim()) {
      list = undefined
      blocks.push({ kind: 'paragraph', text: line.trim() })
    }
  }
  return blocks
}

/**
 * Enter inside a Spiegelstrich line: continues the list with the same indent and marker. On an
 * empty item it ends the list instead (removes the marker). `undefined` means: not a list line,
 * let Enter insert a plain line break.
 */
export function continueList(
  value: string,
  start: number,
  end: number,
): { value: string; caret: number } | undefined {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const match = TYPED_BULLET.exec(value.slice(lineStart, start))
  if (!match) return undefined
  const [, indent = '', marker = '-', rest = ''] = match
  const lineEnd = value.indexOf('\n', end)
  const after = value.slice(end, lineEnd === -1 ? value.length : lineEnd)
  if (!rest.trim() && !after.trim()) {
    return { value: value.slice(0, lineStart) + value.slice(end), caret: lineStart }
  }
  const insert = `\n${indent}${marker} `
  return { value: value.slice(0, start) + insert + value.slice(end), caret: start + insert.length }
}
