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

// Words that are "wrong" to the dictionary but right to the author. Grows via learnWord().
const SLANG = new Set(`
sesh scran scranning delish merch bestie besties girlies neek neeky hangry vlog vlogging vlogs dawg yall innit onnit
binos lol tbh ngl cba idk bruh chun chunned chunny chunning peng ting mandem gassed buzzin buzzing lowkey highkey deffo
defo obvs totes probs rents fam gaff bev bevs bevvies bevvy pres prinks skint chuffed knackered minging lad lads
maccies chippy spoons uni freshers lash lashed lashing banter bants rinsed rinsing jokes jokesy sick vibey vibed vibes
sendy sending gnarly stoked rad legend ledge schmoozing shmoozing kip kipping snus snuss snoozed cuppa brekkie brekky
footy telly bikkie bikkies choccy chocky sarnie sarnies butty sanga avo arvo prezzie prezzies rellies rello sunnies
trackies joggers hoodie hoodies crocs croc wellies wellie flipflops flipflop heelys heelying heelyd wheelie wheelies
randomer randomers mutuals goodie goodies barbeque bbq queueing posset duffle watersports waterpark waterslide wakepark
wakeboard wakeboarding wakeboarder kitesurf kitesurfing surfy surfer surfers sesh selfie selfies insta ig tiktok
spotify playlist playlists netflix youtube vlog whatsapp whatsapped facetime facetimed uber ubered deliveroo
haribo haribos piccie piccies earnt leant learnt dreamt spelt smelt burnt problemo sapien sapiens gottem chav chavs chavy
manc mancs finca nada newby newbie newbies syphon syphoning syphoned breastroke strimmer strimming strimmed awol goddamnit
goddammit skitz bint aboot chillax chillaxing puffa hmph chirpse chirpsing chirpsed vid vids gilet gilets rona ronas preggers
outro intro intros mankini tippy kiddy kiddies kiddo urgh ugh argh rizz pinot throuple throuples tele incase swegway woop
woops burkha burkhas samphire bougie boogie boogying boogied hola estas bien chica chicas improv wooly debreasted debreast
shemagh shemaghs galette galettes choux voie flor como senorita senoritas hooyah strappy cous couscous housem housemate
housemates styll stylll legit legitness sesh seshes scranned scrans bants bantz pisshead pissheads shithead bellend bellends
wanker wankers knob knobhead twat twatted tosser tossers melt melts moist dench peng leng wavey wavy mash mashed
cric crick styll preed preeing pres mong fook facking fackin fookin fooking madda mazza earnt leant learnt incase
chaud unpisted cheffing yonked aime stfu cmon soya appaz pisteur pisteurs bnoc demi argy fomo fuckk spag jorts skidoos miso yoghurts parapente speedos bruv empath gauping piccy dont flubber deets catchup lols sensical bain bouy unstack biitch criss propellor ooah habal moto stig stinkiness noob snuck menty chez birks lasagna foetal knicks knowledgable hella fack disheveled chocolat crookie bday morni cheffy’s seiza trog funnyness sheek
shat awks zoot zoots rando randos dolla rapido yeahh yeahhh nahh nahhh heyo toon brek brekky sais
sacked baccy rollie rollies vape vaped vaping lighter gazebo gazebos tinnies tinny tinnie cans pres prinks afters afterparty
`.split(/\s+/).filter(Boolean))

const deaccent = (w) => w.normalize('NFD').replace(/[̀-ͯ]/g, '')

// American spellings → the British one, offered as a fix rather than guessed at.
const US_TO_UK = {
  center: 'centre', color: 'colour', colors: 'colours', favorite: 'favourite', favorites: 'favourites', traveler: 'traveller',
  travelers: 'travellers', traveling: 'travelling', gray: 'grey', liter: 'litre', liters: 'litres', jewelry: 'jewellery',
  anesthesia: 'anaesthesia', synchronized: 'synchronised', organized: 'organised', realized: 'realised', recognized: 'recognised',
  realize: 'realise', organize: 'organise', recognize: 'recognise', neighbor: 'neighbour', neighbors: 'neighbours', humor: 'humour',
  flavor: 'flavour', flavors: 'flavours', theater: 'theatre', meter: 'metre', meters: 'metres', pajamas: 'pyjamas', mom: 'mum',
  airplane: 'aeroplane', aluminum: 'aluminium', defense: 'defence', license: 'licence', practicing: 'practising', catalog: 'catalogue',
  program: 'programme', apologize: 'apologise', apologized: 'apologised', cozy: 'cosy', donut: 'doughnut', donuts: 'doughnuts',
}
const US_OK = new Set(['advisor', 'focused', 'focussed', 'yoghurt', 'yogurt', 'foetus', 'mediaeval', 'medieval', 'barbeque', 'queueing'])

