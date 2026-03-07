import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parse a result that could be a string (JSON) or an object
 */
export function parseResult(result: string | object | undefined | null): Record<string, unknown> | null {
  if (!result) return null;
  
  if (typeof result === "string") {
    try {
      return JSON.parse(result);
    } catch {
      return { error: result };
    }
  }
  
  return result as Record<string, unknown>;
}
