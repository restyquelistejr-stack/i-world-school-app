'use client'

export function TeacherPicker({
  all,
  selected,
  setSelected,
}: {
  all: { id: string; full_name: string }[]
  selected: string[]
  setSelected: (ids: string[]) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-600">Teachers:</span>
      <button
        onClick={() => setSelected([])}
        className={`px-2 py-1 text-xs rounded-md border ${
          selected.length === 0 ? 'bg-gray-900 text-white' : ''
        }`}
      >
        All
      </button>
      <select
        multiple
        value={selected}
        onChange={e =>
          setSelected(Array.from(e.target.selectedOptions, o => o.value))
        }
        className="border rounded-md text-sm min-w-[240px] p-1"
      >
        {all.map(t => (
          <option key={t.id} value={t.id}>
            {t.full_name}
          </option>
        ))}
      </select>
    </div>
  )
}