import { formatCurrency, formatNumber, formatPercent } from './analyzer.js';

export function createReportMarkup(report) {
  const { monthlyRows = [], monthColumns = [], periods = {}, personProjectRows = [], summary = {} } = report;
  return `
    <section class="report-head">
      <div>
        <p class="eyebrow">报工天数明细</p>
        <h1>项目预算人员月度报工天数</h1>
      </div>
      <div class="report-meta">
        <span>自有 ${escapeHtml(periods.staff ?? '-')}</span>
        <span>外包 ${escapeHtml(periods.external ?? '-')}</span>
      </div>
    </section>

    <section class="panel">
      <div class="panel-title">
        <h2>项目预算人员月度报工天数</h2>
        <span>${formatNumber(monthlyRows.length)} 行 · ${formatNumber(summary.totalDays ?? 0, 1)} 天</span>
      </div>
      <p class="source-note">自有员工按本年结算，外包按去年 11 月至今年 10 月 31 日结算；报工天数按“总工时 / 8”折算。成本口径：自有员工按 2000 元/人天，外包按 Excel 单价乘以天数。</p>
      <div class="report-tools">
        <label class="search-box">
          <span>搜索</span>
          <input type="search" data-report-search placeholder="搜索项目、人员、属性" autocomplete="off" />
        </label>
        <span class="search-count" data-report-search-count>${formatNumber(monthlyRows.length)} 行</span>
      </div>
      ${monthlyPersonTable(monthlyRows, monthColumns)}
    </section>

    <section class="panel">
      <div class="panel-title">
        <h2>人员项目报工占比</h2>
        <span>${formatNumber(personProjectRows.length)} 行 · ${formatNumber(summary.totalDays ?? 0, 1)} 天</span>
      </div>
      <p class="source-note">按人员汇总结算周期内参与项目，报工比例 = 该人在项目上的报工天数 / 该人的合计报工天数。</p>
      <div class="report-tools">
        <label class="search-box">
          <span>搜索</span>
          <input type="search" data-person-project-search placeholder="搜索人员姓名" autocomplete="off" />
        </label>
        <span class="search-count" data-person-project-search-count>${formatNumber(personProjectRows.length)} 行</span>
      </div>
      ${personProjectTable(personProjectRows)}
    </section>
  `;
}

export function createStandaloneReport(report) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>项目预算人员月度报工天数</title>
  <style>${standaloneStyles()}</style>
</head>
<body>
  <main class="report-shell static-report">
    ${createReportMarkup(report)}
  </main>
  <script>${reportInteractionScript()}</script>
