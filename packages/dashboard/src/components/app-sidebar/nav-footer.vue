<script setup lang="ts">
import { ChevronsUpDownIcon } from '@lucide/vue'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'

import type { User } from './types'

const { user } = defineProps<
  { user: User }
>()

const { isMobile, open } = useSidebar()
</script>

<template>
  <SidebarMenu>
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <SidebarMenuButton
            size="lg"
            class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            <Avatar class="size-8 rounded-lg">
              <AvatarImage :src="user.avatar" :alt="user.name" />
              <AvatarFallback class="rounded-lg">
                CN
              </AvatarFallback>
            </Avatar>
            <div class="grid flex-1 text-sm leading-tight text-left">
              <span class="font-semibold truncate">{{ user.name }}</span>
              <span class="text-xs truncate">{{ user.email }}</span>
            </div>
            <ChevronsUpDownIcon class="ml-auto size-4" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          class="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
          :side="(isMobile || open) ? 'bottom' : 'right'"
          align="start"
          :side-offset="4"
        >
          <DropdownMenuLabel class="p-0 font-normal">
            <div class="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
              <Avatar class="size-8 rounded-lg">
                <AvatarImage :src="user.avatar" :alt="user.name" />
                <AvatarFallback class="rounded-lg">
                  CN
                </AvatarFallback>
              </Avatar>
              <div class="grid flex-1 text-sm leading-tight text-left">
                <span class="font-semibold truncate">{{ user.name }}</span>
                <span class="text-xs truncate">{{ user.email }}</span>
              </div>
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuLabel class="px-2 py-1.5 text-xs text-muted-foreground">
            Picode Local Monitor
          </DropdownMenuLabel>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  </SidebarMenu>
</template>
