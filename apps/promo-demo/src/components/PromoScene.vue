<script setup lang="ts">
import PromoTresCanvas from './tres/PromoTresCanvas.vue'

const props = defineProps<{
  stage: number
  inactive: boolean
  boostToken: number
}>()

const emit = defineEmits<{
  ready: []
  failed: [message: string]
}>()
</script>

<template>
  <PromoTresCanvas
    :stage="props.stage"
    :inactive="props.inactive"
    :boost-token="props.boostToken"
    @ready="emit('ready')"
    @failed="(message) => emit('failed', message)"
  />
</template>
