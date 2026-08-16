import { describe, expect, it } from 'vitest'

import {
  BUS_TYPE_ZH,
  deriveMembers,
  messageTypeLabel,
  precheckSend,
  relativeTime,
} from '../components/chat.data'

describe('chat.data', () => {
  it('messageTypeLabel: 已知类型中文映射', () => {
    expect(messageTypeLabel('chat')).toBe('聊天')
    expect(messageTypeLabel('cell_done')).toBe('任务完成')
    expect(messageTypeLabel('system')).toBe('系统')
  })

  it('messageTypeLabel: 未知类型缺省回退原 id', () => {
    expect(messageTypeLabel('weird_type')).toBe('weird_type')
    expect(messageTypeLabel(null)).toBe('未知')
    expect(messageTypeLabel(undefined)).toBe('未知')
  })

  it('BUS_TYPE_ZH 覆盖核心类型', () => {
    for (const k of ['chat', 'event', 'notice', 'alert', 'command', 'report', 'decision', 'error', 'system', 'cell_done']) {
      expect(BUS_TYPE_ZH[k]).toBeTruthy()
    }
  })

  it('deriveMembers: access=post + post_types_allow 含 chat → canChat', () => {
    const members = [
      { id: 'sponsor', access: 'post', post_types_allow: ['chat'] },
      { id: 'engineer', access: 'read', post_types_allow: [] },
      { id: 'pm', access: 'post', post_types_allow: ['report'] },
    ]
    const view = deriveMembers(members)
    expect(view[0].canChat).toBe(true)
    expect(view[1].canChat).toBe(false)
    expect(view[2].canChat).toBe(false)
    expect(view[0].post_types.join(',')).toBe('chat')
  })

  it('deriveMembers: 空/缺失安全', () => {
    expect(deriveMembers(null)).toEqual([])
    expect(deriveMembers(undefined)).toEqual([])
    expect(deriveMembers([])).toEqual([])
  })

  it('precheckSend: 空文本 / 未授权房拒绝', () => {
    expect(precheckSend('  ', true, 'leadership、product')).toBeTruthy()
    expect(precheckSend('', true, 'leadership、product')).toBeTruthy()
    expect(precheckSend('hi', false, 'leadership、product')).toBeTruthy()
    expect(precheckSend('hi', true, 'leadership、product')).toBeNull()
  })

  it('relativeTime: 中文相对时间', () => {
    const now = Date.now()
    expect(relativeTime(new Date(now - 10_000).toISOString(), now)).toBe('刚刚')
    expect(relativeTime(new Date(now - 60_000).toISOString(), now)).toBe('1 分钟前')
    expect(relativeTime(new Date(now - 3_600_000).toISOString(), now)).toBe('1 小时前')
    expect(relativeTime(new Date(now - 86_400_000).toISOString(), now)).toBe('1 天前')
    expect(relativeTime('not-a-date', now)).toBe('not-a-date')
  })
})
