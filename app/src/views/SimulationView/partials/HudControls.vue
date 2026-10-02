<script setup>
import { computed, inject } from 'vue'

const simulation = inject('services').simulation
const hud = computed(() => simulation.state.hud)
const analyticsActive = computed(() => Object.values(hud.value.activeAnalytics).some(Boolean))

defineEmits([
  'toggle-grid',
  'toggle-free-camera',
  'toggle-ruler',
  'toggle-passing-lanes',
  'toggle-goalie-coverage',
  'toggle-heat-map',
  'toggle-team-areas',
  'toggle-player-areas',
  'toggle-cartoon-mode',
  'begin-interaction',
  'end-interaction',
  'stop-event',
])
</script>

<template>
  <div
    class="simulation-hud__controls"
    @pointerdown.capture.stop="$emit('begin-interaction')"
    @pointermove.capture.stop="$emit('stop-event', $event)"
    @pointerup.capture.stop="$emit('end-interaction')"
    @pointercancel.capture.stop="$emit('end-interaction')"
    @mousedown.capture.stop="$emit('begin-interaction')"
    @mousemove.capture.stop="$emit('stop-event', $event)"
    @mouseup.capture.stop="$emit('end-interaction')"
    @click.stop
    @wheel.stop
  >
    <button type="button" :class="{ 'is-active': hud.showTopView }" @click.stop="simulation.toggleTopView()">2D</button>
    <button type="button" :class="{ 'is-active': hud.showGoalOverlay }" @click.stop="simulation.toggleGoalOverlay()">Goal</button>
    <button type="button" :class="{ 'is-active': hud.showGrid }" @click.stop="$emit('toggle-grid')">Grid</button>
    <button type="button" :class="{ 'is-active': hud.freeCamera }" @click.stop="$emit('toggle-free-camera')">Orbit</button>
    <button type="button" :class="{ 'is-active': hud.showRuler }" @click.stop="$emit('toggle-ruler')">Ruler</button>
    <div class="simulation-hud__analytics">
      <button type="button" :class="{ 'is-active': hud.showAnalyticsMenu || analyticsActive }" aria-label="Analytics" @click.stop="simulation.toggleAnalyticsMenu()">...</button>
      <div v-if="hud.showAnalyticsMenu" class="simulation-hud__analytics-menu">
        <button type="button" :class="{ 'is-active': hud.activeAnalytics.passingLanes }" @click.stop="$emit('toggle-passing-lanes')">Passing lanes</button>
        <button type="button" :class="{ 'is-active': hud.activeAnalytics.goalieCoverage }" @click.stop="$emit('toggle-goalie-coverage')">Goalie cone</button>
        <button type="button" :class="{ 'is-active': hud.activeAnalytics.heatMap }" @click.stop="$emit('toggle-heat-map')">Open space</button>
        <button type="button" :class="{ 'is-active': hud.activeAnalytics.teamAreas }" @click.stop="$emit('toggle-team-areas')">Team areas</button>
        <button type="button" :class="{ 'is-active': hud.activeAnalytics.playerAreas }" @click.stop="$emit('toggle-player-areas')">Player areas</button>
        <button type="button" :class="{ 'is-active': hud.cartoonMode }" @click.stop="$emit('toggle-cartoon-mode')">Cartoon mode</button>
      </div>
    </div>
  </div>
</template>
