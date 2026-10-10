import {
  Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType,
  PageBreak, Header, Footer, PageNumber, convertMillimetersToTwip,
} from 'docx'
import fileSaver from 'file-saver'
const { saveAs } = fileSaver
import JSZip from 'jszip'
import { monthKey, dayHeading } from './parseExport.js'

const mm = convertMillimetersToTwip

export const DEFAULTS = {
  font: 'Garamond',
  bodyPt: 10,
  dayPt: 11,
  monthPt: 18,
  accent: '1C4587', // per-year colour for month + day headings
  photoWidthMm: 70,
  indentMm: 8,
  // Cover page (all optional)
  cover: null,       // {buf,w,h} image for the cover
  coverFull: false,  // true = image fills the page, title sits in a box over it
  song: '',          // e.g. 'Music Is the Answer – Joe Goddard feat. SLO'
  songBadge: null,   // {buf,w,h} small icon shown before the song
  subtitle: '',      // e.g. 'age 20/21'
}

// Page geometry (A5 with our margins) — handy for cover layout
const PAGE_W_MM = 148, PAGE_H_MM = 210
const TEXT_W_MM = PAGE_W_MM - 13 - 13 - 6 // margins + gutter
const TEXT_H_MM = PAGE_H_MM - 15 - 15

async function blobToResized(blob, maxPx = 1400) {
  const bmp = await createImageBitmap(blob)
  const scale = Math.min(1, maxPx / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale)
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  c.getContext('2d').drawImage(bmp, 0, 0, w, h)
  const out = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86))
  return { buf: await out.arrayBuffer(), w, h }
}

const pxOf = (mmv) => Math.round((mmv / 25.4) * 96)

function img(image, widthMm, extra = {}) {
  const w = pxOf(widthMm), h = Math.round(w * (image.h / image.w))
  return new ImageRun({ type: 'png', data: image.buf, transformation: { width: w, height: h }, ...extra })
}

/** Cover: photo + title + optional subtitle, song line bottom-left with a badge. */
function coverPage(o, title, FONT) {
  const out = []
  const songLine = () =>
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        ...(o.songBadge ? [img(o.songBadge, 5), new TextRun({ text: '  ', font: FONT })] : []),
        new TextRun({ text: o.song, font: FONT, size: 18, color: '555555' }),
      ],
    })

  if (o.cover && o.coverFull) {
    // Full-page artwork that already carries its own title; we only add the song line underneath.
    const songH = o.song ? 9 : 0
    let hmm = TEXT_H_MM - songH, wmm = hmm * (o.cover.w / o.cover.h)
    if (wmm > TEXT_W_MM) { wmm = TEXT_W_MM; hmm = wmm * (o.cover.h / o.cover.w) }
    out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: mm(2) }, children: [img(o.cover, wmm)] }))
    if (o.song) out.push(songLine())
  } else {
    // Photo above, title below
    if (o.cover) {
      const maxH = TEXT_H_MM * 0.55
      let wmm = TEXT_W_MM
      if (wmm * (o.cover.h / o.cover.w) > maxH) wmm = maxH * (o.cover.w / o.cover.h)
      out.push(new Paragraph({ spacing: { before: mm(10) } }))
      out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [img(o.cover, wmm)] }))
    } else out.push(new Paragraph({ spacing: { before: mm(70) } }))
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: mm(10) },
        children: [new TextRun({ text: title, font: FONT, size: 56, bold: true, color: o.accent })],
      })
    )
    if (o.subtitle)
      out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: o.subtitle, font: FONT, size: 24, color: '666666' })] }))
    if (o.song) {
      out.push(new Paragraph({ spacing: { before: mm(o.cover ? 22 : 60) } }))
      out.push(songLine())
    }
  }
  out.push(new Paragraph({ children: [new PageBreak()] }))
  return out
}

/** Split an entry's text into paragraphs: each Instagram line break = one indented paragraph. */
export function paragraphsOf(e) {
  return [e.caption, e.extra].filter(Boolean).join('\n').split(/\n+/).map((s) => s.trim()).filter(Boolean)
}

