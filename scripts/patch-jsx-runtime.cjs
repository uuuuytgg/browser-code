// @opentui/solid/jsx-runtime bridge
// The upstream package only ships jsx-runtime.d.ts (type declarations) without a JS
// implementation file. Bun resolves the runtime import at build time and needs a real
// .js file with the expected exports (jsx, jsxDEV, jsxs, Fragment).
//
// This file is copied into place by the postinstall script.

const bridge = `// Bridge: re-export solid-js/h/jsx-runtime so bun can resolve jsxDEV/Fragment/jsxs
export { Fragment, jsx, jsx as jsxDEV, jsx as jsxs } from "solid-js/h/jsx-runtime";
`;

const fs = require("fs");
const path = require("path");

// Locate @opentui/solid in the opencode fork's dependency tree
const candidates = [
  // bun module cache layout
  path.join(__dirname, "..", "opencode", "node_modules", ".bun"),
  // pnpm layout (hoisted)
  path.join(__dirname, "..", "node_modules", "@opentui", "solid"),
  // pnpm store layout
  path.join(__dirname, "..", "opencode", "node_modules", "@opentui", "solid"),
];

function findPackage() {
  // Walk the bun cache
  const bunCache = candidates[0];
  if (fs.existsSync(bunCache)) {
    const entries = fs.readdirSync(bunCache, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // Bun caches packages under @opentui+solid@<version>
      if (entry.name.startsWith("@opentui+solid@")) {
        const pkgDir = path.join(bunCache, entry.name, "node_modules", "@opentui", "solid");
        if (fs.existsSync(pkgDir)) return pkgDir;
      }
    }
  }
  // Try regular node_modules
  for (let i = 1; i < candidates.length; i++) {
    if (fs.existsSync(candidates[i])) return candidates[i];
  }
  return null;
}

function patch(pkgDir) {
  const jsxRuntimePath = path.join(pkgDir, "jsx-runtime.js");
  const pkgJsonPath = path.join(pkgDir, "package.json");

  // Write jsx-runtime.js bridge
  fs.writeFileSync(jsxRuntimePath, bridge, "utf-8");
  console.log(`  Patched: ${jsxRuntimePath}`);

  // Update package.json exports to point to .js instead of .d.ts
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
  if (pkg.exports) {
    let changed = false;
    for (const key of ["./jsx-runtime", "./jsx-dev-runtime"]) {
      if (pkg.exports[key] === "./jsx-runtime.d.ts") {
        pkg.exports[key] = "./jsx-runtime.js";
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
      console.log(`  Patched: ${pkgJsonPath}`);
    }
  }
}

const pkgDir = findPackage();
if (pkgDir) {
  patch(pkgDir);
  console.log("jsx-runtime bridge installed successfully.");
} else {
  console.warn("WARNING: @opentui/solid not found. jsx-runtime bridge was NOT installed.");
  process.exitCode = 0; // non-fatal
}
