<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
const editor = inject('services').editor
const state = editor.state
const selectedFile = ref('')
const loadedFile = ref('')
const dragging = ref('')
const draggingSlot = ref('')
const error = ref('')
const hasLoadedGame = computed(() => !!loadedFile.value)
let messageTimer
const activePlayers = computed(() => state.game.players)
const playerIds = computed(() => activePlayers.value.map(({ id }) => id))
const bestOptionIds = computed(() => [
  'shot',
  'protect',
  ...playerIds.value.filter((id) => id !== state.game.possession_player_id),
  ...state.game.slots.map(({ id }) => id),
])
const homePlayers = computed(() => activePlayers.value.filter(({ id }) => id.startsWith('home_')))
const guestPlayers = computed(() => activePlayers.value.filter(({ id }) => id.startsWith('guest_')))
const playerLabel = (id) => id.endsWith('_goalie') ? 'G' : id.split('_')[1]
const rinkCenter = { x: 125, y: 250 }
const playerRadius = 9
const playerBounds = { x: rinkCenter.x - playerRadius, y: rinkCenter.y - playerRadius }
const playerTransform = (player) => `translate(${rinkCenter.x + player.x * playerBounds.x} ${rinkCenter.y + player.y * playerBounds.y})`
const slotTransform = (slot) => `translate(${rinkCenter.x + slot.x * playerBounds.x} ${rinkCenter.y + slot.y * playerBounds.y})`
const clearMessageTimer = () => { clearTimeout(messageTimer); messageTimer = undefined }
const dismissMessage = () => { error.value = ''; editor.clearMessage() }
const scheduleMessageDismiss = () => {
  clearMessageTimer()
  if (error.value || state.message) messageTimer = setTimeout(dismissMessage, 3500)
}
const run = async (action) => {
  clearMessageTimer()
  error.value = ''
  try { await action() } catch (reason) { error.value = reason.message }
  scheduleMessageDismiss()
}
const pointFromEvent = (event) => {
  const svg = event.currentTarget
  const point = svg.createSVGPoint()
  point.x = event.clientX; point.y = event.clientY
  const local = point.matrixTransform(svg.getScreenCTM().inverse())
  return {
    x: Math.max(-1, Math.min(1, (local.x - rinkCenter.x) / playerBounds.x)),
    y: Math.max(-1, Math.min(1, (local.y - rinkCenter.y) / playerBounds.y)),
  }
}
const movePlayer = (event) => {
  if (!dragging.value && !draggingSlot.value) return
  const point = pointFromEvent(event)
  if (dragging.value) editor.setPlayerPosition(dragging.value, +point.x.toFixed(3), +point.y.toFixed(3))
  if (draggingSlot.value) editor.moveSlot(draggingSlot.value, +point.x.toFixed(3), +point.y.toFixed(3))
}
const stopDragging = () => { dragging.value = ''; draggingSlot.value = '' }
const loadSelected = () => selectedFile.value && run(async () => { await editor.load(selectedFile.value); loadedFile.value = selectedFile.value })
const saveSelected = () => run(async () => { loadedFile.value = await editor.save(loadedFile.value); selectedFile.value = loadedFile.value })
const deleteSelected = () => run(async () => { await editor.delete(loadedFile.value); selectedFile.value = ''; loadedFile.value = '' })
const createNew = () => run(async () => {
  selectedFile.value = ''
  loadedFile.value = ''
  editor.reset()
  editor.setField('name', 'Untitled game')
  loadedFile.value = await editor.save('')
  selectedFile.value = loadedFile.value
})
onMounted(() => run(() => editor.list()))
onBeforeUnmount(clearMessageTimer)
watch(() => state.message, scheduleMessageDismiss)
</script>

