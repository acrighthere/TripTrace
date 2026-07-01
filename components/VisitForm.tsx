"use client";

import { useState } from "react";
import type { VisitStatus, VisitType } from "@/types";
import type { VisitFormValues } from "@/components/MapApp";
import { useT } from "@/lib/i18n";

interface VisitFormProps {
  mode: "create" | "edit";
  initial: VisitFormValues;
  /** Type and status can only be chosen while creating; fixed afterwards. */
  typeEditable: boolean;
  onSubmit: (values: VisitFormValues) => Promise<boolean>;
  onCancel: () => void;
}

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-500 aria-[invalid=true]:border-red-400";

export default function VisitForm({ mode, initial, typeEditable, onSubmit, onCancel }: VisitFormProps) {
  const t = useT();
  const [name, setName] = useState(initial.name);
  const [type, setType] = useState<VisitType>(initial.type);
  const [status, setStatus] = useState<VisitStatus>(initial.status);
  const [notes, setNotes] = useState(initial.notes);
  const [visitedAt, setVisitedAt] = useState(initial.visitedAt);
  const [visitedTo, setVisitedTo] = useState(initial.visitedTo);
  const [errors, setErrors] = useState<{ name?: string; notes?: string; visitedTo?: string }>({});
  const [pending, setPending] = useState(false);

  const wishlist = status === "WISHLIST";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;

    const nextErrors: { name?: string; notes?: string; visitedTo?: string } = {};
    if (!name.trim()) nextErrors.name = t("visitForm.errorNameRequired");
    else if (name.trim().length > 120) nextErrors.name = t("visitForm.errorNameTooLong");
    if (notes.length > 2000) nextErrors.notes = t("visitForm.errorNotesTooLong");
    if (visitedAt && visitedTo && visitedTo < visitedAt)
      nextErrors.visitedTo = t("visitForm.errorEndBeforeStart");
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.notes || nextErrors.visitedTo) return;

    setPending(true);
    const ok = await onSubmit({
      name: name.trim(),
      type,
      status,
      notes: notes.trim(),
      visitedAt,
      visitedTo,
    });
    if (!ok) setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {typeEditable && (
        <>
          <fieldset>
            <legend className="text-sm font-medium">{t("visitForm.statusLegend")}</legend>
            <div className="mt-1 flex gap-2" role="radiogroup">
              {(
                [
                  ["VISITED", t("visitForm.statusVisited")],
                  ["WISHLIST", t("visitForm.statusWishlist")],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-500 ${
                    status === value
                      ? "border-sky-600 bg-sky-50 text-sky-700"
                      : "border-slate-300 text-slate-600 hover:border-slate-400"
                  }`}
                >
                  <input
                    type="radio"
                    name="visit-status"
                    value={value}
                    checked={status === value}
                    onChange={() => setStatus(value)}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium">{t("visitForm.typeLegend")}</legend>
            <div className="mt-1 flex gap-2" role="radiogroup">
              {(["CITY", "PLACE"] as const).map((pinType) => (
                <label
                  key={pinType}
                  className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-500 ${
                    type === pinType
                      ? "border-sky-600 bg-sky-50 text-sky-700"
                      : "border-slate-300 text-slate-600 hover:border-slate-400"
                  }`}
                >
                  <input
                    type="radio"
                    name="visit-type"
                    value={pinType}
                    checked={type === pinType}
                    onChange={() => setType(pinType)}
                    className="sr-only"
                  />
                  {pinType === "CITY" ? t("common.city") : t("common.place")}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-400">{t("visitForm.typeHint")}</p>
          </fieldset>
        </>
      )}

      <div>
        <label htmlFor="visit-name" className="block text-sm font-medium">
          {t("visitForm.nameLabel")}
        </label>
        <input
          id="visit-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!!errors.name}
          autoFocus
          placeholder={
            type === "CITY"
              ? t("visitForm.namePlaceholderCity")
              : t("visitForm.namePlaceholderPlace")
          }
          className={inputClass}
        />
        {errors.name && (
          <p role="alert" className="mt-1 text-sm text-red-700">
            {errors.name}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor="visit-date" className="block text-sm font-medium">
            {wishlist ? t("visitForm.dateFrom") : t("visitForm.dateVisitedOn")}{" "}
            <span className="font-normal text-slate-400">{t("common.optional")}</span>
          </label>
          <input
            id="visit-date"
            type="date"
            value={visitedAt}
            onChange={(e) => setVisitedAt(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex-1">
          <label htmlFor="visit-date-to" className="block text-sm font-medium">
            {wishlist ? t("visitForm.dateTo") : t("visitForm.dateUntil")}{" "}
            <span className="font-normal text-slate-400">{t("visitForm.optionalShort")}</span>
          </label>
          <input
            id="visit-date-to"
            type="date"
            value={visitedTo}
            min={visitedAt || undefined}
            onChange={(e) => setVisitedTo(e.target.value)}
            aria-invalid={!!errors.visitedTo}
            className={inputClass}
          />
        </div>
      </div>
      {errors.visitedTo && (
        <p role="alert" className="-mt-2 text-sm text-red-700">
          {errors.visitedTo}
        </p>
      )}

      <div>
        <label htmlFor="visit-notes" className="block text-sm font-medium">
          {t("visitForm.notesLabel")}{" "}
          <span className="font-normal text-slate-400">{t("common.optional")}</span>
        </label>
        <textarea
          id="visit-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          aria-invalid={!!errors.notes}
          rows={3}
          className={inputClass}
        />
        {errors.notes && (
          <p role="alert" className="mt-1 text-sm text-red-700">
            {errors.notes}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {pending ? t("common.saving") : t("common.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
