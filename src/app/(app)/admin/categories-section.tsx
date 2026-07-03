"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteBenefitCategoryAction } from "@/server/admin/actions";
import { formatINR } from "@/lib/format";
import { SectionCard } from "@/app/(app)/admin/section-card";
import { Th, Td, EmptyRow } from "@/app/(app)/admin/table-cells";
import { RowActions } from "@/app/(app)/admin/row-actions";
import { CategoryDrawer } from "@/app/(app)/admin/category-drawer";
import { useAdminSave } from "@/app/(app)/admin/use-admin-save";
import type { Category } from "@/app/(app)/admin/admin-types";

export function CategoriesSection({ categories }: { categories: Category[] }) {
  const { save, pending } = useAdminSave();
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <SectionCard
        title="Benefit categories & caps"
        count={categories.length}
        action={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" strokeWidth={2.2} /> New category
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr className="text-[12.5px] text-muted-foreground">
                <Th>Name</Th>
                <Th className="text-right">Annual cap</Th>
                <Th>FY start</Th>
                <Th>Carryover</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 ? (
                <EmptyRow colSpan={5}>No categories yet. Create one to start capping allowances.</EmptyRow>
              ) : (
                categories.map((c) => (
                  <tr key={c.id} className="border-b transition-colors hover:bg-muted/55">
                    <Td className="font-medium">{c.name}</Td>
                    <Td className="tabular text-right">{formatINR(c.annualCapPaise / 100)}</Td>
                    <Td className="text-muted-foreground">{c.fyStart}</Td>
                    <Td className="text-muted-foreground">{c.carryover ? "Yes" : "No"}</Td>
                    <Td className="text-right">
                      <RowActions
                        pending={pending}
                        onEdit={() => setEditing(c)}
                        onDelete={() => {
                          if (confirm(`Delete category "${c.name}"?`)) save(() => deleteBenefitCategoryAction({ id: c.id }));
                        }}
                      />
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
      {(editing || creating) && (
        <CategoryDrawer
          category={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </>
  );
}
