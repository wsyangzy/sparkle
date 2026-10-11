# Sparkle

<h3 align="center">Another <a href="https://github.com/MetaCubeX/mihomo">Mihomo</a> GUI</h3>

<p align="center">
  <a href="https://github.com/xishang0128/sparkle/releases/latest"><img src="https://img.shields.io/github/v/release/xishang0128/sparkle?label=latest"></a>
  <a href="https://github.com/xishang0128/sparkle/releases/tag/rolling"><img src="https://img.shields.io/badge/-rolling-orange"></a>
  <a href="https://t.me/+y7rcYjEKIiI1NzZl"><img src="https://img.shields.io/badge/Telegram-Group-blue?logo=telegram"></a>
</p>

## 特性

- [x] 开箱即用，无需服务模式的 Tun
- [x] 多种配色主题可选，UI 焕然一新
- [x] 支持大部分 Mihomo 常用配置修改
- [x] 内置稳定版和预览版 Mihomo 内核
- [x] 通过 WebDAV 一键备份和恢复配置
- [x] 强大的覆写功能，任意修订配置文件
- [x] 深度集成 Sub-Store，轻松管理订阅

## 自定义订阅 DNS 接管

此分支在“订阅管理 → 编辑信息”中增加 **当前订阅不接管 DNS**，本地和远程订阅均可设置。

- 默认关闭，沿用应用的全局“接管 DNS 设置”。已有订阅无需迁移。
- 开启后，仅此订阅跳过应用的 DNS 和 hosts 合并及 DNS 清理，保留订阅和覆写生成的配置。订阅信息中的 `disableDnsControl` 会随订阅更新保留。
- 保持全局接管开启，即可让 MESL 等指定订阅使用专属 DNS 覆写，其他订阅继续使用应用的公共 DNS。全局接管关闭时，所有订阅仍不接管。
- 保存当前使用的订阅会重启内核并立即生效；其他订阅在切换使用时生效。此选项不删除应用保存的公共 DNS 和 hosts 设置。
- 不接管时侧栏 DNS 模块保留并置灰，开关显示关闭，不可操作或点击切换页面，悬停可查看原因。开启虚拟网卡时，接管中的 DNS 保持启用且不可关闭，仍可进入 DNS 设置页面。此选项控制应用是否覆盖 DNS 配置，不改变 TUN 或系统 DNS 的设置方式。
- DNS 和 Sub-Store 入口的显示方式由“应用设置 → 侧边栏设置”控制，关闭功能不会自动隐藏入口。Sub-Store 关闭时模块置灰且不可点击，悬停提示可在应用设置中开启；点击禁用模块不会切换右侧内容。

关闭订阅中的此选项并保存，即可恢复遵循全局接管设置。专属 DNS 覆写应只绑定到对应订阅；全局覆写仍按原顺序执行。

## 开发

本项目为自用，绝大部分 pr 可能都不会合并，你可以自行 fork 修改。

### 环境要求

- **Node.js**: >= 20.0.0 (推荐使用 LTS 版本)
- **pnpm**: >= 9.0.0 (必需)
- **Git**: 最新版本

### 技术架构

Sparkle 基于 Electron + React + TypeScript 构建

#### 前端技术栈

- **React 19** - 用户界面框架
- **TypeScript** - 类型安全的 JavaScript
- **HeroUI (NextUI)** - UI 组件库
- **Tailwind CSS** - 原子化 CSS 框架
- **Monaco Editor** - 代码编辑器

#### 后端技术栈

- **Electron** - 应用主进程
- **Mihomo Core** - 代理内核
- **sysproxy-go** - 系统代理集成

### 快速开始

1. **克隆项目**

```bash
git clone https://github.com/xishang0128/sparkle.git
cd sparkle
```

2. **安装依赖**

```bash
pnpm install
```

3. **处理 Electron 安装问题**（如果遇到 pnpm dev 等命令无法成功运行）

```bash
# 如果 Electron 没有正确安装，执行以下命令
cd node_modules/electron
node install.js
cd ../..
```

4. **启动开发服务器**

```bash
pnpm dev
```

### 注意事项

windows 开发时可能会出现页面白屏，关闭 tun（虚拟网卡）即可

### 项目结构

