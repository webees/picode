import { defineStore } from 'pinia'

import type { ContentLayout, Radius, Theme } from '@/constants/themes'

import { DEFAULT_RADIUS, DEFAULT_THEME } from '@/constants/themes'

export const useThemeStore = defineStore('system-config', () => {
  const radius = shallowRef<Radius>(DEFAULT_RADIUS)
  function setRadius(newRadius: Radius) {
    radius.value = newRadius
  }
  const theme = shallowRef<Theme>(DEFAULT_THEME)
  function setTheme(newTheme: Theme) {
    theme.value = newTheme
  }

  const contentLayout = shallowRef<ContentLayout>('centered')
  function setContentLayout(newContentLayout: ContentLayout) {
    contentLayout.value = newContentLayout
  }
  return {
    radius,
    setRadius,

    theme,
    setTheme,

    contentLayout,
    setContentLayout,
  }
}, {
  persist: {
    storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
  },
})
