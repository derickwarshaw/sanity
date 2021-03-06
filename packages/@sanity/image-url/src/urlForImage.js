import parseSource from './parseSource'
import parseAssetId from './parseAssetId'

const SPEC_NAME_TO_URL_NAME_MAPPINGS = [
  ['width', 'w'],
  ['height', 'h'],
  ['format', 'fm'],
  ['download', 'dl'],
  ['blur', 'blur'],
  ['sharpen', 'sharp'],
  ['invert', 'invert'],
  ['orientation', 'or'],
  ['minHeight', 'min-h'],
  ['maxHeight', 'max-h'],
  ['minWidth', 'min-w'],
  ['maxWidth', 'max-w'],
  ['quality', 'q'],
  ['fit', 'fit'],
  ['crop', 'crop']
]

export default function urlForImage(options) {
  let spec = Object.assign({}, options || {})
  const source = spec.source
  delete spec.source

  const image = parseSource(source)
  if (!image) {
    return null
  }

  const asset = parseAssetId(image.asset._ref)

  // Compute crop rect in terms of pixel coordinates in the raw source image
  const crop = {
    left: Math.round(image.crop.left * asset.width),
    top: Math.round(image.crop.top * asset.height)
  }

  crop.width = Math.round(asset.width - image.crop.right * asset.width - crop.left)
  crop.height = Math.round(asset.height - image.crop.bottom * asset.height - crop.top)

  // Compute hot spot rect in terms of pixel coordinates
  const hotSpotVerticalRadius = image.hotspot.height * asset.height / 2
  const hotSpotHorizontalRadius = image.hotspot.width * asset.width / 2
  const hotSpotCenterX = image.hotspot.x * asset.width
  const hotSpotCenterY = image.hotspot.y * asset.height
  const hotspot = {
    left: hotSpotCenterX - hotSpotHorizontalRadius,
    top: hotSpotCenterY - hotSpotVerticalRadius,
    right: hotSpotCenterX + hotSpotHorizontalRadius,
    bottom: hotSpotCenterY + hotSpotHorizontalRadius
  }

  spec.asset = asset

  // If irrelevant, or if we are requested to: don't perform crop/fit based on
  // the crop/hotspot.
  if (!(spec.rect || spec.focalPoint || spec.ignoreImageParams || spec.crop)) {
    spec = Object.assign(spec, fit({crop, hotspot}, spec))
  }

  return specToImageUrl(spec)
}

// eslint-disable-next-line complexity
function specToImageUrl(spec) {
  const cdnUrl = spec.baseUrl || 'https://cdn.sanity.io'
  const filename = `${spec.asset.id}-${spec.asset.width}x${spec.asset.height}.${spec.asset.format}`
  const baseUrl = `${cdnUrl}/images/${spec.projectId}/${spec.dataset}/${filename}`

  const params = []

  if (spec.rect) {
    // Only bother url with a crop if it actually crops anything
    const isEffectiveCrop =
      spec.rect.left != 0 ||
      spec.rect.top != 0 ||
      spec.rect.height != spec.asset.height ||
      spec.rect.width != spec.asset.width
    if (isEffectiveCrop) {
      params.push(`rect=${spec.rect.left},${spec.rect.top},${spec.rect.width},${spec.rect.height}`)
    }
  }

  if (spec.focalPoint) {
    params.push(`fp-x=${spec.focalPoint.x}`)
    params.push(`fp-x=${spec.focalPoint.y}`)
  }

  if (spec.flipHorizontal || spec.flipVertical) {
    params.push(`flip=${spec.flipHorizontal ? 'h' : ''}${spec.flipVertical ? 'v' : ''}`)
  }

  // Map from spec name to url param name, and allow using the actual param name as an alternative
  SPEC_NAME_TO_URL_NAME_MAPPINGS.forEach(mapping => {
    const [specName, param] = mapping
    if (typeof spec[specName] !== 'undefined') {
      params.push(`${param}=${encodeURIComponent(spec[specName])}`)
    } else if (typeof spec[param] !== 'undefined') {
      params.push(`${param}=${encodeURIComponent(spec[param])}`)
    }
  })

  if (params.length === 0) {
    return baseUrl
  }

  return `${baseUrl}?${params.join('&')}`
}

function fit(source, spec) {
  const result = {
    width: spec.width,
    height: spec.height
  }

  // If we are not constraining the aspect ratio, we'll just use the whole crop
  if (!(spec.width && spec.height)) {
    result.rect = source.crop
    return result
  }

  const crop = source.crop
  const hotspot = source.hotspot

  // If we are here, that means aspect ratio is locked and fitting will be a bit harder
  const desiredAspectRatio = spec.width / spec.height
  const cropAspectRatio = crop.width / crop.height

  if (cropAspectRatio > desiredAspectRatio) {
    // The crop is wider than the desired aspect ratio. That means we are cutting from the sides
    const height = crop.height
    const width = height * desiredAspectRatio
    const top = crop.top
    // Center output horizontally over hotspot
    const hotspotXCenter = (hotspot.right - hotspot.left) / 2 + hotspot.left
    let left = hotspotXCenter - width / 2
    // Keep output within crop
    if (left < crop.left) {
      left = crop.left
    } else if (left + width > crop.left + crop.width) {
      left = crop.left + crop.width - width
    }
    result.rect = {
      left: Math.round(left),
      top: Math.round(top),
      width: Math.round(width),
      height: Math.round(height)
    }
    return result
  }
  // The crop is taller than the desired ratio, we are cutting from top and bottom
  const width = crop.width
  const height = width / desiredAspectRatio
  const left = crop.left
  // Center output vertically over hotspot
  const hotspotYCenter = (hotspot.bottom - hotspot.top) / 2 + hotspot.top
  let top = hotspotYCenter - height / 2
  // Keep output rect within crop
  if (top < crop.top) {
    top = crop.top
  } else if (top + height > crop.top + crop.height) {
    top = crop.top + crop.height - height
  }
  result.rect = {
    left: Math.floor(left),
    top: Math.floor(top),
    width: Math.round(width),
    height: Math.round(height)
  }
  return result
}

// For backwards-compatibility
export {parseSource}
