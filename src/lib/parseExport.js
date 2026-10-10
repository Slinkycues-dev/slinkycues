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

// posts_1.json (and posts_2.json…) hold the captions; plain posts.json is a different index file. Reels carry captions too.
function isPostsFile(name) {
  const n = name.toLowerCase()
  return /(^|\/)(posts_\d+|reels)\.json$/.test(n) && !n.includes('__macosx')
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const MONTH_RE = new RegExp(`\\b(${MONTHS.join('|')})\\b`, 'i')
const WEEKDAY_RE = /^\W*(mon|tue|tues|wed|wednes|thu|thur|thurs|fri|sat|satur|sun)[a-z]*day\b/i

/**
 * The first line of each caption is the date you wrote ("Monday 29 December", "Day 18 February").
 * Returns { date, heading, rest } or null when the first line isn't a date.
 */
export function splitDateLine(caption, postDate) {
  const lines = caption.split('\n')
  const first = (lines[0] || '').trim()
  if (first.length > 60) return null
  const mo = first.match(MONTH_RE)
  if (!mo) return null
  const num = first.slice(0, mo.index).match(/(?<!\d)(\d{1,2})(?!\d)/) || first.slice(mo.index).match(/(?<!\d)(\d{1,2})(?!\d)/)
  if (!num) return null
  const day = +num[1], month = MONTHS.indexOf(mo[1].toLowerCase())
  if (day < 1 || day > 31) return null
  // pick the year that puts this date nearest the post time (handles New Year posts)
  const y = postDate.getFullYear()
  const cands = [y - 1, y, y + 1].map((yy) => new Date(yy, month, day))
  const date = cands.sort((a, b) => Math.abs(a - postDate) - Math.abs(b - postDate))[0]
  const label = first.replace(/^\W+|[.\s]+$/g, '')
  const wd = label.match(WEEKDAY_RE)?.[1]?.toLowerCase().slice(0, 3)
  const real = date.toLocaleDateString('en-GB', { weekday: 'long' }).toLowerCase().slice(0, 3)
  const heading = wd && wd !== real ? label : null // keep your wording if the weekday disagrees with the date
  return { date, heading, rest: lines.slice(1).join('\n').replace(/^\s*\n+/, '') }
}
function isCommentsFile(name) {
  const n = name.toLowerCase()
  return /(^|\/)post_comments(_\d+)?\.json$/.test(n) && !n.includes('__macosx')
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
    const jsons = names.filter((n) => n.endsWith('.json')).slice(0, 12)
    const htmls = names.filter((n) => n.endsWith('.html')).length
    const hint = htmls && !jsons.length
      ? 'This export is in HTML format - request it again and choose JSON.'
      : jsons.length
        ? `JSON files found: ${jsons.join(', ')}${names.length > 12 ? ', …' : ''}`
        : `No JSON files in the zip at all (${names.length} files, e.g. ${names.slice(0, 5).join(', ')}).`
    throw new Error(`Could not find the posts file in this zip. ${hint}`)
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
    let caption = fixEncoding(post.title || media[0]?.title || '')
    let date = new Date(ts * 1000)
    let heading = null
    const split = splitDateLine(caption, date)
    if (split) {
      date = split.date
      heading = split.heading
      caption = split.rest
    } else {
      warnings.push(`No date line on the post from ${date.toDateString()} - used the post time.`)
    }

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

    entries.push({ id: String(ts), ts, postTs: ts, date, heading, caption, media: mediaItems, extra: '' })
  }

  // Sort by the date you wrote, then merge anything that landed on the same day (e.g. a post and a reel)
  entries.sort((a, b) => a.date - b.date || a.postTs - b.postTs)
  const merged = []
  for (const e of entries) {
    const prev = merged[merged.length - 1]
    if (prev && prev.date.toDateString() === e.date.toDateString()) {
      prev.caption = [prev.caption, e.caption].filter(Boolean).join('\n')
      prev.media.push(...e.media)
      prev.heading = prev.heading || e.heading
    } else merged.push(e)
  }
  entries.length = 0
  entries.push(...merged)
  for (const e of entries) {
    e.ts = e.postTs
    e.id = String(Math.floor(e.date.getTime() / 1000))
  }

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
