import JSZip from 'jszip';

/** Directories that never carry useful signal about what a project does. */
const IGNORED_DIRECTORIES = [
  'node_modules',
  '.git',
  'dist',
  '.next',
  'build',
  'out',
  'coverage',
  'vendor',
  '.venv',
  'venv',
  '__pycache__',
  '.turbo',
  '.cache',
  'target',
  '.idea',
  '.vscode',
  '__MACOSX',
];

/** File names that describe the project directly and are always worth reading. */
const PRIORITY_FILES = [
  'readme.md',
  'readme.txt',
  'package.json',
  'architecture.md',
  'design.md',
  'spec.md',
  'docker-compose.yml',
  'dockerfile',
  'pyproject.toml',
  'go.mod',
  'requirements.txt',
  'cargo.toml',
];

const CODE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.go',
  '.html',
  '.md',
  '.rs',
  '.java',
  '.rb',
  '.sql',
  '.yml',
  '.yaml',
];

/** Per-file cap so one huge bundle cannot swallow the whole context budget. */
const MAX_CHARS_PER_FILE = 6_000;
/** Total cap on the context string handed to Gemini. */
const MAX_TOTAL_CHARS = 180_000;

const NUL = String.fromCharCode(0);

export interface ExtractedFile {
  path: string;
  content: string;
  priority: boolean;
}

export interface ExtractionResult {
  contextString: string;
  fileCount: number;
  skippedCount: number;
  files: ExtractedFile[];
  truncated: boolean;
}

function isIgnored(path: string): boolean {
  const segments = path.split('/');
  return segments.some((segment) => IGNORED_DIRECTORIES.includes(segment.toLowerCase()));
}

function isPriority(path: string): boolean {
  const name = path.split('/').pop()?.toLowerCase() ?? '';
  return PRIORITY_FILES.includes(name);
}

function hasCodeExtension(path: string): boolean {
  const lower = path.toLowerCase();
  return CODE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function looksBinary(content: string): boolean {
  // A NUL byte in the first kilobyte is a reliable enough binary signal here.
  return content.slice(0, 1024).includes(NUL);
}

/**
 * Reads a .zip archive entirely in memory and merges the interesting files into
 * a single "Codebase Context String" for the language model.
 */
export async function extractCodebaseContext(
  archive: ArrayBuffer | Buffer | Uint8Array,
): Promise<ExtractionResult> {
  const zip = await JSZip.loadAsync(archive);
  const candidates: ExtractedFile[] = [];
  let skippedCount = 0;

  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const path = entry.name;
    const baseName = path.split('/').pop() ?? '';

    if (isIgnored(path) || baseName.startsWith('.')) {
      skippedCount += 1;
      continue;
    }

    const priority = isPriority(path);
    if (!priority && !hasCodeExtension(path)) {
      skippedCount += 1;
      continue;
    }

    let content: string;
    try {
      content = await entry.async('string');
    } catch {
      skippedCount += 1;
      continue;
    }

    if (looksBinary(content) || content.trim() === '') {
      skippedCount += 1;
      continue;
    }

    candidates.push({
      path,
      content:
        content.length > MAX_CHARS_PER_FILE
          ? `${content.slice(0, MAX_CHARS_PER_FILE)}\n... file truncated ...`
          : content,
      priority,
    });
  }

  // Priority documents first, then shallow files, so the most descriptive
  // material survives when the total budget is reached.
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    const depthDelta = a.path.split('/').length - b.path.split('/').length;
    if (depthDelta !== 0) return depthDelta;
    return a.path.localeCompare(b.path);
  });

  const chunks: string[] = [];
  const included: ExtractedFile[] = [];
  let totalChars = 0;
  let truncated = false;

  for (const file of candidates) {
    const chunk = `\n===== FILE: ${file.path} =====\n${file.content}\n`;
    if (totalChars + chunk.length > MAX_TOTAL_CHARS) {
      truncated = true;
      break;
    }
    chunks.push(chunk);
    included.push(file);
    totalChars += chunk.length;
  }

  const tree = candidates.map((file) => file.path).join('\n');
  const contextString = [
    '===== PROJECT FILE TREE =====',
    tree || '(no readable source files found)',
    '',
    ...chunks,
  ].join('\n');

  return {
    contextString,
    fileCount: included.length,
    skippedCount: skippedCount + (candidates.length - included.length),
    files: included,
    truncated,
  };
}
