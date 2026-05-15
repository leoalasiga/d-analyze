export function getUploadFlowState({ staffFile, externalFile }) {
  if (!staffFile && !externalFile) {
    return {
      canAnalyze: false,
      message: '请上传自有员工 Excel 和外包 Excel。'
    };
  }
  if (!staffFile) {
    return {
      canAnalyze: false,
      message: '外包 Excel 已选择，请继续上传自有员工 Excel。'
    };
  }
  if (!externalFile) {
    return {
      canAnalyze: false,
      message: '自有员工 Excel 已选择，请继续上传外包 Excel。'
    };
  }
  return {
    canAnalyze: true,
    message: '两份 Excel 已就绪，可以生成报工天数表。'
  };
}
