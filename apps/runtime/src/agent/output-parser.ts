import { z } from "zod";

const ParsedToolCallSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  input: z.unknown()
});

const ParsedFinalSchema = z.object({
  type: z.literal("final"),
  answer: z.record(z.string(), z.unknown())
});

const ParsedToolCallEnvelopeSchema = z.object({
  type: z.literal("tool_call"),
  tool_call: ParsedToolCallSchema
});

export const ParsedModelOutputSchema = z.union([
  ParsedFinalSchema,
  ParsedToolCallEnvelopeSchema
]);

export type ParsedModelOutput = z.infer<typeof ParsedModelOutputSchema>;

export function parseModelOutput(output: unknown): ParsedModelOutput {
  return ParsedModelOutputSchema.parse(output);
}
