import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { buildReport } from '../src/analyzer.js';
import { createStandaloneReport } from '../src/reportView.js';

const defaultStaff = '/mnt/d/document/WXWork/1688850339012668/Cache/File/2026-05/自有员工报工明细.xlsx';
const defaultExternal = '/mnt/d/document/WXWork/1688850339012668/Cache/File/2026-05/外包报工明细.xlsx';

const [, , staffArg = defaultStaff, externalArg = defaultExternal, outputArg = 'reports/项目预算人员月度报工天数.html'] = process.argv;

const staffRows = readWorkbookRows(staffArg);
const externalRows = readWorkbookRows(externalArg);
const report = buildReport({ staffRows, externalRows });
const html = createStandaloneReport(report);
const outputPath = path.resolve(outputArg);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html, 'utf8');

console.log(`Wrote ${outputPath}`);
console.log(`Rows: ${report.summary.rows}`);
console.log(`Days: ${report.summary.totalDays}`);
console.log(`Projects: ${report.summary.projectCount}`);

function readWorkbookRows(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const workbook = XLSX.readFile(filePath, { cellDates: true, dense: true });
  const sheetName = workbook.SheetNames.find((name) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', blankrows: false });
    return rows.length > 1;
  });
  if (!sheetName) throw new Error(`${filePath} has no readable worksheet`);
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: '',
    blankrows: false,
    raw: false
  });
}
