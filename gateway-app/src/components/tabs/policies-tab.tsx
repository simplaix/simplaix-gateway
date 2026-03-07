"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PlusIcon, RefreshIcon, ShieldIcon, SearchIcon } from "@/components/ui/icons";
import { ConfirmDialog } from "@/components/ui/dialog";
import { PolicyList } from "@/components/policies";
import { PolicyRule } from "@/components/policies/policy-card";
import { PolicyFormDialog, PolicyFormData } from "@/components/forms/policy-form";
import * as api from "@/lib/gateway-api";

const fetchPolicies = async () => {
  const result = await api.listPolicies();
  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch policies");
  }
  return result.data.rules;
};

const fetchProviders = async () => {
  const result = await api.listProviders();
  if (!result.success || !result.data) return [];
  return result.data.providers;
};

const fetchAgents = async () => {
  const result = await api.listAgents();
  if (!result.success || !result.data) return [];
  return result.data.agents;
};

export function PoliciesTab() {
  const [formOpen, setFormOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<PolicyRule | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [policyToDelete, setPolicyToDelete] = useState<PolicyRule | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const {
    data: policies,
    isLoading,
    mutate,
  } = useSWR("policies", fetchPolicies);

  const { data: providers } = useSWR("providers-for-policies", fetchProviders);
  const { data: agents } = useSWR("agents-for-policies", fetchAgents);

  // Create or update policy
  const handleSubmit = async (data: PolicyFormData) => {
    setActionLoading(true);

    let result;

    const payload: Record<string, unknown> = {
      subjectType: data.subjectType,
      subjectId: data.subjectId,
      providerId: data.providerId,
      action: data.action,
      toolPattern: data.toolPattern || "*",
      description: data.description || undefined,
    };

    if (data.action === "require_confirmation") {
      if (data.riskLevel) payload.riskLevel = data.riskLevel;
    }

    if (editingPolicy) {
      result = await api.updatePolicy(editingPolicy.id, payload);
    } else {
      result = await api.createPolicy(payload as any);
    }

    setActionLoading(false);

    if (result.success) {
      setFormOpen(false);
      setEditingPolicy(null);
      await mutate();
    } else {
      console.error("Failed to save policy:", result.error);
    }
  };

  // Delete policy
  const handleDelete = async () => {
    if (!policyToDelete) return;

    setActionLoading(true);
    const result = await api.deletePolicy(policyToDelete.id);
    setActionLoading(false);

    if (result.success) {
      setDeleteConfirmOpen(false);
      setPolicyToDelete(null);
      await mutate();
    } else {
      console.error("Failed to delete policy:", result.error);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-[var(--ink-primary)]">
            Access Policies
          </h2>
          <p className="text-sm text-[var(--ink-tertiary)]">
            Control tool access and configure confirmation requirements per provider
            and tool
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => mutate()}
            disabled={isLoading}
          >
            <RefreshIcon
              size={16}
              className={isLoading ? "animate-spin" : ""}
            />
            Refresh
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setFormOpen(true)}
          >
            <PlusIcon size={16} />
            Create Policy
          </Button>
        </div>
      </div>

      <div className="mb-4 relative">
        <SearchIcon
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]"
        />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search policies by subject, provider, tool, or description..."
          className="pl-9"
        />
      </div>

      <PolicyList
        policies={policies ?? []}
        loading={isLoading}
        searchQuery={searchQuery}
        agents={agents}
        onEdit={(policy: PolicyRule) => {
          setEditingPolicy(policy);
          setFormOpen(true);
        }}
        onDelete={(policy: PolicyRule) => {
          setPolicyToDelete(policy);
          setDeleteConfirmOpen(true);
        }}
      />

      {/* Create/Edit Dialog */}
      <PolicyFormDialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingPolicy(null);
        }}
        onSubmit={handleSubmit}
        policy={editingPolicy}
        loading={actionLoading}
        providers={providers}
        agents={agents}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setPolicyToDelete(null);
        }}
        onConfirm={handleDelete}
        title="Delete Access Policy"
        description={`Are you sure you want to delete this policy rule for "${policyToDelete?.toolPattern || "*"}"? This may change who can access the affected tools.`}
        confirmLabel="Delete Policy"
        confirmVariant="danger"
        loading={actionLoading}
      />

      {/* Policy Test */}
      <PolicyTestPanel />
    </div>
  );
}

// ==================== Policy Test Panel ====================

function PolicyTestPanel() {
  const [userId, setUserId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [toolName, setToolName] = useState("");
  const [testResult, setTestResult] = useState<{
    action: string;
    risk: string;
    matchedRule: any;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    if (!userId || !providerId || !toolName) return;
    setTesting(true);
    setTestResult(null);

    const result = await api.evaluatePolicy({
      userId,
      providerId,
      toolName,
      agentId: agentId || undefined,
    });

    setTesting(false);
    if (result.success && result.data) {
      setTestResult(result.data as any);
    }
  };

  const   actionBadge: Record<string, string> = {
    allow: "success",
    deny: "danger",
    require_confirmation: "warning",
  };

  return (
    <div className="mt-8 pt-6 border-t border-[var(--border-subtle)]">
      <div className="mb-4">
        <h3 className="text-base font-medium text-[var(--ink-primary)] flex items-center gap-2">
          <ShieldIcon size={16} />
          Policy Test
        </h3>
        <p className="text-sm text-[var(--ink-tertiary)]">
          Test what action would be taken for a hypothetical tool call
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <Label htmlFor="testUserId">User ID</Label>
              <Input
                id="testUserId"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="user-123"
              />
            </div>
            <div>
              <Label htmlFor="testAgentId">Agent ID</Label>
              <Input
                id="testAgentId"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                placeholder="agent-abc (optional)"
              />
            </div>
            <div>
              <Label htmlFor="testProviderId">Provider ID</Label>
              <Input
                id="testProviderId"
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                placeholder="provider-id"
              />
            </div>
            <div>
              <Label htmlFor="testToolName">Tool Name</Label>
              <Input
                id="testToolName"
                value={toolName}
                onChange={(e) => setToolName(e.target.value)}
                placeholder="slack_send_message"
              />
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <Button
              variant="default"
              size="sm"
              onClick={handleTest}
              disabled={testing || !userId || !providerId || !toolName}
            >
              {testing ? "Evaluating..." : "Evaluate"}
            </Button>

            {testResult && (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-[var(--ink-tertiary)]">Result:</span>
                <Badge variant={actionBadge[testResult.action] as any}>
                  {testResult.action.toUpperCase()}
                </Badge>
                <span className="text-[var(--ink-muted)]">
                  Risk: {testResult.risk}
                </span>
                {testResult.matchedRule && (
                  <span className="text-xs text-[var(--ink-muted)] font-mono">
                    (rule: {testResult.matchedRule.toolPattern} / {testResult.matchedRule.subjectType}:{testResult.matchedRule.subjectId})
                  </span>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
