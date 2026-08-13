"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export interface CategoryOption {
  id: string;
  name: string;
  parentId: string | null;
}

/**
 * Category + Subcategory picker. Renders all categories; the Subcategory
 * options are filtered client-side by the chosen top-level parent.
 */
export function CategoryPicker({ categories }: { categories: CategoryOption[] }) {
  const parents = categories.filter((c) => c.parentId === null);
  const [parentId, setParentId] = useState("");
  const subcategories = categories.filter((c) => c.parentId === parentId);

  return (
    <>
      <div>
        <Label htmlFor="categoryId">หมวดหมู่ / Category</Label>
        <Select
          id="categoryId"
          name="categoryId"
          className="mt-1"
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
        >
          <option value="">— ไม่ระบุ / None —</option>
          {parents.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="subcategoryId">หมวดหมู่ย่อย / Subcategory</Label>
        <Select
          id="subcategoryId"
          name="subcategoryId"
          className="mt-1"
          defaultValue=""
          disabled={subcategories.length === 0}
        >
          <option value="">— ไม่ระบุ / None —</option>
          {subcategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
    </>
  );
}
