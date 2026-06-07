import { z } from "zod";

export const ClassificationSchema = z.object({
  intent: z.enum([
    "promise_to_pay",
    "dispute",
    "hardship",
    "wrong_contact",
    "renewal_request",
    "other",
  ]),
  extracted: z
    .object({
      promised_date: z.string().date().optional(),
      promised_amount: z.number().positive().optional(),
    })
    .optional()
    .default({}),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1).max(500),
});

export type Classification = z.infer<typeof ClassificationSchema>;

export type ClassificationResult = Classification & {
  needs_review: boolean;
  raw_response?: unknown;
  provider: string;
};

export type ClassifierInput = {
  text: string;
  loanNumber?: string;
};
