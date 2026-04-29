export interface PermissionHint {
  required: boolean;
  reason?: string;
  suggested_fix?: string;
}

function isRootLikeUser(): boolean {
  const getuid = (process as any).getuid as undefined | (() => number);
  if (!getuid) return false;
  return getuid() === 0;
}

export function permissionHintForCertTrust(): PermissionHint {
  if (process.platform === 'linux' && !isRootLikeUser()) {
    return {
      required: true,
      reason: '在 Linux 上把根证书加入系统信任通常需要 sudo/root 权限。',
      suggested_fix: '使用 sudo 执行系统信任更新命令（例如 Debian/Ubuntu: update-ca-certificates）。',
    };
  }
  return { required: false };
}

export function permissionHintForSystemProxySet(): PermissionHint {
  if (process.platform === 'darwin') {
    return {
      required: true,
      reason: '在 macOS 上修改系统代理可能触发权限/弹窗。',
      suggested_fix: '确保你有修改网络设置权限；必要时通过系统设置手动设置代理。',
    };
  }
  if (process.platform === 'win32') {
    return {
      required: true,
      reason: '在 Windows 上修改系统代理可能需要管理员权限或策略允许。',
      suggested_fix: '使用管理员权限运行或在系统设置中手动修改代理。',
    };
  }
  return { required: false };
}
