export async function saveHtmlReport({ html, filename, documentRef, windowRef }) {
  const browserWindow = windowRef ?? globalThis.window;
  const browserDocument = documentRef ?? globalThis.document;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });

  if (typeof browserWindow?.showSaveFilePicker === 'function') {
    try {
      const handle = await browserWindow.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: 'HTML 文件',
            accept: { 'text/html': ['.html'] }
          }
        ]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { status: 'saved', method: 'file-picker', filename };
    } catch (error) {
      if (error?.name === 'AbortError') return { status: 'cancelled', method: 'file-picker', filename };
      throw error;
    }
  }

  const url = browserWindow.URL.createObjectURL(blob);
  try {
    const link = browserDocument.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    browserDocument.body.append(link);
    link.click();
    link.remove();
    return { status: 'downloaded', method: 'anchor', filename };
  } finally {
    const revoke = () => browserWindow.URL.revokeObjectURL(url);
    if (typeof browserWindow.setTimeout === 'function') {
      browserWindow.setTimeout(revoke, 1000);
    } else {
      revoke();
    }
  }
}
