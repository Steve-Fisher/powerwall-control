<template>
  <div class="shell">
    <header class="bar">
      <h1>Powerwall Control</h1>
      <span v-if="isMock" class="badge" title="Desktop browser: Tesla API is mocked">mock</span>
    </header>
    <main>
      <NuxtPage />
    </main>
  </div>
</template>

<script setup lang="ts">
const { isMock } = useTeslaAuth()
</script>
