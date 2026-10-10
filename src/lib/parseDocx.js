import JSZip from 'jszip'

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
// Forgiving: "Tueday 8th August", "Sunday 29tg August", "==Friday 6th August", "Saturday 3rd July.",
// "Wednesday the whatever 2nd March", "Friday 20th & Saturday 21st October", "Sunday 26th Boxing day December"
const WEEKDAY_RE = /^\W*(mon|tue|tues|wed|wednes|thu|thur|thurs|fri|sat|satur|sun)[a-z]*day\b/i
const MONTH_RE = new RegExp(`\\b(${MONTHS.join('|')})\\b(?:\\s+(\\d{4}))?`, 'i')

function parseDayHeading(text) {
  const t = text.trim()
  if (t.length > 70 || !WEEKDAY_RE.test(t)) return null
  const mo = t.match(MONTH_RE)
  if (!mo) return null
  const num = t.slice(0, mo.index).match(/(?<!\d)(\d{1,2})(?!\d)/) // first number before the month = the day
  if (!num) return null
  const day = +num[1]
  if (day < 1 || day > 31) return null
  return { day, month: MONTHS.indexOf(mo[1].toLowerCase()), year: mo[2] ? +mo[2] : null, label: t.replace(/^\W+|[.\s]+$/g, '') }
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

/**
 * Parse one of the old year .docx files.
 * Each day = a paragraph whose text is "Weekday 3rd January [2023]" (any style), followed by body paragraphs and images.
 * Returns { entries, warnings } in the same shape as parseInstagramZip.
 */
export async function parseDiaryDocx(file, onProgress = () => {}, yearHint = null) {
  onProgress('Opening document…')
  const zip = await JSZip.loadAsync(file)
  const docXml = await zip.file('word/document.xml')?.async('string')
  if (!docXml) throw new Error('That does not look like a .docx file.')
  const relsXml = (await zip.file('word/_rels/document.xml.rels')?.async('string')) || ''

  const rels = {}
  for (const m of relsXml.matchAll(/<Relationship\s+([^>]*)\/?>/g)) {
    const id = m[1].match(/Id="([^"]+)"/)?.[1]
    const target = m[1].match(/Target="([^"]+)"/)?.[1]
    if (id && target) rels[id] = target.startsWith('/') ? target.slice(1) : 'word/' + target
  }

  const doc = new DOMParser().parseFromString(docXml, 'application/xml')
  const body = doc.getElementsByTagNameNS(W, 'body')[0]
  const paras = Array.from(body.getElementsByTagNameNS(W, 'p'))

  // Year: from filename, hint, or first dated heading that carries one
  let year = yearHint || +(file.name?.match(/(20\d\d)/)?.[1] || 0) || null

  const entries = []
  const warnings = []
  let cur = null
  let imgN = 0
  onProgress('Reading days…')

  for (let i = 0; i < paras.length; i++) {
    const p = paras[i]
    const text = Array.from(p.getElementsByTagNameNS(W, 't')).map((t) => t.textContent).join('')
    const trimmed = text.trim()
    const head = parseDayHeading(trimmed)
    if (head) {
      if (head.year && !year) year = head.year
      if (!year) {
        warnings.push('Could not work out the year - add it to the filename, e.g. "2022.docx".')
        year = new Date().getFullYear()
      }
      const date = new Date(year, head.month, head.day)
      const ts = Math.floor(date.getTime() / 1000)
      cur = { id: String(ts), ts, date, caption: '', extra: '', media: [], paras: [], label: head.label }
      // Two-day headings ("Friday 20th & Saturday 21st October") keep their own wording
      if ((head.label.match(/day\b/gi) || []).length > 1) cur.heading = head.label
      entries.push(cur)
      continue
    }
    if (!cur) continue // cover page etc.

    // images in this paragraph
    for (const blip of Array.from(p.getElementsByTagNameNS(A, 'blip'))) {
      const rid = blip.getAttributeNS(R, 'embed')
      const path = rels[rid]
      const zf = path && zip.file(path)
      if (!zf) continue
      let blob = await zf.async('blob')
      const ext = path.split('.').pop().toLowerCase()
      const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg'
      blob = blob.slice(0, blob.size, mime)
      cur.media.push({ id: `${cur.ts}-${imgN++}`, uri: path, blob })
    }
    if (trimmed) cur.paras.push(trimmed)
    if (i % 200 === 0) onProgress(`Reading days… ${entries.length}`)
  }

  for (const e of entries) {
    e.caption = e.paras.join('\n')
    delete e.paras
  }
  if (!entries.length) throw new Error('No day headings found. Days need to read like "Tuesday 3rd January".')

  // A stray year in one heading ("...March 2022" inside the 2023 book) is a typo: snap to the book's year.
  const yearCounts = {}
  for (const e of entries) yearCounts[e.date.getFullYear()] = (yearCounts[e.date.getFullYear()] || 0) + 1
  const bookYear = +Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0][0]
  const fixedYears = []
  for (const e of entries) {
    if (e.date.getFullYear() !== bookYear) {
      fixedYears.push(e.label)
      e.date = new Date(bookYear, e.date.getMonth(), e.date.getDate())
      e.ts = Math.floor(e.date.getTime() / 1000)
      e.id = String(e.ts)
    }
  }
  if (fixedYears.length) warnings.push(`Year corrected to ${bookYear} on: ${fixedYears.join('; ')}`)

  // Where the written weekday doesn't match the date, keep what you wrote and tell you.
  const mismatched = []
  for (const e of entries) {
    const wd = e.label.match(WEEKDAY_RE)?.[1]?.toLowerCase().slice(0, 3)
    const real = e.date.toLocaleDateString('en-GB', { weekday: 'long' }).toLowerCase().slice(0, 3)
    if (wd && wd !== real) {
      mismatched.push(e.label)
      if (!e.heading) e.heading = e.label
    }
  }
  if (mismatched.length) warnings.push(`Weekday doesn't match the date (left as written): ${mismatched.join('; ')}`)
  for (const e of entries) delete e.label

  return { entries, username: '', warnings }
}
