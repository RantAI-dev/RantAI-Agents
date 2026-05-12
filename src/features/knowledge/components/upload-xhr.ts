export interface XhrUploadResult {
  ok: boolean
  status: number
  body: unknown
}

export function xhrUpload(
  url: string,
  formData: FormData,
  onProgress: (fraction: number) => void
): Promise<XhrUploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", url)
    xhr.responseType = "text"
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress(Math.min(1, e.loaded / e.total))
      }
    }
    xhr.upload.onload = () => onProgress(1)
    xhr.onload = () => {
      let body: unknown = null
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null
      } catch {
        body = { error: xhr.responseText || "Invalid server response" }
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body })
    }
    xhr.onerror = () => reject(new Error("Network error"))
    xhr.send(formData)
  })
}
