using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;

namespace LeebertyCR
{
    /// <summary>
    /// P1：受试者登记册（伪匿名）+ 访视与日历 + 简易 eCRF 表单录入（含逻辑核查）+ 入组漏斗。
    /// 与网页端共用 /api/subjects* 接口，服务端做权威校验。
    /// </summary>
    public partial class Views
    {
        public static void ShowSubjects(Host h, Panel p)
        {
            var tabs = new TabControl { Dock = DockStyle.Fill };
            p.Controls.Add(tabs);

            tabs.TabPages.Add(RegistryTab(h, tabs));
            tabs.TabPages.Add(CalendarTab(h));
            tabs.TabPages.Add(FunnelTab(h));
        }

        /* ------------------------------------------------------------------ 登记册 */

        static TabPage RegistryTab(Host h, TabControl tabs)
        {
            var page = new TabPage("受试者登记册");
            var top = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 44, WrapContents = false, Padding = new Padding(0, 6, 0, 0) };
            var filter = new ComboBox { Width = 150, Font = F, DropDownStyle = ComboBoxStyle.DropDownList };
            filter.Items.AddRange(new object[] { "全部状态", "筛选 screened", "已入组 enrolled", "随访中 ongoing", "已完成 completed", "已退出 withdrawn", "筛选失败 screen_failed" });
            filter.SelectedIndex = 0;
            var search = new TextBox { Width = 170, Font = F };
            var detail = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(0) };
            var grid = Dgv("编号", "中心", "状态", "知情", "入组", "访视", "下次访视", "备注");
            grid.Dock = DockStyle.Top;
            grid.Height = 300;

            string currentSubject = null;
            Action reload = null;
            Action loadDetail = null;

            loadDetail = delegate
            {
                detail.Controls.Clear();
                if (currentSubject == null)
                {
                    detail.Controls.Add(Lab("← 在上表中选择一位受试者以查看访视计划与 eCRF 数据。", FS, MUT2));
                    return;
                }
                Safe.Fetch(delegate { return h.Api.Get("/api/subjects/" + currentSubject); },
                    delegate(object o)
                    {
                        var s = Json.D(o);
                        if (s == null) return;
                        var head = new GroupBox { Text = "受试者 " + Json.S(s, "subjectNo") + " · " + Json.S(s, "site"), Font = FB, Width = 1160, Height = 108 };
                        string info = "状态：" + StatusCn(Json.S(s, "status"))
                            + "　筛选：" + Json.S(s, "screenDate")
                            + "　知情同意：" + (Json.S(s, "consentDate") == "" ? "—" : Json.S(s, "consentDate"))
                            + "　入组：" + (Json.S(s, "enrolledDate") == "" ? "—" : Json.S(s, "enrolledDate"))
                            + "　队列：" + (Json.S(s, "cohort") == "" ? "—" : Json.S(s, "cohort"));
                        var l1 = Lab(info, F, Color.Black); l1.Location = new Point(12, 26); l1.MaximumSize = new Size(1130, 0);
                        var note = Lab("备注：" + (Json.S(s, "note") == "" ? "—" : Json.S(s, "note")), FS, MUT2);
                        note.Location = new Point(12, 52); note.MaximumSize = new Size(1130, 0);
                        var btns = new FlowLayoutPanel { Location = new Point(10, 74), Width = 1130, Height = 30, WrapContents = false };
                        btns.Controls.Add(Btn("＋ 登记访视", delegate { AddVisitDialog(h, Json.S(s, "id"), delegate { loadDetail(); reload(); }); }, false));
                        btns.Controls.Add(Btn("变更状态", delegate { ChangeStatusDialog(h, s, delegate { loadDetail(); reload(); }); }, false));
                        head.Controls.Add(l1); head.Controls.Add(note); head.Controls.Add(btns);
                        detail.Controls.Add(head);

                        var vg = Dgv("访视", "计划日期", "实际日期", "窗口", "状态", "eCRF", "录入人");
                        vg.Width = 1160; vg.Height = 200;
                        var visits = Json.A(Json.G(s, "visits"));
                        if (visits != null)
                            foreach (object vo in visits)
                            {
                                var v = Json.D(vo);
                                AddRow(vg, Json.S(v, "name"), Json.S(v, "plannedDate"), Json.S(v, "actualDate"),
                                    Json.S(v, "window"), StatusCn(Json.S(v, "status")),
                                    (Json.S(v, "formId") == "" ? "—" : (Json.A(Json.G(Json.D(Json.G(v, "data")), "x")) == null ? "已录入" : "—")),
                                    Json.S(v, "by"));
                            }
                        detail.Controls.Add(vg);
                        detail.Controls.Add(Lab("双击行 → 录入/修改 eCRF 数据（服务端执行逻辑核查：必填、范围、跨字段矛盾）。", FS, MUT2));

                        var subjectsByNo = new Dictionary<int, IDictionary<string, object>>();
                        int idx = 0;
                        if (visits != null)
                            foreach (object vo in visits) subjectsByNo[idx++] = Json.D(vo);
                        vg.CellDoubleClick += delegate(object sender, DataGridViewCellEventArgs e)
                        {
                            if (e.RowIndex < 0) return;
                            IDictionary<string, object> v;
                            if (!subjectsByNo.TryGetValue(e.RowIndex, out v)) return;
                            EcrfDialog(h, Json.S(s, "id"), v, delegate { loadDetail(); reload(); });
                        };
                    },
                    delegate(string msg) { detail.Controls.Add(Lab("加载失败：" + msg, F, Color.Firebrick)); });
            };

