import { defineManifest } from '@shared/registry'

export const manifest = defineManifest({
  id: 'logbuch',
  nameKey: 'services.logbuch.name',
  color: 'orange',
  kind: 'local',
  order: 10,
})
