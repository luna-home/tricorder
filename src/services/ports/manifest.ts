import { defineManifest } from '@shared/registry'

export const manifest = defineManifest({
  id: 'ports',
  nameKey: 'services.ports.name',
  color: 'mauve',
  kind: 'local',
  order: 20,
})
