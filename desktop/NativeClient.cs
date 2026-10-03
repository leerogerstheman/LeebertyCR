using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

/*
 * NativeClient.cs - LeebertyCR 原生桌面客户端（WinForms，零第三方依赖）。
 *
 * 双击 LeebertyCR.exe 得到的窗口是本程序自己的应用窗口：
 *   - 无任何浏览器/Edge 参与：原生边框、原生控件、自绘哥特体 CR 图标
 *   - 登录、导航、核查清单、工作流执行、双要素签名、用户管理全部原生实现
 *   - 与本地 Node 引擎通过 127.0.0.1 JSON API 通信（会话 Cookie 管理）
 *   - 系统托盘：打开窗口 / 备份数据 / 自检 / 停止并退出
 *
 * 命令行：
 *   LeebertyCR.exe --selftest     启动器/服务器生命周期自检（无窗口）
 *   LeebertyCR.exe --clienttest   客户端 API 层自检（需服务在运行，无窗口）
 */

namespace LeebertyCR
{
    static class Program
    {
        const string AppName = "LeebertyCR";
        const string AppNameEn = "LeebertyCR - CRA & CRC Clinical Trial Workbench";

        static string root;
        static string port = "8816";
        static string nodeExe;
        static bool weStartedServer;
        static Process serverProcess;

        static string ResolveRoot()
        {
            string[] starts = new string[]
            {
                AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\'),
                Directory.GetCurrentDirectory().TrimEnd('\\')
            };
            foreach (string start in starts)
            {
                string dir = start;
                for (int depth = 0; depth < 5 && dir != null; depth++)
                {
                    if (File.Exists(Path.Combine(dir, "src", "server.js"))) return dir;
                    DirectoryInfo parent = Directory.GetParent(dir);
                    dir = parent == null ? null : parent.FullName;
                }
            }
            return AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
        }

        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            root = ResolveRoot();
            bool selfTest = false;
            bool clientTest = false;
            bool uitest = false;
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--port" && i + 1 < args.Length) port = args[i + 1];
                else if (args[i] == "--root" && i + 1 < args.Length) root = args[i + 1];
                else if (args[i] == "--selftest") selfTest = true;
                else if (args[i] == "--clienttest") clientTest = true;
                else if (args[i] == "--uitest") uitest = true;
            }

            nodeExe = FindNode();
            if (selfTest) { RunSelfTest(); return; }
            if (clientTest) { RunClientTest(); return; }
            if (uitest) { RunUITest(); return; }

