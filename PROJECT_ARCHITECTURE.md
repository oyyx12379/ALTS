# WIT 项目结构与抽象层整理

## 1. 项目定位

当前项目是一个以“行于泰拉 / 明日方舟 TRPG”为主题的前后端分离 Web 应用。

主要能力包括：

- 用户注册、登录与 JWT 鉴权
- Excel 角色卡上传、解析、导入与编辑
- 规则书、职业、源石技艺、感染系统等规则数据查询
- 游戏房间创建、加入、角色绑定、聊天、掷骰
- Socket.IO 实时同步战斗地图、房间消息、房间音乐状态
- 前端提供角色卡展示、战斗棋盘、PDF 阅读器、音乐播放器、浮窗系统等交互界面

技术栈：

- 前端：React 19、Vite、React Router、Zustand、Axios、Socket.IO Client、Konva / React Konva、React PDF
- 后端：Express、Prisma、SQLite、Socket.IO、JWT、bcryptjs、multer、xlsx
- 数据源：SQLite 数据库、Excel 规则表、PDF 规则书、图片/字体/音乐素材

## 2. 根目录结构

```text
WIT/
├─ client/                         前端 React + Vite 应用
├─ server/                         后端 Express + Prisma + Socket.IO 应用
├─ LOGO/                           原始职业、精英化、技能、分支图标素材
├─ MAP/                            地图/营地图像素材
├─ ca/                             角色立绘素材
├─ 参考图/                         设计参考图
├─ The-font-of-Arknights-master/   字体资源
├─ *.xlsx                          根目录保留的原始规则/角色卡 Excel
├─ *.pdf                           根目录保留的规则 PDF
├─ temp_*.txt                      临时解析/调试输出
└─ PROJECT_ARCHITECTURE.md         本文档
```

说明：

- `client/public/` 中也复制了一批运行时静态资源，例如 `logo/`、`ca/`、`backgrounds/`、`music/`。
- `server/excel-data/` 是后端解析规则数据时实际使用的 Excel 数据目录。
- `server/pdf/` 是后端静态托管的 PDF 目录。
- `server/uploads/` 是角色卡上传后的落盘目录。
- `server/dist/` 是 TypeScript 编译产物，不属于主要源码。
- `server/node_modules/`、`client/node_modules/` 是依赖目录，不应进入结构判断或业务维护范围。

## 3. 前端结构

```text
client/
├─ src/
│  ├─ main.tsx                     React 挂载入口
│  ├─ App.tsx                      全局路由、登录态、主布局、浮窗容器
│  ├─ config.ts                    API / Socket / 静态资源地址配置
│  ├─ api/index.ts                 Axios 客户端与所有 REST API 封装
│  ├─ pages/                       页面级组件
│  ├─ components/                  可复用 UI / 功能组件
│  ├─ stores/                      Zustand 全局状态
│  ├─ types/                       前端领域数据结构与归一化逻辑
│  ├─ utils/                       资源路径与视觉辅助函数
│  ├─ music/                       前端内置音乐曲目配置
│  └─ styles/global.css            全局样式，当前体量最大
├─ public/                         运行时静态资源
├─ package.json
└─ vite.config.ts
```

### 3.1 前端页面层

`client/src/pages/`

- `Login.tsx`：登录/注册入口
- `Home.tsx`：登录后的首页
- `Characters.tsx`：角色卡列表、Excel 上传导入、立绘位置调整
- `CharacterDetail.tsx`：角色详情与编辑，包含大量角色规则计算和编辑 UI
- `Rooms.tsx`：房间列表、创建、加入
- `RoomDetail.tsx`：房间主界面，连接 Socket，承载战斗棋盘、聊天、掷骰、角色绑定、音乐同步
- `Rulebook.tsx`：规则数据浏览
- `QuickRef.tsx`：战斗速查
- `DiceRoller.tsx`：独立掷骰工具
- `BootMotionDemo.tsx`：动效/视觉 Demo

页面层目前承担的职责比较多，尤其是：

