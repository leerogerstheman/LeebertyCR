using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;

/*
 * Views.cs - LeebertyCR 原生视图（一）：登录、首页、理念课堂、试验生命周期、
 * 岗位手册、核查清单、任务台。全部原生控件，零浏览器依赖。
 */

namespace LeebertyCR
{
    public static partial class Views
    {
        public static readonly Font F = new Font("Microsoft YaHei UI", 9.5f);
        public static readonly Font FB = new Font("Microsoft YaHei UI", 9.5f, FontStyle.Bold);
        public static readonly Font FS = new Font("Microsoft YaHei UI", 8.5f);
        public static readonly Font FM = new Font("Cascadia Mono", 9f);
        static readonly Color BLUE = Color.FromArgb(13, 30, 60);
        static readonly Color MUT = Color.FromArgb(92, 107, 122);
        static readonly Color TEAL = Color.FromArgb(15, 118, 110);

        public static string RoleLabel(Host h, string role)
        {
            var roles = Json.D(Json.G(h.Meta, "roles"));
            var r = Json.D(Json.G(roles, role));
            string zh = r != null ? Json.S(r, "labelZh") : "";
            return zh.Length > 0 ? zh : role;
        }

        public static Label Title(string t, string sub)
        {
            var wrap = new Panel { Dock = DockStyle.Top, Height = 58, Padding = new Padding(0, 4, 0, 0) };
            var l1 = new Label { Text = t, Font = new Font("Microsoft YaHei UI", 15f, FontStyle.Bold), AutoSize = true, Location = new Point(2, 2) };
            wrap.Controls.Add(l1);
            var l2 = new Label { Text = sub, Font = FS, ForeColor = MUT, AutoSize = true, Location = new Point(2, 34) };
            wrap.Controls.Add(l2);
            return null;
        }

        /// <summary>视图分发：main 面板按导航键切换原生视图。</summary>
        public static void Show(MainWin win, Host h, string key, Panel p)
        {
            switch (key)
            {
                case "home": ShowHome(h, p); break;
                case "learn": ShowLearn(h, p); break;
                case "lifecycle": ShowLifecycle(h, p); break;
                case "cra": ShowHandbook(h, p, "cra"); break;
                case "crc": ShowHandbook(h, p, "crc"); break;
                case "checklists":
                    {
                        string sel = h.Arg;
                        h.Arg = "";
                        ShowChecklists(h, p, sel);
                        break;
                    }
                case "workflow": ShowWorkflow(h, p); break;
                case "subjects": ShowSubjects(h, p); break;
                case "documents": ShowDocuments(h, p); break;
                case "tasks": ShowTasks(h, p); break;
                case "templates": ShowTemplates(h, p); break;
                case "regs": ShowRegs(h, p); break;
                case "quiz": ShowQuiz(h, p); break;
                case "cases": ShowCases(h, p); break;
                case "glossary": ShowGlossary(h, p); break;
                case "security": ShowSecurity(h, p); break;
                default: ShowAbout(h, p); break;
            }
        }

        public static GroupBox Box(string t)
        {
            var g = new GroupBox { Text = t, Font = FB, Dock = DockStyle.Top, Padding = new Padding(10, 6, 10, 8), Height = 90 };
            return g;
        }

        public static Label Lab(string t, Font f, Color c)
        {
            return new Label { Text = t, Font = f ?? F, ForeColor = c, AutoSize = true, MaximumSize = new Size(1180, 0) };
        }

        public static Button Btn(string t, EventHandler h, bool primary)
        {
            var b = new Button { Text = t, AutoSize = true, Font = F, BackColor = primary ? BLUE : Color.White, ForeColor = primary ? Color.White : Color.Black, FlatStyle = FlatStyle.Flat, Padding = new Padding(8, 3, 8, 3) };
            if (primary) b.FlatAppearance.BorderColor = BLUE;
            else b.FlatAppearance.BorderColor = Color.FromArgb(200, 208, 218);
            b.Click += h;
            return b;
        }

        /* ---------- P0：导出与打印辅助（原生） ---------- */

        public static string ToCsvText(List<string[]> rows)
        {
            var sb = new System.Text.StringBuilder();
            sb.Append('\uFEFF');
            bool first = true;
            foreach (var row in rows)
            {
                if (!first) sb.Append("\r\n");
                for (int i = 0; i < row.Length; i++)
                {
                    if (i > 0) sb.Append(',');
                    string v = row[i] ?? "";
                    if (v.IndexOfAny(new[] { ',', '"', '\n', '\r' }) >= 0)
                        sb.Append('"').Append(v.Replace("\"", "\"\"")).Append('"');
                    else
                        sb.Append(v);
                }
                first = false;
            }
            return sb.ToString();
        }

