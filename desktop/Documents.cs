using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;

namespace LeebertyCR
{
    /// <summary>
    /// P2：eTMF / ISF 文档生命周期（版本链 + 状态机 + 职责分离）与必需文件缺口扫描。
    /// </summary>
    public partial class Views
    {
        public static void ShowDocuments(Host h, Panel p)
        {
            var tabs = new TabControl { Dock = DockStyle.Fill };
            p.Controls.Add(tabs);
            tabs.TabPages.Add(DocRegistryTab(h));
            tabs.TabPages.Add(DocGapsTab(h));
        }

        static TabPage DocRegistryTab(Host h)
        {
            var page = new TabPage("文档台账与生命周期");
            var top = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 44, WrapContents = false, Padding = new Padding(0, 6, 0, 0) };
            var filter = new ComboBox { Width = 160, Font = F, DropDownStyle = ComboBoxStyle.DropDownList };
            filter.Items.AddRange(new object[] { "全部状态", "草稿 draft", "待审 review", "已批准 approved", "已被替代 superseded", "已归档 archived" });
            filter.SelectedIndex = 0;
            var phaseSel = new ComboBox { Width = 150, Font = F, DropDownStyle = ComboBoxStyle.DropDownList };
            phaseSel.Items.AddRange(new object[] { "全部阶段", "试验前 before", "试验中 during", "试验后 after" });
            phaseSel.SelectedIndex = 0;
            var grid = Dgv("编号", "名称", "类别", "阶段", "状态", "版本", "责任人", "复核到期");
            grid.Dock = DockStyle.Top;
            grid.Height = 330;
            var detail = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(0) };

            Action reload = null;
            Action<string> loadDetail = null;

            loadDetail = delegate(string id)
            {
                detail.Controls.Clear();
                if (id == null || id.Length == 0)
                {
                    detail.Controls.Add(Lab("← 选择一条文档查看版本链与可用的状态流转。", FS, MUT2));
                    return;
                }
                Safe.Fetch(delegate { return h.Api.Get("/api/documents/" + id); },
                    delegate(object o)
                    {
                        var d = Json.D(o);
                        var head = new GroupBox { Text = Json.S(d, "id") + " · " + Json.S(d, "title"), Font = FB, Width = 1160, Height = 118 };
                        string info = "类别：" + Json.S(d, "category") + "　阶段：" + PhaseCn(Json.S(d, "phase"))
                            + "　状态：" + DocStateCn(Json.S(d, "status")) + "　版本：v" + Json.S(d, "version")
                            + "　责任人：" + Json.S(d, "owner") + "　生效：" + DocShow(Json.S(d, "effectiveDate"));
                        var l1 = Lab(info, F, Color.Black); l1.Location = new Point(12, 26); l1.MaximumSize = new Size(1130, 0);
                        var l2 = Lab("存放位置：" + DocShow(Json.S(d, "location")) + "　复核到期：" + DocShow(Json.S(d, "reviewDueDate"))
                            + (Json.B(d, "overdue") ? "　⚠ 已过期" : ""), FS, Json.B(d, "overdue") ? Color.Firebrick : MUT2);
                        l2.Location = new Point(12, 52); l2.MaximumSize = new Size(1130, 0);
                        head.Controls.Add(l1); head.Controls.Add(l2);

                        var btns = new FlowLayoutPanel { Location = new Point(10, 78), Width = 1130, Height = 34, WrapContents = false };
                        var next = Json.A(Json.G(d, "allowedNext"));
                        if (next != null && next.Count > 0)
                        {
                            foreach (object no in next)
                            {
                                string to = Convert.ToString(no);
                                btns.Controls.Add(Btn("→ " + DocStateCn(to), delegate
                                {
                                    TransitionDialog(h, Json.S(d, "id"), to, delegate { loadDetail(Json.S(d, "id")); reload(); });
                                }, to == "approved"));
                            }
                        }
                        else
                        {
                            btns.Controls.Add(Lab("（终态：无可用流转）", FS, MUT2));
                        }
                        head.Controls.Add(btns);
                        detail.Controls.Add(head);

                        detail.Controls.Add(Lab("版本链（每次修订 / 流转都会追加一条，谁在何时因为什么改动都可追溯）：", F, Color.Black));
                        var vg = Dgv("版本", "时间", "操作", "由", "从 → 到", "说明");
                        vg.Width = 1160; vg.Height = 190;
                        var versions = Json.A(Json.G(d, "versions"));
                        if (versions != null)
                            foreach (object vo in versions)
                            {
                                var v = Json.D(vo);
                                AddRow(vg, "v" + Json.S(v, "version"), Json.S(v, "at"), Json.S(v, "action"), Json.S(v, "by"),
                                    DocShow(Json.S(v, "from")) + " → " + DocStateCn(Json.S(v, "to")), Json.S(v, "comment"));
                            }
                        detail.Controls.Add(vg);
                        detail.Controls.Add(Lab("提示：批准人不能是建档人（职责分离）；退回或替代必须写明理由。", FS, MUT2));
                    },
                    delegate(string msg) { detail.Controls.Add(Lab("加载失败：" + msg, F, Color.Firebrick)); });
            };