const cap = (w) => w[0].toUpperCase() + w.slice(1)

function isWord(spell, w) {
  return w.length > 1 && (spell.correct(w) || spell.correct(cap(w)) || SLANG.has(w))
}

// word differs from sugg only by a trailing s/es, or by a regular suffix on a real stem
function trivialVariant(word, sugg) {
  const strip = (w) => w.replace(/(es|s)$/, '')
  return strip(word) === strip(sugg)
}
function suffixOfKnownStem(spell, word, sugg) {
  const m = word.match(/^(.{3,}?)(ing|ed|er|ers|s|es|y|ey|ies)$/)
  if (!m) return false
  const stem = m[1], suf = m[2]
  const known = isWord(spell, stem) || isWord(spell, stem + 'e') || SLANG.has(stem)
  if (!known) return false
  // but a missed doubled consonant (preping→prepping, stoping→stopping) is a real slip: keep flagging that
  if (sugg && sugg === stem + stem[stem.length - 1] + suf) return false
  return true
}

// Things we deliberately never flag: slang, elongations, names, hashtags, urls, numbers, compounds.
function looksIntentional(word, raw, wordFreq, spell) {
  if (word.length < 4) return true // short words give too many false positives
  if (SLANG.has(word) || US_OK.has(word)) return true
  if (spell.correct(cap(word))) return true // a name/place/brand written lowercase: monet, chanel, korean
  if (deaccent(word) !== word && isWord(spell, deaccent(word))) return true // fiancé, café
  if (/'s$/.test(word) && isWord(spell, word.slice(0, -2))) return true // whoever's, driving's
  if (/(.)\1\1/.test(word)) return true // soooo, yesss
  if (/(ha|he|ah|eh){2,}/.test(word)) return true // hahaha, bahaha, ahaha, heheh
  if (/[0-9@#_]/.test(raw)) return true
  if (/^[A-Z]/.test(raw)) return true // names, nicknames, places
  if (/[A-Z].*[A-Z]/.test(raw)) return true
  if ((wordFreq.get(word) || 0) >= 3) return true // used repeatedly = your vocabulary
  // dropped-g verbs: earnin, shaggin, buzzin
  if (/in$/.test(word) && isWord(spell, word + 'g')) return true
  // compounds of two real words: washbag, wakeup, clearup, anyday, forkload
  for (let i = 3; i <= word.length - 3; i++) {
    if (isWord(spell, word.slice(0, i)) && isWord(spell, word.slice(i))) return true
  }
  return false
}

// A plausible slip keeps the first letter and isn't just a possessive/plural shuffle.
function plausibleFix(word, sugg) {
  if (word[0] !== sugg[0]) return false
  if (word.replace(/'s$/, '') === sugg.replace(/'s$/, '')) return false
  if (sugg.endsWith("'s") && !word.includes("'")) return false
  return true
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
  const tokenRe = /\p{L}[\p{L}'’]*\p{L}|\p{L}/gu

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
        const word = raw.toLowerCase().replace(/’/g, "'")
        if (learned.has(word)) continue
        let sugg
        if (US_TO_UK[word]) sugg = [US_TO_UK[word]]
        else {
          if (spell.correct(raw) || spell.correct(word)) continue
          if (looksIntentional(word, raw, wordFreq, spell)) continue
          sugg = spell
            .suggest(word)
            .map((s) => s.toLowerCase())
            .filter(
              (s) =>
                s !== word &&
                editDistance(word, s) <= (word.length >= 7 ? 2 : 1) &&
                plausibleFix(word, s) &&
                !trivialVariant(word, s) &&
                !s.includes(' ')
            )
          if (sugg.length && suffixOfKnownStem(spell, word, sugg[0])) continue
          // Only an *obvious* slip: the corrected word must be one you actually use elsewhere this year
          // (teh → the, wiht → with). If you never write the suggested word, it is almost certainly your slang.
          sugg = sugg.filter((s) => (wordFreq.get(s) || 0) >= 2)
        }
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
