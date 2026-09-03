import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');

console.log('🔍 [VerifyBuild] Kod bütünlüğü, sözdizimi ve import yolları denetleniyor...');

const targetDirs = ['controllers', 'services', 'routes', 'lib', 'utils'];
let totalChecked = 0;
let syntaxErrors = [];
let missingImports = [];

let allFiles = [path.join(backendRoot, 'server.js')];

// 1. Gather all JS files
for (const dir of targetDirs) {
    const fullDir = path.join(backendRoot, dir);
    if (!fs.existsSync(fullDir)) continue;

    const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.js'));
    for (const file of files) {
        allFiles.push(path.join(fullDir, file));
    }
}

// 2. Syntax Check (node --check)
for (const filePath of allFiles) {
    try {
        execSync(`node --check "${filePath}"`, { stdio: 'pipe' });
        totalChecked++;
    } catch (err) {
        syntaxErrors.push({ file: path.relative(backendRoot, filePath), error: err.message });
    }
}

// 3. Static Relative Import Resolution Check
const importRegex = /(?:import\s+(?:[^'"()]+\s+from\s+)?|import\s*\(\s*)['"](\.[^'"]+)['"]/g;

for (const filePath of allFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    let match;
    while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        const dir = path.dirname(filePath);
        let target = path.resolve(dir, importPath);
        if (!target.endsWith('.js') && !target.endsWith('.json') && !target.endsWith('.cjs')) {
            if (fs.existsSync(target + '.js')) target += '.js';
            else if (fs.existsSync(path.join(target, 'index.js'))) target = path.join(target, 'index.js');
        }
        if (!fs.existsSync(target)) {
            missingImports.push({
                from: path.relative(backendRoot, filePath),
                target: importPath
            });
        }
    }
}

// 4. Report Results
let hasError = false;

if (syntaxErrors.length > 0) {
    hasError = true;
    console.error(`\n❌ [VerifyBuild] ${syntaxErrors.length} dosyada sözdizimi hatası bulundu:`);
    for (const e of syntaxErrors) {
        console.error(`   - ${e.file}: ${e.error}`);
    }
}

if (missingImports.length > 0) {
    hasError = true;
    console.error(`\n❌ [VerifyBuild] ${missingImports.length} eksik import tespit edildi:`);
    for (const m of missingImports) {
        console.error(`   - ${m.from} -> "${m.target}" bulunamadı!`);
    }
}

if (hasError) {
    console.error('\n🚫 [VerifyBuild] DOĞRULAMA BAŞARISIZ! Deploy işlemi durduruluyor.\n');
    process.exit(1);
}

console.log(`✅ [VerifyBuild] Başarılı! Toplam ${totalChecked} dosya ve tüm import yolları hatasız doğrulandı.`);
process.exit(0);
