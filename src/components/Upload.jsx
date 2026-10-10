import { useState } from 'react'
import { parseInstagramZip } from '../lib/parseExport.js'
import { parseDiaryDocx } from '../lib/parseDocx.js'

export default function Upload({ onLoaded }) {
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)

  async function handle(file) {
    if (!file) return
    setError('')
    setStatus('Opening file…')
    try {
      const name = file.name.toLowerCase()
      const result = name.endsWith('.docx')
        ? await parseDiaryDocx(file, setStatus)
        : await parseInstagramZip(file, setStatus)
      onLoaded({ ...result, source: name.endsWith('.docx') ? 'docx' : 'instagram' })
    } catch (e) {
      setError(e.message)
      setStatus('')
    }
  }

  return (
    <div className="panel">
      <h2>1 · Upload</h2>
      <div
        className={`drop ${drag ? 'drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]) }}
      >
        <p className="big">Drop a file here</p>
        <p className="muted">an Instagram export <b>.zip</b> for a new year, or an old year's Google Doc as <b>.docx</b></p>
        <label className="btn">
          Choose file
          <input type="file" accept=".zip,.docx" hidden onChange={(e) => handle(e.target.files[0])} />
        </label>
        {status && <p className="status">{status}</p>}
        {error && <p className="error">{error}</p>}
      </div>

      <details className="help">
        <summary>New year: how to get the export from Instagram</summary>
        <ol>
          <li>Instagram → <b>Settings</b> → <b>Accounts Centre</b> → <b>Your information and permissions</b> → <b>Download your information</b>.</li>
          <li><b>Download or transfer information</b> → pick your Instagram account → <b>Some of your information</b>.</li>
          <li>Tick <b>Media</b> (posts) and <b>Comments</b> (for days where the diary ran into a comment). Nothing else is needed.</li>
          <li><b>Download to device</b>. Date range: the year you want. Format: <b>JSON</b>. Media quality: <b>High</b>.</li>
          <li>Instagram emails you a link within a few hours to a day. Download the zip and drop it above - don't unzip it.</li>
        </ol>
      </details>
      <details className="help">
        <summary>Old year: how to get the Google Doc</summary>
        <ol>
          <li>Open the year's Google Doc → <b>File</b> → <b>Download</b> → <b>Microsoft Word (.docx)</b>.</li>
          <li>Make sure the year is in the filename (e.g. <code>2022.docx</code>) if the day headings don't include it.</li>
          <li>Days are recognised from headings like "Tuesday 3rd January". Photos are picked up wherever they sit in the day.</li>
        </ol>
      </details>
      <p className="muted small">Everything runs in your browser - nothing is uploaded anywhere.</p>
    </div>
  )
}
