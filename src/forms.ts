/**
 * <Form> + <Field> com validação errors + repopulação automática.
 * Funções puras — recebem `errors` e `values` via props, não lêem global.
 */

import { maybeContext } from './context'
import { jsx, HtmlSafeString } from './jsx-runtime'

export interface FormProps {
  action?: string
  method?: 'get' | 'post' | 'dialog'
  /** Token CSRF: se passado, entra como `<input type="hidden">`. */
  csrf?: string
  /** Nome do campo CSRF. Default '_csrf'. */
  csrfName?: string
  /** Atributos extras passados ao <form>. */
  [key: string]: unknown
  children?: unknown
}

const FORM_CTX = Symbol.for('htsx.form_ctx')

interface FormCtxState {
  errors: Record<string, string | string[]>
  values: Record<string, unknown>
}

interface CtxWithForm {
  [k: symbol]: FormCtxState | undefined
}

function getFormCtx(): FormCtxState | null {
  return maybeContext<CtxWithForm>()?.[FORM_CTX] ?? null
}

/**
 * <form> com o campo CSRF. Erros e valores chegam a cada <Field> pela prop `error`/`value`
 * ou por `formContext()` no contexto do render: o JSX monta os filhos antes do pai,
 * então o <Form> não teria como passá-los.
 */
export function Form({
  action,
  method = 'post',
  csrf,
  csrfName = '_csrf',
  children,
  ...rest
}: FormProps): HtmlSafeString | Promise<HtmlSafeString> {
  const hidden = csrf ? jsx('input', { type: 'hidden', name: csrfName, value: csrf }) : null
  return jsx('form', { action, method, ...rest, children: [hidden, children] })
}

/**
 * Helper pra criar context com form state.
 * Use com renderPage(..., { context: { ...formContext({errors, values}) } })
 */
export function formContext(state: {
  errors?: Record<string, string | string[]>
  values?: Record<string, unknown>
}): CtxWithForm {
  return {
    [FORM_CTX]: {
      errors: state.errors ?? {},
      values: state.values ?? {},
    },
  }
}

export interface FieldProps {
  /** Nome do field (name attribute). Obrigatório. */
  name: string
  /** Label visível. */
  label?: string
  /** Tipo do input. Default 'text'. */
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'date' | 'search' | 'hidden'
  /** Valor (sobrescreve values do context). */
  value?: string | number
  /** Erro (sobrescreve errors do context). */
  error?: string | string[]
  /** Required HTML5. */
  required?: boolean
  placeholder?: string
  disabled?: boolean
  /** Atributos extras passados ao <input>. */
  inputProps?: Record<string, unknown>
  /** Class do wrapper div. */
  class?: string
}

/**
 * <Field> renderiza <div><label/><input/><span error/></div>.
 * Lê errors/values do context (formContext) se prop não for fornecida.
 */
export function Field({
  name,
  label,
  type = 'text',
  value,
  error,
  required,
  placeholder,
  disabled,
  inputProps = {},
  class: className,
}: FieldProps): HtmlSafeString | Promise<HtmlSafeString> {
  if (!name) throw new Error('htsx: Field: name é obrigatório')

  const ctx = getFormCtx()
  const effectiveValue = value ?? (ctx?.values[name] as string | number | undefined)
  const effectiveError = error ?? ctx?.errors[name]
  const errorText = Array.isArray(effectiveError) ? effectiveError[0] : effectiveError

  const inputId = `field-${name}`
  const errorId = errorText ? `error-${name}` : undefined

  return jsx('div', {
    class: className ?? 'field',
    children: [
      label ? jsx('label', { for: inputId, children: label }) : null,
      jsx('input', {
        id: inputId,
        name,
        type,
        value: effectiveValue,
        required,
        placeholder,
        disabled,
        'aria-invalid': errorText ? 'true' : undefined,
        'aria-describedby': errorId,
        ...inputProps,
      }),
      errorText
        ? jsx('span', {
            id: errorId,
            class: 'field-error',
            role: 'alert',
            children: errorText,
          })
        : null,
    ],
  })
}