            if (nodeExe == null)
            {
                MessageBox.Show(
                    "未找到 Node.js。\r\n\r\n本应用需要 Node.js 18 或更高版本。\r\n请从 https://nodejs.org 安装后重试。\r\n\r\n" +
                    "Node.js was not found. LeebertyCR requires Node.js 18 or newer.",
                    AppName + " - 缺少运行环境", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            // 确保本机服务在运行（隐藏进程；用户不感知）
            if (!HealthOk())
            {
                if (!StartServer())
                {
                    MessageBox.Show("本地服务启动失败，请查看日志。\r\nThe local service failed to start; check the log.",
                        AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }
                weStartedServer = true;
            }

            // 等健康
            for (int i = 0; i < 60; i++)
            {
                if (HealthOk()) break;
                Thread.Sleep(500);
            }
            Thread.Sleep(300);

            var win = new MainWin(port, root);
            Safe.Anchor = win;
            BuildTray(win);
            Application.Run(win);
            win.Dispose();
        }

        static void BuildTray(MainWin win)
        {
            var tray = new NotifyIcon();
            tray.Icon = MakeIcon();
            tray.Text = AppName;
            tray.Visible = true;
            var menu = new ContextMenuStrip();
            menu.Items.Add(Item("打开窗口 / Open", (s, e) => win.ShowWindow(), true));
            menu.Items.Add(Item("备份数据 / Back up data",
                (s, e) => RunTool("\"scripts\\backup.js\"", "备份完成 / backup complete"), false));
            menu.Items.Add(Item("自检内容与服务 / Self-check",
                (s, e) => RunTool("\"scripts\\selfcheck.js\"", "自检完成 / self-check complete"), false));
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(Item("停止并退出 / Stop and exit", (s, e) =>
            {
                if (MessageBox.Show(
                    "将停止本地服务并退出应用。\r\n数据已提交到磁盘，可以安全退出。\r\n\r\n" +
                    "This stops the local service and exits. Your data is already on disk.",
                    AppName, MessageBoxButtons.OKCancel, MessageBoxIcon.Question) == DialogResult.OK)
                {
                    win.AllowClose = true;
                    StopServer();
                    tray.Visible = false;
                    Application.Exit();
                }
            }, false));
            tray.ContextMenuStrip = menu;
            tray.DoubleClick += (s, e) => win.ShowWindow();
            win.Tray = tray;
        }

        static ToolStripMenuItem Item(string text, EventHandler handler, bool bold)
        {
            var item = new ToolStripMenuItem(text);
            item.Click += handler;
            if (bold) item.Font = new Font(item.Font, FontStyle.Bold);
            return item;
        }

        static void RunTool(string arguments, string title)
        {
            try
            {
                string cmd = "\"" + nodeExe + "\" " + arguments + " & echo. & echo " + title + " & pause";
                Process.Start(new ProcessStartInfo("cmd.exe", "/k chcp 65001 >nul & " + cmd)
                {
                    WorkingDirectory = root,
                    UseShellExecute = true,
                });
            }
            catch (Exception ex) { LogLine("cannot run tool: " + ex.Message); }
        }

        // ------------------------------------------------------------ 环境查找 --

        static string FindNode()
        {
            string[] candidates = new string[]
            {
                Path.Combine(root, "node", "node.exe"),
                @"C:\Program Files\nodejs\node.exe",
                @"C:\Program Files (x86)\nodejs\node.exe",
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\nodejs\node.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), @".dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"),
            };
            foreach (string c in candidates)
            {
                if (File.Exists(c)) return c;
            }
            return null;
        }

        static string BaseUrl { get { return "http://127.0.0.1:" + port; } }

        static bool HealthOk()
        {
            try
            {
                using (var client = new TcpClient())
                {
                    var task = client.ConnectAsync("127.0.0.1", int.Parse(port));
                    if (!task.Wait(1200)) return false;
                    return client.Connected;
                }
            }
            catch { return false; }
        }

