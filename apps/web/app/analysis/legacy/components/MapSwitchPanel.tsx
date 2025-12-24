'use client'

import clsx from 'clsx'

export type LegacyMapType = '2D' | '3D' | '卫星图' | '视频'

const mapTypes: LegacyMapType[] = ['2D', '3D', '卫星图', '视频']

export default function MapSwitchPanel({ selected, onSelect }: { selected: LegacyMapType; onSelect: (t: LegacyMapType) => void }) {
  return (
    <div className="flex gap-2">
      {mapTypes.map((type) => (
        <button
          key={type}
          onClick={() => onSelect(type)}
          className={clsx(
            'rounded border px-3 py-1 text-xs font-medium transition-all duration-300',
            selected === type
              ? 'scale-105 border-cyan-300 bg-cyan-500 text-white shadow-md'
              : 'border-cyan-700 bg-cyan-800 text-white hover:scale-105 hover:bg-cyan-600',
          )}
        >
          {type}
        </button>
      ))}
    </div>
  )
}

