import type { HtmlSafeString } from "./src/jsx-runtime";

declare global {
  namespace JSX {
    type Element =
      | string
      | HtmlSafeString
      | Promise<string | HtmlSafeString>;

    interface ElementChildrenAttribute {
      children: unknown;
    }

    interface IntrinsicElements {
      [elementName: string]: Record<string, unknown>;
    }
  }
}

export {};
