<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import PromoTwinSceneHost from './PromoTwinSceneHost.vue'

const props = defineProps<{
  stage: number
  inactive: boolean
  boostToken: number
}>()

const emit = defineEmits<{
  ready: []
  failed: [message: string]
}>()

const gl = {
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance' as const,
}
</script>

<template>
  <div class="promo-scene">
    <TresCanvas window-size clear-color="#03070d" :gl="gl">
      <TresPerspectiveCamera :position="[7.4, 7.8, 9.1]" :look-at="[0, 1.45, 0]" />
      <PromoTwinSceneHost
        :stage="props.stage"
        :inactive="props.inactive"
        :boost-token="props.boostToken"
        @ready="emit('ready')"
        @failed="(message) => emit('failed', message)"
      />
    </TresCanvas>
  </div>
</template>
