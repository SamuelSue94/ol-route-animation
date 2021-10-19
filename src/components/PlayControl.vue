<script setup lang="ts">
import { PlayStatus } from "../package/types";
import { formatTimeStr } from "../utils";


const props = defineProps<{
  playedTime: number;
  totalTime: number;
  playState: PlayStatus;
}>();
const emit = defineEmits<{
  (e: "update:playState", value: PlayStatus): void;
  (e: "update:playedTime", value: number): void;
}>();

// 切换播放/暂停的回调
const togglePlayState = () => emit('update:playState', props.playState === PlayStatus.Playing ? PlayStatus.Pause : PlayStatus.Playing);
const onChange = (value:number) => emit('update:playedTime',value)
</script>

<template>
  <div class="play-con">
    <van-icon
      :name="playState === PlayStatus.Playing ? 'pause-circle' : 'play-circle'"
      size="2rem"
      color="#fff"
      @click="togglePlayState"
    />
    <div class="slider-con">
      <van-slider v-model="playedTime" :max="totalTime" step=16 @change=onChange></van-slider>
    </div>
    <div class="time-con">
      <div class="time">{{formatTimeStr(playedTime)}}</div>/<div class="time">{{formatTimeStr(totalTime)}}</div>
    </div>
  </div>
</template>

<style scoped>
.play-con {
  display: flex;
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 35px;
  flex-direction: row;
  align-items: center;
  background-color: rgba(0,0,0,.4);
  padding-left: 10px;
}
.slider-con {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: center;
  padding: 0 20px;
}
.time-con {
  width: 100px;
   color: #fff;
}
.time-con .time {
  display: inline-block;
}
</style>
