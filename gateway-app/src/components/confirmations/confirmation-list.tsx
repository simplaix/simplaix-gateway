"use client";

import { ConfirmationCard, ConfirmationCardSkeleton, Confirmation } from "./confirmation-card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { ConfirmationIcon } from "@/components/ui/icons";

interface ConfirmationListProps {
  confirmations: Confirmation[];
  loading?: boolean;
  onConfirm?: (confirmation: Confirmation, reason?: string) => void;
  onReject?: (confirmation: Confirmation, reason?: string) => void;
  actionLoading?: string | null;
}

export function ConfirmationList({ confirmations, loading, onConfirm, onReject, actionLoading }: ConfirmationListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <ConfirmationCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!confirmations || confirmations.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ConfirmationIcon size={24} />
          </EmptyMedia>
          <EmptyTitle>No pending confirmations</EmptyTitle>
          <EmptyDescription>When agents make tool calls that require confirmation, they will appear here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  // Sort by created date (newest first)
  const sorted = [...confirmations].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="space-y-3">
      {sorted.map((confirmation) => (
        <ConfirmationCard
          key={confirmation.id}
          confirmation={confirmation}
          onConfirm={onConfirm}
          onReject={onReject}
          loading={actionLoading === confirmation.id}
        />
      ))}
    </div>
  );
}