<template>
  <main class="editor-view" data-node-id="1:4" aria-label="Game editor">
    <div class="editor-view__workspace" data-node-id="1:6">
      <section class="editor-form" data-node-id="1:9">
        <div class="editor-form__row editor-form__row--split">
          <div class="editor-form__file-actions">
            <select v-model="selectedFile" aria-label="Saved game">
              <option value="">Select a game</option>
              <option v-for="file in state.files" :key="file.file" :value="file.file">{{ file.name }}</option>
            </select>
            <button class="button button--load" :disabled="!selectedFile || state.busy" @click="loadSelected">Load</button>
          </div>
          <button class="button button--create" :disabled="state.busy" @click="createNew">Create New</button>
        </div>
        <div v-if="hasLoadedGame" class="editor-form__row editor-form__row-controls">
          <span class="editor-form__filename">{{ loadedFile }}</span>
          <div class="editor-form__control-actions">
            <button class="button button--delete" :disabled="!loadedFile || state.busy" @dblclick="deleteSelected">Delete</button>
            <button class="button button--save" :disabled="!loadedFile || state.busy" @click="saveSelected">Save</button>
          </div>
        </div>
        <label v-if="hasLoadedGame" class="field"><span>Name</span><input :value="state.game.name" @input="editor.setField('name', $event.target.value)" /></label>
        <label v-if="hasLoadedGame" class="field"><span>Description</span><textarea :value="state.game.short_description" @input="editor.setField('short_description', $event.target.value)" /></label>
        <label v-if="hasLoadedGame" class="editor-form__row player-count"><span>Num players</span><input type="number" min="3" max="5" :value="state.game.num_players" @input="editor.setPlayerCount($event.target.value)" /></label>
        <div v-if="hasLoadedGame" class="teams" aria-label="Players">
          <div class="team-group team-group--home">
            <div v-for="player in homePlayers" :key="player.id" class="editor-form__row player-row">
              <input :value="player.id" readonly :aria-label="player.id" />
              <button class="button button--select" @click="dragging = player.id">Select</button>
            </div>
          </div>
          <div class="team-group team-group--guest">
            <div v-for="player in guestPlayers" :key="player.id" class="editor-form__row player-row">
              <input :value="player.id" readonly :aria-label="player.id" />
              <button class="button button--select" @click="dragging = player.id">Select</button>
            </div>
          </div>
        </div>
        <label v-if="hasLoadedGame" class="editor-form__row select-field"><span>Ball possession player</span><select :value="state.game.possession_player_id" @change="editor.setField('possession_player_id', $event.target.value)"><option v-for="id in playerIds" :key="id">{{ id }}</option></select></label>
        <label v-if="hasLoadedGame" class="editor-form__row select-field"><span>First person player</span><select :value="state.game.camera_player_id" @change="editor.setField('camera_player_id', $event.target.value)"><option v-for="id in playerIds" :key="id">{{ id }}</option></select></label>
        <section v-if="hasLoadedGame" class="slots-editor" aria-label="Slot regions">
          <div class="editor-form__row editor-form__row-controls">
            <span>Slots Regions</span>
            <button class="button button--add" :disabled="state.busy" @click="editor.addSlot()">Add Slot</button>
          </div>
          <div v-for="(slot, index) in state.game.slots" :key="slot.id" class="editor-form__row slot-row">
            <input :value="slot.id" readonly :aria-label="slot.id" />
            <button class="button button--select" @click="draggingSlot = slot.id">Select</button>
            <button class="button button--delete button--small" :disabled="state.busy" @click="editor.removeSlot(index)">Remove</button>
          </div>
        </section>
        <label v-if="hasLoadedGame" class="editor-form__row select-field"><span>Best option</span><select :value="state.game.best_option" @change="editor.setField('best_option', $event.target.value)"><option v-for="id in bestOptionIds" :key="id">{{ id }}</option></select></label>
        <p v-if="error || state.message" class="editor-form__message" :class="{ 'editor-form__message--error': error }">{{ error || state.message }}</p>
      </section>
      <section v-if="hasLoadedGame" class="rink-container" data-node-id="1:8" aria-label="Rink editor">
        <svg class="rink" viewBox="0 0 250 500" role="img" aria-label="Drag players on the rink" @pointermove="movePlayer" @pointerup="stopDragging" @pointercancel="stopDragging" @pointerleave="stopDragging">
          <image href="/assets/rink-field.svg" x="0" y="0" width="250" height="500" />
          <g v-for="player in activePlayers" :key="player.id" class="rink__player" :class="[`rink__player--${player.id.startsWith('home') ? 'home' : 'guest'}`, { 'rink__player--selected': dragging === player.id, 'with-ball': state.game.possession_player_id === player.id, 'with-camera': state.game.camera_player_id === player.id }]" :transform="playerTransform(player)" @pointerdown.prevent="dragging = player.id">
            <rect v-if="state.game.camera_player_id === player.id" x="-9" y="-9" width="18" height="18" />
            <circle v-else r="9" />
            <text y="3.5">{{ playerLabel(player.id) }}</text>
          </g>
          <g v-for="slot in state.game.slots" :key="slot.id" class="rink__slot" :class="{ 'rink__slot--selected': draggingSlot === slot.id }" :transform="slotTransform(slot)" @pointerdown.prevent="draggingSlot = slot.id"><rect x="-7" y="-7" width="14" height="14" /></g>
        </svg>
      </section>
    </div>
  </main>
</template>
<style lang="scss" src="./EditorView.scss"></style>
