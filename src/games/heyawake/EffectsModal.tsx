import { canVibrate, type LineSettings } from '../../hooks/useLineSettings'

interface EffectsModalProps {
  settings: LineSettings
  onUpdate: (patch: Partial<LineSettings>) => void
  onClose: () => void
}

/** The effect switches that apply to Heyawake; shared with the other games. */
const TOGGLES: { key: 'ripple' | 'winWave' | 'haptics'; label: string; hint: string }[] = [
  { key: 'ripple', label: 'Ripples', hint: 'A ring pops on every shaded cell' },
  { key: 'winWave', label: 'Victory wave', hint: 'The open cells light up across the board' },
  { key: 'haptics', label: 'Vibration', hint: 'Little ticks as you shade (Android)' },
]

export function EffectsModal({ settings, onUpdate, onClose }: EffectsModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal look-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Effects</h2>
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
