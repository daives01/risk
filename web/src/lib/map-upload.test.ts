import { expect, test } from 'bun:test'
import { uploadImage } from './map-upload'

const file = new File(['image'], 'map.png', { type: 'image/png' })

function transport(response: Response) {
  return async (url: string, options: RequestInit) => {
    expect(url).toBe('https://upload.example/map')
    expect(options).toEqual({
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: file,
    })

    return response
  }
}

test('upload preserves the storage ID and accepts extra response fields', async () => {
  expect(
    String(
      await uploadImage(
        'https://upload.example/map',
        file,
        transport(Response.json({ storageId: 'storage-id', extra: true })),
      ),
    ),
  ).toBe('storage-id')
})

test.each(
  [null, [], 'storage-id', 12, {}, { storageId: null }, { storageId: 12 }, { storageId: '' }].map(
    (body) => ({ body }),
  ),
)('upload rejects malformed response %j', async ({ body }) => {
  await expect(
    uploadImage('https://upload.example/map', file, transport(Response.json(body))),
  ).rejects.toThrow('Invalid image upload response')
})

test('upload requires an own storage ID', async () => {
  const response = new Response()
  response.json = async () => Object.create({ storageId: 'inherited' })
  await expect(
    uploadImage('https://upload.example/map', file, transport(response)),
  ).rejects.toThrow('Invalid image upload response')
})

test('upload preserves JSON parsing errors and prioritizes HTTP failures', async () => {
  await expect(
    uploadImage('https://upload.example/map', file, transport(new Response('{'))),
  ).rejects.toBeInstanceOf(SyntaxError)
  await expect(
    uploadImage('https://upload.example/map', file, transport(new Response('{', { status: 500 }))),
  ).rejects.toThrow('Image upload failed')
})
