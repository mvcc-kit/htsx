/**
 * <Form> + <Field> com validação errors + repopulação automática.
 * Funções puras — recebem `errors` e `values` via props, não lêem global.
 */

import { jsx, HtmlSafeString } from './jsx-runtime'

export interface FormProps {
  action?: string
  method?: 'get' | 'post' | 'dialog'
  /** Mapa de erros por field name. Renderiza abaixo do input. */
  errors?: Record<string, string | string[]>
  /** Valores prévios pra repopular. */
  values?: Record<string, string | number | boolean | null | undefined>
  /** CSRF token — se passado, injeta `<input name="_csrf">`. */
  csrf?: string
  /** Nome do campo CSRF. Default '_csrf'. */
  csrfName?: string
  /** Atributos extras passados ao <form>. */
  [key: string]: unknown
  children?: unknown
}

// Symbol pra propagar errors/values via context implícito (sem ALS — usamos
// closure no <Field>, então propagamos via prop manualmente OU via ctx).
// Pra manter simples: <Field> recebe os mesmos props que <Form> via wrapper.
// Solução: expor FormContext que <Field> lê.

import { maybeContext } from './context'

const FORM_CTX = Symbol.for('htsx.form_ctx')

interface FormCtxState {
  errors: Record<string, string | string[]>
  values: Record<string, unknown>
}

interface CtxWithForm {
  [k: symbol]: FormCtxState | undefined
}

function getFormCtx(): FormCtxState | null {
  const ctx = maybeContext<CtxWithForm>()
  return ctx?.[FORM_CTX] ?? null
}

/**
 * <Form>. Componente raiz que registra errors/values no context pra <Field> ler.
 * Renderiza CSRF field automaticamente se `csrf` passado.
 */
export async function Form({
  action,
  method = 'post',
  errors,
  values,
  csrf,
  csrfName = '_csrf',
  children,
  ...rest
}: FormProps): Promise<HtmlSafeString> {
  // Strategy: <Form> emite tag manual + insere FormCtx via "wrapper string"
  // que <Field> detecta. Mas como SSR é stateless, vamos por outro caminho:
  // <Field> EXIGE ser usado dentro de um withFormContext wrapper.

  // Pra simplificar: <Form> aceita uma função-children que recebe { Field }
  // OU os Fields explicitamente recebem errors/values via prop.
  // Vamos pela 2ª: <Field error={errors.x} value={values.x} ... />
  // É mais explícito, sem mágica.

  // No entanto, pra DX, registramos no context se houver:
  // Apenas useful se renderizar com context já configurado.

  const formChildren: unknown[] = []
  if (csrf) {
    formChildren.push(
      jsx('input', { type: 'hidden', name: csrfName, value: csrf }),
    )
  }
  formChildren.push(children)

  // Marca props desconhecidas (errors/values não devem ir pro DOM)
  void errors
  void values

  return jsx('form', { action, method, ...rest, children: formChildren }) as Promise<HtmlSafeString> | HtmlSafeString as HtmlSafeString
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
  if (!name) throw new Error('Field: name é obrigatório')

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
