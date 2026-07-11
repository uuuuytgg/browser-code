// Generate BROWSERCODE terminal block art in the OPENCODE style.
// 3 terminal rows, 4 cols per letter. Shadow = rightmost column.

const G = {
  B: [[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,0,1],[1,1,1,0],[0,0,0,0]],
  R: [[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,1,0],[1,0,0,0],[0,0,0,0]],
  O: [[0,1,1,0],[1,0,0,1],[1,0,0,1],[1,0,0,1],[0,1,1,0],[0,0,0,0]],
  W: [[1,0,0,1],[1,0,0,1],[1,0,1,1],[1,1,0,1],[0,1,1,0],[0,0,0,0]],
  S: [[1,1,1,0],[1,0,0,0],[1,1,1,0],[0,0,0,1],[1,1,1,0],[0,0,0,0]],
  E: [[1,1,1,0],[1,0,0,0],[1,1,1,0],[1,0,0,0],[1,1,1,0],[0,0,0,0]],
  C: [[0,1,1,1],[1,0,0,0],[1,0,0,0],[1,0,0,0],[0,1,1,1],[0,0,0,0]],
  D: [[1,1,1,0],[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,1,1,0],[0,0,0,0]],
}

function rmost(g) {
  for (let c = 3; c >= 0; c--)
    for (let r = 0; r < 6; r++)
      if (g[r][c]) return c
  return 0
}

function cell(g, col, pxRow) {
  return g[pxRow][col]
}

function half(g, c, pr0, pr1, sh) {
  const t = cell(g, c, pr0), b = cell(g, c, pr1)
  if (sh) {
    if (t && b) return '_'
    if (t && !b) return '^'
    if (!t && b) return ','
    return '~'
  }
  if (t && b) return '█'
  if (t && !b) return '▀'
  if (!t && b) return '▄'
  return ' '
}

function sing(g, c, pr, sh) {
  const v = cell(g, c, pr)
  return sh ? (v ? '_' : '~') : (v ? '█' : ' ')
}

function letter3(g) {
  const rc = rmost(g)
  const r = []
  for (let tr = 0; tr < 3; tr++) {
    const p0 = tr * 2, p1 = tr * 2 + 1
    let line = ''
    for (let c = 0; c < 4; c++) {
      line += tr < 2 ? half(g, c, p0, p1, c === rc) : sing(g, c, p0, c === rc)
    }
    r.push(line)
  }
  return r
}

function join(w) {
  const rows = ['', '', '']
  for (const ch of w) {
    const lr = letter3(G[ch])
    for (let i = 0; i < 3; i++) {
      if (rows[i]) rows[i] += ' '
      rows[i] += lr[i]
    }
  }
  return rows
}

console.log('left (all 11):')
for (const l of join("BROWSERCODE")) console.log(`  "${l}"`)
console.log('\nleft (BROWSER):')
for (const l of join("BROWSER")) console.log(`  "${l}"`)
console.log('\nright (CODE):')
for (const l of join("CODE")) console.log(`  "${l}"`)
