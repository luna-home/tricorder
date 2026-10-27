import { defineService } from '@shared/define-service'

import { portsContract } from './contract'
import { startPorts } from './main/runtime'
import { manifest } from './manifest'

export default defineService({
  manifest,
  contract: portsContract,
  setup: (ctx) => startPorts(ctx),
})
