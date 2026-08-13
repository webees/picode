import { LayoutDashboardIcon } from '@lucide/vue'

import type { NavGroup } from '@/components/app-sidebar/types'

export const navData: NavGroup[] = [
  {
    title: '监控面板',
    items: [
      { title: '运行实例', url: '/dashboard', icon: LayoutDashboardIcon },
    ],
  },
]

export const otherPages: NavGroup[] = []
