using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;

/*
 * MainWin.cs - LeebertyCR 原生主窗口：左侧导航树 + 右侧视图宿主 + 状态栏。
 * 登录在窗口内部完成（原生控件），不打开任何浏览器。
 */

namespace LeebertyCR
{
    public class Host
    {
        public ApiClient Api;
        public MainWin Win;
        public IDictionary<string, object> Me;          // 当前用户
        public IDictionary<string, object> Meta;        // /api/auth/meta
        public IDictionary<string, object> Content;     // /api/content（懒加载）
        public IDictionary<string, object> State;       // /api/state（当前账号，登录后加载）
        public string Arg = "";                          // 视图参数（如 checklist id）

        public void Nav(string key) { Win.Navigate(key); }
        public void Nav(string key, string arg) { Arg = arg; Win.Navigate(key); }
        public void Status(string s) { Win.SetStatus(s); }
        public void SaveState()
        {
            if (State == null) return;
            try { Api.Put("/api/state", State); }
            catch (Exception e) { Program.LogLine("state save: " + e.Message); }
        }
        public string Role { get { return Me != null ? Json.S(Me, "role") : ""; } }
        public string UserName { get { return Me != null ? Json.S(Me, "username") : ""; } }
    }

    public class MainWin : Form
    {
        public bool AllowClose;
        public NotifyIcon Tray;
        public Host H;
        public bool LoginShown;
        public bool ShellShown;
        TreeView tree;
        Panel host;
        StatusStrip status;
        ToolStripStatusLabel userLabel;
        ToolStripStatusLabel infoLabel;

        public MainWin(string port, string root)
        {
            Text = "LeebertyCR · CRA/CRC 临床试验工作台";
            Width = 1340;
            Height = 860;
            MinimumSize = new Size(1120, 720);
            StartPosition = FormStartPosition.CenterScreen;
            Icon = Program.MakeIcon();
            AllowClose = false;

            H = new Host { Api = new ApiClient { BaseUrl = "http://127.0.0.1:" + port }, Win = this };
            try { H.Meta = Json.D(H.Api.Get("/api/auth/meta")); } catch { H.Meta = null; }

            var split = new SplitContainer { Dock = DockStyle.Fill, FixedPanel = FixedPanel.Panel1, SplitterWidth = 3 };

            tree = new TreeView { Dock = DockStyle.Fill, HideSelection = false, Font = new Font("Microsoft YaHei UI", 10f) };
            tree.AfterSelect += (s, e) => { if (e.Node != null && e.Node.Tag != null) NavigateKey((string)e.Node.Tag); };
            BuildTree();
            split.Panel1.Controls.Add(tree);

            host = new Panel { Dock = DockStyle.Fill, AutoScroll = true, BackColor = Color.FromArgb(242, 245, 248), Padding = new Padding(14) };
            split.Panel2.Controls.Add(host);

            status = new StatusStrip { SizingGrip = false };
            userLabel = new ToolStripStatusLabel { Spring = false, Font = new Font("Microsoft YaHei UI", 9f) };
            infoLabel = new ToolStripStatusLabel { Spring = true, TextAlign = ContentAlignment.MiddleRight, Font = new Font("Microsoft YaHei UI", 9f) };
            var urlLabel = new ToolStripStatusLabel { Spring = false, Text = "本机服务 127.0.0.1:" + port };
            status.Items.Add(userLabel);
            status.Items.Add(infoLabel);
            status.Items.Add(urlLabel);

            Controls.Add(split);
            Controls.Add(status);
            Safe.Anchor = this;

            Shown += delegate
            {
                // 布局完成后才允许设置分隔尺寸（构造期设置会在未布局的控制上抛异常）
                try { split.Panel1MinSize = 180; split.Panel2MinSize = 600; split.SplitterDistance = 230; } catch { }
                BeginLogin();
            };
            FormClosing += (s, e) =>
            {
                if (AllowClose) return;
                e.Cancel = true;
                Hide();
                if (Tray != null) Tray.ShowBalloonTip(1800, "LeebertyCR", "窗口已最小化到托盘；右键托盘图标可退出。", ToolTipIcon.Info);
            };
        }

        public void ShowWindow()
        {
            if (IsDisposed) return;
            Show();
            WindowState = FormWindowState.Normal;
            Activate();
        }

