import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { fetchFedexRates } from "./fedex.server";

const packageSchema = z.object({
  weightLb: z.number().positive().max(2000),
  lengthIn: z.number().positive().max(200),
  widthIn: z.number().positive().max(200),
  heightIn: z.number().positive().max(200),
  qty: z.number().int().positive().max(50).optional(),
});

const inputSchema = z.object({
  destPostalCode: z.string().trim().min(3).max(10),
  destCountryCode: z.string().trim().length(2).optional(),
  destStateCode: z.string().trim().length(2).nullable().optional(),
  destCity: z.string().trim().max(60).nullable().optional(),
  destResidential: z.boolean().optional(),
  shipDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  packages: z.array(packageSchema).min(1).max(20),
});

export const getFedexRates = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => fetchFedexRates(data));