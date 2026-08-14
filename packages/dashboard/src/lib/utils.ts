import type { Updater } from '@tanstack/vue-table'
import type { ClassValue } from 'clsx'
import type { Ref } from 'vue'

import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function valueUpdater<T extends Updater<any>>(updaterOrValue: T, ref: Ref) {
  ref.value
    = typeof updaterOrValue === 'function'
      ? updaterOrValue(ref.value)
      : updaterOrValue
}

/** shadcn Badge variant 联合（审计 P2-4：6 处组件各自重复 Record 值类型）。 */
export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'
