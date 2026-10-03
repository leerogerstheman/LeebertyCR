/* 关于：项目说明、参考来源、免责声明 */

window.Views.register('about', function (root, ctx) {
  const App = ctx.app;
  const U = UI;

  root.appendChild(U.el('div', { class: 'page-head' }));
  const head = root.querySelector('.page-head');
  head.appendChild(U.el('h1', { text: '关于 LeebertyCR' }));
  head.appendChild(U.el('div', { class: 'intro', text: 'LeebertyCR（CRA/CRC 临床试验工作台）：本地运行的临床试验岗位辅助应用，蓝黑底哥特体 CR 为本应用标识。' }));

  root.appendChild(U.el('div', { class: 'card', html:
    '<div class="card-title">📦 这是什么</div>' +
    '<p style="margin:0">一个<b>本地运行</b>的临床试验岗位辅助应用，服务对象是药物临床试验中的<b>临床监查员（CRA）</b>与<b>临床协调员（CRC）</b>：<br><br>' +
    '· <b>理念课堂</b>：把 CRA/CRC 的定位、GCP 原则、ALCOA+ 数据完整性、受试者权益讲成大白话<br>' +
    '· <b>试验生命周期</b>：8 个阶段，每阶段「目的 / 谁做什么 / 产出什么 / 常见坑」<br>' +
    '· <b>岗位手册</b>：29 张任务卡，每张含「为什么 / 何时 / 怎么做 / 要点 / 红线 / 法规依据」<br>' +
    '· <b>核查清单</b>：10 张可勾选清单（启动访视、常规监查、SDV、关闭访视、知情同意、SAE、必备文件、中心评估、药物管理、CRC 访视循环），进度与备注保存在本机<br>' +
    '· <b>任务台</b>：个人待办管理，演示任务一键生成<br>' +
    '· <b>文件模板</b>：监查报告、随访信、SDRP 等 7 份工作文件骨架，一键复制<br>' +
    '· <b>法规速查</b>：ICH E6(R2)、NMPA GCP 2020 等要点卡片 + 常用时限表<br>' +
    '· <b>场景练习 / 案例学习 / 术语表</b>：检验理解、看真实问题处理、查术语' }));

  root.appendChild(U.el('div', { class: 'card', html:
    '<div class="card-title">🧠 内容与理念参照</div>' +
    '<p style="margin:0 0 8px"><b>法规与行业标准：</b></p>' +
    '<ul style="margin:0;padding-left:20px">' +
    '<li>ICH E6(R2)《药物临床试验质量管理规范》（GCP）——十三条原则、研究者/申办者职责、§4.8 知情同意、§5.18 监查、§8 必备文件</li>' +
    '<li>中国 NMPA《药物临床试验质量管理规范》(2020)</li>' +
    '<li>21 CFR Part 50 / 56 / 312（FDA 相关部分，美国监管语境）</li>' +
    '<li>世界医学会《赫尔辛基宣言》</li></ul>' +
    '<p style="margin:10px 0 8px"><b>工程与内容参照：</b></p>' +
    '<ul style="margin:0;padding-left:20px">' +
    '<li><a href="D:\\GxP-Workbench">D:\\GxP-Workbench</a>（GxP 合规工作台）：架构与 GCP 领域内容（知情同意事件流程、ICH E6(R2) 自查表、临床监查员身份模型）</li>' +
    '<li>网络同类项目：<a href="https://github.com/mikesaki-cpu/cra-monitoring-tool">cra-monitoring-tool</a>（CRA 现场监查工具）、<a href="https://github.com/crptojuson/clinical-recruitment-system">clinical-recruitment-system</a>（临床试验招募管理）、<a href="https://github.com/chi-university-of-manchester/openCDMS">openCDMS</a>（开源临床数据管理系统）、CTMS 类系统（临床试验管理系统）的模块划分思路</li></ul>' }));

  root.appendChild(U.el('div', { class: 'card', html:
    '<div class="card-title">⚙️ 技术实现</div>' +
    '<ul style="margin:0;padding-left:20px">' +
    '<li>零第三方依赖：Node.js 内置 http 模块 + 原生 JS 前端，断网可运行</li>' +
    '<li>登录与权限：账号库 + scrypt 口令 + 会话超时/失败锁定 + RBAC 权限矩阵（参照 GxP-Workbench）</li>' +
    '<li>电子签名：双要素（口令 + 一次性挑战码），21 CFR Part 11.200(a)(1)(i)</li>' +
    '<li>数据存储：<code>data/accounts.json</code>（账号）、<code>data/users/&lt;用户&gt;/state.json</code>（个人状态）、<code>data/records.json</code>（工作流记录）、<code>data/security.log</code>（安全日志只追加）；内容库在 <code>seed/*.json</code>（新增内容无需改代码）</li>' +
    '<li>桌面窗口：Edge 的 <code>--app</code> 模式（无地址栏的独立窗口），启动器为本地编译的 C# 单文件 exe</li>' +
    '<li>仅监听 127.0.0.1 本机端口（默认 8816），不对外暴露</li></ul>' }));

  root.appendChild(U.el('div', { class: 'card', html:
    '<div class="card-title">🗂 目录结构</div>' +
    '<pre style="font-size:12px;line-height:1.55;background:#f7f9fb;border-radius:8px;padding:12px;overflow-x:auto">' +
    'D:\\LeebertyCR\\' +
    '├─ start.bat / start-silent.bat / stop.bat   一键启动' +
    '├─ LeebertyCR.exe                            桌面启动器（可选构建）' +
    '├─ src\\server.js                            应用入口（HTTP + API）' +
    '├─ src\\auth.js                              认证 / 权限 / 双要素签名' +
    '├─ seed\\*.json                              知识库（11 个内容文件）' +
    '├─ web\\                                    前端（零依赖 SPA）' +
    '├─ scripts\\selfcheck.js                    自检脚本' +
    '├─ desktop\\Launcher.cs                     桌面启动器源码' +
    '├─ data\\                                   运行数据（账号 / 状态 / 记录 / 安全日志）' +
    '└─ docs\\                                   文档' +
    '</pre>' }));

  root.appendChild(U.el('div', { class: 'callout warn', html:
    '<b>重要声明：</b>本应用为<b>学习与工作辅助工具</b>，不是经过法规验证的临床试验系统（不替代 EDC/CTMS 等经验证的软件），内容不构成法规或医学建议。' +
    '实际执行请以现行生效法规、经批准的试验方案、伦理委员会要求与本单位 SOP 为准；所有时限信息务必与方案核对。' +
    '案例与演示数据均为虚构，仅用于教学。' }));

  root.appendChild(U.el('div', { class: 'card', html:
    '<div class="card-title">📈 数据统计与维护</div>' +
    '<p style="margin:0 0 8px">· 内容统计：' + App.content.lifecycle.phases.length + ' 个阶段 · ' +
    (App.content['cra-tasks'].tasks.length + App.content['crc-tasks'].tasks.length) + ' 张任务卡 · ' +
    App.content.checklists.checklists.length + ' 张清单 · ' +
    App.content.templates.templates.length + ' 份模板 · ' +
    App.content.quiz.questions.length + ' 道练习 · ' +
    App.content.cases.cases.length + ' 个案例 · ' +
    App.content.glossary.terms.length + ' 个术语 · ' +
    App.content.workflows.workflows.length + ' 条可执行工作流（' +
    App.content.workflows.workflows.reduce((n, w) => n + w.steps.length, 0) + ' 个步骤门）</p>' +
    '<p>备份方式：复制整个 <code>data</code> 目录即可。恢复方式：把备份的 state.json 放回 <code>data</code> 目录。</p>' }));
});