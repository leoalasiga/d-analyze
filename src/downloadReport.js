export async function saveHtmlReport({ html, filename, documentRef, windowRef }) {
  const browserWindow = windowRef ?? globalThis.window;
  const browserDocument = documentRef ?? globalThis.document;
  if (!html) throw new Error('没有可导出的 HTML 内容');
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });

  const url = browserWindow.URL.createObjectURL(blob);
  try {
    const link = browserDocument.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    browserDocument.body.append(link);
    link.click();
    link.remove();
    return { status: 'downloaded', filename };
  } finally {
    const revoke = () => browserWindow.URL.revokeObjectURL(url);
    if (typeof browserWindow.setTimeout === 'function') {
      browserWindow.setTimeout(revoke, 1000);
    } else {
      revoke();
    }
  }
}
