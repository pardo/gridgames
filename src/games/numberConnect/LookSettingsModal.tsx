import { canVibrate, LINE_STYLES, type LineSettings } from '../../hooks/useLineSettings'
import { PathLine } from './PathLine'

interface LookSettingsModalProps {
  settings: LineSettings
  onUpdate: (patch: Partial<LineSettings>) => void
  onClose: () => void
}

/** A 4x3 snake so each style card shows its line in motion. */
const PREVIEW_CELLS = [0, 1, 2, 3, 7, 6, 5, 4, 8, 9, 10, 11]

const TOGGLES: { key: Exclude<keyof LineSettings, 'lineStyle'>; label: string; hint: string }[] = [
  { key: 'ripple', label: 'Ripples', hint: 'A ring pops on every new cell' },
  { key: 'sparkles', label: 'Sparkles', hint: 'Particles fly off the tip while you drag' },
  { key: 'numberBurst', label: 'Number bursts', hint: 'Confetti when you reach a number' },
  { key: 'winWave', label: 'Victory wave', hint: 'A wave runs along the solved path' },
  { key: 'haptics', label: 'Vibration', hint: 'Little ticks as you drag (Android)' },
]

export function LookSettingsModal({ settings, onUpdate, onClose }: LookSettingsModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal look-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Line & effects</h2>

        <h3 className="look-heading">Line style</h3>
        <div className="look-styles">
          {LINE_STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`look-style${settings.lineStyle === s.id ? ' active' : ''}`}
              onClick={() => onUpdate({ lineStyle: s.id })}
              aria-pressed={settings.lineStyle === s.id}
              title={s.blurb}
            >
              <svg className="look-preview" viewBox="0 0 4 3" aria-hidden="true">
                <PathLine cells={PREVIEW_CELLS} n={4} lineStyle={s.id} />
              </svg>
              <span className="look-style-name">{s.label}</span>
              <span className="look-style-blurb">{s.blurb}</span>
            </button>
          ))}
        </div>

        <h3 className="look-heading">Drag effects</h3>
        <div className="look-toggles">
          {TOGGLES.filter((t) => t.key !== 'haptics' || canVibrate).map((t) => (
            <label key={t.key} className="look-toggle">
              <span>
                <span className="look-toggle-label">{t.label}</span>
                <span className="look-toggle-hint">{t.hint}</span>
              </span>
              <input
                type="checkbox"
                className="switch"
                checked={settings[t.key]}
                onChange={(e) => onUpdate({ [t.key]: e.target.checked })}
              />
            </label>
          ))}
        </div>

        <button type="button" className="pill-button accent wide" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}
