import {
  collection,
  createInterfaceId,
  Implements,
  Service,
  ServiceLifetime,
} from '@gitlab/needle';
import { Logger } from '@gitlab-org/logging';
import { Tool, ToolUseBlock } from '@anthropic-ai/sdk/resources/messages.mjs';
import {
  type PlainTextResponse,
  WorkflowActionHandler,
  WorkflowActionOf,
  WorkflowAction,
  FileStateTracker,
} from '@gitlab-org/workflow-executor/node';
import type { GenerateTokenResponse } from '@gitlab-org/workflow-executor';
import {
  McpManagerWorkflowExecutorAdaptor as McpManager,
  type McpTool,
} from '@gitlab-org/ai-configuration';
import { URI } from 'vscode-uri';
import { ParsedCliInput } from '../../parse';
import { CredentialProvider } from '../../utils/credential_provider';

export interface ToolResult {
  result: string;
  error?: string;
}

export interface Tools {
  tools: Tool[];
  executeTool(toolUse: ToolUseBlock): Promise<ToolResult>;
  initialize(): Promise<void>;
  isMcpToolApprovedByConfig(toolName: string): boolean;
}

export const Tools = createInterfaceId<Tools>('Tools');

const listDirTool: Tool = {
  name: 'list_dir',
  description: `List directory contents (equivalent to 'ls -la' command).

**Primary use cases:**
- See all files and subdirectories in a directory
- Check if files or directories exist
- Explore project structure and organization
- Get directory contents before reading specific files

**Replaces these commands:**
- ls -la → list_dir(directory=".")
- ls -l → list_dir(directory=".")
- ls → list_dir(directory=".")
- ls src/ → list_dir(directory="src/")
- ls -la tests/ → list_dir(directory="tests/")
- dir → list_dir(directory=".") (Windows equivalent)

**Examples:**
- List current directory: list_dir(directory=".")
- List source code: list_dir(directory="src/")
- Check if directory exists: list_dir(directory="tests/")
- Explore subdirectory: list_dir(directory="config/")

Shows files and subdirectories relative to the repository root.
Use this instead of trying to run 'ls' commands.
`,
  input_schema: {
    type: 'object',
    properties: {
      directory: {
        type: 'string',
        description: 'Directory path relative to the repository root',
      },
    },
    required: ['directory'],
  },
};

const readFileTool: Tool = {
  name: 'read_file',
  description: `Read the contents of a file.

IMPORTANT:
- When a task requires reading multiple files, include batches of tool calls in a single response
- Do not make separate responses for each file - group related files together
`,
  input_schema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The file path to read the file from',
      },
    },
    required: ['file_path'],
  },
};

const writeFileTool: Tool = {
  name: 'create_file_with_contents',
  description: `Create and write the given contents to a file. Please specify the \`file_path\` and the \`contents\` to write.`,
  input_schema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The file path to write the file to',
      },
      contents: {
        type: 'string',
        description: 'The contents to write in the file. *This is required*',
      },
    },
    required: ['file_path', 'contents'],
  },
};

const findFilesTool: Tool = {
  name: 'find_files',
  description: `Find files by name patterns (equivalent to 'find' command).

**Primary use cases:**
- Find files by filename or extension patterns
- Locate specific files across the codebase
- Get list of files matching naming conventions

**Replaces these commands:**
- find . -name "*.py" → find_files(name_pattern="*.py")
- find tests -name "test_*.js" → find_files(name_pattern="tests/test_*.js")
- find src -name "*.json" → find_files(name_pattern="src/*.json")

**Examples:**
- All Python files: find_files(name_pattern="*.py")
- Test files: find_files(name_pattern="test_*.py")
- Config files: find_files(name_pattern="*.json")
- Files in directory: find_files(name_pattern="src/*.js")

**Don't use this for:**
- Searching text content within files (use grep instead)
- Finding where functions/variables are used (use grep instead)

Uses bash filename expansion syntax. Searches recursively and respects .gitignore rules.
`,
  input_schema: {
    type: 'object',
    properties: {
      name_pattern: {
        type: 'string',
        description: 'The pattern to search for files.',
      },
    },
    required: ['name_pattern'],
  },
};

