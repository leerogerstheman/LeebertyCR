using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;

/*
 * Views2.cs - LeebertyCR 原生视图（二）：文件模板、法规速查、术语表、关于、
 * 工作流执行（流程库/记录/步骤表单/双要素签名/历史）、场景练习、案例学习、
 * 账号与权限（我的账号/用户管理/权限矩阵/安全日志）。全部原生控件。
 */

namespace LeebertyCR
{
    public static partial class Views
    {
        static readonly Color BLUE2 = Color.FromArgb(13, 30, 60);
        static readonly Color MUT2 = Color.FromArgb(92, 107, 122);
        static readonly Color TEAL2 = Color.FromArgb(11, 79, 74);

        /* ============================================================ 文件模板 = */

        public static void ShowTemplates(Host h, Panel p)
        {
            LoadContent(h);
            var split = new SplitContainer { Dock = DockStyle.Fill, FixedPanel = FixedPanel.Panel1, SplitterDistance = 250, SplitterWidth = 4 };
            p.Controls.Add(split);
            var templates = Json.A(Json.G(Json.D(Json.G(h.Content, "templates")), "templates"));
            var lb = new ListBox { Dock = DockStyle.Fill, Font = F };
            Dictionary<int, object> idx = new Dictionary<int, object>();
            if (templates != null)
                foreach (object o in templates)
                {
                    idx[lb.Items.Count] = o;
                    lb.Items.Add(Json.S(Json.D(o), "title"));
                }
            split.Panel1.Controls.Add(lb);

            var detail = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(6, 0, 0, 0) };
            split.Panel2.Controls.Add(detail);

            Action<object> render = delegate(object o)
            {
                detail.Controls.Clear();
                var t = Json.D(o);
                detail.Controls.Add(Lab(Json.S(t, "title") + "  " + Json.S(t, "en"), new Font("Microsoft YaHei UI", 13f, FontStyle.Bold), Color.Black));
                var copy = Btn("📋 复制全部内容", delegate
                {
                    string s = "";
                    var secs = Json.A(Json.G(t, "sections"));
                    if (secs != null)
                        foreach (object so in secs)
                        {
                            var sd = Json.D(so);
                            var body = Json.A(Json.G(sd, "body"));
                            s += "【" + Json.S(sd, "label") + "】\n";
                            if (body != null) foreach (object b in body) s += Convert.ToString(b) + "\n";
                            s += "\n";
                        }
                    try { Clipboard.SetText(s); MessageBox.Show("已复制到剪贴板。", "LeebertyCR", MessageBoxButtons.OK, MessageBoxIcon.Information); }
                    catch { MessageBox.Show("复制失败，请手动选择文本。", "LeebertyCR", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
                }, false);
                detail.Controls.Add(copy);
                detail.Controls.Add(Lab("用途：" + Json.S(t, "purpose"), F, TEAL2));
                detail.Controls.Add(Lab("用法：" + Json.S(t, "usage"), F, Color.Black));
                var secs2 = Json.A(Json.G(t, "sections"));
                if (secs2 != null)
                    foreach (object so in secs2)
                    {
                        var sd = Json.D(so);
                        var g = new GroupBox { Text = Json.S(sd, "label"), Font = FB, Width = 860, Height = 110, Margin = new Padding(0, 0, 0, 6) };
                        var txt = new Label { Font = FM, AutoSize = true, MaximumSize = new Size(830, 0), Location = new Point(12, 24) };
                        var body = Json.A(Json.G(sd, "body"));
                        string b = "";
                        if (body != null) foreach (object x in body) b += Convert.ToString(x) + "\n";
                        txt.Text = b.TrimEnd();
                        g.Controls.Add(txt);
                        g.Height = Math.Min(40 + txt.Height, 300);
                        detail.Controls.Add(g);
                    }
            };
            lb.SelectedIndexChanged += delegate { if (lb.SelectedIndex >= 0 && idx.ContainsKey(lb.SelectedIndex)) render(idx[lb.SelectedIndex]); };
            if (templates != null && templates.Count > 0) lb.SelectedIndex = 0;
        }

        /* ============================================================ 法规速查 = */

        public static void ShowRegs(Host h, Panel p)
        {
            LoadContent(h);
            var split = new SplitContainer { Dock = DockStyle.Fill, FixedPanel = FixedPanel.Panel1, SplitterDistance = 250, SplitterWidth = 4 };
            p.Controls.Add(split);
            var regs = Json.D(Json.G(h.Content, "regulations"));
            var cards = Json.A(Json.G(regs, "cards"));
            var lb = new ListBox { Dock = DockStyle.Fill, Font = F };
            Dictionary<int, object> idx = new Dictionary<int, object>();
            if (cards != null)
                foreach (object o in cards)
                {
                    idx[lb.Items.Count] = o;
                    lb.Items.Add(Json.S(Json.D(o), "title"));
                }
            split.Panel1.Controls.Add(lb);

            var detail = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(6, 0, 0, 0) };
            split.Panel2.Controls.Add(detail);

            Action<object> render = delegate(object o)
            {
                detail.Controls.Clear();
                var c = Json.D(o);
                detail.Controls.Add(Lab(Json.S(c, "title"), new Font("Microsoft YaHei UI", 13f, FontStyle.Bold), Color.Black));
                detail.Controls.Add(Lab("适用范围：" + Json.S(c, "scope"), FS, MUT2));
                var pts = Json.A(Json.G(c, "keyPoints"));
                if (pts != null && pts.Count > 0)
                {
                    var g = Dgv("条款", "要点");
                    g.Width = 860; g.Height = Math.Min(60 + pts.Count * 30, 320);
                    foreach (object po in pts)
                    {
                        var pd = Json.D(po);
                        AddRow(g, Json.S(pd, "ref"), Json.S(pd, "point"));
                    }
                    detail.Controls.Add(g);
                }
                string note = Json.S(c, "note");
                if (note.Length > 0) detail.Controls.Add(Lab("注：" + note, FS, Color.FromArgb(150, 63, 3)));
            };
            lb.SelectedIndexChanged += delegate { if (lb.SelectedIndex >= 0 && idx.ContainsKey(lb.SelectedIndex)) render(idx[lb.SelectedIndex]); };
            if (cards != null && cards.Count > 0)
            {
                lb.SelectedIndex = 0;
                // 时限表作为第二个 ListBox 项之后展示：在 detail 底部常驻
                var deadlines = Json.D(Json.G(regs, "deadlines"));
                var rows = Json.A(Json.G(deadlines, "rows"));
                Action showDeadlines = delegate
                {
                    detail.Controls.Clear();
                    detail.Controls.Add(Lab("常用时限速查表（以方案与现行法规为准）", new Font("Microsoft YaHei UI", 13f, FontStyle.Bold), Color.Black));
                    detail.Controls.Add(Lab(Json.S(deadlines, "note"), FS, MUT2));
                    var g = Dgv("事项", "常见要求", "依据", "责任方");
                    g.Width = 900; g.Height = Math.Min(60 + rows.Count * 30, 460);
                    foreach (object ro in rows)
                    {
                        var rd = Json.D(ro);
                        AddRow(g, Json.S(rd, "item"), Json.S(rd, "usual"), Json.S(rd, "basis"), Json.S(rd, "role"));
                    }
                    detail.Controls.Add(g);
                    detail.Controls.Add(Lab(Json.S(regs, "disclaimer"), FS, MUT2));
                };
                lb.Items.Add("—— 常用时限速查表 ——");
                lb.SelectedIndexChanged += delegate
                {
                    if (lb.SelectedIndex < 0) return;
                    if (lb.SelectedIndex == lb.Items.Count - 1) showDeadlines();
                    else if (idx.ContainsKey(lb.SelectedIndex)) render(idx[lb.SelectedIndex]);
                };
            }
        }

        /* ============================================================ 术语表 = */

        public static void ShowGlossary(Host h, Panel p)
        {
            LoadContent(h);
            var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(0) };
            p.Controls.Add(flow);
            flow.Controls.Add(Lab("术语表（输入关键词过滤，回车应用）", new Font("Microsoft YaHei UI", 13f, FontStyle.Bold), Color.Black));
            var terms = Json.A(Json.G(Json.D(Json.G(h.Content, "glossary")), "terms"));
            var search = new TextBox { Font = F, Width = 520 };
            flow.Controls.Add(search);
            var lb = new ListBox { Font = F, Width = 620, Height = 300 };
            flow.Controls.Add(lb);
            var detail = new Label { Font = F, AutoSize = true, MaximumSize = new Size(900, 0) };
            flow.Controls.Add(detail);