- `CharacterDetail.tsx` 约 1327 行，混合了规则常量、计算函数、弹窗组件、编辑状态、渲染逻辑。
- `RoomDetail.tsx` 同时管理 REST 数据加载、Socket 生命周期、战斗棋盘状态、聊天、掷骰、音乐控制。
- `Characters.tsx` 同时管理列表展示、导入流程、卡片视觉编辑。

### 3.2 前端组件层

`client/src/components/`

- `BattleBoard.tsx`：基于 Konva 的战斗棋盘，处理 token、地图图片、拖拽、裁切、网格等交互。
- `battleBoardState.ts`：战斗棋盘领域模型、默认值、归一化函数。
- `CharacterCardStructure.tsx`：角色卡结构化展示/编辑。
- `CharacterProfileCard.tsx`：角色资料卡视觉展示。
- `BackgroundMusic.tsx`：全局音频播放执行器。
- `MusicPlayer.tsx`：音乐播放器 UI。
- `FloatingWindow.tsx`：可拖拽/缩放浮窗容器。
- `PdfReader.tsx`：PDF 阅读器。
- `Sidebar.tsx`：主导航。
- `CursorTrail.tsx`：鼠标轨迹视觉效果。
- `LoginMusicControl.tsx`：登录页音乐控制。

组件层中已经有一些较好的局部抽象：

- `battleBoardState.ts` 把棋盘数据结构和归一化逻辑从 `BattleBoard.tsx` 中拆了出来。
- `CharacterProfileCard.tsx` 与 `CharacterCardStructure.tsx` 将角色视觉展示和结构信息展示从页面中抽离。
- `FloatingWindow.tsx` 配合 `stores/floatingWindows.ts` 形成一个独立的浮窗系统。

### 3.3 前端状态层

`client/src/stores/`

- `floatingWindows.ts`：管理浮窗打开/关闭、最小化、位置、大小、层级。
- `music.ts`：管理大厅/房间两种音乐上下文、播放状态、曲目、音量、房间 SN 控制权限。

`App.tsx` 中仍然直接使用本地 `useState` 管理登录用户，并读写 `localStorage`。

可以理解为当前前端状态分为三类：

- 本地页面状态：表单、编辑模式、弹窗、加载态等。
- 全局 UI 状态：浮窗、音乐。
- 持久认证状态：`localStorage.token` 与 `localStorage.user`，目前还未抽为独立 auth store。

### 3.4 前端 API 层

`client/src/api/index.ts`

集中封装了所有 REST 请求：

- Auth：`login`、`register`
- Characters：`getCharacters`、`getCharacter`、`updateCharacter`、`deleteCharacter`
- Upload：`uploadCharacterSheet`、`importCharacter`、`parseRules`
- Rooms：`getRooms`、`getRoom`、`createRoom`、`joinRoom`、`leaveRoom`、`bindCharacter`
- Rules：`getRulesRaces`、`getRulesCombatClasses`、`getRulesArts`、`getRulesTraits`、`getRulesInfection`

该层只做请求封装和 token 注入，不做领域数据转换。领域归一化主要散落在页面、组件、types 文件里。

## 4. 后端结构

```text
server/
├─ src/
│  ├─ index.ts                     Express / HTTP / Socket.IO 入口
│  ├─ middleware/auth.ts           JWT 鉴权中间件和 token 生成
│  ├─ routes/                      REST API 路由
│  ├─ socket/roomHandler.ts        房间实时事件、棋盘/音乐状态同步
│  ├─ parsers/                     Excel 解析器
│  ├─ excelParser.ts               Excel 解析器聚合导出与数据目录
│  └─ seed.ts                      从 Excel 种子化规则数据到 Prisma
├─ prisma/
│  ├─ schema.prisma                数据模型定义
│  └─ dev.db                       SQLite 数据库
├─ excel-data/                     后端解析用 Excel 数据源
├─ pdf/                            后端静态托管 PDF
├─ uploads/                        用户上传 Excel
├─ package.json
└─ tsconfig.json
```

