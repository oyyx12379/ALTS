##ALTS / WIT

ALTS（ARKLINK Terminal Service）是一个面向《行于泰拉》TRPG 的在线跑团辅助平台。项目将角色卡、规则资料、地图编辑、实时房间、战术棋盘、掷骰、聊天与音乐控制整合在一个终端风格的 Web 界面中，适合线上或线下辅助跑团使用。

> 项目当前以 V1.2 角色卡、战斗职业表、源石技艺表和速查规则为主要数据来源。

## 项目亮点

- 角色卡全流程管理：创建、编辑、自动计算、Excel V1.2 导入与导出、立绘调整、公开分享。
- 规则资料集中查询：种族、文化、特质、战斗职业、源石技艺、感染系统与战斗速查。
- 多人实时房间：邀请码加入、角色绑定、成员权限、聊天、掷骰、跑团日志与房间存档。
- 战术棋盘：2D / 2.5D 视图、地图与场景图层、普通 TOKEN、Spine 动画 TOKEN、批量操作与快捷键。
- 地图编辑器：地形绘制、H0/H1 高度、模板保存与加载，可在房间中直接复用。
- 跑团辅助工具：PDF 规则书、可拖拽浮窗、背景音乐同步、背包与主持人道具库。
- 设备适配：响应式布局与低配模式，兼顾桌面端、平板和移动端使用体验。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React 19、TypeScript、Vite、React Router、Zustand、Axios |
| 交互与渲染 | Konva / React Konva、Pixi.js、Spine、Framer Motion、React PDF |
| 后端 | Node.js、Express、Socket.IO、JWT、bcryptjs、multer、xlsx |
| 数据层 | Prisma ORM、SQLite |
| 部署 | Express 单源站、Cloudflare Tunnel（可选） |

## 快速开始

### 环境要求

- Node.js 20 或更高版本
- npm

### 1. 安装依赖

```bash
cd client
npm install

cd ../server
npm install
```

### 2. 初始化数据库

```bash
cd server
npx prisma generate
npx prisma db push
```

如果需要将 Excel 规则数据写入规则库，可继续执行：

```bash
npm run db:seed
```

### 3. 启动开发服务

在两个终端分别运行：

```bash
# 终端一：后端，默认 http://localhost:3001
cd server
npm run dev
```

```bash
# 终端二：前端，默认 http://localhost:5173
cd client
npm run dev
```

Vite 已配置 `/api`、`/socket.io`、`/uploads` 和 `/pdf` 的本地代理，开发时无需额外配置跨域地址。

## 生产构建与部署

生产环境由 Express 同时提供 API、Socket.IO 和前端静态文件。

```bash
cd client
npm run build

cd ../server
npm run build
npm run start:prod
```

也可以使用 `deploy/start-production.ps1` 启动生产服务。部署前请根据 [`deploy/production.env.example`](deploy/production.env.example) 配置：

- `NODE_ENV=production`
- `PORT`：服务端口，默认 `3001`
- `PUBLIC_ORIGIN`：对外访问地址
- `JWT_SECRET`：生产环境必须替换为高强度随机字符串
- `CLIENT_DIST_PATH`：前端构建目录，通常为 `../client/dist`

Cloudflare Tunnel 的完整说明见 [`DEPLOYMENT.md`](DEPLOYMENT.md)。

## 目录结构

```text
WIT/
├─ client/                 React + Vite 前端
│  ├─ src/pages/           页面与路由级功能
│  ├─ src/components/      棋盘、角色卡、音乐、浮窗等组件
│  ├─ src/stores/          Zustand 全局状态
│  └─ public/              图片、音乐、PDF 及 Spine 资源
├─ server/                 Express + Prisma + Socket.IO 后端
│  ├─ src/routes/          REST API
│  ├─ src/socket/          房间实时事件
│  ├─ src/parsers/         Excel 规则与角色卡解析器
│  ├─ prisma/              数据模型与 SQLite 数据库
│  └─ excel-data/          规则 Excel 数据源
├─ deploy/                 生产启动、同步与 Tunnel 脚本
├─ WEBSITE_FEATURES.md     功能清单与使用流程
├─ PROJECT_ARCHITECTURE.md 架构与数据流说明
└─ PERMISSION_MODEL.md     房间权限模型说明
```

## 核心数据流

```text
React 前端
  ├─ REST API ─────── Express 路由 ─── Prisma / SQLite
  └─ Socket.IO ────── 房间事件 ─────── 实时同步棋盘、聊天、掷骰与音乐
```

角色卡 Excel 会先经过后端解析器归一化；常用字段写入结构化表，完整解析结果保存在 `rawData` 中，便于后续编辑、导出与规则扩展。

## 当前边界

- 地形效果已经支持编辑、保存和棋盘展示，但大多数效果暂不自动参与移动、伤害、抗性或状态结算，需要由玩家与 SN 按规则处理。
- 召唤物已预留角色卡数据接口，完整创建流程与房间行为仍在后续规划中。
- 房间音乐状态目前保存在服务端内存中，服务重启后不会恢复。
- 同时播放大量 Spine 动画 TOKEN 时，设备性能仍可能成为限制；低配模式可减少部分渲染开销。

## 文档索引

- [网站功能清单](WEBSITE_FEATURES.md)
- [项目架构与数据流](PROJECT_ARCHITECTURE.md)
- [部署指南](DEPLOYMENT.md)
- [GitHub 同步说明](deploy/GITHUB_SYNC.md)
- [房间权限模型](PERMISSION_MODEL.md)
- [客户端开发说明](client/README.md)

## 许可与素材

关于项目中使用到的SPINE小人动画，感谢项目：https://github.com/isHarryh/Ark-Models
项目中的规则内容、角色资料和部分视觉素材来源于对应作品及其社区资料。使用、发布或部署前，请确认相关内容符合原作者与素材授权方的许可要求。项目代码的许可证信息如未单独声明，则不应视为对第三方素材的授权。

