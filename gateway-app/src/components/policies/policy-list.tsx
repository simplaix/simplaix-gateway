"use client";

import { useMemo, useState } from "react";
import { PolicyCard, PolicyCardSkeleton, PolicyRule } from "./policy-card";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  ShieldIcon,
  AgentIcon,
  UserIcon,
  ChevronDownIcon,
} from "@/components/ui/icons";

interface Agent {
  id: string;
  name: string;
}

interface PolicyListProps {
  policies: PolicyRule[];
  loading?: boolean;
  searchQuery?: string;
  agents?: Agent[];
  onEdit?: (policy: PolicyRule) => void;
  onDelete?: (policy: PolicyRule) => void;
}

interface SubjectGroup {
  key: string;
  subjectType: "user" | "agent";
  subjectId: string;
  displayName: string;
  policies: PolicyRule[];
}

const actionOrder: Record<string, number> = {
  require_confirmation: 0,
  deny: 1,
  allow: 2,
};

function sortPolicies(policies: PolicyRule[]): PolicyRule[] {
  return [...policies].sort(
    (a, b) => (actionOrder[a.action] ?? 3) - (actionOrder[b.action] ?? 3)
  );
}

function matchesSearch(policy: PolicyRule, query: string, agentNameMap: Map<string, string>): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const agentName = policy.subjectType === "agent" ? agentNameMap.get(policy.subjectId) : undefined;

  return (
    policy.subjectId.toLowerCase().includes(q) ||
    policy.subjectType.toLowerCase().includes(q) ||
    policy.toolPattern.toLowerCase().includes(q) ||
    policy.providerId.toLowerCase().includes(q) ||
    (policy.action.toLowerCase().includes(q)) ||
    (policy.description?.toLowerCase().includes(q) ?? false) ||
    (policy.riskLevel?.toLowerCase().includes(q) ?? false) ||
    (agentName?.toLowerCase().includes(q) ?? false)
  );
}

export function PolicyList({
  policies,
  loading,
  searchQuery = "",
  agents = [],
  onEdit,
  onDelete,
}: PolicyListProps) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const agentNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const agent of agents) {
      map.set(agent.id, agent.name);
    }
    return map;
  }, [agents]);

  const groups = useMemo(() => {
    const filtered = policies.filter((p) => matchesSearch(p, searchQuery, agentNameMap));

    const groupMap = new Map<string, SubjectGroup>();

    for (const policy of filtered) {
      const key = `${policy.subjectType}:${policy.subjectId}`;
      if (!groupMap.has(key)) {
        const displayName =
          policy.subjectType === "agent"
            ? agentNameMap.get(policy.subjectId) || policy.subjectId
            : policy.subjectId;

        groupMap.set(key, {
          key,
          subjectType: policy.subjectType,
          subjectId: policy.subjectId,
          displayName,
          policies: [],
        });
      }
      groupMap.get(key)!.policies.push(policy);
    }

    const result = Array.from(groupMap.values());
    result.sort((a, b) => {
      if (a.subjectType !== b.subjectType) {
        return a.subjectType === "agent" ? -1 : 1;
      }
      return a.displayName.localeCompare(b.displayName);
    });

    for (const group of result) {
      group.policies = sortPolicies(group.policies);
    }

    return result;
  }, [policies, searchQuery, agentNameMap]);

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2].map((i) => (
          <div key={i}>
            <div className="h-5 w-48 bg-[var(--surface-sunken)] rounded animate-pulse mb-3" />
            <div className="grid gap-4 sm:grid-cols-2">
              <PolicyCardSkeleton />
              <PolicyCardSkeleton />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!policies || policies.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldIcon size={24} />
          </EmptyMedia>
          <EmptyTitle>No policies configured</EmptyTitle>
          <EmptyDescription>
            Create access rules to control who can use which tools and whether
            confirmation is required.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (groups.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldIcon size={24} />
          </EmptyMedia>
          <EmptyTitle>No matching policies</EmptyTitle>
          <EmptyDescription>
            No policies match your search. Try a different query.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const isOpen = !collapsedSections.has(group.key);
        const SubjectIcon = group.subjectType === "agent" ? AgentIcon : UserIcon;

        return (
          <Collapsible
            key={group.key}
            open={isOpen}
            onOpenChange={() => toggleSection(group.key)}
          >
            <CollapsibleTrigger asChild>
              <button className="flex w-full items-center gap-3 py-2 px-3 rounded-[var(--radius-md)] hover:bg-[var(--surface-sunken)] transition-colors cursor-pointer group text-left">
                <SubjectIcon
                  size={16}
                  className="text-[var(--ink-tertiary)] flex-shrink-0"
                />
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="font-medium text-sm text-[var(--ink-primary)] truncate">
                    {group.displayName}
                  </span>
                  <Badge variant="outline" className="text-xs flex-shrink-0">
                    {group.subjectType}
                  </Badge>
                </div>
                <span className="text-xs text-[var(--ink-muted)] flex-shrink-0">
                  {group.policies.length}{" "}
                  {group.policies.length === 1 ? "rule" : "rules"}
                </span>
                <ChevronDownIcon
                  size={14}
                  className={`text-[var(--ink-muted)] flex-shrink-0 transition-transform duration-200 ${
                    isOpen ? "" : "-rotate-90"
                  }`}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="grid gap-3 sm:grid-cols-2 pt-2 pl-8">
                {group.policies.map((policy) => (
                  <PolicyCard
                    key={policy.id}
                    policy={policy}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
