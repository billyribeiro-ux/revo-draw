// Port stub — full clipboard pipeline is ported in the persistence phase.
export type ClipboardData = {
  type?: string;
  elements?: readonly unknown[];
  files?: unknown;
  text?: string;
  programmaticAPI?: boolean;
  [k: string]: unknown;
};
