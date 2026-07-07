export interface Vulnerability {
  name: string;
  description: string;
  severity: string;
  location: {
    start_line: number;
    end_line: number;
    start_column: number;
    end_column: number;
  };
}

export type SecurityScanClientResponse = {
  filePath: string;
  status: number;
  timestamp: number;
  results?: Vulnerability[];
  error?: unknown;
};
