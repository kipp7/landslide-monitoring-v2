<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  ref,
  type ComponentPublicInstance,
} from 'vue'
import {
  PROMO_FINAL_CTA,
  PROMO_SECTIONS,
  PROMO_SOLUTIONS,
  type PromoSection,
} from './lib/sections'

const PromoScene = defineAsyncComponent(() => import('./components/PromoScene.vue'))

type SectionRefValue = Element | ComponentPublicInstance | null

const heroSection = PROMO_SECTIONS.find((section) => section.mode === 'hero') as PromoSection
const trilogySections = PROMO_SECTIONS.filter((section) => section.mode === 'trilogy')
const narrativeSections = PROMO_SECTIONS.filter((section) => section.mode === 'narrative')
const proofSection = PROMO_SECTIONS.find((section) => section.mode === 'proof') as PromoSection

const sectionById = new Map(PROMO_SECTIONS.map((section) => [section.id, section]))
const sectionOrder = new Map(
  PROMO_SECTIONS.map((section, index) => [section.id, String(index + 1).padStart(2, '0')])
)
const sectionRefs = new Map<string, HTMLElement>()

const activeSectionId = ref(heroSection.id)
const boostToken = ref(0)
const sceneReady = ref(false)
const sceneFailed = ref(false)
const menuOpen = ref(false)

let sectionObserver: IntersectionObserver | null = null

const navigationGroups = computed(() => [
  {
    title: 'Overview',
    items: [heroSection, ...trilogySections].map((section) => ({
      id: section.id,
      label: section.navLabel,
      meta: section.eyebrow,
    })),
  },
  {
    title: 'Proof',
    items: [...narrativeSections, proofSection].map((section) => ({
      id: section.id,
      label: section.navLabel,
      meta: section.headline,
    })),
  },
])

const activeSection = computed(() => sectionById.get(activeSectionId.value) ?? heroSection)
const activeSceneStage = computed(() => activeSection.value.sceneStage)
const stageLabel = computed(() => (sceneFailed.value ? 'Static Fallback' : 'Realtime Three.js Stage'))
const chapterLabel = computed(() => `${activeSection.value.navLabel} / ${activeSection.value.eyebrow}`)
const chapterReel = computed(() =>
  [...trilogySections, ...narrativeSections, proofSection].map((section) => ({
    id: section.id,
    order: sectionOrder.get(section.id) ?? '00',
    label: section.label,
    meta: section.headline,
  }))
)

function getSectionOrder(id: string) {
  return sectionOrder.get(id) ?? '00'
}

function setSectionRef(id: string) {
  return (value: SectionRefValue) => {
    if (value instanceof HTMLElement) {
      sectionRefs.set(id, value)
      sectionObserver?.observe(value)
      return
    }

    const current = sectionRefs.get(id)
    if (current) {
      sectionObserver?.unobserve(current)
      sectionRefs.delete(id)
    }
  }
}

function scrollToSection(id: string) {
  menuOpen.value = false
  sectionRefs.get(id)?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start',
  })
}

function triggerBoost() {
  boostToken.value += 1
}

function handleSceneReady() {
  sceneReady.value = true
}

function handleSceneFailure() {
  sceneReady.value = true
  sceneFailed.value = true
}

onMounted(() => {
  history.scrollRestoration = 'manual'
  window.scrollTo({ top: 0, behavior: 'auto' })

  sectionObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort(
          (left, right) =>
            right.intersectionRatio - left.intersectionRatio ||
            left.boundingClientRect.top - right.boundingClientRect.top
        )

      if (visible[0]) {
        activeSectionId.value = (visible[0].target as HTMLElement).id
      }
    },
    {
      threshold: [0.2, 0.4, 0.68],
      rootMargin: '-18% 0px -18% 0px',
    }
  )

  sectionRefs.forEach((element) => sectionObserver?.observe(element))
})

onBeforeUnmount(() => {
  sectionObserver?.disconnect()
  sectionObserver = null
})
</script>

