using QuickLook.Common.Plugin;
using System;
using System.Collections.Generic;
using System.IO;
using System.Windows;

namespace QuickLook.Plugin.CadViewer
{
    public sealed class Plugin : IViewer
    {
        private static readonly HashSet<string> Extensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            ".dxf", // AutoCAD Drawing Exchange Format
            ".dwg"  // AutoCAD Binary Drawing Format
        };

        private CadViewerPanel _panel;

        public int Priority => 10;

        public void Init()
        {
        }

        public bool CanHandle(string path)
        {
            return File.Exists(path) && Extensions.Contains(Path.GetExtension(path));
        }

        public void Prepare(string path, ContextObject context)
        {
            context.PreferredSize = new Size(1100, 780);
            context.CanResize = true;
            context.FullWindowDragging = false;
        }

        public void View(string path, ContextObject context)
        {
            try
            {
                context.Title = Path.GetFileName(path);
                _panel = new CadViewerPanel(path, context);
                context.ViewerContent = _panel;
            }
            finally
            {
                // CadViewer has its own progress and error UI. Never leave QuickLook's global busy
                // overlay active if WebView2 or JavaScript initialization fails.
                context.IsBusy = false;
            }
        }

        public void Cleanup()
        {
            _panel?.Dispose();
            _panel = null;
            GC.SuppressFinalize(this);
        }
    }
}
