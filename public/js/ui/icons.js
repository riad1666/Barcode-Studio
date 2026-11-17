/**
 * Crisp Phosphor-style inline SVG icon library (NO emojis).
 * 256x256 viewBox, geometric, clean stroke, aria-hidden by default.
 */

const svgWrapper = (pathD, size = 18, extraAttrs = '') => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" ${extraAttrs}>
  ${pathD}
</svg>`.trim();

const strokeWrapper = (innerSvg, size = 18, extraAttrs = '') => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extraAttrs}>
  ${innerSvg}
</svg>`.trim();

export const ICONS = {
  barcode: (size = 18) => strokeWrapper(`
    <line x1="40" y1="48" x2="40" y2="208"/>
    <line x1="72" y1="48" x2="72" y2="208"/>
    <line x1="104" y1="48" x2="104" y2="208"/>
    <line x1="136" y1="48" x2="136" y2="208"/>
    <line x1="152" y1="48" x2="152" y2="208"/>
    <line x1="184" y1="48" x2="184" y2="208"/>
    <line x1="216" y1="48" x2="216" y2="208"/>
  `, size),

  qrcode: (size = 18) => strokeWrapper(`
    <rect x="48" y="48" width="64" height="64" rx="8"/>
    <rect x="144" y="48" width="64" height="64" rx="8"/>
    <rect x="48" y="144" width="64" height="64" rx="8"/>
    <line x1="144" y1="144" x2="144" y2="176"/>
    <line x1="176" y1="144" x2="208" y2="144"/>
    <line x1="176" y1="176" x2="176" y2="208"/>
    <line x1="208" y1="176" x2="208" y2="208"/>
  `, size),

  card: (size = 18) => strokeWrapper(`
    <rect x="32" y="48" width="192" height="160" rx="12"/>
    <line x1="32" y1="96" x2="224" y2="96"/>
    <line x1="64" y1="152" x2="112" y2="152"/>
    <line x1="64" y1="176" x2="96" y2="176"/>
  `, size),

  tag: (size = 18) => strokeWrapper(`
    <path d="M43.2,149.6,149.6,43.2a16,16,0,0,1,22.6,0l40.6,40.6a16,16,0,0,1,0,22.6L106.4,212.8a16,16,0,0,1-11.3,4.7H40a8,8,0,0,1-8-8V160.9A16,16,0,0,1,43.2,149.6Z"/>
    <circle cx="84" cy="84" r="12" fill="currentColor"/>
  `, size),

  search: (size = 18) => strokeWrapper(`
    <circle cx="112" cy="112" r="80"/>
    <line x1="168.5" y1="168.5" x2="224" y2="224"/>
  `, size),

  sun: (size = 18) => strokeWrapper(`
    <circle cx="128" cy="128" r="48"/>
    <line x1="128" y1="24" x2="128" y2="48"/>
    <line x1="128" y1="208" x2="128" y2="232"/>
    <line x1="54.4" y1="54.4" x2="71.4" y2="71.4"/>
    <line x1="184.6" y1="184.6" x2="201.6" y2="201.6"/>
    <line x1="24" y1="128" x2="48" y2="128"/>
    <line x1="208" y1="128" x2="232" y2="128"/>
    <line x1="54.4" y1="201.6" x2="71.4" y2="184.6"/>
    <line x1="184.6" y1="71.4" x2="201.6" y2="54.4"/>
  `, size),

  moon: (size = 18) => strokeWrapper(`
    <path d="M216.7,152.6A96,96,0,1,1,103.4,39.3,8,8,0,0,1,114,48.6a80.1,80.1,0,0,0,93.4,93.4,8,8,0,0,1,9.3,10.6Z"/>
  `, size),

  copy: (size = 18) => strokeWrapper(`
    <rect x="40" y="40" width="128" height="128" rx="8"/>
    <path d="M88,168v40a8,8,0,0,0,8,8H208a8,8,0,0,0,8-8V96a8,8,0,0,0-8-8H168"/>
  `, size),

  download: (size = 18) => strokeWrapper(`
    <path d="M208,144v48a8,8,0,0,1-8,8H56a8,8,0,0,1-8-8V144"/>
    <polyline points="80 104 128 152 176 104"/>
    <line x1="128" y1="32" x2="128" y2="152"/>
  `, size),

  check: (size = 18) => strokeWrapper(`
    <polyline points="40 136 96 192 216 72"/>
  `, size),

  gear: (size = 18) => strokeWrapper(`
    <circle cx="128" cy="128" r="40"/>
    <path d="M128,32v16M128,208v16M32,128H48M208,128h16M60.1,60.1l11.3,11.3M184.6,184.6l11.3,11.3M60.1,195.9l11.3-11.3M184.6,71.4l11.3-11.3"/>
  `, size),

  palette: (size = 18) => strokeWrapper(`
    <path d="M216,128A88,88,0,1,1,88,40c48.6,0,88,39.4,88,88a24,24,0,0,1-24,24H136a16,16,0,0,0-16,16,16,16,0,0,0,4.7,11.3l.3.3a24,24,0,0,1,7,17A88.1,88.1,0,0,1,216,128Z"/>
    <circle cx="84" cy="100" r="10" fill="currentColor"/>
    <circle cx="124" cy="84" r="10" fill="currentColor"/>
    <circle cx="164" cy="100" r="10" fill="currentColor"/>
  `, size),

  textT: (size = 18) => strokeWrapper(`
    <line x1="40" y1="56" x2="216" y2="56"/>
    <line x1="128" y1="56" x2="128" y2="200"/>
    <line x1="96" y1="200" x2="160" y2="200"/>
  `, size),

  sliders: (size = 18) => strokeWrapper(`
    <line x1="48" y1="40" x2="48" y2="216"/>
    <line x1="128" y1="40" x2="128" y2="216"/>
    <line x1="208" y1="40" x2="208" y2="216"/>
    <circle cx="48" cy="96" r="20" fill="currentColor"/>
    <circle cx="128" cy="160" r="20" fill="currentColor"/>
    <circle cx="208" cy="80" r="20" fill="currentColor"/>
  `, size),

  alertCircle: (size = 18) => strokeWrapper(`
    <circle cx="128" cy="128" r="96"/>
    <line x1="128" y1="80" x2="128" y2="136"/>
    <circle cx="128" cy="172" r="8" fill="currentColor"/>
  `, size),

  chevronDown: (size = 14) => strokeWrapper(`
    <polyline points="208 96 128 176 48 96"/>
  `, size),

  chevronRight: (size = 14) => strokeWrapper(`
    <polyline points="96 48 176 128 96 208"/>
  `, size),

  trash: (size = 16) => strokeWrapper(`
    <line x1="216" y1="56" x2="40" y2="56"/>
    <line x1="104" y1="104" x2="104" y2="168"/>
    <line x1="152" y1="104" x2="152" y2="168"/>
    <path d="M200,56V208a8,8,0,0,1-8,8H64a8,8,0,0,1-8-8V56"/>
    <path d="M168,56V40a16,16,0,0,0-16-16H104A16,16,0,0,0,88,40V56"/>
  `, size),

  plus: (size = 16) => strokeWrapper(`
    <line x1="40" y1="128" x2="216" y2="128"/>
    <line x1="128" y1="40" x2="128" y2="216"/>
  `, size),

  x: (size = 16) => strokeWrapper(`
    <line x1="200" y1="56" x2="56" y2="200"/>
    <line x1="200" y1="200" x2="56" y2="56"/>
  `, size),

  link: (size = 16) => strokeWrapper(`
    <path d="M136,120l24-24a40,40,0,0,1,56.6,56.6l-24,24a40,40,0,0,1-56.6,0"/>
    <path d="M120,136,96,160a40,40,0,0,1-56.6-56.6l24-24a40,40,0,0,1,56.6,0"/>
    <line x1="104" y1="152" x2="152" y2="104"/>
  `, size),

  code: (size = 16) => strokeWrapper(`
    <polyline points="64 88 16 128 64 168"/>
    <polyline points="192 88 240 128 192 168"/>
    <line x1="160" y1="40" x2="96" y2="216"/>
  `, size),

  zoomIn: (size = 16) => strokeWrapper(`
    <circle cx="112" cy="112" r="80"/>
    <line x1="168.5" y1="168.5" x2="224" y2="224"/>
    <line x1="88" y1="112" x2="136" y2="112"/>
    <line x1="112" y1="88" x2="112" y2="136"/>
  `, size),

  zoomOut: (size = 16) => strokeWrapper(`
    <circle cx="112" cy="112" r="80"/>
    <line x1="168.5" y1="168.5" x2="224" y2="224"/>
    <line x1="88" y1="112" x2="136" y2="112"/>
  `, size),

  grid: (size = 16) => strokeWrapper(`
    <rect x="40" y="40" width="176" height="176" rx="8"/>
    <line x1="96" y1="40" x2="96" y2="216"/>
    <line x1="160" y1="40" x2="160" y2="216"/>
    <line x1="40" y1="96" x2="216" y2="96"/>
    <line x1="40" y1="160" x2="216" y2="160"/>
  `, size),

  printer: (size = 18) => strokeWrapper(`
    <path d="M64,88V40a8,8,0,0,1,8-8h112a8,8,0,0,1,8,8V88"/>
    <path d="M64,168H40a8,8,0,0,1-8-8V104a8,8,0,0,1,8-8H216a8,8,0,0,1,8,8v56a8,8,0,0,1-8,8H192"/>
    <rect x="64" y="144" width="128" height="80" rx="8"/>
    <circle cx="184" cy="120" r="8" fill="currentColor"/>
  `, size),

  upload: (size = 18) => strokeWrapper(`
    <path d="M208,144v48a8,8,0,0,1-8,8H56a8,8,0,0,1-8-8V144"/>
    <polyline points="176 80 128 32 80 80"/>
    <line x1="128" y1="32" x2="128" y2="144"/>
  `, size),

  envelope: (size = 18) => strokeWrapper(`
    <rect x="32" y="56" width="192" height="144" rx="8"/>
    <polyline points="224 56 128 144 32 56"/>
  `, size),

  phone: (size = 18) => strokeWrapper(`
    <path d="M92.3,163.7a120.4,120.4,0,0,0,71.4,71.4l24.4-24.4a8.1,8.1,0,0,1,8.5-1.9,136.2,136.2,0,0,0,42.6,6.9,8,8,0,0,1,8,8V240a8,8,0,0,1-8,8C107.1,248,8,148.9,8,26.8A8,8,0,0,1,16,18.8H32a8,8,0,0,1,8,8,136.2,136.2,0,0,0,6.9,42.6,8.1,8.1,0,0,1-1.9,8.5Z"/>
  `, size),

  wifi: (size = 18) => strokeWrapper(`
    <path d="M24,96A168,168,0,0,1,232,96"/>
    <path d="M56,136a120,120,0,0,1,144,0"/>
    <path d="M92,176a72,72,0,0,1,72,0"/>
    <circle cx="128" cy="216" r="12" fill="currentColor"/>
  `, size),

  calendar: (size = 18) => strokeWrapper(`
    <rect x="40" y="48" width="176" height="176" rx="8"/>
    <line x1="40" y1="96" x2="216" y2="96"/>
    <line x1="88" y1="24" x2="88" y2="56"/>
    <line x1="168" y1="24" x2="168" y2="56"/>
  `, size),

  bank: (size = 18) => strokeWrapper(`
    <polygon points="128 24 24 80 232 80 128 24"/>
    <line x1="48" y1="80" x2="48" y2="192"/>
    <line x1="96" y1="80" x2="96" y2="192"/>
    <line x1="160" y1="80" x2="160" y2="192"/>
    <line x1="208" y1="80" x2="208" y2="192"/>
    <line x1="24" y1="192" x2="232" y2="192"/>
    <line x1="16" y1="232" x2="240" y2="232"/>
  `, size),

  user: (size = 18) => strokeWrapper(`
    <circle cx="128" cy="80" r="48"/>
    <path d="M40,216a88,88,0,0,1,176,0"/>
  `, size),

  sparkle: (size = 18) => strokeWrapper(`
    <path d="M128,24l16,72,72,16-72,16-16,72-16-72-72-16,72-16Z"/>
  `, size),
};

export function renderIcon(name, size = 18) {
  const fn = ICONS[name];
  if (typeof fn === 'function') {
    return fn(size);
  }
  return ICONS.barcode(size);
}