            Action<string> renderList = delegate(string q)
            {
                lb.Items.Clear();
                if (terms == null) return;
                q = (q ?? "").ToLowerInvariant();
                foreach (object o in terms)
                {
                    var t = Json.D(o);
                    string hay = (Json.S(t, "term") + Json.S(t, "en") + Json.S(t, "plain")).ToLowerInvariant();
                    if (q.Length == 0 || hay.IndexOf(q) >= 0)
                        lb.Items.Add(Json.S(t, "term") + "  |  " + Json.S(t, "en"));
                }
            };
            lb.SelectedIndexChanged += delegate
            {
                if (lb.SelectedIndex >= 0)
                {
                    var t = Json.D(terms[lb.SelectedIndex]);
                    detail.Text = "【" + Json.S(t, "term") + "】 " + Json.S(t, "en") + "\n" + Json.S(t, "plain");
                }
            };
            search.KeyDown += delegate(object s, KeyEventArgs e)
            {
                if (e.KeyCode == Keys.Enter) { renderList(search.Text); if (lb.Items.Count > 0) lb.SelectedIndex = 0; }
            };
            renderList("");
        }

        /* ============================================================ 关于 = */

        public static void ShowAbout(Host h, Panel p)
        {
            LoadContent(h);
            var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(0) };
            p.Controls.Add(flow);
            flow.Controls.Add(Lab("关于 LeebertyCR", new Font("Microsoft YaHei UI", 16f, FontStyle.Bold), Color.Black));
            flow.Controls.Add(Lab("LeebertyCR（CRA/CRC 临床试验工作台）：本地运行的临床试验岗位辅助应用。本窗口为原生桌面窗口，不依赖任何浏览器；本地 Node 引擎通过 127.0.0.1 JSON API 提供数据、认证、权限与工作流。标识：蓝黑底 + 大写哥特体 CR。", F, Color.Black));
            var wf = Json.A(Json.G(Json.D(Json.G(h.Content, "workflows")), "workflows"));
            long steps = 0;
            if (wf != null)
                foreach (object o in wf) steps += Json.A(Json.G(Json.D(o), "steps")) != null ? Json.A(Json.G(Json.D(o), "steps")).Count : 0;
            var qs = Json.A(Json.G(Json.D(Json.G(h.Content, "quiz")), "questions"));
            var gs = Json.A(Json.G(Json.D(Json.G(h.Content, "glossary")), "terms"));
            var cls = Json.A(Json.G(Json.D(Json.G(h.Content, "checklists")), "checklists"));
            string cs = "无"; if (cls != null) { cs = ""; foreach (object o in cls) cs += Json.A(Json.G(Json.D(o), "items")).Count + " + "; }
            flow.Controls.Add(Lab("内容统计：生命周期 8 阶段 · 岗位手册 29 卡 · 核查清单 " + cls.Count + " 张（" + cs.TrimEnd('+', ' ') + "项）· 工作流 " + wf.Count + " 条（" + steps + " 个步骤）· 练习 " + qs.Count + " 题 · 术语 " + gs.Count + " 条", F, MUT2));
            flow.Controls.Add(Lab("目录：D:\\LeebertyCR · 登录账号数据 data/accounts.json · 个人状态 data/users/<用户名>/ · 工作流记录 data/records.json · 安全日志 data/security.log", FS, MUT2));
            flow.Controls.Add(Lab("免责声明：本应用为学习与工作辅助工具，不是经过法规验证的临床试验系统，内容不构成法规或医学建议。实际执行以现行法规、试验方案、伦理要求与本单位 SOP 为准。", FS, MUT2));
        }

        /* ============================================================ 工作流执行 = */

        public static void ShowWorkflow(Host h, Panel p)
        {
            LoadContent(h);
            var tabs = new TabControl { Dock = DockStyle.Fill };
            p.Controls.Add(tabs);

            // ---- 流程库 ----
            var lib = new TabPage("流程库");
            var lf = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(0) };
            lib.Controls.Add(lf);
            var wfs = Json.A(Json.G(Json.D(Json.G(h.Content, "workflows")), "workflows"));
            foreach (object wo in wfs)
            {
                var wd = Json.D(wo);
                var g = new GroupBox { Text = Json.S(wd, "recordPrefix") + " " + Json.S(wd, "name"), Font = FB, Width = 1180, Height = 130, Margin = new Padding(0, 0, 0, 8) };
                string stepStr = "";
                var ss = Json.A(Json.G(wd, "steps"));
                if (ss != null)
                {
                    int i = 1;
                    foreach (object so in ss)
                    {
                        var sd = Json.D(so);
                        stepStr += i++ + "." + Json.S(sd, "name") + (Json.S(sd, "type") == "signature" ? "✍️" : "") + (Json.B(sd, "independentOfAuthor") ? "🔒" : "") + " → ";
                    }
                }
                var l1 = Lab(stepStr.TrimEnd(' ', '→') + "（共 " + ss.Count + " 步）", F, Color.Black);
                l1.Location = new Point(12, 28); l1.MaximumSize = new Size(1140, 0);
                var l2 = Lab(Json.S(wd, "description"), FS, MUT2);
                l2.Location = new Point(12, 58); l2.MaximumSize = new Size(1140, 0);
                var b = Btn("＋ 新建记录", delegate { NewRecordDialog(h, wd); RefreshWorkflowCounts(h, tabs, wfs); }, true);
                b.Location = new Point(12, 92);
                g.Controls.Add(l1); g.Controls.Add(l2); g.Controls.Add(b);
                lf.Controls.Add(g);
            }
            tabs.TabPages.Add(lib);

            // ---- 我的记录 ----
            var recPage = new TabPage("我的记录");
            var rf = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(0) };
            recPage.Controls.Add(rf);
            ShowRecordList(h, rf, delegate(string key) { OpenRecordTab(h, tabs, key); });
            tabs.TabPages.Add(recPage);
        }

        static void RefreshWorkflowCounts(Host h, TabControl tabs, ArrayList wfs) { }

        public static void ShowRecordList(Host h, Panel parent, Action<string> open)
        {
            var g = Dgv("编号", "流程", "标题", "状态", "进度", "严重度", "期限", "提出人");
            g.Width = 1160; g.Height = 380;
            parent.Controls.Add(g);
            var refresh = Btn("刷新", delegate { RefreshRecords(h, g); }, false);
            parent.Controls.Add(refresh);
            RefreshRecords(h, g);
            g.CellDoubleClick += delegate(object s, DataGridViewCellEventArgs e)
            {
                if (e.RowIndex >= 0) open(Convert.ToString(g.Rows[e.RowIndex].Cells[0].Value));
            };
            var hint = Lab("双击行打开记录。记录为共享受控记录：不同角色账号按步骤角色门推进（含双要素电子签名）。", FS, MUT2);
            parent.Controls.Add(hint);
            if (h.Role == "admin")
            {
                parent.Controls.Add(Btn("↻ 重新生成演示记录", delegate
                {
                    Safe.Fetch(delegate { return h.Api.Post("/api/records/seed-demo", new Dictionary<string, object>()); },
                        delegate(object o)
                        {
                            long added = Json.I(Json.D(o), "added");
                            h.Status("已补充 " + added + " 条演示记录");
                            RefreshRecords(h, g);
                        },
                        delegate(string msg) { MessageBox.Show("重新生成失败：" + msg, "LeebertyCR", MessageBoxButtons.OK, MessageBoxIcon.Warning); });
                }, false));
            }
        }

        static void RefreshRecords(Host h, DataGridView g)
        {
            Safe.Fetch(delegate { return h.Api.Get("/api/records"); },
                delegate(object o)
                {
                    g.Rows.Clear();
                    var body = Json.D(o);
                    var records = Json.A(Json.G(body, "records"));
                    var defs = Json.A(Json.G(body, "types"));
                    if (records == null) return;
                    foreach (object ro in records)
                    {
                        var rd = Json.D(ro);
                        string pname = Json.S(rd, "processName");
                        string prog = Json.I(rd, "stepIndex") + "/" + Json.I(rd, "stepCount") + " 步";
                        string due = Json.S(rd, "dueDate");
                        string author = Json.S(Json.D(Json.G(rd, "author")), "name");
                        AddRow(g, Json.S(rd, "recordKey"), pname, Json.S(rd, "title"), Json.S(rd, "status"), prog, Json.S(rd, "criticality"), due, author);
                    }
                },
                delegate(string err) { h.Status("记录加载失败：" + err); });
        }

        /* ---- 新建记录对话框 ---- */

        static void NewRecordDialog(Host h, IDictionary<string, object> def)
        {
            var d = new Form { Text = "新建 " + Json.S(def, "name"), Width = 520, Height = 640, StartPosition = FormStartPosition.CenterParent, FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false, MinimizeBox = false, Font = F, AutoScroll = true };
            int y = 16;
            Dictionary<string, Control> inputs = new Dictionary<string, Control>();
            var fields = Json.A(Json.G(def, "fields"));
            if (fields != null)
                foreach (object fo in fields)
                {
                    var fd = Json.D(fo);
                    d.Controls.Add(new Label { Text = Json.S(fd, "label") + (Json.B(fd, "required") ? " *" : ""), Location = new Point(16, y + 3), AutoSize = true });
                    if (Json.S(fd, "type") == "select")
                    {
                        var cb = new ComboBox { Location = new Point(180, y), Width = 300, DropDownStyle = ComboBoxStyle.DropDownList };
                        var opts = Json.A(Json.G(fd, "options"));
                        if (opts != null) foreach (object x in opts) cb.Items.Add(Convert.ToString(x));
                        inputs[Json.S(fd, "key")] = cb;
                        d.Controls.Add(cb);
                    }
                    else if (Json.S(fd, "type") == "textarea")
                    {
                        var tb = new TextBox { Location = new Point(180, y), Width = 300, Multiline = true, Height = 44 };
                        inputs[Json.S(fd, "key")] = tb;
                        d.Controls.Add(tb);
                    }
                    else
                    {
                        var tb = new TextBox { Location = new Point(180, y), Width = 300 };
                        inputs[Json.S(fd, "key")] = tb;
                        d.Controls.Add(tb);
                    }
                    y += 64;
                }
            var err = new Label { Location = new Point(16, y + 4), Width = 470, Font = F, ForeColor = Color.FromArgb(185, 28, 28) };
            d.Controls.Add(err);
            var ok = new Button { Text = "创建记录", Location = new Point(260, y + 40), Width = 110, Font = FB, BackColor = BLUE2, ForeColor = Color.White, FlatStyle = FlatStyle.Flat };
            var cn = new Button { Text = "取消", Location = new Point(380, y + 40), Width = 90 };
            d.Controls.Add(ok); d.Controls.Add(cn);
            ok.Click += delegate
            {
                var values = new Dictionary<string, object>();
                bool missing = false;
                if (fields != null)
                    foreach (object fo in fields)
                    {
                        var fd = Json.D(fo);
                        string v = inputs.ContainsKey(Json.S(fd, "key")) ? Convert.ToString(inputs[Json.S(fd, "key")].Text) : "";
                        if (Json.S(fd, "type") == "select" && v.Length == 0 && Json.B(fd, "required")) { missing = true; break; }
                        values[Json.S(fd, "key")] = v;
                        if (Json.B(fd, "required") && v.Length == 0) missing = true;
                    }
                if (missing) { err.Text = "请填写全部必填项（带 * 的字段）。"; return; }
                string type = Json.S(def, "code");
                ok.Enabled = false;
                Safe.Fetch(delegate { return h.Api.Post("/api/records", new Dictionary<string, object> { { "type", type }, { "values", values } }); },
                    delegate(object o)
                    {
                        var rec = Json.D(o);
                        d.Close();
                        h.Nav("workflow");
                        OpenRecordTab(h, FindTabs(h.Win), Json.S(rec, "recordKey"));
                    },
                    delegate(string msg) { ok.Enabled = true; err.Text = msg; });
            };
            cn.Click += delegate { d.Close(); };
            d.ShowDialog(h.Win);
        }

        static TabControl FindTabs(MainWin win)
        {
            foreach (Control c in win.Controls)
            {
                var split = c as SplitContainer;
                if (split != null && split.Panel2.Controls.Count > 0)
                {
                    var tc = split.Panel2.Controls[0] as TabControl;
                    if (tc != null) return tc;
                }
            }
            return null;
        }

        /* ---- 记录详情页 ---- */

        public static void OpenRecordTab(Host h, TabControl tabs, string recordKey)
        {
            // 避免重复打开
            foreach (TabPage tp in tabs.TabPages)
                if (tp.Text == "记录 " + recordKey) { tabs.SelectedTab = tp; return; }
            var page = new TabPage("记录 " + recordKey);
            tabs.TabPages.Add(page);
            tabs.SelectedTab = page;
            var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(0) };
            page.Controls.Add(flow);
            Safe.Fetch(delegate { return h.Api.Get("/api/records/" + recordKey); },
                delegate(object o) { RenderRecord(h, tabs, page, flow, Json.D(o)); },
                delegate(string err)
                {
                    flow.Controls.Add(Lab("加载失败：" + err, F, Color.FromArgb(185, 28, 28)));
                    flow.Controls.Add(Btn("关闭页签", delegate { tabs.TabPages.Remove(page); }, false));
                });
        }

        static void RenderRecord(Host h, TabControl tabs, TabPage page, FlowLayoutPanel flow, IDictionary<string, object> rec)
        {
            LoadContent(h);
            var defs = Json.A(Json.G(Json.D(Json.G(h.Content, "workflows")), "workflows"));
            IDictionary<string, object> def = null;
            if (defs != null)
                foreach (object wo in defs)
                {
                    var wd = Json.D(wo);
                    if (Json.S(wd, "code") == Json.S(rec, "processCode")) { def = wd; break; }
                }

            var wrap = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, WrapContents = false, Width = 1000, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink };
            flow.Controls.Add(wrap);
            long stepIndexRec = Json.I(rec, "stepIndex");

            // 头部
            var head = Lab(Json.S(rec, "recordKey") + "  " + Json.S(rec, "processName") + (Json.B(rec, "demo") ? "（演示记录）" : ""), new Font("Microsoft YaHei UI", 14f, FontStyle.Bold), Color.Black);
            wrap.Controls.Add(head);
            var author = Json.D(Json.G(rec, "author"));
            wrap.Controls.Add(Lab("状态：" + Json.S(rec, "status") + " · 提出：" + Json.S(author, "name") + "（" + Json.S(author, "role") + "） · 期限：" + Json.S(rec, "dueDate") + " · 标题：" + Json.S(rec, "title"), F, MUT2));
            var data = Json.D(Json.G(rec, "data"));
            var rdata = Json.D(Json.G(data, "record"));
            if (rdata != null)
            {
                string kv = "";
                foreach (var kvp in rdata)
                {
                    if (kvp.Key == "title" || kvp.Key == "summary") continue;
                    if (kvp.Value == null || Convert.ToString(kvp.Value).Length == 0) continue;
                    kv += kvp.Key + "：" + Convert.ToString(kvp.Value) + "  ";
                }
                if (kv.Length > 0) wrap.Controls.Add(Lab(kv.Trim(), FS, MUT2));
            }

            // 步骤条（ListView）
            if (def != null)
            {
                var stepsList = new ListView { View = View.Details, Width = 1000, Height = 170, FullRowSelect = true, Font = F };
                stepsList.Columns.Add("步骤", 300);
                stepsList.Columns.Add("状态", 90);
                stepsList.Columns.Add("执行者", 120);
                stepsList.Columns.Add("签署", 180);
                stepsList.Columns.Add("→ 状态", 120);
                var ss = Json.A(Json.G(def, "steps"));
                var inst = Json.A(Json.G(rec, "steps"));
                long stepIndex = stepIndexRec;
                for (int i = 0; i < ss.Count; i++)
                {
                    var sd = Json.D(ss[i]);
                    string status = i < stepIndex ? "✓ 完成" : i == stepIndex ? "▶ 当前" : "待执行";
                    string actor = "";
                    string sig = "";
                    if (i < inst.Count)
                    {
                        var si = Json.D(inst[i]);
                        actor = Json.S(si, "completedByRole");
                        if (Json.S(si, "signedBy").Length > 0) sig = Json.S(si, "signedBy") + " · " + Json.S(sd, "signatureMeaning");
                    }
                    if (sig.Length == 0 && Json.S(sd, "type") == "signature") sig = "✍️ 需签名";
                    string mark = "";
                    if (Json.B(sd, "independentOfAuthor")) mark = " 🔒独立";
                    var lvi = new ListViewItem(i + 1 + ". " + Json.S(sd, "name") + mark);
                    lvi.SubItems.Add(status);
                    lvi.SubItems.Add(actor);
                    lvi.SubItems.Add(sig);
                    lvi.SubItems.Add(Json.S(sd, "onComplete"));
                    stepsList.Items.Add(lvi);
                }
                wrap.Controls.Add(stepsList);
            }

            // 历史
            var hist = Json.A(Json.G(rec, "history"));
            if (hist != null && hist.Count > 0)
            {
                var g = Dgv("时间", "动作", "角色", "用户", "步骤", "说明", "→");
                g.Width = 1000; g.Height = Math.Min(60 + hist.Count * 22, 200);
                for (int i = hist.Count - 1; i >= 0; i--)
                {
                    var hd = Json.D(hist[i]);
                    AddRow(g, Json.S(hd, "at"), Json.S(hd, "action"), Json.S(hd, "role"), Json.S(hd, "actor"), Json.S(hd, "stepCode"), Json.S(hd, "comment"), Json.S(hd, "to"));
                }
                wrap.Controls.Add(g);
            }

            // 当前步骤表单
            bool terminal = def != null && Contains(def, "terminalStates", Json.S(rec, "status"));
            if (!terminal && def != null && stepIndexRec < Json.A(Json.G(def, "steps")).Count)
            {
                RenderStepForm(h, tabs, page, flow, rec, def, wrap);
            }

            // 操作
            var ops = new FlowLayoutPanel { FlowDirection = FlowDirection.LeftToRight, WrapContents = true, Width = 1000, Padding = new Padding(0, 8, 0, 0) };
            if (!terminal)
            {
                var cancel = Btn("✖ 取消记录", delegate
                {
                    var inp = new TextBox { Multiline = true, Height = 60, Width = 400 };
                    var dd = new Form { Text = "取消理由", Width = 480, Height = 180, StartPosition = FormStartPosition.CenterParent, FormBorderStyle = FormBorderStyle.FixedDialog, Font = F };
                    dd.Controls.Add(inp);
                    var ok = new Button { Text = "确认取消", Location = new Point(260, 90), Width = 90 };
                    var cn = new Button { Text = "再想想", Location = new Point(360, 90), Width = 90 };
                    dd.Controls.Add(ok); dd.Controls.Add(cn);
                    ok.Click += delegate
                    {
                        if (inp.Text.Trim().Length < 5) { MessageBox.Show("取消必须说明理由（至少 5 个字）。", "LeebertyCR", MessageBoxButtons.OK, MessageBoxIcon.Information); return; }
                        Safe.Fetch(delegate { return h.Api.Post("/api/records/" + Json.S(rec, "recordKey") + "/cancel", new Dictionary<string, object> { { "reason", inp.Text.Trim() } }); },
                            delegate(object o) { dd.Close(); OpenRecordTab(h, tabs, Json.S(rec, "recordKey")); },
                            delegate(string msg) { MessageBox.Show(msg, "LeebertyCR", MessageBoxButtons.OK, MessageBoxIcon.Warning); });
                    };
                    cn.Click += delegate { dd.Close(); };
                    dd.ShowDialog(h.Win);
                }, false);
                ops.Controls.Add(cancel);
            }
            if (h.Role == "admin")
            {
                var del = Btn("🗑 删除（仅演示记录）", delegate
                {
                    if (MessageBox.Show("确定删除 " + Json.S(rec, "recordKey") + " 吗？（仅演示记录可删除，真实记录不可删除）", "LeebertyCR", MessageBoxButtons.OKCancel, MessageBoxIcon.Question) == DialogResult.OK)
                    {
                        Safe.Fetch(delegate { return h.Api.Delete("/api/records/" + Json.S(rec, "recordKey")); },
                            delegate(object o) { tabs.TabPages.Remove(page); h.Nav("workflow"); },
                            delegate(string msg) { MessageBox.Show(msg, "LeebertyCR", MessageBoxButtons.OK, MessageBoxIcon.Warning); });
                    }
                }, false);
                ops.Controls.Add(del);
            }
            var close = Btn("关闭页签", delegate { tabs.TabPages.Remove(page); }, false);
            ops.Controls.Add(close);
            ops.Controls.Add(Btn("📚 版本历史", delegate { ShowVersions(h, rec); }, false));
            ops.Controls.Add(Btn("⬇ 导出 CSV", delegate { ExportRecordCsv(h, rec); }, false));
            ops.Controls.Add(Btn("🖨 打印报告", delegate { PrintRecordReport(h, rec); }, false));
            if (Json.S(rec, "processCode") == "SAE-TRACK")
            {
                ops.Controls.Add(Btn("📤 生成 SAE 报送稿", delegate { ExportSaeDraft(h, rec); }, true));
                bool overdue;
                string dl = SaeDeadlineText(rec, out overdue);
                if (dl.Length > 0)
                {
                    var banner = Lab(dl, F, overdue ? Color.Firebrick : Color.FromArgb(22, 101, 52));
                    banner.Padding = new Padding(0, 4, 0, 4);
                    wrap.Controls.Add(banner);
                }
            }
            wrap.Controls.Add(ops);
        }

        /* ---- P0：版本历史 / 导出 / 打印（记录） ---- */

        static void ExportRecordCsv(Host h, IDictionary<string, object> rec)
        {
            var rows = new List<string[]>();
            rows.Add(new[] { "编号", "流程", "标题", "状态", "版本" });
            rows.Add(new[] { Json.S(rec, "recordKey"), Json.S(rec, "processName"), Json.S(rec, "title"), Json.S(rec, "status"), Json.S(rec, "recordVersion") });
            rows.Add(new string[0]);
            rows.Add(new[] { "步骤", "状态", "执行者", "签署", "完成时间" });
            var steps = Json.A(Json.G(rec, "steps"));
            if (steps != null)
                foreach (object so in steps)
                {
                    var sd = Json.D(so);
                    rows.Add(new[] { Json.S(sd, "code"), Json.S(sd, "status"), Json.S(sd, "completedByRole"), Json.S(sd, "signedBy"), Json.S(sd, "completedAt") });
                }
            rows.Add(new string[0]);
            rows.Add(new[] { "时间", "动作", "角色", "用户", "步骤", "说明", "→" });
            var hist = Json.A(Json.G(rec, "history"));
            if (hist != null)
                foreach (object ho in hist)
                {
                    var hd = Json.D(ho);
                    rows.Add(new[] { Json.S(hd, "at"), Json.S(hd, "action"), Json.S(hd, "role"), Json.S(hd, "actor"), Json.S(hd, "stepCode"), Json.S(hd, "comment"), Json.S(hd, "to") });
                }
            SaveTextFile(h, "导出记录", Json.S(rec, "recordKey") + ".csv", ToCsvText(rows));
        }

        static void PrintRecordReport(Host h, IDictionary<string, object> rec)
        {
            var lines = new List<string>();
            var author = Json.D(Json.G(rec, "author"));
            lines.Add("标题：" + Json.S(rec, "title"));
            lines.Add("状态：" + Json.S(rec, "status") + "  进度：" + Json.I(rec, "stepIndex") + "/" + Json.I(rec, "stepCount") + "  期限：" + Json.S(rec, "dueDate"));
            lines.Add("提出：" + Json.S(author, "name") + "（" + Json.S(author, "role") + "）  版本：" + Json.S(rec, "recordVersion"));
            lines.Add("");
            lines.Add("【步骤】");
            var steps = Json.A(Json.G(rec, "steps"));
            if (steps != null)
                foreach (object so in steps)
                {
                    var sd = Json.D(so);
                    lines.Add("- " + Json.S(sd, "code") + " | " + Json.S(sd, "status") + " | 执行：" + Json.S(sd, "completedByRole") + " | 签署：" + Json.S(sd, "signedBy"));
                }
            lines.Add("");
            lines.Add("【历史】");
            var hist = Json.A(Json.G(rec, "history"));
            if (hist != null)
                foreach (object ho in hist)
                {
                    var hd = Json.D(ho);
                    lines.Add(Json.S(hd, "at") + "  " + Json.S(hd, "action") + "  " + Json.S(hd, "role") + "  " + Json.S(hd, "actor") + "  " + Json.S(hd, "comment"));
                }
            PrintReport(h, "LeebertyCR 记录报告 " + Json.S(rec, "recordKey"), lines);
        }

        static void ShowVersions(Host h, IDictionary<string, object> rec)
        {
            string key = Json.S(rec, "recordKey");
            var d = new Form { Text = "版本历史 " + key, Width = 720, Height = 460, StartPosition = FormStartPosition.CenterParent, FormBorderStyle = FormBorderStyle.FixedDialog, Font = F };
            var lb = new ListBox { Dock = DockStyle.Top, Height = 170, Font = F };
            var info = new Label { Dock = DockStyle.Fill, Font = F, AutoSize = false, Padding = new Padding(10), ForeColor = Color.FromArgb(40, 60, 80) };
            d.Controls.Add(info);
            d.Controls.Add(new Label { Text = "每次变更（创建/推进/取消）都会沉淀完整快照；点击版本可查看当时状态。", Dock = DockStyle.Top, Font = FS, ForeColor = MUT2, AutoSize = false, Height = 24 });
            d.Controls.Add(lb);

            Safe.Fetch(delegate { return h.Api.Get("/api/records/" + key + "/versions"); },
                delegate(object o)
                {
                    var versions = Json.A(Json.G(Json.D(o), "versions"));
                    if (versions == null || versions.Count == 0)
                    {
                        info.Text = "（该记录没有版本快照——通常是早期演示数据）";
                        return;
                    }
                    foreach (object vo in versions)
                    {
                        var vd = Json.D(vo);
                        var item = new ListBoxItemProxy(Json.I(vd, "version"), "v" + Json.S(vd, "version") + "  " + Json.S(vd, "at") + "  " + Json.S(vd, "action") + " → " + Json.S(vd, "status"));
                        lb.Items.Add(item);
                    }
                },
                delegate(string msg) { info.Text = "加载失败：" + msg; });
            lb.SelectedIndexChanged += delegate
            {
                var sel = lb.SelectedItem as ListBoxItemProxy;
                if (sel == null) return;
                Safe.Fetch(delegate { return h.Api.Get("/api/records/" + key + "/versions/" + sel.Version); },
                    delegate(object o)
                    {
                        var body = Json.D(o);
                        var snap = Json.D(Json.G(body, "snapshot"));
                        if (snap == null) { info.Text = "（快照缺失）"; return; }
                        var persisted = Json.D(Json.G(snap, "persisted"));
                        string p = "";
                        if (persisted != null)
                            foreach (var kv in persisted)
                                p += kv.Key + "=" + Convert.ToString(kv.Value) + "  ";
                        info.Text = "版本 v" + Json.S(body, "version") + "  " + Json.S(body, "action") + "  " + Json.S(body, "at") + "\n" +
                            "状态：" + Json.S(snap, "status") + "  步骤进度：" + Json.I(snap, "stepIndex") + "  历史条数：" + Json.I(snap, "historyCount") + "\n" +
                            "标题：" + Json.S(snap, "title") + "\n流转摘要：" + p.Trim() + "\nsha256：" + Json.S(body, "hash");
                    },
                    delegate(string msg) { info.Text = "加载失败：" + msg; });
            };
            d.ShowDialog(h.Win);
        }

        class ListBoxItemProxy
        {
            public long Version;
            string Label;
            public ListBoxItemProxy(long v, string label) { Version = v; Label = label; }
            public override string ToString() { return Label; }
        }

        static bool Contains(IDictionary<string, object> def, string key, string value)
        {
            var arr = Json.A(Json.G(def, key));
            if (arr == null) return false;
            foreach (object o in arr) if (Convert.ToString(o) == value) return true;
            return false;
        }

        /* ---- 当前步骤表单 + 双要素签名 ---- */

        static void RenderStepForm(Host h, TabControl tabs, TabPage page, FlowLayoutPanel flow, IDictionary<string, object> rec, IDictionary<string, object> def, FlowLayoutPanel wrap)
        {
            var ss = Json.A(Json.G(def, "steps"));
            long stepIndex = Json.I(rec, "stepIndex");
            var step = Json.D(ss[(int)stepIndex]);
            string code = Json.S(step, "code");
            string recKey = Json.S(rec, "recordKey");

            var box = new GroupBox { Text = "▶ 当前步骤：" + Json.S(step, "name") + (Json.S(step, "type") == "signature" ? "（✍️ 双要素签名）" : ""), Font = FB, Width = 1000, Height = 60, Margin = new Padding(0, 8, 0, 0) };
            var gl = Lab("💡 " + Json.S(step, "guidance"), FS, TEAL2);
            gl.Location = new Point(12, 24); gl.MaximumSize = new Size(960, 0);
            box.Controls.Add(gl);
            box.Height = 46 + gl.Height;
            wrap.Controls.Add(box);

            // 角色门提示
            var roles = Json.A(Json.G(step, "role"));
            if (roles != null && !roles.Contains(h.Role) && !roles.Contains("*"))
            {
                string need = "";
                foreach (object r in roles) need += RoleLabel(h, Convert.ToString(r)) + " / ";
                wrap.Controls.Add(Lab("⚠ 角色门未通过：本步骤要求由 " + need.TrimEnd('/', ' ') + " 执行。当前账号「" + h.UserName + "」的角色是 " + RoleLabel(h, h.Role) + "。角色由账号决定——请退出登录（窗口右下角）后用对应角色账号登录。", F, Color.FromArgb(185, 28, 28)));
                var logout = Btn("退出登录（切换身份）", delegate { h.Win.Logout(); }, false);
                wrap.Controls.Add(logout);
                return;
            }
            // 独立复核门
            var author = Json.D(Json.G(rec, "author"));
            if (Json.B(step, "independentOfAuthor") && Json.S(author, "userId") == h.UserName)
            {
                wrap.Controls.Add(Lab("⚠ 独立复核门未通过：记录由你（" + Json.S(author, "name") + "）提出，本步骤要求独立复核（Annex 11 §12.1：提出人不能自己关闭/放行）。请退出后使用 " + (roles != null && roles.Contains("qa") ? "QA" : "研究者") + " 角色账号执行。", F, Color.FromArgb(185, 28, 28)));
                var logout = Btn("退出登录（切换身份）", delegate { h.Win.Logout(); }, false);
                wrap.Controls.Add(logout);
                return;
            }
            if (h.Role == "qa" && Json.B(step, "independentOfAuthor") && Json.S(author, "role") == "qa")
            {
                // qa 提出的记录不能由另一个 qa 账号关闭？独立门按账号比较，这里仅提示
            }

            var formPanel = new GroupBox { Text = "本步骤表单（" + RoleLabel(h, h.Role) + " 执行）", Font = FB, Width = 1000, Height = 100 };
            var inputs = new Dictionary<string, Control>();
            int y = 26;
            var form = Json.A(Json.G(step, "form"));
            if (form != null)
                foreach (object fo in form)
                {
                    var fd = Json.D(fo);
                    var lbl = new Label { Text = Json.S(fd, "label") + (Json.B(fd, "required") ? " *" : ""), Location = new Point(12, y + 3), AutoSize = true, Font = FS };
                    formPanel.Controls.Add(lbl);
                    if (Json.S(fd, "type") == "select")
                    {
                        var cb = new ComboBox { Location = new Point(330, y), Width = 300, DropDownStyle = ComboBoxStyle.DropDownList, Font = F };
                        var opts = Json.A(Json.G(fd, "options"));
                        if (opts != null) foreach (object x in opts) cb.Items.Add(Convert.ToString(x));
                        inputs[Json.S(fd, "key")] = cb;
                        formPanel.Controls.Add(cb);
                    }
                    else if (Json.S(fd, "type") == "textarea")
                    {
                        var tb = new TextBox { Location = new Point(330, y), Width = 620, Multiline = true, Height = 48, Font = F };
                        inputs[Json.S(fd, "key")] = tb;
                        formPanel.Controls.Add(tb);
                        y += 22;
                    }
                    else
                    {
                        var tb = new TextBox { Location = new Point(330, y), Width = 620, Font = F };
                        inputs[Json.S(fd, "key")] = tb;
                        formPanel.Controls.Add(tb);
                    }
                    y += 34;
                }
            formPanel.Height = Math.Max(90, y + 20);
            wrap.Controls.Add(formPanel);

            // 签名面板
            GroupBox sigBox = null;
            TextBox sigUser = null, sigPw = null, sigNonce = null, sigReason = null;
            Label nonceShow = null;
            if (Json.S(step, "type") == "signature")
            {
                sigBox = new GroupBox { Text = "✍️ 电子签名（两个独立要素 · 21 CFR 11.200(a)(1)(i)）", Font = FB, Width = 1000, Height = 200 };
                sigBox.Controls.Add(Lab("要素 A：标识码+口令（重新输入，不复用会话）；要素 B：一次性验证码（120 秒、单次、按人）。", FS, MUT2).At(12, 24));
                sigBox.Controls.Add(Lab("用户名（重新输入）：", FS, Color.Black).At(12, 52));
                sigBox.Controls.Add(new Label { Text = "口令：", Location = new Point(12, 82), AutoSize = true, Font = FS });
                sigUser = new TextBox { Location = new Point(150, 48), Width = 200, Font = F, Text = h.UserName };
                sigPw = new TextBox { Location = new Point(150, 78), Width = 200, UseSystemPasswordChar = true, Font = F };
                var nonceBtn = Btn("获取验证码", delegate
                {
                    Safe.Fetch(delegate { return h.Api.Post("/api/auth/challenge", new Dictionary<string, object>()); },
                        delegate(object o)
                        {
                            var ch = Json.D(o);
                            nonceShow.Text = "一次性验证码：" + Json.S(ch, "nonce") + "（" + Json.I(ch, "expiresInSec") + " 秒内有效、仅一次，请手动输入）";
                        },
                        delegate(string msg) { MessageBox.Show(msg, "LeebertyCR", MessageBoxButtons.OK, MessageBoxIcon.Warning); });
                }, false);
                nonceBtn.Location = new Point(360, 76);
                sigNonce = new TextBox { Location = new Point(150, 108), Width = 200, Font = FM };
                sigBox.Controls.Add(sigUser); sigBox.Controls.Add(sigPw); sigBox.Controls.Add(nonceBtn); sigBox.Controls.Add(sigNonce);
                sigBox.Controls.Add(Lab("一次性验证码：", FS, Color.Black).At(12, 112));
                nonceShow = new Label { Text = "", Location = new Point(360, 112), AutoSize = true, Font = FS, ForeColor = BLUE2 };
                sigBox.Controls.Add(nonceShow);
                sigBox.Controls.Add(Lab("签署说明（≥3 字）：", FS, Color.Black).At(12, 142));
                sigReason = new TextBox { Location = new Point(150, 138), Width = 400, Font = F };
                sigBox.Controls.Add(sigReason);
                var agree = new CheckBox { Text = "我确认以上信息如实填写，自愿签署；签署将被记录并关联到本记录", Location = new Point(12, 168), AutoSize = true, Font = FS };
                sigBox.Tag = agree;
                sigBox.Controls.Add(agree);
                sigBox.Height = 200;
                wrap.Controls.Add(sigBox);
            }

            var err = new Label { Font = F, ForeColor = Color.FromArgb(185, 28, 28), AutoSize = true, MaximumSize = new Size(980, 0) };
            wrap.Controls.Add(err);

            Button submit = null;
            submit = Btn(Json.S(step, "type") == "signature" ? "提交并签署（完成本步骤）" : "完成本步骤", delegate
            {
                var values = new Dictionary<string, object>();
                bool missing = false;
                if (form != null)
                    foreach (object fo in form)
                    {
                        var fd = Json.D(fo);
                        string v = inputs.ContainsKey(Json.S(fd, "key")) ? Convert.ToString(inputs[Json.S(fd, "key")].Text) : "";
                        values[Json.S(fd, "key")] = v;
                        if (Json.B(fd, "required") && v.Length == 0) missing = true;
                    }
                if (missing) { err.Text = "请填写本步骤全部必填项（带 * 的字段）。"; return; }
                var payload = new Dictionary<string, object> { { "code", code }, { "values", values } };
                if (Json.S(step, "type") == "signature")
                {
                    var agreeBox = (CheckBox)sigBox.Tag;
                    bool agreed = agreeBox.Checked;
                    payload["sign"] = new Dictionary<string, object> {
                        { "username", sigUser.Text.Trim() }, { "password", sigPw.Text },
                        { "nonce", sigNonce.Text.Trim() }, { "reason", sigReason.Text.Trim() }, { "agreed", agreed },
                    };
                }
                submit.Enabled = false;
                Safe.Fetch(delegate { return h.Api.Post("/api/records/" + recKey + "/step", payload); },
                    delegate(object o)
                    {
                        var rec2 = Json.D(o);
                        submit.Enabled = true;
                        err.Text = "";
                        OpenRecordTab(h, tabs, Json.S(rec2, "recordKey"));
                        h.Nav("workflow");
                    },
                    delegate(string msg)
                    {
                        submit.Enabled = true;
                        err.Text = msg;
                    });
            }, true);
            wrap.Controls.Add(submit);
        }

        static Label At(this Label l, int x, int y) { l.Location = new Point(x, y); return l; }

        /* ============================================================ 场景练习 = */

        public static void ShowQuiz(Host h, Panel p)
        {
            LoadContent(h);
            var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(0) };
            p.Controls.Add(flow);
            var qs = Json.A(Json.G(Json.D(Json.G(h.Content, "quiz")), "questions"));
            int idx = 0;
            int right = 0;
            var quiz = Json.D(Json.G(h.State, "quiz"));
            if (quiz == null) { quiz = new Dictionary<string, object>(); h.State["quiz"] = quiz; }
            var best = Json.D(Json.G(quiz, "best"));
            if (best == null) { best = new Dictionary<string, object>(); quiz["best"] = best; }
            string qk = h.Role == "cra" ? "cra" : h.Role == "crc" ? "crc" : "all";
            ListBox wrongs = new ListBox { Width = 980, Height = 160, Font = F };
            wrongs.Visible = false;

            Label qlab = null;
            RadioButton[] opts = new RadioButton[4];
            Label feed = null;
            Label prog = null;
            Button next = null;

            Action render = null;
            render = delegate
            {
                flow.Controls.Clear();
                flow.Controls.Add(Lab("场景练习（" + qs.Count + " 题 · 选完立即看解析 · 成绩计入本账号）", new Font("Microsoft YaHei UI", 13f, FontStyle.Bold), Color.Black));
                prog = Lab("第 " + (idx + 1) + " / " + qs.Count + " 题 · 已答对 " + right, F, MUT2);
                flow.Controls.Add(prog);
                if (idx >= qs.Count)
                {
                    flow.Controls.Add(Lab("本轮完成：" + right + " / " + qs.Count, new Font("Microsoft YaHei UI", 14f, FontStyle.Bold), Color.FromArgb(22, 101, 52)));
                    long cur = Json.I(best, qk);
                    if (right > cur) { best[qk] = (long)right; h.SaveState(); }
                    if (wrongs.Items.Count > 0)
                    {
                        flow.Controls.Add(Lab("错题回顾：", F, Color.FromArgb(150, 63, 3)));
                        flow.Controls.Add(wrongs);
                    }
                    var again = Btn("再练一轮", delegate { idx = 0; right = 0; wrongs.Items.Clear(); if (render != null) render(); }, true);
                    flow.Controls.Add(again);
                    return;
                }
                var q = Json.D(qs[idx]);
                qlab = Lab(Json.S(q, "q"), F, Color.Black);
                flow.Controls.Add(qlab);
                var rbWrap = new GroupBox { Text = "请选择", Font = FB, Width = 980, Height = 150 };
                opts = new RadioButton[4];
                int oy = 24;
                var options = Json.A(Json.G(q, "options"));
                for (int i = 0; i < options.Count; i++)
                {
                    opts[i] = new RadioButton { Text = Convert.ToString(options[i]), Location = new Point(14, oy), AutoSize = true, Font = F, Tag = i };
                    rbWrap.Controls.Add(opts[i]);
                    oy += 28;
                }
                flow.Controls.Add(rbWrap);
                feed = new Label { Font = F, ForeColor = Color.Black, AutoSize = true, MaximumSize = new Size(960, 0) };
                flow.Controls.Add(feed);
                var answer = Btn("判定", delegate
                {
                    int picked = -1;
                    for (int i = 0; i < 4; i++) if (opts[i] != null && opts[i].Checked) picked = i;
                    if (picked < 0) { feed.Text = "请先选择一个答案。"; return; }
                    long ans = Json.I(q, "answer");
                    bool correct = picked == ans;
                    if (correct) right++;
                    else wrongs.Items.Add(Json.S(q, "q"));
                    feed.Text = (correct ? "✔ 正确。" : "✘ 答错了。") + "\n解析：" + Json.S(q, "explain");
                    if (next != null) next.Visible = true;
                }, true);
                flow.Controls.Add(answer);
                next = Btn("下一题 →", delegate { idx++; if (render != null) render(); }, false);
                next.Visible = false;
                flow.Controls.Add(next);
            };
            render();
        }

        /* ============================================================ 案例学习 = */

        public static void ShowCases(Host h, Panel p)
        {
            LoadContent(h);
            var split = new SplitContainer { Dock = DockStyle.Fill, FixedPanel = FixedPanel.Panel1, SplitterDistance = 260, SplitterWidth = 4 };
            p.Controls.Add(split);
            var cases = Json.A(Json.G(Json.D(Json.G(h.Content, "cases")), "cases"));
            var lb = new ListBox { Dock = DockStyle.Fill, Font = F };
            Dictionary<int, object> idx = new Dictionary<int, object>();
            if (cases != null)
                foreach (object o in cases)
                {
                    idx[lb.Items.Count] = o;
                    lb.Items.Add(Json.S(Json.D(o), "title"));
                }
            split.Panel1.Controls.Add(lb);
            var detail = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(6, 0, 0, 0) };
            split.Panel2.Controls.Add(detail);

            Action<object> render = delegate(object o)
            {
                detail.Controls.Clear();
                var c = Json.D(o);
                detail.Controls.Add(Lab(Json.S(c, "title"), new Font("Microsoft YaHei UI", 13f, FontStyle.Bold), Color.Black));
                detail.Controls.Add(Lab("背景：" + Json.S(c, "background"), F, Color.Black));
                var finds = Json.A(Json.G(c, "findings"));
                string f = "";
                if (finds != null) foreach (object x in finds) f += "🔎 " + Convert.ToString(x) + "\n";
                detail.Controls.Add(Lab("核查发现：\n" + f.TrimEnd(), F, Color.FromArgb(120, 53, 15)));
                var hand = Json.A(Json.G(c, "handling"));
                string hs = "";
                if (hand != null) { int i = 1; foreach (object x in hand) hs += i++ + ". " + Convert.ToString(x) + "\n"; }
                detail.Controls.Add(Lab("处理：\n" + hs.TrimEnd(), F, Color.FromArgb(11, 79, 74)));
                detail.Controls.Add(Lab("💡 教训：" + Json.S(c, "lesson"), F, Color.FromArgb(76, 29, 149)));
            };
            lb.SelectedIndexChanged += delegate { if (lb.SelectedIndex >= 0 && idx.ContainsKey(lb.SelectedIndex)) render(idx[lb.SelectedIndex]); };
            if (cases != null && cases.Count > 0) lb.SelectedIndex = 0;
        }

        /* ============================================================ 账号与权限 = */

        public static void ShowSecurity(Host h, Panel p)
        {
            LoadContent(h);
            var tabs = new TabControl { Dock = DockStyle.Fill };
            p.Controls.Add(tabs);

            // 我的账号
            var mine = new TabPage("我的账号");
            var mf = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(0) };
            mine.Controls.Add(mf);
            mf.Controls.Add(Lab("账号：" + h.UserName + " · 姓名：" + Json.S(h.Me, "fullName") + " · 角色：" + RoleLabel(h, h.Role) + (Json.B(h.Me, "isDemo") ? "（演示账号）" : ""), new Font("Microsoft YaHei UI", 13f, FontStyle.Bold), Color.Black));
            mf.Controls.Add(Lab("上次登录：" + Json.S(h.Me, "lastLoginAt") + " · 临时口令待修改：" + (Json.B(h.Me, "mustChangePassword") ? "是" : "否"), FS, MUT2));
            var perms = Json.A(Json.G(h.Me, "permissions"));
            string ps = "";
            if (perms != null) foreach (object o in perms) ps += "  " + Convert.ToString(o);
            mf.Controls.Add(Lab("权限：" + ps.Trim(), FS, MUT2));
            var pwBox = new GroupBox { Text = "修改我的口令", Font = FB, Width = 560, Height = 150 };
            TextBox oldP = null, n1 = null, n2 = null;
            mf.Controls.Add(pwBox);
            pwBox.Controls.Add(Lab("原口令", FS, Color.Black).At(12, 26));
            oldP = new TextBox { Location = new Point(120, 22), Width = 200, UseSystemPasswordChar = true, Font = F };
            pwBox.Controls.Add(oldP);
            pwBox.Controls.Add(Lab("新口令（≥8 位，含 3 类字符）", FS, Color.Black).At(12, 56));
            n1 = new TextBox { Location = new Point(200, 52), Width = 200, UseSystemPasswordChar = true, Font = F };
            pwBox.Controls.Add(n1);
            pwBox.Controls.Add(Lab("重复新口令", FS, Color.Black).At(12, 86));
            n2 = new TextBox { Location = new Point(120, 82), Width = 200, UseSystemPasswordChar = true, Font = F };
            pwBox.Controls.Add(n2);
            var pwBtn = Btn("修改口令", delegate
            {
                if (n1.Text != n2.Text) { MessageBox.Show("两次输入的新口令不一致。", "LeebertyCR", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
                Safe.Fetch(delegate { return h.Api.Post("/api/auth/password", new Dictionary<string, object> { { "oldPassword", oldP.Text }, { "newPassword", n1.Text } }); },
                    delegate(object o) { MessageBox.Show("口令已修改。", "LeebertyCR", MessageBoxButtons.OK, MessageBoxIcon.Information); oldP.Text = n1.Text = n2.Text = ""; },
                    delegate(string msg) { MessageBox.Show(msg, "LeebertyCR", MessageBoxButtons.OK, MessageBoxIcon.Warning); });
            }, true);
            pwBtn.Location = new Point(340, 110);
            pwBox.Controls.Add(pwBtn);
            tabs.TabPages.Add(mine);

            // 权限矩阵（登录用户可见）
            var matrix = new TabPage("权限矩阵");
            var mf2 = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true };
            matrix.Controls.Add(mf2);
            var roles = Json.D(Json.G(h.Meta, "roles"));
            var permsAll = Json.A(Json.G(h.Meta, "permissions"));
            var g = Dgv("权限", "CRA", "CRC", "研究者", "QA", "管理员");
            g.Width = 900; g.Height = Math.Min(60 + permsAll.Count * 22, 480);
            foreach (object po in permsAll)
            {
                string perm = Convert.ToString(po);
                string[] cells = new string[6];
                cells[0] = perm;
                string[] rks = { "cra", "crc", "pi", "qa", "admin" };
                for (int i = 0; i < 5; i++)
                {
                    var r = Json.D(Json.G(roles, rks[i]));
                    var rp = Json.A(Json.G(r, "permissions"));
                    bool has = false;
                    if (rp != null) foreach (object x in rp) if (Convert.ToString(x) == perm) has = true;
                    cells[i + 1] = has ? "✓" : "—";
                }
                AddRow(g, cells);
            }
            mf2.Controls.Add(g);
            mf2.Controls.Add(Lab("系统管理员持全部权限，但工作流步骤的角色门不含 admin——不能作为 GxP 记录的唯一签署人。", FS, MUT2));
            tabs.TabPages.Add(matrix);

            // 用户管理（仅 admin）
            if (h.Role == "admin") tabs.TabPages.Add(AdminUsersTab(h));
            // 安全日志（admin / qa）
            if (h.Role == "admin" || h.Role == "qa") tabs.TabPages.Add(AuditTab(h));
        }

        static TabPage AdminUsersTab(Host h)
        {
            var t = new TabPage("用户管理");
            var f = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(0) };
            t.Controls.Add(f);
            var g = Dgv("用户名", "姓名", "角色", "状态", "上次登录", "演示");
            g.Width = 1000; g.Height = 300;
            f.Controls.Add(g);

            Action refresh = delegate
            {
                Safe.Fetch(delegate { return h.Api.Get("/api/users"); },
                    delegate(object o)
                    {
                        g.Rows.Clear();
                        var users = Json.A(Json.G(Json.D(o), "users"));
                        if (users == null) return;
                        foreach (object uo in users)
                        {
                            var ud = Json.D(uo);
                            AddRow(g, Json.S(ud, "username"), Json.S(ud, "fullName"), Json.S(ud, "role"), Json.S(ud, "status"), Json.S(ud, "lastLoginAt"), Json.B(ud, "isDemo") ? "演示" : "");
                        }
                    },
                    delegate(string msg) { h.Status("用户加载失败：" + msg); });
            };
            refresh();

            var row = new FlowLayoutPanel { FlowDirection = FlowDirection.LeftToRight, WrapContents = true, Width = 1000 };
            row.Controls.Add(Btn("＋ 新建用户", delegate { NewUserDialog(h, refresh); }, true));
            row.Controls.Add(Btn("重置口令（所选）", delegate
            {
                if (g.SelectedRows.Count == 0) { MessageBox.Show("请先选择一行。", "LeebertyCR", MessageBoxButtons.OK, MessageBoxIcon.Information); return; }
                string uname = Convert.ToString(g.SelectedRows[0].Cells[0].Value);
                Safe.Fetch(delegate { return h.Api.Post("/api/users/" + uname + "/reset-password", new Dictionary<string, object>()); },
                    delegate(object o)
                    {
                        var r = Json.D(o);
                        MessageBox.Show("为 " + uname + " 签发的临时口令（仅显示一次，首次登录须修改）：\n\n" + Json.S(r, "tempPassword"), "LeebertyCR", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    },
                    delegate(string msg) { MessageBox.Show(msg, "LeebertyCR", MessageBoxButtons.OK, MessageBoxIcon.Warning); });
            }, false));
            row.Controls.Add(Btn("禁用/启用（所选）", delegate
            {
                if (g.SelectedRows.Count == 0) return;
                string uname = Convert.ToString(g.SelectedRows[0].Cells[0].Value);
                string status = Convert.ToString(g.SelectedRows[0].Cells[3].Value);
                string next = status == "active" ? "disabled" : "active";
                Safe.Fetch(delegate { return h.Api.Put("/api/users/" + uname + "/status", new Dictionary<string, object> { { "status", next } }); },
                    delegate(object o) { refresh(); },
                    delegate(string msg) { MessageBox.Show(msg, "LeebertyCR", MessageBoxButtons.OK, MessageBoxIcon.Warning); });
            }, false));
            row.Controls.Add(Btn("删除（非所选本人）", delegate
            {
                if (g.SelectedRows.Count == 0) return;
                string uname = Convert.ToString(g.SelectedRows[0].Cells[0].Value);
                if (MessageBox.Show("确定删除账号 " + uname + " 吗？", "LeebertyCR", MessageBoxButtons.OKCancel, MessageBoxIcon.Question) == DialogResult.OK)
                {
                    Safe.Fetch(delegate { return h.Api.Delete("/api/users/" + uname); },
                        delegate(object o) { refresh(); },
                        delegate(string msg) { MessageBox.Show(msg, "LeebertyCR", MessageBoxButtons.OK, MessageBoxIcon.Warning); });
                }
            }, false));
            f.Controls.Add(row);
            return t;
        }

        static void NewUserDialog(Host h, Action after)
        {
            var d = new Form { Text = "新建用户", Width = 480, Height = 300, StartPosition = FormStartPosition.CenterParent, FormBorderStyle = FormBorderStyle.FixedDialog, Font = F };
            TextBox uname = new TextBox { Location = new Point(140, 16), Width = 280 };
            TextBox full = new TextBox { Location = new Point(140, 48), Width = 280 };
            ComboBox role = new ComboBox { Location = new Point(140, 80), Width = 280, DropDownStyle = ComboBoxStyle.DropDownList };
            foreach (string r in new[] { "cra", "crc", "pi", "qa", "admin" }) role.Items.Add(r);
            role.SelectedIndex = 0;
            TextBox dept = new TextBox { Location = new Point(140, 112), Width = 280 };
            TextBox pw = new TextBox { Location = new Point(140, 144), Width = 280 };
            d.Controls.Add(Lab("用户名", FS, Color.Black).At(16, 20));
            d.Controls.Add(Lab("姓名", FS, Color.Black).At(16, 52));
            d.Controls.Add(Lab("角色", FS, Color.Black).At(16, 84));
            d.Controls.Add(Lab("部门", FS, Color.Black).At(16, 116));
            d.Controls.Add(Lab("初始口令（留空则签发临时口令）", FS, Color.Black).At(16, 148));
            d.Controls.Add(uname); d.Controls.Add(full); d.Controls.Add(role); d.Controls.Add(dept); d.Controls.Add(pw);
            var err = new Label { Location = new Point(16, 180), Width = 420, Font = FS, ForeColor = Color.FromArgb(185, 28, 28) };
            d.Controls.Add(err);
            var ok = new Button { Text = "创建", Location = new Point(240, 210), Width = 100, Font = FB, BackColor = BLUE2, ForeColor = Color.White, FlatStyle = FlatStyle.Flat };
            var cn = new Button { Text = "取消", Location = new Point(350, 210), Width = 90 };
            d.Controls.Add(ok); d.Controls.Add(cn);
            ok.Click += delegate
            {
                ok.Enabled = false;
                Safe.Fetch(delegate
                {
                    return h.Api.Post("/api/users", new Dictionary<string, object> {
                        { "username", uname.Text.Trim() }, { "fullName", full.Text.Trim() }, { "role", Convert.ToString(role.SelectedItem) },
                        { "department", dept.Text.Trim() }, { "password", pw.Text },
                    });
                },
                delegate(object o)
                {
                    var r = Json.D(o);
                    string temp = Json.S(r, "tempPassword");
                    d.Close();
                    if (after != null) after();
                    if (temp.Length > 0)
                        MessageBox.Show("临时口令（仅显示一次，首次登录须修改）：\n\n" + temp, "LeebertyCR", MessageBoxButtons.OK, MessageBoxIcon.Information);
                },
                delegate(string msg) { ok.Enabled = true; err.Text = msg; });
            };
            cn.Click += delegate { d.Close(); };
            d.ShowDialog(h.Win);
        }

        static TabPage AuditTab(Host h)
        {
            var t = new TabPage("安全日志");
            var f = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(0) };
            t.Controls.Add(f);
            f.Controls.Add(Lab("安全日志（只追加 · 最近 100 条 · " + RoleLabel(h, h.Role) + " 可见）", F, Color.Black));
            var g = Dgv("时间", "事件", "用户", "说明");
            g.Width = 1000; g.Height = 420;
            f.Controls.Add(g);
            Safe.Fetch(delegate { return h.Api.Get("/api/audit?limit=100"); },
                delegate(object o)
                {
                    var body = Json.D(o);
                    var chain = Json.D(Json.G(body, "chain"));
                    bool chainOk = chain != null && Json.B(chain, "ok");
                    f.Controls.Add(Lab(
                        "审计链（HMAC 哈希链）：" + (chainOk ? "完整 ✓ 共 " + Json.I(chain, "count") + " 条（任何篡改会在此标红并给出断点）" : "已破坏！" + Json.S(chain, "error")),
                        F, chainOk ? Color.FromArgb(22, 101, 52) : Color.FromArgb(185, 28, 28)));
                    var entries = Json.A(Json.G(body, "entries"));
                    if (entries == null) return;
                    for (int i = entries.Count - 1; i >= 0; i--)
                    {
                        var e = Json.D(entries[i]);
                        AddRow(g, Json.S(e, "at"), Json.S(e, "event"), Json.S(e, "username"), Json.S(e, "reason") + " " + Json.S(e, "note"));
                    }
                },
                delegate(string msg) { h.Status("日志加载失败：" + msg); });
            return t;
        }
    }
}