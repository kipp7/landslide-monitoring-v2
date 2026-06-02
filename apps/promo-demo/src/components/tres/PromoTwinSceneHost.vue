<script setup lang="ts">
import { useLoop, useTresContext } from '@tresjs/core'
import * as THREE from 'three'
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import {
  createPromoTwinScene,
  type PromoSceneController,
} from '../../composables/usePromoTwinScene'

const props = defineProps<{
  stage: number
  inactive: boolean
  boostToken: number
}>()

const emit = defineEmits<{
  ready: []
  failed: [message: string]
}>()

const { render } = useLoop()
const { scene, camera, renderer, sizes } = useTresContext()

const controller = shallowRef<PromoSceneController | null>(null)
let initializationFailed = false

function isPerspectiveCameraLike(value: unknown): value is THREE.PerspectiveCamera {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'isPerspectiveCamera' in value &&
      (value as { isPerspectiveCamera?: boolean }).isPerspectiveCamera
  )
}

function isWebGLRendererLike(value: unknown): value is THREE.WebGLRenderer {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'setPixelRatio' in value &&
      'setSize' in value &&
      'render' in value
  )
}

function initSceneController() {
  if (controller.value || initializationFailed) {
    return
  }

  const activeCamera = camera.activeCamera.value
  const rawRenderer = renderer.instance
  if (
    !isPerspectiveCameraLike(activeCamera) ||
    !isWebGLRendererLike(rawRenderer) ||
    !scene.value
  ) {
    return
  }

  try {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    controller.value = createPromoTwinScene(
      {
        scene: scene.value,
        camera: activeCamera,
        renderer: rawRenderer,
        width: sizes.width.value,
        height: sizes.height.value,
        pixelRatio: sizes.pixelRatio.value,
      },
      {
        reducedMotion,
      }
    )
    controller.value.setStage(props.stage)
    controller.value.setDormant(props.inactive)
    emit('ready')
  } catch (error) {
    initializationFailed = true
    const message = error instanceof Error ? error.message : 'Tres scene initialization failed'
    console.error('[promo-demo] failed to initialize Tres digital twin scene', error)
    emit('failed', message)
  }
}

watch(
  () => camera.activeCamera.value,
  () => {
    initSceneController()
  },
  { immediate: true }
)

watch(
  () => [sizes.width.value, sizes.height.value, sizes.pixelRatio.value] as const,
  ([width, height, pixelRatio]) => {
    initSceneController()
    controller.value?.resize(width, height, pixelRatio)
  },
  { immediate: true }
)

watch(
  () => props.stage,
  (nextStage) => {
    controller.value?.setStage(nextStage)
  }
)

watch(
  () => props.inactive,
  (nextInactive) => {
    controller.value?.setDormant(nextInactive)
  }
)

watch(
  () => props.boostToken,
  () => {
    controller.value?.boost()
  }
)

render((notifySuccess) => {
  controller.value?.frame()
  notifySuccess()
})

onBeforeUnmount(() => {
  controller.value?.destroy()
  controller.value = null
})
</script>

<template></template>