const mkdirTool: Tool = {
  name: 'mkdir',
  description: `Create a new directory using the mkdir command.
The directory creation is restricted to the current working directory tree.`,
  input_schema: {
    type: 'object',
    properties: {
      directory_path: {
        type: 'string',
        description:
          'The directory path to create. Must be within the current working directory tree.',
      },
    },
    required: ['directory_path'],
  },
};

const editFileTool: Tool = {
  name: 'edit_file',
  description: `Use this tool to edit an existing file.

IMPORTANT:
- When making similar changes to multiple files, include batches of tool calls in a single response
- Do not make separate responses for each file - group related files together

Examples of individual file edits:
- Update a function parameter:
    edit_file(
        file_path="src/utils.py",
        old_str="# Utility functions\\n\\ndef process_data(data):\\n            # Process the input data\\n    return data.upper()\\n\\n# More functions below",
        new_str="# Utility functions\\n\\ndef process_data(data, transform=True):\\n            # Process the input data\\n    return data.upper() if transform else data\\n\\n# More functions below"
    )

- Fix a bug in a specific file:
    edit_file(
        file_path="src/api/endpoints.py",
        old_str="# User endpoints\\n@app.route('/users/<id>')\\ndef get_user(id):\\n            return db.find_user(id)\\n\\n# Other endpoints",
        new_str="# User endpoints\\n@app.route('/users/<id>')\\ndef get_user(id):\\n            user = db.find_user(id)\\n    return user if user else {'error': 'User not found'}\\n\\n# Other endpoints"
    )

- Add a new import statement:
    edit_file(
        file_path="src/models.py",
        old_str="import os\\nimport sys\\n\\nclass User:",
        new_str="import os\\nimport sys\\nimport datetime\\n\\nclass User:"
    )

Examples of batched file edits:
- Rename a function across multiple files:
    edit_file(
        file_path="src/utils.py",
        old_str="# Configuration functions\\ndef get_config():\\n    return load_config()\\n\\n# Other utility functions",
        new_str="# Configuration functions\\ndef fetch_config():\\n    return load_config()\\n\\n# Other utility functions"
    )
    edit_file(
        file_path="src/app.py",
        old_str="from utils import get_config\\n\\nconfig = get_config()\\n\\n# Application setup",
        new_str="from utils import fetch_config\\n\\nconfig = fetch_config()\\n\\n# Application setup"
    )
    edit_file(
        file_path="tests/test_utils.py",
        old_str="# Test configuration\\ndef test_get_config():\\n    config = get_config()\\n    assert config is not None",
        new_str="# Test configuration\\ndef test_fetch_config():\\n    config = fetch_config()\\n    assert config is not None"
    )

- Update version number across the codebase:
    edit_file(
        file_path="src/version.py",
        old_str="# Version information\\nVERSION = '1.0.0'\\n# End of version info",
        new_str="# Version information\\nVERSION = '1.1.0'\\n# End of version info"
    )
    edit_file(
        file_path="README.md",
        old_str="# Project Documentation\\n\\n## MyApp v1.0.0\\n\\n### Features",
        new_str="# Project Documentation\\n\\n## MyApp v1.1.0\\n\\n### Features"
    )
    edit_file(
        file_path="docs/changelog.md",
        old_str="# Changelog\\n\\n## 1.0.0",
        new_str="# Changelog\\n\\n## 1.1.0\\n- Bug fixes\\n- Performance improvements\\n\\n## 1.0.0"
    )`,
  input_schema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The path of the file to edit.',
      },
      old_str: {
        type: 'string',
        description:
          'The string to replace. Please provide at least one line above and below to make it unique across the file. *This is required*',
      },
      new_str: {
        type: 'string',
        description: 'The new value of the string. *This is required*',
      },
    },
    required: ['file_path', 'old_str', 'new_str'],
  },
};

const grepTool: Tool = {
  name: 'grep',
  description: `Search for text patterns within files (equivalent to 'grep' command).

**Primary use cases:**
- Search for specific text, code patterns, or identifiers across files
- Find where functions, classes, or variables are defined or used
- Locate specific error messages or log statements
- Search within specific directories

**Examples:**
- Find function definition: grep(pattern="def process_data", search_directory=".")
- Find all TODO comments: grep(pattern="TODO", search_directory="src/")
- Case-insensitive search: grep(pattern="error", search_directory=".", case_insensitive=true)
- Find imports: grep(pattern="import.*requests", search_directory=".")

**Don't use this for:**
- Finding files by name (use find_files instead)
- Listing directory contents (use list_dir instead)

Searches recursively and respects .gitignore rules. Returns matching lines with file paths.
`,
  input_schema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'The text pattern or regular expression to search for',
      },
      search_directory: {
        type: 'string',
        description: 'The directory to search in (relative to repository root). Defaults to "."',
      },
      case_insensitive: {
        type: 'boolean',
        description: 'Whether to perform case-insensitive search. Defaults to false',
      },
    },
    required: ['pattern'],
  },
};

