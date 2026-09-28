using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using QuickLook.Common.Helpers;
using QuickLook.Common.Plugin;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Text;
using System.Windows.Controls;

namespace QuickLook.Plugin.CadViewer
{
    /// <summary>
    /// Hosts the WebView2 based 2D CAD viewer. The drawing folder is exposed through its own virtual
    /// host so paths containing spaces or non-ASCII characters keep working, and text glyphs are taken
    /// from fonts already installed on the machine instead of redistributing font binaries.
    /// </summary>
    internal sealed class CadViewerPanel : UserControl, IDisposable
    {
        private const string ViewerHost = "cadviewer.local";
        private const string ModelHost = "cadmodel.local";
        private const string FontHost = "cadfonts.local";

        /// <summary>Ordered font candidates. Latin first so a CJK font is fetched only when needed.</summary>
        private static readonly string[] FontCandidates =
        {
            "segoeui.ttf", "arial.ttf", "simhei.ttf", "simkai.ttf", "simfang.ttf", "consola.ttf"
        };

        private readonly ContextObject _context;
        private readonly string _filePath;
        private readonly string _webRoot;
        private WebView2 _webView;

        public CadViewerPanel(string filePath, ContextObject context)
        {
            _filePath = filePath;
            _context = context;
            _webRoot = Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location), "Web");

            _webView = new WebView2
            {
                CreationProperties = new CoreWebView2CreationProperties
                {
                    UserDataFolder = Path.Combine(SettingHelper.LocalDataPath, "WebView2_CadViewer")
                },
                DefaultBackgroundColor = Color.FromArgb(255, 247, 248, 250)
            };

            Content = _webView;
            Loaded += OnLoaded;
        }

        private async void OnLoaded(object sender, System.Windows.RoutedEventArgs e)
        {
            Loaded -= OnLoaded;
            try
            {
                if (!Directory.Exists(_webRoot))
                    throw new DirectoryNotFoundException("CadViewer Web resources are missing.");

                var modelDirectory = Path.GetDirectoryName(_filePath);
                if (string.IsNullOrEmpty(modelDirectory) || !Directory.Exists(modelDirectory))
                    throw new DirectoryNotFoundException("The CAD file directory is unavailable.");

                await _webView.EnsureCoreWebView2Async();
                if (_webView.CoreWebView2 == null)
                    throw new InvalidOperationException(
                        "WebView2 runtime is not available. Install the Microsoft Edge WebView2 Runtime.");

                _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                _webView.CoreWebView2.Settings.IsZoomControlEnabled = false;

                _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    ViewerHost, _webRoot, CoreWebView2HostResourceAccessKind.DenyCors);
                // The viewer page is a different origin, so the drawing folder is granted explicitly.
                _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    ModelHost, modelDirectory, CoreWebView2HostResourceAccessKind.Allow);

                var fonts = CollectFontUrls();
                if (fonts.Count > 0)
                {
                    _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                        FontHost, Environment.GetFolderPath(Environment.SpecialFolder.Fonts),
                        CoreWebView2HostResourceAccessKind.Allow);
                }

                _webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
                _webView.CoreWebView2.NavigationCompleted += OnNavigationCompleted;
                _webView.CoreWebView2.ProcessFailed += OnProcessFailed;
                _webView.CoreWebView2.NewWindowRequested += OnNewWindowRequested;
                _webView.Source = BuildViewerUri(fonts);
            }
            catch (Exception ex)
            {
                ShowError(ex.Message);
            }
        }

        private Uri BuildViewerUri(IList<string> fonts)
        {
            var fileName = Path.GetFileName(_filePath) ?? string.Empty;
            var extension = (Path.GetExtension(_filePath) ?? string.Empty).TrimStart('.').ToLowerInvariant();
            var kind = extension == "dwg" ? "dwg" : "dxf";
            var modelUrl = "https://" + ModelHost + "/" + Uri.EscapeDataString(fileName);

            var query = new StringBuilder();
            query.Append("?v=").Append(DateTime.UtcNow.Ticks);
            query.Append("&src=").Append(Uri.EscapeDataString(modelUrl));
            query.Append("&name=").Append(Uri.EscapeDataString(fileName));
            query.Append("&kind=").Append(kind);
            query.Append("&fonts=").Append(Uri.EscapeDataString(SerializeFonts(fonts)));

            return new Uri("https://" + ViewerHost + "/index.html" + query);
        }

        private static IList<string> CollectFontUrls()
        {
            var urls = new List<string>();
            string fontDirectory;
            try
            {
                fontDirectory = Environment.GetFolderPath(Environment.SpecialFolder.Fonts);
            }
            catch (Exception ex)
            {
                ProcessHelper.WriteLog("CadViewer font folder: " + ex.Message);
                return urls;
            }

            if (string.IsNullOrEmpty(fontDirectory) || !Directory.Exists(fontDirectory))
                return urls;

            foreach (var candidate in FontCandidates)
            {
                try
                {
                    if (File.Exists(Path.Combine(fontDirectory, candidate)))
                        urls.Add("https://" + FontHost + "/" + candidate);
                }
                catch (Exception ex)
                {
                    ProcessHelper.WriteLog("CadViewer font probe: " + ex.Message);
                }
            }
            return urls;
        }

        private static string SerializeFonts(IList<string> fonts)
        {
            var builder = new StringBuilder("[");
            for (var index = 0; index < fonts.Count; index++)
            {
                if (index > 0) builder.Append(',');
                builder.Append('"').Append(fonts[index]).Append('"');
            }
            return builder.Append(']').ToString();
        }

        private void OnNavigationCompleted(object sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            if (!e.IsSuccess)
                ShowError("Viewer page failed to load: " + e.WebErrorStatus);
        }

        private void OnProcessFailed(object sender, CoreWebView2ProcessFailedEventArgs e)
        {
            ShowError("WebView2 process failed: " + e.ProcessFailedKind);
        }

        private void OnNewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            e.Handled = true;
            Uri uri;
            if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out uri) ||
                !uri.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) ||
                !uri.Host.Equals("github.com", StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            try
            {
                Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                ProcessHelper.WriteLog("CadViewer open link: " + ex.Message);
            }
        }

        private void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string message;
            try
            {
                message = e.TryGetWebMessageAsString();
            }
            catch (Exception ex)
            {
                ProcessHelper.WriteLog("CadViewer message error: " + ex.Message);
                return;
            }

            ProcessHelper.WriteLog("CadViewer: " + message);
            if (message != null && message.StartsWith("error:", StringComparison.Ordinal))
                _context.IsBusy = false;
        }

        private void ShowError(string message)
        {
            _context.IsBusy = false;
            ProcessHelper.WriteLog("CadViewer error: " + message);
        }

        public void Dispose()
        {
            if (_webView != null)
            {
                try
                {
                    if (_webView.CoreWebView2 != null)
                    {
                        _webView.CoreWebView2.WebMessageReceived -= OnWebMessageReceived;
                        _webView.CoreWebView2.NavigationCompleted -= OnNavigationCompleted;
                        _webView.CoreWebView2.ProcessFailed -= OnProcessFailed;
                        _webView.CoreWebView2.NewWindowRequested -= OnNewWindowRequested;
                    }
                }
                catch (Exception ex)
                {
                    ProcessHelper.WriteLog("CadViewer dispose: " + ex.Message);
                }
                _webView.Dispose();
                _webView = null;
            }
        }
    }
}
