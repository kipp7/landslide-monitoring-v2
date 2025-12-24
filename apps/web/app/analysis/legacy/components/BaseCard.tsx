'use client'

import { Card } from 'antd'
import type { CSSProperties, ReactNode } from 'react'

export default function BaseCard({
  title,
  extra,
  children,
  style = {},
}: {
  title?: string
  extra?: ReactNode
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <Card
      title={
        title ? (
          extra ? (
            <div className="flex w-full items-center justify-between">
              <span className="text-sm text-white">{title}</span>
              <div className="ml-2">{extra}</div>
            </div>
          ) : (
            <span className="text-sm text-white">{title}</span>
          )
        ) : undefined
      }
      variant="borderless"
      className="transition-transform hover:scale-[1.01]"
      style={{
        height: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(0, 255, 255, 0.1)',
        borderRadius: 12,
        boxShadow: '0 0 12px rgba(0, 255, 255, 0.08)',
        color: '#fff',
        ...style,
      }}
      styles={{
        header: {
          padding: '8px 16px',
          fontSize: 14,
          minHeight: 32,
          color: '#fff',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        },
        body: {
          height: 'calc(100% - 40px)',
          padding: 8,
        },
      }}
    >
      {children}
    </Card>
  )
}

