// css-tree bun-compile json patch
//
// css-tree@3.x loads its CSS data files via createRequire(import.meta.url) +
// require('...json'):
//   lib/data-patch.js  -> require('../data/patch.json')
//   lib/data.js        -> require('mdn-data/css/at-rules.json') + 2 more
//   lib/version.js     -> require('../package.json')
//
// bun --compile cannot statically analyze these createRequire() json loads, so
// the json files are never embedded into the compiled binary's virtual FS.
// At runtime the worker thread crashes with:
//   Cannot find module '../data/patch.json' from 'B:\~BUN\root\chunk-*.js'
// which kills the TUI worker and leaves the terminal blank.
//
// This script rewrites those three files to use static `import ... with {type:'json'}`
// so bun embeds the json at build time. Re-run after every `bun install`.

const fs = require("fs");
const path = require("path");

const PATCH_MARKER = "// [FORK-PATCH]";

function findCssTreeDirs() {
  const bunCache = path.join(__dirname, "..", "opencode", "node_modules", ".bun");
  const dirs = [];
  if (fs.existsSync(bunCache)) {
    for (const entry of fs.readdirSync(bunCache, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith("css-tree@")) {
        const lib = path.join(bunCache, entry.name, "node_modules", "css-tree", "lib");
        if (fs.existsSync(lib)) dirs.push(lib);
      }
    }
  }
  return dirs;
}

const REWRITES = {
  "data-patch.js": `// [FORK-PATCH] bun --compile can't statically bundle createRequire() of a json
// relative path into the virtual FS, so replace it with a static import that bun
// *can* embed. Upstream original:
//   import { createRequire } from 'module';
//   const require = createRequire(import.meta.url);
//   const patch = require('../data/patch.json');
import patch from '../data/patch.json' with { type: 'json' };

export default patch;
`,
  "version.js": `// [FORK-PATCH] static import so bun --compile embeds package.json version.
// Upstream: createRequire + require('../package.json').
import pkg from '../package.json' with { type: 'json' };

export const { version } = pkg;
`,
};

function patchDataJs(filePath) {
  let src = fs.readFileSync(filePath, "utf-8");
  if (src.includes(PATCH_MARKER)) return false;
  // Replace the createRequire block + the three mdn-data require lines with static imports.
  src = src.replace(
    /import \{ createRequire \} from 'module';\s*\nimport patch from '\.\/data-patch\.js';\s*\n\s*const require = createRequire\(import\.meta\.url\);\s*\nconst mdnAtrules = require\('mdn-data\/css\/at-rules\.json'\);\s*\nconst mdnProperties = require\('mdn-data\/css\/properties\.json'\);\s*\nconst mdnSyntaxes = require\('mdn-data\/css\/syntaxes\.json'\);/,
    `import patch from './data-patch.js';
// [FORK-PATCH] replace createRequire() json loads with static imports so
// bun --compile embeds them in the virtual FS (createRequire of json isn't
// statically analyzable). Upstream used require('mdn-data/css/*.json').
import mdnAtrules from 'mdn-data/css/at-rules.json' with { type: 'json' };
import mdnProperties from 'mdn-data/css/properties.json' with { type: 'json' };
import mdnSyntaxes from 'mdn-data/css/syntaxes.json' with { type: 'json' };`,
  );
  fs.writeFileSync(filePath, src, "utf-8");
  return true;
}

function patch(libDir) {
  let touched = 0;
  for (const [name, content] of Object.entries(REWRITES)) {
    const filePath = path.join(libDir, name);
    if (!fs.existsSync(filePath)) continue;
    const current = fs.readFileSync(filePath, "utf-8");
    if (current.includes(PATCH_MARKER)) {
      continue; // already patched
    }
    fs.writeFileSync(filePath, content, "utf-8");
    console.log(`  Patched: ${filePath}`);
    touched++;
  }
  const dataJs = path.join(libDir, "data.js");
  if (fs.existsSync(dataJs) && patchDataJs(dataJs)) {
    console.log(`  Patched: ${dataJs}`);
    touched++;
  }
  return touched;
}

const dirs = findCssTreeDirs();
if (dirs.length === 0) {
  console.warn("WARNING: css-tree not found. bun-compile json patch was NOT applied.");
  process.exitCode = 0; // non-fatal
} else {
  let total = 0;
  for (const libDir of dirs) total += patch(libDir);
  console.log(`css-tree bun-compile json patch applied (${total} file(s) across ${dirs.length} copy/ies).`);
}
