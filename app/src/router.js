import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'simulation', component: () => import('./views/SimulationView/SimulationView.vue') },
    { path: '/editor', name: 'editor', component: () => import('./views/EditorView/EditorView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

export default router
