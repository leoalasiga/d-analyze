const EMPTY_VALUES = new Set(['', '--', '/', '无', 'null', 'undefined']);

const COLUMN_CANDIDATES = {
  date: ['报工日期', '日期'],
  person: ['人员姓名', '员工姓名', '姓名'],
  personId: ['员工认证编号', '员工id', '员工ID'],
  personType: ['人员性质', '员工类型'],
  sourceDept: ['修正科室', '所属部室', '员工科室', '人员部门'],
  dept: ['立项科室', '所属立项子项目研发科室', '项目部门', '实施项目团队部室', '修正科室', '所属部室'],
  supplier: ['供应商', '所属公司'],
  workType: ['工作项类型'],
  workItem: ['工作项编号'],
  workName: ['工作项名称'],
  system: ['所属系统', '关联系统'],
  project: ['所属立项项目', '关联立项'],
  projectKind: ['所属立项子项目类型', '修正立项类型', '立项判定'],
  subProject: ['所属立项子项目', '立项子', '所属实施子项目', '关联实施子项目'],
  team: ['所属项目团队', '关联实施项目团队'],
  leadDept: ['牵头研发部室'],
  totalHours: ['总工时(h)', '总工时'],
  normalHours: ['正常工时(h)', '正常工时'],
  overtimeHours: ['加班工时(h)', '加班工时'],
  unitPrice: ['单价'],
  cost: ['人力成本(元)', '人力成本'],
  status: ['审批状态'],
  warning: ['异常提醒'],
  stage: ['阶段'],
  taskLevel: ['任务等级', '资源类型'],
  approver: ['审批人']
};

const BUDGET_COLUMNS = {
  project: ['关联立项', '所属立项项目', '项目名称'],
  externalActual: ['人月制外包', '外包已执行', '外包执行'],
  staffActual: ['正式员工', '正式已执行', '正式执行'],
  settled: ['已结算'],
  externalBudget: ['人月预算', '外包预算'],
  staffBudget: ['正式预算'],
  remaining: ['总预算剩余', '预算剩余', '剩余预算'],
  hint: ['提示'],
  dept: ['科室', '所属部室', '立项科室']
};

export function normalizeHeader(value) {
  return String(value ?? '')
    .replace(/\s+/g, '')
    .replace(/[（）]/g, (char) => (char === '（' ? '(' : ')'))
    .trim();
}

export function cleanText(value, fallback = '未归类') {
  const text = String(value ?? '').trim();
  return EMPTY_VALUES.has(text) ? fallback : text;
}

export function toNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value).replace(/,/g, '').replace(/￥/g, '').trim();
  if (EMPTY_VALUES.has(text)) return 0;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseWorkDate(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(Date.UTC(1899, 11, 30 + Math.floor(value)));
  }
  const text = String(value ?? '').trim();
  if (!text || EMPTY_VALUES.has(text)) return null;
  const normalized = text.replace(/[.年]/g, '/').replace(/月/g, '/').replace(/日/g, '');
  const match = normalized.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!match) {
    const serial = Number(text);
    if (Number.isFinite(serial)) return new Date(Date.UTC(1899, 11, 30 + Math.floor(serial)));
    return null;
  }
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.valueOf()) ? null : date;
}