const shellCommandTool: Tool = {
  name: 'shell_command',
  description: `Execute a shell command in the current working directory.

This tool should be reserved for cases where specialized tools cannot accomplish the task.

**IMPORTANT:**
- Pay extra attention to correctly escape special characters

**Parameters:**
- command: The full shell command to execute (e.g., 'npm test', 'cp -v source.txt dest.txt')

**Examples:**
- Run tests: shell_command(command="npm test")
- Copy file: shell_command(command="cp -v source.txt dest.txt")
- Move file: shell_command(command="mv old.txt new.txt")
- Change permissions: shell_command(command="chmod +x script.sh")
- Chain commands: shell_command(command="npm install && npm run build")
`,
  input_schema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The full shell command to execute',
      },
    },
    required: ['command'],
  },
};

@Service({
  lifetime: ServiceLifetime.Singleton,
  dependencies: [
    Logger,
    ParsedCliInput,
    CredentialProvider,
    FileStateTracker,
    collection(WorkflowActionHandler),
    McpManager,
  ],
})
@Implements(Tools)
export class WorkflowTools implements Tools {
  #logger: Logger;

  #actionHandlers: WorkflowActionHandler[];

  #cliInput: ParsedCliInput;

  #credentialProvider: CredentialProvider;

  #fileStateTracker: FileStateTracker;

  #mcpManager: McpManager;

  #mcpTools: McpTool[] = [];

  #initPromise?: Promise<void>;

  constructor(
    logger: Logger,
    cliInput: ParsedCliInput,
    credentialProvider: CredentialProvider,
    fileStateTracker: FileStateTracker,
    actionHandlers: WorkflowActionHandler[],
    mcpManager: McpManager,
  ) {
    this.#logger = logger;
    this.#cliInput = cliInput;
    this.#credentialProvider = credentialProvider;
    this.#fileStateTracker = fileStateTracker;
    this.#actionHandlers = actionHandlers;
    this.#mcpManager = mcpManager;
  }

  tools = [
    listDirTool,
    readFileTool,
    writeFileTool,
    findFilesTool,
    mkdirTool,
    editFileTool,
    grepTool,
    shellCommandTool,
  ];

  async initialize(): Promise<void> {
    // If already initializing, wait for that to complete
    if (this.#initPromise) {
      this.#logger.debug('MCP tools initialization already in progress, waiting');
      return this.#initPromise;
    }

    // If already initialized successfully, skip
    if (this.#mcpTools.length > 0) {
      this.#logger.debug('MCP tools already initialized, skipping');
      return undefined;
    }

    // Start initialization and store the promise
    this.#initPromise = this.#doInitialize();

    try {
      await this.#initPromise;
    } finally {
      // Clear promise after completion (success or failure)
      // This allows retries if initialization failed
      this.#initPromise = undefined;
    }
    return undefined;
  }

  isMcpToolApprovedByConfig(toolName: string): boolean {
    return this.#mcpTools.some((t) => t.name === toolName && t.isApproved);
  }

