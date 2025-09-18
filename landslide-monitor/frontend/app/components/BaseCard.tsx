'use client';
import { Card } from 'antd';
import React from 'react';

export default function BaseCard({
  title,
  extra,
  children,
  style = {},
}: {
  title: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <Card
      title={
        extra ? (
          <div className="flex justify-between items-center w-full">
            <span className="text-white text-sm">{title}</span>
            <div className="ml-2">{extra}</div>
          </div>
        ) : (
          <span className="text-white text-sm">{title}</span>
        )
      }
      variant="borderless" // ✅ 取代 bordered={false}
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
  );
}
