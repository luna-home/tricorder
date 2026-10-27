import type { RouteRecordRaw } from 'vue-router'

// Mounted under /ports by src/renderer/router/services.ts.
const routes: RouteRecordRaw[] = [
  {
    // ?proto=tcp|udp&extern=1 filter the list.
    path: '',
    name: 'ports',
    component: () => import('./views/PortsView.vue'),
  },
]

export default routes
