'use client'

export function ViewToggle({
  view,
  setView,
}: {
  view: 'rendered' | 'scheduled' | 'both'
  setView: (v: 'rendered' | 'scheduled' | 'both') => void
}) {
  const opts = [
    { k: 'rendered', label: 'Rendered' },
    { k: 'scheduled', label: 'Scheduled' },
    { k: 'both', label: 'Both' },
  ] as const
  return (
    <div className="flex rounded-md border overflow-hidden">
      {opts.map(o => (
        <button
          key={o.k}
          onClick={() => setView(o.k)}
          className={`px-3 py-1 text-sm ${
            view === o.k ? 'bg-gray-900 text-white' : 'bg-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}