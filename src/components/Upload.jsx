import { useState } from 'react'
import { parseInstagramZip } from '../lib/parseExport'

export default function Upload({ onLoaded }) {
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)

  async function handle(file) {
    if (!file) return
    setError('')
    setStatus('Opening zip…')
    try {
      const result = await parseInstagramZip(file, setStatus)
      onLoaded(result)
    } catch (e) {
      setError(e.message)
      setStatus('')
    }
  }

  return (
    <div className="panel">
      <h2>1 · Upload your Instagram export</h2>
      <div
        className={`drop ${drag ? 'drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]) }}
      >
        <p className="big">Drop the Instagram .zip here</p>
        <p className="muted">or</p>
        <label className="btn">
          Choose file
          <input type="file" accept=".zip" hidden onChange={(e) => handle(e.target.files[0])} />
        </label>
        {status && <p className="status">{status}</p>}
        {error && <p className="error">{error}</p>}
      </div>

      <details className="help">
        <summary>How to get the export from Instagram</summary>
        <ol>
          <li>Instagram → <b>Settings</b> → <b>Accounts Centre</b> → <b>Your information and permissions</b> → <b>Download your information</b>.</li>
          <li>Choose <b>Download or transfer information</b> → pick your Instagram account → <b>Some of your information</b>.</li>
          <li>Tick <b>Media</b> (posts) and <b>Comments</b> (for days where the diary ran into a comment). Nothing else is needed.</li>
          <li>Next: <b>Download to device</b>. Date range: pick the year you want. Format: <b>JSON</b>. Media quality: <b>High</b>.</li>
          <li>Instagram emails you a link within a few hours to a day. Download the zip and drop it above. Nothing is uploaded anywhere — it all runs in your browser.</li>
        </ol>
      </details>
    </div>
  )
}
