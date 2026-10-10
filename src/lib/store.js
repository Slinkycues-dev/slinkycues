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
