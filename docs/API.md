# LeebertyCR 本地 API 参考

LeebertyCR 的桌面窗口（原生 WinForms）与备用网页界面都通过本机 HTTP JSON API 与本引擎通信。
接口**仅监听 `127.0.0.1`**（默认端口 8816），不对外网开放。

- 认证：登录后服务端下发 `cra_sid`（HttpOnly + SameSite=Strict）会话 Cookie；除公开接口外均需携带。
- 错误格式统一：`{ "error": "人类可读信息", "code": "MACHINE_CODE" }`；逻辑核查类错误额外带 `violations: []`。
- 角色来自**登录会话**，不接受请求参数传入（服务端强制，防越权）。

## 状态码约定

| 状态码 | 含义 | 典型场景 |
|---|---|---|
| 200 / 201 | 成功 / 已创建 | |
| 400 | 参数或业务校验失败 | 必填缺失、枚举非法、逻辑核查未通过 |
| 401 | 未登录或会话失效 | |
| 403 | 角色/权限不允许 | 角色门、职责分离、权限不足 |
| 404 | 对象不存在 | |
| 409 | 状态冲突 | 记录已终态、非法状态流转、编号重复 |
| 428 | 需要电子签名 | 签名步骤未提供签名要素 |

## 一、公开接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查：`{ok, app, appEn, version, node}` |
| GET | `/api/auth/meta` | 角色、权限矩阵与安全策略 |
| GET | `/api/auth/me` | 当前登录用户（未登录返回 `user: null`） |
| POST | `/api/auth/login` | 登录 `{username, password}`；失败计数与锁定 |
| POST | `/api/auth/logout` | 退出并吊销会话 |
| POST | `/api/auth/first-admin` | 首次初始化管理员（仅当无任何账号时可用） |

## 二、认证与安全

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/challenge` | 签发一次性签名验证码（120 秒、单次使用，21 CFR Part 11.200(a)(1)(i) 要素 B） |
| POST | `/api/auth/password` | 修改本人密码 `{currentPassword, newPassword}` |
| GET | `/api/audit?limit=` | 安全日志：`{entries, chain:{ok,count,brokenAt,error}}`（需 `audit.view`） |

**审计哈希链**：`data/audit-chain.jsonl` 每行含 `seq / ts / prev / hash`，`hash = HMAC-SHA256(密钥, prev + 规范化载荷)`，密钥存放在链文件之外（`data/audit-chain.key`）。
命令行校验：`node scripts/verify-audit.js`（链断裂时退出码 1 并给出断点 seq）。

## 三、用户与权限（管理员）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/users` | 用户列表 |
| POST | `/api/users` | 新建用户（生成临时口令，首次登录需改密） |
| POST | `/api/users/:name/status` | 启用 / 停用 |
| POST | `/api/users/:name/reset-password` | 重置口令 |
| DELETE | `/api/users/:name` | 删除用户 |

## 四、个人状态

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/state` | 读取当前用户状态（清单勾选 / 任务 / 练习记录 / 阅读进度） |
| PUT | `/api/state` | 局部更新（仅白名单键：`role, learnerName, checklists, tasks, quiz, read`） |

状态按用户隔离存放于 `data/users/<用户名>/state.json`。

## 五、内容库

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/content` | 全部只读知识库（11 个 seed 文件 + 表单定义） |

## 六、工作流（记录引擎）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/records?status=&type=` | 记录列表 + 各流程统计 |
| POST | `/api/records` | 新建记录 `{type, values}` |
| GET | `/api/records/:key` | 记录详情（步骤、表单数据、历史、定义） |
| POST | `/api/records/:key/step` | 完成步骤 `{code, values, sign?}` |
| POST | `/api/records/:key/cancel` | 取消记录 `{reason}`（≥5 字） |
| DELETE | `/api/records/:key` | 删除记录（**仅管理员**，用于清理训练数据） |
| POST | `/api/records/seed-demo` | 重新生成演示记录（仅管理员） |
| GET | `/api/records/:key/versions` | 版本历史列表 |
| GET | `/api/records/:key/versions/:n` | 重建某一版本快照（含内容 sha256） |

### 步骤完成的五道门（服务端顺序校验）

