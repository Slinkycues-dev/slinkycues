import { useState } from 'react'
import { loadYears, markYearDone, FIRST_YEAR } from '../lib/store'

/** One pill per year since 2019: done, in progress (with %), or not started. Click a year to tick it off / untick. */
export default function YearTracker() {
  const [years, setYears] = useState(loadYears)
  const thisYear = new Date().getFullYear()
  const list = []
  for (let y = FIRST_YEAR; y <= thisYear; y++) list.push(y)
  const done = list.filter((y) => years[y]?.status === 'done').length

  return (
    <div className="years">
      <div className="years-head">
        <span className="muted small">Years in the book</span>
        <span className="muted small">{done} of {list.length} done · click a year to tick it off</span>
      </div>
      <div className="years-row">
        {list.map((y) => {
          const v = years[y]
          const isDone = v?.status === 'done'
          const pct = v && v.photos ? Math.round((v.decided / v.photos) * 100) : 0
          const started = !!v && !isDone
          return (
            <button
              key={y}
              type="button"
              className={'year ' + (isDone ? 'done' : started ? 'going' : '')}
              title={isDone ? `${y} finished` : started ? `${y}: ${v.decided} of ${v.photos} photos sorted` : `${y}: not started`}
              onClick={() => setYears({ ...markYearDone(y, !isDone) })}
            >
              <span className="year-label">{y}</span>
              <span className="year-sub">{isDone ? '✓ done' : started ? `${pct}%` : '–'}</span>
              {started && <span className="year-bar" style={{ width: `${pct}%` }} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
