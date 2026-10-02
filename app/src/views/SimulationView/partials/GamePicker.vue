<script setup>
defineProps({
  show: Boolean,
  games: { type: Array, default: () => [] },
  currentFile: String,
})

defineEmits(['close', 'select'])
</script>

<template>
  <section v-if="show" class="simulation-game-picker" role="dialog" aria-modal="true" aria-label="Available games" @click.self="$emit('close')">
    <div class="simulation-game-picker__panel">
      <header>
        <strong>Games</strong>
        <button type="button" aria-label="Close" @click.stop="$emit('close')">Close</button>
      </header>
      <div class="simulation-game-picker__body">
        <button v-for="game in games" :key="game.file" type="button" :class="{ 'is-active': currentFile === game.file }" @click.stop="$emit('select', game.file)">
          <strong>{{ game.name || game.file }}</strong>
          <span>{{ game.file }}</span>
        </button>
      </div>
    </div>
  </section>
</template>
