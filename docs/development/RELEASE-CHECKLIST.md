# DailyFlow 发布验收清单

## 1. 使用范围

本文用于 DailyFlow V1 的候选版本和正式版本发布。自动化工作流通过只代表构建、测试、签名和产物结构满足门禁，不能替代真实设备安装、数据保留和浏览器兼容验收。

发布工作流只创建草稿 GitHub Release。下列人工验收完成前，不得把草稿标记为正式版本，也不得创建或移动稳定版 tag 来绕过检查。

## 1.1 2026-11-04 本地 Windows 候选验收记录

本节只记录当前 Windows 候选构建在本地完成的验收，不代表正式 Release 已通过。产物来自提交 `ba775f7` 加当前工作区修复，尚未生成发布提交、tag 或 Draft Release。

- [x] 根包、桌面端、Web 端、Tauri 配置和 Cargo 包版本均为 `0.1.0`。
- [x] `pnpm install --frozen-lockfile` 通过，lockfile 未发生变化。
- [x] `pnpm test` 通过；脚本级测试 9/9，工作区各包的测试任务全部成功。
- [x] `pnpm typecheck`、`pnpm build`、`pnpm verify:artifacts` 和 `pnpm check:hardcoded-paths` 均通过。
- [x] Journal E2E 在 Chromium、Firefox、WebKit 各 4 项，共 12/12 通过；包含 URL 自动链接保存和重载保留。
- [x] 备份共享原始导入内容去重测试 12/12 通过；编辑器往返测试 4/4 通过。
- [x] 全量浏览器 E2E 在单 worker 下完成：48 passed、1 skipped、0 failed。跳过项仅为缺少 WebDriver 环境的 `windows-desktop` 打包应用启动测试。
- [x] Windows release 构建成功，生成可执行文件、MSI 和 NSIS 安装包。
- [x] 最终应用启动、主窗口标题、关闭主窗口和进程退出检查通过；重启后应用数据仍可读取。
- [x] 本地验收确认 13 篇日志、1 个附件、搜索索引 13/13、完整备份和恢复、NSIS 静默卸载及用户数据保留。
- [x] `cargo test` 49/49 通过，`cargo fmt --check` 通过。

当前 Windows 产物：

- `dailyflow-desktop.exe`：16,707,584 bytes，SHA-256 `ca7e8e3de57b00a85897da952ae149e074055f9a7aae67ce52f2f824a66feb10`
- `DailyFlow_0.1.0_x64_en-US.msi`：6,553,600 bytes，SHA-256 `ac129d8322be37c809fd3753dba3223b185d4a7d864af38988734489d0641ca5`
- `DailyFlow_0.1.0_x64-setup.exe`：4,940,014 bytes，SHA-256 `98122b92a916c0006c30eb80e99e4d485d80edc5214a1a1d6f3dd3c766510b7c`

当前明确未完成：

- [ ] Windows WebDriver 冒烟。本机缺少匹配的 `tauri-driver` 和 `msedgedriver`，全量 E2E 中该项被跳过。
- [ ] Windows Authenticode 签名及证书链验证。当前本地包未使用正式发布证书签名。
- [ ] macOS Intel 和 Apple Silicon 的真实安装、启动、升级及数据保留验收。
- [ ] macOS Developer ID 签名、Gatekeeper 和 Apple 公证。
- [ ] GitHub Release 工作流、Draft Release 下载、SHA-256 核对和覆盖升级验收。
- [ ] Chrome、Edge、Safari 正式稳定版矩阵验收。
- [ ] 发布提交、远程 push、tag、Draft Release 和正式 Release。

SQLite FTS 的当前分词边界仍需保留：单词和部分中文词可以命中，但完整中文短语及多词组合不能作为已保证能力对外宣称。

## 2. 版本与仓库准备

- [ ] `package.json`、Tauri 配置、Cargo 包和发布 tag 的版本一致。
- [ ] tag 使用 `v<semver>`，例如 `v0.1.0`；tag 指向通过 CI 的提交。
- [ ] `main` 工作区干净，提交已推送到 `git@github.com:xiaoweizano/DailyFlow.git`。
- [ ] `pnpm install --frozen-lockfile`、`pnpm test`、`pnpm build` 和 `pnpm verify:artifacts` 全部通过。
- [ ] 三个浏览器 E2E 和 Windows 桌面冒烟通过。
- [ ] GitHub `release` 和 `github-pages` environments 已配置必要保护规则。
- [ ] 发布和安装验收使用从 Release 下载的文件，不使用本地构建产物替代。

## 3. 签名与 Secrets

GitHub environment `release` 必须包含：

- [ ] `WINDOWS_CERTIFICATE_BASE64`：PFX 文件的 Base64 内容。
- [ ] `WINDOWS_CERTIFICATE_PASSWORD`：PFX 密码。
- [ ] `APPLE_CERTIFICATE`：Developer ID Application P12 的 Base64 内容。
- [ ] `APPLE_CERTIFICATE_PASSWORD`：P12 密码。
- [ ] `APPLE_SIGNING_IDENTITY`：完整 Developer ID Application 身份名称。
- [ ] `APPLE_ID`、`APPLE_PASSWORD`、`APPLE_TEAM_ID`：Apple 公证凭据。
- [ ] Secrets 只存放在受保护 environment；PR 和普通分支构建不能读取。
- [ ] 证书有效期、轮换负责人和吊销流程已记录，仓库中没有证书、私钥或密码。

