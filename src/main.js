import * as XLSX from 'xlsx';
import { buildReport } from './analyzer.js';
import { saveHtmlReport } from './downloadReport.js';
import { BASE_REPORT_CSS, createReportMarkup, createStandaloneReport, wireReportInteractions } from './reportView.js';
import { getUploadFlowState } from './uploadFlow.js';
import './styles.css';

const state = {
  staffFile: null,
  externalFile: null,
  report: null
};

document.querySelector('#app').innerHTML = `
  <main class="app-shell">
    <section class="workspace">
      <header class="topbar">
        <div>
          <p class="eyebrow">智能数据部</p>
          <h1>项目预算人员月度报工天数</h1>
        </div>
        <button id="exportBtn" class="ghost" disabled>导出 HTML</button>
      </header>

      <section class="upload-panel">
        <label class="file-drop">
          <span>1. 自有员工 Excel</span>
          <strong id="staffName">选择自有员工 Excel</strong>
          <input id="staffInput" type="file" accept=".xlsx,.xls" />
        </label>
        <label class="file-drop">
          <span>2. 外包 Excel</span>
          <strong id="externalName">选择外包 Excel</strong>
          <input id="externalInput" type="file" accept=".xlsx,.xls" />
        </label>
        <button id="analyzeBtn" disabled>生成报告</button>
      </section>

      <div id="message" class="message">请上传自有员工 Excel 和外包 Excel。</div>
      <section id="report" class="report-shell"></section>
    </section>
  </main>
`;

const staffInput = document.querySelector('#staffInput');
const externalInput = document.querySelector('#externalInput');
const analyzeBtn = document.querySelector('#analyzeBtn');
const exportBtn = document.querySelector('#exportBtn');
const message = document.querySelector('#message');
const reportEl = document.querySelector('#report');
const staffName = document.querySelector('#staffName');
const externalName = document.querySelector('#externalName');

const style = document.createElement('style');
style.textContent = BASE_REPORT_CSS;
document.head.append(style);

staffInput.addEventListener('change', () => {
  state.staffFile = staffInput.files?.[0] ?? null;
  staffName.textContent = state.staffFile?.name ?? '选择自有员工 Excel';
  syncUploadState();
  if (getUploadFlowState(state).canAnalyze) analyze();
});

externalInput.addEventListener('change', () => {
  state.externalFile = externalInput.files?.[0] ?? null;
  externalName.textContent = state.externalFile?.name ?? '选择外包 Excel';
  syncUploadState();
  if (getUploadFlowState(state).canAnalyze) analyze();
});

analyzeBtn.addEventListener('click', analyze);
exportBtn.addEventListener('click', () => {
  void exportReport();
});

async function analyze() {
  if (!getUploadFlowState(state).canAnalyze) return;
  setBusy(true, '正在解析 Excel...');
  try {
    const staffRows = await readWorkbookRows(state.staffFile);
    const externalRows = await readWorkbookRows(state.externalFile);
    state.report = buildReport({ staffRows, externalRows });
    reportEl.innerHTML = createReportMarkup(state.report);
    wireReportInteractions(reportEl);
    exportBtn.disabled = false;
    message.textContent = '报工天数表已生成。';
  } catch (error) {
    console.error(error);
    state.report = null;
    exportBtn.disabled = true;
    reportEl.innerHTML = '';
    message.textContent = `解析失败：${error.message}`;
  } finally {
    setBusy(false);
  }
}

async function readWorkbookRows(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, dense: true });
  const sheetName = workbook.SheetNames.find((name) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', blankrows: false });
    return rows.length > 1;
  });
  if (!sheetName) throw new Error(`${file.name} 没有可分析的数据表`);
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: '',
    blankrows: false,
    raw: false
  });
}

async function exportReport() {
  if (!state.report) return;
  const filename = `项目预算人员月度报工天数-${new Date().toISOString().slice(0, 10)}.html`;
  exportBtn.disabled = true;
  message.textContent = '正在准备 HTML 文件...';

  try {
    const html = createStandaloneReport(state.report);
    const result = await saveHtmlReport({ html, filename });
    if (result.status === 'cancelled') {
      message.textContent = '已取消导出。';
    } else {
      message.textContent = `HTML 已开始下载：${filename}。请查看浏览器下载目录。`;
    }
  } catch (error) {
    console.error(error);
    message.textContent = `导出失败：${error.message}`;
  } finally {
    exportBtn.disabled = !state.report;
  }
}

function setBusy(isBusy, text = '') {
  const flow = getUploadFlowState(state);
  analyzeBtn.disabled = isBusy || !flow.canAnalyze;
  staffInput.disabled = isBusy;
  externalInput.disabled = isBusy;
  if (text) message.textContent = text;
}

function syncUploadState() {
  const flow = getUploadFlowState(state);
  analyzeBtn.disabled = !flow.canAnalyze;
  message.textContent = flow.message;
}
