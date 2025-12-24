export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function downloadArrayBuffer(buffer: ArrayBuffer, filename: string, mime: string) {
  downloadBlob(new Blob([buffer], { type: mime }), filename)
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}

export function downloadTextFile(content: string, filename: string, mime = 'text/plain;charset=utf-8') {
  downloadBlob(new Blob([content], { type: mime }), filename)
}
