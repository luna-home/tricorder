import { defineService } from '@shared/define-service'

import { logbuchContract } from './contract'
import { startLogbuch } from './main/runtime'
import { manifest } from './manifest'

export default defineService({
  manifest,
  contract: logbuchContract,
  setup: (ctx) => startLogbuch(ctx),
})