```
sparkle/
├── src/
│   ├── main/               # Electron 主进程
│   │   ├── core/           # 内核管理
│   │   ├── config/         # 配置管理
│   │   ├── resolve/        # 解析器
│   │   ├── sys/            # 系统集成
│   │   └── utils/          # 工具函数
│   ├── renderer/           # Electron 渲染进程（前端界面）
│   │   ├── src/
│   │   │   ├── assets/     # 静态资源
│   │   │   ├── components/ # React 组件
│   │   │   ├── pages/      # 页面组件
│   │   │   ├── hooks/      # 自定义 hooks
│   │   │   ├── routes/     # 路由配置
│   │   │   └── utils/      # 前端工具
│   │   └── index.html      # 渲染进程入口 HTML
│   ├── preload/            # Electron 预加载脚本（进程间通信桥梁）
│   │   ├── index.ts        # 预加载脚本主文件
│   │   └── index.d.ts      # 预加载脚本类型定义
│   └── shared/             # 共享资源
│       └── types           # 全局类型定义
├── resources/              # 应用资源文件
├── build/                  # 构建配置
├── extra/                  # 额外资源
├── dist/                   # 构建输出目录
├── electron-builder.yml    # 打包配置
├── package.json            # 项目配置
└── README.md               # 项目说明
```

### 可用脚本

#### 开发命令

- `pnpm dev` - 启动开发服务器（前端热重载，后端需要手动重启）
- `pnpm typecheck` - TypeScript 类型检查
- `pnpm typecheck:node` - 主进程类型检查
- `pnpm typecheck:web` - 渲染进程类型检查
- `pnpm test:profile-dns` - 验证按订阅接管 DNS、配置切换与订阅更新（隔离临时配置，不启动内核）
- `pnpm lint` - 运行代码检查
- `pnpm format` - 格式化代码

#### 构建命令

- `pnpm build:win` - 构建 Windows 版本
- `pnpm build:mac` - 构建 macOS 版本
- `pnpm build:linux` - 构建 Linux 版本

#### 其他命令

- `pnpm prepare` - 下载构建所需的内核、启动辅助程序及其他资源，可通过 `--x64` 或 `--arm64` 指定目标架构
- `pnpm postinstall` - 安装 Electron 依赖

### 构建发布

#### 环境准备

根据目标平台准备相应的构建环境：

**Windows 构建：**

在 Windows 环境的项目根目录中依次执行，确认每一步成功后再继续：

```bash
pnpm install
pnpm prepare
pnpm build:win
```

`pnpm prepare` 会下载内核和辅助资源到 `extra/`，默认使用当前 Node.js 的架构。执行前确认环境变量 `SKIP_PREPARE` 未设置为 `1`；如果下载失败，应先处理错误并重新执行，资源准备成功后再打包。

`pnpm build:win` 只执行编译和打包，不会自动补齐缺失的资源。即使 `pnpm dev` 能打开窗口，也需要确认以下文件已存在：

- `extra/files/sparkle-run.exe`
- `extra/files/sparkle-service.exe`
- `extra/sidecar/mihomo.exe`
- `extra/sidecar/mihomo-alpha.exe`

**macOS 构建：**

```bash
pnpm build:mac
```

**Linux 构建：**

```bash
pnpm build:linux
```

**Linux 系统内核构建：**

```bash
export SPARKLE_SYSTEM_CORE=1
# 可选：默认值为 /usr/bin/sparkle-service
export SPARKLE_SYSTEM_SERVICE=/usr/bin/sparkle-service
pnpm install
pnpm build:linux
```

`SPARKLE_SYSTEM_CORE=1` 默认使用 `/usr/bin/mihomo`，也可指定绝对路径；服务默认使用 `/usr/bin/sparkle-service`。

此模式不下载或打包外部资源，也不引用项目的 pre/postinstall（electron-builder 默认脚本除外）。资源由发行版拆分包提供；服务仅保留连接和初始化，生命周期交由 init 系统管理。

**指定架构：**

Windows 的资源准备架构必须与打包架构一致；切换架构时需要重新执行 `pnpm prepare`。按目标架构选择对应命令：

```bash
# Windows x64
pnpm prepare --x64
pnpm build:win --x64

# Windows ARM64
pnpm prepare --arm64
pnpm build:win --arm64

pnpm build:mac --arm64/--x64
pnpm build:linux --x64/--arm64
```

