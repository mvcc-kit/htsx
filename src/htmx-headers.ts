export const HX_HEADERS = {
  Location:           'HX-Location',
  PushUrl:            'HX-Push-Url',
  Redirect:           'HX-Redirect',
  Refresh:            'HX-Refresh',
  ReplaceUrl:         'HX-Replace-Url',
  Reswap:             'HX-Reswap',
  Retarget:           'HX-Retarget',
  Reselect:           'HX-Reselect',
  Trigger:            'HX-Trigger',
  TriggerAfterSettle: 'HX-Trigger-After-Settle',
  TriggerAfterSwap:   'HX-Trigger-After-Swap',
} as const

/** `HX-Trigger` em JSON. Cabeçalho não aceita acento, então o que não for ASCII vira `\uXXXX`. */
export function triggerHeader(events: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(events).replace(/[^\x20-\x7e]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
}
