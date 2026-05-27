import {createApp} from 'vue';
import App from './App.vue';
import router from './router';
import './style.css';
import { init } from '@/init/init.js';
import { createPinia } from 'pinia';
import piniaPersistedState from 'pinia-plugin-persistedstate';
import 'element-plus/theme-chalk/dark/css-vars.css';
import 'nprogress/nprogress.css';
import perm from "@/perm/perm.js";
import {installDebugCapture, recordDebugError} from "@/utils/debug-capture.js";
const pinia = createPinia().use(piniaPersistedState)
import i18n from "@/i18n/index.js";
const app = createApp(App).use(pinia)
installDebugCapture(app)
await init().catch(error => {
    recordDebugError('init.error', {error});
    console.error(error);
})
app.use(router).use(i18n).directive('perm',perm)
app.config.devtools = true;

app.mount('#app');
