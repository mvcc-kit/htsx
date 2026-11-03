// Formatos aceitos em nomes que saem no HTML ou em cabeçalhos.

/** RFC 6265 §4.1.1: nome de cookie. */
export const COOKIE_NAME = /^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/

/** Nome de evento no HX-Trigger, no SSE e em `defineEvents`. */
export const EVENT_NAME = /^[a-zA-Z][\w:-]*$/

/** `;` ou quebra de linha em atributo de cookie criaria outro atributo. */
export const UNSAFE_COOKIE_ATTR = /[;\r\n]/
