# CI、Release 与 Nightly

工作流参考 `tty7` 的交付方式，复用 Sparkle 的 Electron 打包脚本。普通提交运行检查，正式标签生成草稿，Nightly 更新预发布。以下说明适用于 `wsyangzy/sparkle`；工作流使用当前仓库名称，其他 fork 无需修改仓库地址。

| 入口          | 触发条件                                         | 结果                                                                                   |
| ------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `ci.yml`      | 任意分支 push、PR、手动执行，以及发布流程调用    | Actions/ShellCheck 检查、只读 lint、Windows/Linux/macOS 类型检查、测试与 Electron 编译 |
| `release.yml` | `vX.Y.Z` 或 `X.Y.Z` 标签 push                    | 检查、15 个安装包、统一校验、Draft Release；检查草稿后手动公开                         |
| `release.yml` | 手动执行，可选 `version`                         | 同样的检查与打包，仅保存 Actions artifacts，不创建标签或 Release                       |
| `nightly.yml` | 每天 18:00 UTC（北京时间次日 02:00），或手动执行 | 更新固定 `nightly` 标签和预发布，不成为 Latest                                         |
| `rolling.yml` | 手动执行                                         | 保留固定 `rolling` 标签及已有通道的兼容入口                                            |

原来的月底自动正式发版、版本回写默认分支和 push 自动发布 Rolling 已移除。AUR 保留独立入口，本流程不自动调用 AUR，也不需要 AUR SSH key、翻译 API 或额外 PAT。发布使用仓库自带的 `GITHUB_TOKEN`，只有发布 job 申请 `contents: write`。

## 产物与版本

- Windows x64 / arm64：NSIS 安装包、含 `PORTABLE` 标记的 7z，共 4 个包。
- macOS x64 / arm64：PKG，共 2 个包。
- Linux x64 / arm64 / loong64：DEB、RPM、Pacman，共 9 个包。
- 汇总时核对 15 个包的文件名与非空状态，拒绝缺包、额外文件和空包，再生成 `latest.yml`、`release.json`、`checksums.txt`，并验证 SHA-256。
- 每个矩阵 job 保存 `package-*` artifact；完整产物保存在 `release-bundle`，内含 `release-assets/` 和 `release-notes.md`，保留 14 天。
- 正式标签必须与源码 `package.json.version` 完全对应，例如 `1.27.0` 对应 `v1.27.0` 或 `1.27.0`。标签不会修改或提交源码版本。
- Nightly 使用下一 patch 的预发布版本，如 `1.26.10-nightly.20261015180000.123.1`。时间、运行序号和重试次数区分同一天的多次构建。
- 定时 Nightly 读取上次完成上传的 `release.json`；源码 SHA 相同则跳过，手动执行始终重新构建。
- 所有矩阵任务成功后才汇总并发布。更新预发布时先上传新的安装包，再替换更新清单，最后清理旧安装包。已公开的正式 Release 拒绝被重跑覆盖；已有草稿可以重试补齐。

打包保留已有签名设置：没有新增 Windows 签名或 macOS 公证，构建成功不等于各系统安装与启动已验收。

## 更新来源

Actions 构建通过 `SPARKLE_RELEASE_REPOSITORY` 将当前仓库写入主进程与渲染进程；更新检查、发布页面、下载和 GitHub SHA-256 查询使用同一个仓库。

正式构建与 Nightly 构建的现有 **Rolling** 更新选项指向本仓库 `nightly/latest.yml`，稳定选项指向本仓库最新公开正式版。显式运行 `rolling.yml` 的包，其 Rolling 选项继续指向 `rolling/latest.yml`。已有用户配置字段不变。

本地构建未指定环境变量时继续使用上游 `xishang0128/sparkle` 和 `rolling`。本地要生成 fork 的包，可在 PowerShell 中显式设置：

```powershell
Set-Location 'D:\workspace\code\clone_projects\sparkle'
$env:SPARKLE_RELEASE_REPOSITORY = 'wsyangzy/sparkle'
$env:SPARKLE_PRERELEASE_TAG = 'nightly'
pnpm build:win --x64
Remove-Item Env:SPARKLE_RELEASE_REPOSITORY, Env:SPARKLE_PRERELEASE_TAG
```

这些变量只影响本次 PowerShell 会话，移除后恢复默认；安装包写入 `dist/`，可能替换其中的同名文件。

## 启用与手动触发

先将工作流提交并推送到 GitHub。定时任务与手动入口要求相应工作流已存在于仓库默认分支；当前默认分支需在仓库 Settings 中确认。仅在功能分支新增 `nightly.yml` 不会启用定时任务。

在 fork 的 Actions 页面启用工作流后，可从页面选择分支执行。命令行方式需要安装 GitHub CLI 并完成 `gh auth login`。以下 PowerShell 示例假设工作流已经合入默认分支 `master`，且远端目标分支含有本次完整改动：

```powershell
Set-Location 'D:\workspace\code\clone_projects\sparkle'

# 仅检查，不发布。
gh workflow run ci.yml --repo wsyangzy/sparkle --ref master

# 打包并保存在 artifacts，不创建正式发布。
gh workflow run release.yml --repo wsyangzy/sparkle --ref master

# 构建并发布预发布，移动固定 nightly 标签并替换其产物。
gh workflow run nightly.yml --repo wsyangzy/sparkle --ref master

gh run list --repo wsyangzy/sparkle --limit 10
```

正式发版时，先将 `package.json.version` 改为新的 `X.Y.Z` 并完成正常提交、推送，再创建并推送对应版本标签。标签构建完成后到 Releases 检查草稿中的平台包、校验清单和下载表，再点击 Publish release。普通代码 push 只会运行 CI。

若检查或打包失败，不进入发布步骤，可修复后重跑。若需要回退已经公开的版本，先在 Releases 将问题版本设回草稿，再从历史 Release 下载上一版安装包；公开发布后的自动更新回退需要单独选择并发布正确的版本清单，不通过重跑覆盖已公开正式版。

## 本地检查

在项目根目录使用 Node.js 24、`package.json.packageManager` 固定的 pnpm 执行：

```powershell
pnpm lint:check
pnpm typecheck
pnpm test
pnpm build
go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.12
```

`pnpm build` 需要先完成 `pnpm prepare` 所下载的资源准备，仅编译 Electron 应用，不生成安装包。最后一条需要 Go；安装 ShellCheck 后还会检查内嵌 Bash。跨平台安装包、GitHub Release 写入、签名与实际应用升级应以远端运行和实际安装结果为准。
