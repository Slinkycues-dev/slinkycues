import { useEffect, useMemo, useRef, useState } from 'react'
import { dayHeading } from '../lib/parseExport'
import { loadDecisions, saveDecisions, recordProgress } from '../lib/store'

export default function SwipeDeck({ entries, onDone }) {
  const cards = useMemo(
    () => entries.flatMap((e) => e.media.filter((m) => m.blob).map((m) => ({ ...m, entry: e }))),
    [entries]
  )
  const [decisions, setDecisions] = useState(loadDecisions)
  const [pos, setPos] = useState(() => {
    const d = loadDecisions()
    const first = cards.findIndex((c) => !(c.id in d))
    return first === -1 ? cards.length : first
  })
  const [drag, setDrag] = useState({ x: 0, active: false })
  const [flash, setFlash] = useState(null)
  const startX = useRef(0)
  const urls = useRef(new Map())

  function url(c) {
    if (!urls.current.has(c.id)) urls.current.set(c.id, URL.createObjectURL(c.blob))
    return urls.current.get(c.id)
  }
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), [])

  function decide(keep) {
    const c = cards[pos]
    if (!c) return
    const next = { ...decisions, [c.id]: keep }
    setDecisions(next)
    saveDecisions(next)
    recordProgress(entries, next)
    setFlash(keep ? 'keep' : 'skip')
    setTimeout(() => setFlash(null), 250)
    setPos((p) => p + 1)
    setDrag({ x: 0, active: false })
  }
  function undo() {
    if (pos === 0) return
    const c = cards[pos - 1]
    const next = { ...decisions }
    delete next[c.id]
    setDecisions(next)
    saveDecisions(next)
    recordProgress(entries, next)
    setPos((p) => p - 1)
  }

  useEffect(() => {
    function key(e) {
      if (e.key === 'ArrowRight') decide(true)
      else if (e.key === 'ArrowLeft') decide(false)
      else if (e.key === 'z' || e.key === 'Backspace') undo()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  const kept = Object.values(decisions).filter(Boolean).length
  const card = cards[pos]

  if (!cards.length)
    return (
      <div className="panel">
        <h2>2 · Photos</h2>
        <p>No photos found in this export.</p>
        <button className="btn primary" onClick={() => onDone(decisions)}>Continue →</button>
      </div>
    )

  return (
    <div className="panel deck">
      <h2>2 · Swipe the photos</h2>
      <p className="muted">
        → or swipe right to <b>keep</b> · ← or swipe left to <b>skip</b> · Z to undo. Progress is saved as you go.
      </p>
      <div className="progress"><div style={{ width: `${(pos / cards.length) * 100}%` }} /></div>
      <p className="muted small">{pos} / {cards.length} · {kept} kept</p>

      {card ? (
        <>
          <div
            className={`card ${flash || ''}`}
            style={{ transform: `translateX(${drag.x}px) rotate(${drag.x / 20}deg)` }}
            onPointerDown={(e) => { startX.current = e.clientX; setDrag({ x: 0, active: true }); e.currentTarget.setPointerCapture(e.pointerId) }}
            onPointerMove={(e) => drag.active && setDrag({ x: e.clientX - startX.current, active: true })}
            onPointerUp={() => {
              if (drag.x > 120) decide(true)
              else if (drag.x < -120) decide(false)
              else setDrag({ x: 0, active: false })
            }}
          >
            <img src={url(card)} alt="" draggable={false} />
            <div className="cap">
              <b>{dayHeading(card.entry.date)}</b>
              <span>{(card.entry.caption || '').slice(0, 180)}{card.entry.caption?.length > 180 ? '…' : ''}</span>
            </div>
            {drag.x > 40 && <div className="stamp keep">KEEP</div>}
            {drag.x < -40 && <div className="stamp skip">SKIP</div>}
          </div>
          <div className="row">
            <button className="btn big-btn skip" onClick={() => decide(false)}>✕ Skip</button>
            <button className="btn" onClick={undo} disabled={pos === 0}>↶ Undo</button>
            <button className="btn big-btn keep" onClick={() => decide(true)}>♥ Keep</button>
          </div>
        </>
      ) : (
        <div className="done">
          <p className="big">All done — {kept} photos kept.</p>
          <div className="row">
            <button className="btn" onClick={undo}>↶ Back one</button>
            <button className="btn primary" onClick={() => onDone(decisions)}>Continue to spell-check →</button>
          </div>
        </div>
      )}
    </div>
  )
}
