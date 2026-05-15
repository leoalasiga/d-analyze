import { describe, expect, it } from 'vitest';
import { analyzeBudget, analyzeWorklog, buildReport } from './analyzer.js';
import { saveHtmlReport } from './downloadReport.js';
import { createReportMarkup, createStandaloneReport } from './reportView.js';
import { getUploadFlowState } from './uploadFlow.js';

const worklogRows = [
  ['人员姓名', '人员性质', '立项科室', '报工日期', '工作项类型', '所属立项项目', '总工时(h)', '正常工时(h)', '加班工时(h)', '人力成本(元)', '审批状态', '异常提醒'],
  ['张三', '正式员工', '智能数据部', '2026/01/02', '项目任务', '项目A', '8', '8', '0', '1000', '已审批', '--'],
  ['李四', '人月制外包', '数据资产室', '46027', '开发任务', '项目A', '10', '8', '2', '1200', '待审批', '工作项未同步结转'],
  ['王五', '正式员工', '智能数据部', '2026/01/03', '请假事务', '--', '4', '0', '0', '0', '已审批', '--']
];

const budgetRows = [
  ['关联立项', '人月制外包', '正式员工', '已结算', '人月预算', '正式预算', '总预算剩余', '提示'],
  ['项目A', '1200', '1000', '0', '1500', '1500', '800', ''],
  ['项目B', '900', '0', '0', '1000', '0', '100', '']
];

const staffRows = [
  ['人员姓名', '人员性质', '报工日期', '所属立项项目', '总工时(h)'],
  ['张三', '正式员工', '2026/01/02', '项目A', '8'],
  ['张三', '正式员工', '2025/12/31', '项目A', '8'],
  ['王五', '自有员工', '2026/12/01', '项目B', '16']
];

const externalRows = [
  ['人员姓名', '人员性质', '报工日期', '所属立项项目', '总工时(h)', '单价'],
  ['李四', '人月制外包', '2025/11/15', '项目A', '16', '1500'],
  ['李四', '人月制外包', '2026/10/31', '项目A', '8', '1500'],
  ['赵六', '人月制外包', '2026/11/01', '项目A', '8', '1500']
];

describe('analyzeWorklog', () => {
  it('summarizes rows, hours, costs, approval state, warnings and groups', () => {
    const result = analyzeWorklog(worklogRows);

    expect(result.totals.rows).toBe(3);
    expect(result.totals.hours).toBe(22);
    expect(result.totals.overtimeHours).toBe(2);
    expect(result.totals.cost).toBe(2200);
    expect(result.totals.pendingRows).toBe(1);
    expect(result.totals.warningRows).toBe(1);
    expect(result.dateRange).toEqual({ start: '2026-01-02', end: '2026-01-05' });
    expect(result.byDept.find((item) => item.name === '智能数据部')).toMatchObject({ rows: 2, cost: 1000 });
    expect(result.byProject[0]).toMatchObject({ name: '项目A', rows: 2, cost: 2200 });
  });
});

describe('analyzeBudget', () => {
  it('calculates total budget, executed amount and utilization', () => {
    const result = analyzeBudget(budgetRows);

    expect(result.find((item) => item.project === '项目A')).toMatchObject({
      totalBudget: 3000,
      budgetExecuted: 2200,
      utilization: 0.7333
    });
  });
});

