"use client";

import { useState } from "react";
import type { VisitStatus, VisitType } from "@/types";
import type { VisitFormValues } from "@/components/MapApp";

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
    if (!name.trim()) nextErrors.name = "Name is required";
    else if (name.trim().length > 120) nextErrors.name = "Name must be at most 120 characters";
    if (notes.length > 2000) nextErrors.notes = "Notes must be at most 2000 characters";
    if (visitedAt && visitedTo && visitedTo < visitedAt)
      nextErrors.visitedTo = "End date can't be before the start date";
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
            <legend className="text-sm font-medium">Status</legend>
            <div className="mt-1 flex gap-2" role="radiogroup">
              {(
                [
                  ["VISITED", "Visited"],
                  ["WISHLIST", "Want to go"],
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
            <legend className="text-sm font-medium">Pin type</legend>
            <div className="mt-1 flex gap-2" role="radiogroup">
              {(["CITY", "PLACE"] as const).map((t) => (
                <label
                  key={t}
                  className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-500 ${
                    type === t
                      ? "border-sky-600 bg-sky-50 text-sky-700"
                      : "border-slate-300 text-slate-600 hover:border-slate-400"
                  }`}
                >
                  <input
                    type="radio"
                    name="visit-type"
                    value={t}
                    checked={type === t}
                    onChange={() => setType(t)}
                    className="sr-only"
                  />
                  {t === "CITY" ? "City" : "Place"}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Suggested from your zoom level — zoomed-out clicks are cities, zoomed-in clicks are
              places. Places attach to your nearest city within 50 km.
            </p>
          </fieldset>
        </>
      )}

      <div>
        <label htmlFor="visit-name" className="block text-sm font-medium">
          Name
        </label>
        <input
          id="visit-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!!errors.name}
          autoFocus
          placeholder={type === "CITY" ? "e.g. Lisbon" : "e.g. Belém Tower"}
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
            {wishlist ? "From" : "Visited on"}{" "}
            <span className="font-normal text-slate-400">(optional)</span>
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
            {wishlist ? "To" : "Until"} <span className="font-normal text-slate-400">(opt.)</span>
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
          Notes <span className="font-normal text-slate-400">(optional)</span>
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
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
