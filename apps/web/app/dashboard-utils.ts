export type DashboardTarget = {
  id: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  runCount: number;
};

export type DashboardRun = {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  target: { id: string; url: string };
};

export function targetLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function targetsEmptyCopy(targetCount: number): string {
  return targetCount === 0
    ? 'Add your first website to begin building a reliable QA history.'
    : 'No recent runs have been recorded for these targets.';
}
