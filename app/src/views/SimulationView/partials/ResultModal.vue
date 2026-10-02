<script setup>
defineProps({
  result: Object,
  solutionLabel: String,
  decisionTime: String,
})

defineEmits(['next'])
</script>

<template>
  <section v-if="result" class="simulation-modal" role="dialog" aria-modal="true">
    <div class="simulation-modal__panel" :class="{ 'simulation-modal__panel--success': result.success, 'simulation-modal__panel--error': !result.success }">
      <strong>{{ result.success ? 'Success' : 'Error' }}</strong>
      <em v-if="solutionLabel">Solution: {{ solutionLabel }}</em>
      <span>{{ decisionTime }}s</span>
      <button type="button" @click.stop="$emit('next')">Next</button>
    </div>
  </section>
</template>