            grid.CellClick += delegate(object sender, DataGridViewCellEventArgs e)
            {
                if (e.RowIndex < 0) return;
                loadDetail(Convert.ToString(grid.Rows[e.RowIndex].Cells[0].Value));
            };

            reload = delegate
            {
                string st = filter.SelectedIndex > 0 ? filter.SelectedItem.ToString().Split(' ')[1] : null;
                string ph = phaseSel.SelectedIndex > 0 ? phaseSel.SelectedItem.ToString().Split(' ')[1] : null;
                Safe.Fetch(delegate { return h.Api.Get("/api/documents"); },
                    delegate(object o)
                    {
                        var docs = Json.A(Json.G(Json.D(o), "documents"));
                        grid.Rows.Clear();
                        if (docs == null) return;
                        foreach (object dobj in docs)
                        {
                            var d = Json.D(dobj);
                            if (st != null && Json.S(d, "status") != st) continue;
                            if (ph != null && Json.S(d, "phase") != ph) continue;
                            int r = grid.Rows.Add(Json.S(d, "id"), Json.S(d, "title"), Json.S(d, "category"), PhaseCn(Json.S(d, "phase")),
                                DocStateCn(Json.S(d, "status")), "v" + Json.S(d, "version"), Json.S(d, "owner"), DocShow(Json.S(d, "reviewDueDate")));
                            if (Json.B(d, "overdue")) grid.Rows[r].DefaultCellStyle.ForeColor = Color.Firebrick;
                        }
                        grid.ClearSelection();
                    },
                    delegate(string msg) { h.Status("文档加载失败：" + msg); });
            };

            filter.SelectedIndexChanged += delegate { reload(); };
            phaseSel.SelectedIndexChanged += delegate { reload(); };
            top.Controls.Add(Btn("＋ 建档", delegate { NewDocDialog(h, delegate { reload(); }); }, true));
            top.Controls.Add(filter);
            top.Controls.Add(phaseSel);
            top.Controls.Add(Btn("刷新", delegate { reload(); }, false));
            if (h.Role == "admin")
            {
                top.Controls.Add(Btn("↻ 重新生成演示文档", delegate
                {
                    Safe.Fetch(delegate { return h.Api.Post("/api/documents/seed-demo", new Dictionary<string, object>()); },
                        delegate(object o) { h.Status("已补充 " + Json.I(Json.D(o), "added") + " 份演示文档"); reload(); },
                        delegate(string msg) { MessageBox.Show("失败：" + msg, "LeebertyCR", MessageBoxButtons.OK, MessageBoxIcon.Warning); });
                }, false));
            }

            var hint = Lab("ICH E6(R2) 8 节把必需文件分为试验前 / 中 / 后三阶段。文件不是「存着就行」：要有版本、有批准、有复核周期，且能被调阅。", FS, MUT2);
            hint.Padding = new Padding(0, 6, 0, 6);

