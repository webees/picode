import { LayoutDashboardIcon } from '@lucide/vue'

import type { NavGroup } from '@/components/app-sidebar/types'

/**
 * 侧边栏导航（UI 检修）：收敛为真实路由，文案通俗。
 * 面板只读，主路由仅 /dashboard（运行总览）；运行详情从总览卡片进入。
 */
export const navData: NavGroup[] = [
  {
    title: '总览',
    items: [
      { title: '运行总览', url: '/dashboard', icon: LayoutDashboardIcon },
    ],
  },
]

export const otherPages: NavGroup[] = []
