import { ZodError } from "zod";
import { formatIssues } from "@mahomanual/core/schema";

export function formatToolError(error: unknown): string {
  if (error instanceof ZodError) {
    return `入力エラー: ${formatIssues(error.issues)}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function toolSuccess(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

export function toolError(error: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  return {
    content: [{ type: "text", text: formatToolError(error) }],
    isError: true,
  };
}

export async function runTool<T>(fn: () => T | Promise<T>): Promise<
  | { content: Array<{ type: "text"; text: string }> }
  | { content: Array<{ type: "text"; text: string }>; isError: true }
> {
  try {
    return toolSuccess(await fn());
  } catch (error: unknown) {
    return toolError(error);
  }
}
