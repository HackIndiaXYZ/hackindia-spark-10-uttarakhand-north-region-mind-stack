const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..'); let count = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.venv', '__pycache__'].includes(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(file); continue; }
    if (/\.(js|mjs|cjs)$/.test(file)) {
      const source = fs.readFileSync(file, 'utf8');
      if (file.includes(path.join('frontend', 'Genie final')) || file.endsWith('.cjs')) new vm.Script(source, { filename: file });
      else new vm.SourceTextModule(source, { identifier: file });
      count++;
      for (const match of source.matchAll(/(?:from\s+|import\s*)['"](\.[^'"]+)['"]/g)) {
        if (!fs.existsSync(path.resolve(path.dirname(file), match[1]))) throw new Error('Missing import: ' + file + ': ' + match[1]);
      }
    }
    if (file.endsWith('.html')) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)) {
        if (/^(?:https?:|mailto:|data:)/.test(match[1])) continue;
        if (!fs.existsSync(path.resolve(path.dirname(file), match[1]))) throw new Error('Missing frontend asset: ' + match[1]);
      }
    }
  }
}
walk(root); console.log(count + ' JavaScript files passed syntax and local import checks; frontend assets resolved.');
