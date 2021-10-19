<script setup lang="ts">
import { ref, watch } from 'vue';
import PlayControl from './components/PlayControl.vue';
import { PlayStatus } from './package/types';
import routeData from './data/routes.json';
import RouteMap from './components/RouteMap.vue';
import { INTERVAL } from './config';

const totalTime = routeData[routeData.length - 1].time * 1000;
// 播放状态
const playState = ref<PlayStatus>(PlayStatus.Pause);
// 播放时间
const playedTime = ref(0);
const startAnimate = () => {
  playedTime.value += INTERVAL;
  if (playState.value === PlayStatus.Playing) requestAnimationFrame(startAnimate)
}

watch(playState, (newVal) => {
  if (newVal === PlayStatus.Playing) startAnimate()
})

watch(playedTime, (newVal) => {
  console.log(newVal)
})

</script>

<template>
  <div class="container">
    <RouteMap :played-time="playedTime" :play-state="playState"></RouteMap>
    <PlayControl
      v-model:play-state="playState"
      v-model:played-time="playedTime"
      :total-time="totalTime"
    ></PlayControl>
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