export function monthKey(date) {
  if (!date) return '未知月份';
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function personOwnership(value) {
  const text = cleanText(value, '');
  if (!text) return '';
  if (text.includes('外包')) return '外包';
  if (text.includes('正式') || text.includes('自有')) return '自有';
  return text;
}

export function formatDate(date) {
  if (!date) return '未知';
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function detectColumns(headers, candidates = COLUMN_CANDIDATES) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const indexByHeader = new Map(normalizedHeaders.map((header, index) => [header, index]));
  const columns = {};
  for (const [key, names] of Object.entries(candidates)) {
    const found = names.map(normalizeHeader).find((name) => indexByHeader.has(name));
    columns[key] = found ? indexByHeader.get(found) : -1;
  }
  return columns;
}

export function rowsToObjects(rows, candidates = COLUMN_CANDIDATES) {
  const [headers = [], ...body] = rows ?? [];
  const columns = detectColumns(headers, candidates);
  return body
    .filter((row) => row.some((cell) => cleanText(cell, '') !== ''))
    .map((row) => ({ row, columns }));
}

function valueAt(entry, key, fallback = '') {
  const index = entry.columns[key];
  if (index === undefined || index < 0) return fallback;
  return entry.row[index] ?? fallback;
}

function groupAccumulator() {
  return {
    rows: 0,
    hours: 0,
    normalHours: 0,
    overtimeHours: 0,
    cost: 0,
    approvedCost: 0,
    pendingCost: 0,
    approvedRows: 0,
    pendingRows: 0,
    warningRows: 0,
    people: new Set(),
    projects: new Set()
  };
}

function addToGroup(group, item) {
  group.rows += 1;
  group.hours += item.totalHours;
  group.normalHours += item.normalHours;
  group.overtimeHours += item.overtimeHours;
  group.cost += item.cost;
  group.people.add(item.person);
  group.projects.add(item.project);
  if (item.status === '已审批') {
    group.approvedRows += 1;
    group.approvedCost += item.cost;
  } else {
    group.pendingRows += 1;
    group.pendingCost += item.cost;
  }
  if (item.warning !== '无异常') group.warningRows += 1;
}

function finalizeGroup(group, name) {
  return {
    name,
    rows: group.rows,
    hours: round(group.hours),
    normalHours: round(group.normalHours),
    overtimeHours: round(group.overtimeHours),
    overtimeRate: ratio(group.overtimeHours, group.hours),
    cost: round(group.cost),
    approvedCost: round(group.approvedCost),
    pendingCost: round(group.pendingCost),
    approvedRows: group.approvedRows,
    pendingRows: group.pendingRows,
    warningRows: group.warningRows,
    peopleCount: group.people.size,
    projectCount: group.projects.size,
    avgCostPerHour: ratio(group.cost, group.hours, 2)
  };
}

function finalizeMap(map, limit = Infinity) {
  return [...map.entries()]
    .map(([name, group]) => finalizeGroup(group, name))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, limit);
}

