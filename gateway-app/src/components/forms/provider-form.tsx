"use client";

import { useState, useEffect } from "react";
import { SimpleDialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { ToolProvider } from "@/components/providers/provider-card";

interface ProviderFormData {
  name: string;
  pattern: string;
  endpoint: string;
  authType: "none" | "bearer" | "api_key";
  authSecret: string;
  description: string;
  priority: number;
}

interface ProviderFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: ProviderFormData) => Promise<void>;
  provider?: ToolProvider | null; // If provided, edit mode
  loading?: boolean;
}

export function ProviderFormDialog({
  open,
  onClose,
  onSubmit,
  provider,
  loading,
}: ProviderFormDialogProps) {
  const isEdit = !!provider;
  const [formData, setFormData] = useState<ProviderFormData>({
    name: "",
    pattern: "",
    endpoint: "",
    authType: "none",
    authSecret: "",
    description: "",
    priority: 0,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ProviderFormData, string>>>({});

  // Reset form when provider changes
  useEffect(() => {
    if (open && provider) {
      setFormData({
        name: provider.name,
        pattern: provider.pattern,
        endpoint: provider.endpoint,
        authType: provider.authType,
        authSecret: "", // Don't populate secret for security
        description: provider.description || "",
        priority: provider.priority,
      });
    } else if (open && !provider) {
      setFormData({
        name: "",
        pattern: "",
        endpoint: "",
        authType: "none",
        authSecret: "",
        description: "",
        priority: 0,
      });
    }
  }, [open, provider]);

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof ProviderFormData, string>> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }
    if (!formData.pattern.trim()) {
      newErrors.pattern = "Pattern is required";
    }
    if (!formData.endpoint.trim()) {
      newErrors.endpoint = "Endpoint is required";
    } else {
      try {
        new URL(formData.endpoint);
      } catch {
        newErrors.endpoint = "Invalid URL format";
      }
    }
    if (formData.authType !== "none" && !formData.authSecret.trim() && !isEdit) {
      newErrors.authSecret = "Secret is required when auth is enabled";
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
      pattern: "",
      endpoint: "",
      authType: "none",
      authSecret: "",
      description: "",
      priority: 0,
    });
    setErrors({});
    onClose();
  };

  return (
    <SimpleDialog
      open={open}
      onClose={handleClose}
      title={isEdit ? "Edit Tool Provider" : "Create Tool Provider"}
      description={
        isEdit
          ? "Update the tool provider configuration"
          : "Create a new tool provider to route tool calls to an MCP server"
      }
      size="lg"
    >
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="providerName" required>
                Name
              </Label>
              <Input
                id="providerName"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g., Slack Integration"
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
              <Label htmlFor="priority">Priority</Label>
              <Input
                id="priority"
                type="number"
                value={formData.priority}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    priority: parseInt(e.target.value) || 0,
                  }))
                }
                placeholder="0"
                disabled={loading}
              />
              <p className="text-xs text-[var(--ink-muted)] mt-1">
                Higher priority providers match first
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="pattern" required>
              Pattern
            </Label>
            <Input
              id="pattern"
              value={formData.pattern}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, pattern: e.target.value }))
              }
              placeholder="e.g., slack_*, github_*, *"
              error={!!errors.pattern}
              disabled={loading}
            />
            {errors.pattern && (
              <p className="text-xs text-[var(--signal-danger)] mt-1">
                {errors.pattern}
              </p>
            )}
            <p className="text-xs text-[var(--ink-muted)] mt-1">
              Glob pattern to match tool names (e.g., slack_* matches all Slack tools)
            </p>
          </div>

          <div>
            <Label htmlFor="endpoint" required>
              Endpoint
            </Label>
            <Input
              id="endpoint"
              value={formData.endpoint}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, endpoint: e.target.value }))
              }
              placeholder="https://mcp-server.example.com"
              error={!!errors.endpoint}
              disabled={loading}
            />
            {errors.endpoint && (
              <p className="text-xs text-[var(--signal-danger)] mt-1">
                {errors.endpoint}
              </p>
            )}
            <p className="text-xs text-[var(--ink-muted)] mt-1">
              The MCP server URL to route matching tool calls to
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="authType">Authentication</Label>
              <NativeSelect
                id="authType"
                value={formData.authType}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    authType: e.target.value as "none" | "bearer" | "api_key",
                  }))
                }
                disabled={loading}
                className="w-full"
              >
                <option value="none">No Authentication</option>
                <option value="bearer">Bearer Token</option>
                <option value="api_key">API Key</option>
              </NativeSelect>
            </div>

            {formData.authType !== "none" && (
              <div>
                <Label htmlFor="authSecret" required={!isEdit}>
                  {formData.authType === "bearer" ? "Bearer Token" : "API Key"}
                </Label>
                <Input
                  id="authSecret"
                  type="password"
                  value={formData.authSecret}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, authSecret: e.target.value }))
                  }
                  placeholder={isEdit ? "(unchanged)" : "Enter secret"}
                  error={!!errors.authSecret}
                  disabled={loading}
                />
                {errors.authSecret && (
                  <p className="text-xs text-[var(--signal-danger)] mt-1">
                    {errors.authSecret}
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="providerDescription">Description</Label>
            <Textarea
              id="providerDescription"
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Optional description of this provider"
              rows={2}
              disabled={loading}
            />
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
            {loading ? "Saving..." : isEdit ? "Save Changes" : "Create Provider"}
          </Button>
        </DialogFooter>
      </form>
    </SimpleDialog>
  );
}