Windows 自动检查：

- [ ] NSIS 安装包的 Authenticode 状态为 `Valid`。
- [ ] 时间戳服务可用，证书链在目标 Windows 版本可验证。
- [ ] 安装包包含 WebView2 缺失时的引导安装策略。

macOS 自动检查：

- [ ] Intel 包为 `x86_64`，Apple Silicon 包为 `arm64`。
- [ ] `codesign --verify --deep --strict` 通过。
- [ ] Gatekeeper `spctl` 通过。
- [ ] Apple 公证完成，`stapler validate` 对 App 和 DMG 均通过。
- [ ] 两个安装包分别使用对应架构的 Developer ID 签名。

## 4. 产物与哈希

- [ ] `release-desktop.yml` 的三个构建 job 全部成功。
- [ ] Release 包含 Windows x64 NSIS、macOS Intel DMG、macOS Apple Silicon DMG。
- [ ] Release 包含合并后的 `SHA256SUMS`，每个文件名和 SHA-256 均与下载文件一致。
- [ ] Windows 与两种 macOS 文件名包含正确版本和架构。
- [ ] 构建日志、诊断包和安装包中没有开发机绝对路径、私钥、SQLite 用户数据库或真实日志。
- [ ] Draft Release 的 release notes 没有敏感信息，并明确 V1 不包含云同步和账号系统。

## 5. Windows 安装验收

环境：真实 Windows 10 22H2 或 Windows 11 x64。

- [ ] 从 Draft Release 下载 NSIS 安装包并核对 SHA-256。
- [ ] 无 WebView2 或旧 WebView2 环境下，安装程序按配置提示/安装所需运行时。
- [ ] 安装目录、开始菜单和卸载入口正常，不要求管理员常驻运行。
- [ ] 首次启动创建应用数据目录、SQLite 数据库和附件目录。
- [ ] 新建今日日志、标题、列表、引用、代码块、图片、附件和链接可保存。
- [ ] 关闭应用后重新打开，正文、任务和附件仍存在。
- [ ] 导入包含 UTF-8、UTF-8 BOM、GBK 和异常文件名的 TXT 样本，预览、统计和重复检测正确。
- [ ] 搜索中文正文、代码和工作记录可以返回预期结果。
- [ ] 创建完整备份，修改数据后恢复，恢复结果与备份一致。
- [ ] 使用新安装包覆盖升级，数据库和附件保留，数据库迁移成功。
- [ ] 卸载程序不越界删除用户数据库、附件或用户导出的备份。

## 6. macOS 安装验收

分别在 Intel Mac 和 Apple Silicon Mac 的 macOS 12 或以上环境执行。

- [ ] 确认机器架构与 DMG 架构一致，并核对 SHA-256。
- [ ] 从浏览器下载后首次打开不被 Gatekeeper 阻止，不出现“应用已损坏”。
- [ ] 拖入 Applications、启动、退出和重新启动正常。
- [ ] 新建日志、编辑结构化内容、插入附件、自动保存和关闭重开正常。
- [ ] TXT 导入、中文搜索、备份和恢复正常。
- [ ] Intel 包只在 Intel 或真实受支持环境完成启动验收；编译成功不能替代安装启动。
- [ ] Apple Silicon 包在 arm64 环境完成同样验收。
- [ ] 覆盖升级保留数据库、附件和备份路径。
- [ ] 删除 App 不删除 Application Support 中的数据；卸载/清理说明与实际行为一致。
- [ ] 检查系统快捷键、文件选择器、长路径和中文文件名可用。

## 7. Web 发布验收

环境：Chrome 和 Edge 当前稳定版及前一个稳定版，Safari 当前稳定版。

- [ ] GitHub Pages 使用 `https://`，`/DailyFlow/` 资源和路由 basename 正确。
- [ ] 硬刷新、直接打开子路由和未知路由回退到 `404.html` 后可以启动。
- [ ] 生产 CSP 不包含 `unsafe-eval` 或开发 WebSocket origin。
- [ ] Chrome/Edge 最近两个稳定版完成启动、日志、搜索、导入、导出、备份和恢复。
- [ ] IndexedDB 在刷新、关闭重开和普通版本升级后保留数据。
- [ ] 配额不足、隐私模式和多标签页锁冲突有明确错误，不静默丢数据。
- [ ] Safari 当前稳定版完成启动、编辑、IndexedDB 保存、搜索和导出冒烟。
- [ ] Safari 不支持完整目录写入或目录选择时，明确降级到文件选择器和普通下载；不作为同级目录能力发布阻断项。
- [ ] 浏览器下载区提供 Web 数据包导入/导出路径，不承诺浏览器数据库与桌面 SQLite 直接互换。

## 8. 最终发布

- [ ] 上述自动和人工项目全部通过，失败项有明确修复记录。
- [ ] Draft Release 的签名、公证、哈希、文件大小和版本已复核。
- [ ] 发布负责人确认 V1 范围没有云同步、账号、多人协作或未批准的复杂能力。
- [ ] 将 Draft Release 标记为正式版本；如为候选版，保留明确的 pre-release 标记。
- [ ] 发布后再次从公开页面下载并抽检至少一个 Windows 包和一个 macOS 包。
- [ ] 归档本次版本、提交 SHA、tag、证书有效期和验收记录。
