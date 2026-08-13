import { ActivityIcon, GitMergeIcon, LayoutDashboardIcon, ListTodoIcon, ShieldCheckIcon } from '@lucide/vue'

import type { NavGroup } from '@/components/app-sidebar/types'

export const navData: NavGroup[] = [
  {
    title: 'General',
    items: [
      { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboardIcon },
    ],
  },
  {
    title: 'Runs',
    items: [
      { title: 'Runs', url: '/dashboard', icon: ListTodoIcon },
      { title: '运行中', url: '/dashboard', icon: ActivityIcon },
      { title: '合并列车', url: '/dashboard', icon: GitMergeIcon },
      { title: '门禁', url: '/dashboard', icon: ShieldCheckIcon },
    ],
  },
]

export const otherPages: NavGroup[] = []
