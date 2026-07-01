import { z, type ZodError } from "zod";

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8 MB
export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedPhotoType = (typeof ALLOWED_PHOTO_TYPES)[number];

export const PHOTO_EXTENSIONS: Record<AllowedPhotoType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const email = z
  .email("Enter a valid email address")
  .max(254)
  .transform((v) => v.toLowerCase());

export const signupSchema = z.object({
  email,
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
});

// Login deliberately skips format checks beyond presence — any mismatch
// resolves to the same "Invalid email or password" outcome.
export const loginSchema = z.object({
  email: z
    .string()
    .min(1)
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(128),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1)
    .max(254)
    .transform((v) => v.toLowerCase()),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(128),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
});

const notesField = z.preprocess(
  (v) => (v === "" ? null : v),
  z.string().trim().max(2000, "Notes must be at most 2000 characters").nullable()
);

const dateField = z.preprocess(
  (v) => (v === "" ? null : v),
  z.coerce.date().nullable()
);

// End date must not precede the start date when both are given.
const endAfterStart = (d: { visitedAt?: Date | null; visitedTo?: Date | null }) =>
  !d.visitedAt || !d.visitedTo || d.visitedTo >= d.visitedAt;
const endAfterStartIssue = {
  message: "End date can't be before the start date",
  path: ["visitedTo"] as PropertyKey[],
};

export const visitCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120, "Name must be at most 120 characters"),
    type: z.enum(["CITY", "PLACE"]),
    status: z.enum(["VISITED", "WISHLIST"]).optional(),
    lat: z.number().gte(-90).lte(90),
    lng: z.number().gte(-180).lte(180),
    notes: notesField.optional(),
    visitedAt: dateField.optional(),
    visitedTo: dateField.optional(),
  })
  .refine(endAfterStart, endAfterStartIssue);

export const visitUpdateSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120, "Name must be at most 120 characters").optional(),
    status: z.enum(["VISITED", "WISHLIST"]).optional(),
    notes: notesField.optional(),
    visitedAt: dateField.optional(),
    visitedTo: dateField.optional(),
    // null clears the trip; a string assigns one (ownership checked in the route).
    tripId: z.preprocess((v) => (v === "" ? null : v), z.string().max(64).nullable()).optional(),
  })
  .refine(endAfterStart, endAfterStartIssue);

export const tripCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80, "Name must be at most 80 characters"),
});

export const tripUpdateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80, "Name must be at most 80 characters"),
});

export const photoPresignSchema = z.object({
  visitId: z.string().min(1).max(64),
  contentType: z.enum(ALLOWED_PHOTO_TYPES),
  size: z
    .number()
    .int()
    .positive()
    .max(MAX_PHOTO_BYTES, "Photos can be at most 8 MB"),
});

export const photoCreateSchema = z.object({
  visitId: z.string().min(1).max(64),
  storageKey: z.string().min(1).max(512),
  caption: z
    .preprocess((v) => (v === "" ? null : v), z.string().trim().max(300, "Caption must be at most 300 characters").nullable())
    .optional(),
});

/** First message per field, keyed by dotted path ("form" for top-level issues). */
export function fieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
