export interface GitHubIssue {
  number: number;
  url?: string;
}

export interface Task {
  id: string;
  text: string;
  completed: boolean;
}

export type SessionStatus = 'idle' | 'busy' | 'waiting';

export interface Session {
  directory: string;
  directoryName: string;
  summary: string;
  status: SessionStatus;
  githubIssues: GitHubIssue[];
  tasks: Task[];
  createdAt: string;
  lastUpdated: string;
}
