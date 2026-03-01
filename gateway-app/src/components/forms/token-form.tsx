"use client";

import { useState, useEffect } from "react";
import { SimpleDialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Agent } from "@/components/agents/agent-card";

interface TokenFormData {
  name: string;
  expiresInDays: number | null;
  agentId: string;
}

interface TokenFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: TokenFormData) => Promise<void>;
  agents?: Agent[];
  selectedAgentId?: string | null;
  loading?: boolean;
}

const expirationOptions = [
  { value: "", label: "Never expires" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "1 year" },
];

export function TokenFormDialog({
  open,
  onClose,
  onSubmit,
  agents = [],
  selectedAgentId,
  loading,
}: TokenFormDialogProps) {
  const [formData, setFormData] = useState<TokenFormData>({
    name: "",
    expiresInDays: null,
    agentId: selectedAgentId || "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof TokenFormData, string>>>({});

  // Update agentId when selectedAgentId changes or dialog opens
  useEffect(() => {
    if (open) {
      setFormData((prev) => ({
        ...prev,
        agentId: selectedAgentId || prev.agentId || (agents.length > 0 ? agents[0].id : ""),
      }));
    }
  }, [open, selectedAgentId, agents]);

  const selectedAgent = agents.find((a) => a.id === formData.agentId);

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof TokenFormData, string>> = {};

    if (!formData.agentId) {
      newErrors.agentId = "Agent is required";
    }

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
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
    setFormData({
      name: "",
      expiresInDays: null,
      agentId: selectedAgentId || "",
    });
    setErrors({});
    onClose();
  };

  return (
    <SimpleDialog
      open={open}
      onClose={handleClose}
      title="Create Access Token"
      description={
        selectedAgent
          ? `Create a new access token for ${selectedAgent.name}`
          : "Create a new access token for authentication"
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          <div>
            <Label htmlFor="agent" required>
              Agent
            </Label>
            <Select
              value={formData.agentId}
              onValueChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  agentId: value,
                }))
              }
              disabled={loading || agents.length === 0}
            >
              <SelectTrigger id="agent" className="w-full">
                <SelectValue placeholder={agents.length === 0 ? "No agents available" : "Select an agent..."} />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.agentId && (
              <p className="text-xs text-[var(--signal-danger)] mt-1">
                {errors.agentId}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="tokenName" required>
              Token Name
            </Label>
            <Input
              id="tokenName"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="e.g., Production, Development, CI/CD"
              error={!!errors.name}
              disabled={loading}
            />
            {errors.name && (
              <p className="text-xs text-[var(--signal-danger)] mt-1">
                {errors.name}
              </p>
            )}
            <p className="text-xs text-[var(--ink-muted)] mt-1">
              A descriptive name to identify this token
            </p>
          </div>

          <div>
            <Label htmlFor="expiration">Expiration</Label>
            <Select
              value={formData.expiresInDays?.toString() || "never"}
              onValueChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  expiresInDays: value === "never" ? null : parseInt(value),
                }))
              }
              disabled={loading}
            >
              <SelectTrigger id="expiration" className="w-full">
                <SelectValue placeholder="Select expiration..." />
              </SelectTrigger>
              <SelectContent>
                {expirationOptions.map((opt) => (
                  <SelectItem key={opt.value || "never"} value={opt.value || "never"}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="p-3 bg-[var(--signal-warning-muted)] border border-[var(--signal-warning)] rounded-[var(--radius-md)]">
            <p className="text-sm text-[var(--signal-warning)]">
              <strong>Important:</strong> The token will only be shown once after
              creation. Make sure to copy and store it securely.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button type="submit" variant="default" disabled={loading}>
            {loading ? "Creating..." : "Create Token"}
          </Button>
        </DialogFooter>
      </form>
    </SimpleDialog>
  );
}
