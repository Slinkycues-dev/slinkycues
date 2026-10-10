import nspell from 'nspell'

let checker = null

export async function loadChecker() {
  if (checker) return checker
  const [aff, dic] = await Promise.all([
    fetch(`${import.meta.env.BASE_URL}dict/en-GB.aff`).then((r) => r.text()),
    fetch(`${import.meta.env.BASE_URL}dict/en-GB.dic`).then((r) => r.text()),
  ])
  checker = nspell(aff, dic)
  return checker
}

const LEARNED_KEY = 'slinky:learned'
export function getLearned() {
  try {
    return new Set(JSON.parse(localStorage.getItem(LEARNED_KEY) || '[]'))
  } catch {
    return new Set()
  }
}
export function learnWord(w) {
  const s = getLearned()
  s.add(w.toLowerCase())
  localStorage.setItem(LEARNED_KEY, JSON.stringify([...s]))
}

function editDistance(a, b) {
  const m = a.length, n = b.length
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 1; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1) // transposition
    }
  return d[m][n]
}

// Things we deliberately never flag: slang, elongations, names, hashtags, urls, numbers.
function looksIntentional(word, raw, wordFreq) {
  if (word.length < 4) return true // "teh" is annoying but short words give too many false positives
  if (/(.)\1\1/.test(word)) return true // soooo, yesss, hahaha
  if (/^(ha|he|lo)+l?$/i.test(word)) return true
  if (/[0-9@#_]/.test(raw)) return true
  if (/^[A-Z]/.test(raw)) return true // names, nicknames, places
  if (/[A-Z].*[A-Z]/.test(raw)) return true
  if ((wordFreq.get(word) || 0) >= 3) return true // used repeatedly = your vocabulary
  return false
}

/**
 * Find probable typos across all entries.
 * Only flags words that are (a) not in the dictionary, (b) not obviously slang/names,
 * and (c) have a dictionary word within edit-distance 1 (a slipped finger).
 * Returns [{ entryId, field, word, suggestion, context, idx }]
 */
export function findTypos(entries, spell) {
  const learned = getLearned()
  const wordFreq = new Map()
  const tokenRe = /[A-Za-z][A-Za-z']*[A-Za-z]|[A-Za-z]/g

  for (const e of entries) {
    const text = `${e.caption}\n${e.extra}`
    for (const m of text.matchAll(tokenRe)) {
      const w = m[0].toLowerCase()
      wordFreq.set(w, (wordFreq.get(w) || 0) + 1)
    }
  }

  const results = []
  const seen = new Set()
  for (const e of entries) {
    for (const field of ['caption', 'extra']) {
      const text = e[field] || ''
      for (const m of text.matchAll(tokenRe)) {
        const raw = m[0]
        const word = raw.toLowerCase()
        if (learned.has(word)) continue
        if (spell.correct(raw) || spell.correct(word)) continue
        if (looksIntentional(word, raw, wordFreq)) continue
        const sugg = spell
          .suggest(word)
          .map((s) => s.toLowerCase())
          .filter((s) => s !== word && editDistance(word, s) <= 1)
        if (!sugg.length) continue
        // keep capitalisation of the original if it had any
        const suggestion = raw[0] === raw[0].toUpperCase() && raw[0] !== raw[0].toLowerCase()
          ? sugg[0][0].toUpperCase() + sugg[0].slice(1)
          : sugg[0]
        const key = `${e.id}:${field}:${m.index}`
        if (seen.has(key)) continue
        seen.add(key)
        const start = Math.max(0, m.index - 50)
        const end = Math.min(text.length, m.index + raw.length + 50)
        results.push({
          key,
          entryId: e.id,
          field,
          idx: m.index,
          word: raw,
          suggestion,
          before: (start > 0 ? '…' : '') + text.slice(start, m.index),
          after: text.slice(m.index + raw.length, end) + (end < text.length ? '…' : ''),
          date: e.date,
        })
      }
    }
  }
  return results
}

/** Apply accepted fixes. fixes: Map key -> suggestion. Returns new entries. */
export function applyFixes(entries, typos, accepted) {
  const byEntry = new Map()
  for (const t of typos) {
    if (!accepted.has(t.key)) continue
    const list = byEntry.get(t.entryId) || []
    list.push(t)
    byEntry.set(t.entryId, list)
  }
  return entries.map((e) => {
    const list = byEntry.get(e.id)
    if (!list) return e
    const out = { ...e }
    for (const field of ['caption', 'extra']) {
      const fs = list.filter((t) => t.field === field).sort((a, b) => b.idx - a.idx)
      let text = out[field] || ''
      for (const t of fs) text = text.slice(0, t.idx) + t.suggestion + text.slice(t.idx + t.word.length)
      out[field] = text
    }
    return out
  })
}
