"use client";

import { useState } from "react";
import { SimpleDialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Agent } from "@/components/agents/agent-card";

interface AgentFormData {
  name: string;
  upstreamUrl: string;
  description: string;
  requireConfirmation: boolean;
}

interface AgentFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: AgentFormData) => Promise<void>;
  agent?: Agent | null; // If provided, edit mode
  loading?: boolean;
}

export function AgentFormDialog({
  open,
  onClose,
  onSubmit,
  agent,
  loading,
}: AgentFormDialogProps) {
  const isEdit = !!agent;
  const [formData, setFormData] = useState<AgentFormData>({
    name: agent?.name || "",
    upstreamUrl: agent?.upstreamUrl || "",
    description: agent?.description || "",
    requireConfirmation: agent?.requireConfirmation || false,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof AgentFormData, string>>>({});

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof AgentFormData, string>> = {};
    
    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }
    if (!formData.upstreamUrl.trim()) {
      newErrors.upstreamUrl = "Upstream URL is required";
    } else {
      try {
        new URL(formData.upstreamUrl);
      } catch {
        newErrors.upstreamUrl = "Invalid URL format";
      }
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
      upstreamUrl: "",
      description: "",
      requireConfirmation: false,
    });
    setErrors({});
    onClose();
  };

  // Reset form when agent changes
  if (open && agent && formData.name !== agent.name) {
    setFormData({
      name: agent.name,
      upstreamUrl: agent.upstreamUrl,
      description: agent.description || "",
      requireConfirmation: agent.requireConfirmation,
    });
  }

  return (
    <SimpleDialog
      open={open}
      onClose={handleClose}
      title={isEdit ? "Edit Agent" : "Create Agent"}
      description={
        isEdit
          ? "Update the agent configuration"
          : "Create a new agent to route requests to an MCP server"
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          <div>
            <Label htmlFor="name" required>
              Name
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="e.g., Slack Bot"
              error={!!errors.name}
              disabled={loading}
            />
            {errors.name && (
              <p className="text-xs text-[var(--signal-danger)] mt-1">
                {errors.name}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="upstreamUrl" required>
              Upstream URL
            </Label>
            <Input
              id="upstreamUrl"
              value={formData.upstreamUrl}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, upstreamUrl: e.target.value }))
              }
              placeholder="https://mcp-server.example.com"
              error={!!errors.upstreamUrl}
              disabled={loading}
            />
            {errors.upstreamUrl && (
              <p className="text-xs text-[var(--signal-danger)] mt-1">
                {errors.upstreamUrl}
              </p>
            )}
            <p className="text-xs text-[var(--ink-muted)] mt-1">
              The MCP server URL this agent connects to. You can use a placeholder URL and update it later when the runtime is ready.
            </p>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Optional description of what this agent does"
              rows={3}
              disabled={loading}
            />
          </div>

          <div className="flex items-center gap-3">
            <Checkbox
              id="requireConfirmation"
              checked={formData.requireConfirmation}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({
                  ...prev,
                  requireConfirmation: checked === true,
                }))
              }
              disabled={loading}
            />
            <Label htmlFor="requireConfirmation" className="cursor-pointer">
              Require confirmation for tool calls
            </Label>
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
            {loading ? "Saving..." : isEdit ? "Save Changes" : "Create Agent"}
          </Button>
        </DialogFooter>
      </form>
    </SimpleDialog>
  );
}
