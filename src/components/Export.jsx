import { useEffect, useMemo, useState } from 'react'
import { exportDocx, DEFAULTS } from '../lib/exportDocx.js'
import { markYearDone } from '../lib/store'
import { monthKey, dayHeading } from '../lib/parseExport.js'

const PRESETS = [
  { name: 'Yellow (2021)', hex: 'F1C232' },
  { name: 'Blue (2023)', hex: '1C4587' },
  { name: 'Turquoise', hex: '1FA39A' },
  { name: 'Burnt orange', hex: 'C65D1E' },
  { name: 'Forest', hex: '2B5D4F' },
  { name: 'Plum', hex: '6B2D5C' },
  { name: 'Crimson', hex: 'A51C30' },
  { name: 'Slate', hex: '3B4A5A' },
]

const SETTINGS_KEY = 'slinky:exportSettings'
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') } catch { return {} }
}

async function fileToImage(file) {
  const bmp = await createImageBitmap(file)
  const max = 2000
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
  return { buf: await blob.arrayBuffer(), w: c.width, h: c.height, url: URL.createObjectURL(blob) }
}

// Small music badge drawn on a canvas (green disc + play triangle)
async function makeBadge() {
  const s = 128, c = document.createElement('canvas'); c.width = c.height = s
  const g = c.getContext('2d')
  g.fillStyle = '#1DB954'; g.beginPath(); g.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(s * 0.4, s * 0.28); g.lineTo(s * 0.4, s * 0.72); g.lineTo(s * 0.76, s * 0.5); g.fill()
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
  return { buf: await blob.arrayBuffer(), w: s, h: s }
}

export default function Export({ entries, decisions, onRestart }) {
  const years = useMemo(() => [...new Set(entries.map((e) => e.date.getFullYear()))].sort(), [entries])
  const saved = loadSettings()
  const [year, setYear] = useState(years[years.length - 1])
  const [title, setTitle] = useState(`Slinkycues in ${years[years.length - 1]}`)
  const [subtitle, setSubtitle] = useState('')
  const [song, setSong] = useState('')
  const [accent, setAccent] = useState(saved.accent || DEFAULTS.accent)
  const [bodyPt, setBodyPt] = useState(saved.bodyPt || DEFAULTS.bodyPt)
  const [photoWidth, setPhotoWidth] = useState(saved.photoWidthMm || DEFAULTS.photoWidthMm)
  const [cover, setCover] = useState(null)
  const [coverFull, setCoverFull] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ accent, bodyPt, photoWidthMm: photoWidth }))
  }, [accent, bodyPt, photoWidth])

  const kept = new Set(Object.entries(decisions).filter(([, v]) => v).map(([k]) => k))
  const selected = entries.filter((e) => e.date.getFullYear() === year)
  const photoCount = selected.reduce((n, e) => n + e.media.filter((m) => kept.has(m.id)).length, 0)
  const words = selected.reduce((n, e) => n + `${e.caption} ${e.extra}`.split(/\s+/).filter(Boolean).length, 0)

  async function go() {
    setStatus('Building document…')
    try {
      const songBadge = song ? await makeBadge() : null
      await exportDocx(
        selected, kept,
        { title, subtitle, song, songBadge, accent, bodyPt, dayPt: bodyPt + 1, monthPt: bodyPt + 8, photoWidthMm: photoWidth, cover, coverFull },
        setStatus
      )
      markYearDone(year)
      setStatus('Downloaded. Drag the .docx into Google Drive and open it - it becomes a Google Doc.')
    } catch (e) {
      setStatus('Export failed: ' + e.message)
    }
  }

  return (
    <div className="panel">
      <h2>4 · Export</h2>
      <div className="form">
        <label>Year
          <select value={year} onChange={(e) => { setYear(+e.target.value); setTitle(`Slinkycues in ${e.target.value}`) }}>
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
        </label>
        <label>Title <input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label>Subtitle <input value={subtitle} placeholder="e.g. age 20/21 (optional)" onChange={(e) => setSubtitle(e.target.value)} /></label>
        <label>Song <input value={song} placeholder="e.g. Kaleidoscope Colours – Jan Blomqvist" onChange={(e) => setSong(e.target.value)} /></label>

        <label>Colour
          <span className="swatches">
            {PRESETS.map((p) => (
              <button key={p.hex} type="button" title={p.name} className={`swatch ${accent === p.hex ? 'on' : ''}`} style={{ background: '#' + p.hex }} onClick={() => setAccent(p.hex)} />
            ))}
            <input type="color" value={'#' + accent} onChange={(e) => setAccent(e.target.value.slice(1).toUpperCase())} title="Custom" />
          </span>
        </label>

        <label>Cover photo
          <input type="file" accept="image/*" onChange={async (e) => e.target.files[0] && setCover(await fileToImage(e.target.files[0]))} />
          {cover && <img src={cover.url} alt="" className="coverThumb" />}
        </label>
        {cover && (
          <label className="check"><input type="checkbox" checked={coverFull} onChange={(e) => setCoverFull(e.target.checked)} /> Artwork already includes the title - use it full-page, don't add a title</label>
        )}

        <label>Body text <input type="range" min="9" max="12" step="0.5" value={bodyPt} onChange={(e) => setBodyPt(+e.target.value)} /> {bodyPt} pt</label>
        <label>Photo width <input type="range" min="40" max="110" value={photoWidth} onChange={(e) => setPhotoWidth(+e.target.value)} /> {photoWidth} mm</label>
      </div>

      <p className="muted">
        {selected.length} days · {words.toLocaleString()} words · {photoCount} photos · A5, mirrored margins for double-sided printing, page numbers, each month on a new page.
      </p>
      <button className="btn primary" onClick={go} disabled={!selected.length}>Download .docx</button>
      {status && <p className="status">{status}</p>}

      <h3>Preview</h3>
      <div className="preview" style={{ '--accent': '#' + accent }}>
        {selected.slice(0, 5).map((e) => (
          <div key={e.id} className="entry">
            <div className="muted small">{monthKey(e.date)}</div>
            <b style={{ color: 'var(--accent)' }}>{(e.heading || dayHeading(e.date))}</b>
            {`${e.caption}\n${e.extra}`.split(/\n+/).filter(Boolean).map((p, i) => <p key={i} className={i ? 'ind' : ''}>{p}</p>)}
            {e.media.filter((m) => kept.has(m.id) && m.blob).map((m) => (
              <img key={m.id} src={URL.createObjectURL(m.blob)} style={{ width: `${photoWidth * 2}px` }} alt="" />
            ))}
          </div>
        ))}
        {selected.length > 5 && <p className="muted">…and {selected.length - 5} more days.</p>}
      </div>
      <p className="center"><button className="link" onClick={onRestart}>Start over with a different file</button></p>
    </div>
  )
}