            grid.CellClick += delegate(object sender, DataGridViewCellEventArgs e)
            {
                if (e.RowIndex < 0) return;
                currentSubject = Convert.ToString(grid.Rows[e.RowIndex].Cells[0].Value);
                loadDetail();
            };

            reload = delegate
            {
                string st = null;
                if (filter.SelectedIndex > 0) st = filter.SelectedItem.ToString().Split(' ')[1];
                string qs = "/api/subjects?status=" + (st ?? "") + "&search=" + Uri.EscapeDataString(search.Text.Trim());
                Safe.Fetch(delegate { return h.Api.Get(qs); },
                    delegate(object o)
                    {
                        var body = Json.D(o);
                        var subs = Json.A(Json.G(body, "subjects"));
                        grid.Rows.Clear();
                        if (subs == null) return;
                        foreach (object so in subs)
                        {
                            var s = Json.D(so);
                            var next = Json.D(Json.G(s, "nextVisit"));
                            AddRow(grid, Json.S(s, "subjectNo"), Json.S(s, "site"), StatusCn(Json.S(s, "status")),
                                Json.S(s, "consentDate"), Json.S(s, "enrolledDate"),
                                Json.I(s, "visitsDone") + "/" + Json.I(s, "visitCount"),
                                next == null ? "—" : (Json.S(next, "name") + " " + Json.S(next, "plannedDate")),
                                Json.S(s, "note"));
                        }
                        grid.ClearSelection();
                    },
                    delegate(string msg) { h.Status("受试者加载失败：" + msg); });
            };

            var addBtn = Btn("＋ 登记受试者", delegate { NewSubjectDialog(h, delegate { reload(); }); }, true);
            var reseed = Btn("↻ 重新生成演示受试者", delegate
            {
                Safe.Fetch(delegate { return h.Api.Post("/api/subjects/seed-demo", new Dictionary<string, object>()); },
                    delegate(object o) { h.Status("已补充 " + Json.I(Json.D(o), "added") + " 位演示受试者"); reload(); },
                    delegate(string msg) { MessageBox.Show("失败：" + msg, "LeebertyCR", MessageBoxButtons.OK, MessageBoxIcon.Warning); });
            }, false);
            var refresh = Btn("刷新", delegate { reload(); }, false);
            filter.SelectedIndexChanged += delegate { reload(); };
            search.TextChanged += delegate { reload(); };