            page.Controls.Add(detail);
            page.Controls.Add(grid);
            page.Controls.Add(hint);
            page.Controls.Add(top);
            reload();
            loadDetail(null);
            return page;
        }

        static TabPage DocGapsTab(Host h)
        {
            var page = new TabPage("必需文件缺口扫描");
            var top = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 46, WrapContents = false, Padding = new Padding(0, 6, 0, 0) };
            var summary = Lab("", F, Color.Black);
            var grid = Dgv("阶段", "类别", "必需文件", "现存", "已批准", "判定");
            grid.Dock = DockStyle.Top;
            grid.Height = 430;

            Action reload = null;
            reload = delegate
            {
                Safe.Fetch(delegate { return h.Api.Get("/api/documents/gaps"); },
                    delegate(object o)
                    {
                        var body = Json.D(o);
                        var rows = Json.A(Json.G(body, "rows"));
                        grid.Rows.Clear();
                        if (rows == null) return;
                        foreach (object ro in rows)
                        {
                            var r = Json.D(ro);
                            string stt = Json.S(r, "status");
                            string verdict = stt == "missing" ? "✗ 缺失" : (stt == "unapproved" ? "⚠ 无已批准版本" : "✓ 就绪");
                            int idx = grid.Rows.Add(PhaseCn(Json.S(r, "phase")), Json.S(r, "category"), Json.S(r, "name"),
                                Json.S(r, "present"), Json.S(r, "approved"), verdict);
                            if (stt != "ok") grid.Rows[idx].DefaultCellStyle.ForeColor = stt == "missing" ? Color.Firebrick : Color.DarkOrange;
                        }
                        summary.Text = "必需文件 " + Json.I(body, "total") + " 项　就绪 " + Json.I(body, "ok")
                            + "　缺失 " + Json.I(body, "missing") + "　无已批准版本 " + Json.I(body, "unapproved")
                            + "　建档就绪度 " + Json.S(body, "readiness") + "%";
                    },
                    delegate(string msg) { summary.Text = "加载失败：" + msg; });
            };
            top.Controls.Add(Btn("刷新扫描", delegate { reload(); }, false));
            top.Controls.Add(Btn("⬇ 导出缺口 CSV", delegate
            {
                Safe.Fetch(delegate { return h.Api.Get("/api/documents/gaps"); },
                    delegate(object o)
                    {
                        var rows = Json.A(Json.G(Json.D(o), "rows"));
                        var outRows = new List<string[]>();
                        outRows.Add(new[] { "阶段", "类别", "必需文件", "现存", "已批准", "判定" });
                        if (rows != null)
                            foreach (object ro in rows)
                            {
                                var r = Json.D(ro);
                                string stt = Json.S(r, "status");
                                string verdict = stt == "missing" ? "缺失" : (stt == "unapproved" ? "无已批准版本" : "就绪");
                                outRows.Add(new[] { PhaseCn(Json.S(r, "phase")), Json.S(r, "category"), Json.S(r, "name"), Json.S(r, "present"), Json.S(r, "approved"), verdict });
                            }
                        SaveTextFile(h, "导出缺口清单", "tmf-gaps.csv", ToCsvText(outRows));
                    },
                    delegate(string msg) { MessageBox.Show("导出失败：" + msg, "LeebertyCR", MessageBoxButtons.OK, MessageBoxIcon.Warning); });
            }, false));

            var hint = Lab("缺口扫描回答稽查 / 检查前最常见的问题：「哪些必需文件还没有？」「哪些有文件但没批准？」——先补缺失，再补批准。", FS, MUT2);
            hint.Padding = new Padding(0, 6, 0, 6);
            page.Controls.Add(grid);
            page.Controls.Add(summary);
            page.Controls.Add(hint);
            page.Controls.Add(top);
            reload();
            return page;
        }

        static string PhaseCn(string p)
        {
            if (p == "before") return "试验前";
            if (p == "during") return "试验中";
            if (p == "after") return "试验后";
            return p;
        }

        static string DocStateCn(string s)
        {
            switch (s)
            {
                case "draft": return "草稿";
                case "review": return "待审";
                case "approved": return "已批准";
                case "superseded": return "已被替代";
                case "archived": return "已归档";
                default: return s == null ? "" : s;
            }
        }

        static string DocShow(string s) { return (s == null || s.Length == 0) ? "—" : s; }

        static void TransitionDialog(Host h, string docId, string to, Action done)
        {
            bool needComment = to == "superseded" || to == "draft";
            var d = new Form { Text = "文档流转 → " + DocStateCn(to), Width = 520, Height = needComment ? 310 : 240, StartPosition = FormStartPosition.CenterParent, FormBorderStyle = FormBorderStyle.FixedDialog, Font = F };
            var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, Padding = new Padding(14) };
            flow.Controls.Add(Lab("将文档 " + docId + " 流转为「" + DocStateCn(to) + "」。", F, Color.Black));
            if (to == "approved") flow.Controls.Add(Lab("职责分离：批准人不能是建档人，系统会核对当前账号。", FS, MUT2));
            var comment = new TextBox { Width = 440, Font = F, Multiline = true, Height = 60 };
            var err = Lab("", FS, Color.Firebrick);
            flow.Controls.Add(Lab(needComment ? "理由（必填，至少 3 个字）：" : "备注（可选）：", F, Color.Black));
            flow.Controls.Add(comment);
            flow.Controls.Add(err);
            var ok = Btn("确认流转", null, true);
            ok.Click += delegate
            {
                var body = new Dictionary<string, object> { { "to", to }, { "comment", comment.Text.Trim() } };
                Safe.Fetch(delegate { return h.Api.Post("/api/documents/" + docId + "/transition", body); },
                    delegate(object o) { h.Status("已流转为 " + DocStateCn(Json.S(Json.D(o), "status"))); d.Close(); done(); },
                    delegate(string msg) { err.Text = msg; });
            };
            var btns = new FlowLayoutPanel { Width = 460, Height = 40, WrapContents = false };
            btns.Controls.Add(ok);
            btns.Controls.Add(Btn("取消", delegate { d.Close(); }, false));
            flow.Controls.Add(btns);
            d.Controls.Add(flow);
            d.ShowDialog(h.Win);
        }

        static void NewDocDialog(Host h, Action done)
        {
            var d = new Form { Text = "文档建档", Width = 540, Height = 420, StartPosition = FormStartPosition.CenterParent, FormBorderStyle = FormBorderStyle.FixedDialog, Font = F };
            var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, Padding = new Padding(14), AutoScroll = true };
            var title = new TextBox { Width = 460, Font = F };
            var cat = new ComboBox { Width = 460, Font = F, DropDownStyle = ComboBoxStyle.DropDownList };
            var owner = new TextBox { Width = 240, Font = F, Text = h.UserName };
            var due = new TextBox { Width = 170, Font = F, Text = DateTime.Now.AddYears(1).ToString("yyyy-MM-dd") };
            var loc = new TextBox { Width = 240, Font = F, Text = "ISF 第 1 册" };
            var err = Lab("", FS, Color.Firebrick);
            var cats = new List<string>();
            flow.Controls.Add(Lab("文档名称：", F, Color.Black)); flow.Controls.Add(title);
            flow.Controls.Add(Lab("文件类别（来自 ICH E6(R2) 必需文件清单）：", F, Color.Black)); flow.Controls.Add(cat);
            flow.Controls.Add(Lab("责任人：", F, Color.Black)); flow.Controls.Add(owner);
            flow.Controls.Add(Lab("复核到期日：", F, Color.Black)); flow.Controls.Add(due);
            flow.Controls.Add(Lab("存放位置：", F, Color.Black)); flow.Controls.Add(loc);
            flow.Controls.Add(err);

            Safe.Fetch(delegate { return h.Api.Get("/api/documents"); },
                delegate(object o)
                {
                    var ess = Json.A(Json.G(Json.D(o), "essential"));
                    if (ess == null) return;
                    foreach (object eo in ess)
                    {
                        var e = Json.D(eo);
                        cats.Add(Json.S(e, "category"));
                        cat.Items.Add(Json.S(e, "category") + "　" + Json.S(e, "name"));
                    }
                    if (cat.Items.Count > 0) cat.SelectedIndex = 0;
                },
                delegate(string msg) { err.Text = "类别加载失败：" + msg; });

            var ok = Btn("建档", null, true);
            ok.Click += delegate
            {
                if (cat.SelectedIndex < 0) { err.Text = "请选择文件类别"; return; }
                var body = new Dictionary<string, object>
                {
                    { "title", title.Text.Trim() },
                    { "category", cats[cat.SelectedIndex] },
                    { "owner", owner.Text.Trim() },
                    { "reviewDueDate", due.Text.Trim() },
                    { "location", loc.Text.Trim() },
                };
                Safe.Fetch(delegate { return h.Api.Post("/api/documents", body); },
                    delegate(object o) { h.Status("已建档 " + Json.S(Json.D(o), "id")); d.Close(); done(); },
                    delegate(string msg) { err.Text = msg; });
            };
            var btns = new FlowLayoutPanel { Width = 480, Height = 40, WrapContents = false };
            btns.Controls.Add(ok);
            btns.Controls.Add(Btn("取消", delegate { d.Close(); }, false));
            flow.Controls.Add(btns);
            d.Controls.Add(flow);
            d.ShowDialog(h.Win);
        }

        /* ------------------------------------------------------------------ P2：SAE 报送稿与 24 小时计时 */

        public static void ExportSaeDraft(Host h, IDictionary<string, object> rec)
        {
            Safe.Fetch(delegate { return h.Api.RawGet("/api/export/sae/" + Json.S(rec, "recordKey") + ".txt"); },
                delegate(object o) { SaveAnyFile(h, "导出 SAE 报送稿", "SAE-" + Json.S(rec, "recordKey") + ".txt", Convert.ToString(o), "文本文件 (*.txt)|*.txt|所有文件 (*.*)|*.*"); },
                delegate(string msg) { MessageBox.Show("生成失败：" + msg, "LeebertyCR", MessageBoxButtons.OK, MessageBoxIcon.Warning); });
        }

        /// <summary>24 小时时限检查（首次获知 → 报告）：返回提示文本与是否已超时。</summary>
        public static string SaeDeadlineText(IDictionary<string, object> rec, out bool overdue)
        {
            overdue = false;
            var steps = Json.A(Json.G(rec, "steps"));
            if (steps == null) return "";
            string awareness = null;
            foreach (object so in steps)
            {
                var sd = Json.D(so);
                var fd = Json.D(Json.G(sd, "formData"));
                if (fd == null) continue;
                if (awareness == null && fd.ContainsKey("awarenessAt")) awareness = Convert.ToString(fd["awarenessAt"]);
            }
            if (awareness == null || awareness.Length == 0) return "24 小时计时：尚未填写「首次获知时间」（在分诊步骤填写后自动计算）";
            DateTime t;
            if (!DateTime.TryParse(awareness, out t)) return "24 小时计时：首次获知时间无法解析（" + awareness + "）";
            var deadline = t.AddHours(24);
            var now = DateTime.Now;
            overdue = now > deadline;
            if (overdue)
                return "⏰ 24 小时时限已超出：" + deadline.ToString("yyyy-MM-dd HH:mm") + " 应为截止（已过 " + Math.Round((now - t).TotalHours, 1) + " 小时）——立即上报并说明延误原因";
            return "24 小时时限：截止 " + deadline.ToString("yyyy-MM-dd HH:mm") + "，剩余 " + Math.Round((deadline - now).TotalHours, 1) + " 小时";
        }
    }
}