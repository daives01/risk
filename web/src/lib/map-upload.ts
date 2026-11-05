import type { Id } from '@backend/_generated/dataModel'

export async function uploadImage(
  uploadUrl: string,
  file: File,
  uploadFetch: (url: string, options: RequestInit) => Promise<Response> = fetch,
): Promise<Id<'_storage'>> {
  const response = await uploadFetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })

  if (!response.ok) {
    throw new Error('Image upload failed')
  }

  const body: unknown = await response.json()

  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body) ||
    !Object.hasOwn(body, 'storageId') ||
    !('storageId' in body) ||
    typeof body.storageId !== 'string' ||
    body.storageId.length === 0
  ) {
    throw new Error('Invalid image upload response')
  }

  // SAFETY: Convex upload responses encode storage IDs as strings. Only the SDK's nominal
  // wire type is added here; server v.id validation, existence and authorization remain authoritative.
  return body.storageId as Id<'_storage'>
}

export async function readImageDimensions(file: File) {
  const objectUrl = URL.createObjectURL(file)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Failed to read image dimensions'))
      img.src = objectUrl
    })

    return { width: image.naturalWidth, height: image.naturalHeight }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
