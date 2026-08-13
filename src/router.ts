import { createRouter, createWebHistory } from 'vue-router'

const EmptyRoute = { template: '<div />' }

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/login', name: 'login', component: EmptyRoute },
    { path: '/register', name: 'register', component: EmptyRoute },
    { path: '/dashboard', name: 'dashboard', component: EmptyRoute },
    { path: '/projects', name: 'projects', component: EmptyRoute },
    { path: '/projects/:id', name: 'project-detail', component: EmptyRoute },
    { path: '/projects/:id/meetings', name: 'project-meetings', component: EmptyRoute },
    { path: '/tasks', name: 'tasks', component: EmptyRoute },
    { path: '/my-tasks', name: 'my-tasks', component: EmptyRoute },
    { path: '/risks', name: 'risks', component: EmptyRoute },
    { path: '/notifications', name: 'notifications', component: EmptyRoute },
    { path: '/experiments', name: 'experiments', component: EmptyRoute },
    { path: '/settings', name: 'settings', component: EmptyRoute },
    { path: '/calendar', name: 'calendar', component: EmptyRoute },
    { path: '/efficiency', name: 'efficiency', component: EmptyRoute },
    { path: '/meetings', name: 'meetings', component: EmptyRoute },
    { path: '/meetings/:id/review', name: 'meeting-review', component: EmptyRoute },
    { path: '/reviews', name: 'reviews', component: EmptyRoute },
    { path: '/users', name: 'users', component: EmptyRoute },
    { path: '/audit-logs', name: 'audit-logs', component: EmptyRoute },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
  ],
})
