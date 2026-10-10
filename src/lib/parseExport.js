import JSZip from 'jszip'

// Instagram encodes non-ASCII text as UTF-8 bytes then writes them as latin-1 codepoints.
// e.g. "donâ\u0080\u0099t" -> "don't". Undo that.
export function fixEncoding(s) {
  if (!s) return ''
  try {
    const bytes = Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff)
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return decoded
  } catch {
    return s
  }
}

const IMG_RE = /\.(jpe?g|png|webp|heic)$/i

function isPostsFile(name) {
  const n = name.toLowerCase()
  return /(^|\/)posts(_\d+)?\.json$/.test(n) && n.includes('content')
}
function isCommentsFile(name) {
  const n = name.toLowerCase()
  return /(^|\/)post_comments(_\d+)?\.json$/.test(n)
}

/**
 * Parse an Instagram data-export zip into diary entries.
 * Returns { entries: [{id, date, dateKey, caption, media:[{id, uri, blob}]}], username, warnings }
 */
export async function parseInstagramZip(file, onProgress = () => {}) {
  const zip = await JSZip.loadAsync(file)
  const names = Object.keys(zip.files)
  const warnings = []

  const postFiles = names.filter(isPostsFile)
  if (!postFiles.length) {
    throw new Error(
      'Could not find posts JSON in this zip. Make sure you exported in JSON format and ticked "Media" (your posts).'
    )
  }

  onProgress('Reading posts…')
  let posts = []
  for (const name of postFiles) {
    const raw = JSON.parse(await zip.file(name).async('string'))
    const arr = Array.isArray(raw) ? raw : raw.ig_posts || raw.posts || []
    posts = posts.concat(arr)
  }

  // Own comments (used when captions overflow into a comment)
  onProgress('Reading comments…')
  let comments = []
  for (const name of names.filter(isCommentsFile)) {
    try {
      const raw = JSON.parse(await zip.file(name).async('string'))
      const arr = Array.isArray(raw) ? raw : raw.comments_media_comments || []
      for (const c of arr) {
        const smd = c.string_map_data || {}
        const text = fixEncoding(smd.Comment?.value || '')
        const owner = smd['Media Owner']?.value || ''
        const ts = smd.Time?.timestamp || c.timestamp
        if (text && ts) comments.push({ text, owner, ts: Number(ts) })
      }
    } catch (e) {
      warnings.push(`Could not read ${name}: ${e.message}`)
    }
  }

  // Work out username: the media owner that appears most in own comments
  const ownerCounts = {}
  for (const c of comments) ownerCounts[c.owner] = (ownerCounts[c.owner] || 0) + 1
  const username = Object.entries(ownerCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
  const ownComments = comments
    .filter((c) => !username || c.owner === username)
    .sort((a, b) => a.ts - b.ts)

  onProgress('Loading photos…')
  const entries = []
  let i = 0
  for (const post of posts) {
    i++
    if (i % 25 === 0) onProgress(`Loading photos… ${i}/${posts.length}`)
    const media = post.media || []
    const ts = Number(post.creation_timestamp || media[0]?.creation_timestamp || 0)
    if (!ts) continue
    const caption = fixEncoding(post.title || media[0]?.title || '')
    const date = new Date(ts * 1000)

    const mediaItems = []
    for (let m = 0; m < media.length; m++) {
      const uri = media[m].uri || ''
      if (!IMG_RE.test(uri)) continue // skip videos
      const zf = zip.file(uri) || zip.file(names.find((n) => n.endsWith(uri.split('/').slice(-2).join('/'))) || '')
      let blob = null
      if (zf) {
        try {
          blob = await zf.async('blob')
          blob = blob.slice(0, blob.size, 'image/jpeg')
        } catch {
          /* ignore */
        }
      }
      mediaItems.push({ id: `${ts}-${m}`, uri, blob })
    }

    entries.push({ id: String(ts), ts, date, caption, media: mediaItems, extra: '' })
  }

  entries.sort((a, b) => a.ts - b.ts)

  // Attach own comments to the post they most likely continue:
  // the latest post whose timestamp is before the comment, within 3 days.
  for (const c of ownComments) {
    let target = null
    for (const e of entries) {
      if (e.ts <= c.ts && c.ts - e.ts < 3 * 86400) target = e
      if (e.ts > c.ts) break
    }
    if (target) target.extra += (target.extra ? '\n' : '') + c.text
  }

  if (!entries.length) warnings.push('No posts with timestamps were found.')
  return { entries, username, warnings }
}

export function monthKey(date) {
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export function dayHeading(date) {
  const wd = date.toLocaleDateString('en-GB', { weekday: 'long' })
  const mo = date.toLocaleDateString('en-GB', { month: 'long' })
  return `${wd} ${ordinal(date.getDate())} ${mo}`
}
