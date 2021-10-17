<script setup lang="ts">
import { ref } from '@vue/reactivity';
import PlayControl from './components/PlayControl.vue';
import { PlayStatus } from './package/types';
import routeData from './data/routes.json';
import RouteMap from './components/RouteMap.vue';

const totalTime = routeData.reduce((prev, cur) => prev + cur.time, 0) * 1000;
const playState = ref<PlayStatus>(PlayStatus.Pause);
const playedTime = ref(0);
</script>

<template>
  <div class="container">
    <RouteMap></RouteMap>
    <PlayControl v-model:play-state="playState" v-model:played-time="playedTime" :total-time="totalTime"></PlayControl>
  </div>
</template>

<style scoped>
* {
  margin: 0;
  padding: 0;
}
.container {
  width: 100vw;
  height: 100vh;
}
</style>
