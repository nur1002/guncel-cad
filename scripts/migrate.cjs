// BilCAD dosya yapisi migrasyon scripti
const fs = require('fs');
const pn = require('path');
const pp = require('path').posix;

const SRC = pn.join(__dirname, '..', 'src');

const MOVES = {
  'components/LeftToolRail': 'panels/left/LeftToolRail',
  'components/PagePanel': 'panels/left/PagePanel',
  'components/ElementListPanel': 'panels/left/ElementListPanel',
  'components/RightPanel': 'panels/right/RightPanel',
  'components/CategoryTabs': 'panels/right/CategoryTabs',
  'components/TopNav': 'panels/top/TopNav',
  'components/Toolbar': 'panels/top/Toolbar',
  'components/BottomBar': 'panels/bottom/BottomBar',
  'components/CanvasEditor': 'canvas/CanvasEditor',
  'components/ContextMenu': 'canvas/ContextMenu',
  'components/View3D': 'view3d/View3D',
  'components/Modals': 'modals/Modals',
  'components/Toasts': 'ui/Toasts',
  'engine/store': 'engine/core/store',
  'engine/mutations': 'engine/core/mutations',
  'engine/qaChecks': 'engine/core/qaChecks',
  'engine/render2d': 'engine/drawing/render2d',
  'engine/geometry': 'engine/drawing/geometry',
  'engine/hitTest': 'engine/drawing/hitTest',
  'engine/snapping': 'engine/drawing/snapping',
  'engine/importDispatch': 'engine/io/importDispatch',
  'engine/dwgImport': 'engine/io/dwgImport',
  'engine/vectorImport': 'engine/io/dxfImport',
  'engine/fileImport': 'engine/io/fileImport',
  'engine/pdfExport': 'engine/io/pdfExport',
  'engine/cityGmlExport': 'engine/io/cityGmlExport',
};

function findExt(base) {
  for (const e of ['.tsx', '.ts']) {
    if (fs.existsSync(pn.join(SRC, base + e))) return e;
  }
  return null;
}

function fixImports(content, oldBase, newBase) {
  const oldDir = pp.dirname(oldBase);
  const newDir = pp.dirname(newBase);
  return content.replace(
    /(from\s+["']|import\s*\(\s*["'])(\.\.?\/[^"']+)(["']\s*\)?)/g,
    (full, prefix, imp, suffix) => {
      const resolved = pp.normalize(pp.join(oldDir, imp));
      const newTarget = MOVES[resolved];
      const targetPath = newTarget || resolved;
      let rel = pp.relative(newDir, targetPath);
      if (!rel.startsWith('.')) rel = './' + rel;
      return prefix + rel + suffix;
    }
  );
}

let moved = 0;
for (const [oldBase, newBase] of Object.entries(MOVES)) {
  const ext = findExt(oldBase);
  if (!ext) { console.error('NOT FOUND:', oldBase); continue; }
  const oldPath = pn.join(SRC, oldBase + ext);
  const newPath = pn.join(SRC, newBase + ext);
  let content = fs.readFileSync(oldPath, 'utf8');
  content = fixImports(content, oldBase + ext, newBase + ext);
  fs.mkdirSync(pn.dirname(newPath), { recursive: true });
  fs.writeFileSync(newPath, content, 'utf8');
  moved++;
  console.log('MOVED:', oldBase + ext, '->', newBase + ext);
}

for (const sf of ['App.tsx', 'main.tsx']) {
  const fp = pn.join(SRC, sf);
  if (!fs.existsSync(fp)) continue;
  let c = fs.readFileSync(fp, 'utf8');
  c = fixImports(c, sf, sf);
  fs.writeFileSync(fp, c, 'utf8');
  console.log('UPDATED:', sf);
}

let deleted = 0;
for (const [oldBase] of Object.entries(MOVES)) {
  const ext = findExt(oldBase);
  if (!ext) continue;
  const p = pn.join(SRC, oldBase + ext);
  if (fs.existsSync(p)) { fs.unlinkSync(p); deleted++; }
}

function rmEmpty(d) {
  if (!fs.existsSync(d)) return;
  try { if (fs.readdirSync(d).length === 0) { fs.rmdirSync(d); console.log('REMOVED:', d); } } catch(e) {}
}
rmEmpty(pn.join(SRC, 'components'));

console.log('\nDone! Moved:', moved, 'Deleted:', deleted);
