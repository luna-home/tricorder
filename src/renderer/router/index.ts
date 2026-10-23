import { createRouter, createWebHashHistory, type RouterHistory } from 'vue-router'

import HomeView from '../views/HomeView.vue'
import { serviceRoutes } from './services'

// Hash history: the packaged app loads index.html from file://.
export function createAppRouter(history: RouterHistory = createWebHashHistory()) {
  return createRouter({
    history,
    routes: [
      { path: '/', name: 'home', component: HomeView },
      ...serviceRoutes(),
      { path: '/:unknown(.*)*', redirect: '/' },
    ],
  })
}
