/* One line-drawn icon set for the map menu. Same weight, same 24 box, so a
   row of them reads as one family rather than a pile of clip art. */

const P = {
  globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM2 12h20M12 2c3 3.2 3 16.8 0 20M12 2c-3 3.2-3 16.8 0 20',
  banner: 'M6 3h12v14l-6-3-6 3V3Z',
  crown: 'M3 18 4 7l5 5 3-7 3 7 5-5 1 11H3Z',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5M17 11.5a3 3 0 1 0 0-6M18 20c0-2.2-.6-3.9-1.7-5.1',
  swords: 'M3 3h4l11 11-2 2L5 5V3ZM21 3h-4L6 14l2 2L21 5V3ZM4 17l3 3M20 17l-3 3',
  coin: 'M12 3c4.4 0 8 1.6 8 3.5S16.4 10 12 10 4 8.4 4 6.5 7.6 3 12 3ZM4 6.5v11C4 19.4 7.6 21 12 21s8-1.6 8-3.5v-11',
  scroll: 'M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5M9 8h7M9 12h7M9 16h4',
  target: 'M12 2v3M12 19v3M2 12h3M19 12h3M12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z',
  flag: 'M5 21V3M5 4h12l-2.5 4L17 12H5',
  spark: 'M12 2v6M12 16v6M2 12h6M16 12h6M6 6l3.5 3.5M14.5 14.5 18 18M18 6l-3.5 3.5M9.5 14.5 6 18',
  book: 'M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5V4.5ZM8 7h8M8 11h6',
  shield: 'M12 2 20 5v7c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V5l8-3Z',
  compass: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM15.5 8.5l-2 5-5 2 2-5 5-2Z',
  close: 'M4 4l16 16M20 4L4 20',
}

export default function Icon({ name, size = 18, className = '' }) {
  const d = P[name] || P.globe
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}