### 4.1 后端入口层

`server/src/index.ts`

职责：

- 创建 Express app 和 HTTP server。
- 创建 Socket.IO server。
- 初始化 PrismaClient，并以 `export const prisma` 暴露给其他模块。
- 配置 Socket JWT 鉴权。
- 注册 Express 中间件。
- 静态托管 `/uploads` 与 `/pdf`。
- 挂载 REST 路由：
  - `/api/auth`
  - `/api/characters`
  - `/api/upload`
  - `/api/rules`
  - `/api/rooms`
- 提供 `/api/health`。

目前 `prisma` 从入口文件导出再被路由引用，属于简单可用的全局单例模式。

### 4.2 REST 路由层

`server/src/routes/`

- `auth.ts`：注册、登录、密码哈希、JWT 签发。
- `characters.ts`：当前用户角色列表、单角色详情、更新、删除。
- `upload.ts`：Excel 上传、角色卡解析、导入数据库、解析规则数据。
- `rules.ts`：规则数据查询，部分来自数据库，感染规则即时解析 Excel。
- `rooms.ts`：房间创建、查询、加入、退出、角色绑定、消息 REST fallback。

当前路由层同时承担：

- HTTP 参数校验
- 权限判断
- 业务流程编排
- Prisma 数据读写
- 部分领域计算
- 响应格式组装

也就是说，目前没有单独的 service 层或 repository 层，route handler 就是主要业务层。

### 4.3 Socket 实时层

`server/src/socket/roomHandler.ts`

负责事件：

- `room:join`：校验成员身份、加入 Socket room、下发成员列表、棋盘状态、音乐状态。
- `room:board:update`：校验成员后保存棋盘状态，并广播。
- `room:music:update`：仅 SN 或房主可控制房间音乐，并广播。
- `room:message`：写入房间消息并广播。
- `room:dice`：写入掷骰消息并广播。
- `room:leave` / `disconnect`：离开或断开连接。

内部维护两类内存缓存：

- `roomBoardStates`：房间棋盘状态缓存，同时会持久化到 `Room.boardState`。
- `roomMusicStates`：房间音乐状态缓存，目前只在内存中，不持久化到数据库。

### 4.4 Excel 解析层

`server/src/parsers/`

- `characterSheetParser.ts`：解析角色卡 Excel，包含主卡、属性、技能、战斗信息、感染、种族参数、特质库、下拉列表、战斗速查、立绘提取。
- `combatClassParser.ts`：解析战斗职业 Excel，输出职业、分支、数值算法、阶段天赋和技能。
- `artsParser.ts`：解析源石技艺 Excel，输出学派与法术。

`server/src/excelParser.ts` 作为聚合入口：

- 定义 `EXCEL_DIR`
- 提供 `getExcelFiles`
- 重新导出三个解析函数

`server/src/seed.ts` 使用这些解析器把规则数据写入 Prisma：

- `RuleRace`
- `RuleTrait`
- `RuleCombatClass`
- `RuleArt`

### 4.5 数据模型层

`server/prisma/schema.prisma`

核心模型可以分为四组：

认证与用户：

- `User`

角色卡：

- `Character`
- `CharacterAttribute`
- `CharacterSkill`
- `CharacterTrait`
- `CharacterArt`
- `CharacterCombat`
- `CharacterInfection`
- `CharacterEquipment`

规则库：

- `RuleRace`
- `RuleCulture`
- `RuleTrait`
- `RuleCombatClass`
- `RuleArt`

游戏房间：

- `Room`
- `RoomMember`
- `RoomMessage`

当前模型倾向于“结构化字段 + JSON 字符串”混合：

- 角色核心字段、属性、技能、战斗、感染拆成了关系表。
- `Character.rawData` 保存完整 Excel 解析结果 JSON。
- `RuleCombatClass.armors`、`RuleCombatClass.phases` 等使用 JSON 字符串。
- `Room.boardState` 使用 JSON 字符串保存棋盘状态。

