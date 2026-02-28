"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRightIcon, LoaderIcon, CheckIcon } from "@/components/ui/icons";
import { isConfirmationRequired, ConfirmationRequiredCard } from "@/components/shared";

interface ToolRenderProps {
  name: string;
  status: "executing" | "complete" | "inProgress" | string;
  args: Record<string, unknown>;
  result?: string;
}

export function DefaultToolComponent({ name, status, args, result }: ToolRenderProps) {
  const [expanded, setExpanded] = useState(false);
  
  const isExecuting = status === "executing" || status === "inProgress";
  
  let parsedResult: unknown = null;
  if (result) {
    try {
      parsedResult = JSON.parse(result);
    } catch {
      parsedResult = result;
    }
  }

  // If the tool result is a confirmation_required response, show the confirmation card
  if (parsedResult && typeof parsedResult === "object" && isConfirmationRequired(parsedResult as Record<string, unknown>)) {
    return <ConfirmationRequiredCard data={parsedResult as Record<string, unknown>} />;
  }

  return (
    <Card className="my-2 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--surface-sunken)] transition-colors"
      >
        <div className="flex items-center gap-3">
          {isExecuting ? (
            <LoaderIcon size={16} className="text-[var(--accent-primary)]" />
          ) : (
            <CheckIcon size={16} className="text-[var(--signal-success)]" />
          )}
          <span className="font-mono text-sm text-[var(--ink-primary)]">{name}</span>
          <Badge variant={isExecuting ? "info" : "success"}>
            {isExecuting ? "Running" : "Complete"}
          </Badge>
        </div>
        <ChevronRightIcon 
          size={16} 
          className={`text-[var(--ink-muted)] transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </button>
      
      {expanded && (
        <CardContent className="p-4 pt-0 border-t border-[var(--border-subtle)] animate-slide-up">
          {Object.keys(args).length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-medium text-[var(--ink-tertiary)] uppercase tracking-wider mb-2">
                Arguments
              </div>
              <pre className="p-3 bg-[var(--surface-sunken)] rounded-[var(--radius-md)] text-xs font-mono text-[var(--ink-secondary)] overflow-auto max-h-32">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}
          
          {parsedResult !== null && (
            <div>
              <div className="text-xs font-medium text-[var(--ink-tertiary)] uppercase tracking-wider mb-2">
                Result
              </div>
              <pre className="p-3 bg-[var(--surface-sunken)] rounded-[var(--radius-md)] text-xs font-mono text-[var(--ink-secondary)] overflow-auto max-h-48">
                {typeof parsedResult === "string" 
                  ? parsedResult 
                  : JSON.stringify(parsedResult, null, 2)
                }
              </pre>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
