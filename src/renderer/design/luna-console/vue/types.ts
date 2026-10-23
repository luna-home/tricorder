export type LcColor = 'orange' | 'cream' | 'lavender' | 'mauve' | 'peach' | 'red' | 'armed' | 'inactive'
export type LcMode = 'normal' | 'red-alert' | 'yellow-alert'
export interface LcBarSegment {
  color: LcColor
  /** Width in px, or 'fill' for the remaining space. */
  width: number | 'fill'
}
export interface LcNavPage {
  name: string
  label: string
  color: LcColor
}
