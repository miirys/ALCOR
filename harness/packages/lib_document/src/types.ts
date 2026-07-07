import { z } from 'zod';
import { Diagnostic, DiagnosticSeverity, DiagnosticTag } from 'vscode-languageserver-protocol';
import { declareRequest } from '@gitlab-org/rpc';

const diagnosticSeverity = z.union([
  z.literal(1), // Error
  z.literal(2), // Warning
  z.literal(3), // Information
  z.literal(4), // Hint
]) satisfies z.ZodType<DiagnosticSeverity>;

const diagnosticTag = z.union([
  z.literal(1), // Unnecessary
  z.literal(2), // Deprecated
]) satisfies z.ZodType<DiagnosticTag>;

const diagnostic = z.object({
  range: z.object({
    start: z.object({
      line: z.number().min(0),
      character: z.number().min(0),
    }),
    end: z.object({
      line: z.number().min(0),
      character: z.number().min(0),
    }),
  }),
  message: z.string(),
  severity: diagnosticSeverity.optional(),
  code: z.union([z.string(), z.number()]).optional(),
  source: z.string().optional(),
  relatedInformation: z.array(z.any()).optional(),
  tags: z.array(diagnosticTag).optional(),
  data: z.any().optional(),
}) satisfies z.ZodType<Diagnostic>;

const GetDiagnosticsParams = z.object({
  fileUri: z.string(),
});

const GetDiagnosticsResult = z.array(diagnostic);

export const GetDiagnosticsRequest = declareRequest('$/gitlab/document-quality/get-diagnostics')
  .withParams(GetDiagnosticsParams)
  .withResponse(GetDiagnosticsResult)
  .build();
