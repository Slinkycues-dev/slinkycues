// Photo decisions persist in localStorage so you can swipe over several sittings.
const KEY = 'slinky:photoDecisions'

export function loadDecisions() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    return {}
  }
}
export function saveDecisions(d) {
  localStorage.setItem(KEY, JSON.stringify(d))
}
export function clearDecisions() {
  localStorage.removeItem(KEY)
}

// Per-year progress: which years are finished (exported) and how far the rest are.
// Shown on the Upload screen and on the Slinkycues hub tile. Years before this
// tracker existed can be ticked off by hand (click a year).
const YEARS_KEY = 'slinky:years'
export const FIRST_YEAR = 2019

export function loadYears() {
  try {
    return JSON.parse(localStorage.getItem(YEARS_KEY) || '{}')
  } catch {
    return {}
  }
}
function saveYears(y) {
  localStorage.setItem(YEARS_KEY, JSON.stringify(y))
}

/** Called whenever entries or decisions change: records photo totals and how many are decided, per year. */
export function recordProgress(entries, decisions) {
  if (!entries?.length) return
  const years = loadYears()
  const byYear = {}
  for (const e of entries) {
    const y = e.date.getFullYear()
    byYear[y] ??= { entries: 0, photos: 0, decided: 0 }
    byYear[y].entries++
    for (const m of e.media) {
      byYear[y].photos++
      if (m.id in (decisions || {})) byYear[y].decided++
    }
  }
  for (const [y, v] of Object.entries(byYear)) {
    const prev = years[y] || {}
    years[y] = { ...prev, ...v, status: prev.status === 'done' ? 'done' : 'in-progress', touchedAt: new Date().toISOString() }
  }
  saveYears(years)
}

export function markYearDone(year, done = true) {
  const years = loadYears()
  years[year] = { ...(years[year] || {}), status: done ? 'done' : 'in-progress', exportedAt: done ? new Date().toISOString() : undefined }
  saveYears(years)
  return years
}
