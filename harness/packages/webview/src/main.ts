import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import router from './router';
import './main.css';
import { initializeGlobalMessageBus } from './lib/messageBus';

// Initialize global message bus (includes automatic theme listener)
initializeGlobalMessageBus();

const app = createApp(App);

app.use(createPinia());
app.use(router);

app.mount('#app');