describe('buildReport', () => {
  it('builds one monthly workday table from staff and external Excel files with separate settlement periods', () => {
    const report = buildReport({ staffRows, externalRows, settlementYear: 2026 });
    const zhangSan = report.monthlyRows.find((item) => item.project === '项目A' && item.person === '张三');
    const liSi = report.monthlyRows.find((item) => item.project === '项目A' && item.person === '李四');
    const wangWu = report.monthlyRows.find((item) => item.project === '项目B' && item.person === '王五');

    expect(report.periods).toEqual({
      staff: '2026-01-01 至 2026-12-31',
      external: '2025-11-01 至 2026-10-31'
    });
    expect(report.monthColumns.map((item) => item.key)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12'
    ]);
    expect(zhangSan).toMatchObject({
      personOwnership: '自有',
      totalDays: 1,
      cost: 2000
    });
    expect(zhangSan.months['2026-01']).toBe(1);
    expect(zhangSan.months['2025-12']).toBe(0);
    expect(liSi).toMatchObject({
      personOwnership: '外包',
      totalDays: 3,
      cost: 4500
    });
    expect(liSi.months['2025-11']).toBe(2);
    expect(liSi.months['2026-10']).toBe(1);
    expect(wangWu.months['2026-12']).toBe(2);
    expect(wangWu.cost).toBe(4000);
    expect(report.summary.cost).toBe(10500);
    expect(report.monthlyRows.some((item) => item.person === '赵六')).toBe(false);
  });

  it('builds person project rows with each project share of the person total days', () => {
    const report = buildReport({
      staffRows: [
        ['人员姓名', '人员性质', '报工日期', '所属立项项目', '总工时(h)'],
        ['张三', '正式员工', '2026/01/02', '项目A', '8'],
        ['张三', '正式员工', '2026/02/03', '项目B', '24'],
        ['王五', '自有员工', '2026/03/01', '项目B', '16']
      ],
      externalRows: [
        ['人员姓名', '人员性质', '报工日期', '所属立项项目', '总工时(h)', '单价'],
        ['李四', '人月制外包', '2026/04/01', '项目A', '8', '1500']
      ],
      settlementYear: 2026
    });

    const zhangProjectA = report.personProjectRows.find((item) => item.person === '张三' && item.project === '项目A');
    const zhangProjectB = report.personProjectRows.find((item) => item.person === '张三' && item.project === '项目B');
    const liSi = report.personProjectRows.find((item) => item.person === '李四');

    expect(zhangProjectA).toMatchObject({
      personOwnership: '自有',
      projectDays: 1,
      totalDays: 4,
      projectShare: 0.25
    });
    expect(zhangProjectB).toMatchObject({
      projectDays: 3,
      totalDays: 4,
      projectShare: 0.75
    });
    expect(liSi).toMatchObject({
      personOwnership: '外包',
      projectDays: 1,
      totalDays: 1,
      projectShare: 1
    });
  });
});

describe('createReportMarkup', () => {
  it('renders the project monthly table and the person project share table', () => {
    const report = buildReport({ staffRows, externalRows, settlementYear: 2026 });
    const html = createReportMarkup(report);

    expect(html).toContain('项目预算人员月度报工天数');
    expect(html).toContain('type="search"');
    expect(html).toContain('placeholder="搜索项目、人员、属性"');
    expect(html).toContain('data-search-text="项目a 李四 外包');
    expect(html).toContain('data-project="项目A"');
    expect(html).toContain('<th>项目</th><th>人员</th><th>属性</th><th>2025年11月</th>');
    expect(html).toContain('<div class="project-count">2 人</div>');
    expect(html).not.toContain('同项目');
    expect(html).toContain('<td class="person-cell">张三</td>');
    expect(html).toContain('<td class="ownership-cell ownership-staff"><span>自有</span></td>');
    expect(html).toContain('<td class="ownership-cell ownership-external"><span>外包</span></td>');
    expect(html).toContain('1.0天');
    expect(html).toContain('2.0天');
    expect(html).toContain('人员项目报工占比');
    expect(html).toContain('<th>人员</th><th>属性</th><th>项目</th><th>报工比例</th><th>天数</th><th>合计天数</th>');
    expect(html).toContain('data-person="张三"');
    expect(html).toContain('100.0%');
    expect(html).not.toContain('月度报工数量');
    expect(html).not.toContain('预算执行风险');
    expect(html).not.toContain('人员清单');
    expect(html).not.toContain('异常提醒');
  });

  it('merges total days cells by person in the person project share table', () => {
    const report = buildReport({
      staffRows: [
        ['人员姓名', '人员性质', '报工日期', '所属立项项目', '总工时(h)'],
        ['张三', '正式员工', '2026/01/02', '项目A', '8'],
        ['张三', '正式员工', '2026/02/03', '项目B', '24']
      ],
      externalRows: [],
      settlementYear: 2026
    });
    const html = createReportMarkup(report);

    expect(html).toContain('<td class="total-cell person-total-cell" rowspan="2">4.0天</td>');
    expect(html.match(/person-total-cell/g)).toHaveLength(1);
  });

  it('adds a person-name search control for the person project share table', () => {
    const report = buildReport({ staffRows, externalRows, settlementYear: 2026 });
    const html = createReportMarkup(report);

    expect(html).toContain('data-person-project-search');
    expect(html).toContain('placeholder="搜索人员姓名"');
    expect(html).toContain('data-person-project-search-count');
    expect(html).toContain('data-person-search-text="张三"');
  });

  it('includes the same live search wiring in exported standalone reports', () => {
    const report = buildReport({ staffRows, externalRows, settlementYear: 2026 });
    const html = createStandaloneReport(report);

    expect(html).toContain('data-report-search');
    expect(html).toContain('data-person-project-search');
    expect(html).toContain('wireReportInteractions');
    expect(html).toContain('wirePersonProjectSearch');
    expect(html).toContain('mergeVisibleProjectCells');
  });
});

