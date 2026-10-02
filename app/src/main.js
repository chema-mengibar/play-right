import { createApp } from 'vue'
import App from './App.vue'
import router from './router.js'
import { serviceRegister } from './services/service-register.js'
import './styles/index.scss'

createApp(App).use(router).provide('services', serviceRegister).mount('#app')
