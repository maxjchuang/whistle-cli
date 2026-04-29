import { CertificateService } from '../domain/certificate-service';
import { InstanceService } from '../domain/instance-service';
import { ProxyService } from '../domain/proxy-service';
import { CliError } from '../output/errors';

export interface DoctorCheckResult {
  status: 'ok' | 'blocked' | 'warning' | 'error';
  summary: string;
  details?: unknown;
  next_actions?: Array<{ action: string; reason?: string }>;
  error?: CliError;
}

export class SystemDoctor {
  private readonly instances: InstanceService;
  private readonly certs: CertificateService;
  private readonly proxy: ProxyService;

  constructor(deps?: { instances?: InstanceService; certs?: CertificateService; proxy?: ProxyService }) {
    this.instances = deps?.instances ?? new InstanceService();
    this.certs = deps?.certs ?? new CertificateService();
    this.proxy = deps?.proxy ?? new ProxyService();
  }

  async instanceStatus(instanceId?: string): Promise<DoctorCheckResult> {
    const st = await this.instances.status(instanceId);
    if (st.status !== 'running') {
      return {
        status: 'blocked',
        summary: 'Whistle 未运行',
        details: st,
        next_actions: [
          { action: 'instance start', reason: '启动 Whistle 实例' },
          { action: 'raw w2 status', reason: '查看底层 w2 输出以进一步诊断' },
        ],
      };
    }
    return { status: 'ok', summary: 'Whistle 正在运行', details: st };
  }

  async proxyRouting(instanceId?: string): Promise<DoctorCheckResult> {
    const st = await this.instances.status(instanceId);
    const expectedHost = st.host;
    const expectedPort = st.port;
    const ps = await this.proxy.status(expectedHost, expectedPort, instanceId);
    if (!ps.active) {
      const next_actions: DoctorCheckResult['next_actions'] = [];
      if (ps.mode === 'env') {
        next_actions.push({ action: 'proxy set', reason: '输出环境变量设置指引' });
      } else {
        next_actions.push({ action: 'proxy set', reason: '尝试设置系统代理到 Whistle' });
      }
      next_actions.push({ action: 'proxy verify', reason: '验证当前代理路由是否生效' });
      return {
        status: 'blocked',
        summary: '代理未路由到目标 Whistle 实例',
        details: ps,
        next_actions,
      };
    }
    return { status: 'ok', summary: '代理路由正常', details: ps };
  }

  async httpsCapture(instanceId?: string): Promise<DoctorCheckResult> {
    const inst = await this.instanceStatus(instanceId);
    if (inst.status !== 'ok') return inst;

    const running = await this.instances.status(instanceId);
    const certStatus = await this.certs.status({ host: running.host, port: running.port });
    if (!certStatus.installed) {
      return {
        status: 'blocked',
        summary: '未检测到 Whistle Root CA',
        details: certStatus,
        next_actions: [
          { action: 'certs install', reason: '生成/导出 Root CA' },
          { action: 'certs guide', reason: '查看各平台信任指引' },
        ],
      };
    }

    const trust = await this.certs.verifyTrusted();
    if (trust.trusted) {
      return {
        status: 'ok',
        summary: 'HTTPS 抓包前置条件看起来已满足',
        details: { certStatus, trust },
      };
    }

    const guide = this.certs.trustGuide(certStatus.downloaded_root_ca_path ?? certStatus.root_ca_path ?? null);
    return {
      status: 'blocked',
      summary: 'Root CA 已可获取，但系统/设备信任需要人工步骤',
      details: {
        ...certStatus,
        trust,
        guide,
      },
      next_actions: [
        { action: 'certs guide', reason: '按平台完成信任步骤后再验证' },
        { action: 'certs verify', reason: '重新检查证书信任状态' },
      ],
    };
  }
}