<template>
  <div class="clone-app" :class="{ 'is-scene-failed': sceneFailed, 'is-menu-open': menuOpen }">
    <PromoScene
      :stage="activeSceneStage"
      :inactive="false"
      :boost-token="boostToken"
      @ready="handleSceneReady"
      @failed="handleSceneFailure"
    />

    <div class="scene-mask"></div>
    <div class="scene-grid"></div>
    <div class="scene-noise"></div>
    <div class="scene-aura scene-aura--left"></div>
    <div class="scene-aura scene-aura--right"></div>

    <header class="site-nav">
      <button class="site-nav__brand" type="button" @click="scrollToSection(heroSection.id)">
        <span class="site-nav__logo">LS</span>
        <span class="site-nav__brand-copy">
          <strong>Landslide Sentinel</strong>
          <small>{{ stageLabel }}</small>
        </span>
      </button>

      <div class="site-nav__meta">
        <span class="site-pill">Reference Rebuild</span>
        <span class="site-pill">{{ chapterLabel }}</span>
      </div>

      <button
        class="site-nav__menu"
        type="button"
        :aria-expanded="menuOpen"
        aria-label="Toggle navigation"
        @click="menuOpen = !menuOpen"
      >
        <span></span>
        <span></span>
      </button>
    </header>

    <aside class="menu-drawer" :class="{ 'is-open': menuOpen }">
      <div class="menu-drawer__header">
        <p>Navigation</p>
        <button type="button" @click="menuOpen = false">Close</button>
      </div>

      <div class="menu-drawer__groups">
        <section v-for="group in navigationGroups" :key="group.title" class="menu-group">
          <p class="menu-group__title">{{ group.title }}</p>
          <button
            v-for="item in group.items"
            :key="item.id"
            type="button"
            class="menu-link"
            :class="{ 'is-active': item.id === activeSectionId }"
            @click="scrollToSection(item.id)"
          >
            <span>{{ item.label }}</span>
            <small>{{ item.meta }}</small>
          </button>
        </section>
      </div>
    </aside>

    <div class="menu-backdrop" :class="{ 'is-open': menuOpen }" @click="menuOpen = false"></div>

    <div class="scene-status" :class="{ 'is-hidden': sceneReady && !sceneFailed }" aria-live="polite">
      <p class="scene-status__eyebrow">Scene Boot</p>
      <h2>重建风险舞台</h2>
      <div class="scene-status__bar"><span></span></div>
      <p>{{ sceneFailed ? 'WebGL 未完成初始化，当前使用静态舞台。' : '装配主核切片、边缘塔、束线、风险环与数据面板中...' }}</p>
    </div>

    <main class="site-main">
      <section :id="heroSection.id" :ref="setSectionRef(heroSection.id)" class="page-rail landing-rail">
        <div class="sticky">
          <div class="landing-shell">
            <div class="landing-shell__copy">
              <p class="kicker">{{ heroSection.eyebrow }}</p>
              <h1>{{ heroSection.label }}</h1>
              <p class="landing-shell__headline">{{ heroSection.headline }}</p>
              <p class="landing-shell__deck">{{ heroSection.deck }}</p>

              <div class="landing-shell__actions">
                <button type="button" class="action-button action-button--primary" @click="scrollToSection(trilogySections[0].id)">
                  Enter Stack
                </button>
                <button type="button" class="action-button" @click="triggerBoost">Pulse Scene</button>
              </div>

              <div class="chip-row">
                <span v-for="chip in heroSection.chips" :key="chip" class="chip">{{ chip }}</span>
              </div>
            </div>

            <div class="landing-shell__panel">
              <div class="landing-shell__panel-header">
                <p class="kicker">Current Chapter</p>
                <h2>{{ activeSection.navLabel }}</h2>
                <p class="landing-shell__panel-copy">{{ heroSection.description }}</p>
              </div>

              <div class="landing-shell__chapter-list">
                <button
                  v-for="item in chapterReel"
                  :key="item.id"
                  type="button"
                  class="chapter-link"
                  :class="{ 'is-active': item.id === activeSectionId }"
                  @click="scrollToSection(item.id)"
                >
                  <small>{{ item.order }}</small>
                  <span>{{ item.label }}</span>
                  <em>{{ item.meta }}</em>
                </button>
              </div>

              <div class="stat-grid stat-grid--hero">
                <article v-for="stat in heroSection.stats" :key="stat.label" class="stat-card">
                  <p>{{ stat.label }}</p>
                  <strong>{{ stat.value }}</strong>
                </article>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        v-for="section in trilogySections"
        :id="section.id"
        :key="section.id"
        :ref="setSectionRef(section.id)"
        class="page-rail chapter-rail"
        :class="section.railClass"
      >
        <div class="sticky">
          <div class="chapter-shell">
            <div class="chapter-shell__stage">
              <p class="section-index">{{ getSectionOrder(section.id) }}</p>
              <p class="kicker">{{ section.eyebrow }}</p>
              <h2>{{ section.label }}</h2>
              <p class="chapter-shell__headline">{{ section.headline }}</p>
            </div>

            <div class="chapter-shell__content">
              <p class="chapter-shell__deck">{{ section.deck }}</p>
              <p class="chapter-shell__description">{{ section.description }}</p>

              <ul class="bullet-list">
                <li v-for="bullet in section.bullets" :key="bullet">{{ bullet }}</li>
              </ul>

              <div class="chip-row">
                <span v-for="chip in section.chips" :key="chip" class="chip">{{ chip }}</span>
              </div>
            </div>

            <div class="stat-grid">
              <article v-for="stat in section.stats" :key="stat.label" class="stat-card">
                <p>{{ stat.label }}</p>
                <strong>{{ stat.value }}</strong>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section
        v-for="section in narrativeSections"
        :id="section.id"
        :key="section.id"
        :ref="setSectionRef(section.id)"
        class="page-rail narrative-rail"
        :class="section.railClass"
      >
        <div class="sticky">
          <div class="narrative-shell">
            <div class="narrative-shell__copy">
              <p class="section-index">{{ getSectionOrder(section.id) }}</p>
              <p class="kicker">{{ section.eyebrow }}</p>
              <h2>{{ section.label }}</h2>
              <p class="narrative-shell__headline">{{ section.headline }}</p>
            </div>

            <div class="narrative-shell__content">
              <p class="narrative-shell__deck">{{ section.deck }}</p>
              <p class="narrative-shell__description">{{ section.description }}</p>

              <ul class="bullet-list">
                <li v-for="bullet in section.bullets" :key="bullet">{{ bullet }}</li>
              </ul>

              <div class="stat-grid">
                <article v-for="stat in section.stats" :key="stat.label" class="stat-card">
                  <p>{{ stat.label }}</p>
                  <strong>{{ stat.value }}</strong>
                </article>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        :id="proofSection.id"
        :ref="setSectionRef(proofSection.id)"
        class="page-rail proof-rail"
        :class="proofSection.railClass"
      >
        <div class="sticky">
          <div class="proof-shell">
            <div class="proof-shell__copy">
              <p class="section-index">{{ getSectionOrder(proofSection.id) }}</p>
              <p class="kicker">{{ proofSection.eyebrow }}</p>
              <h2>{{ proofSection.label }}</h2>
              <p class="proof-shell__headline">{{ proofSection.headline }}</p>
              <p class="proof-shell__deck">{{ proofSection.deck }}</p>
              <p class="proof-shell__description">{{ proofSection.description }}</p>

              <div class="proof-shell__actions">
                <button type="button" class="action-button action-button--primary" @click="triggerBoost">
                  Trigger Replay
                </button>
                <button type="button" class="action-button" @click="scrollToSection('solutions')">
                  View Delivery Surface
                </button>
              </div>
            </div>

            <div class="proof-shell__side">
              <div class="chip-row">
                <span v-for="chip in proofSection.chips" :key="chip" class="chip">{{ chip }}</span>
              </div>

              <div class="stat-grid">
                <article v-for="stat in proofSection.stats" :key="stat.label" class="stat-card">
                  <p>{{ stat.label }}</p>
                  <strong>{{ stat.value }}</strong>
                </article>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="solutions" class="solutions-section">
        <div class="section-shell">
          <div class="section-shell__header">
            <p class="kicker">Delivery Surface</p>
            <h2>BUILD, OPERATE, EXPAND</h2>
            <p>回到真实部署与运营面，不再堆概念。这里承接交付路径、运行边界和区域复制能力。</p>
          </div>

          <div class="solution-grid">
            <article v-for="card in PROMO_SOLUTIONS" :key="card.title" class="solution-card">
              <p class="solution-card__eyebrow">{{ card.eyebrow }}</p>
              <h3>{{ card.title }}</h3>
              <p>{{ card.body }}</p>

              <div class="solution-card__stats">
                <div v-for="stat in card.stats" :key="stat.label">
                  <small>{{ stat.label }}</small>
                  <strong>{{ stat.value }}</strong>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <footer class="footer-shell">
        <div class="section-shell footer-shell__inner">
          <div class="footer-shell__copy">
            <p class="kicker">{{ PROMO_FINAL_CTA.eyebrow }}</p>
            <h2>{{ PROMO_FINAL_CTA.title }}</h2>
            <p>{{ PROMO_FINAL_CTA.body }}</p>
          </div>

          <div class="footer-shell__actions">
            <button type="button" class="action-button action-button--primary" @click="scrollToSection(heroSection.id)">
              {{ PROMO_FINAL_CTA.actions[0].label }}
            </button>
            <button type="button" class="action-button" @click="triggerBoost">
              {{ PROMO_FINAL_CTA.actions[1].label }}
            </button>
          </div>

          <div class="footer-shell__notes">
            <article v-for="note in PROMO_FINAL_CTA.notes" :key="note.label" class="stat-card">
              <p>{{ note.label }}</p>
              <strong>{{ note.value }}</strong>
            </article>
          </div>
        </div>
      </footer>
    </main>
  </div>
</template>
