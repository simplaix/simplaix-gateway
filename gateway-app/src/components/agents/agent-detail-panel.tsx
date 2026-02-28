"use client";

import { useState, useEffect, useCallback } from "react";
import useSWR from "swr";
import { Agent } from "./agent-card";
import { ToolProvider } from "@/components/providers/provider-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronRightIcon,
  ExternalLinkIcon,
  KeyIcon,
  ShieldIcon,
  ProviderIcon,
  CheckIcon,
  LoaderIcon,
} from "@/components/ui/icons";
import * as api from "@/lib/gateway-api";
import type {
  AgentProviderRule,
  PolicyRule,
  ProviderTool,
} from "@/lib/gateway-api";

interface AgentDetailPanelProps {
  agent: Agent;
  onBack: () => void;
}

interface ProviderAccessRow {
  providerId: string;
  providerName: string;
  pattern: string;
  endpoint: string;
  enabled: boolean;
  /** Tools fetched from the upstream provider */
  tools: ProviderTool[] | null;
  toolsLoading: boolean;
  /** Which tools are selected (by name). null = all ("*") */
  selectedTools: Set<string> | null;
}

function toolPatternToSet(
  pattern: string,
  allTools: ProviderTool[]
): Set<string> | null {
  if (pattern === "*") return null;
  const names = new Set(pattern.split(",").map((s) => s.trim()));
  const allNames = new Set(allTools.map((t) => t.name));
  const valid = new Set([...names].filter((n) => allNames.has(n)));
  if (valid.size === allNames.size) return null;
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

export function AgentDetailPanel({ agent, onBack }: AgentDetailPanelProps) {
  const [rows, setRows] = useState<ProviderAccessRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const { data: providers, isLoading: loadingProviders } = useSWR(
    "providers-for-agent-detail",
    async () => {
      const result = await api.listProviders();
      if (!result.success || !result.data)
        throw new Error(result.error || "Failed to fetch providers");
      return result.data.providers;
    }
  );

  const {
    data: agentRules,
    isLoading: loadingRules,
    mutate: mutateRules,
  } = useSWR(`agent-access-${agent.id}`, async () => {
    const result = await api.getAgentProviderAccess(agent.id);
    if (!result.success || !result.data)
      throw new Error(result.error || "Failed to fetch agent rules");
    return result.data.rules;
  });

  const buildRows = useCallback(() => {
    if (!providers) return;
    const ruleMap = new Map<string, PolicyRule>();
    if (agentRules) {
      for (const rule of agentRules) {
        ruleMap.set(rule.providerId, rule);
      }
    }

    const newRows: ProviderAccessRow[] = providers.map((p: ToolProvider) => {
      const rule = ruleMap.get(p.id);
      return {
        providerId: p.id,
        providerName: p.name,
        pattern: p.pattern,
        endpoint: p.endpoint,
        enabled: rule?.action === "allow",
        tools: null,
        toolsLoading: false,
        selectedTools: null,
        _savedToolPattern: rule?.toolPattern || "*",
      } as ProviderAccessRow & { _savedToolPattern: string };
    });

    setRows(newRows);
    setDirty(false);

    // Fetch tools for enabled providers
    for (const row of newRows) {
      if (row.enabled) {
        fetchToolsForRow(
          row.providerId,
          (row as ProviderAccessRow & { _savedToolPattern: string })
            ._savedToolPattern
        );
      }
    }
  }, [providers, agentRules]);

  useEffect(() => {
    buildRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildRows]);

  const fetchToolsForRow = async (
    providerId: string,
    savedPattern?: string
  ) => {
    setRows((prev) =>
      prev.map((r) =>
        r.providerId === providerId ? { ...r, toolsLoading: true } : r
      )
    );

    try {
      const result = await api.getProviderTools(providerId);
      if (result.success && result.data) {
        const tools = result.data.tools;
        setRows((prev) =>
          prev.map((r) => {
            if (r.providerId !== providerId) return r;
            const selected =
              savedPattern && savedPattern !== "*"
                ? toolPatternToSet(savedPattern, tools)
                : null;
            return {
              ...r,
              tools,
              toolsLoading: false,
              selectedTools: selected,
            };
          })
        );
      } else {
        setRows((prev) =>
          prev.map((r) =>
            r.providerId === providerId
              ? { ...r, tools: [], toolsLoading: false }
              : r
          )
        );
      }
    } catch {
      setRows((prev) =>
        prev.map((r) =>
          r.providerId === providerId
            ? { ...r, tools: [], toolsLoading: false }
            : r
        )
      );
    }
  };

  const toggleProvider = (providerId: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.providerId !== providerId) return r;
        const nowEnabled = !r.enabled;
        return {
          ...r,
          enabled: nowEnabled,
          selectedTools: nowEnabled ? null : r.selectedTools,
        };
      })
    );
    setDirty(true);
    setSaveSuccess(false);

    // Fetch tools when enabling if not yet loaded
    const row = rows.find((r) => r.providerId === providerId);
    if (row && !row.enabled && !row.tools) {
      fetchToolsForRow(providerId);
    }
  };

  const toggleTool = (providerId: string, toolName: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.providerId !== providerId || !r.tools) return r;
        const allNames = r.tools.map((t) => t.name);
        let current = r.selectedTools
          ? new Set(r.selectedTools)
          : new Set(allNames);

        if (current.has(toolName)) {
          current.delete(toolName);
        } else {
          current.add(toolName);
        }

        return {
          ...r,
          selectedTools:
            current.size === allNames.length ? null : current,
        };
      })
    );
    setDirty(true);
    setSaveSuccess(false);
  };

  const toggleAllTools = (providerId: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.providerId !== providerId || !r.tools) return r;
        const allSelected =
          !r.selectedTools || r.selectedTools.size === r.tools.length;
        return {
          ...r,
          selectedTools: allSelected ? new Set<string>() : null,
        };
      })
    );
    setDirty(true);
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);

    const rules: AgentProviderRule[] = rows
      .filter((r) => r.enabled)
      .map((r) => ({
        providerId: r.providerId,
        action: "allow" as const,
        toolPattern: setToToolPattern(r.selectedTools, r.tools || []),
      }));

    const result = await api.setAgentProviderAccess(agent.id, rules);
    setSaving(false);

    if (result.success) {
      setDirty(false);
      setSaveSuccess(true);
      await mutateRules();
      setTimeout(() => setSaveSuccess(false), 2000);
    } else {
      console.error("Failed to save agent provider access:", result.error);
    }
  };

  const isLoading = loadingProviders || loadingRules;

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)] transition-colors mb-4"
      >
        <ChevronRightIcon size={14} className="rotate-180" />
        Back to agents
      </button>

      {/* Agent info header */}
      <Card className="mb-6 overflow-hidden gap-0 py-0">
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`
                w-12 h-12 rounded-[var(--radius-md)] flex items-center justify-center flex-shrink-0
                ${
                  agent.isActive
                    ? "bg-[var(--signal-success-muted)] text-[var(--signal-success)]"
                    : "bg-[var(--surface-sunken)] text-[var(--ink-muted)]"
                }
              `}
              >
                <span className="text-xl font-semibold">
                  {agent.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-[var(--ink-primary)] truncate">
                  {agent.name}
                </h3>
                <p className="text-xs text-[var(--ink-tertiary)] font-mono truncate">
                  {agent.id}
                </p>
              </div>
            </div>
            <Badge
              variant={agent.isActive ? "success" : "secondary"}
              className="flex-shrink-0"
            >
              {agent.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>

          {agent.description && (
            <p className="text-sm text-[var(--ink-secondary)] mt-3">
              {agent.description}
            </p>
          )}

          <div className="flex items-center gap-4 mt-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs">
              <ExternalLinkIcon
                size={13}
                className="text-[var(--ink-muted)]"
              />
              <span className="text-[var(--ink-tertiary)] font-mono">
                {agent.upstreamUrl}
              </span>
            </div>
            {agent.runtimeTokenPrefix && (
              <div className="flex items-center gap-1.5 text-xs">
                <KeyIcon size={13} className="text-[var(--ink-muted)]" />
                <span className="text-[var(--ink-tertiary)] font-mono">
                  {agent.runtimeTokenPrefix}...
                </span>
              </div>
            )}
            {agent.hasUpstreamSecret && (
              <Badge variant="outline">
                <ShieldIcon size={12} />
                Auth Token
              </Badge>
            )}
            {agent.requireConfirmation && (
              <Badge variant="warning">
                <ShieldIcon size={12} />
                Confirmation Required
              </Badge>
            )}
          </div>
        </div>
      </Card>

      {/* Provider Access section */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-medium text-[var(--ink-primary)]">
            Provider Access
          </h2>
          <p className="text-sm text-[var(--ink-tertiary)] mt-0.5">
            Toggle which MCP providers this agent can access. Agents are denied
            all providers by default.
          </p>
        </div>
        <Button
          variant="default"
          size="sm"
          onClick={handleSave}
          disabled={!dirty || saving}
        >
          {saving ? (
            <>
              <LoaderIcon size={14} className="animate-spin" />
              Saving...
            </>
          ) : saveSuccess ? (
            <>
              <CheckIcon size={14} />
              Saved
            </>
          ) : (
            "Save Changes"
          )}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="overflow-hidden gap-0 py-0">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-[var(--surface-sunken)] animate-pulse" />
                  <div className="flex-1">
                    <div className="h-4 w-32 bg-[var(--surface-sunken)] rounded animate-pulse mb-1.5" />
                    <div className="h-3 w-48 bg-[var(--surface-sunken)] rounded animate-pulse" />
                  </div>
                  <div className="w-8 h-5 rounded-full bg-[var(--surface-sunken)] animate-pulse" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="overflow-hidden gap-0 py-0">
          <CardContent className="p-8 text-center">
            <ProviderIcon
              size={24}
              className="mx-auto text-[var(--ink-muted)] mb-2"
            />
            <p className="text-sm text-[var(--ink-tertiary)]">
              No providers configured. Add providers first to manage agent
              access.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <ProviderRow
              key={row.providerId}
              row={row}
              onToggleProvider={() => toggleProvider(row.providerId)}
              onToggleTool={(toolName) => toggleTool(row.providerId, toolName)}
              onToggleAll={() => toggleAllTools(row.providerId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderRow({
  row,
  onToggleProvider,
  onToggleTool,
  onToggleAll,
}: {
  row: ProviderAccessRow;
  onToggleProvider: () => void;
  onToggleTool: (toolName: string) => void;
  onToggleAll: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const selectedCount = row.selectedTools
    ? row.selectedTools.size
    : row.tools?.length ?? 0;
  const totalCount = row.tools?.length ?? 0;
  const allSelected = !row.selectedTools || selectedCount === totalCount;

  return (
    <Card
      className={`overflow-hidden gap-0 py-0 transition-colors ${
        row.enabled ? "border-[var(--signal-success)]/30" : ""
      }`}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div
            className={`
            w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center flex-shrink-0
            ${
              row.enabled
                ? "bg-[var(--signal-success-muted)] text-[var(--signal-success)]"
                : "bg-[var(--surface-sunken)] text-[var(--ink-muted)]"
            }
          `}
          >
            <ProviderIcon size={16} />
          </div>

          <button
            type="button"
            className="flex-1 min-w-0 text-left"
            onClick={() => row.enabled && setExpanded((v) => !v)}
            disabled={!row.enabled}
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-[var(--ink-primary)] truncate">
                {row.providerName}
              </span>
              <Badge variant="outline" className="text-[10px]">
                {row.pattern}
              </Badge>
              {row.enabled && totalCount > 0 && (
                <span className="text-[10px] text-[var(--ink-tertiary)]">
                  {selectedCount}/{totalCount} tools
                </span>
              )}
              {row.enabled && (
                <ChevronRightIcon
                  size={14}
                  className={`text-[var(--ink-muted)] transition-transform ${
                    expanded ? "rotate-90" : ""
                  }`}
                />
              )}
            </div>
            <p className="text-xs text-[var(--ink-tertiary)] font-mono truncate mt-0.5">
              {row.endpoint}
            </p>
          </button>

          <Switch checked={row.enabled} onCheckedChange={onToggleProvider} />
        </div>
      </CardContent>

      {/* Expandable tools section */}
      {row.enabled && expanded && (
        <div className="px-4 pb-4">
          {row.toolsLoading ? (
            <div className="flex items-center gap-2 py-2">
              <LoaderIcon
                size={12}
                className="animate-spin text-[var(--ink-muted)]"
              />
              <span className="text-xs text-[var(--ink-tertiary)]">
                Loading tools...
              </span>
            </div>
          ) : !row.tools || row.tools.length === 0 ? (
            <p className="text-xs text-[var(--ink-tertiary)] py-1">
              No tools found from this provider.
            </p>
          ) : (
            <div className="border border-[var(--border-subtle)] rounded-[var(--radius-md)]">
              {/* Select all header */}
              <label className="flex items-center gap-3 px-3 py-2 border-b border-[var(--border-subtle)] cursor-pointer hover:bg-[var(--surface-sunken)]/50 transition-colors">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={onToggleAll}
                />
                <span className="text-xs font-medium text-[var(--ink-secondary)]">
                  Select all ({selectedCount}/{totalCount})
                </span>
              </label>

              {/* Tool list */}
              <div className="max-h-64 overflow-y-auto divide-y divide-[var(--border-subtle)]">
                {row.tools.map((tool) => {
                  const isChecked = row.selectedTools
                    ? row.selectedTools.has(tool.name)
                    : true;

                  return (
                    <label
                      key={tool.name}
                      className="flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-[var(--surface-sunken)]/50 transition-colors"
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => onToggleTool(tool.name)}
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
      )}
    </Card>
  );
}