## 5. 当前抽象层总览

```text
用户浏览器
  ↓
React 页面层
  - pages/*
  - 管理页面状态、表单、视图组合、用户操作
  ↓
前端组件层
  - components/*
  - 战斗棋盘、角色卡、浮窗、音乐、PDF、导航等可复用 UI
  ↓
前端状态与 API 层
  - stores/*
  - api/index.ts
  - config.ts
  ↓ REST / Socket.IO
后端入口层
  - index.ts
  ↓
后端路由层 / 实时事件层
  - routes/*
  - socket/roomHandler.ts
  ↓
数据访问与解析
  - Prisma Client
  - parsers/*
  ↓
持久化与静态资源
  - SQLite dev.db
  - excel-data/
  - uploads/
  - pdf/
  - public assets
```

## 6. 主要业务数据流

### 6.1 登录与鉴权

```text
Login.tsx
  -> api.login / api.register
  -> server/routes/auth.ts
  -> bcrypt 校验或哈希
  -> Prisma User
  -> generateToken
  -> 前端保存 token/user 到 localStorage
```

后续 REST 请求由 Axios interceptor 自动带上：

```text
Authorization: Bearer <token>
```

Socket 连接时通过：

```text
io(SOCKET_URL, { auth: { token } })
```

后端在 `index.ts` 的 `io.use` 中校验 JWT。

### 6.2 角色卡导入

```text
Characters.tsx
  -> uploadCharacterSheet(file)
  -> server/routes/upload.ts
  -> multer 落盘到 server/uploads
  -> parseCharacterSheet(filePath)
  -> 返回预解析结果和 fileName

Characters.tsx
  -> importCharacter(fileName)
  -> parseCharacterSheet(filePath)
  -> Prisma 创建 Character 及 attributes/skills/combat/infection
  -> 返回 character
```

特点：

- Excel 解析结果完整保存到 `Character.rawData`。
- 常用字段拆到关系表用于查询和编辑。
- 立绘会从 Excel 内嵌图片提取成 base64 data URL，进入 rawData。

### 6.3 角色卡查看与编辑

```text
CharacterDetail.tsx
  -> getCharacter(id)
  -> server/routes/characters.ts
  -> Prisma Character include 子表
  -> 前端本地编辑
  -> updateCharacter(id, data)
  -> 后端更新 Character、属性、战斗、感染、技能、特质
```

特点：

- 前端承担大量角色规则计算和 UI 归一化。
- 后端主要负责持久化和基础派生字段，例如感染阶段。

### 6.4 规则数据

```text
seed.ts
  -> parseCharacterSheet / parseCombatClasses / parseArtsData
  -> 写入 RuleRace / RuleTrait / RuleCombatClass / RuleArt

Rulebook.tsx / QuickRef.tsx / CharacterDetail.tsx
  -> api rules functions
  -> server/routes/rules.ts
  -> Prisma 读取规则表，或即时解析感染系统
```

### 6.5 房间与战斗棋盘

```text
Rooms.tsx
  -> createRoom / joinRoom / getRooms
  -> server/routes/rooms.ts
  -> Prisma Room / RoomMember

RoomDetail.tsx
  -> getRoom(roomId)
  -> 建立 Socket 连接
  -> emit room:join
  -> server/socket/roomHandler.ts
  -> 下发 members / board_state / music_state

BattleBoard.tsx
  -> onChange(nextBoardState)
  -> RoomDetail.tsx emit room:board:update
  -> 后端 sanitize + 保存 Room.boardState
  -> 广播 room:board_state
```

### 6.6 房间聊天与掷骰

```text
RoomDetail.tsx
  -> emit room:message / room:dice
  -> server/socket/roomHandler.ts
  -> Prisma RoomMessage
  -> io.to(room).emit room:message
```

同时 `routes/rooms.ts` 提供 `/messages` REST fallback。

### 6.7 音乐同步