/**
 * Build the docx. entries: curated entries; keptPhotos: Set of media ids.
 * loadImage(media) -> {buf,w,h} lets node tests supply images without canvas.
 */
export async function buildDocx(entries, keptPhotos, opts = {}, onProgress = () => {}, loadImage = (m) => blobToResized(m.blob)) {
  const o = { ...DEFAULTS, ...opts }
  const title = o.title || 'Diary'
  const FONT = o.font
  const children = []

  children.push(...coverPage(o, title, FONT))

  let lastMonth = null
  let n = 0
  for (const e of entries) {
    n++
    if (n % 20 === 0) onProgress(`Writing ${n}/${entries.length}…`)
    const mk = monthKey(e.date)
    if (mk !== lastMonth) {
      if (lastMonth) children.push(new Paragraph({ children: [new PageBreak()] }))
      children.push(
        new Paragraph({
          keepNext: true,
          spacing: { after: mm(5) },
          children: [new TextRun({ text: mk.split(' ')[0].toUpperCase(), font: FONT, size: o.monthPt * 2, bold: true, color: o.accent })],
        })
      )
      lastMonth = mk
    }

    children.push(
      new Paragraph({
        keepNext: true,
        spacing: { before: mm(5), after: mm(1) },
        children: [new TextRun({ text: (e.heading || dayHeading(e.date)), font: FONT, size: o.dayPt * 2, bold: true, color: o.accent })],
      })
    )

    const paras = paragraphsOf(e)
    for (let i = 0; i < paras.length; i++) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          indent: i > 0 ? { firstLine: mm(o.indentMm) } : undefined,
          spacing: { line: 276 },
          children: [new TextRun({ text: paras[i], font: FONT, size: o.bodyPt * 2 })],
        })
      )
    }

    for (const m of e.media) {
      if (!keptPhotos.has(m.id)) continue
      try {
        const { buf, w, h } = await loadImage(m)
        const widthPx = (o.photoWidthMm / 25.4) * 96
        const heightPx = widthPx * (h / w)
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: mm(2), after: mm(2) },
            children: [new ImageRun({ type: 'jpg', data: buf, transformation: { width: Math.round(widthPx), height: Math.round(heightPx) } })],
          })
        )
      } catch (err) {
        console.warn('photo skipped', m.id, err)
      }
    }
  }

  const doc = new Document({
    creator: 'Slinkycues',
    title,
    styles: { default: { document: { run: { font: FONT, size: o.bodyPt * 2 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: mm(148), height: mm(210) }, // A5
            // left/right equal + gutter; mirrorMargins (injected below) puts the gutter on the inside edge
            margin: { top: mm(15), bottom: mm(15), left: mm(13), right: mm(13), gutter: mm(6) },
            pageNumbers: { start: 1 },
          },
          titlePage: true,
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: title, font: FONT, size: 16, color: '888888' })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16 })],
              }),
            ],
          }),
        },
        children,
      },
    ],
  })

  onProgress('Packing document…')
  return addMirrorMargins(await Packer.toBlob(doc))
}

export async function exportDocx(entries, keptPhotos, opts = {}, onProgress = () => {}) {
  const blob = await buildDocx(entries, keptPhotos, opts, onProgress)
  saveAs(blob, `${(opts.title || 'Diary').replace(/[^\w\- ]+/g, '')}.docx`)
}

// docx-js has no mirrorMargins option, so flip it on in settings.xml directly.
export async function addMirrorMargins(blob) {
  const zip = await JSZip.loadAsync(blob)
  const f = zip.file('word/settings.xml')
  if (!f) return blob
  let xml = await f.async('string')
  if (!xml.includes('<w:mirrorMargins')) xml = xml.replace(/(<w:settings[^>]*>)/, '$1<w:mirrorMargins/>')
  zip.file('word/settings.xml', xml)
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}
