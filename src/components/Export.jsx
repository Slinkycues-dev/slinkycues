import { useMemo, useState } from 'react'
import { exportDocx } from '../lib/exportDocx'
import { monthKey, dayHeading } from '../lib/parseExport'

export default function Export({ entries, decisions, onRestart }) {
  const years = useMemo(() => [...new Set(entries.map((e) => e.date.getFullYear()))].sort(), [entries])
  const [year, setYear] = useState(years[years.length - 1])
  const [title, setTitle] = useState(`Slinkycues ${years[years.length - 1]}`)
  const [photoWidth, setPhotoWidth] = useState(70)
  const [status, setStatus] = useState('')

  const kept = new Set(Object.entries(decisions).filter(([, v]) => v).map(([k]) => k))
  const selected = entries.filter((e) => e.date.getFullYear() === year)
  const photoCount = selected.reduce((n, e) => n + e.media.filter((m) => kept.has(m.id)).length, 0)
  const words = selected.reduce((n, e) => n + `${e.caption} ${e.extra}`.split(/\s+/).filter(Boolean).length, 0)

  async function go() {
    setStatus('Building document…')
    try {
      await exportDocx(selected, kept, { title, photoWidthMm: photoWidth }, setStatus)
      setStatus('Downloaded. Drag the .docx into Google Drive and open it — it becomes a Google Doc.')
    } catch (e) {
      setStatus('Export failed: ' + e.message)
    }
  }

  return (
    <div className="panel">
      <h2>4 · Export</h2>
      <div className="form">
        <label>Year
          <select value={year} onChange={(e) => { setYear(+e.target.value); setTitle(`Slinkycues ${e.target.value}`) }}>
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
        </label>
        <label>Title <input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label>Photo width <input type="range" min="40" max="110" value={photoWidth} onChange={(e) => setPhotoWidth(+e.target.value)} /> {photoWidth} mm</label>
      </div>
      <p className="muted">
        {selected.length} days · {words.toLocaleString()} words · {photoCount} photos · A5, mirrored margins for double-sided printing, page numbers, one month per section.
      </p>
      <button className="btn primary" onClick={go} disabled={!selected.length}>Download .docx</button>
      {status && <p className="status">{status}</p>}

      <h3>Preview</h3>
      <div className="preview">
        {selected.slice(0, 6).map((e) => (
          <div key={e.id} className="entry">
            <div className="muted small">{monthKey(e.date)}</div>
            <b>{dayHeading(e.date)}</b>
            <p>{e.caption}</p>
            {e.extra && <p>{e.extra}</p>}
            {e.media.filter((m) => kept.has(m.id) && m.blob).map((m) => (
              <img key={m.id} src={URL.createObjectURL(m.blob)} style={{ width: `${photoWidth * 2}px` }} alt="" />
            ))}
          </div>
        ))}
        {selected.length > 6 && <p className="muted">…and {selected.length - 6} more days.</p>}
      </div>
      <p className="center"><button className="link" onClick={onRestart}>Start over with a different export</button></p>
    </div>
  )
}
