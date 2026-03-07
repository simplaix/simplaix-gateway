"use client";

import { useState, useEffect } from "react";
import { SimpleDialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LoaderIcon } from "@/components/ui/icons";
import { PolicyRule } from "@/components/policies/policy-card";
import type { ToolProvider } from "@/components/providers/provider-card";
import type { Agent } from "@/components/agents/agent-card";
import type { ProviderTool } from "@/lib/gateway-api";
import * as api from "@/lib/gateway-api";

export interface PolicyFormData {
  subjectType: "user" | "agent";
  subjectId: string;
  providerId: string;
  action: "allow" | "deny" | "require_confirmation";
  toolPattern: string;
  riskLevel: string;
  description: string;
}

interface PolicyFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: PolicyFormData) => Promise<void>;
  policy?: PolicyRule | null;
  loading?: boolean;
  providers?: ToolProvider[];
  agents?: Agent[];
}

const SUBJECT_TYPES: Array<{ value: PolicyFormData["subjectType"]; label: string }> = [
  { value: "user", label: "User" },
  { value: "agent", label: "Agent" },
];

const defaultFormData: PolicyFormData = {
  subjectType: "user",
  subjectId: "",
  providerId: "*",
  action: "allow",
  toolPattern: "*",
  riskLevel: "",
  description: "",
};

function toolPatternToSet(
  pattern: string,
  allTools: ProviderTool[]
): Set<string> | null {
  if (pattern === "*") return null;
  const names = new Set(pattern.split(",").map((s) => s.trim()));
  const allNames = new Set(allTools.map((t) => t.name));
  const valid = new Set([...names].filter((n) => allNames.has(n)));
  if (valid.size === 0 || valid.size === allNames.size) return null;
  return valid;
}

function setToToolPattern(
  selected: Set<string> | null,
  allTools: ProviderTool[]
): string {
  if (!selected || selected.size === 0 || selected.size === allTools.length)
    return "*";
  return [...selected].join(",");
}

