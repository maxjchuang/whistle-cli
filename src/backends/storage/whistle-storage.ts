export interface WhistleStorageLocation {
  path: string;
  source: 'unknown';
}

export async function discoverWhistleStorage(): Promise<WhistleStorageLocation> {
  // Placeholder: real discovery will be implemented when rules/values are wired.
  return { path: '', source: 'unknown' };
}

