"use client";

import { useState } from "react";
import { SimpleDialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export interface ApiKeyFormData {
  name: string;
  scopes: string[];
  expiresInDays: number | null;
}

interface ApiKeyFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: ApiKeyFormData) => Promise<void>;
  loading?: boolean;
}

const AVAILABLE_SCOPES = [
  {
    value: "credentials:resolve",
    label: "Resolve Credentials",
    description: "Resolve and check user credentials",
  },
  {
    value: "credentials:read",
    label: "Read Credentials",
    description: "List user credentials (metadata only)",
  },
  {
    value: "credentials:write",
    label: "Write Credentials",
    description: "Store credentials (JWT, API key endpoints)",
  },
];

const expirationOptions = [
  { value: "never", label: "Never expires" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "1 year" },
];

export function ApiKeyFormDialog({
  open,
  onClose,
  onSubmit,
  loading,
}: ApiKeyFormDialogProps) {
  const [formData, setFormData] = useState<ApiKeyFormData>({
    name: "",
    scopes: ["credentials:resolve"],
    expiresInDays: null,
  });
  const [errors, setErrors] = useState<
    Partial<Record<keyof ApiKeyFormData, string>>
  >({});

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof ApiKeyFormData, string>> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }

    if (formData.scopes.length === 0) {
      newErrors.scopes = "At least one scope is required";
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
      scopes: ["credentials:resolve"],
      expiresInDays: null,
    });
    setErrors({});
    onClose();
  };

  const toggleScope = (scope: string) => {
    setFormData((prev) => ({
      ...prev,
      scopes: prev.scopes.includes(scope)
        ? prev.scopes.filter((s) => s !== scope)
        : [...prev.scopes, scope],
    }));
  };

  return (
    <SimpleDialog
      open={open}
      onClose={handleClose}
      title="Create API Key"
      description="Create a new API key for server-to-server authentication"
    >
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          <div>
            <Label htmlFor="keyName" required>
              Key Name
            </Label>
            <Input
              id="keyName"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="e.g., Python Agent Key, Production"
              error={!!errors.name}
              disabled={loading}
            />
            {errors.name && (
              <p className="text-xs text-[var(--signal-danger)] mt-1">
                {errors.name}
              </p>
            )}
            <p className="text-xs text-[var(--ink-muted)] mt-1">
              A descriptive name to identify this API key
            </p>
          </div>

          <div>
            <Label required>Scopes</Label>
            <div className="space-y-2 mt-1.5">
              {AVAILABLE_SCOPES.map((scope) => (
                <label
                  key={scope.value}
                  className="flex items-start gap-2.5 p-2.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] hover:bg-[var(--surface-raised)] cursor-pointer transition-colors"
                >
                  <Checkbox
                    checked={formData.scopes.includes(scope.value)}
                    onCheckedChange={() => toggleScope(scope.value)}
                    disabled={loading}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="text-sm font-medium text-[var(--ink-primary)]">
                      {scope.label}
                    </span>
                    <p className="text-xs text-[var(--ink-tertiary)]">
                      {scope.description}
                    </p>
                  </div>
                </label>
              ))}
            </div>
            {errors.scopes && (
              <p className="text-xs text-[var(--signal-danger)] mt-1">
                {errors.scopes}
              </p>
            )}
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
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="p-3 bg-[var(--signal-warning-muted)] border border-[var(--signal-warning)] rounded-[var(--radius-md)]">
            <p className="text-sm text-[var(--signal-warning)]">
              <strong>Important:</strong> The API key will only be shown once
              after creation. Make sure to copy and store it securely.
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
            {loading ? "Creating..." : "Create API Key"}
          </Button>
        </DialogFooter>
      </form>
    </SimpleDialog>
  );
}
