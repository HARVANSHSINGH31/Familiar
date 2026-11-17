// One place for the whole look. Matches the website.
export const brand = 'ARERA';

const dark = {
  bg: '#080808',
  surface: '#121212',
  surfaceRaised: '#1A1917',
  border: 'rgba(255,255,255,0.08)',
  goldBorder: 'rgba(212,168,83,0.35)',
  gold: '#D4A853',
  goldSoft: '#E8C77A',
  onGold: '#1A1305',
  ink: '#F5F1E8',
  muted: '#9A948A',
  safe: '#8FBF8A',
  alert: '#C8553D',
  alertBg: '#140806',
  scrim: 'rgba(0,0,0,0.55)',
  shade: 'rgba(0,0,0,0.72)',
  frame: '#000000',
};

const light = {
  bg: '#FBF9F4',
  surface: '#FFFFFF',
  surfaceRaised: '#F1EDE4',
  border: 'rgba(0,0,0,0.09)',
  goldBorder: 'rgba(176,138,46,0.40)',
  gold: '#A87F27',
  goldSoft: '#C39A3E',
  onGold: '#FFFFFF',
  ink: '#1A1712',
  muted: '#6B6459',
  safe: '#4F7A4A',
  alert: '#A33A26',
  alertBg: '#FBEDEA',
  scrim: 'rgba(0,0,0,0.45)',
  shade: 'rgba(0,0,0,0.62)',
  frame: '#000000',
};

// `colors` is mutated in place by applyTheme, so every component that reads it
// at render time — inline icon colours included — follows the switch without
// each one having to subscribe to anything.
export const colors = { ...dark };

export function applyTheme(mode) {
  Object.assign(colors, mode === 'light' ? light : dark);
  return colors;
}

export const fonts = {
  serif: 'Outfit_500Medium',
  serifItalic: 'Outfit_500Medium',
  sans: 'Outfit_400Regular',
  sansMedium: 'Outfit_500Medium',
  sansSemi: 'Outfit_600SemiBold',
};