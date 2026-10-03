using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Web.Script.Serialization;

/*
 * ApiClient.cs - LeebertyCR 原生客户端与本机服务(127.0.0.1)的 JSON HTTP 通信。
 * 会话 Cookie 由 CookieContainer 自动维护；错误响应按 {error, code} 抛出 ApiException。
 */

namespace LeebertyCR
{
    /// <summary>JSON 访问小工具（基于 .NET Framework 自带 JavaScriptSerializer）</summary>
    public static class Json
    {
        static readonly JavaScriptSerializer ser = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };

        public static object Parse(string text) { return ser.DeserializeObject(text); }
        public static string Stringify(object o) { return ser.Serialize(o); }

        public static object G(object o, string key)
        {
            var d = o as IDictionary<string, object>;
            if (d == null || !d.ContainsKey(key) || d[key] == null) return null;
            return d[key];
        }
        public static string S(object o, string key)
        {
            var v = G(o, key);
            return v == null ? "" : Convert.ToString(v);
        }
        public static long I(object o, string key)
        {
            var v = G(o, key);
            if (v == null) return 0;
            try { return Convert.ToInt64(v); } catch { return 0; }
        }
        public static bool B(object o, string key)
        {
            var v = G(o, key);
            if (v == null) return false;
            try { return Convert.ToBoolean(v); } catch { return false; }
        }
        public static IDictionary<string, object> D(object o) { return o as IDictionary<string, object>; }
        /// <summary>兼容 JavaScriptSerializer 的两种数组形态（object[] 与 ArrayList）。</summary>
        public static ArrayList A(object o)
        {
            var al = o as ArrayList;
            if (al != null) return al;
            var arr = o as object[];
            if (arr != null) return new ArrayList(arr);
            return null;
        }
        public static object NewDict() { return new Dictionary<string, object>(); }
    }

    public class ApiException : Exception
    {
        public int Status;
        public string Code;
        public ApiException(string msg, int status, string code) : base(msg) { Status = status; Code = code; }
    }

    public class ApiClient
    {
        public string BaseUrl;
        public CookieContainer Cookies = new CookieContainer();

        public object Call(string method, string path, object body)
        {
            var req = (HttpWebRequest)WebRequest.Create(BaseUrl + path);
            req.Method = method;
            req.CookieContainer = Cookies;
            req.Timeout = 20000;
            req.ReadWriteTimeout = 20000;
            req.ContentType = "application/json; charset=utf-8";
            req.Accept = "application/json";
            if (body != null)
            {
                byte[] bytes = Encoding.UTF8.GetBytes(Json.Stringify(body));
                req.ContentLength = bytes.Length;
                using (var s = req.GetRequestStream()) s.Write(bytes, 0, bytes.Length);
            }
            else
            {
                req.ContentLength = 0;
            }

            HttpWebResponse resp = null;
            try
            {
                resp = (HttpWebResponse)req.GetResponse();
            }
            catch (WebException we)
            {
                resp = (HttpWebResponse)we.Response;
                if (resp == null) throw new ApiException(we.Message, 0, "");
                string text = ReadAll(resp);
                string code = "";
                string msg = text;
                try
                {
                    var o = Json.D(Json.Parse(text));
                    if (o != null)
                    {
                        if (o.ContainsKey("error")) msg = Convert.ToString(o["error"]);
                        if (o.ContainsKey("code")) code = Convert.ToString(o["code"]);
                    }
                }
                catch { /* keep raw text */ }
                throw new ApiException(msg, (int)resp.StatusCode, code);
            }

            string t = ReadAll(resp);
            if (string.IsNullOrWhiteSpace(t)) return null;
            return Json.Parse(t);
        }

        static string ReadAll(WebResponse resp)
        {
            using (var s = resp.GetResponseStream())
            {
                if (s == null) return "";
                using (var r = new StreamReader(s, Encoding.UTF8)) return r.ReadToEnd();
            }
        }

        public object Get(string p) { return Call("GET", p, null); }
        public object Post(string p, object b) { return Call("POST", p, b); }
        public object Put(string p, object b) { return Call("PUT", p, b); }
        public object Delete(string p) { return Call("DELETE", p, null); }

        public string RawGet(string p)
        {
            var req = (HttpWebRequest)WebRequest.Create(BaseUrl + p);
            req.Method = "GET";
            req.CookieContainer = Cookies;
            req.Timeout = 20000;
            using (var resp = (HttpWebResponse)req.GetResponse())
            using (var s = resp.GetResponseStream())
            using (var r = new StreamReader(s, Encoding.UTF8))
                return r.ReadToEnd();
        }
    }
}