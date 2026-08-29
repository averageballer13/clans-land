/* Shrink a picked file to a square the server will accept: 192px, webp where
   the browser can, png otherwise. Doing it here means nobody uploads a 4 MB
   photo to store a 40px avatar. */
export async function fileToClanImage(file, size = 192) {
  if (!file.type.startsWith('image/')) throw new Error('that file is not an image')
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const c = cv.getContext('2d')
  c.imageSmoothingQuality = 'high'
  c.drawImage(
    bitmap,
    (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,
    0, 0, size, size
  )
  bitmap.close?.()

  for (const [type, quality] of [['image/webp', 0.82], ['image/jpeg', 0.82], ['image/png', undefined]]) {
    const url = cv.toDataURL(type, quality)
    if (url.startsWith(`data:${type}`) && url.length < 120000) return url
  }
  throw new Error('that image will not shrink small enough')
}

/* The crest vocabulary, re-exported from the artwork module so panels and the
   server validator read from one list. */
export {
  CREST_SHAPES, CREST_FIELDS, CREST_CHARGES, CREST_INKS, CREST_GROUNDS,
  randomCrest, crestSvg, crestParts,
} from '../ui/crestArt.js'
