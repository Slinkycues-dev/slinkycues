import {
  Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType,
  PageBreak, Header, Footer, PageNumber, convertMillimetersToTwip,
} from 'docx'
import { saveAs } from 'file-saver'
import JSZip from 'jszip'
import { monthKey, dayHeading } from './parseExport'

const mm = convertMillimetersToTwip
const FONT = 'Georgia'

async function blobToResized(blob, maxPx = 1400) {
  // Downscale so the .docx stays a sane size; returns {buf, w, h} in px
  const bmp = await createImageBitmap(blob)
  const scale = Math.min(1, maxPx / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale)
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  c.getContext('2d').drawImage(bmp, 0, 0, w, h)
  const out = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86))
  return { buf: await out.arrayBuffer(), w, h }
}

/**
 * entries: curated entries; keptPhotos: Set of media ids to include
 * opts: { title, photoWidthMm }
 */
export async function exportDocx(entries, keptPhotos, opts = {}, onProgress = () => {}) {
  const title = opts.title || 'Diary'
  const photoWidthMm = opts.photoWidthMm || 70
  const children = []

  // Title page
  children.push(
    new Paragraph({ spacing: { before: mm(60) } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: title, font: FONT, size: 56, bold: true })],
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
          heading: HeadingLevel.HEADING_1,
          spacing: { after: mm(4) },
          children: [new TextRun({ text: mk.split(' ')[0].toUpperCase(), font: FONT, size: 40, bold: true })],
        })
      )
      lastMonth = mk
    }

    children.push(
      new Paragraph({
        keepNext: true,
        spacing: { before: mm(4), after: mm(1) },
        children: [new TextRun({ text: dayHeading(e.date), font: FONT, size: 21, bold: true })],
      })
    )

    const body = [e.caption, e.extra].filter(Boolean).join('\n')
    const paras = body.split(/\n+/).filter((p) => p.trim())
    for (let i = 0; i < paras.length; i++) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          indent: i > 0 ? { firstLine: mm(6) } : undefined,
          spacing: { line: 264 },
          children: [new TextRun({ text: paras[i].trim(), font: FONT, size: 20 })],
        })
      )
    }

    for (const m of e.media) {
      if (!keptPhotos.has(m.id) || !m.blob) continue
      try {
        const { buf, w, h } = await blobToResized(m.blob)
        const widthPx = (photoWidthMm / 25.4) * 96
        const heightPx = widthPx * (h / w)
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: mm(2), after: mm(2) },
            children: [
              new ImageRun({
                type: 'jpg',
                data: buf,
                transformation: { width: Math.round(widthPx), height: Math.round(heightPx) },
              }),
            ],
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
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: mm(148), height: mm(210) }, // A5
            // left/right equal + gutter; mirrorMargins (injected below) moves the gutter to the inside edge
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
                children: [new TextRun({ text: title, font: FONT, size: 16, color: '777777' })],
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
  const blob = await addMirrorMargins(await Packer.toBlob(doc))
  saveAs(blob, `${title.replace(/[^\w\- ]+/g, '')}.docx`)
}

// docx-js has no mirrorMargins option, so flip it on in settings.xml directly.
export async function addMirrorMargins(blob) {
  const zip = await JSZip.loadAsync(blob)
  const f = zip.file('word/settings.xml')
  if (!f) return blob
  let xml = await f.async('string')
  if (!xml.includes('<w:mirrorMargins')) xml = xml.replace(/(<w:settings[^>]*>)/, '$1<w:mirrorMargins/>')
  zip.file('word/settings.xml', xml)
  return zip.generateAsync({ type: 'blob', mimeType: blob.type })
}
