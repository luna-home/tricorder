import { defineAsyncComponent } from 'vue'
import type { RouteRecordRaw } from 'vue-router'

// Mounted under /logbuch by src/renderer/router/services.ts.
const routes: RouteRecordRaw[] = [
  {
    path: '',
    name: 'logbuch',
    component: () => import('./views/OpenTopicsView.vue'),
  },
  {
    // ?project=&topic= prefill the form.
    path: 'neu',
    name: 'logbuch.new',
    component: () => import('./views/EntryFormView.vue'),
  },
  {
    path: ':project/:topic',
    name: 'logbuch.history',
    component: () => import('./views/HistoryView.vue'),
    props: true,
  },
  {
    path: ':project/:topic/abschliessen',
    name: 'logbuch.done',
    component: () => import('./views/DoneView.vue'),
    props: true,
  },
]

export default routes

export const alerts = {
  unconfigured: defineAsyncComponent(() => import('./components/SetupNotice.vue')),
}