describe('getUploadFlowState', () => {
  it('requires staff and external Excel files before analysis', () => {
    expect(getUploadFlowState({ staffFile: null, externalFile: null })).toMatchObject({
      canAnalyze: false,
      message: '请上传自有员工 Excel 和外包 Excel。'
    });

    expect(getUploadFlowState({ staffFile: { name: '自有.xlsx' }, externalFile: null })).toMatchObject({
      canAnalyze: false,
      message: '自有员工 Excel 已选择，请继续上传外包 Excel。'
    });

    expect(getUploadFlowState({ staffFile: { name: '自有.xlsx' }, externalFile: { name: '外包.xlsx' } })).toMatchObject({
      canAnalyze: true,
      message: '两份 Excel 已就绪，可以生成报工天数表。'
    });
  });
});

describe('saveHtmlReport', () => {
  it('uses the browser save dialog when available so export has visible feedback', async () => {
    const writes = [];
    const result = await saveHtmlReport({
      html: '<!doctype html><html></html>',
      filename: 'report.html',
      windowRef: {
        showSaveFilePicker: async (options) => {
          expect(options.suggestedName).toBe('report.html');
          return {
            createWritable: async () => ({
              write: async (blob) => writes.push(await blob.text()),
              close: async () => writes.push('closed')
            })
          };
        }
      }
    });

    expect(result).toEqual({ status: 'saved', method: 'file-picker', filename: 'report.html' });
    expect(writes).toEqual(['<!doctype html><html></html>', 'closed']);
  });

  it('falls back to a download link and revokes the blob url after the click', async () => {
    const clicked = [];
    const revoked = [];
    const timers = [];
    const link = {
      style: {},
      click: () => clicked.push(link.href),
      remove: () => {}
    };

    const result = await saveHtmlReport({
      html: '<!doctype html><html></html>',
      filename: 'report.html',
      documentRef: {
        createElement: () => link,
        body: { append: () => {} }
      },
      windowRef: {
        URL: {
          createObjectURL: () => 'blob:test',
          revokeObjectURL: (url) => revoked.push(url)
        },
        setTimeout: (callback) => timers.push(callback)
      }
    });

    expect(result).toEqual({ status: 'downloaded', method: 'anchor', filename: 'report.html' });
    expect(link.download).toBe('report.html');
    expect(clicked).toEqual(['blob:test']);
    expect(revoked).toEqual([]);
    timers[0]();
    expect(revoked).toEqual(['blob:test']);
  });
});