            top.Controls.Add(addBtn);
            if (h.Role == "admin") top.Controls.Add(reseed);
            top.Controls.Add(filter);
            top.Controls.Add(search);
            top.Controls.Add(refresh);

            var hint = Lab("伪匿名原则：只用「中心 + 受试者编号」标识，不采集姓名/身份证/联系方式。该编号与受试者身份识别码的对应表应保存在研究中心，不进数据库。", FS, MUT2);
            hint.Padding = new Padding(0, 6, 0, 6);

            page.Controls.Add(detail);
            page.Controls.Add(grid);
            page.Controls.Add(hint);
            page.Controls.Add(top);
            tabs.TabPages.Add(new TabPage());
            reload();
            loadDetail();
            return page;
        }

        static string StatusCn(string s)
        {
            switch (s)
            {
                case "screened": return "筛选";
                case "enrolled": return "已入组";
                case "ongoing": return "随访中";
                case "completed": return "已完成";
                case "withdrawn": return "已退出";
                case "screen_failed": return "筛选失败";
                case "planned": return "计划中";
                case "done": return "已完成";
                case "missed": return "已错过";
                case "cancelled": return "已取消";
                default: return s;
            }
        }

        /* ------------------------------------------------------------------ 日历 */

        static TabPage CalendarTab(Host h)
        {
            var page = new TabPage("访视日历与提醒");
            var top = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 44, WrapContents = false, Padding = new Padding(0, 6, 0, 0) };
            var days = new ComboBox { Width = 140, Font = F, DropDownStyle = ComboBoxStyle.DropDownList };
            days.Items.AddRange(new object[] { "未来 14 天", "未来 30 天", "未来 60 天", "未来 90 天" });
            days.SelectedIndex = 1;
            var grid = Dgv("计划日期", "剩余天数", "受试者", "中心", "访视", "类型", "状态");
            grid.Dock = DockStyle.Top;
            grid.Height = 420;
            var warning = Lab("", F, Color.Firebrick);

            Action reload = null;
            reload = delegate
            {
                int d = 14;
                if (days.SelectedIndex == 1) d = 30;
                if (days.SelectedIndex == 2) d = 60;
                if (days.SelectedIndex == 3) d = 90;
                Safe.Fetch(delegate { return h.Api.Get("/api/subjects/upcoming?days=" + d); },
                    delegate(object o)
                    {
                        var visits = Json.A(Json.G(Json.D(o), "visits"));
                        grid.Rows.Clear();
                        int overdue = 0;
                        if (visits == null) return;
                        foreach (object vo in visits)
                        {
                            var v = Json.D(vo);
                            bool od = Json.B(v, "overdue");
                            if (od) overdue++;
                            long left = Json.I(v, "days");
                            AddRow(grid, Json.S(v, "plannedDate"), od ? "逾期 " + Math.Abs(left) + " 天" : "还有 " + left + " 天",
                                Json.S(v, "subjectNo"), Json.S(v, "site"), Json.S(v, "visit"), Json.S(v, "visitType"),
                                od ? "⚠ 需要立即跟进（超窗=方案偏离风险）" : "计划中");
                            if (od && grid.Rows.Count > 0) grid.Rows[grid.Rows.Count - 1].DefaultCellStyle.ForeColor = Color.Firebrick;
                        }
                        warning.Text = overdue > 0 ? "⚠ 有 " + overdue + " 个访视已逾期：超窗未做将构成方案偏离，需尽快联系中心并留痕。" : "✓ 当前没有逾期访视。";
                    },
                    delegate(string msg) { warning.Text = "加载失败：" + msg; });
            };

            days.SelectedIndexChanged += delegate { reload(); };
            var ics = Btn("⬇ 导出日历（.ics，可导入 Outlook/Google 日历）", delegate
            {
                Safe.Fetch(delegate { return h.Api.RawGet("/api/subjects/calendar.ics?days=90"); },
                    delegate(object o)
                    {
                        string text = Convert.ToString(o);
                        SaveAnyFile(h, "导出访视日历", "visit-calendar.ics", text, "iCalendar (*.ics)|*.ics|所有文件 (*.*)|*.*");
                    },
                    delegate(string msg) { MessageBox.Show("导出失败：" + msg, "LeebertyCR", MessageBoxButtons.OK, MessageBoxIcon.Warning); });
            }, false);
            top.Controls.Add(days);
            top.Controls.Add(Btn("刷新", delegate { reload(); }, false));
            top.Controls.Add(ics);

            page.Controls.Add(grid);
            page.Controls.Add(warning);
            page.Controls.Add(top);
            reload();
            return page;
        }

        /* ------------------------------------------------------------------ 入组漏斗 */

        static TabPage FunnelTab(Host h)
        {
            var page = new TabPage("入组漏斗与统计");
            var panel = new Panel { Dock = DockStyle.Fill, AutoScroll = true };
            var chart = new FunnelChart { Dock = DockStyle.Top, Height = 250 };
            var grid = Dgv("阶段", "例数", "相对筛选占比");
            grid.Dock = DockStyle.Top;
            grid.Height = 200;
            var monthly = Dgv("月份", "入组/筛选例数");
            monthly.Dock = DockStyle.Top;
            monthly.Height = 160;
            var statsLabel = Lab("", F, Color.Black);

            panel.Controls.Add(monthly);
            panel.Controls.Add(grid);
            panel.Controls.Add(chart);
            panel.Controls.Add(statsLabel);
            page.Controls.Add(panel);

            Safe.Fetch(delegate { return h.Api.Get("/api/subjects"); },
                delegate(object o)
                {
                    var st = Json.D(Json.G(Json.D(o), "stats"));
                    if (st == null) return;
                    var funnel = Json.A(Json.G(st, "funnel"));
                    long total = Json.I(st, "screened");
                    var rows = new List<KeyValuePair<string, long>>();
                    if (funnel != null)
                        for (int i = 0; i < funnel.Count; i++)
                        {
                            var f = Json.D(funnel[i]);
                            rows.Add(new KeyValuePair<string, long>(Json.S(f, "stage"), Json.I(f, "count")));
                        }
                    chart.Data = rows;
                    chart.Invalidate();
                    foreach (var kv in rows)
                    {
                        string pct = total > 0 ? Math.Round(kv.Value * 100.0 / total, 1) + "%" : "—";
                        AddRow(grid, kv.Key, kv.Value.ToString(), pct);
                    }
                    var months = Json.A(Json.G(st, "byMonth"));
                    if (months != null)
                        foreach (object mo in months)
                        {
                            var m = Json.D(mo);
                            AddRow(monthly, Json.S(m, "month"), Json.I(m, "count").ToString());
                        }
                    statsLabel.Text = "合计受试者 " + total + " 例　入组 " + Json.I(st, "enrolled") + " 例　随访中 " + Json.I(st, "ongoing")
                        + " 例　完成 " + Json.I(st, "completed") + " 例　退出 " + Json.I(st, "withdrawn") + " 例　筛选失败 " + Json.I(st, "screenFailed")
                        + " 例　筛选失败率 " + Json.S(st, "screenFailureRate") + "%　知情同意率 " + Json.S(st, "consentRate") + "%";
                },
                delegate(string msg) { statsLabel.Text = "加载失败：" + msg; });
            return page;
        }

        /* ------------------------------------------------------------------ 对话框 */

        public static void SaveAnyFile(Host h, string title, string defaultName, string content, string filter)
        {
            var dlg = new SaveFileDialog { Title = title, FileName = defaultName, Filter = filter, AddExtension = true };
            if (dlg.ShowDialog(h.Win) != DialogResult.OK) return;
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

        static void NewSubjectDialog(Host h, Action done)
        {
            var d = new Form { Text = "登记受试者（伪匿名）", Width = 520, Height = 420, StartPosition = FormStartPosition.CenterParent, FormBorderStyle = FormBorderStyle.FixedDialog, Font = F };
            var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, Padding = new Padding(14), AutoScroll = true };
            var no = new TextBox { Width = 180, Font = F };
            var site = new TextBox { Width = 320, Font = F, Text = "演示中心 A" };
            var protocol = new TextBox { Width = 320, Font = F, Text = "DEMO-2026-001 v1.0" };
            var cohort = new TextBox { Width = 180, Font = F };
            var consent = new TextBox { Width = 180, Font = F, Text = DateTime.Now.ToString("yyyy-MM-dd") };
            var status = new ComboBox { Width = 180, Font = F, DropDownStyle = ComboBoxStyle.DropDownList };
            status.Items.AddRange(new object[] { "筛选 screened", "已入组 enrolled", "随访中 ongoing" });
            status.SelectedIndex = 0;
            var note = new TextBox { Width = 440, Font = F, Multiline = true, Height = 56 };
            var err = Lab("", FS, Color.Firebrick);

            flow.Controls.Add(Lab("受试者编号（3–6 位数字，如 1005）——不要填姓名或身份证号：", F, Color.Black));
            flow.Controls.Add(no);
            flow.Controls.Add(Lab("中心：", F, Color.Black)); flow.Controls.Add(site);
            flow.Controls.Add(Lab("方案编号：", F, Color.Black)); flow.Controls.Add(protocol);
            flow.Controls.Add(Lab("队列/组别（可选）：", F, Color.Black)); flow.Controls.Add(cohort);
            flow.Controls.Add(Lab("知情同意日期（YYYY-MM-DD）：", F, Color.Black)); flow.Controls.Add(consent);
            flow.Controls.Add(Lab("初始状态：", F, Color.Black)); flow.Controls.Add(status);
            flow.Controls.Add(Lab("备注：", F, Color.Black)); flow.Controls.Add(note);
            flow.Controls.Add(err);

            var ok = Btn("登记", null, true);
            ok.Click += delegate
            {
                var body = new Dictionary<string, object>
                {
                    { "subjectNo", no.Text.Trim() },
                    { "site", site.Text.Trim() },
                    { "protocolCode", protocol.Text.Trim() },
                    { "cohort", cohort.Text.Trim() },
                    { "consentDate", consent.Text.Trim() },
                    { "note", note.Text.Trim() },
                    { "status", status.SelectedItem.ToString().Split(' ')[1] },
                };
                Safe.Fetch(delegate { return h.Api.Post("/api/subjects", body); },
                    delegate(object o)
                    {
                        h.Status("已登记受试者 " + Json.S(Json.D(o), "subjectNo"));
                        d.Close();
                        done();
                    },
                    delegate(string msg) { err.Text = msg; });
            };
            var cancel = Btn("取消", delegate { d.Close(); }, false);
            var btns = new FlowLayoutPanel { Width = 460, Height = 40, WrapContents = false };
            btns.Controls.Add(ok); btns.Controls.Add(cancel);
            flow.Controls.Add(btns);
            d.Controls.Add(flow);
            d.ShowDialog(h.Win);
        }

        static void ChangeStatusDialog(Host h, IDictionary<string, object> subject, Action done)
        {
            var d = new Form { Text = "变更受试者状态", Width = 460, Height = 260, StartPosition = FormStartPosition.CenterParent, FormBorderStyle = FormBorderStyle.FixedDialog, Font = F };
            var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, Padding = new Padding(14) };
            var status = new ComboBox { Width = 200, Font = F, DropDownStyle = ComboBoxStyle.DropDownList };
            status.Items.AddRange(new object[] { "筛选 screened", "已入组 enrolled", "随访中 ongoing", "已完成 completed", "已退出 withdrawn", "筛选失败 screen_failed" });
            status.SelectedIndex = Math.Max(0, status.Items.IndexOf(StatusCn(Json.S(subject, "status")) + " " + Json.S(subject, "status")));
            var reason = new TextBox { Width = 380, Font = F, Multiline = true, Height = 56 };
            var err = Lab("", FS, Color.Firebrick);
            flow.Controls.Add(Lab("新状态：", F, Color.Black)); flow.Controls.Add(status);
            flow.Controls.Add(Lab("退出/筛选失败原因（退出或失败时必填，用于解释漏斗）：", F, Color.Black)); flow.Controls.Add(reason);
            flow.Controls.Add(err);
            var ok = Btn("保存", null, true);
            ok.Click += delegate
            {
                string st = status.SelectedItem.ToString().Split(' ')[1];
                if ((st == "withdrawn" || st == "screen_failed") && reason.Text.Trim().Length < 3)
                {
                    err.Text = "退出或筛选失败必须写明原因（至少 3 个字）";
                    return;
                }
                var body = new Dictionary<string, object> { { "status", st }, { "withdrawalReason", reason.Text.Trim() } };
                Safe.Fetch(delegate { return h.Api.Put("/api/subjects/" + Json.S(subject, "id"), body); },
                    delegate(object o) { h.Status("状态已更新为 " + StatusCn(Json.S(Json.D(o), "status"))); d.Close(); done(); },
                    delegate(string msg) { err.Text = msg; });
            };
            var btns = new FlowLayoutPanel { Width = 400, Height = 40, WrapContents = false };
            btns.Controls.Add(ok);
            btns.Controls.Add(Btn("取消", delegate { d.Close(); }, false));
            flow.Controls.Add(btns);
            d.Controls.Add(flow);
            d.ShowDialog(h.Win);
        }

        static void AddVisitDialog(Host h, string subjectId, Action done)
        {
            var d = new Form { Text = "登记访视", Width = 500, Height = 380, StartPosition = FormStartPosition.CenterParent, FormBorderStyle = FormBorderStyle.FixedDialog, Font = F };
            var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, Padding = new Padding(14), AutoScroll = true };
            var name = new TextBox { Width = 220, Font = F, Text = "V2 第 2 次访视" };
            var date = new TextBox { Width = 160, Font = F, Text = DateTime.Now.AddDays(14).ToString("yyyy-MM-dd") };
            var win = new TextBox { Width = 160, Font = F, Text = "±3 天" };
            var form = new ComboBox { Width = 320, Font = F, DropDownStyle = ComboBoxStyle.DropDownList };
            var err = Lab("", FS, Color.Firebrick);
            flow.Controls.Add(Lab("访视名称：", F, Color.Black)); flow.Controls.Add(name);
            flow.Controls.Add(Lab("计划日期（YYYY-MM-DD）：", F, Color.Black)); flow.Controls.Add(date);
            flow.Controls.Add(Lab("允许窗口：", F, Color.Black)); flow.Controls.Add(win);
            flow.Controls.Add(Lab("绑定 eCRF 表单：", F, Color.Black)); flow.Controls.Add(form);
            flow.Controls.Add(err);

            var formIds = new List<string>();
            Safe.Fetch(delegate { return h.Api.Get("/api/subjects/forms"); },
                delegate(object o)
                {
                    var forms = Json.A(Json.G(Json.D(o), "forms"));
                    if (forms == null) return;
                    foreach (object fo in forms)
                    {
                        var f = Json.D(fo);
                        formIds.Add(Json.S(f, "id"));
                        form.Items.Add(Json.S(f, "title"));
                    }
                    if (form.Items.Count > 0) form.SelectedIndex = 0;
                },
                delegate(string msg) { err.Text = "表单加载失败：" + msg; });

            var ok = Btn("登记", null, true);
            ok.Click += delegate
            {
                var body = new Dictionary<string, object>
                {
                    { "name", name.Text.Trim() },
                    { "plannedDate", date.Text.Trim() },
                    { "window", win.Text.Trim() },
                };
                if (form.SelectedIndex >= 0 && form.SelectedIndex < formIds.Count) body["formId"] = formIds[form.SelectedIndex];
                Safe.Fetch(delegate { return h.Api.Post("/api/subjects/" + subjectId + "/visits", body); },
                    delegate(object o) { d.Close(); done(); },
                    delegate(string msg) { err.Text = msg; });
            };
            var btns = new FlowLayoutPanel { Width = 440, Height = 40, WrapContents = false };
            btns.Controls.Add(ok);
            btns.Controls.Add(Btn("取消", delegate { d.Close(); }, false));
            flow.Controls.Add(btns);
            d.Controls.Add(flow);
            d.ShowDialog(h.Win);
        }

        /// <summary>eCRF 数据录入：字段按表单定义渲染；保存时服务端做逻辑核查，违规逐条展示。</summary>
        static void EcrfDialog(Host h, string subjectId, IDictionary<string, object> visit, Action done)
        {
            string visitId = Json.S(visit, "id");
            string formId = Json.S(visit, "formId");
            var d = new Form { Text = "eCRF 数据录入 · " + Json.S(visit, "name"), Width = 660, Height = 620, StartPosition = FormStartPosition.CenterParent, Font = F };
            var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, Padding = new Padding(14), AutoScroll = true, AutoSize = false };
            var err = Lab("", FS, Color.Firebrick);
            var fields = new List<string>();
            var inputs = new Dictionary<string, Control>();
            var data = Json.D(Json.G(visit, "data"));
            d.Controls.Add(flow);

            if (formId == "" || formId == null)
            {
                flow.Controls.Add(Lab("该访视未绑定 eCRF 表单。请重新登记访视并选择表单。", F, Color.Firebrick));
                flow.Controls.Add(Btn("关闭", delegate { d.Close(); }, false));
                d.ShowDialog(h.Win);
                return;
            }

            Safe.Fetch(delegate { return h.Api.Get("/api/subjects/" + subjectId); },
                delegate(object o)
                {
                    // 优先用服务端表单定义
                    Safe.Fetch(delegate { return h.Api.Get("/api/subjects/forms"); },
                        delegate(object fo)
                        {
                            var forms = Json.A(Json.G(Json.D(fo), "forms"));
                            IDictionary<string, object> def = null;
                            if (forms != null)
                                foreach (object x in forms)
                                {
                                    var f = Json.D(x);
                                    if (Json.S(f, "id") == formId) { def = f; break; }
                                }
                            if (def == null) { flow.Controls.Add(Lab("未找到表单定义 " + formId, F, Color.Firebrick)); return; }
                            flow.Controls.Add(Lab(Json.S(def, "title"), FB, Color.Black));
                            flow.Controls.Add(Lab(Json.S(def, "intro"), FS, MUT2));
                            var fs = Json.A(Json.G(def, "fields"));
                            foreach (object x in fs)
                            {
                                var f = Json.D(x);
                                string key = Json.S(f, "key");
                                string label = Json.S(f, "label") + (Json.B(f, "required") ? " *" : "");
                                string hint = Json.S(f, "hint");
                                fields.Add(key);
                                flow.Controls.Add(Lab(label, F, Color.Black));
                                string cur = data != null && data.ContainsKey(key) ? Convert.ToString(data[key]) : "";
                                Control input;
                                string type = Json.S(f, "type");
                                if (type == "select")
                                {
                                    var cb = new ComboBox { Width = 220, Font = F, DropDownStyle = ComboBoxStyle.DropDownList };
                                    var opts = Json.A(Json.G(f, "options"));
                                    cb.Items.Add("");
                                    if (opts != null) foreach (object op in opts) cb.Items.Add(Convert.ToString(op));
                                    cb.SelectedItem = cur;
                                    if (cb.SelectedIndex < 0) cb.SelectedIndex = 0;
                                    input = cb;
                                }
                                else
                                {
                                    input = new TextBox { Width = 220, Font = F, Text = cur };
                                }
                                input.Tag = type;
                                inputs[key] = input;
                                flow.Controls.Add(input);
                                if (hint != null && hint.Length > 0) flow.Controls.Add(Lab("　· " + hint, FS, MUT2));
                            }
                            flow.Controls.Add(err);

                            var save = Btn("保存（服务端执行逻辑核查）", null, true);
                            save.Click += delegate
                            {
                                var payload = new Dictionary<string, object>();
                                foreach (string key in fields)
                                {
                                    var input = inputs[key];
                                    string val = input is ComboBox ? Convert.ToString(((ComboBox)input).SelectedItem) : ((TextBox)input).Text.Trim();
                                    if (val == null || val.Length == 0) continue;
                                    string type = Convert.ToString(input.Tag);
                                    if (type == "number")
                                    {
                                        double n;
                                        if (double.TryParse(val, out n)) payload[key] = n;
                                        else payload[key] = val;
                                    }
                                    else payload[key] = val;
                                }
                                var body = new Dictionary<string, object> { { "data", payload }, { "status", "done" } };
                                Safe.Fetch(delegate { return h.Api.Put("/api/subjects/" + subjectId + "/visits/" + visitId, body); },
                                    delegate(object o2)
                                    {
                                        h.Status("eCRF 已保存并通过逻辑核查");
                                        d.Close();
                                        done();
                                    },
                                    delegate(string msg)
                                    {
                                        err.Text = "✗ 逻辑核查未通过，数据未入库：" + Environment.NewLine + msg;
                                    });
                            };
                            var btns = new FlowLayoutPanel { Width = 600, Height = 44, WrapContents = false };
                            btns.Controls.Add(save);
                            btns.Controls.Add(Btn("删除该访视", delegate
                            {
                                if (MessageBox.Show("确定删除该访视吗？", "LeebertyCR", MessageBoxButtons.OKCancel, MessageBoxIcon.Question) != DialogResult.OK) return;
                                Safe.Fetch(delegate { return h.Api.Delete("/api/subjects/" + subjectId + "/visits/" + visitId); },
                                    delegate(object o2) { d.Close(); done(); },
                                    delegate(string msg) { err.Text = msg; });
                            }, false));
                            btns.Controls.Add(Btn("取消", delegate { d.Close(); }, false));
                            flow.Controls.Add(btns);
                        },
                        delegate(string msg) { err.Text = "表单加载失败：" + msg; });
                },
                delegate(string msg) { err.Text = "加载失败：" + msg; });
            d.ShowDialog(h.Win);
        }
    }

    /// <summary>入组漏斗条图（自绘，无第三方依赖）。</summary>
    public class FunnelChart : Panel
    {
        public List<KeyValuePair<string, long>> Data = new List<KeyValuePair<string, long>>();

        public FunnelChart()
        {
            DoubleBuffered = true;
            BackColor = Color.White;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            var g = e.Graphics;
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            var titleFont = new Font("Microsoft YaHei UI", 11f, FontStyle.Bold);
            var font = new Font("Microsoft YaHei UI", 9f);
            g.DrawString("入组漏斗（筛选 → 完成）", titleFont, Brushes.Black, 12, 10);
            if (Data.Count == 0)
            {
                g.DrawString("暂无数据", font, Brushes.Gray, 12, 40);
                return;
            }
            long max = 1;
            foreach (var kv in Data) if (kv.Value > max) max = kv.Value;
            int left = 130, top = 44, barH = 26, gap = 10;
            var colors = new[] {
                Color.FromArgb(31, 78, 121), Color.FromArgb(46, 116, 181), Color.FromArgb(68, 152, 214),
                Color.FromArgb(112, 173, 71), Color.FromArgb(0, 112, 96)
            };
            for (int i = 0; i < Data.Count; i++)
            {
                var kv = Data[i];
                int y = top + i * (barH + gap);
                g.DrawString(kv.Key, font, Brushes.Black, 12, y + 5);
                int w = (int)((Width - left - 90) * (kv.Value / (double)max));
                if (w < 2) w = 2;
                using (var b = new SolidBrush(colors[i % colors.Length]))
                    g.FillRectangle(b, left, y, w, barH);
                g.DrawString(kv.Value + " 例", font, Brushes.Black, left + w + 8, y + 5);
            }
            g.DrawString("口径：筛选=已登记受试者；完成=已完成全部访视并结题。漏斗逐层收窄，任何一层异常都要回头看流程。",
                font, Brushes.Gray, 12, top + Data.Count * (barH + gap) + 8);
        }
    }
}