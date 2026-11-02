/**
 * @repo/htsx-ui — tokens e componentes base sobre o @repo/htsx.
 * Camada acima do núcleo: o núcleo (`src/`) nunca importa daqui.
 * Estilo por variáveis CSS (`tokens`) e classes `ui-*` (`uiCss`); sem Tailwind.
 */
import { Field as CoreField, clx, type Children, type FieldProps } from '@repo/htsx'

/** Variáveis CSS do tema. Troque os valores para mudar a marca. */
export const tokens = {
  '--ui-font': 'system-ui, sans-serif',
  '--ui-radius': '6px',
  '--ui-space': '0.5rem',
  '--ui-fg': '#18181b',
  '--ui-bg': '#ffffff',
  '--ui-muted': '#71717a',
  '--ui-border': '#d4d4d8',
  '--ui-primary': '#047857',
  '--ui-primary-fg': '#ffffff',
  '--ui-danger': '#b91c1c',
  '--ui-success': '#15803d',
  '--ui-warning': '#b45309',
} as const

const vars = Object.entries(tokens).map(([k, v]) => `${k}:${v}`).join(';')

/** CSS dos componentes. Use com `<style>{raw(uiCss)}</style>`. */
export const uiCss = `:root{${vars}}
.ui-btn{font:600 0.875rem var(--ui-font);border:1px solid var(--ui-border);border-radius:var(--ui-radius);padding:var(--ui-space) calc(var(--ui-space)*2);background:var(--ui-bg);color:var(--ui-fg);cursor:pointer}
.ui-btn:disabled{opacity:.5;cursor:not-allowed}
.ui-btn-primary{background:var(--ui-primary);border-color:var(--ui-primary);color:var(--ui-primary-fg)}
.ui-btn-danger{background:var(--ui-danger);border-color:var(--ui-danger);color:#fff}
.ui-field{display:grid;gap:calc(var(--ui-space)/2);font-family:var(--ui-font)}
.ui-field input{border:1px solid var(--ui-border);border-radius:var(--ui-radius);padding:var(--ui-space)}
.ui-field input[aria-invalid=true]{border-color:var(--ui-danger)}
.ui-field .field-error{color:var(--ui-danger);font-size:.8rem}
.ui-panel{border:1px solid var(--ui-border);border-radius:var(--ui-radius);background:var(--ui-bg);font-family:var(--ui-font)}
.ui-panel>header{border-bottom:1px solid var(--ui-border);padding:var(--ui-space) calc(var(--ui-space)*2)}
.ui-panel>header p{margin:0;color:var(--ui-primary);font-size:.75rem;text-transform:uppercase}
.ui-panel>header h2{margin:0;font-size:1rem}
.ui-panel>div{padding:calc(var(--ui-space)*2)}
.ui-badge{display:inline-block;border:1px solid currentColor;border-radius:999px;padding:0 var(--ui-space);font:600 .75rem var(--ui-font);color:var(--ui-muted)}
.ui-badge-success{color:var(--ui-success)}.ui-badge-warning{color:var(--ui-warning)}.ui-badge-danger{color:var(--ui-danger)}`

export interface ButtonProps {
  children?: Children
  type?: 'button' | 'submit' | 'reset'
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  class?: string
  [attr: `hx-${string}` | `x-${string}` | `$${string}` | `aria-${string}` | `data-${string}`]: unknown
}

export const Button = ({ children, type = 'button', variant = 'secondary', class: className, ...attrs }: ButtonProps) => (
  <button type={type} class={clx('ui-btn', variant !== 'secondary' && `ui-btn-${variant}`, className)} {...attrs}>
    {children}
  </button>
)

/** `Field` do núcleo (label, erro, aria-invalid) com o estilo `ui-field`. */
export const Field = (props: FieldProps) => CoreField({ ...props, class: clx('ui-field', props.class) })

export interface PanelProps {
  children?: Children
  title?: string
  eyebrow?: string
  class?: string
}

export const Panel = ({ children, title, eyebrow, class: className }: PanelProps) => (
  <section class={clx('ui-panel', className)}>
    {title || eyebrow ? (
      <header>
        {eyebrow ? <p>{eyebrow}</p> : null}
        {title ? <h2>{title}</h2> : null}
      </header>
    ) : null}
    <div>{children}</div>
  </section>
)

export type Tone = 'neutral' | 'success' | 'warning' | 'danger'

export const Badge = ({ children, tone = 'neutral' }: { children?: Children; tone?: Tone }) => (
  <span class={clx('ui-badge', tone !== 'neutral' && `ui-badge-${tone}`)}>{children}</span>
)
