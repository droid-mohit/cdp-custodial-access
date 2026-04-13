import type { BrowserSession } from '../core/browser-session.js';
import type { ToolResult } from '../types.js';
import { ToolErrorCode } from '../types.js';
import type { LLMConfig } from '../llm/types.js';
import { getLLMClient } from '../llm/factory.js';
import { cleanHtml, extractFromHtml, buildExtractionInput, chunkText } from '../llm/text-processor.js';
import type { PageContent } from '../llm/text-processor.js';

export interface LLMExtractParams {
  /** What to extract — plain English instruction */
  instruction: string;

  /** JSON schema describing the desired output structure */
  schema?: Record<string, unknown>;

  /** LLM configuration (provider, model, API key) */
  llm: LLMConfig;

  /**
   * Pages to extract from. If not provided, uses all HTML snapshots
   * from the session's tracer (all pages visited during the workflow).
   */
  pages?: Array<{
    url: string;
    title?: string;
    html: string;
    /** CSS selector to narrow extraction (e.g., 'main', '.article-body', 'table') */
    selector?: string;
  }>;

  /**
   * CSS selector to apply to all pages when extracting content.
   * Individual page selectors override this.
   */
  selector?: string;

  /** Max tokens reserved for the LLM response (default: 16384) */
  maxOutputTokens?: number;
}

export interface LLMExtractResult {
  /** The extracted data — parsed JSON if schema was provided, raw text otherwise */
  data: unknown;
  /** Raw LLM response text */
  rawResponse: string;
  /** Number of pages processed */
  pageCount: number;
  /** Number of chunks sent to the LLM (>1 if content exceeded context window) */
  chunkCount: number;
  /** Token usage from the LLM */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export async function llmExtract(
  session: BrowserSession,
  params: LLMExtractParams,
): Promise<ToolResult<LLMExtractResult>> {
  try {
    // 1. Collect page contents
    let pageContents: PageContent[];

    if (params.pages) {
      // Use provided pages
      pageContents = params.pages.map((p) => ({
        url: p.url,
        title: p.title,
        content: p.selector
          ? extractFromHtml(p.html, p.selector)
          : params.selector
            ? extractFromHtml(p.html, params.selector)
            : cleanHtml(p.html),
      }));
    } else {
      // Collect from tracer — all HTML snapshots captured during the workflow
      const traces = session.tracer.getEntries();
      const htmlEntries = traces.filter((t) => t.html);

      if (htmlEntries.length === 0) {
        return {
          success: false,
          error: 'No HTML pages available. Navigate to pages before calling llmExtract, or provide pages explicitly.',
          errorCode: ToolErrorCode.CDP_ERROR,
        };
      }

      // Read HTML files from the tracer's output directory
      const fs = await import('node:fs');
      const path = await import('node:path');
      const tracesDir = session.tracer.getTracesDir();

      if (!tracesDir) {
        return {
          success: false,
          error: 'Tracer output directory not set. Call session.tracer.setOutputDir() before llmExtract.',
          errorCode: ToolErrorCode.CDP_ERROR,
        };
      }

      pageContents = [];
      const seenUrls = new Set<string>();

      for (const entry of htmlEntries) {
        // Deduplicate by URL — keep the latest snapshot per URL
        if (seenUrls.has(entry.pageUrl)) continue;
        seenUrls.add(entry.pageUrl);

        const htmlPath = path.join(tracesDir, entry.html!);
        if (!fs.existsSync(htmlPath)) continue;

        const html = fs.readFileSync(htmlPath, 'utf-8');
        pageContents.push({
          url: entry.pageUrl,
          title: entry.pageTitle,
          content: params.selector
            ? extractFromHtml(html, params.selector)
            : cleanHtml(html),
        });
      }

      if (pageContents.length === 0) {
        return {
          success: false,
          error: 'No HTML files found in tracer output.',
          errorCode: ToolErrorCode.CDP_ERROR,
        };
      }
    }

    // 2. Build the extraction input
    const input = buildExtractionInput(pageContents);
    const maxOutputTokens = params.maxOutputTokens ?? 16384;

    // 3. Chunk if needed
    const chunks = chunkText(input, params.llm.model, maxOutputTokens + 2000);

    // 4. Build the system prompt
    const systemPrompt = buildSystemPrompt(params.instruction, params.schema);

    // 5. Get LLM client
    const client = getLLMClient(params.llm);

    // 6. Process chunks
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const chunkResults: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const userMessage = chunks.length > 1
        ? `[Chunk ${i + 1} of ${chunks.length}]\n\n${chunks[i]}`
        : chunks[i];

      const response = await client.generate(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        {
          maxTokens: maxOutputTokens,
          jsonSchema: params.schema,
        },
      );

      chunkResults.push(response.content);

      if (response.usage) {
        totalInputTokens += response.usage.inputTokens;
        totalOutputTokens += response.usage.outputTokens;
      }
    }

    // 7. Merge results if multiple chunks
    let finalResponse: string;
    if (chunkResults.length === 1) {
      finalResponse = chunkResults[0];
    } else {
      // Ask the LLM to merge partial results
      const mergeResponse = await client.generate(
        [
          {
            role: 'system',
            content: params.schema
              ? `You are merging partial extraction results into a single JSON object matching this schema:\n${JSON.stringify(params.schema, null, 2)}\n\nCombine all partial results, deduplicate, and return ONE complete JSON object.`
              : `You are merging partial extraction results. Combine all results into a single cohesive response, deduplicating where appropriate.`,
          },
          {
            role: 'user',
            content: chunkResults.map((r, i) => `--- Partial result ${i + 1} ---\n${r}`).join('\n\n'),
          },
        ],
        {
          maxTokens: maxOutputTokens,
          jsonSchema: params.schema,
        },
      );
      finalResponse = mergeResponse.content;

      if (mergeResponse.usage) {
        totalInputTokens += mergeResponse.usage.inputTokens;
        totalOutputTokens += mergeResponse.usage.outputTokens;
      }
    }

    // 8. Parse response
    let parsedData: unknown;
    if (params.schema) {
      try {
        let jsonText = finalResponse.trim();
        // Strip markdown code fencing if present
        if (jsonText.startsWith('```')) {
          jsonText = jsonText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
        }
        parsedData = JSON.parse(jsonText);
      } catch {
        // If JSON parsing fails, return raw text
        parsedData = finalResponse;
      }
    } else {
      parsedData = finalResponse;
    }

    return {
      success: true,
      data: {
        data: parsedData,
        rawResponse: finalResponse,
        pageCount: pageContents.length,
        chunkCount: chunks.length,
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      },
      metadata: { url: '', timestamp: Date.now() },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      errorCode: ToolErrorCode.CDP_ERROR,
    };
  }
}

function buildSystemPrompt(instruction: string, schema?: Record<string, unknown>): string {
  const parts = [
    'You are a data extraction assistant. You will be given the text content of one or more web pages.',
    `Your task: ${instruction}`,
  ];

  if (schema) {
    parts.push('');
    parts.push('Respond with a valid JSON object matching the provided schema.');
    parts.push('Extract ONLY information that is present in the provided pages. Do not invent or hallucinate data.');
    parts.push('If a requested field cannot be found, use null for optional fields or an empty array for array fields.');
  } else {
    parts.push('');
    parts.push('Extract the requested information from the provided pages.');
    parts.push('Be thorough but concise. Only extract information that is actually present in the pages.');
  }

  return parts.join('\n');
}
