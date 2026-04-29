'use client'

import { useState, useEffect } from 'react'

export default function Frog() {
  const [pos, setPos] = useState({ x: 10, y: 10 })
  const [hopping, setHopping] = useState(false)

  useEffect(() => {
    const jump = () => {
      setHopping(true)
      setTimeout(() => setHopping(false), 600)
      setPos({
        x: 5 + Math.random() * 85,
        y: 5 + Math.random() * 85,
      })
    }

    jump()
    const id = setInterval(jump, 1800)
    return () => clearInterval(id)
  }, [])

  return (
    <span
      style={{
        position: 'absolute',
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        fontSize: '2.5rem',
        transition: 'left 0.6s cubic-bezier(0.4,0,0.2,1), top 0.6s cubic-bezier(0.4,0,0.2,1)',
        display: 'inline-block',
        transform: hopping ? 'translateY(-24px) scaleX(1.15)' : 'translateY(0) scaleX(1)',
        transitionProperty: 'left, top, transform',
        userSelect: 'none',
      }}
    >
      🐸
    </span>
  )
}
