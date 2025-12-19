'use client'
import clsx from 'clsx';
import React from 'react';

const mapTypes: ('2D' | '3D' | '卫星图' | '视频')[] = ['2D', '3D', '卫星图', '视频'];

export default function MapSwitchPanel({
  selected,
  onSelect,
}: {
  selected: '2D' | '3D' | '卫星图' | '视频';
  onSelect: (type: '2D' | '3D' | '卫星图' | '视频') => void;
}) {
  return (
    <div className="flex gap-2">
      {mapTypes.map((type) => (
        <button
          key={type}
          onClick={() => onSelect(type)}
          className={clsx(
            'px-3 py-1 text-xs font-medium rounded transition-all duration-300 border',
            selected === type
              ? 'bg-cyan-500 text-white border-cyan-300 shadow-md scale-105'
              : 'bg-cyan-800 text-white border-cyan-700 hover:bg-cyan-600 hover:scale-105'
          )}
        >
          {type}
        </button>
      ))}
    </div>
  );
}
