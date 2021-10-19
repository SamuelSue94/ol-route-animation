<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { createMap } from '../package/route/map';
import { RouteControl } from '../package/route/route';
import RouteData from '../data/routes.json';
import { PlayStatus } from '../package/types';

const props = defineProps<{
  readonly playState: PlayStatus;
  readonly playedTime: number;
}>()

let routeControl: RouteControl
onMounted(() => {
  const map = createMap('map')
  routeControl = new RouteControl(map, RouteData.map(item => ({ ...item, overSpeed: !!item.overSpeed })))
})

watch(() => props.playedTime, () => {
  routeControl.playedTime = props.playedTime
})
</script>

<template>
  <div id="map"></div>
</template>

<style scoped>
#map {
  width: 100%;
  height: calc(100% - 35px);
}
</style>