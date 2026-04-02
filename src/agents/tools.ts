export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

const readFileTool: ToolDefinition = {
  name: 'read_file',
  description:
    'Read the full contents of a file at the given relative path. Returns the file content as a string.',
  input_schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path to the file to read',
      },
    },
    required: ['path'],
  },
};

const writeFileTool: ToolDefinition = {
  name: 'write_file',
  description:
    'Write content to a file at the given relative path. Creates parent directories if they do not exist. Overwrites the file if it already exists.',
  input_schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path to the file to write',
      },
      content: {
        type: 'string',
        description: 'Full content to write to the file',
      },
    },
    required: ['path', 'content'],
  },
};

const runCommandTool: ToolDefinition = {
  name: 'run_command',
  description:
    'Execute a shell command in the project working directory. Returns stdout and stderr. Use for running tests, build commands, linters, etc.',
  input_schema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Shell command to execute',
      },
    },
    required: ['command'],
  },
};

const searchCodebaseTool: ToolDefinition = {
  name: 'search_codebase',
  description:
    'Search the codebase for files matching a regex pattern. Returns matching lines with file paths and line numbers.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Regex pattern to search for',
      },
      file_pattern: {
        type: 'string',
        description:
          'Optional glob pattern to filter files (e.g., "*.ts", "src/**/*.tsx")',
      },
    },
    required: ['query'],
  },
};

const listFilesTool: ToolDefinition = {
  name: 'list_files',
  description:
    'List all files in a directory recursively, excluding node_modules and .git directories.',
  input_schema: {
    type: 'object',
    properties: {
      directory: {
        type: 'string',
        description:
          'Relative directory path to list files from. Defaults to the project root.',
      },
    },
    required: [],
  },
};

const createReviewCommentTool: ToolDefinition = {
  name: 'create_review_comment',
  description:
    'Add a code review comment on a specific file and line. Comments are stored as structured review artifacts.',
  input_schema: {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        description: 'Relative file path the comment refers to',
      },
      line: {
        type: 'number',
        description: 'Line number in the file',
      },
      comment: {
        type: 'string',
        description: 'Review comment text',
      },
      severity: {
        type: 'string',
        enum: ['blocking', 'non-blocking', 'suggestion'],
        description: 'Comment severity level',
      },
    },
    required: ['file', 'line', 'comment', 'severity'],
  },
};

export const plannerTools: ToolDefinition[] = [
  readFileTool,
  listFilesTool,
  searchCodebaseTool,
];

export const coderTools: ToolDefinition[] = [
  readFileTool,
  writeFileTool,
  runCommandTool,
  searchCodebaseTool,
];

export const testerTools: ToolDefinition[] = [
  readFileTool,
  writeFileTool,
  runCommandTool,
];

export const reviewerTools: ToolDefinition[] = [
  readFileTool,
  searchCodebaseTool,
  createReviewCommentTool,
];