```text
MusicPlayer / BackgroundMusic / useMusic
  -> RoomDetail.tsx dispatchRoomMusic
  -> emit room:music:update
  -> server/socket/roomHandler.ts
  -> 校验 SN / 房主权限
  -> 更新内存 roomMusicStates
  -> 广播 room:music_state
```

注意：房间音乐状态目前不落库，后端重启会丢失。

## 7. 抽象层现状评价

已经形成的抽象：

- 前后端物理分离清晰：`client/` 与 `server/`。
- 前端有基本页面层、组件层、API 层、Zustand store 层。
- 后端有入口层、路由层、中间件、Socket 模块、Excel parser 模块、Prisma schema。
- 战斗棋盘状态已有独立类型和 normalize 逻辑。
- 角色卡 rawData 已有前端 `types/characterCard.ts` 负责解析、归一化、写回。
- Excel 解析器按数据源分为角色卡、职业、源石技艺三类。

目前比较薄的抽象：

- 后端缺少 service 层：路由直接写业务逻辑和 Prisma 操作。
- 后端缺少 repository / data access 层：数据库访问散落在路由和 Socket handler。
- 前端页面偏厚：`CharacterDetail.tsx`、`BattleBoard.tsx`、`global.css` 都已超过千行。
- 前后端共享类型缺失：REST 响应、角色卡、房间、棋盘、音乐状态类型各自定义，容易漂移。
- 规则计算分散：感染阶段、技能上限、技能流派等逻辑在前后端存在重复或散落。
- 错误文案和部分中文内容出现乱码，说明源码编码或历史转换存在问题。
- 配置管理较简单：JWT_SECRET 有默认硬编码，生产环境需要更严格的 env 配置。

## 8. 建议的下一步整理方向

优先级 1：整理“厚页面”

- 从 `CharacterDetail.tsx` 拆出：
  - `characterRules.ts`：属性、技能、感染、流派计算
  - `CharacterBasicSection.tsx`
  - `CharacterSkillSection.tsx`
  - `CharacterInfectionSection.tsx`
  - `OptionPickerModal.tsx`
  - `TraitPickerModal.tsx`
- 从 `BattleBoard.tsx` 拆出：
  - `TokenNode.tsx`
  - `AssetNode.tsx`
  - `GridLayer.tsx`
  - `TokenCropModal.tsx`
  - `battleBoardPermissions.ts`

优先级 2：补后端 service 层

建议新增：

```text
server/src/services/
├─ authService.ts
├─ characterService.ts
├─ roomService.ts
├─ ruleService.ts
└─ uploadService.ts
```

路由只负责 HTTP 输入输出，service 负责业务流程，Prisma 调用集中到 service 或进一步拆 repository。

优先级 3：统一领域类型与规则计算

建议新增：

```text
client/src/domain/
├─ character/
├─ room/
├─ battleBoard/
└─ rules/
```

或建立共享包：

```text
shared/
├─ types/
└─ rules/
```

用于放置：

- `BoardState`
- `RoomMusicState`
- `CharacterCardVNext`
- 感染阶段计算
- 技能上限计算
- 通用 normalize 函数

优先级 4：资源与数据目录规范化

建议长期结构：

```text
assets-source/        原始素材：LOGO、MAP、ca、参考图、字体
client/public/        前端运行时需要的静态资源
server/excel-data/    后端规则解析用 Excel
server/pdf/           后端托管 PDF
docs/                 项目文档
```

优先级 5：编码和文本治理

- 检查源码文件编码，统一为 UTF-8。
- 修复乱码中文文案和注释。
- 避免将乱码继续写入数据库种子数据。

## 9. 一句话架构总结

这是一个“React 前端重交互 + Express 后端轻服务 + Excel 规则解析 + Prisma/SQLite 持久化 + Socket.IO 房间实时同步”的 TRPG 工具应用。当前功能已经形成完整闭环，但抽象层仍偏“页面/路由直接承载业务”，下一阶段最值得做的是拆厚页面、补 service 层、统一领域类型与规则计算。