        static bool StartServer()
        {
            string serverJs = Path.Combine(root, "src", "server.js");
            if (!File.Exists(serverJs))
            {
                MessageBox.Show("未找到 src\\server.js，请确认启动器与程序文件在同一目录。\r\n" +
                    "src\\server.js was not found; keep the launcher beside the application files.",
                    AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
                return false;
            }
            var psi = new ProcessStartInfo("cmd.exe",
                "/c set CRA_PORT=" + port + "&& \"" + nodeExe + "\" \"" + serverJs + "\"")
            {
                WorkingDirectory = root,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };
            try
            {
                serverProcess = new Process();
                serverProcess.StartInfo = psi;
                serverProcess.OutputDataReceived += (s, e) => { };
                serverProcess.ErrorDataReceived += (s, e) => { if (e.Data != null) LogLine("[server] " + e.Data); };
                serverProcess.Start();
                serverProcess.BeginOutputReadLine();
                serverProcess.BeginErrorReadLine();
                LogLine("server started, pid " + serverProcess.Id);
                return true;
            }
            catch (Exception ex)
            {
                MessageBox.Show("启动失败 / Failed to start:\r\n" + ex.Message, AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
                return false;
            }
        }

        public static void StopServer()
        {
            if (weStartedServer && serverProcess != null)
            {
                try
                {
                    if (!serverProcess.HasExited)
                    {
                        serverProcess.Kill();
                        serverProcess.WaitForExit(5000);
                    }
                }
                catch { }
            }
            KillPortHolder();
            weStartedServer = false;
            serverProcess = null;
        }

        static void KillPortHolder()
        {
            try
            {
                var psi = new ProcessStartInfo("cmd.exe", "/c netstat -ano -p TCP | findstr LISTENING | findstr :" + port)
                {
                    UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true
                };
                var p = Process.Start(psi);
                string output = p.StandardOutput.ReadToEnd();
                p.WaitForExit(4000);
                foreach (string line in output.Split('\n'))
                {
                    string[] parts = line.Trim().Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                    if (parts.Length < 5) continue;
                    int pid;
                    if (!int.TryParse(parts[parts.Length - 1], out pid)) continue;
                    try { Process.GetProcessById(pid).Kill(); } catch { }
                }
            }
            catch { }
        }

        // ------------------------------------------------------------ 自检 --

        static void RunSelfTest()
        {
            int failures = 0;
            Action<string, bool, string> check = (name, ok, detail) =>
            {
                Console.WriteLine((ok ? "  PASS  " : "  FAIL  ") + name + (detail.Length > 0 ? "  [" + detail + "]" : ""));
                if (!ok) failures++;
            };
            Console.WriteLine();
            Console.WriteLine("  LeebertyCR - native client self-test");
            Console.WriteLine("  " + new string('=', 66));
            Console.WriteLine();
            Console.WriteLine("  root        " + root);
            Console.WriteLine("  port        " + port);
            Console.WriteLine();

            check("Node.js runtime is discoverable", nodeExe != null, nodeExe ?? "not found");
            check("the server entry point exists", File.Exists(Path.Combine(root, "src", "server.js")), Path.Combine(root, "src", "server.js"));
            check("the tray/window icon can be drawn", MakeIcon() != null, "gothic CR on blue-black");
            check("the health probe reports no server on a free port", !HealthOk(), "port " + port);
            if (nodeExe == null) { Console.WriteLine("\n  " + failures + " failure(s)\n"); Environment.Exit(1); }

            bool started = StartServer();
            check("the server starts as a hidden child process", started, serverProcess != null ? "pid " + serverProcess.Id : "no process");
            bool healthy = false;
            for (int i = 0; i < 40; i++)
            {
                if (HealthOk()) { healthy = true; break; }
                Thread.Sleep(250);
            }
            check("the server answers within 10 seconds", healthy, "port " + port);

            StopServer();
            Thread.Sleep(1200);
            bool gone = true;
            for (int i = 0; i < 20; i++)
            {
                if (!HealthOk()) { gone = true; break; }
                gone = false;
                Thread.Sleep(250);
            }
            check("stopping releases the port", gone, gone ? "released" : "still listening");

            Console.WriteLine();
            Console.WriteLine(failures == 0
                ? "  SELF-TEST PASSED - the native client starts, serves and stops cleanly"
                : "  SELF-TEST FAILED - " + failures + " check(s) failed");
            Console.WriteLine();
            Environment.Exit(failures == 0 ? 0 : 1);
        }

        // ------------------------------------------------------------ 客户端 API 自检 --

        static void RunClientTest()
        {
            int failures = 0;
            Action<string, bool, string> check = (name, ok, detail) =>
            {
                Console.WriteLine((ok ? "  PASS  " : "  FAIL  ") + name + (detail.Length > 0 ? "  [" + detail + "]" : ""));
                if (!ok) failures++;
            };
            Console.WriteLine();
            Console.WriteLine("  LeebertyCR - client API self-test (native HTTP layer)");
            Console.WriteLine("  " + new string('=', 66));
            Console.WriteLine();

            string user = Environment.GetEnvironmentVariable("CRA_CLIENTTEST_USER") ?? "demo_cra";
            string pw = Environment.GetEnvironmentVariable("CRA_CLIENTTEST_PW") ?? "CRA-Demo-2026!";
            var api = new ApiClient { BaseUrl = BaseUrl };

            try
            {
                var h = Json.D(api.Get("/api/health"));
                check("health endpoint identifies LeebertyCR", h != null && Json.S(h, "app") == "LeebertyCR", Json.S(h, "app"));
            }
            catch (Exception e) { check("health endpoint identifies LeebertyCR", false, e.Message); }

            try { api.Get("/api/records"); check("records require login", false, "no exception thrown"); }
            catch (ApiException e) { check("records require login", e.Status == 401 && e.Code == "AUTH_REQUIRED", e.Code); }
            catch (Exception e) { check("records require login", false, e.Message); }

            try
            {
                var body = new Dictionary<string, object> { { "username", user }, { "password", pw } };
                var login = Json.D(api.Post("/api/auth/login", body));
                check("login as " + user, login != null && Json.S(login, "ok") == "True" || (login != null && Json.S(login, "ok") == "true"),
                    Json.S(Json.D(Json.G(login, "user")), "username"));
                var me = Json.D(api.Get("/api/auth/me"));
                check("me returns the user", Json.S(Json.D(Json.G(me, "user")), "username") == user, user);

                // 个人状态读写（不污染：改完还原）
                var st = Json.D(api.Get("/api/state"));
                var stQuiz = Json.D(Json.G(st, "quiz"));
                long before = stQuiz != null ? Json.I(stQuiz, "attempts") : 0;
                var patch = new Dictionary<string, object> { { "quiz", new Dictionary<string, object> { { "attempts", before + 1 } } } };
                api.Put("/api/state", patch);
                var st2 = Json.D(api.Get("/api/state"));
                var st2Quiz = Json.D(Json.G(st2, "quiz"));
                check("state read/write roundtrip", st2Quiz != null && Json.I(st2Quiz, "attempts") == before + 1, "attempts " + before + " -> " + (before + 1));
                api.Put("/api/state", new Dictionary<string, object> { { "quiz", new Dictionary<string, object> { { "attempts", before } } } });

                var recs = Json.D(api.Get("/api/records"));
                var types = Json.A(Json.G(recs, "types"));
                if (Environment.GetEnvironmentVariable("CRA_CLIENTTEST_DEBUG") == "1")
                {
                    object tv, rv;
                    recs.TryGetValue("types", out tv);
                    recs.TryGetValue("records", out rv);
                    Console.WriteLine("    [debug] types value type=" + (tv == null ? "null" : tv.GetType().FullName)
                        + "  entries=" + (tv is System.Collections.IEnumerable && !(tv is string) ? ((System.Collections.ICollection)tv).Count.ToString() : "?")
                        + " | records value type=" + (rv == null ? "null" : rv.GetType().FullName));
                }
                check("records list with 8 workflow types", types != null && types.Count == 8,
                    types != null ? types.Count + " types" : (recs != null ? "keys=" + String.Join(",", recs.Keys) : "no body"));
                var records = Json.A(Json.G(recs, "records"));
                bool hasDemo = false;
                string mvKey = null;
                if (records != null)
                    foreach (object o in records)
                    {
                        var d = Json.D(o);
                        if (d != null && Json.B(d, "demo"))
                        {
                            hasDemo = true;
                            if (Json.S(d, "processCode") == "MON-CYCLE") mvKey = Json.S(d, "recordKey");
                        }
                    }
                check("demo records present", hasDemo, "records=" + (records != null ? records.Count : 0));

                // P0：导出端点（原生 HTTP 层验证； StreamReader 会剥离 BOM，故仅按内容判定）
                string recCsv = api.RawGet("/api/export/records.csv");
                long recCount = records != null ? records.Count : 0;
                check("P0 export records.csv", recCsv != null && recCsv.Contains("编号")
                    && (recCount == 0 ? true : recCsv.Contains("-20")), "csv rows=" + recCount);
                string clCsv = api.RawGet("/api/export/checklists/siv.csv");
                check("P0 export checklist csv", clCsv != null && clCsv.Contains("siv-01") && clCsv.Contains("关键"),
                    clCsv != null ? clCsv.Length + ":" + clCsv.Substring(0, Math.Min(80, clCsv.Length)) : "null");
                if (mvKey != null)
                {
                    string oneCsv = api.RawGet("/api/export/record/" + mvKey + ".csv");
                    check("P0 export single record csv", oneCsv != null && oneCsv.Contains(mvKey), mvKey);
                }

                var ch = Json.D(api.Post("/api/auth/challenge", new Dictionary<string, object>()));
                check("signature challenge issued", ch != null && Json.S(ch, "nonce").Length >= 6, Json.S(ch, "nonce"));

                // 权限：普通角色访问用户管理应被拒
                bool usersDenied = false;
                try { api.Get("/api/users"); }
                catch (ApiException e) { usersDenied = e.Status == 403; }
                catch { }
                check("role permission enforced (no user.manage)", usersDenied, usersDenied ? "403" : "not denied");

                api.Post("/api/auth/logout", new Dictionary<string, object>());
                var me2 = Json.D(api.Get("/api/auth/me"));
                check("logout clears session", Json.G(Json.D(Json.G(me2, "user")), "username") == null, "logged out");
            }
            catch (Exception e)
            {
                check("client API suite", false, e.Message);
            }

            Console.WriteLine();
            Console.WriteLine(failures == 0
                ? "  CLIENT-TEST PASSED - the native HTTP layer works"
                : "  CLIENT-TEST FAILED - " + failures + " check(s) failed");
            Console.WriteLine();
            Environment.Exit(failures == 0 ? 0 : 1);
        }

        // ------------------------------------------------------------ UI 冒烟（离屏，不打扰用户桌面） --

        static void RunUITest()
        {
            int failures = 0;
            Action<string, bool, string> check = (name, ok, detail) =>
            {
                Console.WriteLine((ok ? "  PASS  " : "  FAIL  ") + name + (detail.Length > 0 ? "  [" + detail + "]" : ""));
                if (!ok) failures++;
            };
            Console.WriteLine();
            Console.WriteLine("  LeebertyCR - native window smoke test (off-screen)");
            Console.WriteLine("  " + new string('=', 66));
            Console.WriteLine();

            if (nodeExe == null) { Console.WriteLine("  FAIL  Node.js not found\n"); Environment.Exit(1); }
            if (!HealthOk())
            {
                bool started = StartServer();
                check("server starts for the window test", started, started ? "started" : "failed");
                for (int i = 0; i < 40 && !HealthOk(); i++) Thread.Sleep(250);
            }
            check("server healthy", HealthOk(), "port " + port);

            MainWin win = null;
            try
            {
                Safe.Anchor = null;
                Console.WriteLine("    [uitest] stage: constructing window");
                win = new MainWin(port, root);
                check("main window constructs", true, "window created");
                win.ShowInTaskbar = false;
                win.Opacity = 0.02;   // 离屏：不打扰用户桌面
                win.StartPosition = FormStartPosition.Manual;
                win.Location = new Point(-32000, -32000);
                Console.WriteLine("    [uitest] stage: showing window");
                win.Show();
                Application.DoEvents();
                Thread.Sleep(3000);
                Application.DoEvents();
                Console.WriteLine("    [uitest] stage: event loop stable, LoginShown=" + win.LoginShown + " ShellShown=" + win.ShellShown);
                check("event loop stable (no crash)", !win.IsDisposed, "window alive");
                check("login view built (auth flow)", win.LoginShown || win.ShellShown, win.LoginShown ? "login panel" : "shell");
                if (!win.ShellShown && win.LoginShown)
                {
                    Console.WriteLine("    [uitest] stage: UI login via perform click");
                    win.UITestLogin("demo_cra", "CRA-Demo-2026!");
                    Thread.Sleep(2500);
                    Application.DoEvents();
                    Console.WriteLine("    [uitest] stage: after login, ShellShown=" + win.ShellShown);
                    check("UI login transitions to shell", win.ShellShown, win.ShellShown ? "shell entered" : "still login");
                }
                // P1：离屏走查受试者登记册（数据加载 → 漏斗图自绘 → 无异常）
                if (win.ShellShown)
                {
                    Console.WriteLine("    [uitest] stage: navigating to subjects registry");
                    bool subjectsOk = win.UITestNavigate("subjects");
                    Thread.Sleep(2200);
                    Application.DoEvents();
                    check("P1 subjects view renders", subjectsOk && !win.IsDisposed, subjectsOk ? "registry + calendar + funnel built" : "navigation failed");

                    Console.WriteLine("    [uitest] stage: navigating to workflow");
                    bool wfOk = win.UITestNavigate("workflow");
                    Thread.Sleep(1500);
                    Application.DoEvents();
                    check("workflow view renders after P1", wfOk && !win.IsDisposed, wfOk ? "workflow ok" : "navigation failed");

                    Console.WriteLine("    [uitest] stage: navigating to documents (P2)");
                    bool docOk = win.UITestNavigate("documents");
                    Thread.Sleep(1800);
                    Application.DoEvents();
                    check("P2 documents view renders", docOk && !win.IsDisposed, docOk ? "tmf registry + gaps built" : "navigation failed");
                }
                win.Close();
                win.Dispose();
            }
            catch (Exception e)
            {
                string st = e.Message;
                if (e.StackTrace != null)
                {
                    string[] frames = e.StackTrace.Split('\n');
                    st += " || " + string.Join(" || ", frames, 0, Math.Min(3, frames.Length));
                }
                check("window smoke", false, st);
                try { if (win != null) win.Dispose(); } catch { }
            }

            StopServer();
            Console.WriteLine();
            Console.WriteLine(failures == 0
                ? "  UI-TEST PASSED - the native window builds, logs in and stays stable"
                : "  UI-TEST FAILED - " + failures + " check(s) failed");
            Console.WriteLine();
            Environment.Exit(failures == 0 ? 0 : 1);
        }

        // ------------------------------------------------------------ 图标 --

        public static Icon MakeIcon()
        {
            var bmp = new Bitmap(32, 32);
            using (var g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAlias;
                g.Clear(Color.Transparent);
                using (var brush = new SolidBrush(Color.FromArgb(255, 16, 34, 71)))
                {
                    g.FillEllipse(brush, 0, 0, 32, 32);
                }
                using (var shade = new SolidBrush(Color.FromArgb(90, 4, 7, 13)))
                {
                    g.FillEllipse(shade, 0, 18, 32, 14);
                }
                Font font = null;
                try { font = new Font("Old English Text MT", 15f, FontStyle.Bold, GraphicsUnit.Pixel); }
                catch { font = new Font("Georgia", 15f, FontStyle.Bold, GraphicsUnit.Pixel); }
                using (font)
                using (var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
                using (var white = new SolidBrush(Color.FromArgb(244, 247, 250)))
                {
                    g.DrawString("CR", font, white, new RectangleF(-1f, 0f, 34f, 33f), sf);
                }
            }
            IntPtr handle = bmp.GetHicon();
            return Icon.FromHandle(handle);
        }

        public static void LogLine(string line)
        {
            try
            {
                string dir = Path.Combine(root, "logs");
                Directory.CreateDirectory(dir);
                File.AppendAllText(Path.Combine(dir, "desktop.log"),
                    DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + line + Environment.NewLine);
            }
            catch { }
        }
    }

    /// <summary>跨线程 UI 安全辅助</summary>
    static class Safe
    {
        public static Control Anchor;
        public static void Fetch(Func<object> work, Action<object> ok, Action<string> err)
        {
            var caller = Anchor;
            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    object r = work();
                    if (caller == null || caller.IsDisposed) return;
                    caller.BeginInvoke(new Action(delegate { try { ok(r); } catch { } }));
                }
                catch (ApiException e)
                {
                    if (caller == null || caller.IsDisposed) return;
                    caller.BeginInvoke(new Action(delegate { try { if (err != null) err(e.Message); } catch { } }));
                }
                catch (Exception e)
                {
                    if (caller == null || caller.IsDisposed) return;
                    caller.BeginInvoke(new Action(delegate { try { if (err != null) err(e.Message); } catch { } }));
                }
            });
        }
        public static void Run(Action work, Action done)
        {
            var caller = Anchor;
            ThreadPool.QueueUserWorkItem(delegate
            {
                try { work(); } catch (Exception e) { Program.LogLine("background: " + e.Message); }
                if (caller == null || caller.IsDisposed) return;
                caller.BeginInvoke(new Action(delegate { try { if (done != null) done(); } catch { } }));
            });
        }
    }
}