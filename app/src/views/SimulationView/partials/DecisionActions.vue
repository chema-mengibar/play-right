<script setup>
defineEmits(['choose'])
</script>

<template>
  <div class="simulation-actions">
    <button type="button" @click.stop="$emit('choose', 'protect')">Protect</button>
    <button type="button" @click.stop="$emit('choose', 'shot')">Shot</button>
  </div>
</template>
