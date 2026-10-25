import { useState } from 'react'
import Upload from './components/Upload'
import SwipeDeck from './components/SwipeDeck'
import SpellReview from './components/SpellReview'
import Export from './components/Export'
import YearTracker from './components/YearTracker'
import { recordProgress } from './lib/store'

const STEPS = ['Upload', 'Photos', 'Spell-check', 'Export']

export default function App() {
  const [step, setStep] = useState(0)
  const [entries, setEntries] = useState([])
  const [decisions, setDecisions] = useState({})
  const [warnings, setWarnings] = useState([])

  return (
    <div className="app">
      <header>
        <h1>
          <a href="/" title="Back to Slinkycues" style={{ color: 'inherit', textDecoration: 'none' }}>Slinkycues</a> <span style={{ opacity: 0.5 }}>/ Diary</span>
        </h1>
        <nav>
          {STEPS.map((s, i) => (
            <span key={s} className={i === step ? 'on' : i < step ? 'past' : ''} onClick={() => i < step && setStep(i)}>
              {s}
            </span>
          ))}
        </nav>
      </header>

      {warnings.length > 0 && <div className="warn">{warnings.map((w) => <div key={w}>{w}</div>)}</div>}

      {step === 0 && <YearTracker />}
      {step === 0 && (
        <Upload
          onLoaded={({ entries, warnings }) => {
            setEntries(entries)
            setWarnings(warnings)
            recordProgress(entries, {})
            setStep(1)
          }}
        />
      )}
      {step === 1 && <SwipeDeck entries={entries} onDone={(d) => { setDecisions(d); setStep(2) }} />}
      {step === 2 && <SpellReview entries={entries} onDone={(fixed) => { setEntries(fixed); setStep(3) }} />}
      {step === 3 && <Export entries={entries} decisions={decisions} onRestart={() => { setEntries([]); setStep(0) }} />}

      <footer className="muted small">Everything runs in your browser. Nothing is uploaded.</footer>
    </div>
  )
}
