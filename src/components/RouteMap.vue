<script setup lang="ts">
import { nextTick, onMounted } from '@vue/runtime-core';
import { createMap } from '../package/route/map';
import { RouteControl } from '../package/route/route';
import RouteData from '../data/routes.json';

onMounted(() => {
  const map = createMap('map');
  const routeControl = new RouteControl(map, RouteData);
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