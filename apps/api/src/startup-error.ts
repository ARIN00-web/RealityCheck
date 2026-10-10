export function startupErrorDetails(error: unknown): {
  errorType: string;
  errorCode?: string;
  message: string;
  stack?: string;
} {
  if (!(error instanceof Error)) {
    return { errorType: 'UnknownError', message: 'Unknown startup error' };
  }
  const systemError = error as NodeJS.ErrnoException;
  return {
    errorType: error.name,
    ...(systemError.code ? { errorCode: systemError.code } : {}),
    message: redactConnectionSecrets(error.message),
    ...(error.stack ? { stack: redactConnectionSecrets(error.stack) } : {}),
  };
}

function redactConnectionSecrets(value: string): string {
  return value.replace(/([a-z]+:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[REDACTED]@');
}
