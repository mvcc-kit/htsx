import type { HtmlSafeString } from "./src/jsx-runtime";
import type { HtsxIntrinsicElements } from "./src/jsx-types";

declare global {
  namespace JSX {
    type Element =
      | string
      | HtmlSafeString
      | Promise<string | HtmlSafeString>;

    interface ElementChildrenAttribute {
      children: unknown;
    }

    interface IntrinsicElements extends HtsxIntrinsicElements {}
  }
}

export {};
