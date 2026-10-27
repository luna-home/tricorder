import type { LcColor } from '@shared/service'

/** Colour of pin 1..4: the pill in the pin row and the badge in WO WAR ICH. */
export const PIN_COLORS: readonly LcColor[] = ['orange', 'lavender', 'mauve', 'peach']

export const pinColor = (position: number): LcColor => PIN_COLORS[position - 1] ?? 'lavender'
