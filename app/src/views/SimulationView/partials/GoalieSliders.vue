<script setup>
defineProps({
  lateral: Number,
  depth: Number,
  rotation: Number,
  sideLabel: String,
  depthLabel: String,
  rotationLabel: String,
})

defineEmits([
  'update:lateral',
  'update:depth',
  'update:rotation',
  'update-goalie-controls',
  'update-goalie-rotation',
  'begin-interaction',
  'end-interaction',
  'enter-interaction',
  'leave-interaction',
  'stop-event',
])
</script>

<template>
  <div
    class="simulation-hud__sliders"
    @pointerenter="$emit('enter-interaction')"
    @pointerleave="$emit('leave-interaction')"
    @focusin="$emit('enter-interaction')"
    @focusout="$emit('leave-interaction')"
    @pointerdown.capture.stop="$emit('begin-interaction')"
    @pointermove.capture.stop="$emit('stop-event', $event)"
    @pointerup.capture.stop="$emit('end-interaction')"
    @pointercancel.capture.stop="$emit('end-interaction')"
    @mousedown.capture.stop="$emit('begin-interaction')"
    @mousemove.capture.stop="$emit('stop-event', $event)"
    @mouseup.capture.stop="$emit('end-interaction')"
    @touchstart.capture.stop="$emit('begin-interaction')"
    @touchmove.capture.stop="$emit('stop-event', $event)"
    @touchend.capture.stop="$emit('end-interaction')"
    @click.stop
    @wheel.stop
  >
    <label>
      <span>Goalie side</span>
      <strong>{{ sideLabel }}</strong>
      <input :value="lateral" type="range" min="-1.35" max="1.35" step="0.01" @input="$emit('update:lateral', Number($event.target.value)); $emit('update-goalie-controls', $event)" @change.stop>
    </label>
    <label>
      <span>Goalie depth</span>
      <strong>{{ depthLabel }}</strong>
      <input :value="depth" type="range" min="0" max="1" step="0.01" @input="$emit('update:depth', Number($event.target.value)); $emit('update-goalie-controls', $event)" @change.stop>
    </label>
    <label>
      <span>Goalie rotation</span>
      <strong>{{ rotationLabel }}</strong>
      <input :value="rotation" type="range" min="-60" max="60" step="1" @input="$emit('update:rotation', Number($event.target.value)); $emit('update-goalie-rotation', $event)" @change.stop>
    </label>
  </div>
</template>