        public static void SaveTextFile(Host h, string title, string defaultName, string content)
        {
            var dlg = new SaveFileDialog { Title = title, FileName = defaultName, Filter = "文本/CSV (*.csv)|*.csv|所有文件 (*.*)|*.*", AddExtension = true };
            if (dlg.ShowDialog(h.Win) == DialogResult.OK)
            {
                try
                {
                    System.IO.File.WriteAllText(dlg.FileName, content, new System.Text.UTF8Encoding(true));
                    MessageBox.Show("已导出：" + dlg.FileName, "LeebertyCR", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                catch (Exception ex)
                {
                    MessageBox.Show("导出失败：" + ex.Message, "LeebertyCR", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            }
        }

        public static void PrintReport(Host h, string header, List<string> lines)
        {
            var doc = new System.Drawing.Printing.PrintDocument();
            doc.DocumentName = header;
            doc.PrintPage += delegate(object s, System.Drawing.Printing.PrintPageEventArgs e)
            {
                float y = e.MarginBounds.Top;
                var titleFont = new Font("Microsoft YaHei UI", 12f, FontStyle.Bold);
                var font = new Font("Microsoft YaHei UI", 9.5f);
                float lineH = font.GetHeight(e.Graphics) + 2;
                e.Graphics.DrawString(header, titleFont, Brushes.Black, e.MarginBounds.Left, y);
                y += 24;
                int printed = 0;
                int max = (int)(e.MarginBounds.Height / lineH);
                bool more = false;
                foreach (string l in lines)
                {
                    if (printed >= max) { more = true; break; }
                    e.Graphics.DrawString(l, font, Brushes.Black, e.MarginBounds.Left, y);
                    y += lineH;
                    printed++;
                }
                e.HasMorePages = more;
            };
            try
            {
                var dlg = new System.Windows.Forms.PrintDialog { Document = doc, UseEXDialog = true };
                if (dlg.ShowDialog(h.Win) == DialogResult.OK) doc.Print();
            }
            catch (Exception ex)
            {
                MessageBox.Show("打印失败：" + ex.Message, "LeebertyCR", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        public static DataGridView Dgv(params string[] cols)
        {
            var g = new DataGridView
            {
                ReadOnly = true,
                AllowUserToAddRows = false,
                AllowUserToDeleteRows = false,
                RowHeadersVisible = false,
                AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
                BackgroundColor = Color.White,
                BorderStyle = BorderStyle.FixedSingle,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect,
                Font = F,
                AutoSizeRowsMode = DataGridViewAutoSizeRowsMode.AllCells,
            };
            foreach (string c in cols)
            {
                var col = new DataGridViewTextBoxColumn { HeaderText = c, AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill, FillWeight = 100 };
                g.Columns.Add(col);
            }
            return g;
        }

        public static void AddRow(DataGridView g, params string[] cells) { g.Rows.Add(cells); }

        public static FlowLayoutPanel Flow(FlowDirection dir)
        {
            var f = new FlowLayoutPanel { FlowDirection = dir, WrapContents = true, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, Margin = new Padding(0) };
            return f;
        }

        public static void LoadContent(Host h)
        {
            if (h.Content != null) return;
            var c = Json.D(h.Api.Get("/api/content"));
            h.Content = c;
        }

        public static void Fetch(Host h, Func<object> work, Action<object> ok, Action<string> err)
        {
            Safe.Fetch(work, ok, err);
        }

        static void Mute(Label l, string t) { l.Text = t; l.ForeColor = MUT; }

        static void Fail(Label l, string t) { l.Text = t; l.ForeColor = Color.FromArgb(185, 28, 28); }

        /* ============================================================ 登录 = */

        public static void ShowLogin(MainWin win, Host h, Panel p)
        {
            p.Controls.Clear();
            var col = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 5, ColumnCount = 1, Padding = new Padding(60, 30, 60, 20) };
            col.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            col.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            col.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            col.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            col.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

            // 品牌标题
            var brand = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink };
            var mark = new Label { Text = "CR", Font = new Font("Old English Text MT", 34f, FontStyle.Bold), ForeColor = Color.FromArgb(244, 247, 250), BackColor = BLUE, AutoSize = true, Padding = new Padding(14, 6, 14, 10), TextAlign = ContentAlignment.MiddleCenter };
            mark.BackColor = Color.FromArgb(16, 34, 71);
            brand.Controls.Add(mark);
            brand.Controls.Add(new Label { Text = "LeebertyCR", Font = new Font("Microsoft YaHei UI", 20f, FontStyle.Bold), AutoSize = true });
            brand.Controls.Add(new Label { Text = "CRA/CRC 临床试验工作台 · 本地运行 · 原生应用窗口", Font = FS, ForeColor = MUT, AutoSize = true });
            col.Controls.Add(brand, 0, 0);

            // 演示身份
            var demo = new FlowLayoutPanel { FlowDirection = FlowDirection.LeftToRight, WrapContents = true, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, Padding = new Padding(0, 8, 0, 0) };
            string[] personas = { "demo_cra|CRA 临床监查员", "demo_crc|CRC 临床协调员", "demo_pi|主要研究者", "demo_qa|QA 专员", "admin|系统管理员" };
            TextBox uinput = null, pinput = null; Label errbox = null;
            foreach (string ps in personas)
            {
                string[] parts = ps.Split('|');
                string uname = parts[0];
                var b = new Button { Text = parts[1], Font = F, AutoSize = true, FlatStyle = FlatStyle.Flat, Padding = new Padding(10, 6, 10, 6) };
                b.Click += delegate { if (uinput != null) { uinput.Text = uname; pinput.Focus(); } };
                demo.Controls.Add(b);
            }
            if (h.Meta != null && Json.B(h.Meta, "builtinEnabled") == false)
            {
                demo.Controls.Add(Lab("（未启用内置演示账号：请在下方创建第一个管理员）", FS, Color.FromArgb(180, 83, 9)));
            }
            col.Controls.Add(demo, 0, 1);

            // 登录表单
            var formPanel = new TableLayoutPanel { AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, ColumnCount = 3, Width = 640 };
            formPanel.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            formPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            formPanel.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            formPanel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            formPanel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            formPanel.RowStyles.Add(new RowStyle(SizeType.AutoSize));

            formPanel.Controls.Add(Lab("用户名", F, Color.Black), 0, 0);
            uinput = new TextBox { Font = F, Width = 260 };
            formPanel.Controls.Add(uinput, 1, 0);
            formPanel.SetColumnSpan(uinput, 2);

            formPanel.Controls.Add(Lab("口令", F, Color.Black), 0, 1);
            pinput = new TextBox { Font = F, Width = 260, UseSystemPasswordChar = true };
            formPanel.Controls.Add(pinput, 1, 1);
            var loginBtn = new Button { Text = "登录", Font = FB, BackColor = BLUE, ForeColor = Color.White, FlatStyle = FlatStyle.Flat, AutoSize = true, Padding = new Padding(14, 5, 14, 5) };
            formPanel.Controls.Add(loginBtn, 2, 1);

            errbox = new Label { Font = F, ForeColor = Color.FromArgb(185, 28, 28), AutoSize = true, MaximumSize = new Size(620, 0) };
            errbox.Visible = false;
            formPanel.Controls.Add(errbox, 0, 2);
            formPanel.SetColumnSpan(errbox, 3);

            // 安全策略说明
            string pol = "";
            if (h.Meta != null)
            {
                var policy = Json.D(Json.G(h.Meta, "policy"));
                pol = "口令 ≥ " + Json.I(policy, "passwordMinLength") + " 位 · 失败 " + Json.I(policy, "maxFailedLogins") + " 次锁定 "
                    + Json.I(policy, "lockoutMinutes") + " 分钟 · 会话空闲 " + Json.I(policy, "idleTimeoutMinutes") + " 分钟超时 · 签名双要素（口令+一次性验证码）";
            }
            var policyLab = Lab(pol, FS, MUT);
            formPanel.Controls.Add(policyLab, 0, 3);
            formPanel.SetColumnSpan(policyLab, 3);

            col.Controls.Add(formPanel, 0, 2);

            // 提示
            string hint = "";
            if (h.Meta != null && Json.B(h.Meta, "builtinEnabled"))
                hint = "演示账号统一口令：" + Json.S(h.Meta, "demoPassword") + "（登录页身份按钮可自动填入用户名；演示口令是已标注的风险，真实环境每人独立凭证）";
            else
                hint = "首次使用请先创建系统管理员账号（用户名 3-32 位字母/数字/._-）。";
            var hintLab = Lab(hint, FS, MUT);
            col.Controls.Add(hintLab, 0, 3);
            if (h.Meta == null) { col.Controls.Add(Lab("正在连接本机服务…", FS, MUT), 0, 4); }

            p.Controls.Add(col);

            pinput.KeyDown += delegate(object s, KeyEventArgs e) { if (e.KeyCode == Keys.Enter) loginBtn.PerformClick(); };
            loginBtn.Click += delegate
            {
                string u = uinput.Text.Trim();
                string pw = pinput.Text;
                if (u.Length == 0 || pw.Length == 0) { Fail(errbox, "请输入用户名与口令。"); errbox.Visible = true; return; }
                loginBtn.Enabled = false;
                Safe.Fetch(delegate
                {
                    return h.Api.Post("/api/auth/login", new Dictionary<string, object> { { "username", u }, { "password", pw } });
                },
                delegate(object o)
                {
                    loginBtn.Enabled = true;
                    var login = Json.D(o);
                    if (login != null && (Json.S(login, "ok") == "True" || Json.S(login, "ok") == "true"))
                    {
                        var user = Json.D(Json.G(login, "user"));
                        win.EnterShell(user);
                    }
                },
                delegate(string msg)
                {
                    loginBtn.Enabled = true;
                    Fail(errbox, msg);
                    errbox.Visible = true;
                    pinput.Text = "";
                    pinput.Focus();
                });
            };
        }

        /* ============================================================ 首页 = */

        static void PageHead(Host h, Panel p, string title, string sub)
        {
            p.Controls.Add(new Label { Text = title, Font = new Font("Microsoft YaHei UI", 16f, FontStyle.Bold), AutoSize = true, Dock = DockStyle.Top, Padding = new Padding(0, 2, 0, 2) });
            if (sub != null && sub.Length > 0)
                p.Controls.Add(Lab(sub, FS, MUT).AsDockTop());
        }

        static Label AsDockTop(this Label l) { l.Dock = DockStyle.Top; l.Padding = new Padding(0, 0, 0, 4); return l; }

        public static void ShowHome(Host h, Panel p)
        {
            LoadContent(h);
            var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(0) };
            p.Controls.Add(flow);

            flow.Controls.Add(Lab("LeebertyCR · CRA/CRC 临床试验工作台", new Font("Microsoft YaHei UI", 16f, FontStyle.Bold), Color.Black));
            flow.Controls.Add(Lab("辅助临床监查员（CRA）与临床协调员（CRC）理解并执行药物临床试验工作流程。参照 ICH E6(R2) 与中国 GCP 2020 · 本地运行 · 账号隔离 · 权限服务端强制", FS, MUT));

            // 当前账号
            var acct = new GroupBox { Text = "当前账号", Font = FB, Width = 1180, Height = 96 };
            flow.Controls.Add(acct);
            var a1 = Lab("姓名：" + Json.S(h.Me, "fullName") + "   账号：@" + h.UserName + "   角色：" + RoleLabel(h, h.Role) + (Json.B(h.Me, "isDemo") ? "（演示账号）" : ""), F, Color.Black);
            a1.Location = new Point(12, 22);
            acct.Controls.Add(a1);
            var perms = Json.A(Json.G(h.Me, "permissions"));
            string ps = "";
            if (perms != null)
                foreach (object o in perms) ps += "  " + Convert.ToString(o);
            var a2 = Lab("权限：" + ps.Trim(), FS, MUT);
            a2.Location = new Point(12, 46);
            acct.Controls.Add(a2);
            var a3 = Lab("切换身份 = 窗口右下角「退出登录」，再用其他演示账号登录（角色由账号决定，职责分离）。", FS, MUT);
            a3.Location = new Point(12, 70);
            acct.Controls.Add(a3);

            // 统计
            var stats = new FlowLayoutPanel { FlowDirection = FlowDirection.LeftToRight, WrapContents = true, Width = 1180, Height = 84, Padding = new Padding(0, 6, 0, 0) };
            flow.Controls.Add(stats);
            var st = Json.D(h.State);
            var tasks = Json.A(Json.G(st, "tasks"));
            int taskN = tasks != null ? tasks.Count : 0;
            var cls = Json.D(Json.G(st, "checklists"));
            int done = 0, total = 0;
            var clDefs = Json.A(Json.G(Json.D(Json.G(h.Content, "checklists")), "checklists"));
            if (clDefs != null)
                foreach (object o in clDefs)
                {
                    var cd = Json.D(o);
                    var items = Json.A(Json.G(cd, "items"));
                    total += items != null ? items.Count : 0;
                    var rec = Json.D(Json.G(cls, Json.S(cd, "id")));
                    if (rec != null)
                    {
                        var arr = Json.A(Json.G(rec, "checked"));
                        done += arr != null ? arr.Count : 0;
                    }
                }
            var quiz = Json.D(Json.G(st, "quiz"));
            var best = Json.D(Json.G(quiz, "best"));
            string qk = h.Role == "cra" ? "cra" : h.Role == "crc" ? "crc" : "all";
            long qbest = best != null ? Json.I(best, qk) : 0;
            long qtotal = 0;
            var qs = Json.A(Json.G(Json.D(Json.G(h.Content, "quiz")), "questions"));
            if (qs != null) qtotal = qs.Count;
            var wf = Json.A(Json.G(Json.D(Json.G(h.Content, "workflows")), "workflows"));
            long wfn = wf != null ? wf.Count : 0;

            AddStat(stats, "我的任务", taskN.ToString());
            AddStat(stats, "核查清单已勾选", done + " / " + total);
            AddStat(stats, "场景练习最佳", qbest + " / " + qtotal);
            AddStat(stats, "可执行工作流", wfn + " 条");

            // 学习路线
            var guide = new GroupBox { Text = "学习路线", Font = FB, Width = 1180, Height = 54 };
            flow.Controls.Add(guide);
            var g1 = Btn("① 理念课堂（为什么）", delegate { h.Nav("learn"); }, false);
            g1.Location = new Point(12, 20);
            var g2 = Btn("② 试验生命周期（全局）", delegate { h.Nav("lifecycle"); }, false);
            g2.Location = new Point(170, 20);
            var g3 = Btn("③ 岗位手册 · 核查清单 · 工作流（动手）", delegate { h.Nav("workflow"); }, false);
            g3.Location = new Point(330, 20);
            guide.Controls.Add(g1);
            guide.Controls.Add(g2);
            guide.Controls.Add(g3);

            // 角色今日要点（静态文案）
            string today = "· 先读「理念课堂」建立认知 → 用「场景练习」检验 → 用「案例学习」复盘。";
            if (h.Role == "cra") today = "一句话：CRA 的价值 = 亲眼核对 + 问题闭环。\n准备监查访视 → CRA 手册；现场核查 → 核查清单·SDV；访视后 → 工作流执行·监查访视闭环 + 文件模板·随访信。";
            else if (h.Role == "crc") today = "一句话：CRC 的价值 = 安排到位 + 记录同步。\n有访视 → 核查清单·CRC 访视循环；录入前 → 核查清单·SDV 对照；SAE 线索 → 核查清单·SAE 报告；跟进上报 → 工作流执行·SAE 上报与跟踪。";
            else if (h.Role == "qa") today = "一句话：QA 的价值 = 独立复核（提出人不能自己关闭）。\n今天：工作流执行 · 查看等关闭/放行的记录，用 demo_qa 登录执行 🔒 独立复核步骤；账号与权限 · 查看安全日志。";
            var todayBox = new GroupBox { Text = "今日要点（角色：" + RoleLabel(h, h.Role) + "）", Font = FB, Width = 1180, Height = 120 };
            flow.Controls.Add(todayBox);
            var tl = Lab(today, F, Color.FromArgb(51, 69, 90));
            tl.Location = new Point(12, 24);
            todayBox.Controls.Add(tl);

            flow.Controls.Add(Lab("免责声明：" + Json.S(Json.D(Json.G(h.Content, "concepts")), "regDisclaimer"), FS, MUT));
        }

        static void AddStat(FlowLayoutPanel stats, string label, string value)
        {
            var box = new GroupBox { Text = label, Font = FS, Width = 270, Height = 64, Margin = new Padding(0, 0, 10, 0) };
            var v = new Label { Text = value, Font = new Font("Cascadia Mono", 15f, FontStyle.Bold), ForeColor = BLUE, AutoSize = true, Location = new Point(10, 22) };
            box.Controls.Add(v);
            stats.Controls.Add(box);
        }

        /* ============================================================ 理念课堂 = */

        public static void ShowLearn(Host h, Panel p)
        {
            LoadContent(h);
            var tabs = new TabControl { Dock = DockStyle.Fill };
            p.Controls.Add(tabs);
            var concepts = Json.D(Json.G(h.Content, "concepts"));

            // 角色
            var tRoles = new TabPage("① 三个角色");
            var rf = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true };
            tRoles.Controls.Add(rf);
            var cards = Json.A(Json.G(concepts, "roleCards"));
            if (cards != null)
                foreach (object o in cards)
                {
                    var c = Json.D(o);
                    var g = new GroupBox { Text = Json.S(c, "title") + "（" + Json.S(c, "en") + "）", Font = FB, Width = 1150, Height = 190, Margin = new Padding(0, 0, 0, 8) };
                    var s1 = Lab("受雇：" + Json.S(c, "employer"), F, Color.Black); s1.Location = new Point(12, 24);
                    var s2 = Lab("使命：" + Json.S(c, "mission"), F, Color.FromArgb(11, 79, 74)); s2.Location = new Point(12, 48); s2.MaximumSize = new Size(1120, 0);
                    var day = Json.A(Json.G(c, "day"));
                    string d = "";
                    if (day != null) foreach (object x in day) d += "· " + Convert.ToString(x) + "\n";
                    var s3 = Lab("一天：" + d.TrimEnd(), F, Color.Black); s3.Location = new Point(12, 74); s3.MaximumSize = new Size(1120, 0);
                    var s4 = Lab("边界：" + Json.S(c, "authority"), FS, MUT); s4.Location = new Point(12, 130); s4.MaximumSize = new Size(1120, 0);
                    g.Controls.Add(s1); g.Controls.Add(s2); g.Controls.Add(s3); g.Controls.Add(s4);
                    rf.Controls.Add(g);
                }
            tabs.TabPages.Add(tRoles);

            // 对比
            var tCmp = new TabPage("② 一张表看懂");
            var cf = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true };
            tCmp.Controls.Add(cf);
            var cmp = Json.D(Json.G(concepts, "comparison"));
            var rows = Json.A(Json.G(cmp, "rows"));
            if (rows != null)
            {
                var g = Dgv("维度", "CRA", "CRC");
                g.Width = 1150; g.Height = 320;
                foreach (object o in rows)
                {
                    var r = Json.D(o);
                    AddRow(g, Json.S(r, "dim"), Json.S(r, "cra"), Json.S(r, "crc"));
                }
                var box = new GroupBox { Text = "CRA 与 CRC 对比", Font = FB, Width = 1160, Height = 356 };
                g.Location = new Point(6, 24);
                box.Controls.Add(g);
                cf.Controls.Add(box);
            }
            cf.Controls.Add(Lab("配合：" + Json.S(cmp, "handshake"), F, Color.Black));

            // GCP 原则
            var tP = new TabPage("③ GCP 十三条原则");
            var pf = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true };
            tP.Controls.Add(pf);
            var pr = Json.D(Json.G(concepts, "principles"));
            var items = Json.A(Json.G(pr, "items"));
            if (items != null)
                foreach (object o in items)
                {
                    var it = Json.D(o);
                    var g = new GroupBox { Text = Json.I(it, "n") + ". " + Json.S(it, "text"), Font = FB, Width = 1150, Height = 130, Margin = new Padding(0, 0, 0, 8) };
                    var s1 = Lab("大白话：" + Json.S(it, "plain"), F, Color.Black); s1.Location = new Point(12, 24); s1.MaximumSize = new Size(1120, 0);
                    var s2 = Lab("对 CRA 意味着：" + Json.S(it, "cra"), FS, Color.FromArgb(11, 79, 74)); s2.Location = new Point(12, 62); s2.MaximumSize = new Size(1120, 0);
                    var s3 = Lab("对 CRC 意味着：" + Json.S(it, "crc"), FS, Color.FromArgb(29, 78, 216)); s3.Location = new Point(12, 88); s3.MaximumSize = new Size(1120, 0);
                    g.Controls.Add(s1); g.Controls.Add(s2); g.Controls.Add(s3);
                    pf.Controls.Add(g);
                }
            tabs.TabPages.Add(tP);

            // ALCOA
            var tA = new TabPage("④ ALCOA+");
            var af = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true };
            tA.Controls.Add(af);
            var al = Json.D(Json.G(concepts, "alcoa"));
            var letters = Json.A(Json.G(al, "letters"));
            if (letters != null)
            {
                var g = Dgv("字母", "要素", "大白话", "反例");
                g.Width = 1150; g.Height = 300;
                foreach (object o in letters)
                {
                    var l = Json.D(o);
                    AddRow(g, Json.S(l, "letter"), Json.S(l, "term"), Json.S(l, "plain"), Json.S(l, "bad"));
                }
                var box = new GroupBox { Text = "数据完整性八个字母", Font = FB, Width = 1160, Height = 336 };
                g.Location = new Point(6, 24);
                box.Controls.Add(g);
                af.Controls.Add(box);
            }
            af.Controls.Add(Lab("黄金规则：" + Json.S(al, "goldenRule"), F, Color.FromArgb(22, 101, 52)));

            // 权益
            var tR = new TabPage("⑤ 受试者权益");
            var rff = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true };
            tR.Controls.Add(rff);
            var sr = Json.D(Json.G(concepts, "subjectRights"));
            var srs = Json.A(Json.G(sr, "items"));
            if (srs != null)
                foreach (object o in srs)
                {
                    var it = Json.D(o);
                    var g = new GroupBox { Text = "🛡 " + Json.S(it, "title"), Font = FB, Width = 1150, Height = 70, Margin = new Padding(0, 0, 0, 8) };
                    var s1 = Lab(Json.S(it, "plain"), F, Color.Black); s1.Location = new Point(12, 26); s1.MaximumSize = new Size(1120, 0);
                    g.Controls.Add(s1);
                    rff.Controls.Add(g);
                }
            tabs.TabPages.Add(tR);