  async #doInitialize(): Promise<void> {
    try {
      const mcpTools = await this.#mcpManager.reload(this.#cliInput.cwd);
      this.#mcpTools = [];

      for (const mcpTool of mcpTools) {
        try {
          const inputSchema = JSON.parse(mcpTool.inputSchema);
          this.#mcpTools.push(mcpTool);
          this.tools.push({
            name: mcpTool.name,
            description: mcpTool.description,
            input_schema: inputSchema,
          });
        } catch {
          this.#logger.warn(`Skipping MCP tool '${mcpTool.name}' due to invalid schema`);
        }
      }

      this.#logger.info(`Loaded ${this.#mcpTools.length} MCP tools`);
    } catch (error) {
      this.#logger.warn('Failed to load MCP tools', error);
    }
  }

  async executeTool(toolUse: ToolUseBlock): Promise<ToolResult> {
    this.#logger.info(`Tool input: ${JSON.stringify(toolUse.input)}`);

    const mcpTool = this.#mcpTools.find((t) => t.name === toolUse.name);
    if (mcpTool && this.#mcpManager) {
      try {
        const result = await this.#mcpManager.execute(toolUse.name, JSON.stringify(toolUse.input));
        return { result, error: undefined };
      } catch (error) {
        return {
          result: '',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    switch (toolUse.name) {
      case 'list_dir':
        return this.#executeListDir(toolUse);
      case 'read_file':
        return this.#executeReadFile(toolUse);
      case 'create_file_with_contents':
        return this.#executeWriteFile(toolUse);
      case 'find_files':
        return this.#executeFindFiles(toolUse);
      case 'mkdir':
        return this.#executeMkdir(toolUse);
      case 'edit_file':
        return this.#executeEditFile(toolUse);
      case 'grep':
        return this.#executeGrep(toolUse);
      case 'shell_command':
        return this.#executeShellCommand(toolUse);
      default:
        return { result: '', error: `Unknown tool: ${toolUse.name}` };
    }
  }

  #extractStringParam(toolUse: ToolUseBlock, paramName: string): string | null {
    if (typeof toolUse.input === 'object' && toolUse.input !== null && paramName in toolUse.input) {
      const value = (toolUse.input as Record<string, unknown>)[paramName];
      return typeof value === 'string' ? value : null;
    }
    return null;
  }

  #extractBooleanParam(toolUse: ToolUseBlock, paramName: string): boolean | null {
    if (typeof toolUse.input === 'object' && toolUse.input !== null && paramName in toolUse.input) {
      const value = (toolUse.input as Record<string, unknown>)[paramName];
      return typeof value === 'boolean' ? value : null;
    }
    return null;
  }

  async #buildWorkflowToken(): Promise<GenerateTokenResponse> {
    const credentials = await this.#credentialProvider.getCredentials();
    // FIXME: ideally we can refactor the underlying tool to not have direct dependency on full GenerateTokenResponse, so we
    // can avoid (a) type casting like this, or (b) setting a bunch of blank default values that aren't related to anthropic backend
    return {
      gitlab_rails: {
        base_url: credentials.baseUrl,
        token: credentials.token,
      },
    } as GenerateTokenResponse;
  }

  async #executeAction(action: WorkflowAction, logMessage: string): Promise<ToolResult> {
    this.#logger.info(logMessage);

    const handler = this.#actionHandlers.find((ah) => ah.canHandle(action));

    if (!handler) {
      throw new Error(`missing handler for action: ${logMessage}`);
    }

    const result = (await handler.execute(action, {
      workflowToken: await this.#buildWorkflowToken(),
      workflowId: '',
      fileStateTracker: this.#fileStateTracker,
      abortSignal: new AbortController().signal,
      workspaceFolderPath: this.#cliInput.cwd,
      workspaceFolderUri: URI.file(this.#cliInput.cwd).toString(),
    })) as PlainTextResponse;

    return {
      result: result.response,
      error: result.error || undefined,
    };
  }

  async #executeListDir(toolUse: ToolUseBlock): Promise<ToolResult> {
    const directory = this.#extractStringParam(toolUse, 'directory');

    if (!directory) {
      return {
        result: '',
        error: `Invalid or missing directory in tool input: ${JSON.stringify(toolUse.input)}`,
      };
    }

    type ListDirectoryAction = WorkflowActionOf<'listDirectory'>;
    const action: ListDirectoryAction = {
      requestID: '',
      listDirectory: {
        directory,
      },
    };

    return this.#executeAction(action, `Executing list dir action: ${directory}`);
  }

  async #executeReadFile(toolUse: ToolUseBlock): Promise<ToolResult> {
    const filePath = this.#extractStringParam(toolUse, 'file_path');

    if (!filePath) {
      return {
        result: '',
        error: `Invalid or missing file_path in tool input: ${JSON.stringify(toolUse.input)}`,
      };
    }

    type ReadFileAction = WorkflowActionOf<'runReadFile'>;
    const action: ReadFileAction = {
      requestID: '',
      runReadFile: {
        filepath: filePath,
      },
    };

    return this.#executeAction(action, `Executing read file action: ${filePath}`);
  }

  async #executeWriteFile(toolUse: ToolUseBlock): Promise<ToolResult> {
    const filePath = this.#extractStringParam(toolUse, 'file_path');
    const contents = this.#extractStringParam(toolUse, 'contents');

    if (!filePath || contents === null) {
      return {
        result: '',
        error: `Invalid or missing parameters in tool input: ${JSON.stringify(toolUse.input)}`,
      };
    }

    type WriteFileAction = WorkflowActionOf<'runWriteFile'>;
    const action: WriteFileAction = {
      requestID: '',
      runWriteFile: {
        filepath: filePath,
        contents,
      },
    };

    return this.#executeAction(action, `Executing write file action: ${filePath}`);
  }

  async #executeFindFiles(toolUse: ToolUseBlock): Promise<ToolResult> {
    const namePattern = this.#extractStringParam(toolUse, 'name_pattern');

    if (!namePattern) {
      return {
        result: '',
        error: `Invalid or missing name_pattern in tool input: ${JSON.stringify(toolUse.input)}`,
      };
    }

    type FindFilesAction = WorkflowActionOf<'findFiles'>;
    const action: FindFilesAction = {
      requestID: '',
      findFiles: {
        name_pattern: namePattern,
      },
    };

    return this.#executeAction(action, `Executing find files action: ${namePattern}`);
  }

  async #executeMkdir(toolUse: ToolUseBlock): Promise<ToolResult> {
    const directoryPath = this.#extractStringParam(toolUse, 'directory_path');

    if (!directoryPath) {
      return {
        result: '',
        error: `Invalid or missing directory_path in tool input: ${JSON.stringify(toolUse.input)}`,
      };
    }

    type MkdirAction = WorkflowActionOf<'mkdir'>;
    const action: MkdirAction = {
      requestID: '',
      mkdir: {
        directory_path: directoryPath,
      },
    };

    return this.#executeAction(action, `Executing mkdir action: ${directoryPath}`);
  }

  async #executeEditFile(toolUse: ToolUseBlock): Promise<ToolResult> {
    const filePath = this.#extractStringParam(toolUse, 'file_path');
    const oldStr = this.#extractStringParam(toolUse, 'old_str');
    const newStr = this.#extractStringParam(toolUse, 'new_str');

    if (!filePath || oldStr === null || newStr === null) {
      return {
        result: '',
        error: `Invalid or missing parameters in tool input: ${JSON.stringify(toolUse.input)}`,
      };
    }

    type EditFileAction = WorkflowActionOf<'runEditFile'>;
    const action: EditFileAction = {
      requestID: '',
      runEditFile: {
        filepath: filePath,
        oldString: oldStr,
        newString: newStr,
      },
    };

    return this.#executeAction(action, `Executing edit file action: ${filePath}`);
  }

  async #executeGrep(toolUse: ToolUseBlock): Promise<ToolResult> {
    const pattern = this.#extractStringParam(toolUse, 'pattern');
    const searchDirectory = this.#extractStringParam(toolUse, 'search_directory') || '.';
    const caseInsensitive = this.#extractBooleanParam(toolUse, 'case_insensitive') || false;

    if (!pattern) {
      return {
        result: '',
        error: `Invalid or missing pattern in tool input: ${JSON.stringify(toolUse.input)}`,
      };
    }

    type GrepAction = WorkflowActionOf<'grep'>;
    const action: GrepAction = {
      requestID: '',
      grep: {
        search_directory: searchDirectory,
        pattern,
        case_insensitive: caseInsensitive,
      },
    };

    return this.#executeAction(
      action,
      `Executing grep action: pattern=${pattern}, directory=${searchDirectory}`,
    );
  }

  async #executeShellCommand(toolUse: ToolUseBlock): Promise<ToolResult> {
    const command = this.#extractStringParam(toolUse, 'command');

    if (!command) {
      return {
        result: '',
        error: `Invalid or missing command in tool input: ${JSON.stringify(toolUse.input)}`,
      };
    }

    type RunShellCommandAction = WorkflowActionOf<'runShellCommand'>;
    const action: RunShellCommandAction = {
      requestID: '',
      runShellCommand: {
        command,
      },
    };

    return this.#executeAction(action, `Executing shell command: ${command}`);
  }
}
