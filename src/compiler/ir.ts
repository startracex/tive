import type { CompiledExpr } from "./expr.js";

export type BindingKind = "attr" | "bool" | "prop" | "event" | "rest";

export interface Binding {
  kind: BindingKind;
  name: string;
  expr: CompiledExpr;
}

export interface TextSegment {
  type: "static" | "dynamic";
  value?: string;
  expr?: CompiledExpr;
}

export type IRNode =
  | RootNode
  | ElementNode
  | TextNode
  | IfNode
  | ForNode
  | HtmlNode
  | ComponentNode;

export interface RootNode {
  type: "root";
  children: IRNode[];
}

export interface ElementNode {
  type: "element";
  tag: string;
  bindings: Binding[];
  children: IRNode[];
}

export interface TextNode {
  type: "text";
  segments: TextSegment[];
}

export interface IfNode {
  type: "if";
  condition: CompiledExpr;
  children: IRNode[];
}

export interface ForNode {
  type: "for";
  mode: "of" | "in" | "source";
  varName: string;
  source: CompiledExpr;
  key?: CompiledExpr;
  children: IRNode[];
}

export interface HtmlNode {
  type: "html";
  expr: CompiledExpr;
}

export interface ComponentNode {
  type: "component";
  tag: string;
  props: Binding[];
  slots: Record<string, IRNode[]>;
}
