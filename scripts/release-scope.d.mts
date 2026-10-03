export type ReleaseScope = {
  deploy: boolean;
  classification: Array<{ path: string; scope: "non-deploy" | "deploy" }>;
};

export function classifyPath(filePath: string): "non-deploy" | "deploy";
export function classifyReleaseScope(files: string[]): ReleaseScope;