export function analyzeWorklog(rows) {
  const entries = rowsToObjects(rows);
  const records = [];
  const totals = groupAccumulator();
  const byDept = new Map();
  const byProject = new Map();
  const byPerson = new Map();
  const byMonth = new Map();
  const byWorkType = new Map();
  const byStatus = new Map();
  const warnings = new Map();
  let minDate = null;
  let maxDate = null;

  for (const entry of entries) {
    const date = parseWorkDate(valueAt(entry, 'date'));
    const person = cleanText(valueAt(entry, 'person'));
    const dept = cleanText(valueAt(entry, 'dept'));
    const project = cleanText(valueAt(entry, 'project'));
    const status = cleanText(valueAt(entry, 'status'), '未知状态');
    const warning = cleanText(valueAt(entry, 'warning'), '无异常');
    const item = createWorklogRecord(entry, { date, person, dept, project, status, warning });
    if (!item.totalHours && !item.cost && item.project === '未归类') continue;
    records.push(item);
    if (date && (!minDate || date < minDate)) minDate = date;
    if (date && (!maxDate || date > maxDate)) maxDate = date;
    addToGroup(totals, item);
    for (const [map, key] of [
      [byDept, item.dept],
      [byProject, item.project],
      [byPerson, item.person],
      [byMonth, item.month],
      [byWorkType, item.workType],
      [byStatus, item.status]
    ]) {
      if (!map.has(key)) map.set(key, groupAccumulator());
      addToGroup(map.get(key), item);
    }
    if (item.warning !== '无异常') {
      warnings.set(item.warning, (warnings.get(item.warning) ?? 0) + 1);
    }
  }

  return {
    records,
    dateRange: { start: formatDate(minDate), end: formatDate(maxDate) },
    totals: finalizeGroup(totals, '总计'),
    byDept: finalizeMap(byDept),
    byProject: finalizeMap(byProject),
    byPerson: finalizeMap(byPerson),
    byMonth: finalizeMap(byMonth).sort((a, b) => a.name.localeCompare(b.name)),
    byWorkType: finalizeMap(byWorkType),
    byStatus: finalizeMap(byStatus),
    warnings: [...warnings.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  };
}

function createWorklogRecord(entry, overrides = {}) {
  const date = overrides.date ?? parseWorkDate(valueAt(entry, 'date'));
  const personType = overrides.defaultPersonType
    ? cleanText(valueAt(entry, 'personType'), overrides.defaultPersonType)
    : cleanText(valueAt(entry, 'personType'));
  const warning = overrides.warning ?? cleanText(valueAt(entry, 'warning'), '无异常');
  const totalHours = toNumber(valueAt(entry, 'totalHours'));
  const unitPrice = toNumber(valueAt(entry, 'unitPrice'));
  const sourceCost = toNumber(valueAt(entry, 'cost'));
  return {
    date,
    month: monthKey(date),
    person: overrides.person ?? cleanText(valueAt(entry, 'person')),
    personType,
    personOwnership: overrides.personOwnership ?? personOwnership(personType),
    dept: overrides.dept ?? cleanText(valueAt(entry, 'dept')),
    sourceDept: cleanText(valueAt(entry, 'sourceDept')),
    supplier: cleanText(valueAt(entry, 'supplier')),
    workType: cleanText(valueAt(entry, 'workType')),
    project: overrides.project ?? cleanText(valueAt(entry, 'project')),
    projectKind: cleanText(valueAt(entry, 'projectKind')),
    subProject: cleanText(valueAt(entry, 'subProject')),
    status: overrides.status ?? cleanText(valueAt(entry, 'status'), '未知状态'),
    warning: warning === '--' ? '无异常' : warning,
    totalHours,
    normalHours: toNumber(valueAt(entry, 'normalHours')),
    overtimeHours: toNumber(valueAt(entry, 'overtimeHours')),
    cost: calculateRecordCost({ totalHours, unitPrice, sourceCost, costMode: overrides.costMode }),
    unitPrice
  };
}

function calculateRecordCost({ totalHours, unitPrice, sourceCost, costMode }) {
  const days = totalHours / 8;
  if (costMode === 'staffDaily') return round(days * 2000, 2);
  if (costMode === 'externalUnitPrice') return round(days * unitPrice, 2);
  return sourceCost;
}

function parseWorklogRecords(rows, options = {}) {
  return rowsToObjects(rows)
    .map((entry) => createWorklogRecord(entry, options))
    .filter((record) => {
      if (!record.totalHours && !record.cost && record.project === '未归类') return false;
      if (options.startDate && (!record.date || record.date < options.startDate)) return false;
      if (options.endDate && (!record.date || record.date > options.endDate)) return false;
      return true;
    });
}

export function analyzeBudget(rows) {
  const entries = rowsToObjects(rows, BUDGET_COLUMNS);
  return entries
    .map((entry) => {
      const project = cleanText(valueAt(entry, 'project'));
      const externalActual = toNumber(valueAt(entry, 'externalActual'));
      const staffActual = toNumber(valueAt(entry, 'staffActual'));
      const settled = toNumber(valueAt(entry, 'settled'));
      const externalBudget = toNumber(valueAt(entry, 'externalBudget'));
      const staffBudget = toNumber(valueAt(entry, 'staffBudget'));
      const totalBudget = externalBudget + staffBudget;
      const budgetExecuted = externalActual + staffActual + settled;
      const remaining = valueAt(entry, 'remaining', null);
      return {
        project,
        dept: cleanText(valueAt(entry, 'dept')),
        externalActual: round(externalActual),
        staffActual: round(staffActual),
        settled: round(settled),
        externalBudget: round(externalBudget),
        staffBudget: round(staffBudget),
        totalBudget: round(totalBudget),
        budgetExecuted: round(budgetExecuted),
        remaining: remaining === null ? round(totalBudget - budgetExecuted) : round(toNumber(remaining)),
        utilization: ratio(budgetExecuted, totalBudget),
        hint: cleanText(valueAt(entry, 'hint'), '')
      };
    })
    .filter((item) => item.project !== '未归类')
    .sort((a, b) => b.utilization - a.utilization);
}

export function mergeBudgetExecution(worklogAnalysis, budgetRows = []) {
  const actualByProject = new Map(worklogAnalysis.byProject.map((project) => [project.name, project]));
  return budgetRows.map((budget) => {
    const actual = actualByProject.get(budget.project);
    const worklogCost = actual?.cost ?? 0;
    const worklogHours = actual?.hours ?? 0;
    const variance = worklogCost - budget.budgetExecuted;
    const executionRate = ratio(budget.budgetExecuted, budget.totalBudget);
    const worklogRate = ratio(worklogCost, budget.totalBudget);
    let status = '正常';
    if (executionRate >= 1 || worklogRate >= 1 || budget.remaining < 0) status = '超预算';
    else if (executionRate >= 0.85 || worklogRate >= 0.85) status = '接近用尽';
    else if (executionRate >= 0.7 || worklogRate >= 0.7) status = '偏高';
    return {
      ...budget,
      worklogCost: round(worklogCost),
      worklogHours: round(worklogHours),
      variance: round(variance),
      executionRate,
      worklogRate,
      status
    };
  });
}

export function buildBudgetPersonMonthlyRows(worklogAnalysis, budgetExecution = []) {
  const budgetByProject = new Map(budgetExecution.map((item) => [item.project, item]));
  const rowsByKey = new Map();

  for (const record of worklogAnalysis.records) {
    if (record.project === '未归类') continue;
    if (budgetByProject.size && !budgetByProject.has(record.project)) continue;
    const key = `${record.project}\u0000${record.person}`;
    if (!rowsByKey.has(key)) {
      const budget = budgetByProject.get(record.project);
      rowsByKey.set(key, {
        project: record.project,
        budgetAmount: budget?.totalBudget ?? 0,
        budgetUsed: budget?.budgetExecuted ?? 0,
        budgetRemaining: budget?.remaining ?? 0,
        budgetStatus: budget?.status ?? '未列预算',
        person: record.person,
        personType: record.personType,
        personOwnership: personOwnership(record.personType),
        months: Array.from({ length: 12 }, () => 0),
        totalDays: 0,
        totalHours: 0,
        cost: 0,
        rows: 0
      });
    }
    const row = rowsByKey.get(key);
    const monthIndex = record.date ? record.date.getUTCMonth() : -1;
    const days = round(record.totalHours / 8, 2);
    if (monthIndex >= 0) row.months[monthIndex] = round(row.months[monthIndex] + days, 2);
    row.totalDays = round(row.totalDays + days, 2);
    row.totalHours = round(row.totalHours + record.totalHours, 2);
    row.cost = round(row.cost + record.cost, 2);
    row.rows += 1;
  }

  for (const budget of budgetExecution) {
    const hasWorklog = [...rowsByKey.values()].some((row) => row.project === budget.project);
    if (!hasWorklog) {
      rowsByKey.set(`${budget.project}\u0000无报工`, {
        project: budget.project,
        budgetAmount: budget.totalBudget,
        budgetUsed: budget.budgetExecuted,
        budgetRemaining: budget.remaining,
        budgetStatus: budget.status,
        person: '无报工',
        personType: '',
        personOwnership: '',
        months: Array.from({ length: 12 }, () => 0),
        totalDays: 0,
        totalHours: 0,
        cost: 0,
        rows: 0
      });
    }
  }

  return [...rowsByKey.values()].sort((a, b) => (
    a.project.localeCompare(b.project, 'zh-CN') ||
    b.totalDays - a.totalDays ||
    a.person.localeCompare(b.person, 'zh-CN')
  ));
}

export function buildReport(input) {
  if ('staffRows' in input || 'externalRows' in input) return buildSettlementReport(input);
  const { worklogRows, budgetRows = [] } = input;
  const worklog = analyzeWorklog(worklogRows);
  const budget = analyzeBudget(budgetRows);
  const budgetExecution = mergeBudgetExecution(worklog, budget);
  return {
    generatedAt: new Date().toISOString(),
    worklog,
    budget,
    budgetExecution,
    budgetPersonMonthlyRows: buildBudgetPersonMonthlyRows(worklog, budgetExecution),
    insights: buildInsights(worklog, budgetExecution)
  };
}

export function buildSettlementReport({ staffRows = [], externalRows = [], settlementYear = new Date().getFullYear() }) {
  const periods = getSettlementPeriods(settlementYear);
  const staffRecords = parseWorklogRecords(staffRows, {
    startDate: periods.staff.start,
    endDate: periods.staff.end,
    defaultPersonType: '自有员工',
    personOwnership: '自有',
    costMode: 'staffDaily'
  });
  const externalRecords = parseWorklogRecords(externalRows, {
    startDate: periods.external.start,
    endDate: periods.external.end,
    defaultPersonType: '人月制外包',
    personOwnership: '外包',
    costMode: 'externalUnitPrice'
  });
  const monthColumns = buildSettlementMonthColumns(settlementYear);
  const records = [...staffRecords, ...externalRecords];
  return {
    generatedAt: new Date().toISOString(),
    settlementYear,
    periods: {
      staff: `${formatDate(periods.staff.start)} 至 ${formatDate(periods.staff.end)}`,
      external: `${formatDate(periods.external.start)} 至 ${formatDate(periods.external.end)}`
    },
    monthColumns,
    monthlyRows: buildSettlementMonthlyRows(records, monthColumns),
    personProjectRows: buildPersonProjectRows(records),
    summary: summarizeSettlementRecords(records)
  };
}

function getSettlementPeriods(year) {
  return {
    staff: {
      start: new Date(Date.UTC(year, 0, 1)),
      end: new Date(Date.UTC(year, 11, 31))
    },
    external: {
      start: new Date(Date.UTC(year - 1, 10, 1)),
      end: new Date(Date.UTC(year, 9, 31))
    }
  };
}

function buildSettlementMonthColumns(year) {
  const columns = [
    { year: year - 1, month: 11 },
    { year: year - 1, month: 12 },
    ...Array.from({ length: 12 }, (_, index) => ({ year, month: index + 1 }))
  ];
  return columns.map(({ year: columnYear, month }) => ({
    key: `${columnYear}-${String(month).padStart(2, '0')}`,
    label: columnYear === year ? `${month}月` : `${columnYear}年${month}月`
  }));
}

function buildSettlementMonthlyRows(records, monthColumns) {
  const monthKeys = monthColumns.map((item) => item.key);
  const monthKeySet = new Set(monthKeys);
  const rowsByKey = new Map();

  for (const record of records) {
    if (record.project === '未归类') continue;
    const key = `${record.project}\u0000${record.personOwnership}\u0000${record.person}`;
    if (!rowsByKey.has(key)) {
      rowsByKey.set(key, {
        project: record.project,
        person: record.person,
        personType: record.personType,
        personOwnership: record.personOwnership,
        months: Object.fromEntries(monthKeys.map((month) => [month, 0])),
        totalDays: 0,
        totalHours: 0,
        cost: 0,
        rows: 0
      });
    }
    const row = rowsByKey.get(key);
    const keyMonth = monthKey(record.date);
    const days = round(record.totalHours / 8, 2);
    if (monthKeySet.has(keyMonth)) row.months[keyMonth] = round(row.months[keyMonth] + days, 2);
    row.totalDays = round(row.totalDays + days, 2);
    row.totalHours = round(row.totalHours + record.totalHours, 2);
    row.cost = round(row.cost + record.cost, 2);
    row.rows += 1;
  }

  return [...rowsByKey.values()].sort((a, b) => (
    a.project.localeCompare(b.project, 'zh-CN') ||
    a.personOwnership.localeCompare(b.personOwnership, 'zh-CN') ||
    b.totalDays - a.totalDays ||
    a.person.localeCompare(b.person, 'zh-CN')
  ));
}

function buildPersonProjectRows(records) {
  const people = new Map();
  const projectRows = new Map();

  for (const record of records) {
    if (record.project === '未归类') continue;
    const personKey = `${record.personOwnership}\u0000${record.person}`;
    const projectKey = `${personKey}\u0000${record.project}`;
    const days = round(record.totalHours / 8, 2);

    if (!people.has(personKey)) {
      people.set(personKey, {
        person: record.person,
        personType: record.personType,
        personOwnership: record.personOwnership,
        totalDays: 0
      });
    }
    const person = people.get(personKey);
    person.totalDays = round(person.totalDays + days, 2);

    if (!projectRows.has(projectKey)) {
      projectRows.set(projectKey, {
        person: record.person,
        personType: record.personType,
        personOwnership: record.personOwnership,
        project: record.project,
        projectDays: 0,
        totalDays: 0,
        projectShare: 0,
        rows: 0
      });
    }
    const row = projectRows.get(projectKey);
    row.projectDays = round(row.projectDays + days, 2);
    row.rows += 1;
  }

  return [...projectRows.values()]
    .map((row) => {
      const person = people.get(`${row.personOwnership}\u0000${row.person}`);
      const totalDays = person?.totalDays ?? 0;
      return {
        ...row,
        totalDays,
        projectShare: ratio(row.projectDays, totalDays)
      };
    })
    .sort((a, b) => (
      a.person.localeCompare(b.person, 'zh-CN') ||
      a.personOwnership.localeCompare(b.personOwnership, 'zh-CN') ||
      b.projectDays - a.projectDays ||
      a.project.localeCompare(b.project, 'zh-CN')
    ));
}

function summarizeSettlementRecords(records) {
  const people = new Set(records.map((record) => `${record.personOwnership}\u0000${record.person}`));
  const projects = new Set(records.map((record) => record.project).filter((project) => project !== '未归类'));
  return {
    rows: records.length,
    peopleCount: people.size,
    projectCount: projects.size,
    totalHours: round(records.reduce((sum, record) => sum + record.totalHours, 0), 2),
    totalDays: round(records.reduce((sum, record) => sum + record.totalHours / 8, 0), 2),
    cost: round(records.reduce((sum, record) => sum + record.cost, 0), 2)
  };
}

export function buildInsights(worklog, budgetExecution) {
  const insights = [];
  const totals = worklog.totals;
  if (totals.pendingRows > 0) {
    insights.push(`有 ${totals.pendingRows} 条报工未审批或未提交，涉及成本 ${formatCurrency(totals.pendingCost)}，结算前需要优先清理。`);
  }
  if (totals.warningRows > 0) {
    insights.push(`异常提醒共 ${totals.warningRows} 条，主要风险是项目同步、需求上线后继续报工或项目归属不一致。`);
  }
  const topDept = worklog.byDept[0];
  if (topDept) {
    insights.push(`${topDept.name} 是当前成本最高科室，累计 ${formatCurrency(topDept.cost)}，占总成本 ${formatPercent(ratio(topDept.cost, totals.cost))}。`);
  }
  const topProject = worklog.byProject[0];
  if (topProject) {
    insights.push(`成本最高项目是 ${topProject.name}，累计 ${formatCurrency(topProject.cost)}，工时 ${formatNumber(topProject.hours)}h。`);
  }
  const riskyBudget = budgetExecution.filter((item) => ['超预算', '接近用尽'].includes(item.status));
  if (riskyBudget.length) {
    insights.push(`预算风险项目 ${riskyBudget.length} 个，其中 ${riskyBudget[0].project} 当前状态为 ${riskyBudget[0].status}。`);
  }
  return insights;
}

export function ratio(numerator, denominator, precision = 4) {
  if (!denominator) return 0;
  return round(numerator / denominator, precision);
}

export function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  }).format(value ?? 0);
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0
  }).format(value ?? 0);
}

export function formatPercent(value) {
  return `${formatNumber((value ?? 0) * 100, 1)}%`;
}
