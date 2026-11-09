// Mọi ảnh phải đi qua hàm này trước khi upload (CLAUDE.md mục 11).
const MAX_SIDE = 1280
const TARGET_BYTES = 300 * 1024
const HARD_LIMIT_BYTES = 1024 * 1024 // khớp file_size_limit của bucket
const MIN_QUALITY = 0.5

export interface CompressedImage {
  blob: Blob
  width: number
  height: number
  mimeType: 'image/webp' | 'image/jpeg'
  ext: 'webp' | 'jpg'
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không nén được ảnh'))), type, quality),
  )
}

export async function compressImage(file: File): Promise<CompressedImage> {
  if (!file.type.startsWith('image/')) throw new Error('Chỉ hỗ trợ file ảnh')

  let bitmap: ImageBitmap
  try {
    // Giữ đúng chiều xoay theo EXIF; vẽ lại qua canvas sẽ loại bỏ EXIF (kể cả toạ độ GPS).
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error(`Không đọc được ảnh "${file.name}"`)
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  let mimeType: CompressedImage['mimeType'] = 'image/webp'
  let quality = 0.7
  let blob = await toBlob(canvas, mimeType, quality)
  if (blob.type !== 'image/webp') {
    // Trình duyệt không xuất được WebP → dùng JPEG
    mimeType = 'image/jpeg'
    quality = 0.75
    blob = await toBlob(canvas, mimeType, quality)
  }

  while (blob.size > TARGET_BYTES && quality > MIN_QUALITY) {
    quality = Math.max(MIN_QUALITY, quality - 0.1)
    blob = await toBlob(canvas, mimeType, quality)
  }

  if (blob.size > HARD_LIMIT_BYTES) throw new Error(`Ảnh "${file.name}" vẫn quá lớn sau khi nén`)

  return { blob, width, height, mimeType, ext: mimeType === 'image/webp' ? 'webp' : 'jpg' }
}