            tabs.TabPages.Add(InfoTab(concepts, "免责声明", "regDisclaimer"));
        }

        static TabPage InfoTab(IDictionary<string, object> concepts, string title, string key)
        {
            var t = new TabPage(title);
            var f = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(10) };
            f.Controls.Add(Lab(Json.S(concepts, key), F, MUT));
            t.Controls.Add(f);
            return t;
        }

        /* ============================================================ 试验生命周期 = */

        public static void ShowLifecycle(Host h, Panel p)
        {
            LoadContent(h);
            var split = new SplitContainer { Dock = DockStyle.Fill, FixedPanel = FixedPanel.Panel1, SplitterDistance = 240, SplitterWidth = 4 };
            p.Controls.Add(split);

            var phases = Json.A(Json.G(Json.D(Json.G(h.Content, "lifecycle")), "phases"));
            var lb = new ListBox { Dock = DockStyle.Fill, Font = F };
            if (phases != null)
                foreach (object o in phases)
                {
                    var ph = Json.D(o);
                    lb.Items.Add(Json.I(ph, "n") + ". " + Json.S(ph, "title"));
                }
            split.Panel1.Controls.Add(lb);

            var detail = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(6, 0, 0, 0) };
            split.Panel2.Controls.Add(detail);

            Action<int> render = delegate(int idx)
            {
                detail.Controls.Clear();
                var ph = Json.D(phases[idx]);
                detail.Controls.Add(Lab(Json.I(ph, "n") + ". " + Json.S(ph, "title") + "  ——  " + Json.S(ph, "subtitle"), new Font("Microsoft YaHei UI", 13f, FontStyle.Bold), Color.Black));
                detail.Controls.Add(Lab("时段：" + Json.S(ph, "timeline") + "    （目标）" + Json.S(ph, "goal"), F, Color.FromArgb(11, 79, 74)));
                var g = Dgv("步骤", "负责", "做什么", "产出");
                g.Width = 850; g.Height = Math.Min(140 + (Json.A(Json.G(ph, "flow")) != null ? Json.A(Json.G(ph, "flow")).Count * 22 : 0), 260);
                var flow = Json.A(Json.G(ph, "flow"));
                if (flow != null)
                    foreach (object o in flow)
                    {
                        var st = Json.D(o);
                        AddRow(g, Json.S(st, "step"), Json.S(st, "who"), Json.S(st, "what"), Json.S(st, "out"));
                    }
                detail.Controls.Add(g);

                var cra = Json.A(Json.G(ph, "craDuties"));
                string cs = "无";
                if (cra != null) { cs = ""; foreach (object o in cra) cs += "· " + Convert.ToString(o) + "\n"; }
                var crc = Json.A(Json.G(ph, "crcDuties"));
                string cc = "无";
                if (crc != null) { cc = ""; foreach (object o in crc) cc += "· " + Convert.ToString(o) + "\n"; }
                var duties = new GroupBox { Text = "职责分工", Font = FB, Width = 880, Height = 130 };
                var l1 = Lab("CRA：" + cs.TrimEnd(), F, Color.FromArgb(11, 79, 74)); l1.Location = new Point(12, 26); l1.MaximumSize = new Size(850, 0);
                var l2 = Lab("CRC：" + cc.TrimEnd(), F, Color.FromArgb(29, 78, 216)); l2.Location = new Point(12, 74); l2.MaximumSize = new Size(850, 0);
                duties.Controls.Add(l1); duties.Controls.Add(l2);
                detail.Controls.Add(duties);

                var del = Json.A(Json.G(ph, "deliverables"));
                string ds = "";
                if (del != null) { ds = ""; foreach (object o in del) ds += "[" + Convert.ToString(o) + "]  "; }
                detail.Controls.Add(Lab("本阶段产出：" + ds.Trim(), F, Color.Black));
                var pit = Json.A(Json.G(ph, "pitfalls"));
                string pp = "";
                if (pit != null) { pp = ""; foreach (object o in pit) pp += "⚠ " + Convert.ToString(o) + "\n"; }
                detail.Controls.Add(Lab("常见的坑：\n" + pp.TrimEnd(), F, Color.FromArgb(150, 63, 3)));
                var refs = Json.A(Json.G(ph, "refs"));
                string rr = "";
                if (refs != null) { rr = ""; foreach (object o in refs) rr += "[" + Convert.ToString(o) + "]  "; }
                detail.Controls.Add(Lab("法规依据：" + rr.Trim(), FS, MUT));
            };
            if (phases != null && phases.Count > 0)
            {
                lb.SelectedIndex = 0;
                lb.SelectedIndexChanged += delegate { if (lb.SelectedIndex >= 0) render(lb.SelectedIndex); };
                render(0);
            }
            else
            {
                detail.Controls.Add(Lab("暂无阶段数据", F, MUT));
            }
        }

        /* ============================================================ 岗位手册 = */

        public static void ShowHandbook(Host h, Panel p, string roleKey)
        {
            LoadContent(h);
            var split = new SplitContainer { Dock = DockStyle.Fill, FixedPanel = FixedPanel.Panel1, SplitterDistance = 260, SplitterWidth = 4 };
            p.Controls.Add(split);

            var tasks = Json.A(Json.G(Json.D(Json.G(h.Content, roleKey == "crc" ? "crc-tasks" : "cra-tasks")), "tasks"));
            var search = new TextBox { Dock = DockStyle.Top, Font = F, Width = 200 };
            var lb = new ListBox { Dock = DockStyle.Fill, Font = F };

            var left = new Panel { Dock = DockStyle.Fill };
            var leftTop = new Panel { Dock = DockStyle.Top, Height = 60 };
            leftTop.Controls.Add(new Label { Text = "搜索（回车过滤）", Font = FS, AutoSize = true });
            search.Location = new Point(4, 22);
            leftTop.Controls.Add(search);
            left.Controls.Add(lb);
            left.Controls.Add(leftTop);
            split.Panel1.Controls.Add(left);

            var detail = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(6, 0, 0, 0) };
            split.Panel2.Controls.Add(detail);

            Func<object, string> keyOf = null;
            keyOf = delegate(object o)
            {
                var d = Json.D(o);
                return Json.S(d, "stage") + "｜" + Json.S(d, "title");
            };

            Action<string> renderList = delegate(string q)
            {
                lb.Items.Clear();
                if (tasks == null) return;
                q = (q ?? "").ToLowerInvariant();
                foreach (object o in tasks)
                {
                    var d = Json.D(o);
                    string hay = (Json.S(d, "title") + Json.S(d, "en") + Json.S(d, "why")).ToLowerInvariant();
                    if (q.Length == 0 || hay.IndexOf(q) >= 0) lb.Items.Add(o);
                }
            };

            Action<object> renderDetail = delegate(object o)
            {
                detail.Controls.Clear();
                var d = Json.D(o);
                detail.Controls.Add(Lab(Json.S(d, "title") + "   " + Json.S(d, "en"), new Font("Microsoft YaHei UI", 13f, FontStyle.Bold), Color.Black));
                detail.Controls.Add(Lab("阶段：" + Json.S(d, "stage"), FS, MUT));
                detail.Controls.Add(Lab("为什么做（理念）：" + Json.S(d, "why"), F, Color.FromArgb(11, 79, 74)));
                detail.Controls.Add(Lab("何时做：" + Json.S(d, "when"), F, Color.Black));
                var how = Json.A(Json.G(d, "how"));
                string hh = "";
                if (how != null) { int i = 1; foreach (object x in how) hh += i++ + ". " + Convert.ToString(x) + "\n"; }
                detail.Controls.Add(Lab("怎么做：\n" + hh.TrimEnd(), F, Color.Black));
                var pts = Json.A(Json.G(d, "points"));
                string pp = "";
                if (pts != null) foreach (object x in pts) pp += "⭐ " + Convert.ToString(x) + "\n";
                detail.Controls.Add(Lab("要点：\n" + pp.TrimEnd(), F, Color.FromArgb(11, 79, 74)));
                var mis = Json.A(Json.G(d, "mistakes"));
                string mm = "";
                if (mis != null) foreach (object x in mis) mm += "⚠ " + Convert.ToString(x) + "\n";
                detail.Controls.Add(Lab("红线/常见错误：\n" + mm.TrimEnd(), F, Color.FromArgb(150, 63, 3)));
                var tools = Json.A(Json.G(d, "tools"));
                if (tools != null && tools.Count > 0)
                {
                    string toolsStr = "";
                    var cls = Json.D(Json.G(h.Content, "checklists"));
                    var clList = Json.A(Json.G(cls, "checklists"));
                    foreach (object x in tools)
                    {
                        string id = Convert.ToString(x);
                        string name = id;
                        if (clList != null)
                            foreach (object cc in clList)
                            {
                                var cd = Json.D(cc);
                                if (Json.S(cd, "id") == id) name = Json.S(cd, "title");
                            }
                        toolsStr += "[" + name + "]  ";
                    }
                    detail.Controls.Add(Lab("配套清单：" + toolsStr.Trim(), FS, Color.FromArgb(29, 78, 216)));
                }
                var refs = Json.A(Json.G(d, "refs"));
                string rr = "";
                if (refs != null) { rr = ""; foreach (object x in refs) rr += "[" + Convert.ToString(x) + "]  "; }
                detail.Controls.Add(Lab("法规依据：" + rr.Trim(), FS, MUT));
            };

            lb.SelectedIndexChanged += delegate { if (lb.SelectedItem != null) renderDetail(lb.SelectedItem); };
            search.KeyDown += delegate(object s, KeyEventArgs e)
            {
                if (e.KeyCode == Keys.Enter)
                {
                    renderList(search.Text);
                    if (lb.Items.Count > 0) lb.SelectedIndex = 0;
                }
            };
            renderList("");
            if (lb.Items.Count > 0) lb.SelectedIndex = 0;
        }

        /* ============================================================ 核查清单 = */

        public static void ShowChecklists(Host h, Panel p, string selectId)
        {
            LoadContent(h);
            var split = new SplitContainer { Dock = DockStyle.Fill, FixedPanel = FixedPanel.Panel1, SplitterDistance = 300, SplitterWidth = 4 };
            p.Controls.Add(split);

            var cls = Json.D(Json.G(h.Content, "checklists"));
            var list = Json.A(Json.G(cls, "checklists"));
            var st = Json.D(h.State);
            var states = Json.D(Json.G(st, "checklists"));
            if (states == null) { states = new Dictionary<string, object>(); }

            var lb = new ListBox { Dock = DockStyle.Fill, Font = F };
            Dictionary<int, object> indexToCl = new Dictionary<int, object>();
            if (list != null)
            {
                foreach (object o in list)
                {
                    var cd = Json.D(o);
                    var rec = Json.D(Json.G(states, Json.S(cd, "id")));
                    var arr = rec != null ? Json.A(Json.G(rec, "checked")) : null;
                    int n = arr != null ? arr.Count : 0;
                    int total = Json.A(Json.G(cd, "items")) != null ? Json.A(Json.G(cd, "items")).Count : 0;
                    indexToCl[lb.Items.Count] = o;
                    lb.Items.Add(Json.S(cd, "title") + "（" + n + "/" + total + "）");
                }
            }
            split.Panel1.Controls.Add(lb);

            var detail = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(6, 0, 0, 0) };
            split.Panel2.Controls.Add(detail);

            Action<object> render = null;
            render = delegate(object o)
            {
                detail.Controls.Clear();
                var cd = Json.D(o);
                string id = Json.S(cd, "id");
                var items = Json.A(Json.G(cd, "items"));
                detail.Controls.Add(Lab(Json.S(cd, "title") + "（" + Json.S(cd, "stage") + "）", new Font("Microsoft YaHei UI", 13f, FontStyle.Bold), Color.Black));
                detail.Controls.Add(Lab(Json.S(cd, "intro"), FS, MUT));

                var itemsBox = new GroupBox { Text = "逐项核对（勾选自动保存到本账号）", Font = FB, Width = 780, Height = Math.Min(60 + items.Count * 24 + 20, 520) };
                var clb = new CheckedListBox { Dock = DockStyle.Fill, Font = F, CheckOnClick = true, IntegralHeight = false };
                for (int i = 0; i < items.Count; i++)
                {
                    var it = Json.D(items[i]);
                    clb.Items.Add((Json.B(it, "critical") ? "【关键】" : "") + Json.S(it, "text"), false);
                }
                var rec = Json.D(Json.G(states, id));
                var arr = rec != null ? Json.A(Json.G(rec, "checked")) : null;
                ArrayList checkedIds = arr != null ? arr : new ArrayList();
                for (int i = 0; i < items.Count; i++)
                {
                    var it = Json.D(items[i]);
                    if (checkedIds.Contains(Json.S(it, "id"))) clb.SetItemChecked(i, true);
                }
                itemsBox.Controls.Add(clb);
                detail.Controls.Add(itemsBox);

                var hint = new Label { Font = FS, ForeColor = MUT, AutoSize = true, MaximumSize = new Size(770, 0) };
                detail.Controls.Add(hint);
                clb.SelectedIndexChanged += delegate
                {
                    if (clb.SelectedIndex >= 0)
                    {
                        var it = Json.D(items[clb.SelectedIndex]);
                        hint.Text = "怎么做：" + Json.S(it, "hint") + "\n为什么：" + Json.S(it, "why");
                    }
                };

                clb.ItemCheck += delegate(object s, ItemCheckEventArgs e)
                {
                    var it = Json.D(items[e.Index]);
                    string iid = Json.S(it, "id");
                    if (e.NewValue == CheckState.Checked) { if (!checkedIds.Contains(iid)) checkedIds.Add(iid); }
                    else checkedIds.Remove(iid);
                    var dict = new Dictionary<string, object> { { "checked", checkedIds } };
                    states[id] = dict;
                    h.State["checklists"] = states;
                    h.SaveState();
                    lb.Items[lb.SelectedIndex] = Json.S(cd, "title") + "（" + checkedIds.Count + "/" + items.Count + "）";
                };

                var note = new TextBox { Font = F, Width = 770, Multiline = true, Height = 60, Text = rec != null ? Json.S(rec, "note") : "" };
                detail.Controls.Add(Lab("备注（本次使用记录）：", FS, MUT));
                detail.Controls.Add(note);
                var reset = Btn("重置本清单", delegate
                {
                    if (MessageBox.Show("确定清空本清单的全部勾选状态吗？", "LeebertyCR", MessageBoxButtons.OKCancel, MessageBoxIcon.Question) == DialogResult.OK)
                    {
                        checkedIds.Clear();
                        states[id] = new Dictionary<string, object> { { "checked", new ArrayList() }, { "note", "" } };
                        h.State["checklists"] = states;
                        h.SaveState();
                        if (render != null) render(cd);
                    }
                }, false);
                detail.Controls.Add(reset);
                var export = Btn("⬇ 导出 CSV（含勾选/提示）", delegate
                {
                    var rows = new List<string[]>();
                    rows.Add(new[] { "序号", "条目", "关键", "勾选", "怎么做", "为什么" });
                    int n = 1;
                    foreach (object io in items)
                    {
                        var it = Json.D(io);
                        rows.Add(new[] {
                            n.ToString(), Json.S(it, "text"), Json.B(it, "critical") ? "是" : "",
                            checkedIds.Contains(Json.S(it, "id")) ? "✓" : "",
                            Json.S(it, "hint"), Json.S(it, "why"),
                        });
                        n++;
                    }
                    SaveTextFile(h, "导出核对表", id + ".csv", ToCsvText(rows));
                }, false);
                detail.Controls.Add(export);
                var saveTimer = new Timer { Interval = 800 };
                saveTimer.Tick += delegate
                {
                    saveTimer.Stop();
                    var d2 = new Dictionary<string, object> { { "checked", checkedIds }, { "note", note.Text } };
                    states[id] = d2;
                    h.State["checklists"] = states;
                    h.SaveState();
                };
                note.TextChanged += delegate { saveTimer.Stop(); saveTimer.Start(); };
            };

            lb.SelectedIndexChanged += delegate { if (lb.SelectedIndex >= 0 && indexToCl.ContainsKey(lb.SelectedIndex)) render(indexToCl[lb.SelectedIndex]); };
            int sel = 0;
            if (selectId != null && selectId.Length > 0 && list != null)
            {
                for (int i = 0; i < list.Count; i++)
                {
                    if (Json.S(Json.D(list[i]), "id") == selectId) { sel = i; break; }
                }
            }
            lb.SelectedIndex = sel;
        }

        /* ============================================================ 任务台 = */

        public static void ShowTasks(Host h, Panel p)
        {
            var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(0) };
            p.Controls.Add(flow);
            flow.Controls.Add(Lab("任务台（本账号个人任务，保存在 data/users/" + h.UserName + "/state.json）", new Font("Microsoft YaHei UI", 13f, FontStyle.Bold), Color.Black));

            var g = Dgv("任务", "角色", "类型", "中心", "截止", "状态", "备注");
            g.Width = 1150; g.Height = 380;
            flow.Controls.Add(g);

            Action render = delegate
            {
                g.Rows.Clear();
                var tasks = Json.A(Json.G(h.State, "tasks"));
                if (tasks == null) tasks = new ArrayList();
                for (int i = 0; i < tasks.Count; i++)
                {
                    var t = Json.D(tasks[i]);
                    AddRow(g, Json.S(t, "title"), Json.S(t, "role"), Json.S(t, "type"), Json.S(t, "site"), Json.S(t, "due"), Json.S(t, "status"), Json.S(t, "note"));
                }
            };
            render();

            var row = new FlowLayoutPanel { FlowDirection = FlowDirection.LeftToRight, WrapContents = true, Width = 1150 };
            var addBtn = Btn("＋ 新增任务", delegate { TaskDialog(h, render); }, true);
            var doneBtn = Btn("完成/恢复所选", delegate
            {
                if (g.SelectedRows.Count == 0) { MessageBox.Show("请先选择一行任务。", "LeebertyCR", MessageBoxButtons.OK, MessageBoxIcon.Information); return; }
                int idx = g.SelectedRows[0].Index;
                var tasks = Json.A(Json.G(h.State, "tasks"));
                var t = Json.D(tasks[idx]);
                if (Json.S(t, "status") == "done") t["status"] = "todo";
                else t["status"] = "done";
                h.SaveState();
                render();
            }, false);
            var delBtn = Btn("删除所选", delegate
            {
                if (g.SelectedRows.Count == 0) return;
                int idx = g.SelectedRows[0].Index;
                var tasks = Json.A(Json.G(h.State, "tasks"));
                tasks.RemoveAt(idx);
                h.SaveState();
                render();
            }, false);
            var demoBtn = Btn("添加 3 条演示任务", delegate
            {
                var tasks = Json.A(Json.G(h.State, "tasks"));
                if (tasks == null) { tasks = new ArrayList(); h.State["tasks"] = tasks; }
                string[] names = { "准备 XX 中心常规监查（SDRP/质疑/既往随访信）", "本周 3 位受试者随访后的 eCRF 录入", "核对 ISF 缺项：简历更新、培训记录" };
                foreach (string n in names)
                {
                    var t = new Dictionary<string, object> {
                        { "id", "t" + Guid.NewGuid().ToString("N").Substring(0, 10) },
                        { "title", n }, { "role", h.Role }, { "type", "other" },
                        { "site", "XX 医院" }, { "due", "" }, { "note", "" }, { "status", "todo" },
                        { "createdAt", DateTime.Now.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'") }, { "updatedAt", DateTime.Now.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'") },
                    };
                    tasks.Add(t);
                }
                h.SaveState();
                render();
            }, false);
            row.Controls.Add(addBtn);
            row.Controls.Add(doneBtn);
            row.Controls.Add(delBtn);
            row.Controls.Add(demoBtn);
            flow.Controls.Add(row);
        }

        static void TaskDialog(Host h, Action after)
        {
            var d = new Form { Text = "新增任务", Width = 460, Height = 340, StartPosition = FormStartPosition.CenterParent, FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false, MinimizeBox = false, Font = F };
            var t = new TextBox { Location = new Point(110, 16), Width = 300 };
            var rl = new ComboBox { Location = new Point(110, 48), Width = 300, DropDownStyle = ComboBoxStyle.DropDownList };
            foreach (string r in new[] { "cra", "crc", "pi", "qa", "self" }) rl.Items.Add(r);
            rl.SelectedItem = h.Role == "crc" ? "crc" : (h.Role == "pi" ? "pi" : h.Role == "qa" ? "qa" : "cra");
            var tt = new ComboBox { Location = new Point(110, 80), Width = 300, DropDownStyle = ComboBoxStyle.DropDownList };
            foreach (string r in new[] { "visit", "file", "data", "sae", "drug", "meeting", "other" }) tt.Items.Add(r);
            tt.SelectedIndex = 0;
            var st = new TextBox { Location = new Point(110, 112), Width = 300 };
            var due = new TextBox { Location = new Point(110, 144), Width = 300 };
            var nt = new TextBox { Location = new Point(110, 176), Width = 300 };
            d.Controls.Add(new Label { Text = "任务内容", Location = new Point(16, 20), AutoSize = true });
            d.Controls.Add(new Label { Text = "角色", Location = new Point(16, 52), AutoSize = true });
            d.Controls.Add(new Label { Text = "类型", Location = new Point(16, 84), AutoSize = true });
            d.Controls.Add(new Label { Text = "中心", Location = new Point(16, 116), AutoSize = true });
            d.Controls.Add(new Label { Text = "截止 yyyy-mm-dd", Location = new Point(16, 148), AutoSize = true });
            d.Controls.Add(new Label { Text = "备注", Location = new Point(16, 180), AutoSize = true });
            d.Controls.Add(t); d.Controls.Add(rl); d.Controls.Add(tt); d.Controls.Add(st); d.Controls.Add(due); d.Controls.Add(nt);
            var ok = new Button { Text = "添加", Location = new Point(200, 224), Width = 100 };
            var cn = new Button { Text = "取消", Location = new Point(310, 224), Width = 100 };
            d.Controls.Add(ok); d.Controls.Add(cn);
            ok.Click += delegate
            {
                if (t.Text.Trim().Length < 2) { MessageBox.Show("请填写任务内容。", "LeebertyCR", MessageBoxButtons.OK, MessageBoxIcon.Information); return; }
                var tasks = Json.A(Json.G(h.State, "tasks"));
                if (tasks == null) { tasks = new ArrayList(); h.State["tasks"] = tasks; }
                var item = new Dictionary<string, object> {
                    { "id", "t" + Guid.NewGuid().ToString("N").Substring(0, 10) },
                    { "title", t.Text.Trim() }, { "role", Convert.ToString(rl.SelectedItem) }, { "type", Convert.ToString(tt.SelectedItem) },
                    { "site", st.Text.Trim() }, { "due", due.Text.Trim() }, { "note", nt.Text.Trim() }, { "status", "todo" },
                    { "createdAt", DateTime.Now.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'") }, { "updatedAt", DateTime.Now.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'") },
                };
                tasks.Add(item);
                h.SaveState();
                after();
                d.Close();
            };
            cn.Click += delegate { d.Close(); };
            d.ShowDialog(h.Win);
        }
    }
}