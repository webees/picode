<script setup lang="ts">
import { useCookies } from '@vueuse/integrations/useCookies'
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'

import AppSidebar from '@/components/app-sidebar/index.vue'
import CommandMenuPanel from '@/components/command-menu-panel/index.vue'
import ThemePopover from '@/components/custom-theme/theme-popover.vue'
import LanguageChange from '@/components/language-change.vue'
import ToggleTheme from '@/components/toggle-theme.vue'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { SIDEBAR_COOKIE_NAME } from '@/components/ui/sidebar/utils'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores/theme'

const defaultOpen = useCookies([SIDEBAR_COOKIE_NAME])
const themeStore = useThemeStore()
const { contentLayout } = storeToRefs(themeStore)

const route = useRoute()
const breadcrumbTitle = computed(() => {
  const meta = route.meta as Record<string, unknown>
  if (typeof meta.title === 'string')
    return meta.title
  const last = route.path.split('/').filter(Boolean).at(-1)
  return last ? decodeURIComponent(last) : 'Dashboard'
})
</script>

<template>
  <SidebarProvider :default-open="defaultOpen.get(SIDEBAR_COOKIE_NAME)">
    <AppSidebar />
    <SidebarInset class="w-full max-w-full peer-data-[state=collapsed]:w-[calc(100%-var(--sidebar-width-icon)-1rem)] peer-data-[state=expanded]:w-[calc(100%-var(--sidebar-width))]">
      <header
        class="flex items-center gap-3 sm:gap-4 h-16 p-4 shrink-0 transition-[width,height] ease-linear"
      >
        <SidebarTrigger class="-ml-1" />
        <Separator orientation="vertical" class="h-6" />
        <Breadcrumb class="hidden md:flex">
          <BreadcrumbList>
            <BreadcrumbItem class="hidden md:block">
              <BreadcrumbPage class="text-sm font-medium text-muted-foreground">
                {{ breadcrumbTitle }}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <CommandMenuPanel />
        <div class="flex-1" />
        <div class="ml-auto flex items-center space-x-4">
          <span class="hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex">
            <span class="size-2 rounded-full bg-status-success" aria-hidden="true" />
            运行中
          </span>
          <LanguageChange />
          <ToggleTheme />
          <ThemePopover />
        </div>
      </header>

      <main
        :class="cn(
          'p-4 grow relative',
          contentLayout === 'centered' ? 'container mx-auto ' : '',
        )"
      >
        <router-view />
      </main>
    </SidebarInset>
  </SidebarProvider>
</template>
