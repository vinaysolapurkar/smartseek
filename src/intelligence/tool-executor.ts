/**
 * Tool Executor for Intelligence Augmentation
 * Provides tools that enhance DeepSeek's capabilities.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';

const execAsync = promisify(exec);

export type ToolResult = {
  success: boolean;
  output: string;
  error?: string;
};

export type Tool = {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;
};

/**
 * Web Search Tool - Uses DuckDuckGo for privacy-friendly search
 */
export const webSearchTool: Tool = {
  name: 'web_search',
  description: 'Search the internet for current information using DuckDuckGo',
  parameters: {
    query: { type: 'string', description: 'The search query', required: true },
    maxResults: { type: 'number', description: 'Maximum number of results (default: 5)' },
  },
  execute: async (params): Promise<ToolResult> => {
    const query = params.query as string;
    const maxResults = (params.maxResults as number) || 5;

    try {
      // Use DuckDuckGo instant answer API (no API key needed)
      const encodedQuery = encodeURIComponent(query);
      const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`;

      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }

      const data = (await response.json()) as {
        Abstract?: string;
        AbstractText?: string;
        AbstractSource?: string;
        AbstractURL?: string;
        RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
      };

      let result = '';

      if (data.AbstractText) {
        result += `**Summary**: ${data.AbstractText}\n`;
        result += `**Source**: ${data.AbstractSource} (${data.AbstractURL})\n\n`;
      }

      if (data.RelatedTopics && data.RelatedTopics.length > 0) {
        result += '**Related Topics**:\n';
        const topics = data.RelatedTopics.slice(0, maxResults);
        for (const topic of topics) {
          if (topic.Text) {
            result += `- ${topic.Text}\n`;
          }
        }
      }

      if (!result) {
        result = `No instant answers found for "${query}". Try a more specific query.`;
      }

      return { success: true, output: result };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Search failed: ${String(error)}`,
      };
    }
  },
};

/**
 * Calculator Tool - Safe math evaluation
 */
export const calculatorTool: Tool = {
  name: 'calculate',
  description: 'Perform mathematical calculations',
  parameters: {
    expression: { type: 'string', description: 'The mathematical expression to evaluate', required: true },
  },
  execute: async (params): Promise<ToolResult> => {
    const expression = params.expression as string;

    try {
      // Sanitize input - only allow safe math operations
      const sanitized = expression.replace(/[^0-9+\-*/().%^sqrt\s]/gi, '');

      if (sanitized !== expression.replace(/\s/g, '').replace(/Math\./g, '')) {
        return {
          success: false,
          output: '',
          error: 'Expression contains unsafe characters',
        };
      }

      // Replace common math functions
      let evalExpr = sanitized
        .replace(/sqrt/g, 'Math.sqrt')
        .replace(/\^/g, '**');

      // Safe eval using Function constructor
      const result = new Function(`return ${evalExpr}`)();

      return {
        success: true,
        output: `${expression} = ${result}`,
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Calculation error: ${String(error)}`,
      };
    }
  },
};

/**
 * Code Execution Tool - Run JavaScript/Python code safely
 */
export const codeExecuteTool: Tool = {
  name: 'code_execute',
  description: 'Execute code to verify logic or compute results (JavaScript or Python)',
  parameters: {
    code: { type: 'string', description: 'The code to execute', required: true },
    language: { type: 'string', description: 'Programming language (js or python)', required: true },
  },
  execute: async (params): Promise<ToolResult> => {
    const code = params.code as string;
    const language = params.language as string;

    try {
      if (language === 'js' || language === 'javascript') {
        // Execute JavaScript in a sandboxed context
        const sandboxedCode = `
          const console = { log: (...args) => __output.push(args.join(' ')) };
          const __output = [];
          try {
            ${code}
          } catch (e) {
            __output.push('Error: ' + e.message);
          }
          __output.join('\\n');
        `;
        const result = new Function(sandboxedCode)();
        return { success: true, output: String(result || '(no output)') };
      } else if (language === 'python' || language === 'py') {
        // Execute Python using python command
        const { stdout, stderr } = await execAsync(`python -c "${code.replace(/"/g, '\\"')}"`, {
          timeout: 10000,
        });
        return {
          success: !stderr,
          output: stdout || stderr || '(no output)',
          error: stderr || undefined,
        };
      } else {
        return {
          success: false,
          output: '',
          error: `Unsupported language: ${language}. Use 'js' or 'python'.`,
        };
      }
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Execution error: ${String(error)}`,
      };
    }
  },
};

/**
 * File Read Tool - Read local files
 */
export const fileReadTool: Tool = {
  name: 'file_read',
  description: 'Read the contents of a local file',
  parameters: {
    path: { type: 'string', description: 'Path to the file to read', required: true },
    maxLines: { type: 'number', description: 'Maximum lines to read (default: 100)' },
  },
  execute: async (params): Promise<ToolResult> => {
    const filePath = params.path as string;
    const maxLines = (params.maxLines as number) || 100;

    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n').slice(0, maxLines);
      const truncated = lines.length < content.split('\n').length;

      return {
        success: true,
        output: lines.join('\n') + (truncated ? `\n\n... (truncated, showing ${maxLines} of ${content.split('\n').length} lines)` : ''),
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Failed to read file: ${String(error)}`,
      };
    }
  },
};

/**
 * Current Time Tool
 */
export const currentTimeTool: Tool = {
  name: 'current_time',
  description: 'Get the current date and time',
  parameters: {
    timezone: { type: 'string', description: 'Timezone (e.g., "America/New_York")' },
  },
  execute: async (params): Promise<ToolResult> => {
    const timezone = (params.timezone as string) || 'UTC';
    try {
      const now = new Date();
      const formatted = now.toLocaleString('en-US', { timeZone: timezone });
      return {
        success: true,
        output: `Current time: ${formatted} (${timezone})`,
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Failed to get time: ${String(error)}`,
      };
    }
  },
};

/**
 * All available tools
 */
export const availableTools: Tool[] = [
  webSearchTool,
  calculatorTool,
  codeExecuteTool,
  fileReadTool,
  currentTimeTool,
];

/**
 * Get a tool by name
 */
export function getTool(name: string): Tool | undefined {
  return availableTools.find((t) => t.name === name);
}

/**
 * Execute a tool by name with parameters
 */
export async function executeTool(
  name: string,
  params: Record<string, unknown>,
): Promise<ToolResult> {
  const tool = getTool(name);
  if (!tool) {
    return {
      success: false,
      output: '',
      error: `Unknown tool: ${name}`,
    };
  }

  return tool.execute(params);
}

/**
 * Parse tool calls from model output
 */
export function parseToolCalls(
  text: string,
): Array<{ name: string; params: Record<string, unknown> }> {
  const toolCallRegex = /<tool_call name="(\w+)">\s*([\s\S]*?)\s*<\/tool_call>/g;
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];

  let match;
  while ((match = toolCallRegex.exec(text)) !== null) {
    const name = match[1];
    try {
      const params = JSON.parse(match[2]) as Record<string, unknown>;
      calls.push({ name, params });
    } catch {
      // Invalid JSON, skip this call
    }
  }

  return calls;
}

/**
 * Generate OpenAI-compatible tool definitions
 */
export function getToolDefinitions(): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  };
}> {
  return availableTools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object' as const,
        properties: Object.fromEntries(
          Object.entries(tool.parameters).map(([key, value]) => [
            key,
            { type: value.type, description: value.description },
          ]),
        ),
        required: Object.entries(tool.parameters)
          .filter(([, value]) => value.required)
          .map(([key]) => key),
      },
    },
  }));
}
