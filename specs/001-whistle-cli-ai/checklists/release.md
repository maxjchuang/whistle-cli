# Release/PR Quality Gate Checklist: Whistle AI CLI

**Purpose**: 作为 PR / Release 前的“需求与合同质量门禁”，用于检查 `spec.md`/`plan.md`/`tasks.md`/contracts 是否清晰、一致、可验收（测试的是“文档质量”，不是实现）。

**Created**: 2026-04-29

**Feature**: `specs/001-whistle-cli-ai/spec.md`

## Requirement Completeness

- [x] CHK001 是否为每个 FR-001..FR-020（尤其是 FR-002/013/015/016）定义了“可观察的输出/判定标准”，而不是停留在抽象表述？[Completeness, Spec FR-001..FR-020]
- [x] CHK002 是否明确列出了 v1 的“资源集合”与“动作集合”，并说明不在资源列表中的能力应如何走 `raw` 逃生口？[Completeness, Contracts `resource-commands.md`]
- [x] CHK003 是否明确说明了 `w2` 缺失时哪些资源必须失败、哪些可以 best-effort 降级（并给出一致的错误码与 next actions 方向）？[Completeness, Spec FR-013 + Quickstart Notes]
- [x] CHK004 是否定义了 multi-instance 的“默认实例”解析规则与冲突处理（例如：未指定时取当前默认实例）？[Completeness, Spec FR-001]
- [x] CHK005 是否为所有“会产生持久化变更”的动作定义了默认 scope（temporary vs persistent）与用户覆盖方式？[Completeness, Spec FR-016]

## Requirement Clarity

- [x] CHK006 是否把“AI 友好输出”落到了稳定字段/键（包括 error/next_actions/meta/effective/warnings）的明确约束上？[Clarity, Contracts `output-contract.md`]
- [x] CHK007 是否对 `preview -> apply -> verify` 的语义边界写清楚：什么时候可以只验证“后端接受”，什么时候必须验证“外部效果生效”？[Clarity, Contracts `resource-commands.md` + Plan Constraints]
- [x] CHK008 是否明确 `--rollback <action-id>` 的适用资源范围、best-effort 边界、以及失败时的可操作 next actions？[Clarity, Spec FR-015 + Contracts `resource-commands.md`]
- [x] CHK009 是否明确“blocked”状态的触发条件（例如需要用户信任证书/修改系统代理）与返回字段要求？[Clarity, Spec FR-013 + Contracts `output-contract.md`]
- [x] CHK010 是否对 capture/replay/frames 的 best-effort 与数据可用性假设（保留期、可访问性）有清晰描述，而不是仅举例？[Clarity, Spec FR-008..FR-011]

## Requirement Consistency

- [x] CHK011 术语是否一致：resources（instance/rules/values/captures/composer/frames/certs/proxy/plugins/doctor/raw）、以及 shortcut 与 resource 的关系是否在多个文档中一致？[Consistency, Spec + Contracts + README]
- [x] CHK012 `research.md` 的关键决策（例如 resources 是否包含 `mocks`）是否与 `contracts/` 的最终对外合同一致？[Consistency, `research.md` + `contracts/resource-commands.md`]
- [x] CHK013 Quickstart 的“验证序列”是否严格使用已定义的资源动作与 flags（避免出现文档命令漂移）？[Consistency, `quickstart.md` + Contracts]
- [x] CHK014 Workflow coverage matrix 的“Covered/Partial/Raw/Out of scope”口径是否与 spec 的范围边界一致（尤其是插件自定义动作 out-of-scope）？[Consistency, `workflow-coverage.md` + Spec FR-019]

## Acceptance Criteria Quality

- [x] CHK015 SC-008（macOS + Linux headless 验收）是否有清晰的可执行验收定义（哪些核心工作流必须覆盖、哪些算通过/失败）？[Measurability, Spec SC-008]
- [x] CHK016 对 SC-004/SC-005（“5 分钟完成启动”“2 分钟定位+回放”）是否写明测量前置条件（环境、数据集、计时方法），否则是否明确其为非 gate 指标？[Measurability, Spec SC-004/SC-005]
- [x] CHK017 是否明确“85% workflow 覆盖”如何计算（workflow 列表来源、计数口径、Partial 是否计入）？[Measurability, Spec SC-002 + `workflow-coverage.md`]

## Scenario Coverage

- [x] CHK018 是否覆盖了主流程：启动实例 → 代理/证书准备 → 规则/values 变更（PAV）→ 抓包查询 → 回放/编排 → 插件生命周期？[Coverage, Spec US1-US4]
- [x] CHK019 是否覆盖了异常流程：实例未运行、端口冲突、证书未信任、代理无权限、w2 缺失、runtime backend 不可用？[Coverage, Spec FR-013 + Edge Cases]
- [x] CHK020 是否覆盖了恢复流程：发生 partial apply/verify 失败时如何给出 next actions、何时建议 rollback、何时需要人工步骤？[Coverage, Spec FR-013 + FR-015]

## Edge Case Coverage

- [x] CHK021 是否定义了“跨实例引用”的行为（例如 capture id 属于非当前 instance 时如何提示/选择）？[Gap, Spec Edge Cases]
- [x] CHK022 是否定义了敏感信息处理策略（captures 中的 token/cookie/大 body 的脱敏或截断政策），或明确声明 out-of-scope？[Gap, Spec FR-018/Assumptions]
- [x] CHK023 是否定义了 long-running 操作（如 plugin install）在输出层的进度/超时表达（哪怕只是明确 out-of-scope）？[Gap, Plan Performance Goals]

## Non-Functional Requirements

- [x] CHK024 Plan 中的性能目标（1s/2s/5s/3s p95）是否在 spec 中以“可验收 NFR”形式出现，或明确其为非 gate 目标？[Clarity, Plan Performance Goals]
- [x] CHK025 是否明确“本机权限范围”对系统代理/证书信任的影响（哪些需要管理员权限、哪些只能 guidance），并与 blocked 机制一致？[Consistency, Spec FR-020 + FR-013]

## Dependencies & Assumptions

- [x] CHK026 是否明确依赖清单：Node 版本、`whistle/w2`、运行时能力（captures/replay/frames 的 backend 可用性）？[Completeness, Plan Technical Context + Quickstart]
- [x] CHK027 是否明确 raw 逃生口的使用边界（何时推荐 raw、何时禁止依赖 raw 才能完成“Covered”工作流）？[Clarity, Contracts `resource-commands.md` + `workflow-coverage.md`]

## Notes

- 勾选完成用 `[x]`，对失败项建议在条目后追加一句“缺口位置 + 最小修订建议”。