        void BuildTree()
        {
            tree.Nodes.Clear();
            AddGroup("学习");
            AddItem("学习", "home", "🏠 首页");
            AddItem("学习", "learn", "🧭 理念课堂");
            AddItem("学习", "lifecycle", "🗺️ 试验生命周期");
            AddItem("学习", "cra", "🔍 CRA 工作手册");
            AddItem("学习", "crc", "🗂️ CRC 工作手册");
            AddGroup("执行");
            AddItem("执行", "checklists", "✅ 核查清单");
            AddItem("执行", "workflow", "🌀 工作流执行");
            AddItem("执行", "subjects", "🧑🤝🧑 受试者登记册");
            AddItem("执行", "documents", "📁 eTMF 文档台账");
            AddItem("执行", "tasks", "📋 任务台");
            AddItem("执行", "templates", "📄 文件模板");
            AddItem("执行", "regs", "⚖️ 法规速查");
            AddGroup("检验");
            AddItem("检验", "quiz", "🎯 场景练习");
            AddItem("检验", "cases", "🧩 案例学习");
            AddItem("检验", "glossary", "📖 术语表");
            AddGroup("我的");
            AddItem("我的", "security", "🔐 账号与权限");
            AddItem("我的", "about", "ℹ️ 关于");
            tree.Enabled = false;
        }

        void AddGroup(string name)
        {
            var n = new TreeNode(name);
            n.Tag = null;
            tree.Nodes.Add(n);
        }
        void AddItem(string group, string key, string label)
        {
            foreach (TreeNode g in tree.Nodes)
            {
                if (g.Text == group)
                {
                    var n = new TreeNode(label);
                    n.Tag = key;
                    g.Nodes.Add(n);
                    return;
                }
            }
        }

        void SetUserInTree(bool logged)
        {
            tree.Enabled = logged;
        }

        public void Navigate(string key)
        {
            NavigateKey(key);
        }

        /// <summary>离屏冒烟测试用：按导航键切换视图，返回是否成功（异常不外泄）。</summary>
        public bool UITestNavigate(string key)
        {
            try
            {
                NavigateKey(key);
                Application.DoEvents();
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("    [uitest] navigate(" + key + ") failed: " + ex.Message);
                return false;
            }
        }

        void NavigateKey(string key)
        {
            host.Controls.Clear();
            Views.Show(this, H, key, host);
        }

        public void SetStatus(string s) { infoLabel.Text = s; }

        void BeginLogin()
        {
            Safe.Fetch(delegate { return H.Api.Get("/api/auth/me"); },
                delegate(object o)
                {
                    var user = Json.D(Json.G(o, "user"));
                    if (user == null) ShowLogin();
                    else EnterShell(user);
                },
                delegate(string err) { ShowLogin(); });
        }

        void ShowLogin()
        {
            LoginShown = true;
            tree.Enabled = false;
            host.Controls.Clear();
            Views.ShowLogin(this, H, host);
            userLabel.Text = "未登录";
        }

        /// <summary>UI 冒烟测试用：在登录面板上填表并触发登录（递归查找控件）。</summary>
        public void UITestLogin(string username, string password)
        {
            TextBox u = null, p = null;
            Button b = null;
            Action<Control> walk = null;
            walk = delegate(Control c)
            {
                foreach (Control cc in c.Controls)
                {
                    var tb = cc as TextBox;
                    if (tb != null)
                    {
                        if (tb.UseSystemPasswordChar) { if (p == null) p = tb; }
                        else if (u == null) u = tb;
                    }
                    var btn = cc as Button;
                    if (btn != null && btn.Text == "登录") b = btn;
                    walk(cc);
                }
            };
            walk(host);
            if (u != null && p != null && b != null)
            {
                u.Text = username;
                p.Text = password;
                b.PerformClick();
            }
        }

        public void EnterShell(IDictionary<string, object> user)
        {
            H.Me = user;
            H.Arg = "";
            LoginShown = false;
            ShellShown = true;
            try { H.State = Json.D(H.Api.Get("/api/state")); } catch { H.State = new Dictionary<string, object>(); }
            userLabel.Text = H.UserName + " · " + Views.RoleLabel(H, H.Role) + (Json.B(user, "isDemo") ? "（演示）" : "");
            SetUserInTree(true);
            if (Json.B(user, "mustChangePassword"))
            {
                MessageBox.Show("当前为临时口令，请到「账号与权限」页修改口令后再继续使用。", "LeebertyCR", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
            Navigate("home");
        }

        public void Logout()
        {
            try { H.Api.Post("/api/auth/logout", new Dictionary<string, object>()); } catch { }
            H.Me = null;
            H.State = null;
            ShowLogin();
        }
    }
}