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
  bodyPt: 11,
  dayPt: 12,
  monthPt: 22,
  accent: '1C4587', // per-year colour for month + day headings
  photoWidthMm: 70,
  indentMm: 8,
}

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

  // Title page
  children.push(
    new Paragraph({ spacing: { before: mm(70) } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: title, font: FONT, size: 60, bold: true, color: o.accent })],
    }),
    new Paragraph({ children: [new PageBreak()] })
  )

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
        children: [new TextRun({ text: dayHeading(e.date), font: FONT, size: o.dayPt * 2, bold: true, color: o.accent })],
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
