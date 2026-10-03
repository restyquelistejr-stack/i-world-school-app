'use client'

export function MonthNavigator({
  month,
  setMonth,
}: {
  month: string
  setMonth: (m: string) => void
}) {
  const shift = (delta: number) => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const [y, m] = month.split('-').map(Number)
  const label = new Date(y, m - 1, 1).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  })
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => shift(-1)} className="px-2 py-1 border rounded">
        ◀
      </button>
      <div className="min-w-[140px] text-center font-medium">{label}</div>
      <button onClick={() => shift(1)} className="px-2 py-1 border rounded">
        ▶
      </button>
    </div>
  )
}