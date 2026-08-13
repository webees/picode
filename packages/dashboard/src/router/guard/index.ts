import type { Router } from 'vue-router'

import { setupCommonGuard } from './common-guard'

export function setupRouterGuard(router: Router) {
  setupCommonGuard(router)
}
