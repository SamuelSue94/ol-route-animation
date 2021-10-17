import { createApp } from 'vue'
import '@vant/touch-emulator';
import App from './App.vue'
import { Slider, Icon } from 'vant';

const app = createApp(App);
app.use(Slider).use(Icon);
app.mount('#app')
