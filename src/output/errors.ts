export type ErrorCode =
  | 'INSTANCE_NOT_RUNNING'
  | 'INSTANCE_PORT_CONFLICT'
  | 'CERT_NOT_INSTALLED'
  | 'CERT_NOT_TRUSTED'
  | 'PROXY_NOT_ACTIVE'
  | 'RULE_CONFLICT'
  | 'RULE_VERIFY_FAILED'
  | 'NO_CAPTURE_MATCH'
  | 'CAPTURE_BACKEND_UNAVAILABLE'
  | 'PLUGIN_NOT_INSTALLED'
  | 'PLUGIN_CAPABILITY_UNAVAILABLE'
  | 'PLUGIN_INVALID_IDENTIFIER'
  | 'PLUGIN_REGISTRY_UNAVAILABLE'
  | 'PLUGIN_INSTALL_FAILED'
  | 'PLUGIN_UNINSTALL_FAILED'
  | 'PLUGIN_ENABLE_FAILED'
  | 'PLUGIN_DISABLE_FAILED'
  | 'PLUGIN_INSPECT_FAILED'
  | 'PERMISSION_REQUIRED'
  | 'USER_ACTION_REQUIRED'
  | 'UNSUPPORTED_OPERATION';

export interface ErrorDetails {
  code: ErrorCode;
  message: string;
  reason?: string;
  suggested_fix?: string;
}

export class CliError extends Error {
  public readonly details: ErrorDetails;
  public readonly cause?: unknown;

  constructor(details: ErrorDetails, cause?: unknown) {
    super(details.message);
    this.name = 'CliError';
    this.details = details;
    this.cause = cause;
  }

  static fromUnknown(err: unknown): CliError {
    if (err instanceof CliError) return err;
    if (err instanceof Error) {
      return new CliError(
        {
          code: 'UNSUPPORTED_OPERATION',
          message: err.message,
        },
        err,
      );
    }
    return new CliError({
      code: 'UNSUPPORTED_OPERATION',
      message: 'Unknown error',
      reason: typeof err === 'string' ? err : undefined,
    });
  }
}
