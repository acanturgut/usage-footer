export type ModeLabel = string

declare module 'claude-code' {
  interface PluginState {
    'usage-footer': { modeLabel: ModeLabel }
  }
}
