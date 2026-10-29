import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const modeLabel = atom({ plugin: 'usage-footer', key: 'modeLabel' } as const, '')
// ponytail: matches the engine's "⏵⏵ auto mode on (shift+tab to cycle)" wording; update if it changes
const MODE_PILL = /[⏵⏸]+\s*(.+?)\s+on\s*\(shift\+tab[^)]*\)\s*(·\s*)?/

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`)
const bar = (pct: number, width = 10) => {
  const full = Math.round((Math.min(pct, 100) / 100) * width)
  return '█'.repeat(full) + '░'.repeat(width - full)
}

async function showStatus($: EngineInterface) {
  const u = await $.session.usage()
  const pct = u.context.percent ?? 0
  const limits = u.rateLimits
    .map(l => `${l.kind === 'five_hour' ? '5h' : l.kind === 'seven_day' ? '7d' : l.kind} ${l.percentUsed}%`)
    .join(' · ')
  $.ui.status(
    [`ctx ${bar(pct)} ${pct}% (${k(u.context.tokens ?? 0)}/${k(u.context.window)})`,
      `$${(u.cost?.usd ?? 0).toFixed(2)}`, limits].filter(Boolean).join('  │  '),
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await showStatus($)
    return started
  })

  // engine pushes new figures after each turn
  on('session.measure', async ($, e, next) => {
    await showStatus($)
    return next(e)
  })

  // move the permission-mode pill from the left hint line to the right-side labels
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const m = e.props.hint.match(MODE_PILL)
    const label = m?.[1]?.trim() ?? ''
    if ((await read($, modeLabel)) !== label) await update($, modeLabel, () => label)
    if (!m) return next(e)
    return next({ ...e, props: { ...e.props, hint: e.props.hint.replace(MODE_PILL, '').trim() } })
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const extra = [await read($, modeLabel)]
    const dir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`
    const flag = await $.fs.read(`${dir}/.ponytail-active`).catch(() => null)
    if (flag !== null) {
      const lvl = flag.trim().split('\n')[0]?.trim()
      extra.push(!lvl || lvl === 'full' ? 'ponytail' : `ponytail:${lvl}`)
    }
    return next({ ...e, props: { ...e.props, modes: [...e.props.modes, ...extra.filter(Boolean)] } })
  })
}