export function PolicyFormDialog({
  open,
  onClose,
  onSubmit,
  policy,
  loading,
  providers,
  agents,
}: PolicyFormDialogProps) {
  const isEdit = !!policy;
  const [formData, setFormData] = useState<PolicyFormData>(defaultFormData);
  const [errors, setErrors] = useState<
    Partial<Record<keyof PolicyFormData, string>>
  >({});

  // Tool picker state
  const [providerTools, setProviderTools] = useState<ProviderTool[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [selectedTools, setSelectedTools] = useState<Set<string> | null>(null);
  const [useGlobPattern, setUseGlobPattern] = useState(false);

  const isSpecificProvider =
    formData.providerId && formData.providerId !== "*";

  // Reset form when dialog opens
  useEffect(() => {
    if (open && policy) {
      setFormData({
        subjectType: policy.subjectType,
        subjectId: policy.subjectId,
        providerId: policy.providerId,
        action: policy.action,
        toolPattern: policy.toolPattern || "*",
        riskLevel: policy.riskLevel || "",
        description: policy.description || "",
      });
      // Determine if the existing pattern is a glob (not a comma-separated tool list)
      const tp = policy.toolPattern || "*";
      const looksLikeGlob = tp.includes("*") || tp.includes("?");
      setUseGlobPattern(looksLikeGlob && tp !== "*");
    } else if (open && !policy) {
      setFormData(defaultFormData);
      setUseGlobPattern(false);
    }
  }, [open, policy]);

  // Fetch tools when provider changes
  useEffect(() => {
    if (!open) return;
    if (!isSpecificProvider) {
      setProviderTools([]);
      setSelectedTools(null);
      return;
    }

    let cancelled = false;
    setToolsLoading(true);
    setProviderTools([]);
    setSelectedTools(null);

    api.getProviderTools(formData.providerId).then((result) => {
      if (cancelled) return;
      setToolsLoading(false);
      if (result.success && result.data) {
        const tools = result.data.tools;
        setProviderTools(tools);
        // If editing, parse the existing pattern into a selection
        if (policy && policy.providerId === formData.providerId) {
          const tp = policy.toolPattern || "*";
          if (tp === "*") {
            setSelectedTools(null);
          } else {
            setSelectedTools(toolPatternToSet(tp, tools));
          }
        } else {
          setSelectedTools(null);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, formData.providerId]);

  // Sync selectedTools -> formData.toolPattern when using tool picker
  useEffect(() => {
    if (!isSpecificProvider || useGlobPattern || providerTools.length === 0)
      return;
    const pattern = setToToolPattern(selectedTools, providerTools);
    setFormData((prev) => ({ ...prev, toolPattern: pattern }));
  }, [selectedTools, providerTools, isSpecificProvider, useGlobPattern]);

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof PolicyFormData, string>> = {};

    if (!formData.subjectId.trim()) {
      newErrors.subjectId = "Subject ID is required";
    }
    if (!formData.providerId.trim()) {
      newErrors.providerId = 'Provider ID is required (or "*" for all)';
    }
    if (!formData.toolPattern.trim()) {
      newErrors.toolPattern = 'Tool pattern is required (or "*" for all)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit(formData);
  };

  const handleClose = () => {
    setFormData(defaultFormData);
    setErrors({});
    setProviderTools([]);
    setSelectedTools(null);
    setUseGlobPattern(false);
    onClose();
  };

  const toggleTool = (toolName: string) => {
    setSelectedTools((prev) => {
      const allNames = providerTools.map((t) => t.name);
      const current = prev ? new Set(prev) : new Set(allNames);
      if (current.has(toolName)) {
        current.delete(toolName);
      } else {
        current.add(toolName);
      }
      return current.size === allNames.length ? null : current;
    });
  };

  const toggleAllTools = () => {
    setSelectedTools((prev) => {
      const allSelected =
        !prev || prev.size === providerTools.length;
      return allSelected ? new Set<string>() : null;
    });
  };

  const selectedCount = selectedTools
    ? selectedTools.size
    : providerTools.length;
  const totalCount = providerTools.length;
  const allSelected = !selectedTools || selectedCount === totalCount;

  const showConfirmationFields = formData.action === "require_confirmation";

  return (
    <SimpleDialog
      open={open}
      onClose={handleClose}
      title={isEdit ? "Edit Access Policy" : "Create Access Policy"}
      description={
        isEdit
          ? "Update the access policy rule"
          : "Define who can access which tools and whether confirmation is required"
      }
      size="lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
        <div className="space-y-4 overflow-y-auto max-h-[60vh] pr-1">
          {/* Subject */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="subjectType" required>
                Subject Type
              </Label>
              <NativeSelect
                id="subjectType"
                value={formData.subjectType}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    subjectType: e.target.value as PolicyFormData["subjectType"],
                    subjectId: "",
                  }))
                }
                disabled={loading}
                className="w-full"
              >
                {SUBJECT_TYPES.map((st) => (
                  <option key={st.value} value={st.value}>
                    {st.label}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div>
              <Label htmlFor="subjectId" required>
                {formData.subjectType === "user" ? "User ID" : "Agent"}
              </Label>
              {formData.subjectType === "agent" && agents && agents.length > 0 ? (
                <NativeSelect
                  id="subjectId"
                  value={formData.subjectId}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      subjectId: e.target.value,
                    }))
                  }
                  disabled={loading}
                  className="w-full"
                >
                  <option value="">Select an agent...</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </NativeSelect>
              ) : (
                <Input
                  id="subjectId"
                  value={formData.subjectId}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      subjectId: e.target.value,
                    }))
                  }
                  placeholder={
                    formData.subjectType === "user"
                      ? "e.g., user-123"
                      : "e.g., agent-abc123"
                  }
                  error={!!errors.subjectId}
                  disabled={loading}
                />
              )}
              {errors.subjectId && (
                <p className="text-xs text-[var(--signal-danger)] mt-1">
                  {errors.subjectId}
                </p>
              )}
            </div>
          </div>

          {/* Provider */}
          <div>
            <Label htmlFor="providerId" required>
              Provider
            </Label>
            {providers && providers.length > 0 ? (
              <NativeSelect
                id="providerId"
                value={formData.providerId}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    providerId: e.target.value,
                    toolPattern: "*",
                  }))
                }
                disabled={loading}
                className="w-full"
              >
                <option value="*">All Providers</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.pattern})
                  </option>
                ))}
              </NativeSelect>
            ) : (
              <Input
                id="providerId"
                value={formData.providerId}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    providerId: e.target.value,
                  }))
                }
                placeholder='Provider ID or "*" for all'
                error={!!errors.providerId}
                disabled={loading}
              />
            )}
            {errors.providerId && (
              <p className="text-xs text-[var(--signal-danger)] mt-1">
                {errors.providerId}
              </p>
            )}
          </div>

          {/* Tool Pattern / Tool Picker */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label htmlFor="toolPattern" required>
                Tools
              </Label>
              {isSpecificProvider && providerTools.length > 0 && (
                <button
                  type="button"
                  className="text-[11px] text-[var(--accent-primary)] hover:underline"
                  onClick={() => {
                    setUseGlobPattern((v) => !v);
                    if (!useGlobPattern) {
                      setFormData((prev) => ({
                        ...prev,
                        toolPattern: prev.toolPattern || "*",
                      }));
                    } else {
                      const pattern = setToToolPattern(
                        selectedTools,
                        providerTools
                      );
                      setFormData((prev) => ({
                        ...prev,
                        toolPattern: pattern,
                      }));
                    }
                  }}
                >
                  {useGlobPattern
                    ? "Switch to tool picker"
                    : "Use glob pattern"}
                </button>
              )}
            </div>

            {isSpecificProvider && !useGlobPattern ? (
              // Tool picker for specific provider
              <div>
                {toolsLoading ? (
                  <div className="flex items-center gap-2 py-3 px-3 border border-[var(--border-subtle)] rounded-[var(--radius-md)]">
                    <LoaderIcon
                      size={14}
                      className="animate-spin text-[var(--ink-muted)]"
                    />
                    <span className="text-xs text-[var(--ink-tertiary)]">
                      Loading tools...
                    </span>
                  </div>
                ) : providerTools.length === 0 ? (
                  <div className="py-3 px-3 border border-[var(--border-subtle)] rounded-[var(--radius-md)]">
                    <p className="text-xs text-[var(--ink-tertiary)]">
                      No tools found from this provider. All tools will be
                      included by default.
                    </p>
                  </div>
                ) : (
                  <div className="border border-[var(--border-subtle)] rounded-[var(--radius-md)]">
                    {/* Select all header */}
                    <label className="flex items-center gap-3 px-3 py-2 border-b border-[var(--border-subtle)] cursor-pointer hover:bg-[var(--surface-sunken)]/50 transition-colors">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleAllTools}
                      />
                      <span className="text-xs font-medium text-[var(--ink-secondary)]">
                        All tools ({selectedCount}/{totalCount})
                      </span>
                    </label>

                    {/* Tool list */}
                    <div className="max-h-48 overflow-y-auto divide-y divide-[var(--border-subtle)]">
                      {providerTools.map((tool) => {
                        const isChecked = selectedTools
                          ? selectedTools.has(tool.name)
                          : true;

                        return (
                          <label
                            key={tool.name}
                            className="flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-[var(--surface-sunken)]/50 transition-colors"
                          >
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => toggleTool(tool.name)}
                              className="mt-0.5"
                            />
                            <div className="min-w-0">
                              <span className="text-xs font-mono text-[var(--ink-primary)]">
                                {tool.name}
                              </span>
                              {tool.description && (
                                <p className="text-[11px] text-[var(--ink-tertiary)] truncate">
                                  {tool.description}
                                </p>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // Glob pattern input for wildcard provider or explicit glob mode
              <>
                <Input
                  id="toolPattern"
                  value={formData.toolPattern}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      toolPattern: e.target.value,
                    }))
                  }
                  placeholder='e.g., slack_send_*, github_*, *'
                  error={!!errors.toolPattern}
                  disabled={loading}
                />
                {errors.toolPattern && (
                  <p className="text-xs text-[var(--signal-danger)] mt-1">
                    {errors.toolPattern}
                  </p>
                )}
                <p className="text-xs text-[var(--ink-muted)] mt-1">
                  Glob pattern to match tool names. Use * for all tools.
                </p>
              </>
            )}
          </div>

          {/* Action */}
          <div>
            <Label htmlFor="action" required>
              Action
            </Label>
            <NativeSelect
              id="action"
              value={formData.action}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  action: e.target.value as
                    | "allow"
                    | "deny"
                    | "require_confirmation",
                }))
              }
              disabled={loading}
              className="w-full"
            >
              <option value="allow">Allow</option>
              <option value="deny">Deny</option>
              <option value="require_confirmation">Require Confirmation</option>
            </NativeSelect>
            <p className="text-xs text-[var(--ink-muted)] mt-1">
              {formData.action === "require_confirmation"
                ? "End users must confirm this tool call before it executes"
                : formData.action === "deny"
                ? "Tool calls matching this rule will be blocked"
                : "Tool calls matching this rule are allowed without confirmation"}
            </p>
          </div>

          {/* Confirmation-specific fields */}
          {showConfirmationFields && (
            <div>
              <Label htmlFor="riskLevel">Risk Level</Label>
              <NativeSelect
                id="riskLevel"
                value={formData.riskLevel}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    riskLevel: e.target.value,
                  }))
                }
                disabled={loading}
                className="w-full"
              >
                <option value="">Not Set</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </NativeSelect>
              <p className="text-xs text-[var(--ink-muted)] mt-1">
                Displayed to the end user during confirmation review
              </p>
            </div>
          )}

          {/* Description */}
          <div>
            <Label htmlFor="policyDescription">Description</Label>
            <Textarea
              id="policyDescription"
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder="Optional description of this policy rule"
              rows={2}
              disabled={loading}
            />
          </div>
        </div>

        <DialogFooter className="mt-4 flex-shrink-0">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button type="submit" variant="default" disabled={loading}>
            {loading
              ? "Saving..."
              : isEdit
              ? "Save Changes"
              : "Create Policy"}
          </Button>
        </DialogFooter>
      </form>
    </SimpleDialog>
  );
}
