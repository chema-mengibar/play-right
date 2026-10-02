<script setup>
defineProps({
  creasePath: String,
  shotSegments: { type: Array, default: () => [] },
  goalieTransform: String,
})
</script>

<template>
  <svg class="simulation-map__overlay" viewBox="0 0 100 100" aria-hidden="true">
    <line x1="0" y1="9" x2="100" y2="9" class="simulation-map__goal-line" />
    <path d="M33 0 V9 M67 0 V9" class="simulation-map__goal-cage" />
    <path :d="creasePath" class="simulation-map__crease" />
    <line v-for="(segment, index) in shotSegments" :key="index" :x1="segment.start.x" :y1="segment.start.y" :x2="segment.end.x" :y2="segment.end.y" class="simulation-map__shot-line" />
    <rect x="-18" y="-3" width="36" height="6" class="simulation-map__goalie-box" :transform="goalieTransform" />
  </svg>
</template>
