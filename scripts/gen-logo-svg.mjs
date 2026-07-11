// BROWSERCODE SVG — one rect per filled pixel cell.
// Simple, matches pixel art exactly. No hole-punch trickery.
// viewBox = 330×42 (11 letters × 30px each)

const C = 6, T = 6

const L = {
  B: [[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,0,1],[1,1,1,0]],
  R: [[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,1,0],[1,0,0,0]],
  O: [[0,1,1,0],[1,0,0,1],[1,0,0,1],[1,0,0,1],[0,1,1,0]],
  W: [[1,0,0,1],[1,0,0,1],[1,0,1,1],[1,1,0,1],[0,1,1,0]],
  S: [[1,1,1,0],[1,0,0,0],[1,1,1,0],[0,0,0,1],[1,1,1,0]],
  E: [[1,1,1,0],[1,0,0,0],[1,1,1,0],[1,0,0,0],[1,1,1,0]],
  C: [[0,1,1,1],[1,0,0,0],[1,0,0,0],[1,0,0,0],[0,1,1,1]],
  D: [[1,1,1,0],[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,1,1,0]],
}

const WORD = "BROWSERCODE", N = WORD.length

function cell(x, y) {
  return `M${x+C} ${y}H${x}V${y+C}H${x+C}Z`
}

function mergeCol(runs, ox, col) {
  const C = 6
  const parts = []
  for (const [r0, r1] of runs) {
    const y1 = T + r0*C, y2 = T + (r1+1)*C
    parts.push(`M${ox + col*C + C} ${y1}H${ox + col*C}V${y2}H${ox + col*C + C}Z`)
  }
  return parts.join('')
}

function getColRuns(g, col) {
  const runs = []
  let start = -1
  for (let r = 0; r < 5; r++) {
    if (g[r][col]) {
      if (start === -1) start = r
    } else {
      if (start !== -1) { runs.push([start, r-1]); start = -1 }
    }
  }
  if (start !== -1) runs.push([start, 4])
  return runs
}

for (let i = 0; i < N; i++) {
  const g = L[WORD[i]], ox = i * 30
  // Find rightmost used column in this letter
  let rightmost = -1
  for (let c = 3; c >= 0; c--)
    for (let r = 0; r < 5; r++)
      if (g[r][c]) { rightmost = c; break }
  if (rightmost < 0) { rightmost = 3; continue }

  const mc = i < Math.ceil(N/2) ? '--icon-base' : '--icon-strong-base'

  for (let c = 0; c < 4; c++) {
    const runs = getColRuns(g, c)
    if (runs.length === 0) continue
    const d = mergeCol(runs, ox, c)
    if (c === rightmost) {
      console.log(`      <path d="${d}" fill="var(--icon-weak-base)" />`)
    } else {
      console.log(`      <path d="${d}" fill="var(${mc})" />`)
    }
  }
}
console.log(`\n<!-- viewBox="0 0 ${N * 30} 42" -->`)