</body>
</html>`;
}

function monthlyPersonTable(rows, monthColumns) {
  if (!rows.length) return '<div class="empty">暂无可展示的报工数据</div>';
  const groupedRows = groupMonthlyRows(rows);
  return `
    <div class="table-wrap monthly-wrap">
      <table class="monthly-table">
        <thead>
          <tr>${['项目', '人员', '属性', ...monthColumns.map((month) => month.label), '合计', '成本'].map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
        </thead>
        <tbody data-report-table>
          ${groupedRows.map((group, groupIndex) => group.rows.map((row, index) => `
            <tr class="${rowClass(groupIndex, index, row.personOwnership)}" data-project="${escapeHtml(group.project)}" data-project-size="${group.rows.length}" data-search-text="${escapeHtml(searchText(group.project, row))}">
              <td class="group-cell" data-project-cell>
                <div class="project-name">${escapeHtml(group.project)}</div>
                <div class="project-count">${formatNumber(group.rows.length)} 人</div>
              </td>
              <td class="person-cell">${escapeHtml(row.person)}</td>
              <td class="ownership-cell ownership-${ownershipClass(row.personOwnership)}"><span>${escapeHtml(row.personOwnership || '-')}</span></td>
              ${monthColumns.map((month) => monthCell(row.months[month.key] ?? 0)).join('')}
              <td class="total-cell">${escapeHtml(formatDays(row.totalDays))}</td>
              <td class="cost-cell">${escapeHtml(formatCurrency(row.cost))}</td>
            </tr>
          `).join('')).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function personProjectTable(rows) {
  if (!rows.length) return '<div class="empty">暂无可展示的人员项目数据</div>';
  const groupedRows = groupPersonProjectRows(rows);
  return `
    <div class="table-wrap person-project-wrap">
      <table class="person-project-table">
        <thead>
          <tr>${['人员', '属性', '项目', '报工比例', '天数', '合计天数'].map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${groupedRows.map((group, groupIndex) => group.rows.map((row, index) => `
            <tr class="${personProjectRowClass(groupIndex, index, row.personOwnership)}" data-person="${escapeHtml(row.person)}" data-person-search-text="${escapeHtml(normalizeReportSearch(row.person))}">
              ${index === 0 ? `<td class="group-cell person-group-cell" data-person-cell rowspan="${group.rows.length}">
                <div class="person-name">${escapeHtml(group.person)}</div>
                <div class="project-count">${formatNumber(group.rows.length)} 个项目</div>
              </td>` : ''}
              <td class="ownership-cell ownership-${ownershipClass(row.personOwnership)}"><span>${escapeHtml(row.personOwnership || '-')}</span></td>
              <td class="project-cell">${escapeHtml(row.project)}</td>
              <td class="share-cell">${escapeHtml(formatPercent(row.projectShare))}</td>
              <td class="total-cell">${escapeHtml(formatDays(row.projectDays))}</td>
              ${index === 0 ? `<td class="total-cell person-total-cell" rowspan="${group.rows.length}">${escapeHtml(formatDays(row.totalDays))}</td>` : ''}
            </tr>
          `).join('')).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function groupMonthlyRows(rows) {
  const groups = [];
  let current = null;
  for (const row of rows) {
    if (!current || current.project !== row.project) {
      current = {
        project: row.project,
        rows: []
      };
      groups.push(current);
    }
    current.rows.push(row);
  }
  return groups;
}

function groupPersonProjectRows(rows) {
  const groups = [];
  let current = null;
  for (const row of rows) {
    const key = `${row.personOwnership}\u0000${row.person}`;
    if (!current || current.key !== key) {
      current = {
        key,
        person: row.person,
        rows: []
      };
      groups.push(current);
    }
    current.rows.push(row);
  }
  return groups;
}

function searchText(project, row) {
  return normalizeReportSearch([
    project,
    row.person,
    row.personOwnership,
    row.personType
  ].join(' '));
}

function rowClass(groupIndex, rowIndex, ownership) {
  return [
    'monthly-row',
    groupIndex % 2 === 0 ? 'project-even' : 'project-odd',
    rowIndex === 0 ? 'project-start' : '',
    ownership === '外包' ? 'row-external' : 'row-staff'
  ].filter(Boolean).join(' ');
}

function personProjectRowClass(groupIndex, rowIndex, ownership) {
  return [
    'person-project-row',
    groupIndex % 2 === 0 ? 'project-even' : 'project-odd',
    rowIndex === 0 ? 'project-start' : '',
    ownership === '外包' ? 'row-external' : 'row-staff'
  ].filter(Boolean).join(' ');
}

function ownershipClass(value) {
  return value === '外包' ? 'external' : value === '自有' ? 'staff' : 'unknown';
}

function monthCell(days) {
  const className = days >= 20 ? 'day-cell day-full' : days > 0 ? 'day-cell day-used' : 'day-cell';
  return `<td class="${className}">${escapeHtml(formatDays(days))}</td>`;
}

function formatDays(days) {
  return days > 0 ? `${formatNumber(days, 1)}天` : '0';
}

function normalizeReportSearch(value) {
  return String(value ?? '').trim().toLocaleLowerCase('zh-CN');
}

export function wireReportInteractions(root = document) {
  wirePersonProjectSearch(root);
  const searchInput = root.querySelector('[data-report-search]');
  const tableBody = root.querySelector('[data-report-table]');
  const countEl = root.querySelector('[data-report-search-count]');
  if (!searchInput || !tableBody) return;
  const rows = [...tableBody.querySelectorAll('[data-search-text]')];
  const update = () => {
    const tokens = normalizeReportSearch(searchInput.value).split(/\s+/).filter(Boolean);
    let visibleCount = 0;
    for (const row of rows) {
      const searchable = row.dataset.searchText ?? '';
      const visible = tokens.every((token) => searchable.includes(token));
      row.hidden = !visible;
      if (visible) visibleCount += 1;
    }
    mergeVisibleProjectCells(rows);
    if (countEl) countEl.textContent = `${formatNumber(visibleCount)} / ${formatNumber(rows.length)} 行`;
  };
  searchInput.addEventListener('input', update);
  update();
}

function wirePersonProjectSearch(root = document) {
  const searchInput = root.querySelector('[data-person-project-search]');
  const countEl = root.querySelector('[data-person-project-search-count]');
  const rows = [...root.querySelectorAll('[data-person-search-text]')];
  if (!searchInput || !rows.length) return;
  const update = () => {
    const keyword = normalizeReportSearch(searchInput.value);
    let visibleCount = 0;
    for (const row of rows) {
      const visible = !keyword || (row.dataset.personSearchText ?? '').includes(keyword);
      row.hidden = !visible;
      if (visible) visibleCount += 1;
    }
    if (countEl) countEl.textContent = `${formatNumber(visibleCount)} / ${formatNumber(rows.length)} 行`;
  };
  searchInput.addEventListener('input', update);
  update();
}

function mergeVisibleProjectCells(rows) {
  const groups = new Map();
  for (const row of rows) {
    const cell = row.querySelector('[data-project-cell]');
    if (!cell) continue;
    cell.hidden = false;
    cell.rowSpan = 1;
    const project = row.dataset.project ?? '';
    if (!groups.has(project)) groups.set(project, []);
    if (!row.hidden) groups.get(project).push(row);
  }

  for (const visibleRows of groups.values()) {
    visibleRows.forEach((row, index) => {
      const cell = row.querySelector('[data-project-cell]');
      if (!cell) return;
      if (index === 0) {
        cell.hidden = false;
        cell.rowSpan = visibleRows.length;
        const count = cell.querySelector('.project-count');
        if (count) count.textContent = `${formatNumber(visibleRows.length)} 人`;
      } else {
        cell.hidden = true;
      }
    });
  }
}

function reportInteractionScript() {
  return `
    const formatReportCount = (value) => new Intl.NumberFormat('zh-CN').format(value);
    const normalizeReportSearch = (value) => String(value ?? '').trim().toLocaleLowerCase('zh-CN');
    function wireReportInteractions(root = document) {
      wirePersonProjectSearch(root);
      const searchInput = root.querySelector('[data-report-search]');
      const tableBody = root.querySelector('[data-report-table]');
      const countEl = root.querySelector('[data-report-search-count]');
      if (!searchInput || !tableBody) return;
      const rows = [...tableBody.querySelectorAll('[data-search-text]')];
      function mergeVisibleProjectCells(rows) {
        const groups = new Map();
        for (const row of rows) {
          const cell = row.querySelector('[data-project-cell]');
          if (!cell) continue;
          cell.hidden = false;
          cell.rowSpan = 1;
          const project = row.dataset.project ?? '';
          if (!groups.has(project)) groups.set(project, []);
          if (!row.hidden) groups.get(project).push(row);
        }
        for (const visibleRows of groups.values()) {
          visibleRows.forEach((row, index) => {
            const cell = row.querySelector('[data-project-cell]');
            if (!cell) return;
            if (index === 0) {
              cell.hidden = false;
              cell.rowSpan = visibleRows.length;
              const count = cell.querySelector('.project-count');
              if (count) count.textContent = formatReportCount(visibleRows.length) + ' 人';
            } else {
              cell.hidden = true;
            }
          });
        }
      }
      const update = () => {
        const tokens = normalizeReportSearch(searchInput.value).split(/\\s+/).filter(Boolean);
        let visibleCount = 0;
        for (const row of rows) {
          const searchable = row.dataset.searchText ?? '';
          const visible = tokens.every((token) => searchable.includes(token));
          row.hidden = !visible;
          if (visible) visibleCount += 1;
        }
        mergeVisibleProjectCells(rows);
        if (countEl) countEl.textContent = formatReportCount(visibleCount) + ' / ' + formatReportCount(rows.length) + ' 行';
      };
      searchInput.addEventListener('input', update);
      update();
    }
    function wirePersonProjectSearch(root = document) {
      const searchInput = root.querySelector('[data-person-project-search]');
      const countEl = root.querySelector('[data-person-project-search-count]');
      const rows = [...root.querySelectorAll('[data-person-search-text]')];
      if (!searchInput || !rows.length) return;
      const update = () => {
        const keyword = normalizeReportSearch(searchInput.value);
        let visibleCount = 0;
        for (const row of rows) {
          const visible = !keyword || (row.dataset.personSearchText ?? '').includes(keyword);
          row.hidden = !visible;
          if (visible) visibleCount += 1;
        }
        if (countEl) countEl.textContent = formatReportCount(visibleCount) + ' / ' + formatReportCount(rows.length) + ' 行';
      };
      searchInput.addEventListener('input', update);
      update();
    }
    wireReportInteractions();
  `;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function standaloneStyles() {
  return `
    ${BASE_REPORT_CSS}
    body { margin: 0; background: #f4f5f1; color: #17211b; font-family: Inter, "Microsoft YaHei", "PingFang SC", Arial, sans-serif; }
    .static-report { max-width: 1180px; margin: 0 auto; padding: 32px 20px; }
  `;
}

export const BASE_REPORT_CSS = `
  .report-head { display: flex; justify-content: space-between; gap: 24px; align-items: end; margin-bottom: 18px; }
  .report-head h1 { margin: 4px 0 0; font-size: clamp(26px, 4vw, 42px); line-height: 1.05; letter-spacing: 0; }
  .eyebrow { margin: 0; color: #61705f; font-size: 13px; font-weight: 700; }
  .report-meta { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
  .report-meta span { border: 1px solid #d6ddd0; border-radius: 999px; padding: 7px 10px; background: #fff; font-size: 13px; }
  .panel { background: #fff; border: 1px solid #dce1d7; border-radius: 8px; padding: 16px; min-width: 0; }
  .panel + .panel { margin-top: 18px; }
  .panel-title { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 14px; }
  .panel-title h2 { margin: 0; font-size: 18px; line-height: 1.2; }
  .panel-title span { color: #61705f; font-size: 13px; white-space: nowrap; }
  .source-note { margin: -4px 0 12px; color: #61705f; font-size: 13px; line-height: 1.5; }
  .report-tools { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 12px 0; }
  .search-box { display: flex; align-items: center; gap: 10px; width: min(420px, 100%); border: 1px solid #cfd8ca; border-radius: 8px; background: #fbfcf8; padding: 8px 10px; }
  .search-box span { color: #61705f; font-size: 13px; font-weight: 900; white-space: nowrap; }
  .search-box input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: #102018; font: inherit; font-size: 14px; }
  .search-box:focus-within { border-color: #1f6f5b; box-shadow: 0 0 0 3px rgba(31, 111, 91, 0.12); }
  .search-count { color: #61705f; font-size: 13px; font-weight: 800; white-space: nowrap; }
  .monthly-wrap { max-height: 640px; border: 1px solid #e2e7dc; border-radius: 8px; background: #fff; }
  .monthly-table { min-width: 1360px; }
  .monthly-table th { position: sticky; top: 0; background: #eef4ed; z-index: 5; box-shadow: inset 0 -1px 0 #dce5d9; }
  .monthly-table th:first-child, .monthly-table td:first-child { width: 260px; min-width: 260px; }
  .monthly-table th:nth-child(2), .monthly-table td:nth-child(2) { width: 140px; min-width: 140px; }
  .monthly-table th:nth-child(3), .monthly-table td:nth-child(3) { width: 92px; min-width: 92px; }
  .monthly-table th:nth-child(n+4) { min-width: 76px; text-align: right; }
  .monthly-table th:first-child, .monthly-table td:first-child { position: sticky; left: 0; z-index: 4; }
  .monthly-table th:nth-child(2), .monthly-table td:nth-child(2) { position: sticky; left: 260px; z-index: 3; }
  .monthly-table th:nth-child(3), .monthly-table td:nth-child(3) { position: sticky; left: 400px; z-index: 3; box-shadow: 8px 0 14px rgba(31, 53, 42, 0.07); }
  .monthly-table th:first-child, .monthly-table th:nth-child(2), .monthly-table th:nth-child(3) { z-index: 6; }
  .monthly-row.project-even td { background: #ffffff; }
  .monthly-row.project-odd td { background: #f8fbf6; }
  .monthly-row:hover td { background: #eef6ef; }
  .monthly-row.project-start td { border-top: 3px solid #b8cdb5; }
  .person-project-wrap { max-height: 460px; border: 1px solid #e2e7dc; border-radius: 8px; background: #fff; }
  .person-project-table { min-width: 860px; }
  .person-project-table th { position: sticky; top: 0; background: #eef4ed; z-index: 5; box-shadow: inset 0 -1px 0 #dce5d9; }
  .person-project-table th:first-child, .person-project-table td:first-child { width: 150px; min-width: 150px; }
  .person-project-table th:nth-child(2), .person-project-table td:nth-child(2) { width: 92px; min-width: 92px; }
  .person-project-table th:nth-child(4), .person-project-table td:nth-child(4),
  .person-project-table th:nth-child(5), .person-project-table td:nth-child(5),
  .person-project-table th:nth-child(6), .person-project-table td:nth-child(6) { width: 110px; min-width: 110px; text-align: right; }
  .person-project-row.project-even td { background: #ffffff; }
  .person-project-row.project-odd td { background: #f8fbf6; }
  .person-project-row:hover td { background: #eef6ef; }
  .person-project-row.project-start td { border-top: 3px solid #b8cdb5; }
  .group-cell { background: #edf5eb !important; border-right: 1px solid #d7e3d3; color: #102018; font-weight: 900; vertical-align: top; }
  .project-odd .group-cell { background: #e5f0e2 !important; }
  .project-name { max-width: 220px; line-height: 1.35; }
  .person-name { max-width: 120px; line-height: 1.35; }
  .project-count { margin-top: 8px; color: #637461; font-size: 12px; font-weight: 800; }
  .person-cell { background: inherit; color: #101b15; font-weight: 800; }
  .project-cell { color: #101b15; font-weight: 800; }
  .share-cell { text-align: right; color: #173226; font-weight: 900; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .row-external .person-cell { color: #5b251f; }
  .ownership-cell { background: inherit; }
  .ownership-cell span { display: inline-flex; align-items: center; min-width: 42px; justify-content: center; border-radius: 999px; padding: 3px 8px; font-size: 12px; font-weight: 900; }
  .ownership-staff span { color: #225a45; background: #dff1e8; }
  .ownership-external span { color: #8c1d18; background: #fde7df; }
  .ownership-unknown span { color: #61705f; background: #edf0ea; }
  .day-cell { text-align: right; color: #8b9588; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .day-used { color: #173226; font-weight: 900; background: #f1f8f2 !important; }
  .day-full { color: #8c1d18; background: #fde1da !important; font-weight: 900; }
  .total-cell, .cost-cell { text-align: right; color: #102018; font-weight: 900; font-variant-numeric: tabular-nums; white-space: nowrap; background: #f6f8f3 !important; }
  .table-wrap { overflow: auto; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; }
  th, td { text-align: left; border-bottom: 1px solid #e6ece2; padding: 12px 10px; vertical-align: top; }
  th { color: #42533f; font-weight: 900; white-space: nowrap; }
  td { line-height: 1.45; }
  tr[hidden] { display: none; }
  .empty { color: #61705f; background: #f5f7f2; border-radius: 8px; padding: 16px; }
  @media (max-width: 860px) {
    .report-head { display: block; }
    .report-meta { justify-content: flex-start; margin-top: 12px; }
    .report-tools { align-items: stretch; flex-direction: column; }
    .search-box { width: 100%; }
  }
`;