**指定产物类型：**

```bash
pnpm build:win 7z/nsis
pnpm build:linux deb/rpm/pacman
pnpm build:mac pkg/dmg
```

**指定架构和产物类型：**

```bash
pnpm prepare --x64
pnpm build:win 7z --x64
pnpm build:mac pkg --arm64
pnpm build:linux deb --x64
```

#### 构建产物

- **Windows**: `.exe` 安装包和 `.7z` 便携版
- **macOS**: `.pkg` 安装包
- **Linux**: `.deb`、`.rpm`、`.pkg.tar.zst(pacman)` 等格式

Windows 产物位于 `dist/`。安装前检查 `dist/win-unpacked/resources/`，其中应包含 `files/sparkle-run.exe`、`files/sparkle-service.exe`、`sidecar/mihomo.exe` 和 `sidecar/mihomo-alpha.exe`。资源缺失时应重新准备并打包，不要继续使用该安装包。

### 常见问题

#### Windows 安装后无法打开，但开发模式正常

先检查安装目录的 `resources/files/` 和 `resources/sidecar/` 是否包含上述启动辅助程序及内核。安装版会在创建窗口前使用 `sparkle-run.exe` 准备提权启动；缺少该文件时可能直接退出，而 `pnpm dev` 会跳过这段提权流程，因此开发窗口能打开并不能证明安装包完整。

如果资源缺失，按“构建发布”中的 Windows 步骤重新执行 `pnpm prepare` 和 `pnpm build:win`，指定架构时保持两者一致。确认新产物包含所需资源后，再使用新安装包安装并验证启动。

#### 包管理器要求

本项目使用 pnpm 作为包管理器。

确保使用 pnpm 9.0.0 或更高版本：

```bash
pnpm --version
```

#### Node.js 版本要求

确保使用 Node.js 20.0.0 或更高版本：

```bash
node --version
```

#### 开发环境问题

- 确保 Node.js 版本 >= 20.0.0
- 使用 pnpm 进行依赖管理

### 贡献指南

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

### 开发注意事项

- 请确保代码通过 ESLint 检查
- 提交前运行 `pnpm format` 格式化代码
- 遵循现有的代码风格和命名规范
- 添加新功能时请更新相关文档
- 主进程代码修改后需要重启开发服务器
- 渲染进程代码支持热重载
- 所有命令都使用 pnpm 执行
- 修改类型定义后需要重启 TypeScript 服务
- 预加载脚本修改后需要重启应用

## Star History

<a href="https://www.star-history.com/?repos=xishang0128/sparkle&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=xishang0128/sparkle&type=date&theme=dark&legend=top-left&sealed_token=8SxlRPbsElPsEs9Q_QZ1jaPSZ9Q5E8UAgzHopZ03eHbfFl-j7100-bjDDbbBm8YN5oxxkqEZ_9Mhx7Xc1wnzSyI9pduKkTQReWJaOyZnN3Q38CBRuQlYnDo4kkx7ExoYdyzZgiZo9_IAMeuRLxPozFwu-clyQSZ9oSxBvD8Ldxe8TzMJeY7x-onoQY7Y" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=xishang0128/sparkle&type=date&legend=top-left&sealed_token=8SxlRPbsElPsEs9Q_QZ1jaPSZ9Q5E8UAgzHopZ03eHbfFl-j7100-bjDDbbBm8YN5oxxkqEZ_9Mhx7Xc1wnzSyI9pduKkTQReWJaOyZnN3Q38CBRuQlYnDo4kkx7ExoYdyzZgiZo9_IAMeuRLxPozFwu-clyQSZ9oSxBvD8Ldxe8TzMJeY7x-onoQY7Y" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=xishang0128/sparkle&type=date&legend=top-left&sealed_token=8SxlRPbsElPsEs9Q_QZ1jaPSZ9Q5E8UAgzHopZ03eHbfFl-j7100-bjDDbbBm8YN5oxxkqEZ_9Mhx7Xc1wnzSyI9pduKkTQReWJaOyZnN3Q38CBRuQlYnDo4kkx7ExoYdyzZgiZo9_IAMeuRLxPozFwu-clyQSZ9oSxBvD8Ldxe8TzMJeY7x-onoQY7Y" />
 </picture>
</a>