1. **RECORD_TERMINAL**（409）记录已终态，不可再推进
2. **STEP_OUT_OF_ORDER**（409）步骤顺序不符
3. **ROLE_NOT_PERMITTED**（403）当前角色不在该步骤允许角色内
4. **INDEPENDENCE_VIOLATION**（403）独立复核步骤要求执行者 ≠ 记录提出人
5. **SIGNATURE_REQUIRED**（428）/ 签名要素校验 → 之后再做 **STEP_FIELDS_MISSING**（400）字段校验

签名请求体：

```json
{
  "code": "assess_impact",
  "values": { "...": "..." },
  "sign": {
    "username": "demo_pi",
    "password": "登录口令（要素 A：标识码 + 口令）",
    "nonce": "一次性验证码（要素 B）",
    "reason": "签名含义的原因",
    "agreed": true
  }
}
```

## 七、受试者登记册 / 访视 / eCRF（P1）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/subjects?status=&site=&search=` | 列表 + 中心 + 入组统计（漏斗、按月、失败率） |
| POST | `/api/subjects` | 登记受试者 `{subjectNo, site, protocolCode, consentDate, note, status}` |
| GET | `/api/subjects/:id` | 详情（含访视与绑定表单） |
| PUT | `/api/subjects/:id` | 修改状态 / 备注 / 退出原因 |
| DELETE | `/api/subjects/:id` | 删除（仅管理员） |
| POST | `/api/subjects/:id/visits` | 登记访视 `{name, plannedDate, window, formId}` |
| PUT | `/api/subjects/:id/visits/:vid` | 录入 eCRF 数据 `{data, status}` —— **逻辑核查不通过返回 400 + violations** |
| DELETE | `/api/subjects/:id/visits/:vid` | 删除访视（CRC 或管理员） |
| GET | `/api/subjects/upcoming?days=` | 临期 / 逾期访视 |
| GET | `/api/subjects/forms` | eCRF 表单定义 |
| POST | `/api/subjects/seed-demo` | 重新生成演示受试者（仅管理员） |

**伪匿名约束**：受试者编号必须为 3–6 位数字；填姓名或身份证号会被 400 拒绝（`SUBJECT_NO_INVALID`）。

**逻辑核查类型**：`required` 必填、`number` 数值、`range` 范围、`enum` 枚举、`date` 格式、`cross_field` 跨字段矛盾。

## 八、eTMF / ISF 文档（P2）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/documents` | 文档台账 + 必需文件清单 + 状态统计 |
| POST | `/api/documents` | 建档 `{title, category, owner, reviewDueDate, location}` |
| GET | `/api/documents/:id` | 详情（版本链 + 允许的下一步流转） |
| POST | `/api/documents/:id/transition` | 状态流转 `{to, comment}` |
| DELETE | `/api/documents/:id` | 删除（仅管理员） |
| GET | `/api/documents/gaps` | 缺口扫描（缺失 / 无已批准版本 / 就绪度） |
| POST | `/api/documents/seed-demo` | 重新生成演示文档（仅管理员） |

**生命周期**：`draft → review → approved → superseded → archived`（非法跳转 409；`approved` 要求批准人 ≠ 建档人，否则 403）。

## 九、导出

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/export/checklists/:id.csv` | 核查清单（含当前用户勾选状态与提示） |
| GET | `/api/export/records.csv` | 记录台账 |
| GET | `/api/export/record/:key.csv` | 单条记录（步骤 + 历史 + 版本号） |
| GET | `/api/export/sae/:key.txt` | SAE 报送稿草稿（由 SAE-TRACK 记录预填） |
| GET | `/api/export/odm.xml` | CDISC ODM 1.3.2 XML（受试者 + 访视 eCRF 数据） |
| GET | `/api/export/sas.csv` | SAS 友好 CSV（一条受试者一行） |
| GET | `/api/subjects/calendar.ics` | 访视日历（iCalendar，可导入 Outlook / Google 日历） |

CSV 均为 UTF-8 **带 BOM**（便于 Excel 直接打开中文）；返回头 `Content-Disposition: attachment`。

## 十、约定与限制

- 所有数据存于 `data/`（JSON），原子写入（临时文件 + rename）；备份即复制该目录。
- 单机单用户会话模型：同一时刻一个会话上下文；多账号共享同一套记录（GxP 的职责分离靠**切换账号**实现）。
- 本引擎为**教学与本地演练**用途，未做生产级并发控制、数据加密与监管验证（IQ/OQ/PQ）；真实临床试验数据不得使用本工具承载。
