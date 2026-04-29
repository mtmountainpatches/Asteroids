'use client'

import { useState, useEffect } from 'react'

export default function Explosion() {
  const [exploding, setExploding] = useState(false)

  useEffect(() => {
    const id = setInterval(() => {
      setExploding(true)
      setTimeout(() => setExploding(false), 800)
    }, 5000)
    return () => clearInterval(id)
  }, [])

  if (!exploding) return null

  return (
    <>
      <style>{`
        @keyframes flash {
          0%   { opacity: 0; transform: scale(0.1); }
          20%  { opacity: 1; transform: scale(1.5); }
          100% { opacity: 0; transform: scale(3); }
        }
        @keyframes ring {
          0%   { transform: translate(-50%, -50%) scale(0); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(4); opacity: 0; }
        }
        @keyframes shake {
          0%,100% { transform: translate(0, 0) rotate(0deg); }
          15%  { transform: translate(-8px, 6px) rotate(-2deg); }
          30%  { transform: translate(8px, -6px) rotate(2deg); }
          45%  { transform: translate(-6px, -4px) rotate(-1deg); }
          60%  { transform: translate(6px, 4px) rotate(1deg); }
          75%  { transform: translate(-4px, 2px) rotate(-1deg); }
          90%  { transform: translate(4px, -2px) rotate(0deg); }
        }
        @keyframes particle {
          0%   { transform: translate(0,0) scale(1); opacity: 1; }
          100% { transform: var(--tx) scale(0); opacity: 0; }
        }
        .explode-flash {
          animation: flash 0.8s ease-out forwards;
        }
        .explode-ring {
          animation: ring 0.8s ease-out forwards;
        }
        .explode-shake {
          animation: shake 0.5s ease-in-out;
        }
        .explode-particle {
          animation: particle 0.7s ease-out forwards;
        }
      `}</style>

      {/* screen shake wrapper */}
      <div className="explode-shake" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>

        {/* white flash overlay */}
        <div className="explode-flash" style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(circle, #fff 0%, #ffdd00 40%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* shockwave rings */}
        {[0, 150, 300].map((delay, i) => (
          <div key={i} className="explode-ring" style={{
            position: 'absolute',
            left: '50%', top: '50%',
            width: 120, height: 120,
            marginLeft: -60, marginTop: -60,
            borderRadius: '50%',
            border: `${4 - i}px solid rgba(255,${180 - i * 40},0,0.9)`,
            animationDelay: `${delay}ms`,
            pointerEvents: 'none',
          }} />
        ))}

        {/* particles */}
        {Array.from({ length: 16 }).map((_, i) => {
          const angle = (i / 16) * 360
          const dist = 120 + Math.random() * 80
          const rad = (angle * Math.PI) / 180
          const tx = `translate(${Math.cos(rad) * dist}px, ${Math.sin(rad) * dist}px)`
          return (
            <div key={i} className="explode-particle" style={{
              position: 'absolute',
              left: '50%', top: '50%',
              width: 10, height: 10,
              marginLeft: -5, marginTop: -5,
              borderRadius: '50%',
              background: `hsl(${angle}, 100%, 60%)`,
              ['--tx' as string]: tx,
              animationDelay: `${Math.random() * 100}ms`,
              pointerEvents: 'none',
            }} />
          )
        })}
      </div>
    </>
  )
}
