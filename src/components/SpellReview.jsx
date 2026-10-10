import { useEffect, useState } from 'react'
import { loadChecker, findTypos, applyFixes, learnWord } from '../lib/spellcheck'
import { dayHeading } from '../lib/parseExport'

export default function SpellReview({ entries, onDone }) {
  const [typos, setTypos] = useState(null)
  const [pos, setPos] = useState(0)
  const [accepted, setAccepted] = useState(new Set())

  useEffect(() => {
    let alive = true
    loadChecker().then((spell) => alive && setTypos(findTypos(entries, spell)))
    return () => { alive = false }
  }, [entries])

  function answer(yes) {
    const t = typos[pos]
    if (yes) setAccepted((s) => new Set(s).add(t.key))
    else learnWord(t.word) // you meant it — never ask about this word again
    setPos((p) => p + 1)
  }

  useEffect(() => {
    function key(e) {
      if (!typos || pos >= typos.length) return
      if (e.key === 'ArrowRight' || e.key === 'y') answer(true)
      else if (e.key === 'ArrowLeft' || e.key === 'n') answer(false)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  if (!typos) return <div className="panel"><h2>3 · Spell-check</h2><p className="status">Reading every entry…</p></div>

  const t = typos[pos]
  const finish = () => onDone(applyFixes(entries, typos, accepted))

  return (
    <div className="panel">
      <h2>3 · Spell-check</h2>
      <p className="muted">
        Only likely slips are shown (one letter off from a real word). Slang, names, "soooo" and anything you use often are left alone.
        <b> → / Y</b> = fix it · <b>← / N</b> = I meant that (and never ask again).
      </p>
      <div className="progress"><div style={{ width: `${(pos / Math.max(1, typos.length)) * 100}%` }} /></div>
      <p className="muted small">{pos} / {typos.length} · {accepted.size} fixes accepted</p>

      {t ? (
        <>
          <div className="typo">
            <div className="muted small">{dayHeading(t.date)}</div>
            <p className="ctx">{t.before}<mark>{t.word}</mark>{t.after}</p>
            <p className="big">
              <s>{t.word}</s> → <b>{t.suggestion}</b>
            </p>
          </div>
          <div className="row">
            <button className="btn big-btn skip" onClick={() => answer(false)}>✕ I meant it</button>
            <button className="btn" onClick={() => setPos((p) => Math.max(0, p - 1))} disabled={pos === 0}>↶ Back</button>
            <button className="btn big-btn keep" onClick={() => answer(true)}>✓ Fix it</button>
          </div>
          <p className="center"><button className="link" onClick={finish}>Skip the rest and export</button></p>
        </>
      ) : (
        <div className="done">
          <p className="big">{typos.length ? `Done — ${accepted.size} fixes will be applied.` : 'Nothing suspicious found.'}</p>
          <button className="btn primary" onClick={finish}>Continue to export →</button>
        </div>
      )}
    </div>
  )
}
