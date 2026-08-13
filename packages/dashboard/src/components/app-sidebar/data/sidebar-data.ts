import { GalleryVerticalEndIcon } from '@lucide/vue'

import { navData } from '@/constants/sidebar-data'

import type { SidebarData, Team, User } from '../types'

const user: User = {
  name: 'picode',
  email: 'monitor@picode.local',
  avatar: '/logo.svg',
}

const teams: Team[] = [
  {
    name: 'Picode Monitor',
    logo: GalleryVerticalEndIcon,
    plan: 'local',
  },
]

export const sidebarData: SidebarData = {
  user,
  teams,
  navMain: navData,
}
